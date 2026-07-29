export interface HomestayRateCalendar {
  base_daily_rate: string;
  checkout_requires_inspection: boolean;
  cancellation_policy: {
    free_cancel_before_hours: number;
    late_cancel_fee_type: "fixed" | "percentage";
    late_cancel_fee_value: string;
  };
}

export interface HomestayRateFormState {
  unitId: string;
  baseDailyRate: string;
  freeCancelHours: string;
  feeType: "fixed" | "percentage";
  feeValue: string;
  requiresInspection: boolean;
}

export function defaultHomestayRateForm(unitId = ""): HomestayRateFormState {
  return {
    unitId,
    baseDailyRate: "300",
    freeCancelHours: "24",
    feeType: "fixed",
    feeValue: "0",
    requiresInspection: false
  };
}

export function homestayUnitSelectionAfterLoad(currentId: string, loadedIds: string[]): string {
  return loadedIds.includes(currentId) ? currentId : loadedIds[0] ?? "";
}

export function clampPageToTotal(page: number, pageSize: number, total: number): number {
  return Math.min(page, Math.max(1, Math.ceil(total / pageSize)));
}

export function canMarkHomestayNoShow(arrivalDate: string, currentBusinessDate: string): boolean {
  return arrivalDate <= currentBusinessDate;
}

export function isHomestayBookingOperational(status: string): boolean {
  return ["draft", "confirmed", "checked_in"].includes(status);
}

export function shouldRetainHomestayBookingDetail(
  selectedBookingId: string,
  visibleBookingIds: string[]
): boolean {
  return Boolean(selectedBookingId && visibleBookingIds.includes(selectedBookingId));
}

export function homestayBookingDetailCapabilities(
  status: string,
  permissions: {
    manageStay: boolean;
    readFinance: boolean;
    registerFinance: boolean;
    waiveFinance: boolean;
  }
) {
  const operational = isHomestayBookingOperational(status);
  return {
    showStayOperations: permissions.manageStay && operational,
    canIssueCredential:
      permissions.manageStay && ["confirmed", "checked_in"].includes(status),
    canCheckIn: permissions.manageStay && status === "confirmed",
    showFinanceSummary: permissions.readFinance,
    showFinanceForm: permissions.registerFinance || permissions.waiveFinance
  };
}

export function homestayBookingUnitLabel(booking: {
  unitId: string;
  unitCode: string | null;
  unitName: string | null;
}): string {
  const display = [booking.unitCode, booking.unitName].filter(Boolean).join(" · ");
  return display || booking.unitId;
}

export function homestayTurnoverUnitLabel(turnover: {
  unitId: string;
  unitCode: string | null;
  unitName: string | null;
}): string {
  const display = [turnover.unitCode, turnover.unitName].filter(Boolean).join(" · ");
  return display || turnover.unitId;
}

export function homestayRateFormFromCalendar(
  unitId: string,
  calendar: HomestayRateCalendar
): HomestayRateFormState {
  return {
    unitId,
    baseDailyRate: calendar.base_daily_rate,
    freeCancelHours: String(calendar.cancellation_policy.free_cancel_before_hours),
    feeType: calendar.cancellation_policy.late_cancel_fee_type,
    feeValue: calendar.cancellation_policy.late_cancel_fee_value,
    requiresInspection: calendar.checkout_requires_inspection
  };
}
