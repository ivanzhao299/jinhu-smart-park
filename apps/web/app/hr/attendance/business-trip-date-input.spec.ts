import assert from "node:assert/strict";
import { it } from "node:test";
import { tripDateInput, tripDateInstant, tripDateWindow, tripEndBound } from "./business-trip-date-input";

it("binds Shanghai input to the same instant independently of the host timezone", () => {
  assert.equal(tripDateInput("2026-07-31T16:00:00.000Z"), "2026-08-01T00:00");
  assert.equal(tripDateInstant("2026-08-01T00:00"), "2026-07-31T16:00:00.000Z");
  assert.equal(tripDateInput("2026-08-01T00:00:00+08:00"), "2026-08-01T00:00");
});
it("rejects invalid calendar dates and avoids silently truncating original seconds", () => {
  for (const input of ["2026-02-30T09:00", "2026-07-01T25:00", "2026-07-01", "2026-07-01T09:00:01"]) assert.equal(tripDateInstant(input), null);
  assert.equal(tripDateInput("2026-07-01T01:00:01Z"), "");
  assert.equal(tripDateInput(null), "");
});
it("uses minute-exclusive end bounds and enforces the 31-day limit across month boundaries", () => {
  assert.equal(tripEndBound("2026-07-31T23:59", 1), "2026-08-01T00:00");
  assert.equal(tripDateWindow("2026-07-01T09:00", "2026-07-01T09:00"), null);
  assert.equal(tripDateWindow("2026-07-01T09:00", "2026-06-30T09:00"), null);
  assert.equal(tripDateWindow("2026-07-01T09:00", "2026-08-01T09:00")?.durationMinutes, 44640);
  assert.equal(tripDateWindow("2026-07-01T09:00", "2026-08-01T09:01"), null);
});
