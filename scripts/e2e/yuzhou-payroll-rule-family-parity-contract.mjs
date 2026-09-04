import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  evaluateLegacyPayrollRuleFamilyParity,
  LegacyPayrollRuleFamilyParityError,
} from "../hr-cutover/legacy-payroll-rule-family-parity.mjs";

const root = resolve(import.meta.dirname, "../..");
const contractPath = resolve(root, "scripts/hr-cutover/contracts/legacy-payroll-rule-family-parity-v1.json");
const ledgerPath = resolve(root, "scripts/hr-cutover/contracts/legacy-routine-logic-ledger-v2.json");
const loadContract = () => JSON.parse(readFileSync(contractPath, "utf8"));
const ledgerBytes = readFileSync(ledgerPath);
const evaluate = contract => evaluateLegacyPayrollRuleFamilyParity({ contract, routineLedgerBytes: ledgerBytes, repositoryRoot: root });

test("payroll item and formula source denominator covers all 32 reviewed fields", () => {
  const report = evaluate(loadContract());
  assert.equal(report.status, "STRUCTURAL_MAPPING_READY_SEMANTIC_PARITY_PENDING");
  assert.deepEqual(
    { total: report.fields.total, verified: report.fields.verified, pending: report.fields.pending, verifiedPercent: report.fields.verifiedPercent },
    { total: 32, verified: 21, pending: 11, verifiedPercent: 65.63 },
  );
  assert.equal(report.sourceRowsObserved, 955);
  assert.equal(report.productionImport, "HOLD");
});

test("empty tables and all-null source values do not shrink the field denominator", () => {
  const contract = loadContract();
  for (const source of contract.sourceBinding.sourceObjects) source.observedRows = 0;
  const report = evaluate(contract);
  assert.equal(report.sourceRowsObserved, 0);
  assert.equal(report.fields.total, 32);
  assert.equal(report.fields.pending, 11);
  assert.match(report.denominatorRule, /counts even when every source row or field value is empty/u);
});

test("six unresolved dynamic payroll routines receive exactly zero compatibility credit", () => {
  const report = evaluate(loadContract());
  assert.deepEqual(
    { total: report.dynamicRoutines.total, verified: report.dynamicRoutines.verified, pending: report.dynamicRoutines.pending, verifiedPercent: report.dynamicRoutines.verifiedPercent },
    { total: 6, verified: 0, pending: 6, verifiedPercent: 0 },
  );
});

test("dynamic SQL cannot be marked resolved without targets and reviewed evidence", () => {
  const contract = loadContract();
  contract.dynamicRoutineGates[0] = { ...contract.dynamicRoutineGates[0], status: "resolved", compatibilityCredit: 1 };
  assert.throws(
    () => evaluate(contract),
    error => error instanceof LegacyPayrollRuleFamilyParityError && error.code === "PAYROLL_RULE_DYNAMIC_RESOLUTION_INCOMPLETE",
  );
});

test("the dynamic routine denominator cannot be reduced or duplicated", () => {
  const missing = loadContract();
  missing.dynamicRoutineGates.pop();
  assert.throws(
    () => evaluate(missing),
    error => error instanceof LegacyPayrollRuleFamilyParityError && error.code === "PAYROLL_RULE_DYNAMIC_GATE_COVERAGE_INVALID",
  );
  const duplicated = loadContract();
  duplicated.dynamicRoutineGates[5] = structuredClone(duplicated.dynamicRoutineGates[0]);
  assert.throws(
    () => evaluate(duplicated),
    error => error instanceof LegacyPayrollRuleFamilyParityError && error.code === "PAYROLL_RULE_DYNAMIC_GATE_COVERAGE_INVALID",
  );
});

test("a verified field cannot receive credit without executable target evidence", () => {
  const contract = loadContract();
  contract.fieldMappings.find(row => row.status === "verified").evidence = [];
  assert.throws(
    () => evaluate(contract),
    error => error instanceof LegacyPayrollRuleFamilyParityError && error.code === "PAYROLL_RULE_EVIDENCE_MISSING",
  );
});

test("modern decimal, null, dependency, safety and transaction behaviors have repository evidence", () => {
  const report = evaluate(loadContract());
  assert.deepEqual(report.modernBehaviors, { total: 6, verified: 6, pending: 0, verifiedPercent: 100 });
});

test("contract stores structural mappings only and contains no legacy executable SQL body", () => {
  const serialized = JSON.stringify(loadContract());
  assert.doesNotMatch(serialized, /\b(?:select|insert|update|delete|drop|alter|execute)\s+(?:from|into|table|dbo\b|\*)/iu);
  assert.doesNotMatch(serialized, /salary0[1-9]|salary[12][0-9]|salary3[0-5]/iu);
});

console.log("Yuzhou payroll rule-family parity contract passed.");
