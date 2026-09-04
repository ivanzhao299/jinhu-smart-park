/* global structuredClone */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  GroupWebEmployeeInformationRuntimeTaskError,
  verifyGroupWebEmployeeInformationRuntimeTask,
  verifyGroupWebEmployeeInformationRuntimeTaskSources,
} from "../hr-cutover/group-web-employee-information-modern-runtime-task.mjs";
import { assessLegacyGroupWebImplementationCoverage } from "../hr-cutover/legacy-group-web-implementation-coverage-lib.mjs";

const root = resolve(import.meta.dirname, "../..");
const json = path => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const task = json("scripts/hr-cutover/contracts/group-web-employee-information-modern-runtime-task-v1.json");
const sources = () => ({
  moduleMapping: json(task.sourceContracts[0].path),
  sourceAudit: json(task.sourceContracts[1].path),
  profileEvidence: json(task.sourceContracts[2].path),
  readTarget: path => readFileSync(resolve(root, path), "utf8"),
});
const expectCode = (action, code) => assert.throws(
  action,
  error => error instanceof GroupWebEmployeeInformationRuntimeTaskError && error.code === code,
);

test("Group Web employee information freezes one runtime task without claiming execution", () => {
  const report = verifyGroupWebEmployeeInformationRuntimeTask(root, task);
  assert.equal(report.status, "READY_NOT_EXECUTED");
  assert.equal(report.candidateId, "GROUP-WEB-INTERACTION-35-EMPLOYEE-INFORMATION");
  assert.equal(report.taskReadyIncrement, 1);
  assert.equal(report.runtimeCoverageIncrement, 0);
  assert.deepEqual(report.coverageCredit, {
    groupWebNavigableEntries: { numerator: 0, denominator: 186 },
    legacyInteractionParity: { numerator: 0, denominator: 6 },
  });
  assert.equal(report.compatibilityScoreContribution, 0);
  assert.equal(report.productionImport, "HOLD");
});

test("the selected entry remains a score-90 partial in the shared 231-entry coverage model", () => {
  const coverage = assessLegacyGroupWebImplementationCoverage(json(task.sourceContracts[0].path), root);
  const selected = coverage.items.find(item => item.legacyId === 35);
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

test("all 43 source fields and eleven opaque interaction slots remain in the denominator", () => {
  const fields = Object.values(task.legacyFieldGroups).flat();
  assert.equal(fields.length, 43);
  assert.equal(new Set(fields).size, 43);
  assert.deepEqual(new Set(task.fieldBindings.map(binding => binding.legacyField)), new Set(fields));
  assert.equal(task.fieldBindings.filter(binding => binding.modernTarget === null).length, 2);
  assert.equal(task.legacyStaticContract.controls - fields.length, 22);
  assert.deepEqual(
    {
      forms: task.legacyInteractionSlots.forms.length,
      actions: task.legacyInteractionSlots.formActions.length,
      transitions: task.legacyInteractionSlots.stateTransitions.length,
    },
    { forms: 4, actions: 1, transitions: 6 },
  );
  assert.equal(task.legacyReportLayout.status, "not_observed");
});

test("modern task freezes park team self forbidden roles, statuses, API and both viewports", () => {
  assert.deepEqual(task.modernRuntimeContract.statusVocabulary, ["preboarding", "probation", "active", "suspended", "departed"]);
  assert.deepEqual(
    task.modernRuntimeContract.roleMatrix.map(row => [row.role, row.directoryScope, row.profileProjection]),
    [
      ["hr_manager", "tenant_park", "full"],
      ["department_manager", "managed_org_tree", "masked"],
      ["employee_self_service", "self", "self_masked"],
      ["no_employee_permission", "none", "none"],
    ],
  );
  assert.equal(task.modernRuntimeContract.apiTasks.length, 10);
  assert.deepEqual(task.modernRuntimeContract.browserTask.viewports.map(viewport => viewport.width), [1440, 390]);
  assert.equal(task.runtimeEvidence.requiredModernBrowserObservations, 8);
});

test("source identity, field inventory and modern source evidence fail closed on drift", () => {
  const moduleDrift = sources();
  moduleDrift.moduleMapping.items.find(item => item.legacyId === 35).legacyUrl = "invented.asp";
  expectCode(() => verifyGroupWebEmployeeInformationRuntimeTaskSources(task, moduleDrift), "GROUP_WEB_EMPLOYEE_RUNTIME_SOURCE_DRIFT");

  const fieldDrift = sources();
  fieldDrift.profileEvidence.fieldGroups.identity.pop();
  expectCode(() => verifyGroupWebEmployeeInformationRuntimeTaskSources(task, fieldDrift), "GROUP_WEB_EMPLOYEE_RUNTIME_SOURCE_DRIFT");

  const targetDrift = sources();
  targetDrift.readTarget = () => "";
  expectCode(() => verifyGroupWebEmployeeInformationRuntimeTaskSources(task, targetDrift), "GROUP_WEB_EMPLOYEE_RUNTIME_MODERN_EVIDENCE_MISSING");
});

test("static task cards cannot inflate runtime parity or compatibility credit", () => {
  const mutations = [
    candidate => { candidate.status = "pass"; },
    candidate => { candidate.runtimeEvidence.status = "observed"; },
    candidate => { candidate.coverageCredit.groupWebNavigableEntries.numerator = 1; },
    candidate => { candidate.coverageCredit.legacyInteractionParity.numerator = 1; },
    candidate => { candidate.compatibilityScoreContribution = 1; },
    candidate => { candidate.productionImport = "READY"; },
  ];
  for (const mutate of mutations) {
    const candidate = structuredClone(task);
    mutate(candidate);
    expectCode(
      () => verifyGroupWebEmployeeInformationRuntimeTaskSources(candidate, sources()),
      JSON.stringify(candidate.coverageCredit) === JSON.stringify(task.coverageCredit)
        ? "GROUP_WEB_EMPLOYEE_RUNTIME_FALSE_COMPLETION"
        : "GROUP_WEB_EMPLOYEE_RUNTIME_COVERAGE_INVALID",
    );
  }
});

test("field and report tasks cannot relabel unobserved evidence as verified", () => {
  const fieldClaim = structuredClone(task);
  fieldClaim.fieldBindings[0].disposition = "verified";
  expectCode(
    () => verifyGroupWebEmployeeInformationRuntimeTaskSources(fieldClaim, sources()),
    "GROUP_WEB_EMPLOYEE_RUNTIME_FIELD_BINDINGS_INVALID",
  );

  const reportClaim = structuredClone(task);
  reportClaim.legacyReportLayout.status = "pass";
  expectCode(
    () => verifyGroupWebEmployeeInformationRuntimeTaskSources(reportClaim, sources()),
    "GROUP_WEB_EMPLOYEE_RUNTIME_REPORT_FALSE_COMPLETION",
  );
});
