/* global structuredClone */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { assessLegacyGroupWebImplementationCoverage } from "../hr-cutover/legacy-group-web-implementation-coverage-lib.mjs";
import {
  GroupWebPerformanceReportRuntimeTaskError,
  verifyGroupWebPerformanceReportRuntimeTask,
  verifyGroupWebPerformanceReportRuntimeTaskSources,
} from "../hr-cutover/group-web-performance-report-center-modern-runtime-task.mjs";

const root = resolve(import.meta.dirname, "../..");
const json = path => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const task = json("scripts/hr-cutover/contracts/group-web-performance-report-center-modern-runtime-task-v1.json");
const sources = () => ({
  moduleMapping: json(task.sourceContracts[0].path),
  sourceAudit: json(task.sourceContracts[1].path),
  reconciliation: json(task.sourceContracts[2].path),
  readTarget: path => readFileSync(resolve(root, path), "utf8"),
});
const expectCode = (action, code) => assert.throws(
  action,
  error => error instanceof GroupWebPerformanceReportRuntimeTaskError && error.code === code,
);

test("performance report center adds one prepared task and zero runtime compatibility credit", () => {
  const report = verifyGroupWebPerformanceReportRuntimeTask(root, task);
  assert.equal(report.status, "READY_NOT_EXECUTED");
  assert.equal(report.candidateId, "GROUP-WEB-INTERACTION-95-PERFORMANCE-REPORT-CENTER");
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

test("the report center remains score-80 partial with rule and runtime blockers", () => {
  const coverage = assessLegacyGroupWebImplementationCoverage(json(task.sourceContracts[0].path), root);
  const selected = coverage.items.find(item => item.legacyId === 95);
  assert.equal(coverage.summary.total, 231);
  assert.equal(selected.score, 80);
  assert.equal(selected.implementationStatus, "partial");
  assert.deepEqual(selected.dimensions, task.candidate.currentStaticEvidence.dimensionsEach);
  assert.ok(selected.blockers.includes("legacy_rule_parity"));
  assert.ok(selected.blockers.includes("legacy_runtime_uat"));
});

test("all report ASP control request action select and state slots remain denominators", () => {
  assert.equal(task.legacyEntry.legacyUrl, "performance/reportcenter/submain.asp");
  assert.equal(task.legacyOpaqueSlots.traversedAspFiles, 5);
  assert.equal(task.legacyOpaqueSlots.forms, 3);
  assert.equal(task.legacyOpaqueSlots.controls, 17);
  assert.equal(task.legacyOpaqueSlots.requestKeys, 11);
  assert.equal(task.legacyOpaqueSlots.formActions, 1);
  assert.equal(task.legacyOpaqueSlots.selectStatements, 10);
  assert.equal(task.legacyOpaqueSlots.stateTransitions, 3);
  assert.equal(task.legacyOpaqueSlots.emptyOrNullSlotsRemainInDenominator, true);
});

test("a composite report with no single mapped table is not mislabeled as an empty feature", () => {
  assert.equal(task.legacyDataBoundary.legacyTable, null);
  assert.equal(task.legacyDataBoundary.legacyView, null);
  assert.equal(task.legacyDataBoundary.rowCount, null);
  assert.equal(task.legacyDataBoundary.featureRequired, true);
  assert.match(task.legacyDataBoundary.rowCountDisposition, /must_not_be_classified_as_empty/u);
  assert.equal(task.legacyDataBoundary.requiredSourceDiscovery.length, 6);
  assert.match(task.legacyDataBoundary.emptyRule, /^no_single_table_or_zero_result_never_removes/u);
});

test("legacy queries routines actions conditions and report layouts remain unobserved requirements", () => {
  assert.equal(task.legacyInteractionTask.runtimeStatus, "not_observed");
  assert.equal(task.legacyInteractionTask.selectSlots, 10);
  assert.equal(task.legacyInteractionTask.requiredActionObservations.length, 11);
  assert.equal(task.legacyInteractionTask.requiredConditionObservations.length, 11);
  assert.deepEqual(task.legacyInteractionTask.groupWebRoutineReferences, []);
  assert.match(task.legacyInteractionTask.requiredRoutineObservation, /all_ten_selects/u);
  assert.match(task.legacyInteractionTask.requiredRoutineObservation, /empty_and_untriggered_branches/u);
  assert.equal(task.legacyReportLayout.requiredObservations.length, 13);
  assert.equal(task.legacyReportLayout.status, "not_observed");
});

test("existing performance reads are separated from missing report endpoints and permissions", () => {
  assert.equal(task.modernRuntimeContract.currentReadInputs.length, 4);
  assert.ok(task.modernRuntimeContract.currentReadInputs.every(item => item.status === "implemented_static_not_runtime_verified"));
  assert.equal(task.modernRuntimeContract.requiredReportingApiTasks.length, 8);
  assert.ok(task.modernRuntimeContract.requiredReportingApiTasks.every(item => item.status === "missing"));
  assert.equal(task.modernRuntimeContract.requiredPermissionAtoms.length, 5);
  assert.equal(task.modernRuntimeContract.permissionAtomStatus, "missing_dedicated_performance_report_atoms");
  assert.equal(task.runtimeEvidence.requiredModernReadInputObservations, 4);
  assert.equal(task.runtimeEvidence.requiredModernReportingApiObservations, 8);
});

test("park team self export and forbidden roles have desktop plus 390px acceptance", () => {
  assert.deepEqual(task.modernRuntimeContract.roleMatrix.map(row => row.role), [
    "performance_report_park_reader",
    "performance_report_team_reader",
    "performance_report_self_reader",
    "performance_report_exporter",
    "performance_report_no_permission",
  ]);
  assert.deepEqual(task.modernRuntimeContract.browserTask.viewports.map(viewport => viewport.width), [1440, 390]);
  assert.equal(task.modernRuntimeContract.browserTask.checks.length, 8);
  assert.equal(task.runtimeEvidence.requiredModernBrowserObservations, 16);
  assert.ok(task.modernRuntimeContract.browserTask.checks.find(item => item.id === "print_export").assertions.includes("screen_export_projection_match"));
  assert.ok(task.modernRuntimeContract.browserTask.checks.find(item => item.id === "forbidden").assertions.includes("catalog_and_rows_absent"));
});

test("report API permission Web and output parity work remain executable gaps", () => {
  const api = task.implementationGaps.find(item => item.id === "GROUP_WEB_PERFORMANCE_REPORT_API_AND_PERMISSION_SURFACE_NOT_IMPLEMENTED");
  const web = task.implementationGaps.find(item => item.id === "GROUP_WEB_PERFORMANCE_REPORT_WEB_SURFACE_NOT_IMPLEMENTED");
  const layout = task.implementationGaps.find(item => item.id === "GROUP_WEB_PERFORMANCE_REPORT_CATALOG_AND_LAYOUT_NOT_BOUND");
  assert.ok(api.implementationAction.includes("add_least_privilege_read_team_self_export_atoms"));
  assert.ok(api.acceptance.includes("cross_scope_rows_and_binary_absent"));
  assert.ok(web.implementationAction.includes("render_desktop_table_and_390px_cards_with_shared_design_system"));
  assert.ok(web.acceptance.includes("empty_result_preserves_parameters"));
  assert.ok(layout.acceptance.includes("print_layout_parity"));
  assert.ok(layout.acceptance.includes("export_schema_parity"));
});

test("source identities and modern report absence fail closed on drift", () => {
  const moduleDrift = sources();
  moduleDrift.moduleMapping.items.find(item => item.legacyId === 95).legacyUrl = "invented.asp";
  expectCode(() => verifyGroupWebPerformanceReportRuntimeTaskSources(task, moduleDrift), "GROUP_WEB_PERFORMANCE_REPORT_RUNTIME_SOURCE_DRIFT");

  const auditDrift = sources();
  auditDrift.sourceAudit.items.find(item => item.legacyId === 95).selectStatements = 0;
  expectCode(() => verifyGroupWebPerformanceReportRuntimeTaskSources(task, auditDrift), "GROUP_WEB_PERFORMANCE_REPORT_RUNTIME_SOURCE_DRIFT");

  const targetDrift = sources();
  targetDrift.readTarget = () => "";
  expectCode(() => verifyGroupWebPerformanceReportRuntimeTaskSources(task, targetDrift), "GROUP_WEB_PERFORMANCE_REPORT_RUNTIME_MODERN_EVIDENCE_MISSING");

  const falseImplementation = sources();
  falseImplementation.readTarget = path => path.endsWith("hr-api.ts") ? "performanceTemplatesV2: performanceCyclesV2: performanceReviewsV2: performanceReportsV2:" : readFileSync(resolve(root, path), "utf8");
  expectCode(() => verifyGroupWebPerformanceReportRuntimeTaskSources(task, falseImplementation), "GROUP_WEB_PERFORMANCE_REPORT_RUNTIME_MODERN_GAP_DRIFT");
});

test("task preparation cannot inflate runtime parity or remove empty and report gaps", () => {
  const mutations = [
    [candidate => { candidate.status = "pass"; }, "GROUP_WEB_PERFORMANCE_REPORT_RUNTIME_FALSE_COMPLETION"],
    [candidate => { candidate.runtimeEvidence.status = "observed"; }, "GROUP_WEB_PERFORMANCE_REPORT_RUNTIME_FALSE_COMPLETION"],
    [candidate => { candidate.coverageCredit.groupWebNavigableEntries.numerator = 1; }, "GROUP_WEB_PERFORMANCE_REPORT_RUNTIME_COVERAGE_INVALID"],
    [candidate => { candidate.compatibilityScoreContribution = 1; }, "GROUP_WEB_PERFORMANCE_REPORT_RUNTIME_FALSE_COMPLETION"],
    [candidate => { candidate.legacyOpaqueSlots.selectStatements = 0; }, "GROUP_WEB_PERFORMANCE_REPORT_RUNTIME_SLOT_DENOMINATOR_INVALID"],
    [candidate => { candidate.legacyDataBoundary.featureRequired = false; }, "GROUP_WEB_PERFORMANCE_REPORT_RUNTIME_DATA_BOUNDARY_INVALID"],
    [candidate => { candidate.legacyInteractionTask.groupWebRoutineReferences = ["invented_complete"]; }, "GROUP_WEB_PERFORMANCE_REPORT_RUNTIME_INTERACTION_FALSE_COMPLETION"],
    [candidate => { candidate.modernRuntimeContract.requiredReportingApiTasks[0].status = "implemented"; }, "GROUP_WEB_PERFORMANCE_REPORT_RUNTIME_MATRIX_INVALID"],
    [candidate => { candidate.implementationGaps[0].acceptance = []; }, "GROUP_WEB_PERFORMANCE_REPORT_RUNTIME_LEGACY_GAP_INVALID"],
    [candidate => { candidate.implementationGaps[2].implementationAction = []; }, "GROUP_WEB_PERFORMANCE_REPORT_RUNTIME_API_GAP_INVALID"],
    [candidate => { candidate.implementationGaps[3].implementationAction = []; }, "GROUP_WEB_PERFORMANCE_REPORT_RUNTIME_WEB_GAP_INVALID"],
    [candidate => { candidate.blockingGaps = candidate.blockingGaps.filter(code => code !== "GROUP_WEB_PERFORMANCE_REPORT_API_AND_PERMISSION_SURFACE_NOT_IMPLEMENTED"); }, "GROUP_WEB_PERFORMANCE_REPORT_RUNTIME_IMPLEMENTATION_GAP_MISSING"],
  ];
  for (const [mutate, code] of mutations) {
    const candidate = structuredClone(task);
    mutate(candidate);
    expectCode(() => verifyGroupWebPerformanceReportRuntimeTaskSources(candidate, sources()), code);
  }
});
