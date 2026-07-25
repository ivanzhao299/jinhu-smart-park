import { BadRequestException } from "@nestjs/common";

function parseDate(value: string): Date {
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) throw new BadRequestException("Invalid billing date");
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
  const start = parseDate(startValue);
  const end = parseDate(endValue);
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
  const periodStart = parseDate(periodStartValue);
  const periodEnd = parseDate(periodEndValue);
  const leaseStart = parseDate(leaseStartValue);
  const leaseEndExclusive = parseDate(leaseEndValue);
  leaseEndExclusive.setUTCDate(leaseEndExclusive.getUTCDate() + 1);
  if (periodStart < leaseStart || periodEnd > leaseEndExclusive) {
    throw new BadRequestException("Billing period must stay within the lease term");
  }
}
