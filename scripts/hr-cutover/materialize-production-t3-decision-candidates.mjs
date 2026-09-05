#!/usr/bin/env node
/** Authenticated private IO only. Outputs remain review candidates, never approvals. */
import { createHash } from "node:crypto";
import { constants, closeSync, fstatSync, fsyncSync, lstatSync, openSync, readdirSync, readSync, realpathSync, unlinkSync, writeSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { TextDecoder } from "node:util";
import { spawnSync } from "node:child_process";
import { verifyProductionSourceManifest } from "../prepare-yuzhou-production-source-manifest.mjs";
import { assembleProductionT3DecisionCandidates } from "./production-t3-decision-candidates.mjs";
import { verifyProductionT3StagedRecord } from "./production-t3-field-projection.mjs";
import { productionT3ArtifactJsonChunks } from "./production-t3-artifact-json.mjs";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const SHA = /^[0-9a-f]{64}$/u, CODE = /^[0-9a-f]{40}$/u;
const CHUNK = 64 * 1024, MAX_LINE = 1024 ** 2, MAX_METADATA = 32 * 1024 ** 2;
const MAX_STAGE = 64 * 1024 ** 2, MAX_INPUT = 128 * 1024 ** 2;
const MAX_OUTPUT = 384 * 1024 ** 2, MAX_TOTAL_OUTPUT = 1024 ** 3;
const DOMAINS = {
  attendance: { file: "attendance.jsonl", sourceTable: "dbo.timekeeptable" },
  policies: { file: "policies.jsonl", sourceTable: "dbo.insure_method" },
  insurance: { file: "insurance.jsonl", sourceTable: "dbo.person_insure" },
};
const FILES = ["t3-phase.json", "t3-candidates.json", "t3-policy-lineage.json"];
const RECEIPT = "t3-materialization-receipt.json";
const plain = value => value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
export class ProductionT3MaterializerError extends Error {
  constructor(code) { super(code); this.name = "ProductionT3MaterializerError"; this.code = code; }
}
const fail = code => { throw new ProductionT3MaterializerError(code); };
function exact(value, keys, code = "T3_MATERIALIZER_INPUT_INVALID") {
  if (!plain(value) || Object.keys(value).sort().join("|") !== [...keys].sort().join("|")) fail(code);
}
function canonicalPath(path) {
  if (typeof path !== "string" || !isAbsolute(path) || resolve(path) !== path || realpathSync(path) !== path) fail("T3_MATERIALIZER_FILE_UNSAFE");
}
function owned(stat, mode) { return stat.uid === process.getuid() && (stat.mode & 0o7777) === mode; }
function sameIdentity(a, b) { return ["dev", "ino", "mode", "uid", "gid", "nlink"].every(key => a[key] === b[key]); }
function sameDirectory(a, b) { return ["dev", "ino", "mode", "uid", "gid"].every(key => a[key] === b[key]); }
function sameFile(a, b) { return sameIdentity(a, b) && ["size", "mtimeMs", "ctimeMs"].every(key => a[key] === b[key]); }
function directory(path, original) {
  try {
    canonicalPath(path);
    const stat = lstatSync(path);
    if (!stat.isDirectory() || !owned(stat, 0o700) || (original && !sameDirectory(stat, original))) fail("T3_MATERIALIZER_DIRECTORY_UNSAFE");
    return stat;
  } catch { fail("T3_MATERIALIZER_DIRECTORY_UNSAFE"); }
}

// Same no-follow, owned single-link and stable-stat contract as the execution
// reader, with bounded chunks instead of its whole-file Buffer allocation.
function readPrivate(path, maximumBytes, budget, consume, expectedIdentity) {
  let fd;
  try {
    canonicalPath(path);
    const before = lstatSync(path);
    if (!before.isFile() || before.nlink !== 1 || !owned(before, 0o600)) fail("T3_MATERIALIZER_FILE_UNSAFE");
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const info = fstatSync(fd);
    if (!sameFile(before, info) || (expectedIdentity && !sameIdentity(info, expectedIdentity))) fail("T3_MATERIALIZER_FILE_CHANGED");
    if (!Number.isSafeInteger(info.size) || info.size < 0 || info.size > maximumBytes) fail("T3_MATERIALIZER_FILE_TOO_LARGE");
    if (budget.bytesRead + info.size > budget.maximumBytes) fail("T3_MATERIALIZER_READ_BUDGET_EXCEEDED");
    budget.bytesRead += info.size;
    const buffer = Buffer.alloc(CHUNK), hash = createHash("sha256");
    let offset = 0;
    while (offset < info.size) {
      const count = readSync(fd, buffer, 0, Math.min(CHUNK, info.size - offset), null);
      if (!count) fail("T3_MATERIALIZER_FILE_CHANGED");
      const part = buffer.subarray(0, count);
      hash.update(part); consume(part); offset += count;
    }
    if (readSync(fd, buffer, 0, 1, null) !== 0 || !sameFile(info, fstatSync(fd))) fail("T3_MATERIALIZER_FILE_CHANGED");
    canonicalPath(path);
    if (!sameFile(info, lstatSync(path))) fail("T3_MATERIALIZER_FILE_CHANGED");
    return { sha256: hash.digest("hex"), bytes: offset, stat: info };
  } catch (error) {
    if (error instanceof ProductionT3MaterializerError) throw error;
    fail("T3_MATERIALIZER_FILE_UNSAFE");
  } finally { if (fd !== undefined) closeSync(fd); }
}
function parse(bytes) {
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { fail("T3_MATERIALIZER_JSON_INVALID"); }
}
function readJson(path, budget, maximumBytes = MAX_METADATA) {
  const parts = [];
  const descriptor = readPrivate(path, maximumBytes, budget, part => parts.push(Buffer.from(part)));
  return { value: parse(Buffer.concat(parts)), ...descriptor };
}
function artifact(descriptor, budget) {
  exact(descriptor, ["path", "sha256"], "T3_MATERIALIZER_DESCRIPTOR_INVALID");
  if (typeof descriptor.sha256 !== "string" || !SHA.test(descriptor.sha256)) fail("T3_MATERIALIZER_DESCRIPTOR_INVALID");
  const result = readJson(descriptor.path, budget);
  if (result.sha256 !== descriptor.sha256) fail("T3_MATERIALIZER_ARTIFACT_HASH_MISMATCH");
  return result.value;
}
function currentHead() {
  const run = args => spawnSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 15000 });
  const status = run(["status", "--porcelain", "--untracked-files=all"]), revision = run(["rev-parse", "HEAD"]);
  if (status.status !== 0 || status.stdout.trim() || revision.status !== 0 || !CODE.test(revision.stdout.trim())) fail("T3_MATERIALIZER_CURRENT_CODE_REQUIRED");
  return revision.stdout.trim();
}
function readStage(path, manifest, budget) {
  const original = directory(path), stage = readJson(join(path, "manifest.json"), budget);
  if (stage.sha256 !== manifest.phases.T3.stageManifestSha256) fail("T3_MATERIALIZER_STAGE_MANIFEST_DRIFT");
  const value = stage.value;
  if (!plain(value) || value.formatVersion !== 1) fail("T3_MATERIALIZER_STAGE_INVALID");
  exact(value.domains, Object.keys(DOMAINS), "T3_MATERIALIZER_STAGE_INVALID");
  for (const key of ["sourceSnapshotSha256", "sourceRestoreReceiptSha256", "sourceCatalogSha256", "mappingContractSha256"]) {
    if (Object.hasOwn(value, key) && value[key] !== manifest[key]) fail("T3_MATERIALIZER_STAGE_BINDING_DRIFT");
  }
  if (Object.hasOwn(value, "productionImport") && value.productionImport !== "HOLD") fail("T3_MATERIALIZER_STAGE_BINDING_DRIFT");
  const records = [], sources = {};
  for (const [domain, rule] of Object.entries(DOMAINS)) {
    const item = value.domains[domain], expected = manifest.phases.T3.domains[domain];
    exact(item, ["rows", "file", "fileSha256"], "T3_MATERIALIZER_STAGE_INVALID");
    if (item.file !== rule.file || item.rows !== expected.rows || item.fileSha256 !== expected.fileSha256) fail("T3_MATERIALIZER_STAGE_BINDING_DRIFT");
    let parts = [], length = 0, rows = 0;
    const append = part => {
      length += part.length;
      if (length > MAX_LINE) fail("T3_MATERIALIZER_LINE_TOO_LARGE");
      if (part.length) parts.push(Buffer.from(part));
    };
    const finish = () => {
      if (!length) return;
      const row = parse(Buffer.concat(parts, length));
      if (!plain(row) || row.sourceTable !== rule.sourceTable) fail("T3_MATERIALIZER_STAGE_INVALID");
      try { verifyProductionT3StagedRecord(row); } catch { fail("T3_MATERIALIZER_STAGE_INVALID"); }
      records.push(row); rows++; parts = []; length = 0;
    };
    const actual = readPrivate(join(path, rule.file), MAX_STAGE, budget, part => {
      let start = 0;
      for (let index = 0; index < part.length; index++) if (part[index] === 10) {
        append(part.subarray(start, index)); finish(); start = index + 1;
      }
      append(part.subarray(start));
    });
    finish();
    if (actual.sha256 !== item.fileSha256) fail("T3_MATERIALIZER_STAGE_BYTES_DRIFT");
    if (rows !== item.rows) fail("T3_MATERIALIZER_STAGE_COUNT_DRIFT");
    sources[domain] = { sha256: actual.sha256, bytes: actual.bytes, rows };
  }
  directory(path, original);
  return { records, sources, stageManifestSha256: stage.sha256 };
}
function measure(artifact) {
  const hash = createHash("sha256"); let bytes = 0;
  for (const chunk of productionT3ArtifactJsonChunks(artifact)) {
    bytes += Buffer.byteLength(chunk);
    if (bytes > MAX_OUTPUT) fail("T3_MATERIALIZER_OUTPUT_TOO_LARGE");
    hash.update(chunk);
  }
  return { sha256: hash.digest("hex"), bytes };
}
function writeChunks(fd, chunks) {
  const buffer = Buffer.alloc(CHUNK); let used = 0;
  const flush = () => {
    let offset = 0;
    while (offset < used) {
      const count = writeSync(fd, buffer, offset, used - offset);
      if (!count) fail("T3_MATERIALIZER_OUTPUT_FAILED");
      offset += count;
    }
    used = 0;
  };
  for (const chunk of chunks) {
    const bytes = Buffer.from(chunk); let offset = 0;
    while (offset < bytes.length) {
      const count = Math.min(CHUNK - used, bytes.length - offset);
      bytes.copy(buffer, used, offset, offset + count); used += count; offset += count;
      if (used === CHUNK) flush();
    }
  }
  if (used) flush();
  fsyncSync(fd);
}
function emit(outputDir, artifacts, descriptors, receiptBytes) {
  const original = directory(outputDir), opened = [];
  let dirFd, receiptFd, receiptIdentity;
  try {
    if (readdirSync(outputDir).length) fail("T3_MATERIALIZER_OUTPUT_NOT_EMPTY");
    dirFd = openSync(outputDir, constants.O_RDONLY | constants.O_NOFOLLOW);
    if (!sameDirectory(original, fstatSync(dirFd))) fail("T3_MATERIALIZER_DIRECTORY_UNSAFE");
    // Reserve the complete fixed artifact set before any content is written.
    for (const file of FILES) {
      directory(outputDir, original);
      const fd = openSync(join(outputDir, file), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      opened.push({ fd, identity: fstatSync(fd) });
    }
    for (let index = 0; index < FILES.length; index++) {
      directory(outputDir, original);
      writeChunks(opened[index].fd, productionT3ArtifactJsonChunks(artifacts[index]));
      const readback = readPrivate(join(outputDir, FILES[index]), MAX_OUTPUT, { bytesRead: 0, maximumBytes: MAX_OUTPUT }, () => {}, opened[index].identity);
      if (readback.sha256 !== descriptors[index].sha256 || readback.bytes !== descriptors[index].bytes) fail("T3_MATERIALIZER_OUTPUT_READBACK_FAILED");
      // Preserve the snapshot whose bytes were authenticated. A fresh stat here
      // could bless a concurrent change made just after readback returned.
      opened[index].completed = readback.stat;
    }
    directory(outputDir, original);
    if (readdirSync(outputDir).sort().join("|") !== [...FILES].sort().join("|")) fail("T3_MATERIALIZER_OUTPUT_FAILED");
    for (let index = 0; index < FILES.length; index++) {
      if (!sameFile(opened[index].completed, lstatSync(join(outputDir, FILES[index])))) fail("T3_MATERIALIZER_OUTPUT_READBACK_FAILED");
    }
    fsyncSync(dirFd);
    receiptFd = openSync(join(outputDir, RECEIPT), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    receiptIdentity = fstatSync(receiptFd);
    writeChunks(receiptFd, [receiptBytes]);
    const readback = readPrivate(join(outputDir, RECEIPT), MAX_METADATA, { bytesRead: 0, maximumBytes: MAX_METADATA }, () => {}, receiptIdentity);
    if (readback.sha256 !== createHash("sha256").update(receiptBytes).digest("hex")) fail("T3_MATERIALIZER_OUTPUT_READBACK_FAILED");
    directory(outputDir, original);
    fsyncSync(dirFd);
    for (const item of opened) { closeSync(item.fd); item.fd = undefined; }
    closeSync(receiptFd); receiptFd = undefined;
    closeSync(dirFd); dirFd = undefined;
  } catch (error) {
    // The completion marker is the sole rollback exception: remove only this
    // run's inode on a caught failure, never a replaced/existing receipt or data.
    if (receiptIdentity) {
      try {
        directory(outputDir, original);
        const path = join(outputDir, RECEIPT), current = lstatSync(path);
        if (current.dev === receiptIdentity.dev && current.ino === receiptIdentity.ino) { unlinkSync(path); fsyncSync(dirFd); }
      } catch (rollbackError) {
        if (rollbackError?.code !== "ENOENT") fail("T3_MATERIALIZER_RECEIPT_ROLLBACK_FAILED");
      }
    }
    if (error instanceof ProductionT3MaterializerError) throw error;
    fail("T3_MATERIALIZER_OUTPUT_FAILED");
  } finally {
    // Preserve every partial artifact for audit. A retry needs another empty directory.
    for (const fd of [...opened.map(item => item.fd), receiptFd, dirFd]) {
      if (fd !== undefined) { try { closeSync(fd); } catch { /* Preserve the original sanitized failure. */ } }
    }
  }
}

function materialize(configPath, { currentHead: head = currentHead, maximumReadBytes = MAX_INPUT } = {}) {
  if (!Number.isSafeInteger(maximumReadBytes) || maximumReadBytes < 1 || maximumReadBytes > MAX_INPUT) fail("T3_MATERIALIZER_READ_BUDGET_INVALID");
  const budget = { bytesRead: 0, maximumBytes: maximumReadBytes };
  const configRead = readJson(configPath, budget, MAX_LINE), config = configRead.value;
  exact(config, ["formatVersion", "triple", "stagingDir", "artifacts", "outputDir"]);
  exact(config.triple, ["codeSha", "sourceSnapshotHash", "mappingContractHash"]);
  if (!CODE.test(config.triple.codeSha ?? "") || !SHA.test(config.triple.sourceSnapshotHash ?? "") || !SHA.test(config.triple.mappingContractHash ?? "")) fail("T3_MATERIALIZER_TRIPLE_INVALID");
  if (config.formatVersion !== 1 || config.triple.codeSha !== head()) fail("T3_MATERIALIZER_CURRENT_CODE_REQUIRED");
  exact(config.artifacts, ["sourceManifest", "targetInventory", "t0Candidates"]);
  directory(config.outputDir); directory(config.stagingDir);
  if (config.outputDir === config.stagingDir) fail("T3_MATERIALIZER_OUTPUT_INVALID");
  if (readdirSync(config.outputDir).length) fail("T3_MATERIALIZER_OUTPUT_NOT_EMPTY");
  const a = config.artifacts, manifest = artifact(a.sourceManifest, budget);
  let verified;
  try { verified = verifyProductionSourceManifest(manifest); } catch { fail("T3_MATERIALIZER_SOURCE_MANIFEST_INVALID"); }
  if (manifest.sourceSnapshotSha256 !== config.triple.sourceSnapshotHash || manifest.mappingContractSha256 !== config.triple.mappingContractHash) fail("T3_MATERIALIZER_SOURCE_MANIFEST_DRIFT");
  const inventory = artifact(a.targetInventory, budget), t0 = artifact(a.t0Candidates, budget);
  // This is the verifier's canonical hash, deliberately distinct from raw descriptor bytes.
  if (inventory.sourceManifestSha256 !== verified.manifestSha256) fail("T3_MATERIALIZER_INVENTORY_SOURCE_DRIFT");
  const stage = readStage(config.stagingDir, manifest, budget);
  const result = assembleProductionT3DecisionCandidates({ triple: config.triple, targetScope: t0.targetScope, targetInventory: inventory, t0Candidates: t0,
    stagedRecords: stage.records, attendanceFileSha256: stage.sources.attendance.sha256,
    artifactHashes: { targetInventoryArtifactSha256: a.targetInventory.sha256, t0CandidatesArtifactSha256: a.t0Candidates.sha256 } });
  const lineage = { formatVersion: 1, artifactKind: "yuzhou_hr_production_t3_policy_recovery_lineage", triple: config.triple,
    phaseArtifactSha256: result.candidates.phaseArtifactSha256, records: result.policyRecoveries, productionImport: "HOLD" };
  const artifacts = [result.phaseArtifact, result.candidates, lineage], descriptors = artifacts.map(measure);
  if (descriptors.reduce((sum, item) => sum + item.bytes, 0) > MAX_TOTAL_OUTPUT) fail("T3_MATERIALIZER_OUTPUT_BUDGET_EXCEEDED");
  if (descriptors[0].sha256 !== result.candidates.phaseArtifactSha256) fail("T3_MATERIALIZER_PHASE_HASH_MISMATCH");
  const reasonCounts = {};
  for (const row of result.candidates.records) if (row.reasonCode) reasonCounts[row.reasonCode] = (reasonCounts[row.reasonCode] ?? 0) + 1;
  const summary = { status: result.candidates.status, phase: "T3", recordCount: result.candidates.records.length,
    targetTableCounts: result.candidates.targetTableCounts, countByDisposition: result.candidates.countByDisposition,
    reasonCounts, recoveredPolicyCount: result.policyRecoveries.length, artifacts: Object.fromEntries(FILES.map((file, index) => [file, descriptors[index]])), productionImport: "HOLD" };
  const receipt = { formatVersion: 1, artifactKind: "yuzhou_hr_production_t3_materialization_receipt", materializationStatus: "COMPLETE", ...summary,
    triple: config.triple, configArtifactSha256: configRead.sha256, sourceManifestSha256: verified.manifestSha256,
    sourceManifestArtifactSha256: a.sourceManifest.sha256, sourceRestoreReceiptSha256: manifest.sourceRestoreReceiptSha256,
    sourceCatalogSha256: manifest.sourceCatalogSha256, stageManifestSha256: stage.stageManifestSha256, sources: stage.sources,
    targetInventoryArtifactSha256: a.targetInventory.sha256, t0CandidatesArtifactSha256: a.t0Candidates.sha256,
    targetIdentitySha256: inventory.targetIdentitySha256, targetScopeSha256: inventory.targetScopeSha256, approvalClaimed: false };
  const receiptBytes = JSON.stringify(receipt) + "\n";
  if (Buffer.byteLength(receiptBytes) > MAX_METADATA || descriptors.reduce((sum, item) => sum + item.bytes, Buffer.byteLength(receiptBytes)) > MAX_TOTAL_OUTPUT) fail("T3_MATERIALIZER_OUTPUT_BUDGET_EXCEEDED");
  // Check code identity again after preparation, before any output file exists.
  if (config.triple.codeSha !== head()) fail("T3_MATERIALIZER_CURRENT_CODE_REQUIRED");
  emit(config.outputDir, artifacts, descriptors, receiptBytes);
  return summary;
}

export function materializeProductionT3DecisionCandidates(configPath, options) {
  try { return materialize(configPath, options); }
  catch (error) {
    if (error instanceof ProductionT3MaterializerError) throw error;
    if (/^T3_(?:CANDIDATE|POLICY_RECOVERY)_[A-Z0-9_]+$/u.test(error?.code ?? "")) fail(error.code);
    fail("T3_MATERIALIZER_FAILED");
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 2 || args[0] !== "--config") fail("T3_MATERIALIZER_ARGUMENT_INVALID");
    process.stdout.write(JSON.stringify(materializeProductionT3DecisionCandidates(args[1])) + "\n");
  } catch (error) {
    process.stderr.write(`${error instanceof ProductionT3MaterializerError ? error.code : "T3_MATERIALIZER_FAILED"}\n`);
    process.exitCode = 1;
  }
}
