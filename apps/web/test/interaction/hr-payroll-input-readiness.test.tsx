import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { HR_PERMISSIONS } from "@jinhu/shared";
import { HrPayrollClient } from "../../app/hr/payroll/HrPayrollClient";
import { hrApi, type HrPayrollReconciliationSetup } from "../../lib/hr-api";

const context = vi.hoisted(() => ({ user: { id: "synthetic", tenant_id: "tenant", park_id: "park", permissions: [] as string[] } }));
vi.mock("../../lib/auth-context", () => ({ useAuthUser: () => context.user }));
vi.mock("../../lib/authz", () => ({ getAccessToken: () => "synthetic-token" }));
vi.mock("../../components/auth/PermissionGuard", () => ({ PermissionGuard: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("../../lib/hr-api", () => ({ hrApi: { payrollReconciliations: vi.fn(), payrollReconciliationSetup: vi.fn(), payrollInsuranceSourceOptions: vi.fn(), simulatePayrollReconciliation: vi.fn() } }));

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
});

it("does not offer attendance navigation without attendance access", async () => {
  context.user.permissions = context.user.permissions.filter(permission => permission !== HR_PERMISSIONS.HR_ATTENDANCE_PAYROLL_INPUT_READ);
  render(<HrPayrollClient />);
  await screen.findByRole("heading", { name: "核对输入准备" });
  expect(screen.queryByRole("link", { name: "查看考勤与月结" })).not.toBeInTheDocument();
});
