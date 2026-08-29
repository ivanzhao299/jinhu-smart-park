#!/usr/bin/env node
import assert from "node:assert/strict";
import test from "node:test";
import { advanceCoreT0T3Lifecycle } from "../hr-cutover/run-core-t0-t3-continuous-lab.mjs";

function lifecycle(state) {
  const calls = [];
  return {
    state,
    config: { runId: "fixture" },
    provision() { calls.push("provision"); return { state: "provisioned", productionImport: "HOLD" }; },
    extract() { calls.push("extract"); return { state: "review_hold", productionImport: "HOLD" }; },
    resume(value) { calls.push(`resume:${value.marker}`); return { state: "rollback_ready", productionImport: "HOLD" }; },
    rollback() { calls.push("rollback"); return { state: "rolled_back", productionImport: "HOLD" }; },
    cleanup() { calls.push("cleanup"); return { state: "cleaned", residualCount: 0, productionImport: "HOLD" }; },
    calls
  };
}

test("continuous core runner advances only the next recoverable lifecycle action", async () => {
  const cases = [["planned", "provision", ["provision"]], ["extracting", "extract", ["extract"]], ["review_hold", "resume", ["resume:package"]], ["rollback_ready", "rollback", ["rollback"]], ["rolled_back", "cleanup", ["cleanup"]], ["cleaned", "complete", []]];
  for (const [state, action, expected] of cases) {
    const current = lifecycle(state);
    const result = await advanceCoreT0T3Lifecycle(current, { machineRoot: "unused", packageFactory: () => ({ marker: "package" }) });
    assert.equal(result.action, action); assert.deepEqual(current.calls, expected);
  }
});
