/* global structuredClone */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { assessLegacyGroupWebImplementationCoverage } from "../hr-cutover/legacy-group-web-implementation-coverage-lib.mjs";
import {
  GroupWebDepartmentTaskRuntimeTaskError,
  verifyGroupWebDepartmentTaskRuntimeTask,
  verifyGroupWebDepartmentTaskRuntimeTaskSources,
} from "../hr-cutover/group-web-performance-department-task-modern-runtime-task.mjs";

const root = resolve(import.meta.dirname, "../..");
const json = path => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const task = json("scripts/hr-cutover/contracts/group-web-performance-department-task-modern-runtime-task-v1.json");
const sources = () => ({
  moduleMapping: json(task.sourceContracts[0].path),
  sourceAudit: json(task.sourceContracts[1].path),
  reconciliation: json(task.sourceContracts[2].path),
  readTarget: path => readFileSync(resolve(root, path), "utf8"),
});
const expectCode = (action, code) => assert.throws(
  action,
  error => error instanceof GroupWebDepartmentTaskRuntimeTaskError && error.code === code,
);

test("department task adds one prepared task and zero runtime compatibility credit", () => {
  const report = verifyGroupWebDepartmentTaskRuntimeTask(root, task);
  assert.equal(report.status, "READY_NOT_EXECUTED");
  assert.equal(report.candidateId, "GROUP-WEB-INTERACTION-92-PERFORMANCE-DEPARTMENT-TASK");
  assert.equal(report.taskReadyIncrement, 1);
  assert.equal(report.runtimeCoverageIncrement, 0);
  assert.equal(report.compatibilityScoreContribution, 0);
  assert.deepEqual(report.coverageCredit, {
    taskReady: { numerator: 1, denominator: 1 },
    groupWebNavigableEntries: { numerator: 0, denominator: 186 },
    legacyInteractionParity: { numerator: 0, denominator: 1 },
  });
  assert.equal(report.productionImport, "HOLD");
});

test("department task remains score-80 partial with legacy rule and runtime blockers", () => {
  const coverage = assessLegacyGroupWebImplementationCoverage(json(task.sourceContracts[0].path), root);
  const selected = coverage.items.find(item => item.legacyId === 92);
  assert.equal(coverage.summary.total, 231);
  assert.equal(selected.score, 80);
  assert.equal(selected.implementationStatus, "partial");
  assert.deepEqual(selected.dimensions, task.candidate.currentStaticEvidence.dimensionsEach);
  assert.ok(selected.blockers.includes("legacy_rule_parity"));
  assert.ok(selected.blockers.includes("legacy_runtime_uat"));
});

test("all department-task ASP control request action and transition slots remain denominators", () => {
  assert.equal(task.legacyEntry.legacyUrl, "performance/assignment/DepartmentTask/Basic/Browse.asp");
  assert.equal(task.legacyEntry.legacyTable, "Per_Task_tDeptBasic");
  assert.equal(task.legacyEntry.legacyView, "Per_Task_vDeptBasic");
  assert.equal(task.legacyOpaqueSlots.traversedAspFiles, 2);
  assert.equal(task.legacyOpaqueSlots.forms, 1);
  assert.equal(task.legacyOpaqueSlots.controls, 13);
  assert.equal(task.legacyOpaqueSlots.requestKeys, 14);
  assert.equal(task.legacyOpaqueSlots.formActions, 1);
  assert.equal(task.legacyOpaqueSlots.stateTransitions, 5);
  assert.equal(task.legacyOpaqueSlots.emptyOrNullSlotsRemainInDenominator, true);
});

test("unknown department-task rows preserve table view field and empty-page obligations", () => {
  assert.equal(task.legacyDataBoundary.observedRows, null);
  assert.equal(task.legacyDataBoundary.receiptStatus, "not_in_current_group_web_key_table_count_receipt");
  assert.equal(task.legacyDataBoundary.featureRequired, true);
  assert.equal(task.legacyDataBoundary.requiredSourceDiscovery.length, 7);
  assert.match(task.legacyDataBoundary.emptyRule, /^zero_or_unknown_rows_never_remove/u);
  assert.equal(task.runtimeEvidence.requiredGroupWebTableCountReceipts, 1);
  assert.equal(task.runtimeEvidence.requiredGroupWebTableViewFieldMaps, 2);
});

test("legacy routines actions conditions transitions and layouts remain unobserved", () => {
  assert.equal(task.legacyInteractionTask.runtimeStatus, "not_observed");
  assert.equal(task.legacyInteractionTask.requiredActionObservations.length, 11);
  assert.equal(task.legacyInteractionTask.requiredConditionObservations.length, 11);
  assert.deepEqual(task.legacyInteractionTask.groupWebRoutineReferences, []);
  assert.equal(task.legacyInteractionTask.groupWebRoutineReferenceStatus, "not_extracted_from_current_static_audit");
  assert.match(task.legacyInteractionTask.requiredRoutineObservation, /empty_and_untriggered_branches/u);
  assert.equal(task.legacyReportLayout.requiredObservations.length, 12);
  assert.equal(task.legacyReportLayout.status, "not_observed");
});

test("legacy performance route is not conflated with supporting goals and snapshot semantics", () => {
  assert.equal(task.candidate.mappedModernRoute, "/hr/performance");
  assert.equal(task.candidate.supportingModernRoute, "/hr/goals");
  assert.match(task.candidate.routeDisposition, /unresolved/u);
  const gap = task.implementationGaps.find(item => item.id === "GROUP_WEB_DEPARTMENT_TASK_ROUTE_AND_CROSS_DOMAIN_CONTRACT_UNRESOLVED");
  assert.ok(gap.implementationAction.includes("decide_one_canonical_modern_route_for_legacy_id_92"));
  assert.ok(gap.acceptance.includes("immutable_version_relation"));
  assert.ok(task.modernSourceEvidence.some(item => item.path.endsWith("hr-performance-review.service.ts")));
  assert.ok(task.modernSourceEvidence.some(item => item.path.endsWith("000258_hr_performance_template_planning.sql")));
});

test("modern state role API and desktop plus 390px contracts are complete denominators", () => {
  const modern = task.modernRuntimeContract;
  assert.deepEqual(modern.goalCycleStatusVocabulary, ["draft", "active", "closed"]);
  assert.deepEqual(modern.goalStatusVocabulary, ["draft", "active", "completed", "cancelled"]);
  assert.deepEqual(modern.goalLevelVocabulary, ["group", "department", "employee"]);
  assert.equal(modern.metricTypeVocabulary.length, 5);
  assert.equal(modern.transitionMatrix.length, 5);
  assert.equal(modern.roleMatrix.length, 6);
  assert.equal(modern.apiTasks.length, 11);
  assert.deepEqual(modern.browserTask.viewports.map(viewport => viewport.width), [1440, 390]);
  assert.equal(modern.browserTask.checks.length, 9);
  assert.equal(task.runtimeEvidence.requiredModernBrowserObservations, 18);
});

test("backend-supported change state and history gaps stay explicitly unreachable from Web", () => {
  assert.deepEqual(task.modernRuntimeContract.apiTasks.filter(item => !item.webReachable).map(item => item.id), [
    "cycle_action",
    "change_goal",
    "goal_action",
    "checkins",
  ]);
  const gap = task.implementationGaps.find(item => item.id === "GROUP_WEB_DEPARTMENT_TASK_WEB_CHANGE_STATE_AND_HISTORY_ACTIONS_NOT_REACHABLE");
  assert.ok(gap.implementationAction.includes("add_typed_cycle_and_goal_action_wrappers"));
  assert.ok(gap.implementationAction.includes("wire_the_existing_change_goal_wrapper_to_a_versioned_edit_form"));
  assert.ok(gap.acceptance.includes("desktop_and_390px"));
});

test("source identities and modern evidence fail closed on drift", () => {
  const moduleDrift = sources();
  moduleDrift.moduleMapping.items.find(item => item.legacyId === 92).legacyUrl = "invented.asp";
  expectCode(() => verifyGroupWebDepartmentTaskRuntimeTaskSources(task, moduleDrift), "GROUP_WEB_DEPARTMENT_TASK_RUNTIME_SOURCE_DRIFT");

  const auditDrift = sources();
  auditDrift.sourceAudit.items.find(item => item.legacyId === 92).stateTransitions = 0;
  expectCode(() => verifyGroupWebDepartmentTaskRuntimeTaskSources(task, auditDrift), "GROUP_WEB_DEPARTMENT_TASK_RUNTIME_SOURCE_DRIFT");

  const targetDrift = sources();
  targetDrift.readTarget = () => "";
  expectCode(() => verifyGroupWebDepartmentTaskRuntimeTaskSources(task, targetDrift), "GROUP_WEB_DEPARTMENT_TASK_RUNTIME_MODERN_EVIDENCE_MISSING");

  const falseWebImplementation = sources();
  falseWebImplementation.readTarget = path => path.endsWith("HrGoalsClient.tsx")
    ? "集团方向逐级落实到部门和员工。 目标分解 部门归属 更新目标进度 ds-mobile-record-list 当前范围暂无目标。 hrApi.goalAction"
    : readFileSync(resolve(root, path), "utf8");
  expectCode(() => verifyGroupWebDepartmentTaskRuntimeTaskSources(task, falseWebImplementation), "GROUP_WEB_DEPARTMENT_TASK_RUNTIME_MODERN_GAP_DRIFT");
});

test("task preparation cannot inflate parity remove unknown data or hide route and Web gaps", () => {
  const mutations = [
    [candidate => { candidate.status = "pass"; }, "GROUP_WEB_DEPARTMENT_TASK_RUNTIME_FALSE_COMPLETION"],
    [candidate => { candidate.runtimeEvidence.status = "observed"; }, "GROUP_WEB_DEPARTMENT_TASK_RUNTIME_FALSE_COMPLETION"],
    [candidate => { candidate.coverageCredit.groupWebNavigableEntries.numerator = 1; }, "GROUP_WEB_DEPARTMENT_TASK_RUNTIME_COVERAGE_INVALID"],
    [candidate => { candidate.compatibilityScoreContribution = 1; }, "GROUP_WEB_DEPARTMENT_TASK_RUNTIME_FALSE_COMPLETION"],
    [candidate => { candidate.legacyOpaqueSlots.requestKeys = 0; }, "GROUP_WEB_DEPARTMENT_TASK_RUNTIME_SLOT_DENOMINATOR_INVALID"],
    [candidate => { candidate.legacyDataBoundary.featureRequired = false; }, "GROUP_WEB_DEPARTMENT_TASK_RUNTIME_DATA_BOUNDARY_INVALID"],
    [candidate => { candidate.legacyInteractionTask.groupWebRoutineReferences = ["invented_complete"]; }, "GROUP_WEB_DEPARTMENT_TASK_RUNTIME_INTERACTION_FALSE_COMPLETION"],
    [candidate => { candidate.modernRuntimeContract.apiTasks.find(item => item.id === "goal_action").webReachable = true; }, "GROUP_WEB_DEPARTMENT_TASK_RUNTIME_WEB_GAP_INVALID"],
    [candidate => { candidate.implementationGaps[0].acceptance = []; }, "GROUP_WEB_DEPARTMENT_TASK_RUNTIME_LEGACY_GAP_INVALID"],
    [candidate => { candidate.implementationGaps[2].implementationAction = []; }, "GROUP_WEB_DEPARTMENT_TASK_RUNTIME_ROUTE_GAP_INVALID"],
    [candidate => { candidate.implementationGaps[3].implementationAction = []; }, "GROUP_WEB_DEPARTMENT_TASK_RUNTIME_WEB_GAP_INVALID"],
    [candidate => { candidate.blockingGaps = candidate.blockingGaps.filter(code => code !== "GROUP_WEB_DEPARTMENT_TASK_ROW_COUNT_AND_FIELD_MAP_NOT_BOUND"); }, "GROUP_WEB_DEPARTMENT_TASK_RUNTIME_IMPLEMENTATION_GAP_MISSING"],
  ];
  for (const [mutate, code] of mutations) {
    const candidate = structuredClone(task);
    mutate(candidate);
    expectCode(() => verifyGroupWebDepartmentTaskRuntimeTaskSources(candidate, sources()), code);
  }
});
