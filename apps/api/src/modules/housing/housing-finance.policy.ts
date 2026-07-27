import { BadRequestException, ConflictException } from "@nestjs/common";
import type { HousingLeaseStatus, HousingLedgerEntryType } from "@jinhu/shared";

export interface HousingFinancialEntry {
  entryType: HousingLedgerEntryType;
  amount: string | number;
}

export interface HousingPurchaseAmountInput {
  quantity: number;
  unitPrice: number;
}

function parseScaledDecimal(value: number, scale: number): bigint {
  const match = value.toString().toLowerCase().match(/^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/);
  if (!match) throw new BadRequestException("Invalid purchase decimal");
  const sign = match[1] === "-" ? -1n : 1n;
  const fraction = match[3] ?? "";
  const exponent = Number(match[4] ?? 0);
  const digits = BigInt(`${match[2]}${fraction}`);
  const shift = scale - (fraction.length - exponent);
  if (shift >= 0) return sign * digits * (10n ** BigInt(shift));
  const divisor = 10n ** BigInt(-shift);
  const quotient = digits / divisor;
  const remainder = digits % divisor;
  const rounded = remainder * 2n >= divisor ? quotient + 1n : quotient;
  return sign * rounded;
}

function formatCents(value: bigint): string {
  const integerPart = value / 100n;
  const fractionPart = (value % 100n).toString().padStart(2, "0");
  return `${integerPart}.${fractionPart}`;
}

export function calculateHousingPurchaseAmounts(items: HousingPurchaseAmountInput[]) {
  const lineAmountCents = items.map((item) => {
    const quantityThousandths = parseScaledDecimal(item.quantity, 3);
    const unitPriceCents = parseScaledDecimal(item.unitPrice, 2);
    return (quantityThousandths * unitPriceCents + 500n) / 1_000n;
  });
  return {
    lineAmounts: lineAmountCents.map(formatCents),
    totalAmount: formatCents(lineAmountCents.reduce((total, amount) => total + amount, 0n))
  };
}

export function assertHousingPurchaseTransferLeaseStatus(status: HousingLeaseStatus): void {
  if (!["active", "expiring", "checkout_pending"].includes(status)) {
    throw new ConflictException("Purchase recharge requires an active housing lease");
  }
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
