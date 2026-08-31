#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync
} from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { validateSourceRestoreReceipt } from "./hr-cutover/source-restore-receipt.mjs";
import { canonicalT5Baseline } from "./hr-cutover/t5-canonical-baseline.mjs";

const SHA256 = /^[0-9a-f]{64}$/u;
const DOCUMENT_SOURCE_ROWS = 1003;
const DOCUMENT_OWNER_RESOLVED_ROWS = 989;
const DOCUMENT_OWNER_UNMATCHED_ROWS = 14;
const fail = detail => { throw new Error(`YUZHOU_DOCUMENT_OWNER_STAGE_INVALID: ${detail}`); };
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
  const sourceRestoreReceiptSha256 = fileDigest(receiptPath);
  if (sourceRestoreReceiptSha256 !== baseline.sourceRestoreReceiptSha256 || receipt.sourceSnapshotSha256 !== baseline.sourceSnapshotSha256 || receipt.productionImport !== "HOLD") {
    fail("source restore receipt does not bind the canonical T5 baseline");
  }
  return { sourceSnapshotSha256: receipt.sourceSnapshotSha256, sourceRestoreReceiptSha256 };
}

function readStage(path, baseline) {
  const root = requirePrivateDirectory(path, "T5 source stage");
  const manifestPath = requirePrivateRegularFile(join(root, "manifest.json"), "T5 source manifest");
  let manifest;
  try { manifest = JSON.parse(readFileSync(manifestPath, "utf8")); }
  catch { fail("T5 source manifest is invalid JSON"); }
  if (manifest.productionImport !== "HOLD" || manifest.sensitive !== true || manifest.businessSha256 !== baseline.businessSha256
    || manifest.catalogSha256 !== baseline.catalogSha256 || manifest.mappingContractSha256 !== baseline.mappingContractSha256) fail("T5 source manifest authority mismatch");
  const domains = manifest.domains ?? {}, docs = domains.docs, people = domains.person_core;
  for (const [name, domain, sourceObject, rows] of [["docs", docs, "dbo.docs", DOCUMENT_SOURCE_ROWS], ["person_core", people, "dbo.person.core_residue", 2949]]) {
    if (!domain || domain.sourceObject !== sourceObject || domain.rows !== rows || typeof domain.file !== "string" || !SHA256.test(domain.fileSha256 ?? "")) fail(`${name} source contract mismatch`);
    const file = requirePrivateRegularFile(join(root, domain.file), `${name} source`);
    if (fileDigest(file) !== domain.fileSha256) fail(`${name} source checksum mismatch`);
    domain.path = file;
  }
  return { manifest, docsPath: docs.path, peoplePath: people.path, docsSha256: docs.fileSha256, peopleSha256: people.fileSha256 };
}

function readJsonLines(path, label) {
  const rows = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line) continue;
    try { rows.push(JSON.parse(line.replaceAll("\\\\", "\\"))); }
    catch { fail(`${label} JSONL is invalid`); }
  }
  return rows;
}

function stageRows(docsPath, peoplePath) {
  const peopleById = new Map();
  for (const row of readJsonLines(peoplePath, "person core source")) {
    const id = String(row?.source?.id ?? "").trim(), employeeCode = String(row?.source?.person ?? "").trim();
    if (row?.sourceTable !== "dbo.person.core_residue" || !id || !employeeCode || peopleById.has(id)) fail("person core owner map is invalid");
    peopleById.set(id, employeeCode);
  }
  if (peopleById.size !== 2949) fail("person core owner map count mismatch");
  const seen = new Set(), rows = [];
  for (const row of readJsonLines(docsPath, "document source")) {
    const sourceIdentitySha256 = row?.sourceIdentitySha256, sourceRowSha256 = row?.sourceRowSha256, pkid = String(row?.source?.pkid ?? "").trim();
    if (row?.sourceTable !== "dbo.docs" || row?.fileRole !== "employee_document" || !SHA256.test(sourceIdentitySha256 ?? "") || !SHA256.test(sourceRowSha256 ?? "") || !pkid || seen.has(sourceIdentitySha256)) fail("document source row contract mismatch");
    if (row.contentSha256 !== null || row.actualSize !== null || row.readabilityStatus !== "empty") fail("document binary boundary drift");
    seen.add(sourceIdentitySha256);
    const employeeCode = peopleById.get(pkid) ?? null;
    rows.push({
      sourceTable: "dbo.docs", sourceIdentitySha256, sourceRowSha256, ownerSourceTable: "dbo.person",
      ownerSourceIdentitySha256: employeeCode ? digest(`dbo.person\0${employeeCode}`) : null,
      fileRole: "employee_document", contentSha256: null, actualSize: 0, readabilityStatus: "empty",
      ownershipStatus: employeeCode ? "mapped" : "quarantined", quarantineReason: employeeCode ? null : "DOCUMENT_OWNER_UNMAPPED"
    });
  }
  const mapped = rows.filter(row => row.ownershipStatus === "mapped").length;
  if (seen.size !== DOCUMENT_SOURCE_ROWS || mapped !== DOCUMENT_OWNER_RESOLVED_ROWS || rows.length - mapped !== DOCUMENT_OWNER_UNMATCHED_ROWS) fail("document owner aggregate contract mismatch");
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

export function prepareYuzhouDocumentOwnerStage(input) {
  const baseline = input.baseline ?? canonicalT5Baseline();
  if (![input.sourceRestoreReceipt, input.sourceA, input.sourceB, input.outputRoot].every(isAbsolute)) fail("all filesystem arguments must be absolute paths");
  const receipt = readReceipt(input.sourceRestoreReceipt, baseline), sourceA = readStage(input.sourceA, baseline), sourceB = readStage(input.sourceB, baseline);
  if (sourceA.docsSha256 !== sourceB.docsSha256 || sourceA.peopleSha256 !== sourceB.peopleSha256) fail("A/B document source file mismatch");
  const rowsA = stageRows(sourceA.docsPath, sourceA.peoplePath), rowsB = stageRows(sourceB.docsPath, sourceB.peoplePath);
  if (canonical(rowsA) !== canonical(rowsB)) fail("A/B document owner stage mismatch");
  const outputRoot = requirePrivateDirectory(input.outputRoot, "document owner output root"), output = join(outputRoot, `staging-${input.runId}`);
  if (existsSync(output)) fail("output stage already exists");
  mkdirSync(output, { mode: 0o700 }); chmodSync(output, 0o700);
  const file = "document-owner-evidence.jsonl", path = join(output, file);
  writeFileSync(path, `${rowsA.map(row => JSON.stringify(row)).join("\n")}\n`, { flag: "wx", mode: 0o600 }); chmodSync(path, 0o600);
  const mappedRows = rowsA.filter(row => row.ownershipStatus === "mapped").length;
  const business = {
    formatVersion: 1, artifactKind: "yuzhou_t5_document_owner_stage", sourceSnapshotSha256: receipt.sourceSnapshotSha256,
    sourceRestoreReceiptSha256: receipt.sourceRestoreReceiptSha256, sourceBusinessSha256: sourceA.manifest.businessSha256,
    sourceCatalogSha256: sourceA.manifest.catalogSha256, sourceDocumentFileSha256: sourceA.docsSha256, sourcePersonCoreFileSha256: sourceA.peopleSha256,
    ownerLookupAlgorithm: "dbo.docs.pkid->dbo.person.id->sha256(dbo.person\\0+trim(person))",
    domains: { docs: { sourceObject: "dbo.docs", rows: rowsA.length, file, fileSha256: fileDigest(path) } }
  };
  const manifest = { ...business, runId: input.runId, sourceRows: rowsA.length, resolvedRows: mappedRows, quarantinedRows: rowsA.length - mappedRows, stageSha256: digest(canonical(business)), productionImport: "HOLD" };
  writeFileSync(join(output, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx", mode: 0o600 }); chmodSync(join(output, "manifest.json"), 0o600);
  return { sourceRows: rowsA.length, resolvedRows: mappedRows, quarantinedRows: rowsA.length - mappedRows, stageSha256: manifest.stageSha256, productionImport: "HOLD" };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = prepareYuzhouDocumentOwnerStage({ sourceA: args["--source-a"], sourceB: args["--source-b"], sourceRestoreReceipt: args["--source-restore-receipt"], outputRoot: args["--output-root"], runId: args["--run-id"] });
    process.stdout.write(`${JSON.stringify({ status: "PASS", ...result })}\n`);
  } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
