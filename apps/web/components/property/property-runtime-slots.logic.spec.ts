import assert from "node:assert/strict";
import test from "node:test";
import { buildPropertyTaskMutationRequest } from "./property-runtime-slots.logic";

test("task mutation carries the stable client key in both body and idempotency header option", () => {
  const request = buildPropertyTaskMutationRequest({
    taskId: "task/one",
    action: "property.task.block",
    clientKey: "stable-client-key",
    reason: " waiting for access ",
    detail: {
      taskId: "task/one",
      assignmentAuthority: "owning",
      taskKind: "turnover",
      kindLabel: "退房交接",
      sourceType: "homestay_turnover",
      sourceLabel: "民宿退房",
      sourceId: "source-1",
      sourceVersion: 7,
      businessOccurrenceKey: "turnover:source-1",
      title: "交接任务",
      assignmentStatus: "claimed",
      assignmentVersion: 4,
      assigneeDisplay: null,
      priority: 10,
      dueAt: null,
      claimedAt: "2026-08-03T00:00:00.000Z",
      startedAt: null,
      blockedUntil: null,
      allowedActions: ["property.task.block"],
      createdAt: "2026-08-03T00:00:00.000Z",
      updatedAt: "2026-08-03T00:00:00.000Z"
    }
  });

  assert.equal(request.path, "/property/tasks/task%2Fone/block");
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.idempotencyKey, "stable-client-key");
  assert.equal(request.options.body.clientKey, "stable-client-key");
  assert.equal(request.options.body.reason, "waiting for access");
  assert.equal(request.options.body.expectedAssignmentVersion, 4);
  assert.equal(request.options.body.expectedSourceVersion, 7);
});
