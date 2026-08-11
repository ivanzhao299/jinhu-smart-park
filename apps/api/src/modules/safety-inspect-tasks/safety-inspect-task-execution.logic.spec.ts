import assert from "node:assert/strict";
import test from "node:test";
import { resolveSafetyInspectTaskStartDisposition } from "./safety-inspect-task-execution.logic";

test("inspect task execution starts pending and overdue tasks", () => {
  assert.equal(resolveSafetyInspectTaskStartDisposition("10"), "start");
  assert.equal(resolveSafetyInspectTaskStartDisposition("40"), "start");
});

test("inspect task execution safely resumes an already in-progress task", () => {
  assert.equal(resolveSafetyInspectTaskStartDisposition("20"), "resume");
});

test("inspect task execution rejects completed and unknown states", () => {
  assert.equal(resolveSafetyInspectTaskStartDisposition("30"), "reject");
  assert.equal(resolveSafetyInspectTaskStartDisposition(""), "reject");
  assert.equal(resolveSafetyInspectTaskStartDisposition("unexpected"), "reject");
});
