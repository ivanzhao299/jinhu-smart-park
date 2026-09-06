import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { shouldGuardDirtyLeave } from "./useDirtyLeaveGuard";

test("dirty leave guard is active only for dirty or busy enabled forms", () => {
  assert.equal(shouldGuardDirtyLeave({ dirty: false }), false);
  assert.equal(shouldGuardDirtyLeave({ dirty: true }), true);
  assert.equal(shouldGuardDirtyLeave({ dirty: false, busy: true }), true);
  assert.equal(shouldGuardDirtyLeave({ dirty: true, enabled: false }), false);
});

test("dirty leave guard source uses one navigation coordinator without history compensation", () => {
  const source = readFileSync(resolve(process.cwd(), "features/property-shared/navigation/useDirtyLeaveGuard.ts"), "utf8");
  assert.match(source, /const activeGuards = new Map/);
  assert.match(source, /navigation\.addEventListener\("navigate"/);
  assert.match(source, /event\.intercept\(\{/);
  assert.match(source, /"AbortError"/);
  assert.doesNotMatch(source, /history\.(?:forward|back|go)/);
});
