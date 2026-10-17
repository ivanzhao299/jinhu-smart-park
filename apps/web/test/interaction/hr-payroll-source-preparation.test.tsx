import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { FormalPayrollSourceReference } from "@jinhu/shared";
import { PayrollRuleSourcePreparation } from "../../app/hr/payroll/PayrollRuleSourcePreparation";
import { downloadCsv } from "../../lib/scoped-csv-export";
import type * as CsvExportModule from "../../lib/scoped-csv-export";
const state = vi.hoisted(() => ({ load: vi.fn(), token: "synthetic-token" }));
vi.mock("../../lib/hr-api", () => ({ hrApi: { payrollRuleSourceReference: state.load } }));
vi.mock("../../lib/authz", () => ({ getAccessToken: () => state.token }));
vi.mock("../../lib/scoped-csv-export", async importOriginal => ({ ...await importOriginal<typeof CsvExportModule>(), downloadCsv: vi.fn() }));
const reference: FormalPayrollSourceReference = {
  ruleSetId: "rules", book: { id: "book", bookName: "合成账套", bookCode: "fixture:1", scheme: 1 },
  items: [
    { id: "first", definitionId: "d1", code: "SALARY", legacyName: "salary", displayName: "工资", versionNo: 1, valueType: "decimal", enabled: true, sortNo: 1, legacyItemType: "原类型", legacyAddOrSub: "原增减", category: "unclassified", decimalScale: 2 },
    { id: "second", definitionId: "d1", code: "SALARY", legacyName: "salary", displayName: "工资", versionNo: 2, valueType: "decimal", enabled: true, sortNo: 2, legacyItemType: "原类型", legacyAddOrSub: "原增减", category: "unclassified", decimalScale: 2 },
    { id: "text", definitionId: "d2", code: "TEXT", legacyName: "text", displayName: "文字", versionNo: 1, valueType: "text", enabled: true, sortNo: 3, legacyItemType: "原类型", legacyAddOrSub: "原增减", category: "informational", decimalScale: null },
    { id: "disabled", definitionId: "d3", code: "DISABLED", legacyName: "disabled", displayName: "停用", versionNo: 1, valueType: "decimal", enabled: false, sortNo: 4, legacyItemType: "原类型", legacyAddOrSub: "原增减", category: "unclassified", decimalScale: 2 },
  ],
  formulas: [
    { id: "f1", itemVersionId: "first", legacyFormulaId: 1, versionNo: 1, expression: "[BASIC]+1", condition: null, calculationOrder: 1, reusableSyntax: true, syntaxReason: null },
    { id: "f2", itemVersionId: "first", legacyFormulaId: 1, versionNo: 2, expression: "[BASIC]+2", condition: null, calculationOrder: 1, reusableSyntax: true, syntaxReason: null },
    { id: "conditional", itemVersionId: "first", legacyFormulaId: 2, versionNo: 1, expression: "[BASIC]*3", condition: "旧条件 > 0", calculationOrder: 2, reusableSyntax: false, syntaxReason: "legacy_condition" },
    { id: "orphan", itemVersionId: null, legacyFormulaId: 3, versionNo: 1, expression: "old_function()", condition: null, calculationOrder: 3, reusableSyntax: false, syntaxReason: "unsupported_syntax" },
  ],
};
beforeEach(() => { vi.resetAllMocks(); state.token = "synthetic-token"; state.load.mockResolvedValue(reference); });
const confirmLabel = /我已核对原条件/;
async function load() { fireEvent.click(screen.getByRole("button", { name: "读取关联账套源资料" })); await screen.findByText(/完整资料：/); }
function choose(id = "SALARY 第1版", source = "direct") {
  const card = within(screen.getByRole("article", { name: id }));
  fireEvent.click(card.getByRole("checkbox"));
  fireEvent.change(card.getByLabelText("源项目用途 SALARY"), { target: { value: "earning" } });
  fireEvent.change(card.getByLabelText("源项目数值来源 SALARY"), { target: { value: source } });
  return card;
}
it("requires explicit inclusion, role, source and exact original version; preserves conditions and references", async () => {
  const apply = vi.fn(); render(<PayrollRuleSourcePreparation ruleSetId="rules" sourceBookId="book" disabled={false} onApply={apply} />);
  expect(state.load).not.toHaveBeenCalled(); await load();
  expect(screen.getByText("条件：旧条件 > 0")).toBeVisible();
  expect(screen.getByText("公式：old_function()")).toBeVisible();
  expect(screen.getByRole("checkbox", { name: "纳入 TEXT 第1版" })).toBeDisabled();
  expect(screen.getByRole("checkbox", { name: "纳入 DISABLED 第1版" })).toBeDisabled();
  const card = choose(undefined, "formula");
  expect(card.getByLabelText("原公式选择 SALARY")).toHaveValue("");
  expect(screen.getByLabelText(confirmLabel)).toBeDisabled();
  expect(card.queryByRole("option", { name: /原公式 2/ })).toBeNull();
  fireEvent.change(card.getByLabelText("原公式选择 SALARY"), { target: { value: "f2" } });
  fireEvent.click(screen.getByLabelText(confirmLabel)); fireEvent.click(screen.getByRole("button", { name: "带入空白规则草稿" }));
  expect(apply).toHaveBeenCalledWith({ roundingPolicy: "line_items_half_up", items: [{ code: "SALARY", role: "earning", expression: "[BASIC]+2" }] });
  fireEvent.click(screen.getByRole("button", { name: "带入空白规则草稿" })); expect(apply).toHaveBeenCalledTimes(1);
});
it("duplicate codes block application and rewriting requires explicit nonempty formula", async () => {
  const apply = vi.fn(); render(<PayrollRuleSourcePreparation ruleSetId="rules" sourceBookId="book" disabled={false} onApply={apply} />); await load();
  choose(); const second = choose("SALARY 第2版", "rewrite");
  fireEvent.change(second.getByLabelText("改写公式 SALARY"), { target: { value: "[BASIC]>0?[BASIC]*3:0" } });
  expect(screen.getByLabelText(confirmLabel)).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox", { name: "纳入 SALARY 第1版" }));
  fireEvent.click(screen.getByLabelText(confirmLabel)); fireEvent.click(screen.getByRole("button", { name: "带入空白规则草稿" }));
  expect(apply.mock.calls[0]?.[0].items[0].expression).toBe("[BASIC]>0?[BASIC]*3:0");
});
it("paging preserves full selection and failed refresh blocks stale confirmation until successful reload", async () => {
  const many = structuredClone(reference);
  many.items.push(...Array.from({ length: 20 }, (_, i) => ({ ...reference.items[0]!, id: `extra${i}`, definitionId: `extra${i}`, code: `EXTRA${i}` })));
  state.load.mockResolvedValueOnce(many).mockRejectedValueOnce(new Error("source unavailable")).mockResolvedValue(many);
  render(<PayrollRuleSourcePreparation ruleSetId="rules" sourceBookId="book" disabled={false} onApply={vi.fn()} />); await load(); choose();
  fireEvent.click(screen.getByRole("button", { name: "源项目下一页" })); expect(screen.queryByRole("checkbox", { name: "纳入 SALARY 第1版" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "源项目上一页" })); expect(screen.getByRole("checkbox", { name: "纳入 SALARY 第1版" })).toBeChecked();
  fireEvent.click(screen.getByRole("button", { name: "重新读取源资料" })); await screen.findByText("source unavailable");
  expect(screen.getByRole("checkbox", { name: "纳入 SALARY 第1版" })).toBeChecked(); expect(screen.getByLabelText(confirmLabel)).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "重新读取源资料" })); await waitFor(() => expect(screen.queryByText("source unavailable")).toBeNull());
  expect(screen.getByRole("checkbox", { name: "纳入 SALARY 第1版" })).not.toBeChecked();
});
it("context changes and unmount abort pending reads and discard late results", async () => {
  let resolve!: (value: FormalPayrollSourceReference) => void;
  state.load.mockReturnValue(new Promise(done => { resolve = done; }));
  const view = render(<PayrollRuleSourcePreparation ruleSetId="rules" sourceBookId="book" disabled={false} onApply={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "读取关联账套源资料" })); const signal = state.load.mock.calls[0]?.[2] as AbortSignal;
  view.rerender(<PayrollRuleSourcePreparation ruleSetId="other" sourceBookId="book2" disabled={false} onApply={vi.fn()} />); expect(signal.aborted).toBe(true);
  await act(async () => resolve(reference)); expect(screen.queryByText(/完整资料：/)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "读取关联账套源资料" })); view.unmount(); expect((state.load.mock.calls[1]?.[2] as AbortSignal).aborted).toBe(true);
});

it("exports all item/formula versions across pages with conditions and pending business columns, without applying a rule", async () => {
  const many = structuredClone(reference);
  many.items.push(...Array.from({ length: 20 }, (_, i) => ({ ...reference.items[0]!, id: `extra${i}`, definitionId: `extra${i}`, code: `EXTRA${i}` })));
  many.formulas.push({ ...reference.formulas[3]!, id: "unmatched-id", itemVersionId: "unavailable-item", legacyFormulaId: 4 });
  state.load.mockResolvedValue(many);
  const apply = vi.fn(); render(<PayrollRuleSourcePreparation ruleSetId="rules" sourceBookId="book" disabled={false} onApply={apply} />);
  expect(screen.queryByRole("button", { name: "导出完整项目核对表" })).toBeNull(); await load();
  expect(screen.queryByRole("article", { name: "EXTRA19 第1版" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "导出完整项目核对表" }));
  await waitFor(() => expect(downloadCsv).toHaveBeenCalledTimes(1));
  const [csv, fileName] = vi.mocked(downloadCsv).mock.calls[0]!;
  expect(csv.startsWith("\uFEFF")).toBe(true); expect(fileName).toBe("工资项目核对-1.csv");
  expect(csv.split("\r\n")).toHaveLength(29);
  for (const text of ["EXTRA19", "SALARY", "TEXT", "DISABLED", "禁用", "文本", "旧条件 > 0", "old_function()", "未关联项目的公式",
    "拟定用途（待确认）", "现行公式和条件（待确认）", "税/考勤/社保口径（待确认）", "舍入和汇总口径（待确认）", "核对人", "核对结论"]) expect(csv).toContain(text);
  expect(csv).not.toContain('"first"'); expect(csv).not.toContain('"d1"'); expect(apply).not.toHaveBeenCalled();
  expect(state.load).toHaveBeenCalledTimes(2); expect(state.load.mock.calls[1]![1]).toBe("synthetic-token");
});

it("keeps source names, formulas and conditions as escaped CSV text", async () => {
  const data = structuredClone(reference); data.items[0]!.displayName = "=SUM(1,2)";
  data.formulas[0]!.expression = "=1+1"; data.formulas[0]!.condition = '+"旧条件"';
  state.load.mockResolvedValue(data);
  render(<PayrollRuleSourcePreparation ruleSetId="rules" sourceBookId="book" disabled={false} onApply={vi.fn()} />); await load();
  fireEvent.click(screen.getByRole("button", { name: "导出完整项目核对表" })); await waitFor(() => expect(downloadCsv).toHaveBeenCalledTimes(1));
  const csv = vi.mocked(downloadCsv).mock.calls[0]![0];
  expect(csv).toContain('"\'=SUM(1,2)"'); expect(csv).toContain('"\'=1+1"'); expect(csv).toContain('"\'+""旧条件"""');
});

it("refuses a changed or denied source reference and requires a successful reload", async () => {
  render(<PayrollRuleSourcePreparation ruleSetId="rules" sourceBookId="book" disabled={false} onApply={vi.fn()} />); await load();
  const changed = structuredClone(reference); changed.formulas[0]!.condition = "changed condition";
  state.load.mockResolvedValueOnce(changed);
  fireEvent.click(screen.getByRole("button", { name: "导出完整项目核对表" }));
  await screen.findByText("源资料已变化，请重新读取后再导出核对表。"); expect(downloadCsv).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "导出完整项目核对表" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "重新读取源资料" })); await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  state.load.mockRejectedValueOnce(new Error("source access denied"));
  fireEvent.click(screen.getByRole("button", { name: "导出完整项目核对表" })); await screen.findByText("source access denied"); expect(downloadCsv).not.toHaveBeenCalled();
});

it.each(["token", "context", "unmount"])("does not download a pending export after %s changes", async mode => {
  let finish!: (value: FormalPayrollSourceReference) => void;
  const view = render(<PayrollRuleSourcePreparation ruleSetId="rules" sourceBookId="book" disabled={false} onApply={vi.fn()} />); await load();
  state.load.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  fireEvent.click(screen.getByRole("button", { name: "导出完整项目核对表" })); const signal = state.load.mock.calls[1]![2] as AbortSignal;
  expect(screen.getByRole("button", { name: "正在导出核对表…" })).toBeDisabled();
  if (mode === "token") state.token = "changed-token";
  else if (mode === "context") view.rerender(<PayrollRuleSourcePreparation ruleSetId="other" sourceBookId="book2" disabled={false} onApply={vi.fn()} />);
  else view.unmount();
  if (mode !== "token") expect(signal.aborted).toBe(true);
  await act(async () => finish(reference)); expect(downloadCsv).not.toHaveBeenCalled();
  if (mode === "token") await screen.findByText("登录状态已变化，请重新读取源资料。");
});
