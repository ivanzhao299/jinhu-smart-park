#!/usr/bin/env node
import { createHash } from "node:crypto";
import { constants, closeSync, fstatSync, fsyncSync, lstatSync, openSync, readSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { readBoundedPrivateArtifactBytes } from "./execute-production-import.mjs";
import { verifyProductionSourceManifest } from "../prepare-yuzhou-production-source-manifest.mjs";
import { stableProductionImportCanonicalJson as canonical } from "./production-import-target-model.mjs";
import { assembleProductionT2DecisionCandidates } from "./production-t2-decision-candidates.mjs";
import { verifyProductionT2StagedRecord } from "./production-t2-field-projection.mjs";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const SHA = /^[0-9a-f]{64}$/u;
const MAX_FILE_BYTES = 32 * 1024 ** 2;
const MAX_TOTAL_BYTES = 128 * 1024 ** 2;
const domains = { "dbo.compacttypecode": "contract-types.jsonl", "dbo.compact": "contracts.jsonl", "dbo.compact_c": "contract-changes.jsonl", "dbo.compact.state": "contract-states.raw.json" };
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const canonicalHash = value => digest(`${canonical(value)}\n`);
const plain = value => value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
const same = (a, b) => canonical(a) === canonical(b);
export class ProductionT2MaterializerError extends Error {
  constructor(code) { super(code); this.name = "ProductionT2MaterializerError"; this.code = code; }
}
const fail = code => { throw new ProductionT2MaterializerError(code); };
function exact(value, keys, code = "T2_MATERIALIZER_INPUT_INVALID") {
  if (!plain(value) || Object.keys(value).sort().join("|") !== [...keys].sort().join("|")) fail(code);
}
function directory(path) {
  try {
    const stat = lstatSync(path);
    if (!isAbsolute(path) || resolve(path) !== path || realpathSync(path) !== path || !stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o700) fail("T2_MATERIALIZER_DIRECTORY_UNSAFE");
  } catch { fail("T2_MATERIALIZER_DIRECTORY_UNSAFE"); }
  return path;
}
function bytes(path, budget, allowEmpty = false) {
  try {
    if (!isAbsolute(path) || resolve(path) !== path || realpathSync(path) !== path) fail("T2_MATERIALIZER_FILE_UNSAFE");
    if (allowEmpty) {
      const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const stat = fstatSync(fd);
        if (!stat.isFile() || stat.nlink !== 1 || stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o600) fail("T2_MATERIALIZER_FILE_UNSAFE");
        if (stat.size === 0) {
          if (readSync(fd, Buffer.alloc(1), 0, 1, 0) !== 0) fail("T2_MATERIALIZER_FILE_UNSAFE");
          const after = fstatSync(fd);
          if (after.size !== 0 || after.mtimeMs !== stat.mtimeMs || after.ctimeMs !== stat.ctimeMs) fail("T2_MATERIALIZER_FILE_UNSAFE");
          return Buffer.alloc(0);
        }
      } finally { closeSync(fd); }
    }
    return readBoundedPrivateArtifactBytes(path, "T2 artifact", MAX_FILE_BYTES, budget);
  } catch { fail("T2_MATERIALIZER_FILE_UNSAFE"); }
}
function json(value) { try { return JSON.parse(value.toString("utf8")); } catch { fail("T2_MATERIALIZER_JSON_INVALID"); } }
function artifact(descriptor, budget) {
  exact(descriptor, ["path", "sha256"]);
  if (!SHA.test(descriptor.sha256 ?? "")) fail("T2_MATERIALIZER_DESCRIPTOR_INVALID");
  const data = bytes(descriptor.path, budget);
  if (digest(data) !== descriptor.sha256) fail("T2_MATERIALIZER_ARTIFACT_HASH_MISMATCH");
  return json(data);
}
function head() {
  const run = args => spawnSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 15000 });
  const status = run(["status", "--porcelain", "--untracked-files=all", "--", "scripts/hr-cutover", "scripts/prepare-yuzhou-production-source-manifest.mjs"]);
  const revision = run(["rev-parse", "HEAD"]);
  if (status.status !== 0 || status.stdout.trim() || revision.status !== 0 || !/^[0-9a-f]{40}$/u.test(revision.stdout.trim())) fail("T2_MATERIALIZER_CURRENT_CODE_REQUIRED");
  return revision.stdout.trim();
}
function stage(stagingDir, manifest, budget) {
  directory(stagingDir);
  const rawManifest = bytes(join(stagingDir, "manifest.json"), budget);
  if (digest(rawManifest) !== manifest.phases.T2.stageManifestSha256) fail("T2_MATERIALIZER_STAGE_MANIFEST_DRIFT");
  const value = json(rawManifest);
  if (value.formatVersion !== 1) fail("T2_MATERIALIZER_STAGE_INVALID");
  exact(value.domains, Object.keys(domains), "T2_MATERIALIZER_STAGE_INVALID");
  for (const key of ["sourceSnapshotSha256", "sourceRestoreReceiptSha256", "sourceCatalogSha256", "mappingContractSha256"]) {
    if (value[key] !== undefined && value[key] !== manifest[key]) fail("T2_MATERIALIZER_STAGE_BINDING_DRIFT");
  }
  if (value.productionImport !== undefined && value.productionImport !== "HOLD") fail("T2_MATERIALIZER_STAGE_BINDING_DRIFT");
  const records = [], hashes = {}; let states;
  for (const [domain, file] of Object.entries(domains)) {
    const item = value.domains[domain], expected = manifest.phases.T2.domains[domain];
    exact(item, ["rows", "file", "fileSha256"], "T2_MATERIALIZER_STAGE_INVALID");
    if (item.file !== file || item.rows !== expected.rows || item.fileSha256 !== expected.fileSha256) fail("T2_MATERIALIZER_STAGE_BINDING_DRIFT");
    const data = bytes(join(stagingDir, file), budget, item.rows === 0);
    if (digest(data) !== item.fileSha256) fail("T2_MATERIALIZER_STAGE_BYTES_DRIFT");
    hashes[domain] = item.fileSha256;
    const rows = domain === "dbo.compact.state" ? json(data) : data.toString("utf8").split("\n").filter(Boolean).map(line => json(Buffer.from(line)));
    if (!Array.isArray(rows) || rows.length !== item.rows) fail("T2_MATERIALIZER_STAGE_COUNT_DRIFT");
    if (domain === "dbo.compact.state") { states = rows; continue; }
    for (const row of rows) {
      if (row.sourceTable !== domain) fail("T2_MATERIALIZER_STAGE_INVALID");
      try { verifyProductionT2StagedRecord(row); } catch { fail("T2_MATERIALIZER_STAGE_INVALID"); }
      records.push(row);
    }
  }
  return { records, states, hashes };
}

export function resolveProductionT2DictionaryCandidates(pkg, staged, triple, changeDecisions = null) {
  exact(pkg, ["formatVersion", "kind", "triple", "trustedRootSha256", "machineActor", "evidence", "dictionaries", "productionImport"], "T2_MATERIALIZER_DICTIONARY_INVALID");
  if (pkg.formatVersion !== 1 || pkg.kind !== "yuzhou_core_non_t0_machine_dictionary_package" || !same(pkg.triple, triple) || pkg.productionImport !== "HOLD"
    || !SHA.test(pkg.trustedRootSha256 ?? "") || !Array.isArray(pkg.dictionaries) || !plain(pkg.evidence)) fail("T2_MATERIALIZER_DICTIONARY_INVALID");
  exact(pkg.machineActor, ["id", "kind", "verifiedAt"], "T2_MATERIALIZER_DICTIONARY_INVALID");
  if (pkg.machineActor.kind !== "machine_policy_engine" || !Number.isFinite(Date.parse(pkg.machineActor.verifiedAt))) fail("T2_MATERIALIZER_DICTIONARY_INVALID");
  if (pkg.evidence.t2Types !== staged.hashes["dbo.compacttypecode"] || pkg.evidence.t2States !== staged.hashes["dbo.compact.state"]) fail("T2_MATERIALIZER_DICTIONARY_SOURCE_DRIFT");
  if (!same(pkg.dictionaries.map(d => d.dictionaryCode).sort(), ["contract_state", "contract_type", "employment_event_state", "employment_event_type"])) fail("T2_MATERIALIZER_DICTIONARY_INVALID");
  const expectedTypes = new Map(staged.records.filter(row => row.sourceTable === "dbo.compacttypecode").map(row => [row.sourceIdentitySha256, { sourceCode: String(row.source.typeCode).trim(), sourceName: String(row.source.typeName).trim(), sourceValue: null }]));
  const expectedStates = new Map(), usage = new Map();
  for (const row of staged.records.filter(row => row.sourceTable === "dbo.compact")) {
    const key = String(row.source.legacyState ?? "").trim(); usage.set(key, (usage.get(key) ?? 0) + 1);
  }
  for (const row of staged.states) {
    exact(row, ["sourceValue", "usageCount"], "T2_MATERIALIZER_STATE_COVERAGE_INVALID");
    const value = typeof row.sourceValue === "string" ? row.sourceValue.trim() : "";
    const identity = digest(`dbo.compact.state\0${value}`);
    if (!value || expectedStates.has(identity) || !Number.isSafeInteger(row.usageCount) || row.usageCount < 1 || usage.get(value) !== row.usageCount) fail("T2_MATERIALIZER_STATE_COVERAGE_INVALID");
    usage.delete(value); expectedStates.set(identity, { sourceCode: null, sourceName: null, sourceValue: value });
  }
  if (usage.size) fail("T2_MATERIALIZER_STATE_COVERAGE_INVALID");
  const mappings = new Map();
  for (const [code, expected, sourceTable, sourceHash, targetDomain] of [
    ["contract_type", expectedTypes, "dbo.compacttypecode", staged.hashes["dbo.compacttypecode"], "contract_type_code"],
    ["contract_state", expectedStates, "dbo.compact", staged.hashes["dbo.compact.state"], "contract_status"],
  ]) {
    const d = pkg.dictionaries.find(item => item.dictionaryCode === code);
    exact(d, ["dictionaryCode", "sourceTable", "sourceSnapshotSha256", "items", "machineAttestationSha256"], "T2_MATERIALIZER_DICTIONARY_INVALID");
    if (d.sourceTable !== sourceTable || d.sourceSnapshotSha256 !== canonicalHash({ kind: code, source: sourceHash }) || !Array.isArray(d.items) || d.items.length !== expected.size) fail("T2_MATERIALIZER_DICTIONARY_SOURCE_DRIFT");
    const seen = new Set();
    for (const item of d.items) {
      exact(item, ["id", "sourceCode", "sourceName", "sourceValue", "sourceIdentitySha256", "sourceRowSha256", "decision", "targetDomain", "targetValue", "reasonCode"], "T2_MATERIALIZER_DICTIONARY_INVALID");
      const original = expected.get(item.sourceIdentitySha256);
      if (!original || seen.has(item.sourceIdentitySha256) || !same(original, { sourceCode: item.sourceCode, sourceName: item.sourceName, sourceValue: item.sourceValue })
        || item.sourceRowSha256 !== canonicalHash(original) || !["map", "reject"].includes(item.decision)
        || (item.decision === "map" ? item.targetDomain !== targetDomain || typeof item.targetValue !== "string" : item.targetDomain !== null || item.targetValue !== null)) fail("T2_MATERIALIZER_DICTIONARY_SOURCE_DRIFT");
      seen.add(item.sourceIdentitySha256); mappings.set(item.sourceIdentitySha256, item);
    }
    if (d.machineAttestationSha256 !== canonicalHash({ triple, trustedRootSha256: pkg.trustedRootSha256, dictionaryCode: code, sourceSnapshotSha256: d.sourceSnapshotSha256, items: d.items.map(({ id: _id, ...rest }) => rest) })) fail("T2_MATERIALIZER_DICTIONARY_HASH_MISMATCH");
  }
  const changes = new Map();
  if (changeDecisions !== null) {
    exact(changeDecisions, ["formatVersion", "kind", "triple", "stageFileSha256", "records", "productionImport"], "T2_MATERIALIZER_CHANGE_DECISION_INVALID");
    if (changeDecisions.formatVersion !== 1 || changeDecisions.kind !== "yuzhou_hr_t2_change_classification_candidates" || !same(changeDecisions.triple, triple)
      || changeDecisions.stageFileSha256 !== staged.hashes["dbo.compact_c"] || changeDecisions.productionImport !== "HOLD" || !Array.isArray(changeDecisions.records)) fail("T2_MATERIALIZER_CHANGE_DECISION_INVALID");
    const originals = new Map(staged.records.filter(row => row.sourceTable === "dbo.compact_c").map(row => [row.sourceIdentitySha256, row]));
    for (const row of changeDecisions.records) {
      exact(row, ["sourceIdentitySha256", "sourceRowSha256", "changeType", "evidenceSha256"], "T2_MATERIALIZER_CHANGE_DECISION_INVALID");
      if (!originals.has(row.sourceIdentitySha256) || changes.has(row.sourceIdentitySha256) || originals.get(row.sourceIdentitySha256).sourceRowSha256 !== row.sourceRowSha256
        || !SHA.test(row.evidenceSha256 ?? "") || !["renewal", "amendment", "termination", "correction", "needs_review"].includes(row.changeType)) fail("T2_MATERIALIZER_CHANGE_DECISION_INVALID");
      changes.set(row.sourceIdentitySha256, row.changeType);
    }
  }
  return staged.records.map(row => {
    let resolved = {};
    if (row.sourceTable === "dbo.compact_c") { if (changes.has(row.sourceIdentitySha256)) resolved = { changeType: changes.get(row.sourceIdentitySha256) }; }
    else {
      const identity = row.sourceTable === "dbo.compacttypecode" ? row.sourceIdentitySha256 : digest(`dbo.compact.state\0${String(row.source.legacyState ?? "").trim()}`);
      const mapping = mappings.get(identity);
      if (mapping?.decision === "map") resolved = row.sourceTable === "dbo.compacttypecode" ? { typeCode: mapping.targetValue } : { status: mapping.targetValue };
    }
    return { sourceIdentitySha256: row.sourceIdentitySha256, resolved };
  });
}

export function materializeProductionT2DecisionCandidates(configPath, { currentHead = head, maximumReadBytes = MAX_TOTAL_BYTES } = {}) {
  if (!Number.isSafeInteger(maximumReadBytes) || maximumReadBytes < 1 || maximumReadBytes > MAX_TOTAL_BYTES) fail("T2_MATERIALIZER_READ_BUDGET_INVALID");
  const budget = { bytesRead: 0, maximumBytes: maximumReadBytes };
  const config = json(bytes(configPath, budget));
  exact(config, ["formatVersion", "triple", "stagingDir", "artifacts", "outputPath"]);
  exact(config.triple, ["codeSha", "sourceSnapshotHash", "mappingContractHash"]);
  if (config.formatVersion !== 1 || config.triple.codeSha !== currentHead()) fail("T2_MATERIALIZER_CURRENT_CODE_REQUIRED");
  exact(config.artifacts, ["sourceManifest", "phaseArtifact", "targetInventory", "t0Candidates", "dictionaryPackage", "changeDecisions"]);
  const a = config.artifacts;
  const manifest = artifact(a.sourceManifest, budget);
  let sourceVerification;
  try { sourceVerification = verifyProductionSourceManifest(manifest); } catch { fail("T2_MATERIALIZER_SOURCE_MANIFEST_INVALID"); }
  if (manifest.sourceSnapshotSha256 !== config.triple.sourceSnapshotHash || manifest.mappingContractSha256 !== config.triple.mappingContractHash) fail("T2_MATERIALIZER_SOURCE_MANIFEST_DRIFT");
  const inventory = artifact(a.targetInventory, budget);
  // Production inventory binds the verifier's canonical manifest hash, not the file-byte hash.
  if (inventory.sourceManifestSha256 !== sourceVerification.manifestSha256) fail("T2_MATERIALIZER_INVENTORY_SOURCE_DRIFT");
  const t0 = artifact(a.t0Candidates, budget), phase = artifact(a.phaseArtifact, budget), dictionary = artifact(a.dictionaryPackage, budget);
  const staged = stage(config.stagingDir, manifest, budget);
  const changeDecisions = a.changeDecisions === null ? null : artifact(a.changeDecisions, budget);
  const resolutions = resolveProductionT2DictionaryCandidates(dictionary, staged, config.triple, changeDecisions);
  const result = assembleProductionT2DecisionCandidates({ triple: config.triple, targetScope: t0.targetScope, targetInventory: inventory, t0Candidates: t0, phaseArtifact: phase,
    stagedRecords: staged.records, resolutions, artifactHashes: { phaseArtifactSha256: a.phaseArtifact.sha256, targetInventoryArtifactSha256: a.targetInventory.sha256,
      t0CandidatesArtifactSha256: a.t0Candidates.sha256, resolutionArtifactSha256: canonicalHash({ dictionaryPackageSha256: a.dictionaryPackage.sha256, changeDecisionsSha256: a.changeDecisions?.sha256 ?? null, resolutions }) } });
  result.resolutionEvidence = { dictionaryPackageSha256: a.dictionaryPackage.sha256, changeDecisionsSha256: a.changeDecisions?.sha256 ?? null, approvalClaimed: false };
  const output = Buffer.from(`${JSON.stringify(result)}\n`);
  if (output.length > MAX_FILE_BYTES) fail("T2_MATERIALIZER_OUTPUT_TOO_LARGE");
  if (!isAbsolute(config.outputPath) || resolve(config.outputPath) !== config.outputPath) fail("T2_MATERIALIZER_OUTPUT_INVALID");
  directory(dirname(config.outputPath));
  let fd;
  try {
    fd = openSync(config.outputPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    writeFileSync(fd, output); fsyncSync(fd);
  } catch { fail("T2_MATERIALIZER_OUTPUT_FAILED"); } finally { if (fd !== undefined) closeSync(fd); }
  const readback = bytes(config.outputPath, { bytesRead: 0, maximumBytes: MAX_FILE_BYTES });
  if (digest(readback) !== digest(output)) fail("T2_MATERIALIZER_OUTPUT_READBACK_FAILED");
  return { status: result.status, phase: "T2", recordCount: result.records.length, targetTableCounts: result.targetTableCounts, countByDisposition: result.countByDisposition,
    reasonCounts: Object.fromEntries([...new Set(result.records.map(row => row.reasonCode).filter(Boolean))].sort().map(reason => [reason, result.records.filter(row => row.reasonCode === reason).length])),
    artifactSha256: digest(output), productionImport: "HOLD" };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 2 || args[0] !== "--config") fail("T2_MATERIALIZER_ARGUMENT_INVALID");
    process.stdout.write(`${JSON.stringify(materializeProductionT2DecisionCandidates(args[1]))}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof ProductionT2MaterializerError ? error.code : /^T2_CANDIDATE_[A-Z_]+$/u.test(error.code ?? "") ? error.code : "T2_MATERIALIZER_FAILED"}\n`);
    process.exitCode = 1;
  }
}
