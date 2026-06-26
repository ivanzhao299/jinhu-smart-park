import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException } from "@nestjs/common";
import type { Repository } from "typeorm";
import { EngineeringProjectStatus, EngineeringProjectType } from "./domain/engineering-project.enums";
import { EngineeringProjectAction } from "./domain/engineering-project-state-machine.types";
import type { CreateEngineeringProjectDto, UpdateEngineeringProjectDto } from "./dto/engineering-project.dto";
import { EngineeringProjectEntity } from "./entities/engineering-project.entity";
import { EngineeringProjectStatusLogEntity } from "./entities/engineering-project-status-log.entity";
import { EngineeringProjectRuntimeContext, EngineeringProjectService } from "./engineering-project.service";
import { EngineeringProjectStatusService } from "./engineering-project-status.service";
import { EngineeringDataScopeAdapter } from "./policies/engineering-data-scope.adapter";
import {
  EngineeringProjectAccessPolicy,
  EngineeringProjectPermission,
  type EngineeringProjectPermissionValue
} from "./policies/engineering-project-access.policy";
import { EngineeringProjectRepository, type CreateEngineeringProjectInput, type UpdateEngineeringProjectInput } from "./repositories/engineering-project.repository";

const PROJECT_ID = "00000000-0000-0000-0000-000000000101";
const ACTOR_ID = "00000000-0000-0000-0000-000000000201";

interface Harness {
  service: EngineeringProjectService;
  context: EngineeringProjectRuntimeContext;
  project: EngineeringProjectEntity;
  permissions: EngineeringProjectPermissionValue[];
  dataScopeCalls: number;
  createInput: CreateEngineeringProjectInput | null;
  updateInput: UpdateEngineeringProjectInput | null;
  softDeletedIds: string[];
  statusActions: EngineeringProjectAction[];
}

function makeProject(status: EngineeringProjectStatus = EngineeringProjectStatus.DRAFT): EngineeringProjectEntity {
  return {
    id: PROJECT_ID,
    tenantId: "tenant-a",
    parkId: "park-a",
    orgId: "00000000-0000-0000-0000-000000000301",
    projectCode: "GC20260626001",
    projectName: "A5 楼消防改造",
    projectType: EngineeringProjectType.FIRE_PROTECTION,
    status,
    progressPercent: 0,
    isDeleted: false,
    createTime: new Date("2026-06-26T00:00:00.000Z"),
    updateTime: new Date("2026-06-26T00:00:00.000Z")
  } as EngineeringProjectEntity;
}

function makeContext(): EngineeringProjectRuntimeContext {
  return {
    tenantId: "tenant-a",
    parkId: "park-a",
    requestId: "req-task-004",
    actor: {
      sub: ACTOR_ID,
      username: "pm",
      realName: "项目经理",
      tenantId: "tenant-a",
      parkId: "park-a",
      roles: ["PROJECT_MANAGER"],
      permissions: ["ENGINEERING_PROJECT_VIEW", "ENGINEERING_PROJECT_CREATE", "ENGINEERING_PROJECT_UPDATE", "ENGINEERING_PROJECT_SUBMIT"]
    }
  };
}

function makeHarness(status: EngineeringProjectStatus = EngineeringProjectStatus.DRAFT): Harness {
  const project = makeProject(status);
  const permissions: EngineeringProjectPermissionValue[] = [];
  let dataScopeCalls = 0;
  let createInput: CreateEngineeringProjectInput | null = null;
  let updateInput: UpdateEngineeringProjectInput | null = null;
  const softDeletedIds: string[] = [];
  const statusActions: EngineeringProjectAction[] = [];
  const projectsRepository = {
    createProject: async (_scope: unknown, _actorId: string | null, input: CreateEngineeringProjectInput) => {
      createInput = input;
      return { ...project, status: EngineeringProjectStatus.DRAFT, projectName: input.projectName, projectType: input.projectType } as EngineeringProjectEntity;
    },
    paginateProjects: async (_scope: unknown, _query: unknown, applyScope: (builder: unknown) => Promise<void>) => {
      await applyScope({});
      return { items: [project], total: 1, page: 1, page_size: 20 };
    },
    findById: async (scope: { tenantId: string; parkId: string }, id: string, applyScope?: (builder: unknown) => Promise<void>) => {
      assert.equal(scope.tenantId, "tenant-a");
      assert.equal(scope.parkId, "park-a");
      assert.equal(id, PROJECT_ID);
      await applyScope?.({});
      return project;
    },
    updateProject: async (_scope: unknown, _actorId: string | null, _id: string, input: UpdateEngineeringProjectInput) => {
      updateInput = input;
      return { ...project, ...input } as EngineeringProjectEntity;
    },
    softDelete: async (_scope: unknown, _actorId: string | null, id: string) => {
      softDeletedIds.push(id);
      return { id };
    }
  } as unknown as EngineeringProjectRepository;
  const statusService = {
    submitProject: async () => {
      statusActions.push(EngineeringProjectAction.SUBMIT);
      return { ...project, status: EngineeringProjectStatus.SUBMITTED } as EngineeringProjectEntity;
    },
    approveProject: async () => {
      statusActions.push(EngineeringProjectAction.APPROVE);
      return { ...project, status: EngineeringProjectStatus.APPROVED } as EngineeringProjectEntity;
    },
    getAvailableActions: async () => [
      {
        action: EngineeringProjectAction.SUBMIT,
        targetStatus: EngineeringProjectStatus.SUBMITTED,
        requiredPermission: "ENGINEERING_PROJECT_SUBMIT"
      }
    ]
  } as unknown as EngineeringProjectStatusService;
  const accessPolicy = {
    assertPermission: (permission: EngineeringProjectPermissionValue) => {
      permissions.push(permission);
    }
  } as unknown as EngineeringProjectAccessPolicy;
  const dataScopeAdapter = {
    applyProjectScope: async () => {
      dataScopeCalls += 1;
    }
  } as unknown as EngineeringDataScopeAdapter;
  const statusLogsRepository = {
    find: async () => [
      {
        id: "log-id",
        tenantId: "tenant-a",
        parkId: "park-a",
        projectId: PROJECT_ID,
        fromStatus: EngineeringProjectStatus.DRAFT,
        toStatus: EngineeringProjectStatus.SUBMITTED,
        action: EngineeringProjectAction.SUBMIT,
        reason: "提交立项",
        actorUserId: ACTOR_ID,
        createdAt: new Date("2026-06-26T00:00:00.000Z")
      } as EngineeringProjectStatusLogEntity
    ]
  } as unknown as Repository<EngineeringProjectStatusLogEntity>;
  const service = new EngineeringProjectService(projectsRepository, statusService, accessPolicy, dataScopeAdapter, statusLogsRepository);
  return {
    service,
    context: makeContext(),
    project,
    permissions,
    get dataScopeCalls() {
      return dataScopeCalls;
    },
    get createInput() {
      return createInput;
    },
    get updateInput() {
      return updateInput;
    },
    softDeletedIds,
    statusActions
  };
}

function createDto(): CreateEngineeringProjectDto {
  return {
    project_name: "A5 楼消防改造",
    project_type: EngineeringProjectType.FIRE_PROTECTION,
    planned_start_date: "2026-06-26",
    planned_end_date: "2026-07-26",
    project_manager_id: ACTOR_ID,
    budget_amount: 1000
  };
}

test("EngineeringProjectService creates project with DRAFT default through repository", async () => {
  const harness = makeHarness();
  const saved = await harness.service.createProject(createDto(), harness.context);

  assert.equal(saved.status, EngineeringProjectStatus.DRAFT);
  assert.equal(harness.createInput?.projectName, "A5 楼消防改造");
  assert.equal(harness.createInput?.budgetAmount, "1000.00");
  assert.deepEqual(harness.permissions, [EngineeringProjectPermission.CREATE]);
});

test("EngineeringProjectService paginates projects and applies DataScope", async () => {
  const harness = makeHarness();
  const result = await harness.service.paginateProjects({ page: 1, page_size: 20 }, harness.context);

  assert.equal(result.total, 1);
  assert.equal(harness.dataScopeCalls, 1);
  assert.deepEqual(harness.permissions, [EngineeringProjectPermission.VIEW]);
});

test("EngineeringProjectService gets detail with tenant and DataScope filtering", async () => {
  const harness = makeHarness();
  const detail = await harness.service.getProjectDetail(PROJECT_ID, harness.context);

  assert.equal(detail.id, PROJECT_ID);
  assert.equal(harness.dataScopeCalls, 1);
});

test("EngineeringProjectService update ignores direct status payload and maps allowed fields only", async () => {
  const harness = makeHarness();
  const dto = {
    project_name: "A5 楼消防改造二期",
    progress_percent: 30,
    status: EngineeringProjectStatus.CLOSED,
    settlement_amount: 9999
  } as UpdateEngineeringProjectDto & { status: EngineeringProjectStatus; settlement_amount: number };
  await harness.service.updateProject(PROJECT_ID, dto, harness.context);

  assert.equal(harness.updateInput?.projectName, "A5 楼消防改造二期");
  assert.equal(harness.updateInput?.progressPercent, 30);
  assert.equal("status" in (harness.updateInput ?? {}), false);
  assert.equal("settlementAmount" in (harness.updateInput ?? {}), false);
  assert.deepEqual(harness.permissions, [EngineeringProjectPermission.UPDATE]);
});

test("EngineeringProjectService executes SUBMIT through EngineeringProjectStatusService", async () => {
  const harness = makeHarness();
  const updated = await harness.service.executeProjectAction(
    PROJECT_ID,
    EngineeringProjectAction.SUBMIT,
    { reason: "提交立项" },
    harness.context
  );

  assert.equal(updated.status, EngineeringProjectStatus.SUBMITTED);
  assert.deepEqual(harness.statusActions, [EngineeringProjectAction.SUBMIT]);
});

test("EngineeringProjectService rejects invalid action values", async () => {
  const harness = makeHarness();

  await assert.rejects(
    () => harness.service.executeProjectAction(PROJECT_ID, "NOT_A_REAL_ACTION", { reason: "非法动作" }, harness.context),
    BadRequestException
  );
});

test("EngineeringProjectService propagates illegal transition errors from status service", async () => {
  const harness = makeHarness();
  const service = new EngineeringProjectService(
    {
      findById: async () => harness.project
    } as unknown as EngineeringProjectRepository,
    {
      approveProject: async () => {
        throw new BadRequestException("Illegal engineering project transition");
      }
    } as unknown as EngineeringProjectStatusService,
    {
      assertPermission: () => undefined
    } as unknown as EngineeringProjectAccessPolicy,
    {
      applyProjectScope: async () => undefined
    } as unknown as EngineeringDataScopeAdapter,
    {
      find: async () => []
    } as unknown as Repository<EngineeringProjectStatusLogEntity>
  );

  await assert.rejects(
    () => service.executeProjectAction(PROJECT_ID, EngineeringProjectAction.APPROVE, { reason: "跳过提交" }, harness.context),
    /Illegal engineering project transition/
  );
});

test("EngineeringProjectService returns available actions and status logs", async () => {
  const harness = makeHarness();

  const actions = await harness.service.getAvailableActions(PROJECT_ID, harness.context);
  const logs = await harness.service.getStatusLogs(PROJECT_ID, harness.context);

  assert.equal(actions[0]?.action, EngineeringProjectAction.SUBMIT);
  assert.equal(logs[0]?.toStatus, EngineeringProjectStatus.SUBMITTED);
});

test("EngineeringProjectService soft deletes project through repository", async () => {
  const harness = makeHarness();
  const result = await harness.service.deleteProject(PROJECT_ID, harness.context);

  assert.equal(result.id, PROJECT_ID);
  assert.deepEqual(harness.softDeletedIds, [PROJECT_ID]);
  assert.deepEqual(harness.permissions, [EngineeringProjectPermission.DELETE]);
});
