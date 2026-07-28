import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultHomestayRateForm,
  homestayRateFormFromCalendar,
  homestayUnitSelectionAfterLoad
} from "./homestay-operations.logic";

test("homestay unit pagination keeps only a selection visible on the loaded page", () => {
  assert.equal(homestayUnitSelectionAfterLoad("unit-b", ["unit-a", "unit-b"]), "unit-b");
  assert.equal(homestayUnitSelectionAfterLoad("unit-old", ["unit-c", "unit-d"]), "unit-c");
  assert.equal(homestayUnitSelectionAfterLoad("unit-old", []), "");
});

test("persisted homestay pricing replaces every editable rate field", () => {
  assert.deepEqual(
    homestayRateFormFromCalendar("unit-b", {
      base_daily_rate: "688.00",
      checkout_requires_inspection: true,
      cancellation_policy: {
        free_cancel_before_hours: 48,
        late_cancel_fee_type: "percentage",
        late_cancel_fee_value: "25.00"
      }
    }),
    {
      unitId: "unit-b",
      baseDailyRate: "688.00",
      freeCancelHours: "48",
      feeType: "percentage",
      feeValue: "25.00",
      requiresInspection: true
    }
  );
});

test("an unconfigured unit receives a complete fresh default form", () => {
  assert.deepEqual(defaultHomestayRateForm("unit-new"), {
    unitId: "unit-new",
    baseDailyRate: "300",
    freeCancelHours: "24",
    feeType: "fixed",
    feeValue: "0",
    requiresInspection: false
  });
});
