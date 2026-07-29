import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  canMarkHomestayNoShow,
  clampPageToTotal,
  defaultHomestayRateForm,
  homestayBookingDetailCapabilities,
  homestayBookingUnitLabel,
  homestayRateFormFromCalendar,
  homestayTurnoverConsumablesPayload,
  homestayTurnoverUnitLabel,
  homestayUnitSelectionAfterLoad,
  isHomestayBookingOperational,
  normalizeHomestayRequiredReason,
  shouldRetainHomestayBookingDetail
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

test("terminal bookings retain readable detail while losing stay operations", () => {
  assert.equal(isHomestayBookingOperational("draft"), true);
  assert.equal(isHomestayBookingOperational("confirmed"), true);
  assert.equal(isHomestayBookingOperational("checked_in"), true);
  assert.equal(isHomestayBookingOperational("checked_out"), false);
  assert.equal(isHomestayBookingOperational("cancelled"), false);
  assert.equal(isHomestayBookingOperational("no_show"), false);
  assert.equal(shouldRetainHomestayBookingDetail("booking-1", ["booking-1"]), true);
  assert.equal(shouldRetainHomestayBookingDetail("booking-1", ["booking-2"]), false);

  assert.deepEqual(
    homestayBookingDetailCapabilities("checked_out", {
      readBooking: true,
      manageStay: true,
      readFinance: true,
      registerFinance: true,
      waiveFinance: false
    }),
    {
      showStayOperations: false,
      canIssueCredential: false,
      canCheckIn: false,
      showFinanceSummary: true,
      showFinanceForm: true
    }
  );
});

test("booking detail capabilities separate audit, finance, and stay permissions", () => {
  assert.deepEqual(
    homestayBookingDetailCapabilities("confirmed", {
      readBooking: true,
      manageStay: false,
      readFinance: true,
      registerFinance: false,
      waiveFinance: false
    }),
    {
      showStayOperations: false,
      canIssueCredential: false,
      canCheckIn: false,
      showFinanceSummary: true,
      showFinanceForm: false
    }
  );
  assert.deepEqual(
    homestayBookingDetailCapabilities("confirmed", {
      readBooking: true,
      manageStay: true,
      readFinance: false,
      registerFinance: false,
      waiveFinance: false
    }),
    {
      showStayOperations: true,
      canIssueCredential: true,
      canCheckIn: true,
      showFinanceSummary: false,
      showFinanceForm: false
    }
  );
  assert.deepEqual(
    homestayBookingDetailCapabilities("confirmed", {
      readBooking: false,
      manageStay: true,
      readFinance: true,
      registerFinance: true,
      waiveFinance: true
    }),
    {
      showStayOperations: false,
      canIssueCredential: false,
      canCheckIn: false,
      showFinanceSummary: false,
      showFinanceForm: false
    }
  );
});

test("destructive reasons and turnover consumables preserve real field data", () => {
  assert.equal(normalizeHomestayRequiredReason("  客人电话确认取消  ", 500), "客人电话确认取消");
  assert.equal(normalizeHomestayRequiredReason("   ", 500), null);
  assert.equal(normalizeHomestayRequiredReason("a".repeat(501), 500), null);

  assert.deepEqual(
    homestayTurnoverConsumablesPayload([
      { name: " 垃圾袋 ", quantity: "2.5", unit: "包" },
      { name: "", quantity: "", unit: "" }
    ]),
    [{ name: "垃圾袋", quantity: 2.5, unit: "包" }]
  );
  assert.equal(
    homestayTurnoverConsumablesPayload([{ name: "清洁剂", quantity: "0", unit: "瓶" }]),
    null
  );
  assert.equal(
    homestayTurnoverConsumablesPayload([{ name: "", quantity: "1", unit: "瓶" }]),
    null
  );
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

test("booking labels come from their own response instead of candidate paging", () => {
  assert.equal(
    homestayBookingUnitLabel({
      unitId: "unit-1",
      unitCode: "A-101",
      unitName: "人才公寓 101"
    }),
    "A-101 · 人才公寓 101"
  );
  assert.equal(
    homestayBookingUnitLabel({ unitId: "unit-legacy", unitCode: null, unitName: null }),
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
  assert.match(source, /homestayBookingUnitLabel\(booking\)/);
  assert.doesNotMatch(source, /unitName\.get\(booking\.unitId\)/);
  assert.match(source, /function changeBookingPage[\s\S]*clearBookingContext\(\)/);
  assert.match(source, /credentialSubmissionLock\.current/);
  assert.match(source, /idempotencyKey: credentialSubmissionKey\.current!/);
  assert.match(source, /credential_type: credentialType/);
  assert.match(source, /credentialReturnLock\.current/);
  assert.match(source, /idempotencyKey: credentialReturnKey\.current!/);
  assert.match(source, /canMarkHomestayNoShow\(booking\.arrivalDate, today\(\)\)/);
  assert.match(source, /shouldRetainHomestayBookingDetail/);
  assert.doesNotMatch(source, /!isHomestayBookingOperational\(selectedBooking\.status\)/);
  assert.match(source, />查看详情<\/button>/);
  assert.match(source, /bookingDetailCapabilities\?\.showStayOperations/);
  assert.match(source, /bookingDetailCapabilities\?\.showFinanceSummary/);
  assert.match(source, /bookingDetailCapabilities\?\.showFinanceForm/);
  assert.match(source, /readBooking: canReadBookings/);
  assert.match(source, /role="alertdialog"/);
  assert.match(source, /required[\s\S]*maxLength=\{500\}[\s\S]*bookingTerminationReason/);
  assert.doesNotMatch(source, /reason: "运营人员人工确认"/);
  assert.match(source, /if \(selectedBookingIdRef\.current === booking\.id\)[\s\S]*await loadBookingDetail\(booking\.id\)/);
  assert.match(source, /setRefreshError\(errors\.length \? `部分数据加载失败/);
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
  assert.match(source, /turnoverExceptions\[task\.id\]/);
  assert.doesNotMatch(source, /现场发现异常，等待维修处理/);
  assert.match(source, /homestayTurnoverConsumablesPayload\(turnoverConsumables\[task\.id\]/);
  assert.match(source, /consumables: \["complete", "exception"\]\.includes\(action\)/);
  assert.match(source, />\s*添加耗材\s*<\/button>/);
});
