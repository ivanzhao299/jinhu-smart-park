import { randomUUID } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const execFileAsync = promisify(execFile);
const apiBase = process.env.E2E_API_BASE ?? "http://127.0.0.1:3001/api/v1";
const composeFile = process.env.COMPOSE_FILE ?? resolve(rootDir, "infra/docker/docker-compose.yml");
const postgresUser = process.env.POSTGRES_USER ?? "jinhu";
const postgresDb = process.env.POSTGRES_DB ?? "jinhu_smart_park";
const tenantId = process.env.E2E_TENANT_ID ?? "10000001";
const parkId = process.env.E2E_PARK_ID ?? "20000001";
const adminUser = process.env.E2E_ADMIN_USERNAME ?? "admin";
const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? "Jinhu@123456";
const normalUser = process.env.E2E_NORMAL_USERNAME ?? "s1_user";
const normalPassword = process.env.E2E_NORMAL_PASSWORD ?? "Jinhu@123456";
const stamp = Date.now();
const smokeRemark = `S9D IoT scene center smoke ${stamp}`;

let apiProcess = null;

function getPnpmBin() {
  if (process.env.PNPM_BIN) return process.env.PNPM_BIN;
  const bundled = resolve(rootDir, ".tools/pnpm");
  return existsSync(bundled) ? bundled : "pnpm";
}

function logStep(message) {
  console.log(`[s9d-iot-scene-center-smoke] ${message}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertStatus(name, actual, expected) {
  const allowed = Array.isArray(expected) ? expected : [expected];
  if (!allowed.includes(actual)) throw new Error(`${name} expected HTTP ${allowed.join(" or ")}, got ${actual}`);
  logStep(`${name}: HTTP ${actual}`);
}

function assertUniformResponse(name, body) {
  assert(body && typeof body === "object", `${name} did not return JSON`);
  for (const key of ["code", "message", "data", "request_id", "server_time"]) {
    assert(Object.hasOwn(body, key), `${name} response is missing ${key}`);
  }
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

async function request(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, options);
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json") ? await response.json().catch(() => null) : await response.text();
  return { response, body };
}

async function jsonRequest(path, token, method, body, label = "request") {
  return request(path, {
    method,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      "x-idempotency-key": `s9d-iot-scene-${stamp}-${label}-${randomUUID()}`
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

async function login(username, password) {
  return request("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-request-id": `s9d-login-${randomUUID()}` },
    body: JSON.stringify({ tenantId, parkId, username, password })
  });
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
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (await isApiReachable()) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 1_000));
  }
  throw new Error(`API did not become reachable at ${apiBase}`);
}

async function ensureApiStarted() {
  if (await isApiReachable()) {
    logStep(`API reachable: ${apiBase}`);
    return;
  }
  if (process.env.E2E_NO_API_START === "1") throw new Error(`API is not reachable at ${apiBase}`);
  logStep("API not reachable, starting @jinhu/api for S9-D IoT scene smoke test");
  apiProcess = spawn(getPnpmBin(), ["--filter", "@jinhu/api", "start"], {
    cwd: rootDir,
    detached: true,
    stdio: "ignore",
    env: { ...process.env, IOT_RULE_WEBHOOK_ALLOWLIST: process.env.IOT_RULE_WEBHOOK_ALLOWLIST ?? "localhost,127.0.0.1" }
  });
  apiProcess.unref();
  await waitForApi();
}

async function psql(sql) {
  const { stdout } = await execFileAsync("docker", [
    "compose",
    "-f",
    composeFile,
    "exec",
    "-T",
    "postgres",
    "psql",
    "-U",
    postgresUser,
    "-d",
    postgresDb,
    "-t",
    "-A",
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    sql
  ]);
  return stdout.trim();
}

function extractItems(body) {
  return body?.data?.items ?? body?.data?.rows ?? [];
}

async function dbCount(name, sql, minimum = 1) {
  const value = Number(await psql(sql));
  assert(Number.isFinite(value), `${name} did not return a numeric count`);
  assert(value >= minimum, `${name} expected at least ${minimum}, got ${value}`);
  logStep(`${name}: ${value}`);
}

async function createRule(token) {
  const created = await jsonRequest("/iot/rules", token, "POST", {
    rule_name: `S9D linked rule ${stamp}`,
    rule_type: "MANUAL",
    trigger_scope: "PARK",
    condition_json: { always: true },
    action_json: [{ type: "SEND_NOTIFICATION", content: "scene linked rule smoke" }],
    priority: 100,
    status: "ENABLED",
    remark: smokeRemark
  }, "create-linked-rule");
  assertStatus("create linked rule", created.response.status, 201);
  assertUniformResponse("create linked rule", created.body);
  assert(created.body.data?.id, "Linked rule response missing id");
  return created.body.data;
}

async function main() {
  await ensureApiStarted();

  const adminLogin = await login(adminUser, adminPassword);
  assertStatus("admin login", adminLogin.response.status, 200);
  assertUniformResponse("admin login", adminLogin.body);
  const adminToken = adminLogin.body.data?.access_token ?? adminLogin.body.data?.accessToken;
  assert(adminToken, "Admin login did not return an access token");

  const normalLogin = await login(normalUser, normalPassword);
  assertStatus("normal login", normalLogin.response.status, 200);
  assertUniformResponse("normal login", normalLogin.body);
  const normalToken = normalLogin.body.data?.access_token ?? normalLogin.body.data?.accessToken;
  assert(normalToken, "Normal login did not return an access token");

  const templateList = await jsonRequest("/iot/scenes/templates?scene_type=night_patrol&page_size=5", adminToken, "GET", undefined, "list-system-templates");
  assertStatus("list system templates", templateList.response.status, 200);
  assertUniformResponse("list system templates", templateList.body);
  const systemTemplate = extractItems(templateList.body).find((item) => item.isSystem || item.is_system);
  assert(systemTemplate?.id, "System scene template should exist");

  const deleteSystem = await jsonRequest(`/iot/scenes/templates/${systemTemplate.id}`, adminToken, "DELETE", undefined, "delete-system-template");
  assertStatus("system template cannot be deleted", deleteSystem.response.status, [400, 403]);

  const customTemplate = await jsonRequest("/iot/scenes/templates", adminToken, "POST", {
    scene_name: `S9D custom template ${stamp}`,
    scene_type: "custom",
    description: "smoke custom template",
    trigger_config_json: { mode: "manual" },
    action_config_json: [{ type: "SEND_NOTIFICATION", content: "custom scene template" }],
    status: "ENABLED",
    remark: smokeRemark
  }, "create-custom-template");
  assertStatus("create custom template", customTemplate.response.status, 201);
  assertUniformResponse("create custom template", customTemplate.body);
  assert(customTemplate.body.data?.id, "Custom template response missing id");

  const linkedRule = await createRule(adminToken);
  const scene = await jsonRequest("/iot/scenes/instances", adminToken, "POST", {
    template_id: customTemplate.body.data.id,
    scene_name: `S9D scene ${stamp}`,
    scene_type: "custom",
    trigger_mode: "MANUAL",
    linked_rule_id: linkedRule.id,
    action_config_json: [
      { type: "SEND_NOTIFICATION", content: "scene action ok" },
      { type: "TRIGGER_LED_SCREEN", simulate_status: "FAILED", error_message: "smoke partial failure" }
    ],
    priority: 5,
    status: "DISABLED",
    remark: smokeRemark
  }, "create-scene");
  assertStatus("create scene", scene.response.status, 201);
  assertUniformResponse("create scene", scene.body);
  const sceneId = scene.body.data?.id;
  assert(sceneId, "Scene response missing id");

  const triggerDisabled = await jsonRequest(`/iot/scenes/instances/${sceneId}/trigger`, adminToken, "POST", {
    trigger_type: "MANUAL",
    reason: "disabled should fail"
  }, "trigger-disabled-scene");
  assertStatus("disabled scene cannot trigger", triggerDisabled.response.status, 400);

  const enabled = await jsonRequest(`/iot/scenes/instances/${sceneId}/enable`, adminToken, "POST", {}, "enable-scene");
  assertStatus("enable scene", enabled.response.status, 201);
  assertUniformResponse("enable scene", enabled.body);
  assert(enabled.body.data.status === "ENABLED", "Scene should be enabled");

  const triggered = await jsonRequest(`/iot/scenes/instances/${sceneId}/trigger`, adminToken, "POST", {
    trigger_type: "MANUAL",
    reason: "smoke trigger",
    trigger_payload: { source: "s9d-smoke", secret_token: "should-redact" }
  }, "trigger-scene");
  assertStatus("trigger scene", triggered.response.status, 201);
  assertUniformResponse("trigger scene", triggered.body);
  assert(triggered.body.data.executionStatus === "PARTIAL_SUCCESS", "Scene trigger should record partial success");
  assert(triggered.body.data.triggerPayload?.secret_token === "***", "Secret payload should be redacted");

  const logs = await jsonRequest(`/iot/scenes/instances/${sceneId}/execution-logs?page_size=5`, adminToken, "GET", undefined, "scene-logs");
  assertStatus("scene execution logs", logs.response.status, 200);
  assertUniformResponse("scene execution logs", logs.body);
  assert(extractItems(logs.body).some((item) => item.id === triggered.body.data.id), "Triggered log should be listed");

  const disabled = await jsonRequest(`/iot/scenes/instances/${sceneId}/disable`, adminToken, "POST", {}, "disable-scene");
  assertStatus("disable scene", disabled.response.status, 201);
  assertUniformResponse("disable scene", disabled.body);
  assert(disabled.body.data.status === "DISABLED", "Scene should be disabled");

  const normalCreate = await jsonRequest("/iot/scenes/instances", normalToken, "POST", {
    scene_name: "normal user scene denied",
    scene_type: "custom",
    trigger_mode: "MANUAL",
    action_config_json: [{ type: "SEND_NOTIFICATION" }],
    status: "DISABLED"
  }, "normal-create-scene");
  assertStatus("normal user create scene denied", normalCreate.response.status, 403);

  const isolatedName = `S9D isolated scene ${stamp}`;
  await psql(`
INSERT INTO scene_instance (
  tenant_id, park_id, scene_name, scene_type, trigger_mode, status, priority, trigger_config_json, action_config_json, is_deleted, create_time, update_time
) VALUES (
  'TENANT-S9D-OTHER',
  'PARK-S9D-OTHER',
  ${sqlLiteral(isolatedName)},
  'custom',
  'MANUAL',
  'ENABLED',
  100,
  '{}'::jsonb,
  '[{"type":"SEND_NOTIFICATION"}]'::jsonb,
  false,
  NOW(),
  NOW()
);`);
  const isolatedList = await jsonRequest(`/iot/scenes/instances?keyword=${encodeURIComponent(isolatedName)}`, adminToken, "GET", undefined, "tenant-isolation");
  assertStatus("tenant isolation list", isolatedList.response.status, 200);
  assertUniformResponse("tenant isolation list", isolatedList.body);
  assert(extractItems(isolatedList.body).length === 0, "Cross-tenant scene leaked into current tenant query");

  await dbCount(
    "scene execution logs",
    `SELECT COUNT(*) FROM scene_execution_log
     WHERE tenant_id = ${sqlLiteral(tenantId)}
       AND park_id = ${sqlLiteral(parkId)}
       AND scene_instance_id = ${sqlLiteral(sceneId)}
       AND create_time > NOW() - INTERVAL '30 minutes'`,
    1
  );
  await dbCount(
    "scene audit logs",
    `SELECT COUNT(*) FROM sys_op_log
     WHERE tenant_id = ${sqlLiteral(tenantId)}
       AND park_id = ${sqlLiteral(parkId)}
       AND resource = 'biz.scene_instance'
       AND create_time > NOW() - INTERVAL '30 minutes'`,
    3
  );

  logStep("S9-D IoT scene center smoke passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
