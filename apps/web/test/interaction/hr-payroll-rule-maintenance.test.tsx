import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { HR_PERMISSIONS } from "@jinhu/shared";
import { PayrollRuleMaintenance } from "../../app/hr/payroll/PayrollRuleMaintenance";
import { payrollBookOptions } from "../../app/hr/payroll/payroll-book-label";

const state = vi.hoisted(() => ({ user: { id: "actor", tenant_id: "tenant", park_id: "park", permissions: [] as string[] }, api: {
  payrollBookOptions: vi.fn(), payrollRules: vi.fn(), payrollRuleVersions: vi.fn(), createPayrollRules: vi.fn(), createPayrollRuleVersion: vi.fn(),
  updatePayrollRuleVersion: vi.fn(), submitPayrollRuleVersion: vi.fn(), reviewPayrollRuleVersion: vi.fn(),
} }));
vi.mock("../../lib/auth-context", () => ({ useAuthUser: () => state.user }));
vi.mock("../../lib/authz", () => ({ getAccessToken: () => "synthetic-token" }));
vi.mock("../../lib/hr-api", () => ({ hrApi: state.api }));
const rule = { id: "rules", ruleCode: "pay", displayName: "当期工资规则", sourceBookId: null, headRevision: 1 };
const draft = { id: "draft", ruleSetId: rule.id, revisionNo: 1, version: 1, status: "draft", reason: "当期规则",
  effectiveFrom: null, reviewReason: null, definition: { roundingPolicy: "line_items_half_up", items: [
    { code: "工资", role: "earning", expression: null }, { code: "税", role: "tax", expression: null },
    { code: "应发", role: "gross", expression: "[工资]" }, { code: "实发", role: "net", expression: "[应发]-[税]" },
  ] } };
const page = (items: unknown[]) => ({ items, total: items.length, page: 1, page_size: 20 });
beforeEach(() => {
  vi.resetAllMocks(); state.user = { id: "actor", tenant_id: "tenant", park_id: "park", permissions: [HR_PERMISSIONS.HR_PAYROLL_RULE_READ, HR_PERMISSIONS.HR_PAYROLL_MANAGE, HR_PERMISSIONS.HR_PAYROLL_FORMULA_REVIEW] };
  state.api.payrollRules.mockResolvedValue(page([rule])); state.api.payrollRuleVersions.mockResolvedValue(page([draft]));
  state.api.payrollBookOptions.mockResolvedValue(page([]));
  state.api.updatePayrollRuleVersion.mockResolvedValue({ ...draft, version: 2 });
  state.api.submitPayrollRuleVersion.mockResolvedValue({ ...draft, version: 2, status: "submitted" });
});
async function open() {
  await screen.findByRole("option", { name: "当期工资规则 · pay" });
  fireEvent.change(screen.getByLabelText("选择工资规则"), { target: { value: rule.id } });
  fireEvent.click(await screen.findByRole("button", { name: "查看版本" }));
  await screen.findByRole("region", { name: "规则版本编辑" });
}
it("missing rule-read permission produces no probes or workspace", () => {
  state.user.permissions = [HR_PERMISSIONS.HR_PAYROLL_MANAGE]; render(<PayrollRuleMaintenance />);
  expect(state.api.payrollRules).not.toHaveBeenCalled(); expect(screen.queryByRole("heading", { name: "工资业务规则" })).toBeNull();
});
it("read-only operators inspect every project without authoring or approval controls", async () => {
  state.user.permissions = [HR_PERMISSIONS.HR_PAYROLL_RULE_READ]; render(<PayrollRuleMaintenance />); await open();
  expect(screen.getAllByLabelText("项目编号")).toHaveLength(4);
  expect(screen.getAllByLabelText("计算公式")[1]).toHaveValue("[应发]-[税]");
  expect(screen.queryByRole("button", { name: "编辑草稿" })).toBeNull();
  expect(screen.queryByRole("button", { name: "新增版本" })).toBeNull();
  expect(state.api.payrollBookOptions).not.toHaveBeenCalled();
});

it("book choice survives paging and failed creation with a stable retry identity; successful binding is response-owned", async () => {
  const book = { id: "book-one", bookName: "生产工资", scheme: 1, bookCode: "yuzhou-v10:1" };
  state.api.payrollBookOptions.mockImplementation(async ({ page: number }: { page: number }) => ({ items: number === 1 ? [book] : [], total: 21, page: number, page_size: 20 }));
  state.api.createPayrollRules.mockRejectedValueOnce(new Error("synthetic create failed")).mockResolvedValue({ ...rule, id: "created-rules", sourceBookId: book.id, sourceBook: book });
  render(<PayrollRuleMaintenance />);
  await screen.findByRole("option", { name: "生产工资 · 账套 1" });
  fireEvent.change(screen.getByLabelText("关联工资账套（可选）"), { target: { value: book.id } });
  fireEvent.click(screen.getByRole("button", { name: "账套下一页" }));
  await waitFor(() => expect(state.api.payrollBookOptions.mock.calls.at(-1)?.[0].page).toBe(2));
  await waitFor(() => expect(screen.getByLabelText("关联工资账套（可选）")).not.toBeDisabled());
  expect(screen.getByLabelText("关联工资账套（可选）")).toHaveValue(book.id);
  fireEvent.change(screen.getByLabelText("规则编号"), { target: { value: "PAY" } });
  fireEvent.change(screen.getByLabelText("规则名称"), { target: { value: "正式工资" } });
  fireEvent.click(screen.getByRole("button", { name: "新建规则" })); await screen.findByText("synthetic create failed");
  expect(screen.getByLabelText("关联工资账套（可选）")).toHaveValue(book.id);
  fireEvent.click(screen.getByRole("button", { name: "新建规则" })); await screen.findByText("操作已保存。");
  expect(state.api.createPayrollRules.mock.calls[0]).toEqual(state.api.createPayrollRules.mock.calls[1]);
  expect(state.api.createPayrollRules.mock.calls[0]?.[0]).toEqual({ ruleCode: "PAY", displayName: "正式工资", sourceBookId: book.id });
  expect(screen.getByLabelText("关联工资账套（可选）")).toHaveValue("");
  expect(screen.getByText("关联账套：生产工资 · 账套 1")).toBeVisible();
});

it("candidate failure can be refreshed and does not prevent independent rules", async () => {
  state.api.payrollBookOptions.mockRejectedValueOnce(new Error("candidate unavailable"));
  state.api.createPayrollRules.mockResolvedValue(rule);
  render(<PayrollRuleMaintenance />); await screen.findByText("candidate unavailable");
  fireEvent.change(screen.getByLabelText("规则编号"), { target: { value: "PAY" } });
  fireEvent.change(screen.getByLabelText("规则名称"), { target: { value: "正式工资" } });
  fireEvent.click(screen.getByRole("button", { name: "新建规则" })); await screen.findByText("操作已保存。");
  expect(state.api.createPayrollRules.mock.calls[0]?.[0]).toEqual({ ruleCode: "PAY", displayName: "正式工资" });
  await waitFor(() => expect(screen.queryByText("candidate unavailable")).toBeNull());
});
it("failed draft save retains fields and reuses the exact retry identity and expected version", async () => {
  state.api.updatePayrollRuleVersion.mockRejectedValueOnce(new Error("synthetic save failed")); render(<PayrollRuleMaintenance />); await open();
  fireEvent.click(screen.getByRole("button", { name: "编辑草稿" }));
  fireEvent.change(screen.getByLabelText("制定或修改理由"), { target: { value: "核对当期项目" } });
  fireEvent.click(screen.getByRole("button", { name: "保存规则草稿" }));
  await screen.findByText("synthetic save failed"); expect(screen.getByLabelText("制定或修改理由")).toHaveValue("核对当期项目");
  fireEvent.click(screen.getByRole("button", { name: "保存规则草稿" }));
  await screen.findByText("操作已保存。");
  expect(state.api.updatePayrollRuleVersion).toHaveBeenCalledTimes(2);
  expect(state.api.updatePayrollRuleVersion.mock.calls[0]).toEqual(state.api.updatePayrollRuleVersion.mock.calls[1]);
  expect(state.api.updatePayrollRuleVersion.mock.calls[0]![1]).toMatchObject({ expectedVersion: 1, reason: "核对当期项目", definition: draft.definition });
  expect(screen.queryByRole("button", { name: "保存规则草稿" })).toBeNull();
});
it("pending submission owns one write and successful commit survives list refresh failure", async () => {
  let finish!: (value: object) => void; state.api.submitPayrollRuleVersion.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  render(<PayrollRuleMaintenance />); await open(); const button = screen.getByRole("button", { name: "提交独立复核" });
  fireEvent.click(button); fireEvent.click(button); expect(state.api.submitPayrollRuleVersion).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText("选择工资规则")).toBeDisabled();
  state.api.payrollRuleVersions.mockRejectedValue(new Error("refresh failed"));
  await act(async () => finish({ ...draft, version: 2, status: "submitted" }));
  await screen.findByText(/操作已保存，列表刷新失败/); expect(screen.queryByRole("button", { name: "提交独立复核" })).toBeNull();
});
it("approval requires explicit month and reason, rejected response retains the decision draft", async () => {
  state.api.payrollRuleVersions.mockResolvedValue(page([{ ...draft, status: "submitted", version: 3 }]));
  state.api.reviewPayrollRuleVersion.mockRejectedValueOnce(new Error("independent reviewer required"));
  render(<PayrollRuleMaintenance />); await open();
  expect(screen.getByRole("button", { name: "批准规则并生效" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("批准后的生效月份"), { target: { value: "2026-10" } });
  fireEvent.change(screen.getByLabelText("复核理由"), { target: { value: "核对生效项目和口径" } });
  fireEvent.click(screen.getByRole("button", { name: "批准规则并生效" }));
  await screen.findByText("independent reviewer required"); expect(screen.getByLabelText("复核理由")).toHaveValue("核对生效项目和口径");
  expect(state.api.reviewPayrollRuleVersion).toHaveBeenCalledWith("draft", { expectedVersion: 3, decision: "approve", effectiveFrom: "2026-10", reason: "核对生效项目和口径" }, "synthetic-token", expect.any(String));
});
it("context changes abort reads and discard selected financial rule drafts", async () => {
  const view = render(<PayrollRuleMaintenance />); await open(); const signal = state.api.payrollRuleVersions.mock.calls[0]![3] as AbortSignal;
  const bookSignal = state.api.payrollBookOptions.mock.calls[0]![2] as AbortSignal;
  state.user = { ...state.user, park_id: "other" }; view.rerender(<PayrollRuleMaintenance />);
  await waitFor(() => expect(signal.aborted).toBe(true)); expect(screen.queryByRole("region", { name: "规则版本编辑" })).toBeNull();
  expect(bookSignal.aborted).toBe(true);
});

it("book labels normalize invisible names, deduplicate identities and disambiguate business codes without UUIDs", () => {
  const options = payrollBookOptions([
    { id: "uuid-one", bookName: "\u200B  工资  账套 ", scheme: 1, bookCode: "a:1" },
    { id: "uuid-one", bookName: "工资 账套", scheme: 1, bookCode: "a:1" },
    { id: "uuid-two", bookName: "工资 账套", scheme: 1, bookCode: "b:1" },
    { id: "uuid-three", bookName: "\u200B123", scheme: 3, bookCode: "a:3" },
  ]);
  expect(options.map(value => value.label)).toEqual(["工资 账套 · 账套 1（a:1）", "工资 账套 · 账套 1（b:1）", "工资账套 3"]);
});
