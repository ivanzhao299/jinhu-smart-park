import assert from "node:assert/strict";
import test from "node:test";
import { shouldGuardDirtyLeave } from "./useDirtyLeaveGuard";

test("dirty leave guard is active only for dirty or busy enabled forms", () => {
  assert.equal(shouldGuardDirtyLeave({ dirty: false }), false);
  assert.equal(shouldGuardDirtyLeave({ dirty: true }), true);
  assert.equal(shouldGuardDirtyLeave({ dirty: false, busy: true }), true);
  assert.equal(shouldGuardDirtyLeave({ dirty: true, enabled: false }), false);
});
