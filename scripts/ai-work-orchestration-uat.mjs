#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(new URL("..", import.meta.url).pathname);
const apiBase = readArg("--api-base") ?? "http://127.0.0.1:4330/api/v1";
const credentialsFile = resolve(repoRoot, readArg("--credentials") ?? "database/import-reports/go-live-all-users.local.csv");
const reportFile = resolve(repoRoot, readArg("--report-file") ?? "database/import-reports/ai-work-orchestration-uat-report.local.json");
const tenantId = "10000001";
const parkId = "20000001";
const runId = `UAT-AI-WORK-${new Date().toISOString().replace(/[-:.]/g, "").slice(0, 15)}`;
const steps = [];
const failures = [];

if (!existsSync(credentialsFile)) fail(`missing credentials file: ${credentialsFile}`);

const credentials = readCredentials(credentialsFile);
const admin = await login("admin", credentials.get("admin"));
const zheng = await login("zheng_ziyong", credentials.get("zheng_ziyong"));
const shao = await login("shao_minghong", credentials.get("shao_minghong"));

let planId = null;
let workOrderIds = [];
if (admin && zheng && shao) {
  const created = await request("/ai/work-plans", {
    method: "POST",
    token: admin.token,
    idempotencyKey: `${runId}-create`,
    body: {
      instruction: `请郑子勇负责明天完成 A1 楼配电室设备检查并提交现场照片，邵明洪完成后复核，任务标识 ${runId}。`,
      location: "A1 楼配电室"
    }
  });
  assertSuccess("create_plan", created, "自然语言生成工作计划");
  planId = created.body?.data?.plan?.id ?? null;
  const tasks = created.body?.data?.tasks ?? [];
  if (tasks.length < 2) fail("planner did not create at least two tasks");
  if (!tasks.every((task) => task.confirmedAssigneeId && task.dueAt)) fail("planner did not resolve assignees and deadlines");

  if (planId) {
    const approved = await request(`/ai/work-plans/${planId}/approve`, {
      method: "POST",
      token: admin.token,
      idempotencyKey: `${runId}-approve`,
      body: { comment: "UAT 审核通过" }
    });
    assertSuccess("approve_plan", approved, "管理人员批准工作计划");
    if (approved.body?.data?.plan?.status !== "APPROVED") fail("approved plan status mismatch");

    const materialized = await request(`/ai/work-plans/${planId}/materialize`, {
      method: "POST",
      token: admin.token,
      idempotencyKey: `${runId}-materialize`,
      body: { confirm: true }
    });
    assertSuccess("materialize_plan", materialized, "批准计划生成真实工单");
    workOrderIds = (materialized.body?.data?.tasks ?? []).map((task) => task.workOrderId).filter(Boolean);
    if (workOrderIds.length !== tasks.length) fail("not every plan task produced a work order");

    const replay = await request(`/ai/work-plans/${planId}/materialize`, {
      method: "POST",
      token: admin.token,
      idempotencyKey: `${runId}-materialize-retry`,
      body: { confirm: true }
    });
    assertSuccess("materialize_idempotent", replay, "重复生成不产生重复工单");
    const replayIds = (replay.body?.data?.tasks ?? []).map((task) => task.workOrderId).filter(Boolean);
    if (JSON.stringify(replayIds) !== JSON.stringify(workOrderIds)) fail("materialize retry changed work order ids");

    await verifyInbox(zheng, "郑子勇");
    await verifyInbox(shao, "邵明洪");
  }
}

const report = {
  run_id: runId,
  checked_at: new Date().toISOString(),
  status: failures.length === 0 ? "PASS" : "FAIL",
  api_base: apiBase,
  plan_id: planId,
  work_order_ids: workOrderIds,
  steps,
  failures
};
mkdirSync(dirname(reportFile), { recursive: true });
writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify(report, null, 2));
if (failures.length > 0) process.exitCode = 1;

async function verifyInbox(session, displayName) {
  const inbox = await request("/workflow/inbox", { token: session.token });
  assertSuccess(`inbox_${session.username}`, inbox, `${displayName}读取个人流程收件箱`);
  const matchingTodos = (inbox.body?.data?.todos ?? []).filter((todo) => workOrderIds.includes(todo.sourceId));
  if (matchingTodos.length === 0) fail(`${displayName} workflow inbox did not contain generated work order`);
  else pass(`inbox_assignment_${session.username}`, `${displayName}收到 AI 工作计划派发工单`, { todo_count: matchingTodos.length });
}

async function login(username, password) {
  if (!password) {
    fail(`missing password for ${username}`);
    return null;
  }
  const result = await request("/auth/login", {
    method: "POST",
    body: { tenantId, parkId, username, password }
  });
  assertSuccess(`login_${username}`, result, `${username} 登录`);
  const token = result.body?.data?.accessToken;
  if (!token) {
    fail(`login token missing for ${username}`);
    return null;
  }
  return { username, token };
}

async function request(path, options = {}) {
  const headers = { Accept: "application/json" };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.idempotencyKey) headers["X-Idempotency-Key"] = options.idempotencyKey;
  try {
    const response = await fetch(`${apiBase}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });
    const body = await response.json().catch(() => null);
    return { status: response.status, body };
  } catch (error) {
    return { status: 0, body: { message: error instanceof Error ? error.message : String(error) } };
  }
}

function assertSuccess(id, result, summary) {
  if (result.status >= 200 && result.status < 300 && result.body?.code === 0) pass(id, summary, { http_status: result.status });
  else fail(`${summary}: HTTP ${result.status} ${result.body?.message ?? "unknown error"}`);
}

function pass(id, summary, detail = {}) {
  steps.push({ id, status: "PASS", summary, ...detail });
}

function fail(message) {
  failures.push(message);
  console.error(`FAIL: ${message}`);
}

function readCredentials(file) {
  const lines = readFileSync(file, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  const headers = parseCsvLine(lines.shift() ?? "");
  const usernameIndex = headers.findIndex((value) => value === "username");
  const passwordIndex = headers.findIndex((value) => ["uat_password", "initial_password", "password"].includes(value));
  if (usernameIndex < 0 || passwordIndex < 0) throw new Error("credentials CSV requires username and password columns");
  return new Map(lines.map((line) => {
    const cells = parseCsvLine(line);
    return [cells[usernameIndex], cells[passwordIndex]];
  }).filter(([username, password]) => username && password));
}

function parseCsvLine(line) {
  const cells = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(value);
      value = "";
    } else value += char;
  }
  cells.push(value);
  return cells;
}

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
