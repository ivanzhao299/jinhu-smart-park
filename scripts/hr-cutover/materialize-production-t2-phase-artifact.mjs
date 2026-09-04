#!/usr/bin/env node
/**
 * Freezes the receipt-bound T2 contract stage into hash-only production-import
 * provenance. Raw contract values remain in the private staging directory.
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
const PHASE = "T2";
const DOMAINS = Object.freeze({
  "dbo.compacttypecode": Object.freeze({ file: "contract-types.jsonl", targetTable: "hr_contract_type", kind: "jsonl" }),
  "dbo.compact": Object.freeze({ file: "contracts.jsonl", targetTable: "hr_contract", kind: "jsonl" }),
  "dbo.compact_c": Object.freeze({ file: "contract-changes.jsonl", targetTable: "hr_contract_change", kind: "jsonl" }),
  "dbo.compact.state": Object.freeze({ file: "contract-states.raw.json", kind: "json" }),
});
const TARGET_TABLES = Object.freeze(["hr_contract_type", "hr_contract", "hr_contract_change", "hr_contract_legacy_evidence"]);
const EVIDENCE_TABLE = "hr_contract_legacy_evidence";

export class ProductionT2PhaseArtifactError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "ProductionT2PhaseArtifactError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new ProductionT2PhaseArtifactError(code, detail); };
const sha256 = value => createHash("sha256").update(value).digest("hex");
const mode = path => statSync(path).mode & 0o777;
const plain = value => value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const canonicalTopLevel = value => JSON.stringify(value, Object.keys(value).sort());

function exact(value, keys, code, label) {
  if (!plain(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) fail(code, label);
}

function requirePrivateDirectory(path, label) {
  if (!isAbsolute(path) || !existsSync(path)) fail("PRODUCTION_IMPORT_T2_ARTIFACT_PATH_INVALID", label);
  const entry = lstatSync(path);
  if (entry.isSymbolicLink() || !entry.isDirectory() || mode(path) !== 0o700) fail("PRODUCTION_IMPORT_T2_ARTIFACT_PATH_INVALID", label);
  return resolve(path);
}

function requirePrivateFile(path, label) {
  if (!isAbsolute(path) || !existsSync(path)) fail("PRODUCTION_IMPORT_T2_ARTIFACT_INPUT_MISSING", label);
  const entry = lstatSync(path);
  if (entry.isSymbolicLink() || !entry.isFile() || entry.nlink !== 1 || mode(path) !== 0o600) fail("PRODUCTION_IMPORT_T2_ARTIFACT_PATH_INVALID", label);
  return resolve(path);
}

function readJson(path, code, label) {
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch { fail(code, label); }
}

function currentHead() {
  const result = spawnSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const value = String(result.stdout ?? "").trim();
  if (result.status !== 0 || !CODE_SHA.test(value)) fail("PRODUCTION_IMPORT_T2_ARTIFACT_CODE_INVALID", "HEAD");
  return value;
}

function readTriple(path, head) {
  const triple = readJson(requirePrivateFile(path, "triple"), "PRODUCTION_IMPORT_T2_ARTIFACT_TRIPLE_INVALID", "JSON");
  exact(triple, ["codeSha", "sourceSnapshotHash", "mappingContractHash"], "PRODUCTION_IMPORT_T2_ARTIFACT_TRIPLE_INVALID", "C/S/M");
  if (!CODE_SHA.test(triple.codeSha ?? "") || !SHA256.test(triple.sourceSnapshotHash ?? "") || !SHA256.test(triple.mappingContractHash ?? "") || triple.codeSha !== head) fail("PRODUCTION_IMPORT_T2_ARTIFACT_TRIPLE_INVALID", "C/S/M");
  return Object.freeze({ ...triple });
}

function readSourceManifest(path, triple) {
  const manifest = readJson(requirePrivateFile(path, "source manifest"), "PRODUCTION_IMPORT_T2_ARTIFACT_SOURCE_MANIFEST_INVALID", "JSON");
  try { verifyProductionSourceManifest(manifest); }
  catch { fail("PRODUCTION_IMPORT_T2_ARTIFACT_SOURCE_MANIFEST_INVALID", "contract"); }
  if (manifest.sourceSnapshotSha256 !== triple.sourceSnapshotHash || manifest.mappingContractSha256 !== triple.mappingContractHash) fail("PRODUCTION_IMPORT_T2_ARTIFACT_SOURCE_MANIFEST_DRIFT", "C/S/M");
  return manifest;
}

function sourceRecord(row, sourceTable, targetTable) {
  exact(row, ["sourceTable", "sourceKey", "sourceIdentitySha256", "sourceRowSha256", "source"], "PRODUCTION_IMPORT_T2_ARTIFACT_STAGE_INVALID", sourceTable);
  if (row.sourceTable !== sourceTable || typeof row.sourceKey !== "string" || row.sourceKey.trim() === "" || !SHA256.test(row.sourceIdentitySha256 ?? "") || !SHA256.test(row.sourceRowSha256 ?? "") || !plain(row.source)) fail("PRODUCTION_IMPORT_T2_ARTIFACT_STAGE_INVALID", sourceTable);
  if (row.sourceIdentitySha256 !== sha256(`${sourceTable}\0${row.sourceKey}`) || row.sourceRowSha256 !== sha256(canonicalTopLevel(row.source))) fail("PRODUCTION_IMPORT_T2_ARTIFACT_STAGE_INVALID", sourceTable);
  return {
    phase: PHASE,
    targetTable,
    sourceSystem: "yuzhou-v10",
    sourceTable,
    sourcePkCanonical: `sha256:${row.sourceIdentitySha256}`,
    sourceIdentitySha256: row.sourceIdentitySha256,
    sourceRowSha256: row.sourceRowSha256,
  };
}

function evidenceRecord(row) {
  const sourceIdentitySha256 = sha256(`yuzhou-hr-production-source-projection-v1\0${row.sourceIdentitySha256}\0${EVIDENCE_TABLE}`);
  return {
    phase: PHASE,
    targetTable: EVIDENCE_TABLE,
    sourceSystem: "yuzhou-v10",
    sourceTable: "dbo.compact",
    sourcePkCanonical: `sha256:${sourceIdentitySha256}`,
    sourceIdentitySha256,
    sourceRowSha256: row.sourceRowSha256,
  };
}

function readStage(stagingDir, sourceManifest) {
  const manifestPath = requirePrivateFile(resolve(stagingDir, "manifest.json"), "manifest");
  const manifestBytes = readFileSync(manifestPath);
  if (sha256(manifestBytes) !== sourceManifest.phases[PHASE].stageManifestSha256) fail("PRODUCTION_IMPORT_T2_ARTIFACT_STAGE_MANIFEST_DRIFT", "manifest");
  const manifest = readJson(manifestPath, "PRODUCTION_IMPORT_T2_ARTIFACT_STAGE_INVALID", "manifest");
  if (manifest.formatVersion !== 1 || !plain(manifest.domains) || JSON.stringify(Object.keys(manifest.domains).sort()) !== JSON.stringify(Object.keys(DOMAINS).sort())) fail("PRODUCTION_IMPORT_T2_ARTIFACT_STAGE_INVALID", "manifest");

  const records = [];
  const identities = new Set();
  for (const [domain, rule] of Object.entries(DOMAINS)) {
    const item = manifest.domains[domain];
    const attested = sourceManifest.phases[PHASE].domains[domain];
    exact(item, ["rows", "file", "fileSha256"], "PRODUCTION_IMPORT_T2_ARTIFACT_STAGE_INVALID", domain);
    if (!Number.isSafeInteger(item.rows) || item.rows < 0 || item.file !== rule.file || basename(item.file) !== item.file || !SHA256.test(item.fileSha256 ?? "") || item.rows !== attested.rows || item.fileSha256 !== attested.fileSha256) fail("PRODUCTION_IMPORT_T2_ARTIFACT_STAGE_DRIFT", domain);
    const bytes = readFileSync(requirePrivateFile(resolve(stagingDir, item.file), domain));
    if (sha256(bytes) !== item.fileSha256) fail("PRODUCTION_IMPORT_T2_ARTIFACT_STAGE_DRIFT", domain);
    if (rule.kind === "json") {
      let values;
      try { values = JSON.parse(bytes.toString("utf8")); } catch { fail("PRODUCTION_IMPORT_T2_ARTIFACT_STAGE_INVALID", domain); }
      if (!Array.isArray(values) || values.length !== item.rows) fail("PRODUCTION_IMPORT_T2_ARTIFACT_STAGE_INVALID", domain);
      continue;
    }
    const lines = bytes.toString("utf8").split("\n").filter(Boolean);
    if (lines.length !== item.rows) fail("PRODUCTION_IMPORT_T2_ARTIFACT_STAGE_INVALID", domain);
    for (const line of lines) {
      let row;
      try { row = JSON.parse(line); } catch { fail("PRODUCTION_IMPORT_T2_ARTIFACT_STAGE_INVALID", domain); }
      const record = sourceRecord(row, domain, rule.targetTable);
      if (identities.has(record.sourceIdentitySha256)) fail("PRODUCTION_IMPORT_T2_ARTIFACT_STAGE_INVALID", "duplicate source identity");
      identities.add(record.sourceIdentitySha256);
      records.push(record);
      if (domain === "dbo.compact" && (Boolean(row.source.legacyFilePresent) || Boolean(row.source.legacyTextPresent))) {
        const evidence = evidenceRecord(row);
        if (identities.has(evidence.sourceIdentitySha256)) fail("PRODUCTION_IMPORT_T2_ARTIFACT_STAGE_INVALID", "duplicate evidence identity");
        identities.add(evidence.sourceIdentitySha256);
        records.push(evidence);
      }
    }
  }
  records.sort((left, right) => left.targetTable.localeCompare(right.targetTable) || left.sourceIdentitySha256.localeCompare(right.sourceIdentitySha256));
  const targetTableCounts = Object.fromEntries(TARGET_TABLES.map(table => [table, records.filter(record => record.targetTable === table).length]));
  return { records, targetTableCounts };
}

function writePrivateNew(path, value) {
  if (!isAbsolute(path) || existsSync(path)) fail("PRODUCTION_IMPORT_T2_ARTIFACT_OUTPUT_INVALID", "output");
  requirePrivateDirectory(dirname(path), "output parent");
  writeFileSync(path, `${JSON.stringify(value)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
  chmodSync(path, 0o600);
  requirePrivateFile(path, "output");
}

export function materializeProductionT2PhaseArtifact({ stagingDir, triplePath, sourceManifestPath, outputPath }, { head = currentHead } = {}) {
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
  if (input.length !== keys.length * 2) fail("PRODUCTION_IMPORT_T2_ARTIFACT_ARGUMENT_INVALID", "arguments");
  for (let index = 0; index < input.length; index += 2) {
    const key = input[index], value = input[index + 1];
    if (!keys.includes(key) || !value || Object.hasOwn(values, key) || !isAbsolute(value)) fail("PRODUCTION_IMPORT_T2_ARTIFACT_ARGUMENT_INVALID", "arguments");
    values[key] = resolve(value);
  }
  return { stagingDir: values["--staging"], triplePath: values["--triple"], sourceManifestPath: values["--source-manifest"], outputPath: values["--output"] };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(materializeProductionT2PhaseArtifact(parseArgs(process.argv.slice(2))))}\n`); }
  catch (error) { process.stderr.write(`${error instanceof ProductionT2PhaseArtifactError ? error.code : "PRODUCTION_IMPORT_T2_ARTIFACT_FAILED"}\n`); process.exitCode = 1; }
}
