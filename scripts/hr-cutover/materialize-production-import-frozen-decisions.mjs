#!/usr/bin/env node
/** Bounded private file owner for candidate preparation; no runtime activation. */
import { createHash } from "node:crypto";
import { constants, closeSync, fstatSync, fsyncSync, lstatSync, openSync, readdirSync, readSync, realpathSync, unlinkSync, writeSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { TextDecoder } from "node:util";
import { freezeProductionImportCandidates, ProductionImportCandidateFreezeError } from "./production-import-candidate-freeze.mjs";
import { productionT3ArtifactJsonChunks } from "./production-t3-artifact-json.mjs";
import { stableProductionImportCanonicalJson as canonical } from "./production-import-target-model.mjs";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const CHUNK = 64 * 1024, MIB = 1024 ** 2, LARGE = 384 * MIB, TOTAL = 1024 ** 3;
const RECEIPT = "candidate-freeze-receipt.json";
const phases = ["T0", "T1", "T2", "T3"];
export const PRODUCTION_IMPORT_CANDIDATE_FREEZE_DEPENDENCY_PATHS = Object.freeze([
  "scripts/hr-cutover/materialize-production-import-frozen-decisions.mjs",
  "scripts/hr-cutover/production-import-candidate-freeze.mjs",
  "scripts/hr-cutover/production-import-real-artifact-bridge.mjs",
  "scripts/hr-cutover/production-import-payload-generator.mjs",
  "scripts/hr-cutover/production-import-sealed-plan-lib.mjs",
  "scripts/hr-cutover/materialize-production-t0-decision-candidates.mjs",
  "scripts/hr-cutover/production-t2-decision-candidates.mjs",
  "scripts/hr-cutover/production-import-target-model.mjs",
  "scripts/hr-cutover/production-t3-artifact-json.mjs",
]);
const sameIdentity = (a, b) => ["dev", "ino", "uid", "gid", "mode", "nlink"].every(key => a[key] === b[key]);
const sameDirectory = (a, b) => ["dev", "ino", "uid", "gid", "mode"].every(key => a[key] === b[key]);
const sameFile = (a, b) => sameIdentity(a, b) && ["size", "mtimeMs", "ctimeMs"].every(key => a[key] === b[key]);
const owned = (stat, mode) => stat.uid === process.getuid() && (stat.mode & 0o7777) === mode;
export class ProductionImportFreezeMaterializerError extends Error {
  constructor(code) { super(code); this.name = "ProductionImportFreezeMaterializerError"; this.code = code; }
}
const fail = code => { throw new ProductionImportFreezeMaterializerError(`FREEZE_MATERIALIZER_${code}`); };
function exact(value, keys) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).sort().join("|") !== [...keys].sort().join("|")) fail("INPUT_INVALID");
}
function canonicalPath(path) {
  if (typeof path !== "string" || !isAbsolute(path) || resolve(path) !== path || realpathSync(path) !== path) fail("PATH_UNSAFE");
}
function directory(path, original) {
  canonicalPath(path);
  const stat = lstatSync(path);
  if (!stat.isDirectory() || !owned(stat, 0o700) || (original && !sameDirectory(stat, original))) fail("DIRECTORY_UNSAFE");
  return stat;
}
function read(path, limit, budget, consume, expected) {
  canonicalPath(path); directory(dirname(path));
  let fd, buffer;
  try {
    const before = lstatSync(path);
    if (!before.isFile() || !owned(before, 0o600) || before.nlink !== 1) fail("FILE_UNSAFE");
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = fstatSync(fd);
    if (!sameFile(before, stat) || (expected && !sameIdentity(expected, stat))) fail("FILE_CHANGED");
    if (!Number.isSafeInteger(stat.size) || stat.size < 1 || stat.size > limit) fail("FILE_SIZE_INVALID");
    if (budget.bytes + stat.size > budget.maximum) fail("READ_BUDGET_EXCEEDED");
    budget.bytes += stat.size;
    buffer = Buffer.alloc(CHUNK);
    const digest = createHash("sha256");
    let offset = 0;
    while (offset < stat.size) {
      const count = readSync(fd, buffer, 0, Math.min(CHUNK, stat.size - offset), null);
      if (!count) fail("FILE_CHANGED");
      const part = buffer.subarray(0, count); digest.update(part); consume(part); offset += count;
    }
    if (readSync(fd, buffer, 0, 1, null) !== 0 || !sameFile(stat, fstatSync(fd))) fail("FILE_CHANGED");
    canonicalPath(path);
    if (!sameFile(stat, lstatSync(path))) fail("FILE_CHANGED");
    return { sha256: digest.digest("hex"), bytes: offset, stat };
  } finally { buffer?.fill(0); if (fd !== undefined) closeSync(fd); }
}
function parse(bytes) {
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { fail("JSON_INVALID"); }
}
export function currentCandidateFreezeRepositorySha(repositoryRoot = ROOT, additionalDependencyPaths = []) {
  if (typeof repositoryRoot !== "string" || !isAbsolute(repositoryRoot) || resolve(repositoryRoot) !== repositoryRoot) fail("CURRENT_CODE_REQUIRED");
  try {
    const git = args => execFileSync("git", args, { cwd: repositoryRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 15000 });
    git(["ls-files", "--error-unmatch", "--", ...PRODUCTION_IMPORT_CANDIDATE_FREEZE_DEPENDENCY_PATHS, ...additionalDependencyPaths]);
    git(["diff", "--quiet", "--no-ext-diff", "--"]);
    git(["diff", "--cached", "--quiet", "--no-ext-diff", "--"]);
    const head = git(["rev-parse", "HEAD"]).trim();
    if (!/^[0-9a-f]{40}$/u.test(head)) fail("CURRENT_CODE_REQUIRED");
    return head;
  } catch (error) {
    if (error instanceof ProductionImportFreezeMaterializerError) throw error;
    fail("CURRENT_CODE_REQUIRED");
  }
}
// Reuse the bounded records serializer for both evidence and wrapped payloads.
function* chunks(value) {
  if (Array.isArray(value.records)) { yield* productionT3ArtifactJsonChunks(value); return; }
  if (value.payload && Array.isArray(value.payload.records)) {
    yield "{";
    for (const [index, key] of Object.keys(JSON.parse(canonical({ ...value, payload: null }))).entries()) {
      if (index) yield ",";
      yield `${JSON.stringify(key)}:`;
      if (key === "payload") for (const part of productionT3ArtifactJsonChunks(value.payload)) yield part === "}\n" ? "}" : part;
      else yield canonical(value[key]);
    }
    yield "}\n"; return;
  }
  yield canonical(value) + "\n";
}
function measure(value, limit) {
  let bytes = 0; const digest = createHash("sha256");
  for (const part of chunks(value)) {
    bytes += Buffer.byteLength(part); if (bytes > limit) fail("OUTPUT_TOO_LARGE"); digest.update(part);
  }
  return { sha256: digest.digest("hex"), bytes };
}
function write(fd, value) {
  const buffer = Buffer.alloc(CHUNK); let used = 0;
  const flush = () => {
    let offset = 0;
    while (offset < used) { const count = writeSync(fd, buffer, offset, used - offset); if (!count) fail("OUTPUT_FAILED"); offset += count; }
    used = 0;
  };
  for (const part of chunks(value)) {
    const bytes = Buffer.from(part); let offset = 0;
    while (offset < bytes.length) {
      const count = Math.min(CHUNK - used, bytes.length - offset);
      bytes.copy(buffer, used, offset, offset + count); used += count; offset += count;
      if (used === CHUNK) flush();
    }
  }
  if (used) flush(); fsyncSync(fd);
}
function emit(path, artifacts, receipt, descriptors, outputLimit, receiptFile = RECEIPT) {
  if (!/^[a-z][a-z0-9-]*\.json$/u.test(receiptFile) || Object.hasOwn(artifacts, receiptFile)) fail("INPUT_INVALID");
  const original = directory(path), opened = [];
  let dirFd, marker;
  try {
    if (readdirSync(path).length) fail("OUTPUT_NOT_EMPTY");
    dirFd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    if (!sameDirectory(original, fstatSync(dirFd))) fail("DIRECTORY_UNSAFE");
    const reserve = file => {
      directory(path, original);
      const fd = openSync(join(path, file), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      const item = { file, fd, stat: fstatSync(fd) }; opened.push(item); return item;
    };
    for (const file of Object.keys(artifacts)) reserve(file);
    const verify = (item, value, descriptor) => {
      directory(path, original); write(item.fd, value);
      const checked = read(join(path, item.file), outputLimit, { bytes: 0, maximum: outputLimit }, () => {}, item.stat);
      if (checked.bytes !== descriptor.bytes || checked.sha256 !== descriptor.sha256) fail("OUTPUT_READBACK_FAILED");
      item.completed = checked.stat;
    };
    for (const item of opened) verify(item, artifacts[item.file], descriptors[item.file]);
    const checkCompleted = () => {
      directory(path, original);
      for (const item of opened) if (!sameFile(item.completed, lstatSync(join(path, item.file)))) fail("OUTPUT_READBACK_FAILED");
    };
    checkCompleted(); fsyncSync(dirFd);
    if (readdirSync(path).sort().join("|") !== Object.keys(artifacts).sort().join("|")) fail("OUTPUT_CHANGED");
    marker = reserve(receiptFile);
    verify(marker, receipt, measure(receipt, outputLimit));
    checkCompleted();
    if (readdirSync(path).sort().join("|") !== [...Object.keys(artifacts), receiptFile].sort().join("|")) fail("OUTPUT_CHANGED");
    fsyncSync(dirFd);
  } catch (error) {
    if (marker) {
      try {
        directory(path, original);
        const found = lstatSync(join(path, receiptFile));
        if (found.dev === marker.stat.dev && found.ino === marker.stat.ino) { unlinkSync(join(path, receiptFile)); fsyncSync(dirFd); }
      } catch (rollback) { if (rollback?.code !== "ENOENT") fail("RECEIPT_ROLLBACK_FAILED"); }
    }
    throw error;
  } finally {
    for (const fd of [...opened.map(item => item.fd), dirFd]) if (fd !== undefined) { try { closeSync(fd); } catch { /* retain the original failure */ } }
  }
}
// Shared bounded IO primitives. Callers own fixed filenames, budgets and schemas.
export { read as readProductionImportPrivateBytes, directory as productionImportPrivateDirectory,
  canonicalPath as productionImportCanonicalPath, sameFile as sameProductionImportPrivateFile,
  parse as parseProductionImportPrivateJson, measure as measureProductionImportPrivateJson,
  emit as emitProductionImportPrivateArtifacts };
function materialize(configPath, { currentHead: head = currentCandidateFreezeRepositorySha, maximumReadBytes = TOTAL, maximumOutputBytes = LARGE, maximumTotalOutputBytes = TOTAL } = {}) {
  for (const [value, cap] of [[maximumReadBytes, TOTAL], [maximumOutputBytes, LARGE], [maximumTotalOutputBytes, TOTAL]]) {
    if (!Number.isSafeInteger(value) || value < 1 || value > cap) fail("BUDGET_INVALID");
  }
  const budget = { bytes: 0, maximum: maximumReadBytes }, inputStats = [];
  const load = (path, limit) => {
    const parts = [], result = read(path, limit, budget, part => parts.push(Buffer.from(part)));
    inputStats.push({ path, stat: result.stat }); return { ...result, content: Buffer.concat(parts) };
  };
  const configRead = load(configPath, MIB), config = parse(configRead.content);
  exact(config, ["formatVersion", "triple", "artifacts", "outputDir"]);
  if (config.formatVersion !== 1 || config.triple?.codeSha !== head()) fail("CURRENT_CODE_REQUIRED");
  exact(config.artifacts, ["phases", "candidates", "targetInventory", "targetScope", "reviewedDecisions"]);
  exact(config.artifacts.phases, phases); exact(config.artifacts.candidates, phases);
  const outputStat = directory(config.outputDir);
  if (readdirSync(config.outputDir).length) fail("OUTPUT_NOT_EMPTY");
  const artifact = (descriptor, limit) => {
    exact(descriptor, ["path", "sha256"]);
    const result = load(descriptor.path, limit);
    if (result.sha256 !== descriptor.sha256) fail("ARTIFACT_HASH_MISMATCH");
    return { ...descriptor, bytes: result.content };
  };
  const result = freezeProductionImportCandidates({ expectedTriple: config.triple,
    phaseArtifacts: Object.fromEntries(phases.map(phase => [phase, artifact(config.artifacts.phases[phase], LARGE)])),
    candidateArtifacts: Object.fromEntries(phases.map(phase => [phase, artifact(config.artifacts.candidates[phase], LARGE)])),
    targetInventoryArtifact: artifact(config.artifacts.targetInventory, 32 * MIB), targetScopeArtifact: artifact(config.artifacts.targetScope, 32 * MIB),
    reviewedDecisionsArtifact: config.artifacts.reviewedDecisions === null ? null : artifact(config.artifacts.reviewedDecisions, LARGE) });
  const artifacts = { "candidate-preparation-evidence.json": result.evidence };
  if (result.wrappers) for (const [role, value] of Object.entries(result.wrappers)) artifacts[`real-${role}.json`] = value;
  const descriptors = Object.fromEntries(Object.entries(artifacts).map(([file, value]) => [file, measure(value, maximumOutputBytes)]));
  const receipt = { formatVersion: 1, artifactKind: "yuzhou_hr_production_import_candidate_freeze_receipt", materializationStatus: "COMPLETE",
    ...result.summary, triple: config.triple, configArtifactSha256: configRead.sha256, artifacts: descriptors,
    signatureAuthenticityVerified: false, executionReachable: false };
  const total = Object.values(descriptors).reduce((sum, item) => sum + item.bytes, measure(receipt, Math.min(32 * MIB, maximumOutputBytes)).bytes);
  if (total > maximumTotalOutputBytes) fail("OUTPUT_BUDGET_EXCEEDED");
  if (config.triple.codeSha !== head()) fail("CURRENT_CODE_REQUIRED");
  for (const item of inputStats) { canonicalPath(item.path); if (!sameFile(item.stat, lstatSync(item.path))) fail("FILE_CHANGED"); }
  directory(config.outputDir, outputStat);
  emit(config.outputDir, artifacts, receipt, descriptors, maximumOutputBytes);
  return { ...result.summary, artifacts: descriptors };
}
export function materializeProductionImportFrozenDecisions(configPath, options) {
  try { return materialize(configPath, options); }
  catch (error) {
    if (error instanceof ProductionImportFreezeMaterializerError || error instanceof ProductionImportCandidateFreezeError) throw error;
    fail("FAILED");
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 2 || args[0] !== "--config") fail("ARGUMENT_INVALID");
    process.stdout.write(JSON.stringify(materializeProductionImportFrozenDecisions(args[1])) + "\n");
  } catch (error) {
    process.stderr.write(`${error instanceof ProductionImportFreezeMaterializerError || error instanceof ProductionImportCandidateFreezeError ? error.code : "FREEZE_MATERIALIZER_FAILED"}\n`);
    process.exitCode = 1;
  }
}
