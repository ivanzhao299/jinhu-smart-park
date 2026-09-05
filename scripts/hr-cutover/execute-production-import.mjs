#!/usr/bin/env node
/* global process, structuredClone */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { closeSync, constants, fstatSync, openSync, readSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  DEFAULT_PRODUCTION_IMPORT_EXECUTION_CONTRACT,
  assertProductionImportExecutionActivated,
  computeProductionImportPayloadBundleHash,
  computeProductionImportPayloadHash,
  productionImportHash,
  validateProductionImportPayloadBundle,
  validateSealedProductionImportPlan,
} from "./production-import-sealed-plan-lib.mjs";
import { createProductionImportPhaseWriters } from "./production-import-phase-writers.mjs";
import { createProductionImportPostgresAdapter } from "./production-import-postgres-adapter.mjs";
import {
  validateProductionPerformanceRelationsInvocation,
} from "./production-import-performance-relations-writer.mjs";
import { executeSealedProductionImport } from "./production-import-writer.mjs";

const CODE_SHA = /^[0-9a-f]{40}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const PHASES = Object.freeze(["T0", "T1", "T2", "T3"]);
const SUPPORTED_DOMAINS = Object.freeze([...PHASES, "PERFORMANCE_FACTS", "PERFORMANCE_RELATIONS", "PERFORMANCE_FACT_IDENTITY", "T5_NONFILE"]);
const EXECUTION_INTENT = "EXECUTE_SEALED_PRODUCTION_IMPORT_ONCE";
const MAX_CONFIG_BYTES = 1024 * 1024;
const MAX_CONTROL_ARTIFACT_BYTES = 64 * 1024 * 1024;
const MAX_PAYLOAD_ARTIFACT_BYTES = 2_000_000_000;
const MAX_TOTAL_PRIVATE_ARTIFACT_BYTES = 2_000_000_000;
const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
export const PRODUCTION_IMPORT_EXECUTION_DEPENDENCY_PATHS = Object.freeze([
  "scripts/hr-cutover/execute-production-import.mjs",
  "scripts/hr-cutover/production-import-crypto-provider.mjs",
  "scripts/hr-cutover/production-import-phase-writers.mjs",
  "scripts/hr-cutover/production-import-postgres-adapter.mjs",
  "scripts/hr-cutover/production-import-target-model.mjs",
  "scripts/hr-cutover/production-import-t5-nonfile-writer.mjs",
  "scripts/hr-cutover/production-import-t5-nonfile-rollback.mjs",
  "scripts/hr-cutover/production-import-performance-relations-contract.mjs",
  "scripts/hr-cutover/production-import-performance-relations-writer.mjs",
  "scripts/hr-cutover/production-import-performance-fact-identity-contract.mjs",
  "scripts/hr-cutover/production-import-performance-fact-identity-writer.mjs",
  "scripts/hr-cutover/production-import-performance-fact-loader-contract.mjs",
  "scripts/hr-cutover/production-import-performance-fact-loader-writer.mjs",
  "scripts/hr-cutover/contracts/production-import-performance-fact-loader-v1.json",
  "scripts/hr-cutover/contracts/production-import-performance-fact-identity-v1.json",
  "scripts/hr-cutover/contracts/production-import-target-model-v1.json",
  "scripts/hr-cutover/contracts/production-import-execution-v2.json",
  "scripts/hr-cutover/contracts/production-import-performance-relations-v1.json",
  "scripts/hr-cutover/contracts/legacy-performance-source-person-assignment-conservation-v1.json",
  "scripts/hr-cutover/contracts/legacy-performance-fact-location-evidence-v1.json",
  "database/migrations/000305_hr_performance_yuzhou_legacy_relations.sql",
  "database/migrations/000306_hr_performance_yuzhou_identity_resolution.sql",
  "database/migrations/000308_hr_yuzhou_performance_relations_production.sql",
  "database/migrations/000310_hr_yuzhou_performance_fact_identity_production.sql",
  "database/migrations/000311_hr_yuzhou_performance_facts_production.sql",
  "scripts/hr-cutover/production-import-sealed-plan-lib.mjs",
  "scripts/hr-cutover/production-import-writer.mjs",
]);

export class ProductionImportEntrypointError extends Error {
  constructor(code, detail, options = undefined) {
    super(`${code}: ${detail}`, options);
    this.name = "ProductionImportEntrypointError";
    this.code = code;
  }
}

const fail = (code, detail, options) => { throw new ProductionImportEntrypointError(code, detail, options); };
const sha256 = value => createHash("sha256").update(value).digest("hex");
const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;

function exactKeys(value, required, optional, code, label) {
  if (!isObject(value)) fail(code, `${label} must be an object`);
  const allowed = new Set([...required, ...optional]);
  for (const key of required) if (!Object.hasOwn(value, key)) fail(code, `${label}.${key} is required`);
  for (const key of Object.keys(value)) if (!allowed.has(key)) fail(code, `${label}.${key} is not allowed`);
}

function assertSha(value, code, label) {
  if (typeof value !== "string" || !SHA256.test(value)) fail(code, `${label} must be a lowercase SHA-256`);
}

export function readBoundedPrivateArtifactBytes(pathInput, label, maximumBytes, readBudget, { afterStat } = {}) {
  if (typeof pathInput !== "string" || !isAbsolute(pathInput) || resolve(pathInput) !== pathInput || pathInput.includes("\0")) {
    fail("PRODUCTION_IMPORT_ENTRYPOINT_PATH_INVALID", `${label} must use an absolute path`);
  }
  let descriptor;
  try {
    descriptor = openSync(pathInput, constants.O_RDONLY | constants.O_NOFOLLOW);
    const info = fstatSync(descriptor);
    const uid = typeof process.getuid === "function" ? process.getuid() : undefined;
    if (!info.isFile() || info.nlink !== 1 || (info.mode & 0o777) !== 0o600 || (uid !== undefined && info.uid !== uid) || info.size < 1 || info.size > maximumBytes) {
      fail("PRODUCTION_IMPORT_ENTRYPOINT_FILE_UNSAFE", `${label} must be an owned 0600 regular single-link file within the size limit`);
    }
    if (readBudget) {
      if (!Number.isSafeInteger(readBudget.bytesRead) || !Number.isSafeInteger(readBudget.maximumBytes) || readBudget.bytesRead + info.size > readBudget.maximumBytes) {
        fail("PRODUCTION_IMPORT_ENTRYPOINT_ARTIFACT_BUDGET_EXCEEDED", "actual private artifact reads exceed the bounded execution budget");
      }
      readBudget.bytesRead += info.size;
    }
    if (afterStat) afterStat();
    const bytes = Buffer.allocUnsafe(info.size);
    let offset = 0;
    while (offset < bytes.length) {
      const count = readSync(descriptor, bytes, offset, bytes.length - offset, null);
      if (count === 0) fail("PRODUCTION_IMPORT_ENTRYPOINT_FILE_CHANGED", `${label} was truncated while reading`);
      offset += count;
    }
    if (readSync(descriptor, Buffer.alloc(1), 0, 1, null) !== 0) fail("PRODUCTION_IMPORT_ENTRYPOINT_FILE_CHANGED", `${label} grew while reading`);
    const after = fstatSync(descriptor);
    if (after.dev !== info.dev || after.ino !== info.ino || after.size !== info.size || after.mtimeMs !== info.mtimeMs || after.ctimeMs !== info.ctimeMs) {
      fail("PRODUCTION_IMPORT_ENTRYPOINT_FILE_CHANGED", `${label} changed while reading`);
    }
    return bytes;
  } catch (error) {
    if (error instanceof ProductionImportEntrypointError) throw error;
    fail("PRODUCTION_IMPORT_ENTRYPOINT_FILE_UNAVAILABLE", `${label} cannot be opened safely`, { cause: error });
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function inspectPrivateFileSize(pathInput, label, maximumBytes) {
  if (typeof pathInput !== "string" || !isAbsolute(pathInput) || resolve(pathInput) !== pathInput || pathInput.includes("\0")) {
    fail("PRODUCTION_IMPORT_ENTRYPOINT_PATH_INVALID", `${label} must use an absolute path`);
  }
  let descriptor;
  try {
    descriptor = openSync(pathInput, constants.O_RDONLY | constants.O_NOFOLLOW);
    const info = fstatSync(descriptor);
    const uid = typeof process.getuid === "function" ? process.getuid() : undefined;
    if (!info.isFile() || info.nlink !== 1 || (info.mode & 0o777) !== 0o600 || (uid !== undefined && info.uid !== uid) || info.size < 1 || info.size > maximumBytes) {
      fail("PRODUCTION_IMPORT_ENTRYPOINT_FILE_UNSAFE", `${label} must be an owned 0600 regular single-link file within the size limit`);
    }
    return info.size;
  } catch (error) {
    if (error instanceof ProductionImportEntrypointError) throw error;
    fail("PRODUCTION_IMPORT_ENTRYPOINT_FILE_UNAVAILABLE", `${label} cannot be inspected safely`, { cause: error });
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function parseJson(bytes, code, label) {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) {
    fail(code, `${label} must be UTF-8 JSON`, { cause: error });
  }
}

function validateDescriptor(value, label) {
  exactKeys(value, ["path", "sha256"], [], "PRODUCTION_IMPORT_ENTRYPOINT_CONFIG_INVALID", label);
  if (typeof value.path !== "string" || !isAbsolute(value.path) || resolve(value.path) !== value.path || value.path.includes("\0")) {
    fail("PRODUCTION_IMPORT_ENTRYPOINT_CONFIG_INVALID", `${label}.path must be absolute`);
  }
  assertSha(value.sha256, "PRODUCTION_IMPORT_ENTRYPOINT_CONFIG_INVALID", `${label}.sha256`);
  return { path: value.path, sha256: value.sha256 };
}

function loadArtifact(descriptor, label, maximumBytes, { json = false, readBudget } = {}) {
  const bytes = readBoundedPrivateArtifactBytes(descriptor.path, label, maximumBytes, readBudget);
  if (sha256(bytes) !== descriptor.sha256) fail("PRODUCTION_IMPORT_ENTRYPOINT_ARTIFACT_HASH_MISMATCH", label);
  return json ? { bytes, value: parseJson(bytes, "PRODUCTION_IMPORT_ENTRYPOINT_ARTIFACT_INVALID", label) } : { bytes };
}

function validateConfig(value) {
  exactKeys(value, ["formatVersion", "entrypointKind", "deploymentMode", "executionIntent", "requestedDomains", "artifacts"], ["execution"], "PRODUCTION_IMPORT_ENTRYPOINT_CONFIG_INVALID", "config");
  if (value.formatVersion !== 1 || value.entrypointKind !== "yuzhou_hr_controlled_production_import_entrypoint") fail("PRODUCTION_IMPORT_ENTRYPOINT_CONFIG_INVALID", "config identity invalid");
  if (!["smart_park_integrated", "standalone_enterprise"].includes(value.deploymentMode)) fail("PRODUCTION_IMPORT_ENTRYPOINT_CONFIG_INVALID", "deploymentMode invalid");
  if (!["HOLD", EXECUTION_INTENT].includes(value.executionIntent)) fail("PRODUCTION_IMPORT_ENTRYPOINT_CONFIG_INVALID", "executionIntent invalid");
  if (!Array.isArray(value.requestedDomains) || value.requestedDomains.length === 0 || new Set(value.requestedDomains).size !== value.requestedDomains.length || value.requestedDomains.some(domain => typeof domain !== "string")) {
    fail("PRODUCTION_IMPORT_ENTRYPOINT_CONFIG_INVALID", "requestedDomains must be a unique non-empty string array");
  }
  exactKeys(value.artifacts, ["sealedPlan", "payloadBundles"], ["t5NonfilePrivateStage", "performanceRelations", "performanceFactLoader"], "PRODUCTION_IMPORT_ENTRYPOINT_CONFIG_INVALID", "artifacts");
  const sealedPlan = validateDescriptor(value.artifacts.sealedPlan, "artifacts.sealedPlan");
  exactKeys(value.artifacts.payloadBundles, PHASES, [], "PRODUCTION_IMPORT_ENTRYPOINT_CONFIG_INVALID", "artifacts.payloadBundles");
  const payloadBundles = Object.fromEntries(PHASES.map(phase => [phase, validateDescriptor(value.artifacts.payloadBundles[phase], `artifacts.payloadBundles.${phase}`)]));
  let t5NonfilePrivateStage;
  if (value.artifacts.t5NonfilePrivateStage !== undefined) t5NonfilePrivateStage = validateDescriptor(value.artifacts.t5NonfilePrivateStage, "artifacts.t5NonfilePrivateStage");
  let performanceRelations;
  if (value.artifacts.performanceRelations !== undefined) {
    exactKeys(value.artifacts.performanceRelations, ["relationPayload", "identityDecision"], [], "PRODUCTION_IMPORT_ENTRYPOINT_CONFIG_INVALID", "artifacts.performanceRelations");
    performanceRelations = {
      relationPayload: validateDescriptor(value.artifacts.performanceRelations.relationPayload, "artifacts.performanceRelations.relationPayload"),
      identityDecision: validateDescriptor(value.artifacts.performanceRelations.identityDecision, "artifacts.performanceRelations.identityDecision"),
    };
  }
  let execution;
  let performanceFactLoader;
  if (value.artifacts.performanceFactLoader !== undefined) {
    exactKeys(value.artifacts.performanceFactLoader, ["factPayload", "masterPayload"], [], "PRODUCTION_IMPORT_ENTRYPOINT_CONFIG_INVALID", "artifacts.performanceFactLoader");
    performanceFactLoader = {
      factPayload: validateDescriptor(value.artifacts.performanceFactLoader.factPayload, "artifacts.performanceFactLoader.factPayload"),
      masterPayload: validateDescriptor(value.artifacts.performanceFactLoader.masterPayload, "artifacts.performanceFactLoader.masterPayload"),
    };
  }
  if (value.execution !== undefined) {
    exactKeys(value.execution, ["runtimeEvidence", "databaseBinding", "postgresCredentials", "cryptoEnvelope", "cryptoKeyFiles"], [], "PRODUCTION_IMPORT_ENTRYPOINT_CONFIG_INVALID", "execution");
    if (!Array.isArray(value.execution.cryptoKeyFiles)) fail("PRODUCTION_IMPORT_ENTRYPOINT_CONFIG_INVALID", "execution.cryptoKeyFiles must be an array");
    execution = {
      runtimeEvidence: validateDescriptor(value.execution.runtimeEvidence, "execution.runtimeEvidence"),
      databaseBinding: validateDescriptor(value.execution.databaseBinding, "execution.databaseBinding"),
      postgresCredentials: validateDescriptor(value.execution.postgresCredentials, "execution.postgresCredentials"),
      cryptoEnvelope: validateDescriptor(value.execution.cryptoEnvelope, "execution.cryptoEnvelope"),
      cryptoKeyFiles: value.execution.cryptoKeyFiles.map((row, index) => {
        exactKeys(row, ["keyReferenceSha256", "keyFile"], [], "PRODUCTION_IMPORT_ENTRYPOINT_CONFIG_INVALID", `execution.cryptoKeyFiles[${index}]`);
        assertSha(row.keyReferenceSha256, "PRODUCTION_IMPORT_ENTRYPOINT_CONFIG_INVALID", `execution.cryptoKeyFiles[${index}].keyReferenceSha256`);
        const keyFile = validateDescriptor(row.keyFile, `execution.cryptoKeyFiles[${index}].keyFile`);
        if (keyFile.sha256 === row.keyReferenceSha256) fail("PRODUCTION_IMPORT_ENTRYPOINT_CONFIG_INVALID", "key reference cannot be the key file hash");
        return { keyReferenceSha256: row.keyReferenceSha256, keyFile };
      }),
    };
  }
  return {
    formatVersion: 1,
    entrypointKind: value.entrypointKind,
    deploymentMode: value.deploymentMode,
    executionIntent: value.executionIntent,
    requestedDomains: [...value.requestedDomains],
    artifacts: { sealedPlan, payloadBundles, ...(t5NonfilePrivateStage ? { t5NonfilePrivateStage } : {}), ...(performanceRelations ? { performanceRelations } : {}), ...(performanceFactLoader ? { performanceFactLoader } : {}) },
    ...(execution ? { execution } : {}),
  };
}

function assertArtifactBudget(config, includeExecution, bytesAlreadyRead) {
  const descriptors = [
    ...PHASES.map(phase => config.artifacts.payloadBundles[phase]),
    ...(config.artifacts.t5NonfilePrivateStage ? [config.artifacts.t5NonfilePrivateStage] : []),
    ...(config.artifacts.performanceRelations ? Object.values(config.artifacts.performanceRelations) : []),
    ...(config.artifacts.performanceFactLoader ? Object.values(config.artifacts.performanceFactLoader) : []),
    ...(includeExecution && config.execution ? [
      config.execution.runtimeEvidence,
      config.execution.databaseBinding,
      config.execution.postgresCredentials,
      config.execution.cryptoEnvelope,
      ...config.execution.cryptoKeyFiles.map(row => row.keyFile),
    ] : []),
  ];
  const seen = new Set();
  let total = bytesAlreadyRead;
  for (const [index, descriptor] of descriptors.entries()) {
    if (seen.has(descriptor.path)) continue;
    seen.add(descriptor.path);
    total += inspectPrivateFileSize(descriptor.path, `private artifact ${index}`, MAX_PAYLOAD_ARTIFACT_BYTES);
    if (total > MAX_TOTAL_PRIVATE_ARTIFACT_BYTES) fail("PRODUCTION_IMPORT_ENTRYPOINT_ARTIFACT_BUDGET_EXCEEDED", "private artifact aggregate exceeds the bounded execution budget");
  }
}

function expectedDomains(plan) {
  return [...PHASES.slice(0, 1), ...(plan.performanceFactLoader ? ["PERFORMANCE_FACTS"] : []), ...(plan.performanceRelations ? ["PERFORMANCE_RELATIONS"] : []), ...(plan.performanceFactIdentity ? ["PERFORMANCE_FACT_IDENTITY"] : []), ...PHASES.slice(1), ...(plan.t5Nonfile ? ["T5_NONFILE"] : [])];
}

function validateRequestedDomains(config, plan) {
  const unsupported = config.requestedDomains.filter(domain => !SUPPORTED_DOMAINS.includes(domain));
  if (unsupported.length > 0) fail("PRODUCTION_IMPORT_ENTRYPOINT_DOMAIN_UNSUPPORTED", "requested domain is not connected to the sealed writer");
  const expected = expectedDomains(plan);
  if (JSON.stringify(config.requestedDomains) !== JSON.stringify(expected)) fail("PRODUCTION_IMPORT_ENTRYPOINT_DOMAIN_SCOPE_MISMATCH", "requested domains differ from the exact sealed writer scope");
  if (config.deploymentMode === "standalone_enterprise") {
    fail("PRODUCTION_IMPORT_STANDALONE_TARGET_CONTRACT_UNAVAILABLE", "the current writer contract requires tenant_park scope and cannot invent a standalone enterprise park");
  }
  return expected;
}

function validatePayloadBundles(config, plan, readBudget) {
  const payloadBundles = {};
  for (const phase of plan.phases) {
    const artifact = loadArtifact(config.artifacts.payloadBundles[phase.phase], `${phase.phase} payload bundle`, MAX_PAYLOAD_ARTIFACT_BYTES, { readBudget });
    if (productionImportHash(artifact.bytes) !== phase.payloadBundleArtifactSha256) fail("PRODUCTION_IMPORT_PAYLOAD_ARTIFACT_HASH_MISMATCH", phase.phase);
    const parsed = parseJson(artifact.bytes, "PRODUCTION_IMPORT_PAYLOAD_BUNDLE_INVALID", `${phase.phase} payload bundle`);
    const bundle = validateProductionImportPayloadBundle(parsed, {
      phase: phase.phase,
      targetScope: plan.targetScope,
      sourceBatchManifestSha256: phase.sourceBatchManifestSha256,
      canonicalizationVersion: phase.canonicalizationVersion,
    });
    if (computeProductionImportPayloadBundleHash(bundle) !== phase.payloadBundleSha256) fail("PRODUCTION_IMPORT_PAYLOAD_BUNDLE_HASH_MISMATCH", phase.phase);
    payloadBundles[phase.phase] = artifact.bytes;
  }
  return payloadBundles;
}

function validateOptionalArtifacts(config, plan, readBudget) {
  if (Boolean(config.artifacts.t5NonfilePrivateStage) !== Boolean(plan.t5Nonfile)) fail("PRODUCTION_IMPORT_ENTRYPOINT_T5_BINDING_MISMATCH", "T5_NONFILE descriptor and plan binding differ");
  if (Boolean(config.artifacts.performanceRelations) !== Boolean(plan.performanceRelations)) fail("PRODUCTION_IMPORT_ENTRYPOINT_PERFORMANCE_BINDING_MISMATCH", "performance relation descriptors and plan binding differ");
  if (Boolean(config.artifacts.performanceFactLoader) !== Boolean(plan.performanceFactLoader)) fail("PRODUCTION_IMPORT_ENTRYPOINT_PERFORMANCE_FACT_LOADER_BINDING_MISMATCH", "performance fact descriptors and plan binding differ");
  let t5NonfilePrivateStage;
  if (plan.t5Nonfile) {
    const loaded = loadArtifact(config.artifacts.t5NonfilePrivateStage, "T5_NONFILE private stage", MAX_PAYLOAD_ARTIFACT_BYTES, { json: true, readBudget });
    if (computeProductionImportPayloadHash(loaded.value) !== plan.t5Nonfile.privateStageSha256) fail("PRODUCTION_IMPORT_T5_NONFILE_STAGE_HASH_MISMATCH", "private stage differs from sealed plan");
    t5NonfilePrivateStage = loaded.value;
  }
  let performanceRelations;
  if (plan.performanceRelations) {
    const relationPayloadArtifact = loadArtifact(config.artifacts.performanceRelations.relationPayload, "performance relation payload", MAX_PAYLOAD_ARTIFACT_BYTES, { readBudget }).bytes;
    const identityDecisionArtifact = loadArtifact(config.artifacts.performanceRelations.identityDecision, "performance identity decision", MAX_PAYLOAD_ARTIFACT_BYTES, { readBudget }).bytes;
    const invocation = {
      operationId: plan.operationId,
      sealedPlanSha256: plan.sealing.sealedPlanSha256,
      authorizationArtifactSha256: plan.authorization.artifactSha256,
      authorizationNonceSha256: plan.authorization.nonceSha256,
      codeSha: plan.triple.codeSha,
      sourceSnapshotSha256: plan.triple.sourceSnapshotHash,
      mappingContractSha256: plan.triple.mappingContractHash,
      targetIdentitySha256: plan.target.identitySha256,
      expectedTargetIdentitySha256: plan.target.identitySha256,
      targetScope: structuredClone(plan.targetScope),
      expectedTargetScopeSha256: plan.targetScope.scopeSha256,
      t0PhaseReceiptSha256: plan.performanceRelations.t0PhaseReceiptSha256,
      relationPayloadArtifact,
      identityDecisionArtifact,
      binding: plan.performanceRelations,
    };
    validateProductionPerformanceRelationsInvocation(invocation);
    performanceRelations = { relationPayloadArtifact, identityDecisionArtifact };
  }
  let performanceFactLoader;
  if (plan.performanceFactLoader) {
    const factPayloadArtifact = loadArtifact(config.artifacts.performanceFactLoader.factPayload, "performance fact payload", MAX_PAYLOAD_ARTIFACT_BYTES, { readBudget }).bytes;
    const masterPayloadArtifact = loadArtifact(config.artifacts.performanceFactLoader.masterPayload, "performance master payload", MAX_PAYLOAD_ARTIFACT_BYTES, { readBudget }).bytes;
    if (sha256(factPayloadArtifact) !== plan.performanceFactLoader.factPayloadArtifactSha256
      || sha256(masterPayloadArtifact) !== plan.performanceFactLoader.masterPayloadArtifactSha256) {
      fail("PRODUCTION_IMPORT_PERFORMANCE_FACT_LOADER_ARTIFACT_HASH_MISMATCH", "performance fact bytes differ from sealed input");
    }
    performanceFactLoader = { factPayloadArtifact, masterPayloadArtifact };
  }
  return { t5NonfilePrivateStage, performanceRelations, performanceFactLoader };
}

function readRuntimeEvidence(descriptor, plan, currentCodeSha, now, readBudget) {
  if (!isObject(plan.runtimeReleaseEvidence)) fail("PRODUCTION_IMPORT_RUNTIME_RELEASE_EVIDENCE_UNBOUND", "sealed plan has no externally approved runtime release receipt binding");
  const loaded = loadArtifact(descriptor, "runtime release receipt", MAX_CONTROL_ARTIFACT_BYTES, { json: true, readBudget });
  const evidence = loaded.value;
  exactKeys(evidence, ["formatVersion", "artifactKind", "currentCodeSha", "mergedCodeSha", "runtimeCodeSha", "targetIdentitySha256", "targetScopeSha256", "observedAt", "expiresAt"], [], "PRODUCTION_IMPORT_ENTRYPOINT_RUNTIME_EVIDENCE_INVALID", "runtimeEvidence");
  if (evidence.formatVersion !== 1 || evidence.artifactKind !== "yuzhou_hr_production_import_runtime_release_receipt" || !CODE_SHA.test(currentCodeSha ?? "") || !CODE_SHA.test(evidence.currentCodeSha ?? "") || !CODE_SHA.test(evidence.mergedCodeSha ?? "") || !CODE_SHA.test(evidence.runtimeCodeSha ?? "")) {
    fail("PRODUCTION_IMPORT_ENTRYPOINT_RUNTIME_EVIDENCE_INVALID", "runtime evidence identity invalid");
  }
  if (sha256(loaded.bytes) !== plan.runtimeReleaseEvidence.artifactSha256 || descriptor.sha256 !== plan.runtimeReleaseEvidence.artifactSha256) fail("PRODUCTION_IMPORT_RUNTIME_RELEASE_EVIDENCE_HASH_MISMATCH", "runtime receipt bytes differ from the sealed approval binding");
  if (![currentCodeSha, evidence.currentCodeSha, evidence.mergedCodeSha, evidence.runtimeCodeSha].every(value => value === plan.triple.codeSha)) fail("PRODUCTION_IMPORT_CODE_SHA_MISMATCH", "candidate, merged, runtime and sealed code must match");
  if (evidence.targetIdentitySha256 !== plan.target.identitySha256 || evidence.targetScopeSha256 !== plan.targetScope.scopeSha256) fail("PRODUCTION_IMPORT_RUNTIME_RELEASE_EVIDENCE_TARGET_MISMATCH", "runtime receipt target or scope differs from the sealed target");
  if (evidence.observedAt !== plan.runtimeReleaseEvidence.observedAt || evidence.expiresAt !== plan.runtimeReleaseEvidence.expiresAt) fail("PRODUCTION_IMPORT_RUNTIME_RELEASE_EVIDENCE_TIME_INVALID", "runtime receipt time differs from the sealed approval binding");
  const observedAt = Date.parse(evidence.observedAt);
  const expiresAt = Date.parse(evidence.expiresAt);
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  if (![observedAt, expiresAt, nowMs].every(Number.isFinite) || observedAt > nowMs || nowMs >= expiresAt || observedAt > Date.parse(plan.authorization.issuedAt) || expiresAt > Date.parse(plan.authorization.expiresAt) || expiresAt > Date.parse(plan.window.endsAt)) fail("PRODUCTION_IMPORT_RUNTIME_RELEASE_EVIDENCE_TIME_INVALID", "runtime receipt is not current within the approved execution window");
  return evidence;
}

function readDatabaseBinding(descriptor, plan, readBudget) {
  const artifact = loadArtifact(descriptor, "database binding", MAX_CONTROL_ARTIFACT_BYTES, { json: true, readBudget }).value;
  exactKeys(artifact, ["formatVersion", "artifactKind", "sealedPlanSha256", "binding"], [], "PRODUCTION_IMPORT_ENTRYPOINT_DATABASE_BINDING_INVALID", "databaseBinding");
  if (artifact.formatVersion !== 1 || artifact.artifactKind !== "yuzhou_hr_production_import_database_binding" || artifact.sealedPlanSha256 !== plan.sealing.sealedPlanSha256) fail("PRODUCTION_IMPORT_ENTRYPOINT_DATABASE_BINDING_INVALID", "database binding identity invalid");
  exactKeys(artifact.binding, ["database", "databaseUser", "targetIdentitySha256", "targetScope", "serverIdentity"], [], "PRODUCTION_IMPORT_ENTRYPOINT_DATABASE_BINDING_INVALID", "databaseBinding.binding");
  if (artifact.binding.targetIdentitySha256 !== plan.target.identitySha256 || canonical(artifact.binding.targetScope) !== canonical(plan.targetScope)) fail("PRODUCTION_IMPORT_TARGET_SCOPE_MISMATCH", "database binding differs from sealed target");
  return artifact.binding;
}

function readPostgresCredentials(descriptor, binding, readBudget) {
  const artifact = loadArtifact(descriptor, "PostgreSQL credentials", MAX_CONTROL_ARTIFACT_BYTES, { json: true, readBudget }).value;
  exactKeys(artifact, ["formatVersion", "artifactKind", "host", "port", "database", "user", "password", "sslMode"], ["sslCa"], "PRODUCTION_IMPORT_ENTRYPOINT_DATABASE_CREDENTIALS_INVALID", "postgresCredentials");
  if (artifact.formatVersion !== 1 || artifact.artifactKind !== "yuzhou_hr_production_import_postgres_credentials" || typeof artifact.host !== "string" || artifact.host.length < 1 || artifact.host.length > 255 || !Number.isSafeInteger(artifact.port) || artifact.port < 1 || artifact.port > 65535 || typeof artifact.password !== "string" || artifact.password.length < 1 || artifact.password.length > 4096 || !["disable", "verify-full"].includes(artifact.sslMode)) {
    fail("PRODUCTION_IMPORT_ENTRYPOINT_DATABASE_CREDENTIALS_INVALID", "PostgreSQL credential contract invalid");
  }
  if (artifact.database !== binding.database || artifact.user !== binding.databaseUser) fail("PRODUCTION_IMPORT_ENTRYPOINT_DATABASE_CREDENTIALS_INVALID", "credentials differ from database binding");
  if (artifact.sslMode === "verify-full" && (typeof artifact.sslCa !== "string" || artifact.sslCa.length < 1 || artifact.sslCa.length > 1024 * 1024)) fail("PRODUCTION_IMPORT_ENTRYPOINT_DATABASE_CREDENTIALS_INVALID", "verify-full requires a bounded CA certificate");
  if (artifact.sslMode === "disable" && artifact.sslCa !== undefined) fail("PRODUCTION_IMPORT_ENTRYPOINT_DATABASE_CREDENTIALS_INVALID", "sslCa is forbidden when TLS is disabled");
  if (artifact.sslMode === "disable" && !["127.0.0.1", "::1"].includes(artifact.host)) fail("PRODUCTION_IMPORT_ENTRYPOINT_DATABASE_TRANSPORT_UNSAFE", "plaintext PostgreSQL transport is restricted to an explicit loopback tunnel");
  return artifact;
}

function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
}

function decodeHex(value, bytes, label) {
  if (typeof value !== "string" || value.length !== bytes * 2 || !/^[0-9a-f]+$/u.test(value)) fail("PRODUCTION_IMPORT_CRYPTO_ARTIFACT_INVALID", `${label} invalid`);
  return Buffer.from(value, "hex");
}

function decodeVariableHex(value, label) {
  if (typeof value !== "string" || value.length < 2 || value.length % 2 !== 0 || !/^[0-9a-f]+$/u.test(value)) fail("PRODUCTION_IMPORT_CRYPTO_ARTIFACT_INVALID", `${label} invalid`);
  return Buffer.from(value, "hex");
}

export async function createProductionImportArtifactCryptoProvider({ envelopeArtifact, keyFiles, plan, payloadBundles, decryptEnvelope, readBudget }) {
  exactKeys(envelopeArtifact, ["formatVersion", "artifactKind", "operationId", "entries"], [], "PRODUCTION_IMPORT_CRYPTO_ARTIFACT_INVALID", "cryptoEnvelope");
  if (envelopeArtifact.formatVersion !== 1 || envelopeArtifact.artifactKind !== "yuzhou_hr_production_import_crypto_envelopes" || envelopeArtifact.operationId !== plan.operationId || !Array.isArray(envelopeArtifact.entries)) fail("PRODUCTION_IMPORT_CRYPTO_ARTIFACT_INVALID", "crypto envelope identity invalid");
  const keys = new Map();
  let destroyed = false;
  const destroyKeys = () => {
    if (destroyed) return;
    destroyed = true;
    for (const key of keys.values()) key.fill(0);
    keys.clear();
  };
  try {
    for (const [index, row] of keyFiles.entries()) {
      if (keys.has(row.keyReferenceSha256)) fail("PRODUCTION_IMPORT_CRYPTO_KEY_ARTIFACT_INVALID", "duplicate key reference");
      const key = loadArtifact(row.keyFile, `crypto key file ${index}`, 32, { readBudget }).bytes;
      try {
        if (key.length !== 32) fail("PRODUCTION_IMPORT_CRYPTO_KEY_ARTIFACT_INVALID", "crypto key file must contain exactly 32 raw bytes");
        keys.set(row.keyReferenceSha256, Buffer.from(key));
      } finally {
        key.fill(0);
      }
    }
    const expected = new Map();
    for (const phase of plan.phases) for (const record of phase.records) {
      const kind = record.disposition === "merge" ? "before_image" : record.disposition === "quarantine" ? "quarantine" : null;
      if (kind) expected.set(`${kind}:${phase.phase}:${record.sourceIdentitySha256}`, record);
    }
    const payloadsByPhase = new Map(plan.phases.map(phase => {
      const bundle = JSON.parse(payloadBundles[phase.phase].toString("utf8"));
      return [phase.phase, new Map(bundle.records.map(record => [record.sourceIdentitySha256, record.payload]))];
    }));
    const envelopes = new Map();
    for (const [index, row] of envelopeArtifact.entries.entries()) {
    exactKeys(row, ["kind", "phaseName", "sourceIdentitySha256", "envelope"], [], "PRODUCTION_IMPORT_CRYPTO_ARTIFACT_INVALID", `cryptoEnvelope.entries[${index}]`);
    if (!["before_image", "quarantine"].includes(row.kind) || !PHASES.includes(row.phaseName)) fail("PRODUCTION_IMPORT_CRYPTO_ARTIFACT_INVALID", "crypto envelope kind or phase invalid");
    assertSha(row.sourceIdentitySha256, "PRODUCTION_IMPORT_CRYPTO_ARTIFACT_INVALID", "crypto envelope source identity");
    const identity = `${row.kind}:${row.phaseName}:${row.sourceIdentitySha256}`;
    const record = expected.get(identity);
    if (!record || envelopes.has(identity)) fail("PRODUCTION_IMPORT_CRYPTO_ARTIFACT_INVALID", "crypto envelope does not bind one sealed record");
    exactKeys(row.envelope, ["algorithm", "keyReferenceSha256", "nonceHex", "authenticationTagHex", "ciphertextHex"], [], "PRODUCTION_IMPORT_CRYPTO_ARTIFACT_INVALID", `cryptoEnvelope.entries[${index}].envelope`);
    const binding = row.kind === "before_image" ? record.beforeImage : record.quarantine;
    if (row.envelope.algorithm !== "aes-256-gcm-external-kek-v1" || row.envelope.keyReferenceSha256 !== binding?.keyReferenceSha256) fail("PRODUCTION_IMPORT_CRYPTO_ARTIFACT_INVALID", "crypto envelope algorithm or key reference differs from plan");
    const envelope = {
      algorithm: row.envelope.algorithm,
      keyReferenceSha256: row.envelope.keyReferenceSha256,
      nonce: decodeHex(row.envelope.nonceHex, 12, "crypto envelope nonce"),
      authenticationTag: decodeHex(row.envelope.authenticationTagHex, 16, "crypto envelope authentication tag"),
      ciphertext: decodeVariableHex(row.envelope.ciphertextHex, "crypto envelope ciphertext"),
    };
    if (envelope.ciphertext.length === 0 || sha256(envelope.ciphertext) !== (row.kind === "before_image" ? record.beforeImage.ciphertextSha256 : record.quarantine.payloadCiphertextSha256)) fail("PRODUCTION_IMPORT_CRYPTO_ARTIFACT_INVALID", "crypto envelope ciphertext differs from sealed plan");
    if (!keys.has(envelope.keyReferenceSha256)) fail("PRODUCTION_IMPORT_CRYPTO_KEY_ARTIFACT_INVALID", "crypto key reference is unresolved");
      envelopes.set(identity, { envelope, record });
    }
    if (envelopes.size !== expected.size) fail("PRODUCTION_IMPORT_CRYPTO_ARTIFACT_INVALID", "crypto envelope coverage differs from sealed merge/quarantine records");
    if (keys.size !== new Set([...expected.values()].map(record => (record.beforeImage ?? record.quarantine).keyReferenceSha256)).size) fail("PRODUCTION_IMPORT_CRYPTO_KEY_ARTIFACT_INVALID", "crypto key file set must exactly cover sealed key references");
    const resolveKey = async ({ keyReferenceSha256 }) => {
      if (destroyed) fail("PRODUCTION_IMPORT_CRYPTO_KEY_UNAVAILABLE", "key resolver is closed");
      const key = keys.get(keyReferenceSha256);
      if (!key) fail("PRODUCTION_IMPORT_CRYPTO_KEY_UNAVAILABLE", "key reference is unavailable");
      return key;
    };
    const decryptedValues = new Map();
    for (const [identity, item] of envelopes) {
      const [kind, phaseName] = identity.split(":", 2);
      const decrypted = await decryptEnvelope({
        kind,
        operationId: plan.operationId,
        phaseName,
        targetScope: plan.targetScope,
        record: item.record,
        keyReferenceSha256: item.envelope.keyReferenceSha256,
        envelope: item.envelope,
      }, { resolveKey });
      if (kind === "before_image") {
        if (decrypted?.plaintextSha256 !== item.record.beforeImage?.plaintextSha256 || !isObject(decrypted?.targetBefore)) fail("PRODUCTION_IMPORT_CRYPTO_PLAINTEXT_MISMATCH", "decrypted before image differs from sealed plaintext hash");
        decryptedValues.set(identity, decrypted.targetBefore);
      } else {
        const payload = payloadsByPhase.get(phaseName)?.get(item.record.sourceIdentitySha256);
        if (decrypted?.payloadSha256 !== item.record.payloadSha256 || computeProductionImportPayloadHash(payload) !== item.record.payloadSha256 || canonical(decrypted?.payload) !== canonical(payload)) fail("PRODUCTION_IMPORT_CRYPTO_PLAINTEXT_MISMATCH", "decrypted quarantine payload differs from sealed payload");
        decryptedValues.set(identity, decrypted.payload);
      }
    }
    const supply = async (kind, input, value) => {
      const item = envelopes.get(`${kind}:${input.phaseName}:${input.record.sourceIdentitySha256}`);
      if (!item || item.record.sourceRowSha256 !== input.record.sourceRowSha256) fail("PRODUCTION_IMPORT_CRYPTO_ARTIFACT_INVALID", "runtime record differs from crypto envelope binding");
      const decrypted = decryptedValues.get(`${kind}:${input.phaseName}:${input.record.sourceIdentitySha256}`);
      if (kind === "before_image") {
        if (canonical(decrypted) !== canonical(value)) fail("PRODUCTION_IMPORT_CRYPTO_PLAINTEXT_MISMATCH", "decrypted before image differs from locked target");
      } else if (computeProductionImportPayloadHash(value) !== input.record.payloadSha256 || canonical(decrypted) !== canonical(value)) {
        fail("PRODUCTION_IMPORT_CRYPTO_PLAINTEXT_MISMATCH", "decrypted quarantine payload differs from sealed payload");
      }
      return { ciphertext: Buffer.from(item.envelope.ciphertext), nonce: Buffer.from(item.envelope.nonce), authenticationTag: Buffer.from(item.envelope.authenticationTag) };
    };
    return Object.freeze({
      encryptBeforeImage: input => supply("before_image", input, input.targetBefore),
      encryptQuarantine: input => supply("quarantine", input, input.payload),
      destroy: destroyKeys,
    });
  } catch (error) {
    destroyKeys();
    throw error;
  }
}

export function currentRepositorySha(repositoryRoot = ROOT) {
  if (typeof repositoryRoot !== "string" || !isAbsolute(repositoryRoot) || resolve(repositoryRoot) !== repositoryRoot) {
    fail("PRODUCTION_IMPORT_ENTRYPOINT_CANDIDATE_NOT_IMMUTABLE", "execution requires an absolute repository root");
  }
  try {
    const git = args => execFileSync("git", args, { cwd: repositoryRoot, stdio: ["ignore", "ignore", "ignore"] });
    git(["ls-files", "--error-unmatch", "--", ...PRODUCTION_IMPORT_EXECUTION_DEPENDENCY_PATHS]);
    git(["diff", "--quiet", "--no-ext-diff", "--"]);
    git(["diff", "--cached", "--quiet", "--no-ext-diff", "--"]);
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch (error) {
    fail("PRODUCTION_IMPORT_ENTRYPOINT_CANDIDATE_NOT_IMMUTABLE", "execution requires tracked dependencies from a clean committed candidate", { cause: error });
  }
}

function stableFailure(error, mode) {
  const code = typeof error?.code === "string" && /^[A-Z][A-Z0-9_]{2,95}$/u.test(error.code) ? error.code : "PRODUCTION_IMPORT_ENTRYPOINT_FAILED";
  return { status: mode === "execute" ? "FAILED" : "HOLD", mode, reasonCodes: [code], productionImport: "HOLD" };
}

function preparationSummary(plan, domains, activationReady) {
  return {
    status: activationReady ? "STRUCTURE_READY" : "HOLD",
    mode: "prepare",
    reasonCodes: activationReady ? [] : ["PRODUCTION_IMPORT_EXECUTION_CONTRACT_NOT_ACTIVATED"],
    sealedPlanSha256: plan.sealing.sealedPlanSha256,
    targetScopeSha256: plan.targetScope.scopeSha256,
    domains,
    recordCount: plan.phases.reduce((sum, phase) => sum + phase.records.length, 0) + (plan.t5Nonfile?.recordCount ?? 0),
    databaseConnected: false,
    writeAttempted: false,
    readOnlyTargetVerified: false,
    envelopeAuthenticated: false,
    productionImportExecuted: false,
    fullProductMigrationComplete: false,
    productionImport: "HOLD",
  };
}

export function parseProductionImportEntrypointArgs(argv) {
  const args = argv[0] === "--" ? argv.slice(1) : argv;
  let execute = false;
  let configPath;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--execute") {
      if (execute) fail("PRODUCTION_IMPORT_ENTRYPOINT_ARGUMENT_INVALID", "--execute duplicated");
      execute = true;
    } else if (argument === "--config") {
      if (configPath || !args[index + 1]) fail("PRODUCTION_IMPORT_ENTRYPOINT_ARGUMENT_INVALID", "--config requires one path");
      configPath = resolve(args[++index]);
    } else fail("PRODUCTION_IMPORT_ENTRYPOINT_ARGUMENT_INVALID", "unknown argument");
  }
  if (!configPath) fail("PRODUCTION_IMPORT_ENTRYPOINT_ARGUMENT_INVALID", "--config is required");
  return { configPath, execute };
}

export async function runProductionImportEntrypoint(input, dependencies = {}) {
  const mode = input.execute ? "execute" : "prepare";
  const contract = dependencies.contract ?? DEFAULT_PRODUCTION_IMPORT_EXECUTION_CONTRACT;
  const now = dependencies.now ?? new Date();
  const readBudget = { bytesRead: 0, maximumBytes: MAX_TOTAL_PRIVATE_ARTIFACT_BYTES };
  const configBytes = readBoundedPrivateArtifactBytes(resolve(input.configPath), "entrypoint config", MAX_CONFIG_BYTES, readBudget);
  const config = validateConfig(parseJson(configBytes, "PRODUCTION_IMPORT_ENTRYPOINT_CONFIG_INVALID", "entrypoint config"));
  const planArtifact = loadArtifact(config.artifacts.sealedPlan, "sealed plan", MAX_CONTROL_ARTIFACT_BYTES, { json: true, readBudget });
  const validatePlan = dependencies.validatePlan ?? validateSealedProductionImportPlan;
  const plan = validatePlan(planArtifact.value, { contract, now });
  const domains = validateRequestedDomains(config, plan);
  let activationReady = true;
  try { (dependencies.assertActivated ?? assertProductionImportExecutionActivated)(plan, contract); }
  catch (error) {
    if (error?.code !== "PRODUCTION_IMPORT_EXECUTION_UNAVAILABLE") throw error;
    activationReady = false;
  }
  if (input.execute && !activationReady) fail("PRODUCTION_IMPORT_EXECUTION_UNAVAILABLE", "repository execution contract remains HOLD");
  if (input.execute && (config.executionIntent !== EXECUTION_INTENT || !config.execution)) fail("PRODUCTION_IMPORT_ENTRYPOINT_EXECUTION_NOT_AUTHORIZED", "explicit one-time execution config is required");
  // Inspect every remaining private artifact and its aggregate size before any
  // large payload, credential, envelope, or key file is read.
  assertArtifactBudget(config, input.execute, readBudget.bytesRead);
  let currentCodeSha;
  let runtimeEvidence;
  let binding;
  if (input.execute) {
    currentCodeSha = (dependencies.currentCodeSha ?? currentRepositorySha)();
    runtimeEvidence = readRuntimeEvidence(config.execution.runtimeEvidence, plan, currentCodeSha, now, readBudget);
    binding = readDatabaseBinding(config.execution.databaseBinding, plan, readBudget);
  }
  const payloadBundles = validatePayloadBundles(config, plan, readBudget);
  const optional = validateOptionalArtifacts(config, plan, readBudget);
  if (!input.execute) return preparationSummary(plan, domains, activationReady);

  // The provider validates the private envelope before any database connection.
  const loadCryptoProviderModule = dependencies.loadCryptoProviderModule ?? (() => import("./production-import-crypto-provider.mjs"));
  const cryptoModule = await loadCryptoProviderModule();
  if (typeof cryptoModule?.decryptProductionImportEnvelope !== "function") fail("PRODUCTION_IMPORT_CRYPTO_PROVIDER_UNAVAILABLE", "reviewed production crypto provider is unavailable");
  const cryptoEnvelope = loadArtifact(config.execution.cryptoEnvelope, "crypto envelope", MAX_PAYLOAD_ARTIFACT_BYTES, { json: true, readBudget }).value;
  const cryptoProvider = await createProductionImportArtifactCryptoProvider({ envelopeArtifact: cryptoEnvelope, keyFiles: config.execution.cryptoKeyFiles, plan, payloadBundles, decryptEnvelope: cryptoModule.decryptProductionImportEnvelope, readBudget });
  try {
    const credentials = readPostgresCredentials(config.execution.postgresCredentials, binding, readBudget);
    const loadPg = dependencies.loadPg ?? (() => import("pg"));
    const pgModule = await loadPg();
    const Pool = pgModule?.default?.Pool ?? pgModule?.Pool;
    if (typeof Pool !== "function") fail("PRODUCTION_IMPORT_ENTRYPOINT_DATABASE_DRIVER_UNAVAILABLE", "pg Pool unavailable");
    const pool = new Pool({
      host: credentials.host,
      port: credentials.port,
      database: credentials.database,
      user: credentials.user,
      password: credentials.password,
      max: 1,
      connectionTimeoutMillis: 10_000,
      application_name: "jinhu_hr_prod_import:entrypoint",
      ssl: credentials.sslMode === "verify-full" ? { rejectUnauthorized: true, ca: credentials.sslCa } : false,
    });
    let adapter;
    try {
      const createAdapter = dependencies.createAdapter ?? createProductionImportPostgresAdapter;
      adapter = createAdapter({ pool, ownership: "owned", binding });
      await adapter.probeTarget({ targetIdentitySha256: plan.target.identitySha256, targetScope: plan.targetScope });
      const phaseWriters = (dependencies.createPhaseWriters ?? createProductionImportPhaseWriters)({ cryptoProvider });
      const execute = dependencies.executeImport ?? executeSealedProductionImport;
      const result = await execute(plan, {
        contract,
        now,
        currentCodeSha,
        mergedCodeSha: runtimeEvidence.mergedCodeSha,
        targetIdentitySha256: plan.target.identitySha256,
        targetScope: structuredClone(plan.targetScope),
        database: adapter,
        payloadBundles,
        phaseWriters,
        ...(optional.t5NonfilePrivateStage ? { t5NonfilePrivateStage: optional.t5NonfilePrivateStage } : {}),
        ...(optional.performanceRelations ? { performanceRelations: { ...optional.performanceRelations, readOnlyQuery: adapter.queryReadOnly.bind(adapter) } } : {}),
        ...(optional.performanceFactLoader ? { performanceFactLoader: { ...optional.performanceFactLoader, readOnlyQuery: adapter.queryReadOnly.bind(adapter) } } : {}),
      });
      if (result?.status !== "succeeded" || result.operationId !== plan.operationId
        || result.sealedPlanSha256 !== plan.sealing.sealedPlanSha256
        || JSON.stringify(result.phases) !== JSON.stringify(domains.map(domain => domain === "T5_NONFILE" ? "T5" : domain))) {
        fail("PRODUCTION_IMPORT_ENTRYPOINT_WRITER_RECEIPT_INVALID", "writer receipt differs from requested scope");
      }
      const receiptDomains = domains.filter(domain => domain.startsWith("PERFORMANCE_"));
      const databaseReceiptSha256ByDomain = {};
      if (receiptDomains.length || result.databaseReceiptSha256ByDomain !== undefined) {
        exactKeys(result.databaseReceiptSha256ByDomain, receiptDomains, [], "PRODUCTION_IMPORT_ENTRYPOINT_WRITER_RECEIPT_INVALID", "databaseReceiptSha256ByDomain");
        for (const domain of receiptDomains) {
          assertSha(result.databaseReceiptSha256ByDomain[domain], "PRODUCTION_IMPORT_ENTRYPOINT_WRITER_RECEIPT_INVALID", "database receipt hash");
          databaseReceiptSha256ByDomain[domain] = result.databaseReceiptSha256ByDomain[domain];
        }
      }
      const summaryIdentity = `${result.operationId}\0${result.sealedPlanSha256}\0${result.status}\0${result.phases.join(",")}`;
      return {
        status: "SUCCEEDED",
        mode: "execute",
        reasonCodes: [],
        receiptSha256: sha256(Buffer.from(`${summaryIdentity}${receiptDomains.length ? `\0${computeProductionImportPayloadHash(databaseReceiptSha256ByDomain)}` : ""}`, "utf8")),
        ...(receiptDomains.length ? { databaseReceiptSha256ByDomain } : {}),
        sealedPlanSha256: result.sealedPlanSha256,
        targetScopeSha256: plan.targetScope.scopeSha256,
        domains,
        readOnlyTargetVerified: true,
        envelopeAuthenticated: true,
        productionImportExecuted: true,
        fullProductMigrationComplete: false,
        productionImport: "EXECUTED_FOR_EXACT_SCOPE",
      };
    } finally {
      if (adapter) await adapter.close();
      else if (typeof pool.end === "function") await pool.end();
    }
  } finally {
    cryptoProvider.destroy();
  }
}

async function main() {
  let mode = "prepare";
  try {
    const args = parseProductionImportEntrypointArgs(process.argv.slice(2));
    mode = args.execute ? "execute" : "prepare";
    process.stdout.write(`${JSON.stringify(await runProductionImportEntrypoint(args))}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify(stableFailure(error, mode))}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
