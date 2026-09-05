/* global structuredClone */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  computeProductionImportPayloadHash,
  validateProductionPerformanceFactIdentityPlanBinding,
} from "./production-import-sealed-plan-lib.mjs";

const CONTRACT_URL = new URL(
  "./contracts/production-import-performance-fact-identity-v1.json",
  import.meta.url,
);
const SOURCE_EVIDENCE_PATH = "scripts/hr-cutover/contracts/legacy-performance-fact-location-evidence-v1.json";
const SOURCE_EVIDENCE_URL = new URL(
  "./contracts/legacy-performance-fact-location-evidence-v1.json",
  import.meta.url,
);
const MIGRATIONS = Object.freeze([
  Object.freeze({
    number: "000308",
    path: "database/migrations/000308_hr_yuzhou_performance_relations_production.sql",
    url: new URL("../../database/migrations/000308_hr_yuzhou_performance_relations_production.sql", import.meta.url),
  }),
  Object.freeze({
    number: "000310",
    path: "database/migrations/000310_hr_yuzhou_performance_fact_identity_production.sql",
    url: new URL("../../database/migrations/000310_hr_yuzhou_performance_fact_identity_production.sql", import.meta.url),
  }),
]);
const SHA256 = /^[0-9a-f]{64}$/u;
const CODE_SHA = /^[0-9a-f]{40}$/u;
const FACT_KINDS = ["dimension_result", "master_result"];
const ROLLBACK_ORDER = ["fact_identity", "performance_relations", "performance_facts"];

export class ProductionImportPerformanceFactIdentityContractError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "ProductionImportPerformanceFactIdentityContractError";
    this.code = code;
  }
}

const fail = (code, detail) => {
  throw new ProductionImportPerformanceFactIdentityContractError(code, detail);
};
const object = value => value !== null
  && typeof value === "object"
  && !Array.isArray(value)
  && Object.getPrototypeOf(value) === Object.prototype;
const exactKeys = (value, keys, code, label) => {
  if (!object(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) {
    fail(code, `${label} keys differ`);
  }
};
const assertSha = (value, code, label) => {
  if (!SHA256.test(value ?? "")) fail(code, `${label} must be SHA-256`);
};
const integer = (value, code, label) => {
  if (!Number.isSafeInteger(value) || value < 0) fail(code, `${label} must be a non-negative integer`);
};
export const productionPerformanceFactIdentityHash = value => createHash("sha256")
  .update(Buffer.isBuffer(value) || typeof value === "string" ? value : `${canonical(value)}\n`)
  .digest("hex");
const canonical = value => {
  if (value === null) return "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (object(value)) {
    return `{${Object.keys(value).sort()
      .map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
};

function validateTriple(triple) {
  exactKeys(
    triple,
    ["codeSha", "sourceSnapshotHash", "mappingContractHash"],
    "PRODUCTION_IMPORT_PERFORMANCE_FACT_IDENTITY_BINDING_INVALID",
    "triple",
  );
  if (!CODE_SHA.test(triple.codeSha ?? "")) {
    fail("PRODUCTION_IMPORT_PERFORMANCE_FACT_IDENTITY_BINDING_INVALID", "code SHA invalid");
  }
  assertSha(
    triple.sourceSnapshotHash,
    "PRODUCTION_IMPORT_PERFORMANCE_FACT_IDENTITY_BINDING_INVALID",
    "source snapshot",
  );
  assertSha(
    triple.mappingContractHash,
    "PRODUCTION_IMPORT_PERFORMANCE_FACT_IDENTITY_BINDING_INVALID",
    "mapping contract",
  );
}

function loadContract(contractUrl = CONTRACT_URL) {
  const raw = readFileSync(contractUrl);
  const contract = JSON.parse(raw);
  const invalid = detail => fail(
    "PRODUCTION_IMPORT_PERFORMANCE_FACT_IDENTITY_REPOSITORY_DRIFT",
    detail,
  );
  if (contract.formatVersion !== 1
    || contract.contractKind !== "yuzhou_hr_production_import_performance_fact_identity_extension"
    || contract.databaseCapability?.capabilityId
      !== "jinhu-yuzhou-performance-fact-identity-production-v1"
    || contract.databaseCapability?.productionContextSupported !== true
    || JSON.stringify(contract.databaseCapability?.factKinds) !== JSON.stringify(FACT_KINDS)
    || contract.databaseCapability?.rollbackOrder !== ROLLBACK_ORDER.join(">")
    || contract.factSet?.algorithm !== "yuzhou-performance-fact-identity-set-v1"
    || contract.factSet?.emptySha256
      !== "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945"
    || contract.factSet?.containsTargetUuid !== false
    || contract.factSet?.containsPersonalData !== false
    || contract.authorization?.sameParentExecutionEnvelope !== true
    || contract.authorization?.parentReceiptBoundAtRuntimeAfterParentApply !== true
    || contract.authorization?.factLoaderReceiptBoundAtRuntimeAfterFactLoad !== true
    || contract.authorization?.oneTimeExtensionNonce !== true
    || contract.authorization?.rollbackExtensionNonceSeparate !== true
    || contract.factLoaderParent?.bindingKind
      !== "yuzhou_hr_production_import_performance_fact_loader_binding"
    || contract.factLoaderParent?.planProperty !== "performanceFactLoader"
    || contract.factLoaderParent?.receiptRequired !== true
    || contract.factLoaderParent?.requiredStatus !== "succeeded"
    || contract.upstreamFactWriter?.requiredPlanProperty !== "performanceFactLoader"
    || contract.upstreamFactWriter?.requiredAuthorizationBinding
      !== "performanceFactLoaderContractSha256"
    || contract.upstreamFactWriter?.runtimeReceiptBinding !== "factLoaderReceiptSha256"
    || contract.upstreamFactWriter?.missingDisposition
      !== "PRODUCTION_FACT_LOADER_RECEIPT_REQUIRED"
    || contract.receiptConservation?.factOwnerMapsEqualParentActiveFactMaps !== true
    || contract.receiptConservation?.relationOwnerMapsEqualParentActiveRelationMaps !== true
    || contract.receiptConservation?.verifiedOwnerMapsEqualFactAndRelationOwnerMaps !== true
    || contract.receiptConservation?.ownerMapStateSha256Required !== true
    || contract.rollback?.ownerTablesImmutable !== true
    || contract.rollback?.residualCount !== 0
    || JSON.stringify(contract.rollback?.order) !== JSON.stringify(ROLLBACK_ORDER)
    || contract.compatibilityCredit !== 0
    || contract.productionImport !== "HOLD") invalid("contract boundary differs");
  if (contract.sourceEvidence?.path !== SOURCE_EVIDENCE_PATH
    || !Array.isArray(contract.migrations)
    || contract.migrations.length !== MIGRATIONS.length
    || MIGRATIONS.some((expected, index) => contract.migrations[index]?.number !== expected.number
      || contract.migrations[index]?.path !== expected.path)) invalid("repository paths differ");
  const evidence = JSON.parse(readFileSync(SOURCE_EVIDENCE_URL, "utf8"));
  if (productionPerformanceFactIdentityHash(readFileSync(SOURCE_EVIDENCE_URL))
      !== contract.sourceEvidence.sha256
    || evidence.objectFindings?.find(item => item.sourceObject === "dbo.assessmentdetail")
      ?.rowCount !== contract.sourceEvidence.dimensionRows
    || evidence.objectFindings?.find(item => item.sourceObject === "dbo.assessmentmaster")
      ?.rowCount !== contract.sourceEvidence.masterRows) invalid("source fact evidence differs");
  for (const [index, migration] of contract.migrations.entries()) {
    if (!SHA256.test(migration.sha256 ?? "")
      || productionPerformanceFactIdentityHash(readFileSync(MIGRATIONS[index].url)) !== migration.sha256) {
      invalid(`${migration.number} bytes differ`);
    }
  }
  return Object.freeze({
    contract,
    contractArtifactSha256: productionPerformanceFactIdentityHash(raw),
  });
}

export function createProductionPerformanceFactIdentityBinding(input, options = undefined) {
  const { contract, contractArtifactSha256 } = loadContract(options?.contractUrl);
  exactKeys(
    input,
    ["triple", "parentPerformanceRelationsBinding", "parentPerformanceFactLoaderBinding",
      "t0PhaseReceiptSha256",
      "expectedDimensionRows", "expectedMasterRows", "expectedFactSetSha256"],
    "PRODUCTION_IMPORT_PERFORMANCE_FACT_IDENTITY_BINDING_INVALID",
    "input",
  );
  validateTriple(input.triple);
  for (const key of [
    "t0PhaseReceiptSha256", "expectedFactSetSha256",
  ]) {
    assertSha(
      input[key],
      "PRODUCTION_IMPORT_PERFORMANCE_FACT_IDENTITY_BINDING_INVALID",
      key,
    );
  }
  integer(
    input.expectedDimensionRows,
    "PRODUCTION_IMPORT_PERFORMANCE_FACT_IDENTITY_BINDING_INVALID",
    "expectedDimensionRows",
  );
  integer(
    input.expectedMasterRows,
    "PRODUCTION_IMPORT_PERFORMANCE_FACT_IDENTITY_BINDING_INVALID",
    "expectedMasterRows",
  );
  const binding = {
    formatVersion: 1,
    bindingKind: "yuzhou_hr_production_import_performance_fact_identity_binding",
    triple: structuredClone(input.triple),
    contractArtifactSha256,
    t0PhaseReceiptSha256: input.t0PhaseReceiptSha256,
    parentPerformanceRelationsContractSha256:
      computeProductionImportPayloadHash(input.parentPerformanceRelationsBinding),
    parentPerformanceFactLoaderContractSha256:
      computeProductionImportPayloadHash(input.parentPerformanceFactLoaderBinding),
    expectedDimensionRows: input.expectedDimensionRows,
    expectedMasterRows: input.expectedMasterRows,
    expectedFactRows: input.expectedDimensionRows + input.expectedMasterRows,
    expectedFactSetSha256: input.expectedFactSetSha256,
    migration308Sha256: contract.migrations[0].sha256,
    migration310Sha256: contract.migrations[1].sha256,
    factKinds: [...FACT_KINDS],
    rollbackOrder: [...ROLLBACK_ORDER],
    adapterStatus: "PRODUCTION_CAPABILITY_BOUND",
    productionImport: "HOLD",
  };
  return validateProductionPerformanceFactIdentityBinding(binding, {
    ...options,
    parentPerformanceRelationsBinding: input.parentPerformanceRelationsBinding,
    parentPerformanceFactLoaderBinding: input.parentPerformanceFactLoaderBinding,
  });
}

export function validateProductionPerformanceFactIdentityBinding(binding, options = undefined) {
  const { contract, contractArtifactSha256 } = loadContract(options?.contractUrl);
  let validated;
  try {
    validated = validateProductionPerformanceFactIdentityPlanBinding(
      binding,
      binding?.triple,
      options?.parentPerformanceRelationsBinding,
      options?.parentPerformanceFactLoaderBinding,
    );
  } catch (error) {
    fail(
      "PRODUCTION_IMPORT_PERFORMANCE_FACT_IDENTITY_BINDING_INVALID",
      error instanceof Error ? error.message : "sealed plan binding differs",
    );
  }
  if (validated.contractArtifactSha256 !== contractArtifactSha256
    || binding.migration308Sha256 !== contract.migrations[0].sha256
    || binding.migration310Sha256 !== contract.migrations[1].sha256
    || binding.expectedDimensionRows !== contract.sourceEvidence.dimensionRows
    || binding.expectedMasterRows !== contract.sourceEvidence.masterRows
    || binding.expectedFactSetSha256 !== contract.factSet.emptySha256) {
    fail("PRODUCTION_IMPORT_PERFORMANCE_FACT_IDENTITY_BINDING_DRIFT", "sealed evidence differs");
  }
  return structuredClone(validated);
}

export const DEFAULT_PRODUCTION_IMPORT_PERFORMANCE_FACT_IDENTITY_CONTRACT = Object.freeze(
  JSON.parse(readFileSync(CONTRACT_URL, "utf8")),
);
