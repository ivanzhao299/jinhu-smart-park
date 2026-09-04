/* global structuredClone */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { assessLegacyGroupWebImplementationCoverage } from "../hr-cutover/legacy-group-web-implementation-coverage-lib.mjs";
import {
  GroupWebPerformanceRuntimeTaskError,
  verifyGroupWebPerformanceRuntimeTask,
  verifyGroupWebPerformanceRuntimeTaskSources,
} from "../hr-cutover/group-web-performance-template-evaluation-modern-runtime-task.mjs";

const root = resolve(import.meta.dirname, "../..");
const json = path => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const task = json("scripts/hr-cutover/contracts/group-web-performance-template-evaluation-modern-runtime-task-v1.json");
const sources = () => ({
  moduleMapping: json(task.sourceContracts[0].path),
  sourceAudit: json(task.sourceContracts[1].path),
  reconciliation: json(task.sourceContracts[2].path),
  clientFieldMap: json(task.sourceContracts[3].path),
  readTarget: path => readFileSync(resolve(root, path), "utf8"),
});
const expectCode = (action, code) => assert.throws(
  action,
  error => error instanceof GroupWebPerformanceRuntimeTaskError && error.code === code,
);

test("performance template and evaluation add one prepared task and zero runtime compatibility credit", () => {
  const report = verifyGroupWebPerformanceRuntimeTask(root, task);
  assert.equal(report.status, "READY_NOT_EXECUTED");
  assert.equal(report.candidateId, "GROUP-WEB-INTERACTION-90-94-PERFORMANCE-TEMPLATE-EVALUATION");
  assert.equal(report.taskReadyIncrement, 1);
  assert.equal(report.runtimeCoverageIncrement, 0);
  assert.equal(report.compatibilityScoreContribution, 0);
  assert.deepEqual(report.coverageCredit, {
    taskReady: { numerator: 1, denominator: 1 },
    groupWebNavigableEntries: { numerator: 0, denominator: 186 },
    legacyInteractionParity: { numerator: 0, denominator: 2 },
  });
  assert.equal(report.productionImport, "HOLD");
});

test("both selected Group Web entries remain score-80 partial with rule and runtime blockers", () => {
  const coverage = assessLegacyGroupWebImplementationCoverage(json(task.sourceContracts[0].path), root);
  const selected = coverage.items.filter(item => task.candidate.legacyIds.includes(item.legacyId));
  assert.equal(coverage.summary.total, 231);
  assert.deepEqual(selected.map(item => item.legacyId), [90, 94]);
  for (const item of selected) {
    assert.equal(item.score, 80);
    assert.equal(item.implementationStatus, "partial");
    assert.deepEqual(item.dimensions, task.candidate.currentStaticEvidence.dimensionsEach);
    assert.ok(item.blockers.includes("legacy_rule_parity"));
    assert.ok(item.blockers.includes("legacy_runtime_uat"));
  }
});

test("all ASP control request action state and empty slots stay in the denominator", () => {
  assert.deepEqual(task.legacyEntries.map(entry => entry.legacyUrl), [
    "performance/asstemplet/Browse.asp",
    "performance/assess/Browse.asp",
  ]);
  assert.equal(task.legacyOpaqueSlots.traversedAspFiles, 12);
  assert.equal(task.legacyOpaqueSlots.forms, 5);
  assert.equal(task.legacyOpaqueSlots.controls, 101);
  assert.equal(task.legacyOpaqueSlots.requestKeys, 37);
  assert.equal(task.legacyOpaqueSlots.formActions, 4);
  assert.equal(task.legacyOpaqueSlots.stateTransitions, 7);
  assert.equal(task.legacyOpaqueSlots.emptyOrNullSlotsRemainInDenominator, true);
  assert.equal(task.runtimeEvidence.requiredLegacyAspBindings, 12);
});

test("known and unknown Group Web row counts remain distinct and never erase feature behavior", () => {
  const template = task.legacyDataPresenceBoundary.tables.find(table => table.legacyId === 90);
  const evaluation = task.legacyDataPresenceBoundary.tables.find(table => table.legacyId === 94);
  assert.equal(template.observedRows, 23);
  assert.equal(evaluation.observedRows, null);
  assert.equal(template.featureRequired, true);
  assert.equal(evaluation.featureRequired, true);
  assert.match(task.legacyDataPresenceBoundary.emptyTableRule, /^zero_or_unknown_rows_never_remove/u);
  assert.equal(task.crossSourceAssessmentBoundary.groupWebFieldCreditFromWindowsClient, 0);
});

test("assessmentcode freezes all eleven fields formula grades null behavior and both routines", () => {
  assert.equal(task.crossSourceAssessmentBoundary.fieldDenominator, 11);
  assert.equal(task.crossSourceAssessmentBoundary.fields.length, 11);
  assert.deepEqual(task.crossSourceAssessmentBoundary.routineEvidence.map(item => item.sourceName), ["bs_ass_compute", "u_count"]);
  assert.equal(task.crossSourceAssessmentBoundary.weightedTotal, "selfvalue*spercent/100+mitemvalue*mpercent/100+itemvalue*tpercent/100+xitemvalue*xpercent/100+citemvalue*cpercent/100+mastervalue+timekeepvalue+bonusvalue");
  assert.equal(task.crossSourceAssessmentBoundary.gradeAssignment, "assgradecode_threshold_lookup_after_total");
  assert.equal(task.crossSourceAssessmentBoundary.nullHandling, "legacy_routine_contains_null_defaulting");
  assert.equal(task.runtimeEvidence.requiredWindowsClientFieldDispositions, 11);
  assert.equal(task.runtimeEvidence.requiredWindowsClientRoutineParities, 2);
});

test("Group Web routine references remain unresolved while related client routines stay source-bound", () => {
  assert.deepEqual(task.legacyInteractionTask.groupWebRoutineReferences, []);
  assert.equal(task.legacyInteractionTask.groupWebRoutineReferenceStatus, "not_extracted_from_current_static_audit");
  assert.match(task.legacyInteractionTask.requiredRoutineObservation, /procedure_function_trigger/u);
  assert.match(task.legacyInteractionTask.requiredRoutineObservation, /untriggered/u);
  assert.match(task.crossSourceAssessmentBoundary.separateSourceRule, /cannot_name_or_complete_Group_Web_slots/u);
  assert.equal(task.legacyInteractionTask.entryPlans.reduce((sum, item) => sum + item.requiredActions.length, 0), 20);
  assert.equal(task.legacyInteractionTask.entryPlans.reduce((sum, item) => sum + item.requiredConditions.length, 0), 20);
});

test("modern API roles statuses and desktop plus 390px observations are explicit", () => {
  assert.deepEqual(task.modernRuntimeContract.statusVocabulary, ["planning", "self_review", "manager_review", "calibration", "employee_acknowledged", "appealed", "confirmed"]);
  assert.equal(task.modernRuntimeContract.transitionMatrix.length, 7);
  assert.equal(task.modernRuntimeContract.roleMatrix.length, 10);
  assert.equal(task.modernRuntimeContract.apiTasks.length, 20);
  assert.deepEqual(task.modernRuntimeContract.browserTask.viewports.map(viewport => viewport.width), [1440, 390]);
  assert.equal(task.modernRuntimeContract.browserTask.checks.length, 10);
  assert.equal(task.runtimeEvidence.requiredModernBrowserObservations, 20);
});

test("dynamic template formula projection read-only templates and score preview remain executable gaps", () => {
  const formula = task.implementationGaps.find(item => item.id === "GROUP_WEB_PERFORMANCE_ASSESSMENTCODE_FORMULA_PROJECTION_NOT_IMPLEMENTED");
  const editor = task.implementationGaps.find(item => item.id === "GROUP_WEB_PERFORMANCE_WEB_DYNAMIC_TEMPLATE_EDITOR_NOT_IMPLEMENTED");
  const web = task.implementationGaps.find(item => item.id === "GROUP_WEB_PERFORMANCE_WEB_READ_AND_SCORE_PREVIEW_CAPABILITIES_NOT_REACHABLE");
  assert.ok(formula.implementationAction.includes("implement_server_owned_bs_ass_compute_equivalent_with_component_gates_null_defaults_and_grade_thresholds"));
  assert.ok(formula.acceptance.includes("11_of_11_field_dispositions_verified"));
  assert.ok(editor.missingEvidence.includes("dynamic_dimension_editor"));
  assert.ok(editor.acceptance.includes("no_fixed_three_dimension_loss"));
  assert.ok(web.implementationAction.includes("load_and_render_templates_for_HR_PERFORMANCE_TEMPLATE_READ_without_manage"));
  assert.ok(web.implementationAction.includes("add_typed_wrapper_for_existing_score_preview_endpoint"));
});

test("source identities and modern implementation evidence fail closed on drift", () => {
  const moduleDrift = sources();
  moduleDrift.moduleMapping.items.find(item => item.legacyId === 90).legacyTable = "Invented";
  expectCode(() => verifyGroupWebPerformanceRuntimeTaskSources(task, moduleDrift), "GROUP_WEB_PERFORMANCE_RUNTIME_SOURCE_DRIFT");

  const countDrift = sources();
  countDrift.reconciliation.groupWebKeyTableCounts.Per_tAssessTemplate = 0;
  expectCode(() => verifyGroupWebPerformanceRuntimeTaskSources(task, countDrift), "GROUP_WEB_PERFORMANCE_RUNTIME_SOURCE_DRIFT");

  const clientDrift = sources();
  clientDrift.clientFieldMap.fields.pop();
  expectCode(() => verifyGroupWebPerformanceRuntimeTaskSources(task, clientDrift), "GROUP_WEB_PERFORMANCE_RUNTIME_SOURCE_DRIFT");

  const targetDrift = sources();
  targetDrift.readTarget = () => "";
  expectCode(() => verifyGroupWebPerformanceRuntimeTaskSources(task, targetDrift), "GROUP_WEB_PERFORMANCE_RUNTIME_MODERN_EVIDENCE_MISSING");
});

test("task preparation cannot claim runtime parity or hide a required gap", () => {
  const mutations = [
    [candidate => { candidate.status = "pass"; }, "GROUP_WEB_PERFORMANCE_RUNTIME_FALSE_COMPLETION"],
    [candidate => { candidate.runtimeEvidence.status = "observed"; }, "GROUP_WEB_PERFORMANCE_RUNTIME_FALSE_COMPLETION"],
    [candidate => { candidate.coverageCredit.groupWebNavigableEntries.numerator = 2; }, "GROUP_WEB_PERFORMANCE_RUNTIME_COVERAGE_INVALID"],
    [candidate => { candidate.compatibilityScoreContribution = 2; }, "GROUP_WEB_PERFORMANCE_RUNTIME_FALSE_COMPLETION"],
    [candidate => { candidate.legacyOpaqueSlots.controls = 0; }, "GROUP_WEB_PERFORMANCE_RUNTIME_SLOT_DENOMINATOR_INVALID"],
    [candidate => { candidate.legacyDataPresenceBoundary.tables[1].featureRequired = false; }, "GROUP_WEB_PERFORMANCE_RUNTIME_EMPTY_SOURCE_BOUNDARY_INVALID"],
    [candidate => { candidate.crossSourceAssessmentBoundary.groupWebFieldCreditFromWindowsClient = 11; }, "GROUP_WEB_PERFORMANCE_RUNTIME_DUAL_SOURCE_BOUNDARY_INVALID"],
    [candidate => { candidate.legacyInteractionTask.groupWebRoutineReferences = ["invented_complete"]; }, "GROUP_WEB_PERFORMANCE_RUNTIME_INTERACTION_FALSE_COMPLETION"],
    [candidate => { candidate.implementationGaps[2].implementationAction = []; }, "GROUP_WEB_PERFORMANCE_RUNTIME_FORMULA_GAP_INVALID"],
    [candidate => { candidate.implementationGaps[3].missingEvidence = []; }, "GROUP_WEB_PERFORMANCE_RUNTIME_EDITOR_GAP_INVALID"],
    [candidate => { candidate.implementationGaps[4].implementationAction = []; }, "GROUP_WEB_PERFORMANCE_RUNTIME_WEB_GAP_INVALID"],
    [candidate => { candidate.blockingGaps = candidate.blockingGaps.filter(code => code !== "GROUP_WEB_PERFORMANCE_ASSESSMENTCODE_FORMULA_PROJECTION_NOT_IMPLEMENTED"); }, "GROUP_WEB_PERFORMANCE_RUNTIME_IMPLEMENTATION_GAP_MISSING"],
  ];
  for (const [mutate, code] of mutations) {
    const candidate = structuredClone(task);
    mutate(candidate);
    expectCode(() => verifyGroupWebPerformanceRuntimeTaskSources(candidate, sources()), code);
  }
});
