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
const smokeRemark = `S9F1 energy adjustment reversal smoke ${stamp}`;

let apiProcess = null;

function getPnpmBin() {
  if (process.env.PNPM_BIN) return process.env.PNPM_BIN;
  const bundled = resolve(rootDir, ".tools/pnpm");
  return existsSync(bundled) ? bundled : "pnpm";
}

function logStep(message) {
  console.log(`[s9f1-energy-billing-adjustment-reversal-smoke] ${message}`);
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

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function numberValue(value) {
  return Number.parseFloat(String(value));
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
      "x-idempotency-key": `s9f1-energy-${stamp}-${label}-${randomUUID()}`
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

async function login(username, password) {
  return request("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-request-id": `s9f1-login-${randomUUID()}` },
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
  logStep("API not reachable, starting @jinhu/api for S9-F.1 smoke test");
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

async function ensureParkTenant() {
  const existing = await psql(`
SELECT id FROM biz_park_tenant
WHERE tenant_id = ${sqlLiteral(tenantId)}
  AND park_id = ${sqlLiteral(parkId)}
  AND is_deleted = false
LIMIT 1;
`);
  if (existing) return existing.split("\n")[0];
  const id = randomUUID();
  await psql(`
INSERT INTO biz_park_tenant (
  id, tenant_id, park_id, tenant_code, company_name, status, source_type,
  create_time, update_time, is_deleted, remark
) VALUES (
  ${sqlLiteral(id)}, ${sqlLiteral(tenantId)}, ${sqlLiteral(parkId)}, ${sqlLiteral(`S9F1-TENANT-${stamp}`)},
  ${sqlLiteral(`S9F1 能源调整租户 ${stamp}`)}, 'active', 'manual', now(), now(), false, ${sqlLiteral(smokeRemark)}
);
`);
  return id;
}

async function createConfirmedReading(token, meterId, readingValue, readingTime, label) {
  const created = await jsonRequest(`/energy/meters/${meterId}/readings`, token, "POST", {
    reading_value: readingValue,
    reading_time: readingTime,
    reading_source: "MANUAL",
    raw_payload: { source: "s9f1-smoke" }
  }, `${label}-create`);
  assertStatus(`${label} create reading`, created.response.status, 201);
  assertUniformResponse(`${label} create reading`, created.body);
  const confirmed = await jsonRequest(`/energy/readings/${created.body.data.id}/confirm`, token, "POST", undefined, `${label}-confirm`);
  assertStatus(`${label} confirm reading`, confirmed.response.status, 201);
  assert(confirmed.body.data.confirmationStatus === "CONFIRMED", `${label} reading should be confirmed`);
  return confirmed.body.data;
}

async function createPostedBillingItem(token, parkTenantId) {
  const meter = await jsonRequest("/energy/meters", token, "POST", {
    meter_name: `S9F1 tenant electric meter ${stamp}`,
    meter_type: "ELECTRIC",
    meter_purpose: "TENANT",
    related_park_tenant_id: parkTenantId,
    multiplier: 1,
    unit: "kWh",
    initial_reading: 0,
    status: "ONLINE",
    remark: smokeRemark
  }, "create-meter");
  assertStatus("create tenant meter", meter.response.status, 201);

  const uniqueDayOffset = 6000 + (stamp % 5000);
  const readingTime = new Date(Date.UTC(2026, 0, 1 + uniqueDayOffset, 12, 0, 0)).toISOString();
  const startDate = new Date(Date.UTC(2026, 0, 1 + uniqueDayOffset, 0, 0, 0)).toISOString().slice(0, 10);
  const endDate = new Date(Date.UTC(2026, 0, 1 + uniqueDayOffset, 23, 59, 59)).toISOString().slice(0, 10);
  await createConfirmedReading(token, meter.body.data.id, 100, readingTime, "direct-meter");

  const cycle = await jsonRequest("/energy/billing-cycles", token, "POST", {
    cycle_name: `S9F1 能源调整账期 ${stamp}`,
    meter_type: "ELECTRIC",
    start_date: startDate,
    end_date: endDate,
    remark: smokeRemark
  }, "create-cycle");
  assertStatus("create billing cycle", cycle.response.status, 201);

  const calculated = await jsonRequest(`/energy/billing-cycles/${cycle.body.data.id}/calculate`, token, "POST", {
    unit_prices: { ELECTRIC: 1.2 }
  }, "calculate-cycle");
  assertStatus("calculate billing cycle", calculated.response.status, 201);

  const items = await jsonRequest(`/energy/billing-cycles/${cycle.body.data.id}/items?page=1&page_size=50`, token, "GET", undefined, "list-items");
  assertStatus("list billing items", items.response.status, 200);
  const billingItem = items.body.data.items.find((item) => item.billingMethod === "DIRECT_METER");
  assert(billingItem, "Direct billing item was not generated");
  assert(numberValue(billingItem.finalAmount) === 120, "Direct billing final amount should be 120");

  const confirmedItem = await jsonRequest(`/energy/billing-items/${billingItem.id}/confirm`, token, "POST", undefined, "confirm-item");
  assertStatus("confirm billing item", confirmedItem.response.status, 201);

  const confirmedCycle = await jsonRequest(`/energy/billing-cycles/${cycle.body.data.id}/confirm`, token, "POST", undefined, "confirm-cycle");
  assertStatus("confirm billing cycle", confirmedCycle.response.status, 201);

  const posted = await jsonRequest(`/energy/billing-cycles/${cycle.body.data.id}/post`, token, "POST", undefined, "post-cycle");
  assertStatus("post billing cycle", posted.response.status, 201);
  assert(posted.body.data.posted === true, "Billing cycle should post to receivables");

  const postedItems = await jsonRequest(`/energy/billing-cycles/${cycle.body.data.id}/items?page=1&page_size=50`, token, "GET", undefined, "list-posted-items");
  assertStatus("list posted billing items", postedItems.response.status, 200);
  const postedItem = postedItems.body.data.items.find((item) => item.id === billingItem.id);
  assert(postedItem?.receivableId, "Posted billing item should have receivableId");
  return { cycleId: cycle.body.data.id, billingItem: postedItem };
}

async function createAdjustment(token, payload, label) {
  const created = await jsonRequest("/energy/billing-adjustments", token, "POST", payload, label);
  assertStatus(label, created.response.status, 201);
  assertUniformResponse(label, created.body);
  assert(created.body.data?.id, `${label} missing adjustment id`);
  return created.body.data;
}

async function approveAndPostAdjustment(token, id, label) {
  const approved = await jsonRequest(`/energy/billing-adjustments/${id}/approve`, token, "POST", undefined, `${label}-approve`);
  assertStatus(`${label} approve`, approved.response.status, 201);
  assert(approved.body.data.status === "APPROVED", `${label} should be approved`);
  const posted = await jsonRequest(`/energy/billing-adjustments/${id}/post`, token, "POST", undefined, `${label}-post`);
  assertStatus(`${label} post`, posted.response.status, 201);
  assert(posted.body.data.receivable_id, `${label} should produce receivable`);
  return posted.body.data;
}

async function main() {
  await ensureApiStarted();

  const adminLogin = await login(adminUser, adminPassword);
  assertStatus("admin login", adminLogin.response.status, 200);
  assertUniformResponse("admin login", adminLogin.body);
  const token = adminLogin.body.data?.access_token ?? adminLogin.body.data?.accessToken;
  assert(token, "Admin login did not return an access token");

  const normalLogin = await login(normalUser, normalPassword);
  assertStatus("normal login", normalLogin.response.status, 200);
  assertUniformResponse("normal login", normalLogin.body);
  const normalToken = normalLogin.body.data?.access_token ?? normalLogin.body.data?.accessToken;
  assert(normalToken, "Normal login did not return an access token");

  const parkTenantId = await ensureParkTenant();
  const { cycleId, billingItem } = await createPostedBillingItem(token, parkTenantId);

  const recalculatePosted = await jsonRequest(`/energy/billing-cycles/${cycleId}/calculate`, token, "POST", {
    unit_prices: { ELECTRIC: 9 }
  }, "recalculate-posted");
  assertStatus("posted cycle cannot recalculate", recalculatePosted.response.status, 400);

  const directAdjustPosted = await jsonRequest(`/energy/billing-items/${billingItem.id}/adjust`, token, "PATCH", {
    adjustment_amount: 5,
    adjustment_reason: "S9F1 posted item direct mutation denied"
  }, "direct-adjust-posted");
  assertStatus("posted billing item cannot be directly adjusted", directAdjustPosted.response.status, 400);

  const deniedCreate = await jsonRequest("/energy/billing-adjustments", normalToken, "POST", {
    billing_item_id: billingItem.id,
    adjustment_type: "ADJUSTMENT",
    adjustment_amount: 1,
    adjustment_reason: "normal user denied"
  }, "normal-create-adjustment");
  assertStatus("normal user cannot create adjustment", deniedCreate.response.status, 403);

  const reversal = await createAdjustment(token, {
    billing_item_id: billingItem.id,
    adjustment_type: "REVERSAL",
    adjustment_reason: "S9F1 full reversal"
  }, "create-reversal");
  assert(numberValue(reversal.finalAdjustmentAmount) === -numberValue(billingItem.finalAmount), "Reversal amount should be negative original final amount");

  const postedReversal = await approveAndPostAdjustment(token, reversal.id, "reversal");
  const repeatReversalPost = await jsonRequest(`/energy/billing-adjustments/${reversal.id}/post`, token, "POST", undefined, "reversal-repeat-post");
  assertStatus("repeat reversal post idempotent", repeatReversalPost.response.status, 201);
  assert(repeatReversalPost.body.data.skipped === true, "Repeat reversal post should be skipped");
  assert(repeatReversalPost.body.data.receivable_id === postedReversal.receivable_id, "Repeat post should keep same receivable");

  const secondReversal = await jsonRequest("/energy/billing-adjustments", token, "POST", {
    billing_item_id: billingItem.id,
    adjustment_type: "REVERSAL",
    adjustment_reason: "S9F1 duplicate full reversal"
  }, "duplicate-reversal");
  assertStatus("duplicate full reversal denied", secondReversal.response.status, 409);

  const positiveAdjustment = await createAdjustment(token, {
    billing_item_id: billingItem.id,
    adjustment_type: "ADJUSTMENT",
    adjustment_amount: 8.5,
    adjustment_reason: "S9F1 positive difference"
  }, "create-positive-adjustment");
  assert(numberValue(positiveAdjustment.finalAdjustmentAmount) === 8.5, "Positive adjustment amount should be kept");
  const postedPositive = await approveAndPostAdjustment(token, positiveAdjustment.id, "positive-adjustment");
  assert(postedPositive.receivable_id, "Positive adjustment should create receivable");

  const negativeAdjustment = await createAdjustment(token, {
    billing_item_id: billingItem.id,
    adjustment_type: "ADJUSTMENT",
    adjustment_amount: -3.25,
    adjustment_reason: "S9F1 negative difference"
  }, "create-negative-adjustment");
  assert(numberValue(negativeAdjustment.finalAdjustmentAmount) === -3.25, "Negative adjustment amount should be kept");
  const postedNegative = await approveAndPostAdjustment(token, negativeAdjustment.id, "negative-adjustment");
  assert(postedNegative.receivable_id, "Negative adjustment should create receivable");

  const draftAdjustment = await createAdjustment(token, {
    billing_item_id: billingItem.id,
    adjustment_type: "ADJUSTMENT",
    adjustment_amount: 1.25,
    adjustment_reason: "S9F1 draft cancel"
  }, "create-cancellable-adjustment");
  const cancelled = await jsonRequest(`/energy/billing-adjustments/${draftAdjustment.id}/cancel`, token, "POST", undefined, "cancel-draft");
  assertStatus("draft adjustment can cancel", cancelled.response.status, 201);
  assert(cancelled.body.data.status === "CANCELLED", "Draft adjustment should be cancelled");

  const cancelPosted = await jsonRequest(`/energy/billing-adjustments/${positiveAdjustment.id}/cancel`, token, "POST", undefined, "cancel-posted");
  assertStatus("posted adjustment cannot cancel", cancelPosted.response.status, 400);

  const list = await jsonRequest(`/energy/billing-adjustments?billing_item_id=${billingItem.id}&page=1&page_size=20`, token, "GET", undefined, "list-adjustments");
  assertStatus("list adjustments", list.response.status, 200);
  assert(list.body.data.total >= 4, "Adjustment list should include created adjustments");

  const isolatedAdjustmentId = randomUUID();
  await psql(`
INSERT INTO energy_billing_adjustment (
  id, tenant_id, park_id, adjustment_code, billing_item_id, cycle_id, related_park_tenant_id,
  original_receivable_id, adjustment_type, adjustment_amount, final_adjustment_amount,
  adjustment_reason, status, create_time, update_time, is_deleted, remark
) VALUES (
  ${sqlLiteral(isolatedAdjustmentId)}, '99999999', ${sqlLiteral(parkId)}, ${sqlLiteral(`EBA-OTHER-${stamp}`)},
  ${sqlLiteral(billingItem.id)}, ${sqlLiteral(cycleId)}, ${sqlLiteral(parkTenantId)}, ${sqlLiteral(billingItem.receivableId)},
  'ADJUSTMENT', 9.99, 9.99, ${sqlLiteral(`other tenant adjustment ${stamp}`)}, 'DRAFT', now(), now(), false, ${sqlLiteral(smokeRemark)}
);
`);
  const isolated = await jsonRequest(`/energy/billing-adjustments?keyword=${encodeURIComponent(`other tenant adjustment ${stamp}`)}`, token, "GET", undefined, "tenant-isolation");
  assertStatus("tenant isolation query", isolated.response.status, 200);
  assert(isolated.body.data.total === 0, "Energy adjustment query leaked another tenant row");

  const auditCount = await psql(`SELECT COUNT(*) FROM sys_op_log WHERE path ILIKE '%energy/billing-adjustments%'`);
  assert(Number.parseInt(auditCount, 10) > 0, "Energy billing adjustment write operations should create sys_op_log rows");

  logStep("S9-F.1 energy billing adjustment/reversal smoke completed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
