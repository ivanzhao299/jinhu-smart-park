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
const smokeRemark = `S8C video camera smoke ${stamp}`;

let apiProcess = null;

function getPnpmBin() {
  if (process.env.PNPM_BIN) return process.env.PNPM_BIN;
  const bundled = resolve(rootDir, ".tools/pnpm");
  return existsSync(bundled) ? bundled : "pnpm";
}

function logStep(message) {
  console.log(`[s8c-video-camera-smoke] ${message}`);
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
      "x-idempotency-key": `s8c-video-${stamp}-${label}-${randomUUID()}`
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

async function login(username, password) {
  return request("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-request-id": `s8c-login-${randomUUID()}` },
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
  logStep("API not reachable, starting @jinhu/api for S8-C video camera smoke test");
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
  assert(unitRow, "No biz_unit fixture found for S8-C smoke");
  const [unitId, buildingId, floorId] = unitRow.split("|");
  return { unitId, buildingId: buildingId || undefined, floorId: floorId || undefined };
}

async function main() {
  await ensureApiStarted();

  const adminLogin = await login(adminUser, adminPassword);
  assertStatus("admin login", adminLogin.response.status, 200);
  assertUniformResponse("admin login", adminLogin.body);
  const adminToken = adminLogin.body.data.accessToken;
  assert(adminToken, "admin login missing accessToken");

  const normalLogin = await login(normalUser, normalPassword);
  assertStatus("normal login", normalLogin.response.status, 200);
  assertUniformResponse("normal login", normalLogin.body);
  const normalToken = normalLogin.body.data.accessToken;
  assert(normalToken, "normal login missing accessToken");

  await dbCount(
    "video camera permission seed",
    `SELECT count(*) FROM sys_permission WHERE tenant_id = ${sqlLiteral(tenantId)} AND code IN ('video_camera:read','video_camera:create','video_camera:update','video_camera:delete','video_camera:status') AND is_deleted = false`,
    5
  );

  const { unitId, buildingId, floorId } = await getFixtures();
  const createPayload = {
    camera_name: `S8C 摄像头 ${stamp}`,
    camera_type: "bullet",
    camera_usage: "entrance",
    brand: "S8CBrand",
    model: "S8C-M1",
    manufacturer: "S8C Manufacturer",
    platform_type: "LOCAL_RTSP",
    platform_device_id: `s8c-device-${stamp}`,
    ip_address: "10.8.0.1",
    port: 554,
    username: "operator",
    password: "Secret123!",
    rtsp_url: "rtsp://10.8.0.1/live",
    hls_url: "https://video.example.invalid/live.m3u8",
    building_id: buildingId,
    floor_id: floorId,
    room_id: unitId,
    install_location: "S8C smoke 出入口",
    longitude: 118.123456,
    latitude: 33.123456,
    direction: "北",
    status: "UNKNOWN",
    is_recording: true,
    is_enabled: true,
    remark: smokeRemark
  };

  const deniedCreate = await jsonRequest("/video-security/cameras", normalToken, "POST", createPayload, "normal-create-denied");
  assertStatus("normal user create camera denied", deniedCreate.response.status, 403);

  const created = await jsonRequest("/video-security/cameras", adminToken, "POST", createPayload, "create");
  assertStatus("create camera", created.response.status, 201);
  assertUniformResponse("create camera", created.body);
  const camera = created.body.data;
  assert(camera?.id, "created camera missing id");
  assert(camera.cameraName === createPayload.camera_name, "created camera name mismatch");
  assert(camera.passwordEncrypted !== "Secret123!", "camera password leaked in response");

  const list = await jsonRequest(`/video-security/cameras?keyword=${encodeURIComponent(String(stamp))}&page=1&page_size=20`, adminToken, "GET", undefined, "list");
  assertStatus("list cameras", list.response.status, 200);
  assertUniformResponse("list cameras", list.body);
  assert(list.body.data.items.some((item) => item.id === camera.id), "created camera not found in list");

  if (buildingId) {
    const byBuilding = await jsonRequest(`/video-security/cameras?building_id=${buildingId}&page=1&page_size=20`, adminToken, "GET", undefined, "filter-building");
    assertStatus("filter by building", byBuilding.response.status, 200);
    assertUniformResponse("filter by building", byBuilding.body);
    assert(byBuilding.body.data.items.some((item) => item.id === camera.id), "camera missing from building filter");
  }

  const byStatus = await jsonRequest("/video-security/cameras?status=UNKNOWN&page=1&page_size=20", adminToken, "GET", undefined, "filter-status");
  assertStatus("filter by status", byStatus.response.status, 200);
  assertUniformResponse("filter by status", byStatus.body);
  assert(byStatus.body.data.items.some((item) => item.id === camera.id), "camera missing from status filter");

  const patched = await jsonRequest(`/video-security/cameras/${camera.id}`, adminToken, "PATCH", {
    camera_name: `S8C 摄像头已编辑 ${stamp}`,
    camera_usage: "key_area",
    brand: "S8CBrandUpdated",
    remark: `${smokeRemark} updated`
  }, "update");
  assertStatus("update camera", patched.response.status, 200);
  assertUniformResponse("update camera", patched.body);
  assert(patched.body.data.cameraName.includes("已编辑"), "camera update did not persist");

  const online = await jsonRequest(`/video-security/cameras/${camera.id}/status`, adminToken, "PATCH", {
    status: "ONLINE",
    is_enabled: true
  }, "status-online");
  assertStatus("update online status", online.response.status, 200);
  assertUniformResponse("update online status", online.body);
  assert(online.body.data.status === "ONLINE", "camera status did not change to ONLINE");

  const disabled = await jsonRequest(`/video-security/cameras/${camera.id}/status`, adminToken, "PATCH", {
    status: "DISABLED",
    is_enabled: false
  }, "status-disabled");
  assertStatus("disable camera", disabled.response.status, 200);
  assertUniformResponse("disable camera", disabled.body);
  assert(disabled.body.data.isEnabled === false && disabled.body.data.status === "DISABLED", "camera disable did not persist");

  const alienCode = `S8C-ALIEN-${stamp}`;
  await psql(`
INSERT INTO camera_device (
  tenant_id, park_id, camera_code, camera_name, camera_usage, platform_type, status, is_enabled, create_by, update_by, remark
) VALUES (
  '19999999', ${sqlLiteral(parkId)}, ${sqlLiteral(alienCode)}, ${sqlLiteral(alienCode)}, 'entrance', 'LOCAL_RTSP', 'ONLINE', true, 'smoke', 'smoke', ${sqlLiteral(smokeRemark)}
);`);
  const isolation = await jsonRequest(`/video-security/cameras?keyword=${encodeURIComponent(alienCode)}&page=1&page_size=20`, adminToken, "GET", undefined, "tenant-isolation");
  assertStatus("tenant isolation query", isolation.response.status, 200);
  assertUniformResponse("tenant isolation query", isolation.body);
  assert(!isolation.body.data.items.some((item) => item.cameraCode === alienCode), "cross-tenant camera leaked into list");

  const mapResult = await jsonRequest("/video-security/cameras/map?page=1&page_size=20", adminToken, "GET", undefined, "map");
  assertStatus("camera map", mapResult.response.status, 200);
  assertUniformResponse("camera map", mapResult.body);

  const byLocation = await jsonRequest(`/video-security/cameras/by-location?room_id=${unitId}&page=1&page_size=20`, adminToken, "GET", undefined, "by-location");
  assertStatus("camera by-location", byLocation.response.status, 200);
  assertUniformResponse("camera by-location", byLocation.body);

  const deleted = await jsonRequest(`/video-security/cameras/${camera.id}`, adminToken, "DELETE", undefined, "delete");
  assertStatus("delete camera", deleted.response.status, 200);
  assertUniformResponse("delete camera", deleted.body);
  await dbCount("camera soft delete", `SELECT count(*) FROM camera_device WHERE id = ${sqlLiteral(camera.id)}::uuid AND is_deleted = true`, 1);
  await dbCount("video camera audit log", `SELECT count(*) FROM sys_op_log WHERE tenant_id = ${sqlLiteral(tenantId)} AND park_id = ${sqlLiteral(parkId)} AND path LIKE '%video-security/cameras%' AND create_time > now() - interval '15 minutes'`, 1);

  await psql(`DELETE FROM camera_device WHERE tenant_id = '19999999' AND camera_code = ${sqlLiteral(alienCode)};`);
  logStep("S8-C video camera smoke completed");
}

main().catch((error) => {
  console.error(`[s8c-video-camera-smoke] ${error instanceof Error ? error.stack : error}`);
  process.exitCode = 1;
});
