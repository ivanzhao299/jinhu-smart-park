/* global structuredClone */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { assessLegacyGroupWebImplementationCoverage } from "../hr-cutover/legacy-group-web-implementation-coverage-lib.mjs";
import {
  GroupWebRewardDisciplineRuntimeTaskError,
  verifyGroupWebRewardDisciplineRuntimeTask,
  verifyGroupWebRewardDisciplineRuntimeTaskSources,
} from "../hr-cutover/group-web-reward-discipline-modern-runtime-task.mjs";

const root = resolve(import.meta.dirname, "../..");
const json = path => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const task = json("scripts/hr-cutover/contracts/group-web-reward-discipline-modern-runtime-task-v1.json");
const sources = () => ({
  moduleMapping: json(task.sourceContracts[0].path),
  sourceAudit: json(task.sourceContracts[1].path),
  reconciliation: json(task.sourceContracts[2].path),
  clientFieldMap: json(task.sourceContracts[3].path),
  readTarget: path => readFileSync(resolve(root, path), "utf8"),
});
const expectCode = (action, code) => assert.throws(
  action,
  error => error instanceof GroupWebRewardDisciplineRuntimeTaskError && error.code === code,
);

test("Group Web reward and discipline freezes one task with no runtime or compatibility credit", () => {
  const report = verifyGroupWebRewardDisciplineRuntimeTask(root, task);
  assert.equal(report.status, "READY_NOT_EXECUTED");
  assert.equal(report.candidateId, "GROUP-WEB-INTERACTION-48-49-REWARD-DISCIPLINE");
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

test("both selected legacy entries remain score-80 partial with rule and runtime gaps", () => {
  const coverage = assessLegacyGroupWebImplementationCoverage(json(task.sourceContracts[0].path), root);
  const selected = coverage.items.filter(item => task.candidate.legacyIds.includes(item.legacyId));
  assert.equal(coverage.summary.total, 231);
  assert.equal(selected.length, 2);
  for (const item of selected) {
    assert.equal(item.score, 80);
    assert.equal(item.implementationStatus, "partial");
    assert.deepEqual(item.dimensions, task.candidate.currentStaticEvidence.dimensionsEach);
    assert.ok(item.blockers.includes("legacy_rule_parity"));
    assert.ok(item.blockers.includes("legacy_runtime_uat"));
  }
});

test("all controls request keys actions and transitions remain in the runtime denominator", () => {
  assert.deepEqual(task.legacyEntries.map(entry => entry.legacyId), [48, 49]);
  assert.equal(task.legacyEntries.reduce((sum, entry) => sum + entry.controls, 0), 28);
  assert.equal(task.legacyEntries.reduce((sum, entry) => sum + entry.requestKeys, 0), 32);
  assert.equal(task.legacyEntries.reduce((sum, entry) => sum + entry.formActions, 0), 2);
  assert.equal(task.legacyEntries.reduce((sum, entry) => sum + entry.stateTransitions, 0), 2);
  assert.equal(task.legacyOpaqueSlots.sourceColumnNamesClaimed, false);
  assert.equal(task.runtimeEvidence.requiredLegacyActionObservations, 20);
  assert.equal(task.runtimeEvidence.requiredLegacyConditionObservations, 20);
  assert.equal(task.runtimeEvidence.requiredLegacyReportLayoutObservations, 20);
});

test("unknown or empty rows never erase a page and client emptiness cannot substitute for Group Web", () => {
  const reward = task.legacyDataPresenceBoundary.tables.find(table => table.legacyId === 48);
  const punishment = task.legacyDataPresenceBoundary.tables.find(table => table.legacyId === 49);
  assert.equal(reward.observedRows, null);
  assert.equal(reward.featureRequired, true);
  assert.equal(punishment.observedRows, 8);
  assert.equal(punishment.featureRequired, true);
  assert.equal(task.legacyDataPresenceBoundary.crossSourceEmptyTable.table, "bonusrecord");
  assert.equal(task.legacyDataPresenceBoundary.crossSourceEmptyTable.observedRows, 0);
  assert.equal(task.legacyDataPresenceBoundary.crossSourceEmptyTable.maySubstituteForGroupWebRewardCount, false);
  assert.equal(task.crossSourceFieldBoundary.groupWebFieldCreditFromWindowsClient, 0);
});

test("modern statuses roles API and desktop plus phone observations are frozen", () => {
  assert.deepEqual(task.modernRuntimeContract.statusVocabulary, ["draft", "submitted", "approved", "returned", "withdrawn"]);
  assert.deepEqual(task.modernRuntimeContract.transitionMatrix.map(row => row.action), ["submit", "resubmit", "withdraw", "approve", "return"]);
  assert.equal(task.modernRuntimeContract.roleMatrix.length, 11);
  assert.equal(task.modernRuntimeContract.apiTasks.length, 28);
  assert.deepEqual(task.modernRuntimeContract.browserTask.viewports.map(viewport => viewport.width), [1440, 390]);
  assert.equal(task.modernRuntimeContract.browserTask.checks.length, 12);
  assert.equal(task.runtimeEvidence.requiredModernBrowserObservations, 24);
});

test("sensitive reason amount evidence and permission negative cases stay independent", () => {
  const roles = new Map(task.modernRuntimeContract.roleMatrix.map(row => [row.role, row]));
  assert.ok(roles.get("park_reward_reader").expectedCapabilities.includes("reason_amount_documents_absent_without_atoms"));
  assert.ok(roles.get("team_reward_reader").expectedCapabilities.includes("outside_tree_absent"));
  assert.ok(roles.get("self_reward_reader").expectedCapabilities.includes("own_approved_only"));
  assert.ok(roles.get("reward_reason_reader").expectedCapabilities.includes("amount_and_documents_absent"));
  assert.ok(roles.get("reward_amount_reader").expectedCapabilities.includes("reason_and_documents_absent"));
  assert.equal(task.runtimeEvidence.personalValuesExcluded, true);
  assert.equal(task.runtimeEvidence.amountValuesExcluded, true);
  assert.equal(task.runtimeEvidence.attachmentBinariesExcluded, true);
});

test("backend-only correction appeal and link capabilities remain an executable Web gap", () => {
  const versionGap = task.implementationGaps.find(item => item.id === "GROUP_WEB_REWARD_DISCIPLINE_WEB_CATEGORY_VERSION_CONTROL_NOT_IMPLEMENTED");
  const gap = task.implementationGaps.find(item => item.id === "GROUP_WEB_REWARD_DISCIPLINE_WEB_CORRECTION_APPEAL_AND_LINK_CONTROLS_NOT_IMPLEMENTED");
  assert.ok(versionGap);
  assert.ok(versionGap.implementationAction.includes("add_a_typed_web_api_wrapper_for_the_existing_category_versions_endpoint"));
  assert.ok(versionGap.acceptance.includes("category_history_remains_immutable"));
  assert.ok(gap);
  assert.ok(gap.implementationAction.includes("add_typed_web_api_wrappers_for_existing_corrections_and_links_endpoints"));
  assert.ok(gap.implementationAction.includes("add_action_specific_server_scoped_payroll_and_performance_candidate_selectors_before_link_controls"));
  assert.ok(gap.acceptance.includes("no_raw_uuid_entry"));
  assert.ok(task.modernRuntimeContract.apiTasks.some(item => item.id === "append_correction"));
  assert.ok(task.modernRuntimeContract.apiTasks.some(item => item.id === "append_self_appeal"));
  assert.ok(task.modernRuntimeContract.apiTasks.some(item => item.id === "link_payroll"));
  assert.ok(task.modernRuntimeContract.apiTasks.some(item => item.id === "link_performance"));
});

test("source identities cross-source boundary and modern evidence fail closed on drift", () => {
  const moduleDrift = sources();
  moduleDrift.moduleMapping.items.find(item => item.legacyId === 48).legacyTable = "Invented";
  expectCode(() => verifyGroupWebRewardDisciplineRuntimeTaskSources(task, moduleDrift), "GROUP_WEB_REWARD_DISCIPLINE_RUNTIME_SOURCE_DRIFT");

  const countDrift = sources();
  countDrift.reconciliation.groupWebKeyTableCounts.Emp_Punish_tApplay = 0;
  expectCode(() => verifyGroupWebRewardDisciplineRuntimeTaskSources(task, countDrift), "GROUP_WEB_REWARD_DISCIPLINE_RUNTIME_SOURCE_DRIFT");

  const sourceConflation = sources();
  sourceConflation.clientFieldMap.sourceTables.push({ sourceTable: "Emp_Reward_tApplay", observedRows: 0 });
  expectCode(() => verifyGroupWebRewardDisciplineRuntimeTaskSources(task, sourceConflation), "GROUP_WEB_REWARD_DISCIPLINE_RUNTIME_SOURCE_DRIFT");

  const targetDrift = sources();
  targetDrift.readTarget = () => "";
  expectCode(() => verifyGroupWebRewardDisciplineRuntimeTaskSources(task, targetDrift), "GROUP_WEB_REWARD_DISCIPLINE_RUNTIME_MODERN_EVIDENCE_MISSING");
});

test("task preparation cannot inflate runtime coverage or hide unresolved work", () => {
  const mutations = [
    [candidate => { candidate.status = "pass"; }, "GROUP_WEB_REWARD_DISCIPLINE_RUNTIME_FALSE_COMPLETION"],
    [candidate => { candidate.runtimeEvidence.status = "observed"; }, "GROUP_WEB_REWARD_DISCIPLINE_RUNTIME_FALSE_COMPLETION"],
    [candidate => { candidate.coverageCredit.groupWebNavigableEntries.numerator = 2; }, "GROUP_WEB_REWARD_DISCIPLINE_RUNTIME_COVERAGE_INVALID"],
    [candidate => { candidate.compatibilityScoreContribution = 2; }, "GROUP_WEB_REWARD_DISCIPLINE_RUNTIME_FALSE_COMPLETION"],
    [candidate => { candidate.legacyFieldBindingPlan[0].disposition = "verified"; }, "GROUP_WEB_REWARD_DISCIPLINE_RUNTIME_FIELD_BINDINGS_INVALID"],
    [candidate => { candidate.legacyDataPresenceBoundary.crossSourceEmptyTable.maySubstituteForGroupWebRewardCount = true; }, "GROUP_WEB_REWARD_DISCIPLINE_RUNTIME_EMPTY_SOURCE_BOUNDARY_INVALID"],
    [candidate => { candidate.legacyWorkflowTask.runtimeStatus = "pass"; }, "GROUP_WEB_REWARD_DISCIPLINE_RUNTIME_WORKFLOW_FALSE_COMPLETION"],
    [candidate => { candidate.legacyReportLayout.status = "pass"; }, "GROUP_WEB_REWARD_DISCIPLINE_RUNTIME_REPORT_FALSE_COMPLETION"],
    [candidate => { candidate.crossSourceFieldBoundary.groupWebFieldCreditFromWindowsClient = 2; }, "GROUP_WEB_REWARD_DISCIPLINE_RUNTIME_DUAL_SOURCE_BOUNDARY_INVALID"],
    [candidate => { candidate.blockingGaps = candidate.blockingGaps.filter(code => code !== "GROUP_WEB_REWARD_DISCIPLINE_WEB_CORRECTION_APPEAL_AND_LINK_CONTROLS_NOT_IMPLEMENTED"); }, "GROUP_WEB_REWARD_DISCIPLINE_RUNTIME_IMPLEMENTATION_GAP_MISSING"],
    [candidate => { candidate.implementationGaps[2].implementationAction = []; }, "GROUP_WEB_REWARD_DISCIPLINE_RUNTIME_CATEGORY_VERSION_GAP_INVALID"],
    [candidate => { candidate.implementationGaps[3].implementationAction = []; }, "GROUP_WEB_REWARD_DISCIPLINE_RUNTIME_WEB_GAP_INVALID"],
  ];
  for (const [mutate, code] of mutations) {
    const candidate = structuredClone(task);
    mutate(candidate);
    expectCode(() => verifyGroupWebRewardDisciplineRuntimeTaskSources(candidate, sources()), code);
  }
});
