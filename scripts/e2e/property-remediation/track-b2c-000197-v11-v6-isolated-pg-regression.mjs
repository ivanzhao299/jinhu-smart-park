import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";
import {
  FAILURE_INDEX_CONTRACT_V11,
  failureInjectionCasesV11,
  renderFailureBoundarySqlV11,
} from "./track-b2c-000197-failure-cases-v11.mjs";

export const V11_V6_ISOLATED_PG_ENV_KEYS = Object.freeze([
  "B2C_000197_V11_V6_PG_REGRESSION_EXECUTE",
  "B2C_000197_V11_V6_PG_RUN_ID",
  "B2C_000197_V11_V6_PG_CONTAINER",
  "B2C_000197_V11_V6_PG_CONTAINER_ID",
  "B2C_000197_V11_V6_PG_DATABASE",
  "B2C_000197_V11_V6_PG_VOLUME",
  "B2C_000197_V11_V6_PG_BASELINE_PATH",
  "B2C_000197_V11_V6_PG_BASELINE_SHA",
]);

const safeRunId = /^b2c197_v11v6_isolated_[a-z0-9_]{8,40}$/u;
const safeContainer = /^jinhu-b2c197-v11v6-isolated-[a-z0-9-]{8,40}$/u;
const safeDatabase = /^jinhu_b2c197_v11v6_isolated_[a-z0-9_]{4,30}$/u;
const hex64 = /^[0-9a-f]{64}$/u;

const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort()
    .map((key) => [key, canonical(value[key])]));
  return value;
};
const exactSnapshot = (before, after) => JSON.stringify(canonical(before)) === JSON.stringify(canonical(after));

function commandResult(command, args, options = {}) {
  return spawnSync(command, args, { cwd: options.cwd, env: options.env, encoding: "utf8", shell: false,
    maxBuffer: 16 * 1024 * 1024 });
}

export function isolatedPgRegressionCandidateV11() {
  return { status: "blocked-awaiting-new-dedicated-pg-authority-and-explicit-execution",
    execution_authorized: false, docker_or_database_command_executed: false,
    required_environment_keys: [...V11_V6_ISOLATED_PG_ENV_KEYS], fixed_physical_targets: [] };
}

export function isolatedPgAuthorityV11(env) {
  const value = Object.fromEntries(V11_V6_ISOLATED_PG_ENV_KEYS.map((key) => [key, env[key]]));
  if (value.B2C_000197_V11_V6_PG_REGRESSION_EXECUTE !== "1") throw new Error("v11-v6-pg-not-authorized");
  const target = { runId: value.B2C_000197_V11_V6_PG_RUN_ID,
    container: value.B2C_000197_V11_V6_PG_CONTAINER, containerId: value.B2C_000197_V11_V6_PG_CONTAINER_ID,
    database: value.B2C_000197_V11_V6_PG_DATABASE, volume: value.B2C_000197_V11_V6_PG_VOLUME,
    baselinePath: resolve(value.B2C_000197_V11_V6_PG_BASELINE_PATH ?? ""),
    baselineSha: value.B2C_000197_V11_V6_PG_BASELINE_SHA };
  if (!safeRunId.test(target.runId ?? "") || !safeContainer.test(target.container ?? "")
      || !hex64.test(target.containerId ?? "") || !safeDatabase.test(target.database ?? "")
      || !hex64.test(target.volume ?? "") || !hex64.test(target.baselineSha ?? "")) {
    throw new Error("v11-v6-pg-authority-invalid-or-retired");
  }
  if (lstatSync(target.baselinePath).isSymbolicLink() || realpathSync(target.baselinePath) !== target.baselinePath
      || createHash("sha256").update(readFileSync(target.baselinePath)).digest("hex") !== target.baselineSha) {
    throw new Error("v11-v6-pg-baseline-authority-drift");
  }
  return Object.freeze(target);
}

function runChecked(runCommand, command, args, stage, allowFailure = false) {
  const result = runCommand(command, args, { cwd: resolve(fileURLToPath(new URL("../../../", import.meta.url))),
    env: { PATH: process.env.PATH ?? "" } });
  if (result.error || result.signal || (!allowFailure && result.status !== 0)) {
    const error = new Error(`b2c-000197-v11-v6-pg-stage:${stage}`); error.stage = stage; throw error;
  }
  return result;
}

function inspectTarget(runCommand, target) {
  const result = runChecked(runCommand, "docker", ["inspect", target.container], "inspect");
  const rows = JSON.parse(String(result.stdout)); const actual = rows[0];
  const mounts = actual?.Mounts ?? [];
  if (rows.length !== 1 || actual?.Id !== target.containerId || actual?.Name !== `/${target.container}`
      || actual?.State?.Running !== true || Object.keys(actual?.HostConfig?.PortBindings ?? {}).length !== 0
      || mounts.length !== 1 || mounts[0]?.Type !== "volume" || mounts[0]?.Name !== target.volume
      || mounts[0]?.Destination !== "/var/lib/postgresql/data") throw new Error("v11-v6-pg-identity-drift");
}

const snapshotSql = `SELECT json_build_object(
  'history_primary',(SELECT status FROM public.sys_schema_migration_history WHERE filename='000197_property_approval_active_source_index_forward_fix.sql'),
  'history_mirror',(SELECT status FROM public.schema_migrations WHERE filename='000197_property_approval_active_source_index_forward_fix.sql'),
  'approval_rows',(SELECT count(*) FROM public.biz_property_approval_request),
  'indexdef',(SELECT encode(public.digest(convert_to(pg_get_indexdef(i.indexrelid),'UTF8'),'sha256'),'hex') FROM pg_index i WHERE i.indexrelid='public.uq_biz_property_approval_request_active_source'::regclass),
  'predicate',(SELECT encode(public.digest(convert_to(pg_get_expr(i.indpred,i.indrelid,false),'UTF8'),'sha256'),'hex') FROM pg_index i WHERE i.indexrelid='public.uq_biz_property_approval_request_active_source'::regclass),
  'build_residue',to_regclass('public.uq_biz_property_approval_request_active_source_v2_build') IS NOT NULL)::text;`;

function psql(runCommand, target, sql, stage, allowFailure = false) {
  return runChecked(runCommand, "docker", ["exec", target.container, "psql", "--username", "postgres",
    "--dbname", target.database, "--no-psqlrc", "--tuples-only", "--no-align", "--set", "ON_ERROR_STOP=1",
    "--set", "VERBOSITY=verbose", "--command", sql], stage, allowFailure);
}

function snapshot(runCommand, target, stage) {
  return JSON.parse(String(psql(runCommand, target, snapshotSql, stage).stdout).trim());
}

function assertAbsent(state) {
  if (state.history_primary !== null || state.history_mirror !== null || Number(state.approval_rows) !== 0
      || state.indexdef !== FAILURE_INDEX_CONTRACT_V11.oldIndexdefSha
      || state.predicate !== FAILURE_INDEX_CONTRACT_V11.oldPredicateSha || state.build_residue !== false) {
    throw new Error("v11-v6-pg-preflight-drift");
  }
}

function observeFault(result, entry, before, after) {
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  const sqlstates = [...output.matchAll(/^ERROR:\s+([0-9A-Z]{5}):/gmu)].map((match) => match[1]);
  const markers = [...new Set(output.match(/v11-injected-[a-z-]+/gu) ?? [])];
  const summary = { boundary: entry.boundary, expected_marker: entry.marker,
    sqlstate: sqlstates.length === 1 ? sqlstates[0] : null, observed_markers: markers,
    snapshot_checked: true, snapshot_exact: exactSnapshot(before, after) };
  if (result.status === 0 || result.status == null || result.signal || result.error || summary.sqlstate !== "P0001"
      || markers.length !== 1 || markers[0] !== entry.marker || !summary.snapshot_exact) {
    throw new Error(`v11-v6-pg-fault-drift:${entry.boundary}`);
  }
  return Object.freeze(summary);
}

export function executeIsolatedPgRegressionV11({ env = process.env, runCommand = commandResult } = {}) {
  const target = isolatedPgAuthorityV11(env); inspectTarget(runCommand, target);
  const version = String(psql(runCommand, target, "SHOW server_version_num;", "postgres-16-probe").stdout).trim();
  if (!/^16[0-9]{4}$/u.test(version)) throw new Error("v11-v6-pg-version-drift");
  psql(runCommand, target, readFileSync(target.baselinePath, "utf8"), "load-old-baseline");
  const preflight = snapshot(runCommand, target, "preflight"); assertAbsent(preflight);
  const faults = failureInjectionCasesV11().map((entry) => {
    const before = snapshot(runCommand, target, `before-${entry.boundary}`); assertAbsent(before);
    const result = psql(runCommand, target, renderFailureBoundarySqlV11(entry), `fault-${entry.boundary}`, true);
    const after = snapshot(runCommand, target, `after-${entry.boundary}`); assertAbsent(after);
    return observeFault(result, entry, before, after);
  });
  const finalSnapshot = snapshot(runCommand, target, "final-snapshot"); assertAbsent(finalSnapshot);
  return { status: "PASS_PRELIMINARY_ISOLATED_FAULT_REGRESSION", final_current: false,
    run_id: target.runId, target: "dedicated-authority-supplied", faults,
    postgres_major: 16, baseline_loaded: true, final_snapshot_exact: exactSnapshot(preflight, finalSnapshot),
    migration_executed: false, cleanup_attempted: false };
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? "")) {
  const payload = process.env.B2C_000197_V11_V6_PG_REGRESSION_EXECUTE === "1"
    ? executeIsolatedPgRegressionV11() : isolatedPgRegressionCandidateV11();
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}
