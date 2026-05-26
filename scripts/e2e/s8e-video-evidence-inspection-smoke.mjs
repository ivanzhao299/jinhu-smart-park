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
const smokeRemark = `S8E video evidence inspection smoke ${stamp}`;

let apiProcess = null;

function getPnpmBin() {
  if (process.env.PNPM_BIN) return process.env.PNPM_BIN;
  const bundled = resolve(rootDir, ".tools/pnpm");
  return existsSync(bundled) ? bundled : "pnpm";
}

function logStep(message) {
  console.log(`[s8e-video-evidence-inspection-smoke] ${message}`);
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
      "x-idempotency-key": `s8e-video-${stamp}-${label}-${randomUUID()}`
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

async function login(username, password) {
  return request("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-request-id": `s8e-login-${randomUUID()}` },
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
  logStep("API not reachable, starting @jinhu/api for S8-E video evidence smoke test");
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
  assert(unitRow, "No biz_unit fixture found for S8-E smoke");
  const [unitId, buildingId, floorId] = unitRow.split("|");
  const parkTenantId = await psql(`
SELECT id::text
FROM biz_park_tenant
WHERE tenant_id = ${sqlLiteral(tenantId)}
  AND park_id = ${sqlLiteral(parkId)}
  AND is_deleted = false
ORDER BY create_time ASC
LIMIT 1;`);
  assert(parkTenantId, "No biz_park_tenant fixture found for S8-E smoke");
  return { unitId, buildingId: buildingId || undefined, floorId: floorId || undefined, parkTenantId };
}

async function getAdminId(token) {
  const me = await request("/users/me", { headers: { authorization: `Bearer ${token}` } });
  assertStatus("admin users/me", me.response.status, 200);
  assertUniformResponse("admin users/me", me.body);
  assert(me.body.data?.id, "admin users/me missing id");
  return me.body.data.id;
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
    "S8-E permission seed",
    `SELECT count(*) FROM sys_permission WHERE tenant_id = ${sqlLiteral(tenantId)} AND code IN ('video_evidence:read','video_evidence:create','video_evidence:delete','video_camera:capture_snapshot','video_camera:create_inspection_issue') AND is_deleted = false`,
    5
  );

  const adminId = await getAdminId(adminToken);
  const { unitId, buildingId, floorId, parkTenantId } = await getFixtures();

  const deniedEvidenceList = await jsonRequest("/video-security/evidences", normalToken, "GET", undefined, "normal-evidence-list-denied");
  assertStatus("normal user evidence denied", deniedEvidenceList.response.status, 403);

  const cameraCreated = await jsonRequest("/video-security/cameras", adminToken, "POST", {
    camera_name: `S8E 取证摄像头 ${stamp}`,
    camera_type: "bullet",
    camera_usage: "key_area",
    brand: "Cloudsee",
    model: "S8E-M1",
    manufacturer: "S8E Manufacturer",
    platform_type: "LOCAL_RTSP",
    platform_device_id: `s8e-device-${stamp}`,
    hls_url: `https://video.example.invalid/s8e/${stamp}/live.m3u8`,
    snapshot_url: `https://video.example.invalid/s8e/${stamp}/snapshot.jpg`,
    building_id: buildingId,
    floor_id: floorId,
    room_id: unitId,
    install_location: `S8E smoke location ${stamp}`,
    status: "ONLINE",
    is_recording: true,
    is_enabled: true,
    remark: smokeRemark
  }, "camera-create");
  assertStatus("create camera", cameraCreated.response.status, 201);
  assertUniformResponse("create camera", cameraCreated.body);
  const camera = cameraCreated.body.data;
  assert(camera?.id, "created camera missing id");

  const pointCreated = await jsonRequest("/safety/inspect-points", adminToken, "POST", {
    point_name: `S8E smoke point ${stamp}`,
    point_type: "fire",
    risk_level: "10",
    unit_id: unitId,
    park_tenant_id: parkTenantId,
    location: `S8E point location ${stamp}`,
    check_method: "manual",
    required_photo_count: 0,
    required_scan: false,
    required_gps: false,
    status: "enabled",
    remark: smokeRemark
  }, "point-create");
  assertStatus("create inspect point", pointCreated.response.status, 201);
  const point = pointCreated.body.data;
  assert(point?.id, "inspect point missing id");

  const templateCreated = await jsonRequest("/safety/inspect-templates", adminToken, "POST", {
    template_name: `S8E smoke template ${stamp}`,
    template_type: "fire",
    description: smokeRemark,
    status: "enabled"
  }, "template-create");
  assertStatus("create inspect template", templateCreated.response.status, 201);
  const template = templateCreated.body.data;
  assert(template?.id, "inspect template missing id");

  const taskCreated = await jsonRequest("/safety/inspect-tasks", adminToken, "POST", {
    template_id: template.id,
    point_id: point.id,
    handler_id: adminId,
    plan_time: new Date().toISOString(),
    due_time: new Date(Date.now() + 86_400_000).toISOString(),
    remark: smokeRemark
  }, "task-create");
  assertStatus("create inspect task", taskCreated.response.status, 201);
  const task = taskCreated.body.data;
  assert(task?.id, "inspect task missing id");

  const hazardCreated = await jsonRequest("/safety/hazards", adminToken, "POST", {
    hazard_type: "fire",
    risk_level: "10",
    title: `S8E manual hazard ${stamp}`,
    description: "S8E manual hazard smoke",
    building_id: buildingId,
    floor_id: floorId,
    unit_id: unitId,
    park_tenant_id: parkTenantId,
    location: `S8E hazard location ${stamp}`,
    remark: smokeRemark
  }, "hazard-create");
  assertStatus("create hazard", hazardCreated.response.status, 201);
  const hazard = hazardCreated.body.data;
  assert(hazard?.id, "hazard missing id");

  const snapshotEvidence = await jsonRequest(`/video-security/cameras/${camera.id}/capture-snapshot`, adminToken, "POST", {
    source_type: "MANUAL",
    description: "S8E snapshot evidence"
  }, "capture-snapshot");
  assertStatus("capture camera snapshot", snapshotEvidence.response.status, 201);
  assertUniformResponse("capture camera snapshot", snapshotEvidence.body);
  assert(snapshotEvidence.body.data?.evidence?.id, "snapshot evidence missing id");

  const inspectionEvidence = await jsonRequest(`/safety/inspect-tasks/${task.id}/video-evidences`, adminToken, "POST", {
    camera_id: camera.id,
    evidence_type: "SNAPSHOT",
    evidence_url: `https://video.example.invalid/s8e/${stamp}/inspection.jpg`,
    description: "inspection linked evidence"
  }, "inspection-evidence");
  assertStatus("link inspection evidence", inspectionEvidence.response.status, 201);
  assertUniformResponse("link inspection evidence", inspectionEvidence.body);
  assert(inspectionEvidence.body.data?.id, "inspection evidence missing id");

  const hazardEvidence = await jsonRequest(`/safety/hazards/${hazard.id}/video-evidences`, adminToken, "POST", {
    camera_id: camera.id,
    evidence_type: "SNAPSHOT",
    evidence_url: `https://video.example.invalid/s8e/${stamp}/hazard.jpg`,
    description: "hazard linked evidence"
  }, "hazard-evidence");
  assertStatus("link hazard evidence", hazardEvidence.response.status, 201);
  assertUniformResponse("link hazard evidence", hazardEvidence.body);
  const hazardEvidenceId = hazardEvidence.body.data?.id;
  assert(hazardEvidenceId, "hazard evidence missing id");

  const createIssue = await jsonRequest(`/video-security/cameras/${camera.id}/create-inspection-issue`, adminToken, "POST", {
    title: `S8E camera issue ${stamp}`,
    hazard_type: "other",
    risk_level: "10",
    description: "Camera abnormal smoke issue"
  }, "camera-issue");
  assertStatus("camera creates inspection issue", createIssue.response.status, 201);
  assertUniformResponse("camera creates inspection issue", createIssue.body);
  assert(createIssue.body.data?.hazard_id, "camera issue did not create hazard");

  await psql(`UPDATE biz_safety_hazard SET status = '60', update_time = now() WHERE id = ${sqlLiteral(hazard.id)}::uuid;`);
  const closedHazardEvidence = await jsonRequest(`/safety/hazards/${hazard.id}/video-evidences`, adminToken, "POST", {
    camera_id: camera.id,
    evidence_type: "SNAPSHOT",
    evidence_url: `https://video.example.invalid/s8e/${stamp}/closed-hazard.jpg`
  }, "closed-hazard-evidence");
  assertStatus("closed hazard cannot add evidence", closedHazardEvidence.response.status, 400);

  const normalLinkDenied = await jsonRequest(`/safety/inspect-tasks/${task.id}/video-evidences`, normalToken, "POST", {
    camera_id: camera.id,
    evidence_type: "SNAPSHOT",
    evidence_url: `https://video.example.invalid/s8e/${stamp}/denied.jpg`
  }, "normal-link-denied");
  assertStatus("normal user cannot link video evidence", normalLinkDenied.response.status, 403);

  const deletedEvidence = await jsonRequest(`/video-security/evidences/${hazardEvidenceId}`, adminToken, "DELETE", undefined, "evidence-delete");
  assertStatus("delete video evidence", deletedEvidence.response.status, 200);
  assertUniformResponse("delete video evidence", deletedEvidence.body);
  await dbCount("video evidence soft delete", `SELECT count(*) FROM video_evidence WHERE id = ${sqlLiteral(hazardEvidenceId)}::uuid AND is_deleted = true`, 1);

  await dbCount("video evidence rows", `SELECT count(*) FROM video_evidence WHERE tenant_id = ${sqlLiteral(tenantId)} AND park_id = ${sqlLiteral(parkId)} AND create_time > now() - interval '15 minutes'`, 3);
  await dbCount("camera generated safety log", `SELECT count(*) FROM biz_safety_action_log WHERE tenant_id = ${sqlLiteral(tenantId)} AND park_id = ${sqlLiteral(parkId)} AND action IN ('create_from_camera','create_inspection_issue') AND create_time > now() - interval '15 minutes'`, 1);
  await dbCount("S8-E audit log", `SELECT count(*) FROM sys_op_log WHERE tenant_id = ${sqlLiteral(tenantId)} AND park_id = ${sqlLiteral(parkId)} AND path LIKE '%video-security%' AND create_time > now() - interval '15 minutes'`, 1);
  logStep("S8-E video evidence/inspection smoke completed");
}

main().catch((error) => {
  console.error(`[s8e-video-evidence-inspection-smoke] ${error instanceof Error ? error.stack : error}`);
  process.exitCode = 1;
});
