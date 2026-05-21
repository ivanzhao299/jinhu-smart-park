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
const smokeRemark = `S3D payment smoke ${stamp}`;
let apiProcess = null;

function getPnpmBin() {
  if (process.env.PNPM_BIN) return process.env.PNPM_BIN;
  const bundled = resolve(rootDir, ".tools/pnpm");
  return existsSync(bundled) ? bundled : "pnpm";
}

function logStep(message) {
  console.log(`[s3d-payment-smoke] ${message}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertStatus(name, actual, expected) {
  const allowed = Array.isArray(expected) ? expected : [expected];
  if (!allowed.includes(actual)) throw new Error(`${name} expected HTTP ${allowed.join(" or ")}, got ${actual}`);
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
      "x-idempotency-key": `s3d-payment-${stamp}-${label}-${randomUUID()}`
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

async function login(username, password) {
  return request("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-request-id": `s3d-login-${randomUUID()}` },
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
  logStep("API not reachable, starting @jinhu/api for S3-D payment smoke test");
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
    const denied = await request("/leasing/receivables?page=1&page_size=1", {
      headers: { authorization: `Bearer ${token}`, "x-request-id": `s3d-module-denied-${randomUUID()}` }
    });
    assertStatus("leasing module disabled denies receivables API", denied.response.status, 403);
  } finally {
    await dbScalar(`
UPDATE rel_tenant_module
SET enabled = ${wasEnabled === "true" ? "true" : "false"}, status = ${sqlLiteral(previousStatus)}, update_time = now()
WHERE tenant_id = ${sqlLiteral(tenantId)}
  AND park_id = ${sqlLiteral(parkId)}
  AND module_id = (SELECT id FROM sys_module WHERE module_code = 'leasing' AND is_deleted = false LIMIT 1);`);
  }
}

async function main() {
  await ensureApiStarted();
  const adminLogin = await login(adminUser, adminPassword);
  assertStatus("admin login", adminLogin.response.status, 200);
  assertUniformResponse("admin login", adminLogin.body);
  const adminToken = adminLogin.body.data.accessToken;

  const normalLogin = await login(normalUser, normalPassword);
  assertStatus("normal login", normalLogin.response.status, 200);
  const normalToken = normalLogin.body.data.accessToken;

  const tenantsResponse = await request("/park-tenants?page=1&page_size=1", {
    headers: { authorization: `Bearer ${adminToken}` }
  });
  assertStatus("list park tenants", tenantsResponse.response.status, 200);
  assertUniformResponse("list park tenants", tenantsResponse.body);
  const parkTenant = tenantsResponse.body.data.items[0];
  assert(parkTenant?.id, "No park tenant found for payment smoke");

  const createReceivable = async (amountDue, dueDate) => {
    const result = await jsonRequest("/leasing/receivables", adminToken, "POST", {
      park_tenant_id: parkTenant.id,
      fee_type: "90",
      period_start: "2026-05-01",
      period_end: "2026-05-31",
      due_date: dueDate,
      amount_due: amountDue,
      late_fee: 0,
      source_type: "manual",
      remark: smokeRemark
    }, "receivable-create");
    assertStatus("create receivable", result.response.status, 201);
    assertUniformResponse("create receivable", result.body);
    return result.body.data;
  };

  const firstReceivable = await createReceivable(300, "2026-01-01");
  const secondReceivable = await createReceivable(50, "2026-05-31");

  const unauthorizedCreate = await jsonRequest("/leasing/payments", normalToken, "POST", {
    park_tenant_id: parkTenant.id,
    pay_time: new Date().toISOString(),
    pay_method: "bank_transfer",
    pay_amount: 1,
    remark: smokeRemark
  }, "normal-payment-create");
  assertStatus("normal user create payment denied", unauthorizedCreate.response.status, 403);

  const invalidPayment = await jsonRequest("/leasing/payments", adminToken, "POST", {
    park_tenant_id: parkTenant.id,
    pay_time: new Date().toISOString(),
    pay_method: "bank_transfer",
    pay_amount: 0,
    remark: smokeRemark
  }, "invalid-payment-create");
  assertStatus("invalid pay_amount rejected", invalidPayment.response.status, 400);

  const firstPaymentResult = await jsonRequest("/leasing/payments", adminToken, "POST", {
    park_tenant_id: parkTenant.id,
    pay_time: new Date().toISOString(),
    pay_method: "bank_transfer",
    pay_amount: 120,
    payer_name: "S3D 测试付款人",
    bank_serial: `BANK-${stamp}`,
    remark: smokeRemark
  }, "payment-create");
  assertStatus("create payment", firstPaymentResult.response.status, 201);
  assertUniformResponse("create payment", firstPaymentResult.body);
  const firstPayment = firstPaymentResult.body.data;
  assertClose("payment unapplied amount", firstPayment.unappliedAmount, 120);

  const applyResult = await jsonRequest(`/leasing/payments/${firstPayment.id}/apply`, adminToken, "POST", {
    applications: [{ receivable_id: firstReceivable.id, applied_amount: 100 }]
  }, "payment-apply");
  assertStatus("apply payment", applyResult.response.status, 201);
  assertUniformResponse("apply payment", applyResult.body);
  assertClose("payment unapplied after apply", applyResult.body.data.unappliedAmount, 20);
  assert(applyResult.body.data.status === "20", "payment status should be partial after partial application");

  const firstReceivableAfterApply = await request(`/leasing/receivables/${firstReceivable.id}`, {
    headers: { authorization: `Bearer ${adminToken}` }
  });
  assertStatus("receivable after apply", firstReceivableAfterApply.response.status, 200);
  assertClose("receivable amount_paid", firstReceivableAfterApply.body.data.amountPaid, 100);
  assertClose("receivable amount_remain", firstReceivableAfterApply.body.data.amountRemain, 200);
  assert(firstReceivableAfterApply.body.data.status === "70", "overdue partial receivable should become status 70");

  const overApply = await jsonRequest(`/leasing/payments/${firstPayment.id}/apply`, adminToken, "POST", {
    applications: [{ receivable_id: firstReceivable.id, applied_amount: 25 }]
  }, "payment-over-apply");
  assertStatus("over apply rejected", overApply.response.status, 400);

  const secondPaymentResult = await jsonRequest("/leasing/payments", adminToken, "POST", {
    park_tenant_id: parkTenant.id,
    pay_time: new Date().toISOString(),
    pay_method: "bank_transfer",
    pay_amount: 80,
    remark: smokeRemark
  }, "payment-create-multi");
  assertStatus("create payment for multi apply", secondPaymentResult.response.status, 201);
  const secondPayment = secondPaymentResult.body.data;

  const multiApplyResult = await jsonRequest(`/leasing/payments/${secondPayment.id}/apply`, adminToken, "POST", {
    applications: [
      { receivable_id: firstReceivable.id, applied_amount: 30 },
      { receivable_id: secondReceivable.id, applied_amount: 50 }
    ]
  }, "payment-multi-apply");
  assertStatus("multi receivable apply", multiApplyResult.response.status, 201);
  assert(multiApplyResult.body.data.status === "30", "payment status should be applied after full application");
  assertClose("multi payment unapplied", multiApplyResult.body.data.unappliedAmount, 0);

  const applications = await request(`/leasing/payments/${secondPayment.id}/applications`, {
    headers: { authorization: `Bearer ${adminToken}` }
  });
  assertStatus("list payment applications", applications.response.status, 200);
  assertUniformResponse("list payment applications", applications.body);
  assert(applications.body.data.length === 2, "multi payment should have two application rows");

  const secondReceivableAfterApply = await request(`/leasing/receivables/${secondReceivable.id}`, {
    headers: { authorization: `Bearer ${adminToken}` }
  });
  assertStatus("second receivable after apply", secondReceivableAfterApply.response.status, 200);
  assertClose("second receivable amount_paid", secondReceivableAfterApply.body.data.amountPaid, 50);
  assertClose("second receivable amount_remain", secondReceivableAfterApply.body.data.amountRemain, 0);
  assert(secondReceivableAfterApply.body.data.status === "50", "fully applied receivable should become settled");

  const agingDenied = await request("/leasing/receivables/aging", {
    headers: { authorization: `Bearer ${normalToken}` }
  });
  assertStatus("normal user aging denied", agingDenied.response.status, 403);

  const recalculateOverdue = await jsonRequest("/leasing/receivables/recalculate-overdue", adminToken, "POST", undefined, "receivable-recalculate-overdue");
  assertStatus("recalculate overdue", recalculateOverdue.response.status, 201);
  assertUniformResponse("recalculate overdue", recalculateOverdue.body);
  assert(recalculateOverdue.body.data.checked_count >= 2, "overdue recalculate should inspect receivables");

  const aging = await request(`/leasing/receivables/aging?park_tenant_id=${parkTenant.id}`, {
    headers: { authorization: `Bearer ${adminToken}` }
  });
  assertStatus("receivable aging", aging.response.status, 200);
  assertUniformResponse("receivable aging", aging.body);
  assert(aging.body.data.summary.overdue_count >= 1, "aging should include overdue receivables");
  const d90PlusBucket = aging.body.data.buckets.find((bucket) => bucket.bucket === "d90_plus");
  assert(d90PlusBucket && Number(d90PlusBucket.amount) > 0, "aging should include d90_plus amount for old overdue receivable");

  const overdueList = await request(`/leasing/receivables/overdue?park_tenant_id=${parkTenant.id}`, {
    headers: { authorization: `Bearer ${adminToken}` }
  });
  assertStatus("receivable overdue list", overdueList.response.status, 200);
  assertUniformResponse("receivable overdue list", overdueList.body);
  assert(overdueList.body.data.items.some((item) => item.id === firstReceivable.id), "overdue list should include the overdue receivable");

  const tenant360Finance = await request(`/park-tenants/${parkTenant.id}/360`, {
    headers: { authorization: `Bearer ${adminToken}` }
  });
  assertStatus("tenant 360 finance after payment", tenant360Finance.response.status, 200);
  assertUniformResponse("tenant 360 finance after payment", tenant360Finance.body);
  assert(tenant360Finance.body.data.receivables?.available === true, "tenant 360 receivables should be available");
  assert(Number(tenant360Finance.body.data.receivables.summary.total_amount_due) >= 350, "tenant 360 receivable summary should include created receivables");
  assert(Array.isArray(tenant360Finance.body.data.receivables.recent_items), "tenant 360 receivables should return recent_items");
  assert(tenant360Finance.body.data.payments?.available === true, "tenant 360 payments should be available");
  assert(Number(tenant360Finance.body.data.payments.summary.total_payment_amount) >= 200, "tenant 360 payment summary should include created payments");
  assert(Array.isArray(tenant360Finance.body.data.payments.recent_items), "tenant 360 payments should return recent_items");
  assert(tenant360Finance.body.data.invoices?.available === true, "tenant 360 invoices should be available");
  assert(tenant360Finance.body.data.workorders?.available === true, "tenant 360 workorders should be available after S4-A");
  assert(Array.isArray(tenant360Finance.body.data.workorders.recent_items), "tenant 360 workorders should return recent_items");

  const statusLogCount = Number(await dbScalar(`
SELECT count(*)
FROM biz_leasing_receivable_status_log
WHERE tenant_id = ${sqlLiteral(tenantId)}
  AND park_id = ${sqlLiteral(parkId)}
  AND receivable_id IN (${sqlLiteral(firstReceivable.id)}::uuid, ${sqlLiteral(secondReceivable.id)}::uuid)
  AND action = 'payment_apply'
  AND is_deleted = false;`));
  assert(statusLogCount >= 2, "payment application should create receivable status logs");

  const statusLogsApi = await request(`/leasing/receivables/${firstReceivable.id}/status-logs?page=1&page_size=20`, {
    headers: { authorization: `Bearer ${adminToken}` }
  });
  assertStatus("receivable status logs api", statusLogsApi.response.status, 200);
  assertUniformResponse("receivable status logs api", statusLogsApi.body);
  assert(statusLogsApi.body.data.items.some((item) => item.action === "payment_apply"), "status logs api should include payment_apply action");

  const statusLogsDenied = await request(`/leasing/receivables/${firstReceivable.id}/status-logs?page=1&page_size=20`, {
    headers: { authorization: `Bearer ${normalToken}` }
  });
  assertStatus("normal user receivable status logs denied", statusLogsDenied.response.status, 403);

  const opLogCount = Number(await dbScalar(`
SELECT count(*)
FROM sys_op_log
WHERE tenant_id = ${sqlLiteral(tenantId)}
  AND park_id = ${sqlLiteral(parkId)}
  AND biz_type = 'biz_leasing_payment'
  AND action IN ('新增', '核销')
  AND op_time >= now() - interval '10 minutes';`));
  assert(opLogCount >= 3, "payment create/apply should create sys_op_log records");

  await withLeasingDisabled(adminToken);

  logStep("S3-D payment smoke passed");
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
        // API process may already have exited.
      }
    }
  });
