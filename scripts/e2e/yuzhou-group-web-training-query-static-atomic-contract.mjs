/* global structuredClone */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { verifyGroupWebTrainingQueryCapability } from "../hr-cutover/group-web-training-query-capability.mjs";
import { validateGroupWebTrainingQueryModernRuntimeTask } from "../hr-cutover/group-web-training-query-modern-runtime.mjs";
import {
  GroupWebTrainingQueryStaticAtomicError,
  verifyGroupWebTrainingQueryStaticAtomic,
  verifyGroupWebTrainingQueryStaticAtomicSources,
} from "../hr-cutover/group-web-training-query-static-atomic.mjs";

const root = resolve(import.meta.dirname, "../..");
const load = path => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const manifest = load("scripts/hr-cutover/contracts/group-web-training-query-static-atomic-v1.json");
const fixtures = () => {
  const capability = load(manifest.sourceBindings.capabilityContract.path);
  const routineLedger = load(manifest.sourceBindings.routineLedger.path);
  const modernTask = load(manifest.sourceBindings.modernRuntimeTask.path);
  return {
    capability,
    capabilityReport: verifyGroupWebTrainingQueryCapability(root, capability),
    routine: routineLedger.routines.find(item => item.routineId === manifest.sourceBindings.routineLedger.routineId),
    modernTask,
    modernTaskReport: validateGroupWebTrainingQueryModernRuntimeTask(root, modernTask),
  };
};
const expectCode = (action, code) => assert.throws(
  action,
  error => error instanceof GroupWebTrainingQueryStaticAtomicError && error.code === code,
);

test("one of 186 entries advances to a six-atom static chain while runtime credit remains zero", () => {
  const report = verifyGroupWebTrainingQueryStaticAtomic(root, manifest);
  assert.equal(report.status, "STATIC_ATOMIC_CHAIN_CONFIRMED_RUNTIME_PENDING");
  assert.equal(report.candidateId, "GROUP-WEB-INTERACTION-128-TRAINING-QUERY");
  assert.equal(report.staticAtomsConfirmed, 6);
  assert.equal(report.runtimeObservationsAccepted, 0);
  assert.equal(report.legacyRoutineAssociation, "CANDIDATE_ONLY");
  assert.equal(report.modernTaskStatus, "READY_NOT_EXECUTED");
  assert.deepEqual(report.coverageCredit, {
    groupWebNavigableEntries: { numerator: 0, denominator: 186 },
    legacyInteractionParity: { numerator: 0, denominator: 6 },
  });
  assert.equal(report.compatibilityScoreContribution, 0);
  assert.equal(report.productionImport, "HOLD");
});

test("legacy procedure evidence is read-only, non-personal and not treated as a proven page invocation", () => {
  const { routine } = fixtures();
  assert.equal(routine.sourceName, "web_trainquery");
  assert.deepEqual(routine.readTables, ["course", "departmentcode"]);
  assert.deepEqual(routine.writeTables, []);
  assert.deepEqual(routine.dynamicWriteTables, []);
  assert.equal(routine.dynamicMutationStatus, "none");
  assert.equal(routine.readTables.includes("person"), false);
  assert.equal(manifest.legacyRoutine.associationStatus, "capability_name_and_domain_candidate_only");
  assert.equal(manifest.personalDataObserved, false);
  assert.equal(manifest.credentialsUsed, false);
});

test("all six atoms are static-only and cannot self-promote into runtime or compatibility evidence", () => {
  assert.equal(manifest.atomicInteractions.length, 6);
  assert.equal(manifest.atomicInteractions.every(item => item.runtimeObserved === false), true);
  assert.equal(manifest.atomicInteractions.every(item => item.compatibilityScoreContribution === 0), true);
  for (const mutate of [
    draft => { draft.atomicInteractions[0].runtimeObserved = true; },
    draft => { draft.atomicInteractions[2].status = "RUNTIME_CONFIRMED"; },
    draft => { draft.coverageCredit.groupWebNavigableEntries.numerator = 1; },
    draft => { draft.compatibilityScoreContribution = 1; },
    draft => { draft.personalDataObserved = true; },
    draft => { draft.sourceBindings.routineLedger.path = "invented.json"; },
  ]) {
    const draft = structuredClone(manifest);
    mutate(draft);
    expectCode(
      () => verifyGroupWebTrainingQueryStaticAtomicSources(draft, fixtures()),
      draft.atomicInteractions.some(item => item.runtimeObserved || item.status === "RUNTIME_CONFIRMED")
        ? "GROUP_WEB_TRAINING_STATIC_ATOMIC_LIST_INVALID"
        : "GROUP_WEB_TRAINING_STATIC_ATOMIC_MANIFEST_INVALID",
    );
  }
});

test("routine identity, write boundary, personal-data boundary and task execution claims fail closed", () => {
  const cases = [
    [source => { source.routine.sourceArtifactSha256 = "f".repeat(64); }, "GROUP_WEB_TRAINING_STATIC_ROUTINE_INVALID"],
    [source => { source.routine.readTables.push("person"); }, "GROUP_WEB_TRAINING_STATIC_ROUTINE_INVALID"],
    [source => { source.routine.statementProfile.update = 1; }, "GROUP_WEB_TRAINING_STATIC_ROUTINE_INVALID"],
    [source => { source.modernTaskReport.status = "MODERN_RUNTIME_CONTRACT_PASS"; }, "GROUP_WEB_TRAINING_STATIC_MODERN_CONTRACT_INVALID"],
    [source => { source.capabilityReport.compatibilityScoreContribution = 1; }, "GROUP_WEB_TRAINING_STATIC_CAPABILITY_INVALID"],
  ];
  for (const [mutate, code] of cases) {
    const source = fixtures();
    mutate(source);
    expectCode(() => verifyGroupWebTrainingQueryStaticAtomicSources(manifest, source), code);
  }
});
