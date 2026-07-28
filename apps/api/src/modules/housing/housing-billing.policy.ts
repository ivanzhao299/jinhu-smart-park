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

export interface HousingMonthFractionRatio {
  numerator: bigint;
  denominator: bigint;
}

function greatestCommonDivisor(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a || 1n;
}

export function calculateHousingMonthFractionRatio(
  startValue: string,
  endValue: string,
  anchorValue = startValue
): HousingMonthFractionRatio {
  const start = parseHousingCalendarDate(startValue);
  const end = parseHousingCalendarDate(endValue);
  const anchor = parseHousingCalendarDate(anchorValue);
  if (start >= end) throw new BadRequestException("Billing period start must be before end");
  if (start < anchor) throw new BadRequestException("Billing period cannot precede its month anchor");

  let cycleIndex = 0;
  while (addCalendarMonthsFromAnchor(anchor, cycleIndex + 1) <= start) {
    cycleIndex += 1;
  }

  let numerator = 0n;
  let denominator = 1n;
  while (true) {
    const cycleStart = addCalendarMonthsFromAnchor(anchor, cycleIndex);
    const cycleEnd = addCalendarMonthsFromAnchor(anchor, cycleIndex + 1);
    if (cycleStart >= end) break;
    const overlapStart = cycleStart > start ? cycleStart : start;
    const overlapEnd = cycleEnd < end ? cycleEnd : end;
    if (overlapStart < overlapEnd) {
      const overlapDays = BigInt((overlapEnd.getTime() - overlapStart.getTime()) / 86_400_000);
      const cycleDays = BigInt((cycleEnd.getTime() - cycleStart.getTime()) / 86_400_000);
      numerator = numerator * cycleDays + overlapDays * denominator;
      denominator *= cycleDays;
      const divisor = greatestCommonDivisor(numerator, denominator);
      numerator /= divisor;
      denominator /= divisor;
    }
    cycleIndex += 1;
  }
  return { numerator, denominator };
}

export function calculateHousingMonthFraction(
  startValue: string,
  endValue: string,
  anchorValue = startValue
): number {
  const fraction = calculateHousingMonthFractionRatio(startValue, endValue, anchorValue);
  return Number(fraction.numerator) / Number(fraction.denominator);
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
