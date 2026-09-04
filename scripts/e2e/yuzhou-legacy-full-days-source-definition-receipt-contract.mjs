#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  analyzeLegacyFullDaysSourceDefinition,
  buildLegacyFullDaysSourceDefinitionReceipt,
  LegacyFullDaysSourceDefinitionReceiptError,
  validateLegacyFullDaysSourceDefinitionContract,
} from "../hr-cutover/legacy-full-days-source-definition-receipt.mjs";

const root = resolve(import.meta.dirname, "../..");
const contractPath = resolve(root, "scripts/hr-cutover/contracts/legacy-full-days-source-definition-receipt-v1.json");
const contract = () => JSON.parse(readFileSync(contractPath, "utf8"));
const rejects = (code, action) => assert.throws(
  action,
  error => error instanceof LegacyFullDaysSourceDefinitionReceiptError && error.code === code,
);

test("FullDays definition receipt binds the controlled manifest and routine ledger", () => {
  const value = contract();
  const validated = validateLegacyFullDaysSourceDefinitionContract(value, root);
  assert.equal(validated.expected.byteCount, 2143);
  assert.equal(validated.expected.lineCount, 55);
  assert.equal(validated.expected.inputParameterCount, 3);
  assert.equal(validated.expected.directReadDependencyCount, 2);
  assert.equal(validated.expected.directCalledRoutineCount, 0);
  assert.equal(validated.expected.directWriteDependencyCount, 0);
  assert.equal(value.semanticClassification.returnShape, "signed_32_bit_whole_number_scalar");
  assert.equal(value.compatibilityCredit, 0);
  assert.equal(value.productionImport, "HOLD");
});

test("source analyzer emits hashes counts and semantic classes without source details", () => {
  const safeFixture = Buffer.from(`CREATE FUNCTION dbo.FullDays(
    @year integer,
    @month integer,
    @person varchar(30)
  ) RETURNS integer AS BEGIN
    DECLARE @result integer;
    SELECT @result = CASE WHEN p.tablename = t.tablename THEN 1 ELSE NULL END
    FROM dbo.person p JOIN dbo.timekeeptable t ON p.tablename=t.tablename;
    RETURN @result;
  END`);
  const observed = analyzeLegacyFullDaysSourceDefinition(safeFixture);
  assert.equal(observed.inputParameterCount, 3);
  assert.equal(observed.directReadDependencyCount, 2);
  assert.equal(observed.directCalledRoutineCount, 0);
  assert.equal(observed.directWriteDependencyCount, 0);
  assert.equal(observed.dynamicWriteDependencyCount, 0);
  assert.equal(observed.returnShape, "signed_32_bit_whole_number_scalar");
  for (const key of ["sourceArtifactSha256", "inputParameterSetSha256", "returnSignatureSha256", "directReadDependencySetSha256", "directCalledRoutineSetSha256"]) {
    assert.match(observed[key], /^[a-f0-9]{64}$/u, key);
  }
  const serialized = JSON.stringify(observed);
  assert.doesNotMatch(serialized, /"(?:name|sourceType|readTables|calledRoutines|joinPredicates|definitionText)"\s*:/iu);
});

test("controlled source definition produces a zero-credit receipt when explicitly supplied", { skip: !process.env.FULL_DAYS_SOURCE_DEFINITION_PATH }, () => {
  const receipt = buildLegacyFullDaysSourceDefinitionReceipt({
    contract: contract(),
    repositoryRoot: root,
    sourceDefinitionPath: process.env.FULL_DAYS_SOURCE_DEFINITION_PATH,
  });
  assert.equal(receipt.routineId, "RULE-BD491199DA9913BE");
  assert.equal(receipt.sourceDefinitionVerified, true);
  assert.equal(receipt.sourceDefinitionIncluded, false);
  assert.equal(receipt.parameterNamesIncluded, false);
  assert.equal(receipt.dependencyNamesIncluded, false);
  assert.deepEqual(receipt.resolvedGapCodes, [
    "FULL_DAYS_SOURCE_BODY_NOT_COMMITTED",
    "FULL_DAYS_RETURN_TYPE_UNIT_AND_PRECISION_UNAVAILABLE",
  ]);
  assert.ok(receipt.residualGapCodes.includes("FULL_DAYS_RETURN_UNIT_UNPROVEN"));
  assert.equal(receipt.compatibilityCredit, 0);
  assert.equal(receipt.productionImport, "HOLD");
  assert.match(receipt.receiptSha256, /^[a-f0-9]{64}$/u);
  assert.doesNotMatch(JSON.stringify(receipt), /\/Users\/|Downloads|"(?:definitionText|parameterName|dependencyName)"\s*:/iu);
});

test("evidence drift and self-promotion fail closed", () => {
  for (const [code, mutate] of [
    ["FULL_DAYS_SOURCE_DEFINITION_EVIDENCE_DRIFT", value => { value.sourceEvidence.sourceManifest.sha256 = "0".repeat(64); }],
    ["FULL_DAYS_SOURCE_DEFINITION_EVIDENCE_DRIFT", value => { value.sourceEvidence.routineLedger.sha256 = "0".repeat(64); }],
    ["FULL_DAYS_SOURCE_DEFINITION_CONTRACT_INVALID", value => { value.expectedDefinition.returnSignatureSha256 = "0".repeat(64); }],
    ["FULL_DAYS_SOURCE_DEFINITION_CONTRACT_INVALID", value => { value.semanticClassification.returnShape = "unknown"; }],
    ["FULL_DAYS_SOURCE_DEFINITION_CONTRACT_INVALID", value => { value.resolution.residualGapCodes.pop(); }],
    ["FULL_DAYS_SOURCE_DEFINITION_CONTRACT_INVALID", value => { value.compatibilityCredit = 1; }],
    ["FULL_DAYS_SOURCE_DEFINITION_CONTRACT_INVALID", value => { value.productionImport = "READY"; }],
  ]) {
    const drifted = contract();
    mutate(drifted);
    rejects(code, () => validateLegacyFullDaysSourceDefinitionContract(drifted, root));
  }
});

test("receipt implementation never embeds or executes the legacy definition", () => {
  const source = readFileSync(resolve(root, "scripts/hr-cutover/legacy-full-days-source-definition-receipt.mjs"), "utf8");
  assert.doesNotMatch(source, /\b(?:sqlcmd|mssql|sp_executesql)\b/iu);
  assert.doesNotMatch(source, /(?:employeeName|employeeCode|idcard|password|credential|connectionString)/iu);
  const value = contract();
  assert.equal(value.sourceDefinitionIncluded, false);
  assert.equal(value.parameterNamesIncluded, false);
  assert.equal(value.dependencyNamesIncluded, false);
  assert.equal(value.containsPersonalData, false);
});
