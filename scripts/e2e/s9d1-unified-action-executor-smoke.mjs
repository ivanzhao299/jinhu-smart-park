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
const stamp = Date.now();
const smokeRemark = `S9D1 unified action executor smoke ${stamp}`;

let apiProcess = null;

function getPnpmBin() {
  if (process.env.PNPM_BIN) return process.env.PNPM_BIN;
  const bundled = resolve(rootDir, ".tools/pnpm");
  return existsSync(bundled) ? bundled : "pnpm";
}

function logStep(message) {
  console.log(`[s9d1-unified-action-executor-smoke] ${message}`);
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
      "x-idempotency-key": `s9d1-action-${stamp}-${label}-${randomUUID()}`
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

async function login(username, password) {
  return request("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-request-id": `s9d1-login-${randomUUID()}` },
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
  logStep("API not reachable, starting @jinhu/api for S9-D.1 smoke test");
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

async function createRule(token, { name, ruleType = "MANUAL", condition = { always: true }, actions, status = "ENABLED", deviceId }) {
  const created = await jsonRequest("/iot/rules", token, "POST", {
    rule_name: name,
    rule_type: ruleType,
    trigger_scope: deviceId ? "DEVICE" : "PARK",
    device_id: deviceId,
    condition_json: condition,
    action_json: actions,
    priority: 10,
    status,
    remark: smokeRemark
  }, `create-rule-${name}`);
  assertStatus(`create rule ${name}`, created.response.status, 201);
  assertUniformResponse(`create rule ${name}`, created.body);
  assert(created.body.data?.id, "Rule response missing id");
  return created.body.data;
}

async function createDevice(token) {
  const created = await jsonRequest("/iot/devices", token, "POST", {
    device_name: `S9D1 device ${stamp}`,
    device_type: "temperature_sensor",
    protocol_type: "http",
    vendor_device_id: `s9d1-${stamp}`,
    status: "enabled",
    online_status: "offline",
    remark: smokeRemark
  }, "create-device");
  assertStatus("create device", created.response.status, 201);
  assertUniformResponse("create device", created.body);
  assert(created.body.data?.id, "Device response missing id");
  return created.body.data;
}

async function main() {
  await ensureApiStarted();

  const adminLogin = await login(adminUser, adminPassword);
  assertStatus("admin login", adminLogin.response.status, 200);
  assertUniformResponse("admin login", adminLogin.body);
  const token = adminLogin.body.data?.access_token ?? adminLogin.body.data?.accessToken;
  assert(token, "Admin login did not return an access token");

  const device = await createDevice(token);

  const rule = await createRule(token, {
    name: `S9D1 manual rule ${stamp}`,
    actions: [{ type: "NOOP_SIMULATION", content: "rule smoke noop" }]
  });
  const tested = await jsonRequest(`/iot/rules/${rule.id}/test`, token, "POST", {
    trigger_payload: { source: "s9d1", secret_token: "should-redact" }
  }, "test-rule");
  assertStatus("rule test uses unified executor", tested.response.status, 201);
  assertUniformResponse("rule test uses unified executor", tested.body);
  const ruleActionResult = tested.body.data?.actionResult?.[0];
  assert(ruleActionResult?.execution_status === "SUCCESS", "Rule action result should use unified execution_status");
  assert(ruleActionResult?.result_payload, "Rule action result should include unified result_payload");

  const manualScene = await jsonRequest("/iot/scenes/instances", token, "POST", {
    scene_name: `S9D1 manual scene ${stamp}`,
    scene_type: "custom",
    trigger_mode: "MANUAL",
    action_config_json: [{ type: "NOOP_SIMULATION", content: "manual scene noop" }],
    status: "ENABLED",
    remark: smokeRemark
  }, "create-manual-scene");
  assertStatus("create manual scene", manualScene.response.status, 201);
  assertUniformResponse("create manual scene", manualScene.body);

  const manualTrigger = await jsonRequest(`/iot/scenes/instances/${manualScene.body.data.id}/trigger`, token, "POST", {
    trigger_type: "MANUAL",
    reason: "s9d1 manual trigger"
  }, "trigger-manual-scene");
  assertStatus("scene manual trigger uses unified executor", manualTrigger.response.status, 201);
  assertUniformResponse("scene manual trigger uses unified executor", manualTrigger.body);
  const sceneActionResult = manualTrigger.body.data?.actionResultJson?.[0];
  assert(sceneActionResult?.execution_status === "SUCCESS", "Scene action result should use unified execution_status");

  const metricRule = await createRule(token, {
    name: `S9D1 metric rule ${stamp}`,
    ruleType: "METRIC",
    condition: { field: "temperature", operator: "gt", value: 60 },
    actions: [{ type: "NOOP_SIMULATION", content: "metric rule noop" }],
    deviceId: device.id
  });
  const autoScene = await jsonRequest("/iot/scenes/instances", token, "POST", {
    scene_name: `S9D1 auto scene ${stamp}`,
    scene_type: "high_temperature_warning",
    trigger_mode: "AUTO",
    linked_rule_id: metricRule.id,
    action_config_json: [{ type: "NOOP_SIMULATION", content: "auto scene noop" }],
    status: "ENABLED",
    remark: smokeRemark
  }, "create-auto-scene");
  assertStatus("create auto scene", autoScene.response.status, 201);
  assertUniformResponse("create auto scene", autoScene.body);

  const metricReport = await jsonRequest(`/iot/devices/${device.id}/metrics`, token, "POST", {
    metrics: { temperature: 77 },
    quality: "good",
    raw_payload: { source: "s9d1-smoke" }
  }, "report-metric");
  assertStatus("metric report triggers rule and scene", metricReport.response.status, 201);
  assertUniformResponse("metric report triggers rule and scene", metricReport.body);

  const invalidRule = await jsonRequest("/iot/rules", token, "POST", {
    rule_name: `S9D1 invalid action ${stamp}`,
    rule_type: "MANUAL",
    trigger_scope: "PARK",
    condition_json: { always: true },
    action_json: [{ type: "RUN_ARBITRARY_CODE" }],
    status: "ENABLED"
  }, "invalid-action-rule");
  assertStatus("illegal action rejected", invalidRule.response.status, 400);

  const otherDeviceId = await psql(`
INSERT INTO biz_iot_device (
  tenant_id, park_id, device_code, code, device_name, device_type, protocol_type, status, online_status, is_enabled, is_deleted, create_time, update_time
) VALUES (
  'TENANT-S9D1-OTHER',
  'PARK-S9D1-OTHER',
  'S9D1-OTHER-${stamp}',
  'S9D1-OTHER-${stamp}',
  'S9D1 other tenant device',
  'temperature_sensor',
  'http',
  'enabled',
  'offline',
  true,
  false,
  NOW(),
  NOW()
) RETURNING id;`);
  const crossTenantScene = await jsonRequest("/iot/scenes/instances", token, "POST", {
    scene_name: `S9D1 cross tenant scene ${stamp}`,
    scene_type: "custom",
    trigger_mode: "MANUAL",
    action_config_json: [{ type: "CONTROL_DEVICE", device_id: otherDeviceId }],
    status: "ENABLED",
    remark: smokeRemark
  }, "create-cross-tenant-scene");
  assertStatus("create cross tenant scene", crossTenantScene.response.status, 201);
  assertUniformResponse("create cross tenant scene", crossTenantScene.body);
  const crossTenantTrigger = await jsonRequest(`/iot/scenes/instances/${crossTenantScene.body.data.id}/trigger`, token, "POST", {
    trigger_type: "MANUAL",
    reason: "cross tenant device should fail"
  }, "trigger-cross-tenant-scene");
  assertStatus("cross tenant action rejected by executor", crossTenantTrigger.response.status, 201);
  assert(crossTenantTrigger.body.data?.executionStatus === "FAILED", "Cross-tenant device action should be logged as FAILED");

  const ruleLogUnified = Number(await psql(`
SELECT COUNT(*) FROM iot_rule_execution_log
WHERE tenant_id = ${sqlLiteral(tenantId)}
  AND park_id = ${sqlLiteral(parkId)}
  AND rule_id = ${sqlLiteral(rule.id)}
  AND action_result::text LIKE '%"execution_status"%'
  AND action_result::text LIKE '%"result_payload"%'
  AND create_time > NOW() - INTERVAL '30 minutes';`));
  assert(ruleLogUnified >= 1, "iot_rule_execution_log should record unified action result");

  const sceneLogUnified = Number(await psql(`
SELECT COUNT(*) FROM scene_execution_log
WHERE tenant_id = ${sqlLiteral(tenantId)}
  AND park_id = ${sqlLiteral(parkId)}
  AND scene_instance_id = ${sqlLiteral(manualScene.body.data.id)}
  AND action_result_json::text LIKE '%"execution_status"%'
  AND action_result_json::text LIKE '%"result_payload"%'
  AND create_time > NOW() - INTERVAL '30 minutes';`));
  assert(sceneLogUnified >= 1, "scene_execution_log should record unified action result");

  const autoSceneLogs = Number(await psql(`
SELECT COUNT(*) FROM scene_execution_log
WHERE tenant_id = ${sqlLiteral(tenantId)}
  AND park_id = ${sqlLiteral(parkId)}
  AND scene_instance_id = ${sqlLiteral(autoScene.body.data.id)}
  AND trigger_payload->>'auto_trigger' = 'true'
  AND create_time > NOW() - INTERVAL '30 minutes';`));
  assert(autoSceneLogs >= 1, "Rule trigger should auto-drive linked enabled AUTO scene");

  // --- CREATE_SAFETY_HAZARD: normal creation ---
  const hazardRule = await createRule(token, {
    name: `S9D1 hazard rule ${stamp}`,
    actions: [{ type: "CREATE_SAFETY_HAZARD", hazard_type: "other", risk_level: "10", title: `S9D1 IoT 隐患 ${stamp}`, description: "s9d1 smoke auto hazard", location: "s9d1 测试位置" }]
  });
  const hazardTest1 = await jsonRequest(`/iot/rules/${hazardRule.id}/test`, token, "POST", { trigger_payload: { source: "s9d1" } }, "hazard-rule-test-1");
  assertStatus("CREATE_SAFETY_HAZARD first call", hazardTest1.response.status, 201);
  const hazardResult1 = hazardTest1.body.data?.actionResult?.[0];
  assert(hazardResult1?.execution_status === "SUCCESS", `CREATE_SAFETY_HAZARD should be SUCCESS, got ${hazardResult1?.execution_status}`);
  assert(hazardResult1?.result_payload?.hazard_id, "result_payload must include hazard_id");
  assert(hazardResult1?.result_payload?.hazard_code, "result_payload must include hazard_code");
  assert(hazardResult1?.result_payload?.idempotent === false, "first creation: idempotent should be false");
  logStep(`CREATE_SAFETY_HAZARD created: ${hazardResult1.result_payload.hazard_code}`);

  // --- CREATE_SAFETY_HAZARD: idempotent call (same rule → same source_id) ---
  const hazardTest2 = await jsonRequest(`/iot/rules/${hazardRule.id}/test`, token, "POST", { trigger_payload: { source: "s9d1" } }, "hazard-rule-test-2");
  assertStatus("CREATE_SAFETY_HAZARD second call", hazardTest2.response.status, 201);
  const hazardResult2 = hazardTest2.body.data?.actionResult?.[0];
  assert(hazardResult2?.execution_status === "SUCCESS", `CREATE_SAFETY_HAZARD idempotent call should be SUCCESS, got ${hazardResult2?.execution_status}`);
  assert(hazardResult2?.result_payload?.idempotent === true, "second call: idempotent should be true");
  assert(hazardResult2?.result_payload?.hazard_id === hazardResult1.result_payload.hazard_id, "idempotent call must return same hazard_id");

  const hazardDbCount = Number(await psql(`
SELECT COUNT(*) FROM biz_safety_hazard
WHERE tenant_id = ${sqlLiteral(tenantId)}
  AND park_id = ${sqlLiteral(parkId)}
  AND source_type = 'alert'
  AND source_id = ${sqlLiteral(hazardRule.id)}
  AND is_deleted = false;`));
  assert(hazardDbCount === 1, `Idempotent: expected 1 hazard record, found ${hazardDbCount}`);
  logStep("CREATE_SAFETY_HAZARD idempotency verified");

  // --- CREATE_SAFETY_HAZARD: invalid hazard_type → FAILED ---
  const invalidHazardRule = await createRule(token, {
    name: `S9D1 invalid hazard rule ${stamp}`,
    actions: [{ type: "CREATE_SAFETY_HAZARD", hazard_type: "INVALID_TYPE_XYZ", risk_level: "10", title: "invalid type test", description: "bad type", location: "test" }]
  });
  const hazardTestInvalid = await jsonRequest(`/iot/rules/${invalidHazardRule.id}/test`, token, "POST", { trigger_payload: { source: "s9d1" } }, "hazard-rule-invalid");
  assertStatus("CREATE_SAFETY_HAZARD invalid type call", hazardTestInvalid.response.status, 201);
  const hazardResultInvalid = hazardTestInvalid.body.data?.actionResult?.[0];
  assert(hazardResultInvalid?.execution_status === "FAILED", `Invalid hazard_type should return FAILED, got ${hazardResultInvalid?.execution_status}`);
  logStep("CREATE_SAFETY_HAZARD invalid hazard_type correctly returns FAILED");

  // cleanup: soft-delete hazards created by this run
  await psql(`UPDATE biz_safety_hazard SET is_deleted = true, update_time = NOW() WHERE tenant_id = ${sqlLiteral(tenantId)} AND park_id = ${sqlLiteral(parkId)} AND source_type = 'alert' AND source_id IN (${sqlLiteral(hazardRule.id)}, ${sqlLiteral(invalidHazardRule.id)}) AND is_deleted = false;`);

  logStep("S9-D.1 unified action executor smoke passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
