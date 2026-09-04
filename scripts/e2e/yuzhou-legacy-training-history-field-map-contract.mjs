#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  LegacyTrainingHistoryFieldMapError,
  verifyLegacyTrainingHistoryFieldMap,
} from "../hr-cutover/legacy-training-history-field-map.mjs";

const root = resolve(import.meta.dirname, "../..");
const contractPath = resolve(root, "scripts/hr-cutover/contracts/legacy-training-history-field-map-v1.json");
const readContract = () => JSON.parse(readFileSync(contractPath, "utf8"));
const fixtureInventory = () => ({
  inventoryKind: "yuzhou_hr_legacy_structural_atomic_inventory",
  generatorVersion: "1.0.0",
  tables: [
    {
      name: "train",
      sourceArtifactSha256: "11a52007536298bb59c655f1d70317a03f9394a63dbf9a286eaa0165d65553fe",
      columns: [
        { name: "id", type: "int", nullable: false, default: null, description: null },
        { name: "course", type: "varchar(50)", nullable: false, default: null, description: null },
        { name: "personid", type: "int", nullable: true, default: "(1)", description: null },
        { name: "person", type: "varchar(10)", nullable: false, default: null, description: null },
        { name: "hours", type: "int", nullable: true, default: null, description: null },
        { name: "startdate", type: "smalldatetime", nullable: true, default: null, description: null },
        { name: "enddate", type: "smalldatetime", nullable: true, default: null, description: null },
        { name: "attainment", type: "numeric(18,2)", nullable: true, default: null, description: null },
        { name: "test", type: "varchar(6)", nullable: true, default: null, description: null },
        { name: "trainmoney", type: "money", nullable: true, default: null, description: null },
        { name: "memo", type: "varchar(255)", nullable: true, default: null, description: null },
        { name: "coursename", type: "varchar(50)", nullable: true, default: null, description: null },
      ],
    },
    {
      name: "trainhis",
      sourceArtifactSha256: "11a52007536298bb59c655f1d70317a03f9394a63dbf9a286eaa0165d65553fe",
      columns: [
        { name: "id", type: "int", nullable: false, default: null, description: null },
        { name: "person", type: "varchar(10)", nullable: false, default: null, description: null },
        { name: "organ", type: "varchar(30)", nullable: true, default: null, description: null },
        { name: "coursename", type: "varchar(50)", nullable: true, default: null, description: null },
        { name: "startdate", type: "smalldatetime", nullable: true, default: null, description: null },
        { name: "enddate", type: "smalldatetime", nullable: true, default: null, description: null },
        { name: "hours", type: "int", nullable: true, default: null, description: null },
        { name: "attainment", type: "numeric(18,2)", nullable: true, default: null, description: null },
        { name: "test", type: "varchar(6)", nullable: true, default: null, description: null },
        { name: "trainmoney", type: "money", nullable: true, default: null, description: null },
        { name: "memo", type: "varchar(255)", nullable: true, default: null, description: null },
      ],
    },
  ],
});
const fixture = () => {
  const inventory = fixtureInventory();
  const contract = readContract();
  contract.inventorySha256 = createHash("sha256").update(`${JSON.stringify(inventory)}\n`).digest("hex");
  return { inventory, contract };
};
const verify = input => verifyLegacyTrainingHistoryFieldMap(input.inventory, input.contract, { root });
const rejects = (code, action) => assert.throws(action, error => error instanceof LegacyTrainingHistoryFieldMapError && error.code === code);

test("training history map accounts for all 23 fields including the empty train table", () => {
  const receipt = verify(fixture());
  assert.deepEqual(receipt.sourceAggregates, { train: 0, trainhis: 2 });
  assert.deepEqual(receipt.summary, {
    sourceTables: 2,
    sourceFields: 23,
    verifiedTargetFields: 5,
    authorizedArchiveFields: 2,
    explicitGapFields: 16,
  });
  assert.equal(receipt.fields.filter(field => field.sourceField.startsWith("train.")).length, 12);
  assert.equal(receipt.fields.filter(field => field.sourceField.startsWith("trainhis.")).length, 11);
  assert.equal(receipt.fields.every(field => field.denominatorDisposition === "included"), true);
  assert.equal(receipt.nullAndEmptyFieldsRemainInDenominator, true);
  assert.equal(receipt.repositoryEvidenceCount, 11);
  assert.equal(receipt.status, "PARTIAL_WITH_EXPLICIT_GAPS");
  assert.equal(receipt.productionImport, "HOLD");
  assert.match(receipt.receiptSha256, /^[a-f0-9]{64}$/u);
});

test("only implemented trainhis identity, course, dates and hours receive compatibility credit", () => {
  const receipt = verify(fixture());
  assert.deepEqual(receipt.compatibilityCredit, { numerator: 5, denominator: 23 });
  assert.deepEqual(receipt.fields.filter(field => field.compatibilityCredit === 1).map(field => field.sourceField), [
    "trainhis.person",
    "trainhis.coursename",
    "trainhis.startdate",
    "trainhis.enddate",
    "trainhis.hours",
  ]);
  assert.equal(receipt.fields.find(field => field.sourceField === "trainhis.attainment")?.reasonCode, "TRAINING_HISTORY_RESULT_WRITER_INCOMPLETE");
  assert.equal(receipt.fields.find(field => field.sourceField === "trainhis.trainmoney")?.reasonCode, "TRAINING_HISTORY_RESULT_WRITER_INCOMPLETE");
  assert.equal(receipt.fields.find(field => field.sourceField === "train.personid")?.reasonCode, "TRAIN_PERSONID_RELATION_UNRESOLVED");
});

test("source relations and five read-only detail and aggregate routines remain frozen", () => {
  const receipt = verify(fixture());
  assert.deepEqual(receipt.relations.map(relation => [relation.source, relation.target]), [
    ["train.person", "person.person"],
    ["train.course", "course.course"],
    ["trainhis.person", "person.person"],
  ]);
  assert.deepEqual(receipt.routineEvidence, {
    routineCount: 5,
    recordRoutineCount: 2,
    aggregateRoutineCount: 3,
    readOnlyRoutineCount: 5,
  });
  assert.equal(receipt.fields.find(field => field.sourceField === "train.attainment")?.targetFields[0], "hr_training_participant.score");
  assert.equal(receipt.fields.find(field => field.sourceField === "train.trainmoney")?.targetFields[0], "hr_training_participant.actual_cost");
});

test("dropping the empty table or any nullable source column fails closed", () => {
  const missingTable = fixture();
  missingTable.inventory.tables.shift();
  missingTable.contract.inventorySha256 = createHash("sha256").update(`${JSON.stringify(missingTable.inventory)}\n`).digest("hex");
  rejects("TRAINING_FIELD_SOURCE_TABLE_INVALID", () => verify(missingTable));

  const missingColumn = fixture();
  missingColumn.inventory.tables[0].columns.splice(2, 1);
  missingColumn.contract.inventorySha256 = createHash("sha256").update(`${JSON.stringify(missingColumn.inventory)}\n`).digest("hex");
  rejects("TRAINING_FIELD_SOURCE_COLUMNS_INVALID", () => verify(missingColumn));

  const changedDefault = fixture();
  changedDefault.inventory.tables[0].columns.find(column => column.name === "personid").default = null;
  changedDefault.contract.inventorySha256 = createHash("sha256").update(`${JSON.stringify(changedDefault.inventory)}\n`).digest("hex");
  rejects("TRAINING_FIELD_SOURCE_COLUMNS_INVALID", () => verify(changedDefault));

  const wrongCatalog = fixture();
  wrongCatalog.inventory.tables[1].sourceArtifactSha256 = "0".repeat(64);
  wrongCatalog.contract.inventorySha256 = createHash("sha256").update(`${JSON.stringify(wrongCatalog.inventory)}\n`).digest("hex");
  rejects("TRAINING_FIELD_SOURCE_METADATA_INVALID", () => verify(wrongCatalog));
});

test("contract-only promotion, omitted gaps, evidence drift and inventory rebinding fail closed", () => {
  const promoted = fixture();
  const score = promoted.contract.fields.find(field => field.sourceField === "trainhis.attainment");
  score.disposition = "verified_target";
  score.compatibilityCredit = 1;
  promoted.contract.compatibilityCredit.numerator = 6;
  rejects("TRAINING_FIELD_MAP_CONTRACT_INVALID", () => verify(promoted));

  const omittedGap = fixture();
  omittedGap.contract.explicitGaps = omittedGap.contract.explicitGaps.slice(1);
  rejects("TRAINING_FIELD_GAP_INVALID", () => verify(omittedGap));

  const drift = fixture();
  drift.contract.repositoryEvidence.find(evidence => evidence.role === "history_writer").sha256 = "0".repeat(64);
  rejects("TRAINING_FIELD_EVIDENCE_DRIFT", () => verify(drift));

  const rebound = fixture();
  rebound.contract.inventoryBindingGap.canonicalInventorySha256 = rebound.contract.inventoryBindingGap.currentGeneratorObservedSha256;
  rejects("TRAINING_FIELD_MAP_CONTRACT_INVALID", () => verify(rebound));
});

test("receipt and helper expose no source rows, credentials, payroll details or binary content", () => {
  const receipt = verify(fixture());
  assert.equal(receipt.sourceRowValuesEmitted, false);
  assert.equal(receipt.containsSourceValues, false);
  assert.equal(receipt.containsPersonalData, false);
  assert.doesNotMatch(JSON.stringify(receipt), /employeeCode|fullName|sourceKey|sourceRowSha256|password|photofile|actualSize/iu);
  const helper = readFileSync(resolve(root, "scripts/hr-cutover/legacy-training-history-field-map.mjs"), "utf8");
  assert.doesNotMatch(helper, /\b(?:sqlcmd|mssql|sp_executesql)\b|\bdocker\s+exec\b/iu);
});
