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

test("final goal requires one HR kernel, both deployment modes and every independent product gate", () => {
  const acceptance = roadmap.productAcceptance;
  assert.equal(acceptance.sharedBusinessKernel, true);
  assert.deepEqual(acceptance.deploymentModes, ["smart_park_integrated", "standalone_enterprise"]);
  assert.equal(acceptance.completionRule, "ALL_M0_M5_AND_ALL_P0_P4");
  assert.match(roadmap.objective, /离开 Smart Park 后仍能携带完整数据、业务规则和历史记录独立部署运行/);
  assert.match(roadmap.definitionOfDone.independentProduct, /M0-M5 全部通过 AND P0-P4 全部通过/);
  assert.deepEqual(acceptance.gates.map(({ id }) => id), ["P0", "P1", "P2", "P3", "P4"]);
  const milestoneIds = new Set(roadmap.milestones.map(({ id }) => id));
  for (const gate of acceptance.gates) {
    assert.ok(gate.requiredEvidence.length >= 3, gate.id);
    assert.ok(gate.milestones.length > 0, gate.id);
    assert.ok(gate.milestones.every((id) => milestoneIds.has(id)), gate.id);
  }
});

test("freezing the expanded goal cannot claim product readiness or inherit the old forecast", () => {
  const acceptance = roadmap.productAcceptance;
  assert.equal(acceptance.status, "NOT_VERIFIED");
  assert.ok(acceptance.gates.every(({ status }) => status === "NOT_VERIFIED"));
  assert.equal(acceptance.roadmapContractPassIsRuntimeEvidence, false);
  assert.equal(acceptance.existingForecastCoversIndependentMode, false);
  assert.equal(acceptance.reestimateAfter, "P0_dependency_inventory");
  for (const path of [
    "../../docs/yuzhou-hr-compatibility-development-plan.md",
    "../../.trellis/tasks/08-19-yuzhou-hr-compatibility-migration-env/prd.md",
    "../../.trellis/tasks/08-19-yuzhou-hr-compatibility-migration-env/implement.md",
  ]) {
    const content = readFileSync(new URL(path, import.meta.url), "utf8");
    for (const { id } of acceptance.gates) assert.ok(content.includes(id), `${path} lacks ${id}`);
  }
});
