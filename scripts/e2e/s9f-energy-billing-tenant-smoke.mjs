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
const stamp = Date.now();
const smokeRemark = `S9F energy billing tenant smoke ${stamp}`;

let apiProcess = null;

function getPnpmBin() {
  if (process.env.PNPM_BIN) return process.env.PNPM_BIN;
  const bundled = resolve(rootDir, ".tools/pnpm");
  return existsSync(bundled) ? bundled : "pnpm";
}

function logStep(message) {
  console.log(`[s9f-energy-billing-tenant-smoke] ${message}`);
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
      "x-idempotency-key": `s9f-energy-${stamp}-${label}-${randomUUID()}`
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

async function login(username, password) {
  return request("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-request-id": `s9f-login-${randomUUID()}` },
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
  logStep("API not reachable, starting @jinhu/api for S9-F smoke test");
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
  ${sqlLiteral(id)}, ${sqlLiteral(tenantId)}, ${sqlLiteral(parkId)}, ${sqlLiteral(`S9F-TENANT-${stamp}`)},
  ${sqlLiteral(`S9F 能源账单租户 ${stamp}`)}, 'active', 'manual', now(), now(), false, ${sqlLiteral(smokeRemark)}
);
`);
  return id;
}

async function createMeter(token, body, label) {
  const created = await jsonRequest("/energy/meters", token, "POST", body, label);
  assertStatus(label, created.response.status, 201);
  assertUniformResponse(label, created.body);
  assert(created.body.data?.id, `${label} missing meter id`);
  return created.body.data;
}

async function createConfirmedReading(token, meterId, readingValue, label, readingTime) {
  const created = await jsonRequest(`/energy/meters/${meterId}/readings`, token, "POST", {
    reading_value: readingValue,
    reading_time: readingTime,
    reading_source: "MANUAL",
    raw_payload: { source: "s9f-smoke" }
  }, `${label}-create`);
  assertStatus(`${label} create reading`, created.response.status, 201);
  assertUniformResponse(`${label} create reading`, created.body);
  const confirmed = await jsonRequest(`/energy/readings/${created.body.data.id}/confirm`, token, "POST", undefined, `${label}-confirm`);
  assertStatus(`${label} confirm reading`, confirmed.response.status, 201);
  assert(confirmed.body.data.confirmationStatus === "CONFIRMED", `${label} reading should be confirmed`);
  return confirmed.body.data;
}

async function main() {
  await ensureApiStarted();

  const adminLogin = await login(adminUser, adminPassword);
  assertStatus("admin login", adminLogin.response.status, 200);
  assertUniformResponse("admin login", adminLogin.body);
  const token = adminLogin.body.data?.access_token ?? adminLogin.body.data?.accessToken;
  assert(token, "Admin login did not return an access token");

  const parkTenantId = await ensureParkTenant();

  const tenantMeter = await createMeter(token, {
    meter_name: `S9F tenant electric meter ${stamp}`,
    meter_type: "ELECTRIC",
    meter_purpose: "TENANT",
    related_park_tenant_id: parkTenantId,
    multiplier: 1,
    unit: "kWh",
    initial_reading: 0,
    status: "ONLINE",
    remark: smokeRemark
  }, "create tenant direct meter");

  const publicMeter = await createMeter(token, {
    meter_name: `S9F public electric meter ${stamp}`,
    meter_type: "ELECTRIC",
    meter_purpose: "PUBLIC",
    multiplier: 1,
    unit: "kWh",
    initial_reading: 0,
    status: "ONLINE",
    remark: smokeRemark
  }, "create public allocation meter");

  const uniqueDayOffset = 30 + (stamp % 5000);
  const cycleStart = new Date(Date.UTC(2026, 0, 1 + uniqueDayOffset, 0, 0, 0));
  const cycleEnd = new Date(Date.UTC(2026, 0, 1 + uniqueDayOffset, 23, 59, 59));
  const readingTime = new Date(Date.UTC(2026, 0, 1 + uniqueDayOffset, 12, 0, 0)).toISOString();
  await createConfirmedReading(token, tenantMeter.id, 100, "direct-meter", readingTime);
  await createConfirmedReading(token, publicMeter.id, 50, "public-meter", readingTime);

  const startDate = cycleStart.toISOString().slice(0, 10);
  const endDate = cycleEnd.toISOString().slice(0, 10);

  const cycle = await jsonRequest("/energy/billing-cycles", token, "POST", {
    cycle_name: `S9F 能源账期 ${stamp}`,
    meter_type: "ELECTRIC",
    start_date: startDate,
    end_date: endDate,
    remark: smokeRemark
  }, "create-cycle");
  assertStatus("create billing cycle", cycle.response.status, 201);
  assertUniformResponse("create billing cycle", cycle.body);
  assert(cycle.body.data.status === "DRAFT", "New billing cycle should be DRAFT");

  const rule = await jsonRequest("/energy/allocation-rules", token, "POST", {
    rule_name: `S9F 公共分摊规则 ${stamp}`,
    meter_type: "ELECTRIC",
    allocation_scope: "PARK",
    allocation_method: "MANUAL_RATIO",
    public_meter_id: publicMeter.id,
    rule_config_json: {
      unit_price: 1.5,
      ratios: {
        [parkTenantId]: 1
      }
    },
    status: "ENABLED",
    remark: smokeRemark
  }, "create-allocation-rule");
  assertStatus("create allocation rule", rule.response.status, 201);
  assertUniformResponse("create allocation rule", rule.body);

  const rules = await jsonRequest(`/energy/allocation-rules?keyword=${encodeURIComponent(`S9F 公共分摊规则 ${stamp}`)}`, token, "GET", undefined, "list-rules");
  assertStatus("list allocation rules", rules.response.status, 200);
  assert(rules.body.data.total >= 1, "Allocation rule list should include created rule");

  const calculated = await jsonRequest(`/energy/billing-cycles/${cycle.body.data.id}/calculate`, token, "POST", {
    unit_prices: {
      ELECTRIC: 1.2
    }
  }, "calculate-cycle");
  assertStatus("calculate billing cycle", calculated.response.status, 201);
  assertUniformResponse("calculate billing cycle", calculated.body);
  assert(calculated.body.data.generated_count >= 2, "Calculation should generate direct and allocation billing items");

  const items = await jsonRequest(`/energy/billing-cycles/${cycle.body.data.id}/items?page=1&page_size=50`, token, "GET", undefined, "list-items");
  assertStatus("list billing items", items.response.status, 200);
  const billingItems = items.body.data.items;
  assert(Array.isArray(billingItems) && billingItems.length >= 2, "Billing items should be returned");
  const directItem = billingItems.find((item) => item.billingMethod === "DIRECT_METER");
  const allocationItem = billingItems.find((item) => item.billingMethod === "PUBLIC_ALLOCATION");
  assert(directItem, "Direct meter billing item was not generated");
  assert(allocationItem, "Public allocation billing item was not generated");
  assert(numberValue(directItem.consumptionValue) === 100, "Direct meter consumption should use confirmed reading only");
  assert(numberValue(directItem.finalAmount) === 120, "Direct meter final amount should be consumption * unit price");
  assert(numberValue(allocationItem.finalAmount) === 75, "Public allocation final amount should follow rule snapshot unit price");

  const adjusted = await jsonRequest(`/energy/billing-items/${directItem.id}/adjust`, token, "PATCH", {
    adjustment_amount: 5,
    adjustment_reason: "S9F smoke manual adjustment"
  }, "adjust-item");
  assertStatus("adjust billing item", adjusted.response.status, 200);
  assert(numberValue(adjusted.body.data.finalAmount) === 125, "Adjustment should change final_amount");

  const dispute = await jsonRequest(`/energy/billing-items/${allocationItem.id}/dispute`, token, "POST", {
    dispute_reason: "S9F smoke dispute"
  }, "dispute-item");
  assertStatus("dispute billing item", dispute.response.status, 201);
  assert(dispute.body.data.confirmationStatus === "DISPUTED", "Disputed item should have DISPUTED status");

  const confirmCycleBlocked = await jsonRequest(`/energy/billing-cycles/${cycle.body.data.id}/confirm`, token, "POST", undefined, "confirm-cycle-blocked");
  assertStatus("disputed billing item blocks cycle confirm", confirmCycleBlocked.response.status, 400);

  const confirmedDirect = await jsonRequest(`/energy/billing-items/${directItem.id}/confirm`, token, "POST", undefined, "confirm-direct-item");
  assertStatus("confirm direct item", confirmedDirect.response.status, 201);
  const confirmedAllocation = await jsonRequest(`/energy/billing-items/${allocationItem.id}/confirm`, token, "POST", undefined, "confirm-allocation-item");
  assertStatus("confirm allocation item", confirmedAllocation.response.status, 201);

  const confirmedCycle = await jsonRequest(`/energy/billing-cycles/${cycle.body.data.id}/confirm`, token, "POST", undefined, "confirm-cycle");
  assertStatus("confirm billing cycle", confirmedCycle.response.status, 201);
  assert(confirmedCycle.body.data.status === "CONFIRMED", "Billing cycle should be CONFIRMED");

  const posted = await jsonRequest(`/energy/billing-cycles/${cycle.body.data.id}/post`, token, "POST", undefined, "post-cycle");
  assertStatus("post billing cycle to receivables", posted.response.status, 201);
  assert(posted.body.data.posted === true, "Billing cycle should post to receivables");
  assert(posted.body.data.results.every((item) => item.receivable_id), "Every posted billing item should have receivable_id");

  const repeatPost = await jsonRequest(`/energy/billing-cycles/${cycle.body.data.id}/post`, token, "POST", undefined, "post-cycle-again");
  assertStatus("repeat post is idempotent", repeatPost.response.status, 201);
  assert(repeatPost.body.data.skipped === true, "Repeat post should be idempotent skipped");

  const recalculatePosted = await jsonRequest(`/energy/billing-cycles/${cycle.body.data.id}/calculate`, token, "POST", {
    unit_prices: { ELECTRIC: 9 }
  }, "recalculate-posted");
  assertStatus("posted cycle cannot recalculate", recalculatePosted.response.status, 400);

  const isolatedCycleId = randomUUID();
  await psql(`
INSERT INTO energy_billing_cycle (
  id, tenant_id, park_id, code, cycle_code, cycle_name, meter_type, start_date, end_date, status,
  create_time, update_time, is_deleted, remark
) VALUES (
  ${sqlLiteral(isolatedCycleId)}, '99999999', ${sqlLiteral(parkId)}, ${sqlLiteral(`S9F-OTHER-${stamp}`)},
  ${sqlLiteral(`S9F-OTHER-${stamp}`)}, ${sqlLiteral(`S9F other tenant cycle ${stamp}`)}, 'ELECTRIC',
  ${sqlLiteral(startDate)}, ${sqlLiteral(endDate)}, 'DRAFT', now(), now(), false, ${sqlLiteral(smokeRemark)}
);
`);
  const isolated = await jsonRequest(`/energy/billing-cycles?keyword=${encodeURIComponent(`S9F other tenant cycle ${stamp}`)}`, token, "GET", undefined, "tenant-isolation");
  assertStatus("tenant isolation query", isolated.response.status, 200);
  assert(isolated.body.data.total === 0, "Energy billing query leaked another tenant row");

  const auditCount = await psql(`SELECT COUNT(*) FROM sys_op_log WHERE path ILIKE '%energy/billing%' OR path ILIKE '%energy/allocation%'`);
  assert(Number.parseInt(auditCount, 10) > 0, "Energy billing write operations should create sys_op_log rows");

  logStep("S9-F energy billing tenant smoke completed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
