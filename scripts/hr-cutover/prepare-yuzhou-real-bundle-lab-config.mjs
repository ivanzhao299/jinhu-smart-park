#!/usr/bin/env node
/* global Buffer, process, URL */
import { lstatSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { computeYuzhouLabExecutionBinding, validateYuzhouLabConfig } from "./run-yuzhou-real-bundle-lab.mjs";
import { prepareYuzhouRealBundleLabArtifacts } from "./yuzhou-real-bundle-lab-artifacts.mjs";
import { createYuzhouRealBundleLabPgProbes } from "./yuzhou-real-bundle-lab-pg-probes.mjs";
import { currentCandidateFreezeRepositorySha, readProductionImportPrivateBytes as read,
  productionImportPrivateDirectory as directory, productionImportCanonicalPath as canonicalPath,
  sameProductionImportPrivateFile as sameFile, parseProductionImportPrivateJson as parse,
  measureProductionImportPrivateJson as measure, emitProductionImportPrivateArtifacts as emit } from "./materialize-production-import-frozen-decisions.mjs";
const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url))), LIMIT = 65536;
const SELF = "scripts/hr-cutover/prepare-yuzhou-real-bundle-lab-config.mjs";
const fail = code => { const e = new Error(`LAB_CONFIG_PREPARATION_${code}`); e.code = e.message; throw e; };
const exact = (v, keys) => { if (!v || typeof v !== "object" || Array.isArray(v) || Object.keys(v).sort().join("|") !== [...keys].sort().join("|")) fail("INPUT_INVALID"); };
function load(path, expectedHash) {
  const parts = [], result = read(path, LIMIT, { bytes: 0, maximum: LIMIT }, p => parts.push(Buffer.from(p)));
  const bytes = Buffer.concat(parts); parts.forEach(p => p.fill(0));
  try { if (expectedHash && result.sha256 !== expectedHash) fail("HASH_MISMATCH"); return { value: parse(bytes), ...result }; }
  finally { bytes.fill(0); }
}
function unused(root, runId, expected) {
  const stat = directory(root, expected);
  for (const name of ["exclusive-owner", `checkpoint-${runId}.json`, `http-${runId}.json`, `final-${runId}.json`]) {
    try { lstatSync(join(root, name)); fail("STATE_OCCUPIED"); } catch (e) { if (e.code !== "ENOENT") throw e; }
  }
  return stat;
}

/** Preparation only. Preserves ciphertext identity; never opens keys/DB/Docker.
 * Optional functions are synthetic test seams, unavailable through the CLI. */
export async function prepareYuzhouRealBundleLabConfig(input, {
  currentHead = () => currentCandidateFreezeRepositorySha(ROOT, [SELF]),
  executionBinding = () => computeYuzhouLabExecutionBinding(ROOT),
} = {}) {
  try {
    const baselineCountsOverridden = !!input && Object.hasOwn(input, "baselineCounts");
    exact(input, ["existingConfig", "runId", "targetDatabase", "outputDirectory", ...(baselineCountsOverridden ? ["baselineCounts"] : []), ...(Object.hasOwn(input, "resourceDescriptor") ? ["resourceDescriptor"] : [])]);
    exact(input.existingConfig, ["path", "sha256"]);
    if (!/^[a-f0-9]{64}$/u.test(input.existingConfig.sha256 ?? "") || !/^[A-Za-z0-9][A-Za-z0-9._-]{5,59}$/u.test(input.runId ?? "") ||
      !/^jinhu_hr_migration_lab_[a-z0-9_]{6,}$/u.test(input.targetDatabase ?? "") || input.targetDatabase.length > 63) fail("INPUT_INVALID");
    const original = load(input.existingConfig.path, input.existingConfig.sha256), c = original.value;
    if (input.runId === c.artifacts?.runId || input.targetDatabase === c.artifacts?.target?.database) fail("IDENTITY_REUSED");
    const outStat = directory(input.outputDirectory); if (readdirSync(input.outputDirectory).length) fail("OUTPUT_NOT_EMPTY");
    const stateStat = unused(c.stateRoot, input.runId), preparerCodeSha = currentHead();
    if (!/^[a-f0-9]{40}$/u.test(preparerCodeSha ?? "")) fail("CODE_INVALID");
    const actual = await executionBinding();
    c.dependencies = actual.dependencies; c.runtimeTreeSha256 = actual.runtimeTreeSha256;
    c.artifacts.binding.executorSha256 = actual.executorSha256;
    c.artifacts.runId = input.runId; c.artifacts.target.database = input.targetDatabase;
    if (Object.hasOwn(input, "resourceDescriptor")) {
      c.resourceDescriptor = input.resourceDescriptor;
      for (const key of ["container", "containerId", "imageId", "port"]) c[key] = input.resourceDescriptor?.[key];
    }
    // Validate the entire unchanged remainder, including exact key/envelope descriptors.
    validateYuzhouLabConfig(c);
    const verifyProbeConfig = () => createYuzhouRealBundleLabPgProbes({ expectedDatabase: c.artifacts.target.database, targetScope: c.artifacts.targetScope,
      runId: c.artifacts.runId, codeSha: c.artifacts.binding.codeSha, sourceSnapshotHash: c.artifacts.binding.sourceSnapshotHash,
      baselineCounts: c.baselineCounts, phaseCounts: c.phaseCounts, getHttpFixtureIds: () => ({ userIds: [], roleIds: [] }) });
    verifyProbeConfig();
    const originalBaselineCounts = { ...c.baselineCounts };
    if (baselineCountsOverridden) {
      exact(input.baselineCounts, Object.keys(originalBaselineCounts));
      c.baselineCounts = { ...input.baselineCounts }; verifyProbeConfig();
    }
    const prepared = await prepareYuzhouRealBundleLabArtifacts(c.artifacts);
    if (prepared.status !== "ARTIFACTS_VERIFIED" || prepared.productionImport !== "HOLD") fail("ARTIFACTS_INVALID");
    const rechecked = await executionBinding();
    if (JSON.stringify(rechecked) !== JSON.stringify(actual) || currentHead() !== preparerCodeSha) fail("CODE_CHANGED");
    canonicalPath(input.existingConfig.path);
    if (!sameFile(original.stat, lstatSync(input.existingConfig.path))) fail("INPUT_CHANGED");
    unused(c.stateRoot, input.runId, stateStat); directory(input.outputDirectory, outStat);
    const artifacts = { "lab-config.json": c }, descriptors = { "lab-config.json": measure(c, LIMIT) };
    const receipt = { formatVersion: 1, status: "CONFIG_PREPARED", originalConfigSha256: original.sha256,
      configSha256: descriptors["lab-config.json"].sha256, manifestSha256: prepared.manifestSha256, preparerCodeSha,
      preparedTriple: c.artifacts.expectedTriple, executorSha256: actual.executorSha256, runtimeTreeSha256: actual.runtimeTreeSha256,
      dependencyCount: Object.keys(actual.dependencies).length, counts: c.artifacts.expectedCounts,
      baselineCountsOverridden, originalBaselineCounts, baselineCounts: c.baselineCounts,
      resourceDescriptorSha256: c.resourceDescriptor ? measure(c.resourceDescriptor, LIMIT).sha256 : null,
      artifacts: descriptors, sourceArtifactsReused: true, cryptoDescriptorsReused: true, keyContentsRead: false,
      databaseContacted: false, databaseWrites: 0, labVerified: false, formalABVerified: false, productionImport: "HOLD" };
    emit(input.outputDirectory, artifacts, receipt, descriptors, LIMIT, "lab-config-preparation-receipt.json");
    return receipt;
  } catch (e) { if (/^LAB_CONFIG_PREPARATION_[A-Z_]+$/u.test(e?.code ?? "")) throw e; fail("FAILED"); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 6 || process.argv[2] !== "--request" || process.argv[4] !== "--request-sha256" || !/^[a-f0-9]{64}$/u.test(process.argv[5])) fail("USAGE");
    const request = load(process.argv[3], process.argv[5]);
    process.stdout.write(JSON.stringify(await prepareYuzhouRealBundleLabConfig(request.value)) + "\n");
  } catch (e) { process.stderr.write(`${e.code ?? "LAB_CONFIG_PREPARATION_FAILED"}\n`); process.exitCode = 1; }
}
