import { webcrypto } from "node:crypto";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeAll, afterAll, beforeEach, expect, it, vi } from "vitest";
import { PayrollRuleSourcePreparation } from "../../app/hr/payroll/PayrollRuleSourcePreparation";
import { payrollRuleChoiceCsv } from "../../app/hr/payroll/payroll-rule-choice-csv";
import { parsePayrollInputCsv } from "../../app/hr/payroll/payroll-input-csv";
import { csvDocument, downloadCsv } from "../../lib/scoped-csv-export";
import type * as CsvExportModule from "../../lib/scoped-csv-export";
import { reference } from "./payroll-rule-choice-fixture";
const state = vi.hoisted(() => ({ load: vi.fn(), token: "token" }));
vi.mock("../../lib/hr-api", () => ({ hrApi: { payrollRuleSourceReference: state.load } }));
vi.mock("../../lib/authz", () => ({ getAccessToken: () => state.token }));
vi.mock("../../lib/scoped-csv-export", async original => ({ ...await original<typeof CsvExportModule>(), downloadCsv: vi.fn() }));
beforeAll(() => vi.stubGlobal("crypto", webcrypto)); afterAll(() => vi.unstubAllGlobals());
beforeEach(() => { vi.clearAllMocks(); state.token = "token"; state.load.mockResolvedValue(reference); });
const props = { ruleSetId: reference.ruleSetId, sourceBookId: reference.book.id, disabled: false };
async function load() { fireEvent.click(screen.getByRole("button", { name: "读取关联账套源资料" })); await screen.findByText(/完整资料：/); }
async function file(invalid = false) {
  const rows = parsePayrollInputCsv(await payrollRuleChoiceCsv(reference, {}), { maxCellLength: 65536 });
  rows.slice(3).forEach(row => row.splice(13, 6, "纳入", "收入", "直接录入", "", "", ""));
  rows[3]!.splice(15, 4, "原公式", "1", "2", "");
  if (invalid) rows.at(-1)![14] = "猜测";
  return new File([csvDocument(rows)], "choices.csv", { type: "text/csv" });
}
async function preview(selected: File) {
  fireEvent.change(screen.getByLabelText("选择规则选择 CSV"), { target: { files: [selected] } });
  fireEvent.click(screen.getByRole("button", { name: "预览完整规则选择表" }));
  await screen.findByText(/已校验全部 25 个项目版本/);
}
const consent = /我已核对全部选择变更/;
function manual() {
  const card = within(screen.getByRole("article", { name: "ITEM0 第1版" }));
  fireEvent.click(card.getByRole("checkbox")); fireEvent.change(card.getByLabelText("源项目用途 ITEM0"), { target: { value: "deduction" } });
  fireEvent.change(card.getByLabelText("源项目数值来源 ITEM0"), { target: { value: "direct" } });
}
it("previews every off-page change then re-reads before replacing and reaches existing draft callback only after separate confirmation", async () => {
  const apply = vi.fn(); render(<PayrollRuleSourcePreparation {...props} onApply={apply} />); await load(); await preview(await file());
  expect(apply).not.toHaveBeenCalled(); expect(screen.getByRole("checkbox", { name: "纳入 ITEM0 第1版" })).not.toBeChecked();
  expect(screen.getByRole("button", { name: "确认替换本地选择" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "选择变更下一页" })); expect(screen.getByText("项目24 · ITEM24 · 第 1 版")).toBeVisible();
  fireEvent.click(screen.getByLabelText(consent)); fireEvent.click(screen.getByRole("button", { name: "确认替换本地选择" }));
  await waitFor(() => expect(screen.getByRole("checkbox", { name: "纳入 ITEM0 第1版" })).toBeChecked());
  expect(state.load).toHaveBeenCalledTimes(2); expect(apply).not.toHaveBeenCalled();
  expect(screen.getByLabelText(/我已核对原条件/)).not.toBeChecked();
  fireEvent.click(screen.getByLabelText(/我已核对原条件/)); fireEvent.click(screen.getByRole("button", { name: "带入空白规则草稿" }));
  expect(apply).toHaveBeenCalledTimes(1); const definition = apply.mock.calls[0]![0]; expect(definition.items).toHaveLength(25);
  expect(definition.items[0]).toEqual({ code: "ITEM0", role: "earning", expression: "[BASE]+2" });
  expect(definition.items[24]).toEqual({ code: "ITEM24", role: "earning", expression: null });
});
it("exports current incomplete selections without inventing a role", async () => {
  render(<PayrollRuleSourcePreparation {...props} onApply={vi.fn()} />); await load();
  fireEvent.click(screen.getByRole("checkbox", { name: "纳入 ITEM0 第1版" }));
  fireEvent.click(screen.getByRole("button", { name: "导出规则选择表" })); await waitFor(() => expect(downloadCsv).toHaveBeenCalled());
  const rows = parsePayrollInputCsv(vi.mocked(downloadCsv).mock.calls[0]![0], { maxCellLength: 65536 });
  expect(rows[3]!.slice(13)).toEqual(["纳入", "", "", "", "", ""]); expect(rows).toHaveLength(28);
});
it("rejects invalid last row and invalid files without changing prior manual choices", async () => {
  render(<PayrollRuleSourcePreparation {...props} onApply={vi.fn()} />); await load(); manual();
  fireEvent.change(screen.getByLabelText("选择规则选择 CSV"), { target: { files: [await file(true)] } });
  fireEvent.click(screen.getByRole("button", { name: "预览完整规则选择表" })); await screen.findByRole("alert");
  expect(screen.getByLabelText("源项目用途 ITEM0")).toHaveValue("deduction"); expect(screen.queryByLabelText(consent)).toBeNull();
  fireEvent.change(screen.getByLabelText("选择规则选择 CSV"), { target: { files: [new File(["bad"], "bad.xlsx")] } });
  await screen.findByText("请选择 UTF-8 CSV 文件。"); expect(screen.getByLabelText("源项目用途 ITEM0")).toHaveValue("deduction");
});
it.each(["drift", "denied", "token"])("preserves all choices on failed apply: %s", async mode => {
  const apply = vi.fn(); render(<PayrollRuleSourcePreparation {...props} onApply={apply} />); await load(); manual(); await preview(await file());
  if (mode === "drift") { const changed = structuredClone(reference); changed.formulas.at(-1)!.condition = "changed"; state.load.mockResolvedValueOnce(changed); }
  if (mode === "denied") state.load.mockRejectedValueOnce(new Error("source denied"));
  if (mode === "token") state.token = "new-token";
  fireEvent.click(screen.getByLabelText(consent)); fireEvent.click(screen.getByRole("button", { name: "确认替换本地选择" }));
  await screen.findByRole("alert"); expect(screen.getByLabelText("源项目用途 ITEM0")).toHaveValue("deduction"); expect(apply).not.toHaveBeenCalled();
});
it.each(["manual", "disabled", "context", "export"])("invalidates preview after %s", async mode => {
  const apply = vi.fn(), view = render(<PayrollRuleSourcePreparation {...props} onApply={apply} />); await load(); await preview(await file());
  fireEvent.click(screen.getByLabelText(consent));
  if (mode === "manual") manual();
  if (mode === "disabled") view.rerender(<PayrollRuleSourcePreparation {...props} disabled onApply={apply} />);
  if (mode === "context") view.rerender(<PayrollRuleSourcePreparation {...props} ruleSetId="other" onApply={apply} />);
  if (mode === "export") { fireEvent.click(screen.getByRole("button", { name: "导出完整项目核对表" })); await waitFor(() => expect(downloadCsv).toHaveBeenCalled()); }
  expect(screen.queryByLabelText(consent)).toBeNull(); expect(apply).not.toHaveBeenCalled();
});
it.each(["manual", "disabled", "context", "token", "unmount"])("discards pending source re-read on %s and prevents duplicate flights", async mode => {
  const apply = vi.fn(), view = render(<PayrollRuleSourcePreparation {...props} onApply={apply} />); await load(); await preview(await file());
  let resolve!: (value: typeof reference) => void; state.load.mockReturnValueOnce(new Promise(done => { resolve = done; }));
  fireEvent.click(screen.getByLabelText(consent)); const button = screen.getByRole("button", { name: "确认替换本地选择" });
  fireEvent.click(button); fireEvent.click(button); expect(state.load).toHaveBeenCalledTimes(2);
  if (mode === "manual") manual();
  if (mode === "disabled") view.rerender(<PayrollRuleSourcePreparation {...props} disabled onApply={apply} />);
  if (mode === "context") view.rerender(<PayrollRuleSourcePreparation {...props} ruleSetId="other" onApply={apply} />);
  if (mode === "token") state.token = "changed";
  if (mode === "unmount") view.unmount();
  await act(async () => resolve(reference)); expect(apply).not.toHaveBeenCalled();
  if (mode === "manual") expect(screen.getByLabelText("源项目用途 ITEM0")).toHaveValue("deduction");
  if (mode === "token") await screen.findByRole("alert");
});
it("discards a pending local file read after manual selection", async () => {
  const view = render(<PayrollRuleSourcePreparation {...props} onApply={vi.fn()} />); await load();
  fireEvent.change(screen.getByLabelText("选择规则选择 CSV"), { target: { files: [await file()] } });
  fireEvent.click(screen.getByRole("button", { name: "预览完整规则选择表" })); manual();
  await waitFor(() => expect(screen.getByRole("button", { name: "预览完整规则选择表" })).not.toBeDisabled());
  expect(screen.queryByLabelText(consent)).toBeNull(); view.unmount();
});
it.each(["disabled", "context", "token", "unmount"])("discards a pending file read after %s", async mode => {
  const apply = vi.fn(), view = render(<PayrollRuleSourcePreparation {...props} onApply={apply} />); await load();
  fireEvent.change(screen.getByLabelText("选择规则选择 CSV"), { target: { files: [await file()] } });
  fireEvent.click(screen.getByRole("button", { name: "预览完整规则选择表" }));
  if (mode === "disabled") view.rerender(<PayrollRuleSourcePreparation {...props} disabled onApply={apply} />);
  if (mode === "context") view.rerender(<PayrollRuleSourcePreparation {...props} ruleSetId="other" onApply={apply} />);
  if (mode === "token") { state.token = "changed-token"; await screen.findByRole("alert"); }
  if (mode === "unmount") view.unmount();
  expect(screen.queryByLabelText(consent)).toBeNull(); expect(apply).not.toHaveBeenCalled();
});
it.each(["disabled", "manual", "token", "unmount"])("discards a pending choice-table export after %s", async mode => {
  const view = render(<PayrollRuleSourcePreparation {...props} onApply={vi.fn()} />); await load();
  let resolve!: (value: typeof reference) => void; state.load.mockReturnValueOnce(new Promise(done => { resolve = done; }));
  fireEvent.click(screen.getByRole("button", { name: "导出规则选择表" }));
  expect(screen.getByRole("button", { name: "导出完整项目核对表" })).toBeDisabled();
  if (mode === "disabled") view.rerender(<PayrollRuleSourcePreparation {...props} disabled onApply={vi.fn()} />);
  if (mode === "manual") manual();
  if (mode === "token") state.token = "changed-token";
  if (mode === "unmount") view.unmount();
  await act(async () => resolve(reference)); expect(downloadCsv).not.toHaveBeenCalled();
});
it("shows source failure in parent and blocks stale rule application until reload", async () => {
  render(<PayrollRuleSourcePreparation {...props} onApply={vi.fn()} />); await load(); manual(); await preview(await file());
  state.load.mockRejectedValueOnce(new Error("source access denied"));
  fireEvent.click(screen.getByLabelText(consent)); fireEvent.click(screen.getByRole("button", { name: "确认替换本地选择" }));
  await screen.findByText("source access denied"); expect(screen.getByLabelText("源项目用途 ITEM0")).toHaveValue("deduction");
  expect(screen.getByLabelText(/我已核对原条件/)).toBeDisabled(); expect(screen.getByRole("button", { name: "带入空白规则草稿" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "重新读取源资料" })); await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  expect(screen.getByRole("checkbox", { name: "纳入 ITEM0 第1版" })).not.toBeChecked();
});
it("rejects non-UTF8 data without replacing current manual selections", async () => {
  render(<PayrollRuleSourcePreparation {...props} onApply={vi.fn()} />); await load(); manual();
  fireEvent.change(screen.getByLabelText("选择规则选择 CSV"), { target: { files: [new File([new Uint8Array([255])], "invalid.csv", { type: "text/csv" })] } });
  fireEvent.click(screen.getByRole("button", { name: "预览完整规则选择表" })); await screen.findByText(/CSV 编码无效/);
  expect(screen.getByLabelText("源项目用途 ITEM0")).toHaveValue("deduction"); expect(screen.queryByLabelText(consent)).toBeNull();
});
it("select then uncheck exports and reads an explicit clean exclusion", async () => {
  render(<PayrollRuleSourcePreparation {...props} onApply={vi.fn()} />); await load(); manual();
  fireEvent.click(screen.getByRole("checkbox", { name: "纳入 ITEM0 第1版" }));
  fireEvent.click(screen.getByRole("button", { name: "导出规则选择表" })); await waitFor(() => expect(downloadCsv).toHaveBeenCalled());
  const csv = vi.mocked(downloadCsv).mock.calls[0]![0];
  expect(parsePayrollInputCsv(csv, { maxCellLength: 65536 })[3]!.slice(13)).toEqual(["排除", "", "", "", "", ""]);
  await preview(new File([csv], "roundtrip.csv", { type: "text/csv" }));
  expect(screen.getByText(/共 0 项选择变更/)).toBeVisible(); expect(screen.queryByRole("alert")).toBeNull();
});
it.each(["direct", "formula"])("clears hidden rewrite when switching to %s", async source => {
  render(<PayrollRuleSourcePreparation {...props} onApply={vi.fn()} />); await load(); manual();
  fireEvent.change(screen.getByLabelText("源项目数值来源 ITEM0"), { target: { value: "rewrite" } });
  fireEvent.change(screen.getByLabelText("改写公式 ITEM0"), { target: { value: "[BASE]+1" } });
  fireEvent.change(screen.getByLabelText("源项目数值来源 ITEM0"), { target: { value: source } });
  if (source === "formula") fireEvent.change(screen.getByLabelText("原公式选择 ITEM0"), { target: { value: "f2" } });
  expect(screen.queryByLabelText("改写公式 ITEM0")).toBeNull(); expect(screen.getByLabelText(/我已核对原条件/)).not.toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "导出规则选择表" })); await waitFor(() => expect(downloadCsv).toHaveBeenCalled());
  const rows = parsePayrollInputCsv(vi.mocked(downloadCsv).mock.calls[0]![0], { maxCellLength: 65536 }); expect(rows[3]![18]).toBe("");
});

it.each(["manual", "csv"])("allows the API's blank-condition original formula through %s and the final draft handoff", async mode => {
  const current = structuredClone(reference); current.formulas[0]!.condition = " \t\r\n\u3000";
  state.load.mockResolvedValue(current);
  const apply = vi.fn(); render(<PayrollRuleSourcePreparation {...props} onApply={apply} />); await load();
  if (mode === "csv") {
    const rows = parsePayrollInputCsv(await payrollRuleChoiceCsv(current, {}), { maxCellLength: 65536 });
    rows[3]!.splice(13, 6, "纳入", "收入", "原公式", "1", "1", "");
    await preview(new File([csvDocument(rows)], "blank-condition.csv", { type: "text/csv" }));
    fireEvent.click(screen.getByLabelText(consent)); fireEvent.click(screen.getByRole("button", { name: "确认替换本地选择" }));
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "纳入 ITEM0 第1版" })).toBeChecked());
  } else {
    const card = within(screen.getByRole("article", { name: "ITEM0 第1版" }));
    fireEvent.click(card.getByRole("checkbox"));
    fireEvent.change(card.getByLabelText("源项目用途 ITEM0"), { target: { value: "earning" } });
    fireEvent.change(card.getByLabelText("源项目数值来源 ITEM0"), { target: { value: "formula" } });
    fireEvent.change(card.getByLabelText("原公式选择 ITEM0"), { target: { value: "f1" } });
  }
  expect(screen.getByLabelText(/我已核对原条件/)).toBeEnabled();
  fireEvent.click(screen.getByLabelText(/我已核对原条件/));
  fireEvent.click(screen.getByRole("button", { name: "带入空白规则草稿" }));
  expect(apply).toHaveBeenCalledWith({ roundingPolicy: "line_items_half_up", items: [{ code: "ITEM0", role: "earning", expression: "[BASE]+1" }] });
  expect(current.formulas[0]!.condition).toBe(" \t\r\n\u3000");
});
