import assert from "node:assert/strict";
import test from "node:test";
import type { AuditService, RecordOperationInput } from "../audit/audit.service";
import { EngineeringAuditLogger } from "./audit/engineering-audit.logger";
import { EngineeringProjectStatus } from "./domain/engineering-project.enums";
import { EngineeringProjectAction } from "./domain/engineering-project-state-machine.types";

const TENANT_ID = "tenant-a";
const PARK_ID = "park-a";
const PROJECT_ID = "00000000-0000-0000-0000-000000000101";
const ACTOR_ID = "00000000-0000-0000-0000-000000000201";

function makeLogger(): { logger: EngineeringAuditLogger; operations: RecordOperationInput[] } {
  const operations: RecordOperationInput[] = [];
  const auditService = {
    recordOperation: async (input: RecordOperationInput) => {
      operations.push(input);
    }
  } as unknown as AuditService;
  return { logger: new EngineeringAuditLogger(auditService), operations };
}

test("EngineeringAuditLogger records project create/update/delete through AuditService", async () => {
  const { logger, operations } = makeLogger();

  await logger.logProjectChanged({
    tenantId: TENANT_ID,
    parkId: PARK_ID,
    projectId: PROJECT_ID,
    action: "CREATE",
    actorUserId: ACTOR_ID,
    actorName: "项目经理",
    actorRoleCodes: ["PROJECT_MANAGER"],
    beforeJson: null,
    afterJson: { projectName: "A5 楼消防改造" },
    requestId: "req-audit-001",
    ip: "127.0.0.1",
    userAgent: "node-test"
  });

  assert.equal(operations.length, 1);
  assert.equal(operations[0]?.tenantId, TENANT_ID);
  assert.equal(operations[0]?.parkId, PARK_ID);
  assert.equal(operations[0]?.module, "engineering");
  assert.equal(operations[0]?.resource, "engineering_project");
  assert.equal(operations[0]?.action, "CREATE");
  assert.equal(operations[0]?.bizType, "engineering_project");
  assert.equal(operations[0]?.bizId, PROJECT_ID);
  assert.deepEqual(operations[0]?.afterJson, { projectName: "A5 楼消防改造" });
  assert.equal(operations[0]?.method, "WRITE");
  assert.equal(operations[0]?.path, "epdr://engineering/projects");
  assert.equal(operations[0]?.requestId, "req-audit-001");
});

test("EngineeringAuditLogger records project status transition with before and after snapshots", async () => {
  const { logger, operations } = makeLogger();

  await logger.logProjectStatusChanged({
    tenantId: TENANT_ID,
    parkId: PARK_ID,
    projectId: PROJECT_ID,
    fromStatus: EngineeringProjectStatus.DRAFT,
    toStatus: EngineeringProjectStatus.SUBMITTED,
    action: EngineeringProjectAction.SUBMIT,
    context: {
      tenantId: TENANT_ID,
      parkId: PARK_ID,
      projectId: PROJECT_ID,
      actorUserId: ACTOR_ID,
      actorName: "项目经理",
      actorRoleCodes: ["PROJECT_MANAGER"],
      reason: "提交立项",
      comment: "进入审批",
      requestId: "req-audit-002",
      ip: "127.0.0.1",
      userAgent: "node-test"
    }
  });

  assert.equal(operations.length, 1);
  assert.equal(operations[0]?.resource, "engineering_project");
  assert.equal(operations[0]?.action, EngineeringProjectAction.SUBMIT);
  assert.deepEqual(operations[0]?.beforeJson, { status: EngineeringProjectStatus.DRAFT });
  assert.deepEqual(operations[0]?.afterJson, {
    status: EngineeringProjectStatus.SUBMITTED,
    reason: "提交立项",
    comment: "进入审批"
  });
  assert.equal(operations[0]?.method, "STATE");
  assert.equal(operations[0]?.path, "epdr://engineering/projects/status");
});

test("EngineeringAuditLogger records downstream runtime actions with stable biz types", async () => {
  const { logger, operations } = makeLogger();

  await logger.logPlanChanged({
    tenantId: TENANT_ID,
    parkId: PARK_ID,
    projectId: PROJECT_ID,
    planId: "00000000-0000-0000-0000-000000000301",
    action: "UPDATE_PROGRESS",
    actorUserId: ACTOR_ID,
    afterJson: { actualProgressPercent: 80 }
  });
  await logger.logDailyReportChanged({
    tenantId: TENANT_ID,
    parkId: PARK_ID,
    projectId: PROJECT_ID,
    dailyReportId: "00000000-0000-0000-0000-000000000401",
    action: "SUBMIT",
    actorUserId: ACTOR_ID,
    afterJson: { reportStatus: "SUBMITTED" }
  });
  await logger.logRectificationChanged({
    tenantId: TENANT_ID,
    parkId: PARK_ID,
    projectId: PROJECT_ID,
    rectificationId: "00000000-0000-0000-0000-000000000501",
    issueId: "00000000-0000-0000-0000-000000000601",
    action: "RECHECK_PASS",
    actorUserId: ACTOR_ID,
    afterJson: { status: "PASSED" }
  });

  assert.deepEqual(
    operations.map((operation) => [operation.bizType, operation.path]),
    [
      ["engineering_plan", "epdr://engineering/plans"],
      ["engineering_daily_report", "epdr://engineering/daily-reports"],
      ["engineering_rectification", "epdr://engineering/rectifications"]
    ]
  );
  assert.deepEqual(operations[2]?.afterJson, {
    projectId: PROJECT_ID,
    issueId: "00000000-0000-0000-0000-000000000601",
    status: "PASSED"
  });
});
