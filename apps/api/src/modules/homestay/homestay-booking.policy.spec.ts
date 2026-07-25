import assert from "node:assert/strict";
import test from "node:test";
import {
  assertHomestayCheckInWindow,
  assertHomestayGuestRosterComplete,
  homestayMoneyDifference,
  turnoverLockEnd
} from "./homestay-booking.policy";

test("reschedule differences are compared in integer cents", () => {
  assert.equal(homestayMoneyDifference(0.01 + 17.82, "17.83"), 0);
  assert.equal(homestayMoneyDifference("20.00", "17.83"), 2.17);
});

test("check-in must be inside the booked business period", () => {
  const start = new Date("2026-07-25T00:00:00+08:00");
  const end = new Date("2026-07-26T00:00:00+08:00");
  assert.doesNotThrow(() => assertHomestayCheckInWindow(new Date("2026-07-25T14:00:00+08:00"), start, end));
  assert.throws(() => assertHomestayCheckInWindow(new Date("2026-07-24T23:59:59+08:00"), start, end));
  assert.throws(() => assertHomestayCheckInWindow(end, start, end));
});

test("every declared guest must be verified", () => {
  assert.doesNotThrow(() => assertHomestayGuestRosterComplete(2, 2));
  assert.throws(() => assertHomestayGuestRosterComplete(2, 1));
});

test("same-day occupancy already in progress does not create an overlapping turnover lock", () => {
  const now = new Date("2026-07-25T12:00:00+08:00");
  assert.equal(turnoverLockEnd(now, new Date("2026-07-25T00:00:00+08:00")), null);
  assert.equal(
    turnoverLockEnd(now, new Date("2026-07-25T15:00:00+08:00"))?.toISOString(),
    new Date("2026-07-25T15:00:00+08:00").toISOString()
  );
});
