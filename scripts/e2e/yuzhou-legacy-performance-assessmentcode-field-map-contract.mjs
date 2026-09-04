#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  LegacyPerformanceAssessmentcodeFieldMapError,
  verifyLegacyPerformanceAssessmentcodeFieldMap,
} from "../hr-cutover/legacy-performance-assessmentcode-field-map.mjs";

const root = resolve(import.meta.dirname, "../..");
const contractPath = resolve(root, "scripts/hr-cutover/contracts/legacy-performance-assessmentcode-field-map-v1.json");
const readContract = () => JSON.parse(readFileSync(contractPath, "utf8"));
const columns = [
  ["COLUMN-753076DC2796C230", "assessment", "int", false, null, null, "d746ecae9bff01aa539d743fb562c6353ab8d842573a92e0136ddcec35f40613"],
  ["COLUMN-0456A3303158C1F6", "assessmentname", "varchar(50)", true, null, null, "f09a36f07aad958dd2df0aac9d1ef58df93498c9812fee39935a0121d420e17e"],
  ["COLUMN-75504E9884B1E650", "department", "varchar(30)", true, "('000')", null, "70f60f21995070dbbcf972fb168deb2e49b540f402898886b904be32ad9ea297"],
  ["COLUMN-2CB15CE72C0A9770", "mpercent", "int", true, "(100)", null, "0b541b0fdf4c4d908ba8bbcf6e296544379dbd4711e3076931ecbbb83740afe1"],
  ["COLUMN-D1C4BE8335F1E42C", "tpercent", "int", true, null, null, "a562bbcca6685593be179eebc8bd54fc9dc5b71e2670f48930e116de5ad55510"],
  ["COLUMN-6F2C4878EF48A8DA", "xpercent", "int", true, null, null, "fc935fc38f8304b2308719e1b86391562595cbe26b9d16845d3de2e6fc4b8801"],
  ["COLUMN-51A4E18F9D12A6F8", "cpercent", "int", true, null, null, "2a6f05d1bb26762b96fad89c59bd3289488dd7b98ddd3719dd7ac0e0ae68ce29"],
  ["COLUMN-2E07321553C7CDDF", "spercent", "int", true, null, null, "edfc59591d655dab414575c1a081a0058600e03bc8764f0fd1c01055b35d7f88"],
  ["COLUMN-5263921B93440359", "timekeep", "bit", true, "(1)", null, "3f314321b6d174cd97c4a683c3a43604e780f514bbc0933f9e47826f04c44533"],
  ["COLUMN-545E0004A0B349D7", "bonus", "bit", true, "(1)", null, "742f52c87ebd78104bb5732aa57ab70bb10279231eb7c70c4e16b00c6441703b"],
  ["COLUMN-8C5EE2D7D7543BA0", "master", "bit", true, "(1)", null, "c619e4ce645a31219e733a8484156bfbc6a9cb5a7258a91d0e5b93003a2f70c6"],
];
const fixtureInventory = () => ({
  inventoryKind: "yuzhou_hr_legacy_structural_atomic_inventory",
  generatorVersion: "1.0.0",
  tables: [{
    id: "TABLE-EC6B29966591245A",
    name: "assessmentcode",
    structuralHash: "ad67cc0085c0c4da2b1d23802fad8c8815caeb8d9af35e7982a3b9ee8370cd3f",
    sourceArtifactSha256: "11a52007536298bb59c655f1d70317a03f9394a63dbf9a286eaa0165d65553fe",
    columns: columns.map(([id, name, type, nullable, defaultValue, description, structuralHash]) => ({
      id, name, type, nullable, default: defaultValue, description, structuralHash,
    })),
  }],
});
const fixture = () => {
  const inventory = fixtureInventory();
  const contract = readContract();
  contract.inventorySha256 = createHash("sha256").update(`${JSON.stringify(inventory)}\n`).digest("hex");
  return { inventory, contract };
};
const verify = input => verifyLegacyPerformanceAssessmentcodeFieldMap(input.inventory, input.contract, { root });
const rejects = (code, action) => assert.throws(action, error => error instanceof LegacyPerformanceAssessmentcodeFieldMapError && error.code === code);

test("assessmentcode map accounts for all 11 fields even when safe row aggregates are unavailable", () => {
  const receipt = verify(fixture());
  assert.deepEqual(receipt.sourceAggregates, { assessmentcode: null });
  assert.equal(receipt.sourceRowCountStatus, "NOT_CAPTURED_IN_CURRENT_STRUCTURAL_INVENTORY");
  assert.deepEqual(receipt.summary, {
    sourceTables: 1,
    sourceFields: 11,
    verifiedTargetFields: 0,
    authorizedArchiveFields: 0,
    safelyExcludedFields: 0,
    explicitGapFields: 11,
  });
  assert.equal(receipt.fields.every(field => field.denominatorDisposition === "included"), true);
  assert.equal(receipt.nullAndEmptyFieldsRemainInDenominator, true);
  assert.equal(receipt.status, "GAP_ONLY_NO_COMPATIBILITY_CREDIT");
  assert.equal(receipt.productionImport, "HOLD");
  assert.match(receipt.receiptSha256, /^[a-f0-9]{64}$/u);
});

test("modern lookalike tables do not earn credit without a dedicated legacy writer", () => {
  const receipt = verify(fixture());
  assert.deepEqual(receipt.compatibilityCredit, { numerator: 0, denominator: 11 });
  assert.equal(receipt.fields.every(field => field.disposition === "explicit_gap" && field.compatibilityCredit === 0), true);
  assert.deepEqual(receipt.fields.find(field => field.sourceField === "assessmentcode.assessment")?.targetFields, [
    "hr_performance_template.template_code",
  ]);
  assert.equal(receipt.fields.find(field => field.sourceField === "assessmentcode.department")?.reasonCode, "PERFORMANCE_TEMPLATE_ORG_SCOPE_MAPPING_UNRESOLVED");
  assert.equal(receipt.legacyProjectionGap.reasonCode, "PERFORMANCE_ASSESSMENTCODE_EXTRACT_TRANSFORM_WRITER_MISSING");
});

test("stable inventory ids and hashes bind nullable, defaulted and empty-value-capable fields", () => {
  const receipt = verify(fixture());
  const mpercent = receipt.fields.find(field => field.sourceField === "assessmentcode.mpercent");
  const bonus = receipt.fields.find(field => field.sourceField === "assessmentcode.bonus");
  assert.equal(mpercent?.sourceColumnId, "COLUMN-2CB15CE72C0A9770");
  assert.equal(mpercent?.sourceStructuralHash, "0b541b0fdf4c4d908ba8bbcf6e296544379dbd4711e3076931ecbbb83740afe1");
  assert.equal(mpercent?.sourceNullable, true);
  assert.equal(bonus?.sourceType, "bit");
  assert.equal(receipt.sourceAggregateGap.decision, "KEEP_GAP");
  assert.equal(receipt.inventoryBindingGap.decision, "KEEP_GAP_NO_REBIND");
});

test("weighted calculation and both routine relationships remain explicit implementation constraints", () => {
  const receipt = verify(fixture());
  assert.equal(receipt.calculationRuleEvidence.percentageUnitTransform, "legacy_integer_percentage_points_divided_by_100_before_modern_fractional_weight");
  assert.match(receipt.calculationRuleEvidence.weightedTotal, /mitemvalue\*mpercent\/100/u);
  assert.deepEqual(receipt.relations, [{
    source: "person.assessment",
    target: "assessmentcode.assessment",
    kind: "routine_join_without_declared_foreign_key",
    disposition: "verified_source_relation",
  }]);
  assert.deepEqual(receipt.routineEvidence, {
    routineCount: 2,
    weightedCalculationRoutineCount: 1,
    dynamicSqlRoutineCount: 1,
    formulaParityPending: true,
  });
  assert.equal(receipt.explicitGaps.find(gap => gap.reasonCode === "PERFORMANCE_WEIGHT_DIMENSION_IDENTITY_AND_WRITER_UNRESOLVED")?.sourceFields.length, 5);
});

test("column loss, metadata drift, false credit and inventory rebinding fail closed", () => {
  const missing = fixture();
  missing.inventory.tables[0].columns.splice(5, 1);
  missing.contract.inventorySha256 = createHash("sha256").update(`${JSON.stringify(missing.inventory)}\n`).digest("hex");
  rejects("PERFORMANCE_ASSESSMENTCODE_FIELD_SOURCE_METADATA_INVALID", () => verify(missing));

  const defaultDrift = fixture();
  defaultDrift.inventory.tables[0].columns.find(column => column.name === "mpercent").default = "(0)";
  defaultDrift.contract.inventorySha256 = createHash("sha256").update(`${JSON.stringify(defaultDrift.inventory)}\n`).digest("hex");
  rejects("PERFORMANCE_ASSESSMENTCODE_FIELD_SOURCE_METADATA_INVALID", () => verify(defaultDrift));

  const promoted = fixture();
  promoted.contract.fields[0].disposition = "verified_target";
  promoted.contract.fields[0].compatibilityCredit = 1;
  promoted.contract.compatibilityCredit.numerator = 1;
  rejects("PERFORMANCE_ASSESSMENTCODE_FIELD_MAP_CONTRACT_INVALID", () => verify(promoted));

  const rebound = fixture();
  rebound.contract.inventoryBindingGap.canonicalInventorySha256 = rebound.contract.inventoryBindingGap.currentGeneratorObservedSha256;
  rejects("PERFORMANCE_ASSESSMENTCODE_FIELD_MAP_CONTRACT_INVALID", () => verify(rebound));
});

test("receipt and helper expose no source rows, credentials, personal data or binary content", () => {
  const receipt = verify(fixture());
  assert.equal(receipt.sourceRowValuesEmitted, false);
  assert.equal(receipt.containsSourceValues, false);
  assert.equal(receipt.containsPersonalData, false);
  assert.doesNotMatch(JSON.stringify(receipt), /employeeCode|fullName|sourceKey|sourceRowSha256|password|photofile|actualSize/iu);
  const helper = readFileSync(resolve(root, "scripts/hr-cutover/legacy-performance-assessmentcode-field-map.mjs"), "utf8");
  assert.doesNotMatch(helper, /\b(?:sqlcmd|mssql|sp_executesql)\b|\bdocker\s+exec\b/iu);
});
