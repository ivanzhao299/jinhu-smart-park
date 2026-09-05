import { createHash } from "node:crypto";

import {
  computeProductionPerformanceFactLoaderBindingSha256,
  validateProductionPerformanceFactLoaderBinding,
} from "./production-import-performance-fact-loader-contract.mjs";

const SHA256 = /^[0-9a-f]{64}$/u;
const OPERATION_ID = /^yzprod-import-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{12}$/u;
const ROLLBACK_OPERATION_ID = /^yzprod-rollback-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{12}$/u;
const CAPABILITY_ID = "jinhu-yuzhou-performance-fact-loader-production-v1";
const COUNT_BINDING_KEYS = Object.freeze([
  "templateRows", "levelRuleRows", "dimensionRows", "guideRows",
  "dimensionResultRows", "masterResultRows", "activeFactMaps",
]);

export class ProductionPerformanceFactLoaderWriterError extends Error {
  constructor(code, detail, options = undefined) {
    super(`${code}: ${detail}`, options);
    this.name = "ProductionPerformanceFactLoaderWriterError";
    this.code = code;
  }
}

const fail = (code, detail, options) => { throw new ProductionPerformanceFactLoaderWriterError(code, detail, options); };
const hash = value => createHash("sha256").update(value).digest("hex");
const one = (result, label) => {
  if (!result || !Array.isArray(result.rows) || result.rows.length !== 1) {
    fail("PRODUCTION_IMPORT_PERFORMANCE_FACT_LOADER_DATABASE_RESULT_INVALID", `${label} must return one row`);
  }
  return result.rows[0];
};
const integer = (value, label) => {
  if (typeof value !== "number" && (typeof value !== "string" || !/^(?:0|[1-9][0-9]*)$/u.test(value))) {
    fail("PRODUCTION_IMPORT_PERFORMANCE_FACT_LOADER_RECEIPT_INVALID", `${label} is invalid`);
  }
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) fail("PRODUCTION_IMPORT_PERFORMANCE_FACT_LOADER_RECEIPT_INVALID", `${label} is invalid`);
  return parsed;
};
const artifact = (value, expectedSha256, label) => {
  if (!Buffer.isBuffer(value) || value.length === 0) fail("PRODUCTION_IMPORT_PERFORMANCE_FACT_LOADER_ARTIFACT_INVALID", `${label} must be non-empty bytes`);
  if (hash(value) !== expectedSha256) fail("PRODUCTION_IMPORT_PERFORMANCE_FACT_LOADER_ARTIFACT_HASH_MISMATCH", `${label} bytes differ from sealed hash`);
  return value;
};

function validateCommonInput(input, { rollback = false } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("PRODUCTION_IMPORT_PERFORMANCE_FACT_LOADER_INPUT_INVALID", "input must be an object");
  const binding = validateProductionPerformanceFactLoaderBinding(input.binding);
  if (!OPERATION_ID.test(input.operationId ?? "")
    || !SHA256.test(input.sealedPlanSha256 ?? "")
    || !SHA256.test(input.authorizationArtifactSha256 ?? "")
    || !SHA256.test(input.authorizationNonceSha256 ?? "")
    || !SHA256.test(input.targetIdentitySha256 ?? "")) {
    fail("PRODUCTION_IMPORT_PERFORMANCE_FACT_LOADER_INPUT_INVALID", "operation or immutable binding is invalid");
  }
  if (!input.targetScope || input.targetScope.tenantId === undefined || input.targetScope.parkId === undefined
    || !SHA256.test(input.targetScope.scopeSha256 ?? "")) {
    fail("PRODUCTION_IMPORT_PERFORMANCE_FACT_LOADER_INPUT_INVALID", "target scope is invalid");
  }
  if (input.targetIdentitySha256 !== input.expectedTargetIdentitySha256
    || input.targetScope.scopeSha256 !== input.expectedTargetScopeSha256) {
    fail("PRODUCTION_IMPORT_PERFORMANCE_FACT_LOADER_TARGET_BINDING_MISMATCH", "connected target differs from sealed target");
  }
  if (input.codeSha !== binding.triple.codeSha
    || input.sourceSnapshotSha256 !== binding.triple.sourceSnapshotHash
    || input.mappingContractSha256 !== binding.triple.mappingContractHash
    || input.t0PhaseReceiptSha256 !== binding.t0PhaseReceiptSha256) {
    fail("PRODUCTION_IMPORT_PERFORMANCE_FACT_LOADER_CSM_T0_BINDING_MISMATCH", "C/S/M or T0 receipt differs");
  }
  if (rollback) return { binding };
  return {
    binding,
    factPayload: artifact(input.factPayloadArtifact, binding.factPayloadArtifactSha256, "fact payload"),
    masterPayload: artifact(input.masterPayloadArtifact, binding.masterPayloadArtifactSha256, "master payload"),
  };
}

function validateCapability(row, binding) {
  if (row.capability_id !== CAPABILITY_ID
    || row.migration_300_sha256 !== binding.migration300Sha256
    || row.migration_301_sha256 !== binding.migration301Sha256
    || row.migration_302_sha256 !== binding.migration302Sha256
    || row.migration_303_sha256 !== binding.migration303Sha256
    || row.fact_identity_dependency_supported !== true
    || row.reverse_order !== "master_result>dimension_result>dimension_level_guide>dimension_profile>level_rule>template_profile") {
    fail("PRODUCTION_IMPORT_PERFORMANCE_FACT_LOADER_SCHEMA_CAPABILITY_MISMATCH", "production capability differs from the reviewed contract");
  }
  return Object.freeze({ capabilityId: CAPABILITY_ID, factIdentityDependencySupported: true });
}

export async function probeProductionPerformanceFactLoaderCapability({ query, binding: bindingInput }) {
  if (typeof query !== "function") fail("PRODUCTION_IMPORT_PERFORMANCE_FACT_LOADER_PROBE_REQUIRED", "read-only query callback is required");
  const binding = validateProductionPerformanceFactLoaderBinding(bindingInput);
  try {
    const row = one(await query(
      `/* hr-prod-performance-facts:capability */
       SELECT capability_id,migration_300_sha256,migration_301_sha256,migration_302_sha256,
              migration_303_sha256,fact_identity_dependency_supported,reverse_order
       FROM hr_yuzhou_performance_facts_production_capability_v1()`,
      [],
    ), "fact loader capability");
    return validateCapability(row, binding);
  } catch (error) {
    if (error instanceof ProductionPerformanceFactLoaderWriterError) throw error;
    fail("PRODUCTION_IMPORT_PERFORMANCE_FACT_LOADER_SCHEMA_CAPABILITY_UNAVAILABLE", "reviewed schema interface is unavailable");
  }
}

function validateForwardReceipt(row, binding) {
  if (row.replayed !== true && row.replayed !== false) {
    fail("PRODUCTION_IMPORT_PERFORMANCE_FACT_LOADER_RECEIPT_INVALID", "replayed must be a PostgreSQL boolean");
  }
  const receipt = {
    status: row.status,
    replayed: row.replayed === true,
    templateRows: integer(row.template_rows, "templateRows"),
    levelRuleRows: integer(row.level_rule_rows, "levelRuleRows"),
    dimensionRows: integer(row.dimension_rows, "dimensionRows"),
    guideRows: integer(row.guide_rows, "guideRows"),
    dimensionResultRows: integer(row.dimension_result_rows, "dimensionResultRows"),
    masterResultRows: integer(row.master_result_rows, "masterResultRows"),
    activeFactMaps: integer(row.active_fact_maps, "activeFactMaps"),
    identityFactSetSha256: row.identity_fact_set_sha256,
    fullFactSetSha256: row.full_fact_set_sha256,
    receiptSha256: row.receipt_sha256,
  };
  if (receipt.status !== "succeeded" || !SHA256.test(receipt.receiptSha256 ?? "")
    || receipt.identityFactSetSha256 !== binding.identityFactSetSha256
    || receipt.fullFactSetSha256 !== binding.fullFactSetSha256
    || COUNT_BINDING_KEYS.some(key => receipt[key] !== binding[key])) {
    fail("PRODUCTION_IMPORT_PERFORMANCE_FACT_LOADER_CONSERVATION_FAILED", "forward receipt differs from sealed aggregate");
  }
  return receipt;
}

export async function writeProductionPerformanceFacts(input) {
  if (!input?.tx || typeof input.tx.query !== "function") fail("PRODUCTION_IMPORT_PERFORMANCE_FACT_LOADER_TRANSACTION_REQUIRED", "SERIALIZABLE transaction handle is required");
  const { binding, factPayload, masterPayload } = validateCommonInput(input);
  const values = [
    input.operationId, input.sealedPlanSha256,
    computeProductionPerformanceFactLoaderBindingSha256(binding), input.authorizationArtifactSha256,
    input.authorizationNonceSha256, input.codeSha, input.sourceSnapshotSha256,
    input.mappingContractSha256, input.targetIdentitySha256, input.targetScope.tenantId,
    input.targetScope.parkId, input.targetScope.scopeSha256, input.t0PhaseReceiptSha256,
    binding.sourceRestoreReceiptSha256, binding.sourceFactLocationReceiptSha256,
    binding.sourceFactLocationCanonicalSha256, binding.factPayloadArtifactSha256,
    binding.masterPayloadArtifactSha256, factPayload, masterPayload,
    ...COUNT_BINDING_KEYS.map(key => binding[key]), binding.identityFactSetSha256,
    binding.fullFactSetSha256, binding.migration300Sha256, binding.migration301Sha256,
    binding.migration302Sha256, binding.migration303Sha256, binding.migration310Sha256,
    binding.migration311Sha256,
  ];
  const placeholders = values.map((_, index) => `$${index + 1}`).join(",");
  let result;
  try {
    result = await input.tx.query(
      `/* hr-prod-performance-facts:apply */
       SELECT * FROM hr_yuzhou_apply_performance_facts_production_v1(${placeholders})`,
      values,
    );
  } catch {
    fail("PRODUCTION_IMPORT_PERFORMANCE_FACT_LOADER_DATABASE_APPLY_FAILED", "database apply rejected");
  }
  const row = one(result, "fact loader apply");
  return validateForwardReceipt(row, binding);
}

export async function rollbackProductionPerformanceFacts(input) {
  if (!input?.tx || typeof input.tx.query !== "function") fail("PRODUCTION_IMPORT_PERFORMANCE_FACT_LOADER_TRANSACTION_REQUIRED", "SERIALIZABLE transaction handle is required");
  const { binding } = validateCommonInput(input, { rollback: true });
  if (!ROLLBACK_OPERATION_ID.test(input.rollbackOperationId ?? "")) fail("PRODUCTION_IMPORT_PERFORMANCE_FACT_LOADER_INPUT_INVALID", "rollback operation is invalid");
  const values = [
    input.rollbackOperationId, input.operationId, input.sealedPlanSha256,
    computeProductionPerformanceFactLoaderBindingSha256(binding),
    input.authorizationArtifactSha256, input.authorizationNonceSha256, input.codeSha,
    input.sourceSnapshotSha256, input.mappingContractSha256, input.targetIdentitySha256,
    input.targetScope.tenantId, input.targetScope.parkId, input.targetScope.scopeSha256,
    input.t0PhaseReceiptSha256, binding.sourceRestoreReceiptSha256,
    binding.sourceFactLocationReceiptSha256, binding.sourceFactLocationCanonicalSha256,
    binding.factPayloadArtifactSha256, binding.masterPayloadArtifactSha256,
    ...COUNT_BINDING_KEYS.map(key => binding[key]), binding.identityFactSetSha256,
    binding.fullFactSetSha256, binding.migration300Sha256, binding.migration301Sha256,
    binding.migration302Sha256, binding.migration303Sha256, binding.migration310Sha256,
    binding.migration311Sha256,
  ];
  const placeholders = values.map((_, index) => `$${index + 1}`).join(",");
  let result;
  try {
    result = await input.tx.query(
      `/* hr-prod-performance-facts:rollback */
       SELECT * FROM hr_yuzhou_rollback_performance_facts_production_v1(${placeholders})`,
      values,
    );
  } catch {
    fail("PRODUCTION_IMPORT_PERFORMANCE_FACT_LOADER_DATABASE_ROLLBACK_FAILED", "database rollback rejected");
  }
  const row = one(result, "fact loader rollback");
  if (row.replayed !== true && row.replayed !== false) {
    fail("PRODUCTION_IMPORT_PERFORMANCE_FACT_LOADER_RECEIPT_INVALID", "replayed must be a PostgreSQL boolean");
  }
  const residualCount = integer(row.residual_count, "residualCount");
  if (row.status !== "rolled_back"
    || row.rollback_order !== binding.rollbackOrder.join(">")
    || residualCount !== 0 || !SHA256.test(row.receipt_sha256 ?? "")) {
    fail("PRODUCTION_IMPORT_PERFORMANCE_FACT_LOADER_ROLLBACK_RESIDUAL", "rollback receipt is invalid");
  }
  return { status: "rolled_back", rollbackOrder: [...binding.rollbackOrder], residualCount, replayed: row.replayed === true, receiptSha256: row.receipt_sha256 };
}

export const PRODUCTION_PERFORMANCE_FACT_LOADER_CAPABILITY_ID = CAPABILITY_ID;

export function validateProductionPerformanceFactLoaderInvocation(input, options = undefined) {
  const validated = validateCommonInput(input, options);
  if (options?.rollback === true && !ROLLBACK_OPERATION_ID.test(input.rollbackOperationId ?? "")) {
    fail("PRODUCTION_IMPORT_PERFORMANCE_FACT_LOADER_INPUT_INVALID", "rollback operation is invalid");
  }
  return { binding: structuredClone(validated.binding) };
}
