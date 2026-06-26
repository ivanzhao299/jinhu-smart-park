import assert from "node:assert/strict";
import test from "node:test";
import type { Repository } from "typeorm";
import { EngineeringAuditLogger } from "./audit/engineering-audit.logger";
import { EngineeringProjectStatus } from "./domain/engineering-project.enums";
import { EngineeringProjectAction, type EngineeringProjectTransitionContext } from "./domain/engineering-project-state-machine.types";
import { EngineeringProjectEntity } from "./entities/engineering-project.entity";
import { EngineeringProjectStatusLogEntity } from "./entities/engineering-project-status-log.entity";
import { EngineeringProjectStateMachine } from "./engineering-project-state.machine";
import { EngineeringEventPublisher } from "./events/engineering-event.publisher";
import { EngineeringProjectPolicy } from "./policies/engineering-project.policy";
import { EngineeringProjectRepository } from "./repositories/engineering-project.repository";

const LEGAL_TRANSITIONS: Array<[EngineeringProjectStatus, EngineeringProjectAction, EngineeringProjectStatus]> = [
  [EngineeringProjectStatus.DRAFT, EngineeringProjectAction.SUBMIT, EngineeringProjectStatus.SUBMITTED],
  [EngineeringProjectStatus.SUBMITTED, EngineeringProjectAction.APPROVE, EngineeringProjectStatus.APPROVED],
  [EngineeringProjectStatus.SUBMITTED, EngineeringProjectAction.CANCEL, EngineeringProjectStatus.CANCELLED],
  [EngineeringProjectStatus.APPROVED, EngineeringProjectAction.START_PLANNING, EngineeringProjectStatus.PLANNING],
  [EngineeringProjectStatus.PLANNING, EngineeringProjectAction.START_EXECUTION, EngineeringProjectStatus.EXECUTING],
  [EngineeringProjectStatus.EXECUTING, EngineeringProjectAction.START_INSPECTION, EngineeringProjectStatus.INSPECTING],
  [EngineeringProjectStatus.INSPECTING, EngineeringProjectAction.REQUIRE_RECTIFICATION, EngineeringProjectStatus.RECTIFYING],
  [EngineeringProjectStatus.INSPECTING, EngineeringProjectAction.START_ACCEPTANCE, EngineeringProjectStatus.ACCEPTING],
  [EngineeringProjectStatus.RECTIFYING, EngineeringProjectAction.START_INSPECTION, EngineeringProjectStatus.INSPECTING],
  [EngineeringProjectStatus.ACCEPTING, EngineeringProjectAction.ACCEPTANCE_PASSED, EngineeringProjectStatus.ACCEPTED],
  [EngineeringProjectStatus.ACCEPTING, EngineeringProjectAction.ACCEPTANCE_FAILED, EngineeringProjectStatus.RECTIFYING],
  [EngineeringProjectStatus.ACCEPTED, EngineeringProjectAction.MARK_TRANSFER_READY, EngineeringProjectStatus.TRANSFER_READY],
  [EngineeringProjectStatus.TRANSFER_READY, EngineeringProjectAction.MARK_SETTLEMENT_READY, EngineeringProjectStatus.SETTLEMENT_READY],
  [EngineeringProjectStatus.SETTLEMENT_READY, EngineeringProjectAction.CLOSE, EngineeringProjectStatus.CLOSED],
  [EngineeringProjectStatus.CLOSED, EngineeringProjectAction.ARCHIVE, EngineeringProjectStatus.ARCHIVED],
  [EngineeringProjectStatus.DRAFT, EngineeringProjectAction.CANCEL, EngineeringProjectStatus.CANCELLED],
  [EngineeringProjectStatus.APPROVED, EngineeringProjectAction.CANCEL, EngineeringProjectStatus.CANCELLED],
  [EngineeringProjectStatus.PLANNING, EngineeringProjectAction.CANCEL, EngineeringProjectStatus.CANCELLED],
  [EngineeringProjectStatus.EXECUTING, EngineeringProjectAction.CANCEL, EngineeringProjectStatus.CANCELLED]
];

interface Harness {
  machine: EngineeringProjectStateMachine;
  project: EngineeringProjectEntity;
  context: EngineeringProjectTransitionContext;
  updates: EngineeringProjectStatus[];
  statusLogs: EngineeringProjectStatusLogEntity[];
  auditCalls: unknown[];
  eventCalls: unknown[];
  policyCalls: EngineeringProjectAction[];
}

function makeProject(status: EngineeringProjectStatus): EngineeringProjectEntity {
  return {
    id: "00000000-0000-0000-0000-000000000101",
    tenantId: "tenant-a",
    parkId: "park-a",
    status,
    projectCode: "GC20260626001",
    projectName: "A5 楼消防改造",
    isDeleted: false
  } as EngineeringProjectEntity;
}

function makeHarness(status: EngineeringProjectStatus = EngineeringProjectStatus.DRAFT): Harness {
  const project = makeProject(status);
  const updates: EngineeringProjectStatus[] = [];
  const statusLogs: EngineeringProjectStatusLogEntity[] = [];
  const projectRepository = {
    updateStatus: async (_scope: unknown, _actorId: string | null, _id: string, toStatus: EngineeringProjectStatus) => {
      updates.push(toStatus);
      return { ...project, status: toStatus } as EngineeringProjectEntity;
    }
  } as unknown as EngineeringProjectRepository;
  const statusLogRepository = {
    create: (input: Partial<EngineeringProjectStatusLogEntity>) => input as EngineeringProjectStatusLogEntity,
    save: async (entity: EngineeringProjectStatusLogEntity) => {
      statusLogs.push(entity);
      return entity;
    }
  } as unknown as Repository<EngineeringProjectStatusLogEntity>;
  const auditCalls: unknown[] = [];
  const auditLogger = {
    logProjectStatusChanged: async (input: unknown) => {
      auditCalls.push(input);
    }
  } as unknown as EngineeringAuditLogger;
  const eventCalls: unknown[] = [];
  const eventPublisher = {
    publishProjectStatusChanged: async (input: unknown) => {
      eventCalls.push(input);
    }
  } as unknown as EngineeringEventPublisher;
  const policyCalls: EngineeringProjectAction[] = [];
  const policy = {
    assertCanPerform: (action: EngineeringProjectAction) => {
      policyCalls.push(action);
    },
    requiredPermissionForAction: (action: EngineeringProjectAction) => `PERMISSION_${action}`
  } as unknown as EngineeringProjectPolicy;
  const machine = new EngineeringProjectStateMachine(projectRepository, statusLogRepository, auditLogger, eventPublisher, policy);
  const context: EngineeringProjectTransitionContext = {
    tenantId: project.tenantId,
    parkId: project.parkId,
    projectId: project.id,
    actorUserId: "00000000-0000-0000-0000-000000000201",
    actorName: "工程总监",
    actorRoleCodes: ["ENGINEERING_DIRECTOR"],
    reason: "Task 003 状态机验证",
    requestId: "req-epdr-003"
  };
  return { machine, project, context, updates, statusLogs, auditCalls, eventCalls, policyCalls };
}

test("EngineeringProjectStateMachine allows all declared legal transitions", () => {
  for (const [fromStatus, action, toStatus] of LEGAL_TRANSITIONS) {
    const { machine } = makeHarness(fromStatus);
    assert.equal(machine.canTransition(fromStatus, action), true);
    assert.equal(machine.getNextStatus(fromStatus, action), toStatus);
  }
});

test("EngineeringProjectStateMachine blocks illegal transitions", () => {
  const { machine } = makeHarness(EngineeringProjectStatus.DRAFT);

  assert.equal(machine.canTransition(EngineeringProjectStatus.DRAFT, EngineeringProjectAction.APPROVE), false);
  assert.throws(() => machine.assertCanTransition(EngineeringProjectStatus.DRAFT, EngineeringProjectAction.APPROVE), /Illegal engineering project transition/);
});

test("EngineeringProjectStateMachine returns available actions for frontend action buttons", () => {
  const { machine } = makeHarness(EngineeringProjectStatus.INSPECTING);
  const actions = machine.getAvailableActions(EngineeringProjectStatus.INSPECTING);

  assert.deepEqual(
    actions.map((item) => [item.action, item.targetStatus]),
    [
      [EngineeringProjectAction.REQUIRE_RECTIFICATION, EngineeringProjectStatus.RECTIFYING],
      [EngineeringProjectAction.START_ACCEPTANCE, EngineeringProjectStatus.ACCEPTING]
    ]
  );
});

test("EngineeringProjectStateMachine transition writes status log, audit, event and permission check", async () => {
  const { machine, project, context, updates, statusLogs, auditCalls, eventCalls, policyCalls } = makeHarness(EngineeringProjectStatus.DRAFT);
  const updated = await machine.transition(project, EngineeringProjectAction.SUBMIT, context);

  assert.equal(updated.status, EngineeringProjectStatus.SUBMITTED);
  assert.deepEqual(updates, [EngineeringProjectStatus.SUBMITTED]);
  assert.equal(statusLogs.length, 1);
  assert.equal(statusLogs[0]?.fromStatus, EngineeringProjectStatus.DRAFT);
  assert.equal(statusLogs[0]?.toStatus, EngineeringProjectStatus.SUBMITTED);
  assert.equal(statusLogs[0]?.action, EngineeringProjectAction.SUBMIT);
  assert.equal(statusLogs[0]?.reason, context.reason);
  assert.equal(auditCalls.length, 1);
  assert.equal(eventCalls.length, 1);
  assert.deepEqual(policyCalls, [EngineeringProjectAction.SUBMIT]);
});
