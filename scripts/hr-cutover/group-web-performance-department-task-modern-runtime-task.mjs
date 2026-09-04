import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { resolve, sep } from "node:path";

export class GroupWebDepartmentTaskRuntimeTaskError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "GroupWebDepartmentTaskRuntimeTaskError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new GroupWebDepartmentTaskRuntimeTaskError(code, detail); };
const sha = value => createHash("sha256").update(value).digest("hex");
const canonical = value => sha(`${JSON.stringify(value)}\n`);
const SOURCE_PATHS = Object.freeze([
  "scripts/hr-cutover/contracts/legacy-group-web-module-mapping-v1.json",
  "scripts/hr-cutover/contracts/legacy-group-web-source-audit-v1.json",
  "scripts/hr-cutover/contracts/legacy-dual-source-reconciliation-v1.json",
]);
const EXPECTED_COVERAGE = Object.freeze({
  taskReady: { numerator: 1, denominator: 1 },
  groupWebNavigableEntries: { numerator: 0, denominator: 186 },
  legacyInteractionParity: { numerator: 0, denominator: 1 },
});
const EXPECTED_SLOTS = Object.freeze({
  traversedAspFiles: 2,
  forms: 1,
  controls: 13,
  requestKeys: 14,
  formActions: 1,
  stateTransitions: 5,
});
const EXPECTED_ROLES = Object.freeze([
  "department_task_park_reader",
  "department_task_team_reader",
  "department_task_self_reader",
  "department_task_manager",
  "department_task_cycle_manager",
  "department_task_no_permission",
]);
const REQUIRED_GAPS = Object.freeze([
  "GROUP_WEB_DEPARTMENT_TASK_LEGACY_FIELDS_ACTIONS_AND_ROUTINE_CHAIN_NOT_BOUND",
  "GROUP_WEB_DEPARTMENT_TASK_ROW_COUNT_AND_FIELD_MAP_NOT_BOUND",
  "GROUP_WEB_DEPARTMENT_TASK_ROUTE_AND_CROSS_DOMAIN_CONTRACT_UNRESOLVED",
  "GROUP_WEB_DEPARTMENT_TASK_WEB_CHANGE_STATE_AND_HISTORY_ACTIONS_NOT_REACHABLE",
]);

function assertTask(task) {
  if (task?.formatVersion !== 1
    || task.contractKind !== "yuzhou_hr_group_web_performance_department_task_modern_runtime_task"
    || task.taskVersion !== "performance-department-task-modern-runtime-1.0.0"
    || task.executionBoundary !== "isolated_lab_only") {
    fail("GROUP_WEB_DEPARTMENT_TASK_RUNTIME_TASK_INVALID", "identity");
  }
  if (task.status !== "ready_not_executed"
    || task.runtimeEvidence?.status !== "not_observed"
    || task.compatibilityScoreContribution !== 0
    || task.productionImport !== "HOLD") {
    fail("GROUP_WEB_DEPARTMENT_TASK_RUNTIME_FALSE_COMPLETION", "root");
  }
  if (JSON.stringify(task.coverageCredit) !== JSON.stringify(EXPECTED_COVERAGE)) {
    fail("GROUP_WEB_DEPARTMENT_TASK_RUNTIME_COVERAGE_INVALID", "coverageCredit");
  }
  const candidate = task.candidate;
  if (candidate?.id !== "GROUP-WEB-INTERACTION-92-PERFORMANCE-DEPARTMENT-TASK"
    || JSON.stringify(candidate.legacyIds) !== JSON.stringify([92])
    || candidate.mappedModernRoute !== "/hr/performance"
    || candidate.supportingModernRoute !== "/hr/goals"
    || !candidate.routeDisposition?.includes("unresolved")
    || candidate.currentStaticEvidence?.entryCount !== 1
    || candidate.currentStaticEvidence?.scoreEach !== 80
    || candidate.currentStaticEvidence?.implementationStatusEach !== "partial"
    || candidate.currentStaticEvidence?.dimensionsEach?.legacyRuleParity !== false
    || candidate.currentStaticEvidence?.dimensionsEach?.targetTechnicalUat !== false
    || candidate.currentStaticEvidence?.dimensionsEach?.legacyRuntimeUat !== false) {
    fail("GROUP_WEB_DEPARTMENT_TASK_RUNTIME_CANDIDATE_INVALID", "candidate");
  }
  if (JSON.stringify(task.sourceContracts?.map(source => source.path)) !== JSON.stringify(SOURCE_PATHS)) {
    fail("GROUP_WEB_DEPARTMENT_TASK_RUNTIME_SOURCE_SET_INVALID", "sourceContracts");
  }
  const entry = task.legacyEntry;
  if (entry?.legacyId !== 92
    || entry.name !== "部门任务"
    || entry.legacyUrl !== "performance/assignment/DepartmentTask/Basic/Browse.asp"
    || entry.legacyTable !== "Per_Task_tDeptBasic"
    || entry.legacyView !== "Per_Task_vDeptBasic"
    || JSON.stringify(entry.mappedTargetRoutes) !== JSON.stringify(["/hr/performance"])
    || entry.selectStatements !== 0
    || entry.insertStatements !== 0
    || entry.updateStatements !== 0
    || entry.deleteStatements !== 0
    || entry.fieldEvidenceHash !== "14598bde7caae34ee8f108751ff69b127492bc24ad02d4cceaa83054caf3945e") {
    fail("GROUP_WEB_DEPARTMENT_TASK_RUNTIME_ENTRY_INVALID", "legacyEntry");
  }
  for (const [key, expected] of Object.entries(EXPECTED_SLOTS)) {
    if (entry[key] !== expected || task.legacyOpaqueSlots?.[key] !== expected) {
      fail("GROUP_WEB_DEPARTMENT_TASK_RUNTIME_SLOT_DENOMINATOR_INVALID", key);
    }
  }
  const slots = task.legacyOpaqueSlots;
  if (slots.sourceColumnNamesClaimed !== false
    || slots.emptyOrNullSlotsRemainInDenominator !== true
    || slots.status !== "identity_and_counts_frozen_semantics_pending_authenticated_legacy_runtime_observation") {
    fail("GROUP_WEB_DEPARTMENT_TASK_RUNTIME_SLOT_DENOMINATOR_INVALID", "status");
  }
  const data = task.legacyDataBoundary;
  if (data?.groupWebSourceId !== "yuzhou_group_web_enterprise_hr"
    || data?.table !== entry.legacyTable
    || data?.view !== entry.legacyView
    || data?.observedRows !== null
    || data?.receiptStatus !== "not_in_current_group_web_key_table_count_receipt"
    || data?.requiredSourceDiscovery?.length !== 7
    || data?.featureRequired !== true
    || !data?.emptyRule?.startsWith("zero_or_unknown_rows_never_remove")) {
    fail("GROUP_WEB_DEPARTMENT_TASK_RUNTIME_DATA_BOUNDARY_INVALID", "legacyDataBoundary");
  }
  const interaction = task.legacyInteractionTask;
  if (interaction?.runtimeStatus !== "not_observed"
    || interaction?.aspEntry !== entry.legacyUrl
    || interaction?.aspSlots !== 2
    || interaction?.controlSlots !== 13
    || interaction?.requestKeySlots !== 14
    || interaction?.formActionSlots !== 1
    || interaction?.transitionSlots !== 5
    || interaction?.requiredActionObservations?.length !== 11
    || interaction?.requiredConditionObservations?.length !== 11
    || interaction?.groupWebRoutineReferences?.length !== 0
    || interaction?.groupWebRoutineReferenceStatus !== "not_extracted_from_current_static_audit"
    || !interaction?.requiredRoutineObservation?.includes("empty_and_untriggered_branches")) {
    fail("GROUP_WEB_DEPARTMENT_TASK_RUNTIME_INTERACTION_FALSE_COMPLETION", "legacyInteractionTask");
  }
  if (task.legacyReportLayout?.status !== "not_observed"
    || task.legacyReportLayout?.requiredObservations?.length !== 12
    || task.legacyReportLayout?.requiredObservationCount !== 12
    || task.legacyReportLayout?.modernAcceptance?.length !== 4) {
    fail("GROUP_WEB_DEPARTMENT_TASK_RUNTIME_LAYOUT_FALSE_COMPLETION", "legacyReportLayout");
  }
  const modern = task.modernRuntimeContract;
  if (modern?.mappedRoute !== "/hr/performance"
    || modern?.supportingRoute !== "/hr/goals"
    || modern?.goalCycleStatusVocabulary?.length !== 3
    || modern?.goalStatusVocabulary?.length !== 4
    || modern?.goalLevelVocabulary?.length !== 3
    || modern?.metricTypeVocabulary?.length !== 5
    || modern?.transitionMatrix?.length !== 5
    || JSON.stringify(modern?.roleMatrix?.map(row => row.role)) !== JSON.stringify(EXPECTED_ROLES)
    || modern?.apiTasks?.length !== 11
    || modern?.browserTask?.viewports?.length !== 2
    || JSON.stringify(modern?.browserTask?.viewports?.map(viewport => viewport.width)) !== JSON.stringify([1440, 390])
    || modern?.browserTask?.checks?.length !== 9) {
    fail("GROUP_WEB_DEPARTMENT_TASK_RUNTIME_MATRIX_INVALID", "modernRuntimeContract");
  }
  const expectedUnreachable = ["cycle_action", "change_goal", "goal_action", "checkins"];
  if (JSON.stringify(modern.apiTasks.filter(item => !item.webReachable).map(item => item.id)) !== JSON.stringify(expectedUnreachable)) {
    fail("GROUP_WEB_DEPARTMENT_TASK_RUNTIME_WEB_GAP_INVALID", "apiTasks");
  }
  const evidence = task.runtimeEvidence;
  const expectedEvidence = {
    requiredLegacyEntryObservations: 1,
    requiredLegacyAspBindings: 2,
    requiredLegacyControlBindings: 13,
    requiredLegacyRequestKeyBindings: 14,
    requiredLegacyFormActionBindings: 1,
    requiredLegacyStateTransitionBindings: 5,
    requiredLegacyActionObservations: 11,
    requiredLegacyConditionObservations: 11,
    requiredLegacyReportLayoutObservations: 12,
    requiredGroupWebTableCountReceipts: 1,
    requiredGroupWebTableViewFieldMaps: 2,
    requiredModernApiObservations: 11,
    requiredModernBrowserObservations: 18,
  };
  for (const [key, expected] of Object.entries(expectedEvidence)) {
    if (evidence?.[key] !== expected) fail("GROUP_WEB_DEPARTMENT_TASK_RUNTIME_EVIDENCE_GATE_INVALID", key);
  }
  if (evidence.requiredPairing !== "same_entry_hash_bound_redacted_legacy_and_decided_modern_route_observation_pair"
    || evidence.sensitiveScan !== "required_pass"
    || evidence.credentialsExcluded !== true
    || evidence.personalValuesExcluded !== true
    || evidence.payrollValuesExcluded !== true
    || evidence.attachmentBinariesExcluded !== true) {
    fail("GROUP_WEB_DEPARTMENT_TASK_RUNTIME_EVIDENCE_GATE_INVALID", "sensitiveBoundary");
  }
  for (const gap of REQUIRED_GAPS) {
    if (!task.blockingGaps?.includes(gap) || !task.implementationGaps?.some(item => item.id === gap)) {
      fail("GROUP_WEB_DEPARTMENT_TASK_RUNTIME_IMPLEMENTATION_GAP_MISSING", gap);
    }
  }
  const legacyGap = task.implementationGaps.find(item => item.id === REQUIRED_GAPS[0]);
  if (!legacyGap?.acceptance?.includes("no_unmapped_slot")
    || !legacyGap?.acceptance?.includes("no_empty_or_untriggered_branch_removed")) {
    fail("GROUP_WEB_DEPARTMENT_TASK_RUNTIME_LEGACY_GAP_INVALID", "implementationGaps");
  }
  const routeGap = task.implementationGaps.find(item => item.id === REQUIRED_GAPS[2]);
  if (!routeGap?.implementationAction?.includes("decide_one_canonical_modern_route_for_legacy_id_92")
    || !routeGap?.acceptance?.includes("immutable_version_relation")) {
    fail("GROUP_WEB_DEPARTMENT_TASK_RUNTIME_ROUTE_GAP_INVALID", "implementationGaps");
  }
  const webGap = task.implementationGaps.find(item => item.id === REQUIRED_GAPS[3]);
  if (!webGap?.implementationAction?.includes("add_typed_cycle_and_goal_action_wrappers")
    || !webGap?.acceptance?.includes("desktop_and_390px")) {
    fail("GROUP_WEB_DEPARTMENT_TASK_RUNTIME_WEB_GAP_INVALID", "implementationGaps");
  }
}

function verifySources(task, { moduleMapping, sourceAudit, reconciliation, readTarget }) {
  assertTask(task);
  const sources = [moduleMapping, sourceAudit, reconciliation];
  for (let index = 0; index < SOURCE_PATHS.length; index += 1) {
    if (task.sourceContracts[index].canonicalSha256 !== canonical(sources[index])) {
      fail("GROUP_WEB_DEPARTMENT_TASK_RUNTIME_SOURCE_DRIFT", SOURCE_PATHS[index]);
    }
  }
  const expected = task.legacyEntry;
  const module = moduleMapping.items?.find(item => item.legacyId === 92);
  if (!module || module.name !== expected.name || module.legacyUrl !== expected.legacyUrl
    || module.legacyTable !== expected.legacyTable || module.legacyView !== expected.legacyView
    || JSON.stringify(module.targetRoutes) !== JSON.stringify(expected.mappedTargetRoutes)) {
    fail("GROUP_WEB_DEPARTMENT_TASK_RUNTIME_MODULE_DRIFT", "legacyId=92");
  }
  const audit = sourceAudit.items?.find(item => item.legacyId === 92);
  for (const key of ["traversedAspFiles", "forms", "controls", "requestKeys", "formActions", "selectStatements", "insertStatements", "updateStatements", "deleteStatements", "stateTransitions", "fieldEvidenceHash"]) {
    if (audit?.[key] !== expected[key]) fail("GROUP_WEB_DEPARTMENT_TASK_RUNTIME_AUDIT_DRIFT", `92:${key}`);
  }
  if (audit?.entryResolved !== true) fail("GROUP_WEB_DEPARTMENT_TASK_RUNTIME_AUDIT_DRIFT", "92:entryResolved");
  const groupWeb = reconciliation.sources?.groupWeb;
  if (reconciliation.status !== "reviewed_read_only_baseline"
    || groupWeb?.sourceId !== task.legacyDataBoundary.groupWebSourceId
    || groupWeb?.catalog?.schemaHash !== task.legacyDataBoundary.groupWebCatalogHash
    || groupWeb?.catalog?.procedures !== 340
    || groupWeb?.catalog?.functions !== 9
    || groupWeb?.catalog?.triggers !== 79
    || reconciliation.migrationPolicy?.operationMode !== "read_only_inventory_and_reconciliation"
    || reconciliation.migrationPolicy?.productionImport !== "HOLD") {
    fail("GROUP_WEB_DEPARTMENT_TASK_RUNTIME_GROUP_WEB_SOURCE_DRIFT", "legacyDataBoundary");
  }
  if (JSON.stringify(groupWeb).includes(task.legacyDataBoundary.table)) {
    fail("GROUP_WEB_DEPARTMENT_TASK_RUNTIME_TABLE_RECEIPT_DRIFT", task.legacyDataBoundary.table);
  }
  for (const source of task.modernSourceEvidence) {
    const text = readTarget(source.path);
    for (const token of source.requiredTokens) {
      if (typeof text !== "string" || !text.includes(token)) {
        fail("GROUP_WEB_DEPARTMENT_TASK_RUNTIME_MODERN_EVIDENCE_MISSING", source.path);
      }
    }
    for (const token of source.forbiddenTokens ?? []) {
      if (text.includes(token)) fail("GROUP_WEB_DEPARTMENT_TASK_RUNTIME_MODERN_GAP_DRIFT", source.path);
    }
  }
  return {
    status: "READY_NOT_EXECUTED",
    candidateId: task.candidate.id,
    taskReadyIncrement: 1,
    runtimeCoverageIncrement: 0,
    compatibilityScoreContribution: 0,
    proven: {
      legacyEntriesFrozen: 1,
      legacyAspSlots: 2,
      legacyControlSlots: 13,
      legacyRequestKeySlots: 14,
      legacyFormActionSlots: 1,
      legacyStateTransitionSlots: 5,
      unknownRowsStillRequired: true,
      modernApiTasksFrozen: 11,
      webUnreachableApiTasksFrozen: 4,
      desktopAndPhoneTaskFrozen: true,
    },
    stillRequired: {
      legacyEntryObservations: 1,
      legacyAspBindings: 2,
      legacyControlBindings: 13,
      legacyRequestKeyBindings: 14,
      legacyStateTransitionBindings: 5,
      legacyActionObservations: 11,
      legacyConditionObservations: 11,
      legacyReportLayoutObservations: 12,
      groupWebTableCountReceipts: 1,
      groupWebTableViewFieldMaps: 2,
      groupWebRoutineCallChain: true,
      modernApiObservations: 11,
      modernBrowserObservations: 18,
      canonicalRouteDecision: true,
      legacyToModernPairedParity: true,
    },
    implementationGaps: task.implementationGaps.map(gap => gap.id),
    coverageCredit: task.coverageCredit,
    productionImport: "HOLD",
  };
}

export function verifyGroupWebDepartmentTaskRuntimeTaskSources(task, sources) {
  return verifySources(task, sources);
}

export function verifyGroupWebDepartmentTaskRuntimeTask(root, task) {
  const canonicalRoot = realpathSync(root);
  const prefix = `${canonicalRoot}${sep}`;
  const loaded = [];
  for (const source of task.sourceContracts ?? []) {
    const path = resolve(canonicalRoot, source.path);
    const stat = lstatSync(path);
    const real = realpathSync(path);
    if (stat.isSymbolicLink() || !stat.isFile() || !real.startsWith(prefix)) {
      fail("GROUP_WEB_DEPARTMENT_TASK_RUNTIME_SOURCE_PATH_INVALID", source.path);
    }
    const bytes = readFileSync(real);
    if (sha(bytes) !== source.rawSha256) {
      fail("GROUP_WEB_DEPARTMENT_TASK_RUNTIME_SOURCE_RAW_HASH_DRIFT", source.path);
    }
    loaded.push(JSON.parse(bytes.toString("utf8")));
  }
  const readTarget = relativePath => {
    const path = resolve(canonicalRoot, relativePath);
    const stat = lstatSync(path);
    const real = realpathSync(path);
    if (stat.isSymbolicLink() || !stat.isFile() || !real.startsWith(prefix)) {
      fail("GROUP_WEB_DEPARTMENT_TASK_RUNTIME_TARGET_PATH_INVALID", relativePath);
    }
    return readFileSync(real, "utf8");
  };
  return verifySources(task, {
    moduleMapping: loaded[0],
    sourceAudit: loaded[1],
    reconciliation: loaded[2],
    readTarget,
  });
}
