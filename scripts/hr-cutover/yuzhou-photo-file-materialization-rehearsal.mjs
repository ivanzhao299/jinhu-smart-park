import { createHash } from "node:crypto";
import { chmod, copyFile, lstat, mkdir, readFile, readdir, rename, rm, stat } from "node:fs/promises";
import { basename, dirname, relative, resolve } from "node:path";

export const YUZHOU_PHOTO_FILE_MATERIALIZATION_MODE = "isolated_synthetic_rehearsal";
export const YUZHOU_PHOTO_FILE_MATERIALIZATION_BIZ_TYPE = "hr_employee_photo";

const SHA256 = /^[0-9a-f]{64}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{5,63}$/u;

export class YuzhouPhotoFileMaterializationError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "YuzhouPhotoFileMaterializationError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new YuzhouPhotoFileMaterializationError(code, detail); };
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const md5 = bytes => createHash("md5").update(bytes).digest("hex");
const isInside = (root, target) => {
  const value = relative(root, target);
  return value !== "" && !value.startsWith("..") && !value.includes("/../") && !value.includes("\\..\\");
};

async function privateDirectory(path, code) {
  const entry = await lstat(path).catch(() => fail(code, "directory is unavailable"));
  if (!entry.isDirectory() || entry.isSymbolicLink() || (entry.mode & 0o777) !== 0o700) fail(code, "directory must be a non-symlink 0700 directory");
  if (typeof process.getuid === "function" && entry.uid !== process.getuid()) fail(code, "directory owner differs from current uid");
  return resolve(path);
}

async function ensurePrivateChildDirectory(root, child) {
  let current = root;
  for (const segment of child.split("/")) {
    current = resolve(current, segment);
    if (!isInside(root, current)) fail("YUZHOU_PHOTO_FILE_MATERIALIZATION_PATH_INVALID", "generated parent escaped storage root");
    const existing = await lstat(current).catch(() => null);
    if (existing) {
      if (!existing.isDirectory() || existing.isSymbolicLink()) fail("YUZHOU_PHOTO_FILE_MATERIALIZATION_TARGET_DIRECTORY_UNSAFE", "generated parent is not a directory");
    } else {
      await mkdir(current, { mode: 0o700 });
    }
    await chmod(current, 0o700);
    await privateDirectory(current, "YUZHOU_PHOTO_FILE_MATERIALIZATION_TARGET_DIRECTORY_UNSAFE");
  }
  return current;
}

async function privateRegularFile(path, code) {
  const link = await lstat(path).catch(() => fail(code, "file is unavailable"));
  const entry = await stat(path).catch(() => fail(code, "file is unavailable"));
  if (!link.isFile() || link.isSymbolicLink() || !entry.isFile() || entry.nlink !== 1 || (entry.mode & 0o777) !== 0o600) fail(code, "file must be a non-symlink 0600 regular nlink=1 file");
  if (typeof process.getuid === "function" && entry.uid !== process.getuid()) fail(code, "file owner differs from current uid");
  return entry;
}

function validateInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("YUZHOU_PHOTO_FILE_MATERIALIZATION_INPUT_INVALID", "input object required");
  const keys = Object.keys(input).sort();
  const required = ["mode", "runId", "stageRoot", "storageRoot", "records"].sort();
  if (JSON.stringify(keys) !== JSON.stringify(required)) fail("YUZHOU_PHOTO_FILE_MATERIALIZATION_INPUT_INVALID", "input keys differ");
  if (input.mode !== YUZHOU_PHOTO_FILE_MATERIALIZATION_MODE) fail("YUZHOU_PHOTO_FILE_MATERIALIZATION_MODE_FORBIDDEN", "only isolated synthetic rehearsal is allowed");
  if (!RUN_ID.test(input.runId ?? "")) fail("YUZHOU_PHOTO_FILE_MATERIALIZATION_RUN_ID_INVALID", "run id invalid");
  if (!Array.isArray(input.records) || input.records.length === 0) fail("YUZHOU_PHOTO_FILE_MATERIALIZATION_RECORDS_INVALID", "non-empty records required");
  return input;
}

function validateRecords(records) {
  const sourceIdentities = new Set();
  const outputHashes = new Set();
  return records.map((record, index) => {
    const required = ["sourceIdentitySha256", "sourceRowSha256", "sourceContentSha256", "normalizedContentSha256", "employeeId", "normalizedFile"].sort();
    if (!record || typeof record !== "object" || Array.isArray(record) || JSON.stringify(Object.keys(record).sort()) !== JSON.stringify(required)) fail("YUZHOU_PHOTO_FILE_MATERIALIZATION_RECORD_INVALID", `record ${index} shape differs`);
    for (const field of ["sourceIdentitySha256", "sourceRowSha256", "sourceContentSha256", "normalizedContentSha256"]) if (!SHA256.test(record[field] ?? "")) fail("YUZHOU_PHOTO_FILE_MATERIALIZATION_RECORD_INVALID", `record ${index} hash invalid`);
    if (!UUID.test(record.employeeId ?? "")) fail("YUZHOU_PHOTO_FILE_MATERIALIZATION_RECORD_INVALID", `record ${index} employee invalid`);
    const expectedName = `${record.normalizedContentSha256}.jpg`;
    if (record.normalizedFile !== expectedName || basename(record.normalizedFile) !== record.normalizedFile) fail("YUZHOU_PHOTO_FILE_MATERIALIZATION_RECORD_INVALID", `record ${index} normalized file invalid`);
    if (sourceIdentities.has(record.sourceIdentitySha256) || outputHashes.has(record.normalizedContentSha256)) fail("YUZHOU_PHOTO_FILE_MATERIALIZATION_DUPLICATE", `record ${index} identity or normalized content duplicate`);
    sourceIdentities.add(record.sourceIdentitySha256);
    outputHashes.add(record.normalizedContentSha256);
    return record;
  });
}

function buildRunRelativeDirectory(runId) {
  return `yuzhou-hr/t5-photo/${runId}`;
}

export function buildYuzhouPhotoFileMaterializationMetadata({ runId, record }) {
  if (!RUN_ID.test(runId ?? "")) fail("YUZHOU_PHOTO_FILE_MATERIALIZATION_RUN_ID_INVALID", "run id invalid");
  const [validated] = validateRecords([record]);
  const storagePath = `${buildRunRelativeDirectory(runId)}/${validated.normalizedContentSha256}.jpg`;
  return Object.freeze({
    bizType: YUZHOU_PHOTO_FILE_MATERIALIZATION_BIZ_TYPE,
    bizId: validated.employeeId,
    mimeType: "image/jpeg",
    sourceIdentitySha256: validated.sourceIdentitySha256,
    sourceRowSha256: validated.sourceRowSha256,
    sourceContentSha256: validated.sourceContentSha256,
    normalizedContentSha256: validated.normalizedContentSha256,
    storagePath
  });
}

export async function materializeYuzhouPhotoFileRehearsal(input) {
  const value = validateInput(input);
  const records = validateRecords(value.records);
  const stageRoot = await privateDirectory(value.stageRoot, "YUZHOU_PHOTO_FILE_MATERIALIZATION_STAGE_UNSAFE");
  const storageRoot = await privateDirectory(value.storageRoot, "YUZHOU_PHOTO_FILE_MATERIALIZATION_STORAGE_UNSAFE");
  const relativeDirectory = buildRunRelativeDirectory(value.runId);
  const outputDirectory = resolve(storageRoot, relativeDirectory);
  const temporaryDirectory = resolve(storageRoot, `.yuzhou-photo-${value.runId}.tmp`);
  if (!isInside(storageRoot, outputDirectory) || !isInside(storageRoot, temporaryDirectory)) fail("YUZHOU_PHOTO_FILE_MATERIALIZATION_PATH_INVALID", "generated target escaped storage root");
  for (const directory of [outputDirectory, temporaryDirectory]) {
    const existing = await lstat(directory).catch(() => null);
    if (existing) fail("YUZHOU_PHOTO_FILE_MATERIALIZATION_RUN_EXISTS", value.runId);
  }
  const metadata = records.map(record => buildYuzhouPhotoFileMaterializationMetadata({ runId: value.runId, record }));
  try {
    const parentDirectory = dirname(outputDirectory);
    if (parentDirectory !== await ensurePrivateChildDirectory(storageRoot, "yuzhou-hr/t5-photo")) fail("YUZHOU_PHOTO_FILE_MATERIALIZATION_PATH_INVALID", "unexpected generated parent");
    await mkdir(temporaryDirectory, { mode: 0o700 });
    await chmod(temporaryDirectory, 0o700);
    const completed = [];
    for (const row of metadata) {
      const source = resolve(stageRoot, `${row.normalizedContentSha256}.jpg`);
      const target = resolve(temporaryDirectory, `${row.normalizedContentSha256}.jpg`);
      if (!isInside(stageRoot, source) || !isInside(temporaryDirectory, target)) fail("YUZHOU_PHOTO_FILE_MATERIALIZATION_PATH_INVALID", "normalized file escaped root");
      await privateRegularFile(source, "YUZHOU_PHOTO_FILE_MATERIALIZATION_STAGE_FILE_UNSAFE");
      const bytes = await readFile(source);
      if (sha256(bytes) !== row.normalizedContentSha256) fail("YUZHOU_PHOTO_FILE_MATERIALIZATION_NORMALIZED_HASH_MISMATCH", row.normalizedContentSha256);
      await copyFile(source, target);
      await chmod(target, 0o600);
      await privateRegularFile(target, "YUZHOU_PHOTO_FILE_MATERIALIZATION_TARGET_FILE_UNSAFE");
      const written = await readFile(target);
      if (sha256(written) !== row.normalizedContentSha256) fail("YUZHOU_PHOTO_FILE_MATERIALIZATION_WRITE_HASH_MISMATCH", row.normalizedContentSha256);
      completed.push(Object.freeze({ ...row, fileSize: written.byteLength, md5: md5(written) }));
    }
    await rename(temporaryDirectory, outputDirectory);
    return Object.freeze({
      mode: value.mode,
      runId: value.runId,
      productionImport: "HOLD",
      storageRelativeDirectory: relativeDirectory,
      files: Object.freeze(completed)
    });
  } catch (error) {
    await rm(temporaryDirectory, { recursive: true, force: true });
    throw error;
  }
}

function validateRollbackReceipt({ mode, runId, files }) {
  if (mode !== YUZHOU_PHOTO_FILE_MATERIALIZATION_MODE) fail("YUZHOU_PHOTO_FILE_MATERIALIZATION_MODE_FORBIDDEN", "only isolated synthetic rehearsal is allowed");
  if (!RUN_ID.test(runId ?? "") || !Array.isArray(files) || files.length === 0) fail("YUZHOU_PHOTO_FILE_MATERIALIZATION_ROLLBACK_INPUT_INVALID", "rollback input invalid");
  return { mode, runId, files };
}

async function assertExactRunDirectory({ storage, directory, runId, files }) {
  await privateDirectory(directory, "YUZHOU_PHOTO_FILE_MATERIALIZATION_TARGET_DIRECTORY_UNSAFE");
  const expected = new Set(files.map(file => {
    if (!file || file.bizType !== YUZHOU_PHOTO_FILE_MATERIALIZATION_BIZ_TYPE || !SHA256.test(file.normalizedContentSha256 ?? "") || file.storagePath !== `${buildRunRelativeDirectory(runId)}/${file.normalizedContentSha256}.jpg`) fail("YUZHOU_PHOTO_FILE_MATERIALIZATION_ROLLBACK_INPUT_INVALID", "metadata does not bind this run");
    return `${file.normalizedContentSha256}.jpg`;
  }));
  if (expected.size !== files.length) fail("YUZHOU_PHOTO_FILE_MATERIALIZATION_ROLLBACK_INPUT_INVALID", "duplicate metadata");
  const actual = await readdir(directory);
  if (actual.length !== expected.size || actual.some(name => !expected.has(name))) fail("YUZHOU_PHOTO_FILE_MATERIALIZATION_ROLLBACK_RESIDUAL_UNSAFE", "directory does not match exact run metadata");
  for (const name of actual) await privateRegularFile(resolve(directory, name), "YUZHOU_PHOTO_FILE_MATERIALIZATION_TARGET_FILE_UNSAFE");
  return expected;
}

export async function prepareYuzhouPhotoFileRehearsalRollback({ mode, runId, storageRoot, files }) {
  const receipt = validateRollbackReceipt({ mode, runId, files });
  const storage = await privateDirectory(storageRoot, "YUZHOU_PHOTO_FILE_MATERIALIZATION_STORAGE_UNSAFE");
  const outputDirectory = resolve(storage, buildRunRelativeDirectory(runId));
  const pendingDirectory = resolve(storage, `.yuzhou-photo-${runId}.rollback`);
  if (!isInside(storage, outputDirectory)) fail("YUZHOU_PHOTO_FILE_MATERIALIZATION_PATH_INVALID", "generated target escaped storage root");
  if (!isInside(storage, pendingDirectory)) fail("YUZHOU_PHOTO_FILE_MATERIALIZATION_PATH_INVALID", "generated pending directory escaped storage root");
  if (await lstat(pendingDirectory).catch(() => null)) fail("YUZHOU_PHOTO_FILE_MATERIALIZATION_RUN_EXISTS", `${runId} rollback pending`);
  await assertExactRunDirectory({ storage, directory: outputDirectory, runId, files });
  await rename(outputDirectory, pendingDirectory);
  return Object.freeze({ mode: receipt.mode, runId: receipt.runId, productionImport: "HOLD", storageRoot: storage, pendingDirectory, files: receipt.files });
}

export async function finalizeYuzhouPhotoFileRehearsalRollback(handle) {
  const receipt = validateRollbackReceipt(handle);
  const storage = await privateDirectory(handle.storageRoot, "YUZHOU_PHOTO_FILE_MATERIALIZATION_STORAGE_UNSAFE");
  const pendingDirectory = resolve(handle.pendingDirectory ?? "");
  if (!isInside(storage, pendingDirectory) || basename(pendingDirectory) !== `.yuzhou-photo-${receipt.runId}.rollback`) fail("YUZHOU_PHOTO_FILE_MATERIALIZATION_ROLLBACK_INPUT_INVALID", "pending directory does not bind this run");
  await assertExactRunDirectory({ storage, directory: pendingDirectory, runId: receipt.runId, files: receipt.files });
  await rm(pendingDirectory, { recursive: true, force: false });
  return Object.freeze({ mode: receipt.mode, runId: receipt.runId, productionImport: "HOLD", binaryObjects: 0 });
}

export async function restoreYuzhouPhotoFileRehearsalRollback(handle) {
  const receipt = validateRollbackReceipt(handle);
  const storage = await privateDirectory(handle.storageRoot, "YUZHOU_PHOTO_FILE_MATERIALIZATION_STORAGE_UNSAFE");
  const outputDirectory = resolve(storage, buildRunRelativeDirectory(receipt.runId));
  const pendingDirectory = resolve(handle.pendingDirectory ?? "");
  if (!isInside(storage, outputDirectory) || !isInside(storage, pendingDirectory) || basename(pendingDirectory) !== `.yuzhou-photo-${receipt.runId}.rollback`) fail("YUZHOU_PHOTO_FILE_MATERIALIZATION_ROLLBACK_INPUT_INVALID", "pending directory does not bind this run");
  if (await lstat(outputDirectory).catch(() => null)) fail("YUZHOU_PHOTO_FILE_MATERIALIZATION_ROLLBACK_RESIDUAL_UNSAFE", "output directory unexpectedly exists");
  await assertExactRunDirectory({ storage, directory: pendingDirectory, runId: receipt.runId, files: receipt.files });
  await rename(pendingDirectory, outputDirectory);
  return Object.freeze({ mode: receipt.mode, runId: receipt.runId, productionImport: "HOLD", restored: true });
}

export async function rollbackYuzhouPhotoFileRehearsal(input) {
  const handle = await prepareYuzhouPhotoFileRehearsalRollback(input);
  return finalizeYuzhouPhotoFileRehearsalRollback(handle);
}
