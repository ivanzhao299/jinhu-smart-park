import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { resolve, sep } from "node:path";

export class GroupWebPerformanceReportRuntimeTaskError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "GroupWebPerformanceReportRuntimeTaskError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new GroupWebPerformanceReportRuntimeTaskError(code, detail); };
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
  traversedAspFiles: 5,
  forms: 3,
  controls: 17,
  requestKeys: 11,
  formActions: 1,
  selectStatements: 10,
  stateTransitions: 3,
});
const EXPECTED_ROLES = Object.freeze([
  "performance_report_park_reader",
  "performance_report_team_reader",
  "performance_report_self_reader",
  "performance_report_exporter",
  "performance_report_no_permission",
]);
const REQUIRED_GAPS = Object.freeze([
  "GROUP_WEB_PERFORMANCE_REPORT_LEGACY_QUERY_AND_ROUTINE_CHAIN_NOT_BOUND",
  "GROUP_WEB_PERFORMANCE_REPORT_CATALOG_AND_LAYOUT_NOT_BOUND",
  "GROUP_WEB_PERFORMANCE_REPORT_API_AND_PERMISSION_SURFACE_NOT_IMPLEMENTED",
  "GROUP_WEB_PERFORMANCE_REPORT_WEB_SURFACE_NOT_IMPLEMENTED",
]);

function assertTask(task) {
  if (task?.formatVersion !== 1
    || task.contractKind !== "yuzhou_hr_group_web_performance_report_center_modern_runtime_task"
    || task.taskVersion !== "performance-report-center-modern-runtime-1.0.0"
    || task.executionBoundary !== "isolated_lab_only") {
    fail("GROUP_WEB_PERFORMANCE_REPORT_RUNTIME_TASK_INVALID", "identity");
  }
  if (task.status !== "ready_not_executed"
    || task.runtimeEvidence?.status !== "not_observed"
    || task.compatibilityScoreContribution !== 0
    || task.productionImport !== "HOLD") {
    fail("GROUP_WEB_PERFORMANCE_REPORT_RUNTIME_FALSE_COMPLETION", "root");
  }
  if (JSON.stringify(task.coverageCredit) !== JSON.stringify(EXPECTED_COVERAGE)) {
    fail("GROUP_WEB_PERFORMANCE_REPORT_RUNTIME_COVERAGE_INVALID", "coverageCredit");
  }
  const candidate = task.candidate;
  if (candidate?.id !== "GROUP-WEB-INTERACTION-95-PERFORMANCE-REPORT-CENTER"
    || JSON.stringify(candidate.legacyIds) !== JSON.stringify([95])
    || candidate.actualModernRoute !== "/hr/performance"
    || candidate.currentStaticEvidence?.entryCount !== 1
    || candidate.currentStaticEvidence?.scoreEach !== 80
    || candidate.currentStaticEvidence?.implementationStatusEach !== "partial"
    || candidate.currentStaticEvidence?.dimensionsEach?.legacyRuleParity !== false
    || candidate.currentStaticEvidence?.dimensionsEach?.targetTechnicalUat !== false
    || candidate.currentStaticEvidence?.dimensionsEach?.legacyRuntimeUat !== false) {
    fail("GROUP_WEB_PERFORMANCE_REPORT_RUNTIME_CANDIDATE_INVALID", "candidate");
  }
  if (JSON.stringify(task.sourceContracts?.map(source => source.path)) !== JSON.stringify(SOURCE_PATHS)) {
    fail("GROUP_WEB_PERFORMANCE_REPORT_RUNTIME_SOURCE_SET_INVALID", "sourceContracts");
  }
  const entry = task.legacyEntry;
  if (entry?.legacyId !== 95
    || entry.name !== "报表中心"
    || entry.legacyUrl !== "performance/reportcenter/submain.asp"
    || entry.legacyTable !== null
    || entry.legacyView !== null
    || JSON.stringify(entry.mappedTargetRoutes) !== JSON.stringify(["/hr/performance"])) {
    fail("GROUP_WEB_PERFORMANCE_REPORT_RUNTIME_ENTRY_INVALID", "legacyEntry");
  }
  for (const [key, expected] of Object.entries(EXPECTED_SLOTS)) {
    if (entry[key] !== expected || task.legacyOpaqueSlots?.[key] !== expected) {
      fail("GROUP_WEB_PERFORMANCE_REPORT_RUNTIME_SLOT_DENOMINATOR_INVALID", key);
    }
  }
  const slots = task.legacyOpaqueSlots;
  if (slots.sourceColumnNamesClaimed !== false
    || slots.emptyOrNullSlotsRemainInDenominator !== true
    || slots.status !== "identity_and_counts_frozen_semantics_pending_authenticated_legacy_runtime_observation") {
    fail("GROUP_WEB_PERFORMANCE_REPORT_RUNTIME_SLOT_DENOMINATOR_INVALID", "status");
  }
  const data = task.legacyDataBoundary;
  if (data?.groupWebSourceId !== "yuzhou_group_web_enterprise_hr"
    || data?.legacyTable !== null
    || data?.legacyView !== null
    || data?.rowCount !== null
    || data?.rowCountDisposition !== "composite_report_entry_has_no_single_mapped_table_or_view_and_must_not_be_classified_as_empty"
    || data?.requiredSourceDiscovery?.length !== 6
    || data?.featureRequired !== true
    || !data?.emptyRule?.startsWith("no_single_table_or_zero_result_never_removes")) {
    fail("GROUP_WEB_PERFORMANCE_REPORT_RUNTIME_DATA_BOUNDARY_INVALID", "legacyDataBoundary");
  }
  const interaction = task.legacyInteractionTask;
  if (interaction?.runtimeStatus !== "not_observed"
    || interaction?.aspEntry !== entry.legacyUrl
    || interaction?.aspSlots !== 5
    || interaction?.controlSlots !== 17
    || interaction?.requestKeySlots !== 11
    || interaction?.formActionSlots !== 1
    || interaction?.selectSlots !== 10
    || interaction?.transitionSlots !== 3
    || interaction?.requiredActionObservations?.length !== 11
    || interaction?.requiredConditionObservations?.length !== 11
    || interaction?.groupWebRoutineReferences?.length !== 0
    || interaction?.groupWebRoutineReferenceStatus !== "not_extracted_from_current_static_audit"
    || !interaction?.requiredRoutineObservation?.includes("all_ten_selects")
    || !interaction?.requiredRoutineObservation?.includes("empty_and_untriggered_branches")) {
    fail("GROUP_WEB_PERFORMANCE_REPORT_RUNTIME_INTERACTION_FALSE_COMPLETION", "legacyInteractionTask");
  }
  if (task.legacyReportLayout?.status !== "not_observed"
    || task.legacyReportLayout?.requiredObservations?.length !== 13
    || task.legacyReportLayout?.requiredObservationCount !== 13
    || task.legacyReportLayout?.modernAcceptance?.length !== 4) {
    fail("GROUP_WEB_PERFORMANCE_REPORT_RUNTIME_LAYOUT_FALSE_COMPLETION", "legacyReportLayout");
  }
  const modern = task.modernRuntimeContract;
  if (modern?.currentReadInputs?.length !== 4
    || modern.currentReadInputs.some(item => item.status !== "implemented_static_not_runtime_verified")
    || modern?.requiredReportingApiTasks?.length !== 8
    || modern.requiredReportingApiTasks.some(item => item.status !== "missing")
    || modern?.requiredPermissionAtoms?.length !== 5
    || modern?.permissionAtomStatus !== "missing_dedicated_performance_report_atoms"
    || JSON.stringify(modern?.roleMatrix?.map(row => row.role)) !== JSON.stringify(EXPECTED_ROLES)
    || modern?.browserTask?.viewports?.length !== 2
    || JSON.stringify(modern?.browserTask?.viewports?.map(viewport => viewport.width)) !== JSON.stringify([1440, 390])
    || modern?.browserTask?.checks?.length !== 8) {
    fail("GROUP_WEB_PERFORMANCE_REPORT_RUNTIME_MATRIX_INVALID", "modernRuntimeContract");
  }
  const evidence = task.runtimeEvidence;
  const expectedEvidence = {
    requiredLegacyEntryObservations: 1,
    requiredLegacyAspBindings: 5,
    requiredLegacyControlBindings: 17,
    requiredLegacyRequestKeyBindings: 11,
    requiredLegacyFormActionBindings: 1,
    requiredLegacySelectBindings: 10,
    requiredLegacyStateTransitionBindings: 3,
    requiredLegacyActionObservations: 11,
    requiredLegacyConditionObservations: 11,
    requiredLegacyReportLayoutObservations: 13,
    requiredModernReadInputObservations: 4,
    requiredModernReportingApiObservations: 8,
    requiredModernBrowserObservations: 16,
  };
  for (const [key, expected] of Object.entries(expectedEvidence)) {
    if (evidence?.[key] !== expected) fail("GROUP_WEB_PERFORMANCE_REPORT_RUNTIME_EVIDENCE_GATE_INVALID", key);
  }
  if (evidence.requiredPairing !== "same_entry_hash_bound_redacted_legacy_and_modern_report_observation_pair"
    || evidence.sensitiveScan !== "required_pass"
    || evidence.credentialsExcluded !== true
    || evidence.personalValuesExcluded !== true
    || evidence.payrollValuesExcluded !== true
    || evidence.attachmentBinariesExcluded !== true) {
    fail("GROUP_WEB_PERFORMANCE_REPORT_RUNTIME_EVIDENCE_GATE_INVALID", "sensitiveBoundary");
  }
  for (const gap of REQUIRED_GAPS) {
    if (!task.blockingGaps?.includes(gap) || !task.implementationGaps?.some(item => item.id === gap)) {
      fail("GROUP_WEB_PERFORMANCE_REPORT_RUNTIME_IMPLEMENTATION_GAP_MISSING", gap);
    }
  }
  const legacyGap = task.implementationGaps.find(item => item.id === REQUIRED_GAPS[0]);
  if (!legacyGap?.acceptance?.includes("all_ten_selects_disposed")
    || !legacyGap?.acceptance?.includes("no_empty_or_untriggered_branch_removed")) {
    fail("GROUP_WEB_PERFORMANCE_REPORT_RUNTIME_LEGACY_GAP_INVALID", "implementationGaps");
  }
  const apiGap = task.implementationGaps.find(item => item.id === REQUIRED_GAPS[2]);
  if (!apiGap?.implementationAction?.includes("add_least_privilege_read_team_self_export_atoms")
    || !apiGap?.acceptance?.includes("screen_export_projection_match")
    || !apiGap?.acceptance?.includes("cross_scope_rows_and_binary_absent")) {
    fail("GROUP_WEB_PERFORMANCE_REPORT_RUNTIME_API_GAP_INVALID", "implementationGaps");
  }
  const webGap = task.implementationGaps.find(item => item.id === REQUIRED_GAPS[3]);
  if (!webGap?.implementationAction?.includes("render_desktop_table_and_390px_cards_with_shared_design_system")
    || !webGap?.acceptance?.includes("empty_result_preserves_parameters")) {
    fail("GROUP_WEB_PERFORMANCE_REPORT_RUNTIME_WEB_GAP_INVALID", "implementationGaps");
  }
}

function verifySources(task, { moduleMapping, sourceAudit, reconciliation, readTarget }) {
  assertTask(task);
  const sources = [moduleMapping, sourceAudit, reconciliation];
  for (let index = 0; index < SOURCE_PATHS.length; index += 1) {
    if (task.sourceContracts[index].canonicalSha256 !== canonical(sources[index])) {
      fail("GROUP_WEB_PERFORMANCE_REPORT_RUNTIME_SOURCE_DRIFT", SOURCE_PATHS[index]);
    }
  }
  const expected = task.legacyEntry;
  const module = moduleMapping.items?.find(item => item.legacyId === 95);
  if (!module || module.name !== expected.name || module.legacyUrl !== expected.legacyUrl
    || module.legacyTable !== null || module.legacyView !== null
    || JSON.stringify(module.targetRoutes) !== JSON.stringify(expected.mappedTargetRoutes)) {
    fail("GROUP_WEB_PERFORMANCE_REPORT_RUNTIME_MODULE_DRIFT", "legacyId=95");
  }
  const audit = sourceAudit.items?.find(item => item.legacyId === 95);
  for (const key of ["traversedAspFiles", "forms", "controls", "requestKeys", "formActions", "selectStatements", "insertStatements", "updateStatements", "deleteStatements", "stateTransitions", "fieldEvidenceHash"]) {
    if (audit?.[key] !== expected[key]) fail("GROUP_WEB_PERFORMANCE_REPORT_RUNTIME_AUDIT_DRIFT", `95:${key}`);
  }
  if (audit?.entryResolved !== true) fail("GROUP_WEB_PERFORMANCE_REPORT_RUNTIME_AUDIT_DRIFT", "95:entryResolved");
  const groupWeb = reconciliation.sources?.groupWeb;
  if (reconciliation.status !== "reviewed_read_only_baseline"
    || groupWeb?.sourceId !== task.legacyDataBoundary.groupWebSourceId
    || groupWeb?.catalog?.schemaHash !== task.legacyDataBoundary.groupWebCatalogHash
    || groupWeb?.catalog?.procedures !== 340
    || groupWeb?.catalog?.functions !== 9
    || groupWeb?.catalog?.triggers !== 79
    || reconciliation.migrationPolicy?.operationMode !== "read_only_inventory_and_reconciliation"
    || reconciliation.migrationPolicy?.productionImport !== "HOLD") {
    fail("GROUP_WEB_PERFORMANCE_REPORT_RUNTIME_GROUP_WEB_SOURCE_DRIFT", "legacyDataBoundary");
  }
  for (const source of task.modernSourceEvidence) {
    const text = readTarget(source.path);
    for (const token of source.requiredTokens) {
      if (typeof text !== "string" || !text.includes(token)) {
        fail("GROUP_WEB_PERFORMANCE_REPORT_RUNTIME_MODERN_EVIDENCE_MISSING", source.path);
      }
    }
    for (const token of source.forbiddenTokens ?? []) {
      if (text.includes(token)) fail("GROUP_WEB_PERFORMANCE_REPORT_RUNTIME_MODERN_GAP_DRIFT", source.path);
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
      legacyAspSlots: 5,
      legacyControlSlots: 17,
      legacyRequestKeySlots: 11,
      legacyFormActionSlots: 1,
      legacySelectSlots: 10,
      legacyStateTransitionSlots: 3,
      noSingleTableIsNotTreatedAsEmpty: true,
      currentModernReadInputs: 4,
      missingReportingApiTasksFrozen: 8,
      desktopAndPhoneTaskFrozen: true,
    },
    stillRequired: {
      legacyEntryObservations: 1,
      legacyAspBindings: 5,
      legacyControlBindings: 17,
      legacyRequestKeyBindings: 11,
      legacySelectBindings: 10,
      legacyActionObservations: 11,
      legacyConditionObservations: 11,
      legacyReportLayoutObservations: 13,
      groupWebRoutineCallChain: true,
      modernReadInputObservations: 4,
      modernReportingApiObservations: 8,
      modernBrowserObservations: 16,
      dedicatedReportPermissions: true,
      legacyToModernPairedParity: true,
    },
    implementationGaps: task.implementationGaps.map(gap => gap.id),
    coverageCredit: task.coverageCredit,
    productionImport: "HOLD",
  };
}

export function verifyGroupWebPerformanceReportRuntimeTaskSources(task, sources) {
  return verifySources(task, sources);
}

export function verifyGroupWebPerformanceReportRuntimeTask(root, task) {
  const canonicalRoot = realpathSync(root);
  const prefix = `${canonicalRoot}${sep}`;
  const loaded = [];
  for (const source of task.sourceContracts ?? []) {
    const path = resolve(canonicalRoot, source.path);
    const stat = lstatSync(path);
    const real = realpathSync(path);
    if (stat.isSymbolicLink() || !stat.isFile() || !real.startsWith(prefix)) {
      fail("GROUP_WEB_PERFORMANCE_REPORT_RUNTIME_SOURCE_PATH_INVALID", source.path);
    }
    const bytes = readFileSync(real);
    if (sha(bytes) !== source.rawSha256) {
      fail("GROUP_WEB_PERFORMANCE_REPORT_RUNTIME_SOURCE_RAW_HASH_DRIFT", source.path);
    }
    loaded.push(JSON.parse(bytes.toString("utf8")));
  }
  const readTarget = relativePath => {
    const path = resolve(canonicalRoot, relativePath);
    const stat = lstatSync(path);
    const real = realpathSync(path);
    if (stat.isSymbolicLink() || !stat.isFile() || !real.startsWith(prefix)) {
      fail("GROUP_WEB_PERFORMANCE_REPORT_RUNTIME_TARGET_PATH_INVALID", relativePath);
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
