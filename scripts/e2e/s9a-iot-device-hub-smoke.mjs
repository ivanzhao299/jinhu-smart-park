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
const smokeRemark = `S9A IoT device hub smoke ${stamp}`;

let apiProcess = null;

function getPnpmBin() {
  if (process.env.PNPM_BIN) return process.env.PNPM_BIN;
  const bundled = resolve(rootDir, ".tools/pnpm");
  return existsSync(bundled) ? bundled : "pnpm";
}

function logStep(message) {
  console.log(`[s9a-iot-device-hub-smoke] ${message}`);
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
      "x-idempotency-key": `s9a-iot-${stamp}-${label}-${randomUUID()}`
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

async function login(username, password) {
  return request("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-request-id": `s9a-login-${randomUUID()}` },
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
  logStep("API not reachable, starting @jinhu/api for S9-A IoT device hub smoke test");
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
  assert(unitRow, "No biz_unit fixture found for S9-A smoke");
  const [unitId, buildingId, floorId] = unitRow.split("|");
  const parkTenantId = await psql(`
SELECT id::text
FROM biz_park_tenant
WHERE tenant_id = ${sqlLiteral(tenantId)}
  AND park_id = ${sqlLiteral(parkId)}
  AND is_deleted = false
ORDER BY create_time ASC
LIMIT 1;`);
  assert(parkTenantId, "No biz_park_tenant fixture found for S9-A smoke");
  return { unitId, buildingId: buildingId || undefined, floorId: floorId || undefined, parkTenantId };
}

function extractItems(body) {
  return body?.data?.items ?? body?.data?.rows ?? [];
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

  const mqttGateway = await jsonRequest("/iot/gateways", adminToken, "POST", {
    gateway_name: `S9A MQTT 网关 ${stamp}`,
    gateway_type: "mqtt_broker",
    protocol_type: "MQTT",
    vendor_name: "S9A Vendor",
    brand: "S9A Brand",
    model: "S9A-GW",
    endpoint_url: "mqtt://127.0.0.1:1883",
    ip_address: "10.9.0.10",
    port: 1883,
    mqtt_client_id: `s9a-${stamp}`,
    access_key: `s9a-access-${stamp}`,
    secret: `s9a-secret-${stamp}`,
    remark: smokeRemark
  }, "gateway-create");
  assertStatus("create MQTT gateway", mqttGateway.response.status, 201);
  assertUniformResponse("create MQTT gateway", mqttGateway.body);
  const gateway = mqttGateway.body.data;
  assert(gateway?.id, "Gateway create response missing id");
  assert(gateway.secretEncrypted === "***" || gateway.secretEncrypted === null, "Gateway secret should not return plaintext");

  const gatewayTest = await jsonRequest(`/iot/gateways/${gateway.id}/test-connection`, adminToken, "POST", {}, "gateway-test");
  assertStatus("test gateway connection", gatewayTest.response.status, 201);
  assertUniformResponse("test gateway connection", gatewayTest.body);

  const protocolConfigCreated = await jsonRequest("/iot/protocol-configs", adminToken, "POST", {
    protocol_type: "MQTT",
    config_name: `S9A MQTT 配置 ${stamp}`,
    config_json: {
      username: "s9a_user",
      password: `secret-${stamp}`,
      token: `token-${stamp}`
    },
    status: "enabled",
    remark: smokeRemark
  }, "protocol-config-create");
  assertStatus("create protocol config", protocolConfigCreated.response.status, 201);
  assertUniformResponse("create protocol config", protocolConfigCreated.body);
  const protocolConfig = protocolConfigCreated.body.data;
  assert(protocolConfig?.id, "Protocol config response missing id");
  assert(protocolConfig.hasConfig === true, "Protocol config should report hasConfig=true");
  assert(protocolConfig.configJson === null, "Protocol config must not return raw config JSON");

  const protocolConfigDetail = await jsonRequest(`/iot/protocol-configs/${protocolConfig.id}`, adminToken, "GET", undefined, "protocol-config-detail");
  assertStatus("get protocol config detail", protocolConfigDetail.response.status, 200);
  assertUniformResponse("get protocol config detail", protocolConfigDetail.body);
  assert(protocolConfigDetail.body.data.configJson === null, "Protocol detail must not leak config JSON");

  const devicePayload = {
    device_name: `S9A 摄像头统一设备 ${stamp}`,
    device_type: "CAMERA",
    device_category: "VIDEO_SECURITY",
    gateway_id: gateway.id,
    vendor_device_id: `s9a-vendor-${stamp}`,
    protocol_type: "MQTT",
    connection_type: "MQTT",
    building_id: fixtures.buildingId,
    floor_id: fixtures.floorId,
    unit_id: fixtures.unitId,
    room_id: fixtures.unitId,
    park_tenant_id: fixtures.parkTenantId,
    brand: "S9A",
    model: "HubCam",
    manufacturer: "Jinhu",
    ip_address: "10.9.0.11",
    port: 1883,
    mac_address: "AA:BB:CC:DD:09:01",
    serial_number: `S9A-SN-${stamp}`,
    platform_type: "LOCAL_RTSP",
    platform_device_id: `s9a-platform-${stamp}`,
    location: `S9A 联动位置 ${stamp}`,
    install_location: `S9A 安装点 ${stamp}`,
    longitude: 118.123456,
    latitude: 33.123456,
    status: "ONLINE",
    is_enabled: true,
    remark: smokeRemark
  };
  const deviceCreated = await jsonRequest("/iot/devices", adminToken, "POST", devicePayload, "device-create");
  assertStatus("create device", deviceCreated.response.status, 201);
  assertUniformResponse("create device", deviceCreated.body);
  const device = deviceCreated.body.data;
  assert(device?.id, "Device create response missing id");
  assert(device.deviceSecretHash === undefined || device.deviceSecretHash === null, "Device secret hash must not be returned");
  assert(device.deviceType === "CAMERA", "Device type should keep CAMERA");
  assert(device.roomId === fixtures.unitId, "Room alias should be persisted");

  const duplicateDevice = await jsonRequest("/iot/devices", adminToken, "POST", {
    ...devicePayload,
    device_name: `S9A 重复厂家设备 ${stamp}`
  }, "device-duplicate-vendor");
  assertStatus("duplicate vendor_device_id under same gateway", duplicateDevice.response.status, [400, 409]);

  for (const [name, path] of [
    ["list by type", `/iot/devices?device_type=CAMERA&keyword=${encodeURIComponent(String(stamp))}`],
    ["list by protocol", `/iot/devices?protocol_type=MQTT&keyword=${encodeURIComponent(String(stamp))}`],
    ["list by status", `/iot/devices?status=online&keyword=${encodeURIComponent(String(stamp))}`]
  ]) {
    const list = await jsonRequest(path, adminToken, "GET", undefined, name);
    assertStatus(name, list.response.status, 200);
    assertUniformResponse(name, list.body);
    assert(extractItems(list.body).some((item) => item.id === device.id), `${name} did not return created device`);
  }

  const devicePatched = await jsonRequest(`/iot/devices/${device.id}`, adminToken, "PATCH", {
    device_name: `S9A 摄像头统一设备已修改 ${stamp}`,
    model: "HubCam-Pro"
  }, "device-patch");
  assertStatus("patch device", devicePatched.response.status, 200);
  assertUniformResponse("patch device", devicePatched.body);
  assert(devicePatched.body.data.deviceName.includes("已修改"), "Device patch did not update name");

  const statusChanged = await jsonRequest(`/iot/devices/${device.id}/status`, adminToken, "PATCH", { status: "OFFLINE" }, "device-status");
  assertStatus("patch device status", statusChanged.response.status, 200);
  assertUniformResponse("patch device status", statusChanged.body);
  assert(statusChanged.body.data.onlineStatus === "offline", "Device status should normalize to offline");

  const resetSecret = await jsonRequest(`/iot/devices/${device.id}/reset-secret`, adminToken, "POST", {}, "device-reset-secret");
  assertStatus("reset device secret", resetSecret.response.status, 201);
  assertUniformResponse("reset device secret", resetSecret.body);
  assert(resetSecret.body.data?.device_secret, "Reset secret must return one-time plaintext secret");

  const normalCreate = await jsonRequest("/iot/devices", normalToken, "POST", {
    device_name: `S9A 普通用户无权限设备 ${stamp}`,
    device_type: "CAMERA"
  }, "normal-create-device");
  assertStatus("normal user create device denied", normalCreate.response.status, 403);

  const isolatedName = `S9A isolated device ${stamp}`;
  await psql(`
INSERT INTO biz_iot_device (
  tenant_id, park_id, device_code, device_name, device_type, protocol_type, status, online_status, is_deleted, create_time, update_time
) VALUES (
  'TENANT-S9A-OTHER', 'PARK-S9A-OTHER', 'S9A-ISO-${stamp}', ${sqlLiteral(isolatedName)}, 'CAMERA', 'MQTT', 'enabled', 'online', false, NOW(), NOW()
);`);
  const isolatedList = await jsonRequest(`/iot/devices?keyword=${encodeURIComponent(isolatedName)}`, adminToken, "GET", undefined, "tenant-isolation");
  assertStatus("tenant isolation list", isolatedList.response.status, 200);
  assertUniformResponse("tenant isolation list", isolatedList.body);
  assert(extractItems(isolatedList.body).length === 0, "Cross-tenant device leaked into current tenant query");

  const gatewayDeleteWithDevice = await jsonRequest(`/iot/gateways/${gateway.id}`, adminToken, "DELETE", undefined, "gateway-delete-blocked");
  assertStatus("gateway with device cannot be deleted", gatewayDeleteWithDevice.response.status, 400);

  const disabledDevice = await jsonRequest(`/iot/devices/${device.id}/disable`, adminToken, "POST", {}, "device-disable");
  assertStatus("disable device", disabledDevice.response.status, 201);
  assertUniformResponse("disable device", disabledDevice.body);
  assert(disabledDevice.body.data.isEnabled === false, "Disable should set isEnabled=false");

  const deviceDeleted = await jsonRequest(`/iot/devices/${device.id}`, adminToken, "DELETE", undefined, "device-delete");
  assertStatus("delete device", deviceDeleted.response.status, 200);
  assertUniformResponse("delete device", deviceDeleted.body);

  const gatewayDeleted = await jsonRequest(`/iot/gateways/${gateway.id}`, adminToken, "DELETE", undefined, "gateway-delete");
  assertStatus("delete gateway after device soft delete", gatewayDeleted.response.status, 200);
  assertUniformResponse("delete gateway after device soft delete", gatewayDeleted.body);

  const protocolConfigDeleted = await jsonRequest(`/iot/protocol-configs/${protocolConfig.id}`, adminToken, "DELETE", undefined, "protocol-config-delete");
  assertStatus("delete protocol config", protocolConfigDeleted.response.status, 200);
  assertUniformResponse("delete protocol config", protocolConfigDeleted.body);

  await dbCount(
    "IoT audit logs",
    `SELECT COUNT(*) FROM sys_op_log
     WHERE tenant_id = ${sqlLiteral(tenantId)}
       AND park_id = ${sqlLiteral(parkId)}
       AND resource LIKE 'biz.iot_%'
       AND create_time > NOW() - INTERVAL '30 minutes'`,
    5
  );

  logStep("S9-A IoT device hub smoke passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
