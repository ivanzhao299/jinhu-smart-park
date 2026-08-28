import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
export const DEFAULT_PRODUCTION_IMPORT_EXECUTION_CONTRACT = JSON.parse(readFileSync(resolve(ROOT, "scripts/hr-cutover/contracts/production-import-execution-v1.json"), "utf8"));

const SHA256 = /^[0-9a-f]{64}$/u;
const CODE_SHA = /^[0-9a-f]{40}$/u;
const OPERATION_ID = /^yzprod-import-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{12}$/u;
const ROLLBACK_OPERATION_ID = /^yzprod-rollback-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{12}$/u;
const SAFE_ALIAS = /^[a-z0-9][a-z0-9-]{5,63}$/u;
const SAFE_TABLE = /^[a-z][a-z0-9_]{1,95}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const FORBIDDEN_KEY = /password|passwd|token|secret|connectionstring|credential|privatekey|bankaccount|idcard|insureaccount|employeename|fullname|mobile|phone|salaryamount|grosspay|netpay/iu;
const EXPECTED_TARGET_TABLES = {
  T0: ["sys_org", "hr_position", "hr_employee"],
  T1: ["hr_employment_event"],
  T2: ["hr_contract_type", "hr_contract", "hr_contract_change", "hr_contract_legacy_evidence"],
  T3: ["hr_attendance_import_batch", "hr_attendance_symbol_rule", "hr_attendance_calendar_source", "hr_attendance_day", "hr_insurance_policy", "hr_insurance_policy_item", "hr_employee_insurance_period", "hr_employee_insurance_item"],
};

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
  exactKeys(contract, ["formatVersion", "contractKind", "contractVersion", "activation", "transactionIsolation", "phaseOrder", "rollbackOrder", "allowedDispositions", "beforeImageAlgorithm", "identityResolution", "targetTables", "productionImport"], [], "PRODUCTION_IMPORT_EXECUTION_CONTRACT_INVALID", "contract");
  if (contract.formatVersion !== 1 || contract.contractKind !== "yuzhou_hr_production_import_execution" || contract.transactionIsolation !== "SERIALIZABLE") fail("PRODUCTION_IMPORT_EXECUTION_CONTRACT_INVALID", "identity/isolation invalid");
  if (!same(contract.phaseOrder, ["T0", "T1", "T2", "T3"]) || !same(contract.rollbackOrder, ["T3", "T2", "T1", "T0"])) fail("PRODUCTION_IMPORT_EXECUTION_CONTRACT_INVALID", "phase order invalid");
  if (!same(contract.allowedDispositions, ["insert", "merge", "quarantine", "skip_approved"]) || contract.beforeImageAlgorithm !== "aes-256-gcm-external-kek-v1") fail("PRODUCTION_IMPORT_EXECUTION_CONTRACT_INVALID", "mutation contract invalid");
  if (!same(contract.identityResolution, { sourceIdentity: "stable_source_identity_sha256", dependentOwnerResolution: "t0_production_record_map_exact", nameMatching: false, autoCreateLogin: false, overwrite: false })) fail("PRODUCTION_IMPORT_EXECUTION_CONTRACT_INVALID", "identity resolution invalid");
  if (!same(contract.targetTables, EXPECTED_TARGET_TABLES)) fail("PRODUCTION_IMPORT_EXECUTION_CONTRACT_INVALID", "target table allowlist invalid");
  exactKeys(contract.activation, ["status", "allowedTargets", "reasonCodes"], [], "PRODUCTION_IMPORT_EXECUTION_CONTRACT_INVALID", "activation");
  if (!Array.isArray(contract.activation.allowedTargets) || !Array.isArray(contract.activation.reasonCodes)) fail("PRODUCTION_IMPORT_EXECUTION_CONTRACT_INVALID", "activation invalid");
  for (const target of contract.activation.allowedTargets) {
    exactKeys(target, ["environment", "alias", "identitySha256"], [], "PRODUCTION_IMPORT_EXECUTION_CONTRACT_INVALID", "activation target");
    if (target.environment !== "production" || !SAFE_ALIAS.test(target.alias ?? "")) fail("PRODUCTION_IMPORT_EXECUTION_CONTRACT_INVALID", "activation target invalid");
    assertSha(target.identitySha256, "PRODUCTION_IMPORT_EXECUTION_CONTRACT_INVALID", "activation target identity");
  }
  const held = contract.activation.status === "HOLD" && contract.productionImport === "HOLD" && contract.activation.allowedTargets.length === 0 && contract.activation.reasonCodes.length > 0;
  const active = contract.activation.status === "PASS" && contract.productionImport === "READY" && contract.activation.allowedTargets.length === 1 && contract.activation.reasonCodes.length === 0;
  if (!held && !active) fail("PRODUCTION_IMPORT_EXECUTION_CONTRACT_INVALID", "activation state invalid");
}

function validateRecord(record, phase, contract, identities) {
  exactKeys(record, ["sourceIdentitySha256", "sourceRowSha256", "disposition"], ["ownerSourceIdentitySha256", "targetTable", "targetId", "expectedTargetBeforeSha256", "expectedTargetAfterSha256", "decisionAttestationSha256", "beforeImage", "quarantine"], "PRODUCTION_IMPORT_SEALED_PLAN_INVALID", `${phase}.record`);
  assertSha(record.sourceIdentitySha256, "PRODUCTION_IMPORT_SEALED_PLAN_INVALID", "source identity");
  assertSha(record.sourceRowSha256, "PRODUCTION_IMPORT_SEALED_PLAN_INVALID", "source row");
  if (identities.has(record.sourceIdentitySha256)) fail("PRODUCTION_IMPORT_SEALED_PLAN_INVALID", `${phase} duplicate source identity`);
  identities.add(record.sourceIdentitySha256);
  if (!contract.allowedDispositions.includes(record.disposition)) fail("PRODUCTION_IMPORT_DISPOSITION_INVALID", record.disposition);
  if (phase !== "T0") {
    assertSha(record.ownerSourceIdentitySha256, "PRODUCTION_IMPORT_OWNER_RECORD_MAP_REQUIRED", `${phase}.ownerSourceIdentitySha256`);
  } else if (record.ownerSourceIdentitySha256 !== undefined) fail("PRODUCTION_IMPORT_SEALED_PLAN_INVALID", "T0 cannot declare a dependent owner");
  if (record.disposition !== "quarantine") {
    if (!SAFE_TABLE.test(record.targetTable ?? "") || !contract.targetTables[phase]?.includes(record.targetTable)) fail("PRODUCTION_IMPORT_TARGET_TABLE_DENIED", `${phase}.${record.targetTable ?? "missing"}`);
    if (!UUID.test(record.targetId ?? "")) fail("PRODUCTION_IMPORT_SEALED_PLAN_INVALID", `${phase}.targetId invalid`);
  }
  if (["merge", "skip_approved"].includes(record.disposition)) assertSha(record.expectedTargetBeforeSha256, "PRODUCTION_IMPORT_CAS_PRECONDITION_REQUIRED", `${phase}.expectedTargetBeforeSha256`);
  else if (record.expectedTargetBeforeSha256 !== undefined) fail("PRODUCTION_IMPORT_SEALED_PLAN_INVALID", `${phase}.unexpected CAS precondition`);
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

export function validateSealedProductionImportPlan(plan, { contract = DEFAULT_PRODUCTION_IMPORT_EXECUTION_CONTRACT, now = new Date() } = {}) {
  validateContract(contract);
  exactKeys(plan, ["formatVersion", "planKind", "operationId", "intent", "status", "triple", "target", "authorization", "manifestSha256", "finalRehearsalPairSha256", "phaseOrder", "phases", "rollback", "sealing", "productionImport"], [], "PRODUCTION_IMPORT_SEALED_PLAN_INVALID", "plan");
  scan(plan);
  if (plan.formatVersion !== 1 || plan.planKind !== "yuzhou_hr_production_import_sealed_execution_plan" || plan.intent !== "production_import" || plan.status !== "SEALED" || plan.productionImport !== "HOLD") fail("PRODUCTION_IMPORT_SEALED_PLAN_INVALID", "identity/status invalid");
  if (!OPERATION_ID.test(plan.operationId ?? "")) fail("PRODUCTION_IMPORT_SEALED_PLAN_INVALID", "operation id invalid");
  exactKeys(plan.triple, ["codeSha", "sourceSnapshotHash", "mappingContractHash"], [], "PRODUCTION_IMPORT_SEALED_PLAN_INVALID", "triple");
  if (!CODE_SHA.test(plan.triple.codeSha ?? "")) fail("PRODUCTION_IMPORT_SEALED_PLAN_INVALID", "code SHA invalid");
  assertSha(plan.triple.sourceSnapshotHash, "PRODUCTION_IMPORT_SEALED_PLAN_INVALID", "source snapshot");
  assertSha(plan.triple.mappingContractHash, "PRODUCTION_IMPORT_SEALED_PLAN_INVALID", "mapping contract");
  exactKeys(plan.target, ["environment", "alias", "identitySha256"], [], "PRODUCTION_IMPORT_SEALED_PLAN_INVALID", "target");
  if (plan.target.environment !== "production" || !SAFE_ALIAS.test(plan.target.alias ?? "")) fail("PRODUCTION_IMPORT_SEALED_PLAN_INVALID", "target invalid");
  assertSha(plan.target.identitySha256, "PRODUCTION_IMPORT_SEALED_PLAN_INVALID", "target identity");
  exactKeys(plan.authorization, ["artifactSha256", "nonceSha256", "issuedAt", "expiresAt"], [], "PRODUCTION_IMPORT_SEALED_PLAN_INVALID", "authorization");
  assertSha(plan.authorization.artifactSha256, "PRODUCTION_IMPORT_SEALED_PLAN_INVALID", "authorization artifact");
  assertSha(plan.authorization.nonceSha256, "PRODUCTION_IMPORT_SEALED_PLAN_INVALID", "authorization nonce");
  const issuedAt = Date.parse(plan.authorization.issuedAt);
  const expiresAt = Date.parse(plan.authorization.expiresAt);
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  if (![issuedAt, expiresAt, nowMs].every(Number.isFinite) || issuedAt >= expiresAt || nowMs < issuedAt || nowMs >= expiresAt) fail("PRODUCTION_IMPORT_AUTH_STALE", "authorization outside validity interval");
  assertSha(plan.manifestSha256, "PRODUCTION_IMPORT_SEALED_PLAN_INVALID", "manifest");
  assertSha(plan.finalRehearsalPairSha256, "PRODUCTION_IMPORT_SEALED_PLAN_INVALID", "final rehearsal pair");
  if (!same(plan.phaseOrder, contract.phaseOrder) || !Array.isArray(plan.phases) || plan.phases.length !== contract.phaseOrder.length) fail("PRODUCTION_IMPORT_PHASE_SEQUENCE_INVALID", "T0-T3 exact phases required");
  for (let index = 0; index < plan.phases.length; index += 1) {
    const phase = plan.phases[index];
    exactKeys(phase, ["phase", "ordinal", "sourceBatchManifestSha256", "beforeCanonicalSha256", "expectedAfterCanonicalSha256", "records"], [], "PRODUCTION_IMPORT_SEALED_PLAN_INVALID", `phases[${index}]`);
    if (phase.phase !== contract.phaseOrder[index] || phase.ordinal !== index || !Array.isArray(phase.records)) fail("PRODUCTION_IMPORT_PHASE_SEQUENCE_INVALID", `phase ${index}`);
    for (const key of ["sourceBatchManifestSha256", "beforeCanonicalSha256", "expectedAfterCanonicalSha256"]) assertSha(phase[key], "PRODUCTION_IMPORT_SEALED_PLAN_INVALID", `${phase.phase}.${key}`);
    const identities = new Set();
    phase.records.forEach(record => validateRecord(record, phase.phase, contract, identities));
  }
  exactKeys(plan.rollback, ["order", "insert", "merge", "quarantine", "skipApproved", "residualCount", "canonicalHash"], [], "PRODUCTION_IMPORT_ROLLBACK_CONTRACT_INVALID", "rollback");
  if (!same(plan.rollback, { order: contract.rollbackOrder, insert: "delete_operation_owned_target", merge: "encrypted_before_image_cas_restore", quarantine: "no_target_write", skipApproved: "no_target_write", residualCount: 0, canonicalHash: "EXACT" })) fail("PRODUCTION_IMPORT_ROLLBACK_CONTRACT_INVALID", "rollback contract invalid");
  exactKeys(plan.sealing, ["algorithm", "sealedPlanSha256"], [], "PRODUCTION_IMPORT_SEALED_PLAN_INVALID", "sealing");
  if (plan.sealing.algorithm !== "canonical-json-sha256-v1") fail("PRODUCTION_IMPORT_SEALED_PLAN_INVALID", "sealing algorithm invalid");
  assertSha(plan.sealing.sealedPlanSha256, "PRODUCTION_IMPORT_SEALED_PLAN_INVALID", "sealed plan");
  if (plan.sealing.sealedPlanSha256 !== computeSealedProductionImportPlanHash(plan)) fail("PRODUCTION_IMPORT_SEALED_PLAN_HASH_MISMATCH", "sealed bytes differ");
  return structuredClone(plan);
}

export function assertProductionImportExecutionActivated(plan, contract = DEFAULT_PRODUCTION_IMPORT_EXECUTION_CONTRACT) {
  validateContract(contract);
  if (contract.activation.status !== "PASS" || contract.productionImport !== "READY" || contract.activation.reasonCodes.length !== 0) fail("PRODUCTION_IMPORT_EXECUTION_UNAVAILABLE", "execution contract remains HOLD");
  const matches = contract.activation.allowedTargets.filter(target => target?.environment === "production" && target?.alias === plan.target.alias && target?.identitySha256 === plan.target.identitySha256);
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
