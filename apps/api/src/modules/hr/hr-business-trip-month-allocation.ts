import { BadRequestException } from "@nestjs/common";

export type TripMonthAllocation = { month: string; days: number };
export const MAX_TRIP_ALLOCATION_MONTHS = 3;

/** Shanghai half-open calendar months. Never truncate unsupported historical spans. */
export function businessTripAllocationMonths(startAt: Date | null, endAt: Date | null): string[] {
  const start = startAt?.getTime(), end = endAt?.getTime();
  if (start === undefined || end === undefined || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new BadRequestException("出差起止时间不完整，请先更正来源");
  if (end - start > 31 * 86400000) throw new BadRequestException("出差超过31日归属登记范围，请先核对并更正来源，不支持截断月份");
  const first = new Date(start + 8 * 3600000).toISOString().slice(0, 7);
  const last = new Date(end - 1 + 8 * 3600000).toISOString().slice(0, 7);
  if (!/^\d{4}-\d{2}$/u.test(first) || !/^\d{4}-\d{2}$/u.test(last)) throw new BadRequestException("出差年份超出月份登记范围，请先核对来源");
  const months: string[] = [];
  for (let month = first; month <= last;) {
    months.push(month);
    if (months.length > MAX_TRIP_ALLOCATION_MONTHS) throw new BadRequestException("出差超过3个自然月归属登记范围，请先核对来源");
    const [year, value] = month.split("-").map(Number);
    month = `${String(value === 12 ? year! + 1 : year).padStart(4, "0")}-${String(value === 12 ? 1 : value! + 1).padStart(2, "0")}`;
  }
  return months;
}

export function assertBusinessTripDeclaredDays(declaredDays: unknown): asserts declaredDays is number {
  if (typeof declaredDays !== "number" || !Number.isInteger(declaredDays) || declaredDays < 0 || declaredDays > 2147483647) throw new BadRequestException("出差申报天数不完整，请先更正申报总数");
}

export function validateBusinessTripAllocation(months: readonly string[], declaredDays: unknown, input: unknown): TripMonthAllocation[] {
  assertBusinessTripDeclaredDays(declaredDays);
  if (!Array.isArray(input) || !input.length || input.length !== months.length || input.length > MAX_TRIP_ALLOCATION_MONTHS) throw new BadRequestException("请完整登记所有相交月份，不可遗漏或增加月份");
  const seen = new Set<string>();
  let total = 0;
  const result: TripMonthAllocation[] = [];
  for (const row of input) {
    if (!row || typeof row !== "object" || !months.includes(row.month) || seen.has(row.month) || !Number.isInteger(row.days) || row.days < 0 || row.days > 2147483647) throw new BadRequestException("月份不得重复，每月申报天数必须是非负整数");
    seen.add(row.month); total += row.days; result.push({ month: row.month, days: row.days });
  }
  if (total !== declaredDays) throw new BadRequestException("各月申报天数合计必须等于当前申报总数");
  return result.sort((a, b) => a.month.localeCompare(b.month));
}
