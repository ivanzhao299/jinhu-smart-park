import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException } from "@nestjs/common";
import {
  assertPropertyOccupancyReplaceable,
  normalizePropertyPeriod,
  occupancyDomainMatchesMode,
  propertyPeriodsOverlap
} from "./property-period.policy";

test("property period uses half-open [start, end) boundaries", () => {
  const first = normalizePropertyPeriod("2026-07-24T08:00:00Z", "2026-07-25T08:00:00Z");
  const adjacent = normalizePropertyPeriod("2026-07-25T08:00:00Z", "2026-07-26T08:00:00Z");
  const overlapping = normalizePropertyPeriod("2026-07-25T07:59:59Z", "2026-07-26T08:00:00Z");

  assert.equal(propertyPeriodsOverlap(first, adjacent), false);
  assert.equal(propertyPeriodsOverlap(first, overlapping), true);
});

test("property period rejects zero or negative duration", () => {
  assert.throws(
    () => normalizePropertyPeriod("2026-07-24T08:00:00Z", "2026-07-24T08:00:00Z"),
    BadRequestException
  );
  assert.throws(
    () => normalizePropertyPeriod("2026-07-25T08:00:00Z", "2026-07-24T08:00:00Z"),
    BadRequestException
  );
});

test("operating mode accepts only its business occupancy domain", () => {
  assert.equal(occupancyDomainMatchesMode("homestay", "short_stay"), true);
  assert.equal(occupancyDomainMatchesMode("homestay", "long_rent"), false);
  assert.equal(occupancyDomainMatchesMode("housing_rental", "long_rent"), true);
  assert.equal(occupancyDomainMatchesMode("apartment", "long_rent"), true);
  assert.equal(occupancyDomainMatchesMode("apartment", "short_stay"), false);
  assert.equal(occupancyDomainMatchesMode("commercial_leasing", "short_stay"), false);
  assert.equal(occupancyDomainMatchesMode("maintenance", "none"), true);
  assert.equal(occupancyDomainMatchesMode("operations", "short_stay"), true);
});

test("period replacement cannot resurrect or retarget an occupancy lifecycle", () => {
  const expected = {
    sourceDomain: "homestay",
    sourceType: "homestay_booking",
    sourceId: "booking-1",
    startAt: new Date("2026-07-29T00:00:00+08:00"),
    endAt: new Date("2026-07-30T00:00:00+08:00"),
    status: "active" as const
  };
  const active = {
    ...expected,
    holdExpiresAt: null
  };
  assert.doesNotThrow(() => assertPropertyOccupancyReplaceable(active, expected));
  assert.throws(() =>
    assertPropertyOccupancyReplaceable({ ...active, status: "released" }, expected)
  );
  assert.throws(() =>
    assertPropertyOccupancyReplaceable({ ...active, sourceId: "booking-2" }, expected)
  );
  assert.throws(() =>
    assertPropertyOccupancyReplaceable({
      ...active,
      startAt: new Date("2026-07-30T00:00:00+08:00")
    }, expected)
  );
});

test("expired holds cannot be extended through period replacement", () => {
  const expected = {
    sourceDomain: "homestay",
    sourceType: "homestay_booking",
    sourceId: "booking-1",
    startAt: new Date("2026-07-29T00:00:00+08:00"),
    endAt: new Date("2026-07-30T00:00:00+08:00"),
    status: "held" as const
  };
  assert.throws(() =>
    assertPropertyOccupancyReplaceable(
      { ...expected, holdExpiresAt: new Date("2026-07-29T00:30:00Z") },
      expected,
      new Date("2026-07-29T00:30:00Z")
    )
  );
  assert.doesNotThrow(() =>
    assertPropertyOccupancyReplaceable(
      { ...expected, holdExpiresAt: new Date("2026-07-29T00:31:00Z") },
      expected,
      new Date("2026-07-29T00:30:00Z")
    )
  );
});
