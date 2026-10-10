import type { HrInsuranceOwnedCalculation, HrInsuranceOwnedKind } from "@jinhu/shared";

export const insuranceKinds = ["oldage", "remedy", "losework", "wound", "bear", "fund"] as const satisfies readonly HrInsuranceOwnedKind[];
const basePattern = /^\d{1,16}(?:\.\d{1,2})?$/u;
export const insuranceKindLabels: Record<HrInsuranceOwnedKind, string> = { oldage: "养老保险", remedy: "医疗保险", losework: "失业保险", wound: "工伤保险", bear: "生育保险", fund: "住房公积金" };

export type CorrectionInputs = {
  bases: Partial<Record<HrInsuranceOwnedKind, string>>;
  fund: "include" | "exclude" | null;
  issues: string[];
};

export function isInsuranceContributionBase(value: unknown): value is string {
  return typeof value === "string" && basePattern.test(value);
}

/** Preserve only exact, unambiguous original inputs. Missing data remains an operator decision. */
export function correctionInputs(calculation: HrInsuranceOwnedCalculation): CorrectionInputs {
  const bases: Partial<Record<HrInsuranceOwnedKind, string>> = {};
  const issues: string[] = [];
  const seen = new Set<string>();
  const items: unknown[] = Array.isArray(calculation.items) ? calculation.items : [];
  if (!Array.isArray(calculation.items)) issues.push("原记录险种明细缺失，请人工填写。");
  for (const item of items) {
    const source = item && typeof item === "object" ? item as { insuranceKind?: unknown; contributionBase?: unknown } : {};
    const kind = typeof source.insuranceKind === "string" && insuranceKinds.includes(source.insuranceKind as HrInsuranceOwnedKind) ? source.insuranceKind as HrInsuranceOwnedKind : null;
    if (!kind) {
      issues.push("原记录含有无法识别的险种，不能沿用该项输入。");
      continue;
    }
    if (seen.has(kind)) {
      delete bases[kind];
      issues.push(`${insuranceKindLabels[kind]}原始基数重复，请人工确认。`);
      continue;
    }
    seen.add(kind);
    if (!isInsuranceContributionBase(source.contributionBase)) {
      issues.push(`${insuranceKindLabels[kind]}原始基数无效，请人工填写。`);
      continue;
    }
    bases[kind] = source.contributionBase;
  }
  for (const kind of insuranceKinds) if (!seen.has(kind)) issues.push(`${insuranceKindLabels[kind]}原始基数缺失，请人工填写。`);
  const fund = typeof calculation.includeFund === "boolean" ? calculation.includeFund ? "include" : "exclude" : null;
  if (!fund) issues.push("原记录未明确公积金是否计入汇总，请人工选择。");
  return { bases, fund, issues };
}
