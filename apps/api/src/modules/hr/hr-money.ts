import { BadRequestException } from "@nestjs/common";

const MONEY_PATTERN = /^(0|[1-9]\d{0,15})(?:\.(\d{1,2}))?$/;

export function normalizeHrMoney(value: string, field = "amount"): string {
  const match = MONEY_PATTERN.exec(value);
  if (!match) {
    throw new BadRequestException(`${field} must be a non-negative decimal with at most 2 fraction digits`);
  }
  return `${match[1]}.${(match[2] ?? "").padEnd(2, "0")}`;
}

export function hrMoneyToCents(value: string, field = "amount"): bigint {
  const normalized = normalizeHrMoney(value, field);
  const [integer = "0", fraction = "00"] = normalized.split(".");
  return BigInt(integer) * 100n + BigInt(fraction);
}

export function hrCentsToMoney(value: bigint): string {
  if (value < 0n) throw new BadRequestException("amount cannot be negative");
  const integer = value / 100n;
  const fraction = (value % 100n).toString().padStart(2, "0");
  return `${integer}.${fraction}`;
}

export function addHrMoney(...values: string[]): string {
  return hrCentsToMoney(values.reduce((total, value) => total + hrMoneyToCents(value), 0n));
}
