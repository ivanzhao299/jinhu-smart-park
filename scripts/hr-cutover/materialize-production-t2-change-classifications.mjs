#!/usr/bin/env node
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { closeSync, constants, fstatSync, fsyncSync, lstatSync, openSync, readSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readBoundedPrivateArtifactBytes } from "./execute-production-import.mjs";
import { verifyProductionSourceManifest } from "../prepare-yuzhou-production-source-manifest.mjs";
import { verifyProductionT2StagedRecord } from "./production-t2-field-projection.mjs";

export const T2_RENEWAL_ROUTINE_ID = "RULE-F089F24164D89466";
export const T2_RENEWAL_ROUTINE_SHA256 = "f1cc43ab459f8808198bb11ee5834231282546e88656eb16360f4f6535cf2c12";
const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const SHA = /^[0-9a-f]{64}$/u;
const MAX_FILE = 32 * 1024 ** 2;
const MAX_TOTAL = 128 * 1024 ** 2;
const ROUTINE_LIMIT = 256 * 1024;
const DOMAINS = Object.freeze({ "dbo.compacttypecode": "contract-types.jsonl", "dbo.compact": "contracts.jsonl", "dbo.compact_c": "contract-changes.jsonl", "dbo.compact.state": "contract-states.raw.json" });
const hash = value => createHash("sha256").update(value).digest("hex");
const plain = value => value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
export class ProductionT2ChangeClassificationError extends Error {
  constructor(code) { super(code); this.name = "ProductionT2ChangeClassificationError"; this.code = code; }
}
const fail = suffix => { throw new ProductionT2ChangeClassificationError(`T2_CHANGE_CLASSIFICATION_${suffix}`); };
const exact = (value, keys) => {
  if (!plain(value) || Object.keys(value).sort().join("|") !== [...keys].sort().join("|")) fail("SHAPE_INVALID");
};
function verifyTriple(triple) {
  exact(triple, ["codeSha", "sourceSnapshotHash", "mappingContractHash"]);
  if (typeof triple.codeSha !== "string" || !/^[0-9a-f]{40}$/u.test(triple.codeSha)
    || typeof triple.sourceSnapshotHash !== "string" || !SHA.test(triple.sourceSnapshotHash)
    || typeof triple.mappingContractHash !== "string" || !SHA.test(triple.mappingContractHash)) fail("TRIPLE_INVALID");
}

export function verifyT2RenewalRoutineBytes(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 1 || bytes.byteLength > ROUTINE_LIMIT || hash(bytes) !== T2_RENEWAL_ROUTINE_SHA256) fail("ROUTINE_EVIDENCE_INVALID");
  return Object.freeze({ routineId: T2_RENEWAL_ROUTINE_ID, routineSha256: T2_RENEWAL_ROUTINE_SHA256 });
}

/** Pure candidate builder. The I/O boundary proves these evidence hashes from
 * actual bytes; this function never treats a routine hash as an approval. */
export function buildProductionT2ChangeClassifications({ triple, stagedRecords, stageFileSha256, routineEvidence }) {
  verifyTriple(triple);
  exact(routineEvidence, ["routineId", "routineSha256"]);
  if (routineEvidence.routineId !== T2_RENEWAL_ROUTINE_ID || routineEvidence.routineSha256 !== T2_RENEWAL_ROUTINE_SHA256) fail("ROUTINE_EVIDENCE_INVALID");
  if (typeof stageFileSha256 !== "string" || !SHA.test(stageFileSha256) || !Array.isArray(stagedRecords)) fail("SOURCE_INVALID");
  const identities = new Set(), parents = new Map(), changes = [];
  for (const row of stagedRecords) {
    try { verifyProductionT2StagedRecord(row); } catch { fail("SOURCE_RECORD_INVALID"); }
    if (identities.has(row.sourceIdentitySha256)) fail("SOURCE_DUPLICATE");
    identities.add(row.sourceIdentitySha256);
    if (row.sourceTable === "dbo.compact") {
      const key = row.source.contractNo.trim(), existing = parents.get(key) ?? [];
      existing.push(row); parents.set(key, existing);
    } else if (row.sourceTable === "dbo.compact_c") changes.push(row);
  }
  const reasonCounts = { MISSING_PARENT: 0, AMBIGUOUS_PARENT: 0, EMPLOYEE_MISMATCH: 0 };
  let renewal = 0;
  const records = changes.map(row => {
    const matches = parents.get(row.source.contractNo.trim()) ?? [];
    const reason = matches.length === 0 ? "MISSING_PARENT" : matches.length !== 1 ? "AMBIGUOUS_PARENT"
      : matches[0].source.employeeCode.trim() !== row.source.employeeCode.trim() ? "EMPLOYEE_MISMATCH" : null;
    if (reason) reasonCounts[reason] += 1; else renewal += 1;
    return { sourceIdentitySha256: row.sourceIdentitySha256, sourceRowSha256: row.sourceRowSha256, changeType: reason ? "needs_review" : "renewal", evidenceSha256: routineEvidence.routineSha256 };
  }).sort((a, b) => a.sourceIdentitySha256.localeCompare(b.sourceIdentitySha256));
  return {
    artifact: { formatVersion: 1, kind: "yuzhou_hr_t2_change_classification_candidates", triple: { ...triple }, stageFileSha256, records, productionImport: "HOLD" },
    summary: { totalChanges: records.length, renewal, needsReview: records.length - renewal, reasonCounts, productionImport: "HOLD" },
  };
}

function privateDirectory(path) {
  try {
    const entry = lstatSync(path);
    if (!isAbsolute(path) || resolve(path) !== path || realpathSync(path) !== path || !entry.isDirectory() || entry.isSymbolicLink()
      || entry.uid !== process.getuid() || (entry.mode & 0o777) !== 0o700) fail("DIRECTORY_UNSAFE");
    return path;
  } catch { fail("DIRECTORY_UNSAFE"); }
}
function readBytes(path, budget, maximum = MAX_FILE, allowEmpty = false) {
  try {
    if (typeof path !== "string" || !isAbsolute(path) || resolve(path) !== path || realpathSync(path) !== path) fail("FILE_UNSAFE");
    privateDirectory(dirname(path));
    if (allowEmpty) {
      const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const before = fstatSync(fd);
        if (!before.isFile() || before.nlink !== 1 || before.uid !== process.getuid() || (before.mode & 0o777) !== 0o600) fail("FILE_UNSAFE");
        if (before.size === 0) {
          if (readSync(fd, Buffer.alloc(1), 0, 1, 0) !== 0) fail("FILE_UNSAFE");
          const after = fstatSync(fd);
          if (after.size !== 0 || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs) fail("FILE_UNSAFE");
          return Buffer.alloc(0);
        }
      } finally { closeSync(fd); }
    }
    return readBoundedPrivateArtifactBytes(path, "classification input", maximum, budget);
  } catch { fail("FILE_UNSAFE"); }
}
function json(bytes) { try { return JSON.parse(bytes.toString("utf8")); } catch { fail("JSON_INVALID"); } }
function readArtifact(descriptor, budget, maximum = MAX_FILE) {
  exact(descriptor, ["path", "sha256"]);
  if (typeof descriptor.sha256 !== "string" || !SHA.test(descriptor.sha256)) fail("DESCRIPTOR_INVALID");
  const bytes = readBytes(descriptor.path, budget, maximum);
  if (hash(bytes) !== descriptor.sha256) fail("ARTIFACT_HASH_MISMATCH");
  return bytes;
}
// This is pinned SQL source code, not private staging. Preserve its original
// archive permissions; byte identity, ownership and no-follow remain mandatory.
function readRoutine(descriptor, budget) {
  exact(descriptor, ["path", "sha256"]);
  if (descriptor.sha256 !== T2_RENEWAL_ROUTINE_SHA256) fail("ROUTINE_EVIDENCE_INVALID");
  let fd;
  try {
    const path = descriptor.path;
    if (typeof path !== "string" || !isAbsolute(path) || resolve(path) !== path || realpathSync(path) !== path) fail("ROUTINE_FILE_UNSAFE");
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const before = fstatSync(fd);
    if (!before.isFile() || before.uid !== process.getuid() || before.nlink !== 1 || before.size < 1 || before.size > ROUTINE_LIMIT
      || budget.bytesRead + before.size > budget.maximumBytes) fail("ROUTINE_FILE_UNSAFE");
    budget.bytesRead += before.size;
    const data = Buffer.alloc(before.size);
    let offset = 0;
    while (offset < data.length) {
      const count = readSync(fd, data, offset, data.length - offset, null);
      if (count === 0) fail("ROUTINE_FILE_UNSAFE");
      offset += count;
    }
    if (readSync(fd, Buffer.alloc(1), 0, 1, null) !== 0) fail("ROUTINE_FILE_UNSAFE");
    const after = fstatSync(fd);
    if (after.dev !== before.dev || after.ino !== before.ino || after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs) fail("ROUTINE_FILE_UNSAFE");
    return verifyT2RenewalRoutineBytes(data);
  } catch (error) {
    if (error instanceof ProductionT2ChangeClassificationError) throw error;
    fail("ROUTINE_FILE_UNSAFE");
  } finally { if (fd !== undefined) closeSync(fd); }
}
function currentHead() {
  const run = args => spawnSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 15000 });
  const status = run(["status", "--porcelain", "--untracked-files=all", "--", "scripts/hr-cutover", "scripts/prepare-yuzhou-production-source-manifest.mjs"]);
  const revision = run(["rev-parse", "HEAD"]);
  if (status.status !== 0 || status.stdout.trim() || revision.status !== 0 || !/^[0-9a-f]{40}$/u.test(revision.stdout.trim())) fail("CURRENT_CODE_REQUIRED");
  return revision.stdout.trim();
}

export function materializeProductionT2ChangeClassifications(configPath, { currentHead: head = currentHead, maximumReadBytes = MAX_TOTAL } = {}) {
  if (!Number.isSafeInteger(maximumReadBytes) || maximumReadBytes < 1 || maximumReadBytes > MAX_TOTAL) fail("READ_BUDGET_INVALID");
  const budget = { bytesRead: 0, maximumBytes: maximumReadBytes };
  const config = json(readBytes(configPath, budget));
  exact(config, ["formatVersion", "triple", "stagingDir", "sourceManifest", "routine", "outputPath"]);
  verifyTriple(config.triple);
  if (config.formatVersion !== 1 || config.triple.codeSha !== head()) fail("CURRENT_CODE_REQUIRED");
  const manifest = json(readArtifact(config.sourceManifest, budget));
  try { verifyProductionSourceManifest(manifest); } catch { fail("SOURCE_MANIFEST_INVALID"); }
  if (manifest.sourceSnapshotSha256 !== config.triple.sourceSnapshotHash || manifest.mappingContractSha256 !== config.triple.mappingContractHash) fail("SOURCE_BINDING_MISMATCH");
  const routineEvidence = readRoutine(config.routine, budget);
  const staging = privateDirectory(config.stagingDir);
  const stageBytes = readBytes(join(staging, "manifest.json"), budget);
  if (hash(stageBytes) !== manifest.phases.T2.stageManifestSha256) fail("STAGE_MANIFEST_MISMATCH");
  const stage = json(stageBytes);
  if (stage.formatVersion !== 1 || (stage.productionImport !== undefined && stage.productionImport !== "HOLD")) fail("STAGE_MANIFEST_INVALID");
  exact(stage.domains, Object.keys(DOMAINS));
  for (const key of ["sourceSnapshotSha256", "sourceRestoreReceiptSha256", "sourceCatalogSha256", "mappingContractSha256"]) {
    if (stage[key] !== undefined && stage[key] !== manifest[key]) fail("STAGE_BINDING_MISMATCH");
  }
  const stagedRecords = [];
  let stateRows;
  for (const [domain, filename] of Object.entries(DOMAINS)) {
    const item = stage.domains[domain], expected = manifest.phases.T2.domains[domain];
    exact(item, ["rows", "file", "fileSha256"]);
    if (item.file !== filename || item.rows !== expected.rows || item.fileSha256 !== expected.fileSha256) fail("STAGE_BINDING_MISMATCH");
    const data = readBytes(join(staging, filename), budget, MAX_FILE, item.rows === 0);
    if (hash(data) !== item.fileSha256) fail("STAGE_BYTES_MISMATCH");
    const rows = domain === "dbo.compact.state" ? json(data) : data.toString("utf8").split("\n").filter(Boolean).map(line => json(Buffer.from(line)));
    if (!Array.isArray(rows) || rows.length !== item.rows) fail("STAGE_COUNT_MISMATCH");
    if (domain === "dbo.compact.state") stateRows = rows;
    else {
      if (rows.some(row => row?.sourceTable !== domain)) fail("SOURCE_RECORD_INVALID");
      stagedRecords.push(...rows);
    }
  }
  // The state dictionary is not classification authority, but complete current
  // source coverage must still conserve every contract's state usage.
  const usage = new Map();
  for (const row of stagedRecords) {
    try { verifyProductionT2StagedRecord(row); } catch { fail("SOURCE_RECORD_INVALID"); }
    if (row.sourceTable === "dbo.compact") {
      const key = String(row.source.legacyState ?? "").trim(); usage.set(key, (usage.get(key) ?? 0) + 1);
    }
  }
  for (const row of stateRows) {
    exact(row, ["sourceValue", "usageCount"]);
    if (typeof row.sourceValue !== "string" || !row.sourceValue.trim() || !Number.isSafeInteger(row.usageCount) || row.usageCount < 1 || usage.get(row.sourceValue.trim()) !== row.usageCount) fail("STATE_USAGE_MISMATCH");
    usage.delete(row.sourceValue.trim());
  }
  if (usage.size) fail("STATE_USAGE_MISMATCH");
  const { artifact, summary } = buildProductionT2ChangeClassifications({ triple: config.triple, stagedRecords,
    stageFileSha256: stage.domains["dbo.compact_c"].fileSha256, routineEvidence });
  const output = Buffer.from(`${JSON.stringify(artifact)}\n`);
  if (output.length > MAX_FILE) fail("OUTPUT_TOO_LARGE");
  if (typeof config.outputPath !== "string" || !isAbsolute(config.outputPath) || resolve(config.outputPath) !== config.outputPath) fail("OUTPUT_INVALID");
  privateDirectory(dirname(config.outputPath));
  let fd;
  try {
    fd = openSync(config.outputPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    writeFileSync(fd, output); fsyncSync(fd);
  } catch { fail("OUTPUT_FAILED"); } finally { if (fd !== undefined) closeSync(fd); }
  const artifactSha256 = hash(output);
  if (hash(readBytes(config.outputPath, { bytesRead: 0, maximumBytes: MAX_FILE })) !== artifactSha256) fail("OUTPUT_READBACK_FAILED");
  return { ...summary, artifactSha256 };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 2 || args[0] !== "--config") fail("ARGUMENT_INVALID");
    process.stdout.write(`${JSON.stringify(materializeProductionT2ChangeClassifications(args[1]))}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof ProductionT2ChangeClassificationError ? error.code : "T2_CHANGE_CLASSIFICATION_FAILED"}\n`);
    process.exitCode = 1;
  }
}
