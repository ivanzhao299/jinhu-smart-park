import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

test("homestay operations UI mirrors backend constraints and protects paged action context", () => {
  const source = readFileSync(resolve(__dirname, "HomestayOperationsClient.tsx"), "utf8");

  assert.match(source, /max="8760"/);
  assert.match(source, /rateForm\.feeType === "percentage" \? "100" : undefined/);
  assert.match(source, /min=\{bookingForm\.arrivalDate \? addBusinessDateDays\(bookingForm\.arrivalDate, 1\) : undefined\}/);
  assert.match(source, /unitName\.get\(booking\.unitId\) \?\? booking\.unitId/);
  assert.match(source, /function changeBookingPage[\s\S]*clearBookingContext\(\)/);
  assert.match(source, /credentialSubmissionLock\.current/);
  assert.match(source, /idempotencyKey: credentialSubmissionKey\.current!/);
  assert.match(source, /credential_type: credentialType/);
});

test("homestay operations UI consumes bounded authoritative lists and recoverable evidence", () => {
  const source = readFileSync(resolve(__dirname, "HomestayOperationsClient.tsx"), "utf8");

  assert.match(source, /\/homestay\/unit-candidates\?page=/);
  assert.match(source, /\/homestay\/turnovers\?status=open&page=/);
  assert.match(source, /apiRequest<PaginatedResult<Turnover>>/);
  assert.match(source, /<AttachmentList[\s\S]*bizType="homestay_turnover"/);
  assert.match(source, /if \(canReadRates\)[\s\S]*void loadRate\(rateForm\.unitId\)/);
  assert.match(source, /\{canReadRates \? <form className="ds-panel" onSubmit=\{saveRate\}>/);
});
