import contract from "./contracts/production-import-performance-fact-loader-v1.json" with { type: "json" };
import {
  computeProductionImportPayloadHash,
  validateProductionPerformanceFactLoaderPlanBinding,
} from "./production-import-sealed-plan-lib.mjs";

const CURRENT_EMPTY_FACT_LOCATION_CANONICAL_SHA256 = "1e37b27f0ac3975fd989d54341ff2c64b3e64955a38b80b03a00fe25cdf04182";
const BINDING_KEYS = Object.freeze([
  "formatVersion", "bindingKind", "triple", "sourceRestoreReceiptSha256",
  "sourceFactLocationReceiptSha256", "sourceFactLocationCanonicalSha256",
  "factPayloadArtifactSha256", "masterPayloadArtifactSha256", "t0PhaseReceiptSha256",
  "migration300Sha256", "migration301Sha256", "migration302Sha256", "migration303Sha256",
  "migration310Sha256", "migration311Sha256", "templateRows", "levelRuleRows",
  "dimensionRows", "guideRows", "dimensionResultRows", "masterResultRows",
  "activeFactMaps", "identityFactSetSha256", "fullFactSetSha256",
  "sourceOutcomeFactStatus", "forwardOrder", "rollbackOrder", "productionImport",
]);
const COUNT_KEYS = Object.freeze([
  "templateRows", "levelRuleRows", "dimensionRows", "guideRows",
  "dimensionResultRows", "masterResultRows",
]);

export class ProductionPerformanceFactLoaderContractError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "ProductionPerformanceFactLoaderContractError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new ProductionPerformanceFactLoaderContractError(code, detail); };
const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
const exactKeys = (value, expected, code, label) => {
  if (!isObject(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expected].sort())) {
    fail(code, `${label} keys differ`);
  }
};
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

function validateRepositoryContract() {
  if (contract.formatVersion !== 1
    || contract.contractKind !== "yuzhou_hr_production_import_performance_fact_loader"
    || contract.planProperty !== "performanceFactLoader"
    || contract.authorizationBindingProperty !== "performanceFactLoaderContractSha256"
    || !same(contract.forwardOrder, ["legacy_config_and_detail", "legacy_master"])
    || !same(contract.rollbackOrder, ["master_result", "dimension_result", "dimension_level_guide", "dimension_profile", "level_rule", "template_profile"])) {
    fail("PRODUCTION_IMPORT_PERFORMANCE_FACT_LOADER_REPOSITORY_CONTRACT_INVALID", "repository contract drifted");
  }
  const expected = [
    ["000300_hr_performance_yuzhou_legacy_model.sql", "ab3410b2121e0772c4b0cc6f273c893340b7925dcecf26414ea336f15dd0656a"],
    ["000301_hr_performance_yuzhou_legacy_writer.sql", "4a4de62295d7e4ac7e752c435eba49483da7d79384c34aa992b9bc5f1f618e7e"],
    ["000302_hr_performance_yuzhou_legacy_master.sql", "7b45377d252a9593d779af779bcb9d6f91ceb326f6b5da1273da50b89f52e43a"],
    ["000303_hr_performance_yuzhou_legacy_master_writer.sql", "853d7632ebd2c2c3a9211e0088a3ccda7979a788539db2123aaf43c59c070648"],
  ];
  if (!same(contract.predecessorMigrations.map(item => [item.migration, item.migrationSha256]), expected)) {
    fail("PRODUCTION_IMPORT_PERFORMANCE_FACT_LOADER_REPOSITORY_CONTRACT_INVALID", "predecessor migration hashes drifted");
  }
}

export function computeProductionPerformanceFactLoaderBindingSha256(binding) {
  return computeProductionImportPayloadHash(validateProductionPerformanceFactLoaderBinding(binding));
}

export function validateProductionPerformanceFactLoaderBinding(binding) {
  validateRepositoryContract();
  exactKeys(binding, BINDING_KEYS, "PRODUCTION_IMPORT_PERFORMANCE_FACT_LOADER_BINDING_INVALID", "binding");
  if (binding.formatVersion !== 1 || binding.bindingKind !== "yuzhou_hr_production_import_performance_fact_loader_binding") {
    fail("PRODUCTION_IMPORT_PERFORMANCE_FACT_LOADER_BINDING_INVALID", "binding identity differs");
  }
  const validated = validateProductionPerformanceFactLoaderPlanBinding(binding, binding.triple);
  if (binding.activeFactMaps !== COUNT_KEYS.reduce((sum, key) => sum + binding[key], 0)) {
    fail("PRODUCTION_IMPORT_PERFORMANCE_FACT_LOADER_COUNT_DRIFT", "activeFactMaps must equal all six fact counts");
  }
  const predecessorHashes = Object.fromEntries(contract.predecessorMigrations.map((item, index) => [`migration${300 + index}Sha256`, item.migrationSha256]));
  for (const [key, expected] of Object.entries(predecessorHashes)) {
    if (binding[key] !== expected) fail("PRODUCTION_IMPORT_PERFORMANCE_FACT_LOADER_MIGRATION_DRIFT", key);
  }
  if (!same(binding.forwardOrder, contract.forwardOrder) || !same(binding.rollbackOrder, contract.rollbackOrder)) {
    fail("PRODUCTION_IMPORT_PERFORMANCE_FACT_LOADER_SEQUENCE_INVALID", "forward or rollback order differs");
  }
  if (!new Set(["AUTHORITATIVE_EMPTY", "AUTHORITATIVE_NONEMPTY"]).has(binding.sourceOutcomeFactStatus)) {
    fail("PRODUCTION_IMPORT_PERFORMANCE_FACT_LOADER_SOURCE_STATUS_INVALID", "source outcome fact status is invalid");
  }
  const outcomeRows = binding.dimensionResultRows + binding.masterResultRows;
  if ((binding.sourceOutcomeFactStatus === "AUTHORITATIVE_EMPTY") !== (outcomeRows === 0)) {
    fail("PRODUCTION_IMPORT_PERFORMANCE_FACT_LOADER_SOURCE_STATUS_INVALID", "source outcome status differs from result counts");
  }
  if (binding.sourceFactLocationCanonicalSha256 === CURRENT_EMPTY_FACT_LOCATION_CANONICAL_SHA256 && outcomeRows !== 0) {
    fail("PRODUCTION_IMPORT_PERFORMANCE_FACT_LOADER_CURRENT_SOURCE_NONEMPTY_FORBIDDEN", "current authoritative source receipt proves outcome facts empty");
  }
  if (binding.productionImport !== "HOLD") {
    fail("PRODUCTION_IMPORT_PERFORMANCE_FACT_LOADER_BINDING_INVALID", "binding metadata remains HOLD; authority comes from the parent envelope");
  }
  return validated;
}

export function createProductionPerformanceFactLoaderBinding(input) {
  if (!isObject(input)) fail("PRODUCTION_IMPORT_PERFORMANCE_FACT_LOADER_BINDING_INVALID", "input must be an object");
  const binding = {
    formatVersion: 1,
    bindingKind: "yuzhou_hr_production_import_performance_fact_loader_binding",
    triple: structuredClone(input.triple),
    sourceRestoreReceiptSha256: input.sourceRestoreReceiptSha256,
    sourceFactLocationReceiptSha256: input.sourceFactLocationReceiptSha256,
    sourceFactLocationCanonicalSha256: input.sourceFactLocationCanonicalSha256,
    factPayloadArtifactSha256: input.factPayloadArtifactSha256,
    masterPayloadArtifactSha256: input.masterPayloadArtifactSha256,
    t0PhaseReceiptSha256: input.t0PhaseReceiptSha256,
    migration300Sha256: contract.predecessorMigrations[0].migrationSha256,
    migration301Sha256: contract.predecessorMigrations[1].migrationSha256,
    migration302Sha256: contract.predecessorMigrations[2].migrationSha256,
    migration303Sha256: contract.predecessorMigrations[3].migrationSha256,
    migration310Sha256: input.migration310Sha256,
    migration311Sha256: input.migration311Sha256,
    templateRows: input.templateRows,
    levelRuleRows: input.levelRuleRows,
    dimensionRows: input.dimensionRows,
    guideRows: input.guideRows,
    dimensionResultRows: input.dimensionResultRows,
    masterResultRows: input.masterResultRows,
    activeFactMaps: input.activeFactMaps,
    identityFactSetSha256: input.identityFactSetSha256,
    fullFactSetSha256: input.fullFactSetSha256,
    sourceOutcomeFactStatus: input.sourceOutcomeFactStatus,
    forwardOrder: [...contract.forwardOrder],
    rollbackOrder: [...contract.rollbackOrder],
    productionImport: input.productionImport,
  };
  return validateProductionPerformanceFactLoaderBinding(binding);
}

export const DEFAULT_PRODUCTION_IMPORT_PERFORMANCE_FACT_LOADER_CONTRACT = contract;
