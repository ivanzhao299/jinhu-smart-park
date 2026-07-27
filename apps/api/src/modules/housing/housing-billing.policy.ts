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

function calculateHousingMonthPosition(anchor: Date, target: Date): number {
  if (target < anchor) throw new BadRequestException("Billing period cannot precede its month anchor");
  let wholeMonths = 0;
  while (true) {
    const next = addCalendarMonthsFromAnchor(anchor, wholeMonths + 1);
    if (next > target) break;
    wholeMonths += 1;
  }
  const cursor = addCalendarMonthsFromAnchor(anchor, wholeMonths);
  let months = wholeMonths;
  if (cursor < target) {
    const next = addCalendarMonthsFromAnchor(anchor, wholeMonths + 1);
    const partialDays = (target.getTime() - cursor.getTime()) / 86_400_000;
    const cycleDays = (next.getTime() - cursor.getTime()) / 86_400_000;
    months += partialDays / cycleDays;
  }
  return months;
}

export function calculateHousingMonthFraction(
  startValue: string,
  endValue: string,
  anchorValue = startValue
): number {
  const start = parseHousingCalendarDate(startValue);
  const end = parseHousingCalendarDate(endValue);
  const anchor = parseHousingCalendarDate(anchorValue);
  if (start >= end) throw new BadRequestException("Billing period start must be before end");
  return calculateHousingMonthPosition(anchor, end) - calculateHousingMonthPosition(anchor, start);
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
