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
const smokeRemark = `S5B emergency permit smoke ${stamp}`;

let apiProcess = null;

function getPnpmBin() {
  if (process.env.PNPM_BIN) return process.env.PNPM_BIN;
  const bundled = resolve(rootDir, ".tools/pnpm");
  return existsSync(bundled) ? bundled : "pnpm";
}

function logStep(message) {
  console.log(`[s5b-emergency-permit-smoke] ${message}`);
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

function valueOf(record, ...keys) {
  for (const key of keys) {
    if (record && record[key] !== undefined) return record[key];
  }
  return undefined;
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
      "x-idempotency-key": `s5b-${stamp}-${label}-${randomUUID()}`
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

async function formRequest(path, token, form, label = "form") {
  return request(path, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "x-idempotency-key": `s5b-${stamp}-${label}-${randomUUID()}`
    },
    body: form
  });
}

async function login(username, password) {
  return request("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-request-id": `s5b-login-${randomUUID()}` },
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
  logStep("API not reachable, starting @jinhu/api for S5-B smoke test");
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

async function assertDbCount(name, sql, minimum = 1) {
  const value = Number(await psql(sql));
  assert(Number.isFinite(value), `${name} did not return a numeric count`);
  assert(value >= minimum, `${name} expected at least ${minimum}, got ${value}`);
  logStep(`${name}: ${value}`);
}

async function withModuleDisabled(moduleCode, callback) {
  const originalState = await psql(`
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
  await psql(`
UPDATE rel_tenant_module
SET enabled = false, status = 'disabled', update_time = now()
WHERE tenant_id = ${sqlLiteral(tenantId)}
  AND park_id = ${sqlLiteral(parkId)}
  AND module_id = (SELECT id FROM sys_module WHERE module_code = ${sqlLiteral(moduleCode)} AND is_deleted = false LIMIT 1);`);
  try {
    await callback();
  } finally {
    await psql(`
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
  form.append("file", new Blob([`S5B smoke ${label} ${stamp}`], { type: "image/png" }), `${label}-${stamp}.png`);
  const uploaded = await formRequest("/files", token, form, `upload-${label}`);
  assertStatus(`upload ${label}`, uploaded.response.status, 201);
  assertUniformResponse(`upload ${label}`, uploaded.body);
  assert(uploaded.body.data?.id, `${label} upload missing id`);
  return uploaded.body.data;
}

async function getFixtures() {
  const unitRow = await psql(`
SELECT id::text || '|' || COALESCE(building_id::text, '') || '|' || COALESCE(floor_id::text, '')
FROM biz_unit
WHERE tenant_id = ${sqlLiteral(tenantId)}
  AND park_id = ${sqlLiteral(parkId)}
  AND is_deleted = false
ORDER BY create_time ASC
LIMIT 1;`);
  assert(unitRow, "No biz_unit fixture found for S5-B smoke");
  const [unitId, buildingId, floorId] = unitRow.split("|");
  const parkTenantId = await psql(`
SELECT id::text
FROM biz_park_tenant
WHERE tenant_id = ${sqlLiteral(tenantId)}
  AND park_id = ${sqlLiteral(parkId)}
  AND is_deleted = false
ORDER BY create_time ASC
LIMIT 1;`);
  assert(parkTenantId, "No biz_park_tenant fixture found for S5-B smoke");
  return { unitId, buildingId: buildingId || undefined, floorId: floorId || undefined, parkTenantId };
}

async function createEmergency(adminToken, payload, label) {
  const created = await jsonRequest("/safety/emergencies", adminToken, "POST", payload, label);
  assertStatus(`create emergency ${label}`, created.response.status, 201);
  assertUniformResponse(`create emergency ${label}`, created.body);
  assert(created.body.data?.id, `create emergency ${label} missing id`);
  return created.body.data;
}

async function createPermit(adminToken, payload, label) {
  const created = await jsonRequest("/safety/work-permits", adminToken, "POST", payload, label);
  assertStatus(`create work permit ${label}`, created.response.status, 201);
  assertUniformResponse(`create work permit ${label}`, created.body);
  assert(created.body.data?.id, `create work permit ${label} missing id`);
  return created.body.data;
}

function baseEmergencyPayload(fixtures, photoId, planId, suffix = "") {
  return {
    title: `S5B 应急事件 ${suffix} ${stamp}`,
    incident_type: "fire",
    severity_level: "30",
    response_level: "30",
    description: `S5B emergency ${suffix} ${stamp}`,
    location: `S5B emergency location ${suffix} ${stamp}`,
    unit_id: fixtures.unitId,
    park_tenant_id: fixtures.parkTenantId,
    photos_file_ids: [photoId],
    reporter_mobile: "13920009999",
    emergency_plan_id: planId,
    remark: smokeRemark
  };
}

function permitPayload(fixtures, adminId, overrides = {}) {
  const start = new Date(stamp + 7 * 24 * 60 * 60 * 1000 + Math.floor(Math.random() * 20_000));
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  return {
    permit_type: "other",
    apply_type: "internal",
    location: `S5B permit location ${stamp}-${randomUUID()}`,
    time_start: start.toISOString(),
    time_end: end.toISOString(),
    risk_level: "10",
    apply_park_tenant_id: fixtures.parkTenantId,
    unit_id: fixtures.unitId,
    protective_measures: "现场围挡、人员告知、作业前检查",
    monitor_user_id: adminId,
    remark: smokeRemark,
    ...overrides
  };
}

async function approvePermit(token, id, expectedStatus, label) {
  const approved = await jsonRequest(`/safety/work-permits/${id}/approve`, token, "POST", { opinion: `${label} approval` }, `approve-${label}`);
  assertStatus(`approve work permit ${label}`, approved.response.status, 201);
  assertUniformResponse(`approve work permit ${label}`, approved.body);
  assert(approved.body.data?.status === expectedStatus, `work permit ${label} should become ${expectedStatus}`);
  return approved.body.data;
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

  const adminMe = await request("/users/me", { headers: { authorization: `Bearer ${adminToken}` } });
  assertStatus("admin users/me", adminMe.response.status, 200);
  assertUniformResponse("admin users/me", adminMe.body);
  const adminId = adminMe.body.data?.id;
  assert(adminId, "admin users/me missing id");

  const fixtures = await getFixtures();
  const eventPhoto = await uploadSmokeFile(adminToken, "safety_emergency", "emergency-photo");
  const planAttachment = await uploadSmokeFile(adminToken, "safety_emergency_plan", "emergency-plan");
  const workPermitPhoto = await uploadSmokeFile(adminToken, "safety_work_permit", "work-permit-photo");
  const reviewFile = await uploadSmokeFile(adminToken, "safety_emergency_review", "emergency-review");

  const normalCreateContact = await jsonRequest("/safety/emergency-contacts", normalToken, "POST", {
    contact_name: `normal denied ${stamp}`,
    mobile: "13920000001"
  }, "normal-contact-create");
  assertStatus("normal user cannot create emergency contact", normalCreateContact.response.status, 403);

  const contactCreate = await jsonRequest("/safety/emergency-contacts", adminToken, "POST", {
    contact_name: `S5B 应急联系人 ${stamp}`,
    mobile: "13920000002",
    email: `s5b-${stamp}@example.com`,
    notify_channels: ["site_message"],
    status: "enabled",
    remark: smokeRemark
  }, "contact-create");
  assertStatus("admin creates emergency contact", contactCreate.response.status, 201);
  assertUniformResponse("admin creates emergency contact", contactCreate.body);
  const contact = contactCreate.body.data;
  assert(contact?.id && valueOf(contact, "contactCode", "contact_code"), "emergency contact response missing id/code");

  const contactUpdate = await jsonRequest(`/safety/emergency-contacts/${contact.id}`, adminToken, "PUT", {
    priority_level: 2,
    remark: `${smokeRemark} updated`
  }, "contact-update");
  assertStatus("admin updates emergency contact", contactUpdate.response.status, 200);

  const planCreate = await jsonRequest("/safety/emergency-plans", adminToken, "POST", {
    plan_name: `S5B 火情预案 ${stamp}`,
    incident_type: "fire",
    severity_level: "30",
    response_level: "30",
    commander_role: "safety_manager",
    response_team_role_codes: ["safety_manager"],
    steps_json: ["初步上报", "现场警戒", "断电疏散", "复盘整改"],
    attachment_file_ids: [planAttachment.id],
    status: "enabled",
    remark: smokeRemark
  }, "plan-create");
  assertStatus("admin creates emergency plan", planCreate.response.status, 201);
  assertUniformResponse("admin creates emergency plan", planCreate.body);
  const plan = planCreate.body.data;
  assert(plan?.id, "emergency plan response missing id");

  const event = await createEmergency(adminToken, baseEmergencyPayload(fixtures, eventPhoto.id, plan.id, "manual"), "manual");
  assert(event.status === "10", "manual emergency should default to reported status 10");
  assert(valueOf(event, "emergencyPlanId", "emergency_plan_id") === plan.id, "manual emergency should link selected plan");

  const deleteOpenPlan = await jsonRequest(`/safety/emergency-plans/${plan.id}`, adminToken, "DELETE", undefined, "delete-open-plan");
  assertStatus("cannot delete emergency plan used by open event", deleteOpenPlan.response.status, 400);

  const timelineAfterCreate = await request(`/safety/emergencies/${event.id}/timeline`, { headers: { authorization: `Bearer ${adminToken}` } });
  assertStatus("emergency timeline after create", timelineAfterCreate.response.status, 200);
  assertUniformResponse("emergency timeline after create", timelineAfterCreate.body);
  assert(asArray(timelineAfterCreate.body.data).length >= 1, "new emergency should have timeline row");

  const manualTimeline = await jsonRequest(`/safety/emergencies/${event.id}/timeline`, adminToken, "POST", {
    content: "现场已建立临时警戒线",
    reason: "处置补充记录",
    attachment_file_ids: [eventPhoto.id],
    gps_lng: 118.123456,
    gps_lat: 33.123456
  }, "manual-timeline");
  assertStatus("manual emergency timeline entry", manualTimeline.response.status, 201);

  const responded = await jsonRequest(`/safety/emergencies/${event.id}/respond`, adminToken, "POST", { reason: "已通知安全主管" }, "event-respond");
  assertStatus("emergency respond", responded.response.status, 201);
  assert(responded.body.data?.status === "20", "responded emergency should be status 20");
  const disposing = await jsonRequest(`/safety/emergencies/${event.id}/start-disposal`, adminToken, "POST", { reason: "进入现场处置" }, "event-dispose");
  assertStatus("emergency start disposal", disposing.response.status, 201);
  assert(disposing.body.data?.status === "30", "disposing emergency should be status 30");
  const controlled = await jsonRequest(`/safety/emergencies/${event.id}/control`, adminToken, "POST", { reason: "风险已控制" }, "event-control");
  assertStatus("emergency control", controlled.response.status, 201);
  assert(controlled.body.data?.status === "40", "controlled emergency should be status 40");
  const badReview = await jsonRequest(`/safety/emergencies/${event.id}/review`, adminToken, "POST", { conclusion: "" }, "event-review-empty");
  assertStatus("emergency review requires conclusion", badReview.response.status, 400);
  const reviewed = await jsonRequest(`/safety/emergencies/${event.id}/review`, adminToken, "POST", {
    conclusion: "S5B 复盘：临时用电短路，已整改。",
    review_file_id: reviewFile.id
  }, "event-review");
  assertStatus("emergency review", reviewed.response.status, 201);
  assert(reviewed.body.data?.status === "50", "reviewed emergency should be status 50");
  const closed = await jsonRequest(`/safety/emergencies/${event.id}/close`, adminToken, "POST", { reason: "复盘完成，闭环" }, "event-close");
  assertStatus("emergency close", closed.response.status, 201);
  assert(closed.body.data?.status === "60", "closed emergency should be status 60");

  const sos = await jsonRequest("/safety/emergencies/sos", adminToken, "POST", {
    incident_type: "fire",
    severity_level: "30",
    location: `S5B SOS location ${stamp}`,
    description: "S5B SOS smoke",
    unit_id: fixtures.unitId,
    park_tenant_id: fixtures.parkTenantId,
    gps_lng: 118.111111,
    gps_lat: 33.111111
  }, "sos");
  assertStatus("emergency SOS", sos.response.status, 201);
  assertUniformResponse("emergency SOS", sos.body);
  assert(sos.body.data?.status === "10", "SOS emergency should be status 10");
  assert(valueOf(sos.body.data, "sourceType", "source_type") === "sos", "SOS emergency should use source_type sos");

  const cancelEvent = await createEmergency(adminToken, baseEmergencyPayload(fixtures, eventPhoto.id, plan.id, "cancel"), "cancel");
  const cancelMissingReason = await jsonRequest(`/safety/emergencies/${cancelEvent.id}/cancel`, adminToken, "POST", { reason: "" }, "event-cancel-empty");
  assertStatus("emergency cancel requires reason", cancelMissingReason.response.status, 400);
  const cancelled = await jsonRequest(`/safety/emergencies/${cancelEvent.id}/cancel`, adminToken, "POST", { reason: "误报" }, "event-cancel");
  assertStatus("emergency cancel", cancelled.response.status, 201);
  assert(cancelled.body.data?.status === "90", "cancelled emergency should be status 90");

  const workOrderEvent = await createEmergency(adminToken, baseEmergencyPayload(fixtures, eventPhoto.id, plan.id, "workorder"), "workorder");
  const eventWorkOrder = await jsonRequest(`/safety/emergencies/${workOrderEvent.id}/create-work-order`, adminToken, "POST", {
    title: `S5B 应急整改工单 ${stamp}`,
    priority: "high",
    urgency: "urgent",
    assignee_id: adminId,
    description: "应急处置后续维修清理"
  }, "event-create-workorder");
  assertStatus("emergency creates work order", eventWorkOrder.response.status, 201);
  assertUniformResponse("emergency creates work order", eventWorkOrder.body);
  assert(valueOf(eventWorkOrder.body.data?.work_order, "sourceType", "source_type") === "safety_emergency", "emergency work order source_type mismatch");

  const cancelledWorkOrder = await jsonRequest(`/safety/emergencies/${cancelEvent.id}/create-work-order`, adminToken, "POST", {
    title: "取消事件不能转工单",
    priority: "high",
    urgency: "urgent",
    description: "should fail"
  }, "cancelled-event-create-workorder");
  assertStatus("cancelled emergency cannot create work order", cancelledWorkOrder.response.status, 400);

  const moduleCheckEvent = await createEmergency(adminToken, baseEmergencyPayload(fixtures, eventPhoto.id, plan.id, "workorder-module"), "workorder-module");
  await withModuleDisabled("workorder", async () => {
    const denied = await jsonRequest(`/safety/emergencies/${moduleCheckEvent.id}/create-work-order`, adminToken, "POST", {
      title: "workorder disabled",
      priority: "high",
      urgency: "urgent",
      description: "module disabled smoke"
    }, "workorder-module-disabled");
    assertStatus("workorder module disabled denies emergency conversion", denied.response.status, 403);
  });

  const hazard = await jsonRequest("/safety/hazards", adminToken, "POST", {
    title: `S5B 重大隐患 ${stamp}`,
    hazard_type: "fire",
    risk_level: "30",
    description: "消防通道严重堵塞",
    location: `S5B hazard location ${stamp}`,
    rectify_deadline: new Date(stamp + 3 * 24 * 60 * 60 * 1000).toISOString(),
    unit_id: fixtures.unitId,
    park_tenant_id: fixtures.parkTenantId,
    before_photo_file_ids: [eventPhoto.id],
    status: "10",
    remark: smokeRemark
  }, "major-hazard-create");
  assertStatus("admin creates major hazard", hazard.response.status, 201);
  const hazardEmergency = await jsonRequest(`/safety/hazards/${hazard.body.data.id}/to-emergency`, adminToken, "POST", {
    incident_type: "fire",
    severity_level: "30",
    title: `S5B 隐患转应急 ${stamp}`,
    description: "重大隐患启动应急处置",
    reason: "重大隐患需应急处置"
  }, "hazard-to-emergency");
  assertStatus("major hazard converts to emergency", hazardEmergency.response.status, 201);
  assert(valueOf(hazardEmergency.body.data?.emergency, "sourceType", "source_type") === "hazard", "hazard emergency source_type mismatch");
  assert(hazardEmergency.body.data?.hazard?.status === "92", "hazard should be marked as converted to emergency");
  const duplicateHazardEmergency = await jsonRequest(`/safety/hazards/${hazard.body.data.id}/to-emergency`, adminToken, "POST", {
    incident_type: "fire",
    severity_level: "30",
    title: "重复隐患转应急",
    description: "should fail",
    reason: "重复"
  }, "hazard-to-emergency-duplicate");
  assertStatus("converted hazard cannot convert again", duplicateHazardEmergency.response.status, 409);

  const closedHazard = await jsonRequest("/safety/hazards", adminToken, "POST", {
    title: `S5B 已闭环重大隐患 ${stamp}`,
    hazard_type: "fire",
    risk_level: "30",
    description: "闭环隐患不能转应急",
    location: `S5B closed hazard location ${stamp}`,
    rectify_deadline: new Date(stamp + 3 * 24 * 60 * 60 * 1000).toISOString(),
    unit_id: fixtures.unitId,
    park_tenant_id: fixtures.parkTenantId,
    status: "60",
    remark: smokeRemark
  }, "closed-hazard-create");
  assertStatus("admin creates closed major hazard", closedHazard.response.status, 201);
  const closedHazardEmergency = await jsonRequest(`/safety/hazards/${closedHazard.body.data.id}/to-emergency`, adminToken, "POST", {
    incident_type: "fire",
    severity_level: "30",
    title: "闭环隐患转应急",
    description: "should fail",
    reason: "闭环"
  }, "closed-hazard-to-emergency");
  assertStatus("closed hazard cannot convert to emergency", closedHazardEmergency.response.status, 400);

  const invalidTimePermit = await jsonRequest("/safety/work-permits", adminToken, "POST", permitPayload(fixtures, adminId, {
    time_start: new Date(stamp + 1_000).toISOString(),
    time_end: new Date(stamp + 1_000).toISOString()
  }), "permit-invalid-time");
  assertStatus("work permit rejects invalid time window", invalidTimePermit.response.status, 400);

  const highRiskNoMonitor = await jsonRequest("/safety/work-permits", adminToken, "POST", permitPayload(fixtures, adminId, {
    permit_type: "hot_work",
    risk_level: "30",
    monitor_user_id: undefined
  }), "permit-high-risk-no-monitor");
  assertStatus("high risk work permit requires monitor", highRiskNoMonitor.response.status, 400);

  const normalPermit = await createPermit(adminToken, permitPayload(fixtures, adminId, { permit_type: "other", risk_level: "10" }), "normal");
  assert(normalPermit.status === "10", "new work permit should be draft");
  const updatedPermit = await jsonRequest(`/safety/work-permits/${normalPermit.id}`, adminToken, "PUT", {
    protective_measures: "已更新安全防护措施"
  }, "permit-update-draft");
  assertStatus("draft work permit can be edited", updatedPermit.response.status, 200);
  const submittedPermit = await jsonRequest(`/safety/work-permits/${normalPermit.id}/submit`, adminToken, "POST", { opinion: "提交审批" }, "permit-submit");
  assertStatus("work permit submit", submittedPermit.response.status, 201);
  assert(submittedPermit.body.data?.status === "30", "submitted work permit should be property approving");
  const editSubmitted = await jsonRequest(`/safety/work-permits/${normalPermit.id}`, adminToken, "PUT", {
    protective_measures: "非草稿编辑应失败"
  }, "permit-update-non-draft");
  assertStatus("non-draft work permit cannot be edited", editSubmitted.response.status, 400);
  await approvePermit(adminToken, normalPermit.id, "40", "property");
  const rejectIssued = await jsonRequest(`/safety/work-permits/${normalPermit.id}/reject`, adminToken, "POST", { reject_reason: "" }, "permit-reject-empty");
  assertStatus("work permit reject requires reason", rejectIssued.response.status, 400);
  await approvePermit(adminToken, normalPermit.id, "60", "safety-normal");
  const startWithoutPhoto = await jsonRequest(`/safety/work-permits/${normalPermit.id}/start`, adminToken, "POST", { photo_file_ids: [] }, "permit-start-empty");
  assertStatus("work permit start requires photo", startWithoutPhoto.response.status, 400);
  const started = await jsonRequest(`/safety/work-permits/${normalPermit.id}/start`, adminToken, "POST", {
    photo_file_ids: [workPermitPhoto.id],
    content: "现场开工检查通过"
  }, "permit-start");
  assertStatus("work permit start", started.response.status, 201);
  assert(started.body.data?.status === "70", "started work permit should be working");
  const violationCheck = await jsonRequest(`/safety/work-permits/${normalPermit.id}/process-check`, adminToken, "POST", {
    result: "violation",
    content: "现场灭火器配置不足",
    photo_file_ids: [workPermitPhoto.id]
  }, "permit-process-violation");
  assertStatus("work permit violation check", violationCheck.response.status, 201);
  assert(violationCheck.body.data?.violationCount >= 1, "violation check should increment count");
  const passCheck = await jsonRequest(`/safety/work-permits/${normalPermit.id}/process-check`, adminToken, "POST", {
    result: "pass",
    content: "复查现场正常"
  }, "permit-process-pass");
  assertStatus("work permit pass check", passCheck.response.status, 201);
  const checks = await request(`/safety/work-permits/${normalPermit.id}/checks`, { headers: { authorization: `Bearer ${adminToken}` } });
  assertStatus("work permit checks list", checks.response.status, 200);
  assertUniformResponse("work permit checks list", checks.body);
  const violation = asArray(checks.body.data).find((row) => row.result === "violation");
  const pass = asArray(checks.body.data).find((row) => row.result === "pass");
  assert(violation?.id && pass?.id, "work permit checks should include violation and pass rows");
  const normalCheckHazard = await jsonRequest(`/safety/work-permits/${normalPermit.id}/checks/${pass.id}/create-hazard`, adminToken, "POST", {
    title: "正常巡查不能转隐患"
  }, "normal-check-create-hazard");
  assertStatus("normal check cannot create hazard", normalCheckHazard.response.status, 400);
  const checkHazard = await jsonRequest(`/safety/work-permits/${normalPermit.id}/checks/${violation.id}/create-hazard`, adminToken, "POST", {
    title: `S5B 作业违规隐患 ${stamp}`,
    hazard_type: "fire",
    risk_level: "20",
    description: "作业许可过程巡查违规转隐患"
  }, "violation-check-create-hazard");
  assertStatus("violation check creates hazard", checkHazard.response.status, 201);
  assert(valueOf(checkHazard.body.data?.hazard, "sourceType", "source_type") === "work_permit", "work permit hazard source_type mismatch");
  const duplicateCheckHazard = await jsonRequest(`/safety/work-permits/${normalPermit.id}/checks/${violation.id}/create-hazard`, adminToken, "POST", {
    title: "重复巡查转隐患"
  }, "violation-check-create-hazard-duplicate");
  assertStatus("duplicate check hazard conversion rejected", duplicateCheckHazard.response.status, 409);
  const checkWorkOrder = await jsonRequest(`/safety/work-permits/${normalPermit.id}/checks/${violation.id}/create-work-order`, adminToken, "POST", {
    title: `S5B 作业违规工单 ${stamp}`,
    priority: "high",
    urgency: "urgent",
    assignee_id: adminId,
    description: "作业许可过程巡查违规转工单"
  }, "violation-check-create-workorder");
  assertStatus("violation check creates work order", checkWorkOrder.response.status, 201);
  assert(valueOf(checkWorkOrder.body.data?.work_order, "sourceType", "source_type") === "work_permit", "work permit work order source_type mismatch");
  await withModuleDisabled("workorder", async () => {
    const secondViolationPermit = await createPermit(adminToken, permitPayload(fixtures, adminId, { location: `S5B module permit ${stamp}` }), "module-disabled-check");
    await jsonRequest(`/safety/work-permits/${secondViolationPermit.id}/submit`, adminToken, "POST", { opinion: "提交" }, "module-permit-submit");
    await approvePermit(adminToken, secondViolationPermit.id, "40", "module-property");
    await approvePermit(adminToken, secondViolationPermit.id, "60", "module-safety");
    await jsonRequest(`/safety/work-permits/${secondViolationPermit.id}/start`, adminToken, "POST", {
      photo_file_ids: [workPermitPhoto.id]
    }, "module-permit-start");
    await jsonRequest(`/safety/work-permits/${secondViolationPermit.id}/process-check`, adminToken, "POST", {
      result: "violation",
      content: "workorder disabled violation"
    }, "module-permit-process");
    const disabledChecks = await request(`/safety/work-permits/${secondViolationPermit.id}/checks`, { headers: { authorization: `Bearer ${adminToken}` } });
    const disabledViolation = asArray(disabledChecks.body.data).find((row) => row.result === "violation");
    assert(disabledViolation?.id, "module disabled violation check missing");
    const denied = await jsonRequest(`/safety/work-permits/${secondViolationPermit.id}/checks/${disabledViolation.id}/create-work-order`, adminToken, "POST", {
      title: "workorder disabled",
      description: "module disabled smoke"
    }, "permit-check-workorder-module-disabled");
    assertStatus("workorder module disabled denies permit check conversion", denied.response.status, 403);
  });
  const finishWithoutPhoto = await jsonRequest(`/safety/work-permits/${normalPermit.id}/finish`, adminToken, "POST", { photo_file_ids: [] }, "permit-finish-empty");
  assertStatus("work permit finish requires photo", finishWithoutPhoto.response.status, 400);
  const finished = await jsonRequest(`/safety/work-permits/${normalPermit.id}/finish`, adminToken, "POST", {
    photo_file_ids: [workPermitPhoto.id],
    content: "作业结束，现场清理完成"
  }, "permit-finish");
  assertStatus("work permit finish", finished.response.status, 201);
  assert(finished.body.data?.status === "80", "finished work permit should be finish-pending");
  const closedPermit = await jsonRequest(`/safety/work-permits/${normalPermit.id}/close`, adminToken, "POST", {
    content: "收单通过，许可闭环"
  }, "permit-close");
  assertStatus("work permit close", closedPermit.response.status, 201);
  assert(closedPermit.body.data?.status === "90", "closed work permit should be status 90");

  const stopPermit = await createPermit(adminToken, permitPayload(fixtures, adminId, { location: `S5B stop permit ${stamp}` }), "stop");
  await jsonRequest(`/safety/work-permits/${stopPermit.id}/submit`, adminToken, "POST", { opinion: "提交" }, "stop-submit");
  await approvePermit(adminToken, stopPermit.id, "40", "stop-property");
  await approvePermit(adminToken, stopPermit.id, "60", "stop-safety");
  await jsonRequest(`/safety/work-permits/${stopPermit.id}/start`, adminToken, "POST", {
    photo_file_ids: [workPermitPhoto.id]
  }, "stop-start");
  const stopped = await jsonRequest(`/safety/work-permits/${stopPermit.id}/stop`, adminToken, "POST", {
    reason: "现场未配置灭火器",
    photo_file_ids: [workPermitPhoto.id]
  }, "permit-stop");
  assertStatus("work permit stop", stopped.response.status, 201);
  assert(stopped.body.data?.status === "93", "stopped work permit should be status 93");

  const highRiskPermit = await createPermit(adminToken, permitPayload(fixtures, adminId, {
    permit_type: "hot_work",
    risk_level: "30",
    location: `S5B hot work ${stamp}`,
    monitor_user_id: adminId
  }), "high-risk");
  await jsonRequest(`/safety/work-permits/${highRiskPermit.id}/submit`, adminToken, "POST", { opinion: "提交高风险审批" }, "high-risk-submit");
  await approvePermit(adminToken, highRiskPermit.id, "40", "high-risk-property");
  await approvePermit(adminToken, highRiskPermit.id, "50", "high-risk-safety");
  await approvePermit(adminToken, highRiskPermit.id, "60", "high-risk-operation");

  const rejectPermit = await createPermit(adminToken, permitPayload(fixtures, adminId, { location: `S5B reject permit ${stamp}` }), "reject");
  await jsonRequest(`/safety/work-permits/${rejectPermit.id}/submit`, adminToken, "POST", { opinion: "提交驳回测试" }, "reject-submit");
  const rejectEmpty = await jsonRequest(`/safety/work-permits/${rejectPermit.id}/reject`, adminToken, "POST", { reject_reason: "" }, "reject-empty");
  assertStatus("work permit reject empty reason", rejectEmpty.response.status, 400);
  const rejected = await jsonRequest(`/safety/work-permits/${rejectPermit.id}/reject`, adminToken, "POST", { reject_reason: "资料不完整" }, "reject");
  assertStatus("work permit reject", rejected.response.status, 201);
  assert(rejected.body.data?.status === "91", "rejected work permit should be status 91");

  const statistics = await request("/safety/emergency-work-permit-statistics", { headers: { authorization: `Bearer ${adminToken}` } });
  assertStatus("emergency work permit statistics", statistics.response.status, 200);
  assertUniformResponse("emergency work permit statistics", statistics.body);
  assert(typeof statistics.body.data?.emergency?.total_count === "number", "statistics missing emergency total_count");
  assert(typeof statistics.body.data?.work_permit?.violation_count === "number", "statistics missing permit violation_count");
  assert(typeof statistics.body.data?.emergency?.avg_response_minutes === "number", "statistics missing avg_response_minutes");
  assert(typeof statistics.body.data?.emergency?.avg_close_hours === "number", "statistics missing avg_close_hours");

  const tenant360 = await request(`/park-tenants/${fixtures.parkTenantId}/360`, { headers: { authorization: `Bearer ${adminToken}` } });
  assertStatus("tenant 360 emergency and work permits", tenant360.response.status, 200);
  assertUniformResponse("tenant 360 emergency and work permits", tenant360.body);
  assert(tenant360.body.data?.emergency?.available === true, "tenant 360 emergency node is not available");
  assert(tenant360.body.data?.work_permits?.available === true, "tenant 360 work_permits node is not available");
  assert(typeof tenant360.body.data?.emergency?.summary?.total_count === "number", "tenant 360 emergency summary missing");
  assert(typeof tenant360.body.data?.work_permits?.summary?.total_count === "number", "tenant 360 work permit summary missing");

  const unitEmergencies = await request(`/park-units/${fixtures.unitId}/emergencies`, { headers: { authorization: `Bearer ${adminToken}` } });
  assertStatus("unit emergency summary", unitEmergencies.response.status, 200);
  assertUniformResponse("unit emergency summary", unitEmergencies.body);
  assert(typeof unitEmergencies.body.data?.summary?.total_count === "number", "unit emergencies summary missing");
  const unitPermits = await request(`/park-units/${fixtures.unitId}/work-permits`, { headers: { authorization: `Bearer ${adminToken}` } });
  assertStatus("unit work permit summary", unitPermits.response.status, 200);
  assertUniformResponse("unit work permit summary", unitPermits.body);
  assert(typeof unitPermits.body.data?.summary?.total_count === "number", "unit work permits summary missing");

  await withModuleDisabled("safety", async () => {
    const denied = await request("/safety/emergencies?page=1&page_size=1", { headers: { authorization: `Bearer ${adminToken}` } });
    assertStatus("safety module disabled denies emergencies", denied.response.status, 403);
  });

  await assertDbCount("S5-B field policy seed exists", `
SELECT count(*)
FROM sys_field_policy
WHERE tenant_id = ${sqlLiteral(tenantId)}
  AND park_id = ${sqlLiteral(parkId)}
  AND module = 'safety'
  AND is_deleted = false
  AND (
    (entity = 'emergency_contact' AND field_key IN ('mobile', 'email'))
    OR (entity = 'emergency_event' AND field_key IN ('reporter_mobile', 'photos_file_ids', 'videos_file_ids', 'gps_lng', 'gps_lat', 'conclusion', 'review_file_id'))
    OR (entity = 'work_permit' AND field_key IN ('apply_mobile', 'contractor_mobile', 'protective_measures', 'start_check_photo_file_ids', 'end_check_photo_file_ids'))
    OR (entity = 'work_permit_check' AND field_key IN ('violation_desc', 'photo_file_ids'))
  );`, 8);

  await assertDbCount("emergency timeline rows written", `
SELECT count(*)
FROM biz_safety_emergency_timeline
WHERE tenant_id = ${sqlLiteral(tenantId)}
  AND park_id = ${sqlLiteral(parkId)}
  AND is_deleted = false
  AND create_time >= to_timestamp(${Math.floor(stamp / 1000)});`, 8);

  await assertDbCount("work permit log rows written", `
SELECT count(*)
FROM biz_safety_work_permit_log
WHERE tenant_id = ${sqlLiteral(tenantId)}
  AND park_id = ${sqlLiteral(parkId)}
  AND is_deleted = false
  AND create_time >= to_timestamp(${Math.floor(stamp / 1000)});`, 10);

  await assertDbCount("safety action log rows written", `
SELECT count(*)
FROM biz_safety_action_log
WHERE tenant_id = ${sqlLiteral(tenantId)}
  AND park_id = ${sqlLiteral(parkId)}
  AND is_deleted = false
  AND create_time >= to_timestamp(${Math.floor(stamp / 1000)});`, 8);

  await assertDbCount("work order log rows written by S5-B conversions", `
SELECT count(*)
FROM biz_work_order_log
WHERE tenant_id = ${sqlLiteral(tenantId)}
  AND park_id = ${sqlLiteral(parkId)}
  AND is_deleted = false
  AND create_time >= to_timestamp(${Math.floor(stamp / 1000)})
  AND (
    work_order_id IN (SELECT id FROM biz_work_order WHERE source_type = 'safety_emergency' AND create_time >= to_timestamp(${Math.floor(stamp / 1000)}))
    OR work_order_id IN (SELECT id FROM biz_work_order WHERE source_type = 'work_permit' AND create_time >= to_timestamp(${Math.floor(stamp / 1000)}))
  );`, 2);

  await assertDbCount("sys_op_log rows written", `
SELECT count(*)
FROM sys_op_log
WHERE tenant_id = ${sqlLiteral(tenantId)}
  AND park_id = ${sqlLiteral(parkId)}
  AND create_time >= to_timestamp(${Math.floor(stamp / 1000)})
  AND (module ILIKE '%安全%' OR module ILIKE '%附件%' OR module ILIKE '%工单%');`, 12);

  logStep("S5-B emergency/work-permit smoke passed");
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
