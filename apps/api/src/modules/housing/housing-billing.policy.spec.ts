import assert from "node:assert/strict";
import test from "node:test";
import {
  assertHousingBillingPeriodWithinLease,
  calculateHousingMonthFraction
} from "./housing-billing.policy";

test("calendar-aligned quarter remains exactly three months", () => {
  assert.equal(calculateHousingMonthFraction("2026-09-01", "2026-12-01"), 3);
});

test("same-day monthly boundary remains exactly one month", () => {
  assert.equal(calculateHousingMonthFraction("2026-01-31", "2026-02-28"), 1);
});

test("month advancement preserves the original billing-day anchor after February", () => {
  assert.equal(calculateHousingMonthFraction("2026-01-31", "2026-03-31"), 2);
  assert.equal(calculateHousingMonthFraction("2024-01-31", "2024-03-31"), 2);
});

test("tail period is prorated against the current calendar cycle", () => {
  assert.equal(calculateHousingMonthFraction("2026-09-01", "2026-09-16"), 0.5);
});

test("billing period may use the complete inclusive lease term", () => {
  assert.doesNotThrow(() =>
    assertHousingBillingPeriodWithinLease("2026-01-01", "2027-01-01", "2026-01-01", "2026-12-31")
  );
});

test("billing period cannot start before or end after the lease term", () => {
  assert.throws(() =>
    assertHousingBillingPeriodWithinLease("2025-12-31", "2026-02-01", "2026-01-01", "2026-12-31")
  );
  assert.throws(() =>
    assertHousingBillingPeriodWithinLease("2026-12-01", "2027-01-02", "2026-01-01", "2026-12-31")
  );
});
