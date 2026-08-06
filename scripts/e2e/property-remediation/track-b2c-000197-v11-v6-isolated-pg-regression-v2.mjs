import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import {
  chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";
import {
  FAILURE_INDEX_CONTRACT_V11,
  failureInjectionCasesV11,
  renderFailureBoundarySqlV11,
} from "./track-b2c-000197-failure-cases-v11.mjs";

const root = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const research = resolve(root, ".trellis/tasks/07-30-pr192-b-domain-integrations/research");
const runnerPath = fileURLToPath(import.meta.url);
const artifactPaths = Object.freeze({
  authority: resolve(research, "b2c-000197-v11-v6-pg-regression-v2-candidate-authority-20260802.grammar"),
  manifest: resolve(research, "b2c-000197-v11-v6-pg-regression-v2-candidate-manifest-20260802.json"),
  testRecord: resolve(research, "b2c-000197-v11-v6-pg-regression-v2-static-test-record-20260802.json"),
  handoff: resolve(research, "b2c-000197-v11-v6-pg-regression-v2-review-handoff-20260802.md"),
  index: resolve(root, "scripts/e2e/property-remediation/track-b2c-000197-index-contract-v11.mjs"),
  failure: resolve(root, "scripts/e2e/property-remediation/track-b2c-000197-failure-cases-v11.mjs"),
  migration: resolve(root, "database/migrations/000197_property_approval_active_source_index_forward_fix.sql"),
});

export const V11_V6_PG_V2_REVIEW_SCHEMAS = Object.freeze({
  database: "b2c-000197-v11-v6-pg-regression-v2-independent-database-review-v1",
  qa: "b2c-000197-v11-v6-pg-regression-v2-independent-qa-security-review-v1",
  resource: "b2c-000197-v11-v6-pg-regression-v2-resource-authority-v1",
});
export const V11_V6_PG_V2_REVIEW_PATHS = Object.freeze({
  database: resolve(research, "b2c-000197-v11-v6-pg-regression-v2-independent-database-review-20260802.grammar"),
  qa: resolve(research, "b2c-000197-v11-v6-pg-regression-v2-independent-qa-security-review-20260802.grammar"),
});
export const V11_V6_PG_V2_ENV_KEYS = Object.freeze([
  "B2C_000197_V11_V6_PG_V2_EXECUTE", "B2C_000197_V11_V6_PG_V2_RUN_ID",
  "B2C_000197_V11_V6_PG_V2_RESOURCE_PATH", "B2C_000197_V11_V6_PG_V2_RESOURCE_SHA",
  "B2C_000197_V11_V6_PG_V2_DATABASE_REVIEW_SHA", "B2C_000197_V11_V6_PG_V2_QA_REVIEW_SHA",
]);

const hex64 = /^[0-9a-f]{64}$/u;
const safeRunId = /^b2c197_v11v6_isolated_[a-z0-9_]{8,40}$/u;
const safeContainer = /^jinhu-b2c197-v11v6-isolated-[a-z0-9-]{8,40}$/u;
const safeDatabase = /^jinhu_b2c197_v11v6_isolated_[a-z0-9_]{4,30}$/u;
const safeStage = /[^a-z0-9-]+/gu;
const databaseUrl = /\b(?:postgres(?:ql)?):\/\/[^\s"']+/giu;
const secretValue = /\b(password|passwd|pwd|token|secret|authorization)=([^\s,;]+)/giu;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort()
    .map((key) => [key, canonical(value[key])]));
  return value;
};
const exactSnapshot = (before, after) => JSON.stringify(canonical(before)) === JSON.stringify(canonical(after));
const redact = (value) => String(value ?? "").replace(databaseUrl, "<redacted-database-url>")
  .replace(secretValue, (_, key) => `${key}=<redacted-secret>`).slice(0, 1000);
const stageName = (value) => String(value).toLowerCase().replace(safeStage, "-").replace(/^-|-$/gu, "");

function exactFile(path, hash, requireReadonly = true) {
  if (!path || !hex64.test(hash) || !existsSync(path) || lstatSync(path).isSymbolicLink()
      || realpathSync(path) !== path || (requireReadonly && (statSync(path).mode & 0o777) !== 0o444)
      || sha256(readFileSync(path)) !== hash) {
    throw new Error(`v11-v6-pg-v2-input-drift:${path}`);
  }
  return readFileSync(path, "utf8");
}

export function parseExactGrammarV2(text, schema, expectedNames, label) {
  const lines = String(text).trimEnd().split("\n");
  if (lines.shift() !== schema) throw new Error(`v11-v6-pg-v2-${label}-schema`);
  const fields = new Map();
  for (const line of lines) {
    const cells = line.split("\t");
    if (cells.length !== 2 || !expectedNames.has(cells[0]) || fields.has(cells[0])) {
      throw new Error(`v11-v6-pg-v2-${label}-field`);
    }
    fields.set(cells[0], cells[1]);
  }
  if (fields.size !== expectedNames.size) throw new Error(`v11-v6-pg-v2-${label}-missing`);
  return fields;
}

export function assertResourceAuthorityV2(text, runId) {
  const expected = new Set(["run_id", "container", "container_id", "database", "volume", "postgres_major",
    "baseline_path", "baseline_raw_sha256", "dedicated", "anonymous_volume", "host_port_bindings", "status"]);
  const fields = parseExactGrammarV2(text, V11_V6_PG_V2_REVIEW_SCHEMAS.resource, expected, "resource");
  const target = { runId: fields.get("run_id"), container: fields.get("container"),
    containerId: fields.get("container_id"), database: fields.get("database"), volume: fields.get("volume"),
    baselinePath: resolve(fields.get("baseline_path")), baselineSha: fields.get("baseline_raw_sha256") };
  if (target.runId !== runId || !safeRunId.test(runId) || !safeContainer.test(target.container)
      || !hex64.test(target.containerId) || !safeDatabase.test(target.database) || !hex64.test(target.volume)
      || !hex64.test(target.baselineSha) || fields.get("postgres_major") !== "16"
      || fields.get("dedicated") !== "true" || fields.get("anonymous_volume") !== "true"
      || fields.get("host_port_bindings") !== "0" || fields.get("status") !== "READY-NOT-AUTHORIZED") {
    throw new Error("v11-v6-pg-v2-resource-contract");
  }
  exactFile(target.baselinePath, target.baselineSha); return Object.freeze(target);
}

function frozenBindings(target, resourcePath, resourceSha) {
  return { run_id: target.runId, candidate_authority_raw_sha256: sha256(readFileSync(artifactPaths.authority)),
    candidate_manifest_raw_sha256: sha256(readFileSync(artifactPaths.manifest)),
    static_test_record_raw_sha256: sha256(readFileSync(artifactPaths.testRecord)),
    review_handoff_raw_sha256: sha256(readFileSync(artifactPaths.handoff)), runner_raw_sha256: sha256(readFileSync(runnerPath)),
    index_contract_raw_sha256: sha256(readFileSync(artifactPaths.index)),
    failure_cases_raw_sha256: sha256(readFileSync(artifactPaths.failure)),
    migration_000197_raw_sha256: sha256(readFileSync(artifactPaths.migration)), baseline_path: target.baselinePath,
    baseline_raw_sha256: target.baselineSha, resource_authority_path: resourcePath,
    resource_authority_raw_sha256: resourceSha };
}

export function assertIndependentGoV2(text, kind, bindings) {
  const common = { ...bindings, reviewer_authority: kind === "database" ? "independent-database-reviewer"
    : "independent-qa-security-reviewer", decision: "GO", execution_authorized: "true", formal_go: "false",
  open_p0: "0", open_p1: "0", open_p2: "0" };
  const expected = kind === "qa" ? { ...common, database_review_raw_sha256: bindings.database_review_raw_sha256 } : common;
  const fields = parseExactGrammarV2(text, V11_V6_PG_V2_REVIEW_SCHEMAS[kind], new Set(Object.keys(expected)), kind);
  for (const [name, value] of Object.entries(expected)) {
    if (fields.get(name) !== value) throw new Error(`v11-v6-pg-v2-${kind}-binding:${name}`);
  }
  return Object.fromEntries(fields);
}

export function intakeAuthoritiesV2(env = process.env) {
  if (env.B2C_000197_V11_V6_PG_V2_EXECUTE !== "1") throw new Error("v11-v6-pg-v2-not-authorized");
  const runId = env.B2C_000197_V11_V6_PG_V2_RUN_ID;
  const resourcePath = resolve(env.B2C_000197_V11_V6_PG_V2_RESOURCE_PATH ?? "");
  const resourceSha = env.B2C_000197_V11_V6_PG_V2_RESOURCE_SHA ?? "";
  const resourceText = exactFile(resourcePath, resourceSha); const target = assertResourceAuthorityV2(resourceText, runId);
  for (const path of Object.values(artifactPaths)) exactFile(path, sha256(readFileSync(path)), path !== artifactPaths.migration);
  const bindings = frozenBindings(target, resourcePath, resourceSha);
  const databaseSha = env.B2C_000197_V11_V6_PG_V2_DATABASE_REVIEW_SHA ?? "";
  const databaseText = exactFile(V11_V6_PG_V2_REVIEW_PATHS.database, databaseSha);
  const database = assertIndependentGoV2(databaseText, "database", bindings);
  const qaSha = env.B2C_000197_V11_V6_PG_V2_QA_REVIEW_SHA ?? "";
  const qaText = exactFile(V11_V6_PG_V2_REVIEW_PATHS.qa, qaSha);
  const qa = assertIndependentGoV2(qaText, "qa", { ...bindings, database_review_raw_sha256: databaseSha });
  return Object.freeze({ target, resourceSha, databaseSha, qaSha, database, qa });
}

function commandResult(command, args, options = {}) {
  return spawnSync(command, args, { cwd: options.cwd, env: options.env, input: options.input,
    encoding: "utf8", shell: false, maxBuffer: 16 * 1024 * 1024 });
}

class EvidenceV2 {
  constructor(path, runId) {
    this.path = path; this.runId = runId; this.sequence = 0;
    mkdirSync(path, { recursive: false, mode: 0o700 }); chmodSync(path, 0o700);
  }
  write(name, payload) {
    const path = resolve(this.path, name); writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, { flag: "wx", mode: 0o444 });
    chmodSync(path, 0o444); return path;
  }
  child({ stage, command, args, input = "", runCommand, allowFailure = false }) {
    this.sequence += 1; const prefix = String(this.sequence).padStart(3, "0"); const safe = stageName(stage);
    const bytes = Buffer.byteLength(input); const inputSha = sha256(Buffer.from(input));
    this.write(`${prefix}-${safe}-intent.json`, { schema_version: "b2c-000197-v11-v6-pg-v2-child-intent-v1",
      run_id: this.runId, stage: safe, command, argv: args, stdin: { bytes, raw_sha256: inputSha, persisted: false } });
    const result = runCommand(command, args, { cwd: root, env: { PATH: `${dirname(process.execPath)}:${process.env.PATH ?? ""}` }, input });
    this.write(`${prefix}-${safe}-result.json`, { schema_version: "b2c-000197-v11-v6-pg-v2-child-result-v1",
      run_id: this.runId, stage: safe, exit_code: result.status ?? null, signal: result.signal ?? null,
      spawn_error: result.error ? { name: redact(result.error.name), message: redact(result.error.message) } : null,
      stdout: { bytes: Buffer.byteLength(result.stdout ?? ""), raw_sha256: sha256(Buffer.from(result.stdout ?? "")),
        safe_excerpt: redact(result.stdout) },
      stderr: { bytes: Buffer.byteLength(result.stderr ?? ""), raw_sha256: sha256(Buffer.from(result.stderr ?? "")),
        safe_excerpt: redact(result.stderr) } });
    if (result.error || result.signal || (!allowFailure && result.status !== 0)) {
      const error = new Error(`v11-v6-pg-v2-child:${safe}`); error.stage = safe; throw error;
    }
    return result;
  }
  terminal(kind, payload) {
    const terminal = this.write(`${kind}-${this.runId}.json`, { schema_version: "b2c-000197-v11-v6-pg-v2-terminal-v1",
      run_id: this.runId, status: kind.toUpperCase(), run_id_reusable: false, retry_attempted: false,
      cleanup_attempted: false, ...payload });
    const files = readdirSync(this.path).sort().map((filename) => { const path = resolve(this.path, filename);
      return { filename, bytes: statSync(path).size, mode: "0444", raw_sha256: sha256(readFileSync(path)) }; });
    const manifest = this.write(`${kind}-${this.runId}.manifest.json`, {
      schema_version: "b2c-000197-v11-v6-pg-v2-evidence-manifest-v1", run_id: this.runId,
      status: kind.toUpperCase(), child_file_count: files.filter(({ filename }) => /^\d{3}-/u.test(filename)).length,
      files });
    return { terminal, manifest };
  }
}

function inspect(recorder, runCommand, target) {
  const result = recorder.child({ stage: "inspect-container", command: "docker", args: ["inspect", "--format",
    "{{.Id}}\n{{.Name}}\n{{.State.Running}}\n{{json .HostConfig.PortBindings}}\n{{json .Mounts}}", target.container], runCommand });
  const [id, name, running, portsText, mountsText, ...extra] = String(result.stdout).trim().split("\n");
  const ports = JSON.parse(portsText); const mounts = JSON.parse(mountsText);
  if (extra.length !== 0 || id !== target.containerId || name !== `/${target.container}` || running !== "true"
      || Object.keys(ports ?? {}).length !== 0 || mounts.length !== 1
      || mounts[0]?.Type !== "volume" || mounts[0]?.Name !== target.volume
      || mounts[0]?.Destination !== "/var/lib/postgresql/data") throw new Error("v11-v6-pg-v2-identity-drift");
}

function psql(recorder, runCommand, target, stage, sql, allowFailure = false) {
  return recorder.child({ stage, command: "docker", args: ["exec", "--interactive", target.container, "psql",
    "--username", "postgres", "--dbname", target.database, "--no-psqlrc", "--tuples-only", "--no-align",
    "--set", "ON_ERROR_STOP=1", "--set", "VERBOSITY=verbose", "--file", "-"], input: sql,
  runCommand, allowFailure });
}

const snapshotSql = `SELECT json_build_object(
  'history_primary',(SELECT status FROM public.sys_schema_migration_history WHERE filename='000197_property_approval_active_source_index_forward_fix.sql'),
  'history_mirror',(SELECT status FROM public.schema_migrations WHERE filename='000197_property_approval_active_source_index_forward_fix.sql'),
  'approval_rows',(SELECT count(*) FROM public.biz_property_approval_request),
  'indexdef',(SELECT encode(public.digest(convert_to(pg_get_indexdef(i.indexrelid),'UTF8'),'sha256'),'hex') FROM pg_index i WHERE i.indexrelid='public.uq_biz_property_approval_request_active_source'::regclass),
  'predicate',(SELECT encode(public.digest(convert_to(pg_get_expr(i.indpred,i.indrelid,false),'UTF8'),'sha256'),'hex') FROM pg_index i WHERE i.indexrelid='public.uq_biz_property_approval_request_active_source'::regclass),
  'build_residue',to_regclass('public.uq_biz_property_approval_request_active_source_v2_build') IS NOT NULL)::text;`;
const snapshot = (recorder, runCommand, target, stage) => JSON.parse(String(
  psql(recorder, runCommand, target, stage, snapshotSql).stdout).trim());
function assertAbsent(state) {
  if (state.history_primary !== null || state.history_mirror !== null || Number(state.approval_rows) !== 0
      || state.indexdef !== FAILURE_INDEX_CONTRACT_V11.oldIndexdefSha
      || state.predicate !== FAILURE_INDEX_CONTRACT_V11.oldPredicateSha || state.build_residue !== false) {
    throw new Error("v11-v6-pg-v2-snapshot-drift");
  }
}
function observe(result, entry, before, after) {
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  const sqlstates = [...output.matchAll(/^ERROR:\s+([0-9A-Z]{5}):/gmu)].map((match) => match[1]);
  const markers = [...new Set(output.match(/v11-injected-[a-z-]+/gu) ?? [])];
  const summary = { boundary: entry.boundary, sqlstate: sqlstates.length === 1 ? sqlstates[0] : null,
    expected_marker: entry.marker, observed_markers: markers, snapshot_checked: true,
    snapshot_exact: exactSnapshot(before, after) };
  if (result.status === 0 || result.status == null || result.signal || result.error || summary.sqlstate !== "P0001"
      || markers.length !== 1 || markers[0] !== entry.marker || !summary.snapshot_exact) {
    const error = new Error(`v11-v6-pg-v2-fault-drift:${entry.boundary}`); error.stage = `fault-${entry.boundary}`; throw error;
  }
  return summary;
}

export function runAuthorizedRegressionV2({ authority, evidenceRoot, runCommand = commandResult }) {
  const recorder = new EvidenceV2(evidenceRoot, authority.target.runId);
  try {
    const target = authority.target; inspect(recorder, runCommand, target);
    const version = String(psql(recorder, runCommand, target, "postgres-16-probe", "SHOW server_version_num;").stdout).trim();
    if (!/^16[0-9]{4}$/u.test(version)) throw new Error("v11-v6-pg-v2-version-drift");
    psql(recorder, runCommand, target, "load-old-baseline", readFileSync(target.baselinePath, "utf8"));
    const preflight = snapshot(recorder, runCommand, target, "preflight"); assertAbsent(preflight);
    const faults = failureInjectionCasesV11().map((entry) => { const before = snapshot(recorder, runCommand, target,
      `before-${entry.boundary}`); assertAbsent(before); const result = psql(recorder, runCommand, target,
      `fault-${entry.boundary}`, renderFailureBoundarySqlV11(entry), true); const after = snapshot(recorder, runCommand,
      target, `after-${entry.boundary}`); assertAbsent(after); return observe(result, entry, before, after); });
    const finalSnapshot = snapshot(recorder, runCommand, target, "final-snapshot"); assertAbsent(finalSnapshot);
    const result = { final_current: false, resource_retained: true, postgres_major: 16, baseline_loaded: true,
      fault_count: faults.length, faults, final_snapshot_exact: exactSnapshot(preflight, finalSnapshot) };
    return { result, evidence: recorder.terminal("success", result) };
  } catch (error) {
    recorder.terminal("failure", { failure_stage: stageName(error.stage ?? "runner"),
      error: { name: redact(error.name), message: redact(error.message) } }); throw error;
  }
}

export function executeIsolatedPgRegressionV2({ env = process.env, runCommand = commandResult } = {}) {
  const authority = intakeAuthoritiesV2(env);
  const evidenceRoot = resolve(research, `b2c-000197-v11-v6-pg-regression-v2-evidence-${authority.target.runId}`);
  return runAuthorizedRegressionV2({ authority, evidenceRoot, runCommand });
}

export function isolatedPgRegressionCandidateV2() {
  return { status: "blocked-awaiting-independent-database-and-qa-go-and-resource-authority",
    execution_authorized: false, formal_go: false, fixed_review_paths: V11_V6_PG_V2_REVIEW_PATHS,
    review_schemas: V11_V6_PG_V2_REVIEW_SCHEMAS, required_environment_keys: [...V11_V6_PG_V2_ENV_KEYS],
    fixed_physical_targets: [], docker_or_database_command_executed: false };
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? "")) {
  const payload = process.env.B2C_000197_V11_V6_PG_V2_EXECUTE === "1"
    ? executeIsolatedPgRegressionV2() : isolatedPgRegressionCandidateV2();
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}
