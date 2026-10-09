import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { HR_PERMISSIONS } from "@jinhu/shared";
import { PayrollPeriodOperations } from "../../app/hr/payroll/PayrollPeriodOperations";
const state = vi.hoisted(() => ({ user: { id: "operator", tenant_id: "tenant", park_id: "park", permissions: [] as string[] }, api: {
  payrollPeriods: vi.fn(), payrollPeriodLifecycle: vi.fn(), payrollCorrectionOptions: vi.fn(), closePayrollPeriod: vi.fn(), openPayrollCorrection: vi.fn(), cancelPayrollCorrection: vi.fn(), completePayrollCorrection: vi.fn(),
} }));
vi.mock("../../lib/auth-context", () => ({ useAuthUser: () => state.user }));
vi.mock("../../lib/authz", () => ({ getAccessToken: () => "synthetic-token" }));
vi.mock("../../lib/hr-api", () => ({ hrApi: state.api }));
const open = { id: "period", month: "2026-10", status: "open", version: 1, confirmedRunCount: 1, pendingRunCount: 0, correctionWindow: null };
const option = { id: "original", runNo: 1, version: 3, ruleName: "正式工资规则", employeeCount: 101 };
const window = { id: "window", periodId: "period", originalRunId: "original", originalRunVersion: 3, ruleSetId: "rules", inputHeadAtOpen: 3, status: "open", version: 1, completedRunId: null, ruleName: "正式工资规则", originalRunNo: 1, activeResult: null };
beforeEach(() => {
  vi.resetAllMocks(); state.user.permissions = [HR_PERMISSIONS.HR_PAYROLL_READ, HR_PERMISSIONS.HR_PAYROLL_MANAGE, HR_PERMISSIONS.HR_PAYROLL_CONFIRM, HR_PERMISSIONS.HR_PAYROLL_DETAIL_READ, HR_PERMISSIONS.HR_EMPLOYEE_READ];
  state.api.payrollPeriods.mockResolvedValue([{ id: "period", periodMonth: "2026-10-01" }]);
  state.api.payrollPeriodLifecycle.mockResolvedValue(open);
  state.api.payrollCorrectionOptions.mockResolvedValue({ items: [option], total: 21, page: 1, page_size: 20 });
});
async function selectPeriod() { fireEvent.change(await screen.findByLabelText("关账与更正期间"), { target: { value: "period" } }); await screen.findByText(/已确认 1 批/); }
it("no read capability probes nothing; metadata readers get no actions or correction choices", async () => {
  state.user.permissions = []; const view = render(<PayrollPeriodOperations onUseCorrection={vi.fn()}/>);
  expect(state.api.payrollPeriods).not.toHaveBeenCalled(); view.unmount();
  state.user.permissions = [HR_PERMISSIONS.HR_PAYROLL_READ]; render(<PayrollPeriodOperations onUseCorrection={vi.fn()}/>);
  await screen.findByRole("option", { name: "2026-10" }); await selectPeriod();
  expect(screen.queryByRole("button", { name: "确认关账" })).toBeNull(); expect(state.api.payrollCorrectionOptions).not.toHaveBeenCalled();
});
it("pending runs prevent close and failed close preserves reason and exact retry key", async () => {
  state.api.payrollPeriodLifecycle.mockResolvedValueOnce({ ...open, pendingRunCount: 1 });
  render(<PayrollPeriodOperations onUseCorrection={vi.fn()}/>); await screen.findByRole("option", { name: "2026-10" }); await selectPeriod();
  fireEvent.change(screen.getByLabelText("关账理由"), { target: { value: "当期核对完毕" } });
  expect(screen.getByRole("button", { name: "确认关账" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "刷新期间状态" })); await waitFor(() => expect(screen.getByRole("button", { name: "确认关账" })).toBeEnabled());
  state.api.closePayrollPeriod.mockRejectedValueOnce(new Error("合成关账失败")).mockResolvedValue({ ...open, status: "closed", version: 2 });
  fireEvent.click(screen.getByRole("button", { name: "确认关账" })); await screen.findByText("合成关账失败");
  expect(screen.getByLabelText("关账理由")).toHaveValue("当期核对完毕");
  state.api.payrollPeriodLifecycle.mockResolvedValue({ ...open, status: "closed", version: 2 });
  fireEvent.click(screen.getByRole("button", { name: "确认关账" })); await screen.findByText("期间已关账，后续修正请发起更正。");
  expect(state.api.closePayrollPeriod.mock.calls[0]).toEqual(state.api.closePayrollPeriod.mock.calls[1]);
  expect(state.api.closePayrollPeriod.mock.calls[0]![1]).toEqual({ expectedVersion: 1, reason: "当期核对完毕" });
});
it("cross-page selection keeps business identity and a committed refresh failure cannot repeat opening", async () => {
  state.api.payrollPeriodLifecycle.mockResolvedValue({ ...open, status: "closed", version: 2 });
  render(<PayrollPeriodOperations onUseCorrection={vi.fn()}/>); await screen.findByRole("option", { name: "2026-10" }); await selectPeriod();
  fireEvent.click(await screen.findByRole("button", { name: "选择更正此批次" }));
  state.api.payrollCorrectionOptions.mockResolvedValue({ items: [{ ...option, id: "other", runNo: 2 }], total: 21, page: 2, page_size: 20 });
  fireEvent.click(screen.getByRole("button", { name: "更正候选下一页" })); await screen.findByText("第 2 批 · 正式工资规则");
  expect(screen.getByText("已选：第 1 批 · 正式工资规则")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("发起更正原因"), { target: { value: "核对后更正" } });
  let finish!: (value: object) => void; state.api.openPayrollCorrection.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const button = screen.getByRole("button", { name: "发起关账后更正" }); fireEvent.click(button); fireEvent.click(button);
  expect(state.api.openPayrollCorrection).toHaveBeenCalledTimes(1); expect(screen.getByLabelText("关账与更正期间")).toBeDisabled();
  state.api.payrollPeriodLifecycle.mockRejectedValue(new Error("refresh failed"));
  await act(async () => finish(window)); await screen.findByText(/操作已提交，状态刷新失败/);
  expect(screen.getByRole("button", { name: "发起关账后更正" })).toBeDisabled();
  expect(state.api.openPayrollCorrection.mock.calls[0]![1]).toEqual({ expectedVersion: 2, originalRunId: "original", expectedRunVersion: 3, reason: "核对后更正" });
});
it("reload restores the window and supplies bound business context to preparation", async () => {
  const use = vi.fn(); state.api.payrollPeriodLifecycle.mockResolvedValue({ ...open, status: "closed", version: 2, correctionWindow: window });
  render(<PayrollPeriodOperations onUseCorrection={use}/>); await screen.findByRole("option", { name: "2026-10" }); await selectPeriod();
  fireEvent.click(screen.getByRole("button", { name: "继续准备更正输入及核算" }));
  expect(use).toHaveBeenCalledWith({ periodId: "period", month: "2026-10", windowId: "window", ruleSetId: "rules", ruleName: "正式工资规则", originalRunId: "original", originalRunNo: 1 });
  expect(state.api.payrollCorrectionOptions).not.toHaveBeenCalled();
});
it("pending results hide cancellation and completion; confirmed results complete the exact result", async () => {
  const use = vi.fn(); const activeResult = { id: "result", runNo: 2, status: "calculated", version: 1 };
  state.api.payrollPeriodLifecycle.mockResolvedValue({ ...open, status: "closed", version: 2, correctionWindow: { ...window, activeResult } });
  render(<PayrollPeriodOperations onUseCorrection={use}/>); await screen.findByRole("option", { name: "2026-10" }); await selectPeriod();
  expect(screen.queryByRole("button", { name: "取消此次更正" })).toBeNull(); expect(screen.queryByRole("button", { name: "完成此次更正" })).toBeNull();
  state.api.payrollPeriodLifecycle.mockResolvedValue({ ...open, status: "closed", version: 2, correctionWindow: { ...window, activeResult: { ...activeResult, status: "confirmed", version: 3 } } });
  fireEvent.click(screen.getByRole("button", { name: "刷新期间状态" }));
  fireEvent.change(await screen.findByLabelText("更正收口理由"), { target: { value: "更正核对完毕" } });
  const complete = await screen.findByRole("button", { name: "完成此次更正" });
  state.api.completePayrollCorrection.mockResolvedValue({ ...window, status: "completed" }); state.api.payrollPeriodLifecycle.mockResolvedValue({ ...open, status: "closed", version: 2 });
  fireEvent.click(complete); await screen.findByText("更正已完成，原批次和更正批次均保留。");
  expect(state.api.completePayrollCorrection.mock.calls[0]!.slice(0, 2)).toEqual(["window", { expectedVersion: 1, completedRunId: "result", reason: "更正核对完毕" }]); expect(use).toHaveBeenCalledWith(null);
});
it("context change aborts private period reads and removes prior window", async () => {
  state.api.payrollPeriodLifecycle.mockResolvedValue({ ...open, status: "closed", version: 2, correctionWindow: window });
  const view = render(<PayrollPeriodOperations onUseCorrection={vi.fn()}/>); await screen.findByRole("option", { name: "2026-10" }); await selectPeriod();
  const signal = state.api.payrollPeriodLifecycle.mock.calls[0]![2] as AbortSignal;
  state.user = { ...state.user, park_id: "other", permissions: [] }; view.rerender(<PayrollPeriodOperations onUseCorrection={vi.fn()}/>);
  expect(signal.aborted).toBe(true); expect(screen.queryByText(/进行中的更正/)).toBeNull();
});


it("failed lifecycle refresh disables stale writes until current context is restored", async () => {
  render(<PayrollPeriodOperations onUseCorrection={vi.fn()}/>);
  await screen.findByRole("option", { name: "2026-10" }); await selectPeriod();
  fireEvent.change(screen.getByLabelText("关账理由"), { target: { value: "当期核对完毕" } });
  expect(screen.getByRole("button", { name: "确认关账" })).toBeEnabled();
  state.api.payrollPeriodLifecycle.mockRejectedValueOnce(new Error("状态读取失败"));
  fireEvent.click(screen.getByRole("button", { name: "刷新期间状态" }));
  await screen.findByText("状态读取失败");
  expect(screen.getByRole("button", { name: "确认关账" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "确认关账" }));
  expect(state.api.closePayrollPeriod).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "刷新期间状态" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "确认关账" })).toBeEnabled());
  expect(screen.getByLabelText("关账理由")).toHaveValue("当期核对完毕");
});
