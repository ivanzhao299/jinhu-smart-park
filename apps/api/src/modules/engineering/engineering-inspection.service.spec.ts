import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import {
  EngineeringDailyReportStatus,
  EngineeringInspectionStatus,
  EngineeringInspectionType,
  EngineeringIssueSeverity,
  EngineeringIssueSourceType,
  EngineeringIssueStatus,
  EngineeringIssueType,
  EngineeringPlanLevel,
  EngineeringPlanStatus,
  EngineeringPlanType,
  EngineeringRectificationStatus,
  EngineeringProjectType,
  EngineeringWeatherType
} from "./domain/engineering-project.enums";
import type { CreateEngineeringInspectionDto, CreateEngineeringIssueDto } from "./dto/engineering-inspection.dto";
import { EngineeringDailyReportEntity } from "./entities/engineering-daily-report.entity";
import { EngineeringInspectionEntity } from "./entities/engineering-inspection.entity";
import { EngineeringIssueEntity } from "./entities/engineering-issue.entity";
import { EngineeringPlanEntity } from "./entities/engineering-plan.entity";
import { EngineeringProjectEntity } from "./entities/engineering-project.entity";
import { EngineeringRectificationEntity } from "./entities/engineering-rectification.entity";
import { EngineeringAuditLogger } from "./audit/engineering-audit.logger";
import { EngineeringAttachmentService } from "./engineering-attachment.service";
import { EngineeringEventPublisher } from "./events/engineering-event.publisher";
import { EngineeringInspectionService } from "./engineering-inspection.service";
import { EngineeringProjectRuntimeContext } from "./engineering-project.service";
import {
  EngineeringInspectionAccessPolicy,
  EngineeringInspectionPermission,
  type EngineeringInspectionPermissionValue
} from "./policies/engineering-inspection-access.policy";
import { EngineeringDataScopeAdapter } from "./policies/engineering-data-scope.adapter";
import { EngineeringDailyReportRepository } from "./repositories/engineering-daily-report.repository";
import { EngineeringInspectionRepository, type CreateEngineeringInspectionInput, type UpdateEngineeringInspectionInput } from "./repositories/engineering-inspection.repository";
import { EngineeringIssueRepository, type CreateEngineeringIssueInput, type UpdateEngineeringIssueInput } from "./repositories/engineering-issue.repository";
import { EngineeringPlanRepository } from "./repositories/engineering-plan.repository";
import { EngineeringProjectRepository } from "./repositories/engineering-project.repository";
import { EngineeringRectificationRepository, type CreateEngineeringRectificationInput } from "./repositories/engineering-rectification.repository";

const PROJECT_ID = "00000000-0000-0000-0000-000000000101";
const OTHER_PROJECT_ID = "00000000-0000-0000-0000-000000000102";
const PLAN_ID = "00000000-0000-0000-0000-000000000201";
const REPORT_ID = "00000000-0000-0000-0000-000000000301";
const INSPECTION_ID = "00000000-0000-0000-0000-000000000401";
const ISSUE_ID = "00000000-0000-0000-0000-000000000501";
const ACTOR_ID = "00000000-0000-0000-0000-000000000601";
const CONTRACTOR_ORG_ID = "00000000-0000-0000-0000-000000000701";
const RECTIFICATION_ID = "00000000-0000-0000-0000-000000000901";

interface Harness {
  service: EngineeringInspectionService;
  context: EngineeringProjectRuntimeContext;
  permissions: EngineeringInspectionPermissionValue[];
  projectScopeCalls: number;
  planScopeCalls: number;
  reportScopeCalls: number;
  inspectionScopeCalls: number;
  issueScopeCalls: number;
  createInspectionInput: CreateEngineeringInspectionInput | null;
  updateInspectionInput: UpdateEngineeringInspectionInput | null;
  createIssueInput: CreateEngineeringIssueInput | null;
  updateIssueInput: UpdateEngineeringIssueInput | null;
  createRectificationInput: CreateEngineeringRectificationInput | null;
  auditActions: string[];
  events: string[];
}

function makeProject(): EngineeringProjectEntity {
  return {
    id: PROJECT_ID,
    tenantId: "tenant-a",
    parkId: "park-a",
    orgId: "00000000-0000-0000-0000-000000000801",
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
    orgId: "00000000-0000-0000-0000-000000000801",
    projectId,
    planCode: "GCJH20260626001",
    planName: "消防改造总计划",
    planType: EngineeringPlanType.MASTER,
    planLevel: EngineeringPlanLevel.L1,
    status: EngineeringPlanStatus.IN_PROGRESS,
    isDeleted: false,
    createTime: new Date("2026-06-26T00:00:00.000Z"),
    updateTime: new Date("2026-06-26T00:00:00.000Z")
  } as EngineeringPlanEntity;
}

function makeReport(projectId: string = PROJECT_ID): EngineeringDailyReportEntity {
  return {
    id: REPORT_ID,
    tenantId: "tenant-a",
    parkId: "park-a",
    orgId: "00000000-0000-0000-0000-000000000801",
    projectId,
    planId: PLAN_ID,
    reportCode: "GCRB20260626001",
    reportDate: "2026-06-26",
    weather: EngineeringWeatherType.SUNNY,
    workContent: "消防管线施工",
    reportStatus: EngineeringDailyReportStatus.REVIEWED,
    isDeleted: false,
    createTime: new Date("2026-06-26T00:00:00.000Z"),
    updateTime: new Date("2026-06-26T00:00:00.000Z")
  } as EngineeringDailyReportEntity;
}

function makeInspection(status: EngineeringInspectionStatus = EngineeringInspectionStatus.DRAFT): EngineeringInspectionEntity {
  return {
    id: INSPECTION_ID,
    tenantId: "tenant-a",
    parkId: "park-a",
    orgId: "00000000-0000-0000-0000-000000000801",
    projectId: PROJECT_ID,
    planId: PLAN_ID,
    dailyReportId: REPORT_ID,
    inspectionCode: "GCXJ20260626001",
    inspectionTitle: "A5 楼消防巡检",
    inspectionType: EngineeringInspectionType.SAFETY,
    inspectionDate: "2026-06-26",
    inspectionStatus: status,
    issueCount: 0,
    criticalIssueCount: 0,
    contractorOrgId: CONTRACTOR_ORG_ID,
    supervisorOrgId: null,
    locationText: "A5 3F",
    buildingId: null,
    floorId: null,
    spaceId: null,
    submittedAt: null,
    submittedBy: null,
    isDeleted: false,
    createTime: new Date("2026-06-26T00:00:00.000Z"),
    updateTime: new Date("2026-06-26T00:00:00.000Z")
  } as EngineeringInspectionEntity;
}

function makeIssue(status: EngineeringIssueStatus = EngineeringIssueStatus.OPEN): EngineeringIssueEntity {
  return {
    id: ISSUE_ID,
    tenantId: "tenant-a",
    parkId: "park-a",
    orgId: "00000000-0000-0000-0000-000000000801",
    projectId: PROJECT_ID,
    inspectionId: INSPECTION_ID,
    planId: PLAN_ID,
    dailyReportId: REPORT_ID,
    issueCode: "GCWT20260626001",
    issueTitle: "消防管线固定不牢",
    issueType: EngineeringIssueType.SAFETY,
    severity: EngineeringIssueSeverity.CRITICAL,
    issueStatus: status,
    description: "支架松动",
    sourceType: EngineeringIssueSourceType.INSPECTION,
    sourceId: INSPECTION_ID,
    discoveredAt: new Date("2026-06-26T01:00:00.000Z"),
    deadline: "2026-06-30",
    rectificationId: null,
    closedAt: null,
    closedBy: null,
    isDeleted: false,
    createTime: new Date("2026-06-26T00:00:00.000Z"),
    updateTime: new Date("2026-06-26T00:00:00.000Z")
  } as EngineeringIssueEntity;
}

function makeRectification(): EngineeringRectificationEntity {
  return {
    id: RECTIFICATION_ID,
    tenantId: "tenant-a",
    parkId: "park-a",
    orgId: "00000000-0000-0000-0000-000000000801",
    projectId: PROJECT_ID,
    issueId: ISSUE_ID,
    inspectionId: INSPECTION_ID,
    rectificationCode: "GCZG20260626001",
    rectificationTitle: "消防管线固定整改",
    description: "支架松动",
    severity: EngineeringIssueSeverity.CRITICAL,
    status: EngineeringRectificationStatus.PENDING,
    contractorOrgId: CONTRACTOR_ORG_ID,
    deadline: "2026-06-30",
    isDeleted: false,
    createTime: new Date("2026-06-26T00:00:00.000Z"),
    updateTime: new Date("2026-06-26T00:00:00.000Z")
  } as EngineeringRectificationEntity;
}

function makeContext(): EngineeringProjectRuntimeContext {
  return {
    tenantId: "tenant-a",
    parkId: "park-a",
    requestId: "req-task-011",
    actor: {
      sub: ACTOR_ID,
      username: "engineer",
      realName: "工程师",
      tenantId: "tenant-a",
      parkId: "park-a",
      roles: ["ENGINEER"],
      permissions: ["ENGINEERING_INSPECTION_VIEW", "ENGINEERING_INSPECTION_CREATE", "ENGINEERING_INSPECTION_UPDATE", "ENGINEERING_INSPECTION_SUBMIT", "ENGINEERING_RECTIFICATION_ASSIGN"]
    }
  };
}

function makeHarness(
  options: {
    planWrongProject?: boolean;
    reportWrongProject?: boolean;
    inspectionStatus?: EngineeringInspectionStatus;
    issueStatus?: EngineeringIssueStatus;
    issueHasRectification?: boolean;
    existingRectification?: boolean;
  } = {}
): Harness {
  const project = makeProject();
  const plan = makePlan(options.planWrongProject ? OTHER_PROJECT_ID : PROJECT_ID);
  const report = makeReport(options.reportWrongProject ? OTHER_PROJECT_ID : PROJECT_ID);
  let inspection = makeInspection(options.inspectionStatus ?? EngineeringInspectionStatus.DRAFT);
  let issue = makeIssue(options.issueStatus ?? EngineeringIssueStatus.OPEN);
  if (options.issueHasRectification) {
    issue.rectificationId = RECTIFICATION_ID;
  }
  let rectification = makeRectification();
  const permissions: EngineeringInspectionPermissionValue[] = [];
  const auditActions: string[] = [];
  const events: string[] = [];
  let projectScopeCalls = 0;
  let planScopeCalls = 0;
  let reportScopeCalls = 0;
  let inspectionScopeCalls = 0;
  let issueScopeCalls = 0;
  let createInspectionInput: CreateEngineeringInspectionInput | null = null;
  let updateInspectionInput: UpdateEngineeringInspectionInput | null = null;
  let createIssueInput: CreateEngineeringIssueInput | null = null;
  let updateIssueInput: UpdateEngineeringIssueInput | null = null;
  let createRectificationInput: CreateEngineeringRectificationInput | null = null;

  const projectsRepository = {
    findById: async (_scope: unknown, id: string, applyScope?: (builder: unknown) => Promise<void>) => {
      await applyScope?.({});
      if (id !== PROJECT_ID) throw new NotFoundException("Engineering project not found");
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
    findById: async (_scope: unknown, id: string, applyScope?: (builder: unknown) => Promise<void>) => {
      await applyScope?.({});
      if (id !== REPORT_ID) throw new NotFoundException("Engineering daily report not found");
      return report;
    }
  } as unknown as EngineeringDailyReportRepository;

  const inspectionsRepository = {
    createInspection: async (_scope: unknown, _actorId: string | null, input: CreateEngineeringInspectionInput) => {
      createInspectionInput = input;
      inspection = { ...inspection, ...input, id: INSPECTION_ID, inspectionStatus: EngineeringInspectionStatus.DRAFT } as EngineeringInspectionEntity;
      return inspection;
    },
    paginateInspections: async (_scope: unknown, _query: unknown, applyScope?: (builder: unknown) => Promise<void>) => {
      await applyScope?.({});
      return { items: [inspection], total: 1, page: 1, page_size: 20 };
    },
    findById: async (_scope: unknown, id: string, applyScope?: (builder: unknown) => Promise<void>) => {
      await applyScope?.({});
      if (id !== INSPECTION_ID) throw new NotFoundException("Engineering inspection not found");
      return inspection;
    },
    findByProjectId: async (_scope: unknown, projectId: string, applyScope?: (builder: unknown) => Promise<void>) => {
      await applyScope?.({});
      assert.equal(projectId, PROJECT_ID);
      return [inspection];
    },
    updateInspection: async (_scope: unknown, _actorId: string | null, _id: string, input: UpdateEngineeringInspectionInput) => {
      updateInspectionInput = input;
      inspection = { ...inspection, ...input } as EngineeringInspectionEntity;
      return inspection;
    },
    softDelete: async (_scope: unknown, _actorId: string | null, id: string) => ({ id })
  } as unknown as EngineeringInspectionRepository;

  const issuesRepository = {
    createIssue: async (_scope: unknown, _actorId: string | null, input: CreateEngineeringIssueInput) => {
      createIssueInput = input;
      issue = {
        ...issue,
        ...input,
        id: ISSUE_ID,
        issueStatus: EngineeringIssueStatus.OPEN,
        sourceType: input.sourceType ?? EngineeringIssueSourceType.INSPECTION,
        sourceId: input.sourceId ?? input.inspectionId ?? null
      } as EngineeringIssueEntity;
      return issue;
    },
    paginateIssues: async (_scope: unknown, _query: unknown, applyScope?: (builder: unknown) => Promise<void>) => {
      await applyScope?.({});
      return { items: [issue], total: 1, page: 1, page_size: 20 };
    },
    findById: async (_scope: unknown, id: string, applyScope?: (builder: unknown) => Promise<void>) => {
      await applyScope?.({});
      if (id !== ISSUE_ID) throw new NotFoundException("Engineering issue not found");
      return issue;
    },
    findByInspectionId: async () => [issue],
    updateIssue: async (_scope: unknown, _actorId: string | null, _id: string, input: UpdateEngineeringIssueInput) => {
      updateIssueInput = input;
      issue = { ...issue, ...input } as EngineeringIssueEntity;
      return issue;
    },
    softDelete: async (_scope: unknown, _actorId: string | null, id: string) => ({ id })
  } as unknown as EngineeringIssueRepository;

  const rectificationsRepository = {
    findByIssueId: async () => (options.existingRectification ? rectification : null),
    createRectification: async (_scope: unknown, _actorId: string | null, input: CreateEngineeringRectificationInput) => {
      createRectificationInput = input;
      rectification = { ...rectification, ...input, id: RECTIFICATION_ID, status: EngineeringRectificationStatus.PENDING } as EngineeringRectificationEntity;
      return rectification;
    }
  } as unknown as EngineeringRectificationRepository;

  const accessPolicy = {
    assertPermission: (permission: EngineeringInspectionPermissionValue) => {
      permissions.push(permission);
    }
  } as unknown as EngineeringInspectionAccessPolicy;

  const dataScopeAdapter = {
    applyProjectScope: async () => {
      projectScopeCalls += 1;
    },
    applyPlanScope: async () => {
      planScopeCalls += 1;
    },
    applyDailyReportScope: async () => {
      reportScopeCalls += 1;
    },
    applyInspectionScope: async () => {
      inspectionScopeCalls += 1;
    },
    applyIssueScope: async () => {
      issueScopeCalls += 1;
    }
  } as unknown as EngineeringDataScopeAdapter;

  const auditLogger = {
    logInspectionChanged: async (input: { action: string }) => {
      auditActions.push(input.action);
    },
    logIssueChanged: async (input: { action: string }) => {
      auditActions.push(input.action);
    },
    logRectificationChanged: async (input: { action: string }) => {
      auditActions.push(input.action);
    }
  } as unknown as EngineeringAuditLogger;
  const attachmentService = {
    normalizeAttachmentIds: async (_scope: unknown, attachmentIds: string[] | null | undefined) => attachmentIds
  } as unknown as EngineeringAttachmentService;

  const eventPublisher = {
    publishInspectionEvent: async (input: { eventType: string }) => {
      events.push(input.eventType);
    },
    publishIssueEvent: async (input: { eventType: string }) => {
      events.push(input.eventType);
    },
    publishRectificationEvent: async (input: { eventType: string }) => {
      events.push(input.eventType);
    }
  } as unknown as EngineeringEventPublisher;

  const service = new EngineeringInspectionService(
    inspectionsRepository,
    issuesRepository,
    rectificationsRepository,
    projectsRepository,
    plansRepository,
    dailyReportsRepository,
    accessPolicy,
    dataScopeAdapter,
    attachmentService,
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
    get inspectionScopeCalls() {
      return inspectionScopeCalls;
    },
    get issueScopeCalls() {
      return issueScopeCalls;
    },
    get createInspectionInput() {
      return createInspectionInput;
    },
    get updateInspectionInput() {
      return updateInspectionInput;
    },
    get createIssueInput() {
      return createIssueInput;
    },
    get updateIssueInput() {
      return updateIssueInput;
    },
    get createRectificationInput() {
      return createRectificationInput;
    },
    auditActions,
    events
  };
}

function createInspectionDto(): CreateEngineeringInspectionDto {
  return {
    project_id: PROJECT_ID,
    plan_id: PLAN_ID,
    daily_report_id: REPORT_ID,
    inspection_title: "A5 楼消防巡检",
    inspection_type: EngineeringInspectionType.SAFETY,
    inspection_date: "2026-06-26",
    issue_count: 0,
    critical_issue_count: 0,
    contractor_org_id: CONTRACTOR_ORG_ID
  };
}

function createIssueDto(): CreateEngineeringIssueDto {
  return {
    issue_title: "消防管线固定不牢",
    issue_type: EngineeringIssueType.SAFETY,
    severity: EngineeringIssueSeverity.CRITICAL,
    description: "支架松动",
    deadline: "2026-06-30"
  };
}

test("EngineeringInspectionService creates inspection after project, plan and daily report validation", async () => {
  const harness = makeHarness();
  const saved = await harness.service.createInspection(createInspectionDto(), harness.context);

  assert.equal(saved.inspectionStatus, EngineeringInspectionStatus.DRAFT);
  assert.equal(harness.createInspectionInput?.projectId, PROJECT_ID);
  assert.equal(harness.createInspectionInput?.planId, PLAN_ID);
  assert.equal(harness.createInspectionInput?.dailyReportId, REPORT_ID);
  assert.equal(harness.projectScopeCalls, 1);
  assert.equal(harness.planScopeCalls, 1);
  assert.equal(harness.reportScopeCalls, 1);
  assert.deepEqual(harness.permissions, [EngineeringInspectionPermission.CREATE]);
  assert.deepEqual(harness.auditActions, ["CREATE"]);
  assert.deepEqual(harness.events, ["EngineeringInspectionCreatedEvent"]);
});

test("EngineeringInspectionService rejects inspection when plan or daily report belongs to another project", async () => {
  await assert.rejects(() => makeHarness({ planWrongProject: true }).service.createInspection(createInspectionDto(), makeContext()), BadRequestException);
  await assert.rejects(() => makeHarness({ reportWrongProject: true }).service.createInspection(createInspectionDto(), makeContext()), BadRequestException);
});

test("EngineeringInspectionService submits only DRAFT inspections", async () => {
  const harness = makeHarness();
  const submitted = await harness.service.submitInspection(INSPECTION_ID, harness.context);

  assert.equal(submitted.inspectionStatus, EngineeringInspectionStatus.SUBMITTED);
  assert.equal(harness.updateInspectionInput?.submittedBy, ACTOR_ID);
  assert.deepEqual(harness.permissions, [EngineeringInspectionPermission.SUBMIT]);
  assert.deepEqual(harness.auditActions, ["SUBMIT"]);
  assert.deepEqual(harness.events, ["EngineeringInspectionSubmittedEvent"]);

  await assert.rejects(
    () => makeHarness({ inspectionStatus: EngineeringInspectionStatus.SUBMITTED }).service.submitInspection(INSPECTION_ID, makeContext()),
    BadRequestException
  );
});

test("EngineeringInspectionService lists inspections with project access and inspection DataScope", async () => {
  const harness = makeHarness();
  await harness.service.paginateInspections({ page: 1, page_size: 20, project_id: PROJECT_ID }, harness.context);
  await harness.service.getProjectInspections(PROJECT_ID, harness.context);

  assert.deepEqual(harness.permissions, [EngineeringInspectionPermission.VIEW, EngineeringInspectionPermission.VIEW]);
  assert.equal(harness.projectScopeCalls, 2);
  assert.equal(harness.inspectionScopeCalls, 2);
});

test("EngineeringInspectionService creates issue from inspection and syncs issue counters", async () => {
  const harness = makeHarness();
  const issue = await harness.service.createInspectionIssue(INSPECTION_ID, createIssueDto(), harness.context);

  assert.equal(issue.issueStatus, EngineeringIssueStatus.OPEN);
  assert.equal(harness.createIssueInput?.projectId, PROJECT_ID);
  assert.equal(harness.createIssueInput?.inspectionId, INSPECTION_ID);
  assert.equal(harness.createIssueInput?.sourceType, EngineeringIssueSourceType.INSPECTION);
  assert.equal(harness.updateInspectionInput?.issueCount, 1);
  assert.equal(harness.updateInspectionInput?.criticalIssueCount, 1);
  assert.deepEqual(harness.permissions, [EngineeringInspectionPermission.ISSUE_CREATE]);
  assert.deepEqual(harness.auditActions, ["CREATE"]);
  assert.deepEqual(harness.events, ["EngineeringIssueCreatedEvent"]);
});

test("EngineeringInspectionService requires project or inspection to create a direct issue", async () => {
  const harness = makeHarness();
  await assert.rejects(() => harness.service.createIssue(createIssueDto(), harness.context), BadRequestException);

  const direct = await harness.service.createIssue({ ...createIssueDto(), project_id: PROJECT_ID }, harness.context);
  assert.equal(direct.sourceType, EngineeringIssueSourceType.MANUAL);
  assert.equal(harness.createIssueInput?.projectId, PROJECT_ID);
});

test("EngineeringInspectionService closes issue with actor evidence", async () => {
  const harness = makeHarness();
  await harness.service.updateIssue(ISSUE_ID, { issue_status: EngineeringIssueStatus.CLOSED }, harness.context);

  assert.equal(harness.updateIssueInput?.closedBy, ACTOR_ID);
  assert.ok(harness.updateIssueInput?.closedAt instanceof Date);
  assert.deepEqual(harness.permissions, [EngineeringInspectionPermission.ISSUE_UPDATE]);
  assert.deepEqual(harness.auditActions, ["UPDATE"]);
  assert.deepEqual(harness.events, ["EngineeringIssueUpdatedEvent"]);
});

test("EngineeringInspectionService generates rectification task from issue and links it back", async () => {
  const harness = makeHarness();
  const rectification = await harness.service.generateRectificationFromIssue(
    ISSUE_ID,
    { rectification_title: "消防管线固定整改", deadline: "2026-07-01" },
    harness.context
  );

  assert.equal(rectification.id, RECTIFICATION_ID);
  assert.equal(rectification.issueId, ISSUE_ID);
  assert.equal(rectification.status, EngineeringRectificationStatus.PENDING);
  assert.equal(rectification.deadline, "2026-07-01");
  assert.equal(harness.createRectificationInput?.projectId, PROJECT_ID);
  assert.equal(harness.createRectificationInput?.inspectionId, INSPECTION_ID);
  assert.equal(harness.updateIssueInput?.rectificationId, RECTIFICATION_ID);
  assert.equal(harness.updateIssueInput?.issueStatus, EngineeringIssueStatus.RECTIFICATION_PENDING);
  assert.deepEqual(harness.permissions, [EngineeringInspectionPermission.ISSUE_GENERATE_RECTIFICATION]);
  assert.deepEqual(harness.auditActions, ["CREATE_FROM_ISSUE", "GENERATE_RECTIFICATION"]);
  assert.deepEqual(harness.events, ["EngineeringRectificationCreatedEvent", "EngineeringIssueUpdatedEvent"]);
});

test("EngineeringInspectionService blocks duplicate rectification generation", async () => {
  await assert.rejects(
    () => makeHarness({ issueHasRectification: true }).service.generateRectificationFromIssue(ISSUE_ID, {}, makeContext()),
    /already has a rectification task/
  );
  await assert.rejects(
    () => makeHarness({ existingRectification: true }).service.generateRectificationFromIssue(ISSUE_ID, {}, makeContext()),
    /already has a rectification task/
  );
});

test("EngineeringInspectionService refuses rectification generation for closed or cancelled issues", async () => {
  await assert.rejects(
    () => makeHarness({ issueStatus: EngineeringIssueStatus.CLOSED }).service.generateRectificationFromIssue(ISSUE_ID, {}, makeContext()),
    BadRequestException
  );
  await assert.rejects(
    () => makeHarness({ issueStatus: EngineeringIssueStatus.CANCELLED }).service.generateRectificationFromIssue(ISSUE_ID, {}, makeContext()),
    BadRequestException
  );
});
