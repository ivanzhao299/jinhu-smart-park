import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolve } from "node:path";
import process from "node:process";
import {
  failureInjectionCases, parseApprovalPortTap,
} from "../track-b2c-000197-preliminary-executor.mjs";

const root = process.cwd();
const executorPath = resolve(root, "scripts/e2e/property-remediation/track-b2c-000197-preliminary-executor.mjs");
const executor = readFileSync(executorPath, "utf8");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

test("executor consumes only the frozen v2 chain", () => {
  for (const [path, hash] of [
    ["database/migrations/000197_property_approval_active_source_index_forward_fix.sql", "a9b98ca82aa4dafc16535085184df838880ef27801f7cd4b225e1ca1a15af059"],
    ["scripts/e2e/property-remediation/track-b2c-approval-index-forward-fix-gate.mjs", "ffc2c21e91959848dacea5dd7eb873e966fc7304a69b78d2742c3a18e444379c"],
    ["scripts/e2e/property-remediation/tests/b2c-approval-index-forward-fix.spec.mjs", "400bb607632724f128fe3e4016111eaffc8a8702b40d3a49e772052f6b918170"],
    [".trellis/tasks/07-30-pr192-b-domain-integrations/research/b2c-000197-v2-gate-input-manifest-20260802.grammar", "973566353ad804ee653ebc2f129146d3191a6a9d34783d84721ea095f643a151"],
  ]) {
    assert.equal(sha256(readFileSync(resolve(root, path))), hash);
  }
});

test("formal run and two independent review proofs are mandatory", () => {
  assert.match(executor, /const formalRunId = "b2c197_prelim_20260802a"/);
  assert.match(executor, /B2C_000197_PRELIMINARY_RUN_ID/);
  assert.match(executor, /B2C_000197_EXECUTOR_V2_REVIEW_\$\{index\}_PATH/);
  assert.match(executor, /B2C_000197_EXECUTOR_V2_REVIEW_\$\{index\}_SHA/);
  assert.match(executor, /b2c-000197-preliminary-executor-independent-review-v2/);
  assert.match(executor, /b2c-000197-preliminary-v2-input-manifest-20260802\.grammar/);
  assert.match(executor, /b2c-000197-preliminary-executor-v2-review-handoff-20260802\.md/);
  assert.doesNotMatch(executor, /B2C_000197_EXECUTOR_REVIEW_\$\{index\}/);
  assert.match(executor, /c2602ba2467c29991896661327733520ec4132a1ea4f3275aa81abf15869d858/);
  assert.match(executor, /8a946a6c076358786301318354717cf619130492808a821d7d08119576215b1f/);
  assert.match(executor, /RETURNED-audit-only-not-authority/);
  assert.match(executor, /independent-database-reviewer/);
  assert.match(executor, /independent-qa-security-reviewer/);
  assert.match(executor, /preliminary-reviews-not-independent/);
  for (const field of ["formal_run_id", "r0_raw_sha256", "r1_raw_sha256", "migration_raw_sha256",
    "gate_raw_sha256", "executor_raw_sha256", "preliminary_test_raw_sha256",
    "preliminary_manifest_raw_sha256", "review_handoff_raw_sha256",
    "returned_database_review_raw_sha256", "returned_qa_security_review_raw_sha256",
    "returned_reviews_disposition", "reviewer_authority", "decision"]) {
    assert.match(executor, new RegExp(field));
  }
});

test("old-writer drain is immutable authority rather than an environment boolean", () => {
  assert.match(executor, /b2c-000197-old-writer-drain-v1/);
  assert.match(executor, /B2C_000197_OLD_WRITER_DRAIN_PATH/);
  assert.match(executor, /B2C_000197_OLD_WRITER_DRAIN_SHA/);
  assert.match(executor, /intake: "stopped"/);
  assert.match(executor, /in_flight_approval_create_transactions: "0"/);
  assert.match(executor, /new_writer_build: "approval-port-v4"/);
});

test("formal preflight requires exact dual absence and reviewed full identity", () => {
  assert.match(executor, /function assertCandidateManifest\(\)/);
  assert.match(executor, /b2c-000197-preliminary-candidate-manifest-drift/);
  assert.match(executor, /b2c-000197-preliminary-approval-port-test-drift/);
  assert.match(executor, /function runSignedStaticGates\(\)/);
  assert.match(executor, /history_catalog: run\(staticTestPath, 8\)/);
  assert.match(executor, /executor: run\(preliminaryTestPath, 9\)/);
  const manifestCheck = executor.indexOf("const candidateManifest = assertCandidateManifest()");
  const signedStatic = executor.indexOf("const signedStaticGates = runSignedStaticGates()");
  const preflight = executor.indexOf("const pre = preflight()");
  assert.ok(manifestCheck >= 0 && signedStatic > manifestCheck && preflight > signedStatic);
  assert.match(executor, /B2C_000197_PREFLIGHT_ONLY: "1"/);
  assert.match(executor, /target\.history\.state !== "dual-absent"/);
  assert.match(executor, /target\.history\.decision !== "execute"/);
  assert.match(executor, /parsed\.manifest\.raw_sha256 !== expected\.gateManifest/);
});

test("executor writes running then succeeded and records failed before stopping", () => {
  const running = executor.indexOf('writeHistory(target, "running")');
  const apply = executor.indexOf('psql(target, readFileSync(migrationPath, "utf8")');
  const succeeded = executor.indexOf('writeHistory(target, "succeeded")');
  assert.ok(running >= 0 && apply > running && succeeded > apply);
  assert.match(executor, /writeHistory\(target, "failed", applied\.stderr \|\| applied\.stdout\)/);
  assert.match(executor, /INSERT INTO public\.sys_schema_migration_history/);
  assert.match(executor, /INSERT INTO public\.schema_migrations/);
  assert.match(executor, /BEGIN;[\s\S]*COMMIT;/);
});

test("dynamic catalog, predicate, duplicate, failure and application gates are real functions", () => {
  for (const functionName of ["snapshot", "applyFormal", "predicateMatrix", "failureInjection",
    "runApprovalPortGate", "historyEvidence"]) assert.match(executor, new RegExp(`function ${functionName}\\(`));
  assert.match(executor, /after\.indexdef !== expected\.newIndexdef/);
  assert.match(executor, /after\.predicate !== expected\.newPredicate/);
  assert.match(executor, /active: 7, terminal: 5/);
  assert.match(executor, /active-duplicate-not-blocked/);
  assert.match(executor, /terminal_same_source_count: 2/);
  const injectionCases = failureInjectionCases();
  assert.deepEqual(injectionCases.map(({ name }) => name),
    ["before-create", "after-create", "after-drop", "before-rename"]);
  assert.equal(new Set(injectionCases.map(({ boundary }) => boundary)).size, 4);
  assert.equal(new Set(injectionCases.map(({ prefix, assertion }) => `${prefix}\n${assertion}`)).size, 4);
  const afterDrop = injectionCases.find(({ name }) => name === "after-drop");
  const beforeRename = injectionCases.find(({ name }) => name === "before-rename");
  assert.notEqual(`${afterDrop.prefix}\n${afterDrop.assertion}`,
    `${beforeRename.prefix}\n${beforeRename.assertion}`);
  assert.match(afterDrop.assertion, /old-dropped-build-present/);
  assert.match(beforeRename.assertion, /before_rename_boundary/);
  assert.match(beforeRename.assertion, /uq_biz_property_approval_request_active_source_v2_build/);
  assert.match(executor, /transactional|rollback_exact|JSON\.stringify\(before\) !== JSON\.stringify\(after\)/);
  assert.match(executor, /statement_raw_sha256/);
  assert.match(executor, /injected_marker_observed: true/);
  assert.match(executor, /property-approval\.port\.pg\.spec\.ts/);
  assert.match(executor, /const counts = parseApprovalPortTap\(result\.stdout\)/);

  const names = [
    "requires the forward-fixed active partial unique predicate",
    "recovers every real dependent 23505 and proves caller commit or rollback",
    "fails unknown 23505 and unknown DB errors closed with usable caller manager",
    "keeps writes invisible before caller commit and removes them on caller rollback",
    "enforces terminal monotonicity before INSERT under the caller-held source lock",
    "serializes two post-terminal intents with the caller-held source lock",
    "resolves client-key, business-intent and active-source races and preserves manager usability",
  ];
  const passingTap = ["TAP version 13", ...names.flatMap((name, index) =>
    [`# Subtest: ${name}`, `ok ${index + 1} - ${name}`]), "1..7", "# tests 7", "# suites 1",
  "# pass 7", "# fail 0", "# cancelled 0", "# skipped 0", "# todo 0", ""].join("\n");
  assert.deepEqual(parseApprovalPortTap(passingTap), {
    tests: 7, suites: 1, pass: 7, fail: 0, cancelled: 0, skipped: 0, todo: 0,
    expected_tests: 7, required_subtests: names,
  });
  for (const invalid of [
    "",
    passingTap.replace("# tests 7", "# tests 0").replace("# pass 7", "# pass 0"),
    passingTap.replace("# pass 7", "# pass 6").replace("# skipped 0", "# skipped 1"),
    passingTap.replace(`# Subtest: ${names[0]}`, "# Subtest: compile-only"),
  ]) assert.throws(() => parseApprovalPortTap(invalid), /b2c-000197-approval-port-pg-/);
});

test("preliminary artifact is immutable and explicitly not final", () => {
  assert.match(executor, /writeFileSync\(artifactPath, bytes, \{ flag: "wx", mode: 0o444 \}\)/);
  assert.match(executor, /writeFileSync\(artifactManifestPath, manifest, \{ flag: "wx", mode: 0o444 \}\)/);
  assert.match(executor, /scope: "absent-path-preliminary-only"/);
  assert.match(executor, /final_current: false/);
  assert.match(executor, /resources_retained: \["a", "b"\]/);
  assert.match(executor, /cleanup_performed: false/);
  assert.match(executor, /"01-final-fresh", "03-present-exact", "14-later-apply"/);
});

test("executor never creates, removes or cleans Docker resources", () => {
  assert.doesNotMatch(executor, /command\("docker", \["(?:run|rm|stop|kill|volume|system|prune)"/);
  assert.doesNotMatch(executor, /DROP DATABASE|CREATE DATABASE/);
  assert.match(executor, /resources_retained/);
});

test("default invocation cannot write PostgreSQL", () => {
  assert.match(executor, /fileURLToPath\(import\.meta\.url\) === resolve\(process\.argv\[1\] \?\? ""\)/);
  assert.match(executor, /process\.env\.B2C_000197_PRELIMINARY_EXECUTE === "1" \? execute\(\) : staticCandidate\(\)/);
});
