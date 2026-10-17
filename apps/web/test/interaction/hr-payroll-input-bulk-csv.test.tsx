import { webcrypto } from "node:crypto";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { PayrollInputBulkCsv } from "../../app/hr/payroll/PayrollInputBulkCsv";
import { payrollInputCsv, parsePayrollInputCsv, type PayrollSheetPreview } from "../../app/hr/payroll/payroll-input-csv";
import { csvDocument } from "../../lib/scoped-csv-export";
import { LocalJsonFilePicker } from "../../components/files/LocalJsonFilePicker";
const context = { binding: "synthetic-scope", month: "2026-07", ruleName: "七月工资", revisionLabel: "准备第1版输入" };
const employees = Array.from({ length: 21 }, (_, index) => ({ employeeId: `employee-${index}`, expectedEmployeeVersion: index + 1,
  employeeCode: `SYN-${index}`, fullName: `合成人员${index}`, directItems: { 收入: "10.0000" } }));
beforeAll(() => vi.stubGlobal("crypto", webcrypto));
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => vi.clearAllMocks());
async function file() {
  const records = parsePayrollInputCsv(await payrollInputCsv(context, employees));
  for (const row of records.slice(3)) row[3] = "9007199254740993.1234";
  return new File([csvDocument(records)], "input.csv", { type: "text/csv" });
}
async function preview(selected: File) {
  fireEvent.change(screen.getByLabelText("选择工资输入 CSV"), { target: { files: [selected] } });
  fireEvent.click(screen.getByRole("button", { name: "预览整份录入表" }));
  await screen.findByText(/完整校验 21 位员工/);
}
it("previews all changed employees across pages and requires explicit consent before applying without saving", async () => {
  const apply = vi.fn((_preview: PayrollSheetPreview) => true);
  render(<PayrollInputBulkCsv context={context} employees={employees} draftKey="reason" disabled={false} onApply={apply}/>);
  await preview(await file());
  expect(screen.getByRole("button", { name: "带入当前草稿" })).toBeDisabled();
  expect(screen.queryByText("合成人员20 · SYN-20")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "变更下一页" }));
  expect(screen.getByText("合成人员20 · SYN-20")).toBeVisible();
  expect(apply).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(screen.getByRole("button", { name: "带入当前草稿" }));
  expect(apply).toHaveBeenCalledTimes(1);
  expect(apply.mock.calls[0]![0]).toMatchObject({ changedEmployees: 21, changedCells: 21,
    updates: expect.arrayContaining([{ employeeId: "employee-20", directItems: { 收入: "9007199254740993.1234" } }]) });
  expect(screen.queryByRole("button", { name: "带入当前草稿" })).toBeNull();
});
it("invalidates the old preview when any draft field or busy state changes", async () => {
  const apply = vi.fn((_preview: PayrollSheetPreview) => true), props = { context, employees, draftKey: "reason", disabled: false, onApply: apply };
  const view = render(<PayrollInputBulkCsv {...props}/>); await preview(await file()); fireEvent.click(screen.getByRole("checkbox"));
  view.rerender(<PayrollInputBulkCsv {...props} draftKey="changed settlement reason"/>);
  expect(screen.queryByRole("button", { name: "带入当前草稿" })).toBeNull(); expect(apply).not.toHaveBeenCalled();
  view.rerender(<PayrollInputBulkCsv {...props} disabled/>);
  expect(screen.getByLabelText("选择工资输入 CSV")).toBeDisabled();
  expect(screen.getByRole("button", { name: "导出工资输入表" })).toBeDisabled();
});
it("rejects a malformed last row atomically and rejects invalid encoding and file types", async () => {
  const apply = vi.fn((_preview: PayrollSheetPreview) => true);
  render(<PayrollInputBulkCsv context={context} employees={employees} draftKey="reason" disabled={false} onApply={apply}/>);
  const records = parsePayrollInputCsv(await payrollInputCsv(context, employees)); records[3]![3] = "9"; records.at(-1)![3] = "=SUM(1,2)";
  fireEvent.change(screen.getByLabelText("选择工资输入 CSV"), { target: { files: [new File([csvDocument(records)], "input.csv", { type: "text/csv" })] } });
  fireEvent.click(screen.getByRole("button", { name: "预览整份录入表" })); await screen.findByRole("alert");
  expect(screen.queryByRole("button", { name: "带入当前草稿" })).toBeNull(); expect(apply).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("选择工资输入 CSV"), { target: { files: [new File([new Uint8Array([255])], "input.csv", { type: "text/csv" })] } });
  fireEvent.click(screen.getByRole("button", { name: "预览整份录入表" })); await screen.findByText(/CSV 编码无效/);
  fireEvent.change(screen.getByLabelText("选择工资输入 CSV"), { target: { files: [new File(["x"], "input.xlsx")] } });
  await screen.findByText("请选择 UTF-8 CSV 文件。"); expect(screen.getByRole("button", { name: "预览整份录入表" })).toBeDisabled();
});
it("discards a pending read after context replacement or unmount", async () => {
  const apply = vi.fn((_preview: PayrollSheetPreview) => true), selected = await file();
  const view = render(<PayrollInputBulkCsv context={context} employees={employees} draftKey="a" disabled={false} onApply={apply}/>);
  fireEvent.change(screen.getByLabelText("选择工资输入 CSV"), { target: { files: [selected] } });
  fireEvent.click(screen.getByRole("button", { name: "预览整份录入表" }));
  view.rerender(<PayrollInputBulkCsv context={{ ...context, binding: "new-period" }} employees={employees} draftKey="a" disabled={false} onApply={apply}/>);
  await waitFor(() => expect(screen.getByRole("button", { name: "预览整份录入表" })).toBeDisabled());
  expect(screen.queryByRole("button", { name: "带入当前草稿" })).toBeNull(); view.unmount(); expect(apply).not.toHaveBeenCalled();
});
it("preserves the shared JSON picker contract while hiding the native file button", () => {
  const select = vi.fn(), view = render(<LocalJsonFilePicker policy={{ maxBytes: 1048576 }} fileName="synthetic.json" onSelect={select}/>);
  const picker = screen.getByLabelText("选择数据包"), selected = new File(["{}"], "synthetic.json", { type: "application/json" });
  expect(picker).toHaveAttribute("accept", ".json,application/json,text/json"); expect(picker).toHaveClass("sr-only");
  fireEvent.change(picker, { target: { files: [selected] } }); expect(select).toHaveBeenCalledWith(selected);
  fireEvent.click(screen.getByRole("button", { name: "清除选择" })); expect(select).toHaveBeenLastCalledWith(null);
  view.rerender(<LocalJsonFilePicker policy={{ maxBytes: 1048576 }} disabled onSelect={select}/>);
  expect(screen.getByLabelText("选择数据包")).toBeDisabled();
});
