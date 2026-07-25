import assert from "node:assert/strict";
import test from "node:test";
import { calculateHousingMonthFraction } from "./housing-billing.policy";

test("calendar-aligned quarter remains exactly three months", () => {
  assert.equal(calculateHousingMonthFraction("2026-09-01", "2026-12-01"), 3);
});

test("same-day monthly boundary remains exactly one month", () => {
  assert.equal(calculateHousingMonthFraction("2026-01-31", "2026-02-28"), 1);
});

test("tail period is prorated against the current calendar cycle", () => {
  assert.equal(calculateHousingMonthFraction("2026-09-01", "2026-09-16"), 0.5);
});
