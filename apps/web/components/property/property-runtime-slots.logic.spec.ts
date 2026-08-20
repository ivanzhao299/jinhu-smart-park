import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPropertyTaskMutationRequest,
  parsePropertyRuntimeTarget,
  prependUniquePropertyRuntimeItem,
  propertyApprovalTargetAllowed,
  propertyTaskTargetAllowed
} from "./property-runtime-slots.logic";

test("runtime deep-link targets accept one UUID and reject ambiguity or unsafe values", () => {
  const taskId = "11111111-1111-4111-8111-111111111111";
  const requestId = "22222222-2222-4222-8222-222222222222";
  assert.deepEqual(parsePropertyRuntimeTarget({ taskId, requestId: null }), {
    taskId, requestId: null, invalid: false
  });
  assert.deepEqual(parsePropertyRuntimeTarget({ taskId: null, requestId }), {
    taskId: null, requestId, invalid: false
  });
  assert.equal(parsePropertyRuntimeTarget({ taskId: "../admin", requestId: null }).invalid, true);
  assert.equal(parsePropertyRuntimeTarget({ taskId, requestId }).invalid, true);
});

test("runtime target is prepended once and must belong to the current domain sources", () => {
  const target = { id: "target" };
  assert.deepEqual(prependUniquePropertyRuntimeItem(target, [
    { id: "other" }, { id: "target" }
  ], (item) => item.id), [{ id: "target" }, { id: "other" }]);
  assert.equal(propertyTaskTargetAllowed({ sourceType: "homestay_turnover" } as never,
    ["homestay_turnover"]), true);
  assert.equal(propertyTaskTargetAllowed({ sourceType: "housing_repair" } as never,
    ["homestay_turnover"]), false);
  assert.equal(propertyApprovalTargetAllowed({ sourceType: "homestay-booking" } as never,
    ["homestay-booking"]), true);
  assert.equal(propertyApprovalTargetAllowed({ sourceType: "housing-lease" } as never,
    ["homestay-booking"]), false);
});

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
