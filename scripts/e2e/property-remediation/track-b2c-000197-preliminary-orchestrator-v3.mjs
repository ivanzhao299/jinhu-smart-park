import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { URL } from "node:url";
import process from "node:process";
import {
  RecordedSubprocessError, V3_RUN_ID, executeWithEvidenceV3,
} from "./track-b2c-000197-preliminary-executor-v3.mjs";
import {
  failureInjectionCases, parseApprovalPortTap,
} from "./track-b2c-000197-preliminary-executor.mjs";

const root = process.cwd();
const research = resolve(root, ".trellis/tasks/07-30-pr192-b-domain-integrations/research");
const migrationFilename = "000197_property_approval_active_source_index_forward_fix.sql";
const migrationPath = resolve(root, "database/migrations", migrationFilename);
const resourceAuthorityPath = resolve(research, "b2c-000197-preliminary-v3-resource-authority-20260802.grammar");
const manifestPath = resolve(research, "b2c-000197-preliminary-v3-input-manifest-20260802.grammar");
const handoffPath = resolve(research, "b2c-000197-preliminary-executor-v3-review-handoff-20260802.md");
const fixtureRunId = "7d10fc7126c5c03b62f447821943f9e3";
const expected = Object.freeze({
  migration: "a9b98ca82aa4dafc16535085184df838880ef27801f7cd4b225e1ca1a15af059",
  resourceAuthority: "3c2c91ca18c6639c9d3306ececf06d2b43b3b74c06a870a5c786d08616ab8c73",
  runtimeV5: "e30ffc9dd618d4b95c7974ab43d4ab6a54daa783876a5e37cb03a212aa69d9f3",
  pgSpec: "f8865fa948f1f4cac693a3ee2420bfc398b1feca487a2c6563c3afa8d388f4df",
  fixture: "8bbdccbec7658da6173ebd8372a423df027441f1e5cdf67e8da065fef02e4cd1",
  fixtureSpec: "7ce34bb689f30a044535244f4cd04ad5ea78341c717b3bba14a4604855986eb0",
  pgGate: "8db393791a05f47537276113041fb714970377ae96c7980835c03256b550d982",
  oldIndexdef: "89d630118eeeab3655fffe97cde034d82567c1e253c543f9a33a7a8420768584",
  oldPredicate: "d47740fefda3dc305edc9f845c359dfae15d6d9fa1c28a096870870129563a37",
  newIndexdef: "dd004f0c2e5f40e86ec1953effa91b8604614e276c9fedabe7f2464f13d70d9c",
  newPredicate: "24ef911486d5274d6c439d63de6aa253b289241ac2b75317b1f98bc93a5a8fda",
});
export const V3_TARGETS = Object.freeze([
  { key: "c", topology: "upgrade-to-195", container: "jinhu-b2c197-prelim-20260802b-c",
    containerId: "ee68f2ef6b1c2ac5e6d653f1a2388e121b268bf3e6517402484255c1845d25c6",
    database: "jinhu_b2c197_c", volume: "60ab8a7c1dbf58421056bfd5a6f987144cfd8c7ee44c6500302478c9e0c1da12" },
  { key: "d", topology: "fresh-to-195", container: "jinhu-b2c197-prelim-20260802b-d",
    containerId: "f0d1f2d5e8508fd787e03c179596730c97371e0ebb19e1462774ebc67faae896",
    database: "jinhu_b2c197_d", volume: "7384e6ecc01752cff1fc8dd49074d4488e35e5369ceea404895a906cb4af98f5" },
]);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;
const childEnv = (extra = {}) => ({ PATH: process.env.PATH, ...extra });
const safeEnv = (secretKeys = []) => [{ name: "PATH", persist: "value" },
  ...secretKeys.map((name) => ({ name, persist: "redacted" }))];

function psql(recorder, target, stage, sql, options = {}) {
  return recorder.runChild({ stage, command: "docker", args: ["exec", "-i", target.container,
    "psql", "-X", "-qAt", "-F", "\t", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", target.database],
  cwd: root, env: childEnv(), envAllowlist: safeEnv(), input: `\\set VERBOSITY verbose\n${sql}`,
  allowFailure: options.allowFailure ?? false });
}

function parseJson(result) { return JSON.parse(result.stdout.toString("utf8").trim()); }

export function parseNodeTap(stdout, expectedTests) {
  const count = (label) => {
    const found = [...stdout.matchAll(new RegExp(`^# ${label} (\\d+)$`, "gmu"))];
    if (found.length !== 1) throw new Error(`b2c-000197-v3-tap-${label}-missing`);
    return Number(found[0][1]);
  };
  const result = Object.fromEntries(["tests", "suites", "pass", "fail", "cancelled", "skipped", "todo"]
    .map((label) => [label, count(label)]));
  if (result.tests !== expectedTests || result.pass !== expectedTests || result.fail !== 0
      || result.cancelled !== 0 || result.skipped !== 0 || result.todo !== 0) {
    throw new Error(`b2c-000197-v3-tap-count-drift:${JSON.stringify(result)}`);
  }
  return result;
}

function inspectTarget(recorder, target) {
  const format = "{{.Id}}|{{.Name}}|{{.Config.Image}}|{{.Image}}|{{.State.Running}}|{{range .Mounts}}{{.Type}}:{{.Name}}:{{.Destination}}{{end}}";
  const observed = recorder.runChild({ stage: `inspect-${target.key}`, command: "docker",
    args: ["inspect", "--format", format, target.container], cwd: root,
    env: childEnv(), envAllowlist: safeEnv() }).stdout.toString("utf8").trim();
  const expectedValue = `${target.containerId}|/${target.container}|postgres:16-alpine|sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777|true|volume:${target.volume}:/var/lib/postgresql/data`;
  if (observed !== expectedValue) throw new Error(`b2c-000197-v3-resource-drift:${target.key}`);
  return observed;
}

function snapshot(recorder, target, stage) {
  return parseJson(psql(recorder, target, stage, `SELECT json_build_object(
    'history_primary',(SELECT json_agg(row_to_json(x) ORDER BY filename) FROM
      (SELECT filename,checksum,status FROM public.sys_schema_migration_history WHERE filename LIKE '000197\\_%' ESCAPE '\\')x),
    'history_mirror',(SELECT json_agg(row_to_json(x) ORDER BY filename) FROM
      (SELECT filename,checksum,status FROM public.schema_migrations WHERE filename LIKE '000197\\_%' ESCAPE '\\')x),
    'approval_rows',(SELECT count(*) FROM public.biz_property_approval_request),
    'indexdef',encode(public.digest(convert_to(pg_get_indexdef(i.indexrelid),'UTF8'),'sha256'),'hex'),
    'predicate',encode(public.digest(convert_to(pg_get_expr(i.indpred,i.indrelid,false),'UTF8'),'sha256'),'hex'),
    'build_residue',to_regclass('public.uq_biz_property_approval_request_active_source_v2_build') IS NOT NULL)
    FROM pg_index i WHERE i.indexrelid='public.uq_biz_property_approval_request_active_source'::regclass;`));
}

function assertAbsent(snapshotValue, target) {
  if (snapshotValue.history_primary !== null || snapshotValue.history_mirror !== null
      || snapshotValue.indexdef !== expected.oldIndexdef || snapshotValue.predicate !== expected.oldPredicate
      || snapshotValue.build_residue) throw new Error(`b2c-000197-v3-not-dual-absent-old-catalog:${target.key}`);
}

function assertMigrationInput() {
  const matching = readdirSync(resolve(root, "database/migrations"))
    .filter((filename) => filename.startsWith("000197_"));
  if (matching.length !== 1 || matching[0] !== migrationFilename
      || sha256(readFileSync(migrationPath)) !== expected.migration) {
    throw new Error(`b2c-000197-v3-migration-input-drift:${JSON.stringify(matching)}`);
  }
}

function writeHistory(recorder, target, status, error = null) {
  psql(recorder, target, `history-${target.key}-${status}`, `BEGIN;
    INSERT INTO public.sys_schema_migration_history(filename,checksum,status,started_at,finished_at,error_message,executed_by,batch_id)
    VALUES (${literal(migrationFilename)},${literal(expected.migration)},${literal(status)},clock_timestamp(),
      ${status === "running" ? "NULL" : "clock_timestamp()"},${error ? literal(error.slice(0, 500)) : "NULL"},
      'b2c-000197-v3-executor','b2c197-prelim-20260802b')
    ON CONFLICT(filename) DO UPDATE SET checksum=EXCLUDED.checksum,status=EXCLUDED.status,
      finished_at=EXCLUDED.finished_at,error_message=EXCLUDED.error_message,updated_at=clock_timestamp();
    INSERT INTO public.schema_migrations(filename,checksum,status,started_at,finished_at,error_message,executed_by,batch_id)
    SELECT filename,checksum,status,started_at,finished_at,error_message,executed_by,batch_id
      FROM public.sys_schema_migration_history WHERE filename=${literal(migrationFilename)}
    ON CONFLICT(filename) DO UPDATE SET checksum=EXCLUDED.checksum,status=EXCLUDED.status,
      finished_at=EXCLUDED.finished_at,error_message=EXCLUDED.error_message,updated_at=clock_timestamp(); COMMIT;`);
}

function applyTarget(recorder, target) {
  const before = snapshot(recorder, target, `snapshot-${target.key}-before`); assertAbsent(before, target);
  writeHistory(recorder, target, "running");
  const applied = psql(recorder, target, `migration-${target.key}`, readFileSync(migrationPath), { allowFailure: true });
  if (applied.status !== 0 || applied.signal || applied.error) {
    writeHistory(recorder, target, "failed", applied.stderr.toString("utf8") || applied.stdout.toString("utf8"));
    throw new RecordedSubprocessError(`migration-${target.key}`, applied);
  }
  writeHistory(recorder, target, "succeeded");
  const after = snapshot(recorder, target, `snapshot-${target.key}-after`);
  if (after.approval_rows !== before.approval_rows || after.indexdef !== expected.newIndexdef
      || after.predicate !== expected.newPredicate || after.build_residue) {
    throw new Error(`b2c-000197-v3-post-migration-drift:${target.key}`);
  }
  psql(recorder, target, `rerun-${target.key}`, readFileSync(migrationPath));
  const rerun = snapshot(recorder, target, `snapshot-${target.key}-rerun`);
  if (JSON.stringify(after) !== JSON.stringify(rerun)) throw new Error(`b2c-000197-v3-rerun-drift:${target.key}`);
  return { before, after, rerun_exact: true };
}

function failureInjections(recorder, target) {
  return failureInjectionCases().map(({ name, boundary, prefix, assertion }) => {
    const before = snapshot(recorder, target, `fault-${target.key}-${name}-before`);
    const marker = `b2c-000197-v3-injected-${name}`;
    const result = psql(recorder, target, `fault-${target.key}-${name}`, `BEGIN;
      LOCK TABLE public.biz_property_approval_request IN SHARE MODE; ${prefix} ${assertion}
      DO $fault$ BEGIN RAISE EXCEPTION '${marker}' USING ERRCODE='P0001'; END $fault$;`, { allowFailure: true });
    const after = snapshot(recorder, target, `fault-${target.key}-${name}-after`);
    if (result.status === 0 || !`${result.stdout}${result.stderr}`.includes(marker)
        || JSON.stringify(before) !== JSON.stringify(after) || after.build_residue) {
      throw new Error(`b2c-000197-v3-fault-drift:${target.key}:${name}`);
    }
    return { name, boundary, rollback_exact: true, build_residue: false };
  });
}

function predicateMatrix(recorder, target) {
  const result = parseJson(psql(recorder, target, `predicate-matrix-${target.key}`, `WITH cases(decision_status,execution_status) AS (VALUES
    ('draft','not_started'),('submitted','not_started'),('pending_approval','not_started'),
    ('approved','not_started'),('approved','executing'),('approved','retry_wait'),('approved','infra_exhausted'),
    ('approved','executed'),('approved','execution_failed'),('rejected','not_required'),
    ('withdrawn','not_required'),('expired','not_required'))
  SELECT json_build_object(
    'active',count(*) FILTER (WHERE decision_status IN ('draft','submitted','pending_approval') OR
      (decision_status='approved' AND execution_status IN ('not_started','executing','retry_wait','infra_exhausted'))),
    'terminal',count(*) FILTER (WHERE (decision_status='approved' AND execution_status IN ('executed','execution_failed'))
      OR (decision_status IN ('rejected','withdrawn','expired') AND execution_status='not_required')),
    'total',count(*)) FROM cases;`));
  if (result.active !== 7 || result.terminal !== 5 || result.total !== 12) {
    throw new Error(`b2c-000197-v3-predicate-matrix-drift:${target.key}`);
  }
  return result;
}

function approvalResidue(recorder, target, stage) {
  const prefix = `b2c_ap_${fixtureRunId}`;
  return parseJson(psql(recorder, target, stage, `SELECT json_build_object(
    'relations',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname='${prefix}_sentinel'),
    'functions',(SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='${prefix}_fault'),
    'triggers',(SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgname='tr_${prefix}_fault'),
    'rows',(SELECT sum(row_count) FROM (VALUES
      ((SELECT count(*) FROM public.biz_property_approval_request WHERE tenant_id='b2c-${fixtureRunId}' AND park_id='b2c-${fixtureRunId}')),
      ((SELECT count(*) FROM public.biz_property_approval_stage WHERE tenant_id='b2c-${fixtureRunId}' AND park_id='b2c-${fixtureRunId}')),
      ((SELECT count(*) FROM public.biz_property_approval_actor_exclusion WHERE tenant_id='b2c-${fixtureRunId}' AND park_id='b2c-${fixtureRunId}')),
      ((SELECT count(*) FROM public.biz_property_approval_audit WHERE tenant_id='b2c-${fixtureRunId}' AND park_id='b2c-${fixtureRunId}')),
      ((SELECT count(*) FROM public.biz_property_approval_decision WHERE tenant_id='b2c-${fixtureRunId}' AND park_id='b2c-${fixtureRunId}')),
      ((SELECT count(*) FROM public.biz_property_execution_effect_receipt WHERE tenant_id='b2c-${fixtureRunId}' AND park_id='b2c-${fixtureRunId}')),
      ((SELECT count(*) FROM public.biz_property_execution_effect_manifest WHERE tenant_id='b2c-${fixtureRunId}' AND park_id='b2c-${fixtureRunId}')),
      ((SELECT count(*) FROM public.biz_property_mutation_receipt WHERE tenant_id='b2c-${fixtureRunId}' AND park_id='b2c-${fixtureRunId}'))
    ) AS residue(row_count)),
    'sessions',(SELECT count(*) FROM pg_stat_activity WHERE application_name IN
      ('${prefix}','${prefix}_observer','${prefix}_auditor')));`));
}

function assertZeroResidue(value, stage) {
  if (Object.values(value).some((count) => count !== 0)) throw new Error(`b2c-000197-v3-approval-residue:${stage}`);
}

function approvalGate(recorder, target) {
  const inspect = recorder.runChild({ stage: "approval-runtime-secret-discovery", command: "docker",
    args: ["inspect", "--format", "{{range .Config.Env}}{{println .}}{{end}}|{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}", target.container],
    cwd: root, env: childEnv(), envAllowlist: safeEnv() }).stdout.toString("utf8");
  const password = inspect.match(/^POSTGRES_PASSWORD=(.*)$/mu)?.[1];
  const ip = inspect.slice(inspect.lastIndexOf("|") + 1).trim();
  if (!password || !ip) throw new Error("b2c-000197-v3-runtime-secret-or-ip-missing");
  recorder.secrets.push(password);
  const url = `postgresql://postgres:${password}@${ip}:5432/${target.database}`;
  recorder.runChild({ stage: "approval-fixture-unit", command: "pnpm", args: ["--filter", "@jinhu/api", "exec",
    "node", "--test", "--require", "ts-node/register", "src/modules/property-approvals/property-approval.port.pg-fixture.spec.ts"],
    cwd: root, env: childEnv(), envAllowlist: safeEnv(), tapParser: (stdout) => parseNodeTap(stdout, 5) });
  psql(recorder, target, "approval-connect", "SELECT 1;");
  const before = approvalResidue(recorder, target, "approval-before"); assertZeroResidue(before, "before");
  const env = childEnv({ PROPERTY_APPROVAL_PORT_PG_URL: url, PROPERTY_APPROVAL_PORT_PG_RUN_ID: fixtureRunId });
  const child = recorder.runChild({ stage: "approval-test", command: "pnpm", args: ["--filter", "@jinhu/api", "exec",
    "node", "--test", "--require", "ts-node/register", "src/modules/property-approvals/property-approval.port.pg.spec.ts"],
    cwd: root, env, envAllowlist: [...safeEnv(["PROPERTY_APPROVAL_PORT_PG_URL"]),
      { name: "PROPERTY_APPROVAL_PORT_PG_RUN_ID", persist: "value" }],
    tapParser: parseApprovalPortTap, allowFailure: true, allowTapFailure: true });
  const after = approvalResidue(recorder, target, "approval-after"); assertZeroResidue(after, "after");
  if (child.status !== 0 || child.signal || child.error) throw new RecordedSubprocessError("approval-test", child);
  if (child.tapError) throw child.tapError;
  return { before, after, tap: child.tap };
}

function immutableProof(pathValue, shaValue, schema, fields) {
  const path = resolve(root, pathValue ?? "");
  if (!shaValue?.match(/^[0-9a-f]{64}$/u) || dirname(path) !== research || !existsSync(path)
      || lstatSync(path).isSymbolicLink() || realpathSync(path) !== path
      || sha256(readFileSync(path)) !== shaValue) throw new Error("b2c-000197-v3-proof-path-sha-drift");
  const lines = readFileSync(path, "utf8").trimEnd().split("\n");
  if (lines.shift() !== schema) throw new Error("b2c-000197-v3-proof-schema-drift");
  const parsed = new Map(lines.map((line) => { const at = line.indexOf("\t"); return [line.slice(0, at), line.slice(at + 1)]; }));
  for (const [key, value] of Object.entries(fields)) if (parsed.get(key) !== value) throw new Error(`b2c-000197-v3-proof-field:${key}`);
  return { path, raw_sha256: shaValue, fields: Object.fromEntries(parsed) };
}

function assertFrozenManifest() {
  if (!existsSync(manifestPath) || lstatSync(manifestPath).isSymbolicLink()
      || realpathSync(manifestPath) !== manifestPath) throw new Error("b2c-000197-v3-manifest-path-drift");
  const lines = readFileSync(manifestPath, "utf8").trimEnd().split("\n");
  if (lines.shift() !== "b2c-000197-preliminary-input-manifest-v3") {
    throw new Error("b2c-000197-v3-manifest-schema-drift");
  }
  for (const line of lines.filter((entry) => entry.startsWith("file\t"))) {
    const [, relativePath, expectedBytes, expectedSha] = line.split("\t");
    const path = resolve(root, relativePath);
    const bytes = readFileSync(path);
    if (lstatSync(path).isSymbolicLink() || realpathSync(path) !== path
        || bytes.length !== Number(expectedBytes) || sha256(bytes) !== expectedSha) {
      throw new Error(`b2c-000197-v3-manifest-file-drift:${relativePath}`);
    }
  }
  return sha256(readFileSync(manifestPath));
}

function authorities() {
  const common = { formal_run_id: V3_RUN_ID, manifest_raw_sha256: assertFrozenManifest(),
    handoff_raw_sha256: sha256(readFileSync(handoffPath)), resource_authority_raw_sha256: expected.resourceAuthority,
    executor_raw_sha256: sha256(readFileSync(new URL("./track-b2c-000197-preliminary-executor-v3.mjs", import.meta.url))),
    orchestrator_raw_sha256: sha256(readFileSync(new URL(import.meta.url))), decision: "GO" };
  const db = immutableProof(process.env.B2C_000197_V3_REVIEW_A_PATH, process.env.B2C_000197_V3_REVIEW_A_SHA,
    "b2c-000197-preliminary-v3-independent-review-v1", { ...common, reviewer_authority: "independent-database-reviewer" });
  const qa = immutableProof(process.env.B2C_000197_V3_REVIEW_B_PATH, process.env.B2C_000197_V3_REVIEW_B_SHA,
    "b2c-000197-preliminary-v3-independent-review-v1", { ...common, reviewer_authority: "independent-qa-security-reviewer" });
  const drain = immutableProof(process.env.B2C_000197_V3_OLD_WRITER_DRAIN_PATH, process.env.B2C_000197_V3_OLD_WRITER_DRAIN_SHA,
    "b2c-000197-old-writer-drain-v2", { formal_run_id: V3_RUN_ID, resource_authority_raw_sha256: expected.resourceAuthority,
      decision: "GO", intake: "stopped", in_flight_approval_create_transactions: "0", new_writer_build: "approval-port-v5" });
  return { db, qa, drain };
}

export function staticV3Candidate() {
  assertMigrationInput();
  if (sha256(readFileSync(resourceAuthorityPath)) !== expected.resourceAuthority) {
    throw new Error("b2c-000197-v3-resource-authority-drift");
  }
  return { status: existsSync(manifestPath) && existsSync(handoffPath) ? "frozen-awaiting-independent-reviews" : "unfrozen",
    execution_authorized: false, formal_run_id: V3_RUN_ID, fixture_run_id: fixtureRunId,
    runtime_v5: expected.runtimeV5, pg_spec: expected.pgSpec, resource_authority: expected.resourceAuthority };
}

export function executePreflightV3() {
  const evidenceRoot = resolve(research, `b2c-000197-v3-preflight-evidence-${V3_RUN_ID}`);
  return executeWithEvidenceV3({ evidenceRoot, operation: (recorder) => {
    assertMigrationInput();
    const targets = V3_TARGETS.map((target) => {
      const identity = inspectTarget(recorder, target);
      const state = snapshot(recorder, target, `preflight-${target.key}`);
      assertAbsent(state, target);
      return { key: target.key, topology: target.topology, identity, state };
    });
    return { execution_authorized: false, read_only: true, formal_run_id: V3_RUN_ID, targets };
  }, successPayload: (result) => ({ scope: "c-and-d-read-only-preflight", final_current: false,
    resources_retained: ["c", "d"], result }) });
}

export function executeFormalV3() {
  if (process.env.B2C_000197_PRELIMINARY_V3_RUN_ID !== V3_RUN_ID) throw new Error("b2c-000197-v3-run-id-drift");
  const evidenceRoot = resolve(research, `b2c-000197-formal-evidence-${V3_RUN_ID}`);
  return executeWithEvidenceV3({ evidenceRoot, operation: (recorder) => {
    assertMigrationInput();
    const authority = authorities();
    for (const [stage, testPath, count] of [
      ["static-v3-evidence", "scripts/e2e/property-remediation/tests/b2c-000197-preliminary-executor-v3.spec.mjs", 11],
      ["static-v3-orchestrator", "scripts/e2e/property-remediation/tests/b2c-000197-preliminary-orchestrator-v3.spec.mjs", 8],
      ["static-v3-history", "scripts/e2e/property-remediation/tests/b2c-approval-index-forward-fix.spec.mjs", 8],
    ]) recorder.runChild({ stage, command: process.execPath, args: [testPath], cwd: root,
      env: childEnv(), envAllowlist: safeEnv(), tapParser: (stdout) => parseNodeTap(stdout, count) });
    const preflight = V3_TARGETS.map((target) => { const identity = inspectTarget(recorder, target);
      const state = snapshot(recorder, target, `preflight-${target.key}`); assertAbsent(state, target);
      return { identity, state }; });
    const results = V3_TARGETS.map((target) => ({ target, migration: applyTarget(recorder, target),
      predicate: predicateMatrix(recorder, target), failures: failureInjections(recorder, target),
      final: snapshot(recorder, target, `final-${target.key}`) }));
    const approval = approvalGate(recorder, V3_TARGETS[0]);
    return { authority, preflight, results, approval };
  }, successPayload: (result) => ({ scope: "absent-path-c-and-d-preliminary-only", final_current: false,
    resources_retained: ["c", "d"], result }) });
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(new URL(import.meta.url))) {
  if (process.env.B2C_000197_V3_PREFLIGHT === "1") {
    const result = executePreflightV3(); process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else if (process.env.B2C_000197_PRELIMINARY_V3_EXECUTE === "1") {
    const result = executeFormalV3(); process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else process.stdout.write(`${JSON.stringify(staticV3Candidate(), null, 2)}\n`);
}
