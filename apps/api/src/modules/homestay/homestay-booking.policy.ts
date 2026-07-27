import { BadRequestException, ConflictException } from "@nestjs/common";

const BUSINESS_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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

export function assertHomestayGuestRegistrationOpen(status: string): void {
  if (!["draft", "confirmed", "checked_in"].includes(status)) {
    throw new ConflictException("Guest registration is closed for this booking");
  }
}

export function turnoverLockEnd(now: Date, nextOccupancyStart: Date | null): Date | null {
  if (nextOccupancyStart && nextOccupancyStart.getTime() <= now.getTime()) return null;
  return nextOccupancyStart ?? new Date(now.getTime() + 365 * 24 * 60 * 60_000);
}

export function assertBusinessDate(value: string, fieldName: string): void {
  if (!BUSINESS_DATE_PATTERN.test(value)) {
    throw new BadRequestException(`${fieldName} must be a valid YYYY-MM-DD date`);
  }
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) {
    throw new BadRequestException(`${fieldName} must be a valid YYYY-MM-DD date`);
  }
}

export function assertHomestayGuestIdentityVerified(
  requestedStatus: "unverified" | "verified" | "rejected",
  party: {
    verificationStatus: string;
    identityDocumentType: string | null;
    identityNumberHash: string | null;
  }
): void {
  if (
    requestedStatus === "verified"
    && (
      party.verificationStatus !== "verified"
      || !party.identityDocumentType
      || !party.identityNumberHash
    )
  ) {
    throw new BadRequestException("Guest identity must be verified with identity data before registration");
  }
}
