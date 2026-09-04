#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  LegacyPerformanceAssitemgradedesFieldMapError,
  verifyLegacyPerformanceAssitemgradedesFieldMap,
} from "../hr-cutover/legacy-performance-assitemgradedes-field-map.mjs";

const root = resolve(import.meta.dirname, "../..");
const contractPath = resolve(root, "scripts/hr-cutover/contracts/legacy-performance-assitemgradedes-field-map-v1.json");
const readContract = () => JSON.parse(readFileSync(contractPath, "utf8"));
const columns = [
  ["COLUMN-CBE2DD1F0D43449B", "id", "int", false, null, null, "2f90d897303ec99475cf5b382f8b9a1063c058022a034137535dbebb9c066696"],
  ["COLUMN-D0376760168C1506", "assitemid", "int", true, null, null, "02ecc8e5da035a328b72dba8edf739d1e67c505679b9364568b7aec65d0edad0"],
  ["COLUMN-210FDA4A2DD9768D", "grade", "varchar(12)", true, null, null, "7834c06053fbc92cb741c1d35919bf268b65c757f041e674085ef51ce9840f4b"],
  ["COLUMN-10DC9065B1BE12B2", "description", "varchar(500)", true, null, null, "656727cfdd01924207cfd70f8a6b78acf041d9895ba1dc59381d0a7daf18384c"],
  ["COLUMN-8A869FF6BA5D5852", "minvalue", "int", true, null, null, "a7f2c1fef026146d59a56e68592c4a3b8cee63d116b0894add85c54aff10e6f7"],
  ["COLUMN-2AAF708D73E00EB3", "maxvalue", "int", true, null, null, "dc8fb8dc7a878908467b8d19dc7eb065ff78dacdca2ca3bf17d7325069726b8b"],
  ["COLUMN-1F995CD0D09FF2A5", "myorder", "int", true, null, null, "7e8d853ae59c191fe7997e3ea5aa1f8e1a005ca0a4985a8af33d0e2207047cca"],
];
const fixtureInventory = () => ({
  inventoryKind: "yuzhou_hr_legacy_structural_atomic_inventory",
  generatorVersion: "1.0.0",
  tables: [{
    id: "TABLE-8EB1FC8017DF1AEE", name: "assitemgradedes",
    structuralHash: "63f977e64b6f30eafb1fef249bd8f87b58373948496cc9f278387a6b8c3a500f",
    sourceArtifactSha256: "11a52007536298bb59c655f1d70317a03f9394a63dbf9a286eaa0165d65553fe",
    columns: columns.map(([id, name, type, nullable, defaultValue, description, structuralHash]) => ({ id, name, type, nullable, default: defaultValue, description, structuralHash })),
  }],
});
const fixture = () => {
  const inventory = fixtureInventory();
  const contract = readContract();
  contract.inventorySha256 = createHash("sha256").update(`${JSON.stringify(inventory)}\n`).digest("hex");
  return { inventory, contract };
};
const verify = input => verifyLegacyPerformanceAssitemgradedesFieldMap(input.inventory, input.contract, { root });
const rejects = (code, action) => assert.throws(action, error => error instanceof LegacyPerformanceAssitemgradedesFieldMapError && error.code === code);

test("assitemgradedes map accounts for all 7 fields including routine-unreferenced nullable fields", () => {
  const receipt = verify(fixture());
  assert.deepEqual(receipt.sourceAggregates, { assitemgradedes: null });
  assert.equal(receipt.sourceRowCountStatus, "NOT_CAPTURED_IN_CURRENT_STRUCTURAL_INVENTORY");
  assert.deepEqual(receipt.summary, { sourceTables: 1, sourceFields: 7, verifiedTargetFields: 0, authorizedArchiveFields: 0, safelyExcludedFields: 0, explicitGapFields: 7 });
  assert.equal(receipt.fields.every(field => field.denominatorDisposition === "included"), true);
  assert.deepEqual(receipt.routineBehaviorFindings.unusedByBoundRoutines, ["assitemgradedes.id", "assitemgradedes.minvalue", "assitemgradedes.maxvalue", "assitemgradedes.myorder"]);
  assert.equal(receipt.nullAndEmptyFieldsRemainInDenominator, true);
  assert.equal(receipt.status, "GAP_ONLY_NO_COMPATIBILITY_CREDIT");
  assert.match(receipt.receiptSha256, /^[a-f0-9]{64}$/u);
});

test("untyped scoring guide and generic modern writer do not earn compatibility credit", () => {
  const receipt = verify(fixture());
  assert.deepEqual(receipt.compatibilityCredit, { numerator: 0, denominator: 7 });
  assert.equal(receipt.fields.every(field => field.disposition === "explicit_gap" && field.compatibilityCredit === 0), true);
  assert.deepEqual(receipt.fields.find(field => field.sourceField === "assitemgradedes.description")?.targetFields, ["hr_performance_template_dimension.scoring_guide[].description"]);
  assert.equal(receipt.runtimeSurfaceGap.currentTarget, "untyped_hr_performance_template_dimension_scoring_guide_jsonb");
  assert.equal(receipt.runtimeSurfaceGap.decision, "KEEP_GAP");
});

test("declared item relation and cursor grade relation remain visible", () => {
  const receipt = verify(fixture());
  assert.deepEqual(receipt.relations, [
    { source: "assitemgradedes.assitemid", target: "assitem.id", kind: "declared_foreign_key", disposition: "verified_source_relation" },
    { source: "assitemgradedes.grade", target: "assgradecode.assgrade", kind: "routine_cursor_correlation_without_declared_foreign_key", disposition: "verified_source_relation" },
  ]);
  const grade = receipt.fields.find(field => field.sourceField === "assitemgradedes.grade");
  assert.equal(grade?.sourceColumnId, "COLUMN-210FDA4A2DD9768D");
  assert.equal(grade?.sourceStructuralHash, "7834c06053fbc92cb741c1d35919bf268b65c757f041e674085ef51ce9840f4b");
  assert.equal(receipt.inventoryBindingGap.decision, "KEEP_GAP_NO_REBIND");
});

test("dynamic grade columns and inconsistent assessment scoping remain parity gaps", () => {
  const receipt = verify(fixture());
  assert.equal(receipt.routineBehaviorFindings.currentPrintGradeScope, "u_printassessment_filters_grade_cursor_by_assgradecode_assessmentid");
  assert.equal(receipt.routineBehaviorFindings.backupPrintGradeScope, "u_printassessment_bak2_does_not_filter_grade_cursor_by_assessmentid");
  assert.deepEqual(receipt.routineEvidence, { routineCount: 2, dynamicPrintRoutineCount: 2, dynamicMutationReviewCount: 2, itemGradeGuideParityPending: true });
  assert.equal(receipt.explicitGaps.find(gap => gap.reasonCode === "PERFORMANCE_ITEM_GRADE_GUIDE_MODEL_UNRESOLVED")?.sourceFields.length, 3);
  assert.equal(receipt.productionImport, "HOLD");
});

test("column loss, metadata drift, false credit and inventory rebinding fail closed", () => {
  const missing = fixture();
  missing.inventory.tables[0].columns.pop();
  missing.contract.inventorySha256 = createHash("sha256").update(`${JSON.stringify(missing.inventory)}\n`).digest("hex");
  rejects("PERFORMANCE_ASSITEMGRADEDES_FIELD_SOURCE_METADATA_INVALID", () => verify(missing));

  const typeDrift = fixture();
  typeDrift.inventory.tables[0].columns.find(column => column.name === "description").type = "varchar(64)";
  typeDrift.contract.inventorySha256 = createHash("sha256").update(`${JSON.stringify(typeDrift.inventory)}\n`).digest("hex");
  rejects("PERFORMANCE_ASSITEMGRADEDES_FIELD_SOURCE_METADATA_INVALID", () => verify(typeDrift));

  const promoted = fixture();
  promoted.contract.fields[0].disposition = "verified_target";
  promoted.contract.fields[0].compatibilityCredit = 1;
  promoted.contract.compatibilityCredit.numerator = 1;
  rejects("PERFORMANCE_ASSITEMGRADEDES_FIELD_MAP_CONTRACT_INVALID", () => verify(promoted));

  const rebound = fixture();
  rebound.contract.inventoryBindingGap.canonicalInventorySha256 = rebound.contract.inventoryBindingGap.currentGeneratorObservedSha256;
  rejects("PERFORMANCE_ASSITEMGRADEDES_FIELD_MAP_CONTRACT_INVALID", () => verify(rebound));
});

test("receipt and helper expose no source rows, credentials, personal data or binary content", () => {
  const receipt = verify(fixture());
  assert.equal(receipt.sourceRowValuesEmitted, false);
  assert.equal(receipt.containsSourceValues, false);
  assert.equal(receipt.containsPersonalData, false);
  assert.doesNotMatch(JSON.stringify(receipt), /employeeCode|fullName|sourceKey|sourceRowSha256|password|photofile|actualSize/iu);
  const helper = readFileSync(resolve(root, "scripts/hr-cutover/legacy-performance-assitemgradedes-field-map.mjs"), "utf8");
  assert.doesNotMatch(helper, /\b(?:sqlcmd|mssql|sp_executesql)\b|\bdocker\s+exec\b/iu);
});
