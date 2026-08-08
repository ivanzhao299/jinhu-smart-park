import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { existsSync, lstatSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const root = process.cwd();
const researchRoot = resolve(root, ".trellis/tasks/07-30-pr192-b-domain-integrations/research");
const formalRunId = "b2c197_prelim_20260802a";
const migrationFilename = "000197_property_approval_active_source_index_forward_fix.sql";
const migrationPath = resolve(root, "database/migrations", migrationFilename);
const gatePath = resolve(root, "scripts/e2e/property-remediation/track-b2c-approval-index-forward-fix-gate.mjs");
const staticTestPath = resolve(root, "scripts/e2e/property-remediation/tests/b2c-approval-index-forward-fix.spec.mjs");
const executorPath = fileURLToPath(import.meta.url);
const preliminaryTestPath = resolve(root,
  "scripts/e2e/property-remediation/tests/b2c-000197-preliminary-executor.spec.mjs");
const candidateManifestPath = resolve(researchRoot, "b2c-000197-preliminary-v2-input-manifest-20260802.grammar");
const reviewHandoffPath = resolve(researchRoot,
  "b2c-000197-preliminary-executor-v2-review-handoff-20260802.md");
const approvalPortTestPath = resolve(root,
  "apps/api/src/modules/property-approvals/property-approval.port.pg.spec.ts");
const artifactPath = resolve(researchRoot, `b2c-000197-preliminary-artifact-${formalRunId}.json`);
const artifactManifestPath = resolve(researchRoot, `b2c-000197-preliminary-artifact-${formalRunId}.manifest`);
const expected = Object.freeze({
  r0: "705882718458b69bf76478ebd071316031782dfe1c9485674f211655715f1439",
  r1: "244a9eca21442ecbec916c962956fa5f2e807bc53d9d70704102070e76ca3f6b",
  migration: "a9b98ca82aa4dafc16535085184df838880ef27801f7cd4b225e1ca1a15af059",
  gate: "ffc2c21e91959848dacea5dd7eb873e966fc7304a69b78d2742c3a18e444379c",
  staticTest: "400bb607632724f128fe3e4016111eaffc8a8702b40d3a49e772052f6b918170",
  gateManifest: "973566353ad804ee653ebc2f129146d3191a6a9d34783d84721ea095f643a151",
  approvalPortTest: "3af6121741e019afc80b251b6bff1a03b11dfb09123fe6c6e43532ca585db488",
  newIndexdef: "dd004f0c2e5f40e86ec1953effa91b8604614e276c9fedabe7f2464f13d70d9c",
  newPredicate: "24ef911486d5274d6c439d63de6aa253b289241ac2b75317b1f98bc93a5a8fda",
});
const relations = Object.freeze([
  "biz_property_approval_request", "biz_property_approval_stage", "biz_property_approval_decision",
  "biz_property_approval_actor_exclusion", "biz_property_execution_effect_manifest",
  "biz_property_execution_effect_receipt", "biz_property_approval_audit", "biz_property_outbox",
]);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sqlLiteral = (value) => `'${String(value).replaceAll("'", "''")}'`;

function command(name, args, options = {}) {
  const result = spawnSync(name, args, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
    ...options });
  if (!options.allowFailure && (result.error || result.status !== 0)) {
    throw new Error(`b2c-000197-preliminary-command-failed:${name}:${result.error?.message ?? result.stderr}`);
  }
  return result;
}

function psql(target, sql, options = {}) {
  return command("docker", ["exec", "-i", target.container, "psql", "-X", "-qAt", "-F", "\t",
    "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", target.database],
  { input: `\\set VERBOSITY verbose\n${sql}`, ...options });
}

function parseGrammar(bytes) {
  const lines = bytes.trimEnd().split("\n"); const schema = lines.shift(); const fields = new Map();
  for (const line of lines) {
    const at = line.indexOf("\t");
    if (at < 1 || fields.has(line.slice(0, at))) throw new Error("b2c-000197-preliminary-proof-malformed");
    fields.set(line.slice(0, at), line.slice(at + 1));
  }
  return { schema, fields };
}

function immutableProof(pathValue, shaValue, schema, expectedFields) {
  if (!pathValue || !/^[0-9a-f]{64}$/.test(shaValue ?? "")) {
    throw new Error("b2c-000197-preliminary-proof-path-sha-required");
  }
  const path = resolve(root, pathValue);
  if (dirname(path) !== researchRoot || !existsSync(path) || lstatSync(path).isSymbolicLink()
      || realpathSync(path) !== path) throw new Error("b2c-000197-preliminary-proof-path-drift");
  const bytes = readFileSync(path);
  if (sha256(bytes) !== shaValue) throw new Error("b2c-000197-preliminary-proof-sha-drift");
  const parsed = parseGrammar(bytes.toString("utf8"));
  if (parsed.schema !== schema) throw new Error("b2c-000197-preliminary-proof-schema-drift");
  for (const [key, value] of Object.entries(expectedFields)) {
    if (parsed.fields.get(key) !== value) throw new Error(`b2c-000197-preliminary-proof-field-drift:${key}`);
  }
  return { path, raw_sha256: shaValue, fields: Object.fromEntries(parsed.fields) };
}

function reviewProof(index) {
  const authority = index === "A" ? "independent-database-reviewer" : "independent-qa-security-reviewer";
  return immutableProof(process.env[`B2C_000197_EXECUTOR_V2_REVIEW_${index}_PATH`],
    process.env[`B2C_000197_EXECUTOR_V2_REVIEW_${index}_SHA`],
    "b2c-000197-preliminary-executor-independent-review-v2", {
      review_chain: "b2c-000197-preliminary-v2",
      formal_run_id: formalRunId, r0_raw_sha256: expected.r0, r1_raw_sha256: expected.r1,
      migration_raw_sha256: expected.migration, gate_raw_sha256: expected.gate,
      executor_raw_sha256: sha256(readFileSync(executorPath)),
      preliminary_test_raw_sha256: sha256(readFileSync(preliminaryTestPath)),
      preliminary_manifest_raw_sha256: sha256(readFileSync(candidateManifestPath)),
      review_handoff_raw_sha256: sha256(readFileSync(reviewHandoffPath)),
      returned_database_review_raw_sha256: "c2602ba2467c29991896661327733520ec4132a1ea4f3275aa81abf15869d858",
      returned_qa_security_review_raw_sha256: "8a946a6c076358786301318354717cf619130492808a821d7d08119576215b1f",
      returned_reviews_disposition: "RETURNED-audit-only-not-authority",
      reviewer_authority: authority, decision: "GO",
    });
}

function oldWriterDrainProof() {
  return immutableProof(process.env.B2C_000197_OLD_WRITER_DRAIN_PATH,
    process.env.B2C_000197_OLD_WRITER_DRAIN_SHA,
    "b2c-000197-old-writer-drain-v1", {
      formal_run_id: formalRunId, r0_raw_sha256: expected.r0, r1_raw_sha256: expected.r1,
      migration_raw_sha256: expected.migration, decision: "GO",
      intake: "stopped", in_flight_approval_create_transactions: "0",
      new_writer_build: "approval-port-v4",
    });
}

function assertCandidateManifest() {
  const file = (path, size, hash) => `file\t${path}\t${size}\t${hash}`;
  const expectedManifest = [
    "b2c-000197-preliminary-input-manifest-v2",
    `formal_run_id\t${formalRunId}`,
    "review_chain\tb2c-000197-preliminary-v2",
    "status\texecutor-candidate-awaiting-two-new-independent-v2-reviews",
    file("database/migrations/000197_property_approval_active_source_index_forward_fix.sql", 10515,
      expected.migration),
    file(".trellis/tasks/07-30-pr192-b-domain-integrations/research/b2c-000197-r0-reservation-candidate-20260802.grammar",
      5227, expected.r0),
    file(".trellis/tasks/07-30-pr192-b-domain-integrations/research/b2c-000197-r1-v2-checksum-seal-20260802.grammar",
      1172, expected.r1),
    file(".trellis/tasks/07-30-pr192-b-domain-integrations/research/b2c-000197-v2-gate-input-manifest-20260802.grammar",
      2394, expected.gateManifest),
    file("scripts/e2e/property-remediation/track-b2c-approval-index-forward-fix-gate.mjs", 14402,
      expected.gate),
    file("scripts/e2e/property-remediation/tests/b2c-approval-index-forward-fix.spec.mjs", 8962,
      expected.staticTest),
    file("scripts/e2e/property-remediation/track-b2c-000197-preliminary-executor.mjs",
      readFileSync(executorPath).byteLength, sha256(readFileSync(executorPath))),
    file("scripts/e2e/property-remediation/tests/b2c-000197-preliminary-executor.spec.mjs",
      readFileSync(preliminaryTestPath).byteLength, sha256(readFileSync(preliminaryTestPath))),
    file("apps/api/src/modules/property-approvals/property-approval.port.pg.spec.ts", 17886,
      expected.approvalPortTest),
    "returned_review\tdatabase\t.trellis/tasks/07-30-pr192-b-domain-integrations/research/b2c-000197-preliminary-executor-database-review-20260802.grammar\tc2602ba2467c29991896661327733520ec4132a1ea4f3275aa81abf15869d858\tRETURNED-audit-only-not-authority",
    "returned_review\tqa-security\t.trellis/tasks/07-30-pr192-b-domain-integrations/research/b2c-000197-preliminary-executor-qa-security-review-20260802.grammar\t8a946a6c076358786301318354717cf619130492808a821d7d08119576215b1f\tRETURNED-audit-only-not-authority",
    "resource\ta\tjinhu-b2c197-r0-20260802a-a\t4f5aebe17beb468b9b376b0951e0693c7a8530aafa9329e7518d9a8795366212\tjinhu_b2c197_a\t8b96ecefbf8a1ee056379275728427fa41b1c1f6bef700671e512262f99a9d51",
    "resource\tb\tjinhu-b2c197-r0-20260802a-b\tcfe5297c06cdb33dfe1b5e8e31c5c9443771dc9619608ea761bbfe1caffe7434\tjinhu_b2c197_b\t1ace75aa84c9d96a4795ad32fc3b700a851895ff1671dd759b001ef53e290967",
    "preliminary_scope\tabsent-path-A-and-B-only",
    "retain_after_run\ta,b",
    "deferred\t01-final-fresh;03-present-exact;14-later-apply;remaining-final-dynamic;final-current",
    "live_execution\tblocked-until-two-new-independent-v2-go-and-old-writer-drain-proof",
    "",
  ].join("\n");
  if (readFileSync(candidateManifestPath, "utf8") !== expectedManifest) {
    throw new Error("b2c-000197-preliminary-candidate-manifest-drift");
  }
  if (sha256(readFileSync(approvalPortTestPath)) !== expected.approvalPortTest) {
    throw new Error("b2c-000197-preliminary-approval-port-test-drift");
  }
  return { path: candidateManifestPath, raw_sha256: sha256(expectedManifest) };
}

function runSignedStaticGates() {
  const run = (path, expectedCount) => {
    const result = command(process.execPath, [path]);
    if (!result.stdout.includes(`# tests ${expectedCount}`)
        || !result.stdout.includes(`# pass ${expectedCount}`) || !result.stdout.includes("# fail 0")) {
      throw new Error(`b2c-000197-preliminary-signed-static-gate-drift:${path}`);
    }
    return { path: path.slice(root.length + 1), tests: expectedCount, passed: expectedCount,
      stdout_sha256: sha256(result.stdout), stderr_sha256: sha256(result.stderr) };
  };
  return { history_catalog: run(staticTestPath, 8), executor: run(preliminaryTestPath, 9) };
}

function preflight() {
  const result = command(process.execPath, [gatePath], { env: { ...process.env,
    B2C_000197_GATE_EXECUTE: "0", B2C_000197_PREFLIGHT_ONLY: "1",
    B2C_000197_GATE_RUN_ID: "b2c197_r0_20260802a" } });
  const parsed = JSON.parse(result.stdout);
  if (parsed.status !== "preflight-only" || parsed.hashes.r0 !== expected.r0
      || parsed.hashes.r1 !== expected.r1 || parsed.hashes.migration !== expected.migration
      || parsed.manifest.raw_sha256 !== expected.gateManifest || parsed.targets.length !== 2
      || parsed.targets.some((target) => target.history.state !== "dual-absent"
        || target.history.decision !== "execute")) {
    throw new Error("b2c-000197-preliminary-preflight-not-dual-absent");
  }
  return parsed;
}

function snapshot(target) {
  const countSql = relations.map((relation) =>
    `${sqlLiteral(relation)},(SELECT count(*) FROM public.${relation})`).join(",");
  const output = psql(target, `SELECT json_build_object(
    'counts',json_build_object(${countSql}),
    'indexdef',encode(public.digest(convert_to(pg_get_indexdef(i.indexrelid),'UTF8'),'sha256'),'hex'),
    'predicate',encode(public.digest(convert_to(pg_get_expr(i.indpred,i.indrelid,false),'UTF8'),'sha256'),'hex'),
    'build_residue',to_regclass('public.uq_biz_property_approval_request_active_source_v2_build') IS NOT NULL)
    FROM pg_index i WHERE i.indexrelid='public.uq_biz_property_approval_request_active_source'::regclass;`)
    .stdout.trim();
  return JSON.parse(output);
}

function writeHistory(target, status, errorMessage = null) {
  const checksum = expected.migration; const batch = formalRunId.slice(0, 32);
  const error = errorMessage ? sqlLiteral(errorMessage.slice(0, 500)) : "NULL";
  psql(target, `BEGIN;
    INSERT INTO public.sys_schema_migration_history
      (filename,checksum,status,started_at,finished_at,error_message,executed_by,batch_id)
    VALUES (${sqlLiteral(migrationFilename)},${sqlLiteral(checksum)},${sqlLiteral(status)},clock_timestamp(),
      ${status === "running" ? "NULL" : "clock_timestamp()"},${error},'b2c-000197-preliminary-executor',${sqlLiteral(batch)})
    ON CONFLICT(filename) DO UPDATE SET checksum=EXCLUDED.checksum,status=EXCLUDED.status,
      finished_at=EXCLUDED.finished_at,error_message=EXCLUDED.error_message,updated_at=clock_timestamp();
    INSERT INTO public.schema_migrations
      (filename,checksum,status,started_at,finished_at,error_message,executed_by,batch_id)
    SELECT filename,checksum,status,started_at,finished_at,error_message,executed_by,batch_id
    FROM public.sys_schema_migration_history WHERE filename=${sqlLiteral(migrationFilename)}
    ON CONFLICT(filename) DO UPDATE SET checksum=EXCLUDED.checksum,status=EXCLUDED.status,
      finished_at=EXCLUDED.finished_at,error_message=EXCLUDED.error_message,updated_at=clock_timestamp();
    COMMIT;`);
}

function applyFormal(target) {
  const before = snapshot(target); writeHistory(target, "running");
  const applied = psql(target, readFileSync(migrationPath, "utf8"), { allowFailure: true });
  if (applied.error || applied.status !== 0) {
    writeHistory(target, "failed", applied.stderr || applied.stdout);
    throw new Error(`b2c-000197-preliminary-migration-failed:${target.key}:${applied.stderr}`);
  }
  writeHistory(target, "succeeded");
  const after = snapshot(target);
  if (JSON.stringify(before.counts) !== JSON.stringify(after.counts)
      || after.indexdef !== expected.newIndexdef || after.predicate !== expected.newPredicate
      || after.build_residue) throw new Error(`b2c-000197-preliminary-post-state-drift:${target.key}`);
  const rerun = psql(target, readFileSync(migrationPath, "utf8"));
  const rerunAfter = snapshot(target);
  if (JSON.stringify(after) !== JSON.stringify(rerunAfter)) {
    throw new Error(`b2c-000197-preliminary-rerun-drift:${target.key}`);
  }
  return { before, after, rerun: { status: rerun.status, exact: true } };
}

function approvalRow(values) {
  const id = values.id ?? "uuid_generate_v4()";
  return `(${id},${sqlLiteral(values.tenant)},${sqlLiteral(values.park)},'property.mode-transition.request',
    'property-unit',${values.source},1,uuid_generate_v4(),uuid_generate_v4(),${sqlLiteral(values.client)},
    ${sqlLiteral(values.intent)},'{}'::jsonb,1,repeat('a',64),NULL,NULL,uuid_generate_v4(),1,repeat('b',64),
    ${sqlLiteral(values.decision)},${sqlLiteral(values.execution)},1,1,${sqlLiteral(values.executionKey)},
    0,${values.claim ?? "NULL"},${values.worker ?? "NULL"},${values.lease ?? "NULL"},${values.heartbeat ?? "NULL"},
    0,${values.retry ?? "NULL"},false,${values.errorCategory ?? "NULL"},${values.errorCode ?? "NULL"},NULL,
    ${values.infraAt ?? "NULL"},NULL,${values.decidedAt ?? "NULL"},${values.executedAt ?? "NULL"},
    clock_timestamp(),clock_timestamp())`;
}

function predicateMatrix(target) {
  const tenant = `prelim-${target.key}-${formalRunId}`; const park = "p1";
  const cases = [
    ["draft","not_started",{}], ["submitted","not_started",{}], ["pending_approval","not_started",{}],
    ["approved","not_started",{ decidedAt: "clock_timestamp()" }],
    ["approved","executing",{ decidedAt: "clock_timestamp()", claim: "uuid_generate_v4()", worker: "'w'",
      lease: "clock_timestamp()+interval '1 minute'", heartbeat: "clock_timestamp()" }],
    ["approved","retry_wait",{ decidedAt: "clock_timestamp()", retry: "clock_timestamp()+interval '1 minute'" }],
    ["approved","infra_exhausted",{ decidedAt: "clock_timestamp()", errorCategory: "'infra'", errorCode: "'E'", infraAt: "clock_timestamp()" }],
    ["approved","executed",{ decidedAt: "clock_timestamp()", executedAt: "clock_timestamp()" }],
    ["approved","execution_failed",{ decidedAt: "clock_timestamp()", errorCategory: "'business'", errorCode: "'E'" }],
    ["rejected","not_required",{ decidedAt: "clock_timestamp()" }],
    ["withdrawn","not_required",{}], ["expired","not_required",{}],
  ];
  const rows = cases.map(([decision, execution, extra], index) => approvalRow({ tenant, park,
    source: "uuid_generate_v4()", client: `c${index}`, intent: `i${index}`,
    executionKey: `e${index}`, decision, execution, ...extra })).join(",\n");
  const result = psql(target, `BEGIN;
    INSERT INTO public.biz_property_approval_request(id,tenant_id,park_id,action_id,source_type,source_id,
      source_expected_version,requester_id,submitter_id,client_idempotency_key,business_intent_key,
      canonical_payload,payload_schema_version,payload_hash,amount,currency,policy_id,policy_version,policy_hash,
      decision_status,execution_status,decision_version,execution_version,execution_idempotency_key,claim_epoch,
      claim_token,worker_id,lease_expires_at,heartbeat_at,attempt_count,next_retry_at,reconcile_required,
      last_error_category,last_error_code,last_error_redacted_message,infra_exhausted_at,submitted_at,decided_at,
      executed_at,created_at,updated_at) VALUES ${rows};
    SELECT count(*) FILTER (WHERE decision_status IN ('draft','submitted','pending_approval') OR
      (decision_status='approved' AND execution_status IN ('not_started','executing','retry_wait','infra_exhausted'))),
      count(*) FILTER (WHERE (decision_status='approved' AND execution_status IN ('executed','execution_failed'))
        OR (decision_status IN ('rejected','withdrawn','expired') AND execution_status='not_required'))
    FROM public.biz_property_approval_request WHERE tenant_id=${sqlLiteral(tenant)};
    ROLLBACK;`);
  if (!result.stdout.includes("7\t5")) throw new Error(`b2c-000197-predicate-matrix-drift:${target.key}`);

  const source = "'70000000-0000-4000-8000-000000000001'::uuid";
  const duplicate = approvalRow({ tenant, park, source, client: "dup1", intent: "dup1", executionKey: "dup1",
    decision: "draft", execution: "not_started" });
  const duplicate2 = approvalRow({ tenant, park, source, client: "dup2", intent: "dup2", executionKey: "dup2",
    decision: "submitted", execution: "not_started" });
  const blocked = psql(target, `BEGIN; INSERT INTO public.biz_property_approval_request(id,tenant_id,park_id,action_id,
    source_type,source_id,source_expected_version,requester_id,submitter_id,client_idempotency_key,business_intent_key,
    canonical_payload,payload_schema_version,payload_hash,amount,currency,policy_id,policy_version,policy_hash,
    decision_status,execution_status,decision_version,execution_version,execution_idempotency_key,claim_epoch,
    claim_token,worker_id,lease_expires_at,heartbeat_at,attempt_count,next_retry_at,reconcile_required,last_error_category,
    last_error_code,last_error_redacted_message,infra_exhausted_at,submitted_at,decided_at,executed_at,created_at,updated_at)
    VALUES ${duplicate},${duplicate2}; ROLLBACK;`, { allowFailure: true });
  if (blocked.status === 0 || !`${blocked.stdout}${blocked.stderr}`.includes("23505")) {
    throw new Error(`b2c-000197-active-duplicate-not-blocked:${target.key}`);
  }
  const terminal1 = approvalRow({ tenant, park, source, client: "term1", intent: "term1", executionKey: "term1",
    decision: "approved", execution: "executed", decidedAt: "clock_timestamp()", executedAt: "clock_timestamp()" });
  const terminal2 = approvalRow({ tenant, park, source, client: "term2", intent: "term2", executionKey: "term2",
    decision: "approved", execution: "execution_failed", decidedAt: "clock_timestamp()",
    errorCategory: "'business'", errorCode: "'E'" });
  const terminal = psql(target, `BEGIN; INSERT INTO public.biz_property_approval_request(id,tenant_id,park_id,action_id,
    source_type,source_id,source_expected_version,requester_id,submitter_id,client_idempotency_key,business_intent_key,
    canonical_payload,payload_schema_version,payload_hash,amount,currency,policy_id,policy_version,policy_hash,
    decision_status,execution_status,decision_version,execution_version,execution_idempotency_key,claim_epoch,
    claim_token,worker_id,lease_expires_at,heartbeat_at,attempt_count,next_retry_at,reconcile_required,last_error_category,
    last_error_code,last_error_redacted_message,infra_exhausted_at,submitted_at,decided_at,executed_at,created_at,updated_at)
    VALUES ${terminal1},${terminal2}; SELECT count(*) FROM public.biz_property_approval_request
    WHERE tenant_id=${sqlLiteral(tenant)} AND source_id=${source}; ROLLBACK;`);
  if (!terminal.stdout.includes("2")) throw new Error(`b2c-000197-terminal-duplicate-blocked:${target.key}`);
  return { active: 7, terminal: 5, active_duplicate_sqlstate: "23505", terminal_same_source_count: 2 };
}

export function failureInjectionCases() {
  const create = `CREATE UNIQUE INDEX uq_biz_property_approval_request_active_source_v2_build
    ON public.biz_property_approval_request(tenant_id,park_id,action_id,source_type,source_id,source_expected_version)
    WHERE (decision_status IN ('draft','submitted','pending_approval') OR
      (decision_status='approved' AND execution_status IN ('not_started','executing','retry_wait','infra_exhausted')));`;
  const drop = "DROP INDEX public.uq_biz_property_approval_request_active_source;";
  return [
    { name: "before-create", boundary: "locked-before-create", prefix: "",
      assertion: "SELECT 'locked-before-create'::text;" },
    { name: "after-create", boundary: "build-created-before-drop", prefix: create,
      assertion: `DO $after_create_boundary$ BEGIN
        IF to_regclass('public.uq_biz_property_approval_request_active_source_v2_build') IS NULL THEN
          RAISE EXCEPTION 'b2c-000197-after-create-boundary-not-reached'; END IF;
      END $after_create_boundary$;` },
    { name: "after-drop", boundary: "old-dropped-build-present", prefix: `${create} ${drop}`,
      assertion: "SELECT 'old-dropped-build-present'::text;" },
    { name: "before-rename", boundary: "catalog-checked-immediately-before-rename",
      prefix: `${create} ${drop}`,
      assertion: `DO $before_rename_boundary$ BEGIN
        IF to_regclass('public.uq_biz_property_approval_request_active_source') IS NOT NULL
          OR to_regclass('public.uq_biz_property_approval_request_active_source_v2_build') IS NULL THEN
          RAISE EXCEPTION 'b2c-000197-before-rename-boundary-not-reached'; END IF;
      END $before_rename_boundary$;` },
  ];
}

function failureInjection(target) {
  return failureInjectionCases().map(({ name, boundary, prefix, assertion }) => {
    const before = snapshot(target);
    const failed = psql(target, `BEGIN; LOCK TABLE public.biz_property_approval_request IN SHARE MODE;
      ${prefix} ${assertion}
      DO $fault_${name.replaceAll("-", "_")}$ BEGIN
        RAISE EXCEPTION 'b2c-000197-injected-${name}' USING ERRCODE='P0001';
      END $fault_${name.replaceAll("-", "_")}$;`,
    { allowFailure: true });
    const after = snapshot(target);
    if (failed.status === 0 || !`${failed.stdout}${failed.stderr}`.includes(`b2c-000197-injected-${name}`)
        || JSON.stringify(before) !== JSON.stringify(after) || after.build_residue) {
      throw new Error(`b2c-000197-failure-injection-drift:${target.key}:${name}`);
    }
    return { name, boundary, statement_raw_sha256: sha256(`${prefix}\n${assertion}`),
      injected_marker_observed: true, rollback_exact: true, build_residue: after.build_residue };
  });
}

function tapCount(stdout, label) {
  const matches = [...stdout.matchAll(new RegExp(`^# ${label} (\\d+)$`, "gmu"))];
  if (matches.length !== 1) throw new Error(`b2c-000197-approval-port-pg-tap-${label}-missing`);
  return Number(matches[0][1]);
}

export function parseApprovalPortTap(stdout) {
  const summary = Object.fromEntries(["tests", "suites", "pass", "fail", "cancelled", "skipped", "todo"]
    .map((label) => [label, tapCount(stdout, label)]));
  const requiredSubtests = [
    "requires the forward-fixed active partial unique predicate",
    "recovers every real dependent 23505 and proves caller commit or rollback",
    "fails unknown 23505 and unknown DB errors closed with usable caller manager",
    "keeps writes invisible before caller commit and removes them on caller rollback",
    "enforces terminal monotonicity before INSERT under the caller-held source lock",
    "serializes two post-terminal intents with the caller-held source lock",
    "resolves client-key, business-intent and active-source races and preserves manager usability",
  ];
  const missing = requiredSubtests.filter((name) => !stdout.includes(`# Subtest: ${name}`));
  if (summary.tests !== requiredSubtests.length || summary.suites < 1
      || summary.pass !== requiredSubtests.length || summary.fail !== 0 || summary.cancelled !== 0
      || summary.skipped !== 0 || summary.todo !== 0 || missing.length > 0 || /# SKIP\b/u.test(stdout)) {
    throw new Error(`b2c-000197-approval-port-pg-suite-not-fully-executed:${JSON.stringify({ summary, missing })}`);
  }
  return { ...summary, expected_tests: requiredSubtests.length, required_subtests: requiredSubtests };
}

function runApprovalPortGate(target) {
  const inspect = JSON.parse(command("docker", ["inspect", target.container]).stdout)[0];
  const ip = Object.values(inspect.NetworkSettings.Networks)[0]?.IPAddress;
  if (!ip) throw new Error(`b2c-000197-target-ip-missing:${target.key}`);
  const result = command("pnpm", ["--filter", "@jinhu/api", "exec", "node", "--test", "--require",
    "ts-node/register", "src/modules/property-approvals/property-approval.port.pg.spec.ts"], {
      env: { ...process.env, PROPERTY_APPROVAL_PORT_PG_URL:
        `postgresql://postgres:jinhu_b2c197_gate@${ip}:5432/${target.database}` }, allowFailure: true,
    });
  if (result.error || result.status !== 0) {
    throw new Error(`b2c-000197-approval-port-pg-gate-failed:${target.key}:${result.stderr}`);
  }
  const counts = parseApprovalPortTap(result.stdout);
  return { status: result.status, ...counts, stdout_sha256: sha256(result.stdout),
    stderr_sha256: sha256(result.stderr) };
}

function historyEvidence(target) {
  const output = psql(target, `SELECT json_build_object(
    'primary',(SELECT json_agg(row_to_json(x) ORDER BY filename) FROM
      (SELECT filename,checksum,status FROM public.sys_schema_migration_history WHERE filename LIKE '000197\\_%' ESCAPE '\\')x),
    'standard',(SELECT json_agg(row_to_json(x) ORDER BY filename) FROM
      (SELECT filename,checksum,status FROM public.schema_migrations WHERE filename LIKE '000197\\_%' ESCAPE '\\')x));`)
    .stdout.trim();
  const parsed = JSON.parse(output);
  if (JSON.stringify(parsed.primary) !== JSON.stringify(parsed.standard)
      || parsed.primary?.length !== 1 || parsed.primary[0].filename !== migrationFilename
      || parsed.primary[0].checksum !== expected.migration || parsed.primary[0].status !== "succeeded") {
    throw new Error(`b2c-000197-history-postcheck-drift:${target.key}`);
  }
  return parsed;
}

function staticCandidate() {
  const candidateManifest = assertCandidateManifest();
  return { status: "executor-candidate", execution_authorized: false, formal_run_id: formalRunId,
    hashes: { migration: sha256(readFileSync(migrationPath)), gate: sha256(readFileSync(gatePath)),
      static_test: sha256(readFileSync(staticTestPath)), executor: sha256(readFileSync(executorPath)),
      preliminary_test: sha256(readFileSync(preliminaryTestPath)),
      manifest: candidateManifest.raw_sha256,
      review_handoff: sha256(readFileSync(reviewHandoffPath)) },
    deferred: ["01-final-fresh", "03-present-exact", "14-later-apply", "final-current"] };
}

function execute() {
  if (process.env.B2C_000197_PRELIMINARY_RUN_ID !== formalRunId) throw new Error("b2c-000197-formal-run-id-drift");
  if (existsSync(artifactPath) || existsSync(artifactManifestPath)) throw new Error("b2c-000197-formal-artifact-already-exists");
  const candidateManifest = assertCandidateManifest();
  const signedStaticGates = runSignedStaticGates();
  const pre = preflight(); const reviews = [reviewProof("A"), reviewProof("B")];
  if (reviews[0].fields.reviewer_authority === reviews[1].fields.reviewer_authority) {
    throw new Error("b2c-000197-preliminary-reviews-not-independent");
  }
  const drain = oldWriterDrainProof();
  const started = new Date().toISOString(); const results = [];
  for (const target of pre.targets) {
    const migration = applyFormal(target);
    const predicate = predicateMatrix(target);
    const failures = failureInjection(target);
    results.push({ key: target.key, identity: target.identity, migration, predicate, failures,
      history: historyEvidence(target) });
  }
  const application = runApprovalPortGate(pre.targets[0]);
  const candidate = { schema_version: "b2c-000197-preliminary-artifact-v2", status: "passed",
    formal_run_id: formalRunId, started_at: started, finished_at: new Date().toISOString(),
    scope: "absent-path-preliminary-only", final_current: false,
    hashes: staticCandidate().hashes, candidate_manifest: candidateManifest,
    signed_static_gates: signedStaticGates, reviews, old_writer_drain: drain, preflight: pre,
    results, application_gate: application,
    matrix_negatives: signedStaticGates.history_catalog,
    hash_tamper: signedStaticGates.history_catalog,
    deferred: ["01-final-fresh", "03-present-exact", "14-later-apply", "remaining-final-dynamic", "final-current"],
    resources_retained: ["a", "b"], cleanup_performed: false };
  const bytes = `${JSON.stringify(candidate, null, 2)}\n`;
  writeFileSync(artifactPath, bytes, { flag: "wx", mode: 0o444 });
  const artifactSha = sha256(bytes);
  const manifest = `b2c-000197-preliminary-artifact-manifest-v1\nartifact\t${artifactPath.slice(root.length + 1)}\t${Buffer.byteLength(bytes)}\t${artifactSha}\nformal_run_id\t${formalRunId}\nstatus\tpassed\nscope\tabsent-path-preliminary-only\nfinal_current\tfalse\nresources_retained\ta,b\n`;
  writeFileSync(artifactManifestPath, manifest, { flag: "wx", mode: 0o444 });
  return { status: "passed", artifact: artifactPath, artifact_raw_sha256: artifactSha,
    manifest: artifactManifestPath, manifest_raw_sha256: sha256(manifest) };
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? "")) {
  const result = process.env.B2C_000197_PRELIMINARY_EXECUTE === "1" ? execute() : staticCandidate();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
