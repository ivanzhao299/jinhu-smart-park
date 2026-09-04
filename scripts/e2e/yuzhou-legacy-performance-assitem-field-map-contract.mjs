#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  LegacyPerformanceAssitemFieldMapError,
  verifyLegacyPerformanceAssitemFieldMap,
} from "../hr-cutover/legacy-performance-assitem-field-map.mjs";

const root = resolve(import.meta.dirname, "../..");
const contractPath = resolve(root, "scripts/hr-cutover/contracts/legacy-performance-assitem-field-map-v1.json");
const readContract = () => JSON.parse(readFileSync(contractPath, "utf8"));
const columns = [
  ["COLUMN-73E1AC2BE1EF240A", "id", "int", false, null, null, "2f90d897303ec99475cf5b382f8b9a1063c058022a034137535dbebb9c066696"],
  ["COLUMN-557B4F8AFF5EA0F2", "assid", "int", true, null, null, "7b249537148ca2cf4ac633f2c6c1adef148c53c2dcacc388847f6925a68c66f5"],
  ["COLUMN-B5A427B683FC77DB", "assitem", "varchar(100)", true, null, null, "8948c5dccbfcc18f50f02b192b75d96fdfb0b8216dc7b2bf0782fd09279272b7"],
  ["COLUMN-C4C925D44AC5C198", "fullvalue", "numeric(18,2)", true, null, null, "5df5c53b4492391c7237de94a6db8d22474e2b1e321f658cc8418ba3aa7a4d83"],
  ["COLUMN-B3353A9A8D5EE5AE", "myorder", "int", true, null, null, "7e8d853ae59c191fe7997e3ea5aa1f8e1a005ca0a4985a8af33d0e2207047cca"],
];
const fixtureInventory = () => ({
  inventoryKind: "yuzhou_hr_legacy_structural_atomic_inventory",
  generatorVersion: "1.0.0",
  tables: [{
    id: "TABLE-84B24B89A4C73B76",
    name: "assitem",
    structuralHash: "6c1a8eea415f91e7852a72b9abda06e1d1c6c7bfc0ee32e4d98fc7bb388381e0",
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
const verify = input => verifyLegacyPerformanceAssitemFieldMap(input.inventory, input.contract, { root });
const rejects = (code, action) => assert.throws(action, error => error instanceof LegacyPerformanceAssitemFieldMapError && error.code === code);

test("assitem map accounts for all 5 fields even when safe aggregates are unavailable", () => {
  const receipt = verify(fixture());
  assert.deepEqual(receipt.sourceAggregates, { assitem: null });
  assert.equal(receipt.sourceRowCountStatus, "NOT_CAPTURED_IN_CURRENT_STRUCTURAL_INVENTORY");
  assert.deepEqual(receipt.summary, {
    sourceTables: 1, sourceFields: 5, verifiedTargetFields: 0,
    authorizedArchiveFields: 0, safelyExcludedFields: 0, explicitGapFields: 5,
  });
  assert.equal(receipt.fields.every(field => field.denominatorDisposition === "included"), true);
  assert.equal(receipt.nullAndEmptyFieldsRemainInDenominator, true);
  assert.equal(receipt.status, "GAP_ONLY_NO_COMPATIBILITY_CREDIT");
  assert.equal(receipt.productionImport, "HOLD");
  assert.match(receipt.receiptSha256, /^[a-f0-9]{64}$/u);
});

test("modern dimension columns do not earn credit without a dedicated legacy writer", () => {
  const receipt = verify(fixture());
  assert.deepEqual(receipt.compatibilityCredit, { numerator: 0, denominator: 5 });
  assert.equal(receipt.fields.every(field => field.disposition === "explicit_gap" && field.compatibilityCredit === 0), true);
  assert.deepEqual(receipt.fields.find(field => field.sourceField === "assitem.assitem")?.targetFields, [
    "hr_performance_template_dimension.dimension_name",
  ]);
  assert.equal(receipt.fields.find(field => field.sourceField === "assitem.fullvalue")?.reasonCode, "PERFORMANCE_ASSITEM_FULLVALUE_SEMANTICS_AND_WEIGHT_MODEL_UNRESOLVED");
  assert.equal(receipt.legacyProjectionGap.reasonCode, "PERFORMANCE_ASSITEM_EXTRACT_TRANSFORM_WRITER_MISSING");
});

test("declared child relations and assessment routine bridge remain visible", () => {
  const receipt = verify(fixture());
  assert.deepEqual(receipt.relations.slice(0, 2), [
    { source: "assessmentdetail.assitemid", target: "assitem.id", kind: "declared_foreign_key", disposition: "verified_source_relation" },
    { source: "assitemgradedes.assitemid", target: "assitem.id", kind: "declared_foreign_key", disposition: "verified_source_relation" },
  ]);
  assert.equal(receipt.relations.find(relation => relation.source === "person.assessment")?.target, "assitem.assid");
  assert.equal(receipt.fields.find(field => field.sourceField === "assitem.assid")?.sourceColumnId, "COLUMN-557B4F8AFF5EA0F2");
  assert.equal(receipt.inventoryBindingGap.decision, "KEEP_GAP_NO_REBIND");
});

test("record generation, absent modern weight and stale backup print column stay explicit", () => {
  const receipt = verify(fixture());
  assert.equal(receipt.routineBehaviorFindings.modernWeightRequirement, "modern_template_dimension_requires_positive_fractional_weight_but_assitem_has_no_explicit_weight_field");
  assert.match(receipt.routineBehaviorFindings.backupPrintSchemaDrift, /assitem_assitemgroupid/u);
  assert.deepEqual(receipt.routineEvidence, {
    routineCount: 3,
    recordCreationRoutineCount: 1,
    dynamicPrintRoutineCount: 2,
    staleColumnReferencePending: true,
  });
  assert.equal(receipt.sourceAggregateGap.missingEvidence.includes("assessment_scope_orphan_count"), true);
});

test("column loss, metadata drift, false credit and inventory rebinding fail closed", () => {
  const missing = fixture();
  missing.inventory.tables[0].columns.pop();
  missing.contract.inventorySha256 = createHash("sha256").update(`${JSON.stringify(missing.inventory)}\n`).digest("hex");
  rejects("PERFORMANCE_ASSITEM_FIELD_SOURCE_METADATA_INVALID", () => verify(missing));

  const typeDrift = fixture();
  typeDrift.inventory.tables[0].columns.find(column => column.name === "fullvalue").type = "int";
  typeDrift.contract.inventorySha256 = createHash("sha256").update(`${JSON.stringify(typeDrift.inventory)}\n`).digest("hex");
  rejects("PERFORMANCE_ASSITEM_FIELD_SOURCE_METADATA_INVALID", () => verify(typeDrift));

  const promoted = fixture();
  promoted.contract.fields[0].disposition = "verified_target";
  promoted.contract.fields[0].compatibilityCredit = 1;
  promoted.contract.compatibilityCredit.numerator = 1;
  rejects("PERFORMANCE_ASSITEM_FIELD_MAP_CONTRACT_INVALID", () => verify(promoted));

  const rebound = fixture();
  rebound.contract.inventoryBindingGap.canonicalInventorySha256 = rebound.contract.inventoryBindingGap.currentGeneratorObservedSha256;
  rejects("PERFORMANCE_ASSITEM_FIELD_MAP_CONTRACT_INVALID", () => verify(rebound));
});

test("receipt and helper expose no source rows, credentials, personal data or binary content", () => {
  const receipt = verify(fixture());
  assert.equal(receipt.sourceRowValuesEmitted, false);
  assert.equal(receipt.containsSourceValues, false);
  assert.equal(receipt.containsPersonalData, false);
  assert.doesNotMatch(JSON.stringify(receipt), /employeeCode|fullName|sourceKey|sourceRowSha256|password|photofile|actualSize/iu);
  const helper = readFileSync(resolve(root, "scripts/hr-cutover/legacy-performance-assitem-field-map.mjs"), "utf8");
  assert.doesNotMatch(helper, /\b(?:sqlcmd|mssql|sp_executesql)\b|\bdocker\s+exec\b/iu);
});
