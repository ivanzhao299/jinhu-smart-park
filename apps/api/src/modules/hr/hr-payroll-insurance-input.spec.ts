import assert from "node:assert/strict";
import test from "node:test";
import { projectPayrollInsuranceInputs, type PayrollInsuranceAmountFact } from "./hr-payroll-insurance-input";
import { evaluatePayrollFormula, parsePayrollFormula } from "./hr-payroll-formula-dsl";

const fact = (insuranceKind: string, employeeAmount: string | null): PayrollInsuranceAmountFact => ({
  insuranceKind, employeeAmount, totalAmount: "99.99", employerAmount: null, supplementAmount: "-0.01",
});
test("reviewed insurance references affect net payroll exactly and preserve v1 formulas", () => {
  const old = parsePayrollFormula("[人事系统.基本工资]-1");
  assert.equal(old.parserVersion, "jinhu-payroll-dsl-v1");
  const formula = parsePayrollFormula("[人事系统.基本工资]-[人事系统.养老保险个人金额]-[人事系统.住房公积金个人金额]");
  assert.equal(formula.status, "manual_review");
  assert.equal(formula.parserVersion, "jinhu-payroll-dsl-v2");
  const inputs = projectPayrollInsuranceInputs([fact("oldage", "100.01"), fact("fund", "50.02")], formula.dependencies);
  assert.equal(evaluatePayrollFormula(formula.ast!, { "hr:基本工资": "1000.0000", ...inputs }), "849.9700");
  assert.equal(parsePayrollFormula("[人事系统.社保总额]").status, "rejected");
});
test("five-insurance sum excludes fund and policy total stays an independent component", () => {
  const facts = ["oldage", "remedy", "losework", "wound", "bear"].map(kind => fact(kind, "0.01"));
  facts.push(fact("fund", "999.99"));
  assert.deepEqual(projectPayrollInsuranceInputs(facts, ["hr:五险个人金额", "hr:养老保险政策合计金额", "hr:养老保险补充金额"]), {
    "hr:五险个人金额": "0.0500", "hr:养老保险政策合计金额": "99.9900", "hr:养老保险补充金额": "-0.0100",
  });
});
test("unused NULL amounts do not break old formulas; required missing or duplicate facts reject", () => {
  assert.deepEqual(projectPayrollInsuranceInputs([fact("oldage", null)], ["hr:基本工资"]), {});
  assert.throws(() => projectPayrollInsuranceInputs([fact("oldage", null)], ["hr:养老保险个人金额"]), /missing or invalid/u);
  assert.throws(() => projectPayrollInsuranceInputs([], ["hr:养老保险个人金额"]), /missing or ambiguous/u);
  assert.throws(() => projectPayrollInsuranceInputs([fact("oldage", "1"), fact("oldage", "2")], ["hr:养老保险个人金额"]), /ambiguous/u);
  assert.throws(() => projectPayrollInsuranceInputs([fact("oldage", "1")], ["hr:五险个人金额"]), /missing/u);
});
test("large exact amounts and fractional values never pass through floating point", () => {
  assert.equal(projectPayrollInsuranceInputs([fact("oldage", "9007199254740991.01")], ["hr:养老保险个人金额"])["hr:养老保险个人金额"], "9007199254740991.0100");
  assert.equal(projectPayrollInsuranceInputs([fact("oldage", "-0.0001")], ["hr:养老保险个人金额"])["hr:养老保险个人金额"], "-0.0001");
  for (const value of ["1e2", "NaN", "1.00001", "", " 1", "10000000000000000"]) {
    assert.throws(() => projectPayrollInsuranceInputs([fact("oldage", value)], ["hr:养老保险个人金额"]), /invalid/u);
  }
  const huge = ["oldage", "remedy", "losework", "wound", "bear"].map(kind => fact(kind, "9999999999999999.99"));
  assert.throws(() => projectPayrollInsuranceInputs(huge, ["hr:五险个人金额"]), /overflows/u);
});
