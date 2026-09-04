#!/usr/bin/env node
/**
 * Freezes the receipt-bound T3 attendance and insurance stage into hash-only
 * production-import provenance. Raw values never enter the output artifact.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, lstatSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { verifyProductionSourceManifest } from "../prepare-yuzhou-production-source-manifest.mjs";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const CODE_SHA = /^[0-9a-f]{40}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const PHASE = "T3";
const DOMAINS = Object.freeze({
  attendance: Object.freeze({ file: "attendance.jsonl", sourceTable: "dbo.timekeeptable" }),
  policies: Object.freeze({ file: "policies.jsonl", sourceTable: "dbo.insure_method" }),
  insurance: Object.freeze({ file: "insurance.jsonl", sourceTable: "dbo.person_insure" }),
});
const TARGET_TABLES = Object.freeze([
  "hr_attendance_import_batch",
  "hr_attendance_symbol_rule",
  "hr_attendance_calendar_source",
  "hr_attendance_day",
  "hr_insurance_policy",
  "hr_insurance_policy_item",
  "hr_employee_insurance_period",
  "hr_employee_insurance_item",
]);

export class ProductionT3PhaseArtifactError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "ProductionT3PhaseArtifactError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new ProductionT3PhaseArtifactError(code, detail); };
const sha256 = value => createHash("sha256").update(value).digest("hex");
const mode = path => statSync(path).mode & 0o777;
const plain = value => value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : plain(value) ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}` : JSON.stringify(value);

function exact(value, keys, code, label) {
  if (!plain(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) fail(code, label);
}

function requirePrivateDirectory(path, label) {
  if (!isAbsolute(path) || !existsSync(path)) fail("PRODUCTION_IMPORT_T3_ARTIFACT_PATH_INVALID", label);
  const entry = lstatSync(path);
  if (entry.isSymbolicLink() || !entry.isDirectory() || mode(path) !== 0o700) fail("PRODUCTION_IMPORT_T3_ARTIFACT_PATH_INVALID", label);
  return resolve(path);
}

function requirePrivateFile(path, label) {
  if (!isAbsolute(path) || !existsSync(path)) fail("PRODUCTION_IMPORT_T3_ARTIFACT_INPUT_MISSING", label);
  const entry = lstatSync(path);
  if (entry.isSymbolicLink() || !entry.isFile() || entry.nlink !== 1 || mode(path) !== 0o600) fail("PRODUCTION_IMPORT_T3_ARTIFACT_PATH_INVALID", label);
  return resolve(path);
}

function readJson(path, code, label) {
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch { fail(code, label); }
}

function currentHead() {
  const result = spawnSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const value = String(result.stdout ?? "").trim();
  if (result.status !== 0 || !CODE_SHA.test(value)) fail("PRODUCTION_IMPORT_T3_ARTIFACT_CODE_INVALID", "HEAD");
  return value;
}

function readTriple(path, head) {
  const triple = readJson(requirePrivateFile(path, "triple"), "PRODUCTION_IMPORT_T3_ARTIFACT_TRIPLE_INVALID", "JSON");
  exact(triple, ["codeSha", "sourceSnapshotHash", "mappingContractHash"], "PRODUCTION_IMPORT_T3_ARTIFACT_TRIPLE_INVALID", "C/S/M");
  if (!CODE_SHA.test(triple.codeSha ?? "") || !SHA256.test(triple.sourceSnapshotHash ?? "") || !SHA256.test(triple.mappingContractHash ?? "") || triple.codeSha !== head) fail("PRODUCTION_IMPORT_T3_ARTIFACT_TRIPLE_INVALID", "C/S/M");
  return Object.freeze({ ...triple });
}

function readSourceManifest(path, triple) {
  const manifest = readJson(requirePrivateFile(path, "source manifest"), "PRODUCTION_IMPORT_T3_ARTIFACT_SOURCE_MANIFEST_INVALID", "JSON");
  try { verifyProductionSourceManifest(manifest); }
  catch { fail("PRODUCTION_IMPORT_T3_ARTIFACT_SOURCE_MANIFEST_INVALID", "contract"); }
  if (manifest.sourceSnapshotSha256 !== triple.sourceSnapshotHash || manifest.mappingContractSha256 !== triple.mappingContractHash) fail("PRODUCTION_IMPORT_T3_ARTIFACT_SOURCE_MANIFEST_DRIFT", "C/S/M");
  return manifest;
}

function record({ targetTable, sourceTable, sourceIdentitySha256, sourceRowSha256 }) {
  return { phase: PHASE, targetTable, sourceSystem: "yuzhou-v10", sourceTable, sourcePkCanonical: `sha256:${sourceIdentitySha256}`, sourceIdentitySha256, sourceRowSha256 };
}

function projected(rawIdentity, targetTable, discriminator, sourceRowSha256) {
  const sourceIdentitySha256 = sha256(`yuzhou-hr-production-source-projection-v1\0${rawIdentity}\0${targetTable}\0${discriminator}`);
  return { sourceIdentitySha256, sourceRowSha256: sha256(canonical({ parentSourceRowSha256: sourceRowSha256, discriminator })) };
}

function validateBaseRow(row, sourceTable, extraKey) {
  exact(row, ["sourceTable", "sourceKey", "sourceIdentitySha256", "sourceRowSha256", "source", extraKey], "PRODUCTION_IMPORT_T3_ARTIFACT_STAGE_INVALID", sourceTable);
  if (row.sourceTable !== sourceTable || typeof row.sourceKey !== "string" || row.sourceKey.trim() === "" || !SHA256.test(row.sourceIdentitySha256 ?? "") || !SHA256.test(row.sourceRowSha256 ?? "") || !plain(row.source) || !Array.isArray(row[extraKey])) fail("PRODUCTION_IMPORT_T3_ARTIFACT_STAGE_INVALID", sourceTable);
  if (row.sourceIdentitySha256 !== sha256(`${sourceTable}\0${row.sourceKey}`)) fail("PRODUCTION_IMPORT_T3_ARTIFACT_STAGE_INVALID", sourceTable);
}

function readStage(stagingDir, sourceManifest) {
  const manifestPath = requirePrivateFile(resolve(stagingDir, "manifest.json"), "manifest");
  const manifestBytes = readFileSync(manifestPath);
  if (sha256(manifestBytes) !== sourceManifest.phases[PHASE].stageManifestSha256) fail("PRODUCTION_IMPORT_T3_ARTIFACT_STAGE_MANIFEST_DRIFT", "manifest");
  const manifest = readJson(manifestPath, "PRODUCTION_IMPORT_T3_ARTIFACT_STAGE_INVALID", "manifest");
  if (manifest.formatVersion !== 1 || !plain(manifest.domains) || JSON.stringify(Object.keys(manifest.domains).sort()) !== JSON.stringify(Object.keys(DOMAINS).sort())) fail("PRODUCTION_IMPORT_T3_ARTIFACT_STAGE_INVALID", "manifest");

  const sourceRows = {};
  for (const [domain, rule] of Object.entries(DOMAINS)) {
    const item = manifest.domains[domain], attested = sourceManifest.phases[PHASE].domains[domain];
    exact(item, ["rows", "file", "fileSha256"], "PRODUCTION_IMPORT_T3_ARTIFACT_STAGE_INVALID", domain);
    if (!Number.isSafeInteger(item.rows) || item.rows < 0 || item.file !== rule.file || basename(item.file) !== item.file || !SHA256.test(item.fileSha256 ?? "") || item.rows !== attested.rows || item.fileSha256 !== attested.fileSha256) fail("PRODUCTION_IMPORT_T3_ARTIFACT_STAGE_DRIFT", domain);
    const bytes = readFileSync(requirePrivateFile(resolve(stagingDir, item.file), domain));
    if (sha256(bytes) !== item.fileSha256) fail("PRODUCTION_IMPORT_T3_ARTIFACT_STAGE_DRIFT", domain);
    const lines = bytes.toString("utf8").split("\n").filter(Boolean);
    if (lines.length !== item.rows) fail("PRODUCTION_IMPORT_T3_ARTIFACT_STAGE_INVALID", domain);
    sourceRows[domain] = lines.map(line => {
      try { return JSON.parse(line); } catch { fail("PRODUCTION_IMPORT_T3_ARTIFACT_STAGE_INVALID", domain); }
    });
  }

  const records = [];
  const identities = new Set();
  const add = value => {
    if (identities.has(value.sourceIdentitySha256)) fail("PRODUCTION_IMPORT_T3_ARTIFACT_STAGE_INVALID", "duplicate projected identity");
    identities.add(value.sourceIdentitySha256);
    records.push(value);
  };

  const batchIdentity = sha256(`yuzhou-hr-production-source-projection-v1\0dbo.timekeeptable\0hr_attendance_import_batch\0${manifest.domains.attendance.fileSha256}`);
  add(record({ targetTable: "hr_attendance_import_batch", sourceTable: "dbo.timekeeptable", sourceIdentitySha256: batchIdentity, sourceRowSha256: manifest.domains.attendance.fileSha256 }));

  const symbols = new Map();
  for (const row of sourceRows.attendance) {
    validateBaseRow(row, "dbo.timekeeptable", "days");
    add(record({ targetTable: "hr_attendance_calendar_source", sourceTable: row.sourceTable, sourceIdentitySha256: row.sourceIdentitySha256, sourceRowSha256: row.sourceRowSha256 }));
    const days = new Set();
    for (const day of row.days) {
      exact(day, ["day", "legacySymbol"], "PRODUCTION_IMPORT_T3_ARTIFACT_STAGE_INVALID", "attendance day");
      if (!Number.isSafeInteger(day.day) || day.day < 1 || day.day > 31 || days.has(day.day) || (day.legacySymbol !== null && typeof day.legacySymbol !== "string")) fail("PRODUCTION_IMPORT_T3_ARTIFACT_STAGE_INVALID", "attendance day");
      days.add(day.day);
      const projection = projected(row.sourceIdentitySha256, "hr_attendance_day", String(day.day), row.sourceRowSha256);
      add(record({ targetTable: "hr_attendance_day", sourceTable: row.sourceTable, ...projection }));
      const symbol = typeof day.legacySymbol === "string" ? day.legacySymbol.trim() : "";
      if (symbol !== "") symbols.set(sha256(symbol), symbol);
    }
  }
  for (const [symbolHash, symbol] of [...symbols.entries()].sort()) {
    const sourceIdentitySha256 = sha256(`yuzhou-hr-production-source-projection-v1\0dbo.timekeeptable\0hr_attendance_symbol_rule\0${symbolHash}`);
    add(record({ targetTable: "hr_attendance_symbol_rule", sourceTable: "dbo.timekeeptable", sourceIdentitySha256, sourceRowSha256: sha256(canonical({ legacySymbol: symbol })) }));
  }

  for (const row of sourceRows.policies) {
    validateBaseRow(row, "dbo.insure_method", "items");
    add(record({ targetTable: "hr_insurance_policy", sourceTable: row.sourceTable, sourceIdentitySha256: row.sourceIdentitySha256, sourceRowSha256: row.sourceRowSha256 }));
    const itemKeys = new Set();
    for (const item of row.items) {
      exact(item, ["kind", "variant", "baseRate", "employerRate", "employeeRate", "supplementRate"], "PRODUCTION_IMPORT_T3_ARTIFACT_STAGE_INVALID", "policy item");
      if (typeof item.kind !== "string" || item.kind.trim() === "" || !Number.isSafeInteger(item.variant)) fail("PRODUCTION_IMPORT_T3_ARTIFACT_STAGE_INVALID", "policy item");
      const itemKey = `${item.kind}\0${item.variant}`;
      if (itemKeys.has(itemKey)) fail("PRODUCTION_IMPORT_T3_ARTIFACT_STAGE_INVALID", "policy item duplicate");
      itemKeys.add(itemKey);
      const projection = projected(row.sourceIdentitySha256, "hr_insurance_policy_item", itemKey, row.sourceRowSha256);
      add(record({ targetTable: "hr_insurance_policy_item", sourceTable: row.sourceTable, ...projection }));
    }
  }

  for (const row of sourceRows.insurance) {
    validateBaseRow(row, "dbo.person_insure", "items");
    add(record({ targetTable: "hr_employee_insurance_period", sourceTable: row.sourceTable, sourceIdentitySha256: row.sourceIdentitySha256, sourceRowSha256: row.sourceRowSha256 }));
    const itemKeys = new Set();
    for (const item of row.items) {
      exact(item, ["kind", "contributionBase", "totalAmount", "employerAmount", "employeeAmount", "supplementAmount", "legacyBaseNegative", "legacyFlag"], "PRODUCTION_IMPORT_T3_ARTIFACT_STAGE_INVALID", "insurance item");
      if (typeof item.kind !== "string" || item.kind.trim() === "" || itemKeys.has(item.kind)) fail("PRODUCTION_IMPORT_T3_ARTIFACT_STAGE_INVALID", "insurance item");
      itemKeys.add(item.kind);
      const projection = projected(row.sourceIdentitySha256, "hr_employee_insurance_item", item.kind, row.sourceRowSha256);
      add(record({ targetTable: "hr_employee_insurance_item", sourceTable: row.sourceTable, ...projection }));
    }
  }

  records.sort((left, right) => left.targetTable.localeCompare(right.targetTable) || left.sourceIdentitySha256.localeCompare(right.sourceIdentitySha256));
  const targetTableCounts = Object.fromEntries(TARGET_TABLES.map(table => [table, records.filter(value => value.targetTable === table).length]));
  return { records, targetTableCounts };
}

function writePrivateNew(path, value) {
  if (!isAbsolute(path) || existsSync(path)) fail("PRODUCTION_IMPORT_T3_ARTIFACT_OUTPUT_INVALID", "output");
  requirePrivateDirectory(dirname(path), "output parent");
  writeFileSync(path, `${JSON.stringify(value)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
  chmodSync(path, 0o600);
  requirePrivateFile(path, "output");
}

export function materializeProductionT3PhaseArtifact({ stagingDir, triplePath, sourceManifestPath, outputPath }, { head = currentHead } = {}) {
  const triple = readTriple(triplePath, head());
  const sourceManifest = readSourceManifest(sourceManifestPath, triple);
  const { records, targetTableCounts } = readStage(requirePrivateDirectory(stagingDir, "staging"), sourceManifest);
  const artifact = { formatVersion: 1, artifactKind: "yuzhou_hr_production_import_real_phase_staging", triple, phase: PHASE, targetTableCounts, records };
  writePrivateNew(resolve(outputPath), artifact);
  return Object.freeze({ status: "READY_FOR_REVIEW", phase: PHASE, recordCount: records.length, targetTableCounts: Object.freeze(targetTableCounts), artifactSha256: sha256(Buffer.from(`${JSON.stringify(artifact)}\n`, "utf8")), productionImport: "HOLD" });
}

function parseArgs(argv) {
  const input = argv[0] === "--" ? argv.slice(1) : argv;
  const values = {};
  const keys = ["--staging", "--triple", "--source-manifest", "--output"];
  if (input.length !== keys.length * 2) fail("PRODUCTION_IMPORT_T3_ARTIFACT_ARGUMENT_INVALID", "arguments");
  for (let index = 0; index < input.length; index += 2) {
    const key = input[index], value = input[index + 1];
    if (!keys.includes(key) || !value || Object.hasOwn(values, key) || !isAbsolute(value)) fail("PRODUCTION_IMPORT_T3_ARTIFACT_ARGUMENT_INVALID", "arguments");
    values[key] = resolve(value);
  }
  return { stagingDir: values["--staging"], triplePath: values["--triple"], sourceManifestPath: values["--source-manifest"], outputPath: values["--output"] };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(materializeProductionT3PhaseArtifact(parseArgs(process.argv.slice(2))))}\n`); }
  catch (error) { process.stderr.write(`${error instanceof ProductionT3PhaseArtifactError ? error.code : "PRODUCTION_IMPORT_T3_ARTIFACT_FAILED"}\n`); process.exitCode = 1; }
}
