import type { FormalPayrollSourceReference } from "@jinhu/shared";
import { csvDocument } from "../../../lib/scoped-csv-export";
import { payrollBookLabel } from "./payroll-book-label";

/** Complete authorized reference, independent of the visible page/selection. */
export function payrollSourceReviewCsv(reference: FormalPayrollSourceReference): string {
  const rows: unknown[][] = [["账套", "记录类型", "项目代码", "项目名称", "项目版本", "项目状态", "项目类型", "原项目名",
    "原类别", "原类型", "原增减标记", "原顺序", "小数位数", "公式编号", "公式版本", "计算顺序", "公式原文", "原条件",
    "公式处理提示", "拟定用途（待确认）", "数值来源（待确认）", "现行公式和条件（待确认）", "税/考勤/社保口径（待确认）",
    "舍入和汇总口径（待确认）", "核对人", "核对结论"]];
  const book = payrollBookLabel(reference.book), itemIds = new Set(reference.items.map(item => item.id));
  const formulaCells = (formula: FormalPayrollSourceReference["formulas"][number] | undefined) => formula
    ? [formula.legacyFormulaId, formula.versionNo, formula.calculationOrder, formula.expression, formula.condition,
      formula.reusableSyntax ? "无条件语法可复用，业务口径待确认" : "需人工改写并复核"]
    : ["", "", "", "", "", "没有关联到此项目版本的原公式"];
  for (const item of reference.items) {
    const formulas = reference.formulas.filter(formula => formula.itemVersionId === item.id);
    for (const formula of formulas.length ? formulas : [undefined]) rows.push([book, formula ? "项目与关联公式" : "项目（无关联公式）",
      item.code, item.displayName, item.versionNo, item.enabled ? "启用" : "禁用",
      { decimal: "数值", text: "文本", date: "日期" }[item.valueType] ?? "原类型未知", item.legacyName,
      item.category, item.legacyItemType, item.legacyAddOrSub, item.sortNo, item.decimalScale,
      ...formulaCells(formula), "", "", "", "", "", "", ""]);
  }
  for (const formula of reference.formulas) if (!formula.itemVersionId || !itemIds.has(formula.itemVersionId)) rows.push([
    book, "未关联项目的公式", "", "", "", "", "", "", "", "", "", "", "", ...formulaCells(formula), "", "", "", "", "", "", ""]);
  return csvDocument(rows);
}
