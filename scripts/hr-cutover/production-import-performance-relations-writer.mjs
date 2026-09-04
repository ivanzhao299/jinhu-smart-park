import { createHash } from "node:crypto";

import { validateHeldPerformanceRelationsBinding } from "./production-import-performance-relations-contract.mjs";

const SHA256 = /^[0-9a-f]{64}$/u;
const OPERATION_ID = /^yzprod-import-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{12}$/u;
const ROLLBACK_OPERATION_ID = /^yzprod-rollback-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{12}$/u;
const CAPABILITY = "jinhu-yuzhou-performance-relations-production-v1";

export class ProductionPerformanceRelationsWriterError extends Error {
  constructor(code, detail, options = undefined) {
    super(`${code}: ${detail}`, options);
    this.name = "ProductionPerformanceRelationsWriterError";
    this.code = code;
  }
}

const fail = (code, detail, options) => { throw new ProductionPerformanceRelationsWriterError(code, detail, options); };
const hash = value => createHash("sha256").update(value).digest("hex");
const bytes = (value, label) => {
  if (!Buffer.isBuffer(value) || value.length === 0) fail("PRODUCTION_IMPORT_PERFORMANCE_RELATIONS_ARTIFACT_INVALID", `${label} must be non-empty bytes`);
  return value;
};
const rows = (result, label) => {
  if (!result || !Array.isArray(result.rows)) fail("PRODUCTION_IMPORT_PERFORMANCE_RELATIONS_DATABASE_RESULT_INVALID", `${label} returned no rows`);
  return result.rows;
};
const one = (result, label) => {
  const found = rows(result, label);
  if (found.length !== 1) fail("PRODUCTION_IMPORT_PERFORMANCE_RELATIONS_DATABASE_RESULT_INVALID", `${label} must return one row`);
  return found[0];
};
const integer = (value, label) => {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) fail("PRODUCTION_IMPORT_PERFORMANCE_RELATIONS_RECEIPT_INVALID", `${label} is invalid`);
  return parsed;
};

function validateInvocation(input, { rollback = false } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("PRODUCTION_IMPORT_PERFORMANCE_RELATIONS_INPUT_INVALID", "input must be an object");
  const binding = validateHeldPerformanceRelationsBinding(input.binding);
  if (!OPERATION_ID.test(input.operationId ?? "") || !SHA256.test(input.sealedPlanSha256 ?? "") || !SHA256.test(input.targetIdentitySha256 ?? "")) fail("PRODUCTION_IMPORT_PERFORMANCE_RELATIONS_INPUT_INVALID", "operation, plan, or target identity is invalid");
  if (!input.targetScope || input.targetScope.tenantId === undefined || input.targetScope.parkId === undefined || !SHA256.test(input.targetScope.scopeSha256 ?? "")) fail("PRODUCTION_IMPORT_PERFORMANCE_RELATIONS_INPUT_INVALID", "target scope is invalid");
  if (input.targetIdentitySha256 !== input.expectedTargetIdentitySha256 || input.targetScope.scopeSha256 !== input.expectedTargetScopeSha256) fail("PRODUCTION_IMPORT_PERFORMANCE_RELATIONS_TARGET_BINDING_MISMATCH", "connected target differs from sealed target");
  if (input.codeSha !== binding.triple.codeSha || input.sourceSnapshotSha256 !== binding.triple.sourceSnapshotHash || input.mappingContractSha256 !== binding.triple.mappingContractHash || input.t0PhaseReceiptSha256 !== binding.t0PhaseReceiptSha256) fail("PRODUCTION_IMPORT_PERFORMANCE_RELATIONS_CSM_T0_BINDING_MISMATCH", "C/S/M or T0 receipt differs");
  if (!SHA256.test(input.authorizationArtifactSha256 ?? "") || !SHA256.test(input.authorizationNonceSha256 ?? "")) fail("PRODUCTION_IMPORT_PERFORMANCE_RELATIONS_AUTH_BINDING_MISMATCH", "one-time authorization binding is invalid");
  if (rollback) return { binding };
  const relationArtifact = bytes(input.relationPayloadArtifact, "relation payload artifact");
  const identityArtifact = bytes(input.identityDecisionArtifact, "identity decision artifact");
  if (hash(relationArtifact) !== binding.relationPayloadArtifactSha256 || hash(identityArtifact) !== binding.identityDecisionArtifactSha256) fail("PRODUCTION_IMPORT_PERFORMANCE_RELATIONS_ARTIFACT_HASH_MISMATCH", "private artifact bytes differ from sealed hashes");
  return { binding, relationArtifact, identityArtifact };
}

export function validateProductionPerformanceRelationsInvocation(input, options = undefined) {
  const validated = validateInvocation(input, options);
  return { binding: structuredClone(validated.binding) };
}

function validateCapability(row, binding) {
  if (row.capability_id !== CAPABILITY || row.migration_305_sha256 !== binding.migration305Sha256 || row.migration_306_sha256 !== binding.migration306Sha256 || row.production_context_supported !== true || row.reverse_order !== "identity_resolution>source_person_assignments") {
    fail("PRODUCTION_IMPORT_PERFORMANCE_RELATIONS_SCHEMA_CAPABILITY_MISMATCH", "production capability is absent or differs from the reviewed contract");
  }
  return Object.freeze({ capabilityId: CAPABILITY, migration305Sha256: binding.migration305Sha256, migration306Sha256: binding.migration306Sha256, productionContextSupported: true });
}

export async function probeProductionPerformanceRelationsCapability({ query, binding: bindingInput }) {
  if (typeof query !== "function") fail("PRODUCTION_IMPORT_PERFORMANCE_RELATIONS_PROBE_REQUIRED", "a read-only query callback is required");
  const binding = validateHeldPerformanceRelationsBinding(bindingInput);
  try {
    const result = await query(
      `/* hr-prod-performance-relations:capability */
       SELECT capability_id,migration_305_sha256,migration_306_sha256,
              production_context_supported,reverse_order
       FROM hr_yuzhou_performance_relations_production_capability_v1()`,
      [],
    );
    return validateCapability(one(result, "capability probe"), binding);
  } catch (error) {
    if (error instanceof ProductionPerformanceRelationsWriterError) throw error;
    fail("PRODUCTION_IMPORT_PERFORMANCE_RELATIONS_SCHEMA_CAPABILITY_UNAVAILABLE", "reviewed production schema interface is unavailable", { cause: error });
  }
}

function validateForwardReceipt(row, binding) {
  const receipt = {
    status: row.status,
    replayed: row.replayed === true,
    sessionRows: integer(row.session_rows, "sessionRows"),
    scoreSourceRows: integer(row.score_source_rows, "scoreSourceRows"),
    assignmentRows: integer(row.assignment_rows, "assignmentRows"),
    activeRelationMaps: integer(row.active_relation_maps, "activeRelationMaps"),
    identityResolutionRows: integer(row.identity_resolution_rows, "identityResolutionRows"),
    sessionBindingRows: integer(row.session_binding_rows, "sessionBindingRows"),
    subjectUnmatchedRows: integer(row.subject_unmatched_rows, "subjectUnmatchedRows"),
    blankAssessorRows: integer(row.blank_assessor_rows, "blankAssessorRows"),
    receiptSha256: row.receipt_sha256,
  };
  const expected = {
    sessionRows: binding.sessionRows, scoreSourceRows: binding.scoreSourceRows,
    assignmentRows: binding.assignmentRows, activeRelationMaps: binding.activeRelationMaps,
    identityResolutionRows: binding.identityResolutionRows, sessionBindingRows: 7,
    subjectUnmatchedRows: binding.subjectUnmatchedRows, blankAssessorRows: binding.blankAssessorRows,
  };
  if (receipt.status !== "succeeded" || !SHA256.test(receipt.receiptSha256 ?? "") || Object.entries(expected).some(([key, value]) => receipt[key] !== value)) fail("PRODUCTION_IMPORT_PERFORMANCE_RELATIONS_CONSERVATION_FAILED", "forward control receipt differs from the sealed aggregate");
  return receipt;
}

export async function writeProductionPerformanceRelations(input) {
  if (!input?.tx || typeof input.tx.query !== "function") fail("PRODUCTION_IMPORT_PERFORMANCE_RELATIONS_TRANSACTION_REQUIRED", "SERIALIZABLE transaction handle is required");
  const { binding, relationArtifact, identityArtifact } = validateInvocation(input);
  const row = one(await input.tx.query(
    `/* hr-prod-performance-relations:apply */
     SELECT * FROM hr_yuzhou_apply_performance_relations_production_v1(
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::bytea,$16::bytea,$17,$18
     )`,
    [input.operationId, input.sealedPlanSha256, input.authorizationArtifactSha256, input.authorizationNonceSha256,
      input.codeSha, input.sourceSnapshotSha256, input.mappingContractSha256, input.targetIdentitySha256,
      input.targetScope.tenantId, input.targetScope.parkId, input.targetScope.scopeSha256, input.t0PhaseReceiptSha256,
      binding.relationPayloadArtifactSha256, binding.identityDecisionArtifactSha256, relationArtifact, identityArtifact,
      binding.migration305Sha256, binding.migration306Sha256],
  ), "production relation writer");
  return validateForwardReceipt(row, binding);
}

export async function rollbackProductionPerformanceRelations(input) {
  if (!input?.tx || typeof input.tx.query !== "function") fail("PRODUCTION_IMPORT_PERFORMANCE_RELATIONS_TRANSACTION_REQUIRED", "SERIALIZABLE transaction handle is required");
  const { binding } = validateInvocation(input, { rollback: true });
  if (!ROLLBACK_OPERATION_ID.test(input.rollbackOperationId ?? "")) fail("PRODUCTION_IMPORT_PERFORMANCE_RELATIONS_INPUT_INVALID", "rollback operation is invalid");
  const row = one(await input.tx.query(
    `/* hr-prod-performance-relations:rollback-identity-then-relations */
     SELECT * FROM hr_yuzhou_rollback_performance_relations_production_v1(
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15
     )`,
    [input.rollbackOperationId, input.operationId, input.sealedPlanSha256,
      input.authorizationArtifactSha256, input.authorizationNonceSha256, input.codeSha,
      input.sourceSnapshotSha256, input.mappingContractSha256, input.targetIdentitySha256,
      input.targetScope.tenantId, input.targetScope.parkId, input.targetScope.scopeSha256,
      input.t0PhaseReceiptSha256, binding.migration305Sha256, binding.migration306Sha256],
  ), "production relation rollback");
  const residualCount = integer(row.residual_count, "residualCount");
  if (row.status !== "rolled_back" || row.rollback_order !== "identity_resolution>source_person_assignments" || residualCount !== 0 || !SHA256.test(row.receipt_sha256 ?? "")) fail("PRODUCTION_IMPORT_PERFORMANCE_RELATIONS_ROLLBACK_RESIDUAL", "reverse-order rollback receipt is invalid");
  return { status: "rolled_back", rollbackOrder: ["identity_resolution", "source_person_assignments"], residualCount, replayed: row.replayed === true, receiptSha256: row.receipt_sha256 };
}

export const PRODUCTION_PERFORMANCE_RELATIONS_CAPABILITY_ID = CAPABILITY;
