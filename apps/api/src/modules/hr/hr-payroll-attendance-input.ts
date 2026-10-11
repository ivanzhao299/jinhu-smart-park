import { ConflictException } from "@nestjs/common";

export const HR_PAYROLL_ATTENDANCE_FIELDS = [
  ["工作分钟", "workedMinutes"], ["迟到分钟", "lateMinutes"], ["早退分钟", "earlyMinutes"],
  ["缺勤天数", "absenceDays"], ["缺卡天数", "missingPunchDays"],
  ["批准请假分钟", "approvedLeaveMinutes"], ["批准出差申报天数", "approvedBusinessTripDeclaredDays"],
  ["批准加班区间分钟", "approvedOvertimeMs"], ["批准出差区间分钟", "approvedBusinessTripMs"],
] as const;

export function requiresPayrollAttendanceInputs(dependencies: readonly string[]) {
  return HR_PAYROLL_ATTENDANCE_FIELDS.some(([code]) => dependencies.includes(`hr:${code}`));
}

/** Missing historical facts stay unknown. Only freshly calculated whole-minute facts can be summed. */
export function sumApprovedLeaveMinutes(traces: readonly Record<string, unknown>[]): number {
  let total = 0;
  for (const trace of traces) {
    const value = trace.approvedLeaveMinutes;
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > 2147483647) {
      throw new ConflictException("批准请假分钟未完整保存，请重新计算日考勤后再进行月结");
    }
    total += value;
    if (total > 2147483647) throw new ConflictException("批准请假分钟合计超出可支持范围");
  }
  return total;
}

export function projectApprovedLeavePayrollInput(value: unknown): string {
  if ((typeof value !== "number" && typeof value !== "string") || !/^(0|[1-9]\d{0,9})$/u.test(String(value)) || BigInt(value) > 2147483647n) {
    throw new ConflictException("所选封账考勤未提供有效的批准请假分钟，请先建立明确的考勤更正版本");
  }
  return `${value}.0000`;
}

/** Exact monthly milliseconds are preserved; only formula input uses four-decimal minutes, half up. */
export function projectApprovedIntervalPayrollInput(value: unknown): string {
  if ((typeof value !== "number" && typeof value !== "string") || !/^(0|[1-9]\d{0,9})$/u.test(String(value)) || !Number.isSafeInteger(Number(value)) || BigInt(value) > 2678400000n) {
    throw new ConflictException("所选封账考勤未提供有效的批准区间时长，请先重算并建立明确更正版本");
  }
  const scaledMinutes = (BigInt(value) * 10000n + 30000n) / 60000n;
  return `${scaledMinutes / 10000n}.${(scaledMinutes % 10000n).toString().padStart(4, "0")}`;
}

export function projectApprovedTripDeclaredDaysPayrollInput(value: unknown): string {
  if ((typeof value !== "number" && typeof value !== "string") || (typeof value === "number" && !Number.isSafeInteger(value)) || !/^(0|[1-9]\d{0,18})$/u.test(String(value)) || BigInt(value) > 9223372036854775807n) throw new ConflictException("所选封账考勤未提供明确的出差申报月份归属，请先重算并建立明确更正版本");
  return `${value}.0000`;
}
