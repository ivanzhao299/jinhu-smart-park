#!/usr/bin/env node
/* global process */
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync
} from "node:fs";
import { basename, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const SHA256 = /^[0-9a-f]{64}$/;
const CODE_SHA = /^[0-9a-f]{40}$/;
const RUN_ID = /^yzfull-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{8}-r([AB])$/;
const LAB_DATABASE = /^jinhu_hr_migration_lab_full_[a-z0-9_]{6,48}$/;
const CONTAINER = /^[A-Za-z0-9][A-Za-z0-9_.-]{2,80}$/;
const ROLE = /^[a-z][a-z0-9_]{5,62}$/;
const FORBIDDEN_KEY = /password|passwd|token|secret|connectionstring|privatekey|bankaccount|idcard|employeename|fullname|mobile|phone|salaryamount|grosspay|netpay/i;
const SAFE_KEYS = new Set(["containsSecrets"]);
const FORBIDDEN_VALUE = /postgres(?:ql)?:\/\/|sqlserver:\/\/|Bearer\s+|BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY|AKIA[0-9A-Z]{16}/i;

export class BackupRestoreVerificationError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "BackupRestoreVerificationError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new BackupRestoreVerificationError(code, detail); };
export const sha256 = (value) => createHash("sha256").update(value).digest("hex");
export const canonicalJson = (value) => {
  if (value === null) return "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
};
export const hashCanonical = (value) => sha256(Buffer.from(`${canonicalJson(value)}\n`));

export function validateDualMigrationHistory(value) {
  if (typeof value !== "string" || !value.trim()) fail("MIGRATION_HISTORY_INVALID", "migration history is empty");
  const sources = { primary: new Map(), standard: new Map() };
  for (const line of value.trim().split("\n")) {
    const fields = line.split(",");
    if (fields.length !== 4 || !Object.hasOwn(sources, fields[0]) || !fields[1] || !SHA256.test(fields[2]) || fields[3] !== "succeeded") fail("MIGRATION_HISTORY_INVALID", "dual migration history row is invalid");
    if (sources[fields[0]].has(fields[1])) fail("MIGRATION_HISTORY_INVALID", "duplicate migration history row");
    sources[fields[0]].set(fields[1], `${fields[2]}:${fields[3]}`);
  }
  if (canonicalJson([...sources.primary]) !== canonicalJson([...sources.standard])) fail("MIGRATION_HISTORY_DIVERGED", "migration history tables differ");
  return { ok: true, rowCount: sources.primary.size };
}

function exactKeys(value, required, optional, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("BACKUP_RESTORE_EVIDENCE_INVALID", `${label} must be an object`);
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) if (!allowed.has(key)) fail("BACKUP_RESTORE_EVIDENCE_INVALID", `${label}.${key} is not allowed`);
  for (const key of required) if (!Object.hasOwn(value, key)) fail("BACKUP_RESTORE_EVIDENCE_INVALID", `${label}.${key} is required`);
}

function scanSensitive(value, at = "$") {
  if (Array.isArray(value)) return value.forEach((entry, index) => scanSensitive(entry, `${at}[${index}]`));
  if (value && typeof value === "object") return Object.entries(value).forEach(([key, child]) => {
    if (FORBIDDEN_KEY.test(key) && !SAFE_KEYS.has(key)) fail("SECRET_PATTERN_DETECTED", `${at}.${key}`);
    scanSensitive(child, `${at}.${key}`);
  });
  if (typeof value === "string" && FORBIDDEN_VALUE.test(value)) fail("SECRET_PATTERN_DETECTED", at);
}

function assertSha(value, label) {
  if (!SHA256.test(value ?? "")) fail("BACKUP_RESTORE_EVIDENCE_INVALID", `${label} must be a lowercase SHA-256`);
}

function assertNonnegativeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) fail("BACKUP_RESTORE_EVIDENCE_INVALID", `${label} must be a nonnegative safe integer`);
}

function mode(path) {
  return (statSync(path).mode & 0o777).toString(8).padStart(4, "0");
}

function safeRelative(root, path) {
  const value = relative(root, path).split(sep).join("/");
  if (!value || value.startsWith("../") || value === ".." || isAbsolute(value)) fail("FILE_TREE_PATH_ESCAPE", value);
  return value;
}

export function inventoryFileTree(root) {
  const normalizedRoot = resolve(root);
  if (!existsSync(normalizedRoot) || lstatSync(normalizedRoot).isSymbolicLink() || !statSync(normalizedRoot).isDirectory()) fail("FILE_TREE_ROOT_INVALID", basename(normalizedRoot));
  const files = [];
  const directories = [];
  const visit = (directory) => {
    for (const name of readdirSync(directory).sort()) {
      const path = resolve(directory, name);
      const info = lstatSync(path);
      if (info.isSymbolicLink()) fail("FILE_TREE_SYMLINK_DENIED", safeRelative(normalizedRoot, path));
      if (info.isDirectory()) {
        directories.push(safeRelative(normalizedRoot, path));
        visit(path);
      }
      else if (info.isFile()) {
        if ((info.mode & 0o444) === 0) fail("FILE_TREE_UNREADABLE", safeRelative(normalizedRoot, path));
        let bytes;
        try { bytes = readFileSync(path); } catch { fail("FILE_TREE_UNREADABLE", safeRelative(normalizedRoot, path)); }
        files.push({ relativePath: safeRelative(normalizedRoot, path), bytes: bytes.length, sha256: sha256(bytes) });
      } else fail("FILE_TREE_OBJECT_DENIED", safeRelative(normalizedRoot, path));
    }
  };
  visit(normalizedRoot);
  return { directories, files };
}

export function buildFileTreeManifest(root) {
  const entries = inventoryFileTree(root).files;
  return {
    version: 1,
    entryCount: entries.length,
    totalBytes: entries.reduce((total, entry) => total + entry.bytes, 0),
    canonicalSha256: hashCanonical(entries)
  };
}

export function copyFileTree(sourceRoot, destinationRoot) {
  const source = resolve(sourceRoot);
  const destination = resolve(destinationRoot);
  if (!existsSync(source) || lstatSync(source).isSymbolicLink() || !statSync(source).isDirectory()) fail("FILE_TREE_ROOT_INVALID", basename(source));
  if (existsSync(destination)) fail("RESTORE_FILE_TARGET_EXISTS", basename(destination));
  mkdirSync(destination, { recursive: false, mode: 0o700 });
  chmodSync(destination, 0o700);
  const visit = (sourceDirectory) => {
    for (const name of readdirSync(sourceDirectory).sort()) {
      const sourcePath = resolve(sourceDirectory, name);
      const relativePath = safeRelative(source, sourcePath);
      const destinationPath = resolve(destination, relativePath);
      if (!destinationPath.startsWith(`${destination}${sep}`)) fail("FILE_TREE_PATH_ESCAPE", relativePath);
      const info = lstatSync(sourcePath);
      if (info.isSymbolicLink()) fail("FILE_TREE_SYMLINK_DENIED", relativePath);
      if (info.isDirectory()) {
        mkdirSync(destinationPath, { recursive: false, mode: 0o700 });
        chmodSync(destinationPath, 0o700);
        visit(sourcePath);
      } else if (info.isFile()) {
        try { copyFileSync(sourcePath, destinationPath); } catch { fail("FILE_TREE_UNREADABLE", relativePath); }
        chmodSync(destinationPath, 0o600);
      } else fail("FILE_TREE_OBJECT_DENIED", relativePath);
    }
  };
  visit(source);
  return buildFileTreeManifest(destination);
}

export function normalizeToc(value) {
  if (typeof value !== "string") fail("TOC_INVALID", "TOC must be text");
  return `${value.split(/\r?\n/u)
    .map((line) => line.trim().replace(/\s+/gu, " "))
    .filter((line) => line && !line.startsWith(";"))
    .join("\n")}\n`;
}

function assertFileTree(value, label) {
  exactKeys(value, ["version", "entryCount", "totalBytes", "canonicalSha256"], [], label);
  if (value.version !== 1) fail("BACKUP_RESTORE_EVIDENCE_INVALID", `${label}.version`);
  assertNonnegativeInteger(value.entryCount, `${label}.entryCount`);
  assertNonnegativeInteger(value.totalBytes, `${label}.totalBytes`);
  assertSha(value.canonicalSha256, `${label}.canonicalSha256`);
}

function assertFacts(value, label) {
  exactKeys(value, ["migrationHistorySha256", "platformCatalogSha256", "hrLedgerSha256", "hrGlobalSha256", "hrDomainHashes", "quarantineLedgerSha256", "sideEffectSha256", "fileTree"], [], label);
  for (const field of ["migrationHistorySha256", "platformCatalogSha256", "hrLedgerSha256", "hrGlobalSha256", "quarantineLedgerSha256", "sideEffectSha256"]) assertSha(value[field], `${label}.${field}`);
  exactKeys(value.hrDomainHashes, ["T0", "T1", "T2", "T3", "T4", "T5"], [], `${label}.hrDomainHashes`);
  for (const domain of ["T0", "T1", "T2", "T3", "T4", "T5"]) assertSha(value.hrDomainHashes[domain], `${label}.hrDomainHashes.${domain}`);
  assertFileTree(value.fileTree, `${label}.fileTree`);
}

export function verifyRestoreEquality(before, restored) {
  assertFacts(before, "before");
  assertFacts(restored, "restored");
  const compare = (left, right, code, detail) => {
    if (canonicalJson(left) !== canonicalJson(right)) fail(code, detail);
    return true;
  };
  return {
    migrationHistory: compare(before.migrationHistorySha256, restored.migrationHistorySha256, "RESTORE_MIGRATION_HISTORY_MISMATCH", "migration history differs"),
    platformCatalog: compare(before.platformCatalogSha256, restored.platformCatalogSha256, "RESTORE_PLATFORM_CATALOG_MISMATCH", "platform catalog differs"),
    hrLedger: compare(before.hrLedgerSha256, restored.hrLedgerSha256, "RESTORE_HR_LEDGER_MISMATCH", "HR ledger differs"),
    hrCanonical: compare({ global: before.hrGlobalSha256, domains: before.hrDomainHashes }, { global: restored.hrGlobalSha256, domains: restored.hrDomainHashes }, "RESTORE_HR_CANONICAL_MISMATCH", "HR canonical facts differ"),
    quarantineLedger: compare(before.quarantineLedgerSha256, restored.quarantineLedgerSha256, "RESTORE_QUARANTINE_LEDGER_MISMATCH", "quarantine ledger differs"),
    sideEffects: compare(before.sideEffectSha256, restored.sideEffectSha256, "RESTORE_SIDE_EFFECT_MISMATCH", "side-effect facts differ"),
    files: compare(before.fileTree, restored.fileTree, "RESTORE_FILE_TREE_MISMATCH", "file tree differs")
  };
}

function assertArtifact(value, label) {
  exactKeys(value, ["relativePath", "sha256", "bytes", "mode"], [], label);
  if (typeof value.relativePath !== "string" || !value.relativePath || isAbsolute(value.relativePath) || value.relativePath.split(/[\\/]/u).includes("..")) fail("BACKUP_RESTORE_EVIDENCE_INVALID", `${label}.relativePath`);
  assertSha(value.sha256, `${label}.sha256`);
  assertNonnegativeInteger(value.bytes, `${label}.bytes`);
  if (value.mode !== "0600") fail("BACKUP_RESTORE_EVIDENCE_INVALID", `${label}.mode`);
}

export function validateBackupRestoreEvidence(evidence) {
  exactKeys(evidence, ["formatVersion", "evidenceKind", "status", "parentRunId", "rehearsal", "triple", "target", "backup", "fault", "before", "restored", "equality", "timing", "security", "productionImport", "productionRestore"], [], "$");
  scanSensitive(evidence);
  if (evidence.formatVersion !== 1 || evidence.evidenceKind !== "yuzhou_hr_rehearsal_backup_restore" || evidence.status !== "PASS") fail("BACKUP_RESTORE_EVIDENCE_INVALID", "identity/status");
  const match = RUN_ID.exec(evidence.parentRunId ?? "");
  if (!match || match[1] !== evidence.rehearsal || !["A", "B"].includes(evidence.rehearsal)) fail("BACKUP_RESTORE_EVIDENCE_INVALID", "run/rehearsal binding");
  exactKeys(evidence.triple, ["codeSha", "sourceSnapshotHash", "mappingContractHash"], [], "triple");
  if (!CODE_SHA.test(evidence.triple.codeSha ?? "")) fail("BACKUP_RESTORE_EVIDENCE_INVALID", "triple.codeSha");
  assertSha(evidence.triple.sourceSnapshotHash, "triple.sourceSnapshotHash");
  assertSha(evidence.triple.mappingContractHash, "triple.mappingContractHash");
  exactKeys(evidence.target, ["composeProject", "postgresContainer", "sourceDatabase", "restoreDatabase", "restoreRole"], [], "target");
  for (const field of ["composeProject", "sourceDatabase", "restoreDatabase"]) if (!LAB_DATABASE.test(evidence.target[field] ?? "")) fail("BACKUP_RESTORE_EVIDENCE_INVALID", `target.${field}`);
  if (!CONTAINER.test(evidence.target.postgresContainer ?? "") || !ROLE.test(evidence.target.restoreRole ?? "") || evidence.target.composeProject !== evidence.target.sourceDatabase || evidence.target.restoreDatabase === evidence.target.sourceDatabase) fail("BACKUP_RESTORE_EVIDENCE_INVALID", "target identity binding");
  exactKeys(evidence.backup, ["format", "dump", "toc", "normalizedTocSha256", "fileSnapshot"], [], "backup");
  if (evidence.backup.format !== "pg_dump_custom") fail("BACKUP_RESTORE_EVIDENCE_INVALID", "backup.format");
  assertArtifact(evidence.backup.dump, "backup.dump");
  assertArtifact(evidence.backup.toc, "backup.toc");
  assertSha(evidence.backup.normalizedTocSha256, "backup.normalizedTocSha256");
  assertFileTree(evidence.backup.fileSnapshot, "backup.fileSnapshot");
  exactKeys(evidence.fault, ["faultId", "status", "detectorCode", "reverted", "targetIdentitySha256"], [], "fault");
  const expectedDetector = { REGISTERED_FILE_UNREADABLE: "FILE_TREE_UNREADABLE" }[evidence.fault.faultId];
  if (!expectedDetector || evidence.fault.status !== "DETECTED" || evidence.fault.detectorCode !== expectedDetector || evidence.fault.reverted !== true) fail("BACKUP_RESTORE_EVIDENCE_INVALID", "fault proof");
  assertSha(evidence.fault.targetIdentitySha256, "fault.targetIdentitySha256");
  assertFacts(evidence.before, "before");
  assertFacts(evidence.restored, "restored");
  const equality = verifyRestoreEquality(evidence.before, evidence.restored);
  exactKeys(evidence.equality, ["migrationHistory", "platformCatalog", "hrLedger", "hrCanonical", "quarantineLedger", "sideEffects", "files"], [], "equality");
  if (Object.entries(equality).some(([key, value]) => value !== true || evidence.equality[key] !== true)) fail("BACKUP_RESTORE_EVIDENCE_INVALID", "equality flags");
  exactKeys(evidence.timing, ["clock", "dumpBoundaryEpochMs", "restoreStartedEpochMs", "verifiedReadyEpochMs", "rtoObservedMs", "rpoObservedObjects", "targetApproval"], [], "timing");
  for (const field of ["dumpBoundaryEpochMs", "restoreStartedEpochMs", "verifiedReadyEpochMs", "rtoObservedMs", "rpoObservedObjects"]) assertNonnegativeInteger(evidence.timing[field], `timing.${field}`);
  if (evidence.timing.clock !== "monotonic_plus_utc_epoch_ms" || evidence.timing.restoreStartedEpochMs < evidence.timing.dumpBoundaryEpochMs || evidence.timing.verifiedReadyEpochMs < evidence.timing.restoreStartedEpochMs || evidence.timing.rpoObservedObjects !== 0 || evidence.timing.targetApproval !== "UNAPPROVED") fail("BACKUP_RESTORE_EVIDENCE_INVALID", "timing/RPO approval");
  exactKeys(evidence.security, ["directoryMode", "fileMode", "containsSecrets", "containsPersonalValues"], [], "security");
  if (evidence.security.directoryMode !== "0700" || evidence.security.fileMode !== "0600" || evidence.security.containsSecrets !== false || evidence.security.containsPersonalValues !== false) fail("UNSAFE_FILE_PERMISSION", "security modes/contents");
  if (evidence.productionImport !== "HOLD" || evidence.productionRestore !== "HOLD") fail("PRODUCTION_OPERATION_NOT_HOLD", "production operations remain unavailable");
  return { ok: true, parentRunId: evidence.parentRunId, status: evidence.status, productionImport: "HOLD", productionRestore: "HOLD" };
}

export function writePrivateJson(path, value) {
  const parent = resolve(path, "..");
  if (!existsSync(parent)) mkdirSync(parent, { recursive: true, mode: 0o700 });
  chmodSync(parent, 0o700);
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  chmodSync(path, 0o600);
  return { sha256: sha256(readFileSync(path)), bytes: statSync(path).size, mode: mode(path) };
}

function parse(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--evidence") args.evidence = argv[++index];
    else fail("CLI_ARGUMENT_INVALID", argv[index]);
  }
  if (!args.evidence) fail("CLI_ARGUMENT_INVALID", "--evidence <json>");
  return args;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parse(process.argv.slice(2));
    const evidence = JSON.parse(readFileSync(resolve(args.evidence), "utf8"));
    process.stdout.write(`${JSON.stringify(validateBackupRestoreEvidence(evidence))}\n`);
  } catch (error) {
    process.stderr.write(`${error.code ?? "BACKUP_RESTORE_VERIFY_FAILED"}: ${error.message.replace(/^.*?: /u, "")}\n`);
    process.exitCode = 1;
  }
}
