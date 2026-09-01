#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, lstatSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const SHA256 = /^[0-9a-f]{64}$/u;
const CODE_SHA = /^[0-9a-f]{40}$/u;
const PHASE = "T0";
const DOMAINS = Object.freeze([
  Object.freeze({ name: "departments", file: "departments.jsonl", sourceTable: "dbo.departmentcode", targetTable: "sys_org" }),
  Object.freeze({ name: "positions", file: "positions.jsonl", sourceTable: "dbo.job", targetTable: "hr_position" }),
  Object.freeze({ name: "employees", file: "employees.jsonl", sourceTable: "dbo.person", targetTable: "hr_employee" }),
]);

export class ProductionT0PhaseArtifactError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.code = code;
  }
}

const fail = (code, detail) => { throw new ProductionT0PhaseArtifactError(code, detail); };
const sha256 = value => createHash("sha256").update(value).digest("hex");
const isPlainObject = value => value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const mode = path => statSync(path).mode & 0o777;

function requirePrivateDirectory(path, label) {
  if (!isAbsolute(path) || !existsSync(path)) fail("PRODUCTION_IMPORT_T0_ARTIFACT_PATH_INVALID", label);
  const link = lstatSync(path);
  if (link.isSymbolicLink() || !link.isDirectory() || mode(path) !== 0o700) fail("PRODUCTION_IMPORT_T0_ARTIFACT_PATH_INVALID", label);
  return resolve(path);
}

function requirePrivateFile(path, label) {
  if (!existsSync(path)) fail("PRODUCTION_IMPORT_T0_ARTIFACT_INPUT_MISSING", label);
  const link = lstatSync(path);
  if (link.isSymbolicLink() || !link.isFile() || mode(path) !== 0o600) fail("PRODUCTION_IMPORT_T0_ARTIFACT_PATH_INVALID", label);
  return path;
}

function exactKeys(value, expected, code, label) {
  if (!isPlainObject(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expected].sort())) fail(code, label);
}

function currentHead() {
  const result = spawnSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const value = String(result.stdout ?? "").trim();
  if (result.status !== 0 || !CODE_SHA.test(value)) fail("PRODUCTION_IMPORT_T0_ARTIFACT_CODE_INVALID", "HEAD");
  return value;
}

function readJson(path, code) {
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { fail(code, "JSON"); }
}

function validateTriple(input, expectedCodeSha) {
  exactKeys(input, ["codeSha", "sourceSnapshotHash", "mappingContractHash"], "PRODUCTION_IMPORT_T0_ARTIFACT_TRIPLE_INVALID", "triple");
  if (!CODE_SHA.test(input.codeSha ?? "") || !SHA256.test(input.sourceSnapshotHash ?? "") || !SHA256.test(input.mappingContractHash ?? "") || input.codeSha !== expectedCodeSha) {
    fail("PRODUCTION_IMPORT_T0_ARTIFACT_TRIPLE_INVALID", "C/S/M");
  }
  return Object.freeze({ ...input });
}

function canonicalTopLevel(value) {
  return JSON.stringify(value, Object.keys(value).sort());
}

function readDomain(stagingDir, manifest, domain) {
  const manifestItem = manifest?.domains?.[domain.name];
  exactKeys(manifestItem, ["rows", "file", "fileSha256"], "PRODUCTION_IMPORT_T0_ARTIFACT_MANIFEST_INVALID", domain.name);
  if (!Number.isSafeInteger(manifestItem.rows) || manifestItem.rows < 1 || manifestItem.file !== domain.file || !SHA256.test(manifestItem.fileSha256 ?? "")) {
    fail("PRODUCTION_IMPORT_T0_ARTIFACT_MANIFEST_INVALID", domain.name);
  }
  const path = requirePrivateFile(resolve(stagingDir, domain.file), domain.name);
  const bytes = readFileSync(path);
  if (sha256(bytes) !== manifestItem.fileSha256) fail("PRODUCTION_IMPORT_T0_ARTIFACT_STAGING_HASH_MISMATCH", domain.name);
  const lines = bytes.toString("utf8").split("\n").filter(Boolean);
  if (lines.length !== manifestItem.rows) fail("PRODUCTION_IMPORT_T0_ARTIFACT_MANIFEST_INVALID", domain.name);
  const identities = new Set();
  return lines.map((line, index) => {
    let row;
    try { row = JSON.parse(line); } catch { fail("PRODUCTION_IMPORT_T0_ARTIFACT_STAGING_INVALID", domain.name); }
    exactKeys(row, ["sourceTable", "sourceKey", "sourceIdentitySha256", "sourceRowSha256", "source"], "PRODUCTION_IMPORT_T0_ARTIFACT_STAGING_INVALID", domain.name);
    if (row.sourceTable !== domain.sourceTable || typeof row.sourceKey !== "string" || row.sourceKey.length === 0 || !SHA256.test(row.sourceIdentitySha256 ?? "") || !SHA256.test(row.sourceRowSha256 ?? "") || !isPlainObject(row.source)) {
      fail("PRODUCTION_IMPORT_T0_ARTIFACT_STAGING_INVALID", domain.name);
    }
    if (row.sourceIdentitySha256 !== sha256(`${domain.sourceTable}\0${row.sourceKey}`) || row.sourceRowSha256 !== sha256(canonicalTopLevel(row.source)) || identities.has(row.sourceIdentitySha256)) {
      fail("PRODUCTION_IMPORT_T0_ARTIFACT_STAGING_INVALID", domain.name);
    }
    identities.add(row.sourceIdentitySha256);
    return {
      phase: PHASE,
      targetTable: domain.targetTable,
      sourceSystem: "yuzhou-v10",
      sourceTable: domain.sourceTable,
      sourcePkCanonical: `sha256:${row.sourceIdentitySha256}`,
      sourceIdentitySha256: row.sourceIdentitySha256,
      sourceRowSha256: row.sourceRowSha256,
      ordinal: index,
    };
  });
}

function writePrivateNew(path, value) {
  if (!isAbsolute(path) || basename(path) !== path.split("/").at(-1) || existsSync(path)) fail("PRODUCTION_IMPORT_T0_ARTIFACT_OUTPUT_INVALID", "output");
  requirePrivateDirectory(dirname(path), "output parent");
  writeFileSync(path, `${JSON.stringify(value)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
  chmodSync(path, 0o600);
  requirePrivateFile(path, "output");
}

/**
 * Converts a private, receipt-bound T0 staging directory into the hash-only
 * source artifact consumed by the sealed production-import bridge. It never
 * creates a plan, opens a database connection, or writes business data.
 */
export function materializeProductionT0PhaseArtifact({ stagingDir, triplePath, outputPath }, { head = currentHead } = {}) {
  const staging = requirePrivateDirectory(stagingDir, "staging");
  const triple = validateTriple(readJson(requirePrivateFile(triplePath, "triple"), "PRODUCTION_IMPORT_T0_ARTIFACT_TRIPLE_INVALID"), head());
  const manifest = readJson(requirePrivateFile(resolve(staging, "manifest.json"), "manifest"), "PRODUCTION_IMPORT_T0_ARTIFACT_MANIFEST_INVALID");
  if (!isPlainObject(manifest) || manifest.formatVersion !== 1 || !isPlainObject(manifest.domains)) fail("PRODUCTION_IMPORT_T0_ARTIFACT_MANIFEST_INVALID", "manifest");
  const records = DOMAINS.flatMap(domain => readDomain(staging, manifest, domain))
    .sort((left, right) => left.sourceIdentitySha256.localeCompare(right.sourceIdentitySha256))
    .map(({ ordinal: _ordinal, ...record }) => record);
  if (new Set(records.map(record => record.sourceIdentitySha256)).size !== records.length) fail("PRODUCTION_IMPORT_T0_ARTIFACT_STAGING_INVALID", "duplicate source identity");
  const artifact = { formatVersion: 1, artifactKind: "yuzhou_hr_production_import_real_phase_staging", triple, phase: PHASE, records };
  writePrivateNew(resolve(outputPath), artifact);
  return Object.freeze({
    status: "READY_FOR_REVIEW",
    phase: PHASE,
    recordCount: records.length,
    targetTableCounts: Object.freeze(Object.fromEntries(DOMAINS.map(domain => [domain.targetTable, records.filter(record => record.targetTable === domain.targetTable).length]))),
    artifactSha256: sha256(Buffer.from(`${JSON.stringify(artifact)}\n`, "utf8")),
    productionImport: "HOLD",
  });
}

function parseArgs(argv) {
  const input = argv[0] === "--" ? argv.slice(1) : argv;
  if (input.length !== 6) fail("PRODUCTION_IMPORT_T0_ARTIFACT_ARGUMENT_INVALID", "arguments");
  const values = {};
  for (let index = 0; index < input.length; index += 2) {
    const key = input[index];
    const value = input[index + 1];
    if (!value || !["--staging", "--triple", "--output"].includes(key) || values[key]) fail("PRODUCTION_IMPORT_T0_ARTIFACT_ARGUMENT_INVALID", "arguments");
    values[key] = resolve(value);
  }
  return { stagingDir: values["--staging"], triplePath: values["--triple"], outputPath: values["--output"] };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(`${JSON.stringify(materializeProductionT0PhaseArtifact(parseArgs(process.argv.slice(2))))}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof ProductionT0PhaseArtifactError ? error.code : "PRODUCTION_IMPORT_T0_ARTIFACT_FAILED"}\n`);
    process.exitCode = 1;
  }
}
