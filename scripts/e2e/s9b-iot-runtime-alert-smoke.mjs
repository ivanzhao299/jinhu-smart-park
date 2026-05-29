import { randomUUID } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const execFileAsync = promisify(execFile);
const apiBase = process.env.E2E_API_BASE ?? "http://127.0.0.1:3001/api/v1";
const wsBase = process.env.E2E_WS_BASE ?? apiBase.replace(/^http/, "ws").replace(/\/api\/v1$/, "/api/v1/iot/realtime");
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
const smokeRemark = `S9B IoT runtime alert smoke ${stamp}`;

let apiProcess = null;

function getPnpmBin() {
  if (process.env.PNPM_BIN) return process.env.PNPM_BIN;
  const bundled = resolve(rootDir, ".tools/pnpm");
  return existsSync(bundled) ? bundled : "pnpm";
}

function logStep(message) {
  console.log(`[s9b-iot-runtime-alert-smoke] ${message}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertStatus(name, actual, expected) {
  const allowed = Array.isArray(expected) ? expected : [expected];
  if (!allowed.includes(actual)) {
    throw new Error(`${name} expected HTTP ${allowed.join(" or ")}, got ${actual}`);
  }
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
      "x-idempotency-key": `s9b-iot-${stamp}-${label}-${randomUUID()}`
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

async function login(username, password) {
  return request("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-request-id": `s9b-login-${randomUUID()}` },
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
  logStep("API not reachable, starting @jinhu/api for S9-B IoT runtime smoke test");
  apiProcess = spawn(getPnpmBin(), ["--filter", "@jinhu/api", "start"], {
    cwd: rootDir,
    detached: true,
    stdio: "ignore",
    env: { ...process.env, IOT_HEARTBEAT_TIMEOUT_SECONDS: process.env.IOT_HEARTBEAT_TIMEOUT_SECONDS ?? "30" }
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

async function getFixtures() {
  const unitRow = await psql(`
SELECT unit.id::text || '|' || COALESCE(unit.building_id::text, '') || '|' || COALESCE(unit.floor_id::text, '')
FROM biz_unit unit
WHERE unit.tenant_id = ${sqlLiteral(tenantId)}
  AND unit.park_id = ${sqlLiteral(parkId)}
  AND unit.is_deleted = false
ORDER BY unit.create_time ASC
LIMIT 1;`);
  assert(unitRow, "No biz_unit fixture found for S9-B smoke");
  const [unitId, buildingId, floorId] = unitRow.split("|");
  const parkTenantId = await psql(`
SELECT id::text
FROM biz_park_tenant
WHERE tenant_id = ${sqlLiteral(tenantId)}
  AND park_id = ${sqlLiteral(parkId)}
  AND is_deleted = false
ORDER BY create_time ASC
LIMIT 1;`);
  assert(parkTenantId, "No biz_park_tenant fixture found for S9-B smoke");
  return { unitId, buildingId: buildingId || undefined, floorId: floorId || undefined, parkTenantId };
}

function extractItems(body) {
  return body?.data?.items ?? body?.data?.rows ?? [];
}

async function waitForCondition(name, fn, timeoutMs = 75_000, intervalMs = 2_000) {
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

async function openRealtime(token, topic) {
  assert(typeof WebSocket === "function", "Current Node runtime does not provide WebSocket");
  const socket = new WebSocket(`${wsBase}?token=${encodeURIComponent(token)}`);
  const messages = [];
  socket.addEventListener("message", (event) => {
    try {
      messages.push(JSON.parse(event.data));
    } catch {
      messages.push(event.data);
    }
  });
  await new Promise((resolveOpen, rejectOpen) => {
    const timer = setTimeout(() => rejectOpen(new Error("WebSocket open timeout")), 10_000);
    socket.addEventListener("open", () => {
      clearTimeout(timer);
      resolveOpen();
    });
    socket.addEventListener("error", () => {
      clearTimeout(timer);
      rejectOpen(new Error("WebSocket failed to open"));
    });
  });
  socket.send(JSON.stringify({ type: "subscribe", topic }));
  await waitForCondition("websocket subscribed", () => messages.some((message) => message?.type === "subscribed"), 10_000, 500);
  return {
    socket,
    messages,
    close: () => socket.close()
  };
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
    device_name: `S9B runtime device ${stamp}`,
    device_type: "ENV_SENSOR",
    device_category: "RUNTIME",
    vendor_device_id: `s9b-runtime-${stamp}`,
    protocol_type: "MQTT",
    connection_type: "MQTT",
    building_id: fixtures.buildingId,
    floor_id: fixtures.floorId,
    unit_id: fixtures.unitId,
    park_tenant_id: fixtures.parkTenantId,
    location: `S9B runtime location ${stamp}`,
    status: "ONLINE",
    is_enabled: true,
    remark: smokeRemark
  }, "device-create");
  assertStatus("create device", deviceCreated.response.status, 201);
  assertUniformResponse("create device", deviceCreated.body);
  const device = deviceCreated.body.data;
  assert(device?.id, "Device create response missing id");

  const realtime = await openRealtime(adminToken, `iot:device:${device.id}`);

  const heartbeat = await jsonRequest(`/iot/devices/${device.id}/heartbeat`, adminToken, "POST", {
    status: "online",
    latency_ms: 18,
    signal_strength: 82,
    battery_level: 96,
    firmware_version: "s9b.1",
    raw_payload: { smoke: smokeRemark }
  }, "heartbeat-online");
  assertStatus("heartbeat online", heartbeat.response.status, 201);
  assertUniformResponse("heartbeat online", heartbeat.body);
  assert(heartbeat.body.data.device.onlineStatus === "online", "Heartbeat should mark device online");

  const heartbeatHistory = await jsonRequest(`/iot/devices/${device.id}/heartbeat-history?page_size=5`, adminToken, "GET", undefined, "heartbeat-history");
  assertStatus("heartbeat history", heartbeatHistory.response.status, 200);
  assertUniformResponse("heartbeat history", heartbeatHistory.body);
  assert(extractItems(heartbeatHistory.body).length >= 1, "Heartbeat history should include the online heartbeat");

  const metrics = await jsonRequest(`/iot/devices/${device.id}/metrics`, adminToken, "POST", {
    reported_at: new Date().toISOString(),
    quality: "good",
    metrics: {
      TEMPERATURE: 26.5,
      HUMIDITY: 62,
      LOW_BATTERY: false
    },
    raw_payload: { smoke: smokeRemark }
  }, "metrics-report");
  assertStatus("report metrics", metrics.response.status, 201);
  assertUniformResponse("report metrics", metrics.body);
  assert(metrics.body.data.accepted_count === 3, "Metrics endpoint should accept three metrics");

  await waitForCondition("websocket metric/latest event", () =>
    realtime.messages.some((message) => message?.event === "device.latest" || message?.event === "iot.metric.updated"),
  10_000, 500);

  const metricHistory = await jsonRequest(`/iot/devices/${device.id}/metrics?metric_type=TEMPERATURE&page_size=5`, adminToken, "GET", undefined, "metric-history");
  assertStatus("metric history", metricHistory.response.status, 200);
  assertUniformResponse("metric history", metricHistory.body);
  assert(extractItems(metricHistory.body).length >= 1, "Metric history should include TEMPERATURE");

  const dashboardOverview = await jsonRequest("/iot/dashboard/overview", adminToken, "GET", undefined, "dashboard-overview");
  assertStatus("dashboard overview", dashboardOverview.response.status, 200);
  assertUniformResponse("dashboard overview", dashboardOverview.body);
  assert(Number(dashboardOverview.body.data.summary?.total_devices ?? 0) >= 1, "Dashboard overview should count devices");

  const dashboardRealtime = await jsonRequest("/iot/dashboard/realtime-events", adminToken, "GET", undefined, "dashboard-realtime-events");
  assertStatus("dashboard realtime events", dashboardRealtime.response.status, 200);
  assertUniformResponse("dashboard realtime events", dashboardRealtime.body);

  const createdAlert = await jsonRequest("/iot/alerts", adminToken, "POST", {
    device_id: device.id,
    alert_type: "HIGH_TEMPERATURE",
    alert_level: "HIGH",
    title: `S9B high temperature ${stamp}`,
    description: "temperature is high",
    source_type: "RULE_ENGINE",
    remark: smokeRemark
  }, "alert-create");
  assertStatus("create alert", createdAlert.response.status, 201);
  assertUniformResponse("create alert", createdAlert.body);
  const alert = createdAlert.body.data;
  assert(alert?.id, "Alert create response missing id");

  const closeWithoutReason = await jsonRequest(`/iot/alerts/${alert.id}/close`, adminToken, "POST", {}, "alert-close-empty");
  assertStatus("close without reason rejected", closeWithoutReason.response.status, 400);

  const acknowledged = await jsonRequest(`/iot/alerts/${alert.id}/acknowledge`, adminToken, "POST", { reason: "收到告警" }, "alert-ack");
  assertStatus("acknowledge alert", acknowledged.response.status, 201);
  assertUniformResponse("acknowledge alert", acknowledged.body);
  assert(acknowledged.body.data.status === "acknowledged", "Alert should be acknowledged");

  const processing = await jsonRequest(`/iot/alerts/${alert.id}/process`, adminToken, "POST", { reason: "安排现场排查" }, "alert-process");
  assertStatus("process alert", processing.response.status, 201);
  assertUniformResponse("process alert", processing.body);
  assert(processing.body.data.status === "processing", "Alert should enter processing");

  const resolved = await jsonRequest(`/iot/alerts/${alert.id}/resolve`, adminToken, "POST", { reason: "现场已恢复" }, "alert-resolve");
  assertStatus("resolve alert", resolved.response.status, 201);
  assertUniformResponse("resolve alert", resolved.body);
  assert(resolved.body.data.status === "resolved", "Alert should be resolved");

  const closed = await jsonRequest(`/iot/alerts/${alert.id}/close`, adminToken, "POST", { close_reason: "已复核关闭" }, "alert-close");
  assertStatus("close alert", closed.response.status, 201);
  assertUniformResponse("close alert", closed.body);
  assert(closed.body.data.status === "closed", "Alert should be closed");

  const closedAgain = await jsonRequest(`/iot/alerts/${alert.id}/process`, adminToken, "POST", { reason: "不应再处理" }, "alert-closed-process");
  assertStatus("closed alert cannot be processed", closedAgain.response.status, 400);

  const ignoredCandidate = await jsonRequest("/iot/alerts", adminToken, "POST", {
    device_id: device.id,
    alert_type: "LOW_BATTERY",
    alert_level: "MEDIUM",
    title: `S9B ignore candidate ${stamp}`,
    description: "battery is low",
    source_type: "DEVICE",
    remark: smokeRemark
  }, "alert-ignore-create");
  assertStatus("create ignore candidate", ignoredCandidate.response.status, 201);
  const ignoreWithoutReason = await jsonRequest(`/iot/alerts/${ignoredCandidate.body.data.id}/ignore`, adminToken, "POST", {}, "alert-ignore-empty");
  assertStatus("ignore without reason rejected", ignoreWithoutReason.response.status, 400);
  const ignored = await jsonRequest(`/iot/alerts/${ignoredCandidate.body.data.id}/ignore`, adminToken, "POST", { ignore_reason: "测试忽略" }, "alert-ignore");
  assertStatus("ignore alert", ignored.response.status, 201);
  assertUniformResponse("ignore alert", ignored.body);
  assert(ignored.body.data.status === "ignored", "Alert should be ignored");

  const normalCreateAlert = await jsonRequest("/iot/alerts", normalToken, "POST", {
    device_id: device.id,
    alert_type: "NETWORK_EXCEPTION",
    alert_level: "LOW",
    title: "normal user should be denied"
  }, "normal-alert-create");
  assertStatus("normal user create alert denied", normalCreateAlert.response.status, 403);

  await psql(`
UPDATE biz_iot_device
SET last_heartbeat_at = NOW() - INTERVAL '10 minutes',
    online_status = 'online',
    update_time = NOW()
WHERE id = ${sqlLiteral(device.id)}
  AND tenant_id = ${sqlLiteral(tenantId)}
  AND park_id = ${sqlLiteral(parkId)};`);

  const offlineAlert = await waitForCondition("scheduler offline alert", async () => {
    const list = await jsonRequest(`/iot/alerts?device_id=${encodeURIComponent(device.id)}&metric_code=heartbeat`, adminToken, "GET", undefined, "offline-alert-list");
    if (list.response.status !== 200) return false;
    const rows = extractItems(list.body);
    return rows.find((item) => item.status === "active" || item.status === "acknowledged" || item.status === "processing") ?? false;
  }, 75_000, 3_000);
  assert(offlineAlert, "Offline scheduler should create heartbeat alert");

  const recovery = await jsonRequest(`/iot/devices/${device.id}/heartbeat`, adminToken, "POST", {
    status: "online",
    latency_ms: 12,
    raw_payload: { recovery: true }
  }, "heartbeat-recovery");
  assertStatus("heartbeat recovery", recovery.response.status, 201);
  assertUniformResponse("heartbeat recovery", recovery.body);

  await waitForCondition("offline alert auto closed after recovery", async () => {
    const detail = await jsonRequest(`/iot/alerts/${offlineAlert.id}`, adminToken, "GET", undefined, "offline-alert-detail");
    if (detail.response.status !== 200) return false;
    return detail.body.data.status === "closed";
  }, 10_000, 1_000);

  const isolatedName = `S9B isolated runtime device ${stamp}`;
  await psql(`
INSERT INTO biz_iot_device (
  tenant_id, park_id, device_code, device_name, device_type, protocol_type, status, online_status, is_deleted, create_time, update_time
) VALUES (
  'TENANT-S9B-OTHER', 'PARK-S9B-OTHER', 'S9B-ISO-${stamp}', ${sqlLiteral(isolatedName)}, 'ENV_SENSOR', 'MQTT', 'enabled', 'online', false, NOW(), NOW()
);`);
  const isolatedList = await jsonRequest(`/iot/devices?keyword=${encodeURIComponent(isolatedName)}`, adminToken, "GET", undefined, "tenant-isolation");
  assertStatus("tenant isolation list", isolatedList.response.status, 200);
  assertUniformResponse("tenant isolation list", isolatedList.body);
  assert(extractItems(isolatedList.body).length === 0, "Cross-tenant device leaked into current tenant query");

  await dbCount(
    "heartbeat rows",
    `SELECT COUNT(*) FROM iot_device_heartbeat
     WHERE tenant_id = ${sqlLiteral(tenantId)}
       AND park_id = ${sqlLiteral(parkId)}
       AND device_id = ${sqlLiteral(device.id)}`,
    2
  );
  await dbCount(
    "metric rows",
    `SELECT COUNT(*) FROM biz_iot_device_data
     WHERE tenant_id = ${sqlLiteral(tenantId)}
       AND park_id = ${sqlLiteral(parkId)}
       AND device_id = ${sqlLiteral(device.id)}`,
    3
  );
  await dbCount(
    "alert logs",
    `SELECT COUNT(*) FROM biz_iot_alert_log
     WHERE tenant_id = ${sqlLiteral(tenantId)}
       AND park_id = ${sqlLiteral(parkId)}
       AND create_time > NOW() - INTERVAL '30 minutes'`,
    4
  );
  await dbCount(
    "IoT audit logs",
    `SELECT COUNT(*) FROM sys_op_log
     WHERE tenant_id = ${sqlLiteral(tenantId)}
       AND park_id = ${sqlLiteral(parkId)}
       AND resource LIKE 'biz.iot_alert%'
       AND create_time > NOW() - INTERVAL '30 minutes'`,
    3
  );

  realtime.close();
  logStep("S9-B IoT runtime alert smoke passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
