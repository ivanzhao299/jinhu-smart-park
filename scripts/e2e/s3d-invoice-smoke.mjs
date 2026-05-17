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
const smokeRemark = `S3D invoice smoke ${stamp}`;

function logStep(message) {
  console.log(`[s3d-invoice-smoke] ${message}`);
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
      "x-idempotency-key": `s3d-invoice-${stamp}-${label}-${randomUUID()}`
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

async function login(username, password) {
  return request("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-request-id": `s3d-invoice-login-${randomUUID()}` },
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

async function main() {
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
  assert(parkTenant?.id, "No park tenant found for invoice smoke");

  const createReceivable = async (amountDue) => {
    const result = await jsonRequest("/leasing/receivables", adminToken, "POST", {
      park_tenant_id: parkTenant.id,
      fee_type: "90",
      period_start: "2026-05-01",
      period_end: "2026-05-31",
      due_date: "2026-05-31",
      amount_due: amountDue,
      late_fee: 0,
      source_type: "manual",
      remark: smokeRemark
    }, "receivable-create");
    assertStatus("create receivable", result.response.status, 201);
    assertUniformResponse("create receivable", result.body);
    return result.body.data;
  };

  const partialReceivable = await createReceivable(200);
  const fullReceivableA = await createReceivable(40);
  const fullReceivableB = await createReceivable(60);

  const unauthorizedCreate = await jsonRequest("/leasing/invoices", normalToken, "POST", {
    park_tenant_id: parkTenant.id,
    invoice_type: "normal",
    buyer_name: parkTenant.companyName,
    amount: 1,
    tax_rate: 0,
    invoice_date: "2026-06-01",
    receivables: [{ receivable_id: partialReceivable.id, invoice_amount: 1 }],
    remark: smokeRemark
  }, "normal-invoice-create");
  assertStatus("normal user create invoice denied", unauthorizedCreate.response.status, 403);

  const invalidSum = await jsonRequest("/leasing/invoices", adminToken, "POST", {
    park_tenant_id: parkTenant.id,
    invoice_type: "normal",
    buyer_name: parkTenant.companyName,
    amount: 30,
    tax_rate: 0,
    invoice_date: "2026-06-01",
    receivables: [{ receivable_id: partialReceivable.id, invoice_amount: 20 }],
    remark: smokeRemark
  }, "invoice-invalid-sum");
  assertStatus("invoice amount sum rejected", invalidSum.response.status, 400);

  const partialInvoiceResult = await jsonRequest("/leasing/invoices", adminToken, "POST", {
    park_tenant_id: parkTenant.id,
    invoice_type: "normal",
    buyer_name: parkTenant.companyName,
    buyer_tax_no: `TAX${stamp}`,
    amount: 50,
    tax_rate: 0.06,
    invoice_no: `NO-${stamp}-A`,
    invoice_date: "2026-06-01",
    receivables: [{ receivable_id: partialReceivable.id, invoice_amount: 50 }],
    remark: smokeRemark
  }, "invoice-partial-create");
  assertStatus("create partial invoice", partialInvoiceResult.response.status, 201);
  assertUniformResponse("create partial invoice", partialInvoiceResult.body);
  const partialInvoice = partialInvoiceResult.body.data;
  assert(partialInvoice.invoiceCode, "invoice_code should be generated");

  const partialReceivableAfterInvoice = await request(`/leasing/receivables/${partialReceivable.id}`, {
    headers: { authorization: `Bearer ${adminToken}` }
  });
  assertStatus("partial receivable after invoice", partialReceivableAfterInvoice.response.status, 200);
  assert(partialReceivableAfterInvoice.body.data.invoiceStatus === "20", "partial invoice should set receivable invoice_status to 20");

  const partialReceivableStatusLogs = await request(`/leasing/receivables/${partialReceivable.id}/status-logs?page=1&page_size=20`, {
    headers: { authorization: `Bearer ${adminToken}` }
  });
  assertStatus("partial receivable status logs after invoice", partialReceivableStatusLogs.response.status, 200);
  assertUniformResponse("partial receivable status logs after invoice", partialReceivableStatusLogs.body);
  assert(partialReceivableStatusLogs.body.data.items.some((item) => item.action === "invoice"), "invoice registration should create receivable status log");

  const invoiceReceivables = await request(`/leasing/invoices/${partialInvoice.id}/receivables`, {
    headers: { authorization: `Bearer ${adminToken}` }
  });
  assertStatus("list invoice receivables", invoiceReceivables.response.status, 200);
  assertUniformResponse("list invoice receivables", invoiceReceivables.body);
  assert(invoiceReceivables.body.data.length === 1, "invoice should have one receivable relation");
  assertClose("invoice relation amount", invoiceReceivables.body.data[0].invoiceAmount, 50);

  const multiInvoiceResult = await jsonRequest("/leasing/invoices", adminToken, "POST", {
    park_tenant_id: parkTenant.id,
    invoice_type: "special",
    buyer_name: parkTenant.companyName,
    amount: 100,
    tax_rate: 0.06,
    invoice_no: `NO-${stamp}-B`,
    invoice_date: "2026-06-02",
    receivables: [
      { receivable_id: fullReceivableA.id, invoice_amount: 40 },
      { receivable_id: fullReceivableB.id, invoice_amount: 60 }
    ],
    remark: smokeRemark
  }, "invoice-multi-create");
  assertStatus("create multi invoice", multiInvoiceResult.response.status, 201);
  const multiInvoice = multiInvoiceResult.body.data;

  const multiRelations = await request(`/leasing/invoices/${multiInvoice.id}/receivables`, {
    headers: { authorization: `Bearer ${adminToken}` }
  });
  assertStatus("multi invoice receivables", multiRelations.response.status, 200);
  assert(multiRelations.body.data.length === 2, "multi invoice should have two receivable relations");

  const fullReceivableAfterInvoice = await request(`/leasing/receivables/${fullReceivableA.id}`, {
    headers: { authorization: `Bearer ${adminToken}` }
  });
  assertStatus("full receivable after invoice", fullReceivableAfterInvoice.response.status, 200);
  assert(fullReceivableAfterInvoice.body.data.invoiceStatus === "30", "full invoice should set receivable invoice_status to 30");

  const updateInvoice = await jsonRequest(`/leasing/invoices/${multiInvoice.id}`, adminToken, "PUT", {
    buyer_name: `${parkTenant.companyName}更新`,
    amount: 100,
    receivables: [
      { receivable_id: fullReceivableA.id, invoice_amount: 40 },
      { receivable_id: fullReceivableB.id, invoice_amount: 60 }
    ]
  }, "invoice-update");
  assertStatus("update invoice", updateInvoice.response.status, 200);
  assert(updateInvoice.body.data.buyerName.endsWith("更新"), "invoice buyer_name should update");

  const listInvoices = await request(`/leasing/invoices?keyword=${encodeURIComponent(`NO-${stamp}`)}`, {
    headers: { authorization: `Bearer ${adminToken}` }
  });
  assertStatus("list invoices", listInvoices.response.status, 200);
  assertUniformResponse("list invoices", listInvoices.body);
  assert(listInvoices.body.data.items.length >= 2, "invoice list should include created invoices");

  const tenant360Finance = await request(`/park-tenants/${parkTenant.id}/360`, {
    headers: { authorization: `Bearer ${adminToken}` }
  });
  assertStatus("tenant 360 finance after invoice", tenant360Finance.response.status, 200);
  assertUniformResponse("tenant 360 finance after invoice", tenant360Finance.body);
  assert(tenant360Finance.body.data.receivables?.available === true, "tenant 360 receivables should be available");
  assert(tenant360Finance.body.data.payments?.available === true, "tenant 360 payments should be available");
  assert(tenant360Finance.body.data.invoices?.available === true, "tenant 360 invoices should be available");
  assert(Number(tenant360Finance.body.data.invoices.summary.invoice_count) >= 2, "tenant 360 invoice count should include created invoices");
  assert(Number(tenant360Finance.body.data.invoices.summary.invoice_amount) >= 150, "tenant 360 invoice amount should include created invoices");
  assert(Array.isArray(tenant360Finance.body.data.invoices.recent_items), "tenant 360 invoices should return recent_items");
  assert(tenant360Finance.body.data.receivables.recent_items.length > 0, "tenant 360 receivables should include recent rows");
  assert(tenant360Finance.body.data.energy?.available === false, "tenant 360 energy should remain unavailable");

  const deletePartialInvoice = await jsonRequest(`/leasing/invoices/${partialInvoice.id}`, adminToken, "DELETE", undefined, "invoice-delete");
  assertStatus("delete invoice", deletePartialInvoice.response.status, 200);
  const partialReceivableAfterDelete = await request(`/leasing/receivables/${partialReceivable.id}`, {
    headers: { authorization: `Bearer ${adminToken}` }
  });
  assertStatus("partial receivable after invoice delete", partialReceivableAfterDelete.response.status, 200);
  assert(partialReceivableAfterDelete.body.data.invoiceStatus === "10", "deleting invoice should restore receivable invoice_status");

  const opLogCount = Number(await dbScalar(`
SELECT count(*)
FROM sys_op_log
WHERE tenant_id = ${sqlLiteral(tenantId)}
  AND park_id = ${sqlLiteral(parkId)}
  AND biz_type = 'biz_leasing_invoice'
  AND action IN ('新增', '修改', '删除')
  AND op_time >= now() - interval '10 minutes';`));
  assert(opLogCount >= 4, "invoice create/update/delete should create sys_op_log records");

  const relationCount = Number(await dbScalar(`
SELECT count(*)
FROM rel_leasing_invoice_receivable
WHERE tenant_id = ${sqlLiteral(tenantId)}
  AND park_id = ${sqlLiteral(parkId)}
  AND invoice_id = ${sqlLiteral(multiInvoice.id)}::uuid
  AND is_deleted = false;`));
  assert(relationCount === 2, "multi invoice relation rows should persist");

  logStep("all invoice smoke checks passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
