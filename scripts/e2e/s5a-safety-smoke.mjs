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
const normalPassword = process.env.E2E_NORMAL_PASSWORD ?? "Jinhu@123456";
const stamp = Date.now();
const smokeRemark = `S5A safety smoke ${stamp}`;

let apiProcess = null;

function getPnpmBin() {
  if (process.env.PNPM_BIN) return process.env.PNPM_BIN;
  const bundled = resolve(rootDir, ".tools/pnpm");
  return existsSync(bundled) ? bundled : "pnpm";
}

function logStep(message) {
  console.log(`[s5a-safety-smoke] ${message}`);
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

function asArray(value) {
  return Array.isArray(value) ? value : [];
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
      "x-idempotency-key": `s5a-safety-${stamp}-${label}-${randomUUID()}`
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

async function formRequest(path, token, form, label = "form") {
  return request(path, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "x-idempotency-key": `s5a-safety-${stamp}-${label}-${randomUUID()}`
    },
    body: form
  });
}

async function login(username, password) {
  return request("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-request-id": `s5a-login-${randomUUID()}` },
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
  logStep("API not reachable, starting @jinhu/api for S5-A safety smoke test");
  apiProcess = spawn(getPnpmBin(), ["--filter", "@jinhu/api", "start"], {
    cwd: rootDir,
    detached: true,
    stdio: "ignore",
    env: { ...process.env }
  });
  apiProcess.unref();
  await waitForApi();
}

async function dbScalar(sql) {
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

async function assertDbCount(name, sql, minimum = 1) {
  const value = Number(await dbScalar(sql));
  assert(Number.isFinite(value), `${name} did not return a numeric count`);
  assert(value >= minimum, `${name} expected at least ${minimum}, got ${value}`);
  logStep(`${name}: ${value}`);
}

async function withModuleDisabled(moduleCode, callback) {
  const originalState = await dbScalar(`
SELECT tenant_module.enabled::text || '|' || tenant_module.status
FROM rel_tenant_module tenant_module
JOIN sys_module module ON module.id = tenant_module.module_id
WHERE tenant_module.tenant_id = ${sqlLiteral(tenantId)}
  AND tenant_module.park_id = ${sqlLiteral(parkId)}
  AND tenant_module.is_deleted = false
  AND module.module_code = ${sqlLiteral(moduleCode)}
LIMIT 1;`);
  assert(originalState, `${moduleCode} tenant module relation not found`);
  const [wasEnabled, previousStatus] = originalState.split("|");
  await dbScalar(`
UPDATE rel_tenant_module
SET enabled = false, status = 'disabled', update_time = now()
WHERE tenant_id = ${sqlLiteral(tenantId)}
  AND park_id = ${sqlLiteral(parkId)}
  AND module_id = (SELECT id FROM sys_module WHERE module_code = ${sqlLiteral(moduleCode)} AND is_deleted = false LIMIT 1);`);
  try {
    await callback();
  } finally {
    await dbScalar(`
UPDATE rel_tenant_module
SET enabled = ${wasEnabled === "true" ? "true" : "false"}, status = ${sqlLiteral(previousStatus)}, update_time = now()
WHERE tenant_id = ${sqlLiteral(tenantId)}
  AND park_id = ${sqlLiteral(parkId)}
  AND module_id = (SELECT id FROM sys_module WHERE module_code = ${sqlLiteral(moduleCode)} AND is_deleted = false LIMIT 1);`);
  }
}

async function uploadSmokeFile(token, bizType, label) {
  const form = new FormData();
  form.append("biz_type", bizType);
  form.append("biz_id", randomUUID());
  form.append("remark", smokeRemark);
  form.append("file", new Blob([`S5A safety smoke ${label} ${stamp}`], { type: "image/png" }), `${label}-${stamp}.png`);
  const uploaded = await formRequest("/files", token, form, `upload-${label}`);
  assertStatus(`upload ${label}`, uploaded.response.status, 201);
  assertUniformResponse(`upload ${label}`, uploaded.body);
  assert(uploaded.body.data?.id, `${label} upload missing id`);
  return uploaded.body.data;
}

async function getAssetAndTenantFixtures() {
  const unitRow = await dbScalar(`
SELECT id::text || '|' || COALESCE(building_id::text, '') || '|' || COALESCE(floor_id::text, '')
FROM biz_unit
WHERE tenant_id = ${sqlLiteral(tenantId)}
  AND park_id = ${sqlLiteral(parkId)}
  AND is_deleted = false
ORDER BY create_time ASC
LIMIT 1;`);
  assert(unitRow, "No biz_unit fixture found for S5-A smoke");
  const [unitId, buildingId, floorId] = unitRow.split("|");
  const parkTenantId = await dbScalar(`
SELECT id::text
FROM biz_park_tenant
WHERE tenant_id = ${sqlLiteral(tenantId)}
  AND park_id = ${sqlLiteral(parkId)}
  AND is_deleted = false
ORDER BY create_time ASC
LIMIT 1;`);
  assert(parkTenantId, "No biz_park_tenant fixture found for S5-A smoke");
  return { unitId, buildingId: buildingId || undefined, floorId: floorId || undefined, parkTenantId };
}

async function createSmokeNormalUser(adminToken) {
  const username = `s5a_smoke_normal_${stamp}`;
  const created = await jsonRequest("/users", adminToken, "POST", {
    username,
    displayName: `S5A Smoke Normal ${stamp}`,
    password: normalPassword,
    status: "enabled",
    remark: smokeRemark
  }, "normal-user-create");
  assertStatus("create smoke normal user", created.response.status, 201);
  assertUniformResponse("create smoke normal user", created.body);
  assert(created.body.data?.id, "smoke normal user response missing id");
  return { id: created.body.data.id, username };
}

async function cleanupSmokeNormalUser(userId) {
  if (!userId) return;
  await dbScalar(`
UPDATE sys_user
SET is_deleted = true, update_time = now()
WHERE id = ${sqlLiteral(userId)}
  AND username LIKE 's5a_smoke_normal_%';`);
}

function hasPermission(userContext, permission) {
  const permissions = new Set(userContext?.permissions ?? []);
  return userContext?.is_super === true || userContext?.isSuper === true || permissions.has("*") || permissions.has(permission);
}

function emergencyPayload(label) {
  return {
    incident_type: "fire",
    severity_level: "30",
    title: `S5A ${label} emergency ${stamp}`,
    description: `S5A ${label} emergency conversion smoke`,
    reason: `S5A ${label} emergency conversion`
  };
}

async function withForeignSafetyRows(callback) {
  const foreignTenantId = `safety-smoke-tenant-${stamp}`;
  const foreignParkId = `safety-smoke-park-${stamp}`;
  const foreignPointId = randomUUID();
  const foreignHazardId = randomUUID();

  await dbScalar(`
INSERT INTO biz_safety_inspect_point (
  id, tenant_id, park_id, code, point_code, point_name, point_type, risk_level,
  location, check_method, status, remark
) VALUES (
  ${sqlLiteral(foreignPointId)},
  ${sqlLiteral(foreignTenantId)},
  ${sqlLiteral(foreignParkId)},
  ${sqlLiteral(`S5A-XP-${stamp}`)},
  ${sqlLiteral(`S5A-XP-${stamp}`)},
  ${sqlLiteral(`S5A foreign point ${stamp}`)},
  'fire',
  '10',
  ${sqlLiteral(`S5A foreign point location ${stamp}`)},
  'manual',
  'enabled',
  ${sqlLiteral(smokeRemark)}
);`);

  await dbScalar(`
INSERT INTO biz_safety_hazard (
  id, tenant_id, park_id, code, hazard_code, hazard_title, title, hazard_type,
  risk_level, source_type, location, description, status, remark
) VALUES (
  ${sqlLiteral(foreignHazardId)},
  ${sqlLiteral(foreignTenantId)},
  ${sqlLiteral(foreignParkId)},
  ${sqlLiteral(`S5A-XH-${stamp}`)},
  ${sqlLiteral(`S5A-XH-${stamp}`)},
  ${sqlLiteral(`S5A foreign hazard ${stamp}`)},
  ${sqlLiteral(`S5A foreign hazard ${stamp}`)},
  'fire',
  '10',
  'manual',
  ${sqlLiteral(`S5A foreign hazard location ${stamp}`)},
  ${sqlLiteral("S5A foreign hazard isolation fixture")},
  '10',
  ${sqlLiteral(smokeRemark)}
);`);

  try {
    await callback({ foreignPointId, foreignHazardId });
  } finally {
    await dbScalar(`
UPDATE biz_safety_inspect_point
SET is_deleted = true, update_time = now()
WHERE id = ${sqlLiteral(foreignPointId)};`);
    await dbScalar(`
UPDATE biz_safety_hazard
SET is_deleted = true, update_time = now()
WHERE id = ${sqlLiteral(foreignHazardId)};`);
  }
}

async function main() {
  await ensureApiStarted();

  const adminLogin = await login(adminUser, adminPassword);
  assertStatus("admin login", adminLogin.response.status, 200);
  assertUniformResponse("admin login", adminLogin.body);
  const adminToken = adminLogin.body.data.accessToken;
  assert(adminToken, "admin login missing accessToken");

  const adminMe = await request("/users/me", { headers: { authorization: `Bearer ${adminToken}` } });
  assertStatus("admin users/me", adminMe.response.status, 200);
  assertUniformResponse("admin users/me", adminMe.body);
  const adminId = adminMe.body.data?.id;
  assert(adminId, "admin users/me missing id");
  for (const permission of [
    "safety_inspect_point:create",
    "safety_inspect_task:read",
    "safety_hazard:read",
    "safety_hazard:rectify",
    "safety_hazard:to_emergency",
    "safety_statistics:read"
  ]) {
    assert(hasPermission(adminMe.body.data, permission), `admin safety token missing ${permission}`);
  }

  const { unitId, buildingId, floorId, parkTenantId } = await getAssetAndTenantFixtures();
  const safetyPhoto = await uploadSmokeFile(adminToken, "safety_smoke", "safety-photo");

  const smokeNormalUser = await createSmokeNormalUser(adminToken);
  try {
    const normalLogin = await login(smokeNormalUser.username, normalPassword);
    assertStatus("smoke normal login", normalLogin.response.status, 200);
    assertUniformResponse("smoke normal login", normalLogin.body);
    const normalToken = normalLogin.body.data.accessToken;
    assert(normalToken, "smoke normal login missing accessToken");

    const normalCreatePoint = await jsonRequest("/safety/inspect-points", normalToken, "POST", {
      point_name: `normal denied ${stamp}`,
      point_type: "fire",
      risk_level: "10"
    }, "normal-point-create");
    assertStatus("normal user cannot create safety point", normalCreatePoint.response.status, 403);

    const normalCreateHazard = await jsonRequest("/safety/hazards", normalToken, "POST", {
      hazard_type: "fire",
      risk_level: "10",
      title: `normal denied hazard ${stamp}`,
      location: `normal denied location ${stamp}`
    }, "normal-hazard-create");
    assertStatus("normal user cannot create safety hazard", normalCreateHazard.response.status, 403);

    const normalStatistics = await request("/safety/statistics", { headers: { authorization: `Bearer ${normalToken}` } });
    assertStatus("normal user cannot read safety statistics", normalStatistics.response.status, 403);
  } finally {
    await cleanupSmokeNormalUser(smokeNormalUser.id);
  }

  await withForeignSafetyRows(async ({ foreignPointId, foreignHazardId }) => {
    const foreignPointRead = await request(`/safety/inspect-points/${foreignPointId}`, { headers: { authorization: `Bearer ${adminToken}` } });
    assertStatus("foreign scope inspect point cannot be read", foreignPointRead.response.status, 404);

    const foreignPointUpdate = await jsonRequest(`/safety/inspect-points/${foreignPointId}`, adminToken, "PUT", {
      point_name: `S5A forbidden point update ${stamp}`,
      point_type: "fire",
      risk_level: "10",
      status: "enabled"
    }, "foreign-point-update");
    assertStatus("foreign scope inspect point cannot be updated", foreignPointUpdate.response.status, 404);

    const foreignHazardRead = await request(`/safety/hazards/${foreignHazardId}`, { headers: { authorization: `Bearer ${adminToken}` } });
    assertStatus("foreign scope hazard cannot be read", foreignHazardRead.response.status, 404);

    const foreignHazardUpdate = await jsonRequest(`/safety/hazards/${foreignHazardId}`, adminToken, "PUT", {
      title: `S5A forbidden hazard update ${stamp}`,
      hazard_type: "fire",
      risk_level: "10",
      location: `S5A forbidden hazard location ${stamp}`
    }, "foreign-hazard-update");
    assertStatus("foreign scope hazard cannot be updated", foreignHazardUpdate.response.status, 404);
  });

  const pointPayload = {
    point_name: `S5A smoke point ${stamp}`,
    point_type: "fire",
    risk_level: "10",
    unit_id: unitId,
    park_tenant_id: parkTenantId,
    location: `S5A smoke location ${stamp}`,
    check_method: "manual",
    required_photo_count: 0,
    required_scan: false,
    required_gps: false,
    status: "enabled",
    remark: smokeRemark
  };
  const pointCreate = await jsonRequest("/safety/inspect-points", adminToken, "POST", pointPayload, "point-create");
  assertStatus("admin creates inspect point", pointCreate.response.status, 201);
  assertUniformResponse("admin creates inspect point", pointCreate.body);
  const point = pointCreate.body.data;
  assert(point?.id && point?.pointCode, "inspect point response missing id or pointCode");

  const qrcode = await request(`/safety/inspect-points/${point.id}/qrcode`, { headers: { authorization: `Bearer ${adminToken}` } });
  assertStatus("inspect point qrcode", qrcode.response.status, 200);
  assertUniformResponse("inspect point qrcode", qrcode.body);

  const strictPointCreate = await jsonRequest("/safety/inspect-points", adminToken, "POST", {
    ...pointPayload,
    point_name: `S5A strict point ${stamp}`,
    check_method: "qr_gps_photo",
    required_photo_count: 1,
    required_scan: true,
    required_gps: true
  }, "strict-point-create");
  assertStatus("admin creates strict inspect point", strictPointCreate.response.status, 201);
  const strictPoint = strictPointCreate.body.data;
  assert(strictPoint?.id && strictPoint?.qrCode, "strict point response missing id or qrCode");

  const templateCreate = await jsonRequest("/safety/inspect-templates", adminToken, "POST", {
    template_name: `S5A smoke template ${stamp}`,
    template_type: "fire",
    description: smokeRemark,
    status: "enabled"
  }, "template-create");
  assertStatus("admin creates inspect template", templateCreate.response.status, 201);
  assertUniformResponse("admin creates inspect template", templateCreate.body);
  const template = templateCreate.body.data;
  assert(template?.id, "inspect template response missing id");

  const itemCreate = await jsonRequest(`/safety/inspect-templates/${template.id}/items`, adminToken, "POST", {
    item_name: `消防通道 smoke ${stamp}`,
    item_type: "normal_abnormal",
    hazard_type: "fire",
    default_risk_level: "10",
    required: true,
    sort_no: 1,
    standard_desc: smokeRemark,
    status: "enabled"
  }, "item-create");
  assertStatus("admin creates inspect item", itemCreate.response.status, 201);
  assertUniformResponse("admin creates inspect item", itemCreate.body);
  const item = itemCreate.body.data;
  assert(item?.id, "inspect item response missing id");

  const planCreate = await jsonRequest("/safety/inspect-plans", adminToken, "POST", {
    plan_name: `S5A smoke plan ${stamp}`,
    template_id: template.id,
    point_ids: [point.id],
    frequency_type: "daily",
    start_date: "2026-05-21",
    handler_user_ids: [adminId],
    status: "disabled",
    remark: smokeRemark
  }, "plan-create");
  assertStatus("admin creates inspect plan", planCreate.response.status, 201);
  assertUniformResponse("admin creates inspect plan", planCreate.body);
  const plan = planCreate.body.data;
  assert(plan?.id, "inspect plan response missing id");

  const planEnable = await jsonRequest(`/safety/inspect-plans/${plan.id}/enable`, adminToken, "POST", undefined, "plan-enable");
  assertStatus("admin enables inspect plan", planEnable.response.status, 201);

  const planTime = new Date(stamp).toISOString();
  const generate = await jsonRequest(`/safety/inspect-plans/${plan.id}/generate-tasks`, adminToken, "POST", {
    plan_time: planTime,
    due_time: new Date(stamp + 24 * 60 * 60 * 1000).toISOString()
  }, "plan-generate");
  assertStatus("admin generates inspect tasks", generate.response.status, 201);
  assertUniformResponse("admin generates inspect tasks", generate.body);
  assert(generate.body.data?.generated_count === 1, "plan task generation did not create one task");
  const generatedTaskId = generate.body.data.rows?.find((row) => row.status === "generated")?.id;
  assert(generatedTaskId, "generated inspect task id missing");

  const duplicateGenerate = await jsonRequest(`/safety/inspect-plans/${plan.id}/generate-tasks`, adminToken, "POST", {
    plan_time: planTime,
    due_time: new Date(stamp + 24 * 60 * 60 * 1000).toISOString()
  }, "plan-generate-duplicate");
  assertStatus("duplicate inspect task generation is skipped", duplicateGenerate.response.status, 201);
  assert(duplicateGenerate.body.data?.skipped_count >= 1, "duplicate generation did not skip existing task");

  const inspectTasks = await request(`/safety/inspect-tasks?page=1&page_size=50&plan_id=${plan.id}`, { headers: { authorization: `Bearer ${adminToken}` } });
  assertStatus("inspect tasks list", inspectTasks.response.status, 200);
  assertUniformResponse("inspect tasks list", inspectTasks.body);
  assert(asArray(inspectTasks.body.data?.items).some((task) => task.id === generatedTaskId), "inspect tasks list does not include generated task");

  const myTasks = await request("/safety/my-inspect-tasks?page=1&page_size=20", { headers: { authorization: `Bearer ${adminToken}` } });
  assertStatus("my inspect tasks", myTasks.response.status, 200);
  assertUniformResponse("my inspect tasks", myTasks.body);
  assert(asArray(myTasks.body.data?.items).every((task) => task.handlerId === adminId), "my inspect tasks returned another user's task");

  const startTask = await jsonRequest(`/safety/inspect-tasks/${generatedTaskId}/start`, adminToken, "POST", undefined, "task-start");
  assertStatus("admin starts generated inspect task", startTask.response.status, 201);

  const checkInTask = await jsonRequest(`/safety/inspect-tasks/${generatedTaskId}/check-in`, adminToken, "POST", {}, "task-check-in");
  assertStatus("admin checks in generated inspect task", checkInTask.response.status, 201);

  const missingResults = await jsonRequest(`/safety/inspect-tasks/${generatedTaskId}/submit-results`, adminToken, "POST", {
    results: [],
    finish_task: true
  }, "task-submit-missing");
  assertStatus("required inspect item missing is rejected", missingResults.response.status, 400);

  const submitTask = await jsonRequest(`/safety/inspect-tasks/${generatedTaskId}/submit-results`, adminToken, "POST", {
    results: [
      {
        item_id: item.id,
        result: "abnormal",
        value_text: "S5A smoke abnormal item",
        photo_file_ids: [safetyPhoto.id],
        create_hazard: true
      }
    ],
    finish_task: true
  }, "task-submit-abnormal");
  assertStatus("abnormal inspect result creates hazard", submitTask.response.status, 201);
  assertUniformResponse("abnormal inspect result creates hazard", submitTask.body);
  assert(submitTask.body.data?.status === "30", "finished abnormal inspect task should be completed");
  assert(submitTask.body.data?.result === "abnormal", "inspect task result should be abnormal");

  const inspectionHazardId = await dbScalar(`
SELECT id::text
FROM biz_safety_hazard
WHERE tenant_id = ${sqlLiteral(tenantId)}
  AND park_id = ${sqlLiteral(parkId)}
  AND source_type = 'inspection'
  AND source_id = ${sqlLiteral(generatedTaskId)}
  AND is_deleted = false
ORDER BY create_time DESC
LIMIT 1;`);
  assert(inspectionHazardId, "abnormal inspect result did not create hazard");

  const strictTaskCreate = await jsonRequest("/safety/inspect-tasks", adminToken, "POST", {
    template_id: template.id,
    point_id: strictPoint.id,
    handler_id: adminId,
    plan_time: new Date(stamp + 1).toISOString(),
    remark: smokeRemark
  }, "strict-task-create");
  assertStatus("admin creates strict manual task", strictTaskCreate.response.status, 201);
  const strictTask = strictTaskCreate.body.data;
  assert(strictTask?.id, "strict task response missing id");

  const strictNoQr = await jsonRequest(`/safety/inspect-tasks/${strictTask.id}/check-in`, adminToken, "POST", {}, "strict-check-in-no-qr");
  assertStatus("strict task rejects missing qr code", strictNoQr.response.status, 400);
  const strictNoGps = await jsonRequest(`/safety/inspect-tasks/${strictTask.id}/check-in`, adminToken, "POST", {
    qr_code: strictPoint.qrCode
  }, "strict-check-in-no-gps");
  assertStatus("strict task rejects missing gps", strictNoGps.response.status, 400);
  const strictNoPhoto = await jsonRequest(`/safety/inspect-tasks/${strictTask.id}/check-in`, adminToken, "POST", {
    qr_code: strictPoint.qrCode,
    gps_lng: 118.123456,
    gps_lat: 33.123456
  }, "strict-check-in-no-photo");
  assertStatus("strict task rejects missing photo", strictNoPhoto.response.status, 400);
  const strictCheckIn = await jsonRequest(`/safety/inspect-tasks/${strictTask.id}/check-in`, adminToken, "POST", {
    qr_code: strictPoint.qrCode,
    gps_lng: 118.123456,
    gps_lat: 33.123456,
    photo_file_ids: [safetyPhoto.id]
  }, "strict-check-in");
  assertStatus("strict task accepts qr gps photo", strictCheckIn.response.status, 201);

  const hazardCreate = await jsonRequest("/safety/hazards", adminToken, "POST", {
    hazard_type: "fire",
    risk_level: "10",
    title: `S5A manual hazard ${stamp}`,
    description: "S5A manual hazard smoke",
    building_id: buildingId,
    floor_id: floorId,
    unit_id: unitId,
    park_tenant_id: parkTenantId,
    location: `S5A hazard location ${stamp}`,
    before_photo_file_ids: [safetyPhoto.id],
    remark: smokeRemark
  }, "hazard-create");
  assertStatus("admin creates manual hazard", hazardCreate.response.status, 201);
  assertUniformResponse("admin creates manual hazard", hazardCreate.body);
  const hazard = hazardCreate.body.data;
  assert(hazard?.id, "manual hazard response missing id");

  const deleteInspectionHazard = await request(`/safety/hazards/${inspectionHazardId}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${adminToken}`, "x-idempotency-key": `s5a-delete-${randomUUID()}` }
  });
  assertStatus("registered inspection hazard can be soft deleted", deleteInspectionHazard.response.status, 200);

  const assignMissing = await jsonRequest(`/safety/hazards/${hazard.id}/assign-rectify`, adminToken, "POST", {
    reason: "missing owner"
  }, "hazard-assign-missing");
  assertStatus("hazard assign rectify requires owner and deadline", assignMissing.response.status, 400);

  const assignHazard = await jsonRequest(`/safety/hazards/${hazard.id}/assign-rectify`, adminToken, "POST", {
    rectify_user_id: adminId,
    rectify_deadline: "2026-06-01T18:00:00+08:00",
    reason: "S5A assign rectify"
  }, "hazard-assign");
  assertStatus("admin assigns hazard rectification", assignHazard.response.status, 201);
  assert(assignHazard.body.data?.status === "20", "assigned hazard should be status 20");

  const rectifyNoPhoto = await jsonRequest(`/safety/hazards/${hazard.id}/rectify`, adminToken, "POST", {
    rectify_note: "missing photo",
    after_photo_file_ids: []
  }, "hazard-rectify-no-photo");
  assertStatus("hazard rectify requires after photo", rectifyNoPhoto.response.status, 400);

  const rectifyHazard = await jsonRequest(`/safety/hazards/${hazard.id}/rectify`, adminToken, "POST", {
    rectify_note: "S5A rectified with photo",
    after_photo_file_ids: [safetyPhoto.id]
  }, "hazard-rectify");
  assertStatus("admin rectifies hazard", rectifyHazard.response.status, 201);
  assert(rectifyHazard.body.data?.status === "40", "rectified hazard should be status 40");

  const rejectRectify = await jsonRequest(`/safety/hazards/${hazard.id}/reject-rectify`, adminToken, "POST", {
    reason: "S5A recheck failed"
  }, "hazard-reject-rectify");
  assertStatus("admin rejects rectification", rejectRectify.response.status, 201);
  assert(rejectRectify.body.data?.status === "30", "rejected rectification should return to status 30");

  const rectifyAgain = await jsonRequest(`/safety/hazards/${hazard.id}/rectify`, adminToken, "POST", {
    rectify_note: "S5A rectified again",
    after_photo_file_ids: [safetyPhoto.id]
  }, "hazard-rectify-again");
  assertStatus("admin rectifies hazard again", rectifyAgain.response.status, 201);
  const recheckPass = await jsonRequest(`/safety/hazards/${hazard.id}/recheck`, adminToken, "POST", {
    recheck_result: "pass",
    reason: "S5A recheck pass"
  }, "hazard-recheck-pass");
  assertStatus("admin rechecks hazard pass", recheckPass.response.status, 201);
  assert(recheckPass.body.data?.status === "60", "recheck pass should close hazard");

  const closeAgain = await jsonRequest(`/safety/hazards/${hazard.id}/close`, adminToken, "POST", {
    reason: "already closed"
  }, "hazard-close-again");
  assertStatus("closed hazard cannot close again", closeAgain.response.status, 400);

  const rectifyClosed = await jsonRequest(`/safety/hazards/${hazard.id}/rectify`, adminToken, "POST", {
    rectify_note: "closed hazard cannot rectify",
    after_photo_file_ids: [safetyPhoto.id]
  }, "hazard-rectify-closed");
  assertStatus("closed hazard cannot rectify again", rectifyClosed.response.status, 400);

  const recheckClosed = await jsonRequest(`/safety/hazards/${hazard.id}/recheck`, adminToken, "POST", {
    recheck_result: "pass",
    reason: "closed hazard cannot recheck"
  }, "hazard-recheck-closed");
  assertStatus("closed hazard cannot recheck again", recheckClosed.response.status, 400);

  const upgradeClosed = await jsonRequest(`/safety/hazards/${hazard.id}/upgrade`, adminToken, "POST", {
    reason: "closed hazard cannot upgrade"
  }, "hazard-upgrade-closed");
  assertStatus("closed hazard cannot upgrade", upgradeClosed.response.status, 400);

  const emergencyClosed = await jsonRequest(`/safety/hazards/${hazard.id}/to-emergency`, adminToken, "POST", emergencyPayload("closed-hazard"), "hazard-emergency-closed");
  assertStatus("closed hazard cannot convert to emergency", emergencyClosed.response.status, 400);

  const workOrderHazardCreate = await jsonRequest("/safety/hazards", adminToken, "POST", {
    hazard_type: "fire",
    risk_level: "20",
    title: `S5A workorder hazard ${stamp}`,
    description: "S5A hazard to work order smoke",
    unit_id: unitId,
    park_tenant_id: parkTenantId,
    location: `S5A workorder hazard location ${stamp}`,
    before_photo_file_ids: [safetyPhoto.id],
    remark: smokeRemark
  }, "hazard-for-workorder");
  assertStatus("admin creates hazard for work order", workOrderHazardCreate.response.status, 201);
  const workOrderHazard = workOrderHazardCreate.body.data;
  assert(workOrderHazard?.id, "work order hazard response missing id");

  await withModuleDisabled("workorder", async () => {
    const denied = await jsonRequest(`/safety/hazards/${workOrderHazard.id}/create-work-order`, adminToken, "POST", {
      title: `S5A denied work order ${stamp}`,
      priority: "high",
      urgency: "urgent",
      assignee_id: adminId,
      description: "workorder module disabled"
    }, "workorder-module-disabled");
    assertStatus("workorder module disabled denies hazard conversion", denied.response.status, 403);
  });

  const convertWorkOrder = await jsonRequest(`/safety/hazards/${workOrderHazard.id}/create-work-order`, adminToken, "POST", {
    title: `S5A hazard work order ${stamp}`,
    priority: "high",
    urgency: "urgent",
    assignee_id: adminId,
    description: "S5A convert hazard to work order"
  }, "hazard-create-workorder");
  assertStatus("admin converts hazard to work order", convertWorkOrder.response.status, 201);
  assertUniformResponse("admin converts hazard to work order", convertWorkOrder.body);
  const workOrder = convertWorkOrder.body.data?.work_order;
  assert(workOrder?.id, "hazard conversion did not return work_order");
  assert(workOrder.sourceType === "inspection", "work order sourceType should be inspection");
  assert(workOrder.sourceId === workOrderHazard.id, "work order sourceId should be hazard id");
  assert(convertWorkOrder.body.data?.hazard?.workOrderId === workOrder.id, "hazard did not bind workOrderId");

  const duplicateConvert = await jsonRequest(`/safety/hazards/${workOrderHazard.id}/create-work-order`, adminToken, "POST", {
    title: `S5A duplicate work order ${stamp}`,
    priority: "high",
    urgency: "urgent",
    assignee_id: adminId,
    description: "duplicate"
  }, "hazard-create-workorder-duplicate");
  assertStatus("hazard cannot convert to work order twice", duplicateConvert.response.status, 409);

  const emergencyHazardCreate = await jsonRequest("/safety/hazards", adminToken, "POST", {
    hazard_type: "fire",
    risk_level: "30",
    title: `S5A emergency hazard ${stamp}`,
    description: "S5A hazard to emergency smoke",
    unit_id: unitId,
    park_tenant_id: parkTenantId,
    location: `S5A emergency hazard location ${stamp}`,
    rectify_deadline: "2026-12-31T18:00:00+08:00",
    before_photo_file_ids: [safetyPhoto.id],
    remark: smokeRemark
  }, "hazard-for-emergency");
  assertStatus("admin creates major hazard for emergency", emergencyHazardCreate.response.status, 201);
  const emergencyHazard = emergencyHazardCreate.body.data;
  assert(emergencyHazard?.id, "emergency hazard response missing id");

  const convertEmergency = await jsonRequest(`/safety/hazards/${emergencyHazard.id}/to-emergency`, adminToken, "POST", emergencyPayload("major-hazard"), "hazard-to-emergency");
  assertStatus("admin converts hazard to emergency", convertEmergency.response.status, 201);
  assertUniformResponse("admin converts hazard to emergency", convertEmergency.body);
  assert(convertEmergency.body.data?.emergency_id, "hazard conversion did not return emergency_id");
  assert(convertEmergency.body.data?.hazard?.status === "92", "hazard converted to emergency should be status 92");

  const duplicateEmergency = await jsonRequest(`/safety/hazards/${emergencyHazard.id}/to-emergency`, adminToken, "POST", emergencyPayload("duplicate-major-hazard"), "hazard-to-emergency-duplicate");
  assertStatus("hazard cannot convert to emergency twice", duplicateEmergency.response.status, 409);

  const majorHazardCreate = await jsonRequest("/safety/hazards", adminToken, "POST", {
    hazard_type: "fire",
    risk_level: "30",
    title: `S5A major overdue hazard ${stamp}`,
    description: "S5A major overdue hazard smoke",
    unit_id: unitId,
    park_tenant_id: parkTenantId,
    location: `S5A major overdue hazard location ${stamp}`,
    rectify_deadline: "2026-01-01T00:00:00+08:00",
    before_photo_file_ids: [safetyPhoto.id],
    remark: smokeRemark
  }, "major-hazard-create");
  assertStatus("admin creates major hazard with deadline", majorHazardCreate.response.status, 201);
  const majorHazard = majorHazardCreate.body.data;
  assert(majorHazard?.id, "major hazard response missing id");

  const recalculateOverdue = await jsonRequest("/safety/hazards/recalculate-overdue", adminToken, "POST", undefined, "hazard-recalculate-overdue");
  assertStatus("admin recalculates overdue hazards", recalculateOverdue.response.status, 201);
  assertUniformResponse("admin recalculates overdue hazards", recalculateOverdue.body);
  assert(
    asArray(recalculateOverdue.body.data?.rows).some((row) => row.id === majorHazard.id && row.overdue_flag === true),
    "overdue recalculation did not mark major hazard"
  );

  const overdueList = await request("/safety/hazards/overdue?page=1&page_size=50", { headers: { authorization: `Bearer ${adminToken}` } });
  assertStatus("overdue hazards list", overdueList.response.status, 200);
  assertUniformResponse("overdue hazards list", overdueList.body);
  assert(asArray(overdueList.body.data?.items).some((item) => item.id === majorHazard.id), "overdue list does not include major hazard");

  const upgradeMajorHazard = await jsonRequest(`/safety/hazards/${majorHazard.id}/upgrade`, adminToken, "POST", {
    reason: "S5A major overdue hazard escalation"
  }, "major-hazard-upgrade");
  assertStatus("admin upgrades major overdue hazard", upgradeMajorHazard.response.status, 201);
  assert(upgradeMajorHazard.body.data?.status === "80", "upgraded major hazard should be status 80");
  assert(upgradeMajorHazard.body.data?.upgradeFlag === true, "upgraded major hazard should set upgradeFlag");

  const statusLogs = await request(`/safety/hazards/${hazard.id}/status-logs`, { headers: { authorization: `Bearer ${adminToken}` } });
  assertStatus("hazard status logs", statusLogs.response.status, 200);
  assertUniformResponse("hazard status logs", statusLogs.body);
  const hazardStatusLogs = Array.isArray(statusLogs.body.data) ? statusLogs.body.data : asArray(statusLogs.body.data?.items);
  assert(hazardStatusLogs.length >= 3, "hazard status logs should include assign/rectify/recheck");

  const statistics = await request("/safety/statistics", { headers: { authorization: `Bearer ${adminToken}` } });
  assertStatus("safety statistics", statistics.response.status, 200);
  assertUniformResponse("safety statistics", statistics.body);
  assert(typeof statistics.body.data?.summary?.inspect_task_total === "number", "safety statistics missing inspect_task_total");
  assert(typeof statistics.body.data?.summary?.hazard_total === "number", "safety statistics missing hazard_total");

  const tenant360 = await request(`/park-tenants/${parkTenantId}/360`, { headers: { authorization: `Bearer ${adminToken}` } });
  assertStatus("tenant 360 safety hazards", tenant360.response.status, 200);
  assertUniformResponse("tenant 360 safety hazards", tenant360.body);
  assert(tenant360.body.data?.hazards?.available === true, "tenant 360 hazards node is not available");
  assert(typeof tenant360.body.data?.hazards?.summary?.total_count === "number", "tenant 360 hazards summary missing");

  const unitHazards = await request(`/park-units/${unitId}/hazards`, { headers: { authorization: `Bearer ${adminToken}` } });
  assertStatus("unit safety hazards", unitHazards.response.status, 200);
  assertUniformResponse("unit safety hazards", unitHazards.body);
  assert(typeof unitHazards.body.data?.summary?.total_count === "number", "unit hazards summary missing");

  await withModuleDisabled("safety", async () => {
    const denied = await request("/safety/statistics", { headers: { authorization: `Bearer ${adminToken}` } });
    assertStatus("safety module disabled denies statistics", denied.response.status, 403);
  });

  await assertDbCount("safety field policy seed exists", `
SELECT count(*)
FROM sys_field_policy
WHERE tenant_id = ${sqlLiteral(tenantId)}
  AND park_id = ${sqlLiteral(parkId)}
  AND module = 'safety'
  AND is_deleted = false
  AND (
    (entity = 'safety_hazard' AND field_key IN ('description', 'location', 'before_photo_file_ids', 'after_photo_file_ids'))
    OR (entity = 'inspect_task' AND field_key IN ('photo_file_ids', 'gps_lng', 'gps_lat'))
  );`, 4);

  await assertDbCount("safety action log rows written", `
SELECT count(*)
FROM biz_safety_action_log
WHERE tenant_id = ${sqlLiteral(tenantId)}
  AND park_id = ${sqlLiteral(parkId)}
  AND is_deleted = false
  AND create_time >= to_timestamp(${Math.floor(stamp / 1000)});`, 5);

  await assertDbCount("safety hazard status log rows written", `
SELECT count(*)
FROM biz_safety_hazard_status_log
WHERE tenant_id = ${sqlLiteral(tenantId)}
  AND park_id = ${sqlLiteral(parkId)}
  AND is_deleted = false
  AND create_time >= to_timestamp(${Math.floor(stamp / 1000)});`, 3);

  await assertDbCount("work order log row written by hazard conversion", `
SELECT count(*)
FROM biz_work_order_log
WHERE tenant_id = ${sqlLiteral(tenantId)}
  AND park_id = ${sqlLiteral(parkId)}
  AND work_order_id = ${sqlLiteral(workOrder.id)}
  AND is_deleted = false;`, 1);

  await assertDbCount("sys_op_log rows written", `
SELECT count(*)
FROM sys_op_log
WHERE tenant_id = ${sqlLiteral(tenantId)}
  AND park_id = ${sqlLiteral(parkId)}
  AND create_time >= to_timestamp(${Math.floor(stamp / 1000)})
  AND (module ILIKE '%安全%' OR module ILIKE '%附件%' OR module ILIKE '%工单%');`, 5);

  logStep("S5-A safety smoke passed");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    if (apiProcess) {
      try {
        process.kill(-apiProcess.pid, "SIGTERM");
      } catch {
        // ignore cleanup errors
      }
    }
  });
