/* global structuredClone */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { assessLegacyGroupWebImplementationCoverage } from "../hr-cutover/legacy-group-web-implementation-coverage-lib.mjs";
import {
  GroupWebEmployeeContractRuntimeTaskError,
  verifyGroupWebEmployeeContractRuntimeTask,
  verifyGroupWebEmployeeContractRuntimeTaskSources,
} from "../hr-cutover/group-web-employee-contract-modern-runtime-task.mjs";

const root = resolve(import.meta.dirname, "../..");
const json = path => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const task = json("scripts/hr-cutover/contracts/group-web-employee-contract-modern-runtime-task-v1.json");
const sources = () => ({
  moduleMapping: json(task.sourceContracts[0].path),
  sourceAudit: json(task.sourceContracts[1].path),
  contractEvidence: json(task.sourceContracts[2].path),
  readTarget: path => readFileSync(resolve(root, path), "utf8"),
});
const expectCode = (action, code) => assert.throws(
  action,
  error => error instanceof GroupWebEmployeeContractRuntimeTaskError && error.code === code,
);

test("Group Web employee contract freezes one runtime task without claiming execution", () => {
  const report = verifyGroupWebEmployeeContractRuntimeTask(root, task);
  assert.equal(report.status, "READY_NOT_EXECUTED");
  assert.equal(report.candidateId, "GROUP-WEB-INTERACTION-37-EMPLOYEE-CONTRACT");
  assert.equal(report.taskReadyIncrement, 1);
  assert.equal(report.runtimeCoverageIncrement, 0);
  assert.equal(report.stillRequired.legacyDeleteCancelEquivalence, true);
  assert.equal(report.stillRequired.authorizedAttachmentManifestAndRuntime, true);
  assert.deepEqual(report.coverageCredit, {
    groupWebNavigableEntries: { numerator: 0, denominator: 186 },
    legacyInteractionParity: { numerator: 0, denominator: 6 },
  });
  assert.equal(report.compatibilityScoreContribution, 0);
  assert.equal(report.productionImport, "HOLD");
});

test("the selected employee contract entry remains score-90 partial in the shared model", () => {
  const coverage = assessLegacyGroupWebImplementationCoverage(json(task.sourceContracts[0].path), root);
  const selected = coverage.items.find(item => item.legacyId === 37);
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

test("all contract source slots and semantic groups stay in the runtime denominator", () => {
  assert.equal(task.legacyOpaqueSlots.controlSlots.length, 82);
  assert.equal(new Set(task.legacyOpaqueSlots.controlSlots).size, 82);
  assert.equal(task.legacyOpaqueSlots.requestKeySlots.length, 21);
  assert.equal(new Set(task.legacyOpaqueSlots.requestKeySlots).size, 21);
  assert.equal(task.legacyOpaqueSlots.formActionSlots.length, 1);
  assert.equal(task.legacyOpaqueSlots.sourceColumnNamesClaimed, false);
  assert.equal(task.legacySemanticFields.length, 18);
  assert.ok(task.legacySemanticFields.every(field => /(?:requires|blocked|unresolved)/u.test(field.disposition)));
});

test("contract states actions roles and desktop plus phone observations are frozen", () => {
  assert.deepEqual(task.modernRuntimeContract.statusVocabulary, ["draft", "active", "expired", "terminated", "cancelled", "needs_review"]);
  assert.deepEqual(task.modernRuntimeContract.contractTransitionMatrix.map(row => row.action), ["activate", "cancel", "terminate_via_change"]);
  assert.deepEqual(task.modernRuntimeContract.changeTransitionMatrix.map(row => row.action), ["apply_renewal", "apply_amendment", "apply_correction", "apply_termination", "cancel_change"]);
  assert.deepEqual(task.modernRuntimeContract.roleMatrix.map(row => row.role), ["park_contract_reader", "team_contract_reader", "self_contract_reader", "contract_operator", "salary_authorized_operator", "document_authorized_operator", "no_contract_permission"]);
  assert.equal(task.modernRuntimeContract.apiTasks.length, 20);
  assert.deepEqual(task.modernRuntimeContract.browserTask.viewports.map(viewport => viewport.width), [1440, 390]);
  assert.equal(task.runtimeEvidence.requiredModernBrowserObservations, 14);
});

test("legacy delete to modern audited cancel is an executable gap rather than assumed parity", () => {
  const gap = task.implementationGaps.find(item => item.id === "GROUP_WEB_EMPLOYEE_CONTRACT_LEGACY_DELETE_CANCEL_EQUIVALENCE_NOT_OBSERVED");
  assert.ok(gap);
  assert.ok(gap.missingEvidence.includes("legacy_delete_allowed_statuses"));
  assert.ok(gap.implementationAction.includes("observe_employee_contract_delete_with_an_authenticated_non_personal_test_record"));
  assert.ok(gap.implementationAction.includes("if_legacy_non_draft_delete_exists_add_an_audited_correction_or_termination_path_instead_of_physical_delete"));
  assert.ok(gap.acceptance.includes("no_physical_delete"));
  const apiGap = task.modernRuntimeContract.apiTasks.find(item => item.id === "legacy_delete_cancel_equivalence");
  assert.equal(apiGap?.expectedStatus, "blocked_until_legacy_delete_preconditions_and_effects_observed");
  assert.ok(apiGap?.assertions.includes("do_not_claim_action_equivalence"));
});

test("park team self salary and attachment boundaries remain explicit", () => {
  const roles = new Map(task.modernRuntimeContract.roleMatrix.map(row => [row.role, row]));
  assert.ok(roles.get("team_contract_reader")?.expectedCapabilities.includes("outside_team_absent"));
  assert.ok(roles.get("self_contract_reader")?.expectedCapabilities.includes("other_employee_absent"));
  assert.ok(roles.get("contract_operator")?.expectedCapabilities.includes("salary_write_denied_without_compensation_manage"));
  assert.ok(task.blockingGaps.includes("GROUP_WEB_EMPLOYEE_CONTRACT_ATTACHMENT_LINK_NOT_EXECUTED"));
  assert.equal(task.runtimeEvidence.salaryValuesExcluded, true);
  assert.equal(task.runtimeEvidence.attachmentBinariesExcluded, true);
});

test("source identity, legacy rules and modern source tokens fail closed on drift", () => {
  const moduleDrift = sources();
  moduleDrift.moduleMapping.items.find(item => item.legacyId === 37).legacyUrl = "invented.asp";
  expectCode(() => verifyGroupWebEmployeeContractRuntimeTaskSources(task, moduleDrift), "GROUP_WEB_EMPLOYEE_CONTRACT_RUNTIME_SOURCE_DRIFT");

  const ruleDrift = sources();
  ruleDrift.contractEvidence.legacyRules.dates.pop();
  expectCode(() => verifyGroupWebEmployeeContractRuntimeTaskSources(task, ruleDrift), "GROUP_WEB_EMPLOYEE_CONTRACT_RUNTIME_SOURCE_DRIFT");

  const targetDrift = sources();
  targetDrift.readTarget = () => "";
  expectCode(() => verifyGroupWebEmployeeContractRuntimeTaskSources(task, targetDrift), "GROUP_WEB_EMPLOYEE_CONTRACT_RUNTIME_MODERN_EVIDENCE_MISSING");
});

test("task cards cannot inflate contract runtime coverage or hide unresolved gaps", () => {
  const mutations = [
    [candidate => { candidate.status = "pass"; }, "GROUP_WEB_EMPLOYEE_CONTRACT_RUNTIME_FALSE_COMPLETION"],
    [candidate => { candidate.runtimeEvidence.status = "observed"; }, "GROUP_WEB_EMPLOYEE_CONTRACT_RUNTIME_FALSE_COMPLETION"],
    [candidate => { candidate.coverageCredit.groupWebNavigableEntries.numerator = 1; }, "GROUP_WEB_EMPLOYEE_CONTRACT_RUNTIME_COVERAGE_INVALID"],
    [candidate => { candidate.compatibilityScoreContribution = 1; }, "GROUP_WEB_EMPLOYEE_CONTRACT_RUNTIME_FALSE_COMPLETION"],
    [candidate => { candidate.legacySemanticFields[0].disposition = "verified"; }, "GROUP_WEB_EMPLOYEE_CONTRACT_RUNTIME_FIELD_BINDINGS_INVALID"],
    [candidate => { candidate.legacyWorkflowRules.runtimeStatus = "pass"; }, "GROUP_WEB_EMPLOYEE_CONTRACT_RUNTIME_WORKFLOW_FALSE_COMPLETION"],
    [candidate => { candidate.legacyReportLayout.status = "pass"; }, "GROUP_WEB_EMPLOYEE_CONTRACT_RUNTIME_REPORT_FALSE_COMPLETION"],
    [candidate => { candidate.blockingGaps = candidate.blockingGaps.filter(code => code !== "GROUP_WEB_EMPLOYEE_CONTRACT_LEGACY_DELETE_CANCEL_EQUIVALENCE_NOT_OBSERVED"); }, "GROUP_WEB_EMPLOYEE_CONTRACT_RUNTIME_IMPLEMENTATION_GAP_MISSING"],
    [candidate => { candidate.implementationGaps[0].implementationAction = []; }, "GROUP_WEB_EMPLOYEE_CONTRACT_RUNTIME_DELETE_GAP_INVALID"],
  ];
  for (const [mutate, code] of mutations) {
    const candidate = structuredClone(task);
    mutate(candidate);
    expectCode(() => verifyGroupWebEmployeeContractRuntimeTaskSources(candidate, sources()), code);
  }
});
