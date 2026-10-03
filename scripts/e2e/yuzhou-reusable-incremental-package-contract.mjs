#!/usr/bin/env node
/* global console, process, structuredClone */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildYuzhouReusableIncrementalPackage, materializeYuzhouReusableIncrementalPackage, YUZHOU_REUSABLE_INCREMENTAL_RECIPE_SHA256 } from "../hr-cutover/build-yuzhou-reusable-incremental-package.mjs";

const sha = value => createHash("sha256").update(value).digest("hex");
const canonical = value => JSON.stringify(value, Object.keys(value).sort());
const recursiveCanonical = value => value === null || typeof value !== "object" ? JSON.stringify(value) : Array.isArray(value) ? `[${value.map(recursiveCanonical).join(",")}]` : `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${recursiveCanonical(value[key])}`).join(",")}}`;
const sourceRow = (sourceKey, source) => ({ sourceTable: "dbo.compact", sourceKey, sourceIdentitySha256: sha(`dbo.compact\0${sourceKey}`), sourceRowSha256: sha(canonical(source)), source });
const contract = (overrides = {}) => ({
  contractNo: "HT-2026-001", typeName: "劳动合同", employeeCode: "E-001", startDate: "2024-01-01", endDate: "2025-12-31", probationEndDate: "2024-03-31",
  contractMonths: "24", totalContractMonths: "24", probationMonths: "3", probationSalary: "9000.00", baseSalary: "12000.00", legacyState: "正常", continuetimes: "0", continueyears: "0",
  signedDate: "2023-12-20", nonCompeteFlag: "否", confidentialityFlag: "否", trainingServiceFlag: "否", legacyFilePresent: 0, legacyFileLocatorSha256: null, legacyTextPresent: 0, legacyTextSha256: null, legacyTextBytes: null,
  ...overrides,
});
const recipe = () => {
  const source = contract();
  const typeIdentity = sha("dbo.compacttypecode\0LABOR");
  const typeBinding = { sourceTable: "dbo.compacttypecode", sourceKey: "LABOR", sourceIdentitySha256: typeIdentity, sourcePkCanonical: `sha256:${typeIdentity}`, sourceTypeCode: "LABOR", sourceTypeName: "劳动合同", targetTable: "hr_contract_type", targetContractTypeId: "00000000-0000-5000-8000-000000000001", mappingStatus: "verified", mappingEvidenceSha256: sha("legacy_record_map receipt fixture") };
  const contractTypeMappingArtifact = { formatVersion: 1, sourceSystem: "yuzhou-v10", targetScope: { tenantId: "10000001", parkId: "20000001" }, bindings: [typeBinding] };
  contractTypeMappingArtifact.artifactSha256 = sha(recursiveCanonical(contractTypeMappingArtifact));
  const input = { recipeVersion: "yuzhou-reusable-incremental-contract-v1", recipeSha256: "", sourceSystem: "yuzhou-v10", extractedAt: "2026-10-03T08:00:00Z", employeeIndex: [{ employeeCode: "E-001", sourceTable: "dbo.person", sourceKey: "E-001" }], contractTypeMappingArtifact, contractStateResolutions: { "正常": { normalizedStatus: "draft", mappingEvidence: "reviewed T2 state mapping fixture" } }, records: [sourceRow("HT-2026-001", source)] };
  // Obtain the immutable recipe value from the public validator without making
  // tests duplicate a hidden mapper implementation.
  const probe = structuredClone(input); probe.recipeSha256 = "x".repeat(64);
  try { buildYuzhouReusableIncrementalPackage(probe); } catch (error) { assert.equal(error.message, "YUZHOU_REUSABLE_INCREMENTAL_INPUT_INVALID"); }
  input.recipeSha256 = YUZHOU_REUSABLE_INCREMENTAL_RECIPE_SHA256;
  return input;
};

const input = recipe();
const before = structuredClone(input);
const result = buildYuzhouReusableIncrementalPackage(input);
assert.deepEqual(input, before, "adapter must not mutate source extraction");
assert.equal(result.packageDto.items.length, 1);
const item = result.packageDto.items[0];
assert.deepEqual(item.fields, { employeeSourceKey: `sha256:${sha("dbo.person\0E-001")}`, employeeSourceTable: "dbo.person", contractTypeId: "00000000-0000-5000-8000-000000000001", contractNo: "HT-2026-001", startDate: "2024-01-01", endDate: "2025-12-31", probationEndDate: "2024-03-31", workType: null, positionTitle: null, contractStatus: "draft" });
assert.equal(item.rowDigest, sha(JSON.stringify({ domain: "contract", fields: Object.fromEntries(Object.entries(item.fields).sort(([a], [b]) => a.localeCompare(b))), sourceKey: item.sourceKey, sourceTable: "dbo.compact", sourceUpdatedAt: null })));
assert.equal(result.manifest.supportedDomains[0], "contract");
assert.ok(result.coverage.pending.some(entry => entry.domain === "profile"));
assert.equal(result.manifest.declarations[0].normalizedStatus, "draft");
assert.equal(result.manifest.declarations[0].contractType.targetContractTypeId, item.fields.contractTypeId);
assert.ok(result.coverage.sourceFieldCoverage[0].fieldCoverage.some(entry => entry.field === "start_date" && entry.disposition === "carried"));
assert.ok(result.coverage.sourceFieldCoverage[0].fieldCoverage.some(entry => entry.field === "base_salary" && entry.disposition === "pending_api_adapter"));

const reExtracted = structuredClone(input);
reExtracted.extractedAt = "2026-10-04T08:00:00Z";
assert.deepEqual(buildYuzhouReusableIncrementalPackage(reExtracted).packageDto.items, result.packageDto.items, "unchanged source maps identically without a historical A/B rerun");

const drifted = structuredClone(input); drifted.records[0].source.contractNo = "altered-without-new-row-digest";
assert.throws(() => buildYuzhouReusableIncrementalPackage(drifted), /T2_SOURCE_HASH_MISMATCH/u);
const missingRelation = structuredClone(input); missingRelation.employeeIndex = [];
assert.throws(() => buildYuzhouReusableIncrementalPackage(missingRelation), /YUZHOU_REUSABLE_INCREMENTAL_EMPLOYEE_MISSING/u);
const unresolvedState = structuredClone(input); unresolvedState.contractStateResolutions = {};
assert.throws(() => buildYuzhouReusableIncrementalPackage(unresolvedState), /YUZHOU_REUSABLE_INCREMENTAL_STATE_UNRESOLVED/u);
const empty = structuredClone(input); empty.records = [];
assert.equal(buildYuzhouReusableIncrementalPackage(empty).packageDto, null);
const clearedDate = structuredClone(input); clearedDate.records[0].source.endDate = null; clearedDate.records[0].sourceRowSha256 = sha(canonical(clearedDate.records[0].source));
assert.equal(buildYuzhouReusableIncrementalPackage(clearedDate).packageDto.items[0].fields.endDate, null);
const active = structuredClone(input); active.contractStateResolutions["正常"].normalizedStatus = "active";
const activeResult = buildYuzhouReusableIncrementalPackage(active);
assert.equal(activeResult.packageDto.items[0].fields.contractStatus, "active");
assert.equal(activeResult.manifest.declarations[0].sourceLegacyState, "正常");
const typeDrift = structuredClone(input); typeDrift.contractTypeMappingArtifact.bindings[0].targetContractTypeId = "00000000-0000-5000-8000-000000000002";
assert.throws(() => buildYuzhouReusableIncrementalPackage(typeDrift), /YUZHOU_REUSABLE_INCREMENTAL_TYPE_ARTIFACT_DRIFT/u);

const root = mkdtempSync(join(tmpdir(), "yuzhou-reusable-incremental-"));
try {
  const inputPath = join(root, "input.json"), output = join(root, "output");
  writeFileSync(inputPath, `${JSON.stringify(input)}\n`, { mode: 0o600 }); chmodSync(inputPath, 0o600);
  const written = materializeYuzhouReusableIncrementalPackage({ inputPath, outputDir: output });
  assert.equal(written.productionImport, "HOLD");
  assert.equal(statSync(output).mode & 0o777, 0o700);
  for (const path of [written.packagePath, written.manifestPath, written.coveragePath]) assert.equal(statSync(path).mode & 0o777, 0o600);
  assert.deepEqual(JSON.parse(readFileSync(written.packagePath, "utf8")), result.packageDto);
  const cliOutput = join(root, "cli-output");
  const cli = JSON.parse(execFileSync(process.execPath, ["scripts/hr-cutover/build-yuzhou-reusable-incremental-package.mjs", "--input", inputPath, "--output", cliOutput], { encoding: "utf8" }));
  assert.equal(cli.itemCount, 1);
  const emptyPath = join(root, "empty.json"); writeFileSync(emptyPath, JSON.stringify(empty), {mode:0o600}); chmodSync(emptyPath,0o600);
  const emptyCli = JSON.parse(execFileSync(process.execPath, ["scripts/hr-cutover/build-yuzhou-reusable-incremental-package.mjs", "--input", emptyPath, "--output", join(root,"empty-output")], {encoding:"utf8"}));
  assert.equal(emptyCli.itemCount,0); assert.equal(emptyCli.packagePath,null);
  assert.deepEqual(JSON.parse(readFileSync(join(cliOutput, "package.json"), "utf8")), result.packageDto);
} finally { rmSync(root, { recursive: true, force: true }); }

console.log("Yuzhou reusable incremental package contract passed: verified T2 contract mapping, source identity relation, digest determinism, drift rejection, and private offline artifacts");
