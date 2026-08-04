import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalize, sha256 } from "../lib/canonical.mjs";
import { generatorSha256 } from "../lib/sql-fixture.mjs";
import { loadProfile } from "../lib/profile.mjs";
import {
  EXPECTED_MUTATIONS_PATH, EXTENSION_PROFILE_PATH, EXTENSION_TABLE_ORDER,
  SERVICE_NEGATIVE_SCENARIOS, SQL_NEGATIVE_SCENARIOS,
  computeExtensionFixtureSha, extensionCleanupPlan, extensionRows,
  extensionResidualSql, extensionWritePlan, fixtureSourceSha256, loadExpectedMutations,
  negativeScenarioSql,
  loadExtensionProfile
} from "./fixture.mjs";
import {
  AUTHORITIES, assertFrozenInputsEqual, computeCombinedChecksum,
  extensionGeneratorSha256, freezeAuthoritativeInputs, validateExtensionState
} from "./validator.mjs";
import { bindExactTapTargets, validateScenarioEvidenceBindings } from "./runner.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const fixtureSource = readFileSync(resolve(root,
  "scripts/e2e/property-remediation/b-extension/fixture.mjs"), "utf8");
const runnerSource = readFileSync(resolve(root,
  "scripts/e2e/property-remediation/b-extension/runner.mjs"), "utf8");
const runtimeEvidenceSource = readFileSync(resolve(root,
  "apps/api/src/modules/property-approvals/outbox/property-event-runtime.c2-v11.pg.spec.ts"),
"utf8");
const aSqlFixtureSource = readFileSync(resolve(root,
  "scripts/e2e/property-remediation/lib/sql-fixture.mjs"), "utf8");

test("loads the exact B-extension v1 profile and empty mutation contract", () => {
  const profile = loadExtensionProfile();
  const mutations = loadExpectedMutations();
  assert.equal(profile.profile, "property-remediation-b-extension-v1");
  assert.equal(profile.profile_version, 1);
  assert.deepEqual(mutations.expected_mutations, []);
  assert.equal(sha256(readFileSync(EXTENSION_PROFILE_PATH)).length, 64);
  assert.equal(sha256(readFileSync(EXPECTED_MUTATIONS_PATH)).length, 64);
  assert.equal(profile.negative_scenarios.length, 11);
  assert.equal(SERVICE_NEGATIVE_SCENARIOS.length, 8);
  assert.equal(SQL_NEGATIVE_SCENARIOS.length, 3);
});

test("generates every exact B state matrix with frozen cardinality", () => {
  const profile = loadExtensionProfile();
  const rows = extensionRows(profile, loadProfile());
  assert.deepEqual(Object.keys(rows), EXTENSION_TABLE_ORDER);
  for (const logicalName of EXTENSION_TABLE_ORDER) {
    assert.equal(rows[logicalName].length, profile.expected_counts[logicalName], logicalName);
  }
  assert.deepEqual(rows.identity_submission.map((row) => row.status), profile.identity_statuses);
  assert.deepEqual(rows.approval_request.map((row) =>
    [row.decision_status, row.execution_status]), profile.approval_matrix);
  assert.deepEqual(rows.task_assignment.map((row) => row.assignment_status), profile.task_statuses);
  assert.deepEqual(rows.notification_delivery.map((row) => row.delivery_status),
    profile.delivery_statuses);
  assert.deepEqual(rows.event_dlq.map((row) => row.status), profile.event_incident_statuses);
  for (const logicalName of ["approval_audit", "effect_manifest", "effect_receipt",
    "mutation_receipt", "task_projection_head", "task_projection",
    "task_projection_rebuild_audit"]) {
    assert.equal(rows[logicalName].length, 1, logicalName);
  }
  assert.equal(rows.effect_receipt[0].effect_hash, rows.effect_manifest[0].invariant_hash);
  assert.deepEqual({ owningUniqueName: rows.effect_receipt[0].owning_unique_name,
    observedCardinality: rows.effect_receipt[0].observed_cardinality },
  { owningUniqueName: rows.effect_manifest[0].owning_unique_name,
    observedCardinality: rows.effect_manifest[0].expected_cardinality });
});

test("fixture rows are byte-deterministic and contain no duplicate runtime keys", () => {
  const profile = loadExtensionProfile();
  const aProfile = loadProfile();
  const first = extensionRows(profile, aProfile);
  const second = extensionRows(profile, aProfile);
  assert.equal(canonicalize(first), canonicalize(second));
  for (const row of first.outbox) {
    assert.equal(Object.keys(row).filter((key) => key === "created_at").length, 1);
  }
  assert.doesNotMatch(fixtureSource, /created_at:[^}\n]+,\s*created_at:/u);
});

test("write plan is transaction-bound, exact-key idempotent and repeat-limited", () => {
  const plan = extensionWritePlan(loadExtensionProfile(), loadProfile(), { repeat: 2 });
  assert.equal(plan.repeat, 2);
  assert.match(plan.sql, /^BEGIN;\n/u);
  assert.equal((plan.sql.match(/ON CONFLICT DO NOTHING RETURNING 1/gu) ?? []).length,
    EXTENSION_TABLE_ORDER.length * 2);
  assert.match(plan.sql, /pg_advisory_xact_lock/u);
  assert.equal((plan.sql.match(/B_EXTENSION_AFFECTED\|first/gu) ?? []).length,
    EXTENSION_TABLE_ORDER.length);
  assert.equal((plan.sql.match(/B_EXTENSION_AFFECTED\|second/gu) ?? []).length,
    EXTENSION_TABLE_ORDER.length);
  assert.match(plan.sql, /receipt_status.*'started'/su);
  assert.match(plan.sql,
    /WHERE target\.id=source\.id::uuid AND target\.receipt_status='started'/u);
  assert.throws(() => extensionWritePlan(loadExtensionProfile(), loadProfile(), { repeat: 3 }));
});

test("negative contract separates application-service checks from database probes", () => {
  const profile = loadExtensionProfile();
  const aProfile = loadProfile();
  const sql = negativeScenarioSql(profile, aProfile);
  for (const scenario of SQL_NEGATIVE_SCENARIOS) assert.match(sql, new RegExp(scenario, "u"));
  for (const scenario of SERVICE_NEGATIVE_SCENARIOS) assert.doesNotMatch(sql,
    new RegExp(scenario, "u"));
  assert.match(sql, /SQLSTATE='23503'/u);
  assert.equal(profile.negative_scenarios.some((item) =>
    item.scenario === "approval_execution_lease_reclaim"), true);
  assert.doesNotMatch(sql, /task_lease_reclaim/u);
  for (const scenario of ["stale_claim_epoch_token", "outbox_publish_crash",
    "dlq_replay_once", "task_claim_race", "approval_execution_lease_reclaim"]) {
    assert.doesNotMatch(sql, new RegExp(scenario, "u"));
  }
  assert.match(sql, /fk_biz_property_approval_stage_request/u);
  assert.match(sql, /GET STACKED DIAGNOSTICS constraint_seen=CONSTRAINT_NAME/u);
  assert.match(sql, /CASE WHEN passed THEN '1' ELSE '0' END/u);
  assert.match(runnerSource, /invalid B-extension negative boolean marker/u);
});

test("residual query covers every exact B fixture key after rollback", () => {
  const profile = loadExtensionProfile();
  const sql = extensionResidualSql(profile, loadProfile());
  assert.equal((sql.match(/B_EXTENSION_RESIDUAL\|/gu) ?? []).length,
    EXTENSION_TABLE_ORDER.length);
  for (const table of EXTENSION_TABLE_ORDER) assert.match(sql, new RegExp(`\\|${table}\\|`, "u"));
});

test("cleanup is rollback-only and cannot delete immutable runtime rows", () => {
  assert.equal(extensionCleanupPlan(), "ROLLBACK;\n");
  assert.doesNotMatch(fixtureSource, /\b(?:DELETE\s+FROM|TRUNCATE\s+TABLE|DROP\s+TABLE)\b/iu);
});

test("fixture and state checksums are deterministic and independently recomputed", () => {
  const profile = loadExtensionProfile();
  const rows = extensionRows(profile, loadProfile());
  const input = {
    profile, rows, profileRawSha256: sha256(readFileSync(EXTENSION_PROFILE_PATH)),
    expectedMutationsRawSha256: sha256(readFileSync(EXPECTED_MUTATIONS_PATH)),
    generatorSha256: extensionGeneratorSha256(), authorityFreezeSha256: "a".repeat(64)
  };
  assert.deepEqual(computeExtensionFixtureSha(input), computeExtensionFixtureSha(input));
  assert.equal(validateExtensionState({ observedRows: rows }).data_sha256.length, 64);
  assert.equal(fixtureSourceSha256().length, 64);
});

test("fails closed on all signed authorities including formal module-core handoff", () => {
  assert.equal(AUTHORITIES.b_module_core,
    "988eb7e5f70bc5e0614e700feaf77ea68d0edc1f1edcb90aa57ab5b4a3b193df");
  assert.equal(AUTHORITIES.b_schema_expand,
    "53e568d409420dc6c38a8139a553735083502f05d6aeb2f3e14adcbb95276874");
  const freeze = freezeAuthoritativeInputs("first");
  assert.equal(assertFrozenInputsEqual(freeze, "second").raw_sha256, freeze.raw_sha256);
  assert.ok(freeze.files.some((file) =>
    file.path.endsWith("b-module-core-v1-handoff-signoff.md")));
});

test("preserves the exact A-base profile, generator and canonical handoff", () => {
  assert.equal(generatorSha256(), AUTHORITIES.a_generator);
  const freeze = freezeAuthoritativeInputs("a-base-check");
  assert.equal(freeze.a_handoff.canonical_sha256, AUTHORITIES.a_handoff);
  assert.equal(AUTHORITIES.a_profile_checksum,
    "68daec8fb6fe73a413749a8a0181780c7462d35ff8e684fbaefaba0ed41b107b");
});

test("combined checksum binds A fingerprints, B fixture, schema and empty mutations", () => {
  const profile = loadExtensionProfile();
  const rows = extensionRows(profile, loadProfile());
  const fixture = computeExtensionFixtureSha({
    profile, rows, profileRawSha256: sha256(readFileSync(EXTENSION_PROFILE_PATH)),
    expectedMutationsRawSha256: sha256(readFileSync(EXPECTED_MUTATIONS_PATH)),
    generatorSha256: extensionGeneratorSha256(), authorityFreezeSha256: "b".repeat(64)
  });
  const input = {
    aDatabaseFingerprint: { sha256: "c".repeat(64) },
    aFilesFingerprint: { sha256: "d".repeat(64) }, bFixture: fixture
  };
  const first = computeCombinedChecksum(input);
  const second = computeCombinedChecksum(input);
  assert.deepEqual(first, second);
  assert.equal(first.manifest.b_schema_expand_sha256, AUTHORITIES.b_schema_expand);
  assert.deepEqual(first.manifest.expected_mutations, []);
});

test("runner applies only the approved migration chain with 191 and 192 absent", () => {
  for (const number of [184, 185, 186, 187, 188, 189, 190, 193, 194, 195]) {
    assert.match(runnerSource, new RegExp(`"000${number}_`, "u"));
  }
  assert.doesNotMatch(runnerSource, /"00019[12]_/u);
  assert.match(runnerSource, /loadReviewedBootstrapContract/u);
  assert.match(runnerSource, /MODULE_CORE_TEST_PREREQUISITE_SQL/u);
  assert.match(runnerSource, /module_prerequisite: modulePrerequisite/u);
  assert.match(runnerSource, /asset\|1\|false/u);
  assert.match(runnerSource, /fixtureCopyChunks/u);
  assert.match(runnerSource, /verifyReviewedMigration175Rollback/u);
  assert.match(runnerSource, /sys_schema_migration_history.*schema_migrations/su);
  assert.match(runnerSource, /history_byte_equal/u);
  assert.match(runnerSource, /const reviewedSucceeded = reviewed\.entries/u);
  assert.match(runnerSource, /for \(const entry of reviewedSucceeded\)[\s\S]*?status: "skipped"/u);
  assert.match(runnerSource, /function applyForwardChain[\s\S]*?applyEntry\(harness, entry\)[\s\S]*?immediate-before-successor/u);
  assert.match(runnerSource, /immediate forward rerun was not exact no-op/u);
  assert.match(runnerSource,
    /directRerunNoop\(harness, reviewed, forwards, forwardRerun\);[\s\S]*?fingerprintABaseDatabase\(harness\.queryJson\)[\s\S]*?runEventRuntimePgSuite/u);
  assert.match(runnerSource, /reserved_191_192_rows/u);
});

test("runner proves service and SQL negatives plus all closure evidence", () => {
  for (const value of ["property-approval.decision.spec.ts", "property-task.orchestrator.spec.ts",
    "property-event-runtime.pg.spec.ts", "PROPERTY_RUNTIME_PG_URL", "sqlstate", "delta",
    "unique_winners", "query_text_sha256", "canonical_rows_sha256",
    "approval_request_relations", "task_assignment_relations", "message_exact_once_relations"]) {
    assert.match(runnerSource, new RegExp(value.replaceAll(".", "\\."), "u"));
  }
  assert.match(runnerSource, /SERVICE_NEGATIVE_SCENARIOS/u);
  assert.match(runnerSource, /negative scenario set mismatch/u);
  assert.match(runnerSource, /negative SQL scenario failed:\$\{canonicalize\(failedNative\)\}/u);
  const declaredTargets = new Set(loadExtensionProfile().negative_scenarios
    .filter((item) => item.target).map((item) => item.target));
  for (const target of [
    "maker-checker exclusion and historical actor decision both fail closed",
    "serializes concurrent claims to one winner and one zero-mutation loser",
    "claims only the first aggregate sequence and fences stale completion",
    "enforces canonical payload, consumer order, sequence gaps and concurrent dedupe",
    "persists retry_wait recovery and terminal DLQ with exact fencing and immutable identity",
    "serializes approval execution expired-lease reclaim with one fenced repository CAS winner",
    "completes consumer DLQ replay exactly once with resolved audit and inbox closure"
  ]) assert.equal(declaredTargets.has(target), true, target);
  assert.match(runnerSource, /exact TAP target did not pass once/u);
  assert.match(runnerSource, /run\.error\?\.message \|\| run\.stderr \|\| run\.stdout/u);
  assert.match(runnerSource, /property-event-runtime\.repository\.spec\.ts/u);
  assert.match(runnerSource, /services, support/u);
  assert.match(runnerSource, /closure cardinality mismatch/u);
  assert.match(runnerSource, /const relationKey = query\.name === "message_exact_once_relations"/u);
  assert.match(runnerSource, /observedRelations = rows[\s\S]*?\.sort\(byRelationKey\)/u);
  assert.match(runnerSource, /expectedRelations\.sort\(byRelationKey\)/u);
  assert.match(runnerSource,
    /replaceAll\("B_EXTENSION_AFFECTED\|first\|", "B_EXTENSION_AFFECTED\|second\|"\)/u);
});

test("profile raw authority rejects swapping two otherwise legal scenario bindings", () => {
  const directory = mkdtempSync("/tmp/bext-profile-swap-");
  try {
    const swapped = JSON.parse(readFileSync(EXTENSION_PROFILE_PATH, "utf8"));
    const first = swapped.negative_scenarios[0];
    const second = swapped.negative_scenarios[2];
    [first.evidence_id, second.evidence_id] = [second.evidence_id, first.evidence_id];
    [first.target, second.target] = [second.target, first.target];
    const path = resolve(directory, "swapped.json");
    writeFileSync(path, `${JSON.stringify(swapped, null, 2)}\n`, { mode: 0o600 });
    assert.throws(() => loadExtensionProfile(path), /profile raw contract drift/u);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("gate-owned PG evidence uses the real store and worker and proves both retry outcomes", () => {
  for (const value of ["TypeOrmPropertyEventRuntimeStore", "PropertyEventPublisherWorker",
    'status, "retry_wait"', 'status, "published"', 'status, "dlq"',
    '"stale-claim"', "claimEpoch", "claimToken", "successfulPublishes, 1",
    "attempt_count", "payload_hash", "incidents.length, 1"]) {
    assert.equal(runtimeEvidenceSource.includes(value), true, value);
  }
  assert.match(runnerSource, /property-event-runtime\.c2-v11\.pg\.spec\.ts/u);
  assert.match(runnerSource, /gateOwnedPgEvidenceIds/u);
  assert.doesNotMatch(runtimeEvidenceSource, /as unknown as PropertyEventRuntimeStore/u);
  assert.doesNotMatch(runtimeEvidenceSource, /\bDELETE\s+FROM\b/iu);
  assert.match(runtimeEvidenceSource, /await dataSource\?\.destroy\(\)/u);
});

test("closure enumerates every identity, approval, task and message fixture by exact id", () => {
  for (const logical of ["identity_queue", "identity_snapshot", "identity_submission",
    "approval_request", "approval_stage", "approval_decision", "approval_audit",
    "effect_manifest", "effect_receipt", "mutation_receipt", "task_assignment",
    "task_projection_head", "task_projection", "task_projection_rebuild_audit",
    "outbox", "inbox", "notification", "notification_recipient",
    "notification_delivery", "event_dlq"]) {
    assert.match(runnerSource, new RegExp(`EXTENSION_TABLES\\.${logical}`, "u"), logical);
  }
  assert.match(runnerSource, /fixtureRows\[logical\].*sqlLiteral\(row\[key\]\)/u);
  assert.match(runnerSource, /closure cardinality mismatch/u);
});

test("exact TAP binding rejects absent, duplicate, skipped and failed target evidence", () => {
  const name = "runtime target";
  const passed = `# Subtest: ${name}\nok 1 - ${name}\n`;
  assert.equal(bindExactTapTargets(passed, [name])[0].exact_pass_count, 1);
  assert.throws(() => bindExactTapTargets("ok 1 - unrelated\n", [name]));
  assert.throws(() => bindExactTapTargets(`${passed}${passed}`, [name]));
  assert.throws(() => bindExactTapTargets(
    `# Subtest: ${name}\nok 1 - ${name} # SKIP unavailable\n`, [name]));
  assert.throws(() => bindExactTapTargets(`# Subtest: ${name}\nnot ok 1 - ${name}\n`, [name]));
});

test("scenario evidence binding rejects label tampering, duplicate and missing evidence", () => {
  const expected = ["alpha_case", "beta_case"];
  const valid = [
    { scenario: "alpha_case", evidence_id: "svc:alpha", target: "alpha target" },
    { scenario: "beta_case", evidence_id: "sql:beta" }
  ];
  assert.equal(validateScenarioEvidenceBindings(expected, valid).length, 2);
  assert.throws(() => validateScenarioEvidenceBindings(expected,
    [{ ...valid[0], scenario: "tampered_case" }, valid[1]]));
  assert.throws(() => validateScenarioEvidenceBindings(expected, [valid[0], valid[0]]));
  assert.throws(() => validateScenarioEvidenceBindings(expected, [valid[0]]));
  assert.throws(() => validateScenarioEvidenceBindings(expected,
    [valid[0], { ...valid[1], evidence_id: valid[0].evidence_id }]));
});

test("runner derives three-provision no-op and publishes failed evidence fail-closed", () => {
  for (const value of ["B_EXTENSION_FIRST_STATE_BEGIN", "B_EXTENSION_SECOND_STATE_BEGIN",
    "B_EXTENSION_THIRD_STATE_BEGIN", "second_affected_rows_zero", "third_snapshot_byte_equal",
    "rollback_residual_after_second", "rollback_residual_after_third", "physical_files_absent",
    "failed_stage", "input_freeze_after_cleanup", "cleanup_failure_evidence"]) {
    assert.match(runnerSource, new RegExp(value, "u"));
  }
  assert.match(runnerSource, /mode & 0o777/u);
  assert.match(runnerSource, /0o600/u);
  assert.doesNotMatch(runnerSource, /rerun_noop:\s*true/u);
  assert.match(runnerSource, /applyEntry\(harness, entry\)/u);
  assert.match(runnerSource, /migrationStateFingerprint/u);
  assert.match(runnerSource, /schema_fingerprint_byte_equal/u);
  assert.match(runnerSource, /reservation authority drift before publication/u);
  assert.match(runnerSource, /outcome is not bound to reserved outputs/u);
});

test("runner freezes four stages, uses two fresh exact containers and rollback reprovision", () => {
  for (const stage of ["before-write", "after-local", "after-pg", "after-cleanup"]) {
    assert.match(runnerSource, new RegExp(`"${stage}"`, "u"));
  }
  assert.match(runnerSource, /ordinal: "a"/u);
  assert.match(runnerSource, /ordinal: "b"/u);
  assert.match(runnerSource, /assertExactEphemeralPostgresContainer/u);
  assert.match(runnerSource, /cleanupExactLifecycle/u);
  assert.match(runnerSource, /rerun_noop: Object\.entries/u);
  assert.doesNotMatch(runnerSource, /rerun_noop:\s*true/u);
});

test("B-extension remains outside the frozen A generator scan and emits candidate evidence only", () => {
  assert.doesNotMatch(aSqlFixtureSource, /b-extension/u);
  assert.match(aSqlFixtureSource, /"contracts",\s*"lib",\s*"profiles",\s*"roles",\s*"traceability"/u);
  assert.match(runnerSource, /final_signoff_generated: false/u);
  assert.doesNotMatch(runnerSource, /B-extension-core fixture SHA.*PASS|track_b_technical_passed/iu);
  assert.doesNotMatch(runnerSource, /database\/seeds|apps\/api\/src\/modules|packages\/shared/iu);
});
