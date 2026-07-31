import assert from "node:assert/strict";
import test from "node:test";
import { initialHazardOverdueFlag } from "./hazards-create.logic";

test("hazards created from the overdue route remain visible in that route", () => {
  assert.equal(initialHazardOverdueFlag(true), true);
  assert.equal(initialHazardOverdueFlag(false), false);
});
