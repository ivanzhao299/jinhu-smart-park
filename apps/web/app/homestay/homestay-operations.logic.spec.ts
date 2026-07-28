import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  canMarkHomestayNoShow,
  clampPageToTotal,
  defaultHomestayRateForm,
  homestayRateFormFromCalendar,
  homestayTurnoverUnitLabel,
  homestayUnitSelectionAfterLoad
} from "./homestay-operations.logic";

test("homestay unit pagination keeps only a selection visible on the loaded page", () => {
  assert.equal(homestayUnitSelectionAfterLoad("unit-b", ["unit-a", "unit-b"]), "unit-b");
  assert.equal(homestayUnitSelectionAfterLoad("unit-old", ["unit-c", "unit-d"]), "unit-c");
  assert.equal(homestayUnitSelectionAfterLoad("unit-old", []), "");
});

test("operational pages clamp deleted-tail pages and gate no-show by business date", () => {
  assert.equal(clampPageToTotal(3, 20, 20), 1);
  assert.equal(clampPageToTotal(2, 20, 21), 2);
  assert.equal(clampPageToTotal(1, 20, 0), 1);
  assert.equal(canMarkHomestayNoShow("2026-07-29", "2026-07-28"), false);
  assert.equal(canMarkHomestayNoShow("2026-07-28", "2026-07-28"), true);
});

test("turnover labels come from their own response instead of candidate paging", () => {
  assert.equal(
    homestayTurnoverUnitLabel({
      unitId: "unit-1",
      unitCode: "A-101",
      unitName: "人才公寓 101"
    }),
    "A-101 · 人才公寓 101"
  );
  assert.equal(
    homestayTurnoverUnitLabel({ unitId: "unit-legacy", unitCode: null, unitName: null }),
    "unit-legacy"
  );
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
  assert.match(source, /credentialReturnLock\.current/);
  assert.match(source, /idempotencyKey: credentialReturnKey\.current!/);
  assert.match(source, /canMarkHomestayNoShow\(booking\.arrivalDate, today\(\)\)/);
});

test("homestay operations UI consumes bounded authoritative lists and recoverable evidence", () => {
  const source = readFileSync(resolve(__dirname, "HomestayOperationsClient.tsx"), "utf8");

  assert.match(source, /\/homestay\/unit-candidates\?page=/);
  assert.match(source, /\/homestay\/turnovers\?status=open&page=/);
  assert.match(source, /apiRequest<PaginatedResult<Turnover>>/);
  assert.match(source, /<AttachmentList[\s\S]*bizType="homestay_turnover"/);
  assert.match(source, /if \(canReadRates\)[\s\S]*void loadRate\(rateForm\.unitId\)/);
  assert.match(source, /\{canReadRates \? <form className="ds-panel" onSubmit=\{saveRate\}>/);
  assert.match(source, /<form className="ds-panel" onSubmit=\{createBooking\}>[\s\S]*<PaginationControls meta=\{unitPage\}/);
  assert.match(
    source,
    /canUploadTurnoverEvidence\s*=\s*canExecuteTurnovers\s*&&\s*hasPermission\(user,\s*SYSTEM_PERMISSIONS\.FILE_UPLOAD\)/
  );
  assert.match(
    source,
    /canReadTurnoverEvidence\s*=\s*canReadTurnovers\s*&&\s*hasPermission\(user,\s*SYSTEM_PERMISSIONS\.FILE_READ\)/
  );
  assert.match(source, /\{canUploadTurnoverEvidence \? <FileUploader/);
  assert.match(source, /\{canReadTurnoverEvidence \? <AttachmentList/);
  assert.match(source, /homestayTurnoverUnitLabel\(task\)/);
  assert.doesNotMatch(source, /unitName\.get\(task\.unitId\)/);
  assert.match(source, /task\.exceptionDescription/);
});
