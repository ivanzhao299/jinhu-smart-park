#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  LegacyPerformanceAssessmentdetailFieldMapError,
  verifyLegacyPerformanceAssessmentdetailFieldMap,
} from "../hr-cutover/legacy-performance-assessmentdetail-field-map.mjs";

const root = resolve(import.meta.dirname, "../..");
const contractPath = resolve(root, "scripts/hr-cutover/contracts/legacy-performance-assessmentdetail-field-map-v1.json");
const readContract = () => JSON.parse(readFileSync(contractPath, "utf8"));
const columns = [
  ["COLUMN-D14942C772FDD604", "id", "int", false, null, null, "2f90d897303ec99475cf5b382f8b9a1063c058022a034137535dbebb9c066696"],
  ["COLUMN-8899EDFAD8DC19CC", "asssessionid", "int", true, null, null, "02d4089778d7eb5763b424f93d342fb54fe0f776029deb73985a7d8ef3d9f00e"],
  ["COLUMN-E5AAD33E86895F7E", "person", "varchar(10)", true, null, null, "b3529de1c7bd7582afea78082915e9ad4c050ca99808a1f8fb3ebc59bc6ccacb"],
  ["COLUMN-84A52F73862808E3", "assitemid", "int", true, null, null, "02ecc8e5da035a328b72dba8edf739d1e67c505679b9364568b7aec65d0edad0"],
  ["COLUMN-F0D1DCBAB25C5C79", "selfvalue", "numeric(18,2)", true, null, null, "3dcbd824fa5ad12dbcf632b22e0aa56d950c4e60ca5287910edc5619e2f5b9d4"],
  ["COLUMN-5F285D9C5A5147BA", "mitemvalue", "numeric(18,2)", true, null, null, "316d571d58b52b78a58d4279da8b1808b7e0ef774d0afb9e2c226ee32ec9ed2a"],
  ["COLUMN-D35643C54A468885", "itemvalue", "numeric(18,2)", true, "(0)", null, "41f4264dde3e1e5ff71afc0d71eebf744762b05fbbc3fe8ac21675ffb0831926"],
  ["COLUMN-6CC522513D05912B", "xitemvalue", "numeric(18,2)", true, null, null, "c158c0a102110cf42ece4eaaf15771ff3804112c7d8742ec38113dfcf43ebbe1"],
  ["COLUMN-7387B48190FD4EDA", "citemvalue", "numeric(18,2)", true, null, null, "95471b2f8fda7b816b455a7877d103e9d3239327b425ac0d99774e722c66ac6a"],
  ["COLUMN-CF738FC7EFDE0E8F", "selfgrade", "varchar(12)", true, null, null, "955f0a6799324a4401a3202dc7f27a343f6313c4eda75617e08f00596f226f06"],
  ["COLUMN-FA4A908A72CD56D4", "assgrade", "varchar(12)", true, null, null, "6166ed650fade31bd856da7b193f0f9ba3f7326d21ec3c32d6ba998b5f8149a1"],
  ["COLUMN-80BAECE96404BDAC", "appraisal", "varchar(200)", true, null, "评定", "ef3c9933ebdb0f5df0a6701d00ee8751a3e3b72777625a4666db7280e7faa4f2"],
];
const fixtureInventory = () => ({ inventoryKind: "yuzhou_hr_legacy_structural_atomic_inventory", generatorVersion: "1.0.0", tables: [{ id: "TABLE-E7C19611B44BEBBB", name: "assessmentdetail", structuralHash: "bb027ae37045c1d871df3b2e2846fba0e3d514663509031fc1b63f23acee0b38", sourceArtifactSha256: "11a52007536298bb59c655f1d70317a03f9394a63dbf9a286eaa0165d65553fe", columns: columns.map(([id, name, type, nullable, defaultValue, description, structuralHash]) => ({ id, name, type, nullable, default: defaultValue, description, structuralHash })) }] });
const fixture = () => { const inventory = fixtureInventory(); const contract = readContract(); contract.inventorySha256 = createHash("sha256").update(`${JSON.stringify(inventory)}\n`).digest("hex"); return { inventory, contract }; };
const verify = input => verifyLegacyPerformanceAssessmentdetailFieldMap(input.inventory, input.contract, { root });
const rejects = (code, action) => assert.throws(action, error => error instanceof LegacyPerformanceAssessmentdetailFieldMapError && error.code === code);

test("assessmentdetail accounts for all 12 fields including nullable, defaulted and compute-unreferenced columns", () => {
  const receipt = verify(fixture());
  assert.deepEqual(receipt.sourceAggregates, { assessmentdetail: null });
  assert.deepEqual(receipt.summary, { sourceTables: 1, sourceFields: 12, verifiedTargetFields: 0, authorizedArchiveFields: 0, safelyExcludedFields: 0, explicitGapFields: 12 });
  assert.equal(receipt.fields.every(field => field.denominatorDisposition === "included"), true);
  assert.deepEqual(receipt.routineBehaviorFindings.notConsumedByBoundCompute, ["assessmentdetail.id", "assessmentdetail.assitemid", "assessmentdetail.selfgrade", "assessmentdetail.assgrade", "assessmentdetail.appraisal"]);
  assert.equal(receipt.nullAndEmptyFieldsRemainInDenominator, true);
  assert.equal(receipt.status, "GAP_ONLY_NO_COMPATIBILITY_CREDIT");
});

test("five legacy value components are not falsely collapsed into two modern submission roles", () => {
  const receipt = verify(fixture());
  assert.deepEqual(receipt.compatibilityCredit, { numerator: 0, denominator: 12 });
  assert.equal(receipt.fields.every(field => field.disposition === "explicit_gap" && field.compatibilityCredit === 0), true);
  assert.equal(receipt.scoringModelGap.reasonCode, "PERFORMANCE_DETAIL_FIVE_COMPONENT_TO_MODERN_ROLE_MODEL_UNRESOLVED");
  assert.deepEqual(receipt.routineBehaviorFindings.aggregatedFields, ["assessmentdetail.selfvalue", "assessmentdetail.mitemvalue", "assessmentdetail.itemvalue", "assessmentdetail.xitemvalue", "assessmentdetail.citemvalue"]);
  assert.equal(receipt.explicitGaps.find(gap => gap.reasonCode === "PERFORMANCE_DETAIL_FIVE_COMPONENT_TO_MODERN_ROLE_MODEL_UNRESOLVED")?.sourceFields.length, 4);
});

test("declared item relation, composite aggregation join and unproven relations stay distinct", () => {
  const receipt = verify(fixture());
  assert.deepEqual(receipt.relations[0], { source: "assessmentdetail.assitemid", target: "assitem.id", kind: "declared_foreign_key", disposition: "verified_source_relation" });
  assert.equal(receipt.relations[1].kind, "routine_composite_join_without_declared_foreign_key");
  assert.equal(receipt.relations[3].disposition, "explicit_gap_relation");
  assert.equal(receipt.relations[4].reasonCode, "PERFORMANCE_DETAIL_GRADE_RELATION_UNPROVEN");
  const appraisal = receipt.fields.find(field => field.sourceField === "assessmentdetail.appraisal");
  assert.equal(appraisal?.sourceColumnId, "COLUMN-80BAECE96404BDAC");
  assert.equal(appraisal?.sourceStructuralHash, "ef3c9933ebdb0f5df0a6701d00ee8751a3e3b72777625a4666db7280e7faa4f2");
});

test("record creation and aggregation routines are both bound without exposing rows", () => {
  const receipt = verify(fixture());
  assert.deepEqual(receipt.routineEvidence, { routineCount: 2, recordCreationRoutineCount: 1, aggregationRoutineCount: 1, fiveComponentParityPending: true });
  assert.match(receipt.routineBehaviorFindings.recordCreation, /session_person_and_matching_assitem/u);
  assert.match(receipt.routineBehaviorFindings.aggregation, /null_as_zero/u);
  assert.equal(receipt.sourceAggregateGap.missingEvidence.includes("five_score_component_population_and_range_counts"), true);
  assert.equal(receipt.productionImport, "HOLD");
  assert.match(receipt.receiptSha256, /^[a-f0-9]{64}$/u);
});

test("column loss, metadata drift, false credit and incomplete gap denominator fail closed", () => {
  const missing = fixture();
  missing.inventory.tables[0].columns.pop();
  missing.contract.inventorySha256 = createHash("sha256").update(`${JSON.stringify(missing.inventory)}\n`).digest("hex");
  rejects("PERFORMANCE_ASSESSMENTDETAIL_FIELD_SOURCE_METADATA_INVALID", () => verify(missing));

  const defaultDrift = fixture();
  defaultDrift.inventory.tables[0].columns.find(column => column.name === "itemvalue").default = null;
  defaultDrift.contract.inventorySha256 = createHash("sha256").update(`${JSON.stringify(defaultDrift.inventory)}\n`).digest("hex");
  rejects("PERFORMANCE_ASSESSMENTDETAIL_FIELD_SOURCE_METADATA_INVALID", () => verify(defaultDrift));

  const promoted = fixture();
  promoted.contract.fields[0].disposition = "verified_target";
  promoted.contract.fields[0].compatibilityCredit = 1;
  promoted.contract.compatibilityCredit.numerator = 1;
  rejects("PERFORMANCE_ASSESSMENTDETAIL_FIELD_MAP_CONTRACT_INVALID", () => verify(promoted));

  const droppedGap = fixture();
  droppedGap.contract.explicitGaps.at(-1).sourceFields = [];
  rejects("PERFORMANCE_ASSESSMENTDETAIL_FIELD_GAPS_INVALID", () => verify(droppedGap));
});

test("receipt and helper expose no source rows, credentials, personal data or binary content", () => {
  const receipt = verify(fixture());
  assert.equal(receipt.sourceRowValuesEmitted, false);
  assert.equal(receipt.containsSourceValues, false);
  assert.equal(receipt.containsPersonalData, false);
  assert.doesNotMatch(JSON.stringify(receipt), /employeeCode|fullName|sourceKey|sourceRowSha256|password|photofile|actualSize/iu);
  const helper = readFileSync(resolve(root, "scripts/hr-cutover/legacy-performance-assessmentdetail-field-map.mjs"), "utf8");
  assert.doesNotMatch(helper, /\b(?:sqlcmd|mssql|sp_executesql)\b|\bdocker\s+exec\b/iu);
});
