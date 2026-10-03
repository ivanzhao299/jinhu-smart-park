#!/usr/bin/env node
/* global console, process, structuredClone */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { canonicalDecisionHash } from "../hr-cutover/yuzhou-job-state-decision-artifact-lib.mjs";
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
  const input = { recipeVersion: "yuzhou-reusable-incremental-v2", recipeSha256: "", sourceSystem: "yuzhou-v10", extractedAt: "2026-10-03T08:00:00Z", employeeIndex: [{ employeeCode: "E-001", sourceTable: "dbo.person", sourceKey: "E-001" }], employeeRecords: [], contractTypeMappingArtifact, contractStateResolutions: { "正常": { normalizedStatus: "draft", mappingEvidence: "reviewed T2 state mapping fixture" } }, records: [sourceRow("HT-2026-001", source)] };
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
assert.ok(result.coverage.pending.some(entry => entry.domain === "profile_extended_fields"));
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

// Reuse the real v2 CLI fixture input rather than reproducing its state mapper.
const employeeRoot = mkdtempSync(join(tmpdir(), "yuzhou-reusable-employee-"));
try {
  execFileSync(process.execPath, ["scripts/e2e/yuzhou-reusable-incremental-package-fixture.mjs", "--root", employeeRoot, "--contract-type-id", "00000000-0000-5000-8000-000000000001", "--employee-only", "yes"], { encoding: "utf8" });
  const employeeInput = JSON.parse(readFileSync(join(employeeRoot, "input.json"), "utf8"));
  delete employeeInput.contractTypeMappingArtifact; delete employeeInput.contractStateResolutions;
  const seed = employeeInput.employeeRecords[0];
  const makeEmployee = index => {
    const sourceKey = `CLI-BATCH-${String(index).padStart(4, "0")}`;
    const source = { ...seed.source, fullName: `Synthetic employee ${index}`, departmentCode: `D-${index % 3}`, positionCode: `P-${index % 5}` };
    return { sourceTable: "dbo.person", sourceKey, sourceIdentitySha256: sha(`dbo.person\0${sourceKey}`), sourceRowSha256: sha(canonical(source)), source };
  };
  employeeInput.employeeRecords = Array.from({ length: 2001 }, (_, index) => makeEmployee(index + 1));
  const employeeBefore = structuredClone(employeeInput);
  const batches = buildYuzhouReusableIncrementalPackage(employeeInput);
  assert.deepEqual(employeeInput, employeeBefore, "employee adapter must not mutate source extraction");
  assert.equal(batches.packageDtos.length, 2); assert.deepEqual(batches.packageDtos.map(value => value.items.length), [2000, 1]);
  assert.ok(batches.packageDtos.every(value => value.items.length <= 2000));
  assert.equal(new Set(batches.packageDtos.flatMap(value => value.items.map(item => item.sourceKey))).size, 2001);
  const reversed = structuredClone(employeeInput); reversed.employeeRecords.reverse();
  assert.deepEqual(buildYuzhouReusableIncrementalPackage(reversed).packageDtos, batches.packageDtos, "source order must not affect batches");
  const exact = structuredClone(employeeInput); exact.employeeRecords = exact.employeeRecords.slice(0, 2000);
  assert.equal(buildYuzhouReusableIncrementalPackage(exact).packageDtos.length, 1);
  const zero = structuredClone(employeeInput); zero.employeeRecords = [];
  const zeroResult = buildYuzhouReusableIncrementalPackage(zero); assert.equal(zeroResult.packageDtos.length, 0); assert.equal(zeroResult.manifest.typeMappingArtifactSha256, null);
  const evidence = batches.manifest.sourceEvidence[0]; assert.ok("rawSource" in evidence); assert.ok(evidence.fieldCoverage.some(field => field.field === "departmentCode" && field.disposition === "pending_api_adapter")); assert.ok(evidence.fieldCoverage.some(field => field.field === "formalDate" && field.disposition === "pending_semantic_binding"));
  const invalidDate = structuredClone(employeeInput); invalidDate.employeeRecords[0].source.hireDate = "2026-02-30"; invalidDate.employeeRecords[0].sourceRowSha256 = sha(canonical(invalidDate.employeeRecords[0].source)); assert.throws(() => buildYuzhouReusableIncrementalPackage(invalidDate), /EMPLOYEE_HIRE_DATE_INVALID/u);
  const identityDrift = structuredClone(employeeInput); identityDrift.employeeRecords[0].sourceIdentitySha256 = "0".repeat(64); assert.throws(() => buildYuzhouReusableIncrementalPackage(identityDrift), /EMPLOYEE_SOURCE_HASH_MISMATCH/u);
  const rowDrift = structuredClone(employeeInput); rowDrift.employeeRecords[0].source.fullName = "row drift"; assert.throws(() => buildYuzhouReusableIncrementalPackage(rowDrift), /EMPLOYEE_SOURCE_HASH_MISMATCH/u);
  const one = structuredClone(employeeInput); one.employeeRecords = [one.employeeRecords[0]];
  for (const [field, value, error] of [["fullName", "😀".repeat(51), /EMPLOYEE_NAME_INVALID/u], ["legacyStatus", "unknown", /EMPLOYEE_STATE_UNRESOLVED/u], ["formalDate", "2026-02-30", /EMPLOYEE_FORMAL_DATE_INVALID/u]]) {
    const invalid = structuredClone(one); invalid.employeeRecords[0].source[field] = value;
    invalid.employeeRecords[0].sourceRowSha256 = sha(recursiveCanonical(invalid.employeeRecords[0].source));
    assert.throws(() => buildYuzhouReusableIncrementalPackage(invalid), error);
  }
  const longCode = structuredClone(one); const longRow = longCode.employeeRecords[0]; longRow.sourceKey = "E".repeat(65); longRow.sourceIdentitySha256 = sha(`dbo.person\0${longRow.sourceKey}`);
  assert.throws(() => buildYuzhouReusableIncrementalPackage(longCode), /EMPLOYEE_CODE_INVALID/u);
  const duplicate = structuredClone(one); duplicate.employeeRecords.push(structuredClone(duplicate.employeeRecords[0]));
  assert.throws(() => buildYuzhouReusableIncrementalPackage(duplicate), /EMPLOYEE_AMBIGUOUS|SOURCE_DUPLICATE/u);
  const repeated = structuredClone(one); repeated.extractedAt = "2026-10-04T08:00:00Z";
  assert.deepEqual(buildYuzhouReusableIncrementalPackage(repeated).packageDto.items, buildYuzhouReusableIncrementalPackage(one).packageDto.items);
  const v2 = one.jobStateDecisionArtifact;
  const legacy = { formatVersion:1,artifactKind:"yuzhou_employee_job_state_reviewed_decision",artifactVersion:"v1",artifactStatus:"DRAFT",scopeBinding:v2.scopeBinding,sourceContract:v2.sourceContract,
    decisions:v2.decisions.map(decision=>Object.fromEntries(Object.entries({...decision,reasonCode:"APPROVED_MAPPING"}).filter(([field])=>field!=="semanticClassification"))),canonicalDecisionSha256:"",review:{status:"DRAFT",reviewerSubjectSha256:null,reviewedDecisionSha256:null,reviewedAt:null},detachedHrApproval:{required:true,status:"HOLD",attestationSha256:null},productionImport:"HOLD" };
  legacy.canonicalDecisionSha256 = canonicalDecisionHash(legacy);
  const auditOnly = structuredClone(one); auditOnly.jobStateDecisionArtifact = legacy;
  assert.throws(() => buildYuzhouReusableIncrementalPackage(auditOnly), /JOB_STATE_ARTIFACT_NOT_MATERIALIZABLE/u);
  const batchInputPath = join(employeeRoot,"batch-input.json"); writeFileSync(batchInputPath,JSON.stringify(employeeInput),{mode:0o600});
  const materialized = materializeYuzhouReusableIncrementalPackage({inputPath:batchInputPath,outputDir:join(employeeRoot,"batches")});
  assert.equal(materialized.packagePath,null,"a multi-batch result must not look like a complete single package");
  assert.equal(materialized.packagePaths.length,2);
  assert.deepEqual(materialized.packagePaths.map(path=>JSON.parse(readFileSync(path,"utf8"))),batches.packageDtos);
  for(const path of [...materialized.packagePaths,materialized.manifestPath,materialized.coveragePath])assert.equal(statSync(path).mode&0o777,0o600);

} finally { rmSync(employeeRoot, { recursive: true, force: true }); }

console.log("Yuzhou reusable incremental package contract passed: verified employee/contract mapping, v2 eligibility, source identity, deterministic 2000-row batches, drift rejection, and private artifacts");
