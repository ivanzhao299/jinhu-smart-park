import { BadRequestException } from "@nestjs/common";
import type { PayrollTrialLine, PayrollTrialMapping } from "@jinhu/shared";
import type { calculateFormalPayrollWithSources } from "./hr-payroll-formal-source-calculation";
import { formatPayrollDecimal } from "./hr-payroll-formula-dsl";

type Calculation = ReturnType<typeof calculateFormalPayrollWithSources>["calculation"];
export type TrialSourceItem = { id: string; snapshotId: string; itemVersionId: string | null; name: string | null; valueType: string; isSourceNull: boolean; value: string | null; known: boolean };
function scaled(value: string): bigint {
  if (!/^-?\d{1,16}(?:\.\d{1,4})?$/u.test(value)) throw new BadRequestException("Invalid exact comparison decimal");
  const negative = value.startsWith("-"), [whole, fraction = ""] = (negative ? value.slice(1) : value).split(".");
  return (negative ? -1n : 1n) * (BigInt(whole!) * 10000n + BigInt(fraction.padEnd(4, "0")));
}
export function payrollTrialDifference(modern: string, source: string): string {
  return formatPayrollDecimal(scaled(modern) - scaled(source));
}
/** Keep every modern line and every unconsumed source line; identity is never a translated label. */
export function comparePayrollTrialItems(calculation: Calculation, mappings: PayrollTrialMapping[], source: TrialSourceItem[]): PayrollTrialLine[] {
  const codes = new Set(calculation.items.map(item => item.code));
  if (new Set(mappings.map(row => row.modernCode)).size !== mappings.length || new Set(mappings.map(row => row.sourceItemVersionId)).size !== mappings.length || mappings.some(row => !codes.has(row.modernCode))) {
    throw new BadRequestException("Mappings must use unique modern codes and unique source item versions from this rule");
  }
  const byCode = new Map(mappings.map(row => [row.modernCode, row.sourceItemVersionId]));
  const used = new Set<string>();
  const lines: PayrollTrialLine[] = calculation.items.map(item => {
    const id = byCode.get(item.code) ?? null;
    const matches = id ? source.filter(row => row.itemVersionId === id) : [];
    const old = matches.length === 1 ? matches[0]! : null;
    if (old) used.add(old.id);
    const modernValue = item.amount ?? item.decimalValue;
    const status = !id ? "unmapped" : !matches.length ? "missing_source" : matches.length > 1 ? "ambiguous_source" : !old!.known ? "unknown_source" : old!.isSourceNull ? "source_null" : old!.valueType !== "decimal" || old!.value === null ? "nonnumeric" : null;
    const difference = status === null ? payrollTrialDifference(modernValue, old!.value!) : null;
    return { modernCode: item.code, role: item.role, sourceItemVersionId: id, sourceItemId: old?.id ?? null, sourceName: old?.name ?? null,
      modernValue, sourceValue: old?.value ?? null, difference, status: status ?? (difference === "0.0000" ? "equal" : "different") };
  });
  for (const old of source) if (!used.has(old.id)) lines.push({ modernCode: null, role: null, sourceItemVersionId: old.itemVersionId, sourceItemId: old.id,
    sourceName: old.name, modernValue: null, sourceValue: old.value, difference: null, status: old.known ? "source_only" : "unknown_source" });
  return lines;
}
