import { webcrypto } from "node:crypto";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { HR_PERMISSIONS } from "@jinhu/shared";
import { PayrollModernOperations } from "../../app/hr/payroll/PayrollModernOperations";

const state = vi.hoisted(() => ({
  user: { id: "author", tenant_id: "tenant", park_id: "park", permissions: [] as string[] },
  detailReads: 0,
  api: {
    payrollTrialOptions: vi.fn(), payrollPeriods: vi.fn(), payrollRules: vi.fn(), payrollPreparation: vi.fn(), createPayrollInput: vi.fn(),
    payrollInputs: vi.fn(), payrollInput: vi.fn(),
  },
}));

vi.mock("../../lib/auth-context", () => ({ useAuthUser: () => state.user }));
vi.mock("../../lib/authz", () => ({ getAccessToken: () => "synthetic-token" }));
vi.mock("../../lib/hr-api", () => ({ hrApi: state.api }));
vi.mock("../../app/hr/payroll/PayrollPeriodOperations", () => ({ PayrollPeriodOperations: () => null }));
vi.mock("../../app/hr/payroll/PayrollRunCreation", () => ({ PayrollRunCreation: () => null }));
vi.mock("../../app/hr/payroll/PayrollRunOperations", () => ({ PayrollRunOperations: () => null }));

const candidate = { employeeId: "employee", expectedEmployeeVersion: 7, employeeCode: "SYN", fullName: "合成员工", hireDate: "2026-07-01", departureDate: null, requiresSettlementWindow: false, eligibility: { eligibleStart: "2026-07-01", eligibleEnd: "2026-07-31", basis: "employment_dates" } };
const source = { reconciliationSourceId: "source", legacyBatchId: "legacy", bookId: "book", bookName: "七月账套", month: "2026-07", recordCount: 1 };
const rule = { id: "approved", ruleSetId: "rules", displayName: "七月工资规则", definition: { roundingPolicy: "line_items_half_up", items: [{ code: "收入", role: "earning", expression: null }, { code: "税", role: "tax", expression: null }] } };
const ruleSet = { id: "rules", displayName: "七月工资规则", sourceBookId: "book" };

beforeEach(() => {
  vi.resetAllMocks(); state.detailReads = 0;
  state.user = { id: "author", tenant_id: "tenant", park_id: "park", permissions: [HR_PERMISSIONS.HR_PAYROLL_READ, HR_PERMISSIONS.HR_PAYROLL_MANAGE, HR_PERMISSIONS.HR_PAYROLL_DETAIL_READ, HR_PERMISSIONS.HR_EMPLOYEE_READ, HR_PERMISSIONS.HR_PAYROLL_RULE_READ, HR_PERMISSIONS.HR_PAYROLL_RECONCILIATION_CALCULATE] };
  state.api.payrollTrialOptions.mockImplementation(async (query?: { legacyBatchId?: string }) => query?.legacyBatchId
    ? { legacyBatchId: "legacy", month: "2026-07", recordCount: 1, employeeCount: 1, books: [{ bookId: "book", bookName: "七月账套", scheme: "scheme", sources: [{ id: "source", recordCount: 1, itemCount: 2 }], inputs: [], items: [], unavailableCount: 0, duplicateCount: 0 }] }
    : { periods: [{ legacyBatchId: "legacy", month: "2026-07", recordCount: 1, batchCode: "七月来源" }] });
  state.api.payrollPeriods.mockResolvedValue([{ id: "period", periodMonth: "2026-07-01", startDate: "2026-07-01", endDate: "2026-07-31", status: "open" }]);
  state.api.payrollRules.mockResolvedValue({ items: [ruleSet], total: 1, page: 1, page_size: 100 });
  state.api.payrollPreparation.mockImplementation(async (query: { page: number; pageSize: number }) => ({ period: { id: "period", month: "2026-07", startDate: "2026-07-01", endDate: "2026-07-31" }, rule, expectedHeadRevision: 2, source: { ...source, sourceHash: "a".repeat(64), rosterHash: "b".repeat(64) }, items: [candidate], total: 1, page: query.page, page_size: query.pageSize }));
  state.api.createPayrollInput.mockImplementation(async body => ({ ...body, id: "saved-off-first-page", revisionNo: 3, version: 1, status: "draft", employees: body.employees }));
  state.api.payrollInputs.mockResolvedValue({ items: Array.from({ length: 20 }, (_, index) => ({ id: `other-${index}`, displayName: "其他输入", revisionNo: 1, status: "draft", employeeCount: 1 })), total: 21, page: 1, page_size: 20 });
  state.api.payrollInput.mockImplementation(async (id: string, query: { page: number; pageSize: number }) => {
    expect(id).toBe("saved-off-first-page");
    state.detailReads += 1;
    if (state.detailReads === 1) throw new Error("首次详情读取失败");
    return { id, periodId: "period", ruleSetId: "rules", ruleVersionId: "approved", revisionNo: 3, version: 2, status: "confirmed", reason: "完整名单核对", employees: [{ ...candidate, directItems: { 收入: "123.4500", 税: "0.0000" } }], total: 1, page: query.page, page_size: query.pageSize, canEdit: false, canConfirm: false };
  });
});

it("composes source save with an empty input period into a retriable off-page exact draft review", async () => {
  render(<PayrollModernOperations />);
  await screen.findByRole("option", { name: /2026-07.*七月来源/ });
  fireEvent.change(screen.getByLabelText("试算来源与月份"), { target: { value: "legacy:2026-07" } });
  await screen.findByLabelText("冻结原工资来源");
  fireEvent.change(screen.getByLabelText("冻结原工资来源"), { target: { value: "source" } });
  fireEvent.click(screen.getByRole("button", { name: "准备本账套完整员工输入" }));
  await screen.findByRole("option", { name: "七月工资规则" });
  fireEvent.change(screen.getByLabelText("工资期间"), { target: { value: "period" } });
  fireEvent.change(screen.getByLabelText("工资规则"), { target: { value: "rules" } });
  await screen.findByRole("button", { name: "带入本账套全部 1 位员工" });
  fireEvent.click(screen.getByRole("button", { name: "带入本账套全部 1 位员工" }));
  await screen.findByLabelText("合成员工 · 收入");
  fireEvent.change(screen.getByLabelText("合成员工 · 收入"), { target: { value: "123.4500" } });
  fireEvent.change(screen.getByLabelText("合成员工 · 税"), { target: { value: "0.0000" } });
  fireEvent.change(screen.getByLabelText("工资准备说明"), { target: { value: "完整名单核对" } });
  fireEvent.click(screen.getByRole("button", { name: "保存工资输入草稿" }));
  await screen.findByRole("button", { name: "查看本次输入草稿" });
  expect(state.api.createPayrollInput.mock.calls[0]![0].employees[0].directItems).toEqual({ 收入: "123.4500", 税: "0.0000" });
  fireEvent.click(screen.getByRole("button", { name: "查看本次输入草稿" }));
  await screen.findByText("首次详情读取失败");
  expect(state.api.payrollInput).toHaveBeenCalledWith("saved-off-first-page", { page: 1, pageSize: 20 }, "synthetic-token", expect.any(AbortSignal));
  fireEvent.click(screen.getByRole("button", { name: "重试读取本次输入草稿" }));
  const detail = await screen.findByRole("region", { name: "工资输入明细" });
  expect(within(detail).getByText(/已确认/)).toBeVisible();
  expect(screen.queryByRole("button", { name: "确认整批工资输入" })).toBeNull();
  expect(state.detailReads).toBe(2);
  const readsBeforeReturn = state.api.payrollTrialOptions.mock.calls.length;
  fireEvent.click(within(detail).getByRole("button", { name: "返回本账套 2026-07 月核对" }));
  await waitFor(() => expect(state.api.payrollTrialOptions.mock.calls.length).toBeGreaterThan(readsBeforeReturn));
  fireEvent.click(within(detail).getByRole("button", { name: "返回本账套 2026-07 月核对" }));
  await waitFor(() => expect(state.api.payrollTrialOptions.mock.calls.length).toBeGreaterThan(readsBeforeReturn + 1));
  expect(screen.getByRole("button", { name: "全账套试算并逐项核对" })).toBeDisabled();
});

beforeAll(() => vi.stubGlobal("crypto", webcrypto));
afterAll(() => vi.unstubAllGlobals());
