import { ConflictException } from "@nestjs/common";
import { formatMoneyCents, toMoneyCents } from "./homestay-booking.policy";

export interface HomestayFinancialEntry {
  entryType: "charge" | "payment" | "refund" | "waiver";
  chargeType: string;
  amount: string | number;
  status: "registered" | "confirmed" | "void";
}

export interface HomestayLedgerSummary {
  charges: string;
  payments: string;
  refunds: string;
  waivers: string;
  balance: string;
}

export type HomestayBookingFinancialStatus =
  | "draft"
  | "confirmed"
  | "checked_in"
  | "checked_out"
  | "cancelled"
  | "no_show";

export function assertHomestayLedgerEntryAllowedForBookingStatus(
  bookingStatus: HomestayBookingFinancialStatus,
  entryType: "charge" | "payment" | "refund" | "waiver"
): void {
  const allowed = bookingStatus === "confirmed" || bookingStatus === "checked_in"
    ? ["charge", "payment", "refund", "waiver"]
    : bookingStatus === "checked_out"
      ? ["payment", "refund", "waiver"]
      : bookingStatus === "cancelled" || bookingStatus === "no_show"
        ? ["refund", "waiver"]
        : [];
  if (!allowed.includes(entryType)) {
    throw new ConflictException("Ledger entry is not allowed for current booking status");
  }
}

export function summarizeHomestayLedger(entries: HomestayFinancialEntry[]): HomestayLedgerSummary {
  const totals = { charges: 0n, payments: 0n, refunds: 0n, waivers: 0n };
  for (const entry of entries) {
    if (entry.status !== "confirmed") continue;
    const amount = toMoneyCents(entry.amount);
    if (entry.entryType === "charge") totals.charges += amount;
    if (entry.entryType === "payment") totals.payments += amount;
    if (entry.entryType === "refund") totals.refunds += amount;
    if (entry.entryType === "waiver") totals.waivers += amount;
  }
  return {
    charges: formatMoneyCents(totals.charges),
    payments: formatMoneyCents(totals.payments),
    refunds: formatMoneyCents(totals.refunds),
    waivers: formatMoneyCents(totals.waivers),
    balance: formatMoneyCents(totals.charges - totals.payments + totals.refunds - totals.waivers)
  };
}

export function formatHomestayLedgerSummary(entries: HomestayFinancialEntry[]) {
  return summarizeHomestayLedger(entries);
}

export function assertHomestayManualLedgerMutation(
  entryType: "charge" | "payment" | "refund" | "waiver",
  amount: string | number,
  summary: HomestayLedgerSummary
): void {
  const amountCents = toMoneyCents(amount);
  const balanceCents = toMoneyCents(summary.balance);
  if (entryType === "payment" && amountCents > (balanceCents > 0n ? balanceCents : 0n)) {
    throw new ConflictException("Payment exceeds current outstanding balance");
  }
  if (entryType === "refund" && amountCents > toMoneyCents(summary.payments) - toMoneyCents(summary.refunds)) {
    throw new ConflictException("Refund exceeds net confirmed payments");
  }
  if (entryType === "waiver" && amountCents > (balanceCents > 0n ? balanceCents : 0n)) {
    throw new ConflictException("Waiver exceeds current outstanding balance");
  }
}

export function calculateCancellableRoomCharge(entries: HomestayFinancialEntry[]): string {
  const amount = entries.reduce((total, entry) => {
    if (entry.status !== "confirmed") return total;
    if (entry.entryType === "charge" && ["room", "reschedule_increase"].includes(entry.chargeType)) {
      return total + toMoneyCents(entry.amount);
    }
    if (
      entry.entryType === "waiver"
      && ["room", "reschedule_decrease", "room_cancellation"].includes(entry.chargeType)
    ) {
      return total - toMoneyCents(entry.amount);
    }
    return total;
  }, 0n);
  return formatMoneyCents(amount > 0n ? amount : 0n);
}
