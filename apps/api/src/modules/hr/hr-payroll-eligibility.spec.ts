import assert from "node:assert/strict";
import test from "node:test";
import { resolvePayrollEligibility } from "./hr-payroll-eligibility";

const base = { periodStart: "2026-10-01", periodEnd: "2026-10-31", hireDate: "2020-01-01", departureDate: null };
test("payroll eligibility derives actual month intersections including departure and rehire boundaries", () => {
  assert.deepEqual(resolvePayrollEligibility(base), { eligibleStart: "2026-10-01", eligibleEnd: "2026-10-31", basis: "employment_dates" });
  assert.deepEqual(resolvePayrollEligibility({ ...base, hireDate: "2026-10-15", departureDate: "2026-10-20" }), { eligibleStart: "2026-10-15", eligibleEnd: "2026-10-20", basis: "employment_dates" });
  assert.deepEqual(resolvePayrollEligibility({ ...base, departureDate: "2026-10-01" }), { eligibleStart: "2026-10-01", eligibleEnd: "2026-10-01", basis: "employment_dates" });
});
test("unknown dates and past departures require a reviewed settlement window rather than a reason alone", () => {
  for (const source of [{ ...base, hireDate: null }, { ...base, departureDate: "2026-09-30" }, { ...base, hireDate: "2026-11-01" }]) {
    assert.throws(() => resolvePayrollEligibility({ ...source, eligibilityReason: "经核对" }), /settlement window/);
    assert.deepEqual(resolvePayrollEligibility({ ...source, eligibilityReason: "经核对离职补结算", settlementStart: "2026-10-01", settlementEnd: "2026-10-10" }), {
      eligibleStart: "2026-10-01", eligibleEnd: "2026-10-10", basis: "explicit_settlement",
    });
  }
});
test("settlement overrides require paired valid dates, a reason and an in-period window", () => {
  for (const override of [
    { settlementStart: "2026-10-01" },
    { settlementStart: "2026-10-01", settlementEnd: "2026-10-31" },
    { settlementStart: "2026-10-01", settlementEnd: "2026-10-31", eligibilityReason: " " },
    { settlementStart: "2026-09-30", settlementEnd: "2026-10-31", eligibilityReason: "结算" },
    { settlementStart: "2026-10-20", settlementEnd: "2026-10-10", eligibilityReason: "结算" },
    { settlementStart: "2026-02-30", settlementEnd: "2026-10-31", eligibilityReason: "结算" },
  ]) assert.throws(() => resolvePayrollEligibility({ ...base, ...override }));
  assert.throws(() => resolvePayrollEligibility({ ...base, hireDate: "2026-10-20", departureDate: "2026-10-10" }), /employment date range/);
});
