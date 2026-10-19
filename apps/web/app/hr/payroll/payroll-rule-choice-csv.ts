import { FORMAL_PAYROLL_ROLES, type FormalPayrollRole, type FormalPayrollSourceReference } from "@jinhu/shared";
import { csvDocument } from "../../../lib/scoped-csv-export";
import { parsePayrollInputCsv, PAYROLL_INPUT_CSV_MAX_BYTES } from "./payroll-input-csv";
import { payrollBookLabel } from "./payroll-book-label";

export type Choice = { included: boolean; role: FormalPayrollRole | ""; source: "" | "direct" | "formula" | "rewrite"; formulaId: string; rewrite: string };
export type RuleChoices = Record<string, Choice>;
export const blankRuleChoice = (): Choice => ({ included: false, role: "", source: "", formulaId: "", rewrite: "" });
export const payrollRoleLabels: Record<FormalPayrollRole, string> = { earning: "收入", gross_reduction: "应发扣减", deduction: "扣款", tax: "税额", gross: "应发汇总", net: "实发汇总", employer_contribution: "单位承担", informational: "参考数量" };
export const payrollSourceLabels = { direct: "直接录入", formula: "原公式", rewrite: "人工改写" };
const check = (value: unknown, message: string): void => { if (!value) throw new Error(message); };
const text = (value: unknown) => value == null ? "" : String(value);
const protect = (value: string) => value ? `'${value}` : "";
const matches = (cell: string | undefined, value: unknown) => cell === text(value) || cell === protect(text(value));
const unwrap = (value: string) => value.startsWith("'") ? value.slice(1) : value;
const headers = ["序号（勿改）", "项目代码（勿改）", "项目名称（勿改）", "项目版本（勿改）", "状态（勿改）", "类型（勿改）", "原项目名（勿改）", "原类别（勿改）", "原类型（勿改）", "原增减（勿改）", "原顺序（勿改）", "小数位（勿改）", "全部原公式及条件（勿改）", "选择（纳入/排除；空白保留）", "用途", "数值来源", "原公式编号", "原公式版本", "改写公式"];
const readonlyCells = (reference: FormalPayrollSourceReference, index: number): unknown[] => {
  const item = reference.items[index]!;
  return [index + 1, item.code, item.displayName, item.versionNo, item.enabled ? "启用" : "禁用", item.valueType,
    item.legacyName, item.category, item.legacyItemType, item.legacyAddOrSub, item.sortNo, item.decimalScale,
    JSON.stringify(reference.formulas.filter(formula => formula.itemVersionId === item.id).map(formula => ({
      编号: formula.legacyFormulaId, 版本: formula.versionNo, 顺序: formula.calculationOrder,
      原公式: formula.expression, 原条件: formula.condition, 可复用语法: formula.reusableSyntax, 提示: formula.syntaxReason,
    })))];
};
async function binding(reference: FormalPayrollSourceReference): Promise<string> {
  check(reference.items.length > 0 && reference.items.length <= 4093 && new Set(reference.items.map(item => item.id)).size === reference.items.length,
    "源项目集合无效或超过选择表限制，请重新读取源资料。");
  check(globalThis.crypto?.subtle, "当前浏览器不支持选择表校验，请使用安全浏览器。");
  const hash = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(reference)));
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
}
/** Match the source API: whitespace-only original conditions are absent, but retain raw evidence. */
export const canReuseRuleSourceFormula = (formula: FormalPayrollSourceReference["formulas"][number]): boolean =>
  formula.reusableSyntax && !formula.condition?.trim();

export function validRuleChoice(reference: FormalPayrollSourceReference, itemId: string, choice: Choice): boolean {
  const item = reference.items.find(value => value.id === itemId);
  return !!item?.enabled && item.valueType === "decimal" && FORMAL_PAYROLL_ROLES.includes(choice.role as FormalPayrollRole)
    && (choice.source === "direct" && !choice.formulaId && !choice.rewrite
      || choice.source === "rewrite" && !choice.formulaId && !!choice.rewrite.trim() && choice.rewrite.length <= 2000
      || choice.source === "formula" && !choice.rewrite && reference.formulas.some(formula => formula.id === choice.formulaId
        && formula.itemVersionId === itemId && canReuseRuleSourceFormula(formula)));
}
/** Full reference SHA includes rule/book identities, all item versions, orphan formulas and conditions. */
export async function payrollRuleChoiceCsv(reference: FormalPayrollSourceReference, choices: RuleChoices): Promise<string> {
  const digest = await binding(reference);
  return csvDocument([
    ["工资规则选择表", "1", protect(digest)], ["关联账套", protect(payrollBookLabel(reference.book))], headers,
    ...reference.items.map((item, index) => {
      const stored = choices[item.id], choice = stored?.included ? stored : blankRuleChoice();
      const formula = reference.formulas.find(value => value.id === choice.formulaId && value.itemVersionId === item.id);
      return [...readonlyCells(reference, index).map(value => protect(text(value))), choice.included ? "纳入" : "排除",
        choice.role ? payrollRoleLabels[choice.role] : "", choice.source ? payrollSourceLabels[choice.source] : "",
        formula ? protect(text(formula.legacyFormulaId)) : "", formula ? protect(text(formula.versionNo)) : "", protect(choice.rewrite)];
    }),
  ]);
}
export type RuleChoicePreview = { choices: RuleChoices; changes: Array<{ index: number; before: Choice; after: Choice }> };
export async function previewPayrollRuleChoiceCsv(content: string, reference: FormalPayrollSourceReference, previous: RuleChoices): Promise<RuleChoicePreview> {
  const records = parsePayrollInputCsv(content, { maxCellLength: PAYROLL_INPUT_CSV_MAX_BYTES }), digest = await binding(reference);
  const row = (index: number, length: number) => {
    const value = records[index];
    check(value && value.length >= length && value.length <= headers.length && value.slice(length).every(cell => !cell), "选择表列数或表头无效。");
    return value!.slice(0, length);
  };
  check(records.length === reference.items.length + 3, "选择表必须保留全部项目版本，不能缺行或多行。");
  const format = row(0, 3), book = row(1, 2);
  check(format[0] === "工资规则选择表" && format[1] === "1" && matches(format[2], digest)
    && book[0] === "关联账套" && matches(book[1], payrollBookLabel(reference.book)), "选择表与当前规则、账套或完整源资料不一致，请重新导出。");
  check(JSON.stringify(row(2, headers.length)) === JSON.stringify(headers), "选择表表头已变化，请保留原表头。");
  const choices: RuleChoices = {}, seen = new Set<number>();
  for (let offset = 3; offset < records.length; offset++) {
    const cells = row(offset, headers.length), index = Number(unwrap(cells[0]!)) - 1, item = reference.items[index];
    check(item && Number.isInteger(index) && !seen.has(index), "选择表包含外来、无效或重复项目。");
    seen.add(index);
    check(readonlyCells(reference, index).every((value, column) => matches(cells[column], value)), `第 ${offset + 1} 行只读源资料已变化。`);
    const [selection, role, source, number, version, rewrite] = cells.slice(13).map(unwrap);
    if (!selection) {
      check(!role && !source && !number && !version && !rewrite, "空白保留行不得夹带用途或公式，请明确纳入或排除。");
      choices[item!.id] = { ...(previous[item!.id] ?? blankRuleChoice()) }; continue;
    }
    check(selection === "纳入" || selection === "排除", "请明确填写纳入或排除，空白只保留当前选择。");
    if (selection === "排除") {
      check(!role && !source && !number && !version && !rewrite, "排除行不得夹带用途或公式。");
      choices[item!.id] = blankRuleChoice(); continue;
    }
    const modernRole = FORMAL_PAYROLL_ROLES.find(value => payrollRoleLabels[value] === role);
    const modernSource = (Object.keys(payrollSourceLabels) as Array<keyof typeof payrollSourceLabels>).find(value => payrollSourceLabels[value] === source);
    const formula = reference.formulas.filter(value => value.itemVersionId === item!.id && text(value.legacyFormulaId) === number && text(value.versionNo) === version);
    const choice: Choice = { included: true, role: modernRole ?? "", source: modernSource ?? "", formulaId: modernSource === "formula" && formula.length === 1 ? formula[0]!.id : "", rewrite: rewrite! };
    check(modernSource === "formula" ? !!number && !!version : !number && !version, "原公式须填写精确编号及版本，其他来源不得夹带公式版本。");
    check(validRuleChoice(reference, item!.id, choice), `第 ${offset + 1} 行用途、数值来源、公式版本或可选状态无效；原条件必须人工处理，改写最多 2000 字。`);
    choices[item!.id] = choice;
  }
  const selected = reference.items.filter(item => choices[item.id]?.included);
  check(selected.every(item => validRuleChoice(reference, item.id, choices[item.id]!)), "保留的纳入项目尚未完成用途、来源或公式，请补全后再预览。");
  check(selected.length <= 256 && new Set(selected.map(item => item.code)).size === selected.length, "纳入项目最多 256 个，同一代码只能选择一个版本。");
  return { choices, changes: reference.items.flatMap((item, index) => {
    const before = previous[item.id] ?? blankRuleChoice(), after = choices[item.id]!;
    return JSON.stringify(before) === JSON.stringify(after) ? [] : [{ index, before, after }];
  }) };
}
export function ruleChoiceSummary(reference: FormalPayrollSourceReference, choice: Choice): string {
  if (!choice.included) return "排除";
  const formula = reference.formulas.find(value => value.id === choice.formulaId);
  return `纳入 · ${choice.role ? payrollRoleLabels[choice.role] : "用途未选"} · ${choice.source ? payrollSourceLabels[choice.source] : "来源未选"}${formula ? ` · 原公式 ${formula.legacyFormulaId} 第 ${formula.versionNo} 版` : ""}${choice.rewrite ? ` · ${choice.rewrite}` : ""}`;
}
