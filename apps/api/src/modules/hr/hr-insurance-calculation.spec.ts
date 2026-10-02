import assert from "node:assert/strict";
import test from "node:test";
import { calculateInsurancePreview, HR_INSURANCE_KINDS, InsuranceCalculationItem } from "./hr-insurance-calculation";

function fixture(rate = "0.08", base = "1000", fixed: string | null = null) {
  return { policyVersion: 1, includeFund: true, items: HR_INSURANCE_KINDS.map((insuranceKind): InsuranceCalculationItem => ({
    insuranceKind, contributionBase: base,
    factors: Object.fromEntries(["base", "employer", "employee", "supplement"].map(c => [c, { rate, fixedAmount: fixed }])) as InsuranceCalculationItem["factors"],
  })) };
}

test("fractional rates apply once to all six kinds and four independent components", () => {
  const input = fixture();
  input.items[0]!.factors = { base: { rate: "0.1", fixedAmount: "1" }, employer: { rate: "0.2", fixedAmount: "2" }, employee: { rate: "0.08", fixedAmount: "3" }, supplement: { rate: "0", fixedAmount: "4" } };
  const result = calculateInsurancePreview(input);
  assert.deepEqual(result.items[0]!.amounts, { base: "101.00", employer: "202.00", employee: "83.00", supplement: "4.00" });
  assert.deepEqual(result.totals, { base: "501.00", employer: "602.00", employee: "483.00", supplement: "404.00" });
  assert.equal(result.policyVersion, 1);
});

test("fixed addend precedes rounding and each item rounds before aggregate", () => {
  const result = calculateInsurancePreview(fixture("0.004", "1", "0.004"));
  assert.equal(result.items[0]!.amounts.employee, "0.01");
  assert.equal(result.totals.employee, "0.06");
  assert.equal(calculateInsurancePreview(fixture("0.005", "1")).totals.employee, "0.06");
  assert.equal(calculateInsurancePreview(fixture("0.000001", "5000")).items[0]!.amounts.employee, "0.01");
});

test("fund exclusion changes only aggregate, preserves calculated fund items and inputs", () => {
  const input = fixture(); input.includeFund = false;
  const before = JSON.stringify(input);
  const result = calculateInsurancePreview(input);
  assert.equal(result.items[5]!.amounts.employee, "80.00");
  assert.equal(result.totals.employee, "400.00");
  assert.equal(JSON.stringify(input), before);
  assert.deepEqual(calculateInsurancePreview({ ...input, items: [...input.items].reverse() }), result);
});

test("missing policy, base, rates and fund choice reject instead of retaining old amounts", () => {
  const missingBase = fixture(); missingBase.items[0]!.contributionBase = null;
  assert.throws(() => calculateInsurancePreview(missingBase), /contribution base missing/u);
  const missingRate = fixture(); missingRate.items[0]!.factors.employee.rate = null;
  assert.throws(() => calculateInsurancePreview(missingRate), /fractional rate missing/u);
  assert.throws(() => calculateInsurancePreview({ ...fixture(), items: [] }), /six policy kinds/u);
  assert.throws(() => calculateInsurancePreview({ ...fixture(), policyVersion: 0 }), /policy version/u);
  assert.throws(() => calculateInsurancePreview({ ...fixture(), includeFund: null as unknown as boolean }), /explicit fund/u);
});

test("duplicates, unknown kinds and malformed or over-precision values reject", () => {
  const duplicate = fixture(); duplicate.items[5]!.insuranceKind = "oldage";
  assert.throws(() => calculateInsurancePreview(duplicate), /duplicate/u);
  const unknown = fixture(); unknown.items[5]!.insuranceKind = "unknown" as InsuranceCalculationItem["insuranceKind"];
  assert.throws(() => calculateInsurancePreview(unknown), /unknown/u);
  for (const base of ["1e3", "", " 1", "1.001", "10000000000000000", "-1"]) assert.throws(() => calculateInsurancePreview(fixture("0.08", base)));
  for (const rate of ["0.0000001", "-0.08", "1000000000000", "NaN"]) assert.throws(() => calculateInsurancePreview(fixture(rate)));
  assert.throws(() => calculateInsurancePreview(fixture("0", "1", "0.0001")), /precision/u);
  for (const fixed of ["-1", "-0.004"]) assert.throws(() => calculateInsurancePreview(fixture("0", "1", fixed)), /negative calculated/u);
});

test("large exact amount survives beyond binary number precision; aggregate overflow rejects", () => {
  const input = fixture("0", "0");
  input.items[0]!.contributionBase = "90071992547409.91";
  for (const factor of Object.values(input.items[0]!.factors)) factor.rate = "1";
  assert.equal(calculateInsurancePreview(input).totals.employee, "90071992547409.91");
  assert.throws(() => calculateInsurancePreview(fixture("1", "9999999999999999.99")), /outside numeric/u);
  assert.throws(() => calculateInsurancePreview(fixture("2", "9999999999999999.99")), /outside numeric/u);
});
