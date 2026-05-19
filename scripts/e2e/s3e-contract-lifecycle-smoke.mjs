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
const stamp = Date.now();
const smokeRemark = `S3E contract lifecycle smoke ${stamp}`;

let apiProcess = null;

function getPnpmBin() {
  if (process.env.PNPM_BIN) return process.env.PNPM_BIN;
  const bundled = resolve(rootDir, ".tools/pnpm");
  return existsSync(bundled) ? bundled : "pnpm";
}

function logStep(message) {
  console.log(`[s3e-contract-lifecycle-smoke] ${message}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertStatus(name, actual, expected, body) {
  const allowed = Array.isArray(expected) ? expected : [expected];
  if (!allowed.includes(actual)) {
    throw new Error(`${name} expected HTTP ${allowed.join(" or ")}, got ${actual}: ${JSON.stringify(body)}`);
  }
  logStep(`${name}: HTTP ${actual}`);
}

function assertUniformResponse(name, body) {
  assert(body && typeof body === "object", `${name} did not return JSON`);
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

function valueOf(record, snakeKey, camelKey = snakeKey) {
  return record?.[snakeKey] ?? record?.[camelKey];
}

async function request(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, options);
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json") ? await response.json().catch(() => null) : await response.text();
  return { response, body };
}

async function jsonRequest(path, token, method, body, label = "request") {
  const safeLabel = String(label).replace(/[^a-zA-Z0-9_.-]/g, "-");
  return request(path, {
    method,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      "x-idempotency-key": `s3e-${stamp}-${safeLabel}-${randomUUID()}`
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

async function login(username, password) {
  return request("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-request-id": `s3e-login-${randomUUID()}` },
    body: JSON.stringify({ tenantId, parkId, username, password })
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
  logStep("API not reachable, starting @jinhu/api for S3-E-A smoke test");
  apiProcess = spawn(getPnpmBin(), ["--filter", "@jinhu/api", "start"], {
    cwd: rootDir,
    detached: true,
    stdio: "ignore",
    env: { ...process.env }
  });
  apiProcess.unref();
  await waitForApi();
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
  await dbScalar(`
UPDATE rel_tenant_module
SET enabled = false, status = 'disabled', update_time = now()
WHERE tenant_id = ${sqlLiteral(tenantId)}
  AND park_id = ${sqlLiteral(parkId)}
  AND module_id = (SELECT id FROM sys_module WHERE module_code = 'leasing' AND is_deleted = false LIMIT 1);`);
  try {
    const denied = await request("/leasing/checkouts?page=1&page_size=1", {
      headers: { authorization: `Bearer ${token}`, "x-request-id": `s3e-module-denied-${randomUUID()}` }
    });
    assertStatus("leasing module disabled denies S3-E-A API", denied.response.status, 403, denied.body);
  } finally {
    await dbScalar(`
UPDATE rel_tenant_module
SET enabled = ${wasEnabled === "true" ? "true" : "false"}, status = ${sqlLiteral(previousStatus)}, update_time = now()
WHERE tenant_id = ${sqlLiteral(tenantId)}
  AND park_id = ${sqlLiteral(parkId)}
  AND module_id = (SELECT id FROM sys_module WHERE module_code = 'leasing' AND is_deleted = false LIMIT 1);`);
  }
}

async function setupScenario(adminUserId) {
  const ids = {
    parkTenantId: randomUUID(),
    unitId: randomUUID(),
    contractId: randomUUID(),
    relationId: randomUUID(),
    unpaidReceivableId: randomUUID(),
    paidReceivableId: randomUUID(),
    invoicedReceivableId: randomUUID()
  };
  const buildingFloor = await dbScalar(`
SELECT building.id::text || '|' || floor.id::text
FROM biz_building building
JOIN biz_floor floor
  ON floor.building_id = building.id
 AND floor.tenant_id = building.tenant_id
 AND floor.park_id = building.park_id
 AND floor.is_deleted = false
WHERE building.tenant_id = ${sqlLiteral(tenantId)}
  AND building.park_id = ${sqlLiteral(parkId)}
  AND building.is_deleted = false
ORDER BY building.create_time ASC, floor.create_time ASC
LIMIT 1;`);
  assert(buildingFloor, "No building/floor pair found for S3-E-A smoke setup");
  const [buildingId, floorId] = buildingFloor.split("|");

  const tenantCode = `S3E-T-${stamp}`;
  const unitCode = `S3E-U-${stamp}`;
  const contractCode = `S3E-C-${stamp}`;
  await dbExec(`
INSERT INTO biz_park_tenant (
  id, tenant_id, park_id, code, park_tenant_code, company_name, unified_credit_code,
  legal_person, contact_name, contact_mobile, industry_code, tenant_type, risk_level,
  status, source_type, create_by, update_by, remark
) VALUES (
  ${sqlLiteral(ids.parkTenantId)}, ${sqlLiteral(tenantId)}, ${sqlLiteral(parkId)}, ${sqlLiteral(tenantCode)}, ${sqlLiteral(tenantCode)},
  ${sqlLiteral(`S3E合同生命周期客户${stamp}`)}, ${sqlLiteral(`S3E${stamp}`)},
  ${sqlLiteral("S3E法人")}, ${sqlLiteral("S3E联系人")}, ${sqlLiteral("13920090001")},
  ${sqlLiteral("tech")}, ${sqlLiteral("10")}, ${sqlLiteral("10")},
  ${sqlLiteral("20")}, ${sqlLiteral("manual")}, ${sqlLiteral(adminUserId)}, ${sqlLiteral(adminUserId)}, ${sqlLiteral(smokeRemark)}
);

INSERT INTO biz_unit (
  id, tenant_id, park_id, unit_code, code, building_id, floor_id, unit_name,
  usage_type, unit_area, use_area, rental_status, fitting_status, ref_price, status,
  create_by, update_by, remark
) VALUES (
  ${sqlLiteral(ids.unitId)}, ${sqlLiteral(tenantId)}, ${sqlLiteral(parkId)}, ${sqlLiteral(unitCode)}, ${sqlLiteral(unitCode)},
  ${sqlLiteral(buildingId)}, ${sqlLiteral(floorId)}, ${sqlLiteral(`S3E退租房源${stamp}`)},
  10, 100.00, 100.00, 30, 30, 10.00, 1,
  ${sqlLiteral(adminUserId)}, ${sqlLiteral(adminUserId)}, ${sqlLiteral(smokeRemark)}
);

INSERT INTO biz_leasing_contract (
  id, tenant_id, park_id, code, contract_code, contract_name, contract_type,
  park_tenant_id, source_type, start_date, end_date, sign_date, effective_date,
  rent_unit_price, total_area, rent_per_month, total_amount, deposit_months, deposit_amount,
  free_rent_months, payment_period, payment_advance_days, property_fee_unit_price,
  status, approve_records, other_fee_rules, create_by, update_by, remark
) VALUES (
  ${sqlLiteral(ids.contractId)}, ${sqlLiteral(tenantId)}, ${sqlLiteral(parkId)}, ${sqlLiteral(contractCode)}, ${sqlLiteral(contractCode)},
  ${sqlLiteral(`S3E合同生命周期测试${stamp}`)}, ${sqlLiteral("10")},
  ${sqlLiteral(ids.parkTenantId)}, ${sqlLiteral("manual")}, '2026-01-01', '2026-12-31', '2026-01-01', '2026-01-01',
  10.00, 100.00, 1000.00, 12000.00, 2.00, 2000.00,
  0.00, ${sqlLiteral("10")}, 0, 1.00,
  ${sqlLiteral("75")}, '[]'::jsonb, '[]'::jsonb, ${sqlLiteral(adminUserId)}, ${sqlLiteral(adminUserId)}, ${sqlLiteral(smokeRemark)}
);

INSERT INTO rel_leasing_contract_unit (
  id, tenant_id, park_id, contract_id, unit_id, unit_code, unit_name, area,
  rent_unit_price, rent_amount_per_month, start_date, end_date, status,
  create_by, update_by, remark
) VALUES (
  ${sqlLiteral(ids.relationId)}, ${sqlLiteral(tenantId)}, ${sqlLiteral(parkId)}, ${sqlLiteral(ids.contractId)}, ${sqlLiteral(ids.unitId)},
  ${sqlLiteral(unitCode)}, ${sqlLiteral(`S3E退租房源${stamp}`)}, 100.00,
  10.00, 1000.00, '2026-01-01', '2026-12-31', 1,
  ${sqlLiteral(adminUserId)}, ${sqlLiteral(adminUserId)}, ${sqlLiteral(smokeRemark)}
);

INSERT INTO biz_leasing_receivable (
  id, tenant_id, park_id, code, ar_code, contract_id, park_tenant_id,
  fee_type, period_start, period_end, due_date, amount_due, amount_paid,
  amount_waived, amount_remain, late_fee, invoice_status, overdue_days,
  status, source_type, source_id, generate_batch_no, create_by, update_by, remark
) VALUES
  (
    ${sqlLiteral(ids.unpaidReceivableId)}, ${sqlLiteral(tenantId)}, ${sqlLiteral(parkId)}, ${sqlLiteral(`S3E-AR-U-${stamp}`)}, ${sqlLiteral(`S3E-AR-U-${stamp}`)},
    ${sqlLiteral(ids.contractId)}, ${sqlLiteral(ids.parkTenantId)}, ${sqlLiteral("10")},
    '2026-08-01', '2026-08-31', '2026-08-01', 1000.00, 0.00,
    0.00, 1000.00, 0.00, ${sqlLiteral("10")}, 0,
    ${sqlLiteral("20")}, ${sqlLiteral("contract")}, ${sqlLiteral(ids.contractId)}, ${sqlLiteral(`S3E-BATCH-${stamp}`)},
    ${sqlLiteral(adminUserId)}, ${sqlLiteral(adminUserId)}, ${sqlLiteral(smokeRemark)}
  ),
  (
    ${sqlLiteral(ids.paidReceivableId)}, ${sqlLiteral(tenantId)}, ${sqlLiteral(parkId)}, ${sqlLiteral(`S3E-AR-P-${stamp}`)}, ${sqlLiteral(`S3E-AR-P-${stamp}`)},
    ${sqlLiteral(ids.contractId)}, ${sqlLiteral(ids.parkTenantId)}, ${sqlLiteral("10")},
    '2026-09-01', '2026-09-30', '2026-09-01', 1000.00, 200.00,
    0.00, 800.00, 0.00, ${sqlLiteral("10")}, 0,
    ${sqlLiteral("40")}, ${sqlLiteral("contract")}, ${sqlLiteral(ids.contractId)}, ${sqlLiteral(`S3E-BATCH-${stamp}`)},
    ${sqlLiteral(adminUserId)}, ${sqlLiteral(adminUserId)}, ${sqlLiteral(smokeRemark)}
  ),
  (
    ${sqlLiteral(ids.invoicedReceivableId)}, ${sqlLiteral(tenantId)}, ${sqlLiteral(parkId)}, ${sqlLiteral(`S3E-AR-I-${stamp}`)}, ${sqlLiteral(`S3E-AR-I-${stamp}`)},
    ${sqlLiteral(ids.contractId)}, ${sqlLiteral(ids.parkTenantId)}, ${sqlLiteral("10")},
    '2026-10-01', '2026-10-31', '2026-10-01', 1000.00, 0.00,
    0.00, 1000.00, 0.00, ${sqlLiteral("30")}, 0,
    ${sqlLiteral("30")}, ${sqlLiteral("contract")}, ${sqlLiteral(ids.contractId)}, ${sqlLiteral(`S3E-BATCH-${stamp}`)},
    ${sqlLiteral(adminUserId)}, ${sqlLiteral(adminUserId)}, ${sqlLiteral(smokeRemark)}
  );
`);

  return ids;
}

async function main() {
  await ensureApiStarted();
  const adminLogin = await login(adminUser, adminPassword);
  assertStatus("admin login", adminLogin.response.status, 200, adminLogin.body);
  assertUniformResponse("admin login", adminLogin.body);
  const adminToken = adminLogin.body.data.accessToken;
  const adminUserId = await dbScalar(`
SELECT id::text FROM sys_user
WHERE tenant_id = ${sqlLiteral(tenantId)}
  AND park_id = ${sqlLiteral(parkId)}
  AND username = ${sqlLiteral(adminUser)}
  AND is_deleted = false
LIMIT 1;`);
  assert(adminUserId, "admin user id not found");
  const ids = await setupScenario(adminUserId);

  const createChange = await jsonRequest(`/leasing/contracts/${ids.contractId}/changes`, adminToken, "POST", {
    change_type: "amount_change",
    change_reason: "S3E smoke rent adjustment",
    effective_date: "2026-07-01",
    after_snapshot: {
      rent_unit_price: "12.00",
      rent_per_month: "1200.00",
      deposit_amount: "2400.00",
      property_fee_unit_price: "1.20"
    },
    receivable_policy: "adjust_future",
    remark: smokeRemark
  }, "change-create");
  assertStatus("create contract change", createChange.response.status, 201, createChange.body);
  assertUniformResponse("create contract change", createChange.body);
  const change = createChange.body.data;
  const beforeSnapshot = valueOf(change, "before_snapshot", "beforeSnapshot");
  assertClose("before snapshot rent_per_month", beforeSnapshot?.rent_per_month, 1000);

  const contractBeforeEffective = await request(`/leasing/contracts/${ids.contractId}`, {
    headers: { authorization: `Bearer ${adminToken}` }
  });
  assertStatus("contract unchanged before change effective", contractBeforeEffective.response.status, 200, contractBeforeEffective.body);
  assertClose("contract rent_per_month remains unchanged", valueOf(contractBeforeEffective.body.data, "rent_per_month", "rentPerMonth"), 1000);

  const preview = await jsonRequest(`/leasing/contract-changes/${change.id}/preview-finance-impact`, adminToken, "POST", undefined, "change-preview");
  assertStatus("preview contract change finance impact", preview.response.status, [200, 201], preview.body);
  assertUniformResponse("preview contract change finance impact", preview.body);
  assert(preview.body.data.affected_receivables?.length >= 1, "finance impact should include adjustable receivables");
  assert(preview.body.data.blocked_receivables?.length >= 2, "finance impact should block paid or invoiced receivables");

  for (const [path, label] of [
    [`/leasing/contract-changes/${change.id}/submit`, "submit contract change"],
    [`/leasing/contract-changes/${change.id}/approve`, "approve contract change"],
    [`/leasing/contract-changes/${change.id}/effective`, "effective contract change"]
  ]) {
    const result = await jsonRequest(path, adminToken, "POST", { opinion: label }, label);
    assertStatus(label, result.response.status, [200, 201], result.body);
    assertUniformResponse(label, result.body);
  }

  const contractAfterChange = await request(`/leasing/contracts/${ids.contractId}`, {
    headers: { authorization: `Bearer ${adminToken}` }
  });
  assertStatus("contract after change effective", contractAfterChange.response.status, 200, contractAfterChange.body);
  assertClose("contract rent_per_month updated", valueOf(contractAfterChange.body.data, "rent_per_month", "rentPerMonth"), 1200);

  const receivableAmounts = await dbScalar(`
SELECT string_agg(id::text || ':' || amount_due::text || ':' || amount_remain::text || ':' || status, ',' ORDER BY period_start)
FROM biz_leasing_receivable
WHERE id IN (${sqlLiteral(ids.unpaidReceivableId)}, ${sqlLiteral(ids.paidReceivableId)}, ${sqlLiteral(ids.invoicedReceivableId)});`);
  assert(receivableAmounts.includes(`${ids.unpaidReceivableId}:1200.00:1200.00`), "future unpaid receivable should be adjusted");
  assert(receivableAmounts.includes(`${ids.paidReceivableId}:1000.00:800.00`), "paid receivable should not be adjusted");
  assert(receivableAmounts.includes(`${ids.invoicedReceivableId}:1000.00:1000.00`), "invoiced receivable should not be adjusted");

  const renewalConflict = await jsonRequest(`/leasing/contracts/${ids.contractId}/renew-draft`, adminToken, "POST", {
    contract_name: `S3E冲突续租${stamp}`,
    start_date: "2026-12-01",
    end_date: "2027-12-31"
  }, "renew-conflict");
  assertStatus("renewal overlapping term rejected", renewalConflict.response.status, 400, renewalConflict.body);

  const renewal = await jsonRequest(`/leasing/contracts/${ids.contractId}/renew-draft`, adminToken, "POST", {
    contract_name: `S3E续租草稿${stamp}`,
    start_date: "2027-01-01",
    end_date: "2027-12-31",
    rent_unit_price: 13,
    deposit_months: 2,
    free_rent_months: 0,
    payment_period: "10",
    payment_advance_days: 0
  }, "renew-draft");
  assertStatus("create renewal draft", renewal.response.status, 201, renewal.body);
  assertUniformResponse("create renewal draft", renewal.body);
  assert(valueOf(renewal.body.data, "source_type", "sourceType") === "renewal", "renewal draft source_type should be renewal");
  assert(valueOf(renewal.body.data, "renewal_from_contract_id", "renewalFromContractId") === ids.contractId, "renewal draft should link original contract");
  assertClose("renewal rent per month", valueOf(renewal.body.data, "rent_per_month", "rentPerMonth"), 1300);

  const renewFromDraft = await jsonRequest(`/leasing/contracts/${renewal.body.data.id}/renew-draft`, adminToken, "POST", {
    contract_name: `S3E未生效续租${stamp}`,
    start_date: "2028-01-01",
    end_date: "2028-12-31"
  }, "renew-from-draft");
  assertStatus("non-effective contract renewal rejected", renewFromDraft.response.status, 400, renewFromDraft.body);

  const checkout = await jsonRequest(`/leasing/contracts/${ids.contractId}/checkouts`, adminToken, "POST", {
    checkout_type: "early",
    planned_checkout_date: "2026-07-31",
    actual_checkout_date: "2026-07-31",
    reason: "S3E smoke checkout",
    release_unit_status: "rentable",
    remark: smokeRemark
  }, "checkout-create");
  assertStatus("create checkout", checkout.response.status, 201, checkout.body);
  assertUniformResponse("create checkout", checkout.body);
  const checkoutId = checkout.body.data.id;

  const duplicateCheckout = await jsonRequest(`/leasing/contracts/${ids.contractId}/checkouts`, adminToken, "POST", {
    checkout_type: "early",
    planned_checkout_date: "2026-08-31",
    reason: "S3E duplicate checkout",
    release_unit_status: "rentable"
  }, "checkout-duplicate");
  assertStatus("duplicate unfinished checkout rejected", duplicateCheckout.response.status, [400, 409], duplicateCheckout.body);

  const checkoutFromDraft = await jsonRequest(`/leasing/contracts/${renewal.body.data.id}/checkouts`, adminToken, "POST", {
    checkout_type: "early",
    planned_checkout_date: "2027-08-31",
    reason: "S3E draft checkout",
    release_unit_status: "rentable"
  }, "checkout-from-draft");
  assertStatus("non-effective contract checkout rejected", checkoutFromDraft.response.status, 400, checkoutFromDraft.body);

  for (const [path, label] of [
    [`/leasing/checkouts/${checkoutId}/submit`, "submit checkout"],
    [`/leasing/checkouts/${checkoutId}/approve`, "approve checkout"]
  ]) {
    const result = await jsonRequest(path, adminToken, "POST", { opinion: label }, label);
    assertStatus(label, result.response.status, [200, 201], result.body);
    assertUniformResponse(label, result.body);
  }

  const settlementBody = {
    deduction_amount: "100.00",
    additional_charge_amount: "50.00",
    settlement_remark: "S3E smoke settlement"
  };
  const settlementPreview = await jsonRequest(`/leasing/checkouts/${checkoutId}/preview-settlement`, adminToken, "POST", settlementBody, "settlement-preview");
  assertStatus("preview checkout settlement", settlementPreview.response.status, [200, 201], settlementPreview.body);
  assertUniformResponse("preview checkout settlement", settlementPreview.body);
  assertClose("settlement unpaid amount", settlementPreview.body.data.summary.unpaid_amount, 0);
  assertClose("settlement deposit amount", settlementPreview.body.data.summary.deposit_amount, 2400);
  assertClose("settlement refund amount", settlementPreview.body.data.summary.refund_amount, 2250);
  assertClose("settlement tenant payable", settlementPreview.body.data.summary.amount_due_from_tenant, 0);

  const settlement = await jsonRequest(`/leasing/checkouts/${checkoutId}/confirm-settlement`, adminToken, "POST", settlementBody, "settlement-confirm");
  assertStatus("confirm checkout settlement", settlement.response.status, [200, 201], settlement.body);
  assertUniformResponse("confirm checkout settlement", settlement.body);
  assertClose("checkout refund amount persisted", valueOf(settlement.body.data, "refund_amount", "refundAmount"), 2250);

  const refund = await jsonRequest(`/leasing/checkouts/${checkoutId}/refunds`, adminToken, "POST", {
    refund_amount: "100.00",
    refund_method: "bank_transfer",
    refund_time: "2026-08-01",
    receiver_name: "S3E退款接收人",
    receiver_bank_account: "6222000000000000",
    bank_serial: `S3E-REF-${stamp}`,
    remark: smokeRemark
  }, "refund-create");
  assertStatus("create checkout refund", refund.response.status, 201, refund.body);
  assertUniformResponse("create checkout refund", refund.body);

  const overRefund = await jsonRequest(`/leasing/checkouts/${checkoutId}/refunds`, adminToken, "POST", {
    refund_amount: "3000.00",
    refund_method: "bank_transfer",
    refund_time: "2026-08-02"
  }, "refund-over-limit");
  assertStatus("refund amount over limit rejected", overRefund.response.status, 400, overRefund.body);

  const checkoutEffective = await jsonRequest(`/leasing/checkouts/${checkoutId}/effective`, adminToken, "POST", {
    actual_checkout_date: "2026-07-31",
    opinion: "S3E smoke checkout effective"
  }, "checkout-effective");
  assertStatus("effective checkout", checkoutEffective.response.status, [200, 201], checkoutEffective.body);
  assertUniformResponse("effective checkout", checkoutEffective.body);
  assert(valueOf(checkoutEffective.body.data.contract, "status", "status") === "90", "contract should be terminated after checkout effective");
  assert(checkoutEffective.body.data.released_units?.[0]?.after_status === 10, "unit should be released to rentable");
  assert(checkoutEffective.body.data.canceled_receivables?.some((row) => row.receivable_id === ids.unpaidReceivableId), "future unpaid receivable should be canceled");
  assert(checkoutEffective.body.data.skipped_receivables?.some((row) => row.receivable_id === ids.paidReceivableId), "paid receivable should not be canceled");
  assert(checkoutEffective.body.data.skipped_receivables?.some((row) => row.receivable_id === ids.invoicedReceivableId), "invoiced receivable should not be canceled");

  const terminatedChange = await jsonRequest(`/leasing/contracts/${ids.contractId}/changes`, adminToken, "POST", {
    change_type: "amount_change",
    change_reason: "S3E terminated contract change",
    effective_date: "2026-08-01",
    after_snapshot: { rent_per_month: "1300.00" },
    receivable_policy: "manual_review"
  }, "terminated-change");
  assertStatus("terminated contract change rejected", terminatedChange.response.status, 400, terminatedChange.body);

  const actionLogs = await request(`/leasing/contracts/${ids.contractId}/action-logs?page=1&page_size=50`, {
    headers: { authorization: `Bearer ${adminToken}` }
  });
  assertStatus("contract action logs", actionLogs.response.status, 200, actionLogs.body);
  assertUniformResponse("contract action logs", actionLogs.body);
  assert(actionLogs.body.data.items.length >= 8, "contract action log should contain S3-E-A operations");

  const tenant360 = await request(`/park-tenants/${ids.parkTenantId}/360`, {
    headers: { authorization: `Bearer ${adminToken}` }
  });
  assertStatus("park tenant 360 with S3-E nodes", tenant360.response.status, 200, tenant360.body);
  assertUniformResponse("park tenant 360 with S3-E nodes", tenant360.body);
  assert(tenant360.body.data.contract_changes?.available === true, "tenant 360 contract_changes should be available");
  assert(Number(tenant360.body.data.contract_changes.summary.pending_count) >= 0, "tenant 360 contract_changes summary should exist");
  assert(tenant360.body.data.checkouts?.available === true, "tenant 360 checkouts should be available");
  assert(Number(tenant360.body.data.checkouts.summary.completed_count) >= 1, "tenant 360 checkouts should include completed checkout");
  assert(tenant360.body.data.refunds?.available === true, "tenant 360 refunds should be available");
  assert(Number(tenant360.body.data.refunds.summary.refund_count) >= 1, "tenant 360 refunds should include created refund");

  const dbChecks = await dbScalar(`
SELECT
  (SELECT count(*) FROM biz_unit_status_log WHERE tenant_id = ${sqlLiteral(tenantId)} AND park_id = ${sqlLiteral(parkId)} AND unit_id = ${sqlLiteral(ids.unitId)}) || '|' ||
  (SELECT count(*) FROM biz_leasing_contract_action_log WHERE tenant_id = ${sqlLiteral(tenantId)} AND park_id = ${sqlLiteral(parkId)} AND contract_id = ${sqlLiteral(ids.contractId)}) || '|' ||
  (SELECT count(*) FROM sys_op_log WHERE tenant_id = ${sqlLiteral(tenantId)} AND park_id = ${sqlLiteral(parkId)} AND path LIKE '%leasing/%' AND create_time > now() - interval '15 minutes');`);
  const [unitLogCount, actionLogCount, opLogCount] = dbChecks.split("|").map(Number);
  assert(unitLogCount > 0, "unit status log should be written");
  assert(actionLogCount > 0, "contract action log should be written");
  assert(opLogCount > 0, "sys_op_log should be written");

  await withLeasingDisabled(adminToken);
  logStep("S3-E-A contract change / renewal / checkout / refund smoke passed");
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
        // best effort cleanup for spawned API
      }
    }
  });
