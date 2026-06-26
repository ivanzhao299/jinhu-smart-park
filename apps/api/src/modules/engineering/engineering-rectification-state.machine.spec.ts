import assert from "node:assert/strict";
import test from "node:test";
import { EngineeringRectificationStatus } from "./domain/engineering-project.enums";
import { EngineeringRectificationAction, type EngineeringRectificationTransitionContext } from "./domain/engineering-rectification-state-machine.types";
import { EngineeringRectificationEntity } from "./entities/engineering-rectification.entity";
import { EngineeringRectificationStateMachine } from "./engineering-rectification-state.machine";
import { EngineeringRectificationRepository } from "./repositories/engineering-rectification.repository";

const LEGAL_TRANSITIONS: Array<[EngineeringRectificationStatus, EngineeringRectificationAction, EngineeringRectificationStatus]> = [
  [EngineeringRectificationStatus.PENDING, EngineeringRectificationAction.START, EngineeringRectificationStatus.IN_PROGRESS],
  [EngineeringRectificationStatus.IN_PROGRESS, EngineeringRectificationAction.SUBMIT, EngineeringRectificationStatus.SUBMITTED],
  [EngineeringRectificationStatus.SUBMITTED, EngineeringRectificationAction.START_RECHECK, EngineeringRectificationStatus.RECHECKING],
  [EngineeringRectificationStatus.RECHECKING, EngineeringRectificationAction.PASS, EngineeringRectificationStatus.PASSED],
  [EngineeringRectificationStatus.RECHECKING, EngineeringRectificationAction.REJECT, EngineeringRectificationStatus.REJECTED],
  [EngineeringRectificationStatus.REJECTED, EngineeringRectificationAction.START, EngineeringRectificationStatus.IN_PROGRESS],
  [EngineeringRectificationStatus.PASSED, EngineeringRectificationAction.CLOSE, EngineeringRectificationStatus.CLOSED],
  [EngineeringRectificationStatus.PENDING, EngineeringRectificationAction.MARK_OVERDUE, EngineeringRectificationStatus.OVERDUE],
  [EngineeringRectificationStatus.OVERDUE, EngineeringRectificationAction.START, EngineeringRectificationStatus.IN_PROGRESS],
  [EngineeringRectificationStatus.OVERDUE, EngineeringRectificationAction.SUBMIT, EngineeringRectificationStatus.SUBMITTED]
];

function makeRectification(status: EngineeringRectificationStatus): EngineeringRectificationEntity {
  return {
    id: "00000000-0000-0000-0000-000000000401",
    tenantId: "tenant-a",
    parkId: "park-a",
    projectId: "00000000-0000-0000-0000-000000000101",
    rectificationCode: "GCZG20260626001",
    rectificationTitle: "消防管线固定整改",
    description: "A5 三层消防管线支架松动。",
    status,
    deadline: "2026-06-25",
    isDeleted: false
  } as EngineeringRectificationEntity;
}

function makeHarness(status: EngineeringRectificationStatus = EngineeringRectificationStatus.PENDING): {
  machine: EngineeringRectificationStateMachine;
  rectification: EngineeringRectificationEntity;
  context: EngineeringRectificationTransitionContext;
  updates: EngineeringRectificationStatus[];
} {
  const rectification = makeRectification(status);
  const updates: EngineeringRectificationStatus[] = [];
  const repository = {
    updateStatus: async (_scope: unknown, _actorId: string | null, _id: string, input: { status: EngineeringRectificationStatus }) => {
      updates.push(input.status);
      return { ...rectification, ...input } as EngineeringRectificationEntity;
    }
  } as unknown as EngineeringRectificationRepository;
  const machine = new EngineeringRectificationStateMachine(repository);
  const context: EngineeringRectificationTransitionContext = {
    tenantId: rectification.tenantId,
    parkId: rectification.parkId,
    projectId: rectification.projectId,
    rectificationId: rectification.id,
    actorUserId: "00000000-0000-0000-0000-000000000201",
    actorName: "工程师",
    reason: "Task 014 状态机验证",
    requestId: "req-epdr-014"
  };
  return { machine, rectification, context, updates };
}

test("EngineeringRectificationStateMachine allows all declared legal transitions", () => {
  for (const [fromStatus, action, toStatus] of LEGAL_TRANSITIONS) {
    const { machine } = makeHarness(fromStatus);
    assert.equal(machine.canTransition(fromStatus, action), true);
    assert.equal(machine.getNextStatus(fromStatus, action), toStatus);
  }
});

test("EngineeringRectificationStateMachine blocks illegal transitions", () => {
  const { machine } = makeHarness(EngineeringRectificationStatus.PENDING);

  assert.equal(machine.canTransition(EngineeringRectificationStatus.PENDING, EngineeringRectificationAction.PASS), false);
  assert.throws(() => machine.assertCanTransition(EngineeringRectificationStatus.PENDING, EngineeringRectificationAction.PASS), /Invalid engineering rectification transition/);
});

test("EngineeringRectificationStateMachine returns available actions for operation buttons", () => {
  const { machine } = makeHarness(EngineeringRectificationStatus.RECHECKING);
  const actions = machine.getAvailableActions(EngineeringRectificationStatus.RECHECKING);

  assert.deepEqual(
    actions.map((item) => [item.action, item.toStatus]),
    [
      [EngineeringRectificationAction.PASS, EngineeringRectificationStatus.PASSED],
      [EngineeringRectificationAction.REJECT, EngineeringRectificationStatus.REJECTED],
      [EngineeringRectificationAction.MARK_OVERDUE, EngineeringRectificationStatus.OVERDUE]
    ]
  );
});

test("EngineeringRectificationStateMachine transition persists controlled status patch", async () => {
  const { machine, rectification, context, updates } = makeHarness(EngineeringRectificationStatus.IN_PROGRESS);
  const updated = await machine.transition(rectification, EngineeringRectificationAction.SUBMIT, context, {
    feedback: "已完成整改并上传现场照片。"
  });

  assert.equal(updated.status, EngineeringRectificationStatus.SUBMITTED);
  assert.equal(updated.submittedBy, context.actorUserId);
  assert.equal(updated.feedback, "已完成整改并上传现场照片。");
  assert.deepEqual(updates, [EngineeringRectificationStatus.SUBMITTED]);
});

test("EngineeringRectificationStateMachine detects overdue active rectifications", () => {
  const { machine } = makeHarness();

  assert.equal(machine.isOverdue({ deadline: "2026-06-25", status: EngineeringRectificationStatus.PENDING }, "2026-06-26"), true);
  assert.equal(machine.isOverdue({ deadline: "2026-06-26", status: EngineeringRectificationStatus.PENDING }, "2026-06-26"), false);
  assert.equal(machine.isOverdue({ deadline: "2026-06-25", status: EngineeringRectificationStatus.CLOSED }, "2026-06-26"), false);
  assert.equal(machine.isOverdue({ deadline: null, status: EngineeringRectificationStatus.PENDING }, "2026-06-26"), false);
});
