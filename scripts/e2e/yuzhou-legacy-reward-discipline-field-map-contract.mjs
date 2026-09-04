#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  LegacyRewardDisciplineFieldMapError,
  verifyLegacyRewardDisciplineFieldMap,
} from "../hr-cutover/legacy-reward-discipline-field-map.mjs";

const root = resolve(import.meta.dirname, "../..");
const contractPath = resolve(root, "scripts/hr-cutover/contracts/legacy-reward-discipline-field-map-v1.json");
const readContract = () => JSON.parse(readFileSync(contractPath, "utf8"));
const fixtureInventory = () => ({
  inventoryKind: "yuzhou_hr_legacy_structural_atomic_inventory",
  generatorVersion: "1.0.0",
  tables: [
    {
      name: "bonuscode",
      sourceArtifactSha256: "11a52007536298bb59c655f1d70317a03f9394a63dbf9a286eaa0165d65553fe",
      columns: [
        { name: "bonus", type: "varchar(2)", nullable: false, default: null, description: null },
        { name: "bonusname", type: "varchar(100)", nullable: false, default: null, description: null },
        { name: "addsub", type: "numeric(8,4)", nullable: true, default: null, description: null },
        { name: "bonuspay", type: "money", nullable: true, default: "(0)", description: null },
        { name: "bonustype", type: "varchar(4)", nullable: false, default: "('奖励')", description: "奖励，惩罚" },
      ],
    },
    {
      name: "bonusrecord",
      sourceArtifactSha256: "11a52007536298bb59c655f1d70317a03f9394a63dbf9a286eaa0165d65553fe",
      columns: [
        { name: "id", type: "int", nullable: false, default: null, description: null },
        { name: "person", type: "varchar(10)", nullable: false, default: null, description: null },
        { name: "bonusdate", type: "smalldatetime", nullable: false, default: null, description: null },
        { name: "bonus", type: "varchar(2)", nullable: false, default: null, description: null },
        { name: "bonusunit", type: "varchar(50)", nullable: true, default: null, description: null },
        { name: "times", type: "int", nullable: true, default: null, description: null },
        { name: "postperson", type: "varchar(30)", nullable: true, default: null, description: null },
        { name: "eventdate", type: "smalldatetime", nullable: true, default: null, description: null },
        { name: "cause", type: "varchar(100)", nullable: true, default: null, description: null },
        { name: "addsub", type: "numeric(8,4)", nullable: true, default: "(0)", description: null },
        { name: "bonuspay", type: "money", nullable: true, default: null, description: null },
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
const verify = input => verifyLegacyRewardDisciplineFieldMap(input.inventory, input.contract, { root });
const rejects = (code, action) => assert.throws(action, error => error instanceof LegacyRewardDisciplineFieldMapError && error.code === code);

test("reward discipline field map accounts for all 16 source fields including the empty bonusrecord table", () => {
  const receipt = verify(fixture());
  assert.deepEqual(receipt.sourceAggregates, { bonuscode: 8, bonusrecord: 0 });
  assert.deepEqual(receipt.summary, {
    sourceTables: 2,
    sourceFields: 16,
    verifiedTargetFields: 2,
    authorizedArchiveFields: 2,
    explicitGapFields: 12,
  });
  assert.equal(receipt.fields.length, 16);
  assert.equal(receipt.fields.filter(field => field.sourceField.startsWith("bonusrecord.")).length, 11);
  assert.equal(receipt.fields.every(field => field.denominatorDisposition === "included"), true);
  assert.equal(receipt.nullAndEmptyFieldsRemainInDenominator, true);
  assert.equal(receipt.repositoryEvidenceCount, 11);
  assert.equal(receipt.status, "PARTIAL_WITH_EXPLICIT_GAPS");
  assert.equal(receipt.productionImport, "HOLD");
  assert.match(receipt.receiptSha256, /^[a-f0-9]{64}$/u);
});

test("only the two implemented category identity fields receive compatibility credit", () => {
  const receipt = verify(fixture());
  assert.deepEqual(receipt.compatibilityCredit, { numerator: 2, denominator: 16 });
  assert.deepEqual(
    receipt.fields.filter(field => field.compatibilityCredit === 1).map(field => field.sourceField),
    ["bonuscode.bonus", "bonuscode.bonusname"],
  );
  assert.deepEqual(receipt.fields.find(field => field.sourceField === "bonuscode.bonus")?.targetFields, ["hr_reward_discipline_category.category_code"]);
  assert.deepEqual(receipt.fields.find(field => field.sourceField === "bonuscode.bonusname")?.targetFields, ["hr_reward_discipline_category_version.name"]);
  assert.equal(receipt.fields.find(field => field.sourceField === "bonuscode.addsub")?.reasonCode, "REWARD_CATEGORY_KIND_SOURCE_PRECEDENCE_UNRESOLVED");
  assert.equal(receipt.fields.find(field => field.sourceField === "bonuscode.bonustype")?.reasonCode, "REWARD_CATEGORY_KIND_SOURCE_PRECEDENCE_UNRESOLVED");
  assert.equal(receipt.fields.find(field => field.sourceField === "bonusrecord.bonuspay")?.reasonCode, "REWARD_CASE_PAYROLL_AMOUNT_SEMANTICS_UNRESOLVED");
});

test("source relationships are frozen without guessing proposer identity or collapsing two dates", () => {
  const receipt = verify(fixture());
  assert.deepEqual(receipt.relations.map(relation => [relation.source, relation.target]), [
    ["bonusrecord.person", "person.person"],
    ["bonusrecord.bonus", "bonuscode.bonus"],
  ]);
  assert.equal(receipt.routineEvidence.routineCount, 6);
  assert.equal(receipt.routineEvidence.relationRoutineCount, 2);
  assert.equal(receipt.routineEvidence.readOnlyRoutineCount, 6);
  assert.deepEqual(receipt.fields.find(field => field.sourceField === "bonusrecord.postperson")?.targetFields, []);
  assert.deepEqual(receipt.fields.find(field => field.sourceField === "bonusrecord.bonusdate")?.targetFields, ["hr_reward_discipline_case.occurred_on"]);
  assert.deepEqual(receipt.fields.find(field => field.sourceField === "bonusrecord.eventdate")?.targetFields, ["hr_reward_discipline_case.occurred_on"]);
  assert.equal(receipt.fields.filter(field => field.reasonCode === "REWARD_CASE_TWO_DATE_SEMANTICS_UNRESOLVED").length, 2);
});

test("dropping the empty table or any nullable source column fails closed", () => {
  const missingTable = fixture();
  missingTable.inventory.tables.pop();
  missingTable.contract.inventorySha256 = createHash("sha256").update(`${JSON.stringify(missingTable.inventory)}\n`).digest("hex");
  rejects("REWARD_FIELD_SOURCE_TABLE_INVALID", () => verify(missingTable));

  const missingColumn = fixture();
  missingColumn.inventory.tables[1].columns.splice(4, 1);
  missingColumn.contract.inventorySha256 = createHash("sha256").update(`${JSON.stringify(missingColumn.inventory)}\n`).digest("hex");
  rejects("REWARD_FIELD_SOURCE_COLUMNS_INVALID", () => verify(missingColumn));

  const changedNullability = fixture();
  changedNullability.inventory.tables[1].columns.find(column => column.name === "eventdate").nullable = false;
  changedNullability.contract.inventorySha256 = createHash("sha256").update(`${JSON.stringify(changedNullability.inventory)}\n`).digest("hex");
  rejects("REWARD_FIELD_SOURCE_COLUMNS_INVALID", () => verify(changedNullability));

  const wrongCatalog = fixture();
  wrongCatalog.inventory.tables[0].sourceArtifactSha256 = "0".repeat(64);
  wrongCatalog.contract.inventorySha256 = createHash("sha256").update(`${JSON.stringify(wrongCatalog.inventory)}\n`).digest("hex");
  rejects("REWARD_FIELD_SOURCE_METADATA_INVALID", () => verify(wrongCatalog));
});

test("contract-only gap promotion and evidence drift cannot manufacture compatibility credit", () => {
  const promoted = fixture();
  const kind = promoted.contract.fields.find(field => field.sourceField === "bonuscode.bonustype");
  kind.disposition = "verified_target";
  kind.compatibilityCredit = 1;
  promoted.contract.compatibilityCredit.numerator = 3;
  rejects("REWARD_FIELD_MAP_CONTRACT_INVALID", () => verify(promoted));

  const omittedGap = fixture();
  omittedGap.contract.explicitGaps = omittedGap.contract.explicitGaps.slice(1);
  rejects("REWARD_FIELD_GAP_INVALID", () => verify(omittedGap));

  const drift = fixture();
  drift.contract.repositoryEvidence.find(evidence => evidence.role === "category_writer").sha256 = "0".repeat(64);
  rejects("REWARD_FIELD_EVIDENCE_DRIFT", () => verify(drift));
});

test("receipt and helper expose no source rows, credentials, payroll details, or binary content", () => {
  const receipt = verify(fixture());
  assert.equal(receipt.sourceRowValuesEmitted, false);
  assert.equal(receipt.containsSourceValues, false);
  assert.equal(receipt.containsPersonalData, false);
  assert.doesNotMatch(JSON.stringify(receipt), /employeeCode|fullName|sourceKey|sourceRowSha256|password|photofile|actualSize/iu);
  const helper = readFileSync(resolve(root, "scripts/hr-cutover/legacy-reward-discipline-field-map.mjs"), "utf8");
  assert.doesNotMatch(helper, /\b(?:sqlcmd|mssql|sp_executesql)\b|\bdocker\s+exec\b/iu);
});
