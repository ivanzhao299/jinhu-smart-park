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
const smokeRemark = `S8D video preview platform smoke ${stamp}`;

let apiProcess = null;

function getPnpmBin() {
  if (process.env.PNPM_BIN) return process.env.PNPM_BIN;
  const bundled = resolve(rootDir, ".tools/pnpm");
  return existsSync(bundled) ? bundled : "pnpm";
}

function logStep(message) {
  console.log(`[s8d-video-preview-platform-smoke] ${message}`);
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
      "x-idempotency-key": `s8d-video-${stamp}-${label}-${randomUUID()}`
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

async function login(username, password) {
  return request("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-request-id": `s8d-login-${randomUUID()}` },
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
  logStep("API not reachable, starting @jinhu/api for S8-D video preview smoke test");
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
  assert(unitRow, "No biz_unit fixture found for S8-D smoke");
  const [unitId, buildingId, floorId] = unitRow.split("|");
  return { unitId, buildingId: buildingId || undefined, floorId: floorId || undefined };
}

function assertNoSecretLeak(name, payload) {
  const serialized = JSON.stringify(payload);
  for (const secret of ["s8d-app-secret", "s8d-access-token", "s8d-refresh-token", "StreamSecret", "SnapshotSecret"]) {
    assert(!serialized.includes(secret), `${name} leaked ${secret}`);
  }
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
    "S8-D permission seed",
    `SELECT count(*) FROM sys_permission WHERE tenant_id = ${sqlLiteral(tenantId)} AND code IN ('video_platform_config:read','video_platform_config:create','video_platform_config:update','video_platform_config:delete','video_camera:preview','video_camera:status_check','video_camera:playback') AND is_deleted = false`,
    7
  );

  const deniedPlatformList = await jsonRequest("/video-security/platform-configs", normalToken, "GET", undefined, "normal-platform-list-denied");
  assertStatus("normal user platform config denied", deniedPlatformList.response.status, 403);

  const platformPayload = {
    platform_type: "HIKVISION",
    platform_name: `S8D 海康平台 ${stamp}`,
    vendor_name: "Hikvision",
    app_key: `s8d-app-key-${stamp}`,
    app_secret: "s8d-app-secret",
    access_token: "s8d-access-token",
    refresh_token: "s8d-refresh-token",
    token_expire_at: new Date(Date.now() + 3_600_000).toISOString(),
    api_base_url: "https://hikvision.example.invalid/openapi",
    callback_url: "https://callback.example.invalid/video",
    status: "ACTIVE",
    remark: smokeRemark
  };

  const platformCreated = await jsonRequest("/video-security/platform-configs", adminToken, "POST", platformPayload, "platform-create");
  assertStatus("create platform config", platformCreated.response.status, 201);
  assertUniformResponse("create platform config", platformCreated.body);
  const platformConfig = platformCreated.body.data;
  assert(platformConfig?.id, "created platform config missing id");
  assert(platformConfig.appSecretConfigured === true, "platform secret configured flag missing");
  assertNoSecretLeak("create platform config response", platformCreated.body);

  const platformList = await jsonRequest(`/video-security/platform-configs?keyword=${encodeURIComponent(String(stamp))}`, adminToken, "GET", undefined, "platform-list");
  assertStatus("list platform configs", platformList.response.status, 200);
  assertUniformResponse("list platform configs", platformList.body);
  assert(platformList.body.data.items.some((item) => item.id === platformConfig.id), "platform config missing from list");
  assertNoSecretLeak("platform list response", platformList.body);

  const { unitId, buildingId, floorId } = await getFixtures();
  const cameraPayload = {
    camera_name: `S8D 预览摄像头 ${stamp}`,
    camera_type: "bullet",
    camera_usage: "key_area",
    brand: "Hikvision",
    model: "S8D-M1",
    manufacturer: "S8D Manufacturer",
    platform_type: "HIKVISION",
    platform_device_id: `s8d-device-${stamp}`,
    ip_address: "10.8.1.1",
    port: 554,
    username: "viewer",
    password: "CameraSecret123!",
    rtsp_url: "rtsp://viewer:StreamSecret@video.example.invalid/live",
    hls_url: "https://viewer:StreamSecret@video.example.invalid/live.m3u8",
    snapshot_url: "https://viewer:SnapshotSecret@video.example.invalid/snapshot.jpg",
    building_id: buildingId,
    floor_id: floorId,
    room_id: unitId,
    install_location: "S8D smoke 重点区域",
    status: "ONLINE",
    is_recording: true,
    is_enabled: true,
    remark: smokeRemark
  };

  const cameraCreated = await jsonRequest("/video-security/cameras", adminToken, "POST", cameraPayload, "camera-create");
  assertStatus("create camera for preview", cameraCreated.response.status, 201);
  assertUniformResponse("create camera for preview", cameraCreated.body);
  const camera = cameraCreated.body.data;
  assert(camera?.id, "created preview camera missing id");
  assertNoSecretLeak("create camera response", cameraCreated.body);

  const deniedPreview = await jsonRequest(`/video-security/cameras/${camera.id}/preview-url`, normalToken, "GET", undefined, "normal-preview-denied");
  assertStatus("normal user preview denied", deniedPreview.response.status, 403);

  const preview = await jsonRequest(`/video-security/cameras/${camera.id}/preview-url`, adminToken, "GET", undefined, "preview");
  assertStatus("camera preview-url", preview.response.status, 200);
  assertUniformResponse("camera preview-url", preview.body);
  assert(preview.body.data.protocol === "hls", "preview did not prefer HLS when WebRTC is absent");
  assert(preview.body.data.url?.includes("video.example.invalid/live.m3u8"), "preview URL missing expected HLS path");
  assertNoSecretLeak("preview response", preview.body);

  const snapshot = await jsonRequest(`/video-security/cameras/${camera.id}/snapshot-url`, adminToken, "GET", undefined, "snapshot");
  assertStatus("camera snapshot-url", snapshot.response.status, 200);
  assertUniformResponse("camera snapshot-url", snapshot.body);
  assert(snapshot.body.data.protocol === "snapshot", "snapshot response did not use snapshot protocol");
  assertNoSecretLeak("snapshot response", snapshot.body);

  const statusCheck = await jsonRequest(`/video-security/cameras/${camera.id}/status-check`, adminToken, "GET", undefined, "status-check");
  assertStatus("camera status-check", statusCheck.response.status, 200);
  assertUniformResponse("camera status-check", statusCheck.body);
  assert(statusCheck.body.data.status === "ONLINE", "status-check did not return ONLINE");

  const playback = await jsonRequest(
    `/video-security/cameras/${camera.id}/playback-url?start_time=${encodeURIComponent(new Date(Date.now() - 3_600_000).toISOString())}&end_time=${encodeURIComponent(new Date().toISOString())}`,
    adminToken,
    "GET",
    undefined,
    "playback"
  );
  assertStatus("camera playback-url", playback.response.status, 200);
  assertUniformResponse("camera playback-url", playback.body);
  assertNoSecretLeak("playback response", playback.body);

  const disabledConfig = await jsonRequest(`/video-security/platform-configs/${platformConfig.id}`, adminToken, "PATCH", { status: "DISABLED" }, "platform-disable");
  assertStatus("disable platform config", disabledConfig.response.status, 200);
  assertUniformResponse("disable platform config", disabledConfig.body);

  const previewAfterDisable = await jsonRequest(`/video-security/cameras/${camera.id}/preview-url`, adminToken, "GET", undefined, "preview-after-disable");
  assertStatus("preview after disabled platform", previewAfterDisable.response.status, 400);

  const deletedCamera = await jsonRequest(`/video-security/cameras/${camera.id}`, adminToken, "DELETE", undefined, "camera-delete");
  assertStatus("delete preview camera", deletedCamera.response.status, 200);
  assertUniformResponse("delete preview camera", deletedCamera.body);

  const deletedPlatform = await jsonRequest(`/video-security/platform-configs/${platformConfig.id}`, adminToken, "DELETE", undefined, "platform-delete");
  assertStatus("delete platform config", deletedPlatform.response.status, 200);
  assertUniformResponse("delete platform config", deletedPlatform.body);

  await dbCount("platform config soft delete", `SELECT count(*) FROM video_platform_config WHERE id = ${sqlLiteral(platformConfig.id)}::uuid AND is_deleted = true`, 1);
  await dbCount("S8-D audit log", `SELECT count(*) FROM sys_op_log WHERE tenant_id = ${sqlLiteral(tenantId)} AND park_id = ${sqlLiteral(parkId)} AND path LIKE '%video-security%' AND create_time > now() - interval '15 minutes'`, 1);
  logStep("S8-D video preview/platform smoke completed");
}

main().catch((error) => {
  console.error(`[s8d-video-preview-platform-smoke] ${error instanceof Error ? error.stack : error}`);
  process.exitCode = 1;
});
