import { existsSync, lstatSync, readFileSync, readlinkSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { exactKeys, readJson } from "./lib.mjs";

const LEASE_KEYS = ["schemaVersion", "status", "leaseNonce", "runId", "finalSha", "caseId", "commandSpecSha256", "expectedExecutable", "worktree", "apiPort", "webPort", "stage", "groups"];

function inside(parent, child) { const delta = relative(resolve(parent), resolve(child)); return delta === "" || (!delta.startsWith(`..${sep}`) && delta !== ".."); }

export function validateRuntimeLease(lease, authority) {
  exactKeys(lease, LEASE_KEYS, "runtime lease");
  if (lease.schemaVersion !== "property-track-c-runtime-lease-v1" || !["PENDING", "RUNNING", "STOPPED"].includes(lease.status)) throw new Error("invalid runtime lease schema/status");
  if (lease.leaseNonce !== authority.runtimeNonce || lease.runId !== authority.labels["jinhu.rollback.run_id"] || lease.finalSha !== authority.labels["jinhu.rollback.final_sha"] || lease.caseId !== authority.labels["jinhu.rollback.case_id"] || lease.worktree !== authority.worktree || lease.apiPort !== authority.apiPort || lease.webPort !== authority.webPort) throw new Error("runtime lease authority mismatch");
  if (lease.commandSpecSha256 !== authority.commandSpecSha256 || lease.expectedExecutable !== authority.expectedExecutable) throw new Error("runtime lease command/executable binding is invalid");
  exactKeys(lease.groups, ["api", "web"], "runtime lease process groups");
  for (const [role, group] of Object.entries(lease.groups)) {
    if (group === null) continue;
    exactKeys(group, ["role", "pid", "pgid", "executable", "cwd", "commandMarker"], "runtime lease process identity");
    if (group.role !== role || !Number.isSafeInteger(group.pid) || group.pid < 2 || group.pgid !== group.pid || group.executable !== lease.expectedExecutable || !inside(lease.worktree, group.cwd) || typeof group.commandMarker !== "string" || !inside(lease.worktree, group.commandMarker)) throw new Error("runtime lease process identity mismatch");
  }
  return lease;
}

export function writeRuntimeLeaseAtomic(path, lease, authority) {
  validateRuntimeLease(lease, authority);
  const temp = `${path}.next-${process.pid}-${Date.now()}`;
  writeFileSync(temp, `${JSON.stringify(lease, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  renameSync(temp, path);
}

export function initializeRuntimeLease({ authority, commandSpecSha256, expectedExecutable }) {
  const lease = { schemaVersion: "property-track-c-runtime-lease-v1", status: "PENDING", leaseNonce: authority.runtimeNonce, runId: authority.labels["jinhu.rollback.run_id"], finalSha: authority.labels["jinhu.rollback.final_sha"], caseId: authority.labels["jinhu.rollback.case_id"], commandSpecSha256, expectedExecutable, worktree: authority.worktree, apiPort: authority.apiPort, webPort: authority.webPort, stage: null, groups: { api: null, web: null } };
  writeRuntimeLeaseAtomic(authority.runtimeManifest, lease, authority); return lease;
}

function procIdentity(pid) {
  try {
    const environment = Object.fromEntries(readFileSync(`/proc/${pid}/environ`).toString("utf8").split("\0").filter(Boolean).map((entry) => { const at = entry.indexOf("="); return [entry.slice(0, at), entry.slice(at + 1)]; }));
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8"); const fields = stat.slice(stat.lastIndexOf(")") + 2).trim().split(/\s+/u);
    return { pid, pgid: Number(fields[2]), environment, executable: readlinkSync(`/proc/${pid}/exe`), cwd: readlinkSync(`/proc/${pid}/cwd`), cmdline: readFileSync(`/proc/${pid}/cmdline`).toString("utf8").split("\0").filter(Boolean) };
  } catch { return null; }
}

export function enumerateAuthorityProcesses(authority) {
  const matches = [];
  for (const name of readdirSync("/proc")) {
    if (!/^\d+$/u.test(name)) continue;
    const identity = procIdentity(Number(name)); if (!identity) continue;
    const env = identity.environment;
    if (env.ROLLBACK_RUNTIME_NONCE !== authority.runtimeNonce || env.ROLLBACK_RUN_ID !== authority.labels["jinhu.rollback.run_id"] || env.ROLLBACK_FINAL_SHA !== authority.labels["jinhu.rollback.final_sha"] || env.ROLLBACK_CASE_ID !== authority.labels["jinhu.rollback.case_id"]) continue;
    if (identity.executable !== authority.expectedExecutable || env.ROLLBACK_EXPECTED_EXECUTABLE !== authority.expectedExecutable || env.ROLLBACK_COMMAND_SPEC_SHA256 !== authority.commandSpecSha256 || !inside(authority.worktree, identity.cwd) || !["api", "web"].includes(env.ROLLBACK_PROCESS_ROLE) || !Number.isSafeInteger(identity.pgid) || identity.pgid < 2) throw new Error(`refusing to kill unverified authority-tagged process ${identity.pid}`);
    if (identity.pid === identity.pgid && !identity.cmdline.includes(env.ROLLBACK_COMMAND_MARKER)) throw new Error(`refusing to kill authority leader with unexpected command ${identity.pid}`);
    matches.push({ ...identity, role: env.ROLLBACK_PROCESS_ROLE });
  }
  return matches;
}

export async function terminateAuthorityProcesses(authority, processEntries) {
  const groups = [...new Set(processEntries.map(({ pgid }) => pgid))];
  for (const pgid of groups) { try { process.kill(-pgid, "SIGTERM"); } catch { /* already exited */ } }
  for (let attempt = 0; attempt < 30 && enumerateAuthorityProcesses(authority).length > 0; attempt += 1) await delay(100);
  for (const { pgid } of enumerateAuthorityProcesses(authority)) { try { process.kill(-pgid, "SIGKILL"); } catch { /* already exited */ } }
  for (let attempt = 0; attempt < 30 && enumerateAuthorityProcesses(authority).length > 0; attempt += 1) await delay(100);
  return enumerateAuthorityProcesses(authority).length;
}

export function readBoundRuntimeLease(authority) {
  if (!existsSync(authority.runtimeManifest)) return null;
  if (lstatSync(authority.runtimeManifest).isSymbolicLink()) throw new Error("runtime lease is a symlink");
  return validateRuntimeLease(readJson(authority.runtimeManifest), authority);
}
