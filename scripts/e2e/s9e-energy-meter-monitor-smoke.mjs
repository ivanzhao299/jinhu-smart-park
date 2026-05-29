import { createHmac, randomUUID } from "node:crypto";
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
const smokeRemark = `S9E energy meter monitor smoke ${stamp}`;

let apiProcess = null;

function getPnpmBin() {
  if (process.env.PNPM_BIN) return process.env.PNPM_BIN;
  const bundled = resolve(rootDir, ".tools/pnpm");
  return existsSync(bundled) ? bundled : "pnpm";
}

function logStep(message) {
  console.log(`[s9e-energy-meter-monitor-smoke] ${message}`);
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

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
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
      "x-idempotency-key": `s9e-energy-${stamp}-${label}-${randomUUID()}`
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

async function login(username, password) {
  return request("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-request-id": `s9e-login-${randomUUID()}` },
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
  logStep("API not reachable, starting @jinhu/api for S9-E smoke test");
  apiProcess = spawn(getPnpmBin(), ["--filter", "@jinhu/api", "start"], {
    cwd: rootDir,
    detached: true,
    stdio: "ignore",
    env: { ...process.env }
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

async function createDevice(token) {
  const created = await jsonRequest("/iot/devices", token, "POST", {
    device_name: `S9E energy device ${stamp}`,
    device_type: "electric_meter",
    protocol_type: "http",
    vendor_device_id: `s9e-energy-${stamp}`,
    status: "enabled",
    online_status: "offline",
    remark: smokeRemark
  }, "create-iot-device");
  assertStatus("create IoT device for energy meter", created.response.status, 201);
  assertUniformResponse("create IoT device for energy meter", created.body);
  return created.body.data;
}

async function createPoint(token, deviceId) {
  const created = await jsonRequest(`/iot/devices/${deviceId}/points`, token, "POST", {
    point_code: `S9E-ENERGY-${stamp}`,
    metric_code: "energy",
    point_name: `S9E energy reading point ${stamp}`,
    point_type: "telemetry",
    value_type: "number",
    unit: "kWh",
    report_key: "energy",
    status: "enabled",
    remark: smokeRemark
  }, "create-iot-energy-point");
  assertStatus("create IoT energy point", created.response.status, 201);
  assertUniformResponse("create IoT energy point", created.body);
  return created.body.data;
}

async function resetDeviceSecret(token, deviceId) {
  const reset = await jsonRequest(`/iot/devices/${deviceId}/reset-secret`, token, "POST", {}, "reset-iot-device-secret");
  assertStatus("reset IoT device secret", reset.response.status, 201);
  assertUniformResponse("reset IoT device secret", reset.body);
  const secret = reset.body.data?.device_secret;
  assert(secret, "Reset secret did not return one-time plaintext secret");
  return secret;
}

async function ingestHttp(deviceCode, secret, payload) {
  const timestampHeader = new Date().toISOString();
  const nonce = `s9e-${stamp}-${randomUUID()}`;
  const signaturePayload = [timestampHeader, nonce, deviceCode, stableStringify(payload)].join("\n");
  const signature = createHmac("sha256", secret).update(signaturePayload).digest("hex");
  return request("/iot/ingest/http", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Device-Code": deviceCode,
      "X-Timestamp": timestampHeader,
      "X-Nonce": nonce,
      "X-Signature": signature
    },
    body: JSON.stringify(payload)
  });
}

async function createMeter(token, body, label) {
  const created = await jsonRequest("/energy/meters", token, "POST", body, label);
  assertStatus(label, created.response.status, 201);
  assertUniformResponse(label, created.body);
  assert(created.body.data?.id, `${label} missing meter id`);
  return created.body.data;
}

function numberValue(value) {
  return Number.parseFloat(String(value));
}

async function main() {
  await ensureApiStarted();

  const adminLogin = await login(adminUser, adminPassword);
  assertStatus("admin login", adminLogin.response.status, 200);
  assertUniformResponse("admin login", adminLogin.body);
  const token = adminLogin.body.data?.access_token ?? adminLogin.body.data?.accessToken;
  assert(token, "Admin login did not return an access token");

  const device = await createDevice(token);
  await createPoint(token, device.id);
  const deviceSecret = await resetDeviceSecret(token, device.id);

  const electricMeter = await createMeter(token, {
    meter_name: `S9E electric meter ${stamp}`,
    meter_type: "ELECTRIC",
    meter_purpose: "PUBLIC",
    iot_device_id: device.id,
    multiplier: 2,
    unit: "kWh",
    initial_reading: 10,
    status: "ONLINE",
    remark: smokeRemark
  }, "create electric meter");

  await createMeter(token, {
    meter_name: `S9E water meter ${stamp}`,
    meter_type: "WATER",
    meter_purpose: "PUBLIC",
    multiplier: 1,
    unit: "m³",
    initial_reading: 5,
    status: "UNKNOWN",
    remark: smokeRemark
  }, "create water meter");

  const meterList = await jsonRequest(`/energy/meters?keyword=${encodeURIComponent(`S9E electric meter ${stamp}`)}`, token, "GET", undefined, "list-meters");
  assertStatus("query meter list", meterList.response.status, 200);
  assert(meterList.body.data.total >= 1, "Energy meter list should include created meter");

  const firstReading = await jsonRequest(`/energy/meters/${electricMeter.id}/readings`, token, "POST", {
    reading_value: 100,
    reading_source: "MANUAL",
    raw_payload: { source: "s9e-smoke" }
  }, "create-first-reading");
  assertStatus("manual reading created", firstReading.response.status, 201);
  assertUniformResponse("manual reading created", firstReading.body);
  assert(numberValue(firstReading.body.data.previousReadingValue) === 10, "Previous reading should use meter current reading");
  assert(numberValue(firstReading.body.data.consumptionValue) === 180, "Consumption should be (100 - 10) * 2");

  const confirmed = await jsonRequest(`/energy/readings/${firstReading.body.data.id}/confirm`, token, "POST", undefined, "confirm-reading");
  assertStatus("confirm reading", confirmed.response.status, 201);
  assert(confirmed.body.data.confirmationStatus === "CONFIRMED", "Reading should be confirmed");

  const meterDetail = await jsonRequest(`/energy/meters/${electricMeter.id}`, token, "GET", undefined, "meter-detail");
  assertStatus("meter detail after confirm", meterDetail.response.status, 200);
  assert(numberValue(meterDetail.body.data.currentReading) === 100, "Meter current reading should update after confirm");

  const iotPayload = {
    device_code: device.deviceCode,
    reported_at: new Date(stamp + 30_000).toISOString(),
    metrics: { energy: 140 },
    quality: "good",
    raw_payload: { source: "s9e-iot-energy-bridge" }
  };
  const iotIngest = await ingestHttp(device.deviceCode, deviceSecret, iotPayload);
  assertStatus("IoT HTTP ingest for energy reading", iotIngest.response.status, 201);
  assertUniformResponse("IoT HTTP ingest for energy reading", iotIngest.body);
  assert(iotIngest.body.data.accepted_count === 1, "IoT ingest should accept energy metric");

  const iotReadings = await jsonRequest(`/energy/meters/${electricMeter.id}/readings?reading_source=IOT`, token, "GET", undefined, "list-iot-readings");
  assertStatus("IoT energy reading list", iotReadings.response.status, 200);
  assert(iotReadings.body.data.total >= 1, "IoT ingest should create an energy_reading row");
  const iotReading = iotReadings.body.data.items[0];
  assert(iotReading.readingSource === "IOT", "IoT-generated reading should have IOT source");
  assert(numberValue(iotReading.readingValue) === 140, "IoT-generated reading should use the reported meter value");
  assert(numberValue(iotReading.previousReadingValue) === 100, "IoT-generated reading should use confirmed meter current as previous value");
  assert(numberValue(iotReading.consumptionValue) === 80, "IoT-generated consumption should be (140 - 100) * 2");
  assert(iotReading.confirmationStatus === "PENDING", "IoT-generated normal reading should wait for confirmation");

  const reverseReading = await jsonRequest(`/energy/meters/${electricMeter.id}/readings`, token, "POST", {
    reading_value: 90,
    reading_source: "MANUAL",
    raw_payload: { source: "s9e-reverse" }
  }, "create-reverse-reading");
  assertStatus("reverse reading accepted as abnormal", reverseReading.response.status, 201);
  assert(reverseReading.body.data.confirmationStatus === "ABNORMAL", "Reverse reading should be abnormal");

  const confirmReverse = await jsonRequest(`/energy/readings/${reverseReading.body.data.id}/confirm`, token, "POST", undefined, "confirm-reverse-reading");
  assertStatus("abnormal reading cannot confirm", confirmReverse.response.status, 400);

  const alertList = await jsonRequest(`/energy/alerts?meter_id=${electricMeter.id}`, token, "GET", undefined, "alert-list");
  assertStatus("energy alert list", alertList.response.status, 200);
  assert(alertList.body.data.total >= 1, "Reverse reading should generate energy alert");
  const alert = alertList.body.data.items[0];

  const acknowledged = await jsonRequest(`/energy/alerts/${alert.id}/acknowledge`, token, "POST", undefined, "ack-alert");
  assertStatus("acknowledge energy alert", acknowledged.response.status, 201);
  assert(acknowledged.body.data.processStatus === "ACKNOWLEDGED", "Alert should be acknowledged");

  const resolved = await jsonRequest(`/energy/alerts/${alert.id}/resolve`, token, "POST", undefined, "resolve-alert");
  assertStatus("resolve energy alert", resolved.response.status, 201);
  assert(resolved.body.data.processStatus === "RESOLVED", "Alert should be resolved");

  const closeNoReason = await jsonRequest(`/energy/alerts/${alert.id}/close`, token, "POST", {}, "close-alert-no-reason");
  assertStatus("close energy alert requires reason", closeNoReason.response.status, 400);

  const closed = await jsonRequest(`/energy/alerts/${alert.id}/close`, token, "POST", { reason: "S9E smoke close" }, "close-alert");
  assertStatus("close energy alert", closed.response.status, 201);
  assert(closed.body.data.processStatus === "CLOSED", "Alert should be closed");

  const overview = await jsonRequest("/energy/dashboard/overview", token, "GET", undefined, "dashboard-overview");
  assertStatus("dashboard overview", overview.response.status, 200);
  assert(overview.body.data.summary.meter_count >= 2, "Dashboard should count energy meters");

  const byBuilding = await jsonRequest("/energy/dashboard/by-building", token, "GET", undefined, "dashboard-by-building");
  assertStatus("dashboard by building", byBuilding.response.status, 200);
  const byTenant = await jsonRequest("/energy/dashboard/by-tenant", token, "GET", undefined, "dashboard-by-tenant");
  assertStatus("dashboard by tenant", byTenant.response.status, 200);

  const disabled = await jsonRequest(`/energy/meters/${electricMeter.id}/status`, token, "PATCH", {
    status: "DISABLED",
    is_enabled: false
  }, "disable-meter");
  assertStatus("disable meter", disabled.response.status, 200);

  const readingForDisabled = await jsonRequest(`/energy/meters/${electricMeter.id}/readings`, token, "POST", {
    reading_value: 120,
    reading_source: "MANUAL"
  }, "disabled-meter-reading");
  assertStatus("disabled meter cannot add reading", readingForDisabled.response.status, 400);

  await psql(`
INSERT INTO energy_meter (
  tenant_id, park_id, meter_code, meter_name, meter_type, meter_purpose, multiplier, unit,
  initial_reading, current_reading, status, is_enabled, is_deleted, create_time, update_time, remark
) VALUES (
  '99999999', ${sqlLiteral(parkId)}, ${sqlLiteral(`EM-OTHER-${stamp}`)}, ${sqlLiteral(`S9E other tenant meter ${stamp}`)},
  'ELECTRIC', 'PUBLIC', 1, 'kWh', 0, 0, 'UNKNOWN', true, false, now(), now(), ${sqlLiteral(smokeRemark)}
)
ON CONFLICT DO NOTHING;
`);
  const isolated = await jsonRequest(`/energy/meters?keyword=${encodeURIComponent(`S9E other tenant meter ${stamp}`)}`, token, "GET", undefined, "tenant-isolation");
  assertStatus("tenant isolation query", isolated.response.status, 200);
  assert(isolated.body.data.total === 0, "Energy meter query leaked another tenant row");

  const auditCount = await psql(`SELECT COUNT(*) FROM sys_op_log WHERE remark ILIKE '%S9E%' OR path ILIKE '%energy%'`);
  assert(Number.parseInt(auditCount, 10) > 0, "Energy write operations should create sys_op_log rows");

  logStep("S9-E energy meter monitor smoke completed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
