import { ConflictException } from "@nestjs/common";

export function toMoneyCents(value: string | number): number {
  return Math.round(Number(value) * 100);
}

export function homestayMoneyDifference(currentValue: string | number, previousValue: string | number): number {
  return (toMoneyCents(currentValue) - toMoneyCents(previousValue)) / 100;
}

export function assertHomestayCheckInWindow(
  now: Date,
  stayStart: Date,
  stayEnd: Date
): void {
  if (now < stayStart || now >= stayEnd) {
    throw new ConflictException("Check-in is only allowed during the booked stay period");
  }
}

export function assertHomestayGuestRosterComplete(declaredGuests: number, verifiedGuests: number): void {
  if (verifiedGuests < declaredGuests) {
    throw new ConflictException("Every declared guest must be registered and verified before check-in");
  }
}

export function turnoverLockEnd(now: Date, nextOccupancyStart: Date | null): Date | null {
  if (nextOccupancyStart && nextOccupancyStart.getTime() <= now.getTime()) return null;
  return nextOccupancyStart ?? new Date(now.getTime() + 365 * 24 * 60 * 60_000);
}
