import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { resolve, sep } from "node:path";

export class GroupWebDepartureChainRuntimeTaskError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "GroupWebDepartureChainRuntimeTaskError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new GroupWebDepartureChainRuntimeTaskError(code, detail); };
const sha = value => createHash("sha256").update(value).digest("hex");
const canonical = value => sha(`${JSON.stringify(value)}\n`);
const SOURCE_PATHS = Object.freeze([
  "scripts/hr-cutover/contracts/legacy-group-web-module-mapping-v1.json",
  "scripts/hr-cutover/contracts/legacy-group-web-source-audit-v1.json",
  "scripts/hr-cutover/contracts/yuzhou-departure-dual-source-evidence-v1.json",
]);
const EXPECTED_IDS = Object.freeze([42, 43, 44, 45, 46, 47]);
const EXPECTED_COVERAGE = Object.freeze({groupWebNavigableEntries:{numerator:0,denominator:186},legacyInteractionParity:{numerator:0,denominator:6}});
const EXPECTED_ROLES = Object.freeze(["park_departure_reader", "team_departure_reader", "self_departure_reader", "departure_operator", "departure_reviewer", "departure_interviewer", "departure_surveyor", "departure_handover_operator", "departure_wage_operator", "departure_archive_operator", "departure_applier", "no_departure_permission"]);
const REQUIRED_GAPS = Object.freeze(["GROUP_WEB_DEPARTURE_WAGE_ARCHIVE_ROUTE_MISMATCH", "GROUP_WEB_DEPARTURE_ARCHIVE_REOPEN_CORRECTION_NOT_IMPLEMENTED", "GROUP_WEB_DEPARTURE_LEGACY_PROCEDURE_AND_IDENTITY_EFFECTS_NOT_BOUND"]);

function assertTask(task) {
  if (task?.formatVersion !== 1 || task.contractKind !== "yuzhou_hr_group_web_departure_chain_modern_runtime_task" || task.taskVersion !== "departure-chain-modern-runtime-1.0.0" || task.executionBoundary !== "isolated_lab_only") fail("GROUP_WEB_DEPARTURE_CHAIN_RUNTIME_TASK_INVALID", "identity");
  if (task.status !== "ready_not_executed" || task.runtimeEvidence?.status !== "not_observed" || task.compatibilityScoreContribution !== 0 || task.productionImport !== "HOLD") fail("GROUP_WEB_DEPARTURE_CHAIN_RUNTIME_FALSE_COMPLETION", "root");
  if (JSON.stringify(task.coverageCredit) !== JSON.stringify(EXPECTED_COVERAGE)) fail("GROUP_WEB_DEPARTURE_CHAIN_RUNTIME_COVERAGE_INVALID", "coverageCredit");
  if (task.candidate?.id !== "GROUP-WEB-INTERACTION-42-47-DEPARTURE-CHAIN" || task.candidate.primaryLegacyId !== 42 || JSON.stringify(task.candidate.dependentLegacyIds) !== JSON.stringify([43,44,45,46,47]) || task.candidate.actualModernRoute !== "/hr/lifecycle" || task.candidate.currentStaticEvidence?.entryCount !== 6 || task.candidate.currentStaticEvidence?.scoreEach !== 90 || task.candidate.currentStaticEvidence?.implementationStatusEach !== "partial" || task.candidate.currentStaticEvidence?.dimensionsEach?.targetTechnicalUat !== false || task.candidate.currentStaticEvidence?.dimensionsEach?.legacyRuntimeUat !== false) fail("GROUP_WEB_DEPARTURE_CHAIN_RUNTIME_CANDIDATE_INVALID", "candidate");
  if (JSON.stringify(task.sourceContracts?.map(source => source.path)) !== JSON.stringify(SOURCE_PATHS)) fail("GROUP_WEB_DEPARTURE_CHAIN_RUNTIME_SOURCE_SET_INVALID", "sourceContracts");
  if (JSON.stringify(task.legacyEntries?.map(entry => entry.legacyId)) !== JSON.stringify(EXPECTED_IDS)) fail("GROUP_WEB_DEPARTURE_CHAIN_RUNTIME_ENTRY_SET_INVALID", "legacyEntries");
  const sums = key => task.legacyEntries.reduce((total, entry) => total + entry[key], 0);
  const slots = task.legacyEvidenceSlots;
  for (const [key, expected] of [["traversedAspFiles",14],["forms",6],["controls",74],["requestKeys",75],["formActions",6],["selectStatements",4],["stateTransitions",6]]) if (slots?.[key] !== expected || sums(key) !== expected) fail("GROUP_WEB_DEPARTURE_CHAIN_RUNTIME_SLOT_DENOMINATOR_INVALID", key);
  if (slots.sourceColumnNamesClaimed !== false || slots.status !== "identity_frozen_semantics_pending_authenticated_legacy_runtime_observation") fail("GROUP_WEB_DEPARTURE_CHAIN_RUNTIME_SLOT_DENOMINATOR_INVALID", "status");
  if (!Array.isArray(task.legacySemanticFields) || task.legacySemanticFields.length !== 25 || new Set(task.legacySemanticFields.map(field => `${field.legacyId}:${field.id}`)).size !== 25 || task.legacySemanticFields.some(field => !EXPECTED_IDS.includes(field.legacyId) || !field.legacyEvidenceField || !field.modernTargets?.length || !/(?:requires|blocked|unresolved)/u.test(field.disposition) || /(?:verified|complete|pass)/iu.test(field.disposition))) fail("GROUP_WEB_DEPARTURE_CHAIN_RUNTIME_FIELD_BINDINGS_INVALID", "legacySemanticFields");
  const emptyFeatures = [task.legacySourceDatabaseShape?.interview, task.legacySourceDatabaseShape?.handover];
  if (emptyFeatures.some(feature => feature?.rowCount !== 0 || feature.featureRequired !== true || feature.emptyDataDoesNotRemoveBehavior !== true)) fail("GROUP_WEB_DEPARTURE_CHAIN_RUNTIME_EMPTY_FEATURE_INVALID", "legacySourceDatabaseShape");
  if (task.legacyWorkflowRules?.runtimeStatus !== "not_observed" || task.legacyWorkflowRules?.requiredActionObservations?.length !== 16 || task.legacyWorkflowRules?.requiredConditionObservations?.length !== 12 || JSON.stringify(task.legacyWorkflowRules?.legacyProcedures) !== JSON.stringify(["sp_CloseDoc","sp_SetWageFlag"])) fail("GROUP_WEB_DEPARTURE_CHAIN_RUNTIME_WORKFLOW_FALSE_COMPLETION", "legacyWorkflowRules");
  if (task.legacyReportLayout?.status !== "not_observed" || task.legacyReportLayout?.requiredObservationCount !== 25 || Object.values(task.legacyReportLayout.requiredObservationByLegacyId ?? {}).flat().length !== 25 || task.legacyReportLayout?.notApplicableDecisionAllowedOnlyAfter !== "authenticated_legacy_runtime_observation") fail("GROUP_WEB_DEPARTURE_CHAIN_RUNTIME_REPORT_FALSE_COMPLETION", "legacyReportLayout");
  const modern = task.modernRuntimeContract;
  if (modern?.applicationStatuses?.length !== 6 || Object.values(modern?.clearanceStatuses ?? {}).flat().length !== 14 || modern?.transitionMatrix?.length !== 6 || JSON.stringify(modern?.roleMatrix?.map(row => row.role)) !== JSON.stringify(EXPECTED_ROLES) || modern?.roleMatrix?.[9]?.knownParityGap !== "legacy_reopen_has_no_modern_correction_action" || modern?.apiTasks?.length !== 28 || modern?.browserTask?.viewports?.length !== 2 || modern?.browserTask?.checks?.length !== 12) fail("GROUP_WEB_DEPARTURE_CHAIN_RUNTIME_MATRIX_INVALID", "modernRuntimeContract");
  const evidence = task.runtimeEvidence;
  const expectedEvidence = {requiredLegacyEntryObservations:6,requiredLegacyControlBindings:74,requiredLegacyRequestKeyBindings:75,requiredLegacyFormActionBindings:6,requiredLegacySemanticFieldBindings:25,requiredLegacyActionObservations:16,requiredLegacyConditionObservations:12,requiredLegacyReportLayoutObservations:25,requiredModernApiObservations:28,requiredModernBrowserObservations:24};
  for (const [key,value] of Object.entries(expectedEvidence)) if (evidence?.[key] !== value) fail("GROUP_WEB_DEPARTURE_CHAIN_RUNTIME_EVIDENCE_GATE_INVALID", key);
  if (evidence.requiredPairing !== "same_entry_hash_bound_redacted_legacy_and_modern_observation_pair" || evidence.sensitiveScan !== "required_pass" || evidence.credentialsExcluded !== true || evidence.personalValuesExcluded !== true || evidence.salaryValuesExcluded !== true) fail("GROUP_WEB_DEPARTURE_CHAIN_RUNTIME_EVIDENCE_GATE_INVALID", "sensitiveBoundary");
  for (const gap of REQUIRED_GAPS) if (!task.blockingGaps?.includes(gap) || !task.implementationGaps?.some(item => item.id === gap)) fail("GROUP_WEB_DEPARTURE_CHAIN_RUNTIME_IMPLEMENTATION_GAP_MISSING", gap);
  const reopen = task.implementationGaps.find(item => item.id === REQUIRED_GAPS[1]);
  if (!reopen?.implementationAction?.includes("hash_and_map_every_sp_CloseDoc_branch_even_when_source_rows_are_empty") || !reopen?.implementationAction?.includes("add_a_separate_permissioned_archive_correction_request_if_reopen_is_business_required") || !reopen?.acceptance?.includes("no_physical_reopen_or_history_rewrite")) fail("GROUP_WEB_DEPARTURE_CHAIN_RUNTIME_REOPEN_GAP_INVALID", "implementationGaps");
}

function verifySources(task, { moduleMapping, sourceAudit, departureEvidence, readTarget }) {
  assertTask(task);
  for (const [index, value] of [moduleMapping, sourceAudit, departureEvidence].entries()) if (task.sourceContracts[index].canonicalSha256 !== canonical(value)) fail("GROUP_WEB_DEPARTURE_CHAIN_RUNTIME_SOURCE_DRIFT", SOURCE_PATHS[index]);
  for (const expected of task.legacyEntries) {
    const module = moduleMapping.items?.find(item => item.legacyId === expected.legacyId);
    if (!module || module.name !== expected.name || module.legacyUrl !== expected.legacyUrl || module.legacyTable !== expected.legacyTable || module.legacyView !== expected.legacyView || JSON.stringify(module.targetRoutes) !== JSON.stringify(expected.mappedTargetRoutes)) fail("GROUP_WEB_DEPARTURE_CHAIN_RUNTIME_MODULE_DRIFT", `legacyId=${expected.legacyId}`);
    const audit = sourceAudit.items?.find(item => item.legacyId === expected.legacyId);
    for (const key of ["traversedAspFiles","forms","controls","requestKeys","formActions","selectStatements","stateTransitions","fieldEvidenceHash"]) if (audit?.[key] !== expected[key]) fail("GROUP_WEB_DEPARTURE_CHAIN_RUNTIME_AUDIT_DRIFT", `${expected.legacyId}:${key}`);
    if (audit?.entryResolved !== true || audit.insertStatements !== 0 || audit.updateStatements !== 0 || audit.deleteStatements !== 0) fail("GROUP_WEB_DEPARTURE_CHAIN_RUNTIME_AUDIT_DRIFT", `${expected.legacyId}:staticMutationBoundary`);
  }
  const group = departureEvidence.groupWeb;
  const rules = task.legacyWorkflowRules;
  if (JSON.stringify(departureEvidence.legacyIds) !== JSON.stringify(EXPECTED_IDS) || JSON.stringify(departureEvidence.legacyFieldEvidenceHashes) !== JSON.stringify(Object.fromEntries(task.legacyEntries.map(entry => [entry.legacyId,entry.fieldEvidenceHash]))) || JSON.stringify(group.applicationFields) !== JSON.stringify(rules.applicationFields) || JSON.stringify(group.approvalResults) !== JSON.stringify(rules.approvalResults) || JSON.stringify(group.applyGate) !== JSON.stringify(rules.applyGate) || JSON.stringify(group.clearances) !== JSON.stringify(rules.clearances) || JSON.stringify(group.legacyApplyEffects) !== JSON.stringify(rules.legacyApplyEffects) || JSON.stringify(group.legacyProcedures) !== JSON.stringify(rules.legacyProcedures) || JSON.stringify(group.database) !== JSON.stringify(Object.fromEntries(Object.entries(task.legacySourceDatabaseShape).map(([key,value]) => [key,{table:value.table,columnCount:value.columnCount,rowCount:value.rowCount}]))) || departureEvidence.operationMode !== "read_only" || departureEvidence.personalValuesRecorded !== false || departureEvidence.credentialsRecorded !== false || departureEvidence.databaseEvidenceContainsPersonalRows !== false || departureEvidence.targetControls?.productionImport !== "HOLD") fail("GROUP_WEB_DEPARTURE_CHAIN_RUNTIME_EVIDENCE_DRIFT", "legacyId=42-47");
  for (const evidence of task.modernSourceEvidence) {const text=readTarget(evidence.path);for (const token of evidence.requiredTokens) if (typeof text !== "string" || !text.includes(token)) fail("GROUP_WEB_DEPARTURE_CHAIN_RUNTIME_MODERN_EVIDENCE_MISSING", evidence.path);}
  return {status:"READY_NOT_EXECUTED",candidateId:task.candidate.id,taskReadyIncrement:1,runtimeCoverageIncrement:0,proven:{legacyEntriesFrozen:6,legacyControlSlots:74,legacyRequestKeySlots:75,legacySemanticFields:25,emptyFeatureTablesRetained:2,modernSourceContracts:task.modernSourceEvidence.length,modernRoles:12,desktopAndPhoneTaskFrozen:true},stillRequired:{legacyEntryObservations:6,legacyControlBindings:74,legacyRequestKeyBindings:75,legacyActionObservations:16,legacyConditionObservations:12,legacyReportLayoutObservations:25,modernApiObservations:28,modernBrowserObservations:24,wageArchiveRouteResolution:true,archiveCorrectionImplementation:true,procedureAndIdentityEffectBinding:true,legacyToModernPairedParity:true},implementationGaps:task.implementationGaps.map(gap=>gap.id),coverageCredit:task.coverageCredit,compatibilityScoreContribution:0,productionImport:"HOLD"};
}

export function verifyGroupWebDepartureChainRuntimeTaskSources(task, sources) { return verifySources(task, sources); }

export function verifyGroupWebDepartureChainRuntimeTask(root, task) {
  const canonicalRoot=realpathSync(root),prefix=`${canonicalRoot}${sep}`,loaded=[];
  for (const source of task.sourceContracts ?? []) {const path=resolve(canonicalRoot,source.path),stat=lstatSync(path),real=realpathSync(path);if(stat.isSymbolicLink()||!stat.isFile()||!real.startsWith(prefix))fail("GROUP_WEB_DEPARTURE_CHAIN_RUNTIME_SOURCE_PATH_INVALID",source.path);const bytes=readFileSync(real);if(sha(bytes)!==source.rawSha256)fail("GROUP_WEB_DEPARTURE_CHAIN_RUNTIME_SOURCE_RAW_HASH_DRIFT",source.path);loaded.push(JSON.parse(bytes.toString("utf8")));}
  const readTarget=relativePath=>{const path=resolve(canonicalRoot,relativePath),stat=lstatSync(path),real=realpathSync(path);if(stat.isSymbolicLink()||!stat.isFile()||!real.startsWith(prefix))fail("GROUP_WEB_DEPARTURE_CHAIN_RUNTIME_TARGET_PATH_INVALID",relativePath);return readFileSync(real,"utf8");};
  return verifySources(task,{moduleMapping:loaded[0],sourceAudit:loaded[1],departureEvidence:loaded[2],readTarget});
}
