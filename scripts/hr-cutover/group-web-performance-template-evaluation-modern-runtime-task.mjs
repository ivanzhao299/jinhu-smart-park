import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { resolve, sep } from "node:path";

export class GroupWebPerformanceRuntimeTaskError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "GroupWebPerformanceRuntimeTaskError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new GroupWebPerformanceRuntimeTaskError(code, detail); };
const sha = value => createHash("sha256").update(value).digest("hex");
const canonical = value => sha(`${JSON.stringify(value)}\n`);
const SOURCE_PATHS = Object.freeze([
  "scripts/hr-cutover/contracts/legacy-group-web-module-mapping-v1.json",
  "scripts/hr-cutover/contracts/legacy-group-web-source-audit-v1.json",
  "scripts/hr-cutover/contracts/legacy-dual-source-reconciliation-v1.json",
  "scripts/hr-cutover/contracts/legacy-performance-assessmentcode-field-map-v1.json",
]);
const EXPECTED_IDS = Object.freeze([90, 94]);
const EXPECTED_COVERAGE = Object.freeze({
  taskReady: { numerator: 1, denominator: 1 },
  groupWebNavigableEntries: { numerator: 0, denominator: 186 },
  legacyInteractionParity: { numerator: 0, denominator: 2 },
});
const EXPECTED_FIELDS = Object.freeze([
  "assessment", "assessmentname", "department", "mpercent", "tpercent", "xpercent",
  "cpercent", "spercent", "timekeep", "bonus", "master",
]);
const EXPECTED_ROLES = Object.freeze([
  "performance_template_reader", "performance_template_manager", "performance_park_reader",
  "performance_team_reader", "performance_self_reviewer", "performance_manager_reviewer",
  "performance_cycle_manager", "performance_calibrator", "performance_appeal_reviewer",
  "no_performance_permission",
]);
const REQUIRED_GAPS = Object.freeze([
  "GROUP_WEB_PERFORMANCE_LEGACY_SLOTS_AND_ROUTINE_CALL_CHAIN_NOT_BOUND",
  "GROUP_WEB_PERFORMANCE_TABLE_COUNT_AND_COLUMN_RELATION_NOT_BOUND",
  "GROUP_WEB_PERFORMANCE_ASSESSMENTCODE_FORMULA_PROJECTION_NOT_IMPLEMENTED",
  "GROUP_WEB_PERFORMANCE_WEB_DYNAMIC_TEMPLATE_EDITOR_NOT_IMPLEMENTED",
  "GROUP_WEB_PERFORMANCE_WEB_READ_AND_SCORE_PREVIEW_CAPABILITIES_NOT_REACHABLE",
]);

function assertTask(task) {
  if (task?.formatVersion !== 1
    || task.contractKind !== "yuzhou_hr_group_web_performance_template_evaluation_modern_runtime_task"
    || task.taskVersion !== "performance-template-evaluation-modern-runtime-1.0.0"
    || task.executionBoundary !== "isolated_lab_only") {
    fail("GROUP_WEB_PERFORMANCE_RUNTIME_TASK_INVALID", "identity");
  }
  if (task.status !== "ready_not_executed"
    || task.runtimeEvidence?.status !== "not_observed"
    || task.compatibilityScoreContribution !== 0
    || task.productionImport !== "HOLD") {
    fail("GROUP_WEB_PERFORMANCE_RUNTIME_FALSE_COMPLETION", "root");
  }
  if (JSON.stringify(task.coverageCredit) !== JSON.stringify(EXPECTED_COVERAGE)) {
    fail("GROUP_WEB_PERFORMANCE_RUNTIME_COVERAGE_INVALID", "coverageCredit");
  }
  const candidate = task.candidate;
  if (candidate?.id !== "GROUP-WEB-INTERACTION-90-94-PERFORMANCE-TEMPLATE-EVALUATION"
    || JSON.stringify(candidate.legacyIds) !== JSON.stringify(EXPECTED_IDS)
    || candidate.actualModernRoute !== "/hr/performance"
    || candidate.currentStaticEvidence?.entryCount !== 2
    || candidate.currentStaticEvidence?.scoreEach !== 80
    || candidate.currentStaticEvidence?.implementationStatusEach !== "partial"
    || candidate.currentStaticEvidence?.dimensionsEach?.legacyRuleParity !== false
    || candidate.currentStaticEvidence?.dimensionsEach?.targetTechnicalUat !== false
    || candidate.currentStaticEvidence?.dimensionsEach?.legacyRuntimeUat !== false) {
    fail("GROUP_WEB_PERFORMANCE_RUNTIME_CANDIDATE_INVALID", "candidate");
  }
  if (JSON.stringify(task.sourceContracts?.map(source => source.path)) !== JSON.stringify(SOURCE_PATHS)) {
    fail("GROUP_WEB_PERFORMANCE_RUNTIME_SOURCE_SET_INVALID", "sourceContracts");
  }
  if (JSON.stringify(task.legacyEntries?.map(entry => entry.legacyId)) !== JSON.stringify(EXPECTED_IDS)) {
    fail("GROUP_WEB_PERFORMANCE_RUNTIME_ENTRY_SET_INVALID", "legacyEntries");
  }
  const sums = key => task.legacyEntries.reduce((total, entry) => total + entry[key], 0);
  const slots = task.legacyOpaqueSlots;
  for (const [key, expected] of [
    ["traversedAspFiles", 12], ["forms", 5], ["controls", 101], ["requestKeys", 37],
    ["formActions", 4], ["selectStatements", 2], ["stateTransitions", 7],
  ]) {
    if (slots?.[key] !== expected || sums(key) !== expected) {
      fail("GROUP_WEB_PERFORMANCE_RUNTIME_SLOT_DENOMINATOR_INVALID", key);
    }
  }
  if (slots.sourceColumnNamesClaimed !== false
    || slots.emptyOrNullSlotsRemainInDenominator !== true
    || slots.status !== "identity_and_counts_frozen_semantics_pending_authenticated_legacy_runtime_observation") {
    fail("GROUP_WEB_PERFORMANCE_RUNTIME_SLOT_DENOMINATOR_INVALID", "status");
  }
  const presence = task.legacyDataPresenceBoundary;
  const template = presence?.tables?.find(table => table.legacyId === 90);
  const evaluation = presence?.tables?.find(table => table.legacyId === 94);
  if (presence?.groupWebSourceId !== "yuzhou_group_web_enterprise_hr"
    || template?.observedRows !== 23
    || evaluation?.observedRows !== null
    || evaluation?.receiptStatus !== "not_in_current_group_web_key_table_count_receipt"
    || presence?.tables?.some(table => table.featureRequired !== true || table.emptyOrUnknownDataDoesNotRemoveBehavior !== true)
    || !presence?.emptyTableRule?.startsWith("zero_or_unknown_rows_never_remove")) {
    fail("GROUP_WEB_PERFORMANCE_RUNTIME_EMPTY_SOURCE_BOUNDARY_INVALID", "legacyDataPresenceBoundary");
  }
  const cross = task.crossSourceAssessmentBoundary;
  if (cross?.windowsClientSourceSystem !== "yuzhou-v10"
    || cross?.groupWebSourceSystem !== "yuzhou_group_web_enterprise_hr"
    || cross?.windowsClientTable !== "assessmentcode"
    || cross?.observedRows !== null
    || cross?.fieldDenominator !== 11
    || cross?.verifiedTargetFields !== 0
    || cross?.groupWebFieldCreditFromWindowsClient !== 0
    || JSON.stringify(cross?.fields) !== JSON.stringify(EXPECTED_FIELDS)
    || cross?.routineEvidence?.length !== 2
    || cross?.emptyFieldRule !== "all_eleven_fields_and_both_routines_remain_required_when_rows_or_nullable_values_are_empty") {
    fail("GROUP_WEB_PERFORMANCE_RUNTIME_DUAL_SOURCE_BOUNDARY_INVALID", "crossSourceAssessmentBoundary");
  }
  if (cross.weightedTotal !== "selfvalue*spercent/100+mitemvalue*mpercent/100+itemvalue*tpercent/100+xitemvalue*xpercent/100+citemvalue*cpercent/100+mastervalue+timekeepvalue+bonusvalue"
    || cross.percentageUnitTransform !== "legacy_integer_percentage_points_divided_by_100_before_modern_fractional_weight"
    || cross.gradeAssignment !== "assgradecode_threshold_lookup_after_total"
    || cross.nullHandling !== "legacy_routine_contains_null_defaulting"
    || JSON.stringify(cross.routineEvidence.map(item => item.sourceName)) !== JSON.stringify(["bs_ass_compute", "u_count"])) {
    fail("GROUP_WEB_PERFORMANCE_RUNTIME_FORMULA_INVALID", "crossSourceAssessmentBoundary");
  }
  const interaction = task.legacyInteractionTask;
  if (interaction?.runtimeStatus !== "not_observed"
    || interaction?.entryPlans?.length !== 2
    || interaction.entryPlans.reduce((sum, entry) => sum + entry.controlSlots, 0) !== 101
    || interaction.entryPlans.reduce((sum, entry) => sum + entry.requestKeySlots, 0) !== 37
    || interaction.entryPlans.some(entry => entry.requiredActions?.length !== 10 || entry.requiredConditions?.length !== 10)
    || interaction.groupWebRoutineReferences?.length !== 0
    || interaction.groupWebRoutineReferenceStatus !== "not_extracted_from_current_static_audit"
    || interaction.notApplicableDecisionAllowedOnlyAfter !== "authenticated_legacy_runtime_and_hash_bound_group_web_routine_call_chain_observation") {
    fail("GROUP_WEB_PERFORMANCE_RUNTIME_INTERACTION_FALSE_COMPLETION", "legacyInteractionTask");
  }
  if (task.legacyReportLayout?.status !== "not_observed"
    || task.legacyReportLayout?.requiredObservationPerEntry?.length !== 10
    || task.legacyReportLayout?.requiredObservationCount !== 20) {
    fail("GROUP_WEB_PERFORMANCE_RUNTIME_REPORT_FALSE_COMPLETION", "legacyReportLayout");
  }
  const modern = task.modernRuntimeContract;
  if (JSON.stringify(modern?.statusVocabulary) !== JSON.stringify(["planning", "self_review", "manager_review", "calibration", "employee_acknowledged", "appealed", "confirmed"])
    || modern?.transitionMatrix?.length !== 7
    || JSON.stringify(modern?.roleMatrix?.map(row => row.role)) !== JSON.stringify(EXPECTED_ROLES)
    || modern?.apiTasks?.length !== 20
    || modern?.browserTask?.viewports?.length !== 2
    || JSON.stringify(modern?.browserTask?.viewports?.map(viewport => viewport.width)) !== JSON.stringify([1440, 390])
    || modern?.browserTask?.checks?.length !== 10) {
    fail("GROUP_WEB_PERFORMANCE_RUNTIME_MATRIX_INVALID", "modernRuntimeContract");
  }
  const evidence = task.runtimeEvidence;
  const expectedEvidence = {
    requiredLegacyEntryObservations: 2,
    requiredLegacyAspBindings: 12,
    requiredLegacyControlBindings: 101,
    requiredLegacyRequestKeyBindings: 37,
    requiredLegacyFormActionBindings: 4,
    requiredLegacyStateTransitionBindings: 7,
    requiredLegacyActionObservations: 20,
    requiredLegacyConditionObservations: 20,
    requiredLegacyReportLayoutObservations: 20,
    requiredGroupWebTableCountReceipts: 2,
    requiredWindowsClientFieldDispositions: 11,
    requiredWindowsClientRoutineParities: 2,
    requiredModernApiObservations: 20,
    requiredModernBrowserObservations: 20,
  };
  for (const [key, expected] of Object.entries(expectedEvidence)) {
    if (evidence?.[key] !== expected) fail("GROUP_WEB_PERFORMANCE_RUNTIME_EVIDENCE_GATE_INVALID", key);
  }
  if (evidence.requiredPairing !== "same_entry_hash_bound_redacted_legacy_and_modern_observation_pair"
    || evidence.sensitiveScan !== "required_pass"
    || evidence.credentialsExcluded !== true
    || evidence.personalValuesExcluded !== true
    || evidence.payrollValuesExcluded !== true
    || evidence.attachmentBinariesExcluded !== true) {
    fail("GROUP_WEB_PERFORMANCE_RUNTIME_EVIDENCE_GATE_INVALID", "sensitiveBoundary");
  }
  for (const gap of REQUIRED_GAPS) {
    if (!task.blockingGaps?.includes(gap) || !task.implementationGaps?.some(item => item.id === gap)) {
      fail("GROUP_WEB_PERFORMANCE_RUNTIME_IMPLEMENTATION_GAP_MISSING", gap);
    }
  }
  const formulaGap = task.implementationGaps.find(item => item.id === REQUIRED_GAPS[2]);
  if (!formulaGap?.implementationAction?.includes("implement_server_owned_bs_ass_compute_equivalent_with_component_gates_null_defaults_and_grade_thresholds")
    || !formulaGap?.acceptance?.includes("11_of_11_field_dispositions_verified")
    || !formulaGap?.acceptance?.includes("grade_boundary_parity")) {
    fail("GROUP_WEB_PERFORMANCE_RUNTIME_FORMULA_GAP_INVALID", "implementationGaps");
  }
  const editorGap = task.implementationGaps.find(item => item.id === REQUIRED_GAPS[3]);
  if (!editorGap?.missingEvidence?.includes("dynamic_dimension_editor")
    || !editorGap?.acceptance?.includes("no_fixed_three_dimension_loss")) {
    fail("GROUP_WEB_PERFORMANCE_RUNTIME_EDITOR_GAP_INVALID", "implementationGaps");
  }
  const webGap = task.implementationGaps.find(item => item.id === REQUIRED_GAPS[4]);
  if (!webGap?.implementationAction?.includes("load_and_render_templates_for_HR_PERFORMANCE_TEMPLATE_READ_without_manage")
    || !webGap?.implementationAction?.includes("add_typed_wrapper_for_existing_score_preview_endpoint")) {
    fail("GROUP_WEB_PERFORMANCE_RUNTIME_WEB_GAP_INVALID", "implementationGaps");
  }
}

function verifySources(task, { moduleMapping, sourceAudit, reconciliation, clientFieldMap, readTarget }) {
  assertTask(task);
  const sources = [moduleMapping, sourceAudit, reconciliation, clientFieldMap];
  for (let index = 0; index < SOURCE_PATHS.length; index += 1) {
    if (task.sourceContracts[index].canonicalSha256 !== canonical(sources[index])) {
      fail("GROUP_WEB_PERFORMANCE_RUNTIME_SOURCE_DRIFT", SOURCE_PATHS[index]);
    }
  }
  for (const expected of task.legacyEntries) {
    const module = moduleMapping.items?.find(item => item.legacyId === expected.legacyId);
    if (!module || module.name !== expected.name || module.legacyUrl !== expected.legacyUrl
      || module.legacyTable !== expected.legacyTable || module.legacyView !== expected.legacyView
      || JSON.stringify(module.targetRoutes) !== JSON.stringify(expected.mappedTargetRoutes)) {
      fail("GROUP_WEB_PERFORMANCE_RUNTIME_MODULE_DRIFT", `legacyId=${expected.legacyId}`);
    }
    const audit = sourceAudit.items?.find(item => item.legacyId === expected.legacyId);
    for (const key of ["traversedAspFiles", "forms", "controls", "requestKeys", "formActions", "selectStatements", "insertStatements", "updateStatements", "deleteStatements", "stateTransitions", "fieldEvidenceHash"]) {
      if (audit?.[key] !== expected[key]) fail("GROUP_WEB_PERFORMANCE_RUNTIME_AUDIT_DRIFT", `${expected.legacyId}:${key}`);
    }
    if (audit?.entryResolved !== true) fail("GROUP_WEB_PERFORMANCE_RUNTIME_AUDIT_DRIFT", `${expected.legacyId}:entryResolved`);
  }
  const groupWeb = reconciliation.sources?.groupWeb;
  if (reconciliation.status !== "reviewed_read_only_baseline"
    || groupWeb?.sourceId !== task.legacyDataPresenceBoundary.groupWebSourceId
    || groupWeb?.catalog?.schemaHash !== task.legacyDataPresenceBoundary.groupWebCatalogHash
    || reconciliation.groupWebKeyTableCounts?.Per_tAssessTemplate !== 23
    || Object.hasOwn(reconciliation.groupWebKeyTableCounts ?? {}, "Per_tAssessTask")
    || reconciliation.migrationPolicy?.operationMode !== "read_only_inventory_and_reconciliation"
    || reconciliation.migrationPolicy?.productionImport !== "HOLD") {
    fail("GROUP_WEB_PERFORMANCE_RUNTIME_GROUP_WEB_RECEIPT_DRIFT", "legacyDataPresenceBoundary");
  }
  const assessment = clientFieldMap.sourceTables?.find(table => table.sourceTable === "assessmentcode");
  if (clientFieldMap.contractKind !== "yuzhou_hr_legacy_performance_assessmentcode_field_map"
    || clientFieldMap.sourceSystem !== "yuzhou-v10"
    || assessment?.observedRows !== null
    || assessment?.columns?.length !== 11
    || JSON.stringify(assessment?.columns?.map(column => column.name)) !== JSON.stringify(EXPECTED_FIELDS)
    || clientFieldMap.fields?.length !== 11
    || clientFieldMap.compatibilityCredit?.numerator !== 0
    || clientFieldMap.compatibilityCredit?.denominator !== 11
    || clientFieldMap.routineEvidence?.requiredRoutines?.length !== 2
    || clientFieldMap.calculationRuleEvidence?.weightedTotal !== task.crossSourceAssessmentBoundary.weightedTotal
    || clientFieldMap.sourceRowValuesEmitted !== false
    || clientFieldMap.containsPersonalData !== false
    || clientFieldMap.productionImport !== "HOLD") {
    fail("GROUP_WEB_PERFORMANCE_RUNTIME_CLIENT_SOURCE_BOUNDARY_DRIFT", "crossSourceAssessmentBoundary");
  }
  for (const source of task.modernSourceEvidence) {
    const text = readTarget(source.path);
    for (const token of source.requiredTokens) {
      if (typeof text !== "string" || !text.includes(token)) {
        fail("GROUP_WEB_PERFORMANCE_RUNTIME_MODERN_EVIDENCE_MISSING", source.path);
      }
    }
    for (const token of source.forbiddenTokens ?? []) {
      if (text.includes(token)) fail("GROUP_WEB_PERFORMANCE_RUNTIME_MODERN_GAP_DRIFT", source.path);
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
      legacyAspSlots: 12,
      legacyControlSlots: 101,
      legacyRequestKeySlots: 37,
      legacyFormActionSlots: 4,
      legacyStateTransitionSlots: 7,
      groupWebTemplateAggregateObserved: true,
      crossSourceAssessmentFieldsKeptSeparate: 11,
      clientRoutineReferencesBound: 2,
      modernSourceContracts: task.modernSourceEvidence.length,
      desktopAndPhoneTaskFrozen: true,
    },
    stillRequired: {
      legacyEntryObservations: 2,
      legacyAspBindings: 12,
      legacyControlBindings: 101,
      legacyRequestKeyBindings: 37,
      legacyActionObservations: 20,
      legacyConditionObservations: 20,
      legacyReportLayoutObservations: 20,
      groupWebTableCountReceipts: 2,
      groupWebRoutineCallChain: true,
      assessmentcodeFieldDispositions: 11,
      assessmentcodeRoutineParities: 2,
      modernApiObservations: 20,
      modernBrowserObservations: 20,
      dynamicTemplateEditor: true,
      templateReadOnlyProjection: true,
      scorePreviewWebReachability: true,
      legacyToModernPairedParity: true,
    },
    implementationGaps: task.implementationGaps.map(gap => gap.id),
    coverageCredit: task.coverageCredit,
    productionImport: "HOLD",
  };
}

export function verifyGroupWebPerformanceRuntimeTaskSources(task, sources) {
  return verifySources(task, sources);
}

export function verifyGroupWebPerformanceRuntimeTask(root, task) {
  const canonicalRoot = realpathSync(root);
  const prefix = `${canonicalRoot}${sep}`;
  const loaded = [];
  for (const source of task.sourceContracts ?? []) {
    const path = resolve(canonicalRoot, source.path);
    const stat = lstatSync(path);
    const real = realpathSync(path);
    if (stat.isSymbolicLink() || !stat.isFile() || !real.startsWith(prefix)) {
      fail("GROUP_WEB_PERFORMANCE_RUNTIME_SOURCE_PATH_INVALID", source.path);
    }
    const bytes = readFileSync(real);
    if (sha(bytes) !== source.rawSha256) {
      fail("GROUP_WEB_PERFORMANCE_RUNTIME_SOURCE_RAW_HASH_DRIFT", source.path);
    }
    loaded.push(JSON.parse(bytes.toString("utf8")));
  }
  const readTarget = relativePath => {
    const path = resolve(canonicalRoot, relativePath);
    const stat = lstatSync(path);
    const real = realpathSync(path);
    if (stat.isSymbolicLink() || !stat.isFile() || !real.startsWith(prefix)) {
      fail("GROUP_WEB_PERFORMANCE_RUNTIME_TARGET_PATH_INVALID", relativePath);
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
