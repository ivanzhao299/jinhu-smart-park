import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { EngineeringPlanLevel, EngineeringPlanStatus, EngineeringPlanType, EngineeringProjectType } from "./domain/engineering-project.enums";
import type { CreateEngineeringPlanDto, UpdateEngineeringPlanDto } from "./dto/engineering-plan.dto";
import { EngineeringPlanEntity } from "./entities/engineering-plan.entity";
import { EngineeringProjectEntity } from "./entities/engineering-project.entity";
import { EngineeringAuditLogger } from "./audit/engineering-audit.logger";
import { EngineeringAttachmentService } from "./engineering-attachment.service";
import { EngineeringEventPublisher, type EngineeringPlanEventType } from "./events/engineering-event.publisher";
import { EngineeringProjectRuntimeContext } from "./engineering-project.service";
import { EngineeringPlanService } from "./engineering-plan.service";
import { EngineeringDataScopeAdapter } from "./policies/engineering-data-scope.adapter";
import { EngineeringPlanAccessPolicy, EngineeringPlanPermission, type EngineeringPlanPermissionValue } from "./policies/engineering-plan-access.policy";
import { EngineeringPlanRepository, type CreateEngineeringPlanInput, type UpdateEngineeringPlanInput } from "./repositories/engineering-plan.repository";
import { EngineeringProjectRepository } from "./repositories/engineering-project.repository";

const PROJECT_ID = "00000000-0000-0000-0000-000000000101";
const OTHER_PROJECT_ID = "00000000-0000-0000-0000-000000000102";
const PLAN_ID = "00000000-0000-0000-0000-000000000201";
const PARENT_PLAN_ID = "00000000-0000-0000-0000-000000000202";
const ACTOR_ID = "00000000-0000-0000-0000-000000000301";

interface Harness {
  service: EngineeringPlanService;
  context: EngineeringProjectRuntimeContext;
  permissions: EngineeringPlanPermissionValue[];
  projectScopeCalls: number;
  planScopeCalls: number;
  createInput: CreateEngineeringPlanInput | null;
  updateInput: UpdateEngineeringPlanInput | null;
  softDeletedIds: string[];
  auditActions: string[];
  events: EngineeringPlanEventType[];
}

function makeProject(projectId: string = PROJECT_ID): EngineeringProjectEntity {
  return {
    id: projectId,
    tenantId: "tenant-a",
    parkId: "park-a",
    orgId: "00000000-0000-0000-0000-000000000401",
    projectCode: "GC20260626001",
    projectName: "A5 楼消防改造",
    projectType: EngineeringProjectType.FIRE_PROTECTION,
    isDeleted: false,
    createTime: new Date("2026-06-26T00:00:00.000Z"),
    updateTime: new Date("2026-06-26T00:00:00.000Z")
  } as EngineeringProjectEntity;
}

function makePlan(planId: string = PLAN_ID, projectId: string = PROJECT_ID, status: EngineeringPlanStatus = EngineeringPlanStatus.DRAFT): EngineeringPlanEntity {
  return {
    id: planId,
    tenantId: "tenant-a",
    parkId: "park-a",
    orgId: "00000000-0000-0000-0000-000000000401",
    projectId,
    planCode: "GCJH20260626001",
    planName: "消防改造总计划",
    planType: EngineeringPlanType.MASTER,
    parentPlanId: null,
    planLevel: EngineeringPlanLevel.L1,
    plannedStartDate: "2099-06-26",
    plannedEndDate: "2099-07-26",
    actualStartDate: null,
    actualEndDate: null,
    plannedProgressPercent: 0,
    actualProgressPercent: 0,
    status,
    delayDays: 0,
    isDeleted: false,
    createTime: new Date("2026-06-26T00:00:00.000Z"),
    updateTime: new Date("2026-06-26T00:00:00.000Z")
  } as EngineeringPlanEntity;
}

function makeContext(): EngineeringProjectRuntimeContext {
  return {
    tenantId: "tenant-a",
    parkId: "park-a",
    requestId: "req-task-006",
    actor: {
      sub: ACTOR_ID,
      username: "pm",
      realName: "项目经理",
      tenantId: "tenant-a",
      parkId: "park-a",
      roles: ["PROJECT_MANAGER"],
      permissions: ["ENGINEERING_PLAN_VIEW", "ENGINEERING_PLAN_CREATE", "ENGINEERING_PLAN_UPDATE", "ENGINEERING_PLAN_APPROVE"]
    }
  };
}

function makeHarness(options: { projectMissing?: boolean; parentWrongProject?: boolean } = {}): Harness {
  const project = makeProject();
  const plan = makePlan();
  const parentPlan = makePlan(PARENT_PLAN_ID, options.parentWrongProject ? OTHER_PROJECT_ID : PROJECT_ID);
  const permissions: EngineeringPlanPermissionValue[] = [];
  let projectScopeCalls = 0;
  let planScopeCalls = 0;
  let createInput: CreateEngineeringPlanInput | null = null;
  let updateInput: UpdateEngineeringPlanInput | null = null;
  const softDeletedIds: string[] = [];
  const auditActions: string[] = [];
  const events: EngineeringPlanEventType[] = [];

  const projectsRepository = {
    findById: async (_scope: unknown, id: string, applyScope?: (builder: unknown) => Promise<void>) => {
      await applyScope?.({});
      if (options.projectMissing || id !== PROJECT_ID) throw new NotFoundException("Engineering project not found");
      return project;
    }
  } as unknown as EngineeringProjectRepository;

  const plansRepository = {
    createPlan: async (_scope: unknown, _actorId: string | null, input: CreateEngineeringPlanInput) => {
      createInput = input;
      return { ...plan, id: PLAN_ID, projectId: input.projectId, planName: input.planName, planType: input.planType } as EngineeringPlanEntity;
    },
    paginatePlans: async (_scope: unknown, _query: unknown, applyScope?: (builder: unknown) => Promise<void>) => {
      await applyScope?.({});
      return { items: [plan], total: 1, page: 1, page_size: 20 };
    },
    findById: async (_scope: unknown, id: string, applyScope?: (builder: unknown) => Promise<void>) => {
      await applyScope?.({});
      if (id === PARENT_PLAN_ID) return parentPlan;
      if (id === PLAN_ID) return plan;
      throw new NotFoundException("Engineering plan not found");
    },
    findByProjectId: async (_scope: unknown, projectId: string, applyScope?: (builder: unknown) => Promise<void>) => {
      await applyScope?.({});
      assert.equal(projectId, PROJECT_ID);
      return [plan];
    },
    updatePlan: async (_scope: unknown, _actorId: string | null, _id: string, input: UpdateEngineeringPlanInput) => {
      updateInput = input;
      return { ...plan, ...input } as EngineeringPlanEntity;
    },
    updateProgress: async (_scope: unknown, _actorId: string | null, _id: string, input: Partial<EngineeringPlanEntity>) =>
      ({ ...plan, ...input } as EngineeringPlanEntity),
    updateStatus: async (_scope: unknown, _actorId: string | null, _id: string, input: Partial<EngineeringPlanEntity>) =>
      ({ ...plan, ...input } as EngineeringPlanEntity),
    softDelete: async (_scope: unknown, _actorId: string | null, id: string) => {
      softDeletedIds.push(id);
      return { id };
    }
  } as unknown as EngineeringPlanRepository;

  const accessPolicy = {
    assertPermission: (permission: EngineeringPlanPermissionValue) => {
      permissions.push(permission);
    }
  } as unknown as EngineeringPlanAccessPolicy;

  const dataScopeAdapter = {
    applyProjectScope: async () => {
      projectScopeCalls += 1;
    },
    applyPlanScope: async () => {
      planScopeCalls += 1;
    }
  } as unknown as EngineeringDataScopeAdapter;

  const auditLogger = {
    logPlanChanged: async (input: { action: string }) => {
      auditActions.push(input.action);
    }
  } as unknown as EngineeringAuditLogger;
  const attachmentService = {
    normalizeAttachmentIds: async (_scope: unknown, attachmentIds: string[] | null | undefined) => attachmentIds
  } as unknown as EngineeringAttachmentService;

  const eventPublisher = {
    publishPlanEvent: async (input: { eventType: EngineeringPlanEventType }) => {
      events.push(input.eventType);
    }
  } as unknown as EngineeringEventPublisher;

  const service = new EngineeringPlanService(
    plansRepository,
    projectsRepository,
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

function createDto(): CreateEngineeringPlanDto {
  return {
    project_id: PROJECT_ID,
    plan_name: "消防改造总计划",
    plan_type: EngineeringPlanType.MASTER,
    planned_start_date: "2099-06-26",
    planned_end_date: "2099-07-26",
    planned_progress_percent: 20,
    weight: 100
  };
}

test("EngineeringPlanService creates plan after project access validation", async () => {
  const harness = makeHarness();
  const saved = await harness.service.createPlan(createDto(), harness.context);

  assert.equal(saved.status, EngineeringPlanStatus.DRAFT);
  assert.equal(harness.createInput?.projectId, PROJECT_ID);
  assert.equal(harness.createInput?.weight, "100.00");
  assert.equal(harness.projectScopeCalls, 1);
  assert.deepEqual(harness.permissions, [EngineeringPlanPermission.CREATE]);
  assert.deepEqual(harness.auditActions, ["CREATE"]);
  assert.deepEqual(harness.events, ["EngineeringPlanCreatedEvent"]);
});

test("EngineeringPlanService rejects create when projectId does not exist", async () => {
  const harness = makeHarness({ projectMissing: true });

  await assert.rejects(() => harness.service.createPlan(createDto(), harness.context), NotFoundException);
});

test("EngineeringPlanService requires parentPlanId to belong to the same project", async () => {
  const harness = makeHarness({ parentWrongProject: true });

  await assert.rejects(
    () => harness.service.createPlan({ ...createDto(), parent_plan_id: PARENT_PLAN_ID }, harness.context),
    BadRequestException
  );
});

test("EngineeringPlanService rejects invalid planned date ranges", async () => {
  const harness = makeHarness();

  await assert.rejects(
    () => harness.service.createPlan({ ...createDto(), planned_start_date: "2099-07-26", planned_end_date: "2099-06-26" }, harness.context),
    BadRequestException
  );
});

test("EngineeringPlanService paginates plans and applies DataScope", async () => {
  const harness = makeHarness();
  const result = await harness.service.paginatePlans({ page: 1, page_size: 20 }, harness.context);

  assert.equal(result.total, 1);
  assert.equal(harness.planScopeCalls, 1);
  assert.deepEqual(harness.permissions, [EngineeringPlanPermission.VIEW]);
});

test("EngineeringPlanService gets project plans after project access validation", async () => {
  const harness = makeHarness();
  const result = await harness.service.getProjectPlans(PROJECT_ID, harness.context);

  assert.equal(result.length, 1);
  assert.equal(harness.projectScopeCalls, 1);
  assert.equal(harness.planScopeCalls, 1);
});

test("EngineeringPlanService updates progress and publishes progress event", async () => {
  const harness = makeHarness();
  const updated = await harness.service.updateProgress(PLAN_ID, { actual_progress_percent: 35, comment: "现场推进" }, harness.context);

  assert.equal(updated.actualProgressPercent, 35);
  assert.equal(updated.status, EngineeringPlanStatus.IN_PROGRESS);
  assert.deepEqual(harness.permissions, [EngineeringPlanPermission.UPDATE]);
  assert.deepEqual(harness.auditActions, ["UPDATE_PROGRESS"]);
  assert.ok(harness.events.includes("EngineeringPlanProgressUpdatedEvent"));
});

test("EngineeringPlanService rejects progress outside 0-100", async () => {
  const harness = makeHarness();

  await assert.rejects(() => harness.service.updateProgress(PLAN_ID, { actual_progress_percent: 101 }, harness.context), BadRequestException);
});

test("EngineeringPlanService sets completed status progress to 100", async () => {
  const harness = makeHarness();
  const updated = await harness.service.updateStatus(
    PLAN_ID,
    { status: EngineeringPlanStatus.COMPLETED, reason: "计划完成" },
    harness.context
  );

  assert.equal(updated.status, EngineeringPlanStatus.COMPLETED);
  assert.equal(updated.actualProgressPercent, 100);
  assert.deepEqual(harness.permissions, [EngineeringPlanPermission.UPDATE]);
  assert.ok(harness.events.includes("EngineeringPlanStatusChangedEvent"));
  assert.ok(harness.events.includes("EngineeringPlanCompletedEvent"));
});

test("EngineeringPlanService soft deletes plan through repository", async () => {
  const harness = makeHarness();
  await harness.service.deletePlan(PLAN_ID, harness.context);

  assert.deepEqual(harness.softDeletedIds, [PLAN_ID]);
  assert.deepEqual(harness.permissions, [EngineeringPlanPermission.DELETE]);
  assert.deepEqual(harness.auditActions, ["DELETE"]);
});

test("EngineeringPlanService update validates parent and maps allowed update fields", async () => {
  const harness = makeHarness();
  const dto = {
    plan_name: "消防改造周计划",
    parent_plan_id: PARENT_PLAN_ID,
    actual_progress_percent: 25,
    status: EngineeringPlanStatus.CANCELLED
  } as UpdateEngineeringPlanDto & { status: EngineeringPlanStatus };
  await harness.service.updatePlan(PLAN_ID, dto, harness.context);

  assert.equal(harness.updateInput?.planName, "消防改造周计划");
  assert.equal(harness.updateInput?.parentPlanId, PARENT_PLAN_ID);
  assert.equal(harness.updateInput?.actualProgressPercent, 25);
  assert.equal("status" in (harness.updateInput ?? {}), false);
  assert.equal(harness.planScopeCalls, 2);
});
