#!/usr/bin/env node
/**
 * Seals the four first-wave staging manifests to one verified, immutable
 * Yuzhou backup.  It deliberately writes only aggregate counts and hashes;
 * source rows never leave their private staging directories.
 */
import { createHash } from "node:crypto";
import {
  chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync,
} from "node:fs";
import { basename, isAbsolute, join, resolve } from "node:path";

import { sourceBackupFileHash, sourceRestoreReceiptFileHash, validateSourceRestoreReceipt } from "./hr-cutover/source-restore-receipt.mjs";

const SHA256 = /^[0-9a-f]{64}$/u;
const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{5,63}$/u;
const PHASES = Object.freeze(["T0", "T1", "T2", "T3"]);
const REQUIRED = Object.freeze({
  T0: ["departments", "employeeJobStates", "employees", "jobStateCodeMetadata", "jobStateCodes", "positions"],
  T1: ["employmentEventStates", "employmentEventTypes", "employmentEvents"],
  T2: ["dbo.compact", "dbo.compact.state", "dbo.compact_c", "dbo.compacttypecode"],
  T3: ["attendance", "insurance", "policies"],
});

export class ProductionSourceManifestError extends Error {
  constructor(code) { super(code); this.name = "ProductionSourceManifestError"; this.code = code; }
}

const fail = code => { throw new ProductionSourceManifestError(code); };
const mode = path => statSync(path).mode & 0o777;
const sha = value => createHash("sha256").update(value).digest("hex");
const canonical = value => Array.isArray(value)
  ? `[${value.map(canonical).join(",")}]`
  : value && typeof value === "object"
    ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`
    : JSON.stringify(value);

function exactKeys(value, expected, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expected].sort())) fail(code);
}

function privateFile(path) {
  try {
    const link = lstatSync(path), actual = statSync(path);
    return !link.isSymbolicLink() && actual.isFile() && actual.nlink === 1 && mode(path) === 0o600;
  } catch { return false; }
}

function privateDirectory(path) {
  try { return !lstatSync(path).isSymbolicLink() && statSync(path).isDirectory() && mode(path) === 0o700; }
  catch { return false; }
}

function readPrivateJson(path, code) {
  if (!privateFile(path)) fail(code);
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { fail(code); }
}

function verifyStage(phase, directory, binding) {
  if (!privateDirectory(directory)) fail("PRODUCTION_SOURCE_MANIFEST_STAGE_UNSAFE");
  const manifestPath = join(directory, "manifest.json");
  const manifestBytes = privateFile(manifestPath) ? readFileSync(manifestPath) : null;
  if (!manifestBytes) fail("PRODUCTION_SOURCE_MANIFEST_STAGE_UNSAFE");
  let manifest;
  try { manifest = JSON.parse(manifestBytes); } catch { fail("PRODUCTION_SOURCE_MANIFEST_STAGE_INVALID"); }
  if (!manifest || manifest.formatVersion !== 1 || !manifest.domains || typeof manifest.domains !== "object" || Array.isArray(manifest.domains)) fail("PRODUCTION_SOURCE_MANIFEST_STAGE_INVALID");
  if (manifest.productionImport !== undefined && manifest.productionImport !== "HOLD") fail("PRODUCTION_SOURCE_MANIFEST_STAGE_INVALID");
  if (manifest.sourceSnapshotSha256 !== undefined && manifest.sourceSnapshotSha256 !== binding.sourceSnapshotSha256) fail("PRODUCTION_SOURCE_MANIFEST_STAGE_BINDING_DRIFT");
  if (manifest.sourceRestoreReceiptSha256 !== undefined && manifest.sourceRestoreReceiptSha256 !== binding.sourceRestoreReceiptSha256) fail("PRODUCTION_SOURCE_MANIFEST_STAGE_BINDING_DRIFT");
  if (manifest.sourceCatalogSha256 !== undefined && manifest.sourceCatalogSha256 !== binding.sourceCatalogSha256) fail("PRODUCTION_SOURCE_MANIFEST_STAGE_BINDING_DRIFT");
  if (manifest.mappingContractSha256 !== undefined && manifest.mappingContractSha256 !== binding.mappingContractSha256) fail("PRODUCTION_SOURCE_MANIFEST_STAGE_BINDING_DRIFT");
  if (JSON.stringify(Object.keys(manifest.domains).sort()) !== JSON.stringify(REQUIRED[phase])) fail("PRODUCTION_SOURCE_MANIFEST_STAGE_INVALID");
  const domains = {};
  for (const name of REQUIRED[phase]) {
    const item = manifest.domains[name];
    if (!item || !Number.isSafeInteger(item.rows) || item.rows < 0 || typeof item.file !== "string" || basename(item.file) !== item.file || !SHA256.test(item.fileSha256 ?? "")) fail("PRODUCTION_SOURCE_MANIFEST_STAGE_INVALID");
    const sourceFile = join(directory, item.file);
    if (!privateFile(sourceFile) || sha(readFileSync(sourceFile)) !== item.fileSha256) fail("PRODUCTION_SOURCE_MANIFEST_STAGE_CONTENT_DRIFT");
    domains[name] = { rows: item.rows, fileSha256: item.fileSha256 };
  }
  return { stageManifestSha256: sha(manifestBytes), domains };
}

/**
 * Validates the portable, hash-only receipt after it leaves the data-custody
 * machine. It deliberately has no filesystem inputs: raw backup and staging
 * files are rechecked only by prepareProductionSourceManifest on that machine.
 */
export function verifyProductionSourceManifest(input) {
  let manifest = input;
  try { if (typeof input === "string") manifest = JSON.parse(input); } catch { fail("PRODUCTION_SOURCE_MANIFEST_ATTESTATION_INVALID"); }
  exactKeys(manifest, ["formatVersion", "artifactKind", "sourceReadOnly", "sourceSnapshotSha256", "sourceRestoreReceiptSha256", "sourceCatalogSha256", "mappingContractSha256", "phases", "productionImport"], "PRODUCTION_SOURCE_MANIFEST_ATTESTATION_INVALID");
  if (manifest.formatVersion !== 1 || manifest.artifactKind !== "yuzhou_hr_production_source_manifest" || manifest.sourceReadOnly !== true || manifest.productionImport !== "HOLD") fail("PRODUCTION_SOURCE_MANIFEST_ATTESTATION_INVALID");
  for (const field of ["sourceSnapshotSha256", "sourceRestoreReceiptSha256", "sourceCatalogSha256", "mappingContractSha256"]) if (!SHA256.test(manifest[field] ?? "")) fail("PRODUCTION_SOURCE_MANIFEST_ATTESTATION_INVALID");
  exactKeys(manifest.phases, PHASES, "PRODUCTION_SOURCE_MANIFEST_ATTESTATION_INVALID");
  for (const phase of PHASES) {
    const stage = manifest.phases[phase];
    exactKeys(stage, ["stageManifestSha256", "domains"], "PRODUCTION_SOURCE_MANIFEST_ATTESTATION_INVALID");
    if (!SHA256.test(stage.stageManifestSha256 ?? "")) fail("PRODUCTION_SOURCE_MANIFEST_ATTESTATION_INVALID");
    exactKeys(stage.domains, REQUIRED[phase], "PRODUCTION_SOURCE_MANIFEST_ATTESTATION_INVALID");
    for (const name of REQUIRED[phase]) {
      const domain = stage.domains[name];
      exactKeys(domain, ["rows", "fileSha256"], "PRODUCTION_SOURCE_MANIFEST_ATTESTATION_INVALID");
      if (!Number.isSafeInteger(domain.rows) || domain.rows < 0 || !SHA256.test(domain.fileSha256 ?? "")) fail("PRODUCTION_SOURCE_MANIFEST_ATTESTATION_INVALID");
    }
  }
  return Object.freeze({ manifestSha256: sha(canonical(manifest)), phaseCount: PHASES.length, productionImport: "HOLD" });
}

export function parseProductionSourceManifestArgs(argv) {
  const input = argv[0] === "--" ? argv.slice(1) : argv;
  if (input.length === 2 && input[0] === "--config") {
    const configPath = input[1];
    if (!configPath || !isAbsolute(configPath) || !privateFile(configPath)) fail("PRODUCTION_SOURCE_MANIFEST_CONFIG_UNSAFE");
    let config;
    try { config = JSON.parse(readFileSync(configPath, "utf8")); } catch { fail("PRODUCTION_SOURCE_MANIFEST_CONFIG_INVALID"); }
    if (!config || typeof config !== "object" || Array.isArray(config)) fail("PRODUCTION_SOURCE_MANIFEST_CONFIG_INVALID");
    const expected = ["backupPath", "receiptPath", "mappingContractSha256", "stages", "outputRoot", "runId"];
    if (JSON.stringify(Object.keys(config).sort()) !== JSON.stringify(expected.sort()) || !config.stages || typeof config.stages !== "object" || Array.isArray(config.stages) || JSON.stringify(Object.keys(config.stages).sort()) !== JSON.stringify(PHASES)) fail("PRODUCTION_SOURCE_MANIFEST_CONFIG_INVALID");
    const args = [
      "--backup", config.backupPath,
      "--receipt", config.receiptPath,
      "--mapping-contract", config.mappingContractSha256,
      "--t0", config.stages.T0,
      "--t1", config.stages.T1,
      "--t2", config.stages.T2,
      "--t3", config.stages.T3,
      "--output-root", config.outputRoot,
      "--run-id", config.runId,
    ];
    return parseProductionSourceManifestArgs(args);
  }
  const known = new Set(["--backup", "--receipt", "--mapping-contract", "--t0", "--t1", "--t2", "--t3", "--output-root", "--run-id"]);
  const values = {};
  for (let index = 0; index < input.length; index += 2) {
    const key = input[index], value = input[index + 1];
    if (!known.has(key) || !value || Object.hasOwn(values, key)) fail("PRODUCTION_SOURCE_MANIFEST_ARGUMENT_INVALID");
    values[key] = value;
  }
  if (Object.keys(values).length !== known.size || !RUN_ID.test(values["--run-id"] ?? "") || !SHA256.test(values["--mapping-contract"] ?? "")) fail("PRODUCTION_SOURCE_MANIFEST_ARGUMENT_INVALID");
  for (const key of ["--backup", "--receipt", "--t0", "--t1", "--t2", "--t3", "--output-root"]) if (!isAbsolute(values[key])) fail("PRODUCTION_SOURCE_MANIFEST_ARGUMENT_INVALID");
  return {
    backupPath: resolve(values["--backup"]), receiptPath: resolve(values["--receipt"]), mappingContractSha256: values["--mapping-contract"],
    stages: Object.fromEntries(PHASES.map(phase => [phase, resolve(values[`--${phase.toLowerCase()}`])])),
    outputRoot: resolve(values["--output-root"]), runId: values["--run-id"],
  };
}

export function prepareProductionSourceManifest(input) {
  if (!input || typeof input !== "object" || Array.isArray(input) || !RUN_ID.test(input.runId ?? "") || !SHA256.test(input.mappingContractSha256 ?? "")) fail("PRODUCTION_SOURCE_MANIFEST_INPUT_INVALID");
  if (!privateFile(input.backupPath) || !privateFile(input.receiptPath)) fail("PRODUCTION_SOURCE_MANIFEST_SOURCE_UNSAFE");
  const backup = sourceBackupFileHash(input.backupPath);
  const receiptBytes = readFileSync(input.receiptPath);
  const sourceRestoreReceiptSha256 = sourceRestoreReceiptFileHash(input.receiptPath);
  let receipt;
  try { receipt = validateSourceRestoreReceipt(JSON.parse(receiptBytes)); } catch { fail("PRODUCTION_SOURCE_MANIFEST_RECEIPT_INVALID"); }
  if (receipt.sourceSnapshotSha256 !== backup || receipt.backup.sha256 !== backup || receipt.productionImport !== "HOLD") fail("PRODUCTION_SOURCE_MANIFEST_RECEIPT_DRIFT");
  const binding = { sourceSnapshotSha256: backup, sourceRestoreReceiptSha256, sourceCatalogSha256: receipt.identities.catalogSha256, mappingContractSha256: input.mappingContractSha256 };
  if (!input.stages || typeof input.stages !== "object") fail("PRODUCTION_SOURCE_MANIFEST_INPUT_INVALID");
  const phases = Object.fromEntries(PHASES.map(phase => [phase, verifyStage(phase, input.stages[phase], binding)]));
  const content = {
    formatVersion: 1,
    artifactKind: "yuzhou_hr_production_source_manifest",
    sourceReadOnly: true,
    sourceSnapshotSha256: binding.sourceSnapshotSha256,
    sourceRestoreReceiptSha256: binding.sourceRestoreReceiptSha256,
    sourceCatalogSha256: binding.sourceCatalogSha256,
    mappingContractSha256: binding.mappingContractSha256,
    phases,
    productionImport: "HOLD",
  };
  const verified = verifyProductionSourceManifest(content);
  const outputRoot = resolve(input.outputRoot);
  if (existsSync(outputRoot) && !privateDirectory(outputRoot)) fail("PRODUCTION_SOURCE_MANIFEST_OUTPUT_UNSAFE");
  if (!existsSync(outputRoot)) { mkdirSync(outputRoot, { recursive: true, mode: 0o700 }); chmodSync(outputRoot, 0o700); }
  const output = join(outputRoot, `source-manifest-${input.runId}.json`);
  if (existsSync(output)) fail("PRODUCTION_SOURCE_MANIFEST_OUTPUT_EXISTS");
  try {
    writeFileSync(output, `${JSON.stringify(content)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
    chmodSync(output, 0o600);
    if (!privateFile(output)) fail("PRODUCTION_SOURCE_MANIFEST_OUTPUT_UNSAFE");
    return verified;
  } catch (error) {
    if (existsSync(output) && privateFile(output)) unlinkSync(output);
    if (error instanceof ProductionSourceManifestError) throw error;
    fail("PRODUCTION_SOURCE_MANIFEST_WRITE_FAILED");
  }
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  try {
    const result = prepareProductionSourceManifest(parseProductionSourceManifestArgs(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify({ status: "PASS", manifestSha256: result.manifestSha256, phaseCount: result.phaseCount, productionImport: result.productionImport })}\n`);
  } catch (error) {
    process.stderr.write(`${error?.code ?? "PRODUCTION_SOURCE_MANIFEST_FAILED"}\n`);
    process.exitCode = 1;
  }
}
