import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { resolve, sep } from "node:path";

export class GroupWebEmployeeContractRuntimeTaskError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "GroupWebEmployeeContractRuntimeTaskError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new GroupWebEmployeeContractRuntimeTaskError(code, detail); };
const sha = value => createHash("sha256").update(value).digest("hex");
const canonical = value => sha(`${JSON.stringify(value)}\n`);
const SOURCE_PATHS = Object.freeze([
  "scripts/hr-cutover/contracts/legacy-group-web-module-mapping-v1.json",
  "scripts/hr-cutover/contracts/legacy-group-web-source-audit-v1.json",
  "scripts/hr-cutover/contracts/yuzhou-contract-source-evidence-v1.json",
]);
const EXPECTED_COVERAGE = Object.freeze({
  groupWebNavigableEntries: { numerator: 0, denominator: 186 },
  legacyInteractionParity: { numerator: 0, denominator: 6 },
});
const EXPECTED_STATUSES = Object.freeze(["draft", "active", "expired", "terminated", "cancelled", "needs_review"]);
const EXPECTED_ROLES = Object.freeze(["park_contract_reader", "team_contract_reader", "self_contract_reader", "contract_operator", "salary_authorized_operator", "document_authorized_operator", "no_contract_permission"]);
const REQUIRED_GAPS = Object.freeze([
  "GROUP_WEB_EMPLOYEE_CONTRACT_LEGACY_DELETE_CANCEL_EQUIVALENCE_NOT_OBSERVED",
  "GROUP_WEB_EMPLOYEE_CONTRACT_ATTACHMENT_LINK_NOT_EXECUTED",
]);

function assertTask(task) {
  if (task?.formatVersion !== 1
    || task.contractKind !== "yuzhou_hr_group_web_employee_contract_modern_runtime_task"
    || task.taskVersion !== "employee-contract-modern-runtime-1.0.0"
    || task.executionBoundary !== "isolated_lab_only") {
    fail("GROUP_WEB_EMPLOYEE_CONTRACT_RUNTIME_TASK_INVALID", "identity");
  }
  if (task.status !== "ready_not_executed"
    || task.runtimeEvidence?.status !== "not_observed"
    || task.compatibilityScoreContribution !== 0
    || task.productionImport !== "HOLD") {
    fail("GROUP_WEB_EMPLOYEE_CONTRACT_RUNTIME_FALSE_COMPLETION", "root");
  }
  if (JSON.stringify(task.coverageCredit) !== JSON.stringify(EXPECTED_COVERAGE)) {
    fail("GROUP_WEB_EMPLOYEE_CONTRACT_RUNTIME_COVERAGE_INVALID", "coverageCredit");
  }
  if (task.candidate?.id !== "GROUP-WEB-INTERACTION-37-EMPLOYEE-CONTRACT"
    || task.candidate.legacyId !== 37
    || JSON.stringify(task.candidate.targetRoutes) !== JSON.stringify(["/hr/contracts"])
    || task.candidate.currentStaticEvidence?.score !== 90
    || task.candidate.currentStaticEvidence?.implementationStatus !== "partial"
    || task.candidate.currentStaticEvidence?.dimensions?.targetTechnicalUat !== false
    || task.candidate.currentStaticEvidence?.dimensions?.legacyRuntimeUat !== false) {
    fail("GROUP_WEB_EMPLOYEE_CONTRACT_RUNTIME_CANDIDATE_INVALID", "candidate");
  }
  if (JSON.stringify(task.sourceContracts?.map(source => source.path)) !== JSON.stringify(SOURCE_PATHS)) {
    fail("GROUP_WEB_EMPLOYEE_CONTRACT_RUNTIME_SOURCE_SET_INVALID", "sourceContracts");
  }
  const slots = task.legacyOpaqueSlots;
  if (slots?.controlSlots?.length !== 82 || new Set(slots.controlSlots).size !== 82
    || slots?.requestKeySlots?.length !== 21 || new Set(slots.requestKeySlots).size !== 21
    || slots?.formActionSlots?.length !== 1
    || slots?.sourceColumnNamesClaimed !== false
    || slots?.status !== "identity_frozen_semantics_pending_authenticated_legacy_runtime_observation") {
    fail("GROUP_WEB_EMPLOYEE_CONTRACT_RUNTIME_SLOT_DENOMINATOR_INVALID", "legacyOpaqueSlots");
  }
  if (!Array.isArray(task.legacySemanticFields) || task.legacySemanticFields.length !== 18
    || new Set(task.legacySemanticFields.map(field => field.id)).size !== 18
    || task.legacySemanticFields.some(field => !field.legacyEvidenceRule
      || !Array.isArray(field.modernTargets) || field.modernTargets.length === 0
      || !/(?:requires|blocked|unresolved)/u.test(field.disposition)
      || /(?:verified|complete|pass)/iu.test(field.disposition))) {
    fail("GROUP_WEB_EMPLOYEE_CONTRACT_RUNTIME_FIELD_BINDINGS_INVALID", "legacySemanticFields");
  }
  if (task.legacyWorkflowRules?.runtimeStatus !== "not_observed"
    || task.legacyWorkflowRules?.requiredActionObservations?.length !== 9
    || task.legacyWorkflowRules?.requiredConditionObservations?.length !== 10) {
    fail("GROUP_WEB_EMPLOYEE_CONTRACT_RUNTIME_WORKFLOW_FALSE_COMPLETION", "legacyWorkflowRules");
  }
  if (task.legacyReportLayout?.status !== "not_observed"
    || task.legacyReportLayout?.requiredObservation?.length !== 9
    || task.legacyReportLayout?.notApplicableDecisionAllowedOnlyAfter !== "authenticated_legacy_runtime_observation") {
    fail("GROUP_WEB_EMPLOYEE_CONTRACT_RUNTIME_REPORT_FALSE_COMPLETION", "legacyReportLayout");
  }
  const modern = task.modernRuntimeContract;
  if (JSON.stringify(modern?.statusVocabulary) !== JSON.stringify(EXPECTED_STATUSES)
    || modern?.contractTransitionMatrix?.length !== 3
    || modern?.changeTransitionMatrix?.length !== 5
    || JSON.stringify(modern?.roleMatrix?.map(row => row.role)) !== JSON.stringify(EXPECTED_ROLES)
    || modern?.apiTasks?.length !== 20
    || modern?.browserTask?.viewports?.length !== 2
    || modern?.browserTask?.checks?.length !== 7) {
    fail("GROUP_WEB_EMPLOYEE_CONTRACT_RUNTIME_MATRIX_INVALID", "modernRuntimeContract");
  }
  const evidence = task.runtimeEvidence;
  if (evidence.requiredLegacyControlBindings !== 82
    || evidence.requiredLegacyRequestKeyBindings !== 21
    || evidence.requiredLegacyFormActionBindings !== 1
    || evidence.requiredLegacyActionObservations !== 9
    || evidence.requiredLegacyConditionObservations !== 10
    || evidence.requiredLegacyReportLayoutDecision !== 1
    || evidence.requiredModernApiObservations !== 20
    || evidence.requiredModernBrowserObservations !== 14
    || evidence.requiredPairing !== "same_candidate_hash_bound_redacted_legacy_and_modern_observation_pair"
    || evidence.sensitiveScan !== "required_pass"
    || evidence.credentialsExcluded !== true
    || evidence.personalValuesExcluded !== true
    || evidence.salaryValuesExcluded !== true
    || evidence.attachmentBinariesExcluded !== true) {
    fail("GROUP_WEB_EMPLOYEE_CONTRACT_RUNTIME_EVIDENCE_GATE_INVALID", "runtimeEvidence");
  }
  for (const gap of REQUIRED_GAPS) {
    if (!task.blockingGaps?.includes(gap) || !task.implementationGaps?.some(item => item.id === gap)) {
      fail("GROUP_WEB_EMPLOYEE_CONTRACT_RUNTIME_IMPLEMENTATION_GAP_MISSING", gap);
    }
  }
  const deleteGap = task.implementationGaps.find(item => item.id === REQUIRED_GAPS[0]);
  if (!deleteGap?.implementationAction?.includes("if_legacy_non_draft_delete_exists_add_an_audited_correction_or_termination_path_instead_of_physical_delete")
    || !deleteGap?.acceptance?.includes("no_physical_delete")) {
    fail("GROUP_WEB_EMPLOYEE_CONTRACT_RUNTIME_DELETE_GAP_INVALID", "implementationGaps");
  }
}

function verifySources(task, { moduleMapping, sourceAudit, contractEvidence, readTarget }) {
  assertTask(task);
  const sourceValues = [moduleMapping, sourceAudit, contractEvidence];
  for (let index = 0; index < SOURCE_PATHS.length; index += 1) {
    if (task.sourceContracts[index].canonicalSha256 !== canonical(sourceValues[index])) {
      fail("GROUP_WEB_EMPLOYEE_CONTRACT_RUNTIME_SOURCE_DRIFT", SOURCE_PATHS[index]);
    }
  }
  const module = moduleMapping.items?.find(item => item.legacyId === 37);
  if (!module || module.name !== task.candidate.name || module.legacyUrl !== task.candidate.legacyUrl
    || module.legacyTable !== task.candidate.legacyTable || module.legacyView !== task.candidate.legacyView
    || JSON.stringify(module.targetRoutes) !== JSON.stringify(task.candidate.targetRoutes)) {
    fail("GROUP_WEB_EMPLOYEE_CONTRACT_RUNTIME_MODULE_DRIFT", "legacyId=37");
  }
  const audit = sourceAudit.items?.find(item => item.legacyId === 37);
  for (const key of ["entryResolved", "traversedAspFiles", "forms", "controls", "requestKeys", "formActions", "selectStatements", "insertStatements", "updateStatements", "deleteStatements", "stateTransitions", "fieldEvidenceHash"]) {
    if (audit?.[key] !== task.legacyStaticContract[key]) fail("GROUP_WEB_EMPLOYEE_CONTRACT_RUNTIME_AUDIT_DRIFT", key);
  }
  if (contractEvidence.legacyId !== 37
    || contractEvidence.legacyFieldEvidenceHash !== task.legacyStaticContract.fieldEvidenceHash
    || JSON.stringify(contractEvidence.legacyRules) !== JSON.stringify(task.legacyWorkflowRules.verifiedRules)
    || contractEvidence.sourceFiles?.length !== 12
    || contractEvidence.operationMode !== "read_only"
    || contractEvidence.personalValuesRecorded !== false
    || contractEvidence.credentialsRecorded !== false
    || contractEvidence.targetControls?.productionImport !== "HOLD") {
    fail("GROUP_WEB_EMPLOYEE_CONTRACT_RUNTIME_EVIDENCE_DRIFT", "legacyId=37");
  }
  for (const evidence of task.modernSourceEvidence) {
    const text = readTarget(evidence.path);
    for (const token of evidence.requiredTokens) {
      if (typeof text !== "string" || !text.includes(token)) {
        fail("GROUP_WEB_EMPLOYEE_CONTRACT_RUNTIME_MODERN_EVIDENCE_MISSING", evidence.path);
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
      legacyControlSlots: 82,
      legacyRequestKeySlots: 21,
      legacySemanticGroups: task.legacySemanticFields.length,
      modernSourceContracts: task.modernSourceEvidence.length,
      modernContractTransitions: task.modernRuntimeContract.contractTransitionMatrix.length,
      modernChangeTransitions: task.modernRuntimeContract.changeTransitionMatrix.length,
      parkTeamSelfRolesFrozen: true,
      desktopAndPhoneTaskFrozen: true,
    },
    stillRequired: {
      legacyRuntimeControlBindings: 82,
      legacyRuntimeRequestKeyBindings: 21,
      legacyRuntimeActions: 9,
      legacyRuntimeConditions: 10,
      legacyReportLayoutDecision: 1,
      modernApiObservations: 20,
      modernBrowserObservations: 14,
      legacyDeleteCancelEquivalence: true,
      authorizedAttachmentManifestAndRuntime: true,
      legacyToModernPairedParity: true,
    },
    implementationGaps: task.implementationGaps.map(gap => gap.id),
    coverageCredit: task.coverageCredit,
    compatibilityScoreContribution: 0,
    productionImport: "HOLD",
  };
}

export function verifyGroupWebEmployeeContractRuntimeTaskSources(task, sources) {
  return verifySources(task, sources);
}

export function verifyGroupWebEmployeeContractRuntimeTask(root, task) {
  const canonicalRoot = realpathSync(root);
  const prefix = `${canonicalRoot}${sep}`;
  const loaded = [];
  for (const source of task.sourceContracts ?? []) {
    const path = resolve(canonicalRoot, source.path);
    const stat = lstatSync(path);
    const real = realpathSync(path);
    if (stat.isSymbolicLink() || !stat.isFile() || !real.startsWith(prefix)) {
      fail("GROUP_WEB_EMPLOYEE_CONTRACT_RUNTIME_SOURCE_PATH_INVALID", source.path);
    }
    const bytes = readFileSync(real);
    if (sha(bytes) !== source.rawSha256) fail("GROUP_WEB_EMPLOYEE_CONTRACT_RUNTIME_SOURCE_RAW_HASH_DRIFT", source.path);
    loaded.push(JSON.parse(bytes.toString("utf8")));
  }
  const readTarget = relativePath => {
    const path = resolve(canonicalRoot, relativePath);
    const stat = lstatSync(path);
    const real = realpathSync(path);
    if (stat.isSymbolicLink() || !stat.isFile() || !real.startsWith(prefix)) {
      fail("GROUP_WEB_EMPLOYEE_CONTRACT_RUNTIME_TARGET_PATH_INVALID", relativePath);
    }
    return readFileSync(real, "utf8");
  };
  return verifySources(task, {
    moduleMapping: loaded[0],
    sourceAudit: loaded[1],
    contractEvidence: loaded[2],
    readTarget,
  });
}
