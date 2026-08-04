import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { URL, fileURLToPath } from "node:url";
import process from "node:process";
import {
  PhaseExecutionErrorV4, V4_RUN_ID, executeWithEvidenceV4, parseTapSummaryV4, runPhasedGateV4,
} from "./track-b2c-000197-preliminary-executor-v4.mjs";
import { failureInjectionCases } from "./track-b2c-000197-preliminary-executor.mjs";

const require = createRequire(import.meta.url);
const tapGate = require("./track-b2c-approval-port-pg-gate-lib.cjs");
const { APPROVAL_PORT_PG_REQUIRED_TEST_NAMES, parseTapSummary } = tapGate;
const root = process.cwd();
const apiRoot = resolve(root, "apps/api");
const research = resolve(root, ".trellis/tasks/07-30-pr192-b-domain-integrations/research");
const migrationFilename = "000197_property_approval_active_source_index_forward_fix.sql";
const migrationPath = resolve(root, "database/migrations", migrationFilename);
const resourceAuthorityPath = resolve(research, "b2c-000197-preliminary-v3-resource-authority-20260802.grammar");
const manifestPath = resolve(research, "b2c-000197-preliminary-v4-input-manifest-20260802.grammar");
const handoffPath = resolve(research, "b2c-000197-preliminary-executor-v4-review-handoff-20260802.md");
const approvalV8Handoff = resolve(research, "b2c-approval-port-runtime-implementation-v8-handoff.md");
const fixtureRunId = "1e8dc65d5145b78cf447ef661f517ad2";
const expected = Object.freeze({
  migration: "a9b98ca82aa4dafc16535085184df838880ef27801f7cd4b225e1ca1a15af059",
  resourceAuthority: "3c2c91ca18c6639c9d3306ececf06d2b43b3b74c06a870a5c786d08616ab8c73",
  runtimeV8: "022d992f6f4a1c5326904dccd158e168573b0fd383186dc7db110488bfd2e118",
  approvalV8Handoff: "e79639b00cbb70085d5977c6ce77d0a3f2ae828e00dfa467dba9336b6acde0b7",
  pgSpec: "2d35ee6245aa0b81db00815a905ab393b203f48ac9ba7454208e990f35e35613",
  cli: "e805a00506a2c98c460eb73d5c69f4abfa011091f7dccfab8912e42596ce3a8e",
  cliSpec: "58b7e8c011cb2ebc4acca91d813fc86931000574b434ffdb15b8579d0f79e42b",
  helper: "b629c3c811c72084ae7ea0e7f47799db7dafc8613baeb9d13f5f550e7d969cb4",
  fixtureSpec: "d3064610524fa871b8dd47c20260a99940d60f288ee8696128c212401e0f6612",
  parser: "4f988c6879449df92c5d83ad1525447835a0e02d4fbc45db48fde56fb3dba639",
  runner: "74423d888683cc433efd4a45b0d4dd944117651e2ab4797d484e4f0d6a6a07d4",
  loaderArtifact: "ab3c631e30991bad95d9dbb50f6612103ebbc463d2ca97112686768ff85b97c4",
  loaderManifest: "788cae3c1d8a27a54db7b7a0b503f25a2d1fc23d92ce50ccacb8a75d6ee8bd14",
  preflightArtifact: "4a1fac3e4a650de79999349b1080eadb25c61030f0a0bde624ee3aa89f798779",
  preflightManifest: "d90afa62bc40115ea48d38c42a52a2f6f3925932db87a7ff4de4615cd821e811",
  oldIndexdef: "89d630118eeeab3655fffe97cde034d82567c1e253c543f9a33a7a8420768584",
  oldPredicate: "d47740fefda3dc305edc9f845c359dfae15d6d9fa1c28a096870870129563a37",
  newIndexdef: "dd004f0c2e5f40e86ec1953effa91b8604614e276c9fedabe7f2464f13d70d9c",
  newPredicate: "24ef911486d5274d6c439d63de6aa253b289241ac2b75317b1f98bc93a5a8fda",
});

export const V4_TARGETS = Object.freeze([
  { key: "c", topology: "upgrade-to-195", container: "jinhu-b2c197-prelim-20260802b-c",
    containerId: "ee68f2ef6b1c2ac5e6d653f1a2388e121b268bf3e6517402484255c1845d25c6",
    database: "jinhu_b2c197_c", volume: "60ab8a7c1dbf58421056bfd5a6f987144cfd8c7ee44c6500302478c9e0c1da12" },
  { key: "d", topology: "fresh-to-195", container: "jinhu-b2c197-prelim-20260802b-d",
    containerId: "f0d1f2d5e8508fd787e03c179596730c97371e0ebb19e1462774ebc67faae896",
    database: "jinhu_b2c197_d", volume: "7384e6ecc01752cff1fc8dd49074d4488e35e5369ceea404895a906cb4af98f5" },
]);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;
const safeEnv = (secrets = []) => [{ name: "PATH", persist: "value" },
  ...secrets.map((name) => ({ name, persist: "redacted" }))];
const childEnv = (extra = {}) => ({ PATH: process.env.PATH, ...extra });

function assertFrozenInput(path, hash) {
  if (!existsSync(path) || lstatSync(path).isSymbolicLink() || realpathSync(path) !== path
      || sha256(readFileSync(path)) !== hash) throw new Error(`b2c-000197-v4-input-drift:${path}`);
}

function assertInputs() {
  const prefix = readdirSync(resolve(root, "database/migrations")).filter((name) => name.startsWith("000197_"));
  if (prefix.length !== 1 || prefix[0] !== migrationFilename) throw new Error("b2c-000197-v4-prefix-drift");
  for (const [path, hash] of [
    [migrationPath, expected.migration], [resourceAuthorityPath, expected.resourceAuthority],
    [approvalV8Handoff, expected.approvalV8Handoff],
    [resolve(apiRoot, "src/modules/property-approvals/property-approval.port.pg.spec.ts"), expected.pgSpec],
    [resolve(apiRoot, "src/modules/property-approvals/property-approval.port.pg-cli.ts"), expected.cli],
    [resolve(apiRoot, "src/modules/property-approvals/property-approval.port.pg-cli.spec.ts"), expected.cliSpec],
    [resolve(apiRoot, "src/modules/property-approvals/property-approval.port.pg-fixture.ts"), expected.helper],
    [resolve(apiRoot, "src/modules/property-approvals/property-approval.port.pg-fixture.spec.ts"), expected.fixtureSpec],
    [resolve(root, "scripts/e2e/property-remediation/track-b2c-approval-port-pg-gate-lib.cjs"), expected.parser],
    [resolve(root, "scripts/e2e/property-remediation/track-b2c-approval-port-pg-gate.mjs"), expected.runner],
    [resolve(research, `b2c-000197-r0-loader-evidence-b2c197_prelim_20260802b/success-b2c197_prelim_20260802b.json`), expected.loaderArtifact],
    [resolve(research, `b2c-000197-r0-loader-evidence-b2c197_prelim_20260802b/success-b2c197_prelim_20260802b.manifest.json`), expected.loaderManifest],
    [resolve(research, `b2c-000197-v4-preflight-evidence-${V4_RUN_ID}/success-${V4_RUN_ID}.json`), expected.preflightArtifact],
    [resolve(research, `b2c-000197-v4-preflight-evidence-${V4_RUN_ID}/success-${V4_RUN_ID}.manifest.json`), expected.preflightManifest],
  ]) assertFrozenInput(path, hash);
}

function psql(recorder, target, stage, sql, options = {}) {
  return recorder.runChild({ stage, command: "docker", args: ["exec", "-i", target.container,
    "psql", "-X", "-qAt", "-F", "\t", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", target.database],
  cwd: root, env: childEnv(), envAllowlist: safeEnv(), input: `\\set VERBOSITY verbose\n${sql}`,
  allowFailure: options.allowFailure ?? false, parser: options.parser ?? null });
}

function jsonOutput(stdout) { return JSON.parse(stdout.trim()); }

function inspectTarget(recorder, target) {
  const format = "{{.Id}}|{{.Name}}|{{.Config.Image}}|{{.Image}}|{{.State.Running}}|{{range .Mounts}}{{.Type}}:{{.Name}}:{{.Destination}}{{end}}";
  const identity = recorder.runChild({ stage: `inspect-${target.key}`, command: "docker",
    args: ["inspect", "--format", format, target.container], cwd: root, env: childEnv(), envAllowlist: safeEnv() })
    .stdout.toString("utf8").trim();
  const exact = `${target.containerId}|/${target.container}|postgres:16-alpine|sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777|true|volume:${target.volume}:/var/lib/postgresql/data`;
  if (identity !== exact) throw new Error(`b2c-000197-v4-resource-drift:${target.key}`);
  return identity;
}

function snapshot(recorder, target, stage) {
  return jsonOutput(psql(recorder, target, stage, `SELECT json_build_object(
    'history_primary',(SELECT json_agg(row_to_json(x) ORDER BY filename) FROM
      (SELECT filename,checksum,status FROM public.sys_schema_migration_history WHERE filename LIKE '000197\\_%' ESCAPE '\\')x),
    'history_mirror',(SELECT json_agg(row_to_json(x) ORDER BY filename) FROM
      (SELECT filename,checksum,status FROM public.schema_migrations WHERE filename LIKE '000197\\_%' ESCAPE '\\')x),
    'approval_rows',(SELECT count(*) FROM public.biz_property_approval_request),
    'indexdef',encode(public.digest(convert_to(pg_get_indexdef(i.indexrelid),'UTF8'),'sha256'),'hex'),
    'predicate',encode(public.digest(convert_to(pg_get_expr(i.indpred,i.indrelid,false),'UTF8'),'sha256'),'hex'),
    'build_residue',to_regclass('public.uq_biz_property_approval_request_active_source_v2_build') IS NOT NULL)
    FROM pg_index i WHERE i.indexrelid='public.uq_biz_property_approval_request_active_source'::regclass;`).stdout.toString("utf8"));
}

export function assertAbsentV4(value, target = { key: "unknown" }) {
  if (value.history_primary !== null || value.history_mirror !== null || value.approval_rows !== 0
      || value.indexdef !== expected.oldIndexdef || value.predicate !== expected.oldPredicate
      || value.build_residue !== false) throw new Error(`b2c-000197-v4-not-dual-absent-empty:${target.key}`);
  return value;
}

function writeHistory(recorder, target, status, error = null) {
  psql(recorder, target, `history-${target.key}-${status}`, `BEGIN;
    INSERT INTO public.sys_schema_migration_history(filename,checksum,status,started_at,finished_at,error_message,executed_by,batch_id)
    VALUES (${literal(migrationFilename)},${literal(expected.migration)},${literal(status)},clock_timestamp(),
      ${status === "running" ? "NULL" : "clock_timestamp()"},${error ? literal(error.slice(0, 500)) : "NULL"},
      'b2c-000197-v4-executor','${V4_RUN_ID}')
    ON CONFLICT(filename) DO UPDATE SET checksum=EXCLUDED.checksum,status=EXCLUDED.status,
      finished_at=EXCLUDED.finished_at,error_message=EXCLUDED.error_message,updated_at=clock_timestamp();
    INSERT INTO public.schema_migrations(filename,checksum,status,started_at,finished_at,error_message,executed_by,batch_id)
    SELECT filename,checksum,status,started_at,finished_at,error_message,executed_by,batch_id
      FROM public.sys_schema_migration_history WHERE filename=${literal(migrationFilename)}
    ON CONFLICT(filename) DO UPDATE SET checksum=EXCLUDED.checksum,status=EXCLUDED.status,
      finished_at=EXCLUDED.finished_at,error_message=EXCLUDED.error_message,updated_at=clock_timestamp(); COMMIT;`);
}

function applyTarget(recorder, target) {
  const before = snapshot(recorder, target, `snapshot-${target.key}-before`); assertAbsentV4(before, target);
  writeHistory(recorder, target, "running");
  const applied = psql(recorder, target, `migration-${target.key}`, readFileSync(migrationPath), { allowFailure: true });
  if (applied.status !== 0 || applied.signal || applied.error) {
    writeHistory(recorder, target, "failed", `${applied.stdout}${applied.stderr}`);
    throw new PhaseExecutionErrorV4(`migration-${target.key}`, applied);
  }
  writeHistory(recorder, target, "succeeded");
  const after = snapshot(recorder, target, `snapshot-${target.key}-after`);
  if (after.approval_rows !== before.approval_rows || after.indexdef !== expected.newIndexdef
      || after.predicate !== expected.newPredicate || after.build_residue) throw new Error(`b2c-000197-v4-post-drift:${target.key}`);
  psql(recorder, target, `rerun-${target.key}`, readFileSync(migrationPath));
  const rerun = snapshot(recorder, target, `snapshot-${target.key}-rerun`);
  if (JSON.stringify(after) !== JSON.stringify(rerun)) throw new Error(`b2c-000197-v4-rerun-drift:${target.key}`);
  return { before, after, rerun_exact: true };
}

function failureInjections(recorder, target) {
  return failureInjectionCases().map(({ name, boundary, prefix, assertion }) => {
    const before = snapshot(recorder, target, `fault-${target.key}-${name}-before`);
    const marker = `b2c-000197-v4-injected-${name}`;
    const result = psql(recorder, target, `fault-${target.key}-${name}`, `BEGIN;
      LOCK TABLE public.biz_property_approval_request IN SHARE MODE; ${prefix} ${assertion}
      DO $fault$ BEGIN RAISE EXCEPTION '${marker}' USING ERRCODE='P0001'; END $fault$;`, { allowFailure: true });
    const after = snapshot(recorder, target, `fault-${target.key}-${name}-after`);
    if (result.status === 0 || !`${result.stdout}${result.stderr}`.includes(marker)
        || JSON.stringify(before) !== JSON.stringify(after) || after.build_residue) {
      throw new Error(`b2c-000197-v4-fault-drift:${target.key}:${name}`);
    }
    return { name, boundary, rollback_exact: true };
  });
}

function predicateMatrix(recorder, target) {
  const result = jsonOutput(psql(recorder, target, `predicate-matrix-${target.key}`, `WITH cases(decision_status,execution_status) AS (VALUES
    ('draft','not_started'),('submitted','not_started'),('pending_approval','not_started'),
    ('approved','not_started'),('approved','executing'),('approved','retry_wait'),('approved','infra_exhausted'),
    ('approved','executed'),('approved','execution_failed'),('rejected','not_required'),
    ('withdrawn','not_required'),('expired','not_required'))
  SELECT json_build_object('active',count(*) FILTER (WHERE decision_status IN ('draft','submitted','pending_approval') OR
    (decision_status='approved' AND execution_status IN ('not_started','executing','retry_wait','infra_exhausted'))),
    'terminal',count(*) FILTER (WHERE (decision_status='approved' AND execution_status IN ('executed','execution_failed'))
    OR (decision_status IN ('rejected','withdrawn','expired') AND execution_status='not_required')),'total',count(*)) FROM cases;`).stdout.toString("utf8"));
  if (result.active !== 7 || result.terminal !== 5 || result.total !== 12) throw new Error("b2c-000197-v4-matrix-drift");
  return result;
}

function zeroResidueParser(stdout) {
  const value = jsonOutput(stdout);
  if (Object.values(value).some((count) => count !== 0)) throw new Error(`b2c-000197-v4-approval-residue:${JSON.stringify(value)}`);
  return value;
}

function approvalAfterPhase(target) {
  const prefix = `b2c_ap_${fixtureRunId}`;
  const sql = `SELECT json_build_object(
    'relations',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='${prefix}_sentinel'),
    'functions',(SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='${prefix}_fault'),
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
    'sessions',(SELECT count(*) FROM pg_stat_activity WHERE application_name LIKE '${prefix}%'));`;
  return { stage: "approval-after", command: "docker", args: ["exec", "-i", target.container,
    "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", target.database],
  cwd: root, env: childEnv(), envAllowlist: safeEnv(), input: sql, parser: zeroResidueParser };
}

function approvalPhases(recorder, target) {
  const inspect = recorder.runChild({ stage: "approval-secret-discovery", command: "docker",
    args: ["inspect", "--format", "{{range .Config.Env}}{{println .}}{{end}}|{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}", target.container],
    cwd: root, env: childEnv(), envAllowlist: safeEnv() }).stdout.toString("utf8");
  const password = inspect.match(/^POSTGRES_PASSWORD=(.*)$/mu)?.[1];
  const ip = inspect.slice(inspect.lastIndexOf("|") + 1).trim();
  if (!password || !ip) throw new Error("b2c-000197-v4-approval-secret-or-ip-missing");
  const env = childEnv({ PROPERTY_APPROVAL_PORT_PG_URL: `postgresql://postgres:${password}@${ip}:5432/${target.database}`,
    PROPERTY_APPROVAL_PORT_PG_RUN_ID: fixtureRunId });
  const allowed = [...safeEnv(["PROPERTY_APPROVAL_PORT_PG_URL"]),
    { name: "PROPERTY_APPROVAL_PORT_PG_RUN_ID", persist: "value" }];
  const cli = ["--require", "ts-node/register", "src/modules/property-approvals/property-approval.port.pg-cli.ts"];
  const phases = [
    { stage: "approval-compile", command: "pnpm", args: ["typecheck"], cwd: apiRoot,
      env: childEnv(), envAllowlist: safeEnv() },
    { stage: "approval-connect", command: process.execPath, args: [...cli, "probe"], cwd: apiRoot, env, envAllowlist: allowed,
      parser: (stdout) => JSON.parse(stdout.trim()) },
    { stage: "approval-setup", command: process.execPath, args: [...cli, "setup"], cwd: apiRoot, env, envAllowlist: allowed,
      parser: (stdout) => JSON.parse(stdout.trim()) },
    { stage: "approval-named-tests", command: process.execPath,
      args: ["--test-reporter=tap", "--require", "ts-node/register",
        "src/modules/property-approvals/property-approval.port.pg.spec.ts"], cwd: apiRoot,
      env: { ...env, PROPERTY_APPROVAL_PORT_PG_EXTERNAL_FIXTURE: "yes" },
      envAllowlist: [...allowed, { name: "PROPERTY_APPROVAL_PORT_PG_EXTERNAL_FIXTURE", persist: "value" }],
      parser: (stdout) => parseTapSummary(stdout, { expectedTests: 7, expectedNames: APPROVAL_PORT_PG_REQUIRED_TEST_NAMES }) },
  ];
  const cleanupPhases = [
    { stage: "approval-cleanup", command: process.execPath, args: [...cli, "cleanup"], cwd: apiRoot, env,
      envAllowlist: allowed, parser: (stdout) => JSON.parse(stdout.trim()) },
    approvalAfterPhase(target),
  ];
  return runPhasedGateV4(recorder, { phases, cleanupPhases });
}

function assertFrozenManifest() {
  assertFrozenInput(manifestPath, sha256(readFileSync(manifestPath)));
  const lines = readFileSync(manifestPath, "utf8").trimEnd().split("\n");
  if (lines.shift() !== "b2c-000197-preliminary-input-manifest-v4") throw new Error("b2c-000197-v4-manifest-schema");
  for (const line of lines.filter((entry) => entry.startsWith("file\t"))) {
    const [, relative, size, hash] = line.split("\t"); const content = readFileSync(resolve(root, relative));
    if (content.length !== Number(size) || sha256(content) !== hash) throw new Error(`b2c-000197-v4-manifest-drift:${relative}`);
  }
  return sha256(readFileSync(manifestPath));
}

function proof(pathValue, shaValue, authority) {
  const path = resolve(root, pathValue ?? ""); assertFrozenInput(path, shaValue);
  const lines = readFileSync(path, "utf8").trimEnd().split("\n");
  if (lines.shift() !== "b2c-000197-preliminary-v4-independent-review-v1") {
    throw new Error("b2c-000197-v4-proof-schema");
  }
  const fields = new Map(lines
    .map((line) => { const at = line.indexOf("\t"); return [line.slice(0, at), line.slice(at + 1)]; }));
  const required = { formal_run_id: V4_RUN_ID, manifest_raw_sha256: assertFrozenManifest(),
    handoff_raw_sha256: sha256(readFileSync(handoffPath)), resource_authority_raw_sha256: expected.resourceAuthority,
    executor_raw_sha256: sha256(readFileSync(new URL("./track-b2c-000197-preliminary-executor-v4.mjs", import.meta.url))),
    orchestrator_raw_sha256: sha256(readFileSync(new URL(import.meta.url))), reviewer_authority: authority, decision: "GO" };
  for (const [key, value] of Object.entries(required)) if (fields.get(key) !== value) throw new Error(`b2c-000197-v4-proof:${key}`);
  return Object.fromEntries(fields);
}

function authorities() {
  const db = proof(process.env.B2C_000197_V4_REVIEW_A_PATH, process.env.B2C_000197_V4_REVIEW_A_SHA,
    "independent-database-reviewer");
  const qa = proof(process.env.B2C_000197_V4_REVIEW_B_PATH, process.env.B2C_000197_V4_REVIEW_B_SHA,
    "independent-qa-security-reviewer");
  const drainPath = resolve(root, process.env.B2C_000197_V4_OLD_WRITER_DRAIN_PATH ?? "");
  assertFrozenInput(drainPath, process.env.B2C_000197_V4_OLD_WRITER_DRAIN_SHA);
  const drainLines = readFileSync(drainPath, "utf8").trimEnd().split("\n");
  if (drainLines.shift() !== "b2c-000197-old-writer-drain-v3") throw new Error("b2c-000197-v4-drain-schema");
  const drain = new Map(drainLines.map((line) => { const at = line.indexOf("\t");
    return [line.slice(0, at), line.slice(at + 1)]; }));
  for (const [key, value] of Object.entries({ formal_run_id: V4_RUN_ID,
    resource_authority_raw_sha256: expected.resourceAuthority, decision: "GO", intake: "stopped",
    in_flight_approval_create_transactions: "0", new_writer_build: "approval-port-v8" })) {
    if (drain.get(key) !== value) throw new Error(`b2c-000197-v4-drain:${key}`);
  }
  return { db, qa, drain_sha256: process.env.B2C_000197_V4_OLD_WRITER_DRAIN_SHA };
}

function formalStaticPhases(recorder) {
  for (const [stage, cwd, args, count] of [
    ["static-v4-evidence", root, ["scripts/e2e/property-remediation/tests/b2c-000197-preliminary-executor-v4.spec.mjs"], 8],
    ["static-v4-orchestrator", root, ["scripts/e2e/property-remediation/tests/b2c-000197-preliminary-orchestrator-v4.spec.mjs"], 4],
    ["static-v4-contract", root, ["scripts/e2e/property-remediation/tests/b2c-approval-index-forward-fix.spec.mjs"], 8],
    ["static-v4-approval-lifecycle", apiRoot,
      ["--require", "ts-node/register", "src/modules/property-approvals/property-approval.port.pg-cli.spec.ts"], 4],
  ]) recorder.runChild({ stage, command: process.execPath, args, cwd, env: childEnv(), envAllowlist: safeEnv(),
    parser: (stdout) => parseTapSummaryV4(stdout, { expectedTests: count }) });
}

export function executePreflightV4() {
  const evidenceRoot = resolve(research, `b2c-000197-v4-preflight-evidence-${V4_RUN_ID}`);
  return executeWithEvidenceV4({ evidenceRoot, operation: (recorder) => {
    assertInputs();
    return V4_TARGETS.map((target) => { const identity = inspectTarget(recorder, target);
      const state = snapshot(recorder, target, `preflight-${target.key}`); assertAbsentV4(state, target);
      return { key: target.key, topology: target.topology, identity, state }; });
  }, successPayload: { scope: "c-and-d-v4-read-only-preflight", execution_authorized: false,
    final_current: false, resources_retained: ["c", "d"] } });
}

export function executeFormalV4() {
  if (process.env.B2C_000197_PRELIMINARY_V4_RUN_ID !== V4_RUN_ID) throw new Error("b2c-000197-v4-run-id-drift");
  const evidenceRoot = resolve(research, `b2c-000197-formal-evidence-${V4_RUN_ID}`);
  return executeWithEvidenceV4({ evidenceRoot, operation: (recorder) => {
    assertInputs(); const authority = authorities();
    formalStaticPhases(recorder);
    const preflight = V4_TARGETS.map((target) => { const identity = inspectTarget(recorder, target);
      const state = snapshot(recorder, target, `formal-preflight-${target.key}`); assertAbsentV4(state, target);
      return { identity, state }; });
    const results = V4_TARGETS.map((target) => ({ key: target.key, migration: applyTarget(recorder, target),
      predicate: predicateMatrix(recorder, target), failures: failureInjections(recorder, target) }));
    const approval = approvalPhases(recorder, V4_TARGETS[0]);
    return { authority, preflight, results, approval };
  }, successPayload: { scope: "absent-path-c-and-d-preliminary-only", final_current: false,
    resources_retained: ["c", "d"] } });
}

export function staticV4Candidate() {
  assertInputs();
  return { status: existsSync(manifestPath) && existsSync(handoffPath)
    ? "frozen-awaiting-independent-reviews" : "unfrozen-v8-integrated",
  execution_authorized: false, formal_run_id: V4_RUN_ID, fixture_run_id: fixtureRunId,
  manifest_frozen: existsSync(manifestPath) && existsSync(handoffPath), live_execution: false,
  runtime_v8: expected.runtimeV8, pg_spec: expected.pgSpec, cli: expected.cli,
  resource_authority: expected.resourceAuthority };
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? "")) {
  if (process.env.B2C_000197_V4_PREFLIGHT === "1") {
    process.stdout.write(`${JSON.stringify(executePreflightV4(), null, 2)}\n`);
  } else if (process.env.B2C_000197_PRELIMINARY_V4_EXECUTE === "1") {
    process.stdout.write(`${JSON.stringify(executeFormalV4(), null, 2)}\n`);
  } else process.stdout.write(`${JSON.stringify(staticV4Candidate(), null, 2)}\n`);
}
