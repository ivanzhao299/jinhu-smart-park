import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { canonicalT4, hashT4 } from "../hr-cutover/production-import-t4-followon-binding.mjs";
import { T5_FULL_COUNTS, T5_RECORD_DOMAINS, readT5FullArchivePrivateStage } from "../hr-cutover/t5-full-archive-private-stage.mjs";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "t5-full-stage-"));
  const write = (name, bytes) => {
    const path = join(root, name); writeFileSync(path, bytes, { mode: 0o600 });
    return { path, sha256: hashT4(bytes) };
  };
  const catalog = write("catalog.json", "{}");
  const files = {}, domains = {};
  for (const [domain, count] of Object.entries(T5_FULL_COUNTS)) {
    const sourceObject = domain === "photo" ? "dbo.person.photo" : ["person_core", "person_user", "person_user_item", "readjust", "readjustitem", "jobstatecode", "compact", "compact_c", "compacttypecode"].includes(domain)
      ? `dbo.${domain === "person_core" ? "person" : domain}.core_residue` : `dbo.${domain}`;
    const rows = Array.from({ length: count }, (_, i) => ({ ...(T5_RECORD_DOMAINS[domain] ? { domain: T5_RECORD_DOMAINS[domain] } : { fileRole: domain === "photo" ? "employee_photo" : "employee_document" }), sourceTable: sourceObject,
      sourceIdentitySha256: hashT4(`${domain}:${i}`), sourceRowSha256: hashT4(`row:${domain}:${i}`),
      source: { synthetic: true, escaped: 'quotes " and \\ slash\nnewline' } }));
    files[domain] = write(`${domain}.jsonl`, rows.map(row => JSON.stringify(row).replaceAll("\\", "\\\\") + "\n").join(""));
    domains[domain] = { sourceObject, rows: count, file: `${domain}.jsonl`, fileSha256: files[domain].sha256, objectStatus: count ? "present" : "empty" };
  }
  const definitions = write("defs.private.jsonl", "{\"privateOnly\":true,\"execution\":\"forbidden\"}\n".repeat(19));
  const safeDefinitionEvidence = write("defs.safe-evidence.jsonl", (JSON.stringify({ legacyLogicCoverage: {
    denominator: 10, presentCount: 5, nullCount: 5, columns: Array.from({ length: 10 }, (_, i) => ({
      execution: "forbidden", isSourceNull: i >= 5, sourceValueSha256: i >= 5 ? null : hashT4(`logic-${i}`) })) } }) + "\n").repeat(19));
  const business = { formatVersion: 1, catalogSha256: hashT4(canonicalT4({})),
    mappingContractSha256: hashT4("synthetic mapping"), professionalTitleDictionary: {}, domains };
  const manifest = { ...business, productionImport: "HOLD", payloadSanitization: "nul_to_literal_escape_v1",
    businessSha256: hashT4(canonicalT4(business)), privateDefinitionSource: {
      sourceObject: "dbo.defs", rows: 19, logicColumnDenominator: 190, logicColumnPresentCount: 95,
      file: "defs.private.jsonl", fileSha256: definitions.sha256,
      safeEvidenceFile: "defs.safe-evidence.jsonl", safeEvidenceFileSha256: safeDefinitionEvidence.sha256 } };
  const descriptor = write("manifest.json", JSON.stringify(manifest));
  return { root, write, input: { manifest: descriptor, files, catalog, definitions, safeDefinitionEvidence },
    binding: { manifestSha256: descriptor.sha256, businessSha256: manifest.businessSha256,
      catalogSha256: manifest.catalogSha256, mappingContractSha256: manifest.mappingContractSha256 } };
}
test("complete 23-domain source retains 20163 records and forbidden definition bytes without authorization", () => {
  const f = fixture();
  try {
    const result = readT5FullArchivePrivateStage(f.input, f.binding);
    assert.equal(result.records.length, 20163);
    assert.equal(Object.keys(result.buffers).length, 23);
    assert.equal(result.receipt.productionBusinessWrites, 0);
    assert.equal(result.receipt.productionAuthorizationGranted, false);
    assert.match(result.definitionBytes.toString(), /forbidden/u);
    assert.equal(result.records[0].source.escaped, 'quotes " and \\ slash\nnewline');
  } finally { rmSync(f.root, { recursive: true }); }
});
test("changed bytes, missing empty domains and substituted manifests are rejected", () => {
  const f = fixture();
  try {
    assert.throws(() => readT5FullArchivePrivateStage(f.input, { ...f.binding, manifestSha256: hashT4("other") }), /T5_STAGE_MANIFEST_BINDING_DRIFT/u);
    const files = { ...f.input.files }; delete files.accept;
    assert.throws(() => readT5FullArchivePrivateStage({ ...f.input, files }, f.binding), /T5_STAGE_DOMAIN_SET_DRIFT/u);
    writeFileSync(f.input.files.family.path, "{}\n");
    assert.throws(() => readT5FullArchivePrivateStage(f.input, f.binding), /T5_STAGE_ARTIFACT_HASH_MISMATCH/u);
  } finally { rmSync(f.root, { recursive: true }); }
});
