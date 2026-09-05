/* global Buffer, structuredClone */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  validatePerformancePersonAssessmentPrivateLabPayload,
  validatePerformancePersonAssessmentSafeSourceReceipt,
} from "./performance-person-assessment-source-adapter.mjs";
import { validateSourceRestoreReceipt } from "./source-restore-receipt.mjs";

const SHA256 = /^[0-9a-f]{64}$/u;
const GIT_SHA = /^[0-9a-f]{40}$/u;
const OPERATION = /^yzprod-perfrel-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{12}$/u;
const PARENT_OPERATION = /^yzprod-import-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{12}$/u;
const ROLLBACK_OPERATION = /^yzprod-perfrel-rollback-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{12}$/u;
const SCOPE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/u;
const DEFAULT_CONTRACT = resolve(import.meta.dirname, "contracts/legacy-performance-person-assessment-production-adapter-v1.json");

export class PerformancePersonAssessmentProductionAdapterError extends Error {
  constructor(code, detail, options = undefined) {
    super(`${code}: ${detail}`, options);
    this.name = "PerformancePersonAssessmentProductionAdapterError";
    this.code = code;
  }
}

const fail = (code, detail, options) => { throw new PerformancePersonAssessmentProductionAdapterError(code, detail, options); };
const canonical = value => {
  if (value === null) return "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
};
export const performancePersonAssessmentProductionHash = value => createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : `${canonical(value)}\n`).digest("hex");
const same = (left, right) => canonical(left) === canonical(right);
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const exactKeys = (value, required, optional, code, label) => {
  if (!object(value)) fail(code, `${label} must be an object`);
  const allowed = new Set([...required, ...optional]);
  for (const key of required) if (!Object.hasOwn(value, key)) fail(code, `${label}.${key} is required`);
  for (const key of Object.keys(value)) if (!allowed.has(key)) fail(code, `${label}.${key} is not allowed`);
};
const assertSha = (value, code, label) => { if (!SHA256.test(value ?? "")) fail(code, `${label} must be SHA-256`); };

function validateTarget(target) {
  exactKeys(target, ["identitySha256", "scope"], [], "PERFORMANCE_PERSON_ASSESSMENT_PRODUCTION_TARGET_INVALID", "target");
  assertSha(target.identitySha256, "PERFORMANCE_PERSON_ASSESSMENT_PRODUCTION_TARGET_INVALID", "target.identitySha256");
  exactKeys(target.scope, ["tenantId", "parkId", "scopeSha256"], [], "PERFORMANCE_PERSON_ASSESSMENT_PRODUCTION_TARGET_INVALID", "target.scope");
  if (!SCOPE_ID.test(target.scope.tenantId ?? "") || !SCOPE_ID.test(target.scope.parkId ?? "")) fail("PERFORMANCE_PERSON_ASSESSMENT_PRODUCTION_TARGET_INVALID", "target scope identity");
  assertSha(target.scope.scopeSha256, "PERFORMANCE_PERSON_ASSESSMENT_PRODUCTION_TARGET_INVALID", "target.scope.scopeSha256");
}

function validateTriple(triple) {
  exactKeys(triple, ["codeSha", "sourceSnapshotHash", "mappingContractHash"], [], "PERFORMANCE_PERSON_ASSESSMENT_PRODUCTION_TRIPLE_INVALID", "triple");
  if (!GIT_SHA.test(triple.codeSha ?? "")) fail("PERFORMANCE_PERSON_ASSESSMENT_PRODUCTION_TRIPLE_INVALID", "code SHA");
  assertSha(triple.sourceSnapshotHash, "PERFORMANCE_PERSON_ASSESSMENT_PRODUCTION_TRIPLE_INVALID", "source snapshot");
  assertSha(triple.mappingContractHash, "PERFORMANCE_PERSON_ASSESSMENT_PRODUCTION_TRIPLE_INVALID", "mapping contract");
}

function validateContract(path = DEFAULT_CONTRACT) {
  const raw = readFileSync(path);
  let contract;
  try { contract = JSON.parse(raw); } catch { fail("PERFORMANCE_PERSON_ASSESSMENT_PRODUCTION_CONTRACT_INVALID", "contract JSON"); }
  if (contract.formatVersion !== 1 || contract.contractKind !== "yuzhou_hr_performance_person_assessment_production_adapter"
    || contract.contractVersion !== "2026-09-05.1" || contract.phase !== "PERFREL"
    || contract.transactionIsolation !== "SERIALIZABLE"
    || contract.databaseCapability?.executionContext !== "production_import"
    || contract.databaseCapability?.currentMigrationCapability !== "lab_rehearsal_only"
    || contract.databaseCapability?.missingCapabilityDisposition !== "reject_before_transaction"
    || contract.authorization?.oneTime !== true || contract.authorization?.importAndRollbackSeparate !== true
    || contract.writer?.exactReplay !== "idempotent_receipt"
    || contract.writer?.driftDisposition !== "reject_before_transaction"
    || contract.rollback?.ownerTablesImmutable !== true || contract.rollback?.residualCount !== 0
    || contract.realSourceObservation?.personAssessmentRelationCount !== 2949
    || contract.realSourceObservation?.assessmentNonNullCount !== 0
    || contract.realSourceObservation?.assessmentMasterCount !== 0
    || contract.realSourceObservation?.disposition !== "no_comparable_result_claim"
    || contract.productionConnection !== "FORBIDDEN_BY_THIS_SLICE" || contract.productionImport !== "HOLD") {
    fail("PERFORMANCE_PERSON_ASSESSMENT_PRODUCTION_CONTRACT_INVALID", "contract boundary");
  }
  if (contract.sourceContract?.path !== "scripts/hr-cutover/contracts/legacy-performance-person-assessment-source-adapter-v1.json"
    || contract.sourceContract.sha256 !== "29e13b7fe4acdb99098e974ff93d76aa03a2cb168890383c00bc3a01b4121c49"
    || contract.weightRelationMigration?.path !== "database/migrations/000307_hr_performance_yuzhou_ass_compute_weight_relation.sql"
    || contract.weightRelationMigration.sha256 !== "0467f31888a5fb52c7c63ab1e754a68ab76822b2e177318bf249f71eb1f8887a") {
    fail("PERFORMANCE_PERSON_ASSESSMENT_PRODUCTION_CONTRACT_INVALID", "evidence allowlist");
  }
  for (const binding of [contract.sourceContract, contract.weightRelationMigration]) {
    const artifact = readFileSync(resolve(import.meta.dirname, "../..", binding.path));
    if (performancePersonAssessmentProductionHash(artifact) !== binding.sha256) fail("PERFORMANCE_PERSON_ASSESSMENT_PRODUCTION_CONTRACT_DRIFT", binding.path);
  }
  return { contract, contractArtifactSha256: performancePersonAssessmentProductionHash(raw) };
}

function validateWindow(window, now) {
  exactKeys(window, ["startsAt", "endsAt"], [], "PERFORMANCE_PERSON_ASSESSMENT_PRODUCTION_WINDOW_INVALID", "window");
  const starts = Date.parse(window.startsAt); const ends = Date.parse(window.endsAt); const instant = now.getTime();
  if (!Number.isFinite(starts) || !Number.isFinite(ends) || starts >= ends || instant < starts || instant >= ends) fail("PERFORMANCE_PERSON_ASSESSMENT_PRODUCTION_WINDOW_INVALID", "inactive window");
}

export function computePerformancePersonAssessmentProductionBindingHash(artifact) {
  return performancePersonAssessmentProductionHash({
    operationId: artifact.operationId,
    parentImportOperationId: artifact.parentImportOperationId,
    triple: artifact.triple,
    target: artifact.target,
    bindings: artifact.bindings,
    rowCount: artifact.rowCount,
    payloadSha256: artifact.payloadSha256,
    window: artifact.window,
    sealedArtifactSha256: artifact.sealing.sealedArtifactSha256,
  });
}

export function sealPerformancePersonAssessmentProductionPayload(input, { contractPath = DEFAULT_CONTRACT } = {}) {
  exactKeys(input, [
    "operationId", "parentImportOperationId", "triple", "target", "t0ArtifactSha256", "window",
    "sourceRestoreReceipt", "sourceRestoreReceiptArtifactSha256", "sourcePrivatePayload",
    "sourcePrivatePayloadArtifactSha256", "safeReceipt", "safeReceiptArtifactSha256",
  ], [], "PERFORMANCE_PERSON_ASSESSMENT_PRODUCTION_INPUT_INVALID", "input");
  if (!OPERATION.test(input.operationId ?? "") || !PARENT_OPERATION.test(input.parentImportOperationId ?? "")) fail("PERFORMANCE_PERSON_ASSESSMENT_PRODUCTION_INPUT_INVALID", "operation identity");
  validateTriple(input.triple); validateTarget(input.target);
  assertSha(input.t0ArtifactSha256, "PERFORMANCE_PERSON_ASSESSMENT_PRODUCTION_INPUT_INVALID", "T0 artifact");
  assertSha(input.sourceRestoreReceiptArtifactSha256, "PERFORMANCE_PERSON_ASSESSMENT_PRODUCTION_INPUT_INVALID", "source restore receipt artifact");
  assertSha(input.sourcePrivatePayloadArtifactSha256, "PERFORMANCE_PERSON_ASSESSMENT_PRODUCTION_INPUT_INVALID", "source payload artifact");
  assertSha(input.safeReceiptArtifactSha256, "PERFORMANCE_PERSON_ASSESSMENT_PRODUCTION_INPUT_INVALID", "safe receipt artifact");
  validateWindow(input.window, new Date(input.window.startsAt));
  const source = validatePerformancePersonAssessmentPrivateLabPayload(input.sourcePrivatePayload);
  const receipt = validatePerformancePersonAssessmentSafeSourceReceipt(input.safeReceipt);
  const restoreReceipt = validateSourceRestoreReceipt(input.sourceRestoreReceipt);
  const { contract, contractArtifactSha256 } = validateContract(contractPath);
  if (input.sourceRestoreReceiptArtifactSha256 !== performancePersonAssessmentProductionHash(`${JSON.stringify(restoreReceipt, null, 2)}\n`)
    || input.sourcePrivatePayloadArtifactSha256 !== performancePersonAssessmentProductionHash(`${JSON.stringify(source, null, 2)}\n`)
    || input.safeReceiptArtifactSha256 !== performancePersonAssessmentProductionHash(`${JSON.stringify(receipt, null, 2)}\n`)
    || source.contractSha256 !== contract.sourceContract.sha256 || receipt.contractSha256 !== source.contractSha256
    || restoreReceipt.sourceSnapshotSha256 !== input.triple.sourceSnapshotHash
    || source.sourceBinding.sourceRestoreReceiptSha256 !== input.sourceRestoreReceiptArtifactSha256
    || !same(source.sourceBinding, receipt.sourceBinding)
    || source.artifactSha256 !== receipt.privateLabPayload.artifactSha256
    || source.payloadSha256 !== receipt.privateLabPayload.payloadSha256
    || source.rowCount !== receipt.privateLabPayload.rowCount) {
    fail("PERFORMANCE_PERSON_ASSESSMENT_PRODUCTION_SOURCE_BINDING_MISMATCH", "source payload/receipt/C/S/M binding");
  }
  const body = {
    formatVersion: 1,
    artifactKind: "yuzhou_hr_performance_person_assessment_production_payload",
    status: "SEALED",
    operationId: input.operationId,
    parentImportOperationId: input.parentImportOperationId,
    triple: structuredClone(input.triple),
    target: structuredClone(input.target),
    bindings: {
      t0ArtifactSha256: input.t0ArtifactSha256,
      sourceRestoreReceiptSha256: input.sourceRestoreReceiptArtifactSha256,
      contractArtifactSha256,
      sourcePayloadArtifactSha256: input.sourcePrivatePayloadArtifactSha256,
      sourcePayloadSha256: source.payloadSha256,
      safeReceiptArtifactSha256: input.safeReceiptArtifactSha256,
      safeReceiptSha256: receipt.receiptSha256,
      migrationArtifactSha256: contract.weightRelationMigration.sha256,
    },
    rowCount: source.rowCount,
    payload: structuredClone(source.payload),
    payloadSha256: performancePersonAssessmentProductionHash(source.payload),
    window: structuredClone(input.window),
    containsPersonCodes: false,
    compatibilityCredit: 0,
    productionImport: "HOLD",
  };
  const sealedArtifactSha256 = performancePersonAssessmentProductionHash(body);
  return { ...body, sealing: { algorithm: "canonical-json-sha256-v1", sealedArtifactSha256 } };
}

export function validatePerformancePersonAssessmentProductionPayload(artifact, { contractPath = DEFAULT_CONTRACT, now = new Date() } = {}) {
  exactKeys(artifact, [
    "formatVersion", "artifactKind", "status", "operationId", "parentImportOperationId", "triple", "target",
    "bindings", "rowCount", "payload", "payloadSha256", "window", "containsPersonCodes", "compatibilityCredit",
    "productionImport", "sealing",
  ], [], "PERFORMANCE_PERSON_ASSESSMENT_PRODUCTION_PAYLOAD_INVALID", "artifact");
  if (artifact.formatVersion !== 1 || artifact.artifactKind !== "yuzhou_hr_performance_person_assessment_production_payload"
    || artifact.status !== "SEALED" || !OPERATION.test(artifact.operationId ?? "")
    || !PARENT_OPERATION.test(artifact.parentImportOperationId ?? "") || artifact.containsPersonCodes !== false
    || artifact.compatibilityCredit !== 0 || artifact.productionImport !== "HOLD") fail("PERFORMANCE_PERSON_ASSESSMENT_PRODUCTION_PAYLOAD_INVALID", "identity/boundary");
  validateTriple(artifact.triple); validateTarget(artifact.target); validateWindow(artifact.window, now);
  exactKeys(artifact.bindings, [
    "t0ArtifactSha256", "sourceRestoreReceiptSha256", "contractArtifactSha256", "sourcePayloadArtifactSha256",
    "sourcePayloadSha256", "safeReceiptArtifactSha256", "safeReceiptSha256", "migrationArtifactSha256",
  ], [], "PERFORMANCE_PERSON_ASSESSMENT_PRODUCTION_PAYLOAD_INVALID", "bindings");
  for (const [key, value] of Object.entries(artifact.bindings)) assertSha(value, "PERFORMANCE_PERSON_ASSESSMENT_PRODUCTION_PAYLOAD_INVALID", `bindings.${key}`);
  const { contract, contractArtifactSha256 } = validateContract(contractPath);
  if (artifact.bindings.contractArtifactSha256 !== contractArtifactSha256
    || artifact.bindings.migrationArtifactSha256 !== contract.weightRelationMigration.sha256
    || !Number.isSafeInteger(artifact.rowCount) || artifact.rowCount < 1
    || !object(artifact.payload) || !Array.isArray(artifact.payload.personAssessments)
    || artifact.payload.personAssessments.length !== artifact.rowCount
    || artifact.payloadSha256 !== performancePersonAssessmentProductionHash(artifact.payload)) fail("PERFORMANCE_PERSON_ASSESSMENT_PRODUCTION_PAYLOAD_INVALID", "binding/payload drift");
  for (const row of artifact.payload.personAssessments) {
    exactKeys(row, ["sourcePersonIdentitySha256", "sourceAssessmentId"], [], "PERFORMANCE_PERSON_ASSESSMENT_PRODUCTION_PAYLOAD_INVALID", "person assessment row");
    assertSha(row.sourcePersonIdentitySha256, "PERFORMANCE_PERSON_ASSESSMENT_PRODUCTION_PAYLOAD_INVALID", "source person identity");
    if (row.sourceAssessmentId !== null && !Number.isSafeInteger(row.sourceAssessmentId)) fail("PERFORMANCE_PERSON_ASSESSMENT_PRODUCTION_PAYLOAD_INVALID", "assessment identity");
  }
  exactKeys(artifact.sealing, ["algorithm", "sealedArtifactSha256"], [], "PERFORMANCE_PERSON_ASSESSMENT_PRODUCTION_PAYLOAD_INVALID", "sealing");
  const { sealing, ...body } = artifact;
  if (sealing.algorithm !== "canonical-json-sha256-v1" || sealing.sealedArtifactSha256 !== performancePersonAssessmentProductionHash(body)) fail("PERFORMANCE_PERSON_ASSESSMENT_PRODUCTION_PAYLOAD_DRIFT", "sealed payload hash");
  return structuredClone(artifact);
}

function validateAuthorization(authorization, artifact, intent, now, rollback = false) {
  const idKey = rollback ? "rollbackOperationId" : "operationId";
  exactKeys(authorization, ["formatVersion", "artifactKind", "intent", idKey, "artifactSha256", "nonceSha256", "issuedAt", "expiresAt", "bindingSha256"], [], "PERFORMANCE_PERSON_ASSESSMENT_PRODUCTION_AUTH_INVALID", "authorization");
  const expectedKind = rollback ? "yuzhou_hr_performance_person_assessment_rollback_authorization" : "yuzhou_hr_performance_person_assessment_import_authorization";
  const expectedId = rollback ? ROLLBACK_OPERATION : OPERATION;
  if (authorization.formatVersion !== 1 || authorization.artifactKind !== expectedKind || authorization.intent !== intent
    || !expectedId.test(authorization[idKey] ?? "") || (!rollback && authorization.operationId !== artifact.operationId)) fail("PERFORMANCE_PERSON_ASSESSMENT_PRODUCTION_AUTH_INVALID", "identity");
  for (const key of ["artifactSha256", "nonceSha256", "bindingSha256"]) assertSha(authorization[key], "PERFORMANCE_PERSON_ASSESSMENT_PRODUCTION_AUTH_INVALID", key);
  const issued = Date.parse(authorization.issuedAt); const expires = Date.parse(authorization.expiresAt); const instant = now.getTime();
  if (!Number.isFinite(issued) || !Number.isFinite(expires) || issued >= expires || instant < issued || instant >= expires
    || issued < Date.parse(artifact.window.startsAt) || expires > Date.parse(artifact.window.endsAt)) fail("PERFORMANCE_PERSON_ASSESSMENT_PRODUCTION_AUTH_STALE", "authorization window");
  const expectedBinding = performancePersonAssessmentProductionHash({
    intent,
    operationId: artifact.operationId,
    ...(rollback ? { rollbackOperationId: authorization.rollbackOperationId } : {}),
    sealedArtifactSha256: artifact.sealing.sealedArtifactSha256,
    targetIdentitySha256: artifact.target.identitySha256,
    targetScopeSha256: artifact.target.scope.scopeSha256,
    productionBindingSha256: computePerformancePersonAssessmentProductionBindingHash(artifact),
  });
  if (authorization.bindingSha256 !== expectedBinding) fail("PERFORMANCE_PERSON_ASSESSMENT_PRODUCTION_AUTH_BINDING_MISMATCH", "authorization does not bind exact payload");
  return structuredClone(authorization);
}

function validateRuntimeOptions(artifact, options) {
  if (options.currentCodeSha !== artifact.triple.codeSha || options.mergedCodeSha !== artifact.triple.codeSha) fail("PERFORMANCE_PERSON_ASSESSMENT_PRODUCTION_CODE_DRIFT", "candidate/merged C differs");
  if (!options.database || typeof options.database.probeTarget !== "function" || typeof options.database.probePerformancePersonAssessmentCapability !== "function"
    || typeof options.database.probePerformancePersonAssessmentOperation !== "function" || typeof options.database.transaction !== "function"
    || typeof options.database.readPerformancePersonAssessmentReceipt !== "function") fail("PERFORMANCE_PERSON_ASSESSMENT_PRODUCTION_DATABASE_REQUIRED", "fixed database adapter required");
}

function validateCapability(capability, artifact) {
  if (!object(capability) || capability.executionContext !== "production_import" || capability.phase !== "PERFREL"
    || capability.migrationArtifactSha256 !== artifact.bindings.migrationArtifactSha256
    || capability.parentImportOperationId !== artifact.parentImportOperationId
    || capability.t0ArtifactSha256 !== artifact.bindings.t0ArtifactSha256
    || capability.contractArtifactSha256 !== artifact.bindings.contractArtifactSha256
    || capability.applyProcedure !== "materialize_yuzhou_performance_ass_compute_weight_relation_production"
    || capability.rollbackProcedure !== "rollback_yuzhou_performance_ass_compute_weight_relation_production") {
    fail("PERFORMANCE_PERSON_ASSESSMENT_PRODUCTION_CAPABILITY_UNAVAILABLE", "000307 production procedure/control binding is absent or drifted");
  }
}

function validateReceipt(receipt, artifact, status) {
  if (!object(receipt) || receipt.operationId !== artifact.operationId || receipt.status !== status
    || receipt.sealedArtifactSha256 !== artifact.sealing.sealedArtifactSha256
    || receipt.bindingSha256 !== computePerformancePersonAssessmentProductionBindingHash(artifact)
    || receipt.targetScopeSha256 !== artifact.target.scope.scopeSha256
    || !Number.isSafeInteger(receipt.evidenceRows) || !Number.isSafeInteger(receipt.masterRows)
    || !Number.isSafeInteger(receipt.resolutionRows) || receipt.evidenceRows !== (status === "rolled_back" ? 0 : artifact.rowCount)
    || receipt.resolutionRows !== (status === "rolled_back" ? 0 : receipt.masterRows)
    || !SHA256.test(receipt.stateSha256 ?? "")) fail("PERFORMANCE_PERSON_ASSESSMENT_PRODUCTION_RECEIPT_INVALID", "database receipt conservation/binding");
  return Object.freeze({ ...receipt, productionImport: status === "succeeded" ? "IMPORTED" : "ROLLED_BACK" });
}

async function preflight(artifactInput, authorizationInput, options, rollback = false) {
  const now = options.now ?? new Date();
  const artifact = validatePerformancePersonAssessmentProductionPayload(artifactInput, { contractPath: options.contractPath, now });
  const contract = validateContract(options.contractPath).contract;
  const intent = rollback ? contract.authorization.rollbackIntent : contract.authorization.importIntent;
  const authorization = validateAuthorization(authorizationInput, artifact, intent, now, rollback);
  validateRuntimeOptions(artifact, options);
  const target = await options.database.probeTarget({ targetIdentitySha256: artifact.target.identitySha256, targetScope: artifact.target.scope });
  if (target?.targetIdentitySha256 !== artifact.target.identitySha256 || !same(target?.targetScope, artifact.target.scope)) fail("PERFORMANCE_PERSON_ASSESSMENT_PRODUCTION_TARGET_DRIFT", "target probe differs");
  let capability;
  try { capability = await options.database.probePerformancePersonAssessmentCapability(artifact); }
  catch (error) { fail("PERFORMANCE_PERSON_ASSESSMENT_PRODUCTION_CAPABILITY_UNAVAILABLE", "read-only capability probe failed", { cause: error }); }
  validateCapability(capability, artifact);
  const operation = await options.database.probePerformancePersonAssessmentOperation(artifact.operationId);
  return { artifact, authorization, operation };
}

export async function executePerformancePersonAssessmentProductionPayload(artifactInput, authorizationInput, options) {
  const { artifact, authorization, operation } = await preflight(artifactInput, authorizationInput, options, false);
  if (operation) return validateReceipt(operation, artifact, "succeeded");
  await options.database.transaction({ isolationLevel: "SERIALIZABLE", purpose: "consume_performance_person_assessment_authorization" }, async tx => {
    await tx.query("SELECT hr_yuzhou_consume_performance_person_assessment_authorization($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)", [
      artifact.operationId, artifact.parentImportOperationId, artifact.triple.codeSha, artifact.triple.sourceSnapshotHash,
      artifact.triple.mappingContractHash, artifact.bindings.t0ArtifactSha256, artifact.bindings.contractArtifactSha256,
      artifact.bindings.sourceRestoreReceiptSha256, artifact.bindings.sourcePayloadArtifactSha256,
      artifact.bindings.safeReceiptArtifactSha256, artifact.bindings.migrationArtifactSha256,
      artifact.payloadSha256, artifact.sealing.sealedArtifactSha256,
      computePerformancePersonAssessmentProductionBindingHash(artifact), authorization.artifactSha256,
      authorization.nonceSha256, authorization.expiresAt,
    ]);
  });
  return options.database.transaction({ isolationLevel: "SERIALIZABLE", purpose: "apply_performance_person_assessment" }, async tx => {
    await tx.query("CALL materialize_yuzhou_performance_ass_compute_weight_relation_production($1,$2,$3,$4,$5,$6::jsonb)", [
      artifact.operationId, artifact.target.scope.tenantId, artifact.target.scope.parkId,
      artifact.bindings.migrationArtifactSha256, artifact.payloadSha256, JSON.stringify(artifact.payload),
    ]);
    return validateReceipt(await options.database.readPerformancePersonAssessmentReceipt(tx, artifact.operationId), artifact, "succeeded");
  });
}

export async function rollbackPerformancePersonAssessmentProductionPayload(artifactInput, authorizationInput, options) {
  const { artifact, authorization, operation } = await preflight(artifactInput, authorizationInput, options, true);
  if (!operation) fail("PERFORMANCE_PERSON_ASSESSMENT_PRODUCTION_ROLLBACK_SOURCE_INVALID", "succeeded operation absent");
  if (operation.status === "rolled_back") return validateReceipt(operation, artifact, "rolled_back");
  validateReceipt(operation, artifact, "succeeded");
  await options.database.transaction({ isolationLevel: "SERIALIZABLE", purpose: "consume_performance_person_assessment_rollback_authorization" }, async tx => {
    await tx.query("SELECT hr_yuzhou_consume_performance_person_assessment_rollback_authorization($1,$2,$3,$4,$5,$6)", [
      authorization.rollbackOperationId, artifact.operationId, artifact.sealing.sealedArtifactSha256,
      authorization.artifactSha256, authorization.nonceSha256, authorization.expiresAt,
    ]);
  });
  return options.database.transaction({ isolationLevel: "SERIALIZABLE", purpose: "rollback_performance_person_assessment" }, async tx => {
    await tx.query("CALL rollback_yuzhou_performance_ass_compute_weight_relation_production($1,$2)", [authorization.rollbackOperationId, artifact.operationId]);
    return validateReceipt(await options.database.readPerformancePersonAssessmentReceipt(tx, artifact.operationId), artifact, "rolled_back");
  });
}
