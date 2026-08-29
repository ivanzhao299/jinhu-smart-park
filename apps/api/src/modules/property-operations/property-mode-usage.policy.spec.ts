import assert from "node:assert/strict";
import test from "node:test";
import {
  PROPERTY_MODE_UNIT_USAGE_ALLOWLIST,
  PROPERTY_OPERATING_MODES,
  UNIT_USAGE_TYPES,
  deriveRentalSegment,
  isUnitUsageAllowedForPropertyMode,
  type PropertyOperatingMode
} from "@jinhu/shared";

test("approved mode by usage matrix is exhaustive for long rent and short stay", () => {
  const expected = {
    none: [10, 20, 30, 40, 50, 60, 70],
    short_stay: [70],
    long_rent: [70, 10]
  } as const satisfies Record<PropertyOperatingMode, readonly number[]>;
  for (const mode of PROPERTY_OPERATING_MODES) {
    assert.deepEqual(PROPERTY_MODE_UNIT_USAGE_ALLOWLIST[mode], expected[mode]);
    for (const usageType of UNIT_USAGE_TYPES) {
      assert.equal(
        isUnitUsageAllowedForPropertyMode(mode, usageType),
        (expected[mode] as readonly number[]).includes(usageType),
        `${mode} x ${usageType}`
      );
    }
  }
});

test("rental segment is derived from authoritative usage without a fallback category", () => {
  assert.equal(deriveRentalSegment(70), "residential");
  assert.equal(deriveRentalSegment(10), "office");
  assert.equal(deriveRentalSegment(20), null);
});
