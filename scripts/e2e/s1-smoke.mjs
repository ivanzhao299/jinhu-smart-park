import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const apiBase = process.env.E2E_API_BASE ?? "http://127.0.0.1:3001/api/v1";
const tenantId = process.env.E2E_TENANT_ID ?? "00000000-0000-4000-8000-000000000001";
const parkId = process.env.E2E_PARK_ID ?? "00000000-0000-4000-8000-000000000101";
const adminUser = process.env.E2E_ADMIN_USERNAME ?? "admin";
const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? "Jinhu@123456";
const normalUser = process.env.E2E_NORMAL_USERNAME ?? "s1_user";
const normalPassword = process.env.E2E_NORMAL_PASSWORD ?? "Jinhu@123456";
const stamp = Date.now();

let apiProcess = null;

function getPnpmBin() {
  if (process.env.PNPM_BIN) {
    return process.env.PNPM_BIN;
  }
  const bundled = resolve(rootDir, ".tools/pnpm");
  return existsSync(bundled) ? bundled : "pnpm";
}

function logStep(message) {
  console.log(`[s1-smoke] ${message}`);
}

async function request(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, options);
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json") ? await response.json().catch(() => null) : await response.text();
  return { response, body };
}

async function login(username, password) {
  return request("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tenantId, parkId, username, password })
  });
}

async function jsonRequest(path, token, method, body) {
  return request(path, {
    method,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      "x-idempotency-key": `s1-smoke-${stamp}-${randomUUID()}`
    },
    body: JSON.stringify(body)
  });
}

function assertStatus(name, actual, expected) {
  if (actual !== expected) {
    throw new Error(`${name} expected HTTP ${expected}, got ${actual}`);
  }
  logStep(`${name}: HTTP ${actual}`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
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
    if (await isApiReachable()) {
      return;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 1000));
  }
  throw new Error(`API did not become reachable at ${apiBase}`);
}

async function ensureApiStarted() {
  if (await isApiReachable()) {
    logStep(`API reachable: ${apiBase}`);
    return;
  }

  if (process.env.E2E_NO_API_START === "1") {
    throw new Error(`API is not reachable at ${apiBase}`);
  }

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

async function run() {
  await ensureApiStarted();

  const adminLogin = await login(adminUser, adminPassword);
  assertStatus("admin login", adminLogin.response.status, 200);
  const adminToken = adminLogin.body?.data?.accessToken;
  assert(adminToken, "admin login did not return accessToken");
  assert(adminLogin.body?.request_id, "uniform response request_id is missing");

  const normalLogin = await login(normalUser, normalPassword);
  assertStatus("normal login", normalLogin.response.status, 200);
  const normalToken = normalLogin.body?.data?.accessToken;
  assert(normalToken, "normal login did not return accessToken");

  const failedLogin = await login(adminUser, "wrong-password");
  assertStatus("failed login", failedLogin.response.status, 401);

  const noTokenMe = await request("/users/me");
  assertStatus("users/me without token", noTokenMe.response.status, 401);

  const adminMe = await request("/users/me", { headers: { authorization: `Bearer ${adminToken}` } });
  assertStatus("admin users/me", adminMe.response.status, 200);
  assert(adminMe.body?.data?.tenant_id && adminMe.body?.data?.park_id, "users/me scope is missing");
  assert(Array.isArray(adminMe.body?.data?.roles), "users/me roles are missing");
  assert(Array.isArray(adminMe.body?.data?.permissions), "users/me permissions are missing");

  const normalAudit = await request("/audit/op-logs", { headers: { authorization: `Bearer ${normalToken}` } });
  assertStatus("normal audit denied", normalAudit.response.status, 403);

  const adminAudit = await request("/audit/op-logs", { headers: { authorization: `Bearer ${adminToken}` } });
  assertStatus("admin audit allowed", adminAudit.response.status, 200);

  const form = new FormData();
  form.append("biz_type", "contract");
  form.append("biz_id", randomUUID());
  form.append("remark", "S1 smoke attachment");
  form.append("file", new Blob(["S1 smoke test"], { type: "application/pdf" }), "s1-smoke.pdf");
  const upload = await request("/files", {
    method: "POST",
    headers: {
      authorization: `Bearer ${adminToken}`,
      "x-idempotency-key": `s1-file-${stamp}`
    },
    body: form
  });
  assertStatus("file upload", upload.response.status, 201);
  const fileId = upload.body?.data?.id;
  assert(fileId, "file upload did not return id");

  const normalDownload = await request(`/files/${fileId}/download`, {
    headers: { authorization: `Bearer ${normalToken}` }
  });
  assertStatus("normal file download denied", normalDownload.response.status, 403);

  const adminDownload = await request(`/files/${fileId}/download`, {
    headers: { authorization: `Bearer ${adminToken}` }
  });
  assertStatus("admin file download", adminDownload.response.status, 200);

  const deleteFile = await request(`/files/${fileId}`, {
    method: "DELETE",
    headers: {
      authorization: `Bearer ${adminToken}`,
      "x-idempotency-key": `s1-file-delete-${stamp}`
    }
  });
  assertStatus("file soft delete", deleteFile.response.status, 200);

  const dictCreate = await jsonRequest("/dict-types", adminToken, "POST", {
    dictCode: `s1_smoke_${stamp}`,
    dictName: "S1冒烟字典"
  });
  assertStatus("dict create", dictCreate.response.status, 201);

  const userCreate = await jsonRequest("/users", adminToken, "POST", {
    username: `s1_smoke_user_${stamp}`,
    displayName: "S1冒烟用户",
    password: "Jinhu@123456",
    status: "enabled"
  });
  assertStatus("user create", userCreate.response.status, 201);

  const roleCreate = await jsonRequest("/roles", adminToken, "POST", {
    code: `S1_SMOKE_${stamp}`,
    name: "S1冒烟角色",
    status: "enabled"
  });
  assertStatus("role create", roleCreate.response.status, 201);
  const roleId = roleCreate.body?.data?.id;
  assert(roleId, "role create did not return id");

  const assignRoles = await jsonRequest(`/users/${userCreate.body.data.id}/roles`, adminToken, "POST", {
    roleIds: [roleId]
  });
  assertStatus("user role assignment", assignRoles.response.status, 201);

  const permissions = await request("/permissions?page=1&page_size=100", {
    headers: { authorization: `Bearer ${adminToken}` }
  });
  assertStatus("permission list", permissions.response.status, 200);
  const permissionIds = (permissions.body?.data?.items ?? [])
    .filter((permission) => ["system:user:me", "file:read"].includes(permission.code))
    .map((permission) => permission.id);
  assert(permissionIds.length > 0, "permission ids for role assignment are missing");

  const assignPermissions = await jsonRequest(`/roles/${roleId}/permissions`, adminToken, "POST", {
    permissionIds
  });
  assertStatus("role permission assignment", assignPermissions.response.status, 201);

  const opLogs = await request("/audit/op-logs?page=1&page_size=20", {
    headers: { authorization: `Bearer ${adminToken}` }
  });
  assertStatus("operation logs query", opLogs.response.status, 200);
  assert((opLogs.body?.data?.total ?? 0) > 0, "operation logs are empty");

  const loginLogs = await request("/audit/login-logs?page=1&page_size=20", {
    headers: { authorization: `Bearer ${adminToken}` }
  });
  assertStatus("login logs query", loginLogs.response.status, 200);
  assert((loginLogs.body?.data?.total ?? 0) > 0, "login logs are empty");

  logStep("S1 smoke test passed");
}

run()
  .catch((error) => {
    console.error(`[s1-smoke] ${error instanceof Error ? error.message : String(error)}`);
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
