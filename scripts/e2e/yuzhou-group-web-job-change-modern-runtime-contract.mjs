/* global structuredClone */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { assessLegacyGroupWebImplementationCoverage } from "../hr-cutover/legacy-group-web-implementation-coverage-lib.mjs";
import {
  GroupWebJobChangeRuntimeTaskError,
  verifyGroupWebJobChangeRuntimeTask,
  verifyGroupWebJobChangeRuntimeTaskSources,
} from "../hr-cutover/group-web-job-change-modern-runtime-task.mjs";

const root = resolve(import.meta.dirname, "../..");
const json = path => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const task = json("scripts/hr-cutover/contracts/group-web-job-change-modern-runtime-task-v1.json");
const sources = () => ({
  moduleMapping: json(task.sourceContracts[0].path),
  sourceAudit: json(task.sourceContracts[1].path),
  jobChangeEvidence: json(task.sourceContracts[2].path),
  readTarget: path => readFileSync(resolve(root, path), "utf8"),
});
const expectCode = (action, code) => assert.throws(
  action,
  error => error instanceof GroupWebJobChangeRuntimeTaskError && error.code === code,
);

test("Group Web job change freezes one runtime task without claiming execution", () => {
  const report = verifyGroupWebJobChangeRuntimeTask(root, task);
  assert.equal(report.status, "READY_NOT_EXECUTED");
  assert.equal(report.candidateId, "GROUP-WEB-INTERACTION-39-JOB-CHANGE");
  assert.equal(report.taskReadyIncrement, 1);
  assert.equal(report.runtimeCoverageIncrement, 0);
  assert.equal(report.stillRequired.departmentRangeTreeEquivalence, true);
  assert.equal(report.stillRequired.compensationColumnMapping, true);
  assert.deepEqual(report.coverageCredit, {
    groupWebNavigableEntries: { numerator: 0, denominator: 186 },
    legacyInteractionParity: { numerator: 0, denominator: 6 },
  });
  assert.equal(report.compatibilityScoreContribution, 0);
  assert.equal(report.productionImport, "HOLD");
});

test("the selected job-change entry remains score-90 partial in the shared model", () => {
  const coverage = assessLegacyGroupWebImplementationCoverage(json(task.sourceContracts[0].path), root);
  const selected = coverage.items.find(item => item.legacyId === 39);
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

test("all page slots semantic fields and desktop ledger columns stay in the denominator", () => {
  assert.equal(task.legacyOpaqueSlots.controlSlots.length, 14);
  assert.equal(new Set(task.legacyOpaqueSlots.controlSlots).size, 14);
  assert.equal(task.legacyOpaqueSlots.requestKeySlots.length, 20);
  assert.equal(new Set(task.legacyOpaqueSlots.requestKeySlots).size, 20);
  assert.equal(task.legacyOpaqueSlots.formActionSlots.length, 1);
  assert.equal(task.legacySemanticFields.length, 10);
  assert.ok(task.legacySemanticFields.every(field => /(?:requires|blocked|unresolved)/u.test(field.disposition)));
  assert.equal(task.legacyDualSourceLedger.columns.length, 32);
  assert.equal(new Set(task.legacyDualSourceLedger.columns).size, 32);
  assert.equal(task.legacyDualSourceLedger.compensationColumns.length, 8);
  assert.match(task.legacyDualSourceLedger.compensationDisposition, /^blocked_/u);
});

test("job-change states actions roles API and desktop plus phone observations are frozen", () => {
  assert.deepEqual(task.modernRuntimeContract.statusVocabulary, ["draft", "submitted", "returned", "approved", "cancelled", "applied"]);
  assert.deepEqual(task.modernRuntimeContract.transitionMatrix.map(row => row.action), ["submit", "resubmit", "cancel", "approve", "return", "apply"]);
  assert.deepEqual(task.modernRuntimeContract.roleMatrix.map(row => row.role), ["park_job_change_reader", "team_job_change_reader", "self_job_change_reader", "team_job_change_operator", "job_change_reviewer", "job_change_applier", "no_job_change_permission"]);
  assert.equal(task.modernRuntimeContract.apiTasks.length, 20);
  assert.deepEqual(task.modernRuntimeContract.browserTask.viewports.map(viewport => viewport.width), [1440, 390]);
  assert.equal(task.runtimeEvidence.requiredModernBrowserObservations, 14);
});

test("legacy department range to modern tree scope is an executable gap", () => {
  const gap = task.implementationGaps.find(item => item.id === "GROUP_WEB_JOB_CHANGE_DEPARTMENT_RANGE_TREE_EQUIVALENCE_NOT_OBSERVED");
  assert.ok(gap);
  assert.deepEqual(gap.missingEvidence, ["legacy_direct_department_visibility", "legacy_child_department_visibility", "legacy_sibling_department_visibility", "legacy_cross_department_visibility"]);
  assert.ok(gap.implementationAction.includes("create_non_personal_parent_child_and_sibling_department_records"));
  assert.ok(gap.implementationAction.includes("if_legacy_direct_only_scope_is_required_add_an_exact_direct_team_scope_instead_of_claiming_tree_equivalence"));
  assert.ok(gap.acceptance.includes("no_out_of_scope_row_or_count_disclosure"));
  const apiGap = task.modernRuntimeContract.apiTasks.find(item => item.id === "legacy_department_range_equivalence");
  assert.equal(apiGap?.expectedStatus, "blocked_until_direct_child_sibling_scope_pair_is_observed");
  assert.ok(apiGap?.assertions.includes("do_not_claim_department_scope_equivalence"));
});

test("job-change cannot silently absorb the desktop compensation columns", () => {
  const gap = task.implementationGaps.find(item => item.id === "GROUP_WEB_JOB_CHANGE_COMPENSATION_COLUMNS_REQUIRE_SEPARATE_MAPPING");
  assert.ok(gap);
  assert.equal(task.legacyDualSourceLedger.compensationColumns.length, 8);
  assert.ok(gap.implementationAction.includes("keep_job_change_apply_from_writing_compensation"));
  assert.ok(gap.acceptance.includes("job_change_apply_does_not_change_pay"));
  assert.equal(task.runtimeEvidence.compensationValuesExcluded, true);
});

test("source identity dual-source rules and modern tokens fail closed on drift", () => {
  const moduleDrift = sources();
  moduleDrift.moduleMapping.items.find(item => item.legacyId === 39).legacyUrl = "invented.asp";
  expectCode(() => verifyGroupWebJobChangeRuntimeTaskSources(task, moduleDrift), "GROUP_WEB_JOB_CHANGE_RUNTIME_SOURCE_DRIFT");

  const ledgerDrift = sources();
  ledgerDrift.jobChangeEvidence.desktopClient.columns.pop();
  expectCode(() => verifyGroupWebJobChangeRuntimeTaskSources(task, ledgerDrift), "GROUP_WEB_JOB_CHANGE_RUNTIME_SOURCE_DRIFT");

  const targetDrift = sources();
  targetDrift.readTarget = () => "";
  expectCode(() => verifyGroupWebJobChangeRuntimeTaskSources(task, targetDrift), "GROUP_WEB_JOB_CHANGE_RUNTIME_MODERN_EVIDENCE_MISSING");
});

test("task cards cannot inflate job-change runtime coverage or hide gaps", () => {
  const mutations = [
    [candidate => { candidate.status = "pass"; }, "GROUP_WEB_JOB_CHANGE_RUNTIME_FALSE_COMPLETION"],
    [candidate => { candidate.runtimeEvidence.status = "observed"; }, "GROUP_WEB_JOB_CHANGE_RUNTIME_FALSE_COMPLETION"],
    [candidate => { candidate.coverageCredit.groupWebNavigableEntries.numerator = 1; }, "GROUP_WEB_JOB_CHANGE_RUNTIME_COVERAGE_INVALID"],
    [candidate => { candidate.compatibilityScoreContribution = 1; }, "GROUP_WEB_JOB_CHANGE_RUNTIME_FALSE_COMPLETION"],
    [candidate => { candidate.legacySemanticFields[0].disposition = "verified"; }, "GROUP_WEB_JOB_CHANGE_RUNTIME_FIELD_BINDINGS_INVALID"],
    [candidate => { candidate.legacyDualSourceLedger.runtimeStatus = "pass"; }, "GROUP_WEB_JOB_CHANGE_RUNTIME_LEDGER_INVALID"],
    [candidate => { candidate.legacyWorkflowRules.runtimeStatus = "pass"; }, "GROUP_WEB_JOB_CHANGE_RUNTIME_WORKFLOW_FALSE_COMPLETION"],
    [candidate => { candidate.legacyReportLayout.status = "pass"; }, "GROUP_WEB_JOB_CHANGE_RUNTIME_REPORT_FALSE_COMPLETION"],
    [candidate => { candidate.blockingGaps = candidate.blockingGaps.filter(code => code !== "GROUP_WEB_JOB_CHANGE_DEPARTMENT_RANGE_TREE_EQUIVALENCE_NOT_OBSERVED"); }, "GROUP_WEB_JOB_CHANGE_RUNTIME_IMPLEMENTATION_GAP_MISSING"],
    [candidate => { candidate.implementationGaps[0].implementationAction = []; }, "GROUP_WEB_JOB_CHANGE_RUNTIME_SCOPE_GAP_INVALID"],
  ];
  for (const [mutate, code] of mutations) {
    const candidate = structuredClone(task);
    mutate(candidate);
    expectCode(() => verifyGroupWebJobChangeRuntimeTaskSources(candidate, sources()), code);
  }
});
