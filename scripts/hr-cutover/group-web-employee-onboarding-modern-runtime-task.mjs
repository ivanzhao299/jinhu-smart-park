import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { resolve, sep } from "node:path";

export class GroupWebEmployeeOnboardingRuntimeTaskError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "GroupWebEmployeeOnboardingRuntimeTaskError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new GroupWebEmployeeOnboardingRuntimeTaskError(code, detail); };
const sha = value => createHash("sha256").update(value).digest("hex");
const canonical = value => sha(`${JSON.stringify(value)}\n`);
const SOURCE_PATHS = Object.freeze([
  "scripts/hr-cutover/contracts/legacy-group-web-module-mapping-v1.json",
  "scripts/hr-cutover/contracts/legacy-group-web-source-audit-v1.json",
  "scripts/hr-cutover/contracts/yuzhou-onboarding-source-evidence-v1.json",
]);
const EXPECTED_COVERAGE = Object.freeze({
  groupWebNavigableEntries: { numerator: 0, denominator: 186 },
  legacyInteractionParity: { numerator: 0, denominator: 6 },
});
const EXPECTED_STATUSES = Object.freeze(["draft", "submitted", "returned", "approved", "cancelled", "confirmed"]);
const EXPECTED_ROLES = Object.freeze(["onboarding_reader", "onboarding_operator", "park_reviewer", "employment_confirmer", "no_onboarding_permission"]);

function assertTask(task) {
  if (task?.formatVersion !== 1
    || task.contractKind !== "yuzhou_hr_group_web_employee_onboarding_modern_runtime_task"
    || task.taskVersion !== "employee-onboarding-modern-runtime-1.0.0"
    || task.executionBoundary !== "isolated_lab_only") {
    fail("GROUP_WEB_ONBOARDING_RUNTIME_TASK_INVALID", "identity");
  }
  if (task.status !== "ready_not_executed"
    || task.runtimeEvidence?.status !== "not_observed"
    || task.compatibilityScoreContribution !== 0
    || task.productionImport !== "HOLD") {
    fail("GROUP_WEB_ONBOARDING_RUNTIME_FALSE_COMPLETION", "root");
  }
  if (JSON.stringify(task.coverageCredit) !== JSON.stringify(EXPECTED_COVERAGE)) {
    fail("GROUP_WEB_ONBOARDING_RUNTIME_COVERAGE_INVALID", "coverageCredit");
  }
  if (task.candidate?.id !== "GROUP-WEB-INTERACTION-34-EMPLOYEE-ONBOARDING"
    || task.candidate.legacyId !== 34
    || JSON.stringify(task.candidate.targetRoutes) !== JSON.stringify(["/hr/recruitment", "/hr/employees"])
    || task.candidate.currentStaticEvidence?.score !== 90
    || task.candidate.currentStaticEvidence?.implementationStatus !== "partial"
    || task.candidate.currentStaticEvidence?.dimensions?.targetTechnicalUat !== false
    || task.candidate.currentStaticEvidence?.dimensions?.legacyRuntimeUat !== false) {
    fail("GROUP_WEB_ONBOARDING_RUNTIME_CANDIDATE_INVALID", "candidate");
  }
  if (JSON.stringify(task.sourceContracts?.map(source => source.path)) !== JSON.stringify(SOURCE_PATHS)) {
    fail("GROUP_WEB_ONBOARDING_RUNTIME_SOURCE_SET_INVALID", "sourceContracts");
  }
  const slots = task.legacyOpaqueSlots;
  if (slots?.controlSlots?.length !== 15 || new Set(slots.controlSlots).size !== 15
    || slots?.requestKeySlots?.length !== 19 || new Set(slots.requestKeySlots).size !== 19
    || slots?.formActionSlots?.length !== 1
    || slots?.sourceColumnNamesClaimed !== false
    || slots?.status !== "identity_frozen_semantics_pending_authenticated_legacy_runtime_observation") {
    fail("GROUP_WEB_ONBOARDING_RUNTIME_SLOT_DENOMINATOR_INVALID", "legacyOpaqueSlots");
  }
  if (!Array.isArray(task.legacySemanticFields) || task.legacySemanticFields.length !== 8
    || new Set(task.legacySemanticFields.map(field => field.id)).size !== 8
    || task.legacySemanticFields.some(field => !field.legacyEvidenceRule
      || !Array.isArray(field.modernTargets) || field.modernTargets.length === 0
      || !/(?:requires|blocked|unresolved)/u.test(field.disposition)
      || /(?:verified|complete|pass)/iu.test(field.disposition))) {
    fail("GROUP_WEB_ONBOARDING_RUNTIME_FIELD_BINDINGS_INVALID", "legacySemanticFields");
  }
  if (task.legacyWorkflowRules?.runtimeStatus !== "not_observed"
    || task.legacyWorkflowRules?.requiredActionObservations?.length !== 10
    || task.legacyWorkflowRules?.requiredConditionObservations?.length !== 9) {
    fail("GROUP_WEB_ONBOARDING_RUNTIME_WORKFLOW_FALSE_COMPLETION", "legacyWorkflowRules");
  }
  if (task.legacyReportLayout?.status !== "not_observed"
    || task.legacyReportLayout?.requiredObservation?.length !== 8
    || task.legacyReportLayout?.notApplicableDecisionAllowedOnlyAfter !== "authenticated_legacy_runtime_observation") {
    fail("GROUP_WEB_ONBOARDING_RUNTIME_REPORT_FALSE_COMPLETION", "legacyReportLayout");
  }
  if (JSON.stringify(task.modernRuntimeContract?.statusVocabulary) !== JSON.stringify(EXPECTED_STATUSES)
    || task.modernRuntimeContract?.transitionMatrix?.length !== 6
    || JSON.stringify(task.modernRuntimeContract?.roleMatrix?.map(row => row.role)) !== JSON.stringify(EXPECTED_ROLES)
    || task.modernRuntimeContract?.roleMatrix?.[0]?.knownParityGap !== "legacy_department_scope_not_represented"
    || task.modernRuntimeContract?.apiTasks?.length !== 15
    || task.modernRuntimeContract?.browserTask?.viewports?.length !== 2
    || task.modernRuntimeContract?.browserTask?.checks?.length !== 5) {
    fail("GROUP_WEB_ONBOARDING_RUNTIME_MATRIX_INVALID", "modernRuntimeContract");
  }
  const evidence = task.runtimeEvidence;
  if (evidence.requiredLegacyControlBindings !== 15
    || evidence.requiredLegacyRequestKeyBindings !== 19
    || evidence.requiredLegacyFormActionBindings !== 1
    || evidence.requiredLegacyActionObservations !== 10
    || evidence.requiredLegacyConditionObservations !== 9
    || evidence.requiredLegacyReportLayoutDecision !== 1
    || evidence.requiredModernApiObservations !== 15
    || evidence.requiredModernBrowserObservations !== 10
    || evidence.requiredPairing !== "same_candidate_hash_bound_redacted_legacy_and_modern_observation_pair"
    || evidence.sensitiveScan !== "required_pass"
    || evidence.credentialsExcluded !== true
    || evidence.personalValuesExcluded !== true) {
    fail("GROUP_WEB_ONBOARDING_RUNTIME_EVIDENCE_GATE_INVALID", "runtimeEvidence");
  }
  if (!task.blockingGaps.includes("GROUP_WEB_ONBOARDING_DEPARTMENT_SCOPE_NOT_IMPLEMENTED")) {
    fail("GROUP_WEB_ONBOARDING_RUNTIME_SCOPE_GAP_MISSING", "blockingGaps");
  }
}

function verifySources(task, { moduleMapping, sourceAudit, onboardingEvidence, readTarget }) {
  assertTask(task);
  const sourceValues = [moduleMapping, sourceAudit, onboardingEvidence];
  for (let index = 0; index < SOURCE_PATHS.length; index += 1) {
    if (task.sourceContracts[index].canonicalSha256 !== canonical(sourceValues[index])) {
      fail("GROUP_WEB_ONBOARDING_RUNTIME_SOURCE_DRIFT", SOURCE_PATHS[index]);
    }
  }
  const module = moduleMapping.items?.find(item => item.legacyId === 34);
  if (!module || module.name !== task.candidate.name || module.legacyUrl !== task.candidate.legacyUrl
    || module.legacyTable !== task.candidate.legacyTable || module.legacyView !== task.candidate.legacyView
    || JSON.stringify(module.targetRoutes) !== JSON.stringify(task.candidate.targetRoutes)) {
    fail("GROUP_WEB_ONBOARDING_RUNTIME_MODULE_DRIFT", "legacyId=34");
  }
  const audit = sourceAudit.items?.find(item => item.legacyId === 34);
  for (const key of ["entryResolved", "traversedAspFiles", "forms", "controls", "requestKeys", "formActions", "selectStatements", "insertStatements", "updateStatements", "deleteStatements", "stateTransitions", "fieldEvidenceHash"]) {
    if (audit?.[key] !== task.legacyStaticContract[key]) fail("GROUP_WEB_ONBOARDING_RUNTIME_AUDIT_DRIFT", key);
  }
  if (onboardingEvidence.legacyId !== 34
    || onboardingEvidence.legacyFunction !== "员工入职"
    || onboardingEvidence.legacyTable !== task.candidate.legacyTable
    || JSON.stringify(onboardingEvidence.verifiedRules) !== JSON.stringify(task.legacyWorkflowRules.verifiedRules)
    || JSON.stringify(onboardingEvidence.modernizationDecisions) !== JSON.stringify(task.legacyWorkflowRules.modernizationDecisions)
    || onboardingEvidence.sourceFiles?.length !== 6
    || onboardingEvidence.personalValuesRecorded !== false
    || onboardingEvidence.credentialsRecorded !== false
    || onboardingEvidence.productionImport !== "HOLD") {
    fail("GROUP_WEB_ONBOARDING_RUNTIME_EVIDENCE_DRIFT", "legacyId=34");
  }
  for (const evidence of task.modernSourceEvidence) {
    const text = readTarget(evidence.path);
    for (const token of evidence.requiredTokens) {
      if (typeof text !== "string" || !text.includes(token)) {
        fail("GROUP_WEB_ONBOARDING_RUNTIME_MODERN_EVIDENCE_MISSING", evidence.path);
      }
    }
  }
  return {
    status: "READY_NOT_EXECUTED",
    candidateId: task.candidate.id,
    taskReadyIncrement: 1,
    runtimeCoverageIncrement: 0,
    proven: {
      sourceEntryIdentity: true,
      legacyControlSlots: 15,
      legacyRequestKeySlots: 19,
      legacyRuleSignals: task.legacyWorkflowRules.verifiedRules.length,
      modernSourceContracts: task.modernSourceEvidence.length,
      modernStatusTransitions: task.modernRuntimeContract.transitionMatrix.length,
      desktopAndPhoneTaskFrozen: true,
    },
    stillRequired: {
      legacyRuntimeControlBindings: 15,
      legacyRuntimeRequestKeyBindings: 19,
      legacyRuntimeActions: 10,
      legacyRuntimeConditions: 9,
      legacyReportLayoutDecision: 1,
      modernApiObservations: 15,
      modernBrowserObservations: 10,
      departmentScopeImplementation: true,
      legacyToModernPairedParity: true,
    },
    coverageCredit: task.coverageCredit,
    compatibilityScoreContribution: 0,
    productionImport: "HOLD",
  };
}

export function verifyGroupWebEmployeeOnboardingRuntimeTaskSources(task, sources) {
  return verifySources(task, sources);
}

export function verifyGroupWebEmployeeOnboardingRuntimeTask(root, task) {
  const canonicalRoot = realpathSync(root);
  const prefix = `${canonicalRoot}${sep}`;
  const loaded = [];
  for (const source of task.sourceContracts ?? []) {
    const path = resolve(canonicalRoot, source.path);
    const stat = lstatSync(path);
    const real = realpathSync(path);
    if (stat.isSymbolicLink() || !stat.isFile() || !real.startsWith(prefix)) {
      fail("GROUP_WEB_ONBOARDING_RUNTIME_SOURCE_PATH_INVALID", source.path);
    }
    const bytes = readFileSync(real);
    if (sha(bytes) !== source.rawSha256) fail("GROUP_WEB_ONBOARDING_RUNTIME_SOURCE_RAW_HASH_DRIFT", source.path);
    loaded.push(JSON.parse(bytes.toString("utf8")));
  }
  const readTarget = relativePath => {
    const path = resolve(canonicalRoot, relativePath);
    const stat = lstatSync(path);
    const real = realpathSync(path);
    if (stat.isSymbolicLink() || !stat.isFile() || !real.startsWith(prefix)) {
      fail("GROUP_WEB_ONBOARDING_RUNTIME_TARGET_PATH_INVALID", relativePath);
    }
    return readFileSync(real, "utf8");
  };
  return verifySources(task, {
    moduleMapping: loaded[0],
    sourceAudit: loaded[1],
    onboardingEvidence: loaded[2],
    readTarget,
  });
}
