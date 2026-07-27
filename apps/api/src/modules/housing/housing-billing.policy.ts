import { BadRequestException } from "@nestjs/common";

export function parseHousingCalendarDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException("Invalid housing calendar date");
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new BadRequestException("Invalid housing calendar date");
  }
  return date;
}

function addCalendarMonthsFromAnchor(value: Date, months: number): Date {
  const targetMonthStart = new Date(Date.UTC(
    value.getUTCFullYear(),
    value.getUTCMonth() + months,
    1
  ));
  const targetMonthEnd = new Date(Date.UTC(
    targetMonthStart.getUTCFullYear(),
    targetMonthStart.getUTCMonth() + 1,
    0
  )).getUTCDate();
  targetMonthStart.setUTCDate(Math.min(value.getUTCDate(), targetMonthEnd));
  return targetMonthStart;
}

export function calculateHousingMonthFraction(startValue: string, endValue: string): number {
  const start = parseHousingCalendarDate(startValue);
  const end = parseHousingCalendarDate(endValue);
  if (start >= end) throw new BadRequestException("Billing period start must be before end");
  let wholeMonths = 0;
  while (true) {
    const next = addCalendarMonthsFromAnchor(start, wholeMonths + 1);
    if (next > end) break;
    wholeMonths += 1;
  }
  const cursor = addCalendarMonthsFromAnchor(start, wholeMonths);
  let months = wholeMonths;
  if (cursor < end) {
    const next = addCalendarMonthsFromAnchor(start, wholeMonths + 1);
    const partialDays = (end.getTime() - cursor.getTime()) / 86_400_000;
    const cycleDays = (next.getTime() - cursor.getTime()) / 86_400_000;
    months += partialDays / cycleDays;
  }
  return months;
}

export function assertHousingBillingPeriodWithinLease(
  periodStartValue: string,
  periodEndValue: string,
  leaseStartValue: string,
  leaseEndValue: string
): void {
  const periodStart = parseHousingCalendarDate(periodStartValue);
  const periodEnd = parseHousingCalendarDate(periodEndValue);
  const leaseStart = parseHousingCalendarDate(leaseStartValue);
  const leaseEndExclusive = parseHousingCalendarDate(leaseEndValue);
  leaseEndExclusive.setUTCDate(leaseEndExclusive.getUTCDate() + 1);
  if (periodStart < leaseStart || periodEnd > leaseEndExclusive) {
    throw new BadRequestException("Billing period must stay within the lease term");
  }
}
