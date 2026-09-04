#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  buildLegacyKnowhowFieldMapReceipt,
  LegacyKnowhowFieldMapError,
} from "../hr-cutover/legacy-knowhow-field-map.mjs";

const root = resolve(import.meta.dirname, "../..");
const contractPath = resolve(root, "scripts/hr-cutover/contracts/legacy-knowhow-field-map-v1.json");
const readContract = () => JSON.parse(readFileSync(contractPath, "utf8"));
const fixtureInventory = () => ({
  inventoryKind: "yuzhou_hr_legacy_structural_atomic_inventory",
  generatorVersion: "1.0.0",
  tables: [{
    name: "knowhow",
    columns: [
      { name: "id", type: "int", nullable: false },
      { name: "person", type: "varchar(5)", nullable: true },
      { name: "knowhow", type: "varchar(20)", nullable: true },
      { name: "grade", type: "varchar(10)", nullable: true },
      { name: "memo", type: "varchar(255)", nullable: true },
    ],
  }],
});
const fixture = () => {
  const inventory = fixtureInventory();
  const contract = readContract();
  contract.inventorySha256 = createHash("sha256").update(`${JSON.stringify(inventory)}\n`).digest("hex");
  return { inventory, contract };
};
const build = input => buildLegacyKnowhowFieldMapReceipt({ ...input, repositoryRoot: root });
const rejects = (code, action) => assert.throws(action, error => error instanceof LegacyKnowhowFieldMapError && error.code === code);

test("complete knowhow field denominator maps four fields and keeps grade semantic normalization zero-credit", () => {
  const receipt = build(fixture());
  assert.equal(receipt.sourceAggregate.observedRows, 6);
  assert.equal(receipt.sourceAggregate.fieldDenominator, 5);
  assert.equal(receipt.fields.length, 5);
  assert.deepEqual(receipt.fields.map(row => row.sourceField), ["knowhow.id", "knowhow.person", "knowhow.knowhow", "knowhow.grade", "knowhow.memo"]);
  assert.deepEqual(receipt.compatibilityCredit, { numerator: 4, denominator: 5 });
  assert.deepEqual(receipt.explicitGaps, [{
    stableId: "KNOWHOW_GRADE_TO_PROFICIENCY",
    sourceField: "knowhow.grade",
    intendedTargetField: "hr_employee_skill.proficiency",
    preservationField: "hr_employee_skill.legacy_grade",
    reasonCode: "SKILL_GRADE_DICTIONARY_UNREVIEWED",
    missingEvidence: ["reviewed_knowhowcode_grade_dictionary", "reviewed_grade_to_proficiency_crosswalk"],
    decision: "KEEP_GAP",
    compatibilityCredit: 0,
  }]);
  assert.equal(receipt.fields.find(row => row.stableId === "KNOWHOW_GRADE")?.compatibilityCredit, 0);
  assert.deepEqual(receipt.fields.find(row => row.stableId === "KNOWHOW_PERSON")?.targetFields, ["hr_employee_skill.employee_id"]);
  assert.equal(receipt.sourceRelation.readOnly, true);
  assert.equal(receipt.pipelineEvidenceCount, 6);
  assert.equal(receipt.modernTargetEvidenceCount, 3);
  assert.equal(receipt.status, "PARTIAL_WITH_EXPLICIT_GAPS");
  assert.equal(receipt.productionImport, "HOLD");
  assert.match(receipt.receiptSha256, /^[a-f0-9]{64}$/u);
});

test("metadata-only input and nullable fields remain in the structural denominator", () => {
  const input = fixture();
  assert.equal(Object.hasOwn(input.inventory.tables[0], "records"), false);
  const receipt = build(input);
  assert.equal(receipt.fields.length, 5);
  assert.equal(receipt.nullAndEmptyFieldsRemainInDenominator, true);
  assert.equal(receipt.fields.every(row => row.denominatorDisposition === "included"), true);
  assert.equal(receipt.fields.filter(row => row.sourceNullable).length, 4);
  assert.deepEqual(receipt.compatibilityCredit, { numerator: 4, denominator: 5 });
});

test("receipt contains metadata hashes and aggregates but no source row values", () => {
  const receipt = build(fixture());
  assert.equal(receipt.sourceRowValuesEmitted, false);
  assert.equal(receipt.containsSourceValues, false);
  assert.equal(receipt.containsPersonalData, false);
  assert.doesNotMatch(JSON.stringify(receipt), /employeeCode|fullName|sourceKey|sourceRowSha256|password|photo|docs/iu);
  const builder = readFileSync(resolve(root, "scripts/hr-cutover/legacy-knowhow-field-map.mjs"), "utf8");
  assert.doesNotMatch(builder, /\b(?:sqlcmd|mssql|sp_executesql)\b|\b(?:insert|update|delete|merge)\s+(?:into|dbo\.|hr_)/iu);
});

test("dropped duplicated or metadata-free source fields fail closed", () => {
  const missing = fixture();
  missing.inventory.tables[0].columns.pop();
  missing.contract.inventorySha256 = createHash("sha256").update(`${JSON.stringify(missing.inventory)}\n`).digest("hex");
  rejects("KNOWHOW_FIELD_SOURCE_COLUMNS_INVALID", () => build(missing));

  const duplicate = fixture();
  duplicate.inventory.tables[0].columns.push({ name: "memo", type: "varchar(255)", nullable: true });
  duplicate.contract.inventorySha256 = createHash("sha256").update(`${JSON.stringify(duplicate.inventory)}\n`).digest("hex");
  rejects("KNOWHOW_FIELD_SOURCE_COLUMNS_INVALID", () => build(duplicate));

  const missingMetadata = fixture();
  delete missingMetadata.inventory.tables[0].columns[1].nullable;
  missingMetadata.contract.inventorySha256 = createHash("sha256").update(`${JSON.stringify(missingMetadata.inventory)}\n`).digest("hex");
  rejects("KNOWHOW_FIELD_SOURCE_METADATA_INVALID", () => build(missingMetadata));
});

test("hash drift or contract-only grade promotion cannot create verified credit", () => {
  const drift = fixture();
  drift.contract.pipelineEvidence.find(row => row.stage === "writer").sha256 = "0".repeat(64);
  rejects("KNOWHOW_FIELD_EVIDENCE_DRIFT", () => build(drift));

  const promoted = fixture();
  const grade = promoted.contract.fields.find(row => row.stableId === "KNOWHOW_GRADE");
  grade.disposition = "verified";
  grade.compatibilityCredit = 1;
  promoted.contract.compatibilityCredit.numerator = 5;
  rejects("KNOWHOW_FIELD_MAP_CONTRACT_INVALID", () => build(promoted));

  const removedGap = fixture();
  removedGap.contract.explicitGaps = [];
  rejects("KNOWHOW_FIELD_GAP_INVALID", () => build(removedGap));
});
