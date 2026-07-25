import { BadRequestException, ConflictException } from "@nestjs/common";
import type { HousingLedgerEntryType } from "@jinhu/shared";

export interface HousingFinancialEntry {
  entryType: HousingLedgerEntryType;
  amount: string | number;
}

export interface HousingPurchaseAmountInput {
  quantity: number;
  unitPrice: number;
}

export function calculateHousingPurchaseAmounts(items: HousingPurchaseAmountInput[]) {
  const lineAmounts = items.map((item) => Math.round(item.quantity * item.unitPrice * 100) / 100);
  return {
    lineAmounts,
    totalAmount: lineAmounts.reduce((total, amount) => total + Math.round(amount * 100), 0) / 100
  };
}

export function calculateHousingDepositBalance(entries: HousingFinancialEntry[]): number {
  return entries.reduce((balance, entry) => {
    if (entry.entryType === "deposit_receipt") return balance + Number(entry.amount);
    if (["deposit_deduction", "deposit_refund"].includes(entry.entryType)) return balance - Number(entry.amount);
    return balance;
  }, 0);
}

export function assertHousingDepositMutation(
  agreedDeposit: number,
  currentDeposit: number,
  entryType: HousingLedgerEntryType,
  amount: number
): number {
  if (!entryType.startsWith("deposit_")) throw new BadRequestException("Entry is not a deposit mutation");
  const nextDeposit = entryType === "deposit_receipt"
    ? currentDeposit + amount
    : currentDeposit - amount;
  if (nextDeposit < -0.005) throw new ConflictException("Deposit deduction or refund exceeds current deposit balance");
  if (nextDeposit > agreedDeposit + 0.005) throw new ConflictException("Deposit receipt exceeds agreed deposit amount");
  return Math.max(0, nextDeposit);
}

export function applyHousingReceivableMutation(
  receivableAmount: number,
  currentPaid: number,
  currentWaived: number,
  entryType: HousingLedgerEntryType,
  entryAmount: number
) {
  let paid = currentPaid;
  let waived = currentWaived;
  if (entryType === "payment") paid += entryAmount;
  else if (entryType === "refund") paid -= entryAmount;
  else if (entryType === "waiver") waived += entryAmount;
  else throw new BadRequestException("Entry does not settle a receivable");
  if (paid < -0.005 || waived < -0.005 || paid + waived > receivableAmount + 0.005) {
    throw new ConflictException("Financial entry exceeds receivable balance");
  }
  const settled = paid + waived;
  return {
    paidAmount: Math.max(0, paid),
    waivedAmount: Math.max(0, waived),
    status: settled >= receivableAmount - 0.005
      ? (paid <= 0.005 ? "waived" as const : "paid" as const)
      : settled > 0.005 ? "partial" as const : "unpaid" as const
  };
}
