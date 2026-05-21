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
const smokeRemark = `S3D waiver smoke ${stamp}`;
let apiProcess = null;

function getPnpmBin() {
  if (process.env.PNPM_BIN) return process.env.PNPM_BIN;
  const bundled = resolve(rootDir, ".tools/pnpm");
  return existsSync(bundled) ? bundled : "pnpm";
}

function logStep(message) {
  console.log(`[s3d-waiver-smoke] ${message}`);
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
      "x-idempotency-key": `s3d-waiver-${stamp}-${label}-${randomUUID()}`
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

async function login(username, password) {
  return request("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-request-id": `s3d-waiver-login-${randomUUID()}` },
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
  logStep("API not reachable, starting @jinhu/api for S3-D waiver smoke test");
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
  assert(parkTenant?.id, "No park tenant found for waiver smoke");

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

  const receivable = await createReceivable(200);

  const unauthorizedCreate = await jsonRequest("/leasing/waivers", normalToken, "POST", {
    receivable_id: receivable.id,
    waiver_amount: 1,
    reason: smokeRemark
  }, "normal-waiver-create");
  assertStatus("normal user create waiver denied", unauthorizedCreate.response.status, 403);

  const overWaiver = await jsonRequest("/leasing/waivers", adminToken, "POST", {
    receivable_id: receivable.id,
    waiver_amount: 250,
    reason: smokeRemark
  }, "waiver-over-remain");
  assertStatus("waiver amount over remain rejected", overWaiver.response.status, 400);

  const firstWaiverResult = await jsonRequest("/leasing/waivers", adminToken, "POST", {
    receivable_id: receivable.id,
    waiver_amount: 80,
    reason: "租金争议金额审批豁免",
    remark: smokeRemark
  }, "waiver-create");
  assertStatus("create waiver", firstWaiverResult.response.status, 201);
  assertUniformResponse("create waiver", firstWaiverResult.body);
  const firstWaiver = firstWaiverResult.body.data;
  assert(firstWaiver.status === "20", "new waiver should be pending");

  const rejectWithoutReason = await jsonRequest(`/leasing/waivers/${firstWaiver.id}/reject`, adminToken, "POST", {
    opinion: "资料不完整"
  }, "waiver-reject-empty");
  assertStatus("reject reason required", rejectWithoutReason.response.status, 400);

  const approveResult = await jsonRequest(`/leasing/waivers/${firstWaiver.id}/approve`, adminToken, "POST", {
    opinion: "同意豁免"
  }, "waiver-approve");
  assertStatus("approve waiver", approveResult.response.status, 201);
  assertUniformResponse("approve waiver", approveResult.body);
  assert(approveResult.body.data.status === "30", "approved waiver should become status 30");
  assert(approveResult.body.data.approveRecords.some((record) => record.action === "approve"), "approve_records should include approve action");

  const receivableAfterFirstApprove = await request(`/leasing/receivables/${receivable.id}`, {
    headers: { authorization: `Bearer ${adminToken}` }
  });
  assertStatus("receivable after first waiver", receivableAfterFirstApprove.response.status, 200);
  assertClose("receivable amount_waived after first approval", receivableAfterFirstApprove.body.data.amountWaived, 80);
  assertClose("receivable amount_remain after first approval", receivableAfterFirstApprove.body.data.amountRemain, 120);
  assert(receivableAfterFirstApprove.body.data.status === "40", "partially waived receivable should become partial received status");

  const secondWaiverResult = await jsonRequest("/leasing/waivers", adminToken, "POST", {
    receivable_id: receivable.id,
    waiver_amount: 120,
    reason: "剩余争议金额确认豁免",
    remark: smokeRemark
  }, "waiver-create-second");
  assertStatus("create second waiver", secondWaiverResult.response.status, 201);
  const secondWaiver = secondWaiverResult.body.data;

  const approveSecond = await jsonRequest(`/leasing/waivers/${secondWaiver.id}/approve`, adminToken, "POST", {
    opinion: "同意结清豁免"
  }, "waiver-approve-second");
  assertStatus("approve second waiver", approveSecond.response.status, 201);

  const receivableAfterSecondApprove = await request(`/leasing/receivables/${receivable.id}`, {
    headers: { authorization: `Bearer ${adminToken}` }
  });
  assertStatus("receivable after full waiver", receivableAfterSecondApprove.response.status, 200);
  assertClose("receivable amount_waived after full approval", receivableAfterSecondApprove.body.data.amountWaived, 200);
  assertClose("receivable amount_remain after full approval", receivableAfterSecondApprove.body.data.amountRemain, 0);
  assert(receivableAfterSecondApprove.body.data.status === "80", "fully waived receivable should become waived status");

  const settledWaiver = await jsonRequest("/leasing/waivers", adminToken, "POST", {
    receivable_id: receivable.id,
    waiver_amount: 1,
    reason: "已结清应收不允许继续豁免"
  }, "waiver-settled");
  assertStatus("settled receivable waiver rejected", settledWaiver.response.status, 400);

  const rejectReceivable = await createReceivable(60);
  const rejectWaiverResult = await jsonRequest("/leasing/waivers", adminToken, "POST", {
    receivable_id: rejectReceivable.id,
    waiver_amount: 10,
    reason: "待驳回测试",
    remark: smokeRemark
  }, "waiver-create-reject");
  assertStatus("create waiver for reject", rejectWaiverResult.response.status, 201);
  const rejectWaiver = rejectWaiverResult.body.data;

  const rejectResult = await jsonRequest(`/leasing/waivers/${rejectWaiver.id}/reject`, adminToken, "POST", {
    opinion: "不同意豁免",
    reject_reason: "缺少审批材料"
  }, "waiver-reject");
  assertStatus("reject waiver", rejectResult.response.status, 201);
  assert(rejectResult.body.data.status === "40", "rejected waiver should become status 40");
  assert(rejectResult.body.data.rejectReason === "缺少审批材料", "reject_reason should be persisted");
  assert(rejectResult.body.data.approveRecords.some((record) => record.action === "reject"), "approve_records should include reject action");

  const listWaivers = await request(`/leasing/waivers?keyword=${encodeURIComponent("争议金额")}`, {
    headers: { authorization: `Bearer ${adminToken}` }
  });
  assertStatus("list waivers", listWaivers.response.status, 200);
  assertUniformResponse("list waivers", listWaivers.body);
  assert(listWaivers.body.data.items.length >= 1, "waiver list should include created rows");

  const statusLogCount = Number(await dbScalar(`
SELECT count(*)
FROM biz_leasing_receivable_status_log
WHERE tenant_id = ${sqlLiteral(tenantId)}
  AND park_id = ${sqlLiteral(parkId)}
  AND receivable_id = ${sqlLiteral(receivable.id)}::uuid
  AND action = 'waiver_approve'
  AND is_deleted = false;`));
  assert(statusLogCount >= 2, "waiver approval should create receivable status logs");

  const opLogCount = Number(await dbScalar(`
SELECT count(*)
FROM sys_op_log
WHERE tenant_id = ${sqlLiteral(tenantId)}
  AND park_id = ${sqlLiteral(parkId)}
  AND biz_type = 'biz_leasing_waiver'
  AND action IN ('新增', '审批通过', '审批驳回')
  AND op_time >= now() - interval '10 minutes';`));
  assert(opLogCount >= 5, "waiver create/approve/reject should create sys_op_log records");

  logStep("S3-D waiver smoke passed");
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
