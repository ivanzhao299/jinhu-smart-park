import { BadRequestException } from "@nestjs/common";

function parseDate(value: string): Date {
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) throw new BadRequestException("Invalid billing date");
  return date;
}

function addCalendarMonth(value: Date): Date {
  const year = value.getUTCFullYear();
  const month = value.getUTCMonth();
  const day = value.getUTCDate();
  const nextMonthStart = new Date(Date.UTC(year, month + 1, 1));
  const nextMonthEnd = new Date(Date.UTC(year, month + 2, 0)).getUTCDate();
  nextMonthStart.setUTCDate(Math.min(day, nextMonthEnd));
  return nextMonthStart;
}

export function calculateHousingMonthFraction(startValue: string, endValue: string): number {
  const start = parseDate(startValue);
  const end = parseDate(endValue);
  if (start >= end) throw new BadRequestException("Billing period start must be before end");
  let cursor = start;
  let months = 0;
  while (true) {
    const next = addCalendarMonth(cursor);
    if (next > end) break;
    months += 1;
    cursor = next;
  }
  if (cursor < end) {
    const next = addCalendarMonth(cursor);
    const partialDays = (end.getTime() - cursor.getTime()) / 86_400_000;
    const cycleDays = (next.getTime() - cursor.getTime()) / 86_400_000;
    months += partialDays / cycleDays;
  }
  return months;
}
