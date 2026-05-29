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
const smokeRemark = `S9C IoT rule engine smoke ${stamp}`;

let apiProcess = null;

function getPnpmBin() {
  if (process.env.PNPM_BIN) return process.env.PNPM_BIN;
  const bundled = resolve(rootDir, ".tools/pnpm");
  return existsSync(bundled) ? bundled : "pnpm";
}

function logStep(message) {
  console.log(`[s9c-iot-rule-engine-smoke] ${message}`);
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
      "x-idempotency-key": `s9c-iot-rule-${stamp}-${label}-${randomUUID()}`
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

async function login(username, password) {
  return request("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-request-id": `s9c-login-${randomUUID()}` },
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
  logStep("API not reachable, starting @jinhu/api for S9-C IoT rule smoke test");
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

async function dbCount(name, sql, minimum = 1) {
  const value = Number(await psql(sql));
  assert(Number.isFinite(value), `${name} did not return a numeric count`);
  assert(value >= minimum, `${name} expected at least ${minimum}, got ${value}`);
  logStep(`${name}: ${value}`);
}

function extractItems(body) {
  return body?.data?.items ?? body?.data?.rows ?? [];
}

async function waitForCondition(name, fn, timeoutMs = 20_000, intervalMs = 1_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const result = await fn();
      if (result) {
        logStep(`${name}: satisfied`);
        return result;
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, intervalMs));
  }
  throw lastError ?? new Error(`${name} did not complete before timeout`);
}

async function getFixtures() {
  const unitRow = await psql(`
SELECT unit.id::text || '|' || COALESCE(unit.building_id::text, '') || '|' || COALESCE(unit.floor_id::text, '')
FROM biz_unit unit
WHERE unit.tenant_id = ${sqlLiteral(tenantId)}
  AND unit.park_id = ${sqlLiteral(parkId)}
  AND unit.is_deleted = false
ORDER BY unit.create_time ASC
LIMIT 1;`);
  assert(unitRow, "No biz_unit fixture found for S9-C smoke");
  const [unitId, buildingId, floorId] = unitRow.split("|");
  const parkTenantId = await psql(`
SELECT id::text
FROM biz_park_tenant
WHERE tenant_id = ${sqlLiteral(tenantId)}
  AND park_id = ${sqlLiteral(parkId)}
  AND is_deleted = false
ORDER BY create_time ASC
LIMIT 1;`);
  assert(parkTenantId, "No biz_park_tenant fixture found for S9-C smoke");
  return { unitId, buildingId: buildingId || undefined, floorId: floorId || undefined, parkTenantId };
}

async function createRule(token, payload, label) {
  const created = await jsonRequest("/iot/rules", token, "POST", payload, label);
  assertStatus(label, created.response.status, 201);
  assertUniformResponse(label, created.body);
  assert(created.body.data?.id, `${label} response missing id`);
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

  const fixtures = await getFixtures();
  const deviceCreated = await jsonRequest("/iot/devices", adminToken, "POST", {
    device_name: `S9C rule device ${stamp}`,
    device_type: "ENV_SENSOR",
    device_category: "RULE_ENGINE",
    vendor_device_id: `s9c-rule-${stamp}`,
    protocol_type: "MQTT",
    connection_type: "MQTT",
    building_id: fixtures.buildingId,
    floor_id: fixtures.floorId,
    unit_id: fixtures.unitId,
    park_tenant_id: fixtures.parkTenantId,
    location: `S9C rule location ${stamp}`,
    status: "enabled",
    online_status: "online",
    is_enabled: true,
    remark: smokeRemark
  }, "create-device");
  assertStatus("create device", deviceCreated.response.status, 201);
  assertUniformResponse("create device", deviceCreated.body);
  const device = deviceCreated.body.data;
  assert(device?.id, "Device create response missing id");

  const metricRule = await createRule(adminToken, {
    rule_name: `S9C metric rule ${stamp}`,
    rule_type: "METRIC",
    trigger_scope: "DEVICE",
    device_id: device.id,
    condition_json: { metric: "TEMPERATURE", operator: "gt", value: 35 },
    action_json: [{
      type: "CREATE_IOT_ALERT",
      alert_level: "HIGH",
      metric_code: "TEMPERATURE",
      title: `S9C high temperature ${stamp}`,
      content: "temperature exceeds threshold"
    }],
    priority: 10,
    status: "ENABLED",
    remark: smokeRemark
  }, "create metric rule");

  const statusRule = await createRule(adminToken, {
    rule_name: `S9C status rule ${stamp}`,
    rule_type: "STATUS",
    trigger_scope: "DEVICE",
    device_id: device.id,
    condition_json: { status: "offline", operator: "eq" },
    action_json: [{ type: "SEND_NOTIFICATION", content: "device offline" }],
    priority: 20,
    status: "ENABLED",
    remark: smokeRemark
  }, "create status rule");

  const alertRule = await createRule(adminToken, {
    rule_name: `S9C alert rule ${stamp}`,
    rule_type: "ALERT",
    trigger_scope: "PARK",
    condition_json: { alert_level: "HIGH", operator: "gte" },
    action_json: [{ type: "SEND_NOTIFICATION", content: "high alert raised" }],
    priority: 30,
    status: "ENABLED",
    remark: smokeRemark
  }, "create alert rule");

  const scheduleRule = await createRule(adminToken, {
    rule_name: `S9C schedule rule ${stamp}`,
    rule_type: "SCHEDULE",
    trigger_scope: "PARK",
    condition_json: { always: true },
    action_json: [{ type: "SEND_NOTIFICATION", content: "scheduled action" }],
    priority: 40,
    status: "ENABLED",
    remark: smokeRemark
  }, "create schedule rule");

  const listRules = await jsonRequest(`/iot/rules?keyword=${encodeURIComponent(`S9C`)}&page_size=10`, adminToken, "GET", undefined, "list-rules");
  assertStatus("list rules", listRules.response.status, 200);
  assertUniformResponse("list rules", listRules.body);
  assert(extractItems(listRules.body).some((item) => item.id === metricRule.id), "Metric rule should appear in list");

  const disabled = await jsonRequest(`/iot/rules/${scheduleRule.id}/disable`, adminToken, "POST", {}, "disable-schedule-rule");
  assertStatus("disable rule", disabled.response.status, 201);
  assertUniformResponse("disable rule", disabled.body);
  assert(disabled.body.data.status === "DISABLED", "Rule should be disabled");

  const enabled = await jsonRequest(`/iot/rules/${scheduleRule.id}/enable`, adminToken, "POST", {}, "enable-schedule-rule");
  assertStatus("enable rule", enabled.response.status, 201);
  assertUniformResponse("enable rule", enabled.body);
  assert(enabled.body.data.status === "ENABLED", "Rule should be enabled");

  const testSchedule = await jsonRequest(`/iot/rules/${scheduleRule.id}/test`, adminToken, "POST", {
    trigger_payload: { schedule_time: new Date().toISOString() }
  }, "test-schedule-rule");
  assertStatus("test schedule rule", testSchedule.response.status, 201);
  assertUniformResponse("test schedule rule", testSchedule.body);
  assert(testSchedule.body.data.executionStatus === "SUCCESS", "Schedule test should succeed");

  const metricReport = await jsonRequest(`/iot/devices/${device.id}/metrics`, adminToken, "POST", {
    reported_at: new Date().toISOString(),
    quality: "good",
    metrics: { TEMPERATURE: 42 },
    raw_payload: { smoke: smokeRemark }
  }, "metric-report");
  assertStatus("metric report", metricReport.response.status, 201);
  assertUniformResponse("metric report", metricReport.body);

  const metricLog = await waitForCondition("metric rule execution log", async () => {
    const logs = await jsonRequest(`/iot/rules/${metricRule.id}/execution-logs?execution_status=SUCCESS&page_size=5`, adminToken, "GET", undefined, "metric-rule-logs");
    if (logs.response.status !== 200) return false;
    return extractItems(logs.body).find((item) => item.triggerType === "METRIC") ?? false;
  });
  assert(metricLog, "Metric rule should create a success log");

  const createdIotAlert = await waitForCondition("metric rule creates alert", async () => {
    const alerts = await jsonRequest(`/iot/alerts?device_id=${encodeURIComponent(device.id)}&metric_code=TEMPERATURE`, adminToken, "GET", undefined, "rule-alert-list");
    if (alerts.response.status !== 200) return false;
    return extractItems(alerts.body).find((item) => item.alertTitle === `S9C high temperature ${stamp}` || item.title === `S9C high temperature ${stamp}`) ?? false;
  });
  assert(createdIotAlert, "Metric rule should create an IoT alert");

  const manualAlert = await jsonRequest("/iot/alerts", adminToken, "POST", {
    device_id: device.id,
    alert_type: "RULE_TRIGGERED",
    alert_level: "HIGH",
    title: `S9C manual alert ${stamp}`,
    description: "manual alert should trigger alert rule",
    source_type: "RULE_ENGINE",
    remark: smokeRemark
  }, "manual-alert");
  assertStatus("manual alert", manualAlert.response.status, 201);
  assertUniformResponse("manual alert", manualAlert.body);

  const alertLog = await waitForCondition("alert rule execution log", async () => {
    const logs = await jsonRequest(`/iot/rules/${alertRule.id}/execution-logs?execution_status=SUCCESS&page_size=5`, adminToken, "GET", undefined, "alert-rule-logs");
    if (logs.response.status !== 200) return false;
    return extractItems(logs.body).find((item) => item.triggerType === "ALERT") ?? false;
  });
  assert(alertLog, "Alert rule should create a success log");

  const offlineHeartbeat = await jsonRequest(`/iot/devices/${device.id}/heartbeat`, adminToken, "POST", {
    status: "offline",
    latency_ms: 0,
    raw_payload: { smoke: smokeRemark }
  }, "offline-heartbeat");
  assertStatus("offline heartbeat", offlineHeartbeat.response.status, 201);
  assertUniformResponse("offline heartbeat", offlineHeartbeat.body);

  const statusLog = await waitForCondition("status rule execution log", async () => {
    const logs = await jsonRequest(`/iot/rules/${statusRule.id}/execution-logs?execution_status=SUCCESS&page_size=5`, adminToken, "GET", undefined, "status-rule-logs");
    if (logs.response.status !== 200) return false;
    return extractItems(logs.body).find((item) => item.triggerType === "STATUS") ?? false;
  });
  assert(statusLog, "Status rule should create a success log");

  const invalidAction = await jsonRequest("/iot/rules", adminToken, "POST", {
    rule_name: `S9C illegal action ${stamp}`,
    rule_type: "MANUAL",
    trigger_scope: "PARK",
    condition_json: {},
    action_json: [{ type: "EVAL_JS", code: "process.exit()" }],
    status: "DISABLED"
  }, "illegal-action");
  assertStatus("illegal action rejected", invalidAction.response.status, 400);

  const webhookWithoutAllowlist = await jsonRequest("/iot/rules", adminToken, "POST", {
    rule_name: `S9C webhook outside allowlist ${stamp}`,
    rule_type: "MANUAL",
    trigger_scope: "PARK",
    condition_json: {},
    action_json: [{ type: "CALL_WEBHOOK", url: "https://example.invalid/hook" }],
    status: "DISABLED"
  }, "webhook-outside-allowlist");
  assertStatus("webhook outside allowlist rejected", webhookWithoutAllowlist.response.status, 400);

  const normalCreate = await jsonRequest("/iot/rules", normalToken, "POST", {
    rule_name: "normal user should be denied",
    rule_type: "MANUAL",
    trigger_scope: "PARK",
    condition_json: {},
    action_json: [{ type: "SEND_NOTIFICATION" }],
    status: "DISABLED"
  }, "normal-create-rule");
  assertStatus("normal user create rule denied", normalCreate.response.status, 403);

  const isolatedName = `S9C isolated rule ${stamp}`;
  await psql(`
INSERT INTO iot_rule (
  tenant_id, park_id, rule_code, rule_name, rule_type, trigger_scope, condition_json, action_json, priority, status, is_deleted, create_time, update_time
) VALUES (
  'TENANT-S9C-OTHER',
  'PARK-S9C-OTHER',
  'S9C-ISO-${stamp}',
  ${sqlLiteral(isolatedName)},
  'MANUAL',
  'PARK',
  '{}'::jsonb,
  '[{"type":"SEND_NOTIFICATION"}]'::jsonb,
  100,
  'ENABLED',
  false,
  NOW(),
  NOW()
);`);
  const isolatedList = await jsonRequest(`/iot/rules?keyword=${encodeURIComponent(isolatedName)}`, adminToken, "GET", undefined, "tenant-isolation");
  assertStatus("tenant isolation list", isolatedList.response.status, 200);
  assertUniformResponse("tenant isolation list", isolatedList.body);
  assert(extractItems(isolatedList.body).length === 0, "Cross-tenant rule leaked into current tenant query");

  await dbCount(
    "rule execution logs",
    `SELECT COUNT(*) FROM iot_rule_execution_log
     WHERE tenant_id = ${sqlLiteral(tenantId)}
       AND park_id = ${sqlLiteral(parkId)}
       AND create_time > NOW() - INTERVAL '30 minutes'`,
    4
  );
  await dbCount(
    "iot rule audit logs",
    `SELECT COUNT(*) FROM sys_op_log
     WHERE tenant_id = ${sqlLiteral(tenantId)}
       AND park_id = ${sqlLiteral(parkId)}
       AND resource = 'biz.iot_rule'
       AND create_time > NOW() - INTERVAL '30 minutes'`,
    4
  );

  logStep("S9-C IoT rule engine smoke passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
