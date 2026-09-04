/* global structuredClone */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { assessLegacyGroupWebImplementationCoverage } from "../hr-cutover/legacy-group-web-implementation-coverage-lib.mjs";
import {
  GroupWebEmployeeOnboardingRuntimeTaskError,
  verifyGroupWebEmployeeOnboardingRuntimeTask,
  verifyGroupWebEmployeeOnboardingRuntimeTaskSources,
} from "../hr-cutover/group-web-employee-onboarding-modern-runtime-task.mjs";

const root = resolve(import.meta.dirname, "../..");
const json = path => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const task = json("scripts/hr-cutover/contracts/group-web-employee-onboarding-modern-runtime-task-v1.json");
const sources = () => ({
  moduleMapping: json(task.sourceContracts[0].path),
  sourceAudit: json(task.sourceContracts[1].path),
  onboardingEvidence: json(task.sourceContracts[2].path),
  readTarget: path => readFileSync(resolve(root, path), "utf8"),
});
const expectCode = (action, code) => assert.throws(
  action,
  error => error instanceof GroupWebEmployeeOnboardingRuntimeTaskError && error.code === code,
);

test("Group Web onboarding freezes one runtime task without claiming execution", () => {
  const report = verifyGroupWebEmployeeOnboardingRuntimeTask(root, task);
  assert.equal(report.status, "READY_NOT_EXECUTED");
  assert.equal(report.candidateId, "GROUP-WEB-INTERACTION-34-EMPLOYEE-ONBOARDING");
  assert.equal(report.taskReadyIncrement, 1);
  assert.equal(report.runtimeCoverageIncrement, 0);
  assert.equal(report.stillRequired.departmentScopeImplementation, true);
  assert.deepEqual(report.coverageCredit, {
    groupWebNavigableEntries: { numerator: 0, denominator: 186 },
    legacyInteractionParity: { numerator: 0, denominator: 6 },
  });
  assert.equal(report.compatibilityScoreContribution, 0);
  assert.equal(report.productionImport, "HOLD");
});

test("the selected onboarding entry remains score-90 partial in the shared 231-entry model", () => {
  const coverage = assessLegacyGroupWebImplementationCoverage(json(task.sourceContracts[0].path), root);
  const selected = coverage.items.find(item => item.legacyId === 34);
  assert.equal(coverage.summary.total, 231);
  assert.deepEqual(
    {
      score: selected?.score,
      implementationStatus: selected?.implementationStatus,
      dimensions: selected?.dimensions,
    },
    task.candidate.currentStaticEvidence,
  );
});

test("all static control request and form-action slots remain in the runtime denominator", () => {
  assert.equal(task.legacyOpaqueSlots.controlSlots.length, 15);
  assert.equal(new Set(task.legacyOpaqueSlots.controlSlots).size, 15);
  assert.equal(task.legacyOpaqueSlots.requestKeySlots.length, 19);
  assert.equal(new Set(task.legacyOpaqueSlots.requestKeySlots).size, 19);
  assert.equal(task.legacyOpaqueSlots.formActionSlots.length, 1);
  assert.equal(task.legacyOpaqueSlots.sourceColumnNamesClaimed, false);
  assert.equal(task.legacySemanticFields.length, 8);
  assert.ok(task.legacySemanticFields.every(field => /(?:requires|blocked|unresolved)/u.test(field.disposition)));
});

test("status actions roles and desktop plus phone observations are frozen", () => {
  assert.deepEqual(task.modernRuntimeContract.statusVocabulary, ["draft", "submitted", "returned", "approved", "cancelled", "confirmed"]);
  assert.deepEqual(task.modernRuntimeContract.transitionMatrix.map(row => row.action), ["submit", "resubmit", "cancel", "approve", "return", "confirm"]);
  assert.deepEqual(task.modernRuntimeContract.roleMatrix.map(row => row.role), ["onboarding_reader", "onboarding_operator", "park_reviewer", "employment_confirmer", "no_onboarding_permission"]);
  assert.equal(task.modernRuntimeContract.roleMatrix[0].knownParityGap, "legacy_department_scope_not_represented");
  assert.equal(task.modernRuntimeContract.apiTasks.length, 15);
  assert.deepEqual(task.modernRuntimeContract.browserTask.viewports.map(viewport => viewport.width), [1440, 390]);
  assert.equal(task.runtimeEvidence.requiredModernBrowserObservations, 10);
});

test("legacy department scope cannot be hidden by the park-level modern list", () => {
  assert.ok(task.legacyWorkflowRules.verifiedRules.includes("department_scoped_browse"));
  assert.ok(task.blockingGaps.includes("GROUP_WEB_ONBOARDING_DEPARTMENT_SCOPE_NOT_IMPLEMENTED"));
  const gapTask = task.modernRuntimeContract.apiTasks.find(item => item.id === "legacy_department_scope_gap");
  assert.equal(gapTask?.expectedStatus, "blocked_until_team_scope_exists");
  assert.ok(gapTask?.assertions.includes("do_not_claim_department_scope_equivalence"));
});

test("source identity, legacy rules and modern source tokens fail closed on drift", () => {
  const moduleDrift = sources();
  moduleDrift.moduleMapping.items.find(item => item.legacyId === 34).legacyUrl = "invented.asp";
  expectCode(() => verifyGroupWebEmployeeOnboardingRuntimeTaskSources(task, moduleDrift), "GROUP_WEB_ONBOARDING_RUNTIME_SOURCE_DRIFT");

  const ruleDrift = sources();
  ruleDrift.onboardingEvidence.verifiedRules.pop();
  expectCode(() => verifyGroupWebEmployeeOnboardingRuntimeTaskSources(task, ruleDrift), "GROUP_WEB_ONBOARDING_RUNTIME_SOURCE_DRIFT");

  const targetDrift = sources();
  targetDrift.readTarget = () => "";
  expectCode(() => verifyGroupWebEmployeeOnboardingRuntimeTaskSources(task, targetDrift), "GROUP_WEB_ONBOARDING_RUNTIME_MODERN_EVIDENCE_MISSING");
});

test("task cards cannot inflate runtime coverage or relabel unobserved work", () => {
  const mutations = [
    [candidate => { candidate.status = "pass"; }, "GROUP_WEB_ONBOARDING_RUNTIME_FALSE_COMPLETION"],
    [candidate => { candidate.runtimeEvidence.status = "observed"; }, "GROUP_WEB_ONBOARDING_RUNTIME_FALSE_COMPLETION"],
    [candidate => { candidate.coverageCredit.groupWebNavigableEntries.numerator = 1; }, "GROUP_WEB_ONBOARDING_RUNTIME_COVERAGE_INVALID"],
    [candidate => { candidate.compatibilityScoreContribution = 1; }, "GROUP_WEB_ONBOARDING_RUNTIME_FALSE_COMPLETION"],
    [candidate => { candidate.legacySemanticFields[0].disposition = "verified"; }, "GROUP_WEB_ONBOARDING_RUNTIME_FIELD_BINDINGS_INVALID"],
    [candidate => { candidate.legacyWorkflowRules.runtimeStatus = "pass"; }, "GROUP_WEB_ONBOARDING_RUNTIME_WORKFLOW_FALSE_COMPLETION"],
    [candidate => { candidate.legacyReportLayout.status = "pass"; }, "GROUP_WEB_ONBOARDING_RUNTIME_REPORT_FALSE_COMPLETION"],
    [candidate => { candidate.blockingGaps = candidate.blockingGaps.filter(code => code !== "GROUP_WEB_ONBOARDING_DEPARTMENT_SCOPE_NOT_IMPLEMENTED"); }, "GROUP_WEB_ONBOARDING_RUNTIME_SCOPE_GAP_MISSING"],
  ];
  for (const [mutate, code] of mutations) {
    const candidate = structuredClone(task);
    mutate(candidate);
    expectCode(() => verifyGroupWebEmployeeOnboardingRuntimeTaskSources(candidate, sources()), code);
  }
});
