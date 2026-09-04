#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ProductionImportPerformanceRelationsContractError,
  createHeldPerformanceRelationsBinding,
  createSyntheticPerformanceRelationsAdapter,
  executeSyntheticPerformanceRelationsLifecycle,
  validateHeldPerformanceRelationsBinding,
} from "../hr-cutover/production-import-performance-relations-contract.mjs";

// Keep fixtures aggregate/hash-only; no source row or person value enters this contract.
const h = value => createHash("sha256").update(`synthetic:${value}`).digest("hex");
const triple = { codeSha: "1".repeat(40), sourceSnapshotHash: h("source"), mappingContractHash: h("mapping") };
const input = () => ({
  triple: structuredClone(triple),
  relationPayloadArtifactSha256: h("relation-payload"),
  identityDecisionArtifactSha256: h("identity-decisions"),
  t0PhaseReceiptSha256: h("t0-receipt"),
});

test("builds a hash-only HOLD binding for the current 117/234 aggregate facts", () => {
  const binding = createHeldPerformanceRelationsBinding(input());
  assert.equal(binding.sessionRows, 7);
  assert.equal(binding.scoreSourceRows, 0);
  assert.equal(binding.assignmentRows, 117);
  assert.equal(binding.activeRelationMaps, 124);
  assert.equal(binding.identityResolutionRows, 234);
  assert.equal(binding.subjectUnmatchedRows, 108);
  assert.equal(binding.blankAssessorRows, 117);
  assert.deepEqual(binding.forwardOrder, ["source_person_assignments", "identity_resolution"]);
  assert.deepEqual(binding.rollbackOrder, ["identity_resolution", "source_person_assignments"]);
  assert.equal(binding.adapterStatus, "SCRIPT_READY_SCHEMA_CAPABILITY_REQUIRED");
  assert.equal(binding.executionReachable, false);
  assert.equal(binding.productionImport, "HOLD");
});

test("synthetic lifecycle is deterministic, idempotent and reaches reverse-order zero residual", async () => {
  const binding = createHeldPerformanceRelationsBinding(input());
  const first = await executeSyntheticPerformanceRelationsLifecycle(binding);
  const second = await executeSyntheticPerformanceRelationsLifecycle(binding);
  assert.deepEqual(first, second);
  assert.deepEqual(first.steps.map(step => step.step), [
    "initial", "source_person_assignments", "source_person_assignments_replay",
    "identity_resolution", "identity_resolution_replay", "rollback_identity_resolution",
    "rollback_source_person_assignments", "rollback_replay",
  ]);
  assert.equal(first.steps[4].counts.identityResolutionRows, 234);
  assert.equal(first.steps[4].counts.sessionBindingRows, 7);
  assert.equal(first.steps[5].counts.assignmentRows, 117);
  assert.equal(first.steps.at(-1).counts.assignmentRows, 0);
  assert.equal(first.residualCount, 0);
  assert.equal(first.realSourceRowsWritten, 0);
  assert.equal(first.executionReachable, false);
  assert.equal(first.productionImport, "HOLD");
});

test("count, hash, C/S/M and adapter drift fail closed", async () => {
  const binding = createHeldPerformanceRelationsBinding(input());
  for (const mutate of [
    value => { value.assignmentRows = 116; },
    value => { value.migration305Sha256 = h("drift"); },
    value => { value.rollbackOrder.reverse(); },
    value => { value.executionReachable = true; },
  ]) {
    const drift = structuredClone(binding);
    mutate(drift);
    assert.throws(() => validateHeldPerformanceRelationsBinding(drift), ProductionImportPerformanceRelationsContractError);
  }

  const replayAdapter = createSyntheticPerformanceRelationsAdapter();
  await replayAdapter.snapshot(binding);
  const otherBinding = createHeldPerformanceRelationsBinding({
    ...input(),
    triple: { ...triple, sourceSnapshotHash: h("other-source") },
  });
  await assert.rejects(
    () => replayAdapter.snapshot(otherBinding),
    error => error.code === "PRODUCTION_IMPORT_PERFORMANCE_RELATIONS_BINDING_DRIFT",
  );

  const adapter = createSyntheticPerformanceRelationsAdapter();
  const invalidAdapter = { ...adapter, database: { transaction() {} } };
  await assert.rejects(
    () => executeSyntheticPerformanceRelationsLifecycle(binding, invalidAdapter),
    error => error.code === "PRODUCTION_IMPORT_PERFORMANCE_RELATIONS_SYNTHETIC_ADAPTER_INVALID",
  );
});

test("contract implementation contains no CLI, environment, database driver or source row channel", () => {
  const source = readFileSync(new URL("../hr-cutover/production-import-performance-relations-contract.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /process\.env|DATABASE_URL|from ["']pg["']|\.transaction\(|\.query\(|child_process/u);
  assert.doesNotMatch(source, /sourcePersonCode|sourceAssessorCode|employeeDisplayName|salary|password/iu);
});
