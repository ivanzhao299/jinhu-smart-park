import type { FormalPayrollEmployeeInput } from "@jinhu/shared";
import { csvDocument } from "../../../lib/scoped-csv-export";

export const PAYROLL_INPUT_CSV_MAX_BYTES = 32 * 1024 * 1024;
export const PAYROLL_INPUT_CSV_ACCEPT = ".csv,text/csv,application/csv,text/plain,application/vnd.ms-excel";
export type PayrollSheetEmployee = FormalPayrollEmployeeInput & { employeeCode: string | null; fullName: string | null };
export type PayrollSheetContext = { binding: string; month: string; ruleName: string; revisionLabel: string };
export type PayrollSheetPreview = {
  updates: Array<{ employeeId: string; directItems: Record<string, string> }>;
  changedEmployees: number; changedCells: number;
};
const decimal = /^-?\d{1,16}(?:\.\d{1,4})?$/u;
const requireCondition = (value: unknown, message: string): void => { if (!value) throw new Error(message); };
const forceText = (value: string) => value ? `'${value}` : "";
const sameText = (cell: string | undefined, value: string) => cell === value || cell === forceText(value);

export function validatePayrollInputCsvFile(file: Pick<File, "name" | "type" | "size">): void {
  requireCondition(/\.csv$/iu.test(file.name) && ["", "text/csv", "application/csv", "text/plain", "application/vnd.ms-excel"].includes(file.type), "请选择 UTF-8 CSV 文件。");
  requireCondition(file.size > 0 && file.size <= PAYROLL_INPUT_CSV_MAX_BYTES, "CSV 文件不能为空，且不能超过 32 MiB。");
}

export function decodePayrollInputCsv(bytes: ArrayBuffer): string {
  requireCondition(bytes.byteLength > 0 && bytes.byteLength <= PAYROLL_INPUT_CSV_MAX_BYTES, "CSV 文件不能为空，且不能超过 32 MiB。");
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { throw new Error("CSV 编码无效，请保存为 UTF-8 CSV 后重新选择。"); }
}

/** Bounded RFC4180 reader. Never evaluate cells or expose their contents in errors. */
export function parsePayrollInputCsv(text: string): string[][] {
  requireCondition(new TextEncoder().encode(text).byteLength <= PAYROLL_INPUT_CSV_MAX_BYTES, "CSV 文件不能超过 32 MiB。");
  const input = text.replace(/^\uFEFF/u, ""), records: string[][] = [];
  let record: string[] = [], cell = "", quoted = false, closed = false, touched = false;
  const field = () => { record.push(cell); cell = ""; closed = false; requireCondition(record.length <= 259, "CSV 列数超过限制。"); };
  const row = () => { field(); records.push(record); record = []; touched = false; requireCondition(records.length <= 4096, "CSV 行数超过限制。"); };
  for (let index = 0; index < input.length; index++) {
    const char = input[index]!;
    requireCondition(char !== "\0", "CSV 格式无效，请重新保存为 UTF-8 CSV。");
    if (quoted) {
      if (char === '"') { if (input[index + 1] === '"') { cell += '"'; index++; } else { quoted = false; closed = true; } }
      else cell += char;
    } else if (char === ",") { field(); touched = true; }
    else if (char === "\r" || char === "\n") { row(); if (char === "\r" && input[index + 1] === "\n") index++; }
    else if (char === '"' && !cell && !closed) { quoted = true; touched = true; }
    else { requireCondition(!closed && char !== '"', "CSV 引号或分隔格式无效。"); cell += char; touched = true; }
    requireCondition(cell.length <= 1024, "CSV 单元格内容过长。");
  }
  requireCondition(!quoted, "CSV 引号未闭合。");
  if (touched || cell || closed || record.length) row();
  while (records.length && records.at(-1)!.every(value => !value.trim())) records.pop();
  return records;
}

function columnsFor(context: PayrollSheetContext, rows: readonly PayrollSheetEmployee[]): string[] {
  requireCondition(context.binding && /^(?!0000)\d{4}-(?:0[1-9]|1[0-2])$/u.test(context.month)
    && context.ruleName && context.revisionLabel, "请先选择完整工资期间和规则。");
  requireCondition(rows.length > 0 && rows.length <= 2000, "请先准备 1 至 2000 位员工的完整名单。");
  const columns = Object.keys(rows[0]!.directItems);
  requireCondition(columns.length > 0 && columns.length <= 256, "当前规则没有可批量填写的直接输入项目。");
  const keys = JSON.stringify([...columns].sort()), ids = new Set<string>();
  for (const row of rows) {
    requireCondition(typeof row.employeeId === "string" && row.employeeId && !ids.has(row.employeeId)
      && Number.isSafeInteger(row.expectedEmployeeVersion) && row.expectedEmployeeVersion >= 1
      && (row.employeeCode === null || typeof row.employeeCode === "string") && (row.fullName === null || typeof row.fullName === "string")
      && JSON.stringify(Object.keys(row.directItems).sort()) === keys && Object.values(row.directItems).every(value => typeof value === "string" && value.length <= 128),
    "员工名单、资料版本或直接输入项目不完整，请刷新后重试。");
    ids.add(row.employeeId);
  }
  return columns;
}

/** Drift marker only: current permissions and the existing save API remain authoritative. */
async function bindingFor(context: PayrollSheetContext, rows: readonly PayrollSheetEmployee[], columns: string[]): Promise<string> {
  requireCondition(globalThis.crypto?.subtle, "当前浏览器不支持录入表校验，请使用支持安全校验的浏览器。");
  const content = JSON.stringify([context.binding, context.month, context.ruleName, context.revisionLabel, columns,
    rows.map(row => [row.employeeId, row.expectedEmployeeVersion, row.employeeCode, row.fullName])]);
  const hash = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(content));
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
}
const headings = (columns: string[]) => ["序号（勿改）", "员工编号（勿改）", "姓名（勿改）", ...columns.map(code => `金额 · ${code}`)];

export async function payrollInputCsv(context: PayrollSheetContext, rows: readonly PayrollSheetEmployee[]): Promise<string> {
  const columns = columnsFor(context, rows), binding = await bindingFor(context, rows, columns);
  return csvDocument([
    ["工资输入表", "1", forceText(binding)],
    ["工资月份", forceText(context.month), "工资规则", forceText(context.ruleName), "输入范围", forceText(context.revisionLabel)],
    headings(columns),
    ...rows.map((row, index) => [index + 1, forceText(row.employeeCode ?? ""), forceText(row.fullName ?? ""), ...columns.map(code => forceText(row.directItems[code]!))]),
  ]);
}

export async function previewPayrollInputCsv(text: string, context: PayrollSheetContext, rows: readonly PayrollSheetEmployee[]): Promise<PayrollSheetPreview> {
  const columns = columnsFor(context, rows), records = parsePayrollInputCsv(text), binding = await bindingFor(context, rows, columns);
  // Spreadsheet applications save a rectangular range, padding short metadata/data rows.
  // Allow only empty trailing cells within that range; unknown columns still fail closed.
  const width = Math.max(6, columns.length + 3);
  const withoutPadding = (record: string[] | undefined, length: number): string[] | undefined =>
    record && record.length >= length && record.length <= width && record.slice(length).every(value => value === "")
      ? record.slice(0, length) : undefined;
  records[0] = withoutPadding(records[0], 3) ?? [];
  records[1] = withoutPadding(records[1], 6) ?? [];
  records[2] = withoutPadding(records[2], columns.length + 3) ?? [];
  requireCondition(records.length === rows.length + 3 && records[0]?.length === 3 && records[0][0] === "工资输入表" && records[0][1] === "1"
    && sameText(records[0][2], binding), "录入表与当前期间、规则、输入版本或完整员工名单不一致，请重新导出。");
  const metadata = ["工资月份", context.month, "工资规则", context.ruleName, "输入范围", context.revisionLabel];
  requireCondition(records[1]?.length === metadata.length && metadata.every((value, index) => sameText(records[1]![index], value))
    && JSON.stringify(records[2]) === JSON.stringify(headings(columns)), "录入表头或业务范围已变化，请保留原表头和校验信息。");
  const seen = new Set<number>(), updates = rows.map(row => ({ employeeId: row.employeeId, directItems: { ...row.directItems } }));
  let changedCells = 0;
  for (const [offset, originalRecord] of records.slice(3).entries()) {
    const record = withoutPadding(originalRecord, columns.length + 3) ?? [];
    const line = offset + 4;
    requireCondition(record.length === columns.length + 3 && /^[1-9]\d{0,3}$/u.test(record[0] ?? ""), `第 ${line} 行列数或序号无效。`);
    const index = Number(record[0]) - 1, row = rows[index];
    requireCondition(row && !seen.has(index) && sameText(record[1], row.employeeCode ?? "") && sameText(record[2], row.fullName ?? ""), `第 ${line} 行员工标识缺失、重复或已变化。`);
    seen.add(index);
    columns.forEach((code, column) => {
      const original = record[column + 3]!.trim();
      if (!original) return; // Blank means preserve, including an unfinished blank draft.
      const value = original.startsWith("'") ? original.slice(1) : original;
      requireCondition(decimal.test(value), `第 ${line} 行金额格式无效，请填写最多四位小数的普通十进制数字，不使用公式或千分位。`);
      if (value !== row!.directItems[code]) { updates[index]!.directItems[code] = value; changedCells++; }
    });
  }
  requireCondition(seen.size === rows.length, "录入表必须保留当前完整员工名单。");
  return { updates, changedCells, changedEmployees: updates.filter((row, index) => columns.some(code => row.directItems[code] !== rows[index]!.directItems[code])).length };
}
