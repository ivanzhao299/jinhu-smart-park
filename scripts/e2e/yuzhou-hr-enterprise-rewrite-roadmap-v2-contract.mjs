#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const roadmapUrl = new URL("../hr-cutover/contracts/hr-enterprise-rewrite-roadmap-v2.json", import.meta.url);
const roadmap = JSON.parse(readFileSync(roadmapUrl, "utf8"));

test("roadmap freezes the enterprise rewrite objective and conservative scoring", () => {
  assert.equal(roadmap.schemaVersion, "2.0.0");
  assert.equal(roadmap.status, "IN_PROGRESS");
  assert.match(roadmap.objective, /企业级、独立可复用、全功能现代 HR 产品/);
  assert.equal(roadmap.scoringPolicy.singleAdditiveScoreForbidden, true);
  assert.equal(roadmap.scoringPolicy.inventoryDoesNotEarnFunctionalParity, true);
  assert.equal(roadmap.scoringPolicy.syntheticEvidenceDoesNotEarnRuntimeParity, true);
  assert.equal(roadmap.scoringPolicy.emptySourceObjectsRemainInDenominator, true);
  assert.equal(roadmap.scoringPolicy.productionImport, "HOLD");
});

test("execution plan represents the real four-slot rolling limit without duplicate ownership", () => {
  assert.equal(roadmap.executionModel.activeSlotLimit, 4);
  assert.equal(roadmap.executionModel.rootIntegrationSlots, 1);
  assert.equal(roadmap.executionModel.workerSlots, 3);
  assert.equal(roadmap.executionModel.rootIntegrationSlots + roadmap.executionModel.workerSlots, roadmap.executionModel.activeSlotLimit);
  assert.equal(roadmap.executionModel.sharedEntryIntegration, "single_writer");
  assert.equal(roadmap.executionModel.sourceDatabase, "read_only");
  assert.equal(roadmap.executionModel.productionWriterConcurrency, 0);
});

test("M0-M5 all have bounded deliverables and executable exit criteria", () => {
  assert.deepEqual(roadmap.milestones.map(({ id }) => id), ["M0", "M1", "M2", "M3", "M4", "M5"]);
  for (const milestone of roadmap.milestones) {
    assert.ok(milestone.name.length > 0, `${milestone.id} name is required`);
    assert.ok(milestone.calendarWindow.length > 0, `${milestone.id} calendar window is required`);
    assert.ok(milestone.deliverables.length >= 3, `${milestone.id} deliverables are incomplete`);
    assert.ok(milestone.exitCriteria.length >= 3, `${milestone.id} exit criteria are incomplete`);
  }
  assert.deepEqual(roadmap.milestones.at(-1).dependsOn, ["M0", "M1", "M2", "M3", "M4"]);
});

test("forecast separates full parity from the final production import window", () => {
  assert.deepEqual(roadmap.forecast.optimistic, { min: 14, max: 20 });
  assert.deepEqual(roadmap.forecast.prudent, { min: 26, max: 40 });
  assert.deepEqual(roadmap.forecast.productionImportAfterAllGates, { unit: "days", min: 1, max: 3 });
  assert.equal(roadmap.forecast.assumptions.length, 5);
  assert.equal(roadmap.forecast.reestimateTriggers.length, 4);
  assert.equal(roadmap.nextRollingSlices.length, 6);
});

console.log("Yuzhou HR enterprise rewrite roadmap v2 contract passed: M0-M5 and forecast remain explicit and fail-closed.");
