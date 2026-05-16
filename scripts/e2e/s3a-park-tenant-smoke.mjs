import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
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
const smokeRemark = `S3A park tenant smoke ${stamp}`;

function logStep(message) {
  console.log(`[s3a-park-tenant-smoke] ${message}`);
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

async function request(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, options);
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json") ? await response.json().catch(() => null) : await response.text();
  return { response, body };
}

async function login(username, password) {
  return request("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-request-id": `s3a-login-${randomUUID()}` },
    body: JSON.stringify({ tenantId, parkId, username, password })
  });
}

async function jsonRequest(path, token, method, body) {
  return request(path, {
    method,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      "x-idempotency-key": `s3a-${stamp}-${randomUUID()}`
    },
    body: JSON.stringify(body)
  });
}

async function formRequest(path, token, formData) {
  return request(path, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "x-idempotency-key": `s3a-${stamp}-${randomUUID()}`
    },
    body: formData
  });
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
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

async function ensureNormalReadWithFieldPolicies() {
  await dbExec(`
WITH seed_scope AS (
  SELECT ${sqlLiteral(tenantId)} AS tenant_id, ${sqlLiteral(parkId)} AS park_id
),
target_role AS (
  SELECT id, tenant_id, park_id FROM sys_role
  WHERE tenant_id = ${sqlLiteral(tenantId)} AND park_id = ${sqlLiteral(parkId)} AND code = 'S1_NORMAL' AND is_deleted = false
),
target_permission AS (
  SELECT id, tenant_id, park_id FROM sys_permission
  WHERE tenant_id = ${sqlLiteral(tenantId)}
    AND park_id = ${sqlLiteral(parkId)}
    AND code IN ('park_tenant:read', 'park_tenant:360', 'park_tenant:risk_log', 'park_tenant_contact:read', 'park_tenant_qualification:read')
    AND is_deleted = false
)
INSERT INTO rel_role_perm (tenant_id, park_id, role_id, permission_id, create_by, update_by, remark)
SELECT seed_scope.tenant_id, seed_scope.park_id, target_role.id, target_permission.id, NULL, NULL, ${sqlLiteral(smokeRemark)}
FROM seed_scope, target_role, target_permission
WHERE NOT EXISTS (
  SELECT 1 FROM rel_role_perm relation
  WHERE relation.tenant_id = seed_scope.tenant_id
    AND relation.park_id = seed_scope.park_id
    AND relation.role_id = target_role.id
    AND relation.permission_id = target_permission.id
    AND relation.is_deleted = false
);`);

  await dbExec(`
WITH target_role AS (
  SELECT id FROM sys_role
  WHERE tenant_id = ${sqlLiteral(tenantId)} AND park_id = ${sqlLiteral(parkId)} AND code = 'S1_NORMAL' AND is_deleted = false
),
target_policy AS (
  SELECT id FROM sys_field_policy
  WHERE tenant_id = ${sqlLiteral(tenantId)}
    AND park_id = ${sqlLiteral(parkId)}
    AND module = 'leasing'
    AND (
      (entity = 'park_tenant' AND field_key IN ('contact_mobile', 'legal_person_id'))
      OR (entity = 'park_tenant_contact' AND field_key IN ('mobile', 'email'))
      OR (entity = 'park_tenant_qualification' AND field_key IN ('certificate_no', 'file_id'))
    )
    AND is_deleted = false
)
INSERT INTO rel_role_field_policy (tenant_id, park_id, role_id, field_policy_id, create_by, update_by, remark)
SELECT ${sqlLiteral(tenantId)}, ${sqlLiteral(parkId)}, target_role.id, target_policy.id, NULL, NULL, ${sqlLiteral(smokeRemark)}
FROM target_role, target_policy
WHERE NOT EXISTS (
  SELECT 1 FROM rel_role_field_policy relation
  WHERE relation.tenant_id = ${sqlLiteral(tenantId)}
    AND relation.role_id = target_role.id
    AND relation.field_policy_id = target_policy.id
    AND relation.is_deleted = false
);`);
}

async function cleanupTemporaryGrants() {
  await dbExec(`
UPDATE rel_role_perm
SET is_deleted = true, update_time = now()
WHERE tenant_id = ${sqlLiteral(tenantId)}
  AND park_id = ${sqlLiteral(parkId)}
  AND remark = ${sqlLiteral(smokeRemark)}
  AND is_deleted = false;`);
  await dbExec(`
UPDATE rel_role_field_policy
SET is_deleted = true, update_time = now()
WHERE tenant_id = ${sqlLiteral(tenantId)}
  AND park_id = ${sqlLiteral(parkId)}
  AND remark = ${sqlLiteral(smokeRemark)}
  AND is_deleted = false;`);
}

async function withLeasingDisabled(token, parkTenantId) {
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
    const denied = await request("/park-tenants?page=1&page_size=1", {
      headers: { authorization: `Bearer ${token}`, "x-request-id": `s3a-module-denied-${randomUUID()}` }
    });
    assertStatus("leasing module disabled denies park tenant API", denied.response.status, 403);
    const tenant360Denied = await request(`/park-tenants/${parkTenantId}/360`, {
      headers: { authorization: `Bearer ${token}`, "x-request-id": `s3a-360-module-denied-${randomUUID()}` }
    });
    assertStatus("leasing module disabled denies park tenant 360 API", tenant360Denied.response.status, 403);
  } finally {
    await dbExec(`
UPDATE rel_tenant_module
SET enabled = ${wasEnabled === "true" ? "true" : "false"}, status = ${sqlLiteral(previousStatus)}, update_time = now()
WHERE tenant_id = ${sqlLiteral(tenantId)}
  AND park_id = ${sqlLiteral(parkId)}
  AND module_id = (SELECT id FROM sys_module WHERE module_code = 'leasing' AND is_deleted = false LIMIT 1);`);
  }
}

async function waitForAuditLog(idempotencyKeyPrefix, bizType = "biz_park_tenant") {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const count = Number(await dbScalar(`
SELECT count(*) FROM sys_op_log
WHERE tenant_id = ${sqlLiteral(tenantId)}
  AND park_id = ${sqlLiteral(parkId)}
  AND biz_type = ${sqlLiteral(bizType)}
  AND idempotency_key LIKE ${sqlLiteral(`${idempotencyKeyPrefix}%`)}
  AND success = true
  AND is_deleted = false;`));
    if (count > 0) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 300));
  }
  throw new Error(`No sys_op_log record found for ${bizType} ${idempotencyKeyPrefix}`);
}

async function waitForDownloadAudit(bizType, bizId) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const count = Number(await dbScalar(`
SELECT count(*) FROM sys_op_log
WHERE tenant_id = ${sqlLiteral(tenantId)}
  AND park_id = ${sqlLiteral(parkId)}
  AND biz_type = ${sqlLiteral(bizType)}
  AND biz_id = ${sqlLiteral(bizId)}
  AND action = 'download'
  AND success = true
  AND is_deleted = false;`));
    if (count > 0) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 300));
  }
  throw new Error(`No download sys_op_log record found for ${bizType} ${bizId}`);
}

async function main() {
  const adminLogin = await login(adminUser, adminPassword);
  assertStatus("admin login", adminLogin.response.status, 200);
  assertUniformResponse("admin login", adminLogin.body);
  const adminToken = adminLogin.body.data.accessToken;

  const normalLoginBeforeGrant = await login(normalUser, normalPassword);
  assertStatus("normal login before grant", normalLoginBeforeGrant.response.status, 200);
  const normalTokenBeforeGrant = normalLoginBeforeGrant.body.data.accessToken;

  const normalCreateDenied = await jsonRequest("/park-tenants", normalTokenBeforeGrant, "POST", {
    companyName: `S3A普通用户无权限企业${stamp}`
  });
  assertStatus("normal user cannot create park tenant", normalCreateDenied.response.status, 403);

  const creditCode = `91320500${String(stamp).slice(-10)}`;
  const createKeyPrefix = `s3a-${stamp}-`;
  const created = await jsonRequest("/park-tenants", adminToken, "POST", {
    companyName: `S3A自测企业${stamp}`,
    unifiedCreditCode: creditCode,
    legalPerson: "S3A法人",
    legalPersonId: "110101199001019999",
    contactName: "S3A联系人",
    contactMobile: "13800138000",
    contactEmail: "s3a-smoke@example.com",
    industryCode: "tech",
    tenantType: "10",
    riskLevel: "10",
    riskTags: ["smoke"],
    checkInDate: "2026-05-16",
    status: "20",
    sourceType: "manual",
    remark: smokeRemark
  });
  assertStatus("admin creates park tenant", created.response.status, 201);
  assertUniformResponse("admin creates park tenant", created.body);
  assert(created.body.data?.id, "created park tenant is missing id");
  assert(created.body.data?.tenantId === tenantId, "created tenant_id does not match current SaaS tenant");
  assert(created.body.data?.parkId === parkId, "created park_id does not match current park");
  assert(created.body.data?.parkTenantCode, "created park tenant code was not generated");

  const duplicate = await jsonRequest("/park-tenants", adminToken, "POST", {
    companyName: `S3A重复信用代码企业${stamp}`,
    unifiedCreditCode: creditCode
  });
  assertStatus("duplicate unified credit code rejected", duplicate.response.status, 409);

  const listed = await request(`/park-tenants?keyword=${encodeURIComponent(creditCode)}&page=1&page_size=10`, {
    headers: { authorization: `Bearer ${adminToken}` }
  });
  assertStatus("admin lists created park tenant", listed.response.status, 200);
  assertUniformResponse("admin lists created park tenant", listed.body);
  assert(listed.body.data.items.some((item) => item.id === created.body.data.id), "created park tenant not found in list");

  const normalContactCreateDenied = await jsonRequest(`/park-tenants/${created.body.data.id}/contacts`, normalTokenBeforeGrant, "POST", {
    contactName: `S3A无权限联系人${stamp}`
  });
  assertStatus("normal user cannot create park tenant contact", normalContactCreateDenied.response.status, 403);

  const normalQualificationCreateDenied = await jsonRequest(`/park-tenants/${created.body.data.id}/qualifications`, normalTokenBeforeGrant, "POST", {
    qualificationType: "business_license",
    qualificationName: `S3A无权限资质${stamp}`
  });
  assertStatus("normal user cannot create park tenant qualification", normalQualificationCreateDenied.response.status, 403);

  const normalRiskChangeDenied = await jsonRequest(`/park-tenants/${created.body.data.id}/change-risk-level`, normalTokenBeforeGrant, "POST", {
    risk_level: 40,
    risk_tags: ["锂电池"],
    reason: "普通用户无权限风险调整"
  });
  assertStatus("normal user cannot change park tenant risk", normalRiskChangeDenied.response.status, 403);

  const normal360Denied = await request(`/park-tenants/${created.body.data.id}/360`, {
    headers: { authorization: `Bearer ${normalTokenBeforeGrant}` }
  });
  assertStatus("normal user cannot read park tenant 360", normal360Denied.response.status, 403);

  const firstContact = await jsonRequest(`/park-tenants/${created.body.data.id}/contacts`, adminToken, "POST", {
    contactName: "S3A主联系人",
    contactRole: "primary",
    mobile: "13900139000",
    email: "s3a-contact-1@example.com",
    position: "总经理",
    isPrimary: true,
    isEmergency: false,
    status: 1,
    remark: smokeRemark
  });
  assertStatus("admin creates primary contact", firstContact.response.status, 201);
  assertUniformResponse("admin creates primary contact", firstContact.body);
  assert(firstContact.body.data?.isPrimary === true, "first contact should be primary");

  const secondContact = await jsonRequest(`/park-tenants/${created.body.data.id}/contacts`, adminToken, "POST", {
    contactName: "S3A财务联系人",
    contactRole: "finance",
    mobile: "13700137000",
    email: "s3a-contact-2@example.com",
    position: "财务负责人",
    isPrimary: true,
    isEmergency: true,
    status: 1,
    remark: smokeRemark
  });
  assertStatus("admin creates second primary contact", secondContact.response.status, 201);
  assertUniformResponse("admin creates second primary contact", secondContact.body);

  const contactList = await request(`/park-tenants/${created.body.data.id}/contacts`, {
    headers: { authorization: `Bearer ${adminToken}` }
  });
  assertStatus("admin lists park tenant contacts", contactList.response.status, 200);
  assertUniformResponse("admin lists park tenant contacts", contactList.body);
  assert(contactList.body.data.length === 2, "expected two contacts for created park tenant");
  assert(contactList.body.data.filter((item) => item.isPrimary).length === 1, "only one primary contact should remain");
  assert(contactList.body.data.find((item) => item.id === secondContact.body.data.id)?.isPrimary === true, "second contact should become primary");

  const primaryCount = Number(await dbScalar(`
SELECT count(*) FROM biz_park_tenant_contact
WHERE tenant_id = ${sqlLiteral(tenantId)}
  AND park_id = ${sqlLiteral(parkId)}
  AND park_tenant_id = ${sqlLiteral(created.body.data.id)}
  AND is_primary = true
  AND is_deleted = false;`));
  assert(primaryCount === 1, "database should contain exactly one active primary contact");

  const emptyRiskReason = await jsonRequest(`/park-tenants/${created.body.data.id}/change-risk-level`, adminToken, "POST", {
    risk_level: 40,
    risk_tags: ["锂电池"],
    reason: ""
  });
  assertStatus("empty risk change reason rejected", emptyRiskReason.response.status, 400);

  const highRiskWithoutTags = await jsonRequest(`/park-tenants/${created.body.data.id}/change-risk-level`, adminToken, "POST", {
    risk_level: 40,
    risk_tags: [],
    reason: "测试高风险标签必填"
  });
  assertStatus("high risk without tags rejected", highRiskWithoutTags.response.status, 400);

  const riskChanged = await jsonRequest(`/park-tenants/${created.body.data.id}/change-risk-level`, adminToken, "POST", {
    risk_level: 40,
    risk_tags: ["锂电池", "仓储集中"],
    reason: "租户新增锂电池仓储业务"
  });
  assertStatus("admin changes park tenant to high risk", riskChanged.response.status, 201);
  assertUniformResponse("admin changes park tenant to high risk", riskChanged.body);
  assert(riskChanged.body.data?.riskLevel === "40", "numeric risk_level 40 should normalize to high risk dictionary value");
  assert(riskChanged.body.data?.riskTags?.includes("锂电池"), "risk tags should contain lithium battery tag");

  const riskLogs = await request(`/park-tenants/${created.body.data.id}/risk-logs`, {
    headers: { authorization: `Bearer ${adminToken}` }
  });
  assertStatus("admin lists park tenant risk logs", riskLogs.response.status, 200);
  assertUniformResponse("admin lists park tenant risk logs", riskLogs.body);
  assert(riskLogs.body.data.some((item) => item.afterRiskLevel === "40" && item.reason === "租户新增锂电池仓储业务"), "risk log was not created");

  const uploadForm = new FormData();
  uploadForm.set("biz_type", "park_tenant_qualification");
  uploadForm.set("remark", smokeRemark);
  uploadForm.set("file", new Blob([`S3A qualification smoke ${stamp}`], { type: "application/pdf" }), `s3a-qualification-${stamp}.pdf`);
  const uploadedFile = await formRequest("/files", adminToken, uploadForm);
  assertStatus("admin uploads qualification file", uploadedFile.response.status, 201);
  assertUniformResponse("admin uploads qualification file", uploadedFile.body);
  assert(uploadedFile.body.data?.id, "uploaded qualification file is missing id");
  assert(uploadedFile.body.data?.bizType === "park_tenant_qualification", "uploaded file biz_type is not park_tenant_qualification");

  const qualification = await jsonRequest(`/park-tenants/${created.body.data.id}/qualifications`, adminToken, "POST", {
    qualificationType: "business_license",
    qualificationName: "营业执照",
    certificateNo: `BL-${stamp}`,
    issueDate: "2026-01-01",
    expireDate: "2026-12-31",
    fileId: uploadedFile.body.data.id,
    status: 1,
    remark: smokeRemark
  });
  assertStatus("admin creates park tenant qualification", qualification.response.status, 201);
  assertUniformResponse("admin creates park tenant qualification", qualification.body);
  assert(qualification.body.data?.fileId === uploadedFile.body.data.id, "qualification did not bind uploaded file");
  assert(qualification.body.data?.file?.id === uploadedFile.body.data.id, "qualification response did not include file metadata");

  const qualificationList = await request(`/park-tenants/${created.body.data.id}/qualifications`, {
    headers: { authorization: `Bearer ${adminToken}` }
  });
  assertStatus("admin lists park tenant qualifications", qualificationList.response.status, 200);
  assertUniformResponse("admin lists park tenant qualifications", qualificationList.body);
  assert(qualificationList.body.data.some((item) => item.id === qualification.body.data.id), "created qualification not found in list");

  const adminTenant360 = await request(`/park-tenants/${created.body.data.id}/360`, {
    headers: { authorization: `Bearer ${adminToken}` }
  });
  assertStatus("admin reads park tenant 360", adminTenant360.response.status, 200);
  assertUniformResponse("admin reads park tenant 360", adminTenant360.body);
  assert(adminTenant360.body.data.profile.id === created.body.data.id, "tenant 360 profile mismatch");
  assert(adminTenant360.body.data.contacts.length === 2, "tenant 360 contacts should use real contact data");
  assert(adminTenant360.body.data.qualifications.some((item) => item.id === qualification.body.data.id), "tenant 360 qualifications should use real qualification data");
  assert(adminTenant360.body.data.riskLogs.some((item) => item.afterRiskLevel === "40"), "tenant 360 risk logs should use real risk log data");
  assert(Array.isArray(adminTenant360.body.data.relatedUnits) && adminTenant360.body.data.relatedUnits.length === 0, "tenant 360 should not invent related units");
  assert(adminTenant360.body.data.contracts.available === false, "tenant 360 contracts should be unavailable before contract module");
  assert(adminTenant360.body.data.receivables.available === false, "tenant 360 receivables should be unavailable before receivable module");
  assert(adminTenant360.body.data.workorders.available === false, "tenant 360 workorders should be unavailable before workorder module");
  assert(adminTenant360.body.data.hazards.available === false, "tenant 360 hazards should be unavailable before safety module");
  assert(adminTenant360.body.data.energy.available === false, "tenant 360 energy should be unavailable before energy module");

  const downloaded = await request(`/files/${uploadedFile.body.data.id}/download`, {
    headers: { authorization: `Bearer ${adminToken}`, "x-request-id": `s3a-file-download-${randomUUID()}` }
  });
  assertStatus("admin downloads qualification file", downloaded.response.status, 200);
  assert(typeof downloaded.body === "string" && downloaded.body.includes("S3A qualification smoke"), "downloaded qualification file content mismatch");
  await waitForDownloadAudit("park_tenant_qualification", qualification.body.data.id);

  await ensureNormalReadWithFieldPolicies();
  const normalLoginAfterGrant = await login(normalUser, normalPassword);
  assertStatus("normal login after read grant", normalLoginAfterGrant.response.status, 200);
  const normalTokenAfterGrant = normalLoginAfterGrant.body.data.accessToken;
  const maskedDetail = await request(`/park-tenants/${created.body.data.id}`, {
    headers: { authorization: `Bearer ${normalTokenAfterGrant}` }
  });
  assertStatus("field policy user reads park tenant detail", maskedDetail.response.status, 200);
  assertUniformResponse("field policy user reads park tenant detail", maskedDetail.body);
  assert(maskedDetail.body.data.contactMobile === "138****8000", "contactMobile was not masked by field policy");
  assert(maskedDetail.body.data.legalPersonId === "1101********9999", "legalPersonId was not masked by field policy");

  const maskedContacts = await request(`/park-tenants/${created.body.data.id}/contacts`, {
    headers: { authorization: `Bearer ${normalTokenAfterGrant}` }
  });
  assertStatus("field policy user reads contact list", maskedContacts.response.status, 200);
  assertUniformResponse("field policy user reads contact list", maskedContacts.body);
  assert(maskedContacts.body.data.some((item) => item.mobile === "137****7000"), "contact mobile was not masked by field policy");
  assert(maskedContacts.body.data.some((item) => item.email === "s3a-contact-2@example.com"), "visible contact email field policy did not keep email readable");

  const normalQualificationList = await request(`/park-tenants/${created.body.data.id}/qualifications`, {
    headers: { authorization: `Bearer ${normalTokenAfterGrant}` }
  });
  assertStatus("read-only user lists park tenant qualifications", normalQualificationList.response.status, 200);
  assertUniformResponse("read-only user lists park tenant qualifications", normalQualificationList.body);
  assert(normalQualificationList.body.data.some((item) => item.id === qualification.body.data.id), "read-only user cannot see qualification list");
  assert(normalQualificationList.body.data.some((item) => item.certificateNo !== `BL-${stamp}` && String(item.certificateNo).includes("***")), "qualification certificateNo was not masked by field policy");
  assert(normalQualificationList.body.data.some((item) => item.fileId !== uploadedFile.body.data.id && String(item.fileId).includes("***")), "qualification fileId was not masked by field policy");

  const normalRiskLogs = await request(`/park-tenants/${created.body.data.id}/risk-logs`, {
    headers: { authorization: `Bearer ${normalTokenAfterGrant}` }
  });
  assertStatus("read-only user lists park tenant risk logs", normalRiskLogs.response.status, 200);
  assertUniformResponse("read-only user lists park tenant risk logs", normalRiskLogs.body);
  assert(normalRiskLogs.body.data.some((item) => item.afterRiskLevel === "40"), "read-only user cannot see risk logs");

  const normalTenant360 = await request(`/park-tenants/${created.body.data.id}/360`, {
    headers: { authorization: `Bearer ${normalTokenAfterGrant}` }
  });
  assertStatus("read-only user reads park tenant 360", normalTenant360.response.status, 200);
  assertUniformResponse("read-only user reads park tenant 360", normalTenant360.body);
  assert(normalTenant360.body.data.profile.contactMobile === "138****8000", "tenant 360 profile contactMobile was not masked");
  assert(normalTenant360.body.data.profile.legalPersonId === "1101********9999", "tenant 360 profile legalPersonId was not masked");
  assert(normalTenant360.body.data.contacts.some((item) => item.mobile === "137****7000"), "tenant 360 contact mobile was not masked");
  assert(normalTenant360.body.data.contacts.some((item) => item.email === "s3a-contact-2@example.com"), "tenant 360 visible contact email was not readable");
  assert(normalTenant360.body.data.qualifications.some((item) => item.id === qualification.body.data.id), "tenant 360 qualification data missing for read-only user");
  assert(normalTenant360.body.data.qualifications.some((item) => item.certificateNo !== `BL-${stamp}` && String(item.certificateNo).includes("***")), "tenant 360 certificateNo was not masked");
  assert(normalTenant360.body.data.qualifications.some((item) => item.fileId !== uploadedFile.body.data.id && String(item.fileId).includes("***")), "tenant 360 fileId was not masked");
  assert(normalTenant360.body.data.riskLogs.some((item) => item.afterRiskLevel === "40"), "tenant 360 risk logs missing for read-only user");
  assert(normalTenant360.body.data.contracts.available === false, "tenant 360 should not return fake contract data");

  await withLeasingDisabled(adminToken, created.body.data.id);

  const qualificationDeleted = await jsonRequest(`/park-tenants/${created.body.data.id}/qualifications/${qualification.body.data.id}`, adminToken, "DELETE", {});
  assertStatus("admin soft deletes park tenant qualification", qualificationDeleted.response.status, 200);
  assertUniformResponse("admin soft deletes park tenant qualification", qualificationDeleted.body);
  const qualificationSoftDeleted = await dbScalar(`
SELECT is_deleted::text FROM biz_park_tenant_qualification
WHERE id = ${sqlLiteral(qualification.body.data.id)}
  AND tenant_id = ${sqlLiteral(tenantId)}
  AND park_id = ${sqlLiteral(parkId)};`);
  assert(qualificationSoftDeleted === "true", "park tenant qualification was not soft deleted");

  const contactDeleted = await jsonRequest(`/park-tenants/${created.body.data.id}/contacts/${firstContact.body.data.id}`, adminToken, "DELETE", {});
  assertStatus("admin soft deletes park tenant contact", contactDeleted.response.status, 200);
  assertUniformResponse("admin soft deletes park tenant contact", contactDeleted.body);
  const contactSoftDeleted = await dbScalar(`
SELECT is_deleted::text FROM biz_park_tenant_contact
WHERE id = ${sqlLiteral(firstContact.body.data.id)}
  AND tenant_id = ${sqlLiteral(tenantId)}
  AND park_id = ${sqlLiteral(parkId)};`);
  assert(contactSoftDeleted === "true", "park tenant contact was not soft deleted");

  const deleted = await jsonRequest(`/park-tenants/${created.body.data.id}`, adminToken, "DELETE", {});
  assertStatus("admin soft deletes park tenant", deleted.response.status, 200);
  assertUniformResponse("admin soft deletes park tenant", deleted.body);

  const softDeleted = await dbScalar(`
SELECT is_deleted::text FROM biz_park_tenant
WHERE id = ${sqlLiteral(created.body.data.id)}
  AND tenant_id = ${sqlLiteral(tenantId)}
  AND park_id = ${sqlLiteral(parkId)};`);
  assert(softDeleted === "true", "park tenant was not soft deleted");

  await waitForAuditLog(createKeyPrefix);
  await waitForAuditLog(createKeyPrefix, "biz_park_tenant_contact");
  await waitForAuditLog(createKeyPrefix, "biz_park_tenant_qualification");
  await waitForAuditLog(createKeyPrefix, "biz_park_tenant_risk_log");
  logStep("sys_op_log contains park tenant, contact, qualification, risk, and qualification download audit");
  logStep("S3-A park tenant smoke passed");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanupTemporaryGrants().catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
  });
