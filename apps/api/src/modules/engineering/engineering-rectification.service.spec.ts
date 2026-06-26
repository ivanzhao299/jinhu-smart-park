import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { EngineeringIssueSeverity, EngineeringIssueStatus, EngineeringProjectType, EngineeringRectificationStatus } from "./domain/engineering-project.enums";
import { EngineeringRectificationAction } from "./domain/engineering-rectification-state-machine.types";
import { EngineeringIssueEntity } from "./entities/engineering-issue.entity";
import { EngineeringProjectEntity } from "./entities/engineering-project.entity";
import { EngineeringRectificationEntity } from "./entities/engineering-rectification.entity";
import { EngineeringAuditLogger } from "./audit/engineering-audit.logger";
import { EngineeringEventPublisher } from "./events/engineering-event.publisher";
import { EngineeringRectificationStateMachine } from "./engineering-rectification-state.machine";
import { EngineeringRectificationService } from "./engineering-rectification.service";
import type { EngineeringProjectRuntimeContext } from "./engineering-project.service";
import { EngineeringDataScopeAdapter } from "./policies/engineering-data-scope.adapter";
import {
  EngineeringRectificationAccessPolicy,
  EngineeringRectificationPermission,
  type EngineeringRectificationPermissionValue
} from "./policies/engineering-rectification-access.policy";
import { EngineeringIssueRepository, type UpdateEngineeringIssueInput } from "./repositories/engineering-issue.repository";
import { EngineeringProjectRepository } from "./repositories/engineering-project.repository";
import {
  EngineeringRectificationRepository,
  type CreateEngineeringRectificationInput,
  type UpdateEngineeringRectificationInput,
  type UpdateEngineeringRectificationStatusInput
} from "./repositories/engineering-rectification.repository";

const PROJECT_ID = "00000000-0000-0000-0000-000000000101";
const ISSUE_ID = "00000000-0000-0000-0000-000000000501";
const RECTIFICATION_ID = "00000000-0000-0000-0000-000000000901";
const ACTOR_ID = "00000000-0000-0000-0000-000000000601";

interface Harness {
  service: EngineeringRectificationService;
  context: EngineeringProjectRuntimeContext;
  permissions: EngineeringRectificationPermissionValue[];
  projectScopeCalls: number;
  issueScopeCalls: number;
  rectificationScopeCalls: number;
  createRectificationInput: CreateEngineeringRectificationInput | null;
  updateRectificationInput: UpdateEngineeringRectificationInput | null;
  updateRectificationStatusInput: UpdateEngineeringRectificationStatusInput | null;
  updateIssueInput: UpdateEngineeringIssueInput | null;
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
    isDeleted: false
  } as EngineeringProjectEntity;
}

function makeIssue(): EngineeringIssueEntity {
  return {
    id: ISSUE_ID,
    tenantId: "tenant-a",
    parkId: "park-a",
    projectId: PROJECT_ID,
    issueCode: "GCWT20260626001",
    issueTitle: "消防管线固定不牢",
    severity: EngineeringIssueSeverity.HIGH,
    issueStatus: EngineeringIssueStatus.OPEN,
    description: "支架松动",
    deadline: "2026-06-30",
    rectificationId: null,
    isDeleted: false
  } as EngineeringIssueEntity;
}

function makeRectification(status: EngineeringRectificationStatus = EngineeringRectificationStatus.PENDING): EngineeringRectificationEntity {
  return {
    id: RECTIFICATION_ID,
    tenantId: "tenant-a",
    parkId: "park-a",
    projectId: PROJECT_ID,
    issueId: ISSUE_ID,
    inspectionId: null,
    rectificationCode: "GCZG20260626001",
    rectificationTitle: "消防管线固定整改",
    description: "支架松动",
    severity: EngineeringIssueSeverity.HIGH,
    status,
    deadline: "2026-06-30",
    isDeleted: false
  } as EngineeringRectificationEntity;
}

function makeContext(): EngineeringProjectRuntimeContext {
  return {
    tenantId: "tenant-a",
    parkId: "park-a",
    requestId: "req-task-015",
    actor: {
      sub: ACTOR_ID,
      username: "engineer",
      realName: "工程师",
      tenantId: "tenant-a",
      parkId: "park-a",
      roles: ["ENGINEER"],
      permissions: ["module:read"]
    }
  };
}

function makeHarness(options: { rectificationStatus?: EngineeringRectificationStatus; issueWrongProject?: boolean } = {}): Harness {
  const project = makeProject();
  let issue = makeIssue();
  if (options.issueWrongProject) {
    issue = { ...issue, projectId: "00000000-0000-0000-0000-000000000102" } as EngineeringIssueEntity;
  }
  let rectification = makeRectification(options.rectificationStatus ?? EngineeringRectificationStatus.PENDING);
  const permissions: EngineeringRectificationPermissionValue[] = [];
  const auditActions: string[] = [];
  const events: string[] = [];
  let projectScopeCalls = 0;
  let issueScopeCalls = 0;
  let rectificationScopeCalls = 0;
  let createRectificationInput: CreateEngineeringRectificationInput | null = null;
  let updateRectificationInput: UpdateEngineeringRectificationInput | null = null;
  let updateRectificationStatusInput: UpdateEngineeringRectificationStatusInput | null = null;
  let updateIssueInput: UpdateEngineeringIssueInput | null = null;

  const projectsRepository = {
    findById: async (_scope: unknown, id: string, applyScope?: (builder: unknown) => Promise<void>) => {
      await applyScope?.({});
      if (id !== PROJECT_ID) throw new NotFoundException("Engineering project not found");
      return project;
    }
  } as unknown as EngineeringProjectRepository;

  const issuesRepository = {
    findById: async (_scope: unknown, id: string, applyScope?: (builder: unknown) => Promise<void>) => {
      await applyScope?.({});
      if (id !== ISSUE_ID) throw new NotFoundException("Engineering issue not found");
      return issue;
    },
    updateIssue: async (_scope: unknown, _actorId: string | null, _id: string, input: UpdateEngineeringIssueInput) => {
      updateIssueInput = input;
      issue = { ...issue, ...input } as EngineeringIssueEntity;
      return issue;
    }
  } as unknown as EngineeringIssueRepository;

  const rectificationsRepository = {
    createRectification: async (_scope: unknown, _actorId: string | null, input: CreateEngineeringRectificationInput) => {
      createRectificationInput = input;
      rectification = { ...rectification, ...input, id: RECTIFICATION_ID, status: EngineeringRectificationStatus.PENDING } as EngineeringRectificationEntity;
      return rectification;
    },
    paginateRectifications: async (_scope: unknown, _query: unknown, applyScope?: (builder: unknown) => Promise<void>) => {
      await applyScope?.({});
      return { items: [rectification], total: 1, page: 1, page_size: 20 };
    },
    findById: async (_scope: unknown, id: string, applyScope?: (builder: unknown) => Promise<void>) => {
      await applyScope?.({});
      if (id !== RECTIFICATION_ID) throw new NotFoundException("Engineering rectification not found");
      return rectification;
    },
    updateRectification: async (_scope: unknown, _actorId: string | null, _id: string, input: UpdateEngineeringRectificationInput) => {
      updateRectificationInput = input;
      rectification = { ...rectification, ...input } as EngineeringRectificationEntity;
      return rectification;
    },
    updateStatus: async (_scope: unknown, _actorId: string | null, _id: string, input: UpdateEngineeringRectificationStatusInput) => {
      updateRectificationStatusInput = input;
      rectification = { ...rectification, ...input } as EngineeringRectificationEntity;
      return rectification;
    },
    softDelete: async (_scope: unknown, _actorId: string | null, id: string) => ({ id })
  } as unknown as EngineeringRectificationRepository;

  const stateMachine = new EngineeringRectificationStateMachine(rectificationsRepository);
  const accessPolicy = {
    assertPermission: (permission: EngineeringRectificationPermissionValue) => {
      permissions.push(permission);
    }
  } as unknown as EngineeringRectificationAccessPolicy;
  const dataScopeAdapter = {
    applyProjectScope: async () => {
      projectScopeCalls += 1;
    },
    applyIssueScope: async () => {
      issueScopeCalls += 1;
    },
    applyRectificationScope: async () => {
      rectificationScopeCalls += 1;
    }
  } as unknown as EngineeringDataScopeAdapter;
  const auditLogger = {
    logRectificationChanged: async (input: { action: string }) => {
      auditActions.push(input.action);
    }
  } as unknown as EngineeringAuditLogger;
  const eventPublisher = {
    publishRectificationEvent: async (input: { eventType: string }) => {
      events.push(input.eventType);
    }
  } as unknown as EngineeringEventPublisher;

  const service = new EngineeringRectificationService(
    rectificationsRepository,
    issuesRepository,
    projectsRepository,
    stateMachine,
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
    get issueScopeCalls() {
      return issueScopeCalls;
    },
    get rectificationScopeCalls() {
      return rectificationScopeCalls;
    },
    get createRectificationInput() {
      return createRectificationInput;
    },
    get updateRectificationInput() {
      return updateRectificationInput;
    },
    get updateRectificationStatusInput() {
      return updateRectificationStatusInput;
    },
    get updateIssueInput() {
      return updateIssueInput;
    },
    auditActions,
    events
  };
}

test("EngineeringRectificationService creates rectification and links issue", async () => {
  const harness = makeHarness();
  const rectification = await harness.service.createRectification(
    {
      project_id: PROJECT_ID,
      issue_id: ISSUE_ID,
      rectification_title: "消防管线固定整改",
      description: "支架松动",
      severity: EngineeringIssueSeverity.HIGH
    },
    harness.context
  );

  assert.equal(rectification.status, EngineeringRectificationStatus.PENDING);
  assert.equal(harness.createRectificationInput?.projectId, PROJECT_ID);
  assert.equal(harness.createRectificationInput?.issueId, ISSUE_ID);
  assert.equal(harness.updateIssueInput?.rectificationId, RECTIFICATION_ID);
  assert.equal(harness.updateIssueInput?.issueStatus, EngineeringIssueStatus.RECTIFICATION_PENDING);
  assert.deepEqual(harness.permissions, [EngineeringRectificationPermission.ASSIGN]);
  assert.deepEqual(harness.auditActions, ["CREATE"]);
  assert.deepEqual(harness.events, ["EngineeringRectificationCreatedEvent"]);
});

test("EngineeringRectificationService rejects rectification issue outside project", async () => {
  const harness = makeHarness({ issueWrongProject: true });
  await assert.rejects(
    () =>
      harness.service.createRectification(
        {
          project_id: PROJECT_ID,
          issue_id: ISSUE_ID,
          rectification_title: "消防管线固定整改",
          description: "支架松动",
          severity: EngineeringIssueSeverity.HIGH
        },
        harness.context
      ),
    BadRequestException
  );
});

test("EngineeringRectificationService queries rectifications with project access and DataScope", async () => {
  const harness = makeHarness();
  await harness.service.paginateRectifications({ page: 1, page_size: 20, project_id: PROJECT_ID }, harness.context);
  await harness.service.getProjectRectifications(PROJECT_ID, harness.context);
  await harness.service.getRectificationDetail(RECTIFICATION_ID, harness.context);

  assert.deepEqual(harness.permissions, [
    EngineeringRectificationPermission.VIEW,
    EngineeringRectificationPermission.VIEW,
    EngineeringRectificationPermission.VIEW
  ]);
  assert.equal(harness.projectScopeCalls, 2);
  assert.equal(harness.rectificationScopeCalls, 3);
});

test("EngineeringRectificationService updates active rectification only", async () => {
  const harness = makeHarness();
  await harness.service.updateRectification(RECTIFICATION_ID, { rectification_title: "整改标题更新" }, harness.context);

  assert.equal(harness.updateRectificationInput?.rectificationTitle, "整改标题更新");
  assert.deepEqual(harness.permissions, [EngineeringRectificationPermission.UPDATE]);
  assert.deepEqual(harness.auditActions, ["UPDATE"]);

  await assert.rejects(
    () => makeHarness({ rectificationStatus: EngineeringRectificationStatus.CLOSED }).service.updateRectification(RECTIFICATION_ID, {}, makeContext()),
    BadRequestException
  );
});

test("EngineeringRectificationService executes submit and pass actions through state machine", async () => {
  const submitHarness = makeHarness({ rectificationStatus: EngineeringRectificationStatus.IN_PROGRESS });
  const submitted = await submitHarness.service.executeRectificationAction(
    RECTIFICATION_ID,
    { action: EngineeringRectificationAction.SUBMIT, feedback: "已完成整改" },
    submitHarness.context
  );

  assert.equal(submitted.status, EngineeringRectificationStatus.SUBMITTED);
  assert.equal(submitHarness.updateRectificationStatusInput?.feedback, "已完成整改");
  assert.equal(submitHarness.updateIssueInput?.issueStatus, EngineeringIssueStatus.RECHECKING);
  assert.deepEqual(submitHarness.permissions, [EngineeringRectificationPermission.SUBMIT]);
  assert.deepEqual(submitHarness.events, ["EngineeringRectificationSubmittedEvent"]);

  const passHarness = makeHarness({ rectificationStatus: EngineeringRectificationStatus.RECHECKING });
  const passed = await passHarness.service.executeRectificationAction(RECTIFICATION_ID, { action: EngineeringRectificationAction.PASS }, passHarness.context);

  assert.equal(passed.status, EngineeringRectificationStatus.PASSED);
  assert.equal(passHarness.updateIssueInput?.issueStatus, EngineeringIssueStatus.CLOSED);
  assert.equal(passHarness.updateIssueInput?.closedBy, ACTOR_ID);
  assert.deepEqual(passHarness.permissions, [EngineeringRectificationPermission.RECHECK]);
  assert.deepEqual(passHarness.events, ["EngineeringRectificationPassedEvent"]);
});

test("EngineeringRectificationService requires feedback on submit and comment on reject", async () => {
  await assert.rejects(
    () =>
      makeHarness({ rectificationStatus: EngineeringRectificationStatus.IN_PROGRESS }).service.executeRectificationAction(
        RECTIFICATION_ID,
        { action: EngineeringRectificationAction.SUBMIT },
        makeContext()
      ),
    BadRequestException
  );
  await assert.rejects(
    () =>
      makeHarness({ rectificationStatus: EngineeringRectificationStatus.RECHECKING }).service.executeRectificationAction(
        RECTIFICATION_ID,
        { action: EngineeringRectificationAction.REJECT },
        makeContext()
      ),
    BadRequestException
  );
});

test("EngineeringRectificationService deletes only pending or rejected rectifications", async () => {
  const harness = makeHarness({ rectificationStatus: EngineeringRectificationStatus.REJECTED });
  const deleted = await harness.service.deleteRectification(RECTIFICATION_ID, harness.context);

  assert.equal(deleted.id, RECTIFICATION_ID);
  assert.deepEqual(harness.permissions, [EngineeringRectificationPermission.DELETE]);
  assert.deepEqual(harness.auditActions, ["DELETE"]);

  await assert.rejects(
    () => makeHarness({ rectificationStatus: EngineeringRectificationStatus.SUBMITTED }).service.deleteRectification(RECTIFICATION_ID, makeContext()),
    BadRequestException
  );
});
