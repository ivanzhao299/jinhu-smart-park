import { ConflictException } from "@nestjs/common";

export interface HomestayFinancialEntry {
  entryType: "charge" | "payment" | "refund" | "waiver";
  chargeType: string;
  amount: string | number;
  status: "registered" | "confirmed" | "void";
}

export interface HomestayLedgerSummary {
  charges: number;
  payments: number;
  refunds: number;
  waivers: number;
  balance: number;
}

export function summarizeHomestayLedger(entries: HomestayFinancialEntry[]): HomestayLedgerSummary {
  const totals = { charges: 0, payments: 0, refunds: 0, waivers: 0, balance: 0 };
  for (const entry of entries) {
    if (entry.status !== "confirmed") continue;
    const amount = Number(entry.amount);
    if (entry.entryType === "charge") totals.charges += amount;
    if (entry.entryType === "payment") totals.payments += amount;
    if (entry.entryType === "refund") totals.refunds += amount;
    if (entry.entryType === "waiver") totals.waivers += amount;
  }
  totals.balance = totals.charges - totals.payments + totals.refunds - totals.waivers;
  return totals;
}

export function formatHomestayLedgerSummary(entries: HomestayFinancialEntry[]) {
  return Object.fromEntries(
    Object.entries(summarizeHomestayLedger(entries)).map(([key, value]) => [key, value.toFixed(2)])
  );
}

export function assertHomestayManualLedgerMutation(
  entryType: "charge" | "payment" | "refund" | "waiver",
  amount: number,
  summary: HomestayLedgerSummary
): void {
  if (entryType === "payment" && amount > Math.max(0, summary.balance) + 0.005) {
    throw new ConflictException("Payment exceeds current outstanding balance");
  }
  if (entryType === "refund" && amount > summary.payments - summary.refunds + 0.005) {
    throw new ConflictException("Refund exceeds net confirmed payments");
  }
  if (entryType === "waiver" && amount > Math.max(0, summary.balance) + 0.005) {
    throw new ConflictException("Waiver exceeds current outstanding balance");
  }
}

export function calculateCancellableRoomCharge(entries: HomestayFinancialEntry[]): number {
  return Math.max(0, entries.reduce((amount, entry) => {
    if (entry.status !== "confirmed") return amount;
    if (entry.entryType === "charge" && ["room", "reschedule_increase"].includes(entry.chargeType)) {
      return amount + Number(entry.amount);
    }
    if (
      entry.entryType === "waiver"
      && ["room", "reschedule_decrease", "room_cancellation"].includes(entry.chargeType)
    ) {
      return amount - Number(entry.amount);
    }
    return amount;
  }, 0));
}
