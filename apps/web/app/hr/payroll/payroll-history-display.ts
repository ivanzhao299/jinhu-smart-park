export interface PayrollHistoryDisplayItem {
  itemCode: string | null;
  valueType: string;
  isSourceNull: boolean;
  decimalValue: string | null;
  textValue: string | null;
  dateValue: string | null;
}

const NON_MONEY_SOURCE_CODES = new Map<string, string>([
  ["出勤天数", "天"],
  ["序号", ""],
] as const);

function decimalText(value: string | null) {
  if (value == null || !/^-?\d+(?:\.\d+)?$/.test(value)) return "—";
  return value.replace(/(\.\d*?)0+$/u, "$1").replace(/\.$/u, "");
}

/**
 * `itemCode` is the preserved `salaryitems.itemname` identifier. Do not use a
 * display label to infer a unit: a decimal storage type alone is not currency.
 */
export function formatPayrollHistoryItemValue(item: PayrollHistoryDisplayItem, formatMoney: (value: string | null) => string) {
  if (item.isSourceNull) return "源值为空";
  if (item.valueType !== "decimal") return item.textValue || item.dateValue || "—";
  const unit = item.itemCode == null ? undefined : NON_MONEY_SOURCE_CODES.get(item.itemCode.normalize("NFC").trim());
  if (unit === undefined) return formatMoney(item.decimalValue);
  const value = decimalText(item.decimalValue);
  return value === "—" ? value : unit ? `${value} ${unit}` : value;
}
