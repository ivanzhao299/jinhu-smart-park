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
const smokeRemark = `S8F video alert dashboard smoke ${stamp}`;

let apiProcess = null;

function getPnpmBin() {
  if (process.env.PNPM_BIN) return process.env.PNPM_BIN;
  const bundled = resolve(rootDir, ".tools/pnpm");
  return existsSync(bundled) ? bundled : "pnpm";
}

function logStep(message) {
  console.log(`[s8f-video-alert-dashboard-smoke] ${message}`);
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
      "x-idempotency-key": `s8f-video-${stamp}-${label}-${randomUUID()}`
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

async function login(username, password) {
  return request("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-request-id": `s8f-login-${randomUUID()}` },
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
  logStep("API not reachable, starting @jinhu/api for S8-F video alert dashboard smoke test");
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
  assert(unitRow, "No biz_unit fixture found for S8-F smoke");
  const [unitId, buildingId, floorId] = unitRow.split("|");
  const parkTenantId = await psql(`
SELECT id::text
FROM biz_park_tenant
WHERE tenant_id = ${sqlLiteral(tenantId)}
  AND park_id = ${sqlLiteral(parkId)}
  AND is_deleted = false
ORDER BY create_time ASC
LIMIT 1;`);
  assert(parkTenantId, "No biz_park_tenant fixture found for S8-F smoke");
  return { unitId, buildingId: buildingId || undefined, floorId: floorId || undefined, parkTenantId };
}

async function getAdminId(token) {
  const me = await request("/users/me", { headers: { authorization: `Bearer ${token}` } });
  assertStatus("admin users/me", me.response.status, 200);
  assertUniformResponse("admin users/me", me.body);
  assert(me.body.data?.id, "admin users/me missing id");
  return me.body.data.id;
}

async function createCamera(token, fixtures, name, status = "ONLINE") {
  const created = await jsonRequest("/video-security/cameras", token, "POST", {
    camera_name: `${name} ${stamp}`,
    camera_type: "bullet",
    camera_usage: "key_area",
    brand: "Cloudsee",
    model: "S8F-M1",
    manufacturer: "S8F Manufacturer",
    platform_type: "LOCAL_RTSP",
    platform_device_id: `${name}-${stamp}`,
    hls_url: `https://video.example.invalid/s8f/${stamp}/${name}/live.m3u8`,
    snapshot_url: `https://video.example.invalid/s8f/${stamp}/${name}/snapshot.jpg`,
    building_id: fixtures.buildingId,
    floor_id: fixtures.floorId,
    room_id: fixtures.unitId,
    install_location: `S8F smoke ${name}`,
    status,
    is_recording: true,
    is_enabled: true,
    remark: smokeRemark
  }, `camera-${name}`);
  assertStatus(`create ${name} camera`, created.response.status, 201);
  assertUniformResponse(`create ${name} camera`, created.body);
  assert(created.body.data?.id, `${name} camera missing id`);
  return created.body.data;
}

async function createSafetyContext(token, fixtures, adminId) {
  const pointCreated = await jsonRequest("/safety/inspect-points", token, "POST", {
    point_name: `S8F smoke point ${stamp}`,
    point_type: "fire",
    risk_level: "10",
    unit_id: fixtures.unitId,
    park_tenant_id: fixtures.parkTenantId,
    location: `S8F point location ${stamp}`,
    check_method: "manual",
    required_photo_count: 0,
    required_scan: false,
    required_gps: false,
    status: "enabled",
    remark: smokeRemark
  }, "point-create");
  assertStatus("create inspect point", pointCreated.response.status, 201);

  const templateCreated = await jsonRequest("/safety/inspect-templates", token, "POST", {
    template_name: `S8F smoke template ${stamp}`,
    template_type: "fire",
    description: smokeRemark,
    status: "enabled"
  }, "template-create");
  assertStatus("create inspect template", templateCreated.response.status, 201);

  return {
    pointId: pointCreated.body.data.id,
    templateId: templateCreated.body.data.id,
    handlerId: adminId
  };
}

async function assertDashboard(token) {
  for (const path of [
    "/video-security/dashboard/overview",
    "/video-security/dashboard/alert-trends",
    "/video-security/dashboard/device-status",
    "/video-security/dashboard/park-map",
    "/video-security/dashboard/realtime-alerts?limit=5"
  ]) {
    const result = await jsonRequest(path, token, "GET", undefined, `dashboard-${path}`);
    assertStatus(`dashboard ${path}`, result.response.status, 200);
    assertUniformResponse(`dashboard ${path}`, result.body);
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
    "S8-F permission seed",
    `SELECT count(*) FROM sys_permission WHERE tenant_id = ${sqlLiteral(tenantId)} AND code IN ('video_alert:read','video_alert:process','video_alert:close','video_alert:create_inspection','video_alert:create_hazard','video_security_dashboard:read') AND is_deleted = false`,
    6
  );

  const fixtures = await getFixtures();
  const adminId = await getAdminId(adminToken);
  const safetyContext = await createSafetyContext(adminToken, fixtures, adminId);
  const camera = await createCamera(adminToken, fixtures, "primary", "ONLINE");

  const deniedAlertList = await jsonRequest("/video-security/alerts", normalToken, "GET", undefined, "normal-alert-list-denied");
  assertStatus("normal user alert list denied", deniedAlertList.response.status, 403);

  const alertCreated = await jsonRequest("/video-security/alerts", adminToken, "POST", {
    camera_id: camera.id,
    alert_type: "MANUAL_REPORT",
    alert_level: "HIGH",
    alert_source: "MANUAL",
    title: `S8F smoke alert ${stamp}`,
    description: "S8F manual alert smoke",
    snapshot_url: camera.snapshot_url,
    remark: smokeRemark
  }, "alert-create");
  assertStatus("create alert", alertCreated.response.status, 201);
  assertUniformResponse("create alert", alertCreated.body);
  const alert = alertCreated.body.data;
  assert(alert?.id, "created alert missing id");
  assert(alert.processStatus === "PENDING", "created alert should be pending");

  const list = await jsonRequest(`/video-security/alerts?keyword=${encodeURIComponent("S8F smoke alert")}`, adminToken, "GET", undefined, "alert-list");
  assertStatus("query alert list", list.response.status, 200);
  assertUniformResponse("query alert list", list.body);
  assert(list.body.data.total >= 1, "alert list did not return created alert");

  const detail = await jsonRequest(`/video-security/alerts/${alert.id}`, adminToken, "GET", undefined, "alert-detail");
  assertStatus("query alert detail", detail.response.status, 200);
  assertUniformResponse("query alert detail", detail.body);

  const assigned = await jsonRequest(`/video-security/alerts/${alert.id}/assign`, adminToken, "POST", {
    assigned_to: adminId,
    reason: "S8F assign"
  }, "alert-assign");
  assertStatus("assign alert", assigned.response.status, [200, 201]);
  assert(assigned.body.data.assignedTo === adminId, "alert should be assigned");

  const acknowledged = await jsonRequest(`/video-security/alerts/${alert.id}/acknowledge`, adminToken, "POST", { remark: "S8F acknowledge" }, "alert-ack");
  assertStatus("acknowledge alert", acknowledged.response.status, [200, 201]);
  assert(acknowledged.body.data.processStatus === "ACKNOWLEDGED", "alert should be acknowledged");

  const resolved = await jsonRequest(`/video-security/alerts/${alert.id}/resolve`, adminToken, "POST", {
    remark: "S8F processing and resolved",
    assigned_to: adminId
  }, "alert-resolve");
  assertStatus("resolve alert", resolved.response.status, [200, 201]);
  assert(resolved.body.data.processStatus === "RESOLVED", "alert should be resolved");

  const closedWithoutReason = await jsonRequest(`/video-security/alerts/${alert.id}/close`, adminToken, "POST", {}, "alert-close-no-reason");
  assertStatus("close alert requires reason", closedWithoutReason.response.status, 400);

  const closed = await jsonRequest(`/video-security/alerts/${alert.id}/close`, adminToken, "POST", { reason: "S8F resolved and closed" }, "alert-close");
  assertStatus("close alert", closed.response.status, [200, 201]);
  assert(closed.body.data.processStatus === "CLOSED", "alert should be closed");

  const reprocessClosed = await jsonRequest(`/video-security/alerts/${alert.id}/resolve`, adminToken, "POST", { remark: "should fail" }, "alert-reprocess-closed");
  assertStatus("closed alert cannot process", reprocessClosed.response.status, 400);

  const linkedAlertCreated = await jsonRequest("/video-security/alerts", adminToken, "POST", {
    camera_id: camera.id,
    alert_type: "AI_BLOCKED_PASSAGE",
    alert_level: "CRITICAL",
    alert_source: "AI_ANALYSIS",
    title: `S8F linkage alert ${stamp}`,
    description: "S8F linkage smoke",
    remark: smokeRemark
  }, "linked-alert-create");
  assertStatus("create linkage alert", linkedAlertCreated.response.status, 201);
  const linkedAlert = linkedAlertCreated.body.data;

  const inspection = await jsonRequest(`/video-security/alerts/${linkedAlert.id}/create-inspection`, adminToken, "POST", {
    template_id: safetyContext.templateId,
    point_id: safetyContext.pointId,
    handler_id: safetyContext.handlerId,
    remark: "alert generated inspection"
  }, "create-inspection");
  if (![200, 201].includes(inspection.response.status)) {
    console.error("[s8f-video-alert-dashboard-smoke] create inspection body:", JSON.stringify(inspection.body));
  }
  assertStatus("alert creates inspection", inspection.response.status, [200, 201]);
  assertUniformResponse("alert creates inspection", inspection.body);
  assert(inspection.body.data?.inspection_id, "linked inspection id missing");

  const hazard = await jsonRequest(`/video-security/alerts/${linkedAlert.id}/create-hazard`, adminToken, "POST", {
    title: `S8F linked hazard ${stamp}`,
    hazard_type: "passage",
    risk_level: "30",
    description: "S8F alert generated hazard",
    remark: "alert generated hazard"
  }, "create-hazard");
  assertStatus("alert creates hazard", hazard.response.status, 201);
  assertUniformResponse("alert creates hazard", hazard.body);
  assert(hazard.body.data?.hazard_id, "linked hazard id missing");

  const offlineCamera = await createCamera(adminToken, fixtures, "offline", "OFFLINE");
  const detectOffline = await jsonRequest("/video-security/alerts/detect-offline", adminToken, "POST", {}, "detect-offline");
  assertStatus("detect offline cameras", detectOffline.response.status, [200, 201]);
  assertUniformResponse("detect offline cameras", detectOffline.body);
  await dbCount("offline alert generated", `SELECT count(*) FROM video_alert WHERE camera_id = ${sqlLiteral(offlineCamera.id)}::uuid AND alert_type = 'CAMERA_OFFLINE' AND deleted_at IS NULL`, 1);

  await assertDashboard(adminToken);

  const logs = await jsonRequest(`/video-security/alerts/${alert.id}/logs`, adminToken, "GET", undefined, "alert-logs");
  assertStatus("query alert logs", logs.response.status, 200);
  assertUniformResponse("query alert logs", logs.body);
  assert(Array.isArray(logs.body.data) && logs.body.data.length >= 4, "alert logs missing lifecycle rows");

  await dbCount("video alert process logs", `SELECT count(*) FROM video_alert_process_log WHERE tenant_id = ${sqlLiteral(tenantId)} AND park_id = ${sqlLiteral(parkId)} AND create_time > now() - interval '15 minutes'`, 6);
  await dbCount("S8-F audit log", `SELECT count(*) FROM sys_op_log WHERE tenant_id = ${sqlLiteral(tenantId)} AND park_id = ${sqlLiteral(parkId)} AND path LIKE '%video-security%' AND create_time > now() - interval '15 minutes'`, 1);
  logStep("S8-F video alert/dashboard smoke completed");
}

main().catch((error) => {
  console.error(`[s8f-video-alert-dashboard-smoke] ${error instanceof Error ? error.stack : error}`);
  process.exitCode = 1;
});
