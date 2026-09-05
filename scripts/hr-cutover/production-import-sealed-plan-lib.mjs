import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
export const DEFAULT_PRODUCTION_IMPORT_EXECUTION_CONTRACT = JSON.parse(readFileSync(resolve(ROOT, "scripts/hr-cutover/contracts/production-import-execution-v2.json"), "utf8"));

const SHA256 = /^[0-9a-f]{64}$/u;
const CODE_SHA = /^[0-9a-f]{40}$/u;
const OPERATION_ID = /^yzprod-import-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{12}$/u;
const ROLLBACK_OPERATION_ID = /^yzprod-rollback-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{12}$/u;
const SAFE_ALIAS = /^[a-z0-9][a-z0-9-]{5,63}$/u;
const SAFE_TABLE = /^[a-z][a-z0-9_]{1,95}$/u;
const SAFE_SCOPE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/u;
const SAFE_DEPENDENCY_ROLE = /^[a-z][a-z0-9_]{1,31}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const FORBIDDEN_KEY = /password|passwd|token|secret|connectionstring|credential|privatekey|bankaccount|idcard|insureaccount|employeename|fullname|mobile|phone|salaryamount|grosspay|netpay/iu;
const FORBIDDEN_PAYLOAD_SECRET_KEY = /(?:^|_)(?:password|passwd|secret|connection_string|private_key|access_token|refresh_token)(?:$|_)/iu;
const EXPECTED_TARGET_TABLES = {
  T0: ["sys_org", "hr_position", "hr_employee"],
  T1: ["hr_employment_event"],
  T2: ["hr_contract_type", "hr_contract", "hr_contract_change", "hr_contract_legacy_evidence"],
  T3: ["hr_attendance_import_batch", "hr_attendance_symbol_rule", "hr_attendance_calendar_source", "hr_attendance_day", "hr_insurance_policy", "hr_insurance_policy_item", "hr_employee_insurance_period", "hr_employee_insurance_item"],
};
const EXPECTED_TARGET_TABLE_RULES = structuredClone(DEFAULT_PRODUCTION_IMPORT_EXECUTION_CONTRACT.targetTableRules);
const CANONICALIZATION_VERSION = "yuzhou-production-import-canonical-json-v1";
const REQUIRED_APPROVAL_ROLES = ["hr_owner", "data_security_owner", "release_owner"];
const T5_NONFILE_PLAN_KEYS = ["privateStageSha256", "sourceSnapshotSha256", "sourceRestoreReceiptSha256", "sourceBusinessSha256", "t0DecisionArtifactSha256", "t0TargetIdentitySha256", "t0TargetScopeSha256", "recordCount", "actorId"];
const PERFORMANCE_RELATIONS_PLAN_KEYS = ["formatVersion", "bindingKind", "triple", "sourceConservationContractSha256", "sourceFactLocationReceiptSha256", "sourceFactLocationCanonicalSha256", "relationPayloadArtifactSha256", "identityDecisionArtifactSha256", "t0PhaseReceiptSha256", "migration305Sha256", "migration306Sha256", "sessionRows", "scoreSourceRows", "assignmentRows", "activeRelationMaps", "identityResolutionRows", "subjectUnmatchedRows", "blankAssessorRows", "forwardOrder", "rollbackOrder", "adapterStatus", "executionReachable", "productionImport"];

export class ProductionImportExecutionError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "ProductionImportExecutionError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new ProductionImportExecutionError(code, detail); };
const exactKeys = (value, required, optional, code, label) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code, `${label} must be an object`);
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) if (!allowed.has(key)) fail(code, `${label}.${key} is not allowed`);
  for (const key of required) if (!Object.hasOwn(value, key)) fail(code, `${label}.${key} is required`);
};
const assertSha = (value, code, label) => { if (!SHA256.test(value ?? "")) fail(code, `${label} must be SHA-256`); };
const canonicalJson = value => {
  if (value === null) return "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
};
const sha256 = value => createHash("sha256").update(value).digest("hex");
const same = (left, right) => canonicalJson(left) === canonicalJson(right);
export const computeProductionImportApprovalSetHash = approvalSet => sha256(`${canonicalJson(approvalSet)}\n`);
export const computeProductionImportTargetScopeHash = ({ tenantId, parkId }) => sha256(`yuzhou-hr-production-target-scope-v1\0${tenantId}\0${parkId}`);
export const computeProductionImportPayloadHash = payload => sha256(`${canonicalJson(payload)}\n`);
export const computeProductionImportPayloadBundleHash = bundle => sha256(`${canonicalJson(bundle)}\n`);

function scan(value, at = "$") {
  if (Array.isArray(value)) return value.forEach((child, index) => scan(child, `${at}[${index}]`));
  if (value && typeof value === "object") return Object.entries(value).forEach(([key, child]) => {
    if (FORBIDDEN_KEY.test(key)) fail("PRODUCTION_IMPORT_SEALED_PLAN_INVALID", `${at}.${key} is forbidden`);
    scan(child, `${at}.${key}`);
  });
}

export function computeSealedProductionImportPlanHash(plan) {
  const copy = structuredClone(plan);
  if (copy?.sealing && typeof copy.sealing === "object") delete copy.sealing.sealedPlanSha256;
  return sha256(`${canonicalJson(copy)}\n`);
}

function validateContract(contract) {
  exactKeys(contract, ["formatVersion", "contractKind", "contractVersion", "activation", "transactionIsolation", "phaseOrder", "rollbackOrder", "allowedDispositions", "beforeImageAlgorithm", "canonicalizationVersion", "targetScope", "identityResolution", "targetTables", "targetTableRules", "productionImport"], [], "PRODUCTION_IMPORT_EXECUTION_CONTRACT_INVALID", "contract");
  if (contract.formatVersion !== 2 || contract.contractKind !== "yuzhou_hr_production_import_execution" || contract.contractVersion !== "2026-08-29.2" || contract.transactionIsolation !== "SERIALIZABLE") fail("PRODUCTION_IMPORT_EXECUTION_CONTRACT_INVALID", "identity/version/isolation invalid");
  if (!same(contract.phaseOrder, ["T0", "T1", "T2", "T3"]) || !same(contract.rollbackOrder, ["T3", "T2", "T1", "T0"])) fail("PRODUCTION_IMPORT_EXECUTION_CONTRACT_INVALID", "phase order invalid");
  if (!same(contract.allowedDispositions, ["insert", "merge", "quarantine", "skip_approved"]) || contract.beforeImageAlgorithm !== "aes-256-gcm-external-kek-v1") fail("PRODUCTION_IMPORT_EXECUTION_CONTRACT_INVALID", "mutation contract invalid");
  if (contract.canonicalizationVersion !== CANONICALIZATION_VERSION) fail("PRODUCTION_IMPORT_EXECUTION_CONTRACT_INVALID", "canonicalization version invalid");
  if (!same(contract.targetScope, { kind: "tenant_park", hashAlgorithm: "yuzhou-hr-production-target-scope-v1" })) fail("PRODUCTION_IMPORT_EXECUTION_CONTRACT_INVALID", "target scope contract invalid");
  if (!same(contract.identityResolution, { sourceIdentity: "stable_source_identity_sha256", dependencyResolution: "sealed_record_dependency_graph_exact", dependencyModes: ["scope", "employee", "record_graph"], nameMatching: false, autoCreateLogin: false, overwrite: false })) fail("PRODUCTION_IMPORT_EXECUTION_CONTRACT_INVALID", "identity resolution invalid");
  if (!same(contract.targetTables, EXPECTED_TARGET_TABLES)) fail("PRODUCTION_IMPORT_EXECUTION_CONTRACT_INVALID", "target table allowlist invalid");
  if (!same(contract.targetTableRules, EXPECTED_TARGET_TABLE_RULES)) fail("PRODUCTION_IMPORT_EXECUTION_CONTRACT_INVALID", "target dependency rules invalid");
  exactKeys(contract.activation, ["status", "allowedTargets", "reasonCodes"], [], "PRODUCTION_IMPORT_EXECUTION_CONTRACT_INVALID", "activation");
  if (!Array.isArray(contract.activation.allowedTargets) || !Array.isArray(contract.activation.reasonCodes)) fail("PRODUCTION_IMPORT_EXECUTION_CONTRACT_INVALID", "activation invalid");
  for (const target of contract.activation.allowedTargets) {
    exactKeys(target, ["environment", "alias", "identitySha256", "targetScopeSha256"], [], "PRODUCTION_IMPORT_EXECUTION_CONTRACT_INVALID", "activation target");
    if (target.environment !== "production" || !SAFE_ALIAS.test(target.alias ?? "")) fail("PRODUCTION_IMPORT_EXECUTION_CONTRACT_INVALID", "activation target invalid");
    assertSha(target.identitySha256, "PRODUCTION_IMPORT_EXECUTION_CONTRACT_INVALID", "activation target identity");
    assertSha(target.targetScopeSha256, "PRODUCTION_IMPORT_EXECUTION_CONTRACT_INVALID", "activation target scope");
  }
  const held = contract.activation.status === "HOLD" && contract.productionImport === "HOLD" && contract.activation.allowedTargets.length === 0 && contract.activation.reasonCodes.length > 0;
  const active = contract.activation.status === "PASS" && contract.productionImport === "READY" && contract.activation.allowedTargets.length === 1 && contract.activation.reasonCodes.length === 0;
  if (!held && !active) fail("PRODUCTION_IMPORT_EXECUTION_CONTRACT_INVALID", "activation state invalid");
}

function validateTargetScope(scope, code = "PRODUCTION_IMPORT_TARGET_SCOPE_INVALID", label = "targetScope") {
  exactKeys(scope, ["tenantId", "parkId", "scopeSha256"], [], code, label);
  if (!SAFE_SCOPE_ID.test(scope.tenantId ?? "") || !SAFE_SCOPE_ID.test(scope.parkId ?? "")) fail(code, `${label} tenant/park invalid`);
  assertSha(scope.scopeSha256, code, `${label}.scopeSha256`);
  if (scope.scopeSha256 !== computeProductionImportTargetScopeHash(scope)) fail("PRODUCTION_IMPORT_TARGET_SCOPE_HASH_MISMATCH", `${label} hash differs`);
}

function validateT5NonfilePlanBinding(value, triple) {
  exactKeys(value, T5_NONFILE_PLAN_KEYS, [], "PRODUCTION_IMPORT_T5_NONFILE_PLAN_INVALID", "t5Nonfile");
  for (const key of ["privateStageSha256", "sourceSnapshotSha256", "sourceRestoreReceiptSha256", "sourceBusinessSha256", "t0DecisionArtifactSha256", "t0TargetIdentitySha256", "t0TargetScopeSha256"]) assertSha(value[key], "PRODUCTION_IMPORT_T5_NONFILE_PLAN_INVALID", `t5Nonfile.${key}`);
  if (value.sourceSnapshotSha256 !== triple.sourceSnapshotHash) fail("PRODUCTION_IMPORT_T5_NONFILE_PLAN_INVALID", "T5 source snapshot differs from C/S/M");
  if (!Number.isSafeInteger(value.recordCount) || value.recordCount <= 0) fail("PRODUCTION_IMPORT_T5_NONFILE_PLAN_INVALID", "T5 record count invalid");
  if (!UUID.test(value.actorId ?? "")) fail("PRODUCTION_IMPORT_T5_NONFILE_PLAN_INVALID", "T5 audit actor invalid");
  return structuredClone(value);
}

function validatePerformanceRelationsPlanBinding(value, triple) {
  exactKeys(value, PERFORMANCE_RELATIONS_PLAN_KEYS, [], "PRODUCTION_IMPORT_PERFORMANCE_RELATIONS_PLAN_INVALID", "performanceRelations");
  validateTriple(value.triple, "PRODUCTION_IMPORT_PERFORMANCE_RELATIONS_PLAN_INVALID", "performanceRelations.triple");
  if (!same(value.triple, triple)) fail("PRODUCTION_IMPORT_PERFORMANCE_RELATIONS_PLAN_INVALID", "performance relation C/S/M differs from parent plan");
  for (const key of ["sourceConservationContractSha256", "sourceFactLocationReceiptSha256", "sourceFactLocationCanonicalSha256", "relationPayloadArtifactSha256", "identityDecisionArtifactSha256", "t0PhaseReceiptSha256", "migration305Sha256", "migration306Sha256"]) assertSha(value[key], "PRODUCTION_IMPORT_PERFORMANCE_RELATIONS_PLAN_INVALID", `performanceRelations.${key}`);
  if (value.formatVersion !== 1
    || value.bindingKind !== "yuzhou_hr_production_import_performance_relations_held_binding"
    || value.sessionRows !== 7
    || value.scoreSourceRows !== 0
    || value.assignmentRows !== 117
    || value.activeRelationMaps !== 124
    || value.identityResolutionRows !== 234
    || value.subjectUnmatchedRows !== 108
    || value.blankAssessorRows !== 117
    || !same(value.forwardOrder, ["source_person_assignments", "identity_resolution"])
    || !same(value.rollbackOrder, ["identity_resolution", "source_person_assignments"])
    || value.adapterStatus !== "SCRIPT_READY_SCHEMA_CAPABILITY_REQUIRED"
    || value.executionReachable !== false
    || value.productionImport !== "HOLD") fail("PRODUCTION_IMPORT_PERFORMANCE_RELATIONS_EXECUTION_UNAVAILABLE", "performance relation binding must remain held and schema-capability gated");
  return structuredClone(value);
}

// A parent execution receipt includes sealedPlanSha256. Only its stable input
// contract belongs in the seal; the actual receipt is bound after parent apply.
export function validateProductionPerformanceFactIdentityPlanBinding(value, triple, parentPerformanceRelationsBinding) {
  const code = "PRODUCTION_IMPORT_PERFORMANCE_FACT_IDENTITY_BINDING_INVALID";
  const keys = [
    "formatVersion", "bindingKind", "triple", "contractArtifactSha256",
    "t0PhaseReceiptSha256", "parentPerformanceRelationsContractSha256",
    "expectedDimensionRows", "expectedMasterRows", "expectedFactRows",
    "expectedFactSetSha256", "migration308Sha256", "migration310Sha256",
    "factKinds", "rollbackOrder", "adapterStatus", "productionImport",
  ];
  exactKeys(value, keys, [], code, "performanceFactIdentity");
  validateTriple(value.triple, code, "performanceFactIdentity.triple");
  if (!same(value.triple, triple) || !parentPerformanceRelationsBinding) {
    fail(code, "the same C/S/M and parent performance relation contract are required");
  }
  const parent = validatePerformanceRelationsPlanBinding(parentPerformanceRelationsBinding, triple);
  for (const key of [
    "contractArtifactSha256", "t0PhaseReceiptSha256", "parentPerformanceRelationsContractSha256",
    "expectedFactSetSha256", "migration308Sha256", "migration310Sha256",
  ]) {
    if (typeof value[key] !== "string") fail(code, `${key} must be a SHA-256 string`);
    assertSha(value[key], code, key);
  }
  for (const key of ["expectedDimensionRows", "expectedMasterRows", "expectedFactRows"]) {
    if (!Number.isSafeInteger(value[key]) || value[key] < 0) fail(code, `${key} must be a non-negative safe integer`);
  }
  const emptyFactSetSha256 = "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945";
  if (value.formatVersion !== 1
    || value.bindingKind !== "yuzhou_hr_production_import_performance_fact_identity_binding"
    || value.parentPerformanceRelationsContractSha256 !== computeProductionImportPayloadHash(parent)
    || value.t0PhaseReceiptSha256 !== parent.t0PhaseReceiptSha256
    || value.expectedFactRows !== value.expectedDimensionRows + value.expectedMasterRows
    || (value.expectedFactRows === 0) !== (value.expectedFactSetSha256 === emptyFactSetSha256)
    || value.migration308Sha256 !== "ad77e0cf12cf73f98a5984835a9943a9e15c96cde37fe6bd95133845c711befa"
    || !same(value.factKinds, ["dimension_result", "master_result"])
    || !same(value.rollbackOrder, ["fact_identity", "performance_relations"])
    || value.adapterStatus !== "PRODUCTION_CAPABILITY_BOUND"
    || value.productionImport !== "HOLD") {
    fail(code, "fact identity metadata, conservation, parent binding or execution boundary differs");
  }
  return structuredClone(value);
}

function validatePayloadValue(value, label) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) fail("PRODUCTION_IMPORT_PAYLOAD_BUNDLE_INVALID", `${label} numeric values must be safe integers; decimal and money values must be strings`);
    return;
  }
  if (Array.isArray(value)) return value.forEach((child, index) => validatePayloadValue(child, `${label}[${index}]`));
  if (!value || typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) fail("PRODUCTION_IMPORT_PAYLOAD_BUNDLE_INVALID", `${label} contains a non-JSON value`);
  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = key.replaceAll(/([A-Z])/gu, "_$1").toLowerCase();
    if (FORBIDDEN_PAYLOAD_SECRET_KEY.test(normalizedKey)) fail("PRODUCTION_IMPORT_PAYLOAD_BUNDLE_INVALID", `${label}.${key} is a forbidden secret field`);
    validatePayloadValue(child, `${label}.${key}`);
  }
}

export function validateProductionImportPayloadBundle(bundle, { phase, targetScope, sourceBatchManifestSha256, canonicalizationVersion = CANONICALIZATION_VERSION } = {}) {
  exactKeys(bundle, ["formatVersion", "artifactKind", "phase", "targetScope", "canonicalizationVersion", "sourceBatchManifestSha256", "records"], [], "PRODUCTION_IMPORT_PAYLOAD_BUNDLE_INVALID", "payloadBundle");
  if (bundle.formatVersion !== 2 || bundle.artifactKind !== "yuzhou_hr_production_import_payload_bundle") fail("PRODUCTION_IMPORT_PAYLOAD_BUNDLE_INVALID", "identity invalid");
  if (!EXPECTED_TARGET_TABLES[bundle.phase] || (phase !== undefined && bundle.phase !== phase)) fail("PRODUCTION_IMPORT_PAYLOAD_BUNDLE_BINDING_MISMATCH", "phase differs");
  validateTargetScope(bundle.targetScope, "PRODUCTION_IMPORT_PAYLOAD_BUNDLE_INVALID", "payloadBundle.targetScope");
  if (targetScope !== undefined && !same(bundle.targetScope, targetScope)) fail("PRODUCTION_IMPORT_PAYLOAD_BUNDLE_BINDING_MISMATCH", "target scope differs");
  if (bundle.canonicalizationVersion !== canonicalizationVersion || bundle.canonicalizationVersion !== CANONICALIZATION_VERSION) fail("PRODUCTION_IMPORT_PAYLOAD_BUNDLE_BINDING_MISMATCH", "canonicalization version differs");
  assertSha(bundle.sourceBatchManifestSha256, "PRODUCTION_IMPORT_PAYLOAD_BUNDLE_INVALID", "sourceBatchManifestSha256");
  if (sourceBatchManifestSha256 !== undefined && bundle.sourceBatchManifestSha256 !== sourceBatchManifestSha256) fail("PRODUCTION_IMPORT_PAYLOAD_BUNDLE_BINDING_MISMATCH", "source batch manifest differs");
  if (!Array.isArray(bundle.records)) fail("PRODUCTION_IMPORT_PAYLOAD_BUNDLE_INVALID", "records must be an array");
  const seen = new Set();
  for (const [index, row] of bundle.records.entries()) {
    exactKeys(row, ["sourceIdentitySha256", "sourceRowSha256", "targetTable", "payloadSha256", "payload"], [], "PRODUCTION_IMPORT_PAYLOAD_BUNDLE_INVALID", `records[${index}]`);
    assertSha(row.sourceIdentitySha256, "PRODUCTION_IMPORT_PAYLOAD_BUNDLE_INVALID", `records[${index}].sourceIdentitySha256`);
    assertSha(row.sourceRowSha256, "PRODUCTION_IMPORT_PAYLOAD_BUNDLE_INVALID", `records[${index}].sourceRowSha256`);
    assertSha(row.payloadSha256, "PRODUCTION_IMPORT_PAYLOAD_BUNDLE_INVALID", `records[${index}].payloadSha256`);
    if (seen.has(row.sourceIdentitySha256)) fail("PRODUCTION_IMPORT_PAYLOAD_BUNDLE_INVALID", "duplicate source identity");
    seen.add(row.sourceIdentitySha256);
    if (!EXPECTED_TARGET_TABLES[bundle.phase].includes(row.targetTable)) fail("PRODUCTION_IMPORT_TARGET_TABLE_DENIED", `${bundle.phase}.${row.targetTable ?? "missing"}`);
    if (!row.payload || typeof row.payload !== "object" || Array.isArray(row.payload)) fail("PRODUCTION_IMPORT_PAYLOAD_BUNDLE_INVALID", `records[${index}].payload must be an object`);
    validatePayloadValue(row.payload, `records[${index}].payload`);
    if (row.payloadSha256 !== computeProductionImportPayloadHash(row.payload)) fail("PRODUCTION_IMPORT_PAYLOAD_HASH_MISMATCH", row.sourceIdentitySha256);
  }
  return structuredClone(bundle);
}

function validateRecord(record, phase, contract, identities) {
  exactKeys(record, ["sourceSystem", "sourceTable", "sourcePkCanonical", "sourceIdentitySha256", "sourceRowSha256", "payloadSha256", "plannedTargetTable", "dependencyMode", "dependencyRefs", "disposition"], ["targetTable", "targetId", "businessIdentitySha256", "expectedTargetBeforeSha256", "expectedTargetAfterSha256", "expectedTargetVersionBefore", "targetVersionAfter", "decisionAttestationSha256", "beforeImage", "quarantine"], "PRODUCTION_IMPORT_SEALED_PLAN_INVALID", `${phase}.record`);
  if (record.sourceSystem !== "yuzhou-v10" || !/^dbo\.[A-Za-z0-9_]{1,128}$/u.test(record.sourceTable ?? "")) fail("PRODUCTION_IMPORT_SOURCE_PROVENANCE_INVALID", `${phase}.source table invalid`);
  assertSha(record.sourceIdentitySha256, "PRODUCTION_IMPORT_SEALED_PLAN_INVALID", "source identity");
  assertSha(record.sourceRowSha256, "PRODUCTION_IMPORT_SEALED_PLAN_INVALID", "source row");
  assertSha(record.payloadSha256, "PRODUCTION_IMPORT_SEALED_PLAN_INVALID", "payload");
  if (record.sourcePkCanonical !== `sha256:${record.sourceIdentitySha256}`) fail("PRODUCTION_IMPORT_SOURCE_PROVENANCE_INVALID", `${phase}.sourcePkCanonical differs`);
  if (identities.has(record.sourceIdentitySha256)) fail("PRODUCTION_IMPORT_SEALED_PLAN_INVALID", `${phase} duplicate source identity`);
  identities.add(record.sourceIdentitySha256);
  if (!contract.allowedDispositions.includes(record.disposition)) fail("PRODUCTION_IMPORT_DISPOSITION_INVALID", record.disposition);
  if (!SAFE_TABLE.test(record.plannedTargetTable ?? "") || !contract.targetTables[phase]?.includes(record.plannedTargetTable)) fail("PRODUCTION_IMPORT_TARGET_TABLE_DENIED", `${phase}.${record.plannedTargetTable ?? "missing"}`);
  if (!contract.identityResolution.dependencyModes.includes(record.dependencyMode) || !Array.isArray(record.dependencyRefs)) fail("PRODUCTION_IMPORT_DEPENDENCY_INVALID", `${phase}.${record.plannedTargetTable}`);
  if (record.disposition !== "quarantine") {
    if (record.targetTable !== record.plannedTargetTable) fail("PRODUCTION_IMPORT_TARGET_TABLE_DENIED", `${phase} actual target differs from planned target`);
    if (!UUID.test(record.targetId ?? "")) fail("PRODUCTION_IMPORT_SEALED_PLAN_INVALID", `${phase}.targetId invalid`);
    assertSha(record.businessIdentitySha256, "PRODUCTION_IMPORT_SEALED_PLAN_INVALID", `${phase}.businessIdentitySha256`);
    if (!Number.isSafeInteger(record.targetVersionAfter) || record.targetVersionAfter < 0) fail("PRODUCTION_IMPORT_TARGET_VERSION_INVALID", `${phase}.targetVersionAfter`);
  } else {
    for (const key of ["businessIdentitySha256", "expectedTargetVersionBefore", "targetVersionAfter"]) if (record[key] !== undefined) fail("PRODUCTION_IMPORT_TARGET_VERSION_INVALID", `${phase}.${key} forbidden for quarantine`);
  }
  if (["merge", "skip_approved"].includes(record.disposition)) assertSha(record.expectedTargetBeforeSha256, "PRODUCTION_IMPORT_CAS_PRECONDITION_REQUIRED", `${phase}.expectedTargetBeforeSha256`);
  else if (record.expectedTargetBeforeSha256 !== undefined) fail("PRODUCTION_IMPORT_SEALED_PLAN_INVALID", `${phase}.unexpected CAS precondition`);
  if (["merge", "skip_approved"].includes(record.disposition)) {
    if (!Number.isSafeInteger(record.expectedTargetVersionBefore) || record.expectedTargetVersionBefore < 0) fail("PRODUCTION_IMPORT_TARGET_VERSION_INVALID", `${phase}.expectedTargetVersionBefore`);
    const expectedAfter = record.disposition === "merge" ? record.expectedTargetVersionBefore + 1 : record.expectedTargetVersionBefore;
    if (!Number.isSafeInteger(expectedAfter) || record.targetVersionAfter !== expectedAfter) fail("PRODUCTION_IMPORT_TARGET_VERSION_INVALID", `${phase}.target version transition invalid`);
  } else if (record.expectedTargetVersionBefore !== undefined) fail("PRODUCTION_IMPORT_TARGET_VERSION_INVALID", `${phase}.unexpected target version precondition`);
  if (record.disposition === "insert" && record.targetVersionAfter !== 1) fail("PRODUCTION_IMPORT_TARGET_VERSION_INVALID", `${phase}.insert must create version 1`);
  if (["insert", "merge", "skip_approved"].includes(record.disposition)) assertSha(record.expectedTargetAfterSha256, "PRODUCTION_IMPORT_SEALED_PLAN_INVALID", `${phase}.expectedTargetAfterSha256`);
  if (record.disposition === "skip_approved" && record.expectedTargetAfterSha256 !== record.expectedTargetBeforeSha256) fail("PRODUCTION_IMPORT_CAS_PRECONDITION_REQUIRED", `${phase}.skip_approved must preserve target`);
  if (["merge", "quarantine", "skip_approved"].includes(record.disposition)) assertSha(record.decisionAttestationSha256, "PRODUCTION_IMPORT_DECISION_REQUIRED", `${phase}.decisionAttestationSha256`);
  if (record.disposition === "merge") {
    exactKeys(record.beforeImage, ["algorithm", "plaintextSha256", "ciphertextSha256", "keyReferenceSha256"], [], "PRODUCTION_IMPORT_BEFORE_IMAGE_INVALID", `${phase}.beforeImage`);
    if (record.beforeImage.algorithm !== contract.beforeImageAlgorithm) fail("PRODUCTION_IMPORT_BEFORE_IMAGE_INVALID", "algorithm invalid");
    for (const key of ["plaintextSha256", "ciphertextSha256", "keyReferenceSha256"]) assertSha(record.beforeImage[key], "PRODUCTION_IMPORT_BEFORE_IMAGE_INVALID", `${phase}.beforeImage.${key}`);
    if (record.beforeImage.plaintextSha256 !== record.expectedTargetBeforeSha256) fail("PRODUCTION_IMPORT_CAS_PRECONDITION_REQUIRED", `${phase}.before image differs from CAS precondition`);
  } else if (record.beforeImage !== undefined) fail("PRODUCTION_IMPORT_BEFORE_IMAGE_INVALID", `${phase}.before image is merge-only`);
  if (record.disposition === "quarantine") {
    exactKeys(record.quarantine, ["reasonCode", "algorithm", "payloadCiphertextSha256", "keyReferenceSha256"], [], "PRODUCTION_IMPORT_QUARANTINE_INVALID", `${phase}.quarantine`);
    if (!/^[A-Z][A-Z0-9_]{2,63}$/u.test(record.quarantine.reasonCode ?? "")) fail("PRODUCTION_IMPORT_QUARANTINE_INVALID", "reason code invalid");
    if (record.quarantine.algorithm !== contract.beforeImageAlgorithm) fail("PRODUCTION_IMPORT_QUARANTINE_INVALID", "algorithm invalid");
    assertSha(record.quarantine.payloadCiphertextSha256, "PRODUCTION_IMPORT_QUARANTINE_INVALID", "payload ciphertext");
    assertSha(record.quarantine.keyReferenceSha256, "PRODUCTION_IMPORT_QUARANTINE_INVALID", "payload key reference");
    for (const key of ["targetTable", "targetId", "expectedTargetAfterSha256"]) if (record[key] !== undefined) fail("PRODUCTION_IMPORT_QUARANTINE_INVALID", `${key} forbidden`);
  } else if (record.quarantine !== undefined) fail("PRODUCTION_IMPORT_QUARANTINE_INVALID", `${phase}.quarantine is quarantine-only`);
}

function validateDependencyGraph(plan, contract) {
  const phaseOrdinal = new Map(contract.phaseOrder.map((phase, index) => [phase, index]));
  const records = new Map();
  const activeTargets = new Set();
  for (const phase of plan.phases) for (const [recordIndex, record] of phase.records.entries()) records.set(`${phase.phase}:${record.sourceIdentitySha256}`, { phase: phase.phase, recordIndex, record });
  for (const phase of plan.phases) for (const [recordIndex, record] of phase.records.entries()) {
    const label = `${phase.phase}.${record.plannedTargetTable}.${record.sourceIdentitySha256}`;
    if (record.disposition !== "quarantine") {
      const targetKey = `${record.plannedTargetTable}:${record.targetId}`;
      if (activeTargets.has(targetKey)) fail("PRODUCTION_IMPORT_TARGET_MAP_DUPLICATE", targetKey);
      activeTargets.add(targetKey);
    }
    const rule = contract.targetTableRules[record.plannedTargetTable];
    if (!rule || rule.phase !== phase.phase || !rule.allowedDependencyModes.includes(record.dependencyMode)) fail("PRODUCTION_IMPORT_DEPENDENCY_INVALID", `${label} dependency mode denied`);
    if (record.dependencyMode === "scope" && record.dependencyRefs.length !== 0) fail("PRODUCTION_IMPORT_DEPENDENCY_INVALID", `${label} scope record cannot have dependencies`);
    if (record.dependencyMode !== "scope" && record.dependencyRefs.length === 0) fail("PRODUCTION_IMPORT_DEPENDENCY_REQUIRED", `${label} dependencies missing`);
    const roleCounts = new Map();
    for (const [index, dependency] of record.dependencyRefs.entries()) {
      exactKeys(dependency, ["role", "phase", "sourceIdentitySha256", "expectedTargetTable"], [], "PRODUCTION_IMPORT_DEPENDENCY_INVALID", `${label}.dependencyRefs[${index}]`);
      if (!SAFE_DEPENDENCY_ROLE.test(dependency.role ?? "")) fail("PRODUCTION_IMPORT_DEPENDENCY_INVALID", `${label} role invalid`);
      assertSha(dependency.sourceIdentitySha256, "PRODUCTION_IMPORT_DEPENDENCY_INVALID", `${label}.${dependency.role}.sourceIdentitySha256`);
      if (!phaseOrdinal.has(dependency.phase) || phaseOrdinal.get(dependency.phase) > phaseOrdinal.get(phase.phase)) fail("PRODUCTION_IMPORT_DEPENDENCY_INVALID", `${label} forward phase dependency denied`);
      if (!SAFE_TABLE.test(dependency.expectedTargetTable ?? "")) fail("PRODUCTION_IMPORT_DEPENDENCY_INVALID", `${label} expected target invalid`);
      const specification = [...rule.requiredDependencies, ...rule.optionalDependencies].find(candidate => candidate.role === dependency.role);
      if (!specification || !specification.phases.includes(dependency.phase) || !specification.targetTables.includes(dependency.expectedTargetTable)) fail("PRODUCTION_IMPORT_DEPENDENCY_INVALID", `${label}.${dependency.role} not permitted`);
      roleCounts.set(dependency.role, (roleCounts.get(dependency.role) ?? 0) + 1);
      if (roleCounts.get(dependency.role) !== 1) fail("PRODUCTION_IMPORT_DEPENDENCY_INVALID", `${label}.${dependency.role} duplicated`);
      const dependencyRecord = records.get(`${dependency.phase}:${dependency.sourceIdentitySha256}`);
      if (!dependencyRecord || dependencyRecord.record.plannedTargetTable !== dependency.expectedTargetTable) fail("PRODUCTION_IMPORT_DEPENDENCY_RECORD_MAP_REQUIRED", `${label}.${dependency.role} record missing or table differs`);
      if (dependencyRecord.phase === phase.phase && dependencyRecord.record.sourceIdentitySha256 === record.sourceIdentitySha256) fail("PRODUCTION_IMPORT_DEPENDENCY_INVALID", `${label} self dependency denied`);
      if (dependencyRecord.phase === phase.phase && dependencyRecord.recordIndex >= recordIndex) fail("PRODUCTION_IMPORT_DEPENDENCY_SEQUENCE_INVALID", `${label}.${dependency.role} must precede its dependent record`);
      if (record.disposition !== "quarantine" && (dependencyRecord.record.disposition === "quarantine" || dependencyRecord.record.targetTable !== dependency.expectedTargetTable || !UUID.test(dependencyRecord.record.targetId ?? ""))) fail("PRODUCTION_IMPORT_DEPENDENCY_RECORD_MAP_REQUIRED", `${label}.${dependency.role} is not an active target map`);
    }
    for (const required of rule.requiredDependencies) if (roleCounts.get(required.role) !== 1) fail("PRODUCTION_IMPORT_DEPENDENCY_REQUIRED", `${label}.${required.role} required`);
    for (const optional of rule.optionalDependencies) if ((roleCounts.get(optional.role) ?? 0) > 1) fail("PRODUCTION_IMPORT_DEPENDENCY_INVALID", `${label}.${optional.role} duplicated`);
    if (record.dependencyMode === "employee" && (record.dependencyRefs.length !== 1 || record.dependencyRefs[0].role !== "employee" || record.dependencyRefs[0].phase !== "T0" || record.dependencyRefs[0].expectedTargetTable !== "hr_employee")) fail("PRODUCTION_IMPORT_DEPENDENCY_INVALID", `${label} employee mode requires exact T0 employee`);
    if (record.dependencyMode === "record_graph" && record.dependencyRefs.length === 1 && record.dependencyRefs[0].role === "employee") fail("PRODUCTION_IMPORT_DEPENDENCY_INVALID", `${label} employee-only dependency must use employee mode`);
  }
  const visiting = new Set();
  const visited = new Set();
  const visit = key => {
    if (visiting.has(key)) fail("PRODUCTION_IMPORT_DEPENDENCY_CYCLE", key);
    if (visited.has(key)) return;
    visiting.add(key);
    const current = records.get(key);
    for (const dependency of current?.record.dependencyRefs ?? []) visit(`${dependency.phase}:${dependency.sourceIdentitySha256}`);
    visiting.delete(key);
    visited.add(key);
  };
  for (const key of records.keys()) visit(key);
}

function validateTriple(triple, code, label) {
  exactKeys(triple, ["codeSha", "sourceSnapshotHash", "mappingContractHash"], [], code, label);
  if (!CODE_SHA.test(triple.codeSha ?? "")) fail(code, `${label}.codeSha invalid`);
  assertSha(triple.sourceSnapshotHash, code, `${label}.sourceSnapshotHash`);
  assertSha(triple.mappingContractHash, code, `${label}.mappingContractHash`);
}

function validateFinalRehearsalPair(pair, planTriple) {
  exactKeys(pair, ["artifactSha256", "triple", "rehearsals"], [], "PRODUCTION_IMPORT_AB_EVIDENCE_INVALID", "finalRehearsalPair");
  assertSha(pair.artifactSha256, "PRODUCTION_IMPORT_AB_EVIDENCE_INVALID", "finalRehearsalPair.artifactSha256");
  validateTriple(pair.triple, "PRODUCTION_IMPORT_AB_EVIDENCE_INVALID", "finalRehearsalPair.triple");
  if (!same(pair.triple, planTriple)) fail("PRODUCTION_IMPORT_AB_EVIDENCE_INVALID", "A/B triple differs from sealed plan");
  if (!Array.isArray(pair.rehearsals) || pair.rehearsals.length !== 2 || pair.rehearsals.map(row => row?.rehearsal).join("") !== "AB") fail("PRODUCTION_IMPORT_AB_EVIDENCE_INVALID", "exact A/B evidence is required");
  for (const row of pair.rehearsals) {
    exactKeys(row, ["rehearsal", "manifestSha256", "cleanupAuditSha256", "residualCount"], [], "PRODUCTION_IMPORT_AB_EVIDENCE_INVALID", `rehearsal${row?.rehearsal ?? "?"}`);
    assertSha(row.manifestSha256, "PRODUCTION_IMPORT_AB_EVIDENCE_INVALID", `${row.rehearsal}.manifestSha256`);
    assertSha(row.cleanupAuditSha256, "PRODUCTION_IMPORT_AB_EVIDENCE_INVALID", `${row.rehearsal}.cleanupAuditSha256`);
    if (row.residualCount !== 0) fail("PRODUCTION_IMPORT_AB_EVIDENCE_INVALID", `${row.rehearsal}.residualCount must be zero`);
  }
  if (new Set(pair.rehearsals.map(row => row.manifestSha256)).size !== 2 || new Set(pair.rehearsals.map(row => row.cleanupAuditSha256)).size !== 2) fail("PRODUCTION_IMPORT_AB_EVIDENCE_INVALID", "A/B manifest and cleanup evidence must be independent");
}

function validateApprovalSet(approvalSet) {
  if (!Array.isArray(approvalSet) || approvalSet.length !== REQUIRED_APPROVAL_ROLES.length) fail("PRODUCTION_IMPORT_AUTH_BINDING_MISMATCH", "approval set incomplete");
  const roles = [];
  const subjects = new Set();
  const decisions = new Set();
  for (const approval of approvalSet) {
    exactKeys(approval, ["role", "subjectRefSha256", "signedDecisionSha256"], [], "PRODUCTION_IMPORT_AUTH_BINDING_MISMATCH", "approval");
    assertSha(approval.subjectRefSha256, "PRODUCTION_IMPORT_AUTH_BINDING_MISMATCH", `${approval.role}.subjectRefSha256`);
    assertSha(approval.signedDecisionSha256, "PRODUCTION_IMPORT_AUTH_BINDING_MISMATCH", `${approval.role}.signedDecisionSha256`);
    roles.push(approval.role);
    subjects.add(approval.subjectRefSha256);
    decisions.add(approval.signedDecisionSha256);
  }
  if (!same([...roles].sort(), [...REQUIRED_APPROVAL_ROLES].sort()) || new Set(roles).size !== roles.length || subjects.size !== roles.length || decisions.size !== roles.length) fail("PRODUCTION_IMPORT_AUTH_BINDING_MISMATCH", "approval roles, subjects and receipts must be independent");
}

export function validateSealedProductionImportPlan(plan, { contract = DEFAULT_PRODUCTION_IMPORT_EXECUTION_CONTRACT, now = new Date() } = {}) {
  validateContract(contract);
  exactKeys(plan, ["formatVersion", "planKind", "operationId", "intent", "status", "triple", "target", "targetScope", "window", "authorization", "manifestSha256", "finalRehearsalPair", "phaseOrder", "phases", "rollback", "sealing", "productionImport"], ["t5Nonfile", "performanceRelations", "performanceFactIdentity", "runtimeReleaseEvidence"], "PRODUCTION_IMPORT_SEALED_PLAN_INVALID", "plan");
  scan(plan);
  if (plan.formatVersion !== 2 || plan.planKind !== "yuzhou_hr_production_import_sealed_execution_plan" || plan.intent !== "production_import" || plan.status !== "SEALED" || plan.productionImport !== "HOLD") fail("PRODUCTION_IMPORT_SEALED_PLAN_INVALID", "identity/status invalid");
  if (!OPERATION_ID.test(plan.operationId ?? "")) fail("PRODUCTION_IMPORT_SEALED_PLAN_INVALID", "operation id invalid");
  validateTriple(plan.triple, "PRODUCTION_IMPORT_SEALED_PLAN_INVALID", "triple");
  const t5Nonfile = plan.t5Nonfile === undefined ? null : validateT5NonfilePlanBinding(plan.t5Nonfile, plan.triple);
  const performanceRelations = plan.performanceRelations === undefined ? null : validatePerformanceRelationsPlanBinding(plan.performanceRelations, plan.triple);
  const performanceFactIdentity = plan.performanceFactIdentity === undefined ? null
    : validateProductionPerformanceFactIdentityPlanBinding(plan.performanceFactIdentity, plan.triple, performanceRelations);
  exactKeys(plan.target, ["environment", "alias", "identitySha256"], [], "PRODUCTION_IMPORT_SEALED_PLAN_INVALID", "target");
  if (plan.target.environment !== "production" || !SAFE_ALIAS.test(plan.target.alias ?? "")) fail("PRODUCTION_IMPORT_SEALED_PLAN_INVALID", "target invalid");
  assertSha(plan.target.identitySha256, "PRODUCTION_IMPORT_SEALED_PLAN_INVALID", "target identity");
  validateTargetScope(plan.targetScope);
  if (t5Nonfile && (t5Nonfile.t0TargetIdentitySha256 !== plan.target.identitySha256 || t5Nonfile.t0TargetScopeSha256 !== plan.targetScope.scopeSha256)) fail("PRODUCTION_IMPORT_T5_NONFILE_PLAN_INVALID", "T5 T0 decision target differs from sealed target");
  exactKeys(plan.window, ["startsAt", "endsAt"], [], "PRODUCTION_IMPORT_SEALED_PLAN_INVALID", "window");
  const windowStartsAt = Date.parse(plan.window.startsAt);
  const windowEndsAt = Date.parse(plan.window.endsAt);
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  if (![windowStartsAt, windowEndsAt, nowMs].every(Number.isFinite) || windowStartsAt >= windowEndsAt || nowMs < windowStartsAt || nowMs >= windowEndsAt) fail("PRODUCTION_IMPORT_WINDOW_INVALID", "current time outside pinned production window");
  exactKeys(plan.authorization, ["intent", "artifactSha256", "nonceSha256", "issuedAt", "expiresAt", "binding", "approvalSet"], [], "PRODUCTION_IMPORT_SEALED_PLAN_INVALID", "authorization");
  if (plan.authorization.intent !== "production_import") fail("PRODUCTION_IMPORT_AUTH_BINDING_MISMATCH", "authorization intent invalid");
  assertSha(plan.authorization.artifactSha256, "PRODUCTION_IMPORT_SEALED_PLAN_INVALID", "authorization artifact");
  assertSha(plan.authorization.nonceSha256, "PRODUCTION_IMPORT_SEALED_PLAN_INVALID", "authorization nonce");
  const issuedAt = Date.parse(plan.authorization.issuedAt);
  const expiresAt = Date.parse(plan.authorization.expiresAt);
  if (![issuedAt, expiresAt].every(Number.isFinite) || issuedAt >= expiresAt || nowMs < issuedAt || nowMs >= expiresAt) fail("PRODUCTION_IMPORT_AUTH_STALE", "authorization outside validity interval");
  if (issuedAt < windowStartsAt || expiresAt > windowEndsAt) fail("PRODUCTION_IMPORT_AUTH_BINDING_MISMATCH", "authorization validity escapes pinned production window");
  // Bind the external observation after deployment, never in the Git activation
  // contract: a receipt containing codeSha cannot be committed into that codeSha.
  const runtimeReleaseEvidence = plan.runtimeReleaseEvidence;
  if (runtimeReleaseEvidence !== undefined) {
    const code = "PRODUCTION_IMPORT_RUNTIME_RELEASE_EVIDENCE_INVALID";
    exactKeys(runtimeReleaseEvidence, ["artifactSha256", "observedAt", "expiresAt"], [], code, "runtimeReleaseEvidence");
    if (typeof runtimeReleaseEvidence.artifactSha256 !== "string") fail(code, "runtime release artifact must be a SHA-256 string");
    assertSha(runtimeReleaseEvidence.artifactSha256, code, "runtime release artifact");
    const timestamps = [runtimeReleaseEvidence.observedAt, runtimeReleaseEvidence.expiresAt];
    if (!timestamps.every(value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value)) fail(code, "runtime release timestamps must be canonical UTC");
    const [observedAt, evidenceExpiresAt] = timestamps.map(value => Date.parse(value));
    if (observedAt > issuedAt || observedAt > nowMs || observedAt >= evidenceExpiresAt || nowMs >= evidenceExpiresAt || evidenceExpiresAt > expiresAt) fail(code, "runtime observation must precede approval and remain valid within authorization");
  }
  assertSha(plan.manifestSha256, "PRODUCTION_IMPORT_SEALED_PLAN_INVALID", "manifest");
  validateFinalRehearsalPair(plan.finalRehearsalPair, plan.triple);
  const authorizationBindingKeys = ["triple", "targetIdentitySha256", "targetScopeSha256", "finalRehearsalPairSha256", "manifestSha256", "windowStartsAt", "windowEndsAt", ...(t5Nonfile ? ["t5NonfilePrivateStageSha256"] : []), ...(performanceRelations ? ["performanceRelationsContractSha256"] : []), ...(performanceFactIdentity ? ["performanceFactIdentityContractSha256"] : []), ...(runtimeReleaseEvidence !== undefined ? ["runtimeReleaseEvidenceBindingSha256"] : [])];
  exactKeys(plan.authorization.binding, authorizationBindingKeys, [], "PRODUCTION_IMPORT_AUTH_BINDING_MISMATCH", "authorization.binding");
  const expectedBinding = { triple: plan.triple, targetIdentitySha256: plan.target.identitySha256, targetScopeSha256: plan.targetScope.scopeSha256, finalRehearsalPairSha256: plan.finalRehearsalPair.artifactSha256, manifestSha256: plan.manifestSha256, windowStartsAt: plan.window.startsAt, windowEndsAt: plan.window.endsAt };
  if (t5Nonfile) expectedBinding.t5NonfilePrivateStageSha256 = t5Nonfile.privateStageSha256;
  if (performanceRelations) expectedBinding.performanceRelationsContractSha256 = computeProductionImportPayloadHash(performanceRelations);
  if (performanceFactIdentity) expectedBinding.performanceFactIdentityContractSha256 = computeProductionImportPayloadHash(performanceFactIdentity);
  if (runtimeReleaseEvidence !== undefined) expectedBinding.runtimeReleaseEvidenceBindingSha256 = computeProductionImportPayloadHash(runtimeReleaseEvidence);
  if (!same(plan.authorization.binding, expectedBinding)) fail("PRODUCTION_IMPORT_AUTH_BINDING_MISMATCH", "authorization does not bind exact A/B, triple, target, manifest and window");
  validateApprovalSet(plan.authorization.approvalSet);
  if (!same(plan.phaseOrder, contract.phaseOrder) || !Array.isArray(plan.phases) || plan.phases.length !== contract.phaseOrder.length) fail("PRODUCTION_IMPORT_PHASE_SEQUENCE_INVALID", "T0-T3 exact phases required");
  for (let index = 0; index < plan.phases.length; index += 1) {
    const phase = plan.phases[index];
    exactKeys(phase, ["phase", "ordinal", "sourceBatchManifestSha256", "payloadBundleArtifactSha256", "payloadBundleSha256", "canonicalizationVersion", "beforeCanonicalSha256", "expectedAfterCanonicalSha256", "records"], [], "PRODUCTION_IMPORT_SEALED_PLAN_INVALID", `phases[${index}]`);
    if (phase.phase !== contract.phaseOrder[index] || phase.ordinal !== index || !Array.isArray(phase.records)) fail("PRODUCTION_IMPORT_PHASE_SEQUENCE_INVALID", `phase ${index}`);
    for (const key of ["sourceBatchManifestSha256", "payloadBundleArtifactSha256", "payloadBundleSha256", "beforeCanonicalSha256", "expectedAfterCanonicalSha256"]) assertSha(phase[key], "PRODUCTION_IMPORT_SEALED_PLAN_INVALID", `${phase.phase}.${key}`);
    if (phase.canonicalizationVersion !== contract.canonicalizationVersion) fail("PRODUCTION_IMPORT_CANONICALIZATION_VERSION_MISMATCH", phase.phase);
    const identities = new Set();
    phase.records.forEach(record => validateRecord(record, phase.phase, contract, identities));
  }
  validateDependencyGraph(plan, contract);
  exactKeys(plan.rollback, ["order", "insert", "merge", "quarantine", "skipApproved", "residualCount", "canonicalHash"], [], "PRODUCTION_IMPORT_ROLLBACK_CONTRACT_INVALID", "rollback");
  const rollbackOrder = t5Nonfile ? ["T5", ...contract.rollbackOrder] : contract.rollbackOrder;
  if (!same(plan.rollback, { order: rollbackOrder, insert: "delete_operation_owned_target", merge: "encrypted_before_image_cas_restore", quarantine: "no_target_write", skipApproved: "no_target_write", residualCount: 0, canonicalHash: "EXACT" })) fail("PRODUCTION_IMPORT_ROLLBACK_CONTRACT_INVALID", "rollback contract invalid");
  exactKeys(plan.sealing, ["algorithm", "sealedPlanSha256"], [], "PRODUCTION_IMPORT_SEALED_PLAN_INVALID", "sealing");
  if (plan.sealing.algorithm !== "canonical-json-sha256-v1") fail("PRODUCTION_IMPORT_SEALED_PLAN_INVALID", "sealing algorithm invalid");
  assertSha(plan.sealing.sealedPlanSha256, "PRODUCTION_IMPORT_SEALED_PLAN_INVALID", "sealed plan");
  if (plan.sealing.sealedPlanSha256 !== computeSealedProductionImportPlanHash(plan)) fail("PRODUCTION_IMPORT_SEALED_PLAN_HASH_MISMATCH", "sealed bytes differ");
  return structuredClone(plan);
}

export function assertProductionImportExecutionActivated(plan, contract = DEFAULT_PRODUCTION_IMPORT_EXECUTION_CONTRACT) {
  validateContract(contract);
  if (contract.activation.status !== "PASS" || contract.productionImport !== "READY" || contract.activation.reasonCodes.length !== 0) fail("PRODUCTION_IMPORT_EXECUTION_UNAVAILABLE", "execution contract remains HOLD");
  const matches = contract.activation.allowedTargets.filter(target => target?.environment === "production" && target?.alias === plan.target.alias && target?.identitySha256 === plan.target.identitySha256 && target?.targetScopeSha256 === plan.targetScope.scopeSha256);
  if (matches.length !== 1 || contract.activation.allowedTargets.length !== 1) fail("PRODUCTION_IMPORT_TARGET_NOT_ALLOWLISTED", "target must be the sole reviewed target");
}

export function validateProductionImportRollbackAuthorization(authorization, plan, { now = new Date() } = {}) {
  exactKeys(authorization, ["formatVersion", "artifactKind", "intent", "rollbackOperationId", "importOperationId", "sealedPlanSha256", "targetIdentitySha256", "authorizationArtifactSha256", "authorizationNonceSha256", "issuedAt", "expiresAt", "productionImport"], [], "PRODUCTION_IMPORT_ROLLBACK_AUTH_INVALID", "rollbackAuthorization");
  scan(authorization, "rollbackAuthorization");
  if (authorization.formatVersion !== 1 || authorization.artifactKind !== "yuzhou_hr_production_import_rollback_authorization" || authorization.intent !== "production_import_rollback" || authorization.productionImport !== "HOLD") fail("PRODUCTION_IMPORT_ROLLBACK_AUTH_INVALID", "identity/intent invalid");
  if (!ROLLBACK_OPERATION_ID.test(authorization.rollbackOperationId ?? "") || authorization.importOperationId !== plan.operationId) fail("PRODUCTION_IMPORT_ROLLBACK_AUTH_INVALID", "operation binding invalid");
  for (const key of ["sealedPlanSha256", "targetIdentitySha256", "authorizationArtifactSha256", "authorizationNonceSha256"]) assertSha(authorization[key], "PRODUCTION_IMPORT_ROLLBACK_AUTH_INVALID", key);
  if (authorization.sealedPlanSha256 !== plan.sealing.sealedPlanSha256 || authorization.targetIdentitySha256 !== plan.target.identitySha256) fail("PRODUCTION_IMPORT_ROLLBACK_AUTH_INVALID", "plan/target binding invalid");
  if (authorization.authorizationArtifactSha256 === plan.authorization.artifactSha256 || authorization.authorizationNonceSha256 === plan.authorization.nonceSha256) fail("PRODUCTION_IMPORT_ROLLBACK_AUTH_REUSED", "import authorization cannot authorize rollback");
  const issuedAt = Date.parse(authorization.issuedAt);
  const expiresAt = Date.parse(authorization.expiresAt);
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  if (![issuedAt, expiresAt, nowMs].every(Number.isFinite) || issuedAt >= expiresAt || nowMs < issuedAt || nowMs >= expiresAt) fail("PRODUCTION_IMPORT_ROLLBACK_AUTH_STALE", "rollback authorization outside validity interval");
  return structuredClone(authorization);
}

export const productionImportHash = sha256;
