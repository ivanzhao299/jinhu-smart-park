#!/usr/bin/env node
/**
 * Freezes the T1 employment-event stage into hash-only production-import
 * provenance.  Source rows remain inside the private staging directory; this
 * artifact deliberately contains identities and row hashes only.
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
const PHASE = "T1";
const DOMAINS = Object.freeze(["employmentEventStates", "employmentEventTypes", "employmentEvents"]);
const EVENT_DOMAIN = "employmentEvents";
const EVENT_FILE = "employment-events.jsonl";
const SOURCE_TABLE = "dbo.readjust";
const TARGET_TABLE = "hr_employment_event";

export class ProductionT1PhaseArtifactError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.code = code;
  }
}

const fail = (code, detail) => { throw new ProductionT1PhaseArtifactError(code, detail); };
const sha256 = value => createHash("sha256").update(value).digest("hex");
const mode = path => statSync(path).mode & 0o777;
const plain = value => value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const canonicalTopLevel = value => JSON.stringify(value, Object.keys(value).sort());

function requirePrivateDirectory(path, label) {
  if (!isAbsolute(path) || !existsSync(path)) fail("PRODUCTION_IMPORT_T1_ARTIFACT_PATH_INVALID", label);
  const entry = lstatSync(path);
  if (entry.isSymbolicLink() || !entry.isDirectory() || mode(path) !== 0o700) fail("PRODUCTION_IMPORT_T1_ARTIFACT_PATH_INVALID", label);
  return resolve(path);
}

function requirePrivateFile(path, label) {
  if (!isAbsolute(path) || !existsSync(path)) fail("PRODUCTION_IMPORT_T1_ARTIFACT_INPUT_MISSING", label);
  const entry = lstatSync(path);
  if (entry.isSymbolicLink() || !entry.isFile() || entry.nlink !== 1 || mode(path) !== 0o600) fail("PRODUCTION_IMPORT_T1_ARTIFACT_PATH_INVALID", label);
  return resolve(path);
}

function exact(value, keys, code, label) {
  if (!plain(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) fail(code, label);
}

function readJson(path, code, label) {
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch { fail(code, label); }
}

function currentHead() {
  const result = spawnSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const value = String(result.stdout ?? "").trim();
  if (result.status !== 0 || !CODE_SHA.test(value)) fail("PRODUCTION_IMPORT_T1_ARTIFACT_CODE_INVALID", "HEAD");
  return value;
}

function readTriple(path, head) {
  const triple = readJson(requirePrivateFile(path, "triple"), "PRODUCTION_IMPORT_T1_ARTIFACT_TRIPLE_INVALID", "JSON");
  exact(triple, ["codeSha", "sourceSnapshotHash", "mappingContractHash"], "PRODUCTION_IMPORT_T1_ARTIFACT_TRIPLE_INVALID", "C/S/M");
  if (!CODE_SHA.test(triple.codeSha ?? "") || !SHA256.test(triple.sourceSnapshotHash ?? "") || !SHA256.test(triple.mappingContractHash ?? "") || triple.codeSha !== head) fail("PRODUCTION_IMPORT_T1_ARTIFACT_TRIPLE_INVALID", "C/S/M");
  return Object.freeze({ ...triple });
}

function readSourceManifest(path, triple) {
  const manifest = readJson(requirePrivateFile(path, "source manifest"), "PRODUCTION_IMPORT_T1_ARTIFACT_SOURCE_MANIFEST_INVALID", "JSON");
  try { verifyProductionSourceManifest(manifest); }
  catch { fail("PRODUCTION_IMPORT_T1_ARTIFACT_SOURCE_MANIFEST_INVALID", "contract"); }
  if (manifest.sourceSnapshotSha256 !== triple.sourceSnapshotHash || manifest.mappingContractSha256 !== triple.mappingContractHash) fail("PRODUCTION_IMPORT_T1_ARTIFACT_SOURCE_MANIFEST_DRIFT", "C/S/M");
  return manifest;
}

function readStage(stagingDir, sourceManifest) {
  const manifestPath = requirePrivateFile(resolve(stagingDir, "manifest.json"), "manifest");
  const manifestBytes = readFileSync(manifestPath);
  if (sha256(manifestBytes) !== sourceManifest.phases[PHASE].stageManifestSha256) fail("PRODUCTION_IMPORT_T1_ARTIFACT_STAGE_MANIFEST_DRIFT", "manifest");
  const manifest = readJson(manifestPath, "PRODUCTION_IMPORT_T1_ARTIFACT_STAGE_INVALID", "manifest");
  if (manifest.formatVersion !== 1 || !plain(manifest.domains) || JSON.stringify(Object.keys(manifest.domains).sort()) !== JSON.stringify([...DOMAINS].sort())) fail("PRODUCTION_IMPORT_T1_ARTIFACT_STAGE_INVALID", "manifest");
  const domainFiles = new Map();
  for (const domain of DOMAINS) {
    const item = manifest.domains[domain];
    const attested = sourceManifest.phases[PHASE].domains[domain];
    exact(item, ["rows", "file", "fileSha256"], "PRODUCTION_IMPORT_T1_ARTIFACT_STAGE_INVALID", domain);
    if (!Number.isSafeInteger(item.rows) || item.rows < 0 || basename(item.file ?? "") !== item.file || !SHA256.test(item.fileSha256 ?? "") || item.rows !== attested.rows || item.fileSha256 !== attested.fileSha256) fail("PRODUCTION_IMPORT_T1_ARTIFACT_STAGE_DRIFT", domain);
    const filePath = requirePrivateFile(resolve(stagingDir, item.file), domain);
    const bytes = readFileSync(filePath);
    if (sha256(bytes) !== item.fileSha256) fail("PRODUCTION_IMPORT_T1_ARTIFACT_STAGE_DRIFT", domain);
    domainFiles.set(domain, { item, bytes });
  }
  const events = domainFiles.get(EVENT_DOMAIN);
  if (events.item.file !== EVENT_FILE || events.item.rows < 1) fail("PRODUCTION_IMPORT_T1_ARTIFACT_STAGE_INVALID", EVENT_DOMAIN);
  const records = events.bytes.toString("utf8").split("\n").filter(Boolean).map((line, index) => {
    let row;
    try { row = JSON.parse(line); } catch { fail("PRODUCTION_IMPORT_T1_ARTIFACT_STAGE_INVALID", `${EVENT_DOMAIN}:${index}`); }
    exact(row, ["sourceTable", "sourceKey", "sourceIdentitySha256", "sourceRowSha256", "source"], "PRODUCTION_IMPORT_T1_ARTIFACT_STAGE_INVALID", EVENT_DOMAIN);
    if (row.sourceTable !== SOURCE_TABLE || typeof row.sourceKey !== "string" || row.sourceKey.trim() === "" || !SHA256.test(row.sourceIdentitySha256 ?? "") || !SHA256.test(row.sourceRowSha256 ?? "") || !plain(row.source)) fail("PRODUCTION_IMPORT_T1_ARTIFACT_STAGE_INVALID", EVENT_DOMAIN);
    if (row.sourceIdentitySha256 !== sha256(`${SOURCE_TABLE}\0${row.sourceKey}`) || row.sourceRowSha256 !== sha256(canonicalTopLevel(row.source))) fail("PRODUCTION_IMPORT_T1_ARTIFACT_STAGE_INVALID", EVENT_DOMAIN);
    return { phase: PHASE, targetTable: TARGET_TABLE, sourceSystem: "yuzhou-v10", sourceTable: SOURCE_TABLE, sourcePkCanonical: `sha256:${row.sourceIdentitySha256}`, sourceIdentitySha256: row.sourceIdentitySha256, sourceRowSha256: row.sourceRowSha256 };
  });
  if (records.length !== events.item.rows || new Set(records.map(record => record.sourceIdentitySha256)).size !== records.length) fail("PRODUCTION_IMPORT_T1_ARTIFACT_STAGE_INVALID", "employment event identities");
  return records.sort((left, right) => left.sourceIdentitySha256.localeCompare(right.sourceIdentitySha256));
}

function writePrivateNew(path, value) {
  if (!isAbsolute(path) || existsSync(path)) fail("PRODUCTION_IMPORT_T1_ARTIFACT_OUTPUT_INVALID", "output");
  requirePrivateDirectory(dirname(path), "output parent");
  writeFileSync(path, `${JSON.stringify(value)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
  chmodSync(path, 0o600);
  requirePrivateFile(path, "output");
}

/**
 * Produces only a hash-addressed source receipt.  It never creates a target
 * payload, resolves an employee, connects to PostgreSQL, or writes production
 * data.  Employee record-map resolution belongs to the following decision slice.
 */
export function materializeProductionT1PhaseArtifact({ stagingDir, triplePath, sourceManifestPath, outputPath }, { head = currentHead } = {}) {
  const triple = readTriple(triplePath, head());
  const sourceManifest = readSourceManifest(sourceManifestPath, triple);
  const records = readStage(requirePrivateDirectory(stagingDir, "staging"), sourceManifest);
  const artifact = { formatVersion: 1, artifactKind: "yuzhou_hr_production_import_real_phase_staging", triple, phase: PHASE, records };
  writePrivateNew(resolve(outputPath), artifact);
  return Object.freeze({ status: "READY_FOR_REVIEW", phase: PHASE, recordCount: records.length, targetTableCounts: { [TARGET_TABLE]: records.length }, artifactSha256: sha256(Buffer.from(`${JSON.stringify(artifact)}\n`, "utf8")), productionImport: "HOLD" });
}

function parseArgs(argv) {
  const input = argv[0] === "--" ? argv.slice(1) : argv;
  const values = {};
  const keys = ["--staging", "--triple", "--source-manifest", "--output"];
  if (input.length !== keys.length * 2) fail("PRODUCTION_IMPORT_T1_ARTIFACT_ARGUMENT_INVALID", "arguments");
  for (let index = 0; index < input.length; index += 2) {
    const key = input[index], value = input[index + 1];
    if (!keys.includes(key) || !value || Object.hasOwn(values, key) || !isAbsolute(value)) fail("PRODUCTION_IMPORT_T1_ARTIFACT_ARGUMENT_INVALID", "arguments");
    values[key] = resolve(value);
  }
  return { stagingDir: values["--staging"], triplePath: values["--triple"], sourceManifestPath: values["--source-manifest"], outputPath: values["--output"] };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(materializeProductionT1PhaseArtifact(parseArgs(process.argv.slice(2))))}\n`); }
  catch (error) { process.stderr.write(`${error instanceof ProductionT1PhaseArtifactError ? error.code : "PRODUCTION_IMPORT_T1_ARTIFACT_FAILED"}\n`); process.exitCode = 1; }
}
