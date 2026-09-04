import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { resolve, sep } from "node:path";

export class GroupWebRewardDisciplineRuntimeTaskError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "GroupWebRewardDisciplineRuntimeTaskError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new GroupWebRewardDisciplineRuntimeTaskError(code, detail); };
const sha = value => createHash("sha256").update(value).digest("hex");
const canonical = value => sha(`${JSON.stringify(value)}\n`);
const SOURCE_PATHS = Object.freeze([
  "scripts/hr-cutover/contracts/legacy-group-web-module-mapping-v1.json",
  "scripts/hr-cutover/contracts/legacy-group-web-source-audit-v1.json",
  "scripts/hr-cutover/contracts/legacy-dual-source-reconciliation-v1.json",
  "scripts/hr-cutover/contracts/legacy-reward-discipline-field-map-v1.json",
]);
const EXPECTED_IDS = Object.freeze([48, 49]);
const EXPECTED_COVERAGE = Object.freeze({
  taskReady: { numerator: 1, denominator: 1 },
  groupWebNavigableEntries: { numerator: 0, denominator: 186 },
  legacyInteractionParity: { numerator: 0, denominator: 2 },
});
const EXPECTED_ROLES = Object.freeze([
  "park_reward_reader", "team_reward_reader", "self_reward_reader", "reward_operator",
  "reward_reviewer", "reward_reason_reader", "reward_amount_reader", "reward_document_reader",
  "reward_document_operator", "reward_link_operator", "no_reward_permission",
]);
const REQUIRED_GAPS = Object.freeze([
  "GROUP_WEB_REWARD_DISCIPLINE_LEGACY_SEMANTICS_AND_RULE_CALL_CHAIN_NOT_BOUND",
  "GROUP_WEB_REWARD_DISCIPLINE_GROUP_WEB_ROW_COUNTS_AND_EMPTY_STATE_NOT_BOUND",
  "GROUP_WEB_REWARD_DISCIPLINE_WEB_CATEGORY_VERSION_CONTROL_NOT_IMPLEMENTED",
  "GROUP_WEB_REWARD_DISCIPLINE_WEB_CORRECTION_APPEAL_AND_LINK_CONTROLS_NOT_IMPLEMENTED",
  "GROUP_WEB_REWARD_DISCIPLINE_DUAL_SOURCE_FIELD_RELATION_NOT_PROVEN",
]);

function assertTask(task) {
  if (task?.formatVersion !== 1
    || task.contractKind !== "yuzhou_hr_group_web_reward_discipline_modern_runtime_task"
    || task.taskVersion !== "reward-discipline-modern-runtime-1.0.0"
    || task.executionBoundary !== "isolated_lab_only") {
    fail("GROUP_WEB_REWARD_DISCIPLINE_RUNTIME_TASK_INVALID", "identity");
  }
  if (task.status !== "ready_not_executed"
    || task.runtimeEvidence?.status !== "not_observed"
    || task.compatibilityScoreContribution !== 0
    || task.productionImport !== "HOLD") {
    fail("GROUP_WEB_REWARD_DISCIPLINE_RUNTIME_FALSE_COMPLETION", "root");
  }
  if (JSON.stringify(task.coverageCredit) !== JSON.stringify(EXPECTED_COVERAGE)) {
    fail("GROUP_WEB_REWARD_DISCIPLINE_RUNTIME_COVERAGE_INVALID", "coverageCredit");
  }
  if (task.candidate?.id !== "GROUP-WEB-INTERACTION-48-49-REWARD-DISCIPLINE"
    || JSON.stringify(task.candidate?.legacyIds) !== JSON.stringify(EXPECTED_IDS)
    || task.candidate.actualModernRoute !== "/hr/rewards"
    || task.candidate.currentStaticEvidence?.entryCount !== 2
    || task.candidate.currentStaticEvidence?.scoreEach !== 80
    || task.candidate.currentStaticEvidence?.implementationStatusEach !== "partial"
    || task.candidate.currentStaticEvidence?.dimensionsEach?.legacyRuleParity !== false
    || task.candidate.currentStaticEvidence?.dimensionsEach?.targetTechnicalUat !== false
    || task.candidate.currentStaticEvidence?.dimensionsEach?.legacyRuntimeUat !== false) {
    fail("GROUP_WEB_REWARD_DISCIPLINE_RUNTIME_CANDIDATE_INVALID", "candidate");
  }
  if (JSON.stringify(task.sourceContracts?.map(source => source.path)) !== JSON.stringify(SOURCE_PATHS)) {
    fail("GROUP_WEB_REWARD_DISCIPLINE_RUNTIME_SOURCE_SET_INVALID", "sourceContracts");
  }
  if (JSON.stringify(task.legacyEntries?.map(entry => entry.legacyId)) !== JSON.stringify(EXPECTED_IDS)) {
    fail("GROUP_WEB_REWARD_DISCIPLINE_RUNTIME_ENTRY_SET_INVALID", "legacyEntries");
  }
  const sums = key => task.legacyEntries.reduce((total, entry) => total + entry[key], 0);
  const slots = task.legacyOpaqueSlots;
  for (const [key, expected] of [["traversedAspFiles", 4], ["forms", 2], ["controls", 28], ["requestKeys", 32], ["formActions", 2], ["stateTransitions", 2]]) {
    if (slots?.[key] !== expected || sums(key) !== expected) {
      fail("GROUP_WEB_REWARD_DISCIPLINE_RUNTIME_SLOT_DENOMINATOR_INVALID", key);
    }
  }
  if (slots.sourceColumnNamesClaimed !== false
    || slots.status !== "identity_frozen_semantics_pending_authenticated_legacy_runtime_observation") {
    fail("GROUP_WEB_REWARD_DISCIPLINE_RUNTIME_SLOT_DENOMINATOR_INVALID", "status");
  }
  if (!Array.isArray(task.legacyFieldBindingPlan)
    || task.legacyFieldBindingPlan.length !== 2
    || task.legacyFieldBindingPlan.some(item => !EXPECTED_IDS.includes(item.legacyId)
      || item.controlSlots !== 14 || item.requestKeySlots !== 16
      || !item.targetCandidateGroups?.length
      || !/(?:requires|unresolved)/u.test(item.disposition)
      || /(?:verified|complete|pass)/iu.test(item.disposition))) {
    fail("GROUP_WEB_REWARD_DISCIPLINE_RUNTIME_FIELD_BINDINGS_INVALID", "legacyFieldBindingPlan");
  }
  const presence = task.legacyDataPresenceBoundary;
  const reward = presence?.tables?.find(table => table.legacyId === 48);
  const punishment = presence?.tables?.find(table => table.legacyId === 49);
  if (presence?.groupWebSourceId !== "yuzhou_group_web_enterprise_hr"
    || reward?.observedRows !== null
    || reward?.receiptStatus !== "not_in_current_group_web_key_table_count_receipt"
    || punishment?.observedRows !== 8
    || presence?.tables?.some(table => table.featureRequired !== true || table.emptyOrUnknownDataDoesNotRemoveBehavior !== true)
    || presence?.crossSourceEmptyTable?.table !== "bonusrecord"
    || presence?.crossSourceEmptyTable?.observedRows !== 0
    || presence?.crossSourceEmptyTable?.maySubstituteForGroupWebRewardCount !== false
    || presence?.crossSourceEmptyTable?.featureRequired !== true) {
    fail("GROUP_WEB_REWARD_DISCIPLINE_RUNTIME_EMPTY_SOURCE_BOUNDARY_INVALID", "legacyDataPresenceBoundary");
  }
  const workflow = task.legacyWorkflowTask;
  if (workflow?.runtimeStatus !== "not_observed"
    || workflow?.staticTransitionSlots?.length !== 2
    || workflow?.requiredActionObservationsPerEntry?.length !== 10
    || workflow?.requiredConditionObservationsPerEntry?.length !== 10
    || workflow?.notApplicableDecisionAllowedOnlyAfter !== "authenticated_legacy_runtime_and_group_web_routine_call_chain_observation") {
    fail("GROUP_WEB_REWARD_DISCIPLINE_RUNTIME_WORKFLOW_FALSE_COMPLETION", "legacyWorkflowTask");
  }
  if (task.legacyReportLayout?.status !== "not_observed"
    || task.legacyReportLayout?.requiredObservationPerEntry?.length !== 10
    || task.legacyReportLayout?.requiredObservationCount !== 20
    || task.legacyReportLayout?.notApplicableDecisionAllowedOnlyAfter !== "authenticated_legacy_runtime_observation") {
    fail("GROUP_WEB_REWARD_DISCIPLINE_RUNTIME_REPORT_FALSE_COMPLETION", "legacyReportLayout");
  }
  if (task.crossSourceFieldBoundary?.windowsClientFields !== 16
    || task.crossSourceFieldBoundary?.windowsClientVerifiedTargetFields !== 2
    || task.crossSourceFieldBoundary?.groupWebFieldCreditFromWindowsClient !== 0
    || task.crossSourceFieldBoundary?.unresolvedSemanticRisks?.length !== 7) {
    fail("GROUP_WEB_REWARD_DISCIPLINE_RUNTIME_DUAL_SOURCE_BOUNDARY_INVALID", "crossSourceFieldBoundary");
  }
  const modern = task.modernRuntimeContract;
  if (JSON.stringify(modern?.statusVocabulary) !== JSON.stringify(["draft", "submitted", "approved", "returned", "withdrawn"])
    || modern?.transitionMatrix?.length !== 5
    || JSON.stringify(modern?.roleMatrix?.map(row => row.role)) !== JSON.stringify(EXPECTED_ROLES)
    || modern?.apiTasks?.length !== 28
    || modern?.browserTask?.viewports?.length !== 2
    || modern?.browserTask?.checks?.length !== 12) {
    fail("GROUP_WEB_REWARD_DISCIPLINE_RUNTIME_MATRIX_INVALID", "modernRuntimeContract");
  }
  const evidence = task.runtimeEvidence;
  const expectedEvidence = {
    requiredLegacyEntryObservations: 2,
    requiredLegacyControlBindings: 28,
    requiredLegacyRequestKeyBindings: 32,
    requiredLegacyFormActionBindings: 2,
    requiredLegacyStateTransitionBindings: 2,
    requiredLegacyActionObservations: 20,
    requiredLegacyConditionObservations: 20,
    requiredLegacyReportLayoutObservations: 20,
    requiredGroupWebTableCountReceipts: 2,
    requiredModernApiObservations: 28,
    requiredModernBrowserObservations: 24,
  };
  for (const [key, expected] of Object.entries(expectedEvidence)) {
    if (evidence?.[key] !== expected) fail("GROUP_WEB_REWARD_DISCIPLINE_RUNTIME_EVIDENCE_GATE_INVALID", key);
  }
  if (evidence.requiredPairing !== "same_entry_hash_bound_redacted_legacy_and_modern_observation_pair"
    || evidence.sensitiveScan !== "required_pass"
    || evidence.credentialsExcluded !== true
    || evidence.personalValuesExcluded !== true
    || evidence.amountValuesExcluded !== true
    || evidence.attachmentBinariesExcluded !== true) {
    fail("GROUP_WEB_REWARD_DISCIPLINE_RUNTIME_EVIDENCE_GATE_INVALID", "sensitiveBoundary");
  }
  for (const gap of REQUIRED_GAPS) {
    if (!task.blockingGaps?.includes(gap) || !task.implementationGaps?.some(item => item.id === gap)) {
      fail("GROUP_WEB_REWARD_DISCIPLINE_RUNTIME_IMPLEMENTATION_GAP_MISSING", gap);
    }
  }
  const versionGap = task.implementationGaps.find(item => item.id === REQUIRED_GAPS[2]);
  if (!versionGap?.implementationAction?.includes("add_a_typed_web_api_wrapper_for_the_existing_category_versions_endpoint")
    || !versionGap?.acceptance?.includes("category_history_remains_immutable")
    || !versionGap?.acceptance?.includes("no_raw_uuid_entry")) {
    fail("GROUP_WEB_REWARD_DISCIPLINE_RUNTIME_CATEGORY_VERSION_GAP_INVALID", "implementationGaps");
  }
  const webGap = task.implementationGaps.find(item => item.id === REQUIRED_GAPS[3]);
  if (!webGap?.implementationAction?.includes("add_typed_web_api_wrappers_for_existing_corrections_and_links_endpoints")
    || !webGap?.implementationAction?.includes("add_action_specific_server_scoped_payroll_and_performance_candidate_selectors_before_link_controls")
    || !webGap?.acceptance?.includes("no_raw_uuid_entry")) {
    fail("GROUP_WEB_REWARD_DISCIPLINE_RUNTIME_WEB_GAP_INVALID", "implementationGaps");
  }
}

function verifySources(task, { moduleMapping, sourceAudit, reconciliation, clientFieldMap, readTarget }) {
  assertTask(task);
  const sources = [moduleMapping, sourceAudit, reconciliation, clientFieldMap];
  for (let index = 0; index < SOURCE_PATHS.length; index += 1) {
    if (task.sourceContracts[index].canonicalSha256 !== canonical(sources[index])) {
      fail("GROUP_WEB_REWARD_DISCIPLINE_RUNTIME_SOURCE_DRIFT", SOURCE_PATHS[index]);
    }
  }
  for (const expected of task.legacyEntries) {
    const module = moduleMapping.items?.find(item => item.legacyId === expected.legacyId);
    if (!module || module.name !== expected.name || module.legacyUrl !== expected.legacyUrl
      || module.legacyTable !== expected.legacyTable || module.legacyView !== expected.legacyView
      || JSON.stringify(module.targetRoutes) !== JSON.stringify(expected.mappedTargetRoutes)) {
      fail("GROUP_WEB_REWARD_DISCIPLINE_RUNTIME_MODULE_DRIFT", `legacyId=${expected.legacyId}`);
    }
    const audit = sourceAudit.items?.find(item => item.legacyId === expected.legacyId);
    for (const key of ["traversedAspFiles", "forms", "controls", "requestKeys", "formActions", "selectStatements", "insertStatements", "updateStatements", "deleteStatements", "stateTransitions", "fieldEvidenceHash"]) {
      if (audit?.[key] !== expected[key]) fail("GROUP_WEB_REWARD_DISCIPLINE_RUNTIME_AUDIT_DRIFT", `${expected.legacyId}:${key}`);
    }
    if (audit?.entryResolved !== true) fail("GROUP_WEB_REWARD_DISCIPLINE_RUNTIME_AUDIT_DRIFT", `${expected.legacyId}:entryResolved`);
  }
  const groupWeb = reconciliation.sources?.groupWeb;
  if (reconciliation.status !== "reviewed_read_only_baseline"
    || groupWeb?.sourceId !== task.legacyDataPresenceBoundary.groupWebSourceId
    || groupWeb?.catalog?.schemaHash !== task.legacyDataPresenceBoundary.groupWebCatalogHash
    || reconciliation.groupWebKeyTableCounts?.Emp_Punish_tApplay !== 8
    || Object.hasOwn(reconciliation.groupWebKeyTableCounts ?? {}, "Emp_Reward_tApplay")
    || reconciliation.migrationPolicy?.operationMode !== "read_only_inventory_and_reconciliation"
    || reconciliation.migrationPolicy?.productionImport !== "HOLD") {
    fail("GROUP_WEB_REWARD_DISCIPLINE_RUNTIME_GROUP_WEB_RECEIPT_DRIFT", "legacyDataPresenceBoundary");
  }
  const bonusRecord = clientFieldMap.sourceTables?.find(table => table.sourceTable === "bonusrecord");
  if (clientFieldMap.contractKind !== "yuzhou_hr_legacy_reward_discipline_field_map"
    || clientFieldMap.sourceSystem !== "yuzhou-v10"
    || clientFieldMap.fields?.length !== 16
    || clientFieldMap.compatibilityCredit?.numerator !== 2
    || bonusRecord?.observedRows !== 0
    || clientFieldMap.sourceTables?.some(table => /^Emp_(?:Reward|Punish)_tApplay$/u.test(table.sourceTable))
    || clientFieldMap.sourceRowValuesEmitted !== false
    || clientFieldMap.containsPersonalData !== false
    || clientFieldMap.productionImport !== "HOLD") {
    fail("GROUP_WEB_REWARD_DISCIPLINE_RUNTIME_CLIENT_SOURCE_BOUNDARY_DRIFT", "crossSourceFieldBoundary");
  }
  for (const source of task.modernSourceEvidence) {
    const text = readTarget(source.path);
    for (const token of source.requiredTokens) {
      if (typeof text !== "string" || !text.includes(token)) {
        fail("GROUP_WEB_REWARD_DISCIPLINE_RUNTIME_MODERN_EVIDENCE_MISSING", source.path);
      }
    }
    for (const token of source.forbiddenTokens ?? []) {
      if (text.includes(token)) fail("GROUP_WEB_REWARD_DISCIPLINE_RUNTIME_MODERN_GAP_DRIFT", source.path);
    }
  }
  return {
    status: "READY_NOT_EXECUTED",
    candidateId: task.candidate.id,
    taskReadyIncrement: 1,
    runtimeCoverageIncrement: 0,
    compatibilityScoreContribution: 0,
    proven: {
      legacyEntriesFrozen: 2,
      legacyControlSlots: 28,
      legacyRequestKeySlots: 32,
      legacyFormActionSlots: 2,
      legacyStateTransitionSlots: 2,
      groupWebPunishmentAggregateObserved: true,
      crossSourceEmptyTableKeptSeparate: true,
      modernSourceContracts: task.modernSourceEvidence.length,
      modernRolesFrozen: task.modernRuntimeContract.roleMatrix.length,
      desktopAndPhoneTaskFrozen: true,
    },
    stillRequired: {
      legacyEntryObservations: 2,
      legacyControlBindings: 28,
      legacyRequestKeyBindings: 32,
      legacyActionObservations: 20,
      legacyConditionObservations: 20,
      legacyReportLayoutObservations: 20,
      groupWebTableCountReceipts: 2,
      modernApiObservations: 28,
      modernBrowserObservations: 24,
      groupWebRoutineCallChain: true,
      webCategoryVersionControl: true,
      webCorrectionAppealAndLinks: true,
      dualSourceFieldRelationship: true,
      legacyToModernPairedParity: true,
    },
    implementationGaps: task.implementationGaps.map(gap => gap.id),
    coverageCredit: task.coverageCredit,
    productionImport: "HOLD",
  };
}

export function verifyGroupWebRewardDisciplineRuntimeTaskSources(task, sources) {
  return verifySources(task, sources);
}

export function verifyGroupWebRewardDisciplineRuntimeTask(root, task) {
  const canonicalRoot = realpathSync(root);
  const prefix = `${canonicalRoot}${sep}`;
  const loaded = [];
  for (const source of task.sourceContracts ?? []) {
    const path = resolve(canonicalRoot, source.path);
    const stat = lstatSync(path);
    const real = realpathSync(path);
    if (stat.isSymbolicLink() || !stat.isFile() || !real.startsWith(prefix)) {
      fail("GROUP_WEB_REWARD_DISCIPLINE_RUNTIME_SOURCE_PATH_INVALID", source.path);
    }
    const bytes = readFileSync(real);
    if (sha(bytes) !== source.rawSha256) {
      fail("GROUP_WEB_REWARD_DISCIPLINE_RUNTIME_SOURCE_RAW_HASH_DRIFT", source.path);
    }
    loaded.push(JSON.parse(bytes.toString("utf8")));
  }
  const readTarget = relativePath => {
    const path = resolve(canonicalRoot, relativePath);
    const stat = lstatSync(path);
    const real = realpathSync(path);
    if (stat.isSymbolicLink() || !stat.isFile() || !real.startsWith(prefix)) {
      fail("GROUP_WEB_REWARD_DISCIPLINE_RUNTIME_TARGET_PATH_INVALID", relativePath);
    }
    return readFileSync(real, "utf8");
  };
  return verifySources(task, {
    moduleMapping: loaded[0],
    sourceAudit: loaded[1],
    reconciliation: loaded[2],
    clientFieldMap: loaded[3],
    readTarget,
  });
}
