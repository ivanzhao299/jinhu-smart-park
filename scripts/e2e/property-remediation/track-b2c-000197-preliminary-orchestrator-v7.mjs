import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { URL, fileURLToPath } from "node:url";
import process from "node:process";
import {
  PhaseExecutionErrorV7, V7_RUN_ID, executeWithEvidenceV7, parseTapSummaryV7, runPhasedGateV7,
} from "./track-b2c-000197-preliminary-executor-v7.mjs";
import { failureInjectionCasesV7 } from "./track-b2c-000197-failure-cases-v7.mjs";

const require = createRequire(import.meta.url);
const tapGate = require("./track-b2c-approval-port-pg-gate-lib.cjs");
const root = process.cwd(); const apiRoot = resolve(root, "apps/api");
const research = resolve(root, ".trellis/tasks/07-30-pr192-b-domain-integrations/research");
const migrationFilename = "000197_property_approval_active_source_index_forward_fix.sql";
const migrationPath = resolve(root, "database/migrations", migrationFilename);
const manifestPath = resolve(research, "b2c-000197-preliminary-v7-input-manifest-20260802.grammar");
const handoffPath = resolve(research, "b2c-000197-preliminary-executor-v7-review-handoff-20260802.md");
const fixtureRunId = "4fce75ade89881fb1079f88f3a1e46ab";
const expected = Object.freeze({ migration: "a9b98ca82aa4dafc16535085184df838880ef27801f7cd4b225e1ca1a15af059",
  r0: "705882718458b69bf76478ebd071316031782dfe1c9485674f211655715f1439",
  r1: "244a9eca21442ecbec916c962956fa5f2e807bc53d9d70704102070e76ca3f6b",
  preflightRunner: "ffc2c21e91959848dacea5dd7eb873e966fc7304a69b78d2742c3a18e444379c",
  contractSpec: "400bb607632724f128fe3e4016111eaffc8a8702b40d3a49e772052f6b918170",
  resource: "3c2c91ca18c6639c9d3306ececf06d2b43b3b74c06a870a5c786d08616ab8c73",
  runtime: "022d992f6f4a1c5326904dccd158e168573b0fd383186dc7db110488bfd2e118",
  handoff: "e79639b00cbb70085d5977c6ce77d0a3f2ae828e00dfa467dba9336b6acde0b7",
  pgSpec: "2d35ee6245aa0b81db00815a905ab393b203f48ac9ba7454208e990f35e35613",
  cli: "e805a00506a2c98c460eb73d5c69f4abfa011091f7dccfab8912e42596ce3a8e",
  cliSpec: "58b7e8c011cb2ebc4acca91d813fc86931000574b434ffdb15b8579d0f79e42b",
  helper: "b629c3c811c72084ae7ea0e7f47799db7dafc8613baeb9d13f5f550e7d969cb4",
  fixtureSpec: "d3064610524fa871b8dd47c20260a99940d60f288ee8696128c212401e0f6612",
  parser: "4f988c6879449df92c5d83ad1525447835a0e02d4fbc45db48fde56fb3dba639",
  runner: "74423d888683cc433efd4a45b0d4dd944117651e2ab4797d484e4f0d6a6a07d4",
  loaderArtifact: "ab3c631e30991bad95d9dbb50f6612103ebbc463d2ca97112686768ff85b97c4",
  loaderManifest: "788cae3c1d8a27a54db7b7a0b503f25a2d1fc23d92ce50ccacb8a75d6ee8bd14",
  preflightArtifact: "096c841a0d5ad40c7eb7757a4307016003f279e65160208c7ff63a405fc4f908",
  preflightManifest: "8ea527547bc23e0cf8a231ec50b56e82d5792bb70811745ecc0e277bdb21eb69",
  oldIndex: "89d630118eeeab3655fffe97cde034d82567c1e253c543f9a33a7a8420768584",
  oldPredicate: "d47740fefda3dc305edc9f845c359dfae15d6d9fa1c28a096870870129563a37",
  newIndex: "dd004f0c2e5f40e86ec1953effa91b8604614e276c9fedabe7f2464f13d70d9c",
  newPredicate: "24ef911486d5274d6c439d63de6aa253b289241ac2b75317b1f98bc93a5a8fda" });

const EXTERNAL_INPUTS_V7 = Object.freeze([
  ["database/migrations/000197_property_approval_active_source_index_forward_fix.sql", expected.migration],
  [".trellis/tasks/07-30-pr192-b-domain-integrations/research/b2c-000197-r0-reservation-candidate-20260802.grammar", expected.r0],
  [".trellis/tasks/07-30-pr192-b-domain-integrations/research/b2c-000197-r1-v2-checksum-seal-20260802.grammar", expected.r1],
  ["scripts/e2e/property-remediation/track-b2c-approval-index-forward-fix-gate.mjs", expected.preflightRunner],
  ["scripts/e2e/property-remediation/tests/b2c-approval-index-forward-fix.spec.mjs", expected.contractSpec],
  [".trellis/tasks/07-30-pr192-b-domain-integrations/research/b2c-000197-preliminary-v3-resource-authority-20260802.grammar", expected.resource],
  [".trellis/tasks/07-30-pr192-b-domain-integrations/research/b2c-000197-r0-loader-evidence-b2c197_prelim_20260802b/success-b2c197_prelim_20260802b.json", expected.loaderArtifact],
  [".trellis/tasks/07-30-pr192-b-domain-integrations/research/b2c-000197-r0-loader-evidence-b2c197_prelim_20260802b/success-b2c197_prelim_20260802b.manifest.json", expected.loaderManifest],
  [".trellis/tasks/07-30-pr192-b-domain-integrations/research/b2c-000197-v7-complete-preflight-evidence-b2c197_prelim_20260802c/success-b2c197_prelim_20260802c.json", expected.preflightArtifact],
  [".trellis/tasks/07-30-pr192-b-domain-integrations/research/b2c-000197-v7-complete-preflight-evidence-b2c197_prelim_20260802c/success-b2c197_prelim_20260802c.manifest.json", expected.preflightManifest],
  [".trellis/tasks/07-30-pr192-b-domain-integrations/research/b2c-approval-port-runtime-implementation-v8-handoff.md", expected.handoff],
  ["apps/api/src/modules/property-approvals/property-approval.module.spec.ts", "fd3dc1a3daeb458d5b4fd770f88c7090cc43395a1ec29d24347161d3996bd252"],
  ["apps/api/src/modules/property-approvals/property-approval.module.ts", "495064a3df410cdb19c3f27cf7f54a40f866bd87e60ecd937862b3a22ff26646"],
  ["apps/api/src/modules/property-approvals/property-approval.port.pg-cli.spec.ts", expected.cliSpec],
  ["apps/api/src/modules/property-approvals/property-approval.port.pg-cli.ts", expected.cli],
  ["apps/api/src/modules/property-approvals/property-approval.port.pg-fixture.spec.ts", expected.fixtureSpec],
  ["apps/api/src/modules/property-approvals/property-approval.port.pg-fixture.ts", expected.helper],
  ["apps/api/src/modules/property-approvals/property-approval.port.pg.spec.ts", expected.pgSpec],
  ["apps/api/src/modules/property-approvals/property-approval.port.spec.ts", "a4cb80cbdef351bc072e67e9eb973949aac89648ef841cc726ad18418c0b9b2f"],
  ["apps/api/src/modules/property-approvals/property-approval.repository.spec.ts", "e1967eed9e59865fa068e1964a48b9d1cbfb987cef2612b367fe73c4c1f1476f"],
  ["apps/api/src/modules/property-approvals/property-approval.repository.ts", "be882ce7eb7d1bfba78af3b6920c7473b4cf60fbf13cad6bbbf09adb4d2f5199"],
  ["apps/api/src/modules/property-approvals/property-approval.request.spec.ts", "d2b39f8192382c508542a8b52bef222edc507a481c00ade9a9220644eea7be4e"],
  ["apps/api/src/modules/property-approvals/property-approval.service.ts", "1d6dc2dc150745ca6168402a93592b310b3e85eb820cdd622b4167958ec4a93c"],
  ["scripts/e2e/property-remediation/track-b2c-approval-port-pg-gate-lib.cjs", expected.parser],
  ["scripts/e2e/property-remediation/track-b2c-approval-port-pg-gate.mjs", expected.runner],
]);
export const AUTHORITATIVE_FILE_PATHS_V7 = Object.freeze([
  ...EXTERNAL_INPUTS_V7.map(([path]) => path),
  "scripts/e2e/property-remediation/track-b2c-000197-failure-cases-v7.mjs",
  "scripts/e2e/property-remediation/track-b2c-000197-preliminary-executor-v7.mjs",
  "scripts/e2e/property-remediation/track-b2c-000197-preliminary-orchestrator-v7.mjs",
  "scripts/e2e/property-remediation/tests/b2c-000197-preliminary-executor-v7.spec.mjs",
  "scripts/e2e/property-remediation/tests/b2c-000197-preliminary-orchestrator-v7.spec.mjs",
  "scripts/e2e/property-remediation/tests/b2c-000197-capability-closure-v7.spec.mjs",
  "scripts/e2e/property-remediation/tests/b2c-000197-frozen-closure-v7.spec.mjs",
]);

export const V7_TARGETS = Object.freeze([
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
const safeEnv = (secret = []) => [{ name: "PATH", persist: "value" },
  ...secret.map((name) => ({ name, persist: "redacted" }))];

function exact(path, hash) {
  if (!existsSync(path) || lstatSync(path).isSymbolicLink() || realpathSync(path) !== path
      || sha256(readFileSync(path)) !== hash) throw new Error(`b2c-000197-v7-input-drift:${path}`);
}

function inputs() {
  const prefix = readdirSync(resolve(root, "database/migrations")).filter((name) => name.startsWith("000197_"));
  if (prefix.length !== 1 || prefix[0] !== migrationFilename) throw new Error("b2c-000197-v7-prefix-drift");
  for (const [path, hash] of EXTERNAL_INPUTS_V7) exact(resolve(root, path), hash);
}

function psql(recorder, target, stage, sql, options = {}) {
  return recorder.runChild({ stage, command: "docker", args: ["exec", "-i", target.container, "psql", "-X", "-qAt",
    "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", target.database], cwd: root, env: childEnv(),
  envAllowlist: safeEnv(), input: `\\set VERBOSITY verbose\n${sql}`, allowFailure: options.allowFailure ?? false,
  parser: options.parser ?? null });
}
const json = (stdout) => JSON.parse(stdout.trim());

function inspect(recorder, target) {
  const format = "{{.Id}}|{{.Name}}|{{.Config.Image}}|{{.Image}}|{{.State.Running}}|{{range .Mounts}}{{.Type}}:{{.Name}}:{{.Destination}}{{end}}";
  const value = recorder.runChild({ stage: `inspect-${target.key}`, command: "docker", args: ["inspect", "--format", format,
    target.container], cwd: root, env: childEnv(), envAllowlist: safeEnv() }).stdout.toString("utf8").trim();
  const wanted = `${target.containerId}|/${target.container}|postgres:16-alpine|sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777|true|volume:${target.volume}:/var/lib/postgresql/data`;
  if (value !== wanted) throw new Error(`b2c-000197-v7-resource:${target.key}`);
  return value;
}

function inspectNoHostPorts(recorder, target) {
  const value = recorder.runChild({ stage: `inspect-noports-${target.key}`, command: "docker",
    args: ["inspect", "--format", "{{json .HostConfig.PortBindings}}|{{json .NetworkSettings.Ports}}", target.container],
    cwd: root, env: childEnv(), envAllowlist: safeEnv() }).stdout.toString("utf8").trim();
  if (value !== '{}|{"5432/tcp":null}') throw new Error(`b2c-000197-v7-host-ports:${target.key}`);
  return { host_port_bindings: 0, exposed_internal_postgres: true };
}

function preflightHealth(recorder, target) {
  const value = json(psql(recorder, target, `preflight-health-${target.key}`, `SELECT json_build_object(
    'prefix_191',(SELECT count(*) FROM public.sys_schema_migration_history WHERE filename LIKE '000191\\_%' ESCAPE '\\'),
    'prefix_192',(SELECT count(*) FROM public.sys_schema_migration_history WHERE filename LIKE '000192\\_%' ESCAPE '\\'),
    'prefix_197',(SELECT count(*) FROM public.sys_schema_migration_history WHERE filename LIKE '000197\\_%' ESCAPE '\\'),
    'mirror_prefix_191',(SELECT count(*) FROM public.schema_migrations WHERE filename LIKE '000191\\_%' ESCAPE '\\'),
    'mirror_prefix_192',(SELECT count(*) FROM public.schema_migrations WHERE filename LIKE '000192\\_%' ESCAPE '\\'),
    'mirror_prefix_197',(SELECT count(*) FROM public.schema_migrations WHERE filename LIKE '000197\\_%' ESCAPE '\\'),
    'failed_or_running',(SELECT count(*) FROM public.sys_schema_migration_history WHERE status IN ('running','failed')),
    'mirror_failed_or_running',(SELECT count(*) FROM public.schema_migrations WHERE status IN ('running','failed')),
    'other_client_connections',(SELECT count(*) FROM pg_stat_activity WHERE datname=current_database()
      AND backend_type='client backend' AND pid<>pg_backend_pid()),
    'other_open_transactions',(SELECT count(*) FROM pg_stat_activity WHERE datname=current_database()
      AND backend_type='client backend' AND pid<>pg_backend_pid() AND xact_start IS NOT NULL),
    'approval_create_writers',(SELECT count(*) FROM pg_stat_activity WHERE datname=current_database()
      AND backend_type='client backend' AND pid<>pg_backend_pid() AND state<>'idle'
      AND query ~* 'insert[[:space:]]+into[[:space:]]+(public[.])?biz_property_approval_request'));`).stdout.toString("utf8"));
  for (const [name, count] of Object.entries(value)) {
    if (count !== 0) throw new Error(`b2c-000197-v7-preflight-health:${target.key}:${name}:${count}`);
  }
  return value;
}

function snapshot(recorder, target, stage) {
  return json(psql(recorder, target, stage, `SELECT json_build_object(
    'history_primary',(SELECT json_agg(row_to_json(x) ORDER BY filename) FROM (SELECT filename,checksum,status FROM
      public.sys_schema_migration_history WHERE filename LIKE '000197\\_%' ESCAPE '\\')x),
    'history_mirror',(SELECT json_agg(row_to_json(x) ORDER BY filename) FROM (SELECT filename,checksum,status FROM
      public.schema_migrations WHERE filename LIKE '000197\\_%' ESCAPE '\\')x),
    'approval_rows',(SELECT count(*) FROM public.biz_property_approval_request),
    'indexdef',encode(public.digest(convert_to(pg_get_indexdef(i.indexrelid),'UTF8'),'sha256'),'hex'),
    'predicate',encode(public.digest(convert_to(pg_get_expr(i.indpred,i.indrelid,false),'UTF8'),'sha256'),'hex'),
    'build_residue',to_regclass('public.uq_biz_property_approval_request_active_source_v2_build') IS NOT NULL)
    FROM pg_index i WHERE i.indexrelid='public.uq_biz_property_approval_request_active_source'::regclass;`).stdout.toString("utf8"));
}

export function assertAbsentV7(value, target = { key: "unknown" }) {
  if (value.history_primary !== null || value.history_mirror !== null || value.approval_rows !== 0
      || value.indexdef !== expected.oldIndex || value.predicate !== expected.oldPredicate || value.build_residue !== false) {
    throw new Error(`b2c-000197-v7-not-dual-absent-empty:${target.key}`);
  }
  return value;
}

function history(recorder, target, status, error = null) {
  psql(recorder, target, `history-${target.key}-${status}`, `BEGIN;
    INSERT INTO public.sys_schema_migration_history(filename,checksum,status,started_at,finished_at,error_message,executed_by,batch_id)
    VALUES (${literal(migrationFilename)},${literal(expected.migration)},${literal(status)},clock_timestamp(),
      ${status === "running" ? "NULL" : "clock_timestamp()"},${error ? literal(error.slice(0, 500)) : "NULL"},
      'b2c-000197-v7-executor','${V7_RUN_ID}') ON CONFLICT(filename) DO UPDATE SET checksum=EXCLUDED.checksum,
      status=EXCLUDED.status,finished_at=EXCLUDED.finished_at,error_message=EXCLUDED.error_message,updated_at=clock_timestamp();
    INSERT INTO public.schema_migrations(filename,checksum,status,started_at,finished_at,error_message,executed_by,batch_id)
      SELECT filename,checksum,status,started_at,finished_at,error_message,executed_by,batch_id
      FROM public.sys_schema_migration_history WHERE filename=${literal(migrationFilename)}
      ON CONFLICT(filename) DO UPDATE SET checksum=EXCLUDED.checksum,status=EXCLUDED.status,
      finished_at=EXCLUDED.finished_at,error_message=EXCLUDED.error_message,updated_at=clock_timestamp(); COMMIT;`);
}

function migrate(recorder, target) {
  const before = snapshot(recorder, target, `before-${target.key}`); assertAbsentV7(before, target); history(recorder, target, "running");
  const result = psql(recorder, target, `migration-${target.key}`, readFileSync(migrationPath), { allowFailure: true });
  if (result.status !== 0 || result.signal || result.error) {
    history(recorder, target, "failed", `${result.stdout}${result.stderr}`); throw new PhaseExecutionErrorV7(`migration-${target.key}`, result);
  }
  history(recorder, target, "succeeded"); const after = snapshot(recorder, target, `after-${target.key}`);
  if (after.approval_rows !== 0 || after.indexdef !== expected.newIndex || after.predicate !== expected.newPredicate
      || after.build_residue) throw new Error(`b2c-000197-v7-post-drift:${target.key}`);
  psql(recorder, target, `rerun-${target.key}`, readFileSync(migrationPath));
  const rerun = snapshot(recorder, target, `rerun-state-${target.key}`);
  if (JSON.stringify(after) !== JSON.stringify(rerun)) throw new Error(`b2c-000197-v7-rerun:${target.key}`);
  return { before, after, rerun_exact: true };
}

function faults(recorder, target) {
  return failureInjectionCasesV7().map(({ name, boundary, prefix, assertion }) => {
    const before = snapshot(recorder, target, `fault-${target.key}-${name}-before`); const marker = `v7-injected-${name}`;
    const result = psql(recorder, target, `fault-${target.key}-${name}`, `BEGIN; LOCK TABLE public.biz_property_approval_request
      IN SHARE MODE; ${prefix} ${assertion} DO $fault$ BEGIN RAISE EXCEPTION '${marker}' USING ERRCODE='P0001'; END $fault$;`,
    { allowFailure: true });
    const after = snapshot(recorder, target, `fault-${target.key}-${name}-after`);
    if (result.status === 0 || !`${result.stdout}${result.stderr}`.includes(marker)
        || JSON.stringify(before) !== JSON.stringify(after)) throw new Error(`b2c-000197-v7-fault:${name}`);
    return { name, boundary, rollback_exact: true };
  });
}

function approvalRow(values) {
  return `(uuid_generate_v4(),${literal(values.tenant)},${literal(values.park)},'property.mode-transition.request',
    'property-unit',${values.source},1,uuid_generate_v4(),uuid_generate_v4(),${literal(values.client)},
    ${literal(values.intent)},'{}'::jsonb,1,repeat('a',64),NULL,NULL,uuid_generate_v4(),1,repeat('b',64),
    ${literal(values.decision)},${literal(values.execution)},1,1,${literal(values.executionKey)},0,
    ${values.claim ?? "NULL"},${values.worker ?? "NULL"},${values.lease ?? "NULL"},${values.heartbeat ?? "NULL"},
    0,${values.retry ?? "NULL"},false,${values.errorCategory ?? "NULL"},${values.errorCode ?? "NULL"},NULL,
    ${values.infraAt ?? "NULL"},NULL,${values.decidedAt ?? "NULL"},${values.executedAt ?? "NULL"},
    clock_timestamp(),clock_timestamp())`;
}

function predicateMatrix(recorder, target) {
  const tenant = `v7-matrix-${target.key}-${V7_RUN_ID}`; const park = "p1";
  const cases = [
    ["draft","not_started",{}], ["submitted","not_started",{}], ["pending_approval","not_started",{}],
    ["approved","not_started",{ decidedAt: "clock_timestamp()" }],
    ["approved","executing",{ decidedAt: "clock_timestamp()", claim: "uuid_generate_v4()", worker: "'w'",
      lease: "clock_timestamp()+interval '1 minute'", heartbeat: "clock_timestamp()" }],
    ["approved","retry_wait",{ decidedAt: "clock_timestamp()", retry: "clock_timestamp()+interval '1 minute'" }],
    ["approved","infra_exhausted",{ decidedAt: "clock_timestamp()", errorCategory: "'infra'", errorCode: "'E'",
      infraAt: "clock_timestamp()" }],
    ["approved","executed",{ decidedAt: "clock_timestamp()", executedAt: "clock_timestamp()" }],
    ["approved","execution_failed",{ decidedAt: "clock_timestamp()", errorCategory: "'business'", errorCode: "'E'" }],
    ["rejected","not_required",{ decidedAt: "clock_timestamp()" }], ["withdrawn","not_required",{}],
    ["expired","not_required",{}],
  ];
  const rows = cases.map(([decision, execution, extra], index) => approvalRow({ tenant, park,
    source: "uuid_generate_v4()", client: `matrix-client-${index}`, intent: `matrix-intent-${index}`,
    executionKey: `matrix-execution-${index}`, decision, execution, ...extra })).join(",\n");
  const columns = `id,tenant_id,park_id,action_id,source_type,source_id,source_expected_version,requester_id,submitter_id,
    client_idempotency_key,business_intent_key,canonical_payload,payload_schema_version,payload_hash,amount,currency,
    policy_id,policy_version,policy_hash,decision_status,execution_status,decision_version,execution_version,
    execution_idempotency_key,claim_epoch,claim_token,worker_id,lease_expires_at,heartbeat_at,attempt_count,next_retry_at,
    reconcile_required,last_error_category,last_error_code,last_error_redacted_message,infra_exhausted_at,submitted_at,
    decided_at,executed_at,created_at,updated_at`;
  const result = json(psql(recorder, target, `predicate-matrix-${target.key}`, `BEGIN;
    INSERT INTO public.biz_property_approval_request(${columns}) VALUES ${rows};
    SELECT json_build_object('active',count(*) FILTER (WHERE decision_status IN ('draft','submitted','pending_approval') OR
      (decision_status='approved' AND execution_status IN ('not_started','executing','retry_wait','infra_exhausted'))),
      'terminal',count(*) FILTER (WHERE (decision_status='approved' AND execution_status IN ('executed','execution_failed'))
      OR (decision_status IN ('rejected','withdrawn','expired') AND execution_status='not_required')),'total',count(*))
      FROM public.biz_property_approval_request WHERE tenant_id=${literal(tenant)}; ROLLBACK;`).stdout.toString("utf8"));
  if (result.active !== 7 || result.terminal !== 5 || result.total !== 12) {
    throw new Error(`b2c-000197-v7-predicate-matrix-drift:${target.key}`);
  }
  const source = "'70000000-0000-4000-8000-000000000007'::uuid";
  const activeOne = approvalRow({ tenant, park, source, client: "active-1", intent: "active-1", executionKey: "active-1",
    decision: "draft", execution: "not_started" });
  const activeTwo = approvalRow({ tenant, park, source, client: "active-2", intent: "active-2", executionKey: "active-2",
    decision: "submitted", execution: "not_started" });
  const blocked = psql(recorder, target, `predicate-active-duplicate-${target.key}`,
    `BEGIN; INSERT INTO public.biz_property_approval_request(${columns}) VALUES ${activeOne},${activeTwo}; ROLLBACK;`,
    { allowFailure: true });
  if (blocked.status === 0 || !`${blocked.stdout}${blocked.stderr}`.includes("23505")) {
    throw new Error(`b2c-000197-v7-active-duplicate-not-blocked:${target.key}`);
  }
  const terminalOne = approvalRow({ tenant, park, source, client: "terminal-1", intent: "terminal-1",
    executionKey: "terminal-1", decision: "approved", execution: "executed", decidedAt: "clock_timestamp()",
    executedAt: "clock_timestamp()" });
  const terminalTwo = approvalRow({ tenant, park, source, client: "terminal-2", intent: "terminal-2",
    executionKey: "terminal-2", decision: "approved", execution: "execution_failed", decidedAt: "clock_timestamp()",
    errorCategory: "'business'", errorCode: "'E'" });
  const terminalCount = Number(psql(recorder, target, `predicate-terminal-duplicate-${target.key}`,
    `BEGIN; INSERT INTO public.biz_property_approval_request(${columns}) VALUES ${terminalOne},${terminalTwo};
      SELECT count(*) FROM public.biz_property_approval_request WHERE tenant_id=${literal(tenant)} AND source_id=${source};
      ROLLBACK;`).stdout.toString("utf8").trim());
  if (terminalCount !== 2) throw new Error(`b2c-000197-v7-terminal-duplicate-blocked:${target.key}`);
  return { ...result, active_duplicate_sqlstate: "23505", terminal_same_source_count: terminalCount };
}

function approval(recorder, target) {
  const raw = recorder.runChild({ stage: "approval-secret-discovery", command: "docker",
    args: ["inspect", "--format", "{{range .Config.Env}}{{println .}}{{end}}|{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}",
      target.container], cwd: root, env: childEnv(), envAllowlist: safeEnv() }).stdout.toString("utf8");
  const password = raw.match(/^POSTGRES_PASSWORD=(.*)$/mu)?.[1]; const ip = raw.slice(raw.lastIndexOf("|") + 1).trim();
  if (!password || !ip) throw new Error("b2c-000197-v7-secret-ip");
  const env = childEnv({ PROPERTY_APPROVAL_PORT_PG_URL: `postgresql://postgres:${password}@${ip}:5432/${target.database}`,
    PROPERTY_APPROVAL_PORT_PG_RUN_ID: fixtureRunId });
  const allowed = [...safeEnv(["PROPERTY_APPROVAL_PORT_PG_URL"]), { name: "PROPERTY_APPROVAL_PORT_PG_RUN_ID", persist: "value" }];
  const cli = ["--require", "ts-node/register", "src/modules/property-approvals/property-approval.port.pg-cli.ts"];
  return runPhasedGateV7(recorder, { phases: [
    { stage: "approval-compile", command: "pnpm", args: ["typecheck"], cwd: apiRoot, env: childEnv(), envAllowlist: safeEnv() },
    { stage: "approval-connect", command: process.execPath, args: [...cli, "probe"], cwd: apiRoot, env, envAllowlist: allowed,
      parser: (stdout) => json(stdout) },
    { stage: "approval-setup", command: process.execPath, args: [...cli, "setup"], cwd: apiRoot, env, envAllowlist: allowed,
      parser: (stdout) => json(stdout) },
    { stage: "approval-named-tests", command: process.execPath,
      args: ["--test-reporter=tap", "--require", "ts-node/register", "src/modules/property-approvals/property-approval.port.pg.spec.ts"],
      cwd: apiRoot, env: { ...env, PROPERTY_APPROVAL_PORT_PG_EXTERNAL_FIXTURE: "yes" },
      envAllowlist: [...allowed, { name: "PROPERTY_APPROVAL_PORT_PG_EXTERNAL_FIXTURE", persist: "value" }],
      parser: (stdout) => tapGate.parseTapSummary(stdout, { expectedTests: 7,
        expectedNames: tapGate.APPROVAL_PORT_PG_REQUIRED_TEST_NAMES }) },
  ], cleanupPhases: [
    { stage: "approval-cleanup", command: process.execPath, args: [...cli, "cleanup"], cwd: apiRoot, env, envAllowlist: allowed,
      parser: (stdout) => json(stdout) },
    { stage: "approval-after", command: process.execPath, args: [...cli, "cleanup"], cwd: apiRoot, env, envAllowlist: allowed,
      parser: (stdout) => json(stdout) },
  ] });
}

function frozenManifest() {
  exact(manifestPath, sha256(readFileSync(manifestPath)));
  const lines = readFileSync(manifestPath, "utf8").trimEnd().split("\n");
  if (lines.shift() !== "b2c-000197-preliminary-input-manifest-v7") throw new Error("v7-manifest-schema");
  const rows = lines.filter((entry) => entry.startsWith("file\t"));
  const actualPaths = rows.map((line) => line.split("\t")[1]);
  if (new Set(actualPaths).size !== actualPaths.length
      || JSON.stringify([...actualPaths].sort()) !== JSON.stringify([...AUTHORITATIVE_FILE_PATHS_V7].sort())) {
    throw new Error("v7-manifest-authoritative-closure");
  }
  for (const line of rows) {
    const [, relative, size, hash] = line.split("\t"); const content = readFileSync(resolve(root, relative));
    if (content.length !== Number(size) || sha256(content) !== hash) throw new Error(`v7-manifest-drift:${relative}`);
  }
  return sha256(readFileSync(manifestPath));
}

function authorities() {
  const manifest = frozenManifest(); const handoff = sha256(readFileSync(handoffPath));
  const result = {};
  for (const [key, authority] of [["A", "independent-database-reviewer"], ["B", "independent-qa-security-reviewer"]]) {
    const path = resolve(root, process.env[`B2C_000197_V7_REVIEW_${key}_PATH`] ?? "");
    exact(path, process.env[`B2C_000197_V7_REVIEW_${key}_SHA`]);
    const lines = readFileSync(path, "utf8").trimEnd().split("\n");
    if (lines.shift() !== "b2c-000197-preliminary-v7-independent-review-v1") throw new Error("v7-review-schema");
    const fields = new Map(lines.map((line) => { const at = line.indexOf("\t"); return [line.slice(0, at), line.slice(at + 1)]; }));
    for (const [name, value] of Object.entries({ formal_run_id: V7_RUN_ID, manifest_raw_sha256: manifest,
      handoff_raw_sha256: handoff, resource_authority_raw_sha256: expected.resource,
      executor_raw_sha256: sha256(readFileSync(new URL("./track-b2c-000197-preliminary-executor-v7.mjs", import.meta.url))),
      orchestrator_raw_sha256: sha256(readFileSync(new URL(import.meta.url))), reviewer_authority: authority, decision: "GO" })) {
      if (fields.get(name) !== value) throw new Error(`v7-review:${name}`);
    }
    result[key] = Object.fromEntries(fields);
  }
  const drainPath = resolve(root, process.env.B2C_000197_V7_OLD_WRITER_DRAIN_PATH ?? "");
  exact(drainPath, process.env.B2C_000197_V7_OLD_WRITER_DRAIN_SHA);
  const drainLines = readFileSync(drainPath, "utf8").trimEnd().split("\n");
  if (drainLines.shift() !== "b2c-000197-old-writer-drain-v7") throw new Error("v7-drain-schema");
  const drain = new Map(drainLines.map((line) => { const at = line.indexOf("\t"); return [line.slice(0, at), line.slice(at + 1)]; }));
  for (const [name, value] of Object.entries({ formal_run_id: V7_RUN_ID,
    resource_authority_raw_sha256: expected.resource, decision: "GO", intake: "stopped",
    in_flight_approval_create_transactions: "0", new_writer_build: "approval-port-v8" })) {
    if (drain.get(name) !== value) throw new Error(`v7-drain:${name}`);
  }
  result.drain_sha256 = process.env.B2C_000197_V7_OLD_WRITER_DRAIN_SHA;
  return result;
}

export function formalStaticV7(recorder) {
  const frozenEnv = childEnv({ B2C_000197_V7_STATIC_MODE: "frozen" });
  const frozenAllow = [...safeEnv(), { name: "B2C_000197_V7_STATIC_MODE", persist: "value" }];
  for (const [stage, cwd, args, count, env, envAllowlist] of [
    ["static-v7-evidence", root, ["--test-reporter=tap", "scripts/e2e/property-remediation/tests/b2c-000197-preliminary-executor-v7.spec.mjs"], 8, childEnv(), safeEnv()],
    ["static-v7-orchestrator", root, ["--test-reporter=tap", "scripts/e2e/property-remediation/tests/b2c-000197-preliminary-orchestrator-v7.spec.mjs"], 4, frozenEnv, frozenAllow],
    ["static-v7-closure", root, ["--test-reporter=tap", "scripts/e2e/property-remediation/tests/b2c-000197-frozen-closure-v7.spec.mjs"], 3, childEnv(), safeEnv()],
    ["static-v7-contract", root, ["--test-reporter=tap", "scripts/e2e/property-remediation/tests/b2c-approval-index-forward-fix.spec.mjs"], 8, childEnv(), safeEnv()],
    ["static-v7-lifecycle", apiRoot, ["--test-reporter=tap", "--require", "ts-node/register",
      "src/modules/property-approvals/property-approval.port.pg-cli.spec.ts"], 4, childEnv(), safeEnv()],
  ]) recorder.runChild({ stage, command: process.execPath, args, cwd, env, envAllowlist,
    parser: (stdout) => parseTapSummaryV7(stdout, { expectedTests: count }) });
}

export function staticV7Candidate({ mode = "auto" } = {}) {
  inputs(); const frozen = existsSync(manifestPath) && existsSync(handoffPath);
  if (mode === "frozen") {
    if (!frozen) throw new Error("b2c-000197-v7-freeze-files-missing"); frozenManifest();
    return { status: "frozen-awaiting-independent-reviews", manifest_frozen: true, execution_authorized: false,
      live_execution: false, formal_run_id: V7_RUN_ID, fixture_run_id: fixtureRunId, runtime_v8: expected.runtime };
  }
  if (mode === "unfrozen") return { status: "unfrozen-v8-integrated", manifest_frozen: false,
    execution_authorized: false, live_execution: false, formal_run_id: V7_RUN_ID, fixture_run_id: fixtureRunId,
    runtime_v8: expected.runtime };
  return staticV7Candidate({ mode: frozen ? "frozen" : "unfrozen" });
}

export function executePreflightV7() {
  return executeWithEvidenceV7({ evidenceRoot: resolve(research, `b2c-000197-v7-complete-preflight-evidence-${V7_RUN_ID}`),
    operation: (recorder) => { inputs(); return V7_TARGETS.map((target) => { const identity = inspect(recorder, target);
      const state = snapshot(recorder, target, `preflight-${target.key}`); assertAbsentV7(state, target);
      const ports = inspectNoHostPorts(recorder, target); const health = preflightHealth(recorder, target);
      return { key: target.key, topology: target.topology, identity, ports, health, state }; }); },
    successPayload: { scope: "c-and-d-v7-complete-read-only-preflight", execution_authorized: false,
      database_or_container_mutation_performed: false, resources_retained: ["c", "d"] } });
}

export function executeFormalV7() {
  if (process.env.B2C_000197_PRELIMINARY_V7_RUN_ID !== V7_RUN_ID) throw new Error("v7-run-id-drift");
  return executeWithEvidenceV7({ evidenceRoot: resolve(research, `b2c-000197-formal-evidence-${V7_RUN_ID}`),
    operation: (recorder) => formalOperationV7(recorder),
    successPayload: { scope: "absent-path-c-and-d-preliminary-only", final_current: false, resources_retained: ["c", "d"] } });
}

export function formalOperationV7(recorder, overrides = {}) {
  const dependency = { inputs, authorities, formalStatic: formalStaticV7, inspect, snapshot,
    assertAbsent: assertAbsentV7, migrate, predicateMatrix, faults, approval, ...overrides };
  dependency.inputs(); const authority = dependency.authorities(); dependency.formalStatic(recorder);
  const preflight = V7_TARGETS.map((target) => { const identity = dependency.inspect(recorder, target);
    const state = dependency.snapshot(recorder, target, `formal-preflight-${target.key}`);
    dependency.assertAbsent(state, target); return { identity, state }; });
  const results = V7_TARGETS.map((target) => ({ key: target.key,
    migration: dependency.migrate(recorder, target), predicate: dependency.predicateMatrix(recorder, target),
    failures: dependency.faults(recorder, target) }));
  return { authority, preflight, results, approval: dependency.approval(recorder, V7_TARGETS[0]) };
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? "")) {
  if (process.env.B2C_000197_V7_PREFLIGHT === "1") process.stdout.write(`${JSON.stringify(executePreflightV7(), null, 2)}\n`);
  else if (process.env.B2C_000197_PRELIMINARY_V7_EXECUTE === "1") process.stdout.write(`${JSON.stringify(executeFormalV7(), null, 2)}\n`);
  else process.stdout.write(`${JSON.stringify(staticV7Candidate({ mode: process.env.B2C_000197_V7_STATIC_MODE ?? "auto" }), null, 2)}\n`);
}
