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

const candidate = { employeeId: "employee-0", expectedEmployeeVersion: 7, employeeCode: "SYN-0", fullName: "合成员工 0", hireDate: "2026-07-01", departureDate: null, requiresSettlementWindow: false, eligibility: { eligibleStart: "2026-07-01", eligibleEnd: "2026-07-31", basis: "employment_dates" } };
const roster = Array.from({ length: 54 }, (_, index) => ({ ...candidate, employeeId: `employee-${index}`, employeeCode: `SYN-${index}`, fullName: `合成员工 ${index}` }));
const source = { reconciliationSourceId: "source", legacyBatchId: "legacy", bookId: "book", bookName: "七月账套", month: "2026-07", recordCount: 54 };
const rule = { id: "approved", ruleSetId: "rules", displayName: "七月工资规则", definition: { roundingPolicy: "line_items_half_up", items: [{ code: "收入", role: "earning", expression: null }, { code: "税", role: "tax", expression: null }] } };
const ruleSet = { id: "rules", displayName: "七月工资规则", sourceBookId: "book" };

beforeEach(() => {
  vi.resetAllMocks(); state.detailReads = 0;
  state.user = { id: "author", tenant_id: "tenant", park_id: "park", permissions: [HR_PERMISSIONS.HR_PAYROLL_READ, HR_PERMISSIONS.HR_PAYROLL_MANAGE, HR_PERMISSIONS.HR_PAYROLL_DETAIL_READ, HR_PERMISSIONS.HR_EMPLOYEE_READ, HR_PERMISSIONS.HR_PAYROLL_RULE_READ, HR_PERMISSIONS.HR_PAYROLL_HISTORY_READ, HR_PERMISSIONS.HR_PAYROLL_RECONCILIATION_CALCULATE] };
  state.api.payrollTrialOptions.mockImplementation(async (query?: { legacyBatchId?: string }) => query?.legacyBatchId
    ? { legacyBatchId: "legacy", month: "2026-07", recordCount: 54, employeeCount: 54, books: [{ bookId: "book", bookName: "七月账套", scheme: "scheme", sources: [{ id: "source", recordCount: 54, itemCount: 2 }], inputs: [], items: [], unavailableCount: 0, duplicateCount: 0 }] }
    : { periods: [{ legacyBatchId: "legacy", month: "2026-07", recordCount: 54, batchCode: "七月来源" }] });
  state.api.payrollPeriods.mockResolvedValue([{ id: "period", periodMonth: "2026-07-01", startDate: "2026-07-01", endDate: "2026-07-31", status: "open" }]);
  state.api.payrollRules.mockResolvedValue({ items: [ruleSet], total: 1, page: 1, page_size: 100 });
  state.api.payrollPreparation.mockImplementation(async (query: { page: number; pageSize: number; includeSourceValues?: boolean }) => ({ period: { id: "period", month: "2026-07", startDate: "2026-07-01", endDate: "2026-07-31" }, rule, expectedHeadRevision: 2, source: { ...source, sourceHash: "a".repeat(64), rosterHash: "b".repeat(64) }, items: roster.slice((query.page - 1) * query.pageSize, query.page * query.pageSize).map((employee, index) => {
    const absolute = (query.page - 1) * query.pageSize + index;
    if (!query.includeSourceValues) return employee;
    if (absolute === 0) return { ...employee, sourceValues: { values: { 税: "0.0000" }, issues: [{ code: "收入", reason: "source_null" }] } };
    if (absolute === 1) return { ...employee, sourceValues: { values: { 税: "0.0000" }, issues: [{ code: "收入", reason: "non_decimal" }] } };
    return { ...employee, sourceValues: { values: absolute === 53 ? { 收入: "9999999999999999.9999", 税: "-0.0100" } : { 收入: "123.4500", 税: "0.0000" }, issues: [] } };
  }), total: 54, page: query.page, page_size: query.pageSize }));
  state.api.createPayrollInput.mockImplementation(async body => ({ ...body, id: "saved-off-first-page", revisionNo: 3, version: 1, status: "draft", employees: body.employees }));
  state.api.payrollInputs.mockResolvedValue({ items: Array.from({ length: 20 }, (_, index) => ({ id: `other-${index}`, displayName: "其他输入", revisionNo: 1, status: "draft", employeeCount: 1 })), total: 21, page: 1, page_size: 20 });
  state.api.payrollInput.mockImplementation(async (id: string, query: { page: number; pageSize: number }) => {
    expect(id).toBe("saved-off-first-page");
    state.detailReads += 1;
    if (state.detailReads === 1) throw new Error("首次详情读取失败");
    return { id, periodId: "period", ruleSetId: "rules", ruleVersionId: "approved", revisionNo: 3, version: 2, status: "confirmed", reason: "完整名单核对", employees: [{ ...roster[53], directItems: { 收入: "9999999999999999.9999", 税: "-0.0100" } }], total: 54, page: query.page, page_size: query.pageSize, canEdit: false, canConfirm: false };
  });
});

it("composes source-value preview, retriable save, and off-page exact draft review", async () => {
  render(<PayrollModernOperations />);
  await screen.findByRole("option", { name: /2026-07.*七月来源/ });
  fireEvent.change(screen.getByLabelText("试算来源与月份"), { target: { value: "legacy:2026-07" } });
  await screen.findByLabelText("冻结原工资来源");
  fireEvent.change(screen.getByLabelText("冻结原工资来源"), { target: { value: "source" } });
  fireEvent.click(screen.getByRole("button", { name: "准备本账套完整员工输入" }));
  await screen.findByRole("option", { name: "七月工资规则" });
  fireEvent.change(screen.getByLabelText("工资期间"), { target: { value: "period" } });
  fireEvent.change(screen.getByLabelText("工资规则"), { target: { value: "rules" } });
  await screen.findByRole("button", { name: "预览本账套全部 54 位员工来源数值" });
  fireEvent.click(screen.getByRole("button", { name: "预览本账套全部 54 位员工来源数值" }));
  await screen.findByRole("region", { name: "来源数值预览" });
  fireEvent.click(screen.getByLabelText(/我已核对完整来源预览/));
  fireEvent.click(screen.getByRole("button", { name: "带入当前本地草稿" }));
  await screen.findByLabelText("合成员工 0 · 收入");
  fireEvent.change(screen.getByLabelText("合成员工 0 · 收入"), { target: { value: "456.7800" } });
  fireEvent.change(screen.getByLabelText("合成员工 1 · 收入"), { target: { value: "321.0000" } });
  fireEvent.change(screen.getByLabelText("工资准备说明"), { target: { value: "完整名单核对" } });
  state.api.createPayrollInput.mockRejectedValueOnce(new Error("首次保存失败"));
  fireEvent.click(screen.getByRole("button", { name: "保存工资输入草稿" }));
  await screen.findByText("首次保存失败");
  fireEvent.click(screen.getByRole("button", { name: "保存工资输入草稿" }));
  await screen.findByRole("button", { name: "查看本次输入草稿" });
  expect(state.api.createPayrollInput).toHaveBeenCalledTimes(2);
  expect(state.api.createPayrollInput.mock.calls[0]![2]).toBe(state.api.createPayrollInput.mock.calls[1]![2]);
  expect(state.api.createPayrollInput.mock.calls[0]![0].employees).toHaveLength(54);
  expect(state.api.createPayrollInput.mock.calls[0]![0].employees[0].directItems).toEqual({ 收入: "456.7800", 税: "0.0000" });
  expect(state.api.createPayrollInput.mock.calls[0]![0].employees[53].directItems).toEqual({ 收入: "9999999999999999.9999", 税: "-0.0100" });
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
