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
const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WnSUs8AAAAASUVORK5CYII=",
  "base64"
);

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
  const projectSubmitMessage = await verifyEngineeringMessage(li, {
    stepId: "engineering_message_project_submit",
    summary: "工程负责人收到立项待审批消息",
    titleIncludes: "工程立项待审批",
    hrefIncludes: `/engineering/projects/${projectId}`,
    contentIncludes: createdProject.projectCode ?? runId
  });
  await verifyEngineeringMessageReadFlow(li, projectSubmitMessage, {
    stepId: "engineering_message_project_submit_read",
    summary: "工程负责人可将立项待审批消息标记为已读"
  });
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

  await transitionProject(admin, projectId, "START_INSPECTION", "UAT 进入工程巡检");

  const inspection = await createInspection(zheng, projectId);
  if (inspection?.id) {
    await submitInspection(zheng, inspection.id);

    const issue = await createInspectionIssue(zheng, inspection.id, projectId, shao.id);
    if (issue?.id) {
      const issueMessage = await verifyEngineeringMessage(shao, {
        stepId: "engineering_message_issue_create",
        summary: "整改责任人收到工程问题待处理消息",
        titleIncludes: "工程问题待处理",
        hrefIncludes: `/engineering/inspections?issueId=${issue.id}`,
        contentIncludes: issue.issueCode ?? runId
      });
      await verifyEngineeringMessageReadFlow(shao, issueMessage, {
        stepId: "engineering_message_issue_create_read",
        summary: "整改责任人可将工程问题消息标记为已读"
      });
      await transitionProject(admin, projectId, "REQUIRE_RECTIFICATION", "UAT 巡检发现问题进入整改");

      const rectification = await generateRectificationFromIssue(admin, issue.id, shao.id);
      if (rectification?.id) {
        const rectificationMessage = await verifyEngineeringMessage(shao, {
          stepId: "engineering_message_rectification_create",
          summary: "整改责任人收到整改任务待处理消息",
          titleIncludes: "整改任务待处理",
          hrefIncludes: `/engineering/rectifications/${rectification.id}`,
          contentIncludes: rectification.rectificationCode ?? runId
        });
        await verifyEngineeringMessageReadFlow(shao, rectificationMessage, {
          stepId: "engineering_message_rectification_create_read",
          summary: "整改责任人可将整改任务消息标记为已读"
        });
        await executeRectificationAction(shao, rectification.id, "START", {
          reason: "UAT 开始整改",
          comment: `${runId} 责任人开始现场整改`
        });
        await executeRectificationAction(shao, rectification.id, "SUBMIT", {
          reason: "UAT 提交整改反馈",
          comment: `${runId} 已完成整改并提交复查`,
          feedback: "已加固消防支架，补充固定件并完成复测。"
        });
        await executeRectificationAction(chen, rectification.id, "START_RECHECK", {
          reason: "UAT 发起复查",
          comment: `${runId} 物业现场负责人开始复查`
        });
        await executeRectificationAction(chen, rectification.id, "PASS", {
          reason: "UAT 复查通过",
          comment: `${runId} 复查通过，允许关闭`,
          recheck_comment: "现场复核通过，整改结果满足交付要求。"
        });
        await executeRectificationAction(admin, rectification.id, "CLOSE", {
          reason: "UAT 关闭整改",
          comment: `${runId} 管理员关闭整改任务`
        });
        await verifyIssueClosed(admin, issue.id);
        await transitionProject(admin, projectId, "START_INSPECTION", "UAT 整改关闭后回到巡检状态");

        await transitionProject(admin, projectId, "START_ACCEPTANCE", "UAT 进入工程验收");
        const acceptanceAttachment = await uploadAttachment(shao, {
          bizType: "engineering_acceptance",
          bizId: projectId,
          filename: `${runId}-acceptance.png`,
          mimeType: "image/png",
          buffer: tinyPng,
          remark: `${runId} 工程验收现场照片`
        });
        const acceptance = await createAcceptance(shao, projectId, li.id, acceptanceAttachment?.id ? [acceptanceAttachment.id] : []);
        if (acceptance?.id) {
          if (acceptanceAttachment?.id) {
            await verifyAcceptanceAttachments(admin, acceptance.id, [acceptanceAttachment.id]);
          }
          const acceptanceCreateMessage = await verifyEngineeringMessage(li, {
            stepId: "engineering_message_acceptance_create",
            summary: "验收负责人收到工程验收待处理消息",
            titleIncludes: "工程验收待处理",
            hrefIncludes: `/engineering/acceptances/${acceptance.id}`,
            contentIncludes: acceptance.acceptanceCode ?? runId
          });
          await verifyEngineeringMessageReadFlow(li, acceptanceCreateMessage, {
            stepId: "engineering_message_acceptance_create_read",
            summary: "验收负责人可将工程验收待处理消息标记为已读"
          });
          await submitAcceptance(shao, acceptance.id);
          const acceptanceSubmitMessage = await verifyEngineeringMessage(li, {
            stepId: "engineering_message_acceptance_submit",
            summary: "验收负责人收到工程验收已提交消息",
            titleIncludes: "工程验收已提交",
            hrefIncludes: `/engineering/acceptances/${acceptance.id}`,
            contentIncludes: acceptance.acceptanceCode ?? runId
          });
          await verifyEngineeringMessageReadFlow(li, acceptanceSubmitMessage, {
            stepId: "engineering_message_acceptance_submit_read",
            summary: "验收负责人可将工程验收已提交消息标记为已读"
          });
          await reviewAcceptance(li, acceptance.id);
          await closeAcceptance(admin, acceptance.id);
          await verifyAcceptanceClosed(admin, acceptance.id);
          await transitionProject(admin, projectId, "ACCEPTANCE_PASSED", "UAT 工程验收通过");
          await verifyProjectStatus(admin, projectId, "ACCEPTED", "工程项目状态进入已验收");
        }
      }
    }
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

async function createInspection(zheng, projectId) {
  const response = await requestJson(`${apiBase}/engineering/inspections`, {
    method: "POST",
    token: zheng.token,
    idempotencyKey: buildIdempotencyKey("engineering-inspection-create"),
    body: {
      project_id: projectId,
      inspection_title: `${runId} 消防联动巡检`,
      inspection_type: "SAFETY",
      inspection_date: reportDate,
      inspector_user_id: zheng.id,
      location_text: "A1 楼 1F 消防通道与视频联动点位",
      summary: `${runId} 巡检消防支架、通道和视频联动状态`,
      overall_result: "FOUND_ISSUE",
      issue_count: 0,
      critical_issue_count: 0,
      remark: "go-live role flow uat"
    }
  });
  assertSuccess("engineering_inspection_create", response, "机电工程师创建工程巡检", {
    actor: zheng.username,
    project_id: projectId
  });
  return unwrapData(response);
}

async function submitInspection(zheng, inspectionId) {
  const response = await requestJson(`${apiBase}/engineering/inspections/${inspectionId}/submit`, {
    method: "POST",
    token: zheng.token,
    idempotencyKey: buildIdempotencyKey("engineering-inspection-submit"),
    body: {}
  });
  assertSuccess("engineering_inspection_submit", response, "机电工程师提交工程巡检", {
    actor: zheng.username,
    inspection_id: inspectionId
  });
  return unwrapData(response);
}

async function createInspectionIssue(zheng, inspectionId, projectId, responsibleUserId) {
  const response = await requestJson(`${apiBase}/engineering/inspections/${inspectionId}/issues`, {
    method: "POST",
    token: zheng.token,
    idempotencyKey: buildIdempotencyKey("engineering-issue-create"),
    body: {
      project_id: projectId,
      issue_title: `${runId} 消防支架松动隐患`,
      issue_type: "SAFETY",
      severity: "HIGH",
      description: "A1 楼 1F 局部消防支架固定不牢，需要立即加固并复测。",
      responsible_user_id: responsibleUserId,
      deadline: plannedEndDate,
      source_type: "INSPECTION",
      remark: "go-live role flow uat"
    }
  });
  assertSuccess("engineering_issue_create", response, "机电工程师登记巡检问题", {
    actor: zheng.username,
    inspection_id: inspectionId,
    project_id: projectId
  });
  return unwrapData(response);
}

async function generateRectificationFromIssue(admin, issueId, responsibleUserId) {
  const response = await requestJson(`${apiBase}/engineering/issues/${issueId}/generate-rectification`, {
    method: "POST",
    token: admin.token,
    idempotencyKey: buildIdempotencyKey("engineering-rectification-generate"),
    body: {
      rectification_title: `${runId} 消防支架整改任务`,
      description: "按巡检隐患要求完成支架加固、复测和结果反馈。",
      responsible_user_id: responsibleUserId,
      deadline: plannedEndDate,
      remark: "go-live role flow uat"
    }
  });
  assertSuccess("engineering_rectification_generate", response, "管理员从巡检问题生成整改任务", {
    actor: admin.username,
    issue_id: issueId
  });
  return unwrapData(response);
}

async function createAcceptance(actor, projectId, responsibleUserId, attachmentIds = []) {
  const response = await requestJson(`${apiBase}/engineering/acceptances`, {
    method: "POST",
    token: actor.token,
    idempotencyKey: buildIdempotencyKey("engineering-acceptance-create"),
    body: {
      project_id: projectId,
      acceptance_name: `${runId} 消防联动竣工验收`,
      acceptance_type: "COMPLETION",
      planned_acceptance_date: reportDate,
      risk_level: "MEDIUM",
      description: "验证消防联动整改后的现场状态与交付质量。",
      acceptance_scope: "消防桥架、固定件、视频联动点位、现场标识",
      acceptance_criteria: "整改完成、复测通过、资料齐全、具备交付条件",
      responsible_user_id: responsibleUserId,
      location_text: "A1 楼 1F 消防通道与视频联动区域",
      attachment_ids: attachmentIds.length > 0 ? attachmentIds : undefined
    }
  });
  assertSuccess("engineering_acceptance_create", response, `${actor.displayName} 创建工程验收`, {
    actor: actor.username,
    project_id: projectId
  });
  return unwrapData(response);
}

async function submitAcceptance(actor, acceptanceId) {
  const response = await requestJson(`${apiBase}/engineering/acceptances/${acceptanceId}/submit`, {
    method: "POST",
    token: actor.token,
    idempotencyKey: buildIdempotencyKey("engineering-acceptance-submit"),
    body: {}
  });
  assertSuccess("engineering_acceptance_submit", response, `${actor.displayName} 提交工程验收`, {
    actor: actor.username,
    acceptance_id: acceptanceId
  });
  return unwrapData(response);
}

async function reviewAcceptance(actor, acceptanceId) {
  const response = await requestJson(`${apiBase}/engineering/acceptances/${acceptanceId}/review`, {
    method: "POST",
    token: actor.token,
    idempotencyKey: buildIdempotencyKey("engineering-acceptance-review"),
    body: {
      passed: true,
      actual_acceptance_date: reportDate,
      result_summary: "验收通过，可进入交付后续阶段。",
      review_comment: `${runId} UAT 验收通过`
    }
  });
  assertSuccess("engineering_acceptance_review", response, `${actor.displayName} 评审工程验收`, {
    actor: actor.username,
    acceptance_id: acceptanceId
  });
  return unwrapData(response);
}

async function closeAcceptance(actor, acceptanceId) {
  const response = await requestJson(`${apiBase}/engineering/acceptances/${acceptanceId}/close`, {
    method: "POST",
    token: actor.token,
    idempotencyKey: buildIdempotencyKey("engineering-acceptance-close"),
    body: {}
  });
  assertSuccess("engineering_acceptance_close", response, `${actor.displayName} 关闭工程验收`, {
    actor: actor.username,
    acceptance_id: acceptanceId
  });
  return unwrapData(response);
}

async function executeRectificationAction(user, rectificationId, action, body) {
  const response = await requestJson(`${apiBase}/engineering/rectifications/${rectificationId}/actions`, {
    method: "POST",
    token: user.token,
    idempotencyKey: buildIdempotencyKey(`engineering-rectification-${action.toLowerCase()}`),
    body: {
      action,
      ...body
    }
  });
  assertSuccess(`engineering_rectification_${action.toLowerCase()}`, response, `${user.displayName} 执行整改动作 ${action}`, {
    actor: user.username,
    rectification_id: rectificationId,
    action
  });
  return unwrapData(response);
}

async function verifyIssueClosed(admin, issueId) {
  const response = await requestJson(`${apiBase}/engineering/issues/${issueId}`, {
    token: admin.token
  });
  assertSuccess("engineering_issue_detail_after_close", response, "管理员回读整改问题状态", {
    actor: admin.username,
    issue_id: issueId
  });
  if (!isSuccess(response)) return null;

  const issue = unwrapData(response);
  const issueStatus = issue?.issueStatus ?? issue?.issue_status ?? null;
  assertCheck("engineering_issue_closed", issueStatus === "CLOSED", "整改问题状态已关闭", {
    issue_id: issueId,
    issue_status: issueStatus
  });
  return issue;
}

async function verifyAcceptanceClosed(admin, acceptanceId) {
  const response = await requestJson(`${apiBase}/engineering/acceptances/${acceptanceId}`, {
    token: admin.token
  });
  assertSuccess("engineering_acceptance_detail_after_close", response, "管理员回读工程验收状态", {
    actor: admin.username,
    acceptance_id: acceptanceId
  });
  if (!isSuccess(response)) return null;

  const acceptance = unwrapData(response);
  const acceptanceStatus = acceptance?.acceptanceStatus ?? acceptance?.acceptance_status ?? null;
  assertCheck("engineering_acceptance_closed", acceptanceStatus === "CLOSED", "工程验收状态已关闭", {
    acceptance_id: acceptanceId,
    acceptance_status: acceptanceStatus
  });
  return acceptance;
}

async function verifyAcceptanceAttachments(admin, acceptanceId, attachmentIds) {
  const response = await requestJson(`${apiBase}/engineering/acceptances/${acceptanceId}`, {
    token: admin.token
  });
  assertSuccess("engineering_acceptance_detail_with_attachment", response, "管理员回读工程验收附件关联", {
    actor: admin.username,
    acceptance_id: acceptanceId
  });
  if (!isSuccess(response)) return null;

  const acceptance = unwrapData(response);
  const actualIds = Array.isArray(acceptance?.attachmentIds) ? acceptance.attachmentIds : Array.isArray(acceptance?.attachment_ids) ? acceptance.attachment_ids : [];
  const matched = attachmentIds.every((id) => actualIds.includes(id));
  assertCheck("engineering_acceptance_attachment_linked", matched, "工程验收已关联上传附件", {
    acceptance_id: acceptanceId,
    expected_attachment_ids: attachmentIds,
    actual_attachment_ids: actualIds
  });
  return acceptance;
}

async function verifyProjectStatus(admin, projectId, expectedStatus, summary) {
  const response = await requestJson(`${apiBase}/engineering/projects/${projectId}`, {
    token: admin.token
  });
  assertSuccess(`engineering_project_detail_${expectedStatus.toLowerCase()}`, response, "管理员回读工程项目状态", {
    actor: admin.username,
    project_id: projectId,
    expected_status: expectedStatus
  });
  if (!isSuccess(response)) return null;

  const project = unwrapData(response);
  const projectStatus = project?.status ?? project?.project_status ?? null;
  assertCheck(`engineering_project_status_${expectedStatus.toLowerCase()}`, projectStatus === expectedStatus, summary, {
    project_id: projectId,
    project_status: projectStatus
  });
  return project;
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

async function verifyEngineeringMessage(user, expectation) {
  const inbox = await requestJson(`${apiBase}/workflow/inbox`, { token: user.token });
  assertSuccess(`${expectation.stepId}_inbox`, inbox, `${user.displayName} 可读取流程收件箱`, {
    actor: user.username
  });
  if (!isSuccess(inbox)) return null;

  const result = await waitForEngineeringMessage(user, expectation);
  assertCheck(expectation.stepId, result.found, expectation.summary, {
    actor: user.username,
    title_includes: expectation.titleIncludes ?? null,
    href_includes: expectation.hrefIncludes ?? null,
    content_includes: expectation.contentIncludes ?? null,
    message_id: result.message?.id ?? null,
    message_title: result.message?.title ?? null,
    message_href: result.message?.targetUrl ?? null
  });
  return result.message;
}

async function verifyEngineeringMessageReadFlow(user, message, expectation) {
  if (!message?.id) {
    assertCheck(expectation.stepId, false, expectation.summary, {
      actor: user.username,
      message_id: null
    });
    return null;
  }

  const markRead = await requestJson(`${apiBase}/workflow/messages/${message.id}/read`, {
    method: "POST",
    token: user.token
  });
  assertSuccess(`${expectation.stepId}_mark`, markRead, `${user.displayName} 标记工程消息已读`, {
    actor: user.username,
    message_id: message.id
  });
  if (!isSuccess(markRead)) {
    return null;
  }

  const readEntity = unwrapData(markRead) ?? markRead.body?.data ?? markRead.body ?? {};
  const readAt = readEntity?.readAt ?? readEntity?.read_at ?? null;
  assertCheck(`${expectation.stepId}_timestamp`, Boolean(readAt), "工程消息已写入已读时间", {
    actor: user.username,
    message_id: message.id,
    read_at: readAt
  });

  const unreadResponse = await requestJson(`${apiBase}/workflow/messages?page=1&page_size=50&category=engineering&read_status=unread`, {
    token: user.token
  });
  assertSuccess(`${expectation.stepId}_unread_list`, unreadResponse, `${user.displayName} 读取未读工程消息列表`, {
    actor: user.username
  });
  if (!isSuccess(unreadResponse)) {
    return null;
  }

  const payload = unwrapData(unreadResponse) ?? unreadResponse.body?.data ?? unreadResponse.body ?? {};
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const stillUnread = items.some((item) => item?.id === message.id);
  assertCheck(expectation.stepId, !stillUnread, expectation.summary, {
    actor: user.username,
    message_id: message.id,
    unread_count: items.length
  });
  return readEntity;
}

async function uploadAttachment(user, input) {
  const form = new FormData();
  form.set("biz_type", input.bizType);
  if (input.bizId) {
    form.set("biz_id", input.bizId);
  }
  if (input.remark) {
    form.set("remark", input.remark);
  }
  form.set("file", new Blob([input.buffer], { type: input.mimeType }), input.filename);

  const response = await requestForm(`${apiBase}/files`, {
    method: "POST",
    token: user.token,
    idempotencyKey: buildIdempotencyKey("engineering-attachment-upload"),
    body: form
  });
  assertSuccess("engineering_attachment_upload", response, `${user.displayName} 上传工程附件`, {
    actor: user.username,
    biz_type: input.bizType,
    filename: input.filename
  });
  return unwrapData(response);
}

async function waitForEngineeringMessage(user, expectation) {
  let lastMessage = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const response = await requestJson(`${apiBase}/workflow/messages?page=1&page_size=50&category=engineering`, {
      token: user.token
    });
    assertSuccess(`${expectation.stepId}_messages_read_${attempt + 1}`, response, `${user.displayName} 读取工程消息列表`, {
      actor: user.username,
      attempt: attempt + 1
    });
    if (!isSuccess(response)) {
      return { found: false, message: null };
    }
    const payload = unwrapData(response) ?? response.body?.data ?? response.body ?? {};
    const items = Array.isArray(payload?.items) ? payload.items : [];
    const match = items.find((item) => matchesEngineeringMessage(item, expectation));
    if (match) {
      return { found: true, message: match };
    }
    lastMessage = items[0] ?? null;
    await sleep(300);
  }
  return { found: false, message: lastMessage };
}

function matchesEngineeringMessage(item, expectation) {
  if (!item || typeof item !== "object") return false;
  const title = String(item.title ?? "");
  const content = String(item.content ?? "");
  const href = String(item.targetUrl ?? "");
  if (expectation.titleIncludes && !title.includes(expectation.titleIncludes)) return false;
  if (expectation.contentIncludes && !content.includes(expectation.contentIncludes)) return false;
  if (expectation.hrefIncludes && !href.includes(expectation.hrefIncludes)) return false;
  return true;
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

function assertCheck(stepId, passed, summary, detail = {}) {
  const status = passed ? "PASS" : "FAIL";
  steps.push({
    step_id: stepId,
    status,
    summary,
    detail
  });
  if (!passed) {
    fail(`${stepId} failed: ${summary}`);
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

async function requestForm(url, options = {}) {
  const headers = {
    accept: "application/json",
    ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
    ...(options.idempotencyKey ? { "x-idempotency-key": options.idempotencyKey } : {})
  };
  try {
    const response = await fetch(url, {
      method: options.method ?? "POST",
      headers,
      body: options.body
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
