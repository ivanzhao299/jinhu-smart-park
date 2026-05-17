import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { execFile, spawn } from "node:child_process";
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
const smokeRemark = `S3C contract smoke ${stamp}`;

let apiProcess = null;

function getPnpmBin() {
  if (process.env.PNPM_BIN) return process.env.PNPM_BIN;
  const bundled = resolve(rootDir, ".tools/pnpm");
  return existsSync(bundled) ? bundled : "pnpm";
}

function logStep(message) {
  console.log(`[s3c-contract-smoke] ${message}`);
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
  assert(body && typeof body === "object" && !(body instanceof ArrayBuffer), `${name} did not return JSON`);
  for (const key of ["code", "message", "data", "request_id", "server_time"]) {
    assert(Object.hasOwn(body, key), `${name} response is missing ${key}`);
  }
}

function assertClose(name, actual, expected, tolerance = 0.01) {
  if (Math.abs(Number(actual) - Number(expected)) > tolerance) {
    throw new Error(`${name} expected ${expected}, got ${actual}`);
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
    headers: { "content-type": "application/json", "x-request-id": `s3c-login-${randomUUID()}` },
    body: JSON.stringify({ tenantId, parkId, username, password })
  });
}

async function jsonRequest(path, token, method, body, label = "request") {
  const safeLabel = String(label).replace(/[^a-zA-Z0-9_.-]/g, "-");
  return request(path, {
    method,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      "x-idempotency-key": `s3c-${stamp}-${safeLabel}-${randomUUID()}`
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

async function formRequest(path, token, formData, label = "form") {
  const safeLabel = String(label).replace(/[^a-zA-Z0-9_.-]/g, "-");
  return request(path, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "x-idempotency-key": `s3c-${stamp}-${safeLabel}-${randomUUID()}`
    },
    body: formData
  });
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
  logStep("API not reachable, starting @jinhu/api for S3-C-A smoke test");
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
  return body?.data?.items ?? body?.data ?? [];
}

function uniqueMobile(offset = 0) {
  const seed = String((stamp + offset) % 100000000).padStart(8, "0");
  return `136${seed}`;
}

async function setupSmokeUsers() {
  const passwordHash = await dbScalar(`
SELECT password_hash FROM sys_user
WHERE tenant_id = ${sqlLiteral(tenantId)}
  AND park_id = ${sqlLiteral(parkId)}
  AND username = ${sqlLiteral(normalUser)}
  AND is_deleted = false
LIMIT 1;`);
  assert(passwordHash, "normal user password hash was not found");

  const users = [
    { id: randomUUID(), username: `s3c_ops_${stamp}`, name: "S3C 运营负责人", role: "OPERATIONS_OWNER", mobile: uniqueMobile(1001) },
    { id: randomUUID(), username: `s3c_specialist_${stamp}`, name: "S3C 招商专员", role: "INVEST_SPECIALIST", mobile: uniqueMobile(1002) },
    { id: randomUUID(), username: `s3c_finance_${stamp}`, name: "S3C 财务专员", role: "FINANCE_SPECIALIST", mobile: uniqueMobile(1003) }
  ];

  const values = users
    .map(
      (user) =>
        `(${sqlLiteral(user.id)}::uuid, ${sqlLiteral(user.username)}, ${sqlLiteral(user.name)}, ${sqlLiteral(user.mobile)}, ${sqlLiteral(`${user.username}@example.com`)}, ${sqlLiteral(user.role)})`
    )
    .join(",\n    ");

  await dbExec(`
WITH seed_scope AS (
  SELECT ${sqlLiteral(tenantId)} AS tenant_id, ${sqlLiteral(parkId)} AS park_id
),
new_users(id, username, display_name, mobile, email, role_code) AS (
  VALUES
    ${values}
),
insert_users AS (
  INSERT INTO sys_user (
    id, tenant_id, park_id, username, display_name, password_hash, mobile, email, is_enabled, status, remark
  )
  SELECT id, seed_scope.tenant_id, seed_scope.park_id, username, display_name, ${sqlLiteral(passwordHash)}, mobile, email, true, 'enabled', ${sqlLiteral(smokeRemark)}
  FROM new_users
  CROSS JOIN seed_scope
  RETURNING id
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
 AND role.code = 'FINANCE_SPECIALIST'
 AND role.is_deleted = false
JOIN sys_field_policy policy
  ON policy.tenant_id = seed_scope.tenant_id
 AND policy.park_id = seed_scope.park_id
 AND policy.module = 'leasing'
 AND policy.is_deleted = false
 AND policy.status = 'enabled'
 AND (
   (policy.entity = 'leasing_contract' AND policy.field_key IN (
     'rent_unit_price', 'rentUnitPrice', 'rent_per_month', 'rentPerMonth', 'total_amount', 'totalAmount',
     'deposit_amount', 'depositAmount', 'property_fee_unit_price', 'propertyFeeUnitPrice',
     'contract_pdf_file_id', 'contractPdfFileId', 'scan_pdf_file_id', 'scanPdfFileId'
   ))
   OR (policy.entity = 'rel_leasing_contract_unit' AND policy.field_key IN (
     'rent_unit_price', 'rentUnitPrice', 'rent_amount_per_month', 'rentAmountPerMonth'
   ))
 )
WHERE NOT EXISTS (
  SELECT 1 FROM rel_role_field_policy existing
  WHERE existing.tenant_id = seed_scope.tenant_id
    AND existing.park_id = seed_scope.park_id
    AND existing.role_id = role.id
    AND existing.field_policy_id = policy.id
    AND existing.is_deleted = false
);`);

  return Object.fromEntries(users.map((user) => [user.role, user.username]));
}

async function getFirstBuildingAndFloor(token) {
  const buildings = await request("/buildings?page=1&page_size=20", { headers: { authorization: `Bearer ${token}` } });
  assertStatus("list buildings", buildings.response.status, 200);
  assertUniformResponse("list buildings", buildings.body);
  const building = items(buildings.body)[0];
  assert(building?.id, "No building found for S3-C-A smoke");

  const floors = await request(`/floors?building_id=${building.id}&page=1&page_size=20`, {
    headers: { authorization: `Bearer ${token}` }
  });
  assertStatus("list floors", floors.response.status, 200);
  assertUniformResponse("list floors", floors.body);
  const floor = items(floors.body)[0];
  assert(floor?.id, "No floor found for S3-C-A smoke");
  return { building, floor };
}

async function createUnit(token, buildingId, floorId, label, rentalStatus = 10, area = 100, refPrice = 40) {
  const unitCode = `S3C-${stamp}-${label}-${Math.floor(Math.random() * 10000)}`;
  const created = await jsonRequest(
    "/park-units",
    token,
    "POST",
    {
      unitCode,
      buildingId,
      floorId,
      unitName: `S3C合同自测房源${label}`,
      usageType: 10,
      unitArea: area,
      useArea: area - 5,
      rentalStatus,
      fittingStatus: 20,
      refPrice,
      availableDate: "2026-06-01",
      status: 1,
      remark: smokeRemark
    },
    `create-unit-${label}`
  );
  assertStatus(`create unit ${label}`, created.response.status, 201);
  assertUniformResponse(`create unit ${label}`, created.body);
  return created.body.data;
}

async function createCrossParkUnit(buildingId, floorId) {
  const id = randomUUID();
  await dbExec(`
INSERT INTO biz_unit (
  id, tenant_id, park_id, unit_code, code, building_id, floor_id, unit_name, usage_type,
  unit_area, use_area, rental_status, fitting_status, ref_price, status, create_by, update_by, remark
) VALUES (
  ${sqlLiteral(id)}::uuid, ${sqlLiteral(tenantId)}, '29999999', ${sqlLiteral(`S3C-CROSS-${stamp}`)}, ${sqlLiteral(`S3C-CROSS-${stamp}`)},
  ${sqlLiteral(buildingId)}::uuid, ${sqlLiteral(floorId)}::uuid, 'S3C跨园区房源', 10, 80, 75, 10, 20, 35, 1,
  NULL, NULL, ${sqlLiteral(smokeRemark)}
);`);
  return id;
}

function contractPayload(parkTenantId, label, overrides = {}) {
  return {
    contract_name: `S3C合同${label}${stamp}`,
    contract_type: "10",
    park_tenant_id: parkTenantId,
    source_type: "manual",
    start_date: "2026-06-01",
    end_date: "2027-05-31",
    rent_unit_price: 40,
    deposit_months: 2,
    free_rent_months: 1,
    payment_period: "10",
    payment_advance_days: 15,
    property_fee_unit_price: 3,
    remark: smokeRemark,
    ...overrides
  };
}

async function createContract(token, parkTenantId, label, overrides = {}) {
  const created = await jsonRequest("/leasing/contracts", token, "POST", contractPayload(parkTenantId, label, overrides), `create-contract-${label}`);
  assertStatus(`create contract ${label}`, created.response.status, 201);
  assertUniformResponse(`create contract ${label}`, created.body);
  assert(created.body.data?.id, `created contract ${label} is missing id`);
  return created.body.data;
}

async function createParkTenant(token) {
  const creditCode = `913205${String(stamp).slice(-12)}`;
  const created = await jsonRequest(
    "/park-tenants",
    token,
    "POST",
    {
      companyName: `S3C合同租户企业${stamp}`,
      unifiedCreditCode: creditCode,
      legalPerson: "S3C法人",
      legalPersonId: "110101199001019999",
      contactName: "S3C联系人",
      contactMobile: uniqueMobile(2001),
      contactEmail: `s3c-tenant-${stamp}@example.com`,
      industryCode: "tech",
      tenantType: "10",
      riskLevel: "10",
      status: "20",
      sourceType: "manual",
      remark: smokeRemark
    },
    "create-park-tenant"
  );
  assertStatus("admin creates park tenant for contract", created.response.status, 201);
  assertUniformResponse("admin creates park tenant for contract", created.body);
  return created.body.data;
}

async function uploadContractFile(token, contractId, label, content) {
  const form = new FormData();
  form.set("biz_type", "leasing_contract");
  form.set("biz_id", contractId);
  form.set("remark", smokeRemark);
  form.set("file", new Blob([content], { type: "application/pdf" }), `${label}-${stamp}.pdf`);
  const uploaded = await formRequest("/files", token, form, `upload-${label}`);
  assertStatus(`upload ${label}`, uploaded.response.status, 201);
  assertUniformResponse(`upload ${label}`, uploaded.body);
  assert(uploaded.body.data?.id, `${label} upload missing id`);
  return uploaded.body.data;
}

async function waitForAuditLog({ bizType, bizId, action }) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const count = Number(await dbScalar(`
SELECT count(*) FROM sys_op_log
WHERE tenant_id = ${sqlLiteral(tenantId)}
  AND park_id = ${sqlLiteral(parkId)}
  AND (${bizType ? `biz_type = ${sqlLiteral(bizType)}` : "1 = 1"})
  AND (${bizId ? `biz_id = ${sqlLiteral(bizId)}::uuid` : "1 = 1"})
  AND (${action ? `action = ${sqlLiteral(action)}` : "1 = 1"})
  AND success = true
  AND is_deleted = false;`));
    if (count > 0) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 300));
  }
  throw new Error(`No sys_op_log found for ${bizType ?? "*"} ${bizId ?? "*"} ${action ?? "*"}`);
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
    const denied = await request("/leasing/contracts?page=1&page_size=1", {
      headers: { authorization: `Bearer ${token}`, "x-request-id": `s3c-module-denied-${randomUUID()}` }
    });
    assertStatus("leasing module disabled denies contract API", denied.response.status, 403);
  } finally {
    await dbExec(`
UPDATE rel_tenant_module
SET enabled = ${wasEnabled === "true" ? "true" : "false"}, status = ${sqlLiteral(previousStatus)}, update_time = now()
WHERE tenant_id = ${sqlLiteral(tenantId)}
  AND park_id = ${sqlLiteral(parkId)}
  AND module_id = (SELECT id FROM sys_module WHERE module_code = 'leasing' AND is_deleted = false LIMIT 1);`);
  }
}

async function assertNoReceivablesOrInvoices(contractId) {
  for (const table of ["biz_receivable", "biz_invoice"]) {
    const regclass = await dbScalar(`SELECT to_regclass(${sqlLiteral(`public.${table}`)});`);
    if (!regclass) {
      logStep(`${table} table not present; no ${table.replace("biz_", "")} generated`);
      continue;
    }
    const hasContractColumn = await dbScalar(`
SELECT count(*) FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = ${sqlLiteral(table)} AND column_name = 'contract_id';`);
    if (Number(hasContractColumn) === 0) {
      logStep(`${table} has no contract_id column; skipped contract linkage count`);
      continue;
    }
    const count = Number(await dbScalar(`SELECT count(*) FROM ${table} WHERE contract_id = ${sqlLiteral(contractId)}::uuid;`));
    assert(count === 0, `${table} should not be generated by S3-C-A contract effective flow`);
  }
}

async function main() {
  await ensureApiStarted();
  const usernames = await setupSmokeUsers();

  const adminLogin = await login(adminUser, adminPassword);
  assertStatus("admin login", adminLogin.response.status, 200);
  assertUniformResponse("admin login", adminLogin.body);
  const adminToken = adminLogin.body.data.accessToken;

  const normalLogin = await login(normalUser, normalPassword);
  assertStatus("normal login", normalLogin.response.status, 200);
  const normalToken = normalLogin.body.data.accessToken;

  const opsLogin = await login(usernames.OPERATIONS_OWNER, normalPassword);
  assertStatus("operations owner login", opsLogin.response.status, 200);
  const opsToken = opsLogin.body.data.accessToken;

  const specialistLogin = await login(usernames.INVEST_SPECIALIST, normalPassword);
  assertStatus("investment specialist login", specialistLogin.response.status, 200);
  const specialistToken = specialistLogin.body.data.accessToken;

  const financeLogin = await login(usernames.FINANCE_SPECIALIST, normalPassword);
  assertStatus("finance specialist login", financeLogin.response.status, 200);
  const financeToken = financeLogin.body.data.accessToken;

  const parkTenant = await createParkTenant(adminToken);
  const { building, floor } = await getFirstBuildingAndFloor(adminToken);
  const unitA = await createUnit(adminToken, building.id, floor.id, "A", 10, 100, 40);
  const unitB = await createUnit(adminToken, building.id, floor.id, "B", 20, 80, 50);
  const unitDelete = await createUnit(adminToken, building.id, floor.id, "DEL", 10, 30, 20);
  const unitMaintenance = await createUnit(adminToken, building.id, floor.id, "M", 50, 60, 20);
  const unitSelfUse = await createUnit(adminToken, building.id, floor.id, "S", 60, 60, 20);
  const quoteUnit = await createUnit(adminToken, building.id, floor.id, "Q", 10, 70, 33);
  const unconvertedQuoteUnit = await createUnit(adminToken, building.id, floor.id, "UQ", 10, 65, 31);
  const crossParkUnitId = await createCrossParkUnit(building.id, floor.id);

  const adminContract = await createContract(adminToken, parkTenant.id, "主流程");
  const opsContract = await createContract(opsToken, parkTenant.id, "运营负责人");

  const normalCreate = await jsonRequest("/leasing/contracts", normalToken, "POST", contractPayload(parkTenant.id, "无权限"), "normal-create-contract");
  assertStatus("normal user cannot create contract", normalCreate.response.status, 403);

  const badDate = await jsonRequest(
    "/leasing/contracts",
    adminToken,
    "POST",
    contractPayload(parkTenant.id, "坏日期", { start_date: "2027-06-01", end_date: "2026-05-31" }),
    "bad-date"
  );
  assertStatus("start_date greater than end_date rejected", badDate.response.status, 400);

  const missingTenantPayload = contractPayload(parkTenant.id, "缺少租户");
  delete missingTenantPayload.park_tenant_id;
  const missingTenant = await jsonRequest("/leasing/contracts", adminToken, "POST", missingTenantPayload, "missing-park-tenant");
  assertStatus("missing park_tenant_id rejected", missingTenant.response.status, 400);

  const editDraft = await jsonRequest(`/leasing/contracts/${adminContract.id}`, adminToken, "PUT", { remark: `${smokeRemark} edited` }, "edit-draft-contract");
  assertStatus("draft contract editable", editDraft.response.status, 200);
  assertUniformResponse("draft contract editable", editDraft.body);

  const noUnitSubmit = await jsonRequest(`/leasing/contracts/${opsContract.id}/submit`, opsToken, "POST", { opinion: "无房源提交测试" }, "submit-no-unit");
  assertStatus("contract without units cannot submit", noUnitSubmit.response.status, 400);

  const linkA = await jsonRequest(
    `/leasing/contracts/${adminContract.id}/units`,
    adminToken,
    "POST",
    { unit_id: unitA.id, area: 100, rent_unit_price: 40, remark: smokeRemark },
    "link-unit-a"
  );
  assertStatus("contract links one unit", linkA.response.status, 201);
  assertUniformResponse("contract links one unit", linkA.body);

  const linkB = await jsonRequest(
    `/leasing/contracts/${adminContract.id}/units`,
    adminToken,
    "POST",
    { unit_id: unitB.id, area: 80, rent_unit_price: 50, remark: smokeRemark },
    "link-unit-b"
  );
  assertStatus("contract links multiple units", linkB.response.status, 201);
  assertUniformResponse("contract links multiple units", linkB.body);

  const deleteContract = await createContract(adminToken, parkTenant.id, "删除房源关联");
  const deleteLink = await jsonRequest(
    `/leasing/contracts/${deleteContract.id}/units`,
    adminToken,
    "POST",
    { unit_id: unitDelete.id, area: 30, rent_unit_price: 20, remark: smokeRemark },
    "link-delete-unit"
  );
  assertStatus("contract unit link for deletion", deleteLink.response.status, 201);
  const deletedLink = await jsonRequest(`/leasing/contracts/${deleteContract.id}/units/${deleteLink.body.data.id}`, adminToken, "DELETE", {}, "delete-unit-link");
  assertStatus("contract unit soft delete", deletedLink.response.status, 200);
  const deletedRelationFlag = await dbScalar(`SELECT is_deleted::text FROM rel_leasing_contract_unit WHERE id = ${sqlLiteral(deleteLink.body.data.id)}::uuid;`);
  assert(deletedRelationFlag === "true", "contract unit relation was not soft deleted");

  const crossParkLink = await jsonRequest(
    `/leasing/contracts/${adminContract.id}/units`,
    adminToken,
    "POST",
    { unit_id: crossParkUnitId, area: 80, rent_unit_price: 35 },
    "cross-park-unit"
  );
  assertStatus("cross-park unit cannot be linked", crossParkLink.response.status, [400, 404]);

  const maintenanceLink = await jsonRequest(
    `/leasing/contracts/${adminContract.id}/units`,
    adminToken,
    "POST",
    { unit_id: unitMaintenance.id, area: 60, rent_unit_price: 20 },
    "maintenance-unit"
  );
  assertStatus("maintenance unit cannot be linked by default", maintenanceLink.response.status, 400);

  const selfUseLink = await jsonRequest(
    `/leasing/contracts/${adminContract.id}/units`,
    adminToken,
    "POST",
    { unit_id: unitSelfUse.id, area: 60, rent_unit_price: 20 },
    "self-use-unit"
  );
  assertStatus("self-use unit cannot be linked by default", selfUseLink.response.status, 400);

  const recalculated = await jsonRequest(`/leasing/contracts/${adminContract.id}/recalculate`, adminToken, "POST", {}, "recalculate");
  assertStatus("contract recalculates amount", recalculated.response.status, 201);
  assertUniformResponse("contract recalculates amount", recalculated.body);
  assertClose("total area", recalculated.body.data.totalArea, 180);
  assertClose("rent per month", recalculated.body.data.rentPerMonth, 8000);
  assertClose("deposit amount", recalculated.body.data.depositAmount, 16000);
  assertClose("total amount", recalculated.body.data.totalAmount, 88000);

  const financeDetail = await request(`/leasing/contracts/${adminContract.id}`, { headers: { authorization: `Bearer ${financeToken}` } });
  assertStatus("field policy user reads contract detail", financeDetail.response.status, 200);
  assertUniformResponse("field policy user reads contract detail", financeDetail.body);
  assert(financeDetail.body.data.totalAmount === "***", "totalAmount was not masked by contract field policy");
  assert(financeDetail.body.data.rentPerMonth === "***", "rentPerMonth was not masked by contract field policy");
  assert(financeDetail.body.data.depositAmount === "***", "depositAmount was not masked by contract field policy");

  const specialistAdminList = await request(`/leasing/contracts?keyword=${encodeURIComponent(adminContract.contractCode)}&page=1&page_size=10`, {
    headers: { authorization: `Bearer ${specialistToken}` }
  });
  assertStatus("specialist lists contracts with data scope", specialistAdminList.response.status, 200);
  assertUniformResponse("specialist lists contracts with data scope", specialistAdminList.body);
  assert(!specialistAdminList.body.data.items.some((item) => item.id === adminContract.id), "specialist should not see admin-created contract");

  const specialistOwn = await createContract(specialistToken, parkTenant.id, "专员本人");
  const specialistOwnList = await request(`/leasing/contracts?keyword=${encodeURIComponent(specialistOwn.contractCode)}&page=1&page_size=10`, {
    headers: { authorization: `Bearer ${specialistToken}` }
  });
  assertStatus("specialist sees own contract", specialistOwnList.response.status, 200);
  assert(specialistOwnList.body.data.items.some((item) => item.id === specialistOwn.id), "specialist should see own contract");

  const submitted = await jsonRequest(`/leasing/contracts/${adminContract.id}/submit`, adminToken, "POST", { opinion: "提交审批" }, "submit-main");
  assertStatus("draft contract submits for approval", submitted.response.status, 201);
  assertUniformResponse("draft contract submits for approval", submitted.body);
  assert(submitted.body.data.status === "30", "submitted contract should enter approving status 30");

  const editAfterSubmit = await jsonRequest(`/leasing/contracts/${adminContract.id}`, adminToken, "PUT", { rent_unit_price: 99 }, "edit-after-submit");
  assertStatus("non-draft core fields cannot be edited", editAfterSubmit.response.status, 400);

  const rejectContract = await createContract(adminToken, parkTenant.id, "驳回");
  const rejectUnit = await createUnit(adminToken, building.id, floor.id, "RJ", 10, 40, 25);
  await jsonRequest(`/leasing/contracts/${rejectContract.id}/units`, adminToken, "POST", { unit_id: rejectUnit.id, area: 40, rent_unit_price: 25 }, "reject-link");
  await jsonRequest(`/leasing/contracts/${rejectContract.id}/submit`, adminToken, "POST", { opinion: "提交驳回测试" }, "reject-submit");
  const rejectMissingReason = await jsonRequest(`/leasing/contracts/${rejectContract.id}/reject`, adminToken, "POST", { opinion: "缺少原因" }, "reject-missing");
  assertStatus("reject reason is required", rejectMissingReason.response.status, 400);
  const rejected = await jsonRequest(
    `/leasing/contracts/${rejectContract.id}/reject`,
    adminToken,
    "POST",
    { opinion: "驳回", reject_reason: "租期需要修改" },
    "reject-contract"
  );
  assertStatus("contract can be rejected", rejected.response.status, 201);
  assert(rejected.body.data.status === "50", "rejected contract should enter status 50");

  const approved = await jsonRequest(`/leasing/contracts/${adminContract.id}/approve`, adminToken, "POST", { opinion: "同意" }, "approve-main");
  assertStatus("contract approve enters pending sign", approved.response.status, 201);
  assertUniformResponse("contract approve enters pending sign", approved.body);
  assert(approved.body.data.status === "60", "approved contract should enter pending sign status 60");

  const approveRecordCount = Number(await dbScalar(`
SELECT jsonb_array_length(approve_records) FROM biz_leasing_contract
WHERE id = ${sqlLiteral(adminContract.id)}::uuid AND tenant_id = ${sqlLiteral(tenantId)} AND park_id = ${sqlLiteral(parkId)};`));
  assert(approveRecordCount >= 2, "approve_records should contain submit and approve records");

  const statusLogActions = await dbScalar(`
SELECT string_agg(action, ',' ORDER BY action)
FROM biz_leasing_contract_status_log
WHERE contract_id = ${sqlLiteral(adminContract.id)}::uuid
  AND tenant_id = ${sqlLiteral(tenantId)}
  AND park_id = ${sqlLiteral(parkId)}
  AND is_deleted = false;`);
  assert(statusLogActions.includes("submit") && statusLogActions.includes("approve"), "contract status logs missing submit or approve");
  await waitForAuditLog({ bizType: "biz_leasing_contract", bizId: adminContract.id });

  const unsignedEffective = await jsonRequest(`/leasing/contracts/${rejectContract.id}/effective`, adminToken, "POST", { effective_date: "2026-06-01" }, "unsigned-effective");
  assertStatus("unsigned contract cannot become effective", unsignedEffective.response.status, 400);

  const contractPdf = await uploadContractFile(adminToken, adminContract.id, "contract-pdf", `S3C contract pdf ${stamp}`);
  const scanPdf = await uploadContractFile(adminToken, adminContract.id, "scan-pdf", `S3C scan pdf ${stamp}`);
  const archived = await jsonRequest(
    `/leasing/contracts/${adminContract.id}/archive`,
    adminToken,
    "POST",
    {
      contract_pdf_file_id: contractPdf.id,
      scan_pdf_file_id: scanPdf.id,
      sign_date: "2026-06-01",
      effective_date: "2026-06-01",
      remark: "合同已线下盖章"
    },
    "archive-main"
  );
  assertStatus("pending sign contract archives", archived.response.status, 201);
  assertUniformResponse("pending sign contract archives", archived.body);
  assert(archived.body.data.status === "70", "archived contract should enter signed status 70");

  const files = await request(`/leasing/contracts/${adminContract.id}/files`, { headers: { authorization: `Bearer ${adminToken}` } });
  assertStatus("contract files list", files.response.status, 200);
  assertUniformResponse("contract files list", files.body);
  assert(files.body.data.some((file) => file.id === contractPdf.id), "contract pdf file missing from contract file list");

  const downloaded = await request(`/files/${contractPdf.id}/download`, {
    headers: { authorization: `Bearer ${adminToken}`, "x-request-id": `s3c-file-download-${randomUUID()}` }
  });
  assertStatus("contract file download", downloaded.response.status, 200);
  assert(String(downloaded.body).includes("S3C contract pdf"), "downloaded contract file content mismatch");
  await waitForAuditLog({ bizType: "leasing_contract", bizId: adminContract.id, action: "download" });

  const effective = await jsonRequest(
    `/leasing/contracts/${adminContract.id}/effective`,
    adminToken,
    "POST",
    { effective_date: "2026-06-01", opinion: "合同已生效" },
    "effective-main"
  );
  assertStatus("signed contract becomes effective", effective.response.status, 201);
  assertUniformResponse("signed contract becomes effective", effective.body);
  assert(effective.body.data.status === "75", "effective contract should enter status 75");

  const rentedCount = Number(await dbScalar(`
SELECT count(*) FROM biz_unit
WHERE id IN (${sqlLiteral(unitA.id)}::uuid, ${sqlLiteral(unitB.id)}::uuid)
  AND tenant_id = ${sqlLiteral(tenantId)}
  AND park_id = ${sqlLiteral(parkId)}
  AND rental_status = 30
  AND is_deleted = false;`));
  assert(rentedCount === 2, "effective contract should update linked units to rented");
  const unitStatusLogCount = Number(await dbScalar(`
SELECT count(*) FROM biz_unit_status_log
WHERE unit_id IN (${sqlLiteral(unitA.id)}::uuid, ${sqlLiteral(unitB.id)}::uuid)
  AND source_type = 'contract'
  AND after_status = 30
  AND is_deleted = false;`));
  assert(unitStatusLogCount >= 2, "contract effective should create unit status logs");

  const duplicateContract = await createContract(adminToken, parkTenant.id, "重复占用");
  const duplicateLink = await jsonRequest(
    `/leasing/contracts/${duplicateContract.id}/units`,
    adminToken,
    "POST",
    { unit_id: unitA.id, area: 100, rent_unit_price: 40 },
    "duplicate-occupied"
  );
  assertStatus("occupied unit cannot be linked to another contract", duplicateLink.response.status, [400, 409]);

  await assertNoReceivablesOrInvoices(adminContract.id);

  const tenant360 = await request(`/park-tenants/${parkTenant.id}/360`, { headers: { authorization: `Bearer ${adminToken}` } });
  assertStatus("tenant 360 includes real contracts", tenant360.response.status, 200);
  assertUniformResponse("tenant 360 includes real contracts", tenant360.body);
  assert(tenant360.body.data.contracts.available === true, "tenant 360 contracts should be available");
  assert(tenant360.body.data.contracts.items.some((item) => item.id === adminContract.id), "tenant 360 should include real contract list");
  assert(tenant360.body.data.contracts.summary.active_contract_count >= 1, "tenant 360 active contract count should include effective contract");
  assert(tenant360.body.data.receivables.available === true, "tenant 360 receivables should be available after S3-D-A");
  assert(Array.isArray(tenant360.body.data.receivables.recent_items), "tenant 360 receivables should expose a real receivable list");

  const leadWithTenant = await jsonRequest(
    "/leasing/leads",
    adminToken,
    "POST",
    {
      customerName: `S3C报价客户${stamp}`,
      contactName: "S3C报价联系人",
      contactMobile: uniqueMobile(3001),
      source: "20",
      industryCode: "tech",
      demandArea: 70,
      demandPrice: 5000,
      intentionLevel: "10",
      parkTenantId: parkTenant.id,
      remark: smokeRemark
    },
    "create-lead-with-tenant"
  );
  assertStatus("create lead with park tenant", leadWithTenant.response.status, 201);

  const quote = await jsonRequest(
    `/leasing/leads/${leadWithTenant.body.data.id}/quotes`,
    adminToken,
    "POST",
    {
      unitId: quoteUnit.id,
      quotePrice: 33,
      freeRentMonths: 1,
      depositMonths: 2,
      paymentPeriod: "10",
      propertyFeePrice: 3,
      remark: smokeRemark
    },
    "create-quote"
  );
  assertStatus("create quote", quote.response.status, 201);

  const draftBeforeApproval = await jsonRequest(
    `/leasing/quotes/${quote.body.data.id}/create-contract-draft`,
    adminToken,
    "POST",
    { start_date: "2026-06-01", end_date: "2027-05-31" },
    "quote-draft-before-approval"
  );
  assertStatus("unapproved quote cannot create contract draft", draftBeforeApproval.response.status, 400);

  await jsonRequest(`/leasing/quotes/${quote.body.data.id}/submit`, adminToken, "POST", { opinion: "提交报价" }, "submit-quote");
  const approvedQuote = await jsonRequest(`/leasing/quotes/${quote.body.data.id}/approve`, adminToken, "POST", { opinion: "报价通过" }, "approve-quote");
  assertStatus("quote approved", approvedQuote.response.status, 201);
  assert(approvedQuote.body.data.quoteStatus === "40", "quote should be approved with status 40");

  const quoteDraft = await jsonRequest(
    `/leasing/quotes/${quote.body.data.id}/create-contract-draft`,
    adminToken,
    "POST",
    { contract_name: `S3C报价转合同${stamp}`, start_date: "2026-06-01", end_date: "2027-05-31", payment_advance_days: 15 },
    "quote-draft"
  );
  assertStatus("approved quote creates contract draft", quoteDraft.response.status, 201);
  assertUniformResponse("approved quote creates contract draft", quoteDraft.body);
  assert(quoteDraft.body.data.sourceQuoteId === quote.body.data.id, "quote draft source_quote_id mismatch");
  assert(quoteDraft.body.data.sourceLeadId === leadWithTenant.body.data.id, "quote draft source_lead_id mismatch");
  assert(quoteDraft.body.data.parkTenantId === parkTenant.id, "quote draft park_tenant_id mismatch");
  const quoteDraftUnitCount = Number(await dbScalar(`
SELECT count(*) FROM rel_leasing_contract_unit
WHERE contract_id = ${sqlLiteral(quoteDraft.body.data.id)}::uuid
  AND unit_id = ${sqlLiteral(quoteUnit.id)}::uuid
  AND is_deleted = false;`));
  assert(quoteDraftUnitCount === 1, "quote draft should automatically link quote unit");

  const duplicateQuoteDraft = await jsonRequest(
    `/leasing/quotes/${quote.body.data.id}/create-contract-draft`,
    adminToken,
    "POST",
    { start_date: "2026-06-01", end_date: "2027-05-31" },
    "duplicate-quote-draft"
  );
  assertStatus("same quote cannot create duplicate contract draft", duplicateQuoteDraft.response.status, 409);

  const unconvertedLead = await jsonRequest(
    "/leasing/leads",
    adminToken,
    "POST",
    {
      customerName: `S3C未转企业客户${stamp}`,
      contactName: "S3C未转联系人",
      contactMobile: uniqueMobile(3002),
      source: "20",
      industryCode: "tech",
      demandArea: 65,
      demandPrice: 4800,
      intentionLevel: "10",
      remark: smokeRemark
    },
    "create-unconverted-lead"
  );
  assertStatus("create unconverted lead", unconvertedLead.response.status, 201);
  const unconvertedQuote = await jsonRequest(
    `/leasing/leads/${unconvertedLead.body.data.id}/quotes`,
    adminToken,
    "POST",
    { unitId: unconvertedQuoteUnit.id, quotePrice: 31, depositMonths: 2, freeRentMonths: 0, paymentPeriod: "10", remark: smokeRemark },
    "create-unconverted-quote"
  );
  assertStatus("create unconverted quote", unconvertedQuote.response.status, 201);
  await jsonRequest(`/leasing/quotes/${unconvertedQuote.body.data.id}/submit`, adminToken, "POST", { opinion: "提交报价" }, "submit-unconverted-quote");
  await jsonRequest(`/leasing/quotes/${unconvertedQuote.body.data.id}/approve`, adminToken, "POST", { opinion: "报价通过" }, "approve-unconverted-quote");
  const unconvertedDraft = await jsonRequest(
    `/leasing/quotes/${unconvertedQuote.body.data.id}/create-contract-draft`,
    adminToken,
    "POST",
    { start_date: "2026-06-01", end_date: "2027-05-31" },
    "unconverted-quote-draft"
  );
  assertStatus("unconverted lead quote cannot create contract draft", unconvertedDraft.response.status, 400);

  await withLeasingDisabled(adminToken);
  logStep("S3-C-A contract smoke passed");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    if (apiProcess?.pid) {
      try {
        process.kill(-apiProcess.pid, "SIGTERM");
      } catch {
        apiProcess.kill("SIGTERM");
      }
    }
  });
