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
    readBooking: boolean;
    manageStay: boolean;
    readFinance: boolean;
    registerFinance: boolean;
    waiveFinance: boolean;
  }
) {
  const operational = isHomestayBookingOperational(status);
  const hasBookingContext = permissions.readBooking;
  return {
    showStayOperations: hasBookingContext && permissions.manageStay && operational,
    canIssueCredential:
      hasBookingContext && permissions.manageStay && ["confirmed", "checked_in"].includes(status),
    canCheckIn: hasBookingContext && permissions.manageStay && status === "confirmed",
    showFinanceSummary: hasBookingContext && permissions.readFinance,
    showFinanceForm:
      hasBookingContext && (permissions.registerFinance || permissions.waiveFinance)
  };
}

export interface HomestayConsumableDraft {
  name: string;
  quantity: string;
  unit: string;
}

export interface HomestayConsumablePayload {
  name: string;
  quantity: number;
  unit?: string;
}

export function normalizeHomestayRequiredReason(value: string, maxLength: number): string | null {
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
}

export function homestayTurnoverConsumablesPayload(
  drafts: HomestayConsumableDraft[]
): HomestayConsumablePayload[] | null {
  if (drafts.length > 50) return null;
  const payload: HomestayConsumablePayload[] = [];
  for (const draft of drafts) {
    const name = draft.name.trim();
    const quantity = draft.quantity.trim();
    const unit = draft.unit.trim();
    if (!name && !quantity && !unit) continue;
    if (
      !name
      || name.length > 100
      || !/^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/.test(quantity)
      || Number(quantity) < 0.001
      || unit.length > 20
    ) {
      return null;
    }
    payload.push({
      name,
      quantity: Number(quantity),
      unit: unit || undefined
    });
  }
  return payload;
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
