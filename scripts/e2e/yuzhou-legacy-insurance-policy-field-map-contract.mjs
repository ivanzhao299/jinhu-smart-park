#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  LegacyInsurancePolicyFieldMapError,
  verifyLegacyInsurancePolicyFieldMap,
} from "../hr-cutover/legacy-insurance-policy-field-map.mjs";

const root = resolve(import.meta.dirname, "../..");
const contractPath = resolve(root, "scripts/hr-cutover/contracts/legacy-insurance-policy-field-map-v1.json");
const readContract = () => JSON.parse(readFileSync(contractPath, "utf8"));
const kinds = ["oldage", "remedy", "losework", "fund", "wound", "bear"];
const suffixes = ["", "_e", "_p", "_pc"];
const fixtureInventory = () => ({
  inventoryKind: "yuzhou_hr_legacy_structural_atomic_inventory",
  generatorVersion: "1.0.0",
  tables: [{
    name: "insure_method",
    sourceArtifactSha256: "11a52007536298bb59c655f1d70317a03f9394a63dbf9a286eaa0165d65553fe",
    columns: [
      { name: "id", type: "int", nullable: false, default: null, description: null },
      { name: "des", type: "varchar(50)", nullable: true, default: "('自定义标准')", description: null },
      { name: "rightscope", type: "varchar(30)", nullable: true, default: "(0)", description: null },
      ...kinds.flatMap(kind => suffixes.map(suffix => ({ name: `${kind}${suffix}`, type: "numeric(18,3)", nullable: true, default: "(0)", description: null }))),
      ...kinds.flatMap(kind => suffixes.map(suffix => ({ name: `${kind}${suffix}2`, type: "numeric(18,3)", nullable: true, default: "(0.00)", description: null }))),
    ],
  }],
});
const fixture = () => {
  const inventory = fixtureInventory();
  const contract = readContract();
  contract.inventorySha256 = createHash("sha256").update(`${JSON.stringify(inventory)}\n`).digest("hex");
  return { inventory, contract };
};
const verify = input => verifyLegacyInsurancePolicyFieldMap(input.inventory, input.contract, { root });
const rejects = (code, action) => assert.throws(action, error => error instanceof LegacyInsurancePolicyFieldMapError && error.code === code);

test("insurance policy map accounts for all 51 fields including nullable and zero-default columns", () => {
  const receipt = verify(fixture());
  assert.deepEqual(receipt.sourceAggregates, { insure_method: 12 });
  assert.deepEqual(receipt.summary, {
    sourceTables: 1,
    sourceFields: 51,
    verifiedTargetFields: 51,
    authorizedArchiveFields: 0,
    explicitGapFields: 0,
  });
  assert.equal(receipt.fields.length, 51);
  assert.equal(receipt.fields.every(field => field.denominatorDisposition === "included"), true);
  assert.equal(receipt.nullAndEmptyFieldsRemainInDenominator, true);
  assert.equal(receipt.repositoryEvidenceCount, 11);
  assert.equal(receipt.status, "FIELD_MAPPING_COMPLETE_RUNTIME_SURFACE_GAP");
  assert.equal(receipt.productionImport, "HOLD");
  assert.match(receipt.receiptSha256, /^[a-f0-9]{64}$/u);
});

test("all policy metadata rates and fixed addends have distinct verified targets", () => {
  const receipt = verify(fixture());
  assert.deepEqual(receipt.compatibilityCredit, { numerator: 51, denominator: 51 });
  assert.equal(receipt.fields.filter(field => field.compatibilityCredit === 1).length, 51);
  assert.equal(receipt.fields.filter(field => field.sourceField.endsWith("2")).length, 24);
  assert.equal(receipt.fields.filter(field => field.sourceField.endsWith("2")).every(field => field.compatibilityCredit === 1), true);
  assert.deepEqual(receipt.fields.find(field => field.sourceField === "insure_method.oldage_e")?.targetFields, [
    "hr_insurance_policy_item[insurance_kind=oldage,variant_no=1].employer_rate",
  ]);
  assert.equal(receipt.fields.find(field => field.sourceField === "insure_method.oldage_e")?.reasonCode, null);
  assert.deepEqual(receipt.fields.find(field => field.sourceField === "insure_method.oldage_e2")?.targetFields, [
    "hr_insurance_policy_item[insurance_kind=oldage,variant_no=1].employer_fixed_amount",
  ]);
});

test("legacy calculation family proves rate times base plus fixed addend semantics", () => {
  const receipt = verify(fixture());
  assert.deepEqual(receipt.calculationRuleEvidence, {
    canonicalFamily: "bs_insure_compute",
    formula: "round(percentage_rate * contribution_base / 100 + fixed_addend, 2)",
    percentageFieldVariant: "no_numeric_suffix",
    fixedAddendFieldVariant: "suffix_2",
    fundInclusion: "conditional",
    hierarchyScope: "person.department_prefix",
  });
  assert.deepEqual(receipt.routineEvidence, {
    routineCount: 2,
    mutatingCalculationRoutineCount: 2,
    formulaParityPending: true,
  });
  assert.deepEqual(receipt.relations, [{
    source: "person.insuremod",
    target: "insure_method.id",
    kind: "routine_join_without_declared_foreign_key",
    disposition: "verified_source_relation",
  }]);
});

test("24 percentage units and 24 fixed addends are resolved while policy UI stays a separate gap", () => {
  const receipt = verify(fixture());
  assert.deepEqual(receipt.explicitGaps, []);
  assert.equal(receipt.runtimeSurfaceGap.reasonCode, "INSURANCE_POLICY_DEFINITION_RUNTIME_SURFACE_MISSING");
  assert.equal(receipt.runtimeSurfaceGap.decision, "KEEP_GAP");
});

test("source column loss, semantic promotion, evidence drift and inventory rebinding fail closed", () => {
  const missingColumn = fixture();
  missingColumn.inventory.tables[0].columns.splice(27, 1);
  missingColumn.contract.inventorySha256 = createHash("sha256").update(`${JSON.stringify(missingColumn.inventory)}\n`).digest("hex");
  rejects("INSURANCE_POLICY_FIELD_SOURCE_COLUMNS_INVALID", () => verify(missingColumn));

  const changedDefault = fixture();
  changedDefault.inventory.tables[0].columns.find(column => column.name === "bear_pc2").default = "(0)";
  changedDefault.contract.inventorySha256 = createHash("sha256").update(`${JSON.stringify(changedDefault.inventory)}\n`).digest("hex");
  rejects("INSURANCE_POLICY_FIELD_SOURCE_COLUMNS_INVALID", () => verify(changedDefault));

  const relabeled = fixture();
  const fixed = relabeled.contract.fields.find(field => field.sourceField === "insure_method.oldage2");
  fixed.targetFields = ["hr_insurance_policy_item[insurance_kind=oldage,variant_no=2].base_rate"];
  rejects("INSURANCE_POLICY_FIELD_MAPPING_INVALID", () => verify(relabeled));

  const drift = fixture();
  drift.contract.repositoryEvidence.find(evidence => evidence.role === "policy_writer").sha256 = "0".repeat(64);
  rejects("INSURANCE_POLICY_FIELD_EVIDENCE_DRIFT", () => verify(drift));

  const rebound = fixture();
  rebound.contract.inventoryBindingGap.canonicalInventorySha256 = rebound.contract.inventoryBindingGap.currentGeneratorObservedSha256;
  rejects("INSURANCE_POLICY_FIELD_MAP_CONTRACT_INVALID", () => verify(rebound));
});

test("receipt and helper expose no source rows, credentials, personal data or binary content", () => {
  const receipt = verify(fixture());
  assert.equal(receipt.sourceRowValuesEmitted, false);
  assert.equal(receipt.containsSourceValues, false);
  assert.equal(receipt.containsPersonalData, false);
  assert.doesNotMatch(JSON.stringify(receipt), /employeeCode|fullName|sourceKey|sourceRowSha256|password|photofile|actualSize/iu);
  const helper = readFileSync(resolve(root, "scripts/hr-cutover/legacy-insurance-policy-field-map.mjs"), "utf8");
  assert.doesNotMatch(helper, /\b(?:sqlcmd|mssql|sp_executesql)\b|\bdocker\s+exec\b/iu);
});
