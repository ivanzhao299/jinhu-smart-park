import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { resolve, sep } from "node:path";

export class GroupWebEmployeeInformationRuntimeTaskError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "GroupWebEmployeeInformationRuntimeTaskError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new GroupWebEmployeeInformationRuntimeTaskError(code, detail); };
const sha = value => createHash("sha256").update(value).digest("hex");
const canonical = value => sha(`${JSON.stringify(value)}\n`);
const SOURCE_PATHS = Object.freeze([
  "scripts/hr-cutover/contracts/legacy-group-web-module-mapping-v1.json",
  "scripts/hr-cutover/contracts/legacy-group-web-source-audit-v1.json",
  "scripts/hr-cutover/contracts/yuzhou-employee-basic-profile-source-evidence-v1.json",
]);
const EXPECTED_COVERAGE = Object.freeze({
  groupWebNavigableEntries: { numerator: 0, denominator: 186 },
  legacyInteractionParity: { numerator: 0, denominator: 6 },
});
const EXPECTED_ROLE_MATRIX = Object.freeze([
  { role: "hr_manager", permissions: ["hr:employees", "hr:employee:read", "hr:employee_profile:manage"], directoryScope: "tenant_park", profileProjection: "full" },
  { role: "department_manager", permissions: ["hr:employees", "hr:employee:team_read", "hr:employee_profile:team_read"], directoryScope: "managed_org_tree", profileProjection: "masked" },
  { role: "employee_self_service", permissions: ["hr:employees", "hr:employee:self_read", "hr:employee_profile:self_read"], directoryScope: "self", profileProjection: "self_masked" },
  { role: "no_employee_permission", permissions: [], directoryScope: "none", profileProjection: "none" },
]);
const EXPECTED_STATUSES = Object.freeze(["preboarding", "probation", "active", "suspended", "departed"]);

function assertTask(task) {
  if (task?.formatVersion !== 1
    || task.contractKind !== "yuzhou_hr_group_web_employee_information_modern_runtime_task"
    || task.taskVersion !== "employee-information-modern-runtime-1.0.0"
    || task.executionBoundary !== "isolated_lab_only") {
    fail("GROUP_WEB_EMPLOYEE_RUNTIME_TASK_INVALID", "identity");
  }
  if (task.status !== "ready_not_executed"
    || task.runtimeEvidence?.status !== "not_observed"
    || task.compatibilityScoreContribution !== 0
    || task.productionImport !== "HOLD") {
    fail("GROUP_WEB_EMPLOYEE_RUNTIME_FALSE_COMPLETION", "root");
  }
  if (JSON.stringify(task.coverageCredit) !== JSON.stringify(EXPECTED_COVERAGE)) {
    fail("GROUP_WEB_EMPLOYEE_RUNTIME_COVERAGE_INVALID", "coverageCredit");
  }
  if (task.candidate?.id !== "GROUP-WEB-INTERACTION-35-EMPLOYEE-INFORMATION"
    || task.candidate.legacyId !== 35
    || task.candidate.targetRoute !== "/hr/employees"
    || task.candidate.currentStaticEvidence?.score !== 90
    || task.candidate.currentStaticEvidence?.implementationStatus !== "partial"
    || JSON.stringify(task.candidate.currentStaticEvidence?.dimensions) !== JSON.stringify({
      ownershipMapped: true,
      productionRoute: true,
      apiBusinessFlow: true,
      persistentDataModel: true,
      legacyRuleParity: true,
      targetTechnicalUat: false,
      legacyRuntimeUat: false,
    })) {
    fail("GROUP_WEB_EMPLOYEE_RUNTIME_CANDIDATE_INVALID", "candidate");
  }
  if (JSON.stringify(task.sourceContracts?.map(source => source.path)) !== JSON.stringify(SOURCE_PATHS)) {
    fail("GROUP_WEB_EMPLOYEE_RUNTIME_SOURCE_SET_INVALID", "sourceContracts");
  }
  const fields = Object.values(task.legacyFieldGroups ?? {}).flat();
  if (fields.length !== 43 || new Set(fields).size !== 43
    || task.legacyStaticContract?.enumeratedFields !== 43
    || task.legacyStaticContract?.controls - fields.length !== task.legacyStaticContract?.unenumeratedControls) {
    fail("GROUP_WEB_EMPLOYEE_RUNTIME_FIELD_DENOMINATOR_INVALID", "legacyFieldGroups");
  }
  if (!Array.isArray(task.fieldBindings) || task.fieldBindings.length !== fields.length
    || new Set(task.fieldBindings.map(binding => binding.legacyField)).size !== fields.length
    || task.fieldBindings.some(binding => !fields.includes(binding.legacyField)
      || (binding.modernTarget !== null && (typeof binding.modernTarget !== "string" || !binding.modernTarget))
      || typeof binding.disposition !== "string"
      || !/(?:requires|blocked|unresolved)/u.test(binding.disposition)
      || /(?:verified|complete|pass)/iu.test(binding.disposition))) {
    fail("GROUP_WEB_EMPLOYEE_RUNTIME_FIELD_BINDINGS_INVALID", "fieldBindings");
  }
  if (fields.some(field => !task.fieldBindings.some(binding => binding.legacyField === field))) {
    fail("GROUP_WEB_EMPLOYEE_RUNTIME_FIELD_BINDINGS_INCOMPLETE", "fieldBindings");
  }
  if (task.legacyInteractionSlots?.forms?.length !== 4
    || task.legacyInteractionSlots?.formActions?.length !== 1
    || task.legacyInteractionSlots?.stateTransitions?.length !== 6
    || task.legacyInteractionSlots?.slotStatus !== "static_slot_identity_frozen_semantics_pending_live_observation") {
    fail("GROUP_WEB_EMPLOYEE_RUNTIME_INTERACTION_DENOMINATOR_INVALID", "legacyInteractionSlots");
  }
  if (task.legacyReportLayout?.status !== "not_observed"
    || JSON.stringify(task.legacyReportLayout?.requiredObservation) !== JSON.stringify(["column_order", "filter_controls", "pagination", "sort_order", "print_or_export_controls", "empty_state"])
    || task.legacyReportLayout?.notApplicableDecisionAllowedOnlyAfter !== "authenticated_legacy_runtime_observation") {
    fail("GROUP_WEB_EMPLOYEE_RUNTIME_REPORT_FALSE_COMPLETION", "legacyReportLayout");
  }
  if (JSON.stringify(task.modernRuntimeContract?.statusVocabulary) !== JSON.stringify(EXPECTED_STATUSES)
    || JSON.stringify(task.modernRuntimeContract?.roleMatrix) !== JSON.stringify(EXPECTED_ROLE_MATRIX)
    || task.modernRuntimeContract?.apiTasks?.length !== 10
    || task.modernRuntimeContract?.browserTask?.viewports?.length !== 2
    || task.modernRuntimeContract?.browserTask?.checks?.length !== 4) {
    fail("GROUP_WEB_EMPLOYEE_RUNTIME_MATRIX_INVALID", "modernRuntimeContract");
  }
  if (task.runtimeEvidence.requiredLegacyFieldBindings !== 43
    || task.runtimeEvidence.requiredLegacyInteractionSlots !== 11
    || task.runtimeEvidence.requiredLegacyReportLayoutDecision !== 1
    || task.runtimeEvidence.requiredModernApiObservations !== 10
    || task.runtimeEvidence.requiredModernBrowserObservations !== 8
    || task.runtimeEvidence.requiredPairing !== "same_candidate_hash_bound_redacted_legacy_and_modern_observation_pair"
    || task.runtimeEvidence.sensitiveScan !== "required_pass"
    || task.runtimeEvidence.credentialsExcluded !== true
    || task.runtimeEvidence.personalValuesExcluded !== true) {
    fail("GROUP_WEB_EMPLOYEE_RUNTIME_EVIDENCE_GATE_INVALID", "runtimeEvidence");
  }
}

function verifySources(task, { moduleMapping, sourceAudit, profileEvidence, readTarget }) {
  assertTask(task);
  const sourceValues = [moduleMapping, sourceAudit, profileEvidence];
  for (let index = 0; index < SOURCE_PATHS.length; index += 1) {
    if (task.sourceContracts[index].canonicalSha256 !== canonical(sourceValues[index])) {
      fail("GROUP_WEB_EMPLOYEE_RUNTIME_SOURCE_DRIFT", SOURCE_PATHS[index]);
    }
  }
  const module = moduleMapping.items?.find(item => item.legacyId === 35);
  if (!module || module.name !== task.candidate.name || module.legacyUrl !== task.candidate.legacyUrl
    || module.domain !== task.candidate.domain || JSON.stringify(module.targetRoutes) !== JSON.stringify([task.candidate.targetRoute])) {
    fail("GROUP_WEB_EMPLOYEE_RUNTIME_MODULE_DRIFT", "legacyId=35");
  }
  const audit = sourceAudit.items?.find(item => item.legacyId === 35);
  const expectedAudit = task.legacyStaticContract;
  for (const key of ["entryResolved", "traversedAspFiles", "forms", "controls", "requestKeys", "formActions", "selectStatements", "insertStatements", "updateStatements", "deleteStatements", "stateTransitions", "fieldEvidenceHash"]) {
    if (audit?.[key] !== expectedAudit[key]) fail("GROUP_WEB_EMPLOYEE_RUNTIME_AUDIT_DRIFT", key);
  }
  if (profileEvidence.contractKind !== "yuzhou_hr_employee_basic_profile_source_evidence"
    || profileEvidence.legacyId !== 35
    || profileEvidence.legacyFieldEvidenceHash !== expectedAudit.fieldEvidenceHash
    || JSON.stringify(profileEvidence.fieldGroups) !== JSON.stringify(task.legacyFieldGroups)
    || profileEvidence.personalValuesRecorded !== false
    || profileEvidence.credentialsRecorded !== false
    || profileEvidence.targetControls?.productionImport !== "HOLD") {
    fail("GROUP_WEB_EMPLOYEE_RUNTIME_PROFILE_EVIDENCE_DRIFT", "legacyId=35");
  }
  for (const evidence of task.modernSourceEvidence) {
    const text = readTarget(evidence.path);
    for (const token of evidence.requiredTokens) {
      if (typeof text !== "string" || !text.includes(token)) {
        fail("GROUP_WEB_EMPLOYEE_RUNTIME_MODERN_EVIDENCE_MISSING", evidence.path);
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
      staticFieldDenominator: 43,
      staticInteractionSlots: 11,
      modernSourceContracts: task.modernSourceEvidence.length,
      modernRoleMatrix: task.modernRuntimeContract.roleMatrix.length,
      desktopAndPhoneTaskFrozen: true,
    },
    stillRequired: {
      legacyRuntimeFieldBindings: 43,
      legacyRuntimeInteractionSlots: 11,
      legacyReportLayoutDecision: 1,
      modernApiObservations: 10,
      modernBrowserObservations: 8,
      legacyToModernPairedParity: true,
    },
    coverageCredit: task.coverageCredit,
    compatibilityScoreContribution: 0,
    productionImport: "HOLD",
  };
}

export function verifyGroupWebEmployeeInformationRuntimeTaskSources(task, sources) {
  return verifySources(task, sources);
}

export function verifyGroupWebEmployeeInformationRuntimeTask(root, task) {
  const canonicalRoot = realpathSync(root);
  const prefix = `${canonicalRoot}${sep}`;
  const loaded = [];
  for (const source of task.sourceContracts ?? []) {
    const path = resolve(canonicalRoot, source.path);
    const stat = lstatSync(path);
    const real = realpathSync(path);
    if (stat.isSymbolicLink() || !stat.isFile() || !real.startsWith(prefix)) {
      fail("GROUP_WEB_EMPLOYEE_RUNTIME_SOURCE_PATH_INVALID", source.path);
    }
    const bytes = readFileSync(real);
    if (sha(bytes) !== source.rawSha256) fail("GROUP_WEB_EMPLOYEE_RUNTIME_SOURCE_RAW_HASH_DRIFT", source.path);
    loaded.push(JSON.parse(bytes.toString("utf8")));
  }
  const readTarget = relativePath => {
    const path = resolve(canonicalRoot, relativePath);
    const stat = lstatSync(path);
    const real = realpathSync(path);
    if (stat.isSymbolicLink() || !stat.isFile() || !real.startsWith(prefix)) {
      fail("GROUP_WEB_EMPLOYEE_RUNTIME_TARGET_PATH_INVALID", relativePath);
    }
    return readFileSync(real, "utf8");
  };
  return verifySources(task, {
    moduleMapping: loaded[0],
    sourceAudit: loaded[1],
    profileEvidence: loaded[2],
    readTarget,
  });
}
