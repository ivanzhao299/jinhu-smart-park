import { webcrypto } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { csvDocument } from "../../lib/scoped-csv-export";
import { decodePayrollInputCsv, parsePayrollInputCsv, payrollInputCsv, previewPayrollInputCsv, validatePayrollInputCsvFile,
  PAYROLL_INPUT_CSV_MAX_BYTES, type PayrollSheetContext, type PayrollSheetEmployee } from "../../app/hr/payroll/payroll-input-csv";

beforeAll(() => vi.stubGlobal("crypto", webcrypto));
afterAll(() => vi.unstubAllGlobals());
const context: PayrollSheetContext = { binding: "scope:period:rules:head2", month: "2026-07", ruleName: "七月工资", revisionLabel: "准备第3版输入" };
const rows: PayrollSheetEmployee[] = [
  { employeeId: "one", expectedEmployeeVersion: 7, employeeCode: "000001", fullName: "=合成人员", directItems: { 收入: "", 税: "4.0000" }, settlementStart: "2026-07-01", settlementEnd: "2026-07-03", eligibilityReason: "明确补结算" },
  { employeeId: "two", expectedEmployeeVersion: 8, employeeCode: "SYN-2", fullName: "第二人员", directItems: { 收入: "123.4500", 税: "0.0000" } },
];
const table = async () => parsePayrollInputCsv(await payrollInputCsv(context, rows));
it("exports all rows with text-preserved employee codes and decimal strings, without exposing IDs or changing current inputs", async () => {
  const source = structuredClone(rows), csv = await payrollInputCsv(context, rows), records = parsePayrollInputCsv(csv);
  expect(records).toHaveLength(5); expect(records[3]).toEqual(["1", "'000001", "'=合成人员", "", "'4.0000"]);
  expect(csv).not.toContain('"one"'); expect(csv).not.toContain('"scope:period:rules:head2"'); expect(rows).toEqual(source);
  const preview = await previewPayrollInputCsv(csv, context, rows); expect(preview.changedCells).toBe(0); expect(preview.changedEmployees).toBe(0);
});
it("preserves large exact decimal values, explicit zero, negative values and blank-as-preserve across reordered records", async () => {
  const records = await table(); records[3]![3] = "'9007199254740993.1234"; records[3]![4] = "";
  records[4]![3] = "0"; records[4]![4] = "-0.2500";
  [records[3], records[4]] = [records[4]!, records[3]!];
  const preview = await previewPayrollInputCsv(csvDocument(records), context, rows);
  expect(preview.changedCells).toBe(3); expect(preview.changedEmployees).toBe(2);
  expect(preview.updates[0]).toEqual({ employeeId: "one", directItems: { 收入: "9007199254740993.1234", 税: "4.0000" } });
  expect(preview.updates[1]).toEqual({ employeeId: "two", directItems: { 收入: "0", 税: "-0.2500" } });
  expect(rows[0]!.directItems.收入).toBe(""); expect(rows[0]!.settlementStart).toBe("2026-07-01");
});
it("keeps originally quoted, multiline and missing business labels bound to the same native employee", async () => {
  const employees = rows.map(row => ({ ...row, fullName: '合成,"原名"\n保留', employeeCode: null }));
  const csv = await payrollInputCsv(context, employees); expect((await previewPayrollInputCsv(csv, context, employees)).changedCells).toBe(0);
  const records = parsePayrollInputCsv(csv); records[3]![2] = "另一人";
  await expect(previewPayrollInputCsv(csvDocument(records), context, employees)).rejects.toThrow("员工标识");
});
it.each(["binding", "month", "ruleName", "revisionLabel"] as const)("rejects a different %s before producing any draft update", async key => {
  const csv = await payrollInputCsv(context, rows);
  await expect(previewPayrollInputCsv(csv, { ...context, [key]: key === "month" ? "2026-08" : "different" }, rows)).rejects.toThrow("不一致");
});
it.each(["version", "id", "code", "name", "order", "project"])("rejects changed employee/project metadata: %s", async kind => {
  const csv = await payrollInputCsv(context, rows), changed = structuredClone(rows);
  if (kind === "version") changed[0]!.expectedEmployeeVersion++;
  if (kind === "id") changed[0]!.employeeId = "other";
  if (kind === "code") changed[0]!.employeeCode = "different";
  if (kind === "name") changed[0]!.fullName = "different";
  if (kind === "order") changed.reverse();
  if (kind === "project") for (const row of changed) row.directItems = { 不同项目: "" };
  await expect(previewPayrollInputCsv(csv, context, changed)).rejects.toThrow("不一致");
});
it.each(["missing", "duplicate", "unknown", "column", "heading"])("refuses a structurally altered file atomically: %s", async kind => {
  const records = await table(); records[3]![3] = "99.9999";
  if (kind === "missing") records.pop();
  if (kind === "duplicate") records[4] = records[3]!;
  if (kind === "unknown") records[4]![0] = "2001";
  if (kind === "column") records[4]!.pop();
  if (kind === "heading") records[2]![3] = "金额 · 不在规则中的项目";
  await expect(previewPayrollInputCsv(csvDocument(records), context, rows)).rejects.toThrow(); expect(rows[0]!.directItems.收入).toBe("");
});
it.each(["=SUM(1,2)", "1e3", "1,000.00", "NaN", "0.00001", "99999999999999999", "--2", "'+2"])("rejects non-native decimal input %s without exposing private values", async value => {
  const records = await table(); records[3]![3] = "1"; records[4]![3] = value;
  await expect(previewPayrollInputCsv(csvDocument(records), context, rows)).rejects.toThrow("第 5 行金额格式无效");
  expect(rows[0]!.directItems.收入).toBe("");
});
it("uses the current draft as the blank-cell baseline without binding a file to old amounts", async () => {
  const records = await table(); records[3]![3] = "";
  const current = structuredClone(rows); current[0]!.directItems.收入 = "88.8800";
  expect((await previewPayrollInputCsv(csvDocument(records), context, current)).updates[0]!.directItems.收入).toBe("88.8800");
});
it("reads standard CSV escapes and rejects unclosed quotes, injected columns and binary content", () => {
  expect(parsePayrollInputCsv('\uFEFF"a,b","line1\nline2","a""b"\r\n')).toEqual([["a,b", "line1\nline2", 'a"b']]);
  for (const text of ['"unclosed', '"a"trailing', 'a"b', "a\0b", Array.from({ length: 260 }, () => "x").join(",")]) expect(() => parsePayrollInputCsv(text)).toThrow();
});
it("requires a nonempty bounded CSV and strict UTF-8 instead of silently replacing labels", () => {
  validatePayrollInputCsvFile({ name: "input.CSV", type: "text/plain", size: 1 });
  for (const file of [{ name: "input.xlsx", type: "text/csv", size: 1 }, { name: "input.csv", type: "image/png", size: 1 },
    { name: "input.csv", type: "text/csv", size: 0 }, { name: "input.csv", type: "text/csv", size: PAYROLL_INPUT_CSV_MAX_BYTES + 1 }]) expect(() => validatePayrollInputCsvFile(file)).toThrow();
  expect(() => decodePayrollInputCsv(new Uint8Array([255, 255]).buffer)).toThrow("UTF-8");
  expect(decodePayrollInputCsv(new TextEncoder().encode("工资").buffer)).toBe("工资");
});
