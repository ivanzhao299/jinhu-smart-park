import type { HrInsuranceOwnedPeriodListItem } from "@jinhu/shared";
import { csvDocument } from "../../../../lib/scoped-csv-export";
const kinds = ["oldage", "remedy", "losework", "wound", "bear", "fund"] as const;
const kindLabels = ["养老基数", "医疗基数", "失业基数", "工伤基数", "生育基数", "公积金基数"] as const;
const decimal = /^(?:0|[1-9]\d{0,15})\.\d{2}$/u;
function strictCalculation(value: unknown) {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : null;
  const totals = source?.totals && typeof source.totals === "object" ? source.totals as Record<string, unknown> : null;
  if (!source || typeof source.includeFund !== "boolean" || !totals || !Array.isArray(source.items) || source.items.length !== kinds.length) throw new Error("现代社保期间金额投影不完整，无法导出。");
  const items = new Map<string, Record<string, unknown>>();
  for (const item of source.items) {
    if (!item || typeof item !== "object") throw new Error("现代社保期间险种投影不完整，无法导出。");
    const record = item as Record<string, unknown>, kind = record.insuranceKind;
    if (typeof kind !== "string" || items.has(kind)) throw new Error("现代社保期间险种投影不完整，无法导出。");
    items.set(kind, record);
  }
  if (items.size !== kinds.length || kinds.some(kind => !items.has(kind))) throw new Error("现代社保期间险种投影不完整，无法导出。");
  const bases = kinds.map(kind => items.get(kind)!.contributionBase);
  const exactTotals = [totals.base, totals.employer, totals.employee, totals.supplement];
  if (![...bases, ...exactTotals].every(amount => typeof amount === "string" && decimal.test(amount))) throw new Error("现代社保期间金额格式无效，无法导出。");
  return { bases: bases as string[], totals: exactTotals as string[], includeFund: source.includeFund };
}
/** Exact financial text only. Any incomplete calculation fails the entire live export. */
export function insuranceOwnedPeriodLedgerCsv(rows: readonly HrInsuranceOwnedPeriodListItem[]) {
  const headers = ["员工编号", "姓名", "所属月份", "版本", "关账状态", "版本范围", "公积金计入汇总", ...kindLabels, "政策合计", "单位缴费", "个人缴费", "补充缴费"];
  return csvDocument([headers, ...rows.map(row => {
    const calculation = strictCalculation(row.calculation);
    if (typeof row.employeeCode !== "string" || typeof row.fullName !== "string" || !/^(19\d{2}|20\d{2}|2100)-(0[1-9]|1[0-2])$/u.test(row.periodMonth) || !Number.isInteger(row.revisionNo) || row.revisionNo < 1 || !["confirmed", "closed"].includes(row.status) || typeof row.current !== "boolean") throw new Error("现代社保期间记录无效，无法导出。");
    return [row.employeeCode, row.fullName, row.periodMonth, row.revisionNo, row.status === "closed" ? "已关账" : "已确认", row.current ? "当前版本" : "历史版本", calculation.includeFund ? "计入汇总" : "不计入汇总", ...calculation.bases, ...calculation.totals];
  })]);
}
