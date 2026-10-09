import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { HR_PERMISSIONS } from "@jinhu/shared";
import { PayrollInputPreparation } from "../../app/hr/payroll/PayrollInputPreparation";
const state = vi.hoisted(() => ({ user: { id: "author", tenant_id: "tenant", park_id: "park", permissions: [] as string[] }, api: { payrollPeriods: vi.fn(), payrollRules: vi.fn(), payrollPreparation: vi.fn(), createPayrollInput: vi.fn() } }));
vi.mock("../../lib/auth-context", () => ({ useAuthUser: () => state.user }));
vi.mock("../../lib/authz", () => ({ getAccessToken: () => "synthetic-token" }));
vi.mock("../../lib/hr-api", () => ({ hrApi: state.api }));
const candidate = { employeeId: "employee", expectedEmployeeVersion: 7, employeeCode: "SYN", fullName: "合成员工", hireDate: "2026-10-15", departureDate: null, requiresSettlementWindow: false, eligibility: { eligibleStart: "2026-10-15", eligibleEnd: "2026-10-31", basis: "employment_dates" } };
const data = { period: { id: "period", month: "2026-10", startDate: "2026-10-01", endDate: "2026-10-31" }, rule: { id: "approved", ruleSetId: "rules", displayName: "工资规则", definition: { roundingPolicy: "line_items_half_up", items: [{ code: "收入", role: "earning", expression: null }, { code: "税", role: "tax", expression: null }, { code: "应发", role: "gross", expression: "[收入]" }, { code: "实发", role: "net", expression: "[应发]-[税]" }] } }, expectedHeadRevision: 2, items: [candidate], total: 21, page: 1, page_size: 20 };
beforeEach(() => {
  vi.resetAllMocks(); state.user = { id: "author", tenant_id: "tenant", park_id: "park", permissions: [HR_PERMISSIONS.HR_PAYROLL_READ, HR_PERMISSIONS.HR_PAYROLL_MANAGE, HR_PERMISSIONS.HR_PAYROLL_DETAIL_READ, HR_PERMISSIONS.HR_EMPLOYEE_READ, HR_PERMISSIONS.HR_PAYROLL_RULE_READ] };
  state.api.payrollPeriods.mockResolvedValue([{ id: "period", periodMonth: "2026-10-01", status: "open" }]); state.api.payrollRules.mockResolvedValue({ items: [{ id: "rules", displayName: "工资规则" }], total: 1, page: 1, page_size: 20 });
  state.api.payrollPreparation.mockResolvedValue(data); state.api.createPayrollInput.mockImplementation(async body => ({ ...body, id: "saved", revisionNo: 3 }));
});
async function open() {
  render(<PayrollInputPreparation/>); await screen.findByRole("option", { name: "2026-10" }); await screen.findByRole("option", { name: "工资规则" });
  fireEvent.change(screen.getByLabelText("工资期间"), { target: { value: "period" } }); fireEvent.change(screen.getByLabelText("工资规则"), { target: { value: "rules" } });
  await screen.findByLabelText("选择 合成员工（SYN）");
}
async function select() { await open(); fireEvent.click(screen.getByLabelText("选择 合成员工（SYN）")); }
function fill() { fireEvent.change(screen.getByLabelText("合成员工 · 收入"), { target: { value: "123.4500" } }); fireEvent.change(screen.getByLabelText("合成员工 · 税"), { target: { value: "0.0000" } }); fireEvent.change(screen.getByLabelText("工资准备说明"), { target: { value: "核对当期项目" } }); }
it("every missing authority suppresses preparation and all employee probes", () => {
  state.user.permissions = [HR_PERMISSIONS.HR_PAYROLL_MANAGE]; render(<PayrollInputPreparation/>);
  expect(state.api.payrollPeriods).not.toHaveBeenCalled(); expect(state.api.payrollRules).not.toHaveBeenCalled(); expect(state.api.payrollPreparation).not.toHaveBeenCalled();
});
it("cross-page selection retains exact decimals, employee versions and explicit zero", async () => {
  await select(); fill();
  state.api.payrollPreparation.mockResolvedValue({ ...data, page: 2, items: [{ ...candidate, employeeId: "second", employeeCode: "SECOND", fullName: "第二员工" }] });
  fireEvent.click(screen.getByRole("button", { name: "候选下一页" })); await screen.findByLabelText("选择 第二员工（SECOND）");
  expect(screen.getByLabelText("合成员工 · 收入")).toHaveValue(123.45);
  fireEvent.click(screen.getByRole("button", { name: "保存工资输入草稿" })); await screen.findByText(/第 3 版输入草稿已保存/);
  expect(state.api.createPayrollInput.mock.calls[0]![0]).toEqual({ periodId: "period", ruleSetId: "rules", ruleVersionId: "approved", expectedHeadRevision: 2, reason: "核对当期项目", employees: [{ employeeId: "employee", expectedEmployeeVersion: 7, directItems: { 收入: "123.4500", 税: "0.0000" }, settlementStart: undefined, settlementEnd: undefined, eligibilityReason: undefined }] });
  expect(screen.getByRole("button", { name: "保存工资输入草稿" })).toBeDisabled();
});
it("failed save retains input and retry identity; pending write owns one submission", async () => {
  state.api.createPayrollInput.mockRejectedValueOnce(new Error("合成失败")); await select(); fill();
  fireEvent.click(screen.getByRole("button", { name: "保存工资输入草稿" })); await screen.findByText("合成失败");
  expect(screen.getByLabelText("工资准备说明")).toHaveValue("核对当期项目");
  let complete!: (value: unknown) => void; state.api.createPayrollInput.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
  fireEvent.click(screen.getByRole("button", { name: "保存工资输入草稿" })); fireEvent.click(screen.getByRole("button", { name: "保存工资输入草稿" }));
  expect(state.api.createPayrollInput).toHaveBeenCalledTimes(2); expect(state.api.createPayrollInput.mock.calls[0]).toEqual(state.api.createPayrollInput.mock.calls[1]);
  expect(screen.getByLabelText("工资期间")).toBeDisabled();
  await act(async () => complete({ revisionNo: 3, employees: [candidate] })); await screen.findByText(/草稿已保存/);
});
it("missing values never become zero and settlement exceptions need explicit bounded dates", async () => {
  state.api.payrollPreparation.mockResolvedValue({ ...data, items: [{ ...candidate, eligibility: null, requiresSettlementWindow: true }] }); await select();
  fireEvent.change(screen.getByLabelText("工资准备说明"), { target: { value: "补结算" } }); fireEvent.click(screen.getByRole("button", { name: "保存工资输入草稿" }));
  await screen.findByText(/零值也需明确填写/); expect(state.api.createPayrollInput).not.toHaveBeenCalled(); fill();
  fireEvent.click(screen.getByRole("button", { name: "保存工资输入草稿" })); await screen.findByText("补结算必须填写期间内的开始、结束日期和理由。");
  fireEvent.change(screen.getByLabelText("合成员工 · 结算开始"), { target: { value: "2026-10-01" } }); fireEvent.change(screen.getByLabelText("合成员工 · 结算结束"), { target: { value: "2026-10-03" } }); fireEvent.change(screen.getByLabelText("合成员工 · 补结算理由"), { target: { value: "核对补结算期间" } });
  fireEvent.click(screen.getByRole("button", { name: "保存工资输入草稿" })); await waitFor(() => expect(state.api.createPayrollInput).toHaveBeenCalledTimes(1));
  expect(state.api.createPayrollInput.mock.calls[0]![0].employees[0]).toMatchObject({ settlementStart: "2026-10-01", settlementEnd: "2026-10-03", eligibilityReason: "核对补结算期间" });
});
it("effective rule changes clear incompatible selections", async () => {
  await select(); fill(); state.api.payrollPreparation.mockResolvedValue({ ...data, rule: { ...data.rule, id: "new-approved" } });
  fireEvent.click(screen.getByRole("button", { name: "查询员工" })); await screen.findByText("生效规则已变化，请按新规则重新选择员工和填写项目。");
  expect(screen.queryByLabelText("合成员工 · 收入")).toBeNull(); expect(screen.getByLabelText("工资准备说明")).toHaveValue("");
});

it("auth context changes abort reads and discard the prior draft", async () => {
  const view=render(<PayrollInputPreparation/>);
  await screen.findByRole("option",{name:"2026-10"});await screen.findByRole("option",{name:"工资规则"});
  fireEvent.change(screen.getByLabelText("工资期间"),{target:{value:"period"}});fireEvent.change(screen.getByLabelText("工资规则"),{target:{value:"rules"}});
  fireEvent.click(await screen.findByLabelText("选择 合成员工（SYN）"));fill();
  const signal=state.api.payrollPreparation.mock.calls[0]![2] as AbortSignal;
  state.user={...state.user,park_id:"other",permissions:[]};view.rerender(<PayrollInputPreparation/>);
  expect(signal.aborted).toBe(true);expect(screen.queryByLabelText("合成员工 · 收入")).toBeNull();
});

it("closed-period correction binds its window and requires the complete original roster", async () => {
  const correction = { periodId: "period", month: "2026-10", windowId: "window", ruleSetId: "rules", ruleName: "工资规则", originalRunId: "original", originalRunNo: 1 };
  state.api.payrollPreparation.mockResolvedValue({ ...data, correctionWindowId: "window", correctionOfRunId: "original", correctionEmployeeCount: 2, total: 2 });
  render(<PayrollInputPreparation correction={correction}/>);
  fireEvent.click(await screen.findByLabelText("选择 合成员工（SYN）")); fill();
  expect(state.api.payrollPeriods).not.toHaveBeenCalled(); expect(state.api.payrollRules).not.toHaveBeenCalled();
  expect(screen.getByLabelText("工资期间")).toBeDisabled(); expect(screen.getByLabelText("工资规则")).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "保存工资输入草稿" })); await screen.findByText("更正须保留原完整名单，请选择全部 2 位员工。"); expect(state.api.createPayrollInput).not.toHaveBeenCalled();
  state.api.payrollPreparation.mockResolvedValue({ ...data, correctionWindowId: "window", correctionOfRunId: "original", correctionEmployeeCount: 1, total: 1 });
  fireEvent.click(screen.getByRole("button", { name: "查询员工" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "保存工资输入草稿" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "保存工资输入草稿" })); await waitFor(() => expect(state.api.createPayrollInput).toHaveBeenCalledTimes(1));
  expect(state.api.createPayrollInput.mock.calls[0]![0].correctionWindowId).toBe("window");
  expect(state.api.payrollPreparation.mock.calls[0]![0].correctionWindowId).toBe("window");
});

it("a stale correction response cannot enable preparation or keep the previous context draft", async () => {
  const correction = { periodId: "period", month: "2026-10", windowId: "window", ruleSetId: "rules", ruleName: "工资规则", originalRunId: "original", originalRunNo: 1 };
  state.api.payrollPreparation.mockResolvedValue({ ...data, correctionWindowId: "old-window" });
  render(<PayrollInputPreparation correction={correction}/>);
  await screen.findByText("更正窗口已变化，请刷新期间状态后继续。"); expect(screen.getByRole("button", { name: "保存工资输入草稿" })).toBeDisabled();
});


it("correction search totals never replace the complete original roster count", async () => {
  const correction = { periodId: "period", month: "2026-10", windowId: "window", ruleSetId: "rules", ruleName: "工资规则", originalRunId: "original", originalRunNo: 1 };
  const second = { ...candidate, employeeId: "second", employeeCode: "SECOND", fullName: "第二员工" };
  const complete = { ...data, correctionWindowId: "window", correctionOfRunId: "original", correctionEmployeeCount: 2, total: 2, items: [candidate, second] };
  state.api.payrollPreparation.mockResolvedValue(complete);
  render(<PayrollInputPreparation correction={correction}/>);
  fireEvent.click(await screen.findByLabelText("选择 合成员工（SYN）")); fill();
  state.api.payrollPreparation.mockResolvedValue({ ...complete, total: 1, items: [second] });
  fireEvent.change(screen.getByLabelText("搜索员工"), { target: { value: "第二" } });
  fireEvent.click(screen.getByRole("button", { name: "查询员工" }));
  await waitFor(() => expect(screen.queryByLabelText("选择 合成员工（SYN）")).toBeNull());
  fireEvent.click(screen.getByRole("button", { name: "保存工资输入草稿" }));
  await screen.findByText("更正须保留原完整名单，请选择全部 2 位员工。");
  expect(state.api.createPayrollInput).not.toHaveBeenCalled();
  fireEvent.click(screen.getByLabelText("选择 第二员工（SECOND）"));
  fireEvent.change(screen.getByLabelText("第二员工 · 收入"), { target: { value: "100.00" } });
  fireEvent.change(screen.getByLabelText("第二员工 · 税"), { target: { value: "0" } });
  fireEvent.click(screen.getByRole("button", { name: "保存工资输入草稿" }));
  await waitFor(() => expect(state.api.createPayrollInput).toHaveBeenCalledTimes(1));
  expect(state.api.createPayrollInput.mock.calls[0]![0].employees.map((row: { employeeId: string }) => row.employeeId)).toEqual(["employee", "second"]);
});
