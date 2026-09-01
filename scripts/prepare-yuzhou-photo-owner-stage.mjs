#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync
} from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { validateSourceRestoreReceipt } from "./hr-cutover/source-restore-receipt.mjs";
import { canonicalT5Baseline } from "./hr-cutover/t5-canonical-baseline.mjs";

const SHA256 = /^[0-9a-f]{64}$/u;
const PHOTO_SOURCE_ROWS = 2949;
const CONTENT_BEARING_ROWS = 2155;
const EMPTY_ROWS = 794;
const fail = detail => { throw new Error(`YUZHOU_PHOTO_OWNER_STAGE_INVALID: ${detail}`); };
const canonical = value => Array.isArray(value)
  ? `[${value.map(canonical).join(",")}]`
  : value && typeof value === "object"
    ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`
    : JSON.stringify(value);
const digest = value => createHash("sha256").update(value).digest("hex");
const fileDigest = path => digest(readFileSync(path));
const mode = path => (statSync(path).mode & 0o777).toString(8);

function requirePrivateRegularFile(path, label) {
  if (!isAbsolute(path) || resolve(path) !== path) fail(`${label} must be an absolute path`);
  let link, actual, info;
  try { link = lstatSync(path); actual = realpathSync(path); info = statSync(actual); }
  catch { fail(`${label} is unavailable`); }
  if (link.isSymbolicLink() || !info.isFile() || info.nlink !== 1 || mode(actual) !== "600") fail(`${label} must be one private regular file`);
  return actual;
}

function requirePrivateDirectory(path, label) {
  if (!isAbsolute(path) || resolve(path) !== path) fail(`${label} must be an absolute path`);
  let link, actual, info;
  try { link = lstatSync(path); actual = realpathSync(path); info = statSync(actual); }
  catch { fail(`${label} is unavailable`); }
  if (link.isSymbolicLink() || !info.isDirectory() || mode(actual) !== "700") fail(`${label} must be a private directory`);
  return actual;
}

function readReceipt(path, baseline) {
  const receiptPath = requirePrivateRegularFile(path, "source restore receipt");
  let receipt;
  try { receipt = validateSourceRestoreReceipt(JSON.parse(readFileSync(receiptPath, "utf8"))); }
  catch { fail("source restore receipt is invalid"); }
  const receiptSha256 = fileDigest(receiptPath);
  if (receiptSha256 !== baseline.sourceRestoreReceiptSha256 || receipt.sourceSnapshotSha256 !== baseline.sourceSnapshotSha256 || receipt.productionImport !== "HOLD") {
    fail("source restore receipt does not bind the canonical T5 baseline");
  }
  return { sourceSnapshotSha256: receipt.sourceSnapshotSha256, sourceRestoreReceiptSha256: receiptSha256 };
}

function readSourceStage(path, baseline) {
  const root = requirePrivateDirectory(path, "T5 source stage");
  const manifestPath = requirePrivateRegularFile(join(root, "manifest.json"), "T5 source manifest");
  let manifest;
  try { manifest = JSON.parse(readFileSync(manifestPath, "utf8")); }
  catch { fail("T5 source manifest is invalid JSON"); }
  if (manifest.productionImport !== "HOLD" || manifest.sensitive !== true || manifest.businessSha256 !== baseline.businessSha256
    || manifest.catalogSha256 !== baseline.catalogSha256 || manifest.mappingContractSha256 !== baseline.mappingContractSha256) {
    fail("T5 source manifest authority mismatch");
  }
  const photo = manifest.domains?.photo;
  if (!photo || photo.sourceObject !== "dbo.person.photo" || photo.rows !== PHOTO_SOURCE_ROWS || typeof photo.file !== "string" || !SHA256.test(photo.fileSha256 ?? "")) {
    fail("T5 photo source contract mismatch");
  }
  const photoPath = requirePrivateRegularFile(join(root, photo.file), "T5 photo source");
  if (fileDigest(photoPath) !== photo.fileSha256) fail("T5 photo source checksum mismatch");
  return { manifest, photoPath, photoSha256: photo.fileSha256 };
}

function parsePhotoRows(path) {
  const rows = [];
  const seen = new Set();
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line) continue;
    let row;
    try { row = JSON.parse(line); }
    catch { fail("photo source JSONL is invalid"); }
    if (!row || typeof row !== "object" || Array.isArray(row) || row.sourceTable !== "dbo.person.photo" || row.fileRole !== "employee_photo"
      || !SHA256.test(row.sourceIdentitySha256 ?? "") || !SHA256.test(row.sourceRowSha256 ?? "") || typeof row.employeeCode !== "string") fail("photo source row contract mismatch");
    if (seen.has(row.sourceIdentitySha256)) fail("duplicate photo source identity");
    seen.add(row.sourceIdentitySha256);
    if (row.readabilityStatus === "empty") {
      if (row.contentSha256 !== null || Number(row.actualSize ?? 0) !== 0) fail("empty photo source row contract mismatch");
      continue;
    }
    if (row.readabilityStatus !== "readable" || !SHA256.test(row.contentSha256 ?? "") || !Number.isSafeInteger(row.actualSize) || row.actualSize < 1
      || !["image/jpeg", "image/png", "image/gif", "image/bmp"].includes(row.detectedMime)) fail("readable photo source row contract mismatch");
    const employeeCode = row.employeeCode.trim();
    if (!employeeCode) fail("photo owner lookup key is empty");
    rows.push({
      sourceTable: "dbo.person.photo",
      sourceIdentitySha256: row.sourceIdentitySha256,
      sourceRowSha256: row.sourceRowSha256,
      ownerSourceTable: "dbo.person",
      ownerSourceIdentitySha256: digest(`dbo.person\0${employeeCode}`),
      fileRole: "employee_photo",
      contentSha256: row.contentSha256,
      actualSize: row.actualSize,
      detectedMime: row.detectedMime,
      readabilityStatus: "readable"
    });
  }
  if (seen.size !== PHOTO_SOURCE_ROWS || rows.length !== CONTENT_BEARING_ROWS || seen.size - rows.length !== EMPTY_ROWS) fail("photo source aggregate contract mismatch");
  return rows.sort((left, right) => left.sourceIdentitySha256.localeCompare(right.sourceIdentitySha256));
}

function parseArgs(argv) {
  const values = {}, input = argv[0] === "--" ? argv.slice(1) : argv;
  const allowed = new Set(["--source-a", "--source-b", "--source-restore-receipt", "--output-root", "--run-id"]);
  for (let index = 0; index < input.length; index += 2) {
    const key = input[index], value = input[index + 1];
    if (!allowed.has(key) || !value || Object.hasOwn(values, key)) fail("arguments");
    values[key] = value;
  }
  if (Object.keys(values).length !== allowed.size || !/^[A-Za-z0-9][A-Za-z0-9._-]{5,63}$/u.test(values["--run-id"])) fail("arguments");
  return values;
}

export function prepareYuzhouPhotoOwnerStage(input) {
  const baseline = input.baseline ?? canonicalT5Baseline();
  if (![input.sourceRestoreReceipt, input.sourceA, input.sourceB, input.outputRoot].every(isAbsolute)) fail("all filesystem arguments must be absolute paths");
  const receipt = readReceipt(input.sourceRestoreReceipt, baseline);
  const sourceA = readSourceStage(input.sourceA, baseline);
  const sourceB = readSourceStage(input.sourceB, baseline);
  if (sourceA.photoSha256 !== sourceB.photoSha256) fail("A/B photo source file mismatch");
  const rowsA = parsePhotoRows(sourceA.photoPath), rowsB = parsePhotoRows(sourceB.photoPath);
  const canonicalRowsA = canonical(rowsA), canonicalRowsB = canonical(rowsB);
  if (canonicalRowsA !== canonicalRowsB) fail("A/B owner hash stage mismatch");
  const outputRoot = requirePrivateDirectory(input.outputRoot, "photo owner output root"), output = join(outputRoot, `staging-${input.runId}`);
  if (existsSync(output)) fail("output stage already exists");
  mkdirSync(output, { mode: 0o700 }); chmodSync(output, 0o700);
  const photoFile = "photo-owner-evidence.jsonl", photoPath = join(output, photoFile);
  writeFileSync(photoPath, `${rowsA.map(row => JSON.stringify(row)).join("\n")}\n`, { flag: "wx", mode: 0o600 }); chmodSync(photoPath, 0o600);
  const domains = { photo: { sourceObject: "dbo.person.photo", rows: rowsA.length, file: photoFile, fileSha256: fileDigest(photoPath) } };
  const business = {
    formatVersion: 1, artifactKind: "yuzhou_t5_photo_owner_stage", sourceSnapshotSha256: receipt.sourceSnapshotSha256,
    sourceRestoreReceiptSha256: receipt.sourceRestoreReceiptSha256, sourceBusinessSha256: sourceA.manifest.businessSha256,
    sourceCatalogSha256: sourceA.manifest.catalogSha256, sourcePhotoFileSha256: sourceA.photoSha256,
    ownerLookupAlgorithm: "sha256(dbo.person\\0+trim(person))", domains
  };
  const manifest = {
    ...business, runId: input.runId, sourceRows: rowsA.length, excludedEmptyRows: EMPTY_ROWS,
    stageSha256: digest(canonical(business)), productionImport: "HOLD"
  };
  const manifestPath = join(output, "manifest.json");
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx", mode: 0o600 }); chmodSync(manifestPath, 0o600);
  return { sourceRows: rowsA.length, excludedEmptyRows: EMPTY_ROWS, stageSha256: manifest.stageSha256, productionImport: "HOLD" };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = prepareYuzhouPhotoOwnerStage({
      sourceA: args["--source-a"], sourceB: args["--source-b"], sourceRestoreReceipt: args["--source-restore-receipt"],
      outputRoot: args["--output-root"], runId: args["--run-id"]
    });
    process.stdout.write(`${JSON.stringify({ status: "PASS", sourceRows: result.sourceRows, excludedEmptyRows: result.excludedEmptyRows, stageSha256: result.stageSha256, productionImport: result.productionImport })}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
