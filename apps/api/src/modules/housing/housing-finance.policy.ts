import { BadRequestException, ConflictException } from "@nestjs/common";
import type { HousingLeaseStatus, HousingLedgerEntryType } from "@jinhu/shared";

export interface HousingFinancialEntry {
  entryType: HousingLedgerEntryType;
  amount: string | number;
}

export interface HousingPurchaseAmountInput {
  quantity: string;
  unitPrice: string;
}

const MAX_HOUSING_MONEY_CENTS = 999_999_999_999_999_999n;

export function calculateHousingMeterCharge(
  openingReading: number,
  closingReading: number,
  multiplier: number,
  unitPrice: number
) {
  if (closingReading < openingReading) {
    throw new BadRequestException("Closing reading cannot be less than opening reading");
  }
  if (!Number.isFinite(multiplier) || multiplier <= 0) {
    throw new BadRequestException("Energy meter multiplier must be greater than zero");
  }
  const usageAmount = (closingReading - openingReading) * multiplier;
  return {
    usageAmount,
    amount: usageAmount * unitPrice
  };
}

function parseScaledDecimal(value: string | number, scale: number): bigint {
  const match = value.toString().match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if (!match) throw new BadRequestException("Invalid purchase decimal");
  const sign = match[1] === "-" ? -1n : 1n;
  const fraction = match[3] ?? "";
  const digits = BigInt(`${match[2]}${fraction}`);
  const shift = scale - fraction.length;
  if (shift >= 0) return sign * digits * (10n ** BigInt(shift));
  const divisor = 10n ** BigInt(-shift);
  const quotient = digits / divisor;
  const remainder = digits % divisor;
  const rounded = remainder * 2n >= divisor ? quotient + 1n : quotient;
  return sign * rounded;
}

function formatCents(value: bigint): string {
  const sign = value < 0n ? "-" : "";
  const absolute = value < 0n ? -value : value;
  const integerPart = absolute / 100n;
  const fractionPart = (absolute % 100n).toString().padStart(2, "0");
  return `${sign}${integerPart}.${fractionPart}`;
}

export function formatHousingMoney(value: string | number): string {
  return formatCents(parseScaledDecimal(value, 2));
}

export function addHousingMoneyAmounts(values: Array<string | number>): string {
  const total = values.reduce((sum, value) => sum + parseScaledDecimal(value, 2), 0n);
  if (total > MAX_HOUSING_MONEY_CENTS || total < -MAX_HOUSING_MONEY_CENTS) {
    throw new BadRequestException("Housing money amount exceeds numeric(18,2)");
  }
  return formatCents(total);
}

export function calculateHousingMoneyBalance(
  additions: Array<string | number>,
  deductions: Array<string | number> = []
): string {
  const total = additions.reduce((sum, value) => sum + parseScaledDecimal(value, 2), 0n)
    - deductions.reduce((sum, value) => sum + parseScaledDecimal(value, 2), 0n);
  if (total > MAX_HOUSING_MONEY_CENTS || total < -MAX_HOUSING_MONEY_CENTS) {
    throw new BadRequestException("Housing money amount exceeds numeric(18,2)");
  }
  return formatCents(total);
}

export function compareHousingMoney(left: string | number, right: string | number): number {
  const leftCents = parseScaledDecimal(left, 2);
  const rightCents = parseScaledDecimal(right, 2);
  return leftCents < rightCents ? -1 : leftCents > rightCents ? 1 : 0;
}

export function multiplyHousingMoneyByRatio(
  value: string | number,
  numerator: bigint,
  denominator: bigint
): string {
  if (numerator < 0n || denominator <= 0n) {
    throw new BadRequestException("Housing money ratio must be non-negative with a positive denominator");
  }
  const product = parseScaledDecimal(value, 2) * numerator;
  const quotient = product / denominator;
  const remainder = product % denominator;
  const rounded = remainder * 2n >= denominator ? quotient + 1n : quotient;
  if (rounded > MAX_HOUSING_MONEY_CENTS || rounded < -MAX_HOUSING_MONEY_CENTS) {
    throw new BadRequestException("Housing money amount exceeds numeric(18,2)");
  }
  return formatCents(rounded);
}

export function housingReceivableStatus(
  amount: string | number,
  paidAmount: string | number,
  waivedAmount: string | number
) {
  const amountCents = parseScaledDecimal(amount, 2);
  const paidCents = parseScaledDecimal(paidAmount, 2);
  const waivedCents = parseScaledDecimal(waivedAmount, 2);
  const settledCents = paidCents + waivedCents;
  return settledCents >= amountCents
    ? (paidCents === 0n ? "waived" as const : "paid" as const)
    : settledCents > 0n ? "partial" as const : "unpaid" as const;
}

export function calculateHousingPurchaseAmounts(items: HousingPurchaseAmountInput[]) {
  const lineAmountCents = items.map((item) => {
    const quantityThousandths = parseScaledDecimal(item.quantity, 3);
    const unitPriceCents = parseScaledDecimal(item.unitPrice, 2);
    const amount = (quantityThousandths * unitPriceCents + 500n) / 1_000n;
    if (amount > MAX_HOUSING_MONEY_CENTS || amount < -MAX_HOUSING_MONEY_CENTS) {
      throw new BadRequestException("Purchase line amount exceeds numeric(18,2)");
    }
    return amount;
  });
  const totalAmountCents = lineAmountCents.reduce((total, amount) => total + amount, 0n);
  if (totalAmountCents > MAX_HOUSING_MONEY_CENTS || totalAmountCents < -MAX_HOUSING_MONEY_CENTS) {
    throw new BadRequestException("Purchase total amount exceeds numeric(18,2)");
  }
  return {
    lineAmounts: lineAmountCents.map(formatCents),
    totalAmount: formatCents(totalAmountCents)
  };
}

export function assertHousingPurchaseTransferLeaseStatus(status: HousingLeaseStatus): void {
  if (!["active", "expiring", "checkout_pending"].includes(status)) {
    throw new ConflictException("Purchase recharge requires an active housing lease");
  }
}

export function calculateHousingDepositBalance(entries: HousingFinancialEntry[]): string {
  return calculateHousingMoneyBalance(
    entries.filter((entry) => entry.entryType === "deposit_receipt").map((entry) => entry.amount),
    entries
      .filter((entry) => ["deposit_deduction", "deposit_refund"].includes(entry.entryType))
      .map((entry) => entry.amount)
  );
}

export function assertHousingDepositMutation(
  agreedDeposit: string | number,
  currentDeposit: string | number,
  entryType: HousingLedgerEntryType,
  amount: string | number
): string {
  if (!entryType.startsWith("deposit_")) throw new BadRequestException("Entry is not a deposit mutation");
  const nextDeposit = entryType === "deposit_receipt"
    ? calculateHousingMoneyBalance([currentDeposit, amount])
    : calculateHousingMoneyBalance([currentDeposit], [amount]);
  if (compareHousingMoney(nextDeposit, "0.00") < 0) {
    throw new ConflictException("Deposit deduction or refund exceeds current deposit balance");
  }
  if (compareHousingMoney(nextDeposit, agreedDeposit) > 0) {
    throw new ConflictException("Deposit receipt exceeds agreed deposit amount");
  }
  return nextDeposit;
}

export function applyHousingReceivableMutation(
  receivableAmount: string | number,
  currentPaid: string | number,
  currentWaived: string | number,
  entryType: HousingLedgerEntryType,
  entryAmount: string | number
) {
  let paid = formatHousingMoney(currentPaid);
  let waived = formatHousingMoney(currentWaived);
  if (entryType === "payment") paid = calculateHousingMoneyBalance([paid, entryAmount]);
  else if (entryType === "refund") paid = calculateHousingMoneyBalance([paid], [entryAmount]);
  else if (entryType === "waiver") waived = calculateHousingMoneyBalance([waived, entryAmount]);
  else throw new BadRequestException("Entry does not settle a receivable");
  if (
    compareHousingMoney(paid, "0.00") < 0
    || compareHousingMoney(waived, "0.00") < 0
    || compareHousingMoney(calculateHousingMoneyBalance([paid, waived]), receivableAmount) > 0
  ) {
    throw new ConflictException("Financial entry exceeds receivable balance");
  }
  const settled = calculateHousingMoneyBalance([paid, waived]);
  return {
    paidAmount: paid,
    waivedAmount: waived,
    status: compareHousingMoney(settled, receivableAmount) >= 0
      ? (compareHousingMoney(paid, "0.00") === 0 ? "waived" as const : "paid" as const)
      : compareHousingMoney(settled, "0.00") > 0 ? "partial" as const : "unpaid" as const
  };
}
