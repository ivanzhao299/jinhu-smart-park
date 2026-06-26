import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { EngineeringDailyReportStatus, EngineeringPlanLevel, EngineeringPlanStatus, EngineeringPlanType, EngineeringProjectType, EngineeringWeatherType } from "./domain/engineering-project.enums";
import type { CreateEngineeringDailyReportDto, UpdateEngineeringDailyReportDto } from "./dto/engineering-daily-report.dto";
import { EngineeringDailyReportEntity } from "./entities/engineering-daily-report.entity";
import { EngineeringPlanEntity } from "./entities/engineering-plan.entity";
import { EngineeringProjectEntity } from "./entities/engineering-project.entity";
import { EngineeringAuditLogger } from "./audit/engineering-audit.logger";
import { EngineeringEventPublisher, type EngineeringDailyReportEventType } from "./events/engineering-event.publisher";
import { EngineeringDailyReportService } from "./engineering-daily-report.service";
import { EngineeringProjectRuntimeContext } from "./engineering-project.service";
import { EngineeringDailyReportAccessPolicy, EngineeringDailyReportPermission, type EngineeringDailyReportPermissionValue } from "./policies/engineering-daily-report-access.policy";
import { EngineeringDataScopeAdapter } from "./policies/engineering-data-scope.adapter";
import { EngineeringPlanRepository } from "./repositories/engineering-plan.repository";
import { EngineeringProjectRepository } from "./repositories/engineering-project.repository";
import {
  EngineeringDailyReportRepository,
  type CreateEngineeringDailyReportInput,
  type UpdateEngineeringDailyReportInput
} from "./repositories/engineering-daily-report.repository";

const PROJECT_ID = "00000000-0000-0000-0000-000000000101";
const OTHER_PROJECT_ID = "00000000-0000-0000-0000-000000000102";
const PLAN_ID = "00000000-0000-0000-0000-000000000201";
const REPORT_ID = "00000000-0000-0000-0000-000000000301";
const DUPLICATE_REPORT_ID = "00000000-0000-0000-0000-000000000302";
const ACTOR_ID = "00000000-0000-0000-0000-000000000401";
const CONTRACTOR_ORG_ID = "00000000-0000-0000-0000-000000000501";

interface Harness {
  service: EngineeringDailyReportService;
  context: EngineeringProjectRuntimeContext;
  permissions: EngineeringDailyReportPermissionValue[];
  projectScopeCalls: number;
  planScopeCalls: number;
  reportScopeCalls: number;
  createInput: CreateEngineeringDailyReportInput | null;
  updateInput: UpdateEngineeringDailyReportInput | null;
  softDeletedIds: string[];
  auditActions: string[];
  events: EngineeringDailyReportEventType[];
}

function makeProject(projectId: string = PROJECT_ID): EngineeringProjectEntity {
  return {
    id: projectId,
    tenantId: "tenant-a",
    parkId: "park-a",
    orgId: "00000000-0000-0000-0000-000000000601",
    projectCode: "GC20260626001",
    projectName: "A5 楼消防改造",
    projectType: EngineeringProjectType.FIRE_PROTECTION,
    isDeleted: false,
    createTime: new Date("2026-06-26T00:00:00.000Z"),
    updateTime: new Date("2026-06-26T00:00:00.000Z")
  } as EngineeringProjectEntity;
}

function makePlan(projectId: string = PROJECT_ID): EngineeringPlanEntity {
  return {
    id: PLAN_ID,
    tenantId: "tenant-a",
    parkId: "park-a",
    orgId: "00000000-0000-0000-0000-000000000601",
    projectId,
    planCode: "GCJH20260626001",
    planName: "消防改造总计划",
    planType: EngineeringPlanType.MASTER,
    planLevel: EngineeringPlanLevel.L1,
    plannedStartDate: "2026-06-26",
    plannedEndDate: "2026-07-26",
    status: EngineeringPlanStatus.IN_PROGRESS,
    isDeleted: false,
    createTime: new Date("2026-06-26T00:00:00.000Z"),
    updateTime: new Date("2026-06-26T00:00:00.000Z")
  } as EngineeringPlanEntity;
}

function makeReport(status: EngineeringDailyReportStatus = EngineeringDailyReportStatus.DRAFT): EngineeringDailyReportEntity {
  return {
    id: REPORT_ID,
    tenantId: "tenant-a",
    parkId: "park-a",
    orgId: "00000000-0000-0000-0000-000000000601",
    projectId: PROJECT_ID,
    planId: PLAN_ID,
    reportCode: "GCRB20260626001",
    reportDate: "2026-06-26",
    weather: EngineeringWeatherType.SUNNY,
    workContent: "完成消防管线开槽",
    workerCount: 8,
    managerCount: 2,
    progressPercent: 30,
    reportStatus: status,
    contractorOrgId: CONTRACTOR_ORG_ID,
    supervisorOrgId: null,
    submittedAt: status === EngineeringDailyReportStatus.SUBMITTED ? new Date("2026-06-26T02:00:00.000Z") : null,
    submittedBy: status === EngineeringDailyReportStatus.SUBMITTED ? ACTOR_ID : null,
    reviewedAt: null,
    reviewedBy: null,
    reviewComment: null,
    isDeleted: false,
    createTime: new Date("2026-06-26T00:00:00.000Z"),
    updateTime: new Date("2026-06-26T00:00:00.000Z")
  } as EngineeringDailyReportEntity;
}

function makeContext(): EngineeringProjectRuntimeContext {
  return {
    tenantId: "tenant-a",
    parkId: "park-a",
    requestId: "req-task-008",
    actor: {
      sub: ACTOR_ID,
      username: "pm",
      realName: "项目经理",
      tenantId: "tenant-a",
      parkId: "park-a",
      roles: ["PROJECT_MANAGER"],
      permissions: ["module:read"]
    }
  };
}

function makeHarness(
  options: {
    projectMissing?: boolean;
    planWrongProject?: boolean;
    duplicate?: boolean;
    reportStatus?: EngineeringDailyReportStatus;
  } = {}
): Harness {
  const project = makeProject();
  const plan = makePlan(options.planWrongProject ? OTHER_PROJECT_ID : PROJECT_ID);
  const report = makeReport(options.reportStatus ?? EngineeringDailyReportStatus.DRAFT);
  const duplicateReport = { ...report, id: DUPLICATE_REPORT_ID } as EngineeringDailyReportEntity;
  const permissions: EngineeringDailyReportPermissionValue[] = [];
  let projectScopeCalls = 0;
  let planScopeCalls = 0;
  let reportScopeCalls = 0;
  let createInput: CreateEngineeringDailyReportInput | null = null;
  let updateInput: UpdateEngineeringDailyReportInput | null = null;
  const softDeletedIds: string[] = [];
  const auditActions: string[] = [];
  const events: EngineeringDailyReportEventType[] = [];

  const projectsRepository = {
    findById: async (_scope: unknown, id: string, applyScope?: (builder: unknown) => Promise<void>) => {
      await applyScope?.({});
      if (options.projectMissing || id !== PROJECT_ID) throw new NotFoundException("Engineering project not found");
      return project;
    }
  } as unknown as EngineeringProjectRepository;

  const plansRepository = {
    findById: async (_scope: unknown, id: string, applyScope?: (builder: unknown) => Promise<void>) => {
      await applyScope?.({});
      if (id !== PLAN_ID) throw new NotFoundException("Engineering plan not found");
      return plan;
    }
  } as unknown as EngineeringPlanRepository;

  const dailyReportsRepository = {
    createDailyReport: async (_scope: unknown, _actorId: string | null, input: CreateEngineeringDailyReportInput) => {
      createInput = input;
      return { ...report, ...input, id: REPORT_ID, reportStatus: EngineeringDailyReportStatus.DRAFT } as EngineeringDailyReportEntity;
    },
    paginateDailyReports: async (_scope: unknown, _query: unknown, applyScope?: (builder: unknown) => Promise<void>) => {
      await applyScope?.({});
      return { items: [report], total: 1, page: 1, page_size: 20 };
    },
    findById: async (_scope: unknown, id: string, applyScope?: (builder: unknown) => Promise<void>) => {
      await applyScope?.({});
      if (id !== REPORT_ID) throw new NotFoundException("Engineering daily report not found");
      return report;
    },
    findByProjectAndDate: async () => (options.duplicate ? duplicateReport : null),
    findByProjectId: async (_scope: unknown, projectId: string, _query: unknown, applyScope?: (builder: unknown) => Promise<void>) => {
      await applyScope?.({});
      assert.equal(projectId, PROJECT_ID);
      return [report];
    },
    updateDailyReport: async (_scope: unknown, _actorId: string | null, _id: string, input: UpdateEngineeringDailyReportInput) => {
      updateInput = input;
      return { ...report, ...input } as EngineeringDailyReportEntity;
    },
    updateStatus: async (_scope: unknown, _actorId: string | null, _id: string, input: Partial<EngineeringDailyReportEntity>) =>
      ({ ...report, ...input } as EngineeringDailyReportEntity),
    softDelete: async (_scope: unknown, _actorId: string | null, id: string) => {
      softDeletedIds.push(id);
      return { id };
    }
  } as unknown as EngineeringDailyReportRepository;

  const accessPolicy = {
    assertPermission: (permission: EngineeringDailyReportPermissionValue) => {
      permissions.push(permission);
    }
  } as unknown as EngineeringDailyReportAccessPolicy;

  const dataScopeAdapter = {
    applyProjectScope: async () => {
      projectScopeCalls += 1;
    },
    applyPlanScope: async () => {
      planScopeCalls += 1;
    },
    applyDailyReportScope: async () => {
      reportScopeCalls += 1;
    }
  } as unknown as EngineeringDataScopeAdapter;

  const auditLogger = {
    logDailyReportChanged: async (input: { action: string }) => {
      auditActions.push(input.action);
    }
  } as unknown as EngineeringAuditLogger;

  const eventPublisher = {
    publishDailyReportEvent: async (input: { eventType: EngineeringDailyReportEventType }) => {
      events.push(input.eventType);
    }
  } as unknown as EngineeringEventPublisher;

  const service = new EngineeringDailyReportService(
    dailyReportsRepository,
    projectsRepository,
    plansRepository,
    accessPolicy,
    dataScopeAdapter,
    auditLogger,
    eventPublisher
  );
  return {
    service,
    context: makeContext(),
    permissions,
    get projectScopeCalls() {
      return projectScopeCalls;
    },
    get planScopeCalls() {
      return planScopeCalls;
    },
    get reportScopeCalls() {
      return reportScopeCalls;
    },
    get createInput() {
      return createInput;
    },
    get updateInput() {
      return updateInput;
    },
    softDeletedIds,
    auditActions,
    events
  };
}

function createDto(): CreateEngineeringDailyReportDto {
  return {
    project_id: PROJECT_ID,
    plan_id: PLAN_ID,
    report_date: "2026-06-26",
    weather: EngineeringWeatherType.SUNNY,
    work_content: "完成消防管线开槽",
    completed_work: "A 区开槽完成",
    tomorrow_plan: "管线敷设",
    worker_count: 8,
    manager_count: 2,
    progress_percent: 30,
    contractor_org_id: CONTRACTOR_ORG_ID
  };
}

test("EngineeringDailyReportService creates daily report after project and plan validation", async () => {
  const harness = makeHarness();
  const saved = await harness.service.createDailyReport(createDto(), harness.context);

  assert.equal(saved.reportStatus, EngineeringDailyReportStatus.DRAFT);
  assert.equal(harness.createInput?.projectId, PROJECT_ID);
  assert.equal(harness.createInput?.planId, PLAN_ID);
  assert.equal(harness.projectScopeCalls, 1);
  assert.equal(harness.planScopeCalls, 1);
  assert.deepEqual(harness.permissions, [EngineeringDailyReportPermission.CREATE]);
  assert.deepEqual(harness.auditActions, ["CREATE"]);
  assert.deepEqual(harness.events, ["EngineeringDailyReportCreatedEvent"]);
});

test("EngineeringDailyReportService rejects create when projectId does not exist", async () => {
  const harness = makeHarness({ projectMissing: true });

  await assert.rejects(() => harness.service.createDailyReport(createDto(), harness.context), NotFoundException);
});

test("EngineeringDailyReportService requires planId to belong to the same project", async () => {
  const harness = makeHarness({ planWrongProject: true });

  await assert.rejects(() => harness.service.createDailyReport(createDto(), harness.context), BadRequestException);
});

test("EngineeringDailyReportService rejects invalid progress and negative people counts", async () => {
  await assert.rejects(
    () => makeHarness().service.createDailyReport({ ...createDto(), progress_percent: 101 }, makeContext()),
    BadRequestException
  );
  await assert.rejects(
    () => makeHarness().service.createDailyReport({ ...createDto(), worker_count: -1 }, makeContext()),
    BadRequestException
  );
  await assert.rejects(
    () => makeHarness().service.createDailyReport({ ...createDto(), manager_count: -1 }, makeContext()),
    BadRequestException
  );
});

test("EngineeringDailyReportService rejects duplicate project/date/contractor report", async () => {
  const harness = makeHarness({ duplicate: true });

  await assert.rejects(() => harness.service.createDailyReport(createDto(), harness.context), ConflictException);
});

test("EngineeringDailyReportService updates DRAFT reports and blocks SUBMITTED reports", async () => {
  const draftHarness = makeHarness({ reportStatus: EngineeringDailyReportStatus.DRAFT });
  await draftHarness.service.updateDailyReport(REPORT_ID, { work_content: "补充现场照片", progress_percent: 35 }, draftHarness.context);
  assert.equal(draftHarness.updateInput?.workContent, "补充现场照片");
  assert.equal(draftHarness.updateInput?.progressPercent, 35);
  assert.deepEqual(draftHarness.auditActions, ["UPDATE"]);
  assert.deepEqual(draftHarness.events, ["EngineeringDailyReportUpdatedEvent"]);

  const submittedHarness = makeHarness({ reportStatus: EngineeringDailyReportStatus.SUBMITTED });
  await assert.rejects(
    () => submittedHarness.service.updateDailyReport(REPORT_ID, { work_content: "试图修改" } as UpdateEngineeringDailyReportDto, submittedHarness.context),
    BadRequestException
  );
});

test("EngineeringDailyReportService submits only DRAFT or REJECTED reports", async () => {
  const harness = makeHarness({ reportStatus: EngineeringDailyReportStatus.DRAFT });
  const submitted = await harness.service.submitDailyReport(REPORT_ID, harness.context);

  assert.equal(submitted.reportStatus, EngineeringDailyReportStatus.SUBMITTED);
  assert.equal(submitted.submittedBy, ACTOR_ID);
  assert.deepEqual(harness.permissions, [EngineeringDailyReportPermission.SUBMIT]);
  assert.deepEqual(harness.auditActions, ["SUBMIT"]);
  assert.deepEqual(harness.events, ["EngineeringDailyReportSubmittedEvent"]);

  const reviewedHarness = makeHarness({ reportStatus: EngineeringDailyReportStatus.REVIEWED });
  await assert.rejects(() => reviewedHarness.service.submitDailyReport(REPORT_ID, reviewedHarness.context), BadRequestException);
});

test("EngineeringDailyReportService reviews submitted reports to REVIEWED or REJECTED", async () => {
  const approveHarness = makeHarness({ reportStatus: EngineeringDailyReportStatus.SUBMITTED });
  const reviewed = await approveHarness.service.reviewDailyReport(REPORT_ID, { approved: true, review_comment: "通过" }, approveHarness.context);
  assert.equal(reviewed.reportStatus, EngineeringDailyReportStatus.REVIEWED);
  assert.equal(reviewed.reviewedBy, ACTOR_ID);
  assert.deepEqual(approveHarness.permissions, [EngineeringDailyReportPermission.REVIEW]);
  assert.deepEqual(approveHarness.auditActions, ["REVIEW_APPROVE"]);
  assert.deepEqual(approveHarness.events, ["EngineeringDailyReportReviewedEvent"]);

  const rejectHarness = makeHarness({ reportStatus: EngineeringDailyReportStatus.SUBMITTED });
  const rejected = await rejectHarness.service.reviewDailyReport(REPORT_ID, { approved: false, review_comment: "补充照片" }, rejectHarness.context);
  assert.equal(rejected.reportStatus, EngineeringDailyReportStatus.REJECTED);
  assert.deepEqual(rejectHarness.auditActions, ["REVIEW_REJECT"]);
  assert.deepEqual(rejectHarness.events, ["EngineeringDailyReportRejectedEvent"]);

  const draftHarness = makeHarness({ reportStatus: EngineeringDailyReportStatus.DRAFT });
  await assert.rejects(() => draftHarness.service.reviewDailyReport(REPORT_ID, { approved: true }, draftHarness.context), BadRequestException);
});

test("EngineeringDailyReportService deletes only DRAFT or REJECTED reports", async () => {
  const harness = makeHarness({ reportStatus: EngineeringDailyReportStatus.DRAFT });
  await harness.service.deleteDailyReport(REPORT_ID, harness.context);

  assert.deepEqual(harness.softDeletedIds, [REPORT_ID]);
  assert.deepEqual(harness.permissions, [EngineeringDailyReportPermission.DELETE]);
  assert.deepEqual(harness.auditActions, ["DELETE"]);
  assert.deepEqual(harness.events, ["EngineeringDailyReportDeletedEvent"]);

  const reviewedHarness = makeHarness({ reportStatus: EngineeringDailyReportStatus.REVIEWED });
  await assert.rejects(() => reviewedHarness.service.deleteDailyReport(REPORT_ID, reviewedHarness.context), BadRequestException);
});

test("EngineeringDailyReportService queries project daily reports after project access validation", async () => {
  const harness = makeHarness();
  const result = await harness.service.getProjectDailyReports(PROJECT_ID, { page: 1, page_size: 20 }, harness.context);

  assert.equal(result.length, 1);
  assert.equal(harness.projectScopeCalls, 1);
  assert.equal(harness.reportScopeCalls, 1);
  assert.deepEqual(harness.permissions, [EngineeringDailyReportPermission.VIEW]);
});

test("EngineeringDailyReportService list and detail apply report DataScope and permission", async () => {
  const harness = makeHarness();
  const page = await harness.service.paginateDailyReports({ page: 1, page_size: 20 }, harness.context);
  assert.equal(page.total, 1);
  assert.equal(harness.reportScopeCalls, 1);

  await harness.service.getDailyReportDetail(REPORT_ID, harness.context);
  assert.equal(harness.reportScopeCalls, 2);
  assert.deepEqual(harness.permissions, [EngineeringDailyReportPermission.VIEW, EngineeringDailyReportPermission.VIEW]);
});
