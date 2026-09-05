/* global structuredClone */
import {
  validateProductionPerformanceFactIdentityBinding,
} from "./production-import-performance-fact-identity-contract.mjs";

const SHA256 = /^[0-9a-f]{64}$/u;
const OPERATION_ID = /^yzprod-import-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{12}$/u;
const ROLLBACK_OPERATION_ID = /^yzprod-rollback-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{12}$/u;
const SCOPE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/u;
const CAPABILITY = "jinhu-yuzhou-performance-fact-identity-production-v1";
const FACT_KINDS = "dimension_result>master_result";
const ROLLBACK_ORDER = "fact_identity>performance_relations>performance_facts";

export class ProductionPerformanceFactIdentityWriterError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "ProductionPerformanceFactIdentityWriterError";
    this.code = code;
  }
}

const fail = (code, detail) => {
  throw new ProductionPerformanceFactIdentityWriterError(code, detail);
};
const sha = (value, label, code = "PRODUCTION_IMPORT_PERFORMANCE_FACT_IDENTITY_INPUT_INVALID") => {
  if (typeof value !== "string" || !SHA256.test(value)) fail(code, `${label} must be SHA-256`);
};
const integer = (value, label) => {
  let parsed = Number.NaN;
  if (typeof value === "number") parsed = value;
  else if (typeof value === "string" && /^(?:0|[1-9][0-9]*)$/u.test(value)) {
    parsed = Number(value);
  }
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    fail("PRODUCTION_IMPORT_PERFORMANCE_FACT_IDENTITY_RECEIPT_INVALID", `${label} is invalid`);
  }
  return parsed;
};
const boolean = (value, label) => {
  if (typeof value !== "boolean") {
    fail("PRODUCTION_IMPORT_PERFORMANCE_FACT_IDENTITY_RECEIPT_INVALID", `${label} is invalid`);
  }
  return value;
};
const rows = (result, label) => {
  if (!result || !Array.isArray(result.rows)) {
    fail("PRODUCTION_IMPORT_PERFORMANCE_FACT_IDENTITY_DATABASE_RESULT_INVALID", `${label} returned no rows`);
  }
  return result.rows;
};
const one = (result, label) => {
  const found = rows(result, label);
  if (found.length !== 1) {
    fail("PRODUCTION_IMPORT_PERFORMANCE_FACT_IDENTITY_DATABASE_RESULT_INVALID", `${label} must return one row`);
  }
  return found[0];
};

function validateTarget(input) {
  if (!input.targetScope
    || !SCOPE_ID.test(input.targetScope.tenantId ?? "")
    || !SCOPE_ID.test(input.targetScope.parkId ?? "")) {
    fail("PRODUCTION_IMPORT_PERFORMANCE_FACT_IDENTITY_INPUT_INVALID", "target scope is invalid");
  }
  sha(input.targetScope.scopeSha256, "target scope");
  sha(input.targetIdentitySha256, "target identity");
  sha(input.expectedTargetIdentitySha256, "expected target identity");
  sha(input.expectedTargetScopeSha256, "expected target scope");
  if (input.targetIdentitySha256 !== input.expectedTargetIdentitySha256
    || input.targetScope.scopeSha256 !== input.expectedTargetScopeSha256) {
    fail(
      "PRODUCTION_IMPORT_PERFORMANCE_FACT_IDENTITY_TARGET_BINDING_MISMATCH",
      "connected target differs from the sealed target",
    );
  }
}

function validateInvocation(input, { rollback = false } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    fail("PRODUCTION_IMPORT_PERFORMANCE_FACT_IDENTITY_INPUT_INVALID", "input must be an object");
  }
  const binding = validateProductionPerformanceFactIdentityBinding(input.binding, {
    parentPerformanceRelationsBinding: input.parentPerformanceRelationsBinding,
    parentPerformanceFactLoaderBinding: input.parentPerformanceFactLoaderBinding,
  });
  if (!OPERATION_ID.test(input.operationId ?? "")) {
    fail("PRODUCTION_IMPORT_PERFORMANCE_FACT_IDENTITY_INPUT_INVALID", "operation identity is invalid");
  }
  if (rollback && !ROLLBACK_OPERATION_ID.test(input.rollbackOperationId ?? "")) {
    fail("PRODUCTION_IMPORT_PERFORMANCE_FACT_IDENTITY_INPUT_INVALID", "rollback operation is invalid");
  }
  validateTarget(input);
  for (const key of [
    "sealedPlanSha256", "authorizationArtifactSha256", "authorizationNonceSha256",
    rollback ? "extensionRollbackNonceSha256" : "extensionNonceSha256",
    "t0PhaseReceiptSha256", "parentRelationsReceiptSha256", "factLoaderReceiptSha256",
  ]) sha(input[key], key);
  if (input.codeSha !== binding.triple.codeSha
    || input.sourceSnapshotSha256 !== binding.triple.sourceSnapshotHash
    || input.mappingContractSha256 !== binding.triple.mappingContractHash
    || input.t0PhaseReceiptSha256 !== binding.t0PhaseReceiptSha256) {
    fail(
      "PRODUCTION_IMPORT_PERFORMANCE_FACT_IDENTITY_EXECUTION_BINDING_MISMATCH",
      "C/S/M, T0, or parent relation contract differs",
    );
  }
  return {
    binding,
    expectedFactOwnerMaps: input.parentPerformanceFactLoaderBinding.activeFactMaps,
    expectedRelationOwnerMaps: input.parentPerformanceRelationsBinding.activeRelationMaps,
  };
}

export function validateProductionPerformanceFactIdentityInvocation(input, options = undefined) {
  const { binding } = validateInvocation(input, options);
  return { binding: structuredClone(binding) };
}

function validateCapability(row, binding) {
  if (row.capability_id !== CAPABILITY
    || row.migration_308_sha256 !== binding.migration308Sha256
    || row.production_context_supported !== true
    || row.fact_kinds !== FACT_KINDS
    || row.rollback_order !== ROLLBACK_ORDER) {
    fail(
      "PRODUCTION_IMPORT_PERFORMANCE_FACT_IDENTITY_SCHEMA_CAPABILITY_MISMATCH",
      "production capability is absent or differs from the reviewed contract",
    );
  }
  return Object.freeze({
    capabilityId: CAPABILITY,
    migration308Sha256: binding.migration308Sha256,
    productionContextSupported: true,
    factKinds: [...binding.factKinds],
    rollbackOrder: [...binding.rollbackOrder],
  });
}

export async function probeProductionPerformanceFactIdentityCapability({
  query,
  binding: bindingInput,
  parentPerformanceRelationsBinding,
  parentPerformanceFactLoaderBinding,
}) {
  if (typeof query !== "function") {
    fail(
      "PRODUCTION_IMPORT_PERFORMANCE_FACT_IDENTITY_PROBE_REQUIRED",
      "a read-only query callback is required",
    );
  }
  const binding = validateProductionPerformanceFactIdentityBinding(bindingInput, {
    parentPerformanceRelationsBinding,
    parentPerformanceFactLoaderBinding,
  });
  try {
    const result = await query(
      `/* hr-prod-performance-fact-identity:capability */
       SELECT capability_id,migration_308_sha256,production_context_supported,
              fact_kinds,rollback_order
       FROM hr_yuzhou_performance_fact_identity_production_capability_v1()`,
      [],
    );
    return validateCapability(one(result, "capability probe"), binding);
  } catch (error) {
    if (error instanceof ProductionPerformanceFactIdentityWriterError) throw error;
    fail(
      "PRODUCTION_IMPORT_PERFORMANCE_FACT_IDENTITY_SCHEMA_CAPABILITY_UNAVAILABLE",
      "reviewed production schema interface is unavailable",
    );
  }
}

function validateForwardReceipt(
  row,
  binding,
  { expectedFactOwnerMaps, expectedRelationOwnerMaps },
) {
  const receipt = {
    status: row.status,
    replayed: boolean(row.replayed, "replayed"),
    dimensionRows: integer(row.dimension_rows, "dimensionRows"),
    masterRows: integer(row.master_rows, "masterRows"),
    factRows: integer(row.fact_rows, "factRows"),
    resolvedRows: integer(row.resolved_rows, "resolvedRows"),
    unmatchedRows: integer(row.unmatched_rows, "unmatchedRows"),
    ambiguousRows: integer(row.ambiguous_rows, "ambiguousRows"),
    notApplicableRows: integer(row.not_applicable_rows, "notApplicableRows"),
    cycleResolvedRows: integer(row.cycle_resolved_rows, "cycleResolvedRows"),
    cycleUnmatchedRows: integer(row.cycle_unmatched_rows, "cycleUnmatchedRows"),
    cycleAmbiguousRows: integer(row.cycle_ambiguous_rows, "cycleAmbiguousRows"),
    cycleNotApplicableRows: integer(row.cycle_not_applicable_rows, "cycleNotApplicableRows"),
    factSetSha256: row.fact_set_sha256,
    resolutionStateSha256: row.resolution_state_sha256,
    factOwnerMaps: integer(row.fact_owner_maps, "factOwnerMaps"),
    relationOwnerMaps: integer(row.relation_owner_maps, "relationOwnerMaps"),
    verifiedOwnerMaps: integer(row.verified_owner_maps, "verifiedOwnerMaps"),
    ownerMapStateSha256: row.owner_map_state_sha256,
    receiptSha256: row.receipt_sha256,
  };
  for (const key of [
    "factSetSha256", "resolutionStateSha256", "ownerMapStateSha256", "receiptSha256",
  ]) {
    sha(
      receipt[key],
      key,
      "PRODUCTION_IMPORT_PERFORMANCE_FACT_IDENTITY_RECEIPT_INVALID",
    );
  }
  const personStateRows = receipt.resolvedRows + receipt.unmatchedRows
    + receipt.ambiguousRows + receipt.notApplicableRows;
  const cycleStateRows = receipt.cycleResolvedRows + receipt.cycleUnmatchedRows
    + receipt.cycleAmbiguousRows + receipt.cycleNotApplicableRows;
  if (receipt.status !== "succeeded"
    || receipt.dimensionRows !== binding.expectedDimensionRows
    || receipt.masterRows !== binding.expectedMasterRows
    || receipt.factRows !== binding.expectedFactRows
    || personStateRows !== receipt.factRows
    || cycleStateRows !== receipt.factRows
    || receipt.factSetSha256 !== binding.expectedFactSetSha256
    || receipt.factOwnerMaps !== expectedFactOwnerMaps
    || receipt.relationOwnerMaps !== expectedRelationOwnerMaps
    || receipt.verifiedOwnerMaps !== receipt.factOwnerMaps + receipt.relationOwnerMaps) {
    fail(
      "PRODUCTION_IMPORT_PERFORMANCE_FACT_IDENTITY_CONSERVATION_FAILED",
      "forward receipt differs from the sealed fact set",
    );
  }
  return receipt;
}

export async function writeProductionPerformanceFactIdentity(input) {
  if (!input?.tx || typeof input.tx.query !== "function") {
    fail(
      "PRODUCTION_IMPORT_PERFORMANCE_FACT_IDENTITY_TRANSACTION_REQUIRED",
      "SERIALIZABLE transaction handle is required",
    );
  }
  const { binding, expectedFactOwnerMaps, expectedRelationOwnerMaps } = validateInvocation(input);
  let result;
  try {
    result = await input.tx.query(
      `/* hr-prod-performance-fact-identity:apply */
       SELECT * FROM hr_yuzhou_apply_performance_fact_identity_production_v1(
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21
       )`,
      [
        input.operationId,
        input.sealedPlanSha256,
        input.authorizationArtifactSha256,
        input.authorizationNonceSha256,
        input.extensionNonceSha256,
        input.codeSha,
        input.sourceSnapshotSha256,
        input.mappingContractSha256,
        input.targetIdentitySha256,
        input.targetScope.tenantId,
        input.targetScope.parkId,
        input.targetScope.scopeSha256,
        input.t0PhaseReceiptSha256,
        input.parentRelationsReceiptSha256,
        binding.parentPerformanceRelationsContractSha256,
        input.factLoaderReceiptSha256,
        binding.expectedDimensionRows,
        binding.expectedMasterRows,
        binding.expectedFactSetSha256,
        binding.migration308Sha256,
        binding.migration310Sha256,
      ],
    );
  } catch {
    fail(
      "PRODUCTION_IMPORT_PERFORMANCE_FACT_IDENTITY_APPLY_FAILED",
      "database apply failed; inspect the protected server-side audit",
    );
  }
  const row = one(result, "production performance fact identity writer");
  return validateForwardReceipt(row, binding, {
    expectedFactOwnerMaps,
    expectedRelationOwnerMaps,
  });
}

export async function rollbackProductionPerformanceFactIdentity(input) {
  if (!input?.tx || typeof input.tx.query !== "function") {
    fail(
      "PRODUCTION_IMPORT_PERFORMANCE_FACT_IDENTITY_TRANSACTION_REQUIRED",
      "SERIALIZABLE transaction handle is required",
    );
  }
  const { binding } = validateInvocation(input, { rollback: true });
  let result;
  try {
    result = await input.tx.query(
      `/* hr-prod-performance-fact-identity:rollback */
       SELECT * FROM hr_yuzhou_rollback_performance_fact_identity_production_v1(
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19
       )`,
      [
        input.rollbackOperationId,
        input.operationId,
        input.sealedPlanSha256,
        input.authorizationArtifactSha256,
        input.authorizationNonceSha256,
        input.extensionRollbackNonceSha256,
        input.codeSha,
        input.sourceSnapshotSha256,
        input.mappingContractSha256,
        input.targetIdentitySha256,
        input.targetScope.tenantId,
        input.targetScope.parkId,
        input.targetScope.scopeSha256,
        input.t0PhaseReceiptSha256,
        binding.parentPerformanceRelationsContractSha256,
        input.parentRelationsReceiptSha256,
        input.factLoaderReceiptSha256,
        binding.migration308Sha256,
        binding.migration310Sha256,
      ],
    );
  } catch {
    fail(
      "PRODUCTION_IMPORT_PERFORMANCE_FACT_IDENTITY_ROLLBACK_FAILED",
      "database rollback failed; inspect the protected server-side audit",
    );
  }
  const row = one(result, "production performance fact identity rollback");
  const residualCount = integer(row.residual_count, "residualCount");
  if (row.status !== "rolled_back"
    || row.rollback_order !== ROLLBACK_ORDER
    || residualCount !== 0
    || !SHA256.test(row.receipt_sha256 ?? "")) {
    fail(
      "PRODUCTION_IMPORT_PERFORMANCE_FACT_IDENTITY_ROLLBACK_RESIDUAL",
      "reverse-order rollback receipt is invalid",
    );
  }
  return {
    status: "rolled_back",
    rollbackOrder: ROLLBACK_ORDER.split(">"),
    residualCount,
    replayed: boolean(row.replayed, "replayed"),
    receiptSha256: row.receipt_sha256,
  };
}

export const PRODUCTION_PERFORMANCE_FACT_IDENTITY_CAPABILITY_ID = CAPABILITY;
