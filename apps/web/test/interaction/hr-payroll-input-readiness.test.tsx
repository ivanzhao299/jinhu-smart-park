import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { HR_PERMISSIONS } from "@jinhu/shared";
import { HrPayrollClient } from "../../app/hr/payroll/HrPayrollClient";
import { hrApi, type HrPayrollReconciliationSetup } from "../../lib/hr-api";

const context = vi.hoisted(() => ({ user: { id: "synthetic", tenant_id: "tenant", park_id: "park", permissions: [] as string[] } }));
vi.mock("../../lib/auth-context", () => ({ useAuthUser: () => context.user }));
vi.mock("../../lib/authz", () => ({ getAccessToken: () => "synthetic-token" }));
vi.mock("../../components/auth/PermissionGuard", () => ({ PermissionGuard: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("../../lib/hr-api", () => ({ hrApi: {
  payrollReconciliations: vi.fn(), payrollReconciliationSetup: vi.fn(), payrollInsuranceSourceOptions: vi.fn(), simulatePayrollReconciliation: vi.fn(),
  payrollRules: vi.fn(), payrollRuleVersions: vi.fn(), payrollHistoryBooks: vi.fn(), payrollHistoryFormulas: vi.fn(), payrollHistoryCatalogItems: vi.fn(), payrollHistoryTaxRules: vi.fn(), payrollHistoryReviewCases: vi.fn(),
} }));

const source = (id: string, month: string) => ({ id, legacyBatchId: "import", bookId: "book", bookName: "测试账套", periodMonth: `${month}-01`, snapshotCount: 1, itemCount: 1 });
const setup: HrPayrollReconciliationSetup = {
  books: [], netItems: [], sourceBatches: [],
  legacyBatches: [{ id: "published", batchCode: "synthetic", sourceRowCount: 1, publishedAt: "2026-01-01" }],
  frozenSources: [source("july", "2026-07"), source("august", "2026-08")],
  attendanceBatches: [
    { id: "july-attendance", periodMonth: "2026-07-01", batchNo: 1, batchType: "initial" },
    { id: "august-attendance", periodMonth: "2026-08-01", batchNo: 2, batchType: "initial" },
  ],
};
const choice = { employeeId: "employee", sourceId: "insurance", sourceKind: "modern_confirmed" as const, expectedVersion: 1, expectedHash: "a".repeat(64) };

beforeEach(() => {
  vi.clearAllMocks();
  context.user = { id: "synthetic", tenant_id: "tenant", park_id: "park", permissions: [HR_PERMISSIONS.HR_PAYROLL_RECONCILIATION_CALCULATE, HR_PERMISSIONS.HR_EMPLOYEE_READ, HR_PERMISSIONS.HR_INSURANCE_READ, HR_PERMISSIONS.HR_INSURANCE_AMOUNT_READ, HR_PERMISSIONS.HR_ATTENDANCE_PAYROLL_INPUT_READ] };
  vi.mocked(hrApi.payrollReconciliations).mockResolvedValue({ items: [], total: 0, page: 1, page_size: 20 });
  vi.mocked(hrApi.payrollReconciliationSetup).mockResolvedValue(setup);
  vi.mocked(hrApi.payrollInsuranceSourceOptions).mockResolvedValue({ items: [{ employeeId: "employee", employeeCode: "SYN-1", fullName: "合成员工", options: [choice] }], total: 1, page: 1, page_size: 50, periodMonth: "2026-08-01" });
  vi.mocked(hrApi.payrollRules).mockResolvedValue({ items: [], total: 0, page: 1, page_size: 20 });
  vi.mocked(hrApi.payrollHistoryBooks).mockResolvedValue({ items: [], total: 0, page: 1, page_size: 20 });
  vi.mocked(hrApi.payrollHistoryFormulas).mockResolvedValue({ items: [], total: 0, page: 1, page_size: 20 });
  vi.mocked(hrApi.payrollHistoryCatalogItems).mockResolvedValue({ items: [], total: 0, page: 1, page_size: 20 });
  vi.mocked(hrApi.payrollHistoryTaxRules).mockResolvedValue({ items: [], total: 0, page: 1, page_size: 20 });
  vi.mocked(hrApi.payrollHistoryReviewCases).mockResolvedValue({ items: [], total: 0, page: 1, page_size: 20 });
});

it("shows missing inputs without choosing a source, month or issuing an insurance request", async () => {
  vi.mocked(hrApi.payrollReconciliationSetup).mockResolvedValue({ ...setup, legacyBatches: [], frozenSources: [], attendanceBatches: [] });
  render(<HrPayrollClient />);
  await screen.findByRole("heading", { name: "核对输入准备" });
  expect(screen.getByText(/尚无可选来源/)).toBeVisible();
  expect(screen.getByText(/没有已关闭且生效的考勤输入/)).toBeVisible();
  expect(screen.getByRole("link", { name: "查看考勤与月结" })).toHaveAttribute("href", "/hr/attendance");
  expect(screen.getByLabelText("历史工资核对来源")).toHaveValue("");
  expect(screen.getByLabelText("已关闭且生效的考勤输入")).toBeDisabled();
  expect(screen.getByRole("button", { name: "开始只算不发" })).toBeDisabled();
  expect(hrApi.payrollInsuranceSourceOptions).not.toHaveBeenCalled();
});

it("clears incompatible attendance and insurance choices when selecting another frozen month", async () => {
  render(<HrPayrollClient />);
  const attendance = await screen.findByLabelText("已关闭且生效的考勤输入");
  const sources = screen.getByLabelText("历史工资核对来源");
  fireEvent.change(attendance, { target: { value: "july-attendance" } });
  fireEvent.change(sources, { target: { value: "source:august" } });
  expect(attendance).toHaveValue("");
  expect(within(attendance).queryByRole("option", { name: /2026-07/ })).not.toBeInTheDocument();
  expect(hrApi.payrollInsuranceSourceOptions).not.toHaveBeenCalled();
  fireEvent.change(attendance, { target: { value: "august-attendance" } });
  const insurance = await screen.findByLabelText("合成员工的社保来源");
  expect(hrApi.payrollInsuranceSourceOptions).toHaveBeenCalledWith({ legacyBatchId: "import", reconciliationSourceId: "august", attendanceInputBatchId: "august-attendance" }, "synthetic-token", 1, expect.any(AbortSignal));
  expect(insurance).toHaveValue("");
  fireEvent.change(insurance, { target: { value: "0" } });
  expect(screen.getByRole("button", { name: "开始只算不发" })).toBeEnabled();
  expect(screen.getByText(/仍须核对本期规则、人员资料和系统校验/)).toBeVisible();
  expect(screen.queryByText(/社保来源已全部选择，可提交模拟核对/)).not.toBeInTheDocument();
  fireEvent.change(sources, { target: { value: "source:july" } });
  await waitFor(() => expect(screen.queryByLabelText("合成员工的社保来源")).not.toBeInTheDocument());
  expect(attendance).toHaveValue("");
  expect(screen.getByRole("button", { name: "开始只算不发" })).toBeDisabled();
  expect(hrApi.payrollInsuranceSourceOptions).toHaveBeenCalledTimes(1);
  expect(hrApi.simulatePayrollReconciliation).not.toHaveBeenCalled();
});

it("preserves the published path without guessing a period from batch publication time", async () => {
  render(<HrPayrollClient />);
  const sources = await screen.findByLabelText("历史工资核对来源");
  fireEvent.change(sources, { target: { value: "published:published" } });
  const attendance = screen.getByLabelText("已关闭且生效的考勤输入");
  expect(within(attendance).getAllByRole("option")).toHaveLength(3);
  fireEvent.change(attendance, { target: { value: "august-attendance" } });
  await screen.findByLabelText("合成员工的社保来源");
  expect(hrApi.payrollInsuranceSourceOptions).toHaveBeenCalledWith({ legacyBatchId: "published", attendanceInputBatchId: "august-attendance" }, "synthetic-token", 1, expect.any(AbortSignal));
  expect(screen.getByText(/可能涉及多个账套，需逐账套确认/)).toBeVisible();
});

it("does not offer attendance navigation without attendance access", async () => {
  context.user.permissions = context.user.permissions.filter(permission => permission !== HR_PERMISSIONS.HR_ATTENDANCE_PAYROLL_INPUT_READ);
  render(<HrPayrollClient />);
  await screen.findByRole("heading", { name: "核对输入准备" });
  expect(screen.queryByRole("link", { name: "查看考勤与月结" })).not.toBeInTheDocument();
});

it("presents visible frozen-book policy metadata as bounded preparation evidence and preserves preparation when opening it", async () => {
  vi.mocked(hrApi.payrollReconciliationSetup).mockResolvedValue({
    ...setup,
    books: [{ id: "book", bookName: "测试账套", legacyScheme: "legacy", policyVersionId: "policy", netItemVersionId: "net", netItemName: "实发工资", toleranceAmount: "0.1000", policyVersion: 2 }],
    netItems: [{ bookId: "book", id: "net", displayName: "实发工资", itemCode: "NET", versionNo: 3 }],
  });
  context.user.permissions = [...context.user.permissions, HR_PERMISSIONS.HR_PAYROLL_RECONCILIATION_REVIEW];
  render(<HrPayrollClient />);
  const sourceSelect = await screen.findByLabelText("历史工资核对来源");
  fireEvent.change(sourceSelect, { target: { value: "source:july" } });
  expect(screen.getByText(/当前策略使用 实发工资（NET · V3）/)).toBeVisible();
  expect(screen.getByText(/仅展示当前列表可见的候选/)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "查看或追加净额核对策略" }));
  expect(screen.getByRole("heading", { name: "账套净额核对策略" })).toBeVisible();
  expect(sourceSelect).toHaveValue("source:july");
});

it("treats a policy whose net-item pair is absent from the bounded candidates as unverified", async () => {
  vi.mocked(hrApi.payrollReconciliationSetup).mockResolvedValue({
    ...setup,
    books: [{ id: "book", bookName: "测试账套", legacyScheme: "legacy", policyVersionId: "policy", netItemVersionId: "missing-net-item", netItemName: "实发工资", toleranceAmount: "0.1000", policyVersion: 2 }],
    netItems: [{ bookId: "book", id: "net", displayName: "实发工资", itemCode: "NET", versionNo: 3 }],
  });
  render(<HrPayrollClient />);
  const sourceSelect = await screen.findByLabelText("历史工资核对来源");
  fireEvent.change(sourceSelect, { target: { value: "source:july" } });
  expect(screen.getByText(/已有策略，但未显示关联项目/)).toBeVisible();
  expect(screen.queryByText(/当前策略使用 实发工资/)).not.toBeInTheDocument();
});

it("labels a missing visible frozen-book configuration as unknown and routes rule-read actors to the existing rules workspace", async () => {
  context.user.permissions = [...context.user.permissions, HR_PERMISSIONS.HR_PAYROLL_RULE_READ];
  render(<HrPayrollClient />);
  fireEvent.click(screen.getByRole("button", { name: /双轨差异/ }));
  const sourceSelect = await screen.findByLabelText("历史工资核对来源");
  fireEvent.change(sourceSelect, { target: { value: "source:july" } });
  expect(screen.getByText(/当前列表未显示该账套的规则信息/)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "进入规则工作区核对" }));
  expect(await screen.findByRole("heading", { name: "工资业务规则" })).toBeVisible();
});
