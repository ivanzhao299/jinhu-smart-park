import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import {
  EngineeringAcceptanceStatus,
  EngineeringAcceptanceType,
  EngineeringPlanLevel,
  EngineeringPlanStatus,
  EngineeringPlanType,
  EngineeringProjectType
} from "./domain/engineering-project.enums";
import type { CreateEngineeringAcceptanceDto, UpdateEngineeringAcceptanceDto } from "./dto/engineering-acceptance.dto";
import { EngineeringAcceptanceEntity } from "./entities/engineering-acceptance.entity";
import { EngineeringPlanEntity } from "./entities/engineering-plan.entity";
import { EngineeringProjectEntity } from "./entities/engineering-project.entity";
import { EngineeringAuditLogger } from "./audit/engineering-audit.logger";
import { EngineeringEventPublisher, type EngineeringAcceptanceEventType } from "./events/engineering-event.publisher";
import { EngineeringAcceptanceService } from "./engineering-acceptance.service";
import type { EngineeringProjectRuntimeContext } from "./engineering-project.service";
import {
  EngineeringAcceptanceAccessPolicy,
  EngineeringAcceptancePermission,
  type EngineeringAcceptancePermissionValue
} from "./policies/engineering-acceptance-access.policy";
import { EngineeringDataScopeAdapter } from "./policies/engineering-data-scope.adapter";
import { EngineeringPlanRepository } from "./repositories/engineering-plan.repository";
import { EngineeringProjectRepository } from "./repositories/engineering-project.repository";
import {
  EngineeringAcceptanceRepository,
  type CreateEngineeringAcceptanceInput,
  type UpdateEngineeringAcceptanceInput
} from "./repositories/engineering-acceptance.repository";

const PROJECT_ID = "00000000-0000-0000-0000-000000000101";
const OTHER_PROJECT_ID = "00000000-0000-0000-0000-000000000102";
const PLAN_ID = "00000000-0000-0000-0000-000000000201";
const ACCEPTANCE_ID = "00000000-0000-0000-0000-000000000701";
const ACTOR_ID = "00000000-0000-0000-0000-000000000401";

interface Harness {
  service: EngineeringAcceptanceService;
  context: EngineeringProjectRuntimeContext;
  permissions: EngineeringAcceptancePermissionValue[];
  projectScopeCalls: number;
  planScopeCalls: number;
  acceptanceScopeCalls: number;
  createInput: CreateEngineeringAcceptanceInput | null;
  updateInput: UpdateEngineeringAcceptanceInput | null;
  softDeletedIds: string[];
  auditActions: string[];
  events: EngineeringAcceptanceEventType[];
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
    isDeleted: false
  } as EngineeringProjectEntity;
}

function makePlan(projectId: string = PROJECT_ID): EngineeringPlanEntity {
  return {
    id: PLAN_ID,
    tenantId: "tenant-a",
    parkId: "park-a",
    projectId,
    planCode: "GCJH20260626001",
    planName: "消防阶段计划",
    planType: EngineeringPlanType.PHASE,
    planLevel: EngineeringPlanLevel.L2,
    status: EngineeringPlanStatus.IN_PROGRESS,
    isDeleted: false
  } as EngineeringPlanEntity;
}

function makeAcceptance(status: EngineeringAcceptanceStatus = EngineeringAcceptanceStatus.DRAFT): EngineeringAcceptanceEntity {
  return {
    id: ACCEPTANCE_ID,
    tenantId: "tenant-a",
    parkId: "park-a",
    orgId: "00000000-0000-0000-0000-000000000601",
    projectId: PROJECT_ID,
    planId: PLAN_ID,
    acceptanceCode: "GCYS20260626001",
    acceptanceName: "消防系统阶段验收",
    acceptanceType: EngineeringAcceptanceType.STAGE,
    acceptanceStatus: status,
    plannedAcceptanceDate: "2026-06-26",
    actualAcceptanceDate: null,
    submittedAt: status === EngineeringAcceptanceStatus.SUBMITTED ? new Date("2026-06-26T02:00:00.000Z") : null,
    submittedBy: status === EngineeringAcceptanceStatus.SUBMITTED ? ACTOR_ID : null,
    reviewedAt: null,
    reviewedBy: null,
    reviewComment: null,
    isDeleted: false
  } as EngineeringAcceptanceEntity;
}

function makeContext(): EngineeringProjectRuntimeContext {
  return {
    tenantId: "tenant-a",
    parkId: "park-a",
    requestId: "req-task-018",
    actor: {
      sub: ACTOR_ID,
      username: "pm",
      realName: "项目经理",
      tenantId: "tenant-a",
      parkId: "park-a",
      roles: ["PROJECT_MANAGER"],
      permissions: ["ENGINEERING_ACCEPTANCE_VIEW", "ENGINEERING_ACCEPTANCE_CREATE", "ENGINEERING_ACCEPTANCE_UPDATE", "ENGINEERING_ACCEPTANCE_SUBMIT", "ENGINEERING_ACCEPTANCE_REVIEW", "ENGINEERING_ACCEPTANCE_CLOSE"]
    }
  };
}

function makeHarness(
  options: {
    projectMissing?: boolean;
    planWrongProject?: boolean;
    acceptanceStatus?: EngineeringAcceptanceStatus;
  } = {}
): Harness {
  const project = makeProject();
  const plan = makePlan(options.planWrongProject ? OTHER_PROJECT_ID : PROJECT_ID);
  let acceptance = makeAcceptance(options.acceptanceStatus ?? EngineeringAcceptanceStatus.DRAFT);
  const permissions: EngineeringAcceptancePermissionValue[] = [];
  let projectScopeCalls = 0;
  let planScopeCalls = 0;
  let acceptanceScopeCalls = 0;
  let createInput: CreateEngineeringAcceptanceInput | null = null;
  let updateInput: UpdateEngineeringAcceptanceInput | null = null;
  const softDeletedIds: string[] = [];
  const auditActions: string[] = [];
  const events: EngineeringAcceptanceEventType[] = [];

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

  const acceptancesRepository = {
    createAcceptance: async (_scope: unknown, _actorId: string | null, input: CreateEngineeringAcceptanceInput) => {
      createInput = input;
      acceptance = { ...acceptance, ...input, id: ACCEPTANCE_ID, acceptanceStatus: EngineeringAcceptanceStatus.DRAFT } as EngineeringAcceptanceEntity;
      return acceptance;
    },
    paginateAcceptances: async (_scope: unknown, _query: unknown, applyScope?: (builder: unknown) => Promise<void>) => {
      await applyScope?.({});
      return { items: [acceptance], total: 1, page: 1, page_size: 20 };
    },
    findById: async (_scope: unknown, id: string, applyScope?: (builder: unknown) => Promise<void>) => {
      await applyScope?.({});
      if (id !== ACCEPTANCE_ID) throw new NotFoundException("Engineering acceptance not found");
      return acceptance;
    },
    findByProjectId: async (_scope: unknown, projectId: string, _query: unknown, applyScope?: (builder: unknown) => Promise<void>) => {
      await applyScope?.({});
      assert.equal(projectId, PROJECT_ID);
      return [acceptance];
    },
    updateAcceptance: async (_scope: unknown, _actorId: string | null, _id: string, input: UpdateEngineeringAcceptanceInput) => {
      updateInput = input;
      acceptance = { ...acceptance, ...input } as EngineeringAcceptanceEntity;
      return acceptance;
    },
    updateStatus: async (_scope: unknown, _actorId: string | null, _id: string, input: Partial<EngineeringAcceptanceEntity>) => {
      acceptance = { ...acceptance, ...input } as EngineeringAcceptanceEntity;
      return acceptance;
    },
    softDelete: async (_scope: unknown, _actorId: string | null, id: string) => {
      softDeletedIds.push(id);
      return { id };
    }
  } as unknown as EngineeringAcceptanceRepository;

  const accessPolicy = {
    assertPermission: (permission: EngineeringAcceptancePermissionValue) => {
      permissions.push(permission);
    }
  } as unknown as EngineeringAcceptanceAccessPolicy;

  const dataScopeAdapter = {
    applyProjectScope: async () => {
      projectScopeCalls += 1;
    },
    applyPlanScope: async () => {
      planScopeCalls += 1;
    },
    applyAcceptanceScope: async () => {
      acceptanceScopeCalls += 1;
    }
  } as unknown as EngineeringDataScopeAdapter;

  const auditLogger = {
    logAcceptanceChanged: async (input: { action: string }) => {
      auditActions.push(input.action);
    }
  } as unknown as EngineeringAuditLogger;

  const eventPublisher = {
    publishAcceptanceEvent: async (input: { eventType: EngineeringAcceptanceEventType }) => {
      events.push(input.eventType);
    }
  } as unknown as EngineeringEventPublisher;

  const service = new EngineeringAcceptanceService(
    acceptancesRepository,
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
    get acceptanceScopeCalls() {
      return acceptanceScopeCalls;
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

function createDto(): CreateEngineeringAcceptanceDto {
  return {
    project_id: PROJECT_ID,
    plan_id: PLAN_ID,
    acceptance_name: "消防系统阶段验收",
    acceptance_type: EngineeringAcceptanceType.STAGE,
    planned_acceptance_date: "2026-06-26",
    acceptance_scope: "A5 楼消防管线",
    acceptance_criteria: "符合消防专项验收标准"
  };
}

test("EngineeringAcceptanceService creates acceptance after project and plan validation", async () => {
  const harness = makeHarness();
  const saved = await harness.service.createAcceptance(createDto(), harness.context);

  assert.equal(saved.acceptanceStatus, EngineeringAcceptanceStatus.DRAFT);
  assert.equal(harness.createInput?.projectId, PROJECT_ID);
  assert.equal(harness.createInput?.planId, PLAN_ID);
  assert.equal(harness.projectScopeCalls, 1);
  assert.equal(harness.planScopeCalls, 1);
  assert.deepEqual(harness.permissions, [EngineeringAcceptancePermission.CREATE]);
  assert.deepEqual(harness.auditActions, ["CREATE"]);
  assert.deepEqual(harness.events, ["EngineeringAcceptanceCreatedEvent"]);
});

test("EngineeringAcceptanceService rejects create when project or plan is invalid", async () => {
  await assert.rejects(() => makeHarness({ projectMissing: true }).service.createAcceptance(createDto(), makeContext()), NotFoundException);
  await assert.rejects(() => makeHarness({ planWrongProject: true }).service.createAcceptance(createDto(), makeContext()), BadRequestException);
});

test("EngineeringAcceptanceService updates editable acceptances only", async () => {
  const harness = makeHarness({ acceptanceStatus: EngineeringAcceptanceStatus.DRAFT });
  await harness.service.updateAcceptance(ACCEPTANCE_ID, { acceptance_name: "更新验收名称" }, harness.context);
  assert.equal(harness.updateInput?.acceptanceName, "更新验收名称");
  assert.deepEqual(harness.permissions, [EngineeringAcceptancePermission.UPDATE]);
  assert.deepEqual(harness.auditActions, ["UPDATE"]);
  assert.deepEqual(harness.events, ["EngineeringAcceptanceUpdatedEvent"]);

  const submittedHarness = makeHarness({ acceptanceStatus: EngineeringAcceptanceStatus.SUBMITTED });
  await assert.rejects(
    () => submittedHarness.service.updateAcceptance(ACCEPTANCE_ID, { acceptance_name: "试图修改" } as UpdateEngineeringAcceptanceDto, submittedHarness.context),
    BadRequestException
  );
});

test("EngineeringAcceptanceService submits draft or rectification required acceptances", async () => {
  const harness = makeHarness({ acceptanceStatus: EngineeringAcceptanceStatus.DRAFT });
  const submitted = await harness.service.submitAcceptance(ACCEPTANCE_ID, harness.context);

  assert.equal(submitted.acceptanceStatus, EngineeringAcceptanceStatus.SUBMITTED);
  assert.equal(submitted.submittedBy, ACTOR_ID);
  assert.deepEqual(harness.permissions, [EngineeringAcceptancePermission.SUBMIT]);
  assert.deepEqual(harness.auditActions, ["SUBMIT"]);
  assert.deepEqual(harness.events, ["EngineeringAcceptanceSubmittedEvent"]);

  const passedHarness = makeHarness({ acceptanceStatus: EngineeringAcceptanceStatus.PASSED });
  await assert.rejects(() => passedHarness.service.submitAcceptance(ACCEPTANCE_ID, passedHarness.context), BadRequestException);
});

test("EngineeringAcceptanceService reviews submitted acceptances", async () => {
  const passHarness = makeHarness({ acceptanceStatus: EngineeringAcceptanceStatus.SUBMITTED });
  const passed = await passHarness.service.reviewAcceptance(ACCEPTANCE_ID, { passed: true, review_comment: "通过" }, passHarness.context);
  assert.equal(passed.acceptanceStatus, EngineeringAcceptanceStatus.PASSED);
  assert.equal(passed.reviewedBy, ACTOR_ID);
  assert.deepEqual(passHarness.permissions, [EngineeringAcceptancePermission.REVIEW]);
  assert.deepEqual(passHarness.auditActions, ["REVIEW_PASSED"]);
  assert.deepEqual(passHarness.events, ["EngineeringAcceptancePassedEvent"]);

  const failedHarness = makeHarness({ acceptanceStatus: EngineeringAcceptanceStatus.SUBMITTED });
  const failed = await failedHarness.service.reviewAcceptance(ACCEPTANCE_ID, { passed: false, review_comment: "未通过" }, failedHarness.context);
  assert.equal(failed.acceptanceStatus, EngineeringAcceptanceStatus.FAILED);
  assert.deepEqual(failedHarness.events, ["EngineeringAcceptanceFailedEvent"]);

  const rectifyHarness = makeHarness({ acceptanceStatus: EngineeringAcceptanceStatus.SUBMITTED });
  const rectificationRequired = await rectifyHarness.service.reviewAcceptance(
    ACCEPTANCE_ID,
    { passed: false, rectification_required: true, review_comment: "需整改" },
    rectifyHarness.context
  );
  assert.equal(rectificationRequired.acceptanceStatus, EngineeringAcceptanceStatus.RECTIFICATION_REQUIRED);
  assert.deepEqual(rectifyHarness.events, ["EngineeringAcceptanceRectificationRequiredEvent"]);

  const draftHarness = makeHarness({ acceptanceStatus: EngineeringAcceptanceStatus.DRAFT });
  await assert.rejects(() => draftHarness.service.reviewAcceptance(ACCEPTANCE_ID, { passed: true }, draftHarness.context), BadRequestException);
});

test("EngineeringAcceptanceService closes reviewed acceptances", async () => {
  const harness = makeHarness({ acceptanceStatus: EngineeringAcceptanceStatus.PASSED });
  const closed = await harness.service.closeAcceptance(ACCEPTANCE_ID, harness.context);

  assert.equal(closed.acceptanceStatus, EngineeringAcceptanceStatus.CLOSED);
  assert.equal(closed.closedBy, ACTOR_ID);
  assert.deepEqual(harness.permissions, [EngineeringAcceptancePermission.CLOSE]);
  assert.deepEqual(harness.auditActions, ["CLOSE"]);
  assert.deepEqual(harness.events, ["EngineeringAcceptanceClosedEvent"]);

  const draftHarness = makeHarness({ acceptanceStatus: EngineeringAcceptanceStatus.DRAFT });
  await assert.rejects(() => draftHarness.service.closeAcceptance(ACCEPTANCE_ID, draftHarness.context), BadRequestException);
});

test("EngineeringAcceptanceService deletes only draft acceptances", async () => {
  const harness = makeHarness({ acceptanceStatus: EngineeringAcceptanceStatus.DRAFT });
  await harness.service.deleteAcceptance(ACCEPTANCE_ID, harness.context);

  assert.deepEqual(harness.softDeletedIds, [ACCEPTANCE_ID]);
  assert.deepEqual(harness.permissions, [EngineeringAcceptancePermission.DELETE]);
  assert.deepEqual(harness.auditActions, ["DELETE"]);
  assert.deepEqual(harness.events, ["EngineeringAcceptanceDeletedEvent"]);

  const submittedHarness = makeHarness({ acceptanceStatus: EngineeringAcceptanceStatus.SUBMITTED });
  await assert.rejects(() => submittedHarness.service.deleteAcceptance(ACCEPTANCE_ID, submittedHarness.context), BadRequestException);
});

test("EngineeringAcceptanceService list, detail and project query apply DataScope", async () => {
  const harness = makeHarness();
  const page = await harness.service.paginateAcceptances({ page: 1, page_size: 20 }, harness.context);
  assert.equal(page.total, 1);
  assert.equal(harness.acceptanceScopeCalls, 1);

  await harness.service.getAcceptanceDetail(ACCEPTANCE_ID, harness.context);
  assert.equal(harness.acceptanceScopeCalls, 2);

  const projectAcceptances = await harness.service.getProjectAcceptances(PROJECT_ID, harness.context);
  assert.equal(projectAcceptances.length, 1);
  assert.equal(harness.projectScopeCalls, 1);
  assert.equal(harness.acceptanceScopeCalls, 3);
  assert.deepEqual(harness.permissions, [
    EngineeringAcceptancePermission.VIEW,
    EngineeringAcceptancePermission.VIEW,
    EngineeringAcceptancePermission.VIEW
  ]);
});
