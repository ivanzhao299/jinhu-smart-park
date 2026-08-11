import assert from "node:assert/strict";
import test from "node:test";
import { SYSTEM_PERMISSIONS } from "@jinhu/shared";
import { ANY_PERMISSIONS_KEY, PERMISSIONS_KEY } from "../../shared/decorators/permissions.decorator";
import { SafetyInspectTasksController } from "./safety-inspect-tasks.controller";

test("inspection execution context is authorized by task action permissions", () => {
  const permissions = Reflect.getMetadata(
    ANY_PERMISSIONS_KEY,
    SafetyInspectTasksController.prototype.executionDetail
  ) as string[];

  assert.deepEqual(permissions, [
    SYSTEM_PERMISSIONS.SAFETY_INSPECT_TASK_START,
    SYSTEM_PERMISSIONS.SAFETY_INSPECT_TASK_CHECK_IN,
    SYSTEM_PERMISSIONS.SAFETY_INSPECT_TASK_SUBMIT_RESULTS
  ]);
});

test("ordinary inspection detail retains its independent read permission", () => {
  const permissions = Reflect.getMetadata(
    PERMISSIONS_KEY,
    SafetyInspectTasksController.prototype.detail
  ) as string[];

  assert.deepEqual(permissions, [SYSTEM_PERMISSIONS.SAFETY_INSPECT_TASK_READ]);
});
