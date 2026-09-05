#!/usr/bin/env node
/** Private prepare/finalize file owner; no signing, source extraction or execution. */
import { lstatSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { prepareProductionImportExceptions, finalizeProductionImportExceptions, ProductionImportExceptionPreparationError } from "./production-import-exception-preparation.mjs";
import { currentCandidateFreezeRepositorySha, readProductionImportPrivateBytes as read,
  productionImportPrivateDirectory as directory, productionImportCanonicalPath as canonicalPath,
  sameProductionImportPrivateFile as sameFile, parseProductionImportPrivateJson as parse,
  measureProductionImportPrivateJson as measure, emitProductionImportPrivateArtifacts as emit } from "./materialize-production-import-frozen-decisions.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url)).replace(/\/$/u, "");
const MIB = 1024 ** 2, LARGE = 384 * MIB, TOTAL = 1024 ** 3, phases = ["T0", "T1", "T2", "T3"];
const extraDependencies = ["scripts/hr-cutover/production-import-exception-preparation.mjs", "scripts/hr-cutover/materialize-production-import-exception-preparation.mjs", "scripts/hr-cutover/production-import-crypto-provider.mjs"];
const fail = code => { throw new ProductionImportExceptionPreparationError(`EXCEPTION_PREPARATION_${code}`); };
function exact(value, keys) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).sort().join("|") !== [...keys].sort().join("|")) fail("CONFIG_INVALID");
}
export async function materializeProductionImportExceptionPreparation(configPath, {
  currentHead = () => currentCandidateFreezeRepositorySha(ROOT, extraDependencies),
  maximumReadBytes = TOTAL, maximumOutputBytes = LARGE, maximumTotalOutputBytes = TOTAL,
} = {}) {
  let key;
  try {
    for (const [value, cap] of [[maximumReadBytes, TOTAL], [maximumOutputBytes, LARGE], [maximumTotalOutputBytes, TOTAL]]) {
      if (!Number.isSafeInteger(value) || value < 1 || value > cap) fail("BUDGET_INVALID");
    }
    const budget = { bytes: 0, maximum: maximumReadBytes }, snapshots = [];
    const load = (path, limit) => {
      const parts = [], result = read(path, limit, budget, part => parts.push(Buffer.from(part)));
      snapshots.push({ path, stat: result.stat });
      return { ...result, content: Buffer.concat(parts) };
    };
    const configRead = load(configPath, MIB), config = parse(configRead.content);
    exact(config, ["formatVersion", "mode", "triple", "operationId", "keyReferenceSha256", "artifacts", "outputDir"]);
    if (config.formatVersion !== 1 || !["prepare", "finalize"].includes(config.mode)) fail("CONFIG_INVALID");
    if (config.triple?.codeSha !== currentHead()) fail("CURRENT_CODE_REQUIRED");
    const final = config.mode === "finalize";
    exact(config.artifacts, ["phases", "candidates", "targetInventory", "targetScope", "choices", "keyFile", ...(final ? ["prepared", "envelopes", "attestations", "reviewerKeys"] : [])]);
    exact(config.artifacts.phases, phases); exact(config.artifacts.candidates, phases);
    exact(config.artifacts.keyFile, ["path", "sha256"]);
    const outputStat = directory(config.outputDir);
    if (readdirSync(config.outputDir).length) fail("OUTPUT_NOT_EMPTY");
    const artifact = (descriptor, limit) => {
      exact(descriptor, ["path", "sha256"]);
      const result = load(descriptor.path, limit);
      if (result.sha256 !== descriptor.sha256) fail("ARTIFACT_HASH_MISMATCH");
      return { ...descriptor, bytes: result.content };
    };
    const input = { freezeInput: { expectedTriple: config.triple,
      phaseArtifacts: Object.fromEntries(phases.map(phase => [phase, artifact(config.artifacts.phases[phase], LARGE)])),
      candidateArtifacts: Object.fromEntries(phases.map(phase => [phase, artifact(config.artifacts.candidates[phase], LARGE)])),
      targetInventoryArtifact: artifact(config.artifacts.targetInventory, 32 * MIB), targetScopeArtifact: artifact(config.artifacts.targetScope, 32 * MIB), reviewedDecisionsArtifact: null },
      choicesArtifact: artifact(config.artifacts.choices, 32 * MIB), operationId: config.operationId, keyReferenceSha256: config.keyReferenceSha256 };
    if (final) Object.assign(input, { preparedArtifact: artifact(config.artifacts.prepared, 32 * MIB), envelopesArtifact: artifact(config.artifacts.envelopes, 32 * MIB),
      attestationsArtifact: artifact(config.artifacts.attestations, 32 * MIB), reviewersArtifact: artifact(config.artifacts.reviewerKeys, 32 * MIB) });
    // Load the supplied key lazily, only after document validation needs crypto.
    const resolveKey = async ({ keyReferenceSha256 }) => {
      if (keyReferenceSha256 !== config.keyReferenceSha256) fail("KEY_REFERENCE_INVALID");
      if (!key) {
        key = Buffer.alloc(32); let offset = 0;
        const loaded = read(config.artifacts.keyFile.path, 32, budget, part => { part.copy(key, offset); offset += part.length; });
        if (offset !== 32 || loaded.sha256 !== config.artifacts.keyFile.sha256) fail("KEY_FILE_INVALID");
        snapshots.push({ path: config.artifacts.keyFile.path, stat: loaded.stat });
      }
      return key;
    };
    const result = await (final ? finalizeProductionImportExceptions : prepareProductionImportExceptions)(input, { resolveKey });
    const artifacts = final ? { "reviewed-candidate-resolutions.json": result.reviewed }
      : { "unsigned-exception-requests.json": result.prepared, "crypto-envelopes.json": result.envelopes };
    const descriptors = Object.fromEntries(Object.entries(artifacts).map(([file, value]) => [file, measure(value, maximumOutputBytes)]));
    if (!final && descriptors["crypto-envelopes.json"].sha256 !== result.prepared.envelopeArtifactSha256) fail("OUTPUT_HASH_MISMATCH");
    const receipt = { formatVersion: 1, artifactKind: "yuzhou_hr_production_import_exception_preparation_receipt", materializationStatus: "COMPLETE",
      mode: config.mode, ...result.summary, triple: config.triple, configArtifactSha256: configRead.sha256, artifacts: descriptors, executionReachable: false };
    const total = Object.values(descriptors).reduce((sum, value) => sum + value.bytes, measure(receipt, Math.min(32 * MIB, maximumOutputBytes)).bytes);
    if (total > maximumTotalOutputBytes) fail("OUTPUT_BUDGET_EXCEEDED");
    if (config.triple.codeSha !== currentHead()) fail("CURRENT_CODE_REQUIRED");
    for (const item of snapshots) { canonicalPath(item.path); if (!sameFile(item.stat, lstatSync(item.path))) fail("FILE_CHANGED"); }
    directory(config.outputDir, outputStat);
    emit(config.outputDir, artifacts, receipt, descriptors, maximumOutputBytes, "exception-preparation-receipt.json");
    return { ...result.summary, artifacts: descriptors };
  } catch (error) {
    if (error instanceof ProductionImportExceptionPreparationError) throw error;
    fail("PRIVATE_IO_OR_VALIDATION_FAILED");
  } finally { key?.fill(0); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 2 || args[0] !== "--config") fail("ARGUMENT_INVALID");
    process.stdout.write(JSON.stringify(await materializeProductionImportExceptionPreparation(args[1])) + "\n");
  } catch (error) {
    process.stderr.write(`${error instanceof ProductionImportExceptionPreparationError ? error.code : "EXCEPTION_PREPARATION_FAILED"}\n`);
    process.exitCode = 1;
  }
}
