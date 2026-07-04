#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomBytes } from "node:crypto";

const repoRoot = resolve(new URL("..", import.meta.url).pathname);
const envFile = resolve(repoRoot, ".env.production");
const composeFile = resolve(repoRoot, "infra/docker/docker-compose.prod.yml");
const defaultCredentialsFile = resolve(repoRoot, "database/import-reports/go-live-all-users.local.csv");
const defaultReportFile = resolve(repoRoot, "database/import-reports/go-live-role-flow-report.local.json");

const apiBase = readArg("--api-base") ?? "http://127.0.0.1:4330/api/v1";
const credentialsFile = resolve(repoRoot, readArg("--credentials") ?? defaultCredentialsFile);
const reportFile = resolve(repoRoot, readArg("--report-file") ?? defaultReportFile);

const tenantId = "10000001";
const parkId = "20000001";

const requiredUsers = [
  { username: "admin", displayName: "管理员" },
  { username: "song_qianchang", displayName: "宋乾昌" },
  { username: "shao_minghong", displayName: "邵明洪" },
  { username: "chen_guohui", displayName: "陈国辉" },
  { username: "zheng_ziyong", displayName: "郑子勇" },
  { username: "li_rongjie", displayName: "李荣杰" },
  { username: "liu_hantao", displayName: "刘汉涛" }
];

const failures = [];
const warnings = [];
const steps = [];

if (!existsSync(envFile)) {
  fail(`missing production env file: ${envFile}`);
}
if (!existsSync(credentialsFile)) {
  fail(`missing credentials file: ${credentialsFile}`);
}

const runStamp = buildRunStamp();
const runId = `UAT-ROLE-${runStamp}-${randomBytes(2).toString("hex").toUpperCase()}`;
const today = new Date();
const reportDate = today.toISOString().slice(0, 10);
const plannedEndDate = addDays(reportDate, 7);

const report = {
  run_id: runId,
  checked_at: new Date().toISOString(),
  status: "FAIL",
  api_base: apiBase,
  credentials_file: credentialsFile,
  report_file: reportFile,
  steps,
  warnings,
  failures
};

if (failures.length === 0) {
  await runRoleFlow();
}

report.status = failures.length === 0 ? "PASS" : "FAIL";
mkdirSync(dirname(reportFile), { recursive: true });
writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
console.log(JSON.stringify(report, null, 2));
if (failures.length > 0) process.exitCode = 1;

async function runRoleFlow() {
  const credentials = readCredentials(credentialsFile);
  const userSnapshots = loadUserSnapshots(requiredUsers.map((user) => user.username));
  const workOrderDict = loadWorkOrderDictionary();

  const sessions = new Map();
  for (const user of requiredUsers) {
    const snapshot = userSnapshots.get(user.username);
    const password = credentials.get(user.username);
    if (!snapshot) {
      fail(`missing enabled user snapshot for ${user.username}`);
      continue;
    }
    if (!password) {
      fail(`missing password for ${user.username}`);
      continue;
    }
    const session = await login(user.username, password);
    if (!session) continue;
    sessions.set(user.username, { ...snapshot, ...session });
  }

  const admin = sessions.get("admin");
  const song = sessions.get("song_qianchang");
  const shao = sessions.get("shao_minghong");
  const chen = sessions.get("chen_guohui");
  const zheng = sessions.get("zheng_ziyong");
  const li = sessions.get("li_rongjie");
  const liu = sessions.get("liu_hantao");

  if (!admin || !song || !shao || !chen || !zheng || !li || !liu) {
    fail("one or more required users failed to log in; role-flow UAT aborted");
    return;
  }

  const createdProject = await createProject(admin, li, zheng);
  if (!createdProject?.id) return;

  const projectId = createdProject.id;
  await transitionProject(admin, projectId, "SUBMIT", "UAT 提交工程立项");
  await transitionProject(admin, projectId, "APPROVE", "UAT 批准工程立项");
  await transitionProject(admin, projectId, "START_PLANNING", "UAT 进入工程计划");
  await transitionProject(admin, projectId, "START_EXECUTION", "UAT 进入施工执行");

  const zhengProjectCheck = await requestJson(`${apiBase}/engineering/projects/${projectId}`, { token: zheng.token });
  assertSuccess("zheng_project_visibility", zhengProjectCheck, "郑子勇可读取自己负责的工程项目", {
    actor: zheng.username,
    project_id: projectId
  });
  if (!isSuccess(zhengProjectCheck)) return;

  const lead = await createLeasingLead(song);
  if (lead?.id) {
    await createLeasingFollow(song, lead.id);
  }

  const workOrder = await createWorkOrder(shao, workOrderDict);
  if (workOrder?.id) {
    await assignWorkOrder(chen, workOrder.id, zheng.id);
  }

  const dailyReport = await createDailyReport(zheng, projectId);
  if (dailyReport?.id) {
    await submitDailyReport(zheng, dailyReport.id);
    await reviewDailyReport(li, dailyReport.id);
  }

  await verifyFinanceReads(liu);
}

async function login(username, password) {
  const response = await requestJson(`${apiBase}/auth/login`, {
    method: "POST",
    body: { tenantId, parkId, username, password }
  });
  const accessToken = response.body?.data?.accessToken;
  assertSuccess("login", response, `${username} 登录`, { username });
  if (!isSuccess(response) || !accessToken) return null;

  const me = await requestJson(`${apiBase}/users/me`, { token: accessToken });
  assertSuccess("users_me", me, `${username} 读取 /users/me`, { username });
  if (!isSuccess(me)) return null;

  return {
    token: accessToken,
    me: me.body?.data ?? null
  };
}

async function createProject(admin, director, manager) {
  const response = await requestJson(`${apiBase}/engineering/projects`, {
    method: "POST",
    token: admin.token,
    idempotencyKey: buildIdempotencyKey("engineering-project-create"),
    body: {
      project_name: `${runId} 消防联动整改工程`,
      project_type: "FIRE_PROTECTION",
      planned_start_date: reportDate,
      planned_end_date: plannedEndDate,
      project_manager_id: manager.id,
      project_level: "NORMAL",
      project_source: "UAT_ROLE_FLOW",
      description: `${runId} 角色业务链验证工程项目`,
      location_text: "A1 楼 1F 视频联动与消防通道",
      budget_amount: 50000,
      engineering_director_id: director.id,
      risk_level: "MEDIUM",
      remark: "go-live role flow uat"
    }
  });
  assertSuccess("engineering_project_create", response, "管理员创建工程项目", { actor: admin.username });
  return unwrapData(response);
}

async function transitionProject(admin, projectId, action, reason) {
  const response = await requestJson(`${apiBase}/engineering/projects/${projectId}/actions/${action}`, {
    method: "POST",
    token: admin.token,
    idempotencyKey: buildIdempotencyKey(`engineering-project-${action.toLowerCase()}`),
    body: {
      reason,
      comment: `${runId} ${reason}`
    }
  });
  assertSuccess(`engineering_project_${action.toLowerCase()}`, response, `管理员执行工程项目动作 ${action}`, {
    actor: admin.username,
    project_id: projectId,
    action
  });
  return unwrapData(response);
}

async function createLeasingLead(song) {
  const response = await requestJson(`${apiBase}/leasing/leads`, {
    method: "POST",
    token: song.token,
    idempotencyKey: buildIdempotencyKey("leasing-lead-create"),
    body: {
      customerName: `${runId} 招商意向客户`,
      contactName: "UAT 联系人",
      contactMobile: "13800000001",
      industryDetail: "工程联动上线测试",
      remark: "go-live role flow uat"
    }
  });
  assertSuccess("leasing_lead_create", response, "招商负责人创建招商线索", { actor: song.username });
  return unwrapData(response);
}

async function createLeasingFollow(song, leadId) {
  const response = await requestJson(`${apiBase}/leasing/leads/${leadId}/follows`, {
    method: "POST",
    token: song.token,
    idempotencyKey: buildIdempotencyKey("leasing-follow-create"),
    body: {
      content: `${runId} 已完成首轮跟进，确认入园需求和施工衔接计划`,
      nextAction: "预约现场踏勘",
      remark: "go-live role flow uat"
    }
  });
  assertSuccess("leasing_follow_create", response, "招商负责人新增跟进记录", {
    actor: song.username,
    lead_id: leadId
  });
  return unwrapData(response);
}

async function createWorkOrder(shao, dict) {
  const response = await requestJson(`${apiBase}/work-orders`, {
    method: "POST",
    token: shao.token,
    idempotencyKey: buildIdempotencyKey("work-order-create"),
    body: {
      title: `${runId} 施工通道照明检修`,
      wo_type: dict.woType,
      priority: dict.priority,
      urgency: dict.urgency,
      source_type: "manual",
      reporter_name: shao.displayName,
      reporter_mobile: "13800000002",
      location: "A1 楼 1F 施工通道",
      description: `${runId} 模拟工程现场报修并验证派单链路`,
      remark: "go-live role flow uat"
    }
  });
  assertSuccess("work_order_create", response, "项目经理创建现场工单", {
    actor: shao.username,
    wo_type: dict.woType,
    priority: dict.priority,
    urgency: dict.urgency
  });
  return unwrapData(response);
}

async function assignWorkOrder(chen, workOrderId, assigneeId) {
  const response = await requestJson(`${apiBase}/work-orders/${workOrderId}/assign`, {
    method: "POST",
    token: chen.token,
    idempotencyKey: buildIdempotencyKey("work-order-assign"),
    body: {
      assignee_id: assigneeId,
      reason: `${runId} 交由机电工程师处理`
    }
  });
  assertSuccess("work_order_assign", response, "物业现场负责人派单", {
    actor: chen.username,
    work_order_id: workOrderId,
    assignee_id: assigneeId
  });
  return unwrapData(response);
}

async function createDailyReport(zheng, projectId) {
  const response = await requestJson(`${apiBase}/engineering/daily-reports`, {
    method: "POST",
    token: zheng.token,
    idempotencyKey: buildIdempotencyKey("engineering-daily-report-create"),
    body: {
      project_id: projectId,
      report_date: reportDate,
      weather: "SUNNY",
      temperature: "28-34℃",
      work_content: `${runId} 完成消防桥架检查与视频联动测试`,
      completed_work: "桥架复核、线缆整理、联动联测",
      unfinished_work: "局部标识优化待完成",
      tomorrow_plan: "补充标识与二次测试",
      worker_count: 8,
      manager_count: 2,
      machine_summary: "登高车 1 台",
      material_summary: "线槽、标识牌若干",
      quality_summary: "抽检正常",
      safety_summary: "安全交底完成，现场无违章",
      issue_summary: "暂无重大问题",
      progress_percent: 15,
      remark: "go-live role flow uat"
    }
  });
  assertSuccess("engineering_daily_report_create", response, "机电工程师创建施工日报", {
    actor: zheng.username,
    project_id: projectId
  });
  return unwrapData(response);
}

async function submitDailyReport(zheng, reportId) {
  const response = await requestJson(`${apiBase}/engineering/daily-reports/${reportId}/submit`, {
    method: "POST",
    token: zheng.token,
    idempotencyKey: buildIdempotencyKey("engineering-daily-report-submit"),
    body: {}
  });
  assertSuccess("engineering_daily_report_submit", response, "机电工程师提交施工日报", {
    actor: zheng.username,
    daily_report_id: reportId
  });
  return unwrapData(response);
}

async function reviewDailyReport(li, reportId) {
  const response = await requestJson(`${apiBase}/engineering/daily-reports/${reportId}/review`, {
    method: "POST",
    token: li.token,
    idempotencyKey: buildIdempotencyKey("engineering-daily-report-review"),
    body: {
      approved: true,
      review_comment: `${runId} UAT 审核通过`
    }
  });
  assertSuccess("engineering_daily_report_review", response, "工程物管负责人审核施工日报", {
    actor: li.username,
    daily_report_id: reportId
  });
  return unwrapData(response);
}

async function verifyFinanceReads(liu) {
  const receivables = await requestJson(`${apiBase}/leasing/receivables?page=1&page_size=5`, { token: liu.token });
  assertSuccess("finance_receivables_read", receivables, "财务负责人读取应收台账", { actor: liu.username });

  const payments = await requestJson(`${apiBase}/leasing/payments?page=1&page_size=5`, { token: liu.token });
  assertSuccess("finance_payments_read", payments, "财务负责人读取收款台账", { actor: liu.username });
}

function loadUserSnapshots(usernames) {
  const rows = psql(`
SELECT
  u.username,
  u.id,
  COALESCE(NULLIF(u.display_name, ''), u.username) AS display_name
FROM sys_user u
WHERE u.tenant_id = ${sqlString(tenantId)}
  AND u.park_id = ${sqlString(parkId)}
  AND u.is_deleted = false
  AND u.is_enabled = true
  AND u.status = 'enabled'
  AND u.username IN (${usernames.map(sqlString).join(", ")})
ORDER BY u.username;
`);
  const result = new Map();
  for (const row of rows) {
    const [username, id, displayName] = row.split("|");
    result.set(username, { username, id, displayName });
  }
  return result;
}

function loadWorkOrderDictionary() {
  const rows = psql(`
SELECT dt.dict_code, di.item_label, di.item_value
FROM sys_dict_type dt
JOIN sys_dict_item di
  ON di.dict_type_id = dt.id
 AND di.tenant_id = dt.tenant_id
 AND di.park_id = dt.park_id
WHERE dt.tenant_id = ${sqlString(tenantId)}
  AND dt.park_id = ${sqlString(parkId)}
  AND dt.is_deleted = false
  AND di.is_deleted = false
  AND dt.status = 'enabled'
  AND di.status = 'enabled'
  AND dt.dict_code IN ('workorder_type', 'workorder_priority', 'workorder_urgency')
ORDER BY dt.dict_code, di.sort_order ASC, di.item_value ASC;
`);
  const dict = {
    woType: pickDictValue(rows, "workorder_type", ["repair", "service"], ["报修", "服务申请"]),
    priority: pickDictValue(rows, "workorder_priority", ["20", "medium", "30"], ["普通", "高"]),
    urgency: pickDictValue(rows, "workorder_urgency", ["normal", "10", "urgent"], ["一般", "紧急"])
  };
  if (!dict.woType || !dict.priority || !dict.urgency) {
    fail(`failed to resolve work order dictionary values: ${JSON.stringify(dict)}`);
  }
  return dict;
}

function pickDictValue(rows, dictCode, preferredValues, preferredLabels) {
  const items = rows
    .map((row) => {
      const [code, label, value] = row.split("|");
      return { code, label, value };
    })
    .filter((item) => item.code === dictCode);
  for (const value of preferredValues) {
    const match = items.find((item) => item.value === value);
    if (match) return match.value;
  }
  for (const label of preferredLabels) {
    const match = items.find((item) => item.label === label);
    if (match) return match.value;
  }
  return items[0]?.value ?? null;
}

function assertSuccess(stepId, response, summary, detail = {}) {
  const status = isSuccess(response) ? "PASS" : "FAIL";
  steps.push({
    step_id: stepId,
    status,
    summary,
    http_status: response.status,
    detail: {
      ...detail,
      response_message: summarizeBody(response.body)
    }
  });
  if (status === "FAIL") {
    fail(`${stepId} failed (${response.status}): ${summarizeBody(response.body)}`);
  }
}

function isSuccess(response) {
  return response.status >= 200 && response.status < 300;
}

function unwrapData(response) {
  return response?.body?.data ?? null;
}

function summarizeBody(body) {
  if (!body) return null;
  if (typeof body === "string") return body.slice(0, 240);
  if (typeof body === "object") {
    return body.message ?? body.error ?? body.code ?? JSON.stringify(body).slice(0, 240);
  }
  return String(body).slice(0, 240);
}

function readCredentials(file) {
  const content = readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  const [headerLine, ...lines] = content.split(/\r?\n/).filter(Boolean);
  const headers = parseCsvLine(headerLine);
  const usernameIndex = headers.indexOf("username");
  const passwordIndex = headers.findIndex((header) => ["uat_password", "initial_password", "password"].includes(header));
  if (usernameIndex < 0 || passwordIndex < 0) {
    throw new Error(`credentials file must include username and password column: ${file}`);
  }
  const credentials = new Map();
  for (const line of lines) {
    const cells = parseCsvLine(line);
    const username = cells[usernameIndex];
    const password = cells[passwordIndex];
    if (username && password && password !== "保留原密码") credentials.set(username, password);
  }
  return credentials;
}

async function requestJson(url, options = {}) {
  const isWrite = new Set(["POST", "PATCH", "PUT", "DELETE"]).has((options.method ?? "GET").toUpperCase());
  const headers = {
    accept: "application/json",
    ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
    ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
    ...(options.idempotencyKey || isWrite ? { "x-idempotency-key": options.idempotencyKey ?? buildIdempotencyKey("write") } : {})
  };
  try {
    const response = await fetch(url, {
      method: options.method ?? "GET",
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  } catch (error) {
    return { status: 0, body: { message: error instanceof Error ? error.message : String(error) } };
  }
}

function psql(sql) {
  const command = `
set -a
. ${shellQuote(envFile)}
set +a
docker compose --env-file ${shellQuote(envFile)} -f ${shellQuote(composeFile)} exec -T postgres \\
  psql -X -A -t -F '|' -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"
`;
  const output = execFileSync("sh", ["-lc", command], {
    cwd: repoRoot,
    input: sql,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 10
  });
  return output.split(/\r?\n/).filter((line) => line.length > 0);
}

function fail(message) {
  failures.push(message);
}

function buildRunStamp() {
  const now = new Date();
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds())
  ].join("");
}

function addDays(dateText, days) {
  const base = new Date(`${dateText}T00:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

function buildIdempotencyKey(prefix) {
  return `${prefix}-${runId}-${randomBytes(4).toString("hex")}`;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quoted) {
      if (char === '"' && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}
