import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { connect } from "node:net";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { URL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { withHardTimeout } from "./timeout.mjs";
import { readBoundRuntimeLease, writeRuntimeLeaseAtomic } from "./runtime-lease.mjs";
import { assertNoSensitiveData, redactSensitiveData } from "./lib.mjs";

function required(name, minimum = 1) {
  const value = process.env[name];
  if (typeof value !== "string" || value.length < minimum) throw new Error(`service smoke requires ${name}`);
  return value;
}

async function assertPortFree(port) {
  await new Promise((accept, reject) => {
    const socket = connect({ host: "127.0.0.1", port });
    socket.once("connect", () => { socket.destroy(); reject(new Error(`authority port already in use: ${port}`)); });
    socket.once("error", (error) => {
      socket.destroy();
      if (error?.code === "ECONNREFUSED") accept();
      else reject(new Error(`authority port probe failed: ${port}`));
    });
    socket.setTimeout(1000, () => { socket.destroy(); reject(new Error(`authority port probe timed out: ${port}`)); });
  });
}

async function request(url, options, expected, signal) {
  const response = await globalThis.fetch(url, { ...options, redirect: "manual", signal });
  if (!expected.includes(response.status)) throw new Error(`unexpected HTTP ${response.status} for ${new URL(url).pathname}`);
  return response;
}

async function waitReady(url, validator, signal) {
  let last = "no response";
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try { const response = await request(url, {}, [200], signal); const body = await response.json(); if (!validator(body)) throw new Error("health payload contract mismatch"); return body; } catch (error) { last = error.message; }
    await delay(500, undefined, { signal });
  }
  throw new Error(`service readiness failed: ${last}`);
}

function spawnGroup(executable, args, cwd, env) {
  const child = spawn(executable, args, { cwd, env, detached: true, stdio: ["ignore", "ignore", "ignore"] });
  if (!child.pid) throw new Error("service process group did not start");
  return child;
}

function groupExists(pid) { try { process.kill(-pid, 0); return true; } catch { return false; } }

async function stopGroup(child) {
  if (!child?.pid || !groupExists(child.pid)) return;
  try { process.kill(-child.pid, "SIGTERM"); } catch { /* already exited */ }
  for (let count = 0; count < 50 && groupExists(child.pid); count += 1) await delay(100);
  if (groupExists(child.pid)) { try { process.kill(-child.pid, "SIGKILL"); } catch { /* already exited */ } }
  for (let count = 0; count < 50 && groupExists(child.pid); count += 1) await delay(100);
  if (groupExists(child.pid)) throw new Error(`service process group remains: ${child.pid}`);
}

export function serviceAuthorityEnvironment(authority, executable) {
  return {
    ROLLBACK_RUNTIME_NONCE: authority.runtimeNonce,
    ROLLBACK_RUN_ID: authority.labels["jinhu.rollback.run_id"],
    ROLLBACK_FINAL_SHA: authority.labels["jinhu.rollback.final_sha"],
    ROLLBACK_CASE_ID: authority.labels["jinhu.rollback.case_id"],
    ROLLBACK_EXPECTED_EXECUTABLE: executable,
    ROLLBACK_COMMAND_SPEC_SHA256: authority.commandSpecSha256
  };
}

export function combineServiceSmokeErrors(primaryError, cleanupErrors) {
  const failures = cleanupErrors.filter(Boolean);
  const message = (error) => error instanceof Error ? error.message : String(error);
  if (primaryError && failures.length > 0) return new Error(`${message(primaryError)}; service cleanup failed: ${failures.map(message).join("; ")}`);
  if (primaryError) return primaryError instanceof Error ? primaryError : new Error(message(primaryError));
  if (failures.length > 0) return new Error(`service cleanup failed: ${failures.map(message).join("; ")}`);
  return null;
}

export async function runServiceSmoke({ worktree, stage, signal }) {
  if (!new Set(["baseline", "rollback"]).has(stage)) throw new Error("service smoke stage must be baseline or rollback");
  const apiPort = Number(required("ROLLBACK_API_PORT")); const webPort = Number(required("ROLLBACK_WEB_PORT"));
  if (!Number.isInteger(apiPort) || !Number.isInteger(webPort) || apiPort === webPort) throw new Error("invalid authority ports");
  const node = realpathSync(process.execPath);
  const authority = {
    runtimeNonce: required("ROLLBACK_LEASE_NONCE"), worktree,
    labels: { "jinhu.rollback.run_id": required("ROLLBACK_LEASE_RUN_ID"), "jinhu.rollback.final_sha": required("ROLLBACK_LEASE_FINAL_SHA"), "jinhu.rollback.case_id": required("ROLLBACK_LEASE_CASE_ID") },
    apiPort, webPort, runtimeManifest: required("ROLLBACK_RUNTIME_MANIFEST"), expectedExecutable: required("ROLLBACK_LEASE_EXPECTED_EXECUTABLE"),
    commandSpecSha256: required("ROLLBACK_COMMAND_SPEC_SHA256")
  };
  let lease = readBoundRuntimeLease(authority); if (!lease || lease.expectedExecutable !== node) throw new Error("runner-owned runtime lease is missing or stale");
  let api; let web; let smokeResult; let primaryError = null; const cleanupErrors = [];
  try {
    await assertPortFree(apiPort); await assertPortFree(webPort);
    lease = { ...lease, status: "PENDING", stage, groups: { api: null, web: null } }; writeRuntimeLeaseAtomic(authority.runtimeManifest, lease, authority);
    const next = realpathSync(resolve(worktree, "apps/web/node_modules/next/dist/bin/next"));
    const apiCandidates = [resolve(worktree, "apps/api/dist/main.js"), resolve(worktree, "apps/api/dist/apps/api/src/main.js")].filter(existsSync);
    if (apiCandidates.length !== 1) throw new Error("API production build entry is missing or ambiguous");
    const apiOrigin = `http://127.0.0.1:${apiPort}`; const webOrigin = `http://127.0.0.1:${webPort}`;
    const common = { PATH: `${dirname(node)}:/usr/bin:/bin`, LANG: "C.UTF-8", TZ: "UTC", NODE_ENV: "production" };
    const authorityEnv = serviceAuthorityEnvironment(authority, node);
    const apiEnv = {
      ...common, APP_PORT: String(apiPort), WEB_ORIGIN: webOrigin,
      ...authorityEnv, ROLLBACK_PROCESS_ROLE: "api", ROLLBACK_COMMAND_MARKER: apiCandidates[0],
      POSTGRES_HOST: required("POSTGRES_HOST"), POSTGRES_PORT: required("POSTGRES_PORT"), POSTGRES_DB: required("POSTGRES_DB"), POSTGRES_USER: required("POSTGRES_USER"), POSTGRES_PASSWORD: required("POSTGRES_PASSWORD"),
      JWT_SECRET: required("JWT_SECRET", 32), PARTY_DATA_ENCRYPTION_KEY: required("PARTY_DATA_ENCRYPTION_KEY", 32),
      DEFAULT_TENANT_ID: required("ROLLBACK_TENANT_ID"), DEFAULT_PARK_ID: required("ROLLBACK_PARK_ID"),
      AUTH_SMS_FIXED_CODE: "", AUTH_SMS_CODE_VISIBLE: "false", AUTH_WECHAT_MOCK_ENABLED: "false"
    };
    const webEnv = { ...common, ...authorityEnv, ROLLBACK_PROCESS_ROLE: "web", ROLLBACK_COMMAND_MARKER: next, WEB_PORT: String(webPort), NEXT_PUBLIC_API_TARGET: apiOrigin };
    api = spawnGroup(node, [apiCandidates[0]], resolve(worktree, "apps/api"), apiEnv);
    lease = { ...lease, status: "RUNNING", groups: { ...lease.groups, api: { role: "api", pid: api.pid, pgid: api.pid, executable: node, cwd: resolve(worktree, "apps/api"), commandMarker: apiCandidates[0] } } }; writeRuntimeLeaseAtomic(authority.runtimeManifest, lease, authority);
    web = spawnGroup(node, [next, "start", "-p", String(webPort), "-H", "127.0.0.1"], resolve(worktree, "apps/web"), webEnv);
    lease = { ...lease, groups: { ...lease.groups, web: { role: "web", pid: web.pid, pgid: web.pid, executable: node, cwd: resolve(worktree, "apps/web"), commandMarker: next } } }; writeRuntimeLeaseAtomic(authority.runtimeManifest, lease, authority);
    smokeResult = await withHardTimeout(async (bounded) => {
      await waitReady(`${apiOrigin}/api/v1/health`, (body) => body?.data?.status === "ok", bounded);
      await waitReady(`${apiOrigin}/api/v1/ready`, (body) => body?.status === "ready", bounded);
      await request(`${webOrigin}/login`, {}, [200], bounded);
      const login = await request(`${webOrigin}/api/v1/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: required("ROLLBACK_ADMIN_USERNAME"), password: required("ROLLBACK_ADMIN_PASSWORD"), tenantId: required("ROLLBACK_TENANT_ID"), parkId: required("ROLLBACK_PARK_ID") }) }, [200], bounded);
      const payload = await login.json(); const token = payload?.data?.accessToken ?? payload?.accessToken;
      if (typeof token !== "string" || token.length < 20) throw new Error("real admin login did not return an access token");
      const headers = { authorization: `Bearer ${token}` };
      await request(`${webOrigin}/api/v1/homestay/dashboard`, { headers }, [200], bounded);
      await request(`${webOrigin}/api/v1/housing/dashboard`, { headers }, [200], bounded);
      return { status: "PASS", stage, apiPort, webPort, webBuildIdSha256: createHash("sha256").update(readFileSync(resolve(worktree, "apps/web/.next/BUILD_ID"))).digest("hex"), checks: ["api-health", "api-ready", "web-login-page", "web-rewrite-admin-login", "web-rewrite-homestay-dashboard", "web-rewrite-housing-dashboard"] };
    }, 120_000, `${stage} authenticated service smoke`, signal);
  } catch (error) {
    primaryError = error;
  } finally {
    const stopped = await Promise.allSettled([stopGroup(web), stopGroup(api)]);
    for (const result of stopped) if (result.status === "rejected") cleanupErrors.push(result.reason instanceof Error ? result.reason : new Error("service process group cleanup rejected"));
    if (api?.pid && groupExists(api.pid)) cleanupErrors.push(new Error("API process group cleanup failed"));
    if (web?.pid && groupExists(web.pid)) cleanupErrors.push(new Error("Web process group cleanup failed"));
    try { await assertPortFree(apiPort); } catch (error) { cleanupErrors.push(error); }
    try { await assertPortFree(webPort); } catch (error) { cleanupErrors.push(error); }
    try { lease = { ...lease, status: "STOPPED" }; writeRuntimeLeaseAtomic(authority.runtimeManifest, lease, authority); }
    catch (error) { cleanupErrors.push(error); }
  }
  const terminalError = combineServiceSmokeErrors(primaryError, cleanupErrors);
  if (terminalError) throw terminalError;
  return smokeResult;
}

function parse(argv) {
  if (argv.length !== 4 || argv[0] !== "--worktree" || argv[2] !== "--stage") throw new Error("usage: service-smoke.mjs --worktree <path> --stage <baseline|rollback>");
  return { worktree: argv[1], stage: argv[3] };
}

export function formatServiceSmokeFailure(error) {
  const rawMessage = error instanceof Error ? error.message : String(error ?? "unknown service smoke failure");
  const redactedMessage = redactSensitiveData(rawMessage);
  let safeMessage = redactedMessage;
  try { assertNoSensitiveData(redactedMessage, "service smoke failure"); }
  catch { safeMessage = "service smoke failed with redacted sensitive details"; }
  const output = JSON.stringify({ schemaVersion: "property-track-c-service-smoke-error-v1", status: "FAIL", error: safeMessage });
  assertNoSensitiveData(output, "serialized service smoke failure");
  return `${output}\n`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try { process.stdout.write(`${JSON.stringify(await runServiceSmoke(parse(process.argv.slice(2))))}\n`); }
  catch (error) { process.stderr.write(formatServiceSmokeFailure(error)); process.exitCode = 1; }
}
