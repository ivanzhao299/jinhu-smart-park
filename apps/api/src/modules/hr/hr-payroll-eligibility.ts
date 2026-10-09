import { BadRequestException } from "@nestjs/common";

function date(value: string): string {
  if (typeof value !== "string" || !/^(?:19\d{2}|20\d{2}|2100)-\d{2}-\d{2}$/u.test(value)) throw new BadRequestException("Invalid payroll eligibility date");
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new BadRequestException("Invalid payroll eligibility date");
  return value;
}

/** An exception supplies a reviewed settlement window, not a fabricated employment date. */
export function resolvePayrollEligibility(input: {
  periodStart: string; periodEnd: string; hireDate: string | null; departureDate: string | null;
  settlementStart?: string; settlementEnd?: string; eligibilityReason?: string;
}): { eligibleStart: string; eligibleEnd: string; basis: "employment_dates" | "explicit_settlement" } {
  const start = date(input.periodStart), end = date(input.periodEnd);
  if (start > end) throw new BadRequestException("Invalid payroll period range");
  if (input.settlementStart !== undefined || input.settlementEnd !== undefined) {
    if (!input.settlementStart || !input.settlementEnd || !input.eligibilityReason?.trim()) throw new BadRequestException("Explicit settlement requires both dates and a settlement reason");
    const eligibleStart = date(input.settlementStart), eligibleEnd = date(input.settlementEnd);
    if (eligibleStart < start || eligibleEnd > end || eligibleStart > eligibleEnd) throw new BadRequestException("Settlement window must be within the payroll period");
    return { eligibleStart, eligibleEnd, basis: "explicit_settlement" };
  }
  if (!input.hireDate) throw new BadRequestException("Unknown employment dates require an explicit settlement window and settlement reason");
  const hire = date(input.hireDate), departure = input.departureDate === null ? null : date(input.departureDate);
  if (departure !== null && departure < hire) throw new BadRequestException("Invalid employment date range");
  const eligibleStart = hire > start ? hire : start, eligibleEnd = departure !== null && departure < end ? departure : end;
  if (eligibleStart > eligibleEnd) throw new BadRequestException("Non-overlapping employment dates require an explicit settlement window and settlement reason");
  return { eligibleStart, eligibleEnd, basis: "employment_dates" };
}
