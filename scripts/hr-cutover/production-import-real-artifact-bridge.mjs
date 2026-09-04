import { createHash } from "node:crypto";

import {
  ProductionImportPayloadGenerationError,
  computeFrozenArtifactHash,
  generateProductionImportPayloads,
} from "./production-import-payload-generator.mjs";
import {
  DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL,
  stableProductionImportCanonicalJson,
  validateProductionImportTargetModel,
} from "./production-import-target-model.mjs";

const CODE_SHA = /^[0-9a-f]{40}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const PHASES = ["T0", "T1", "T2", "T3"];
const INPUT_KEYS = ["expectedTriple", "phaseArtifacts", "targetInventoryArtifact", "decisionsArtifact", "sealedScopeArtifact"];
const WRAPPER_KEYS = ["formatVersion", "artifactKind", "triple", "payload"];
const PHASE_WRAPPER_KEYS = ["formatVersion", "artifactKind", "triple", "phase", "records"];
const PHASE_WRAPPER_COVERAGE_KEYS = [...PHASE_WRAPPER_KEYS, "targetTableCounts"];
const EXPLICIT_ARTIFACT_KEYS = ["path", "bytes", "sha256"];

export class ProductionImportRealArtifactBridgeError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "ProductionImportRealArtifactBridgeError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new ProductionImportRealArtifactBridgeError(code, detail); };
const sha256 = value => createHash("sha256").update(value).digest("hex");
const isPlainObject = value => value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;

function exactKeys(value, expected, code, label) {
  if (!isPlainObject(value)) fail(code, `${label} must be an object`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) fail(code, `${label} keys differ`);
}

function validateTriple(triple, label) {
  exactKeys(triple, ["codeSha", "sourceSnapshotHash", "mappingContractHash"], "PRODUCTION_IMPORT_REAL_ARTIFACT_TRIPLE_INVALID", label);
  if (!CODE_SHA.test(triple.codeSha ?? "") || !SHA256.test(triple.sourceSnapshotHash ?? "") || !SHA256.test(triple.mappingContractHash ?? "")) {
    fail("PRODUCTION_IMPORT_REAL_ARTIFACT_TRIPLE_INVALID", `${label} invalid`);
  }
  return structuredClone(triple);
}

function sameTriple(left, right) {
  return left.codeSha === right.codeSha
    && left.sourceSnapshotHash === right.sourceSnapshotHash
    && left.mappingContractHash === right.mappingContractHash;
}

function explicitBytes(input, label) {
  exactKeys(input, EXPLICIT_ARTIFACT_KEYS, "PRODUCTION_IMPORT_REAL_ARTIFACT_INPUT_INVALID", label);
  if (typeof input.path !== "string" || input.path.length === 0 || input.path.includes("\0")) {
    fail("PRODUCTION_IMPORT_REAL_ARTIFACT_INPUT_INVALID", `${label} explicit path required`);
  }
  if (!(typeof input.bytes === "string" || input.bytes instanceof Uint8Array)) {
    fail("PRODUCTION_IMPORT_REAL_ARTIFACT_INPUT_INVALID", `${label} explicit bytes required`);
  }
  const bytes = typeof input.bytes === "string" ? Buffer.from(input.bytes, "utf8") : Buffer.from(input.bytes);
  if (bytes.length === 0 || !SHA256.test(input.sha256 ?? "") || sha256(bytes) !== input.sha256) {
    fail("PRODUCTION_IMPORT_REAL_ARTIFACT_HASH_MISMATCH", `${label} bytes differ from declared hash`);
  }
  let parsed;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch {
    fail("PRODUCTION_IMPORT_REAL_ARTIFACT_JSON_INVALID", `${label} is not JSON`);
  }
  return {
    parsed,
    sha256: input.sha256,
    pathSha256: sha256(Buffer.from(input.path, "utf8")),
    bytes: bytes.length,
  };
}

function verifyTripleBinding(actual, expected, label) {
  validateTriple(actual, `${label}.triple`);
  if (!sameTriple(actual, expected)) fail("PRODUCTION_IMPORT_REAL_ARTIFACT_TRIPLE_MISMATCH", `${label} is not bound to expected C/S/M`);
}

function envelope(content) {
  return { artifactSha256: computeFrozenArtifactHash(content), content: structuredClone(content) };
}

function readPhaseArtifact(input, expectedTriple, model) {
  const artifact = explicitBytes(input, "phaseArtifact");
  const hasCoverage = Object.hasOwn(artifact.parsed, "targetTableCounts");
  exactKeys(artifact.parsed, hasCoverage ? PHASE_WRAPPER_COVERAGE_KEYS : PHASE_WRAPPER_KEYS, "PRODUCTION_IMPORT_REAL_PHASE_ARTIFACT_INVALID", "phaseArtifact");
  if (artifact.parsed.formatVersion !== 1 || artifact.parsed.artifactKind !== "yuzhou_hr_production_import_real_phase_staging" || !PHASES.includes(artifact.parsed.phase) || !Array.isArray(artifact.parsed.records)) {
    fail("PRODUCTION_IMPORT_REAL_PHASE_ARTIFACT_INVALID", "phase artifact identity invalid");
  }
  verifyTripleBinding(artifact.parsed.triple, expectedTriple, `phaseArtifact.${artifact.parsed.phase}`);
  const expectedTables = Object.entries(model.targetTables).filter(([, rule]) => rule.phase === artifact.parsed.phase).map(([table]) => table).sort();
  let coveredTables = [...new Set(artifact.parsed.records.map(record => record?.targetTable).filter(value => typeof value === "string"))].sort();
  if (hasCoverage) {
    if (!isPlainObject(artifact.parsed.targetTableCounts) || JSON.stringify(Object.keys(artifact.parsed.targetTableCounts).sort()) !== JSON.stringify(expectedTables)) fail("PRODUCTION_IMPORT_REAL_PHASE_ARTIFACT_INVALID", "phase target table coverage differs");
    const observed = Object.fromEntries(expectedTables.map(table => [table, artifact.parsed.records.filter(record => record?.targetTable === table).length]));
    if (expectedTables.some(table => !Number.isSafeInteger(artifact.parsed.targetTableCounts[table]) || artifact.parsed.targetTableCounts[table] < 0 || artifact.parsed.targetTableCounts[table] !== observed[table])) fail("PRODUCTION_IMPORT_REAL_PHASE_ARTIFACT_INVALID", "phase target table counts differ");
    coveredTables = expectedTables;
  }
  return { ...artifact, phase: artifact.parsed.phase, records: structuredClone(artifact.parsed.records), coveredTables };
}

function readRoleArtifact(input, expectedTriple, role, artifactKind) {
  const artifact = explicitBytes(input, `${role}Artifact`);
  exactKeys(artifact.parsed, WRAPPER_KEYS, "PRODUCTION_IMPORT_REAL_ROLE_ARTIFACT_INVALID", `${role}Artifact`);
  if (artifact.parsed.formatVersion !== 1 || artifact.parsed.artifactKind !== artifactKind || !isPlainObject(artifact.parsed.payload)) {
    fail("PRODUCTION_IMPORT_REAL_ROLE_ARTIFACT_INVALID", `${role} artifact identity invalid`);
  }
  verifyTripleBinding(artifact.parsed.triple, expectedTriple, `${role}Artifact`);
  return { ...artifact, payload: structuredClone(artifact.parsed.payload) };
}

function holdResult({ expectedTriple, phaseEvidence, artifacts, coverage, reasonCode }) {
  return {
    formatVersion: 1,
    bridgeKind: "yuzhou_hr_production_import_real_artifact_bridge_result",
    status: "REVIEW_HOLD",
    productionImport: "HOLD",
    triple: structuredClone(expectedTriple),
    reasonCodes: [reasonCode],
    phaseEvidence,
    outputArtifactSha256: Object.fromEntries(Object.entries(artifacts).map(([key, value]) => [key, value.artifactSha256])),
    targetTableCoverage: coverage,
    generatorInput: null,
  };
}

/**
 * Bridges explicitly supplied, hash-frozen bytes into the four envelopes consumed by
 * generateProductionImportPayloads. This function performs no filesystem, network,
 * credential, source-database, or environment access.
 */
export function bridgeProductionImportRealArtifacts(input, { model: modelInput = DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL } = {}) {
  exactKeys(input, INPUT_KEYS, "PRODUCTION_IMPORT_REAL_ARTIFACT_INPUT_INVALID", "bridgeInput");
  const expectedTriple = validateTriple(input.expectedTriple, "expectedTriple");
  const model = validateProductionImportTargetModel(modelInput);
  if (!Array.isArray(input.phaseArtifacts) || input.phaseArtifacts.length !== PHASES.length) {
    fail("PRODUCTION_IMPORT_REAL_PHASE_SET_INVALID", "exactly four phase artifacts are required");
  }

  const phases = input.phaseArtifacts.map(row => readPhaseArtifact(row, expectedTriple, model));
  phases.sort((left, right) => PHASES.indexOf(left.phase) - PHASES.indexOf(right.phase));
  if (JSON.stringify(phases.map(row => row.phase)) !== JSON.stringify(PHASES)) {
    fail("PRODUCTION_IMPORT_REAL_PHASE_SET_INVALID", "phase set must be exactly T0 through T3");
  }
  const inventory = readRoleArtifact(input.targetInventoryArtifact, expectedTriple, "targetInventory", "yuzhou_hr_production_import_real_target_inventory");
  const decisions = readRoleArtifact(input.decisionsArtifact, expectedTriple, "decisions", "yuzhou_hr_production_import_real_decisions");
  const sealedScope = readRoleArtifact(input.sealedScopeArtifact, expectedTriple, "sealedScope", "yuzhou_hr_production_import_real_sealed_scope");

  const stagingArtifact = envelope({
    formatVersion: 1,
    artifactKind: "yuzhou_hr_production_import_frozen_staging_index",
    sourceSnapshotHash: expectedTriple.sourceSnapshotHash,
    records: phases.flatMap(row => row.records),
  });
  const targetInventoryArtifact = envelope(inventory.payload);
  const sealedScopeArtifact = envelope(sealedScope.payload);
  const decisionsArtifact = envelope(decisions.payload);
  const artifacts = { stagingArtifact, decisionsArtifact, targetInventoryArtifact, sealedScopeArtifact };
  const phaseEvidence = Object.fromEntries(phases.map(row => [row.phase, {
    sourcePathSha256: row.pathSha256,
    sourceArtifactSha256: row.sha256,
    sourceBytes: row.bytes,
    recordCount: row.records.length,
  }]));
  const presentTables = [...new Set(phases.flatMap(row => row.coveredTables))].sort();
  const expectedTables = Object.keys(model.targetTables).sort();
  const missingTables = expectedTables.filter(table => !presentTables.includes(table));
  const unexpectedTables = presentTables.filter(table => !expectedTables.includes(table));
  const coverage = { expectedCount: expectedTables.length, presentCount: presentTables.length, missingTables, unexpectedTables };
  if (missingTables.length > 0 || unexpectedTables.length > 0) {
    return holdResult({ expectedTriple, phaseEvidence, artifacts, coverage, reasonCode: "PRODUCTION_IMPORT_REAL_ARTIFACT_TABLE_COVERAGE_INCOMPLETE" });
  }

  const phaseManifestMismatch = PHASES.some(phase => decisions.payload?.phaseManifests?.[phase] !== phaseEvidence[phase].sourceArtifactSha256);
  if (phaseManifestMismatch) {
    return holdResult({ expectedTriple, phaseEvidence, artifacts, coverage, reasonCode: "PRODUCTION_IMPORT_REAL_PHASE_HASH_BINDING_MISMATCH" });
  }

  let generated;
  try {
    generated = generateProductionImportPayloads(artifacts, { model });
  } catch (error) {
    if (!(error instanceof ProductionImportPayloadGenerationError)) throw error;
    return holdResult({ expectedTriple, phaseEvidence, artifacts, coverage, reasonCode: error.code });
  }

  return {
    formatVersion: 1,
    bridgeKind: "yuzhou_hr_production_import_real_artifact_bridge_result",
    status: "READY",
    productionImport: "HOLD",
    triple: structuredClone(expectedTriple),
    reasonCodes: [],
    phaseEvidence,
    outputArtifactSha256: Object.fromEntries(Object.entries(artifacts).map(([key, value]) => [key, value.artifactSha256])),
    targetTableCoverage: coverage,
    generationEvidence: {
      targetModelVersion: generated.targetModelVersion,
      phaseOrder: [...generated.phaseOrder],
      recordCount: generated.planPhases.reduce((sum, phase) => sum + phase.records.length, 0),
      payloadBundleSha256: Object.fromEntries(generated.bundles.map(row => [row.phase, row.payloadBundleSha256])),
      evidenceSha256: sha256(Buffer.from(`${stableProductionImportCanonicalJson({
        triple: expectedTriple,
        sourceArtifacts: generated.sourceArtifacts,
        payloadBundleSha256: Object.fromEntries(generated.bundles.map(row => [row.phase, row.payloadBundleSha256])),
      })}\n`, "utf8")),
    },
    generatorInput: artifacts,
  };
}
