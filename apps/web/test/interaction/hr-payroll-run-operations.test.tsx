import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { HR_PERMISSIONS } from "@jinhu/shared";
import { PayrollRunOperations } from "../../app/hr/payroll/PayrollRunOperations";
const state = vi.hoisted(() => ({ user: { id: "reviewer", tenant_id: "tenant", park_id: "park", permissions: [] as string[] }, api: {
  formalPayrollRuns: vi.fn(), formalPayrollRun: vi.fn(), reviewFormalPayrollRun: vi.fn(), confirmFormalPayrollRun: vi.fn(),
} }));
vi.mock("../../lib/auth-context", () => ({ useAuthUser: () => state.user }));
vi.mock("../../lib/authz", () => ({ getAccessToken: () => "synthetic-token" }));
vi.mock("../../lib/hr-api", () => ({ hrApi: state.api }));
const row = { id: "run", periodId: "period", runNo: 1, version: 1, month: "2026-10", ruleName: "当期工资规则", status: "calculated", employeeCount: 21, isCorrection: false };
const detail = { id: "run", periodId: "period", runNo: 1, version: 1, status: "calculated", inputId: "input", ruleVersionId: "rule", employeeCount: 21,
  totals: { grossAmount: "4700.00", deductionAmount: "100.00", personalTax: "80.10", netAmount: "4519.90" }, canReview: true, canConfirm: false,
  items: [{ employeeId: "employee", employeeCode: "SYNTHETIC", fullName: "合成员工", grossAmount: "4700.00", deductionAmount: "100.00", personalTax: "80.10", netAmount: "4519.90",
    calculationVersion: "formal-v1", formulaEngineVersion: "dsl-v1", roundingPolicy: "line_items_half_up", items: [
      { code: "工资", role: "earning", decimalValue: "4700.0000", amount: "4700.00" },
      { code: "工作数量", role: "informational", decimalValue: "1.2345", amount: null },
      { code: "精确大金额", role: "employer_contribution", decimalValue: "9999999999999999.9900", amount: "9999999999999999.99" },
    ] }], total: 21, page: 1, page_size: 20 };
beforeEach(() => {
  vi.resetAllMocks(); state.user = { id: "reviewer", tenant_id: "tenant", park_id: "park", permissions: [HR_PERMISSIONS.HR_PAYROLL_READ, HR_PERMISSIONS.HR_PAYROLL_DETAIL_READ, HR_PERMISSIONS.HR_EMPLOYEE_READ, HR_PERMISSIONS.HR_PAYROLL_REVIEW, HR_PERMISSIONS.HR_PAYROLL_CONFIRM] };
  state.api.formalPayrollRuns.mockResolvedValue({ items: [row], total: 21, page: 1, page_size: 20 }); state.api.formalPayrollRun.mockResolvedValue(detail);
});
async function open() { fireEvent.click(await screen.findByRole("button", { name: "查看核算明细" })); await screen.findByRole("region", { name: "批次工资明细" }); }
it("metadata permissions do not fetch amounts, employee detail or action controls", async () => {
  state.user.permissions = [HR_PERMISSIONS.HR_PAYROLL_READ]; render(<PayrollRunOperations />);
  await screen.findByText("当前权限可查看批次概要。"); expect(state.api.formalPayrollRun).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "查看核算明细" })).toBeNull();
});
it("no payroll-read permission produces no batch probes", () => {
  state.user.permissions = []; render(<PayrollRunOperations />); expect(state.api.formalPayrollRuns).not.toHaveBeenCalled();
});
it("employee projects preserve exact money and informational quantities with paged reads", async () => {
  render(<PayrollRunOperations />); await open(); fireEvent.click(screen.getByRole("button", { name: "查看工资分项（3项）" }));
  expect(screen.getByText("1.2345")).toBeInTheDocument(); expect(screen.getByText("¥9,999,999,999,999,999.99")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "员工下一页" }));
  await waitFor(() => expect(state.api.formalPayrollRun).toHaveBeenLastCalledWith("run", { page: 2, pageSize: 20 }, "synthetic-token", expect.any(AbortSignal)));
});
it("a failed review retains the reason and uses the same request identity on retry", async () => {
  state.api.reviewFormalPayrollRun.mockRejectedValueOnce(new Error("synthetic review failure")).mockResolvedValue({ id: "run", status: "reviewing", version: 2 });
  render(<PayrollRunOperations />); await open(); fireEvent.change(screen.getByLabelText("复核或确认理由"), { target: { value: "核对所有分项" } });
  fireEvent.click(screen.getByRole("button", { name: "复核此批次" })); await screen.findByText("synthetic review failure");
  expect(screen.getByLabelText("复核或确认理由")).toHaveValue("核对所有分项");
  state.api.formalPayrollRun.mockResolvedValue({ ...detail, status: "reviewing", version: 2, canReview: false, canConfirm: true });
  fireEvent.click(screen.getByRole("button", { name: "复核此批次" })); await screen.findByText("批次已复核。");
  expect(state.api.reviewFormalPayrollRun.mock.calls[0]).toEqual(state.api.reviewFormalPayrollRun.mock.calls[1]);
  expect(state.api.reviewFormalPayrollRun.mock.calls[0]![1]).toEqual({ expectedVersion: 1, reason: "核对所有分项" });
  expect(await screen.findByRole("button", { name: "确认批次及工资条" })).toBeDisabled();
});
it("duplicate confirmation owns one flight and committed refresh failure cannot repeat the action", async () => {
  let finish!: (value: object) => void;
  state.api.formalPayrollRun.mockResolvedValue({ ...detail, status: "reviewing", version: 2, canReview: false, canConfirm: true });
  state.api.confirmFormalPayrollRun.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  render(<PayrollRunOperations />); await open(); fireEvent.change(screen.getByLabelText("复核或确认理由"), { target: { value: "确认核算结果" } });
  const button = screen.getByRole("button", { name: "确认批次及工资条" }); fireEvent.click(button); fireEvent.click(button);
  expect(state.api.confirmFormalPayrollRun).toHaveBeenCalledTimes(1); expect(screen.getByLabelText("核算状态")).toBeDisabled();
  state.api.formalPayrollRun.mockRejectedValue(new Error("refresh failed"));
  await act(async () => finish({ id: "run", status: "confirmed", version: 3 }));
  await screen.findByText(/操作已提交，刷新失败/); expect(screen.queryByRole("button", { name: "确认批次及工资条" })).toBeNull();
});
it("backend action eligibility and local authority both gate review buttons", async () => {
  state.api.formalPayrollRun.mockResolvedValue({ ...detail, canReview: false }); render(<PayrollRunOperations />); await open();
  expect(screen.queryByLabelText("复核或确认理由")).toBeNull(); expect(state.api.reviewFormalPayrollRun).not.toHaveBeenCalled();
});
it("context changes abort financial reads and clear selected employee amounts", async () => {
  const view = render(<PayrollRunOperations />); await open(); const signal = state.api.formalPayrollRun.mock.calls[0]![3] as AbortSignal;
  state.user = { ...state.user, park_id: "other" }; view.rerender(<PayrollRunOperations />);
  expect(signal.aborted).toBe(true); expect(screen.queryByRole("region", { name: "批次工资明细" })).toBeNull();
});
