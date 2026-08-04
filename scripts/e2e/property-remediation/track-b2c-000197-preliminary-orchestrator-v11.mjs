import { createRequire } from "node:module";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, lstatSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { URL, fileURLToPath } from "node:url";
import process from "node:process";
import {
  PhaseExecutionErrorV11, V11_RUN_ID, executeWithEvidenceV11, parseTapSummaryV11, runPhasedGateV11,
} from "./track-b2c-000197-preliminary-executor-v11.mjs";
import { failureInjectionCasesV11, renderFailureBoundarySqlV11 } from "./track-b2c-000197-failure-cases-v11.mjs";
import {
  resolveFormalExecutionClosureV11, TYPECHECK_GOVERNANCE_FILES_V11,
} from "./track-b2c-000197-closure-resolver-v11.mjs";

const require = createRequire(import.meta.url);
const tapGate = require("./track-b2c-approval-port-pg-gate-lib.cjs");
const root = process.cwd(); const apiRoot = resolve(root, "apps/api");
const corepackPath = resolve(dirname(process.execPath), "corepack");
const research = resolve(root, ".trellis/tasks/07-30-pr192-b-domain-integrations/research");
const migrationFilename = "000197_property_approval_active_source_index_forward_fix.sql";
const migrationPath = resolve(root, "database/migrations", migrationFilename);
const manifestPath = resolve(research, "b2c-000197-preliminary-v11-v5-input-manifest-20260802.grammar");
const handoffPath = resolve(research, "b2c-000197-preliminary-executor-v11-v5-review-handoff-20260802.md");
const REVIEW_SCHEMAS_V11 = Object.freeze({
  database: "b2c-000197-preliminary-v11-v5-independent-database-review-v1",
  qa: "b2c-000197-preliminary-v11-v5-independent-qa-security-review-v1",
  drain: "b2c-000197-old-writer-drain-v11-v5",
});
const REVIEW_FILENAMES_V11 = Object.freeze({
  database: "b2c-000197-preliminary-v11-v5-independent-database-review-20260802.grammar",
  qa: "b2c-000197-preliminary-v11-v5-independent-qa-security-review-20260802.grammar",
  drain: "b2c-000197-preliminary-v11-v5-old-writer-drain-20260802.grammar",
});
const resolverPath = new URL("./track-b2c-000197-closure-resolver-v11.mjs", import.meta.url);
const fixtureRunId = "4fce75ade89881fb1079f88f3a1e46ab";
const databaseFailureReviewPath = resolve(research,
  "b2c-000197-formal-v10-independent-database-failure-review-20260802.grammar");
const qaFailureReviewPath = resolve(research,
  "b2c-000197-preliminary-v10-formal-failure-qa-security-review-20260802.grammar");
const resourceAuthorityPath = resolve(research,
  "b2c-000197-v11-ef-loader-recovery-success-resource-authority-v4-20260802f.grammar");
const recoveryHandoffPath = resolve(research,
  "b2c-000197-v11-ef-loader-recovery-success-handoff-v4-20260802f.grammar");
const recoveryEvidenceRoot = resolve(research,
  "b2c-000197-r0-loader-recovery-evidence-b2c197_prelim_20260802f-attempt04");
const expected = Object.freeze({ migration: "a9b98ca82aa4dafc16535085184df838880ef27801f7cd4b225e1ca1a15af059",
  r0: "705882718458b69bf76478ebd071316031782dfe1c9485674f211655715f1439",
  r1: "244a9eca21442ecbec916c962956fa5f2e807bc53d9d70704102070e76ca3f6b",
  preflightRunner: "ffc2c21e91959848dacea5dd7eb873e966fc7304a69b78d2742c3a18e444379c",
  contractSpec: "400bb607632724f128fe3e4016111eaffc8a8702b40d3a49e772052f6b918170",
  databaseFailureReview: "1b69610cb50f4af5e9a6ac0f4efc7b00d49d21b299380812f6ca3be089d37676",
  qaFailureReview: "86497cbe8e2c13a324a510cf5b8b0326aa5a909d728bedad97d4defea1a2217e",
  resource: "6c1c38fae1a91387af2e0f27cbac88d58d15f80e91f4ef7a9c1baf5b8cb6e424",
  recoveryHandoff: "387f9750065b0ee56009b9a2ff92ab178bd2586d97c498198df0528032a85183",
  recoveryTerminal: "548df7ba050aa4a9fae48280662c8b90298d0415542a172e191ace2d2e008bdd",
  recoveryManifest: "ddfa1d8df83e0698aba41383db1ccdd7fdcfba6150ffbcf0ed443e6b75b9dd68",
  preflightArtifact: "13de4c00f84e8ffe3bb1e0cae50159ae848ebd10e5abbf78311f788ac8cc873a",
  preflightManifest: "99a279311cc542d27c8f9f448d865f52b846e5441d6daeb5a423261a0fbe6463",
  runtime: "022d992f6f4a1c5326904dccd158e168573b0fd383186dc7db110488bfd2e118",
  handoff: "e79639b00cbb70085d5977c6ce77d0a3f2ae828e00dfa467dba9336b6acde0b7",
  pgSpec: "2d35ee6245aa0b81db00815a905ab393b203f48ac9ba7454208e990f35e35613",
  cli: "e805a00506a2c98c460eb73d5c69f4abfa011091f7dccfab8912e42596ce3a8e",
  cliSpec: "58b7e8c011cb2ebc4acca91d813fc86931000574b434ffdb15b8579d0f79e42b",
  helper: "b629c3c811c72084ae7ea0e7f47799db7dafc8613baeb9d13f5f550e7d969cb4",
  fixtureSpec: "d3064610524fa871b8dd47c20260a99940d60f288ee8696128c212401e0f6612",
  parser: "4f988c6879449df92c5d83ad1525447835a0e02d4fbc45db48fde56fb3dba639",
  runner: "74423d888683cc433efd4a45b0d4dd944117651e2ab4797d484e4f0d6a6a07d4",
  resolver: "70d10b94b456d813c30e0674a5214c5ecf8ece824b56a2c5b56e78967efacc55",
  oldIndex: "89d630118eeeab3655fffe97cde034d82567c1e253c543f9a33a7a8420768584",
  oldPredicate: "d47740fefda3dc305edc9f845c359dfae15d6d9fa1c28a096870870129563a37",
  newIndex: "dd004f0c2e5f40e86ec1953effa91b8604614e276c9fedabe7f2464f13d70d9c",
  newPredicate: "24ef911486d5274d6c439d63de6aa253b289241ac2b75317b1f98bc93a5a8fda" });

const STATIC_INPUTS_V11 = Object.freeze([
  ["database/migrations/000197_property_approval_active_source_index_forward_fix.sql", expected.migration],
  [".trellis/tasks/07-30-pr192-b-domain-integrations/research/b2c-000197-r0-reservation-candidate-20260802.grammar", expected.r0],
  [".trellis/tasks/07-30-pr192-b-domain-integrations/research/b2c-000197-r1-v2-checksum-seal-20260802.grammar", expected.r1],
  ["scripts/e2e/property-remediation/track-b2c-approval-index-forward-fix-gate.mjs", expected.preflightRunner],
  ["scripts/e2e/property-remediation/tests/b2c-approval-index-forward-fix.spec.mjs", expected.contractSpec],
  [".trellis/tasks/07-30-pr192-b-domain-integrations/research/b2c-000197-formal-v10-independent-database-failure-review-20260802.grammar", expected.databaseFailureReview],
  [".trellis/tasks/07-30-pr192-b-domain-integrations/research/b2c-000197-preliminary-v10-formal-failure-qa-security-review-20260802.grammar", expected.qaFailureReview],
  [".trellis/tasks/07-30-pr192-b-domain-integrations/research/b2c-000197-v11-ef-loader-recovery-success-resource-authority-v4-20260802f.grammar", expected.resource],
  [".trellis/tasks/07-30-pr192-b-domain-integrations/research/b2c-000197-v11-ef-loader-recovery-success-handoff-v4-20260802f.grammar", expected.recoveryHandoff],
  [".trellis/tasks/07-30-pr192-b-domain-integrations/research/b2c-000197-r0-loader-recovery-evidence-b2c197_prelim_20260802f-attempt04/success-b2c197_prelim_20260802f_loader_recovery_attempt04.json", expected.recoveryTerminal],
  [".trellis/tasks/07-30-pr192-b-domain-integrations/research/b2c-000197-r0-loader-recovery-evidence-b2c197_prelim_20260802f-attempt04/success-b2c197_prelim_20260802f_loader_recovery_attempt04.manifest.json", expected.recoveryManifest],
  [".trellis/tasks/07-30-pr192-b-domain-integrations/research/b2c-000197-v11-complete-preflight-evidence-b2c197_prelim_20260802f/success-b2c197_prelim_20260802f.json", expected.preflightArtifact],
  [".trellis/tasks/07-30-pr192-b-domain-integrations/research/b2c-000197-v11-complete-preflight-evidence-b2c197_prelim_20260802f/success-b2c197_prelim_20260802f.manifest.json", expected.preflightManifest],
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
let authoritativeCacheV11 = null;
let authoritativeRowsCacheV11 = null;
export function authoritativeFileRowsV11() {
  if (!authoritativeRowsCacheV11) {
    const closure = resolveFormalExecutionClosureV11(root); const compiler = new Set(closure.compilerFiles);
    const governance = new Set(TYPECHECK_GOVERNANCE_FILES_V11); const staticInputs = new Set(STATIC_INPUTS_V11.map(([path]) => path));
    authoritativeRowsCacheV11 = Object.freeze([...new Set([...closure.repositoryFiles, ...staticInputs])].sort().map((path) =>
      Object.freeze({ path, reason: staticInputs.has(path) ? (path.includes("v11-complete-preflight-evidence")
        ? "readonly-preflight" : "authority-input") : compiler.has(path) ? "typecheck-compiler"
        : governance.has(path) ? "typecheck-governance" : "formal-recursive" })));
  }
  return authoritativeRowsCacheV11;
}
export function authoritativeFilePathsV11() {
  authoritativeCacheV11 ??= Object.freeze(authoritativeFileRowsV11().map(({ path }) => path));
  return authoritativeCacheV11;
}

// A later, independently reviewed authority will bind the formal run ID and new E/F resources.
// Until then this module must expose no executable physical target.
export const V11_TARGETS = Object.freeze([
  Object.freeze({ key: "e", topology: "upgrade-to-195", container: "jinhu-b2c197-prelim-20260802f-e",
    containerId: "e8cdea7ae9692bc5fe7407026def4675722f6b7379bd4dd8a915625c73c8daaf",
    database: "jinhu_b2c197_e", volume: "3320230428e226dc57803bc265b2ab1b43a20fde830324181cd21c4ed5445779",
    formalRunId: V11_RUN_ID }),
  Object.freeze({ key: "f", topology: "fresh-to-195", container: "jinhu-b2c197-prelim-20260802f-f",
    containerId: "485454ceaa64e29fbf737c6b0c4e206c7bb15fb95e601124e754d5c4b5defcfe",
    database: "jinhu_b2c197_f", volume: "767ce9a66b29aa9c2230bdbf25479c88af8a1b0515d867deaf2c67bb57b6538e",
    formalRunId: V11_RUN_ID }),
]);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;
const formalRunIdFor = (target) => {
  if (!target?.formalRunId) throw new Error("v11-resource-authority-not-frozen");
  return target.formalRunId;
};
export const childEnvV11 = (extra = {}) => ({
  PATH: `${dirname(process.execPath)}:${process.env.PATH ?? ""}`,
  ...extra,
});
const childEnv = childEnvV11;
const safeEnv = (secret = []) => [{ name: "PATH", persist: "value" },
  ...secret.map((name) => ({ name, persist: "redacted" }))];

export function frozenIdentityAuthorityV11() {
  exact(resourceAuthorityPath, expected.resource); exact(recoveryHandoffPath, expected.recoveryHandoff);
  exact(resolve(recoveryEvidenceRoot, "success-b2c197_prelim_20260802f_loader_recovery_attempt04.json"), expected.recoveryTerminal);
  exact(resolve(recoveryEvidenceRoot, "success-b2c197_prelim_20260802f_loader_recovery_attempt04.manifest.json"), expected.recoveryManifest);
  const lines = readFileSync(resourceAuthorityPath, "utf8").trimEnd().split("\n");
  if (lines.shift() !== "b2c-000197-v11-ef-loader-recovery-success-resource-authority-v4") {
    throw new Error("v11-resource-authority-schema");
  }
  const fields = new Map(lines.map((line) => { const [name, ...values] = line.split("\t"); return [name, values]; }));
  if (fields.get("status")?.[0] !== "SUCCESS-READY-THROUGH-195-FORMAL-GO-FALSE"
      || fields.get("formal_go")?.[0] !== "false" || fields.get("formal_run_id")?.[0] !== V11_RUN_ID
      || fields.get("terminal_artifact_raw_sha256")?.[0] !== expected.recoveryTerminal
      || fields.get("terminal_manifest_raw_sha256")?.[0] !== expected.recoveryManifest) {
    throw new Error("v11-resource-authority-status-drift");
  }
  for (const [index, key] of ["e", "f"].entries()) {
    const target = V11_TARGETS[index];
    const wanted = [target.topology, target.container, target.containerId, target.database, target.volume];
    if (JSON.stringify(fields.get(`target_${key}`)) !== JSON.stringify(wanted)) {
      throw new Error(`v11-resource-authority-target-${key}`);
    }
  }
  return { writer_build: "approval-port-v8", runtime_version: "v8", runtime_raw_sha256: expected.runtime,
    formal_run_id: V11_RUN_ID, resource_authority_raw_sha256: expected.resource,
    review_schema: REVIEW_SCHEMAS_V11,
    drain_schema: REVIEW_SCHEMAS_V11.drain, sql_raw_sha256: expected.migration,
    r0_raw_sha256: expected.r0, r1_raw_sha256: expected.r1 };
}

function exact(path, hash) {
  if (!existsSync(path) || lstatSync(path).isSymbolicLink() || realpathSync(path) !== path
      || sha256(readFileSync(path)) !== hash) throw new Error(`b2c-000197-v11-input-drift:${path}`);
}

function staticInputs() {
  const prefix = readdirSync(resolve(root, "database/migrations")).filter((name) => name.startsWith("000197_"));
  if (prefix.length !== 1 || prefix[0] !== migrationFilename) throw new Error("b2c-000197-v11-prefix-drift");
  for (const [path, hash] of STATIC_INPUTS_V11) {
    exact(resolve(root, path), hash);
  }
  exact(databaseFailureReviewPath, expected.databaseFailureReview);
  exact(qaFailureReviewPath, expected.qaFailureReview);
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
  if (value !== wanted) throw new Error(`b2c-000197-v11-resource:${target.key}`);
  return value;
}

export function inspectNoHostPortsV11(recorder, target) {
  const value = recorder.runChild({ stage: `inspect-noports-${target.key}`, command: "docker",
    args: ["inspect", "--format", "{{json .HostConfig.PortBindings}}|{{json .NetworkSettings.Ports}}", target.container],
    cwd: root, env: childEnv(), envAllowlist: safeEnv() }).stdout.toString("utf8").trim();
  if (value !== '{}|{"5432/tcp":null}') throw new Error(`b2c-000197-v11-host-ports:${target.key}`);
  return { host_port_bindings: 0, exposed_internal_postgres: true };
}

export function preflightHealthV11(recorder, target) {
  const value = json(psql(recorder, target, `preflight-health-${target.key}`, `SELECT json_build_object(
    'primary_history',(SELECT json_agg(row_to_json(x) ORDER BY filename) FROM (SELECT filename,checksum,status FROM
      public.sys_schema_migration_history)x),
    'mirror_history',(SELECT json_agg(row_to_json(x) ORDER BY filename) FROM (SELECT filename,checksum,status FROM
      public.schema_migrations)x),
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
  const expectedHistory = [
    ["000185_property_b_identity_schema_expand.sql","3191ef37395a13ce513283e73994fc6949798dde8fc9666f586c9aeb4c3312ec"],
    ["000186_property_b_approval_runtime_schema.sql","5b7778888668842eac38bc4e3bc6bb56320aecedf5f02e0fbf3f13928a7a0b9e"],
    ["000187_property_b_event_notification_schema.sql","85dbd8235a538ed243a613ae9a12d6bddaba34f88687296c1ad02d3df9504c20"],
    ["000188_property_b_task_runtime_schema.sql","e0b659d9d5c35eec67cfa029240538626492736e4f450f2b47acb40e25dc4e08"],
    ["000189_property_b_module_rbac_definitions.sql","f4af3e88776ae16a0903b0a9a6a8453f674a7a8d317bdd56b5455dfc18e114a2"],
    ["000190_property_b_migration_compatibility_control.sql","da633165db9a031d2a981a2d20f26a2fd78920b91be7722044b06bc9a7385c3a"],
    ["000193_property_b_runtime_integrity_forward_fix.sql","c769efe549385f74092114cdf5f68c8ea40d78885bfecd484ed5a379f9c67f07"],
    ["000194_property_task_projection_contract_correction.sql","93d99ac7b610df7aada4b57ba2c8ea1989aa40826910eedf4117ddcd39cc10f0"],
    ["000195_property_mutation_receipt_contract_v2.sql","9b89f6dbfdec8cfcaa278dffb58677f8b9ccd3032f30f0f264155b6c656198f4"],
  ].map(([filename, checksum]) => ({ filename, checksum, status: "succeeded" }));
  if (JSON.stringify(value.primary_history) !== JSON.stringify(expectedHistory)
      || JSON.stringify(value.mirror_history) !== JSON.stringify(expectedHistory)) {
    throw new Error(`b2c-000197-v11-preflight-history:${target.key}`);
  }
  for (const [name, count] of Object.entries(value).filter(([name]) => !name.endsWith("_history"))) {
    if (count !== 0) throw new Error(`b2c-000197-v11-preflight-health:${target.key}:${name}:${count}`);
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

export function assertAbsentV11(value, target = { key: "unknown" }) {
  if (value.history_primary !== null || value.history_mirror !== null || value.approval_rows !== 0
      || value.indexdef !== expected.oldIndex || value.predicate !== expected.oldPredicate || value.build_residue !== false) {
    throw new Error(`b2c-000197-v11-not-dual-absent-empty:${target.key}`);
  }
  return value;
}

function history(recorder, target, status, error = null) {
  psql(recorder, target, `history-${target.key}-${status}`, `BEGIN;
    INSERT INTO public.sys_schema_migration_history(filename,checksum,status,started_at,finished_at,error_message,executed_by,batch_id)
    VALUES (${literal(migrationFilename)},${literal(expected.migration)},${literal(status)},clock_timestamp(),
      ${status === "running" ? "NULL" : "clock_timestamp()"},${error ? literal(error.slice(0, 500)) : "NULL"},
      'b2c-000197-v11-executor',${literal(formalRunIdFor(target))}) ON CONFLICT(filename) DO UPDATE SET checksum=EXCLUDED.checksum,
      status=EXCLUDED.status,finished_at=EXCLUDED.finished_at,error_message=EXCLUDED.error_message,updated_at=clock_timestamp();
    INSERT INTO public.schema_migrations(filename,checksum,status,started_at,finished_at,error_message,executed_by,batch_id)
      SELECT filename,checksum,status,started_at,finished_at,error_message,executed_by,batch_id
      FROM public.sys_schema_migration_history WHERE filename=${literal(migrationFilename)}
      ON CONFLICT(filename) DO UPDATE SET checksum=EXCLUDED.checksum,status=EXCLUDED.status,
      finished_at=EXCLUDED.finished_at,error_message=EXCLUDED.error_message,updated_at=clock_timestamp(); COMMIT;`);
}

function migrate(recorder, target) {
  const before = snapshot(recorder, target, `before-${target.key}`); assertAbsentV11(before, target); history(recorder, target, "running");
  const result = psql(recorder, target, `migration-${target.key}`, readFileSync(migrationPath), { allowFailure: true });
  if (result.status !== 0 || result.signal || result.error) {
    history(recorder, target, "failed", `${result.stdout}${result.stderr}`); throw new PhaseExecutionErrorV11(`migration-${target.key}`, result);
  }
  history(recorder, target, "succeeded"); const after = snapshot(recorder, target, `after-${target.key}`);
  if (after.approval_rows !== 0 || after.indexdef !== expected.newIndex || after.predicate !== expected.newPredicate
      || after.build_residue) throw new Error(`b2c-000197-v11-post-drift:${target.key}`);
  psql(recorder, target, `rerun-${target.key}`, readFileSync(migrationPath));
  const rerun = snapshot(recorder, target, `rerun-state-${target.key}`);
  if (JSON.stringify(after) !== JSON.stringify(rerun)) throw new Error(`b2c-000197-v11-rerun:${target.key}`);
  return { before, after, rerun_exact: true };
}

const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort()
    .map((key) => [key, canonical(value[key])]));
  return value;
};
const snapshotExact = (before, after) => JSON.stringify(canonical(before)) === JSON.stringify(canonical(after));

export function observeFaultOutcomeV11({ result, expectedMarker, target, boundary, stage }) {
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  const sqlstates = [...output.matchAll(/^ERROR:\s+([0-9A-Z]{5}):/gmu)].map((match) => match[1]);
  const observedMarkers = [...new Set(output.match(/v11-injected-[a-z-]+/gu) ?? [])];
  const sqlstate = sqlstates.length === 1 ? sqlstates[0] : null;
  const sqlstateValid = sqlstate === "P0001";
  const markerValid = observedMarkers.length === 1 && observedMarkers[0] === expectedMarker;
  const exitValid = result.status !== 0 && result.status != null && result.signal == null && !result.error;
  return { stage, target: target.key, boundary, sqlstate,
    expected_marker: expectedMarker, observed_markers: observedMarkers, exit_code: result.status ?? null,
    signal: result.signal ?? null, sqlstate_valid: sqlstateValid, marker_valid: markerValid,
    child_valid: exitValid && sqlstateValid && markerValid,
    snapshot_checked: false, snapshot_exact: null };
}

export function validateFaultBoundaryV11({ result, expectedMarker, before, readAfter, assertAfter, target, boundary, stage }) {
  let childSummary = observeFaultOutcomeV11({ result, expectedMarker, target, boundary, stage });
  let after;
  try {
    after = readAfter();
  } catch (cause) {
    const error = new Error(`b2c-000197-v11-fault-after-read:${target.key}:${boundary}`, { cause });
    error.stage = stage; error.childSummary = childSummary;
    throw error;
  }
  childSummary = { ...childSummary, snapshot_checked: true, snapshot_exact: snapshotExact(before, after) };
  let afterCause = null;
  try { assertAfter(after); } catch (cause) { afterCause = cause; }
  if (!childSummary.child_valid || !childSummary.snapshot_exact || afterCause) {
    const message = `b2c-000197-v11-fault-validation:${target.key}:${boundary}`;
    const error = afterCause ? new Error(message, { cause: afterCause }) : new Error(message);
    error.stage = stage; error.childSummary = childSummary; throw error;
  }
  return { after, summary: childSummary };
}

function faults(recorder, target) {
  return failureInjectionCasesV11().map(({ name, boundary, prefix, assertion, marker }) => {
    const stage = `fault-${target.key}-${name}`;
    const before = snapshot(recorder, target, `${stage}-before`); assertAbsentV11(before, target);
    const result = psql(recorder, target, `fault-${target.key}-${name}`,
      renderFailureBoundarySqlV11({ prefix, assertion, marker }),
    { allowFailure: true });
    const validated = validateFaultBoundaryV11({ result, expectedMarker: marker, before,
      readAfter: () => snapshot(recorder, target, `${stage}-after`), assertAfter: (after) => assertAbsentV11(after, target),
      target, boundary, stage });
    return { name, ...validated.summary };
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
  const tenant = `v11-matrix-${target.key}-${formalRunIdFor(target)}`; const park = "p1";
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
    throw new Error(`b2c-000197-v11-predicate-matrix-drift:${target.key}`);
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
    throw new Error(`b2c-000197-v11-active-duplicate-not-blocked:${target.key}`);
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
  if (terminalCount !== 2) throw new Error(`b2c-000197-v11-terminal-duplicate-blocked:${target.key}`);
  return { ...result, active_duplicate_sqlstate: "23505", terminal_same_source_count: terminalCount };
}

function approval(recorder, target) {
  const raw = recorder.runChild({ stage: "approval-secret-discovery", command: "docker",
    args: ["inspect", "--format", "{{range .Config.Env}}{{println .}}{{end}}|{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}",
      target.container], cwd: root, env: childEnv(), envAllowlist: safeEnv() }).stdout.toString("utf8");
  const password = raw.match(/^POSTGRES_PASSWORD=(.*)$/mu)?.[1]; const ip = raw.slice(raw.lastIndexOf("|") + 1).trim();
  if (!password || !ip) throw new Error("b2c-000197-v11-secret-ip");
  const env = childEnv({ PROPERTY_APPROVAL_PORT_PG_URL: `postgresql://postgres:${password}@${ip}:5432/${target.database}`,
    PROPERTY_APPROVAL_PORT_PG_RUN_ID: fixtureRunId });
  const allowed = [...safeEnv(["PROPERTY_APPROVAL_PORT_PG_URL"]), { name: "PROPERTY_APPROVAL_PORT_PG_RUN_ID", persist: "value" }];
  const cli = ["--require", "ts-node/register", "src/modules/property-approvals/property-approval.port.pg-cli.ts"];
  return runPhasedGateV11(recorder, { phases: [
    { stage: "approval-compile", command: corepackPath, args: ["pnpm", "typecheck"], cwd: apiRoot,
      env: childEnv(), envAllowlist: safeEnv() },
    { stage: "approval-connect", command: process.execPath, args: [...cli, "probe"], cwd: apiRoot, env, envAllowlist: allowed,
      parser: (stdout) => json(stdout) },
    { stage: "approval-setup", command: process.execPath, args: [...cli, "setup"], cwd: apiRoot, env, envAllowlist: allowed,
      parser: (stdout) => json(stdout) },
    { stage: "approval-named-tests", command: process.execPath,
      args: ["--test", "--test-reporter=tap", "--require", "ts-node/register", "src/modules/property-approvals/property-approval.port.pg.spec.ts"],
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

export function frozenManifestV11() {
  if (!existsSync(manifestPath)) throw new Error("v11-static-freeze-not-ready");
  exact(manifestPath, sha256(readFileSync(manifestPath)));
  const lines = readFileSync(manifestPath, "utf8").trimEnd().split("\n");
  if (lines.shift() !== "b2c-000197-preliminary-input-manifest-v11") throw new Error("v11-manifest-schema");
  const rows = lines.filter((entry) => entry.startsWith("file\t"));
  const actualRows = rows.map((line) => { const [, path, , , reason] = line.split("\t"); return { path, reason }; });
  const actualPaths = actualRows.map(({ path }) => path);
  if (actualPaths.some((path) => path.includes("b2c-000197-v11-complete-preflight-evidence-b2c197_prelim_20260802e"))) {
    throw new Error("v11-manifest-audit-only-02e-forbidden");
  }
  if (new Set(actualPaths).size !== actualPaths.length
      || JSON.stringify(actualRows) !== JSON.stringify(authoritativeFileRowsV11())) {
    throw new Error("v11-manifest-authoritative-closure");
  }
  for (const line of rows) {
    const [, relative, size, hash, reason] = line.split("\t"); const content = readFileSync(resolve(root, relative));
    if (!reason) throw new Error(`v11-manifest-reason:${relative}`);
    if (content.length !== Number(size) || sha256(content) !== hash) throw new Error(`v11-manifest-drift:${relative}`);
  }
  return sha256(readFileSync(manifestPath));
}

function exactFieldsV11(text, schema, required, label) {
  const lines = String(text).trimEnd().split("\n");
  if (lines.shift() !== schema) throw new Error(`v11-${label}-schema`);
  const fields = new Map();
  for (const line of lines) {
    const at = line.indexOf("\t"); const name = line.slice(0, at); const value = line.slice(at + 1);
    if (at <= 0 || !required.has(name)) throw new Error(`v11-${label}-unknown:${name}`);
    if (fields.has(name)) throw new Error(`v11-${label}-duplicate:${name}`);
    fields.set(name, value);
  }
  if (fields.size !== required.size) throw new Error(`v11-${label}-field-count`);
  return fields;
}

export function assertIndependentReviewV11(text, kind, bindings) {
  const authority = kind === "database" ? "independent-database-reviewer" : "independent-qa-security-reviewer";
  const expectedFields = { ...bindings, reviewer_authority: authority, formal_go: "true",
    open_p0: "0", open_p1: "0", open_p2: "0", decision: "GO" };
  const fields = exactFieldsV11(text, REVIEW_SCHEMAS_V11[kind], new Set(Object.keys(expectedFields)), `${kind}-review`);
  for (const [name, value] of Object.entries(expectedFields)) {
    if (fields.get(name) !== value) throw new Error(`v11-${kind}-review:${name}`);
  }
  return Object.fromEntries(fields);
}

export function assertDrainAuthorityV11(text, bindings) {
  const expectedFields = { ...bindings, formal_go: "true", decision: "GO", intake: "stopped",
    in_flight_approval_create_transactions: "0", new_writer_build: "approval-port-v8",
    open_p0: "0", open_p1: "0", open_p2: "0" };
  const fields = exactFieldsV11(text, REVIEW_SCHEMAS_V11.drain, new Set(Object.keys(expectedFields)), "drain");
  for (const [name, value] of Object.entries(expectedFields)) {
    if (fields.get(name) !== value) throw new Error(`v11-drain:${name}`);
  }
  return Object.fromEntries(fields);
}

export function assertAuthorityFileV11(kind, rawPath, hash) {
  const path = resolve(rawPath ?? "");
  const wanted = resolve(research, REVIEW_FILENAMES_V11[kind]);
  if (path !== wanted) throw new Error(`v11-${kind}-path`);
  if (!/^[0-9a-f]{64}$/u.test(hash)) throw new Error(`v11-${kind}-sha`);
  exact(path, hash); return { path, hash, text: readFileSync(path, "utf8") };
}

function authorityFileV11(kind) {
  return assertAuthorityFileV11(kind, process.env[`B2C_000197_V11_${kind.toUpperCase()}_PATH`],
    process.env[`B2C_000197_V11_${kind.toUpperCase()}_SHA`] ?? "");
}

function authorities() {
  const manifest = frozenManifestV11(); const identity = frozenIdentityAuthorityV11();
  const resolver = sha256(readFileSync(resolverPath));
  const base = { formal_run_id: V11_RUN_ID, manifest_raw_sha256: manifest,
    handoff_raw_sha256: sha256(readFileSync(handoffPath)), resource_authority_raw_sha256: expected.resource,
    resolver_raw_sha256: resolver,
    executor_raw_sha256: sha256(readFileSync(new URL("./track-b2c-000197-preliminary-executor-v11.mjs", import.meta.url))),
    orchestrator_raw_sha256: sha256(readFileSync(new URL(import.meta.url))),
    approval_runtime_v8_raw_sha256: expected.runtime, writer_build: identity.writer_build,
    target_e_raw_sha256: sha256(V11_TARGETS.slice(0, 1).map((target) => [target.topology, target.container,
      target.containerId, target.database, target.volume].join("\t")).join("")),
    target_f_raw_sha256: sha256(V11_TARGETS.slice(1).map((target) => [target.topology, target.container,
      target.containerId, target.database, target.volume].join("\t")).join("")) };
  const databaseFile = authorityFileV11("database");
  const database = assertIndependentReviewV11(databaseFile.text, "database", { ...base,
    qa_review_path: resolve(research, REVIEW_FILENAMES_V11.qa), qa_review_schema: REVIEW_SCHEMAS_V11.qa });
  const qaFile = authorityFileV11("qa");
  const qa = assertIndependentReviewV11(qaFile.text, "qa", { ...base, database_review_raw_sha256: databaseFile.hash });
  const drainFile = authorityFileV11("drain");
  const drain = assertDrainAuthorityV11(drainFile.text, { formal_run_id: V11_RUN_ID,
    manifest_raw_sha256: manifest, handoff_raw_sha256: base.handoff_raw_sha256,
    resource_authority_raw_sha256: expected.resource, resolver_raw_sha256: resolver,
    executor_raw_sha256: base.executor_raw_sha256, orchestrator_raw_sha256: base.orchestrator_raw_sha256,
    approval_runtime_v8_raw_sha256: expected.runtime, writer_build: identity.writer_build,
    target_e_raw_sha256: base.target_e_raw_sha256, target_f_raw_sha256: base.target_f_raw_sha256,
    database_review_raw_sha256: databaseFile.hash, qa_review_raw_sha256: qaFile.hash });
  return { database, database_sha256: databaseFile.hash, qa, qa_sha256: qaFile.hash,
    drain, drain_sha256: drainFile.hash };
}

export function formalStaticV11(recorder) {
  const testPrefix = Number(process.versions.node.split(".")[0]) >= 24
    ? ["--test", "--test-isolation=none", "--test-reporter=tap"] : ["--test-reporter=tap"];
  const frozenEnv = childEnv({ B2C_000197_V11_STATIC_MODE: "frozen" });
  const frozenAllow = [...safeEnv(), { name: "B2C_000197_V11_STATIC_MODE", persist: "value" }];
  for (const [stage, cwd, args, count, env, envAllowlist, expectedNames = []] of [
    ["static-v11-evidence", root, [...testPrefix, "scripts/e2e/property-remediation/tests/b2c-000197-preliminary-executor-v11.spec.mjs"], 10, childEnv(), safeEnv()],
    ["static-v11-orchestrator", root, [...testPrefix, "scripts/e2e/property-remediation/tests/b2c-000197-preliminary-orchestrator-v11.spec.mjs"], 20, frozenEnv, frozenAllow],
    ["static-v11-capability", root, [...testPrefix, "scripts/e2e/property-remediation/tests/b2c-000197-capability-closure-v11.spec.mjs"], 3, childEnv(), safeEnv(), [
      "formal executable callgraph invokes every hard capability on both targets",
      "formal static child receives frozen mode as recorded benign env",
      "authoritative manifest closure excludes returned artifacts and matches declared local dependencies"]],
    ["static-v11-recursive-closure", root, [...testPrefix, "scripts/e2e/property-remediation/tests/b2c-000197-recursive-closure-v11.spec.mjs"], 3, childEnv(), safeEnv(), [
      "recursive formal closure includes critical PG, authorization, principal and shared dependencies",
      "builtin and external dependencies are explicit while repository misses fail closed",
      "TypeScript Program repository files exactly match real tsc listFilesOnly"]],
    ["static-v11-closure", root, [...testPrefix, "scripts/e2e/property-remediation/tests/b2c-000197-frozen-closure-v11.spec.mjs"], 3, childEnv(), safeEnv()],
    ["static-v11-contract", root, [...testPrefix, "scripts/e2e/property-remediation/tests/b2c-approval-index-forward-fix.spec.mjs"], 8, childEnv(), safeEnv()],
    ["static-v11-lifecycle", apiRoot, [...testPrefix, "--require", "ts-node/register",
      "../../scripts/e2e/property-remediation/tests/b2c-000197-lifecycle-v11.spec.cjs"], 4, childEnv(), safeEnv()],
  ]) recorder.runChild({ stage, command: process.execPath, args, cwd, env, envAllowlist,
    parser: (stdout) => parseTapSummaryV11(stdout, { expectedTests: count, expectedNames }) });
}

export function staticV11Candidate({ mode = "auto" } = {}) {
  if (!["auto", "unfrozen", "frozen"].includes(mode)) throw new Error("v11-static-mode");
  staticInputs(); const identity = frozenIdentityAuthorityV11();
  const frozen = existsSync(manifestPath) && existsSync(resolve(research,
    "b2c-000197-preliminary-executor-v11-v5-review-handoff-20260802.md"));
  if (mode === "frozen") {
    if (!frozen) throw new Error("b2c-000197-v11-freeze-files-missing");
    frozenManifestV11();
  }
  if (mode === "auto" && frozen) return staticV11Candidate({ mode: "frozen" });
  return { status: mode === "frozen" ? "frozen-awaiting-independent-reviews-and-drain"
    : "resource-bound-awaiting-readonly-preflight-and-freeze", manifest_frozen: mode === "frozen",
    resource_authority_bound: true, execution_authorized: false, live_execution: false,
    formal_run_id: identity.formal_run_id, targets: V11_TARGETS.map(({ key, topology }) => ({ key, topology })), fixture_run_id: fixtureRunId,
    approval_runtime_v8_raw_sha256: expected.runtime,
    database_failure_review_raw_sha256: expected.databaseFailureReview,
    qa_failure_review_raw_sha256: expected.qaFailureReview,
    review_schema: REVIEW_SCHEMAS_V11,
    resolver_raw_sha256: sha256(readFileSync(resolverPath)) };
}

export function executePreflightV11() {
  staticInputs(); frozenIdentityAuthorityV11();
  return executeWithEvidenceV11({
    evidenceRoot: resolve(research, `b2c-000197-v11-complete-preflight-evidence-${V11_RUN_ID}`),
    recorderOptions: { runId: V11_RUN_ID },
    operation: (recorder) => V11_TARGETS.map((target) => {
      const identity = inspect(recorder, target);
      const state = snapshot(recorder, target, `preflight-${target.key}`); assertAbsentV11(state, target);
      const ports = inspectNoHostPortsV11(recorder, target); const health = preflightHealthV11(recorder, target);
      return { key: target.key, topology: target.topology, identity, ports, health, state };
    }),
    successPayload: { scope: "e-and-f-v11-complete-read-only-preflight", execution_authorized: false,
      live_execution: false, database_or_container_mutation_performed: false, resources_retained: ["e", "f"] },
  });
}

export function executeStaticGateV11() {
  staticInputs(); frozenIdentityAuthorityV11(); frozenManifestV11();
  return executeWithEvidenceV11({ evidenceRoot: resolve(research, `b2c-000197-v11-v5-static-gate-evidence-${V11_RUN_ID}`),
    recorderOptions: { runId: V11_RUN_ID }, operation: (recorder) => {
      formalStaticV11(recorder); return { formal_static_children: 7, database_or_container_mutation_performed: false };
    }, successPayload: { scope: "v11-frozen-static-only", execution_authorized: false, live_execution: false,
      database_or_container_mutation_performed: false, resource_authority_raw_sha256: expected.resource,
      review_schema: REVIEW_SCHEMAS_V11,
      review_required_fields: ["formal_run_id", "manifest_raw_sha256", "handoff_raw_sha256",
        "resource_authority_raw_sha256", "executor_raw_sha256", "orchestrator_raw_sha256",
        "resolver_raw_sha256", "reviewer_authority", "decision"],
      drain_schema: REVIEW_SCHEMAS_V11.drain, new_writer_build: "approval-port-v8" } });
}

export function executeFormalV11() {
  if (process.env.B2C_000197_PRELIMINARY_V11_RUN_ID !== V11_RUN_ID) throw new Error("v11-run-id-drift");
  staticInputs(); frozenIdentityAuthorityV11(); const authority = authorities();
  return executeWithEvidenceV11({ evidenceRoot: resolve(research, `b2c-000197-v11-v5-formal-evidence-${V11_RUN_ID}`),
    recorderOptions: { runId: V11_RUN_ID },
    operation: (recorder) => formalOperationV11(recorder, { inputs: () => {}, authorities: () => authority }),
    successPayload: formalSuccessPayloadV11 });
}

export function formalSuccessPayloadV11(result) {
  return { scope: "absent-path-e-and-f-preliminary-only", final_current: false,
    resources_retained: ["e", "f"], fault_summary: result.fault_summary };
}

export function formalOperationV11(recorder, overrides = {}) {
  const dependency = { inputs: staticInputs, authorities, formalStatic: formalStaticV11, inspect, snapshot,
    inspectNoPorts: inspectNoHostPortsV11, preflightHealth: preflightHealthV11,
    assertAbsent: assertAbsentV11, migrate, predicateMatrix, faults, approval, ...overrides };
  const targets = overrides.targets ?? V11_TARGETS;
  if (!Array.isArray(targets) || targets.length !== 2) throw new Error("v11-resource-authority-not-frozen");
  dependency.inputs(); const authority = dependency.authorities(); dependency.formalStatic(recorder);
  const preflight = targets.map((target) => { const identity = dependency.inspect(recorder, target);
    const state = dependency.snapshot(recorder, target, `formal-preflight-${target.key}`);
    dependency.assertAbsent(state, target); const ports = dependency.inspectNoPorts(recorder, target);
    const health = dependency.preflightHealth(recorder, target); return { identity, state, ports, health }; });
  const failures = targets.map((target) => ({ key: target.key, failures: dependency.faults(recorder, target) }));
  const results = targets.map((target) => ({ key: target.key,
    migration: dependency.migrate(recorder, target), predicate: dependency.predicateMatrix(recorder, target) }));
  return { authority, preflight, failures, results, approval: dependency.approval(recorder, targets[0]),
    fault_summary: failures.flatMap(({ key, failures: entries }) => entries.map((entry) => ({ target: key,
      boundary: entry.boundary, sqlstate: entry.sqlstate, marker: entry.expected_marker,
      child_valid: entry.child_valid, sqlstate_valid: entry.sqlstate_valid, marker_valid: entry.marker_valid,
      snapshot_checked: entry.snapshot_checked, snapshot_exact: entry.snapshot_exact }))) };
}

export function freezeCandidateArtifactsV11() {
  if (existsSync(manifestPath) || existsSync(handoffPath)) throw new Error("v11-freeze-output-exists");
  staticInputs(); frozenIdentityAuthorityV11();
  const rows = authoritativeFileRowsV11().map(({ path, reason }) => {
    const content = readFileSync(resolve(root, path));
    return `file\t${path}\t${content.length}\t${sha256(content)}\t${reason}`;
  });
  const manifest = [`b2c-000197-preliminary-input-manifest-v11`, `formal_run_id\t${V11_RUN_ID}`,
    "status\tfrozen-candidate-awaiting-two-independent-v11-reviews-and-new-drain-v11",
    `review_schema_database\t${REVIEW_SCHEMAS_V11.database}`,
    `review_schema_qa\t${REVIEW_SCHEMAS_V11.qa}`,
    `drain_schema\t${REVIEW_SCHEMAS_V11.drain}`, ...rows, ""].join("\n");
  writeFileSync(manifestPath, manifest, { flag: "wx", mode: 0o444 }); chmodSync(manifestPath, 0o444);
  const implementation = Object.fromEntries(["failure-cases", "preliminary-executor", "preliminary-orchestrator",
    "closure-resolver"].map((name) => [name, sha256(readFileSync(resolve(root,
      `scripts/e2e/property-remediation/track-b2c-000197-${name}-v11.mjs`)))]));
  const handoff = `# B2c 000197 preliminary executor v11 v5 review handoff\n\nStatus: frozen candidate awaiting exact database GO, QA/security GO and old-writer drain GO. This handoff does not authorize live execution. All v1/v2/v3/v4 freeze outputs are audit-only.\n\n- Formal run ID: \`${V11_RUN_ID}\`\n- Targets: exact E/F SUCCESS authority only\n- Resource authority SHA: \`${expected.resource}\`\n- Recovery SUCCESS handoff SHA: \`${expected.recoveryHandoff}\`\n- Recovery terminal/manifest SHA: \`${expected.recoveryTerminal}\` / \`${expected.recoveryManifest}\`\n- Read-only preflight SHA: \`${expected.preflightArtifact}\` / \`${expected.preflightManifest}\`\n- SQL SHA: \`${expected.migration}\`\n- Writer: \`approval-port-v8\`; runtime v8 SHA \`${expected.runtime}\`\n- Manifest SHA: \`${sha256(Buffer.from(manifest))}\` (${rows.length} rows)\n- Failure cases SHA: \`${implementation["failure-cases"]}\`\n- Executor SHA: \`${implementation["preliminary-executor"]}\`\n- Orchestrator SHA: \`${implementation["preliminary-orchestrator"]}\`\n- Resolver SHA: \`${implementation["closure-resolver"]}\`\n\nThe candidate already contains guarded formal execution. Database review binds the frozen candidate. QA additionally binds the database review SHA. Drain binds both review SHAs, avoiding cyclic hashes. Every authority uses a fixed path/header, exact fields, formal_go=true, decision=GO and open_p0/open_p1/open_p2=0; missing, duplicate, unknown, stale or wrong values fail before the formal evidence root is created.\n\nThe formal callgraph executes all four inline P0001 fault boundaries on both targets before the first migration. Failure terminals persist only bounded and redacted child validity, SQLSTATE, marker and truthful snapshot checked/exact state. Formal/live remains blocked until all three new GO files pass exact intake.\n`;
  writeFileSync(handoffPath, handoff, { flag: "wx", mode: 0o444 }); chmodSync(handoffPath, 0o444);
  return { manifest: { path: manifestPath, bytes: statSync(manifestPath).size, raw_sha256: sha256(readFileSync(manifestPath)) },
    handoff: { path: handoffPath, bytes: statSync(handoffPath).size, raw_sha256: sha256(readFileSync(handoffPath)) } };
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? "")) {
  if (process.env.B2C_000197_V11_PREFLIGHT === "1") process.stdout.write(`${JSON.stringify(executePreflightV11(), null, 2)}\n`);
  else if (process.env.B2C_000197_V11_FREEZE === "1") process.stdout.write(`${JSON.stringify(freezeCandidateArtifactsV11(), null, 2)}\n`);
  else if (process.env.B2C_000197_V11_STATIC_GATE === "1") process.stdout.write(`${JSON.stringify(executeStaticGateV11(), null, 2)}\n`);
  else if (process.env.B2C_000197_PRELIMINARY_V11_EXECUTE === "1") process.stdout.write(`${JSON.stringify(executeFormalV11(), null, 2)}\n`);
  else process.stdout.write(`${JSON.stringify(staticV11Candidate({ mode: process.env.B2C_000197_V11_STATIC_MODE ?? "auto" }), null, 2)}\n`);
}
