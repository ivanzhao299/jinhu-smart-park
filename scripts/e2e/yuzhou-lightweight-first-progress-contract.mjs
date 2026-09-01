import assert from "node:assert/strict";
import test from "node:test";
import { formatLightweightFirstProgress } from "../hr-cutover/show-lightweight-first-progress.mjs";

const running = { formatVersion: 1, status: "RUNNING", phase: "T4", completedPercent: 55, elapsedMilliseconds: 120000, updatedAtMilliseconds: 1000, productionImport: "HOLD" };

test("lightweight progress renders a safe phase-only progress bar", () => {
  assert.equal(formatLightweightFirstProgress(running, 61000), "[###########---------]  55% phase=T4 status=RUNNING elapsed=3m productionImport=HOLD");
});

test("lightweight progress renders only the bounded T4 batch counter", () => {
  assert.equal(formatLightweightFirstProgress({ ...running, completedPercent: 73, t4BatchCompleted: 12, t4BatchTotal: 16 }, 61000), "[###############-----]  73% phase=T4 batch=12/16 status=RUNNING elapsed=3m productionImport=HOLD");
});

test("lightweight progress fails closed for values outside the safe status contract", () => {
  assert.throws(() => formatLightweightFirstProgress({ ...running, completedPercent: 101 }));
  assert.throws(() => formatLightweightFirstProgress({ ...running, productionImport: "ALLOW" }));
});
