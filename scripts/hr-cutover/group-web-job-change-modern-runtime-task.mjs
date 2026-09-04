import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { resolve, sep } from "node:path";

export class GroupWebJobChangeRuntimeTaskError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "GroupWebJobChangeRuntimeTaskError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new GroupWebJobChangeRuntimeTaskError(code, detail); };
const sha = value => createHash("sha256").update(value).digest("hex");
const canonical = value => sha(`${JSON.stringify(value)}\n`);
const SOURCE_PATHS = Object.freeze([
  "scripts/hr-cutover/contracts/legacy-group-web-module-mapping-v1.json",
  "scripts/hr-cutover/contracts/legacy-group-web-source-audit-v1.json",
  "scripts/hr-cutover/contracts/yuzhou-job-change-dual-source-evidence-v1.json",
]);
const EXPECTED_COVERAGE = Object.freeze({
  groupWebNavigableEntries: { numerator: 0, denominator: 186 },
  legacyInteractionParity: { numerator: 0, denominator: 6 },
});
const EXPECTED_STATUSES = Object.freeze(["draft", "submitted", "returned", "approved", "cancelled", "applied"]);
const EXPECTED_ROLES = Object.freeze(["park_job_change_reader", "team_job_change_reader", "self_job_change_reader", "team_job_change_operator", "job_change_reviewer", "job_change_applier", "no_job_change_permission"]);
const REQUIRED_GAPS = Object.freeze([
  "GROUP_WEB_JOB_CHANGE_DEPARTMENT_RANGE_TREE_EQUIVALENCE_NOT_OBSERVED",
  "GROUP_WEB_JOB_CHANGE_COMPENSATION_COLUMNS_REQUIRE_SEPARATE_MAPPING",
]);

function assertTask(task) {
  if (task?.formatVersion !== 1
    || task.contractKind !== "yuzhou_hr_group_web_job_change_modern_runtime_task"
    || task.taskVersion !== "job-change-modern-runtime-1.0.0"
    || task.executionBoundary !== "isolated_lab_only") {
    fail("GROUP_WEB_JOB_CHANGE_RUNTIME_TASK_INVALID", "identity");
  }
  if (task.status !== "ready_not_executed"
    || task.runtimeEvidence?.status !== "not_observed"
    || task.compatibilityScoreContribution !== 0
    || task.productionImport !== "HOLD") {
    fail("GROUP_WEB_JOB_CHANGE_RUNTIME_FALSE_COMPLETION", "root");
  }
  if (JSON.stringify(task.coverageCredit) !== JSON.stringify(EXPECTED_COVERAGE)) {
    fail("GROUP_WEB_JOB_CHANGE_RUNTIME_COVERAGE_INVALID", "coverageCredit");
  }
  if (task.candidate?.id !== "GROUP-WEB-INTERACTION-39-JOB-CHANGE"
    || task.candidate.legacyId !== 39
    || JSON.stringify(task.candidate.targetRoutes) !== JSON.stringify(["/hr/lifecycle"])
    || task.candidate.currentStaticEvidence?.score !== 90
    || task.candidate.currentStaticEvidence?.implementationStatus !== "partial"
    || task.candidate.currentStaticEvidence?.dimensions?.targetTechnicalUat !== false
    || task.candidate.currentStaticEvidence?.dimensions?.legacyRuntimeUat !== false) {
    fail("GROUP_WEB_JOB_CHANGE_RUNTIME_CANDIDATE_INVALID", "candidate");
  }
  if (JSON.stringify(task.sourceContracts?.map(source => source.path)) !== JSON.stringify(SOURCE_PATHS)) {
    fail("GROUP_WEB_JOB_CHANGE_RUNTIME_SOURCE_SET_INVALID", "sourceContracts");
  }
  const slots = task.legacyOpaqueSlots;
  if (slots?.controlSlots?.length !== 14 || new Set(slots.controlSlots).size !== 14
    || slots?.requestKeySlots?.length !== 20 || new Set(slots.requestKeySlots).size !== 20
    || slots?.formActionSlots?.length !== 1
    || slots?.sourceColumnNamesClaimed !== false
    || slots?.status !== "identity_frozen_semantics_pending_authenticated_legacy_runtime_observation") {
    fail("GROUP_WEB_JOB_CHANGE_RUNTIME_SLOT_DENOMINATOR_INVALID", "legacyOpaqueSlots");
  }
  if (!Array.isArray(task.legacySemanticFields) || task.legacySemanticFields.length !== 10
    || new Set(task.legacySemanticFields.map(field => field.id)).size !== 10
    || task.legacySemanticFields.some(field => !field.legacyEvidenceField
      || !Array.isArray(field.modernTargets) || field.modernTargets.length === 0
      || !/(?:requires|blocked|unresolved)/u.test(field.disposition)
      || /(?:verified|complete|pass)/iu.test(field.disposition))) {
    fail("GROUP_WEB_JOB_CHANGE_RUNTIME_FIELD_BINDINGS_INVALID", "legacySemanticFields");
  }
  const ledger = task.legacyDualSourceLedger;
  if (ledger?.table !== "readjust" || ledger.columnCount !== 32 || ledger.columns?.length !== 32
    || new Set(ledger.columns).size !== 32 || ledger.runtimeStatus !== "not_observed"
    || ledger.compensationColumns?.length !== 8
    || ledger.compensationDisposition !== "blocked_from_job_change_write_path_requires_separate_compensation_change_mapping") {
    fail("GROUP_WEB_JOB_CHANGE_RUNTIME_LEDGER_INVALID", "legacyDualSourceLedger");
  }
  if (task.legacyWorkflowRules?.runtimeStatus !== "not_observed"
    || task.legacyWorkflowRules?.requiredActionObservations?.length !== 12
    || task.legacyWorkflowRules?.requiredConditionObservations?.length !== 10) {
    fail("GROUP_WEB_JOB_CHANGE_RUNTIME_WORKFLOW_FALSE_COMPLETION", "legacyWorkflowRules");
  }
  if (task.legacyReportLayout?.status !== "not_observed"
    || task.legacyReportLayout?.requiredObservation?.length !== 10
    || task.legacyReportLayout?.notApplicableDecisionAllowedOnlyAfter !== "authenticated_legacy_runtime_observation") {
    fail("GROUP_WEB_JOB_CHANGE_RUNTIME_REPORT_FALSE_COMPLETION", "legacyReportLayout");
  }
  const modern = task.modernRuntimeContract;
  if (JSON.stringify(modern?.statusVocabulary) !== JSON.stringify(EXPECTED_STATUSES)
    || modern?.transitionMatrix?.length !== 6
    || JSON.stringify(modern?.roleMatrix?.map(row => row.role)) !== JSON.stringify(EXPECTED_ROLES)
    || modern?.roleMatrix?.[1]?.knownParityGap !== "legacy_department_range_semantics_not_runtime_bound"
    || modern?.apiTasks?.length !== 20
    || modern?.browserTask?.viewports?.length !== 2
    || modern?.browserTask?.checks?.length !== 7) {
    fail("GROUP_WEB_JOB_CHANGE_RUNTIME_MATRIX_INVALID", "modernRuntimeContract");
  }
  const evidence = task.runtimeEvidence;
  if (evidence.requiredLegacyControlBindings !== 14
    || evidence.requiredLegacyRequestKeyBindings !== 20
    || evidence.requiredLegacyFormActionBindings !== 1
    || evidence.requiredLegacyActionObservations !== 12
    || evidence.requiredLegacyConditionObservations !== 10
    || evidence.requiredLegacyReportLayoutDecision !== 1
    || evidence.requiredDesktopLedgerColumnBindings !== 32
    || evidence.requiredModernApiObservations !== 20
    || evidence.requiredModernBrowserObservations !== 14
    || evidence.requiredPairing !== "same_candidate_hash_bound_redacted_legacy_and_modern_observation_pair"
    || evidence.sensitiveScan !== "required_pass"
    || evidence.credentialsExcluded !== true
    || evidence.personalValuesExcluded !== true
    || evidence.compensationValuesExcluded !== true) {
    fail("GROUP_WEB_JOB_CHANGE_RUNTIME_EVIDENCE_GATE_INVALID", "runtimeEvidence");
  }
  for (const gap of REQUIRED_GAPS) {
    if (!task.blockingGaps?.includes(gap) || !task.implementationGaps?.some(item => item.id === gap)) {
      fail("GROUP_WEB_JOB_CHANGE_RUNTIME_IMPLEMENTATION_GAP_MISSING", gap);
    }
  }
  const scopeGap = task.implementationGaps.find(item => item.id === REQUIRED_GAPS[0]);
  if (!scopeGap?.implementationAction?.includes("create_non_personal_parent_child_and_sibling_department_records")
    || !scopeGap?.implementationAction?.includes("if_legacy_direct_only_scope_is_required_add_an_exact_direct_team_scope_instead_of_claiming_tree_equivalence")
    || !scopeGap?.acceptance?.includes("no_out_of_scope_row_or_count_disclosure")) {
    fail("GROUP_WEB_JOB_CHANGE_RUNTIME_SCOPE_GAP_INVALID", "implementationGaps");
  }
}

function verifySources(task, { moduleMapping, sourceAudit, jobChangeEvidence, readTarget }) {
  assertTask(task);
  const sourceValues = [moduleMapping, sourceAudit, jobChangeEvidence];
  for (let index = 0; index < SOURCE_PATHS.length; index += 1) {
    if (task.sourceContracts[index].canonicalSha256 !== canonical(sourceValues[index])) {
      fail("GROUP_WEB_JOB_CHANGE_RUNTIME_SOURCE_DRIFT", SOURCE_PATHS[index]);
    }
  }
  const module = moduleMapping.items?.find(item => item.legacyId === 39);
  if (!module || module.name !== task.candidate.name || module.legacyUrl !== task.candidate.legacyUrl
    || module.legacyTable !== task.candidate.legacyTable || module.legacyView !== task.candidate.legacyView
    || JSON.stringify(module.targetRoutes) !== JSON.stringify(task.candidate.targetRoutes)) {
    fail("GROUP_WEB_JOB_CHANGE_RUNTIME_MODULE_DRIFT", "legacyId=39");
  }
  const audit = sourceAudit.items?.find(item => item.legacyId === 39);
  for (const key of ["entryResolved", "traversedAspFiles", "forms", "controls", "requestKeys", "formActions", "selectStatements", "insertStatements", "updateStatements", "deleteStatements", "stateTransitions", "fieldEvidenceHash"]) {
    if (audit?.[key] !== task.legacyStaticContract[key]) fail("GROUP_WEB_JOB_CHANGE_RUNTIME_AUDIT_DRIFT", key);
  }
  const group = jobChangeEvidence.groupWeb;
  const desktop = jobChangeEvidence.desktopClient;
  if (jobChangeEvidence.legacyId !== 39
    || jobChangeEvidence.legacyFieldEvidenceHash !== task.legacyStaticContract.fieldEvidenceHash
    || group?.sourceFiles?.length !== 10
    || JSON.stringify(group.applicationFields) !== JSON.stringify(task.legacyWorkflowRules.applicationFields)
    || JSON.stringify(group.approvalResults) !== JSON.stringify(task.legacyWorkflowRules.approvalResults)
    || JSON.stringify(group.applyGate) !== JSON.stringify(task.legacyWorkflowRules.applyGate)
    || JSON.stringify(group.applyEffects) !== JSON.stringify(task.legacyWorkflowRules.applyEffects)
    || group.visibility !== task.legacyWorkflowRules.visibility
    || group.legacyRecycle !== task.legacyWorkflowRules.legacyRecycle
    || desktop.tableArtifactSha256 !== task.legacyDualSourceLedger.tableArtifactSha256
    || JSON.stringify(desktop.columns) !== JSON.stringify(task.legacyDualSourceLedger.columns)
    || desktop.numberRule !== task.legacyDualSourceLedger.numberRule
    || JSON.stringify(desktop.unifiedLedgerTypes) !== JSON.stringify(task.legacyDualSourceLedger.unifiedLedgerTypes)
    || jobChangeEvidence.operationMode !== "read_only"
    || jobChangeEvidence.personalValuesRecorded !== false
    || jobChangeEvidence.credentialsRecorded !== false
    || jobChangeEvidence.targetControls?.productionImport !== "HOLD") {
    fail("GROUP_WEB_JOB_CHANGE_RUNTIME_EVIDENCE_DRIFT", "legacyId=39");
  }
  for (const evidence of task.modernSourceEvidence) {
    const text = readTarget(evidence.path);
    for (const token of evidence.requiredTokens) {
      if (typeof text !== "string" || !text.includes(token)) {
        fail("GROUP_WEB_JOB_CHANGE_RUNTIME_MODERN_EVIDENCE_MISSING", evidence.path);
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
      legacyControlSlots: 14,
      legacyRequestKeySlots: 20,
      legacySemanticFields: 10,
      dualSourceLedgerColumns: 32,
      modernSourceContracts: task.modernSourceEvidence.length,
      modernTransitions: task.modernRuntimeContract.transitionMatrix.length,
      parkTreeSelfRolesFrozen: true,
      desktopAndPhoneTaskFrozen: true,
    },
    stillRequired: {
      legacyRuntimeControlBindings: 14,
      legacyRuntimeRequestKeyBindings: 20,
      legacyRuntimeActions: 12,
      legacyRuntimeConditions: 10,
      legacyReportLayoutDecision: 1,
      desktopLedgerColumnBindings: 32,
      modernApiObservations: 20,
      modernBrowserObservations: 14,
      departmentRangeTreeEquivalence: true,
      compensationColumnMapping: true,
      legacyToModernPairedParity: true,
    },
    implementationGaps: task.implementationGaps.map(gap => gap.id),
    coverageCredit: task.coverageCredit,
    compatibilityScoreContribution: 0,
    productionImport: "HOLD",
  };
}

export function verifyGroupWebJobChangeRuntimeTaskSources(task, sources) {
  return verifySources(task, sources);
}

export function verifyGroupWebJobChangeRuntimeTask(root, task) {
  const canonicalRoot = realpathSync(root);
  const prefix = `${canonicalRoot}${sep}`;
  const loaded = [];
  for (const source of task.sourceContracts ?? []) {
    const path = resolve(canonicalRoot, source.path);
    const stat = lstatSync(path);
    const real = realpathSync(path);
    if (stat.isSymbolicLink() || !stat.isFile() || !real.startsWith(prefix)) {
      fail("GROUP_WEB_JOB_CHANGE_RUNTIME_SOURCE_PATH_INVALID", source.path);
    }
    const bytes = readFileSync(real);
    if (sha(bytes) !== source.rawSha256) fail("GROUP_WEB_JOB_CHANGE_RUNTIME_SOURCE_RAW_HASH_DRIFT", source.path);
    loaded.push(JSON.parse(bytes.toString("utf8")));
  }
  const readTarget = relativePath => {
    const path = resolve(canonicalRoot, relativePath);
    const stat = lstatSync(path);
    const real = realpathSync(path);
    if (stat.isSymbolicLink() || !stat.isFile() || !real.startsWith(prefix)) {
      fail("GROUP_WEB_JOB_CHANGE_RUNTIME_TARGET_PATH_INVALID", relativePath);
    }
    return readFileSync(real, "utf8");
  };
  return verifySources(task, {
    moduleMapping: loaded[0],
    sourceAudit: loaded[1],
    jobChangeEvidence: loaded[2],
    readTarget,
  });
}
