import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLegacyInsurancePolicyItems,
  legacyPercentPointsToFraction,
  normalizeLegacyFixedAmount,
} from "../hr-cutover/legacy-insurance-policy-normalization.mjs";

test("legacy percentage points convert to fractional rates without floating point loss", () => {
  assert.equal(legacyPercentPointsToFraction("16.000"), "0.16");
  assert.equal(legacyPercentPointsToFraction("0.125"), "0.00125");
  assert.equal(legacyPercentPointsToFraction("100.000"), "1");
  assert.equal(legacyPercentPointsToFraction("-0.000"), "0");
  assert.equal(legacyPercentPointsToFraction(null), null);
  assert.throws(() => legacyPercentPointsToFraction("-0.001"), /INSURANCE_POLICY_RATE_NEGATIVE/u);
  assert.throws(() => legacyPercentPointsToFraction("1e2"), /INSURANCE_POLICY_DECIMAL_INVALID/u);
});

test("fixed addends remain amounts and are never relabeled as a second rate variant", () => {
  assert.equal(normalizeLegacyFixedAmount("0012.340"), "12.34");
  assert.equal(normalizeLegacyFixedAmount("-2.500"), "-2.5");
  const items = buildLegacyInsurancePolicyItems({
    oldage: "20.000", oldage_e: "16.000", oldage_p: "4.000", oldage_pc: "0.500",
    oldage2: "10.000", oldage_e2: "6.000", oldage_p2: "4.000", oldage_pc2: "1.500",
  }, ["oldage"]);
  assert.deepEqual(items, [{
    kind: "oldage", variant: 1,
    baseRate: "0.2", employerRate: "0.16", employeeRate: "0.04", supplementRate: "0.005",
    baseFixedAmount: "10", employerFixedAmount: "6", employeeFixedAmount: "4", supplementFixedAmount: "1.5",
  }]);
});

test("policy normalization keeps one item per insurance kind and rejects duplicate kinds", () => {
  const source = {
    oldage: "0", oldage_e: "0", oldage_p: "0", oldage_pc: "0",
    oldage2: "0", oldage_e2: "0", oldage_p2: "0", oldage_pc2: "0",
    fund: "12", fund_e: "7", fund_p: "5", fund_pc: "0",
    fund2: "2", fund_e2: "1", fund_p2: "1", fund_pc2: "0",
  };
  const items = buildLegacyInsurancePolicyItems(source, ["oldage", "fund"]);
  assert.equal(items.length, 2);
  assert.deepEqual(items.map(item => `${item.kind}:${item.variant}`), ["oldage:1", "fund:1"]);
  assert.throws(() => buildLegacyInsurancePolicyItems(source, ["oldage", "oldage"]), /INSURANCE_POLICY_SOURCE_INVALID/u);
});
