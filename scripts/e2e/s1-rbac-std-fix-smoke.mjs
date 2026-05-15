import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const apiBase = process.env.E2E_API_BASE ?? "http://127.0.0.1:3001/api/v1";
const tenantId = process.env.E2E_TENANT_ID ?? "10000001";
const parkId = process.env.E2E_PARK_ID ?? "20000001";
const adminUser = process.env.E2E_ADMIN_USERNAME ?? "admin";
const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? "Jinhu@123456";

let apiProcess = null;

function getPnpmBin() {
  if (process.env.PNPM_BIN) return process.env.PNPM_BIN;
  const bundled = resolve(rootDir, ".tools/pnpm");
  return existsSync(bundled) ? bundled : "pnpm";
}

function logStep(message) {
  console.log(`[s1-rbac-std-fix] ${message}`);
}

async function request(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, options);
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json") ? await response.json().catch(() => null) : await response.text();
  return { response, body };
}

async function jsonRequest(path, token, method, body) {
  return request(path, {
    method,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      "x-idempotency-key": `s1-rbac-std-fix-${Date.now()}-${randomUUID()}`
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

async function login() {
  return request("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-request-id": `s1-rbac-std-fix-login-${randomUUID()}` },
    body: JSON.stringify({ tenantId, parkId, username: adminUser, password: adminPassword })
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertStatus(name, actual, expected) {
  if (actual !== expected) throw new Error(`${name} expected HTTP ${expected}, got ${actual}`);
  logStep(`${name}: HTTP ${actual}`);
}

async function isApiReachable() {
  try {
    const { response } = await request("/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenantId, parkId, username: adminUser, password: "bad-password" })
    });
    return response.status === 401;
  } catch {
    return false;
  }
}

async function waitForApi() {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (await isApiReachable()) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 1000));
  }
  throw new Error(`API did not become reachable at ${apiBase}`);
}

async function ensureApiStarted() {
  if (await isApiReachable()) {
    logStep(`API reachable: ${apiBase}`);
    return;
  }
  if (process.env.E2E_NO_API_START === "1") throw new Error(`API is not reachable at ${apiBase}`);
  logStep("API not reachable, starting @jinhu/api for smoke test");
  apiProcess = spawn(getPnpmBin(), ["--filter", "@jinhu/api", "start"], {
    cwd: rootDir,
    detached: true,
    stdio: "ignore",
    env: { ...process.env }
  });
  apiProcess.unref();
  await waitForApi();
}

function items(body) {
  return body?.data?.items ?? body?.data ?? [];
}

async function enabledModuleCodes(token) {
  const user = await currentUserContext(token);
  return (user.enabled_modules ?? []).map((module) => module.module_code ?? module.moduleCode ?? module.code);
}

async function currentUserContext(token) {
  const me = await request("/users/me", { headers: { authorization: `Bearer ${token}` } });
  assertStatus("users/me", me.response.status, 200);
  return me.body?.data ?? {};
}

async function run() {
  await ensureApiStarted();
  const adminLogin = await login();
  assertStatus("admin login", adminLogin.response.status, 200);
  const adminToken = adminLogin.body?.data?.accessToken;
  assert(adminToken, "admin login did not return accessToken");

  assert(adminLogin.body?.data?.user?.tenantId === tenantId, "JWT auth user tenantId is not using SaaS scope id");
  assert(adminLogin.body?.data?.user?.parkId === parkId, "JWT auth user parkId is not using SaaS scope id");

  const userContext = await currentUserContext(adminToken);
  assert(userContext.tenant_id === tenantId, "users/me tenant_id is not using SaaS scope id");
  assert(userContext.park_id === parkId, "users/me park_id is not using SaaS scope id");
  assert(userContext.current_park?.tenant_id === tenantId, "users/me current_park tenant_id is missing or mismatched");
  assert(userContext.current_park?.park_id === parkId, "users/me current_park park_id is missing or mismatched");
  assert(
    Array.isArray(userContext.accessible_parks) &&
      userContext.accessible_parks.some((park) => park.tenant_id === tenantId && park.park_id === parkId && park.is_default === true),
    "users/me accessible_parks does not include the database-backed default park"
  );

  const beforeModules = await enabledModuleCodes(adminToken);
  assert(beforeModules.includes("ai"), "ai module should be enabled before destructive authorization test");
  assert(beforeModules.includes("asset"), "asset module should be enabled before backend module guard test");

  const tenantModules = await request("/tenant-modules?page=1&page_size=100", {
    headers: { authorization: `Bearer ${adminToken}` }
  });
  assertStatus("tenant module list", tenantModules.response.status, 200);
  const tenantModuleItems = items(tenantModules.body);
  const aiTenantModule = tenantModuleItems.find((item) => (item.module?.moduleCode ?? item.module_code) === "ai");
  assert(aiTenantModule?.moduleId || aiTenantModule?.module?.id, "ai tenant module authorization is missing");
  const aiModuleId = aiTenantModule.moduleId ?? aiTenantModule.module.id;
  const assetTenantModule = tenantModuleItems.find((item) => (item.module?.moduleCode ?? item.module_code) === "asset");
  assert(assetTenantModule?.moduleId || assetTenantModule?.module?.id, "asset tenant module authorization is missing");
  const assetModuleId = assetTenantModule.moduleId ?? assetTenantModule.module.id;

  try {
    const disabled = await jsonRequest(`/tenant-modules/${aiModuleId}/disable`, adminToken, "POST");
    assertStatus("disable ai module", disabled.response.status, 201);
    const disabledModules = await enabledModuleCodes(adminToken);
    assert(!disabledModules.includes("ai"), "ai module is still visible in enabled_modules after disable");
    logStep("ai module hidden from users/me enabled_modules after disable");
  } finally {
    const enabled = await jsonRequest(`/tenant-modules/${aiModuleId}/enable`, adminToken, "POST");
    assertStatus("restore ai module", enabled.response.status, 201);
  }

  try {
    const disabled = await jsonRequest(`/tenant-modules/${assetModuleId}/disable`, adminToken, "POST");
    assertStatus("disable asset module", disabled.response.status, 201);
    const disabledModules = await enabledModuleCodes(adminToken);
    assert(!disabledModules.includes("asset"), "asset module is still visible in enabled_modules after disable");

    const deniedByModuleGuard = await request("/assets/statistics", {
      headers: { authorization: `Bearer ${adminToken}` }
    });
    assertStatus("asset endpoint denied by module guard", deniedByModuleGuard.response.status, 403);
    logStep("asset backend endpoint denied after tenant module disable");
  } finally {
    const enabled = await jsonRequest(`/tenant-modules/${assetModuleId}/enable`, adminToken, "POST");
    assertStatus("restore asset module", enabled.response.status, 201);
  }

  const afterModules = await enabledModuleCodes(adminToken);
  assert(afterModules.includes("ai"), "ai module was not restored after destructive authorization test");
  assert(afterModules.includes("asset"), "asset module was not restored after backend module guard test");
  logStep("S1-RBAC-STD-FIX smoke test passed");
}

run()
  .catch((error) => {
    console.error(`[s1-rbac-std-fix] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(() => {
    if (apiProcess) {
      try {
        process.kill(-apiProcess.pid, "SIGTERM");
      } catch {
        apiProcess.kill("SIGTERM");
      }
    }
  });
