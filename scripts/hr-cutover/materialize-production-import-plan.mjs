#!/usr/bin/env node
/* global Buffer, process, URL */
/** Offline T0-T3 draft -> seal producer. Input provenance is not signer authority. */
import { lstatSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildProductionImportPlanPhase } from "./production-import-plan-phase-builder.mjs";
import { stableProductionImportCanonicalJson as canonical } from "./production-import-target-model.mjs";
import { DEFAULT_PRODUCTION_IMPORT_EXECUTION_CONTRACT, assertProductionImportExecutionActivated,
  computeProductionImportPayloadHash as hash, computeSealedProductionImportPlanHash,
  computeProductionImportTargetScopeHash, validateSealedProductionImportPlan,
  validateProductionImportPayloadBundle } from "./production-import-sealed-plan-lib.mjs";
import { currentCandidateFreezeRepositorySha, readProductionImportPrivateBytes as read,
  productionImportPrivateDirectory as directory, productionImportCanonicalPath as canonicalPath,
  sameProductionImportPrivateFile as sameFile, parseProductionImportPrivateJson as parse,
  measureProductionImportPrivateJson as measure, emitProductionImportPrivateArtifacts as emit } from "./materialize-production-import-frozen-decisions.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url)).replace(/\/$/u, "");
const PHASES = ["T0", "T1", "T2", "T3"], MIB = 1024 ** 2, MAX = 2_000_000_000;
const dependencies = ["scripts/hr-cutover/materialize-production-import-plan.mjs", "scripts/hr-cutover/production-import-plan-phase-builder.mjs", "scripts/hr-cutover/production-import-phase-state.mjs"];
const fail = code => { const e = new Error(`PRODUCTION_IMPORT_PLAN_MATERIALIZER_${code}`); e.code = e.message; throw e; };
const same = (a, b) => canonical(a) === canonical(b);
function exact(v, keys) {
  if (!v || typeof v !== "object" || Array.isArray(v) || Object.keys(v).sort().join("|") !== [...keys].sort().join("|")) fail("INPUT_INVALID");
}
function fresh(observedAt, expiresAt, now) {
  const a = Date.parse(observedAt), b = Date.parse(expiresAt), n = new Date(now).getTime();
  if (![a, b, n].every(Number.isFinite) || a > n || n >= b || a >= b) fail("EVIDENCE_STALE");
}

export function materializeProductionImportPlan(configPath, {
  currentHead = () => currentCandidateFreezeRepositorySha(ROOT, dependencies), now = new Date(),
  contract = DEFAULT_PRODUCTION_IMPORT_EXECUTION_CONTRACT,
  maximumReadBytes = MAX, maximumOutputBytes = 384 * MIB,
} = {}) {
  try {
    if (!Number.isSafeInteger(maximumReadBytes) || maximumReadBytes < 1 || maximumReadBytes > MAX ||
      !Number.isSafeInteger(maximumOutputBytes) || maximumOutputBytes < 1 || maximumOutputBytes > 384 * MIB) fail("BUDGET_INVALID");
    const budget = { bytes: 0, maximum: maximumReadBytes }, snapshots = [], inputHashes = {};
    const load = (path, limit) => {
      const parts = [], result = read(path, limit, budget, part => parts.push(Buffer.from(part)));
      snapshots.push({ path, stat: result.stat });
      const bytes = Buffer.concat(parts); parts.forEach(part => part.fill(0));
      try { return { value: parse(bytes), sha256: result.sha256 }; } finally { bytes.fill(0); }
    };
    const configArtifact = load(configPath, MIB), config = configArtifact.value;
    exact(config, ["formatVersion", "mode", "triple", "artifacts", "outputDir"]);
    if (config.formatVersion !== 1 || !["draft", "seal"].includes(config.mode) || config.triple?.codeSha !== currentHead()) fail("CODE_MISMATCH");
    exact(config.triple, ["codeSha", "sourceSnapshotHash", "mappingContractHash"]);
    if (!/^[a-f0-9]{40}$/u.test(config.triple.codeSha) || ![config.triple.sourceSnapshotHash, config.triple.mappingContractHash].every(v => /^[a-f0-9]{64}$/u.test(v))) fail("INPUT_INVALID");
    exact(config.artifacts, ["metadata", "runtime", "baseline", "phases", ...(config.mode === "seal" ? ["draft", "authorization"] : [])]);
    exact(config.artifacts.phases, PHASES);
    const outputStat = directory(config.outputDir);
    if (readdirSync(config.outputDir).length) fail("OUTPUT_NOT_EMPTY");
    const artifact = (name, descriptor, limit = 384 * MIB) => {
      exact(descriptor, ["path", "sha256"]);
      if (!/^[a-f0-9]{64}$/u.test(descriptor.sha256)) fail("HASH_INVALID");
      const loaded = load(descriptor.path, limit);
      if (loaded.sha256 !== descriptor.sha256) fail("INPUT_HASH_MISMATCH");
      inputHashes[name] = loaded.sha256;
      return loaded.value;
    };
    const metadata = artifact("metadata", config.artifacts.metadata, 16 * MIB);
    exact(metadata, ["formatVersion", "artifactKind", "operationId", "triple", "target", "targetScope", "window", "finalRehearsalPair", "productionImport"]);
    if (metadata.formatVersion !== 1 || metadata.artifactKind !== "yuzhou_hr_production_import_plan_metadata" || metadata.productionImport !== "HOLD" || !same(metadata.triple, config.triple)) fail("METADATA_INVALID");
    const { operationId, triple, target, targetScope, window, finalRehearsalPair } = metadata;
    if (targetScope?.scopeSha256 !== computeProductionImportTargetScopeHash(targetScope) || targetScope.kind !== undefined) fail("SCOPE_INVALID");
    assertProductionImportExecutionActivated({ target, targetScope }, contract);
    fresh(window.startsAt, window.endsAt, now);
    exact(finalRehearsalPair, ["artifactSha256", "triple", "rehearsals"]);
    if (!same(finalRehearsalPair.triple, triple) || !Array.isArray(finalRehearsalPair.rehearsals) || finalRehearsalPair.rehearsals.map(r => r.rehearsal).join("") !== "AB" ||
      finalRehearsalPair.rehearsals.some(r => r.residualCount !== 0) || new Set(finalRehearsalPair.rehearsals.map(r => r.manifestSha256)).size !== 2 ||
      new Set(finalRehearsalPair.rehearsals.map(r => r.cleanupAuditSha256)).size !== 2) fail("AB_INVALID");
    const runtime = artifact("runtime", config.artifacts.runtime, MIB);
    exact(runtime, ["formatVersion", "artifactKind", "currentCodeSha", "mergedCodeSha", "runtimeCodeSha", "targetIdentitySha256", "targetScopeSha256", "observedAt", "expiresAt"]);
    if (runtime.formatVersion !== 1 || runtime.artifactKind !== "yuzhou_hr_production_import_runtime_release_receipt" ||
      ![runtime.currentCodeSha, runtime.mergedCodeSha, runtime.runtimeCodeSha].every(c => c === triple.codeSha) ||
      runtime.targetIdentitySha256 !== target.identitySha256 || runtime.targetScopeSha256 !== targetScope.scopeSha256) fail("RUNTIME_INVALID");
    fresh(runtime.observedAt, runtime.expiresAt, now);
    const baseline = artifact("baseline", config.artifacts.baseline);
    exact(baseline, ["formatVersion", "artifactKind", "triple", "targetIdentitySha256", "targetScope", "observedAt", "expiresAt", "phases", "productionImport"]);
    if (baseline.formatVersion !== 1 || baseline.artifactKind !== "yuzhou_hr_production_import_touched_baseline" || baseline.productionImport !== "HOLD" ||
      !same(baseline.triple, triple) || baseline.targetIdentitySha256 !== target.identitySha256 || !same(baseline.targetScope, targetScope)) fail("BASELINE_INVALID");
    fresh(baseline.observedAt, baseline.expiresAt, now); exact(baseline.phases, PHASES);
    const phases = [], dependencyTargets = [];
    for (const name of PHASES) {
      exact(config.artifacts.phases[name], ["payload", "records"]);
      const phase = artifact(`${name}.records`, config.artifacts.phases[name].records);
      const payload = artifact(`${name}.payload`, config.artifacts.phases[name].payload, MAX);
      if (phase.phase !== name || phase.ordinal !== PHASES.indexOf(name)) fail("PHASE_INVALID");
      validateProductionImportPayloadBundle(payload, { phase: name, targetScope, sourceBatchManifestSha256: phase.sourceBatchManifestSha256 });
      const base = baseline.phases[name]; exact(base, ["rows", "absent"]);
      if (!Array.isArray(base.absent)) fail("BASELINE_INVALID");
      const absence = phase.records.filter(r => r.disposition === "insert").map(r => `${r.targetTable}:${r.targetId}`).sort();
      const observed = base.absent.map(r => { exact(r, ["targetTable", "targetId"]); return `${r.targetTable}:${r.targetId}`; }).sort();
      if (!same(absence, observed)) fail("BASELINE_ABSENCE_MISMATCH");
      const built = buildProductionImportPlanPhase({ phase, payloadBundle: payload, targetScope, baseline: { targetScope, rows: base.rows }, dependencyTargets });
      // The executor checks file bytes, NOT canonical object bytes.
      built.payloadBundleArtifactSha256 = inputHashes[`${name}.payload`];
      phases.push(built);
      for (const r of phase.records) dependencyTargets.push({ phase: name, sourceIdentitySha256: r.sourceIdentitySha256, plannedTargetTable: r.plannedTargetTable, targetTable: r.targetTable, targetId: r.targetId, disposition: r.disposition });
    }
    const runtimeReleaseEvidence = { artifactSha256: inputHashes.runtime, observedAt: runtime.observedAt, expiresAt: runtime.expiresAt };
    const unsignedPlan = { formatVersion: 2, planKind: "yuzhou_hr_production_import_sealed_execution_plan", operationId, intent: "production_import", status: "SEALED",
      triple, target, targetScope, window, finalRehearsalPair, phaseOrder: PHASES, phases,
      rollback: { order: [...PHASES].reverse(), insert: "delete_operation_owned_target", merge: "encrypted_before_image_cas_restore", quarantine: "no_target_write", skipApproved: "no_target_write", residualCount: 0, canonicalHash: "EXACT" }, runtimeReleaseEvidence, productionImport: "HOLD" };
    const manifest = { formatVersion: 1, artifactKind: "yuzhou_hr_production_import_unsigned_manifest", inputHashes: { ...inputHashes }, unsignedPlanSha256: hash(unsignedPlan), productionImport: "HOLD" };
    const manifestSha256 = hash(manifest);
    const authorizationBinding = { triple, targetIdentitySha256: target.identitySha256, targetScopeSha256: targetScope.scopeSha256,
      finalRehearsalPairSha256: finalRehearsalPair.artifactSha256, manifestSha256, windowStartsAt: window.startsAt, windowEndsAt: window.endsAt,
      runtimeReleaseEvidenceBindingSha256: hash(runtimeReleaseEvidence) };
    const draft = { formatVersion: 1, artifactKind: "yuzhou_hr_production_import_plan_draft", unsignedPlan, manifest, manifestSha256, authorizationBinding, productionImport: "HOLD" };
    let artifacts;
    if (config.mode === "draft") artifacts = { "plan-draft.json": draft };
    else {
      const saved = artifact("draft", config.artifacts.draft);
      // Hash the manifest before loading extra seal inputs: no auth/manifest cycle.
      if (!same(saved, draft)) fail("DRAFT_MISMATCH");
      const authorization = artifact("authorization", config.artifacts.authorization, 16 * MIB);
      if (!same(authorization.binding, authorizationBinding)) fail("AUTH_BINDING_MISMATCH");
      const plan = { ...unsignedPlan, manifestSha256, authorization, sealing: { algorithm: "canonical-json-sha256-v1", sealedPlanSha256: "" } };
      plan.sealing.sealedPlanSha256 = computeSealedProductionImportPlanHash(plan);
      validateSealedProductionImportPlan(plan, { contract, now });
      artifacts = { "sealed-plan.json": plan };
    }
    if (triple.codeSha !== currentHead()) fail("CODE_MISMATCH");
    for (const item of snapshots) { canonicalPath(item.path); if (!sameFile(item.stat, lstatSync(item.path))) fail("INPUT_CHANGED"); }
    directory(config.outputDir, outputStat);
    const descriptors = Object.fromEntries(Object.entries(artifacts).map(([name, value]) => [name, measure(value, maximumOutputBytes)]));
    const receipt = { formatVersion: 1, status: config.mode === "draft" ? "DRAFT_MATERIALIZED" : "SEALED_PLAN_MATERIALIZED", configArtifactSha256: configArtifact.sha256,
      manifestSha256, triple, artifacts: descriptors, executionReachable: false, databaseStateVerified: false, signerAuthorityEstablished: false, productionImport: "HOLD" };
    measure(receipt, MIB);
    emit(config.outputDir, artifacts, receipt, descriptors, maximumOutputBytes, "plan-materialization-receipt.json");
    return receipt;
  } catch (e) {
    if (/^PRODUCTION_IMPORT_PLAN_MATERIALIZER_[A-Z_]+$/u.test(e?.code ?? "")) throw e;
    fail(/^PRODUCTION_IMPORT_[A-Z_]+$/u.test(e?.code ?? "") ? `VALIDATION_${e.code}` : "VALIDATION_FAILED");
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 4 || process.argv[2] !== "--config") fail("CONFIG_REQUIRED");
    process.stdout.write(JSON.stringify(materializeProductionImportPlan(process.argv[3])) + "\n");
  } catch (e) { process.stderr.write(`${/^PRODUCTION_IMPORT_PLAN_MATERIALIZER_[A-Z_]+$/u.test(e?.code ?? "") ? e.code : "PRODUCTION_IMPORT_PLAN_MATERIALIZER_FAILED"}\n`); process.exitCode = 1; }
}
