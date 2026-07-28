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
