import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";
import { FAILURE_INDEX_CONTRACT_V11, failureInjectionCasesV11, renderFailureBoundarySqlV11 } from "./track-b2c-000197-failure-cases-v11.mjs";
import { redactV4 } from "./track-b2c-000197-v11-v6-isolated-pg-regression-v4.mjs";

const root = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const migrations = resolve(root, "database/migrations");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const hex64 = /^[0-9a-f]{64}$/u;
const runIdPattern = /^b2c197_v11v6_direct_[a-z0-9_]{8,40}$/u;
const containerPattern = /^jinhu-b2c197-v11v6-direct-[a-z0-9-]{8,40}$/u;
const databasePattern = /^jinhu_b2c197_v11v6_direct_[a-z0-9_]{4,30}$/u;
const stage = (value) => String(value).toLowerCase().replace(/[^a-z0-9-]+/gu, "-").replace(/^-|-$/gu, "");
const canonical = (value) => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object"
  ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;
const same = (left, right) => JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));

/** Bound inventory of the direct PG16 baseline: no dump, archive, or SQL regeneration is accepted. */
export const V6_BASELINE_MANIFEST_SHA256 = "db61fdb7bb73addce319f680b2f38d2e0aa41fccd5b3a73cbd131a04bd81bcfc";
export const V6_CORRECT_BUILD_RESIDUE = "uq_biz_property_approval_request_active_source_v2_build";
const late = Object.freeze(["000183_property_business_granular_rbac.sql", "000184_property_workbench_read_permissions.sql",
  "000185_property_b_identity_schema_expand.sql", "000186_property_b_approval_runtime_schema.sql",
  "000187_property_b_event_notification_schema.sql", "000188_property_b_task_runtime_schema.sql",
  "000189_property_b_module_rbac_definitions.sql", "000190_property_b_migration_compatibility_control.sql",
  "000193_property_b_runtime_integrity_forward_fix.sql", "000194_property_task_projection_contract_correction.sql",
  "000195_property_mutation_receipt_contract_v2.sql"]);

export function directBaselinePlanV6() {
  const initial = readdirSync(migrations).filter((filename) => {
    const found = filename.match(/^(\d{6})_.*\.sql$/u); return found && Number(found[1]) <= 182 && Number(found[1]) !== 175;
  }).sort();
  const plan = [...initial.map((filename) => ({ kind: "migration", filename, path: resolve(migrations, filename) })),
    { kind: "seed", filename: "000001_s1_production_core.sql", path: resolve(root, "database/seeds/000001_s1_production_core.sql") },
    ...late.map((filename) => ({ kind: "migration", filename, path: resolve(migrations, filename) }))]
    .map((entry) => ({ ...entry, raw_sha256: sha256(readFileSync(entry.path)) }));
  const manifest = plan.map(({ kind, filename, raw_sha256 }) => ({ kind, filename, raw_sha256 }));
  if (plan.length !== 194 || sha256(JSON.stringify(manifest)) !== V6_BASELINE_MANIFEST_SHA256) throw new Error("b2c-v6-baseline-manifest-drift");
  return Object.freeze(plan.map(Object.freeze));
}

function boundBytes(entry) {
  if (!existsSync(entry.path) || lstatSync(entry.path).isSymbolicLink() || realpathSync(entry.path) !== entry.path
      || sha256(readFileSync(entry.path)) !== entry.raw_sha256) throw new Error(`b2c-v6-baseline-byte-drift:${entry.filename}`);
  return readFileSync(entry.path, "utf8");
}
export function directBaselineAttestationV6() {
  const plan = directBaselinePlanV6();
  return Object.freeze({ schema_version: "b2c-000197-v11-v6-direct-baseline-attestation-v1", baseline_mode: "direct-pg16-migration-bytes",
    pg_dump_consumed: false, source_file_count: plan.length, manifest_raw_sha256: V6_BASELINE_MANIFEST_SHA256,
    excludes: ["000175", "000191", "000192", "000197"], history_recorded: late.filter((filename) => Number(filename.slice(0, 6)) >= 185) });
}
function assertTarget(target) {
  if (!runIdPattern.test(target.runId) || !containerPattern.test(target.container) || !databasePattern.test(target.database)
      || !hex64.test(target.containerId) || !hex64.test(target.volume)) throw new Error("b2c-v6-target-drift");
}
class Evidence {
  constructor(path, runId) { this.path = path; this.runId = runId; this.sequence = 0; mkdirSync(path, { recursive: false, mode: 0o700 }); chmodSync(path, 0o700); }
  write(name, body) { const path = resolve(this.path, name); writeFileSync(path, `${JSON.stringify(body, null, 2)}\n`, { flag: "wx", mode: 0o444 }); chmodSync(path, 0o444); return path; }
  child(name, command, args, input, run, allowFailure = false) { this.sequence += 1; const prefix = String(this.sequence).padStart(3, "0"); const nameSafe = stage(name);
    this.write(`${prefix}-${nameSafe}-intent.json`, { schema_version: "b2c-000197-v11-v6-direct-pg-v6-child-intent-v1", run_id: this.runId, stage: nameSafe, command, argv: args, stdin: { bytes: Buffer.byteLength(input), raw_sha256: sha256(input), persisted: false } });
    const result = run(command, args, { cwd: root, env: { PATH: `${dirname(process.execPath)}:${process.env.PATH ?? ""}` }, input });
    this.write(`${prefix}-${nameSafe}-result.json`, { schema_version: "b2c-000197-v11-v6-direct-pg-v6-child-result-v1", run_id: this.runId, stage: nameSafe, exit_code: result.status ?? null, signal: result.signal ?? null, spawn_error: result.error ? { name: redactV4(result.error.name), message: redactV4(result.error.message) } : null, stdout: { bytes: Buffer.byteLength(result.stdout ?? ""), raw_sha256: sha256(result.stdout ?? ""), safe_excerpt: "<suppressed:child-output>" }, stderr: { bytes: Buffer.byteLength(result.stderr ?? ""), raw_sha256: sha256(result.stderr ?? ""), safe_excerpt: "<suppressed:child-output>" } });
    if (result.error || result.signal || (!allowFailure && result.status !== 0)) { const error = new Error(`b2c-v6-child:${nameSafe}`); error.stage = nameSafe; throw error; } return result;
  }
  terminal(kind, payload) { const terminal = this.write(`${kind}-${this.runId}.json`, { schema_version: "b2c-000197-v11-v6-direct-pg-v6-terminal-v1", run_id: this.runId, status: kind.toUpperCase(), run_id_reusable: false, retry_attempted: false, cleanup_attempted: false, ...payload }); const files = readdirSync(this.path).sort().map((filename) => ({ filename, bytes: statSync(resolve(this.path, filename)).size, mode: "0444", raw_sha256: sha256(readFileSync(resolve(this.path, filename)))})); return { terminal, manifest: this.write(`${kind}-${this.runId}.manifest.json`, { schema_version: "b2c-000197-v11-v6-direct-pg-v6-evidence-manifest-v1", run_id: this.runId, status: kind.toUpperCase(), files }) }; }
}
function psql(recorder, target, name, input, run, allowFailure = false) { return recorder.child(name, "/usr/bin/docker", ["exec", "--interactive", target.container, "psql", "--username", "postgres", "--dbname", target.database, "--no-psqlrc", "--set", "ON_ERROR_STOP=1", "--file", "-"], input, run, allowFailure); }
const historyBootstrap = `CREATE TABLE IF NOT EXISTS public.sys_schema_migration_history (id bigserial PRIMARY KEY, filename varchar(255) NOT NULL UNIQUE, checksum varchar(64) NOT NULL, status varchar(16) NOT NULL CHECK(status IN ('running','succeeded','failed')), started_at timestamptz NOT NULL, finished_at timestamptz, error_message text, executed_by varchar(255) NOT NULL, batch_id varchar(32) NOT NULL, created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP); CREATE TABLE IF NOT EXISTS public.schema_migrations (LIKE public.sys_schema_migration_history INCLUDING ALL);`;
const snapshotSql = `SELECT json_build_object('history_primary',(SELECT status FROM public.sys_schema_migration_history WHERE filename='000197_property_approval_active_source_index_forward_fix.sql'),'history_mirror',(SELECT status FROM public.schema_migrations WHERE filename='000197_property_approval_active_source_index_forward_fix.sql'),'approval_rows',(SELECT count(*) FROM public.biz_property_approval_request),'indexdef',(SELECT encode(public.digest(convert_to(pg_get_indexdef(i.indexrelid),'UTF8'),'sha256'),'hex') FROM pg_index i WHERE i.indexrelid='public.uq_biz_property_approval_request_active_source'::regclass),'predicate',(SELECT encode(public.digest(convert_to(pg_get_expr(i.indpred,i.indrelid,false),'UTF8'),'sha256'),'hex') FROM pg_index i WHERE i.indexrelid='public.uq_biz_property_approval_request_active_source'::regclass),'build_residue',to_regclass('public.${V6_CORRECT_BUILD_RESIDUE}') IS NOT NULL)::text;`;
function assertOld(snapshot) { if (snapshot.history_primary !== null || snapshot.history_mirror !== null || Number(snapshot.approval_rows) !== 0 || snapshot.indexdef !== FAILURE_INDEX_CONTRACT_V11.oldIndexdefSha || snapshot.predicate !== FAILURE_INDEX_CONTRACT_V11.oldPredicateSha || snapshot.build_residue !== false) throw new Error("b2c-v6-old-catalog-drift"); }
function historyRecord(entry) { return `INSERT INTO public.sys_schema_migration_history(filename,checksum,status,started_at,finished_at,executed_by,batch_id) VALUES ('${entry.filename}','${entry.raw_sha256}','succeeded',clock_timestamp(),clock_timestamp(),'b2c-v6-direct','v6-direct'); INSERT INTO public.schema_migrations(filename,checksum,status,started_at,finished_at,executed_by,batch_id) SELECT filename,checksum,status,started_at,finished_at,executed_by,batch_id FROM public.sys_schema_migration_history WHERE filename='${entry.filename}';`; }

/** Dynamic entry point. It is intentionally unreachable until a future authority and independent gates exist. */
export function runDirectPgRegressionV6({ target, evidenceRoot, runCommand = spawnSync }) {
  assertTarget(target); const recorder = new Evidence(evidenceRoot, target.runId);
  try { const plan = directBaselinePlanV6(); const inspected = recorder.child("inspect-container", "/usr/bin/docker", ["inspect", "--format", "{{.Id}}\\n{{.Name}}\\n{{.State.Running}}\\n{{json .HostConfig.PortBindings}}\\n{{json .Mounts}}", target.container], "", runCommand).stdout.trim().split("\n"); const mounts = JSON.parse(inspected[4] ?? "[]");
    if (inspected[0] !== target.containerId || inspected[1] !== `/${target.container}` || inspected[2] !== "true" || Object.keys(JSON.parse(inspected[3] ?? "null")).length !== 0 || mounts.length !== 1 || mounts[0]?.Name !== target.volume || mounts[0]?.Destination !== "/var/lib/postgresql/data") throw new Error("b2c-v6-identity-drift");
    if (!/^16[0-9]{4}$/u.test(psql(recorder, target, "postgres-16-probe", "SHOW server_version_num;", runCommand).stdout.trim())) throw new Error("b2c-v6-version-drift");
    for (const entry of plan.filter(({ filename }) => !late.includes(filename))) psql(recorder, target, `apply-${entry.filename}`, boundBytes(entry), runCommand);
    psql(recorder, target, "history-bootstrap", historyBootstrap, runCommand);
    for (const entry of plan.filter(({ filename }) => late.includes(filename))) { psql(recorder, target, `apply-${entry.filename}`, boundBytes(entry), runCommand); if (Number(entry.filename.slice(0, 6)) >= 185) psql(recorder, target, `record-${entry.filename}`, historyRecord(entry), runCommand); }
    const initial = JSON.parse(psql(recorder, target, "preflight", snapshotSql, runCommand).stdout.trim()); assertOld(initial); const faults = [];
    for (const entry of failureInjectionCasesV11()) { const before = JSON.parse(psql(recorder, target, `before-${entry.boundary}`, snapshotSql, runCommand).stdout.trim()); assertOld(before); const failed = psql(recorder, target, `fault-${entry.boundary}`, renderFailureBoundarySqlV11(entry), runCommand, true); const output = `${failed.stdout ?? ""}${failed.stderr ?? ""}`; if (failed.status === 0 || !/^ERROR:\s+P0001:/mu.test(output) || !output.includes(entry.marker)) throw new Error(`b2c-v6-fault-marker:${entry.boundary}`); const after = JSON.parse(psql(recorder, target, `after-${entry.boundary}`, snapshotSql, runCommand).stdout.trim()); assertOld(after); if (!same(before, after)) throw new Error(`b2c-v6-rollback-drift:${entry.boundary}`); faults.push(entry.boundary); }
    const finalSnapshot = JSON.parse(psql(recorder, target, "final-snapshot", snapshotSql, runCommand).stdout.trim()); assertOld(finalSnapshot); return { result: { final_current: false, direct_baseline: true, pg_dump_consumed: false, fault_count: faults.length, faults, final_snapshot_exact: same(initial, finalSnapshot) }, evidence: recorder.terminal("success", { direct_baseline_attestation: directBaselineAttestationV6() }) };
  } catch (error) { recorder.terminal("failure", { failure_stage: stage(error.stage ?? "runner"), error: { name: redactV4(error.name), message: redactV4(error.message) } }); throw error; }
}
export function directPgRegressionCandidateV6() { return Object.freeze({ status: "sealed-awaiting-new-db-qa-drain-reviews-and-resource-authority", execution_authorized: false, formal_go: false, direct_baseline_attestation: directBaselineAttestationV6(), build_residue_identifier: V6_CORRECT_BUILD_RESIDUE, docker_or_database_command_executed: false, fixed_physical_targets: [] }); }
if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? "")) process.stdout.write(`${JSON.stringify(directPgRegressionCandidateV6(), null, 2)}\n`);
