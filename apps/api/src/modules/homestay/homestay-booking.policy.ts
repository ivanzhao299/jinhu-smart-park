import { BadRequestException, ConflictException } from "@nestjs/common";

const BUSINESS_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_HOMESTAY_MONEY_CENTS = 999_999_999_999_999_999n;

export function toMoneyCents(value: string | number): bigint {
  const match = value.toString().match(/^(-?)(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) throw new BadRequestException("Invalid homestay money amount");
  const fraction = (match[3] ?? "").padEnd(2, "0");
  const cents = BigInt(match[2]!) * 100n + BigInt(fraction || "0");
  return match[1] === "-" ? -cents : cents;
}

export function formatMoneyCents(value: bigint): string {
  const sign = value < 0n ? "-" : "";
  const absolute = value < 0n ? -value : value;
  return `${sign}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, "0")}`;
}

export function formatHomestayMoney(value: string | number): string {
  return formatMoneyCents(toMoneyCents(value));
}

export function assertHomestayMoneyFitsNumeric(value: bigint, fieldName: string): bigint {
  if (value > MAX_HOMESTAY_MONEY_CENTS || value < -MAX_HOMESTAY_MONEY_CENTS) {
    throw new BadRequestException(`${fieldName} exceeds numeric(18,2)`);
  }
  return value;
}

export function homestayMoneyDifference(currentValue: string | number, previousValue: string | number): string {
  return formatMoneyCents(
    assertHomestayMoneyFitsNumeric(
      toMoneyCents(currentValue) - toMoneyCents(previousValue),
      "Homestay money difference"
    )
  );
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

export function assertHomestayNoShowWindow(now: Date, stayStart: Date): void {
  if (now < stayStart) {
    throw new ConflictException("No-show is only allowed on or after the booked arrival date");
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

export function isBusinessDate(value: string): boolean {
  if (!BUSINESS_DATE_PATTERN.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return !(
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  );
}

export function assertBusinessDate(value: string, fieldName: string): void {
  if (!isBusinessDate(value)) {
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
