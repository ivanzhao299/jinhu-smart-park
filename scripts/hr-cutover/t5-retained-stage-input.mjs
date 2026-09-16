/* global Buffer */
import { createHash } from "node:crypto";
import { dirname, isAbsolute, resolve } from "node:path";
import { realpathSync } from "node:fs";
import { readBoundedPrivateArtifactBytes } from "./execute-production-import.mjs";
import { stableProductionImportCanonicalJson as canonical } from "./production-import-target-model.mjs";
import { verifyT5RetainedSourceBinding } from "./t5-retained-source-binding.mjs";

const hash = value => createHash("sha256").update(value).digest("hex");
const SHA = /^[0-9a-f]{64}$/u;
const fail = code => { const e = new Error(code); e.code = code; throw e; };
const exact = (value, keys) => value && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).sort().join("|") === [...keys].sort().join("|");

/** Loads explicitly pinned, private retained material. No database or key access.
 * Different source/consumer mappings remain visible in the provenance output;
 * this adapter does not certify business parity or authorize production writes.
 */
export function readT5RetainedStageInput(configPath, triple) {
  const budget = { bytesRead: 0, maximumBytes: 256 * 1024 ** 2 };
  function bytes(file, maximum) {
    try {
      if (!isAbsolute(file) || resolve(file) !== file || realpathSync(file) !== file) fail("T5_RETAINED_FILE_UNSAFE");
      return readBoundedPrivateArtifactBytes(file, "retained T5 input", maximum, budget);
    } catch { fail("T5_RETAINED_FILE_UNSAFE"); }
  }
  function json(data) { try { return JSON.parse(data.toString("utf8")); } catch { fail("T5_RETAINED_JSON_INVALID"); } }
  function artifact(d, maximum = 128 * 1024 ** 2) {
    if (!exact(d, ["path", "sha256"]) || !SHA.test(d.sha256 ?? "")) fail("T5_RETAINED_DESCRIPTOR_INVALID");
    const data = bytes(d.path, maximum);
    if (hash(data) !== d.sha256) fail("T5_RETAINED_HASH_DRIFT");
    return { bytes: data, sha256: d.sha256, value: json(data) };
  }
  const c = json(bytes(configPath, 65536));
  if (!exact(c, ["formatVersion", "consumerTriple", "historicalManifest", "historicalReceipt", "currentReceipt", "projection", "definitions"])
    || c.formatVersion !== 1 || canonical(c.consumerTriple) !== canonical(triple)) fail("T5_RETAINED_CONFIG_INVALID");
  const historical = artifact(c.historicalManifest, 262144), oldReceipt = artifact(c.historicalReceipt, 262144);
  const currentReceipt = artifact(c.currentReceipt, 262144), projected = artifact(c.projection), definitions = artifact(c.definitions, 262144);
  const p = projected.value, m = historical.value;
  if (!exact(p, ["artifactKind", "formatVersion", "productionImport", "records", "sourceManifestSha256", "sourceSnapshotSha256"])
    || p.artifactKind !== "retained-projection" || p.formatVersion !== 1 || p.productionImport !== "HOLD" || !Array.isArray(p.records)
    || p.sourceSnapshotSha256 !== triple.sourceSnapshotHash || !exact(definitions.value, ["records"])
    || !Array.isArray(definitions.value.records)) fail("T5_RETAINED_PROJECTION_INVALID");
  const provenance = verifyT5RetainedSourceBinding({ historicalManifest: historical, historicalReceipt: oldReceipt, currentReceipt,
    projectionSourceManifestSha256: p.sourceManifestSha256, expectedSourceSnapshotSha256: triple.sourceSnapshotHash,
    historicalMappingContractSha256: m.mappingContractSha256, consumerMappingContractSha256: triple.mappingContractHash });
  if (!exact(m.domains, ["family", "knowhow", "person_core", "ticket"]) || !Number.isSafeInteger(m.sourceRows)
    || m.sourceRows < 1 || m.sourceRows !== p.records.length || canonical(m.filesExcluded) !== canonical(["photo", "docs"])) fail("T5_RETAINED_COVERAGE_INVALID");
  // Authenticate each retained source file before using only its identity tuple.
  // Never invent a raw-source object for the new, source-free projection.
  const identities = new Map();
  for (const domain of Object.values(m.domains)) {
    if (!domain || typeof domain.file !== "string" || !/^[A-Za-z0-9_.-]+$/u.test(domain.file)
      || !SHA.test(domain.fileSha256 ?? "") || !Number.isSafeInteger(domain.rows) || domain.rows < 0) fail("T5_RETAINED_DOMAIN_INVALID");
    const data = bytes(resolve(dirname(c.historicalManifest.path), domain.file), 128 * 1024 ** 2);
    if (hash(data) !== domain.fileSha256) fail("T5_RETAINED_HASH_DRIFT");
    const lines = data.toString("utf8").split("\n").filter(Boolean);
    if (lines.length !== domain.rows) fail("T5_RETAINED_COVERAGE_INVALID");
    for (const line of lines) {
      const r = json(Buffer.from(line));
      if (!SHA.test(r.sourceIdentitySha256 ?? "") || !SHA.test(r.sourceRowSha256 ?? "") || identities.has(r.sourceIdentitySha256)) fail("T5_RETAINED_IDENTITY_INVALID");
      identities.set(r.sourceIdentitySha256, [r.sourceRowSha256, r.sourceTable, r.sourceKey, r.employeeCode, r.domain]);
    }
  }
  for (const r of p.records) {
    if (!r || Object.hasOwn(r, "source") || !identities.has(r.sourceIdentitySha256)
      || canonical(identities.get(r.sourceIdentitySha256)) !== canonical([r.sourceRowSha256, r.sourceTable, r.sourceKey, r.employeeCode, r.domain])) fail("T5_RETAINED_IDENTITY_INVALID");
    identities.delete(r.sourceIdentitySha256);
  }
  if (identities.size) fail("T5_RETAINED_COVERAGE_INVALID");
  const definitionEvidence = definitions.value.records;
  const present = definitionEvidence.reduce((total, row) => total + (row?.legacyLogicCoverage?.presentCount ?? NaN), 0);
  if (definitionEvidence.length !== 19 || !Number.isSafeInteger(present) || present < 0 || present > 190) fail("T5_RETAINED_DEFINITIONS_INVALID");
  const lineage = { ...provenance, projectionArtifactSha256: c.projection.sha256, definitionArtifactSha256: c.definitions.sha256,
    sourceIdentityCoverageVerified: true, recordCount: p.records.length };
  return { records: p.records, definitionEvidence, provenance: lineage,
    manifest: { artifactKind: "yuzhou_t5_nonfile_materialization_stage", sourceSnapshotSha256: triple.sourceSnapshotHash,
      sourceRestoreReceiptSha256: c.historicalReceipt.sha256, mappingContractSha256: triple.mappingContractHash,
      nonfileBusinessSha256: hash(canonical(lineage)), domains: m.domains, filesExcluded: ["photo", "docs"],
      definitionEvidence: { fileSha256: c.definitions.sha256, rows: 19, logicColumnDenominator: 190, logicColumnPresentCount: present }, productionImport: "HOLD" } };
}
