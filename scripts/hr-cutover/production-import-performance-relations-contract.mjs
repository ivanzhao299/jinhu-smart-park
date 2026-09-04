import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import {
  computeProductionImportPayloadHash,
  computeSealedProductionImportPlanHash,
} from "./production-import-sealed-plan-lib.mjs";

const CONTRACT_URL = new URL("./contracts/production-import-performance-relations-v1.json", import.meta.url);
const SOURCE_CONSERVATION_URL = new URL("./contracts/legacy-performance-source-person-assignment-conservation-v1.json", import.meta.url);
const SOURCE_FACT_LOCATION_URL = new URL("./contracts/legacy-performance-fact-location-evidence-v1.json", import.meta.url);
const EXECUTION_CONTRACT_URL = new URL("./contracts/production-import-execution-v2.json", import.meta.url);
const MIGRATION_305_URL = new URL("../../database/migrations/000305_hr_performance_yuzhou_legacy_relations.sql", import.meta.url);
const MIGRATION_306_URL = new URL("../../database/migrations/000306_hr_performance_yuzhou_identity_resolution.sql", import.meta.url);
const SHA256 = /^[0-9a-f]{64}$/u;
const CODE_SHA = /^[0-9a-f]{40}$/u;
const BINDING_KEYS = [
  "formatVersion", "bindingKind", "triple", "sourceConservationContractSha256",
  "sourceFactLocationReceiptSha256", "sourceFactLocationCanonicalSha256",
  "relationPayloadArtifactSha256", "identityDecisionArtifactSha256", "t0PhaseReceiptSha256",
  "migration305Sha256", "migration306Sha256", "sessionRows", "scoreSourceRows", "assignmentRows", "activeRelationMaps", "identityResolutionRows",
  "subjectUnmatchedRows", "blankAssessorRows", "forwardOrder", "rollbackOrder",
  "adapterStatus", "executionReachable", "productionImport",
];
const STATE_KEYS = [
  "sessionRows", "scoreSourceRows", "assignmentRows", "activeRelationMaps", "identityResolutionRows",
  "subjectUnmatchedRows", "blankAssessorRows", "sessionBindingRows",
];

export class ProductionImportPerformanceRelationsContractError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "ProductionImportPerformanceRelationsContractError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new ProductionImportPerformanceRelationsContractError(code, detail); };
const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const exactKeys = (value, expected, code, label) => {
  if (!isObject(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expected].sort())) fail(code, `${label} keys differ`);
};
const sha256 = value => createHash("sha256").update(value).digest("hex");
const assertSha = (value, code, label) => { if (!SHA256.test(value ?? "")) fail(code, `${label} must be SHA-256`); };
const fileSha256 = url => sha256(readFileSync(url));
const contract = Object.freeze(JSON.parse(readFileSync(CONTRACT_URL, "utf8")));
const sourceConservation = Object.freeze(JSON.parse(readFileSync(SOURCE_CONSERVATION_URL, "utf8")));
const sourceFactLocation = Object.freeze(JSON.parse(readFileSync(SOURCE_FACT_LOCATION_URL, "utf8")));

function assertRepositoryContract() {
  const invalid = (detail) => fail("PRODUCTION_IMPORT_PERFORMANCE_RELATIONS_REPOSITORY_DRIFT", detail);
  if (fileSha256(EXECUTION_CONTRACT_URL) !== contract.parentPlan.executionContractSha256) invalid("production execution contract bytes differ");
  if (fileSha256(SOURCE_CONSERVATION_URL) !== contract.sourceEvidence.contractSha256) invalid("source conservation contract bytes differ");
  if (fileSha256(SOURCE_FACT_LOCATION_URL) !== contract.sourceEvidence.sourceFactLocationReceiptSha256) invalid("source fact-location receipt bytes differ");
  if (fileSha256(MIGRATION_305_URL) !== contract.forwardOrder[0].migrationSha256) invalid("000305 bytes differ");
  if (fileSha256(MIGRATION_306_URL) !== contract.forwardOrder[1].migrationSha256) invalid("000306 bytes differ");
  if (sourceConservation.productionImport !== "HOLD"
    || sourceConservation.sourceFactLocationReceiptSha256 !== contract.sourceEvidence.sourceFactLocationReceiptSha256
    || sourceConservation.sourceFactLocationCanonicalSha256 !== contract.sourceEvidence.sourceFactLocationCanonicalSha256
    || sourceConservation.sourceAggregate.sourceTable !== contract.sourceEvidence.sourceTable
    || sourceConservation.sourceAggregate.rowCount !== contract.sourceEvidence.assignmentRows
    || sourceConservation.sourceAggregate.distinctSessionCount !== contract.sourceEvidence.assignmentDistinctSessionRows
    || sourceConservation.sourceAggregate.subjectNotFoundInSourcePersonRows !== contract.sourceEvidence.subjectUnmatchedRows
    || sourceConservation.sourceAggregate.blankAssessorRows !== contract.sourceEvidence.blankAssessorRows
    || sourceConservation.identityResolutionContract.requiredResolutionRows !== contract.expectedAfter.identityResolutionRows) {
    invalid("source conservation facts differ");
  }
  const countFor = sourceObject => sourceFactLocation.objectFindings.find(finding => finding.sourceObject === sourceObject)?.rowCount;
  if (countFor("dbo.asssession") !== contract.sourceEvidence.sessionRows
    || countFor("dbo.asssour") !== contract.sourceEvidence.scoreSourceRows
    || countFor("dbo.asssourperson") !== contract.sourceEvidence.assignmentRows) invalid("relation source-object counts differ");
  if (contract.productionImport !== "HOLD"
    || contract.executionBoundary.executionReachable !== false
    || contract.executionBoundary.databaseConnectionAllowed !== false
    || contract.executionBoundary.sourceRowsAllowed !== false
    || contract.executionBoundary.adapter !== "synthetic_memory_contract_only"
    || contract.forwardOrder.some(step => step.currentExecutionContext !== "lab_rehearsal" || step.productionAdapter !== "UNAVAILABLE")
    || JSON.stringify(contract.rollbackOrder) !== JSON.stringify(["identity_resolution", "source_person_assignments"])) {
    invalid("execution boundary was weakened");
  }
}

function validateTriple(triple) {
  exactKeys(triple, ["codeSha", "sourceSnapshotHash", "mappingContractHash"], "PRODUCTION_IMPORT_PERFORMANCE_RELATIONS_BINDING_INVALID", "triple");
  if (!CODE_SHA.test(triple.codeSha ?? "")) fail("PRODUCTION_IMPORT_PERFORMANCE_RELATIONS_BINDING_INVALID", "code SHA invalid");
  assertSha(triple.sourceSnapshotHash, "PRODUCTION_IMPORT_PERFORMANCE_RELATIONS_BINDING_INVALID", "source snapshot");
  assertSha(triple.mappingContractHash, "PRODUCTION_IMPORT_PERFORMANCE_RELATIONS_BINDING_INVALID", "mapping contract");
}

export function createHeldPerformanceRelationsBinding(input) {
  assertRepositoryContract();
  exactKeys(input, ["triple", "relationPayloadArtifactSha256", "identityDecisionArtifactSha256", "t0PhaseReceiptSha256"], "PRODUCTION_IMPORT_PERFORMANCE_RELATIONS_BINDING_INVALID", "input");
  validateTriple(input.triple);
  for (const key of ["relationPayloadArtifactSha256", "identityDecisionArtifactSha256", "t0PhaseReceiptSha256"]) assertSha(input[key], "PRODUCTION_IMPORT_PERFORMANCE_RELATIONS_BINDING_INVALID", key);
  return validateHeldPerformanceRelationsBinding({
    formatVersion: 1,
    bindingKind: "yuzhou_hr_production_import_performance_relations_held_binding",
    triple: structuredClone(input.triple),
    sourceConservationContractSha256: contract.sourceEvidence.contractSha256,
    sourceFactLocationReceiptSha256: contract.sourceEvidence.sourceFactLocationReceiptSha256,
    sourceFactLocationCanonicalSha256: contract.sourceEvidence.sourceFactLocationCanonicalSha256,
    relationPayloadArtifactSha256: input.relationPayloadArtifactSha256,
    identityDecisionArtifactSha256: input.identityDecisionArtifactSha256,
    t0PhaseReceiptSha256: input.t0PhaseReceiptSha256,
    migration305Sha256: contract.forwardOrder[0].migrationSha256,
    migration306Sha256: contract.forwardOrder[1].migrationSha256,
    sessionRows: contract.expectedAfter.sessionRows,
    scoreSourceRows: contract.expectedAfter.scoreSourceRows,
    assignmentRows: contract.expectedAfter.assignmentRows,
    activeRelationMaps: contract.expectedAfter.activeRelationMaps,
    identityResolutionRows: contract.expectedAfter.identityResolutionRows,
    subjectUnmatchedRows: contract.expectedAfter.subjectUnmatchedRows,
    blankAssessorRows: contract.expectedAfter.blankAssessorRows,
    forwardOrder: contract.forwardOrder.map(step => step.step),
    rollbackOrder: [...contract.rollbackOrder],
    adapterStatus: "UNAVAILABLE",
    executionReachable: false,
    productionImport: "HOLD",
  });
}

export function validateHeldPerformanceRelationsBinding(binding) {
  assertRepositoryContract();
  exactKeys(binding, BINDING_KEYS, "PRODUCTION_IMPORT_PERFORMANCE_RELATIONS_BINDING_INVALID", "binding");
  validateTriple(binding.triple);
  for (const key of [
    "sourceConservationContractSha256", "sourceFactLocationReceiptSha256", "sourceFactLocationCanonicalSha256",
    "relationPayloadArtifactSha256", "identityDecisionArtifactSha256", "t0PhaseReceiptSha256",
    "migration305Sha256", "migration306Sha256",
  ]) assertSha(binding[key], "PRODUCTION_IMPORT_PERFORMANCE_RELATIONS_BINDING_INVALID", key);
  const expected = {
    sourceConservationContractSha256: contract.sourceEvidence.contractSha256,
    sourceFactLocationReceiptSha256: contract.sourceEvidence.sourceFactLocationReceiptSha256,
    sourceFactLocationCanonicalSha256: contract.sourceEvidence.sourceFactLocationCanonicalSha256,
    migration305Sha256: contract.forwardOrder[0].migrationSha256,
    migration306Sha256: contract.forwardOrder[1].migrationSha256,
    sessionRows: contract.expectedAfter.sessionRows,
    scoreSourceRows: contract.expectedAfter.scoreSourceRows,
    assignmentRows: contract.expectedAfter.assignmentRows,
    activeRelationMaps: contract.expectedAfter.activeRelationMaps,
    identityResolutionRows: contract.expectedAfter.identityResolutionRows,
    subjectUnmatchedRows: contract.expectedAfter.subjectUnmatchedRows,
    blankAssessorRows: contract.expectedAfter.blankAssessorRows,
  };
  for (const [key, value] of Object.entries(expected)) if (binding[key] !== value) fail("PRODUCTION_IMPORT_PERFORMANCE_RELATIONS_BINDING_DRIFT", key);
  if (binding.formatVersion !== 1
    || binding.bindingKind !== "yuzhou_hr_production_import_performance_relations_held_binding"
    || JSON.stringify(binding.forwardOrder) !== JSON.stringify(contract.forwardOrder.map(step => step.step))
    || JSON.stringify(binding.rollbackOrder) !== JSON.stringify(contract.rollbackOrder)
    || binding.adapterStatus !== "UNAVAILABLE"
    || binding.executionReachable !== false
    || binding.productionImport !== "HOLD") {
    fail("PRODUCTION_IMPORT_PERFORMANCE_RELATIONS_EXECUTION_UNAVAILABLE", "binding must remain held and unreachable");
  }
  return structuredClone(binding);
}

export function attachHeldPerformanceRelationsBinding(planInput, bindingInput) {
  const binding = validateHeldPerformanceRelationsBinding(bindingInput);
  if (!isObject(planInput) || !isObject(planInput.authorization?.binding) || !isObject(planInput.sealing)) fail("PRODUCTION_IMPORT_PERFORMANCE_RELATIONS_PARENT_PLAN_INVALID", "sealed parent plan shape invalid");
  if (planInput.formatVersion !== contract.parentPlan.formatVersion
    || planInput.planKind !== contract.parentPlan.planKind
    || computeProductionImportPayloadHash(planInput.triple) !== computeProductionImportPayloadHash(binding.triple)) {
    fail("PRODUCTION_IMPORT_PERFORMANCE_RELATIONS_PARENT_PLAN_INVALID", "parent plan identity or C/S/M differs");
  }
  const plan = structuredClone(planInput);
  plan.performanceRelations = binding;
  plan.authorization.binding.performanceRelationsContractSha256 = computeProductionImportPayloadHash(binding);
  plan.sealing.sealedPlanSha256 = computeSealedProductionImportPlanHash(plan);
  return plan;
}

function validateState(value, expected, label) {
  exactKeys(value, STATE_KEYS, "PRODUCTION_IMPORT_PERFORMANCE_RELATIONS_SYNTHETIC_RESULT_INVALID", label);
  for (const key of STATE_KEYS) if (!Number.isSafeInteger(value[key]) || value[key] < 0 || (expected && value[key] !== expected[key])) fail("PRODUCTION_IMPORT_PERFORMANCE_RELATIONS_SYNTHETIC_RESULT_INVALID", `${label}.${key}`);
  return structuredClone(value);
}

const ZERO_STATE = Object.freeze(Object.fromEntries(STATE_KEYS.map(key => [key, 0])));
const RELATION_STATE = Object.freeze({ ...ZERO_STATE, sessionRows: 7, scoreSourceRows: 0, assignmentRows: 117, activeRelationMaps: 124 });
const MATERIALIZED_STATE = Object.freeze({ ...RELATION_STATE, identityResolutionRows: 234, subjectUnmatchedRows: 108, blankAssessorRows: 117, sessionBindingRows: 7 });

export function createSyntheticPerformanceRelationsAdapter() {
  let state = { ...ZERO_STATE };
  let bindingSha256 = null;
  const bind = input => {
    const observed = computeProductionImportPayloadHash(validateHeldPerformanceRelationsBinding(input));
    if (bindingSha256 !== null && bindingSha256 !== observed) fail("PRODUCTION_IMPORT_PERFORMANCE_RELATIONS_BINDING_DRIFT", "synthetic replay binding differs");
    bindingSha256 = observed;
  };
  return Object.freeze({
    adapterKind: "synthetic_memory_contract_only",
    snapshot: async binding => { bind(binding); return structuredClone(state); },
    loadRelations: async binding => { bind(binding); state = { ...RELATION_STATE }; return structuredClone(state); },
    materializeIdentity: async binding => { bind(binding); if (state.assignmentRows !== 117 || state.sessionRows !== 7 || state.activeRelationMaps !== 124) fail("PRODUCTION_IMPORT_PERFORMANCE_RELATIONS_SEQUENCE_INVALID", "relations must precede identity resolution"); state = { ...MATERIALIZED_STATE }; return structuredClone(state); },
    rollbackIdentity: async binding => { bind(binding); if (state.assignmentRows !== 117 || state.sessionRows !== 7 || state.activeRelationMaps !== 124) fail("PRODUCTION_IMPORT_PERFORMANCE_RELATIONS_SEQUENCE_INVALID", "identity rollback lost relation facts"); state = { ...RELATION_STATE }; return structuredClone(state); },
    rollbackRelations: async binding => { bind(binding); if (state.identityResolutionRows !== 0 || state.sessionBindingRows !== 0) fail("PRODUCTION_IMPORT_PERFORMANCE_RELATIONS_ROLLBACK_ORDER_INVALID", "identity rows must roll back first"); state = { ...ZERO_STATE }; return structuredClone(state); },
  });
}

export async function executeSyntheticPerformanceRelationsLifecycle(bindingInput, adapter = createSyntheticPerformanceRelationsAdapter()) {
  const binding = validateHeldPerformanceRelationsBinding(bindingInput);
  const expectedAdapterKeys = ["adapterKind", "snapshot", "loadRelations", "materializeIdentity", "rollbackIdentity", "rollbackRelations"];
  exactKeys(adapter, expectedAdapterKeys, "PRODUCTION_IMPORT_PERFORMANCE_RELATIONS_SYNTHETIC_ADAPTER_INVALID", "adapter");
  if (adapter.adapterKind !== "synthetic_memory_contract_only" || expectedAdapterKeys.slice(1).some(key => typeof adapter[key] !== "function")) fail("PRODUCTION_IMPORT_PERFORMANCE_RELATIONS_SYNTHETIC_ADAPTER_INVALID", "only the in-memory synthetic adapter contract is accepted");
  const steps = [];
  const record = (step, state, expected) => {
    const safeState = validateState(state, expected, step);
    steps.push({ step, stateSha256: computeProductionImportPayloadHash(safeState), counts: safeState });
  };
  record("initial", await adapter.snapshot(binding), ZERO_STATE);
  record("source_person_assignments", await adapter.loadRelations(binding), RELATION_STATE);
  record("source_person_assignments_replay", await adapter.loadRelations(binding), RELATION_STATE);
  record("identity_resolution", await adapter.materializeIdentity(binding), MATERIALIZED_STATE);
  record("identity_resolution_replay", await adapter.materializeIdentity(binding), MATERIALIZED_STATE);
  record("rollback_identity_resolution", await adapter.rollbackIdentity(binding), RELATION_STATE);
  record("rollback_source_person_assignments", await adapter.rollbackRelations(binding), ZERO_STATE);
  record("rollback_replay", await adapter.rollbackRelations(binding), ZERO_STATE);
  return {
    formatVersion: 1,
    receiptKind: "yuzhou_hr_production_import_performance_relations_synthetic_lifecycle_receipt",
    bindingSha256: computeProductionImportPayloadHash(binding),
    steps,
    residualCount: 0,
    realSourceRowsWritten: 0,
    executionReachable: false,
    productionImport: "HOLD",
  };
}

export const DEFAULT_PRODUCTION_IMPORT_PERFORMANCE_RELATIONS_CONTRACT = contract;
