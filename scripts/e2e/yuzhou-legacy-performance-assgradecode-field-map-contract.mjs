#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  LegacyPerformanceAssgradecodeFieldMapError,
  verifyLegacyPerformanceAssgradecodeFieldMap,
} from "../hr-cutover/legacy-performance-assgradecode-field-map.mjs";

const root = resolve(import.meta.dirname, "../..");
const contractPath = resolve(root, "scripts/hr-cutover/contracts/legacy-performance-assgradecode-field-map-v1.json");
const readContract = () => JSON.parse(readFileSync(contractPath, "utf8"));
const columns = [
  ["COLUMN-18932ED76900A366", "assgrade", "varchar(12)", false, null, null, "4f480d7f9343a6264ad4f6a4b308b0d3fd5c8c18d5928c897405a3c4ad000f4b"],
  ["COLUMN-992F7D99CE032F7D", "description", "varchar(500)", true, null, null, "656727cfdd01924207cfd70f8a6b78acf041d9895ba1dc59381d0a7daf18384c"],
  ["COLUMN-4F5A0BF9CEC461F6", "myorder", "varchar(2)", true, null, null, "bba966016eed3599f99811230f043653c3ae30fb91a9640d415d69a544abda79"],
  ["COLUMN-CAFA3D63B8BCDA5A", "assessmentid", "int", true, null, null, "92cedca3e338a38d72162d100dec1c97b20f24e34bb4232ef693151a825ba993"],
  ["COLUMN-4D99246DE54D6F07", "minvalue", "int", true, null, null, "a7f2c1fef026146d59a56e68592c4a3b8cee63d116b0894add85c54aff10e6f7"],
  ["COLUMN-32CDACDBE241A1D5", "maxvalue", "int", true, null, null, "dc8fb8dc7a878908467b8d19dc7eb065ff78dacdca2ca3bf17d7325069726b8b"],
];
const fixtureInventory = () => ({
  inventoryKind: "yuzhou_hr_legacy_structural_atomic_inventory",
  generatorVersion: "1.0.0",
  tables: [{
    id: "TABLE-D0397CEBDE12426B",
    name: "assgradecode",
    structuralHash: "04b25bbedd9658b652978087198ea33d54c26aa958950a33e9c45bd1f0ca8a8b",
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
const verify = input => verifyLegacyPerformanceAssgradecodeFieldMap(input.inventory, input.contract, { root });
const rejects = (code, action) => assert.throws(action, error => error instanceof LegacyPerformanceAssgradecodeFieldMapError && error.code === code);

test("assgradecode map accounts for all 6 fields even when safe aggregates are unavailable", () => {
  const receipt = verify(fixture());
  assert.deepEqual(receipt.sourceAggregates, { assgradecode: null });
  assert.equal(receipt.sourceRowCountStatus, "NOT_CAPTURED_IN_CURRENT_STRUCTURAL_INVENTORY");
  assert.deepEqual(receipt.summary, {
    sourceTables: 1,
    sourceFields: 6,
    verifiedTargetFields: 0,
    authorizedArchiveFields: 0,
    safelyExcludedFields: 0,
    explicitGapFields: 6,
  });
  assert.equal(receipt.fields.every(field => field.denominatorDisposition === "included"), true);
  assert.equal(receipt.nullAndEmptyFieldsRemainInDenominator, true);
  assert.equal(receipt.status, "GAP_ONLY_NO_COMPATIBILITY_CREDIT");
  assert.equal(receipt.productionImport, "HOLD");
  assert.match(receipt.receiptSha256, /^[a-f0-9]{64}$/u);
});

test("modern level columns do not earn credit without a reviewed legacy writer", () => {
  const receipt = verify(fixture());
  assert.deepEqual(receipt.compatibilityCredit, { numerator: 0, denominator: 6 });
  assert.equal(receipt.fields.every(field => field.disposition === "explicit_gap" && field.compatibilityCredit === 0), true);
  assert.deepEqual(receipt.fields.find(field => field.sourceField === "assgradecode.assgrade")?.targetFields, [
    "hr_performance_template_level.level_code",
  ]);
  assert.equal(receipt.fields.find(field => field.sourceField === "assgradecode.description")?.reasonCode, "PERFORMANCE_GRADE_DESCRIPTION_TARGET_CAPACITY_UNRESOLVED");
  assert.equal(receipt.legacyProjectionGap.reasonCode, "PERFORMANCE_ASSGRADECODE_EXTRACT_TRANSFORM_WRITER_MISSING");
});

test("stable inventory ids and hashes bind every nullable source field", () => {
  const receipt = verify(fixture());
  const assessment = receipt.fields.find(field => field.sourceField === "assgradecode.assessmentid");
  const max = receipt.fields.find(field => field.sourceField === "assgradecode.maxvalue");
  assert.equal(assessment?.sourceColumnId, "COLUMN-CAFA3D63B8BCDA5A");
  assert.equal(assessment?.sourceStructuralHash, "92cedca3e338a38d72162d100dec1c97b20f24e34bb4232ef693151a825ba993");
  assert.equal(assessment?.sourceNullable, true);
  assert.equal(max?.sourceType, "int");
  assert.equal(receipt.sourceAggregateGap.decision, "KEEP_GAP");
  assert.equal(receipt.inventoryBindingGap.decision, "KEEP_GAP_NO_REBIND");
});

test("unscoped legacy grade selection and dynamic print behavior remain explicit parity gaps", () => {
  const receipt = verify(fixture());
  assert.equal(receipt.routineBehaviorFindings.gradeSelectionScope, "bs_ass_compute_does_not_filter_assgradecode_by_assessmentid");
  assert.equal(receipt.routineBehaviorFindings.upperBoundUsage, "bs_ass_compute_does_not_use_maxvalue");
  assert.equal(receipt.relations[0].disposition, "explicit_gap_relation");
  assert.deepEqual(receipt.routineEvidence, {
    routineCount: 3,
    gradeCalculationRoutineCount: 1,
    dynamicPrintRoutineCount: 2,
    parityDecisionPending: true,
  });
  assert.deepEqual(receipt.explicitGaps.find(gap => gap.reasonCode === "PERFORMANCE_GRADE_THRESHOLD_SEMANTICS_UNRESOLVED")?.sourceFields, [
    "assgradecode.minvalue",
    "assgradecode.maxvalue",
  ]);
});

test("column loss, metadata drift, false credit and inventory rebinding fail closed", () => {
  const missing = fixture();
  missing.inventory.tables[0].columns.pop();
  missing.contract.inventorySha256 = createHash("sha256").update(`${JSON.stringify(missing.inventory)}\n`).digest("hex");
  rejects("PERFORMANCE_ASSGRADECODE_FIELD_SOURCE_METADATA_INVALID", () => verify(missing));

  const typeDrift = fixture();
  typeDrift.inventory.tables[0].columns.find(column => column.name === "myorder").type = "int";
  typeDrift.contract.inventorySha256 = createHash("sha256").update(`${JSON.stringify(typeDrift.inventory)}\n`).digest("hex");
  rejects("PERFORMANCE_ASSGRADECODE_FIELD_SOURCE_METADATA_INVALID", () => verify(typeDrift));

  const promoted = fixture();
  promoted.contract.fields[0].disposition = "verified_target";
  promoted.contract.fields[0].compatibilityCredit = 1;
  promoted.contract.compatibilityCredit.numerator = 1;
  rejects("PERFORMANCE_ASSGRADECODE_FIELD_MAP_CONTRACT_INVALID", () => verify(promoted));

  const rebound = fixture();
  rebound.contract.inventoryBindingGap.canonicalInventorySha256 = rebound.contract.inventoryBindingGap.currentGeneratorObservedSha256;
  rejects("PERFORMANCE_ASSGRADECODE_FIELD_MAP_CONTRACT_INVALID", () => verify(rebound));
});

test("receipt and helper expose no source rows, credentials, personal data or binary content", () => {
  const receipt = verify(fixture());
  assert.equal(receipt.sourceRowValuesEmitted, false);
  assert.equal(receipt.containsSourceValues, false);
  assert.equal(receipt.containsPersonalData, false);
  assert.doesNotMatch(JSON.stringify(receipt), /employeeCode|fullName|sourceKey|sourceRowSha256|password|photofile|actualSize/iu);
  const helper = readFileSync(resolve(root, "scripts/hr-cutover/legacy-performance-assgradecode-field-map.mjs"), "utf8");
  assert.doesNotMatch(helper, /\b(?:sqlcmd|mssql|sp_executesql)\b|\bdocker\s+exec\b/iu);
});
