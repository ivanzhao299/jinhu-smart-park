import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile, spawn } from "node:child_process";
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
const smokeRemark = `S3B leasing CRM smoke ${stamp}`;

let apiProcess = null;

function getPnpmBin() {
  if (process.env.PNPM_BIN) return process.env.PNPM_BIN;
  const bundled = resolve(rootDir, ".tools/pnpm");
  return existsSync(bundled) ? bundled : "pnpm";
}

function logStep(message) {
  console.log(`[s3b-leasing-crm-smoke] ${message}`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
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

async function login(username, password) {
  return request("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-request-id": `s3b-login-${randomUUID()}` },
    body: JSON.stringify({ tenantId, parkId, username, password })
  });
}

async function jsonRequest(path, token, method, body, label = "request") {
  const idempotencyKey = `s3b-${stamp}-${label}-${randomUUID()}`;
  const result = await request(path, {
    method,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      "x-idempotency-key": idempotencyKey
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { ...result, idempotencyKey };
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

async function dbExec(sql) {
  await dbScalar(sql);
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
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    if (await isApiReachable()) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 1000));
  }
  throw new Error(`API did not become reachable at ${apiBase}`);
}

async function ensureApiStarted() {
  if (await isApiReachable()) {
    logStep(`API reachable: ${apiBase}`);
    return;
  }
  if (process.env.E2E_NO_API_START === "1") {
    throw new Error(`API is not reachable at ${apiBase}`);
  }
  logStep("API not reachable, starting @jinhu/api for S3-B smoke test");
  apiProcess = spawn(getPnpmBin(), ["--filter", "@jinhu/api", "start"], {
    cwd: rootDir,
    detached: true,
    stdio: "ignore",
    env: { ...process.env }
  });
  apiProcess.unref();
  await waitForApi();
}

function items(body) {
  return body?.data?.items ?? [];
}

function uniqueMobile(offset = 0) {
  const seed = String((stamp + offset) % 100000000).padStart(8, "0");
  return `139${seed}`;
}

function leadPayload(label, overrides = {}) {
  return {
    customerName: `S3B自测客户${label}${stamp}`,
    contactName: `联系人${label}`,
    contactMobile: uniqueMobile(label.length + Math.floor(Math.random() * 1000)),
    contactEmail: `s3b-${label}-${stamp}@example.com`,
    source: "20",
    channelName: "S3B smoke",
    industryCode: "tech",
    industryDetail: "科技研发",
    demandArea: 180,
    demandPrice: 8800,
    demandUnitType: "10",
    intentionLevel: "10",
    expectedCloseDate: "2026-07-01T00:00:00.000Z",
    remark: smokeRemark,
    ...overrides
  };
}

async function setupSmokeUsers() {
  const specialistId = randomUUID();
  const managerId = randomUUID();
  const opsId = randomUUID();
  const passwordHash = await dbScalar(`
SELECT password_hash FROM sys_user
WHERE tenant_id = ${sqlLiteral(tenantId)}
  AND park_id = ${sqlLiteral(parkId)}
  AND username = ${sqlLiteral(normalUser)}
  AND is_deleted = false
LIMIT 1;`);
  assert(passwordHash, "normal user password hash was not found");

  const specialistUsername = `s3b_specialist_${stamp}`;
  const managerUsername = `s3b_manager_${stamp}`;
  const opsUsername = `s3b_ops_${stamp}`;
  await dbExec(`
WITH seed_scope AS (
  SELECT ${sqlLiteral(tenantId)} AS tenant_id, ${sqlLiteral(parkId)} AS park_id
),
new_users(id, username, display_name, mobile, email, role_code) AS (
  VALUES
    (${sqlLiteral(specialistId)}::uuid, ${sqlLiteral(specialistUsername)}, 'S3B 招商专员', ${sqlLiteral(uniqueMobile(2001))}, ${sqlLiteral(`${specialistUsername}@example.com`)}, 'INVEST_SPECIALIST'),
    (${sqlLiteral(managerId)}::uuid, ${sqlLiteral(managerUsername)}, 'S3B 招商主管', ${sqlLiteral(uniqueMobile(2002))}, ${sqlLiteral(`${managerUsername}@example.com`)}, 'INVEST_MANAGER'),
    (${sqlLiteral(opsId)}::uuid, ${sqlLiteral(opsUsername)}, 'S3B 运营负责人', ${sqlLiteral(uniqueMobile(2003))}, ${sqlLiteral(`${opsUsername}@example.com`)}, 'OPERATIONS_OWNER')
),
insert_users AS (
  INSERT INTO sys_user (
    id, tenant_id, park_id, username, display_name, password_hash, mobile, email, is_enabled, status, remark
  )
  SELECT id, seed_scope.tenant_id, seed_scope.park_id, username, display_name, ${sqlLiteral(passwordHash)}, mobile, email, true, 'enabled', ${sqlLiteral(smokeRemark)}
  FROM new_users
  CROSS JOIN seed_scope
  RETURNING id, tenant_id, park_id, username
),
insert_roles AS (
  INSERT INTO rel_user_role (tenant_id, park_id, user_id, role_id, remark)
  SELECT seed_scope.tenant_id, seed_scope.park_id, new_users.id, role.id, ${sqlLiteral(smokeRemark)}
  FROM new_users
  CROSS JOIN seed_scope
  JOIN sys_role role
    ON role.tenant_id = seed_scope.tenant_id
   AND role.park_id = seed_scope.park_id
   AND role.code = new_users.role_code
   AND role.is_deleted = false
  RETURNING id
),
insert_parks AS (
  INSERT INTO rel_user_park (tenant_id, user_id, park_id, is_default, status, remark)
  SELECT seed_scope.tenant_id, new_users.id, seed_scope.park_id, true, 'enabled', ${sqlLiteral(smokeRemark)}
  FROM new_users
  CROSS JOIN seed_scope
  RETURNING id
)
INSERT INTO rel_role_field_policy (tenant_id, park_id, role_id, field_policy_id, remark)
SELECT seed_scope.tenant_id, seed_scope.park_id, role.id, policy.id, ${sqlLiteral(smokeRemark)}
FROM seed_scope
JOIN sys_role role
  ON role.tenant_id = seed_scope.tenant_id
 AND role.park_id = seed_scope.park_id
 AND role.code = 'INVEST_SPECIALIST'
 AND role.is_deleted = false
JOIN sys_field_policy policy
  ON policy.tenant_id = seed_scope.tenant_id
 AND policy.park_id = seed_scope.park_id
 AND policy.module = 'leasing'
 AND policy.is_deleted = false
 AND policy.status = 'enabled'
 AND (
   (policy.entity = 'leasing_lead' AND policy.field_key IN ('contact_mobile', 'demand_price'))
   OR (policy.entity = 'leasing_quote' AND policy.field_key IN ('quote_price', 'property_fee_price'))
   OR (policy.entity = 'leasing_follow' AND policy.field_key = 'content')
 )
WHERE NOT EXISTS (
  SELECT 1 FROM rel_role_field_policy existing
  WHERE existing.tenant_id = seed_scope.tenant_id
    AND existing.role_id = role.id
    AND existing.field_policy_id = policy.id
    AND existing.is_deleted = false
);`);

  return {
    specialist: { id: specialistId, username: specialistUsername, password: normalPassword },
    manager: { id: managerId, username: managerUsername, password: normalPassword },
    ops: { id: opsId, username: opsUsername, password: normalPassword }
  };
}

async function cleanupSmokeFieldPolicyLinks() {
  await dbExec(`
UPDATE rel_role_field_policy
SET is_deleted = true, update_time = now()
WHERE tenant_id = ${sqlLiteral(tenantId)}
  AND park_id = ${sqlLiteral(parkId)}
  AND remark = ${sqlLiteral(smokeRemark)}
  AND is_deleted = false;`);
}

async function createLead(token, label, overrides = {}) {
  const created = await jsonRequest("/leasing/leads", token, "POST", leadPayload(label, overrides), `lead-create-${label}`);
  assertStatus(`create lead ${label}`, created.response.status, 201);
  assertUniformResponse(`create lead ${label}`, created.body);
  assert(created.body?.data?.id, `create lead ${label} did not return id`);
  return { lead: created.body.data, idempotencyKey: created.idempotencyKey };
}

async function getUnits(token) {
  const response = await request("/park-units?page=1&page_size=10", {
    headers: { authorization: `Bearer ${token}` }
  });
  assertStatus("list units for S3-B smoke", response.response.status, 200);
  assertUniformResponse("list units for S3-B smoke", response.body);
  const unitItems = items(response.body);
  assert(unitItems.length >= 2, "S3-B smoke requires at least two units");
  return unitItems.slice(0, 2);
}

async function waitForAuditLog(idempotencyKey, bizType) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const count = Number(await dbScalar(`
SELECT count(*) FROM sys_op_log
WHERE tenant_id = ${sqlLiteral(tenantId)}
  AND park_id = ${sqlLiteral(parkId)}
  AND idempotency_key = ${sqlLiteral(idempotencyKey)}
  AND biz_type = ${sqlLiteral(bizType)}
  AND success = true
  AND is_deleted = false;`));
    if (count > 0) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 300));
  }
  throw new Error(`Audit log was not written for ${bizType} ${idempotencyKey}`);
}

async function tableCountIfExists(tableName) {
  const exists = await dbScalar(`SELECT to_regclass(${sqlLiteral(`public.${tableName}`)}) IS NOT NULL;`);
  if (exists !== "t") return null;
  return Number(await dbScalar(`SELECT count(*) FROM ${tableName};`));
}

async function withLeasingDisabled(token) {
  const originalState = await dbScalar(`
SELECT tenant_module.enabled::text || '|' || tenant_module.status
FROM rel_tenant_module tenant_module
JOIN sys_module module ON module.id = tenant_module.module_id
WHERE tenant_module.tenant_id = ${sqlLiteral(tenantId)}
  AND tenant_module.park_id = ${sqlLiteral(parkId)}
  AND tenant_module.is_deleted = false
  AND module.module_code = 'leasing'
LIMIT 1;`);
  assert(originalState, "leasing tenant module relation not found");
  const [wasEnabled, previousStatus] = originalState.split("|");
  await dbExec(`
UPDATE rel_tenant_module
SET enabled = false, status = 'disabled', update_time = now()
WHERE tenant_id = ${sqlLiteral(tenantId)}
  AND park_id = ${sqlLiteral(parkId)}
  AND module_id = (SELECT id FROM sys_module WHERE module_code = 'leasing' AND is_deleted = false LIMIT 1);`);
  try {
    const denied = await request("/leasing/leads?page=1&page_size=1", {
      headers: { authorization: `Bearer ${token}`, "x-request-id": `s3b-module-denied-${randomUUID()}` }
    });
    assertStatus("leasing module disabled denies leads API", denied.response.status, 403);
    const funnelDenied = await request("/leasing/statistics/funnel", {
      headers: { authorization: `Bearer ${token}`, "x-request-id": `s3b-funnel-module-denied-${randomUUID()}` }
    });
    assertStatus("leasing module disabled denies funnel API", funnelDenied.response.status, 403);
  } finally {
    await dbExec(`
UPDATE rel_tenant_module
SET enabled = ${wasEnabled === "true" ? "true" : "false"}, status = ${sqlLiteral(previousStatus)}, update_time = now()
WHERE tenant_id = ${sqlLiteral(tenantId)}
  AND park_id = ${sqlLiteral(parkId)}
  AND module_id = (SELECT id FROM sys_module WHERE module_code = 'leasing' AND is_deleted = false LIMIT 1);`);
  }
}

async function run() {
  await ensureApiStarted();
  const users = await setupSmokeUsers();

  const adminLogin = await login(adminUser, adminPassword);
  assertStatus("admin login", adminLogin.response.status, 200);
  const adminToken = adminLogin.body?.data?.accessToken;
  assert(adminToken, "admin login did not return accessToken");

  const normalLogin = await login(normalUser, normalPassword);
  assertStatus("normal login", normalLogin.response.status, 200);
  const normalToken = normalLogin.body?.data?.accessToken;
  assert(normalToken, "normal login did not return accessToken");

  const specialistLogin = await login(users.specialist.username, users.specialist.password);
  assertStatus("specialist login", specialistLogin.response.status, 200);
  const specialistToken = specialistLogin.body?.data?.accessToken;
  assert(specialistToken, "specialist login did not return accessToken");

  const managerLogin = await login(users.manager.username, users.manager.password);
  assertStatus("manager login", managerLogin.response.status, 200);
  const managerToken = managerLogin.body?.data?.accessToken;
  assert(managerToken, "manager login did not return accessToken");

  const opsLogin = await login(users.ops.username, users.ops.password);
  assertStatus("operations owner login", opsLogin.response.status, 200);
  const opsToken = opsLogin.body?.data?.accessToken;
  assert(opsToken, "operations owner login did not return accessToken");

  const units = await getUnits(adminToken);
  const contractCountBefore = await tableCountIfExists("biz_contract");
  const receivableCountBefore = await tableCountIfExists("biz_receivable");

  const adminCreated = await createLead(adminToken, "admin");
  await waitForAuditLog(adminCreated.idempotencyKey, "biz_leasing_lead");

  const specialistCreated = await createLead(specialistToken, "specialist");
  assert(specialistCreated.lead.followUserId === users.specialist.id, "specialist lead follow_user_id should default to current user");
  assert(specialistCreated.lead.contactMobile === "139****" + specialistCreated.lead.contactMobile.slice(-4), "specialist contact mobile was not masked");
  assert(specialistCreated.lead.demandPrice === "***", "specialist demand price was not masked");

  const normalCreate = await jsonRequest("/leasing/leads", normalToken, "POST", leadPayload("normal-denied"), "normal-lead-create");
  assertStatus("normal user create lead denied", normalCreate.response.status, 403);

  const duplicate = await jsonRequest(
    "/leasing/leads",
    adminToken,
    "POST",
    leadPayload("duplicate", {
      customerName: adminCreated.lead.customerName,
      contactMobile: adminCreated.lead.contactMobile
    }),
    "duplicate-lead-create"
  );
  assertStatus("duplicate lead rejected", duplicate.response.status, 409);

  const deleteTarget = await createLead(adminToken, "delete");
  const deleted = await jsonRequest(`/leasing/leads/${deleteTarget.lead.id}`, adminToken, "DELETE", undefined, "lead-delete");
  assertStatus("delete lead", deleted.response.status, 200);
  const deletedFlag = await dbScalar(`SELECT is_deleted::text FROM biz_leasing_lead WHERE id = ${sqlLiteral(deleteTarget.lead.id)}::uuid;`);
  assert(deletedFlag === "true", "deleted lead was not soft-deleted");

  const specialistList = await request(`/leasing/leads?page=1&page_size=100&keyword=${encodeURIComponent(`S3B自测客户`)}`, {
    headers: { authorization: `Bearer ${specialistToken}` }
  });
  assertStatus("specialist lead list", specialistList.response.status, 200);
  assertUniformResponse("specialist lead list", specialistList.body);
  const specialistItems = items(specialistList.body);
  assert(specialistItems.some((item) => item.id === specialistCreated.lead.id), "specialist cannot see own lead");
  assert(!specialistItems.some((item) => item.id === adminCreated.lead.id), "specialist can see another user's lead");
  assert(specialistItems.every((item) => item.contactMobile === null || String(item.contactMobile).includes("****")), "lead list mobile was not masked");
  assert(specialistItems.every((item) => item.demandPrice === null || item.demandPrice === "***"), "lead list demand price was not masked");

  const specialistDetail = await request(`/leasing/leads/${specialistCreated.lead.id}`, {
    headers: { authorization: `Bearer ${specialistToken}` }
  });
  assertStatus("specialist lead detail", specialistDetail.response.status, 200);
  assert(specialistDetail.body?.data?.contactMobile?.includes("****"), "lead detail mobile was not masked");
  assert(specialistDetail.body?.data?.demandPrice === "***", "lead detail demand price was not masked");

  const nextFollowTime = "2026-06-20T09:30:00.000Z";
  const follow = await jsonRequest(
    `/leasing/leads/${specialistCreated.lead.id}/follows`,
    specialistToken,
    "POST",
    {
      followType: "phone",
      content: "已电话沟通客户需求",
      nextAction: "预约看房",
      nextFollowTime,
      remark: smokeRemark
    },
    "follow-create"
  );
  assertStatus("create follow", follow.response.status, 201);
  assertUniformResponse("create follow", follow.body);
  await waitForAuditLog(follow.idempotencyKey, "biz_leasing_follow");
  const lastFollowTime = await dbScalar(`SELECT last_follow_time IS NOT NULL FROM biz_leasing_lead WHERE id = ${sqlLiteral(specialistCreated.lead.id)}::uuid;`);
  const storedNextFollowTime = await dbScalar(`SELECT next_follow_time::date::text FROM biz_leasing_lead WHERE id = ${sqlLiteral(specialistCreated.lead.id)}::uuid;`);
  assert(lastFollowTime === "t", "lead last_follow_time was not updated after follow");
  assert(storedNextFollowTime === "2026-06-20", "lead next_follow_time was not updated after follow");

  const followUpdate = await jsonRequest(
    `/leasing/leads/${specialistCreated.lead.id}/follows/${follow.body.data.id}`,
    specialistToken,
    "PUT",
    { content: "已电话沟通客户需求并确认面积", remark: smokeRemark },
    "follow-update"
  );
  assertStatus("update follow", followUpdate.response.status, 200);
  const followDeleteTarget = await jsonRequest(
    `/leasing/leads/${specialistCreated.lead.id}/follows`,
    specialistToken,
    "POST",
    { followType: "wechat", content: "待删除跟进", remark: smokeRemark },
    "follow-delete-target"
  );
  assertStatus("create follow delete target", followDeleteTarget.response.status, 201);
  const followDeleted = await jsonRequest(
    `/leasing/leads/${specialistCreated.lead.id}/follows/${followDeleteTarget.body.data.id}`,
    specialistToken,
    "DELETE",
    undefined,
    "follow-delete"
  );
  assertStatus("delete follow", followDeleted.response.status, 200);

  const visit = await jsonRequest(
    `/leasing/leads/${specialistCreated.lead.id}/visits`,
    specialistToken,
    "POST",
    {
      visitorCount: 3,
      unitIds: [units[0].id, units[1].id],
      visitResult: "客户重点关注两套房源",
      advanceStatus: false,
      remark: smokeRemark
    },
    "visit-create"
  );
  assertStatus("create visit", visit.response.status, 201);
  assertUniformResponse("create visit", visit.body);
  assert(Array.isArray(visit.body?.data?.unitIds) && visit.body.data.unitIds.length === 2, "visit did not keep multiple unit ids");
  await waitForAuditLog(visit.idempotencyKey, "biz_leasing_visit");

  const invalidVisit = await jsonRequest(
    `/leasing/leads/${specialistCreated.lead.id}/visits`,
    specialistToken,
    "POST",
    {
      visitorCount: 1,
      unitIds: [randomUUID()],
      visitResult: "无效房源关联",
      remark: smokeRemark
    },
    "visit-invalid-unit"
  );
  assertStatus("invalid unit cannot be linked to visit", invalidVisit.response.status, 400);

  const quote = await jsonRequest(
    `/leasing/leads/${specialistCreated.lead.id}/quotes`,
    specialistToken,
    "POST",
    {
      unitId: units[0].id,
      quotePrice: 5800,
      quotePeriod: "2026年7月",
      freeRentMonths: 1,
      depositMonths: 2,
      paymentPeriod: "10",
      propertyFeePrice: 8,
      remark: smokeRemark
    },
    "quote-create"
  );
  assertStatus("create quote", quote.response.status, 201);
  assertUniformResponse("create quote", quote.body);
  assert(quote.body?.data?.quotePrice === "***", "quote price was not masked for specialist");
  assert(quote.body?.data?.propertyFeePrice === "***", "property fee price was not masked for specialist");
  await waitForAuditLog(quote.idempotencyKey, "biz_leasing_quote");

  const quoteList = await request(`/leasing/leads/${specialistCreated.lead.id}/quotes`, {
    headers: { authorization: `Bearer ${specialistToken}` }
  });
  assertStatus("list quotes", quoteList.response.status, 200);
  assert(Array.isArray(quoteList.body?.data), "quote list did not return array");
  assert(quoteList.body.data.some((item) => item.id === quote.body.data.id && item.quotePrice === "***"), "quote list price was not masked");

  const quoteSubmitted = await jsonRequest(`/leasing/quotes/${quote.body.data.id}/submit`, specialistToken, "POST", { opinion: "提交审批" }, "quote-submit");
  assertStatus("submit quote", quoteSubmitted.response.status, 201);

  const specialistApprove = await jsonRequest(`/leasing/quotes/${quote.body.data.id}/approve`, specialistToken, "POST", { opinion: "越权审批" }, "quote-specialist-approve");
  assertStatus("specialist approve quote denied", specialistApprove.response.status, 403);

  const quoteApproved = await jsonRequest(`/leasing/quotes/${quote.body.data.id}/approve`, managerToken, "POST", { opinion: "同意报价" }, "quote-approve");
  assertStatus("approve quote", quoteApproved.response.status, 201);
  assert(Array.isArray(quoteApproved.body?.data?.approveRecords) && quoteApproved.body.data.approveRecords.length > 0, "quote approve_records was not written");
  await waitForAuditLog(quoteApproved.idempotencyKey, "biz_leasing_quote");

  const rejectQuote = await jsonRequest(
    `/leasing/leads/${specialistCreated.lead.id}/quotes`,
    specialistToken,
    "POST",
    {
      unitId: units[1].id,
      quotePrice: 6200,
      paymentPeriod: "30",
      propertyFeePrice: 9,
      remark: smokeRemark
    },
    "quote-reject-create"
  );
  assertStatus("create quote for reject", rejectQuote.response.status, 201);
  const rejectSubmitted = await jsonRequest(`/leasing/quotes/${rejectQuote.body.data.id}/submit`, specialistToken, "POST", { opinion: "提交驳回测试" }, "quote-reject-submit");
  assertStatus("submit quote for reject", rejectSubmitted.response.status, 201);
  const rejectMissingReason = await jsonRequest(`/leasing/quotes/${rejectQuote.body.data.id}/reject`, managerToken, "POST", {}, "quote-reject-missing-reason");
  assertStatus("reject quote requires reason", rejectMissingReason.response.status, 400);
  const quoteRejected = await jsonRequest(`/leasing/quotes/${rejectQuote.body.data.id}/reject`, managerToken, "POST", { rejectReason: "价格需重新确认" }, "quote-reject");
  assertStatus("reject quote", quoteRejected.response.status, 201);

  const statusLead = await createLead(managerToken, "status");
  const statusChanged = await jsonRequest(
    `/leasing/leads/${statusLead.lead.id}/change-status`,
    managerToken,
    "POST",
    { after_status: "20", reason: "已完成初步沟通" },
    "status-change"
  );
  assertStatus("legal status change", statusChanged.response.status, 201);
  await waitForAuditLog(statusChanged.idempotencyKey, "biz_leasing_lead");

  const illegalStatus = await jsonRequest(
    `/leasing/leads/${statusLead.lead.id}/change-status`,
    managerToken,
    "POST",
    { after_status: "75", reason: "非法跳转测试" },
    "status-illegal"
  );
  assertStatus("illegal status change rejected", illegalStatus.response.status, 400);

  const lostMissingReason = await jsonRequest(
    `/leasing/leads/${statusLead.lead.id}/change-status`,
    managerToken,
    "POST",
    { after_status: "91", reason: "客户流失" },
    "status-lost-missing-reason"
  );
  assertStatus("lost status requires lost_reason", lostMissingReason.response.status, 400);

  const forceLead = await createLead(adminToken, "force");
  const forceMissingReason = await jsonRequest(
    `/leasing/leads/${forceLead.lead.id}/change-status`,
    adminToken,
    "POST",
    { after_status: "75" },
    "status-force-missing-reason"
  );
  assertStatus("force status change requires reason", forceMissingReason.response.status, 400);
  const forceChanged = await jsonRequest(
    `/leasing/leads/${forceLead.lead.id}/change-status`,
    adminToken,
    "POST",
    { after_status: "75", reason: "管理层确认直接签约" },
    "status-force"
  );
  assertStatus("force status change", forceChanged.response.status, 201);

  const statusLogCount = Number(await dbScalar(`
SELECT count(*) FROM biz_leasing_lead_status_log
WHERE tenant_id = ${sqlLiteral(tenantId)}
  AND park_id = ${sqlLiteral(parkId)}
  AND lead_id = ${sqlLiteral(statusLead.lead.id)}::uuid
  AND is_deleted = false;`));
  assert(statusLogCount > 0, "lead status log was not written");

  const poolLead = await createLead(managerToken, "pool");
  const movedToPool = await jsonRequest(`/leasing/leads/${poolLead.lead.id}/move-to-pool`, managerToken, "POST", { reason: "长期未跟进" }, "move-to-pool");
  assertStatus("move lead to pool", movedToPool.response.status, 201);
  const poolList = await request("/leasing/lead-pool?page=1&page_size=50", {
    headers: { authorization: `Bearer ${specialistToken}` }
  });
  assertStatus("list lead pool", poolList.response.status, 200);
  assert(items(poolList.body).some((item) => item.id === poolLead.lead.id), "pool lead was not listed");
  const reclaimed = await jsonRequest(`/leasing/leads/${poolLead.lead.id}/reclaim`, specialistToken, "POST", {}, "reclaim-pool");
  assertStatus("reclaim pool lead", reclaimed.response.status, 201);
  const reclaimedState = await dbScalar(`SELECT is_in_pool::text || '|' || follow_user_id::text FROM biz_leasing_lead WHERE id = ${sqlLiteral(poolLead.lead.id)}::uuid;`);
  assert(reclaimedState === `false|${users.specialist.id}`, "reclaimed lead did not leave pool or assign to specialist");

  const assignLead = await createLead(managerToken, "assign");
  const assignMoved = await jsonRequest(`/leasing/leads/${assignLead.lead.id}/move-to-pool`, managerToken, "POST", { reason: "分配测试" }, "assign-move-pool");
  assertStatus("move assign lead to pool", assignMoved.response.status, 201);
  const assigned = await jsonRequest(
    `/leasing/leads/${assignLead.lead.id}/assign`,
    managerToken,
    "POST",
    { follow_user_id: users.specialist.id, reason: "分配给招商专员" },
    "lead-assign"
  );
  assertStatus("manager assign lead", assigned.response.status, 201);
  const specialistAssignDenied = await jsonRequest(
    `/leasing/leads/${assignLead.lead.id}/assign`,
    specialistToken,
    "POST",
    { follow_user_id: users.manager.id, reason: "专员越权分配" },
    "specialist-assign-denied"
  );
  assertStatus("specialist assign denied", specialistAssignDenied.response.status, 403);

  const specialistFunnel = await request(`/leasing/statistics/funnel?follow_user_id=${users.manager.id}`, {
    headers: { authorization: `Bearer ${specialistToken}` }
  });
  assertStatus("specialist funnel scoped away from manager", specialistFunnel.response.status, 200);
  assertUniformResponse("specialist funnel scoped away from manager", specialistFunnel.body);
  assert(specialistFunnel.body.data.summary.total_leads === 0, "specialist funnel can see manager leads");

  const opsFunnel = await request("/leasing/statistics/funnel", {
    headers: { authorization: `Bearer ${opsToken}` }
  });
  assertStatus("operations owner funnel", opsFunnel.response.status, 200);
  assertUniformResponse("operations owner funnel", opsFunnel.body);
  assert(opsFunnel.body.data.summary.total_leads >= 1, "operations owner funnel did not return real data");
  assert(Array.isArray(opsFunnel.body.data.by_status), "funnel by_status is missing");

  const creditCode = `9132${String(stamp).slice(-14).padStart(14, "0")}`;
  const convertLead = await createLead(managerToken, "convert");
  const converted = await jsonRequest(
    `/leasing/leads/${convertLead.lead.id}/convert-to-park-tenant`,
    managerToken,
    "POST",
    {
      company_name: `${convertLead.lead.customerName}有限公司`,
      unified_credit_code: creditCode,
      legal_person: "张三",
      contact_name: convertLead.lead.contactName,
      contact_mobile: convertLead.lead.contactMobile,
      tenant_type: "10",
      industry_code: "tech",
      risk_level: "10",
      remark: "由 S3-B smoke 转入"
    },
    "lead-convert"
  );
  assertStatus("convert lead to park tenant", converted.response.status, 201);
  assert(converted.body?.data?.park_tenant_id, "convert did not return park_tenant_id");
  const repeatConvert = await jsonRequest(
    `/leasing/leads/${convertLead.lead.id}/convert-to-park-tenant`,
    managerToken,
    "POST",
    {
      company_name: `${convertLead.lead.customerName}有限公司`,
      unified_credit_code: creditCode,
      tenant_type: "10",
      industry_code: "tech",
      risk_level: "10"
    },
    "lead-convert-repeat"
  );
  assertStatus("repeat conversion rejected", repeatConvert.response.status, 409);

  const convertExistingLead = await createLead(managerToken, "convert-existing");
  const convertedExisting = await jsonRequest(
    `/leasing/leads/${convertExistingLead.lead.id}/convert-to-park-tenant`,
    managerToken,
    "POST",
    {
      company_name: `${convertExistingLead.lead.customerName}有限公司`,
      unified_credit_code: creditCode,
      tenant_type: "10",
      industry_code: "tech",
      risk_level: "10"
    },
    "lead-convert-existing"
  );
  assertStatus("convert lead links existing park tenant", convertedExisting.response.status, 201);
  assert(convertedExisting.body?.data?.created === false, "existing unified credit conversion created duplicate tenant");
  assert(
    convertedExisting.body?.data?.park_tenant_id === converted.body?.data?.park_tenant_id,
    "existing unified credit conversion did not link existing tenant"
  );
  const parkTenantCount = Number(await dbScalar(`
SELECT count(*) FROM biz_park_tenant
WHERE tenant_id = ${sqlLiteral(tenantId)}
  AND park_id = ${sqlLiteral(parkId)}
  AND unified_credit_code = ${sqlLiteral(creditCode)}
  AND is_deleted = false;`));
  assert(parkTenantCount === 1, "duplicate park tenant was created for same unified credit code");
  const convertedLeadParkTenantId = await dbScalar(`SELECT park_tenant_id::text FROM biz_leasing_lead WHERE id = ${sqlLiteral(convertLead.lead.id)}::uuid;`);
  assert(convertedLeadParkTenantId === converted.body.data.park_tenant_id, "lead.park_tenant_id was not updated after conversion");
  const sourceType = await dbScalar(`SELECT source_type FROM biz_park_tenant WHERE id = ${sqlLiteral(converted.body.data.park_tenant_id)}::uuid;`);
  assert(sourceType === "lead_convert", "converted park tenant source_type is not lead_convert");

  const contractCountAfter = await tableCountIfExists("biz_contract");
  const receivableCountAfter = await tableCountIfExists("biz_receivable");
  assert(contractCountBefore === contractCountAfter, "lead conversion generated contract data");
  assert(receivableCountBefore === receivableCountAfter, "lead conversion generated receivable data");

  await withLeasingDisabled(adminToken);

  const maskedAudit = await dbScalar(`
SELECT COALESCE(after_json->>'contactMobile', '')
FROM sys_op_log
WHERE tenant_id = ${sqlLiteral(tenantId)}
  AND park_id = ${sqlLiteral(parkId)}
  AND idempotency_key = ${sqlLiteral(specialistCreated.idempotencyKey)}
  AND biz_type = 'biz_leasing_lead'
  AND success = true
  AND is_deleted = false
ORDER BY create_time DESC
LIMIT 1;`);
  assert(maskedAudit === "***", "audit log did not mask lead contactMobile");

  logStep("S3-B leasing CRM smoke test passed");
}

run()
  .catch((error) => {
    console.error(`[s3b-leasing-crm-smoke] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await cleanupSmokeFieldPolicyLinks();
    } catch {
      // best-effort cleanup only
    }
    if (apiProcess) {
      try {
        process.kill(-apiProcess.pid, "SIGTERM");
      } catch {
        apiProcess.kill("SIGTERM");
      }
    }
  });
