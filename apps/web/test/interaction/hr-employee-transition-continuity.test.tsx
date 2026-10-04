import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { HrEmployeesClient } from "../../app/hr/employees/HrEmployeesClient";
import { hrApi, type HrEmployee } from "../../lib/hr-api";

vi.mock("../../lib/hr-api", () => ({ hrApi: { employees: vi.fn(), employee: vi.fn(), transition: vi.fn() } }));
vi.mock("../../lib/authz", () => ({ getAccessToken: () => "synthetic-test-token" }));
const auth = vi.hoisted(() => ({ permissions: ["hr:employees", "hr:employee:read", "hr:employment:transition"] }));
vi.mock("../../lib/auth-context", () => ({ useAuthUser: () => ({ id: "synthetic-user", permissions: auth.permissions }) }));
vi.mock("../../components/auth/PermissionGuard", () => ({ PermissionGuard: ({ children }: { children: React.ReactNode }) => children }));

const employee = (employmentStatus = "probation"): HrEmployee => ({
  id: "synthetic-employee", employeeCode: "SYN-TRANSITION", fullName: "Synthetic transition",
  userId: null, primaryOrgId: "synthetic-org", positionId: null, managerEmployeeId: "synthetic-manager",
  employmentType: "full_time", employmentStatus, legacyJobstateCode: null, legacyJobstateName: null,
  hireDate: "2020-01-01", departureDate: null, workLocation: null, workMobile: null, workEmail: null,
});
let current: HrEmployee;
beforeEach(() => {
  current = employee();
  auth.permissions = ["hr:employees", "hr:employee:read", "hr:employment:transition"];
  vi.mocked(hrApi.employees).mockReset().mockImplementation(async (_token, page, pageSize, filters) => {
    if (!Object.hasOwn(filters ?? {}, "status")) throw new Error("synthetic candidate outage");
    return { items: [current], total: 1, page: page ?? 1, page_size: pageSize ?? 50 };
  });
  vi.mocked(hrApi.employee).mockReset().mockImplementation(async () => current);
  vi.mocked(hrApi.transition).mockReset().mockImplementation(async (_id, body) => {
    current = { ...current, employmentStatus: "action" in body && body.action === "suspend" ? "suspended" : "active" };
    return current;
  });
});
async function open() {
  render(<HrEmployeesClient />);
  fireEvent.click(await screen.findByRole("button", { name: "查看与办理" }));
  await screen.findByRole("heading", { name: "Synthetic transition · 员工详情" });
}
function submit() {
  const form = screen.getByRole("button", { name: "确认办理并留痕" }).closest("form")!;
  fireEvent.change(form.querySelector<HTMLInputElement>('input[name="effectiveDate"]')!, { target: { value: "2026-10-04" } });
  fireEvent.change(form.querySelector<HTMLInputElement>('input[name="reason"]')!, { target: { value: "Synthetic business decision" } });
  fireEvent.submit(form);
}
it.each(["probation", "suspended", "preboarding"])("%s action does not read transfer candidates or send transfer references", async status => {
  current = employee(status); await open();
  expect(screen.queryByRole("searchbox", { name: "搜索上级候选" })).toBeNull();
  expect(screen.getByRole("button", { name: "确认办理并留痕" })).not.toBeDisabled();
  expect(hrApi.employees).toHaveBeenCalledTimes(1);
  submit();
  await waitFor(() => expect(hrApi.transition).toHaveBeenCalledOnce());
  const body = vi.mocked(hrApi.transition).mock.calls[0]![1];
  expect(body).toEqual({ action: status === "probation" ? "confirm_employment" : status === "suspended" ? "resume" : "start_probation", effectiveDate: "2026-10-04", reason: "Synthetic business decision" });
});
it("a transfer candidate failure blocks transfer, but changing to suspension allows the unrelated action", async () => {
  current = employee("active"); await open();
  await screen.findByText("上级候选加载失败，请重试；原关联未改变。");
  expect(screen.getByRole("button", { name: "确认办理并留痕" })).toBeDisabled();
  const action = screen.getByRole("combobox", { name: "办理事项" });
  fireEvent.change(action, { target: { value: "suspend" } });
  expect(screen.queryByRole("searchbox", { name: "搜索上级候选" })).toBeNull();
  expect(screen.getByRole("button", { name: "确认办理并留痕" })).not.toBeDisabled();
  submit();
  await waitFor(() => expect(hrApi.transition).toHaveBeenCalledWith("synthetic-employee", { action: "suspend", effectiveDate: "2026-10-04", reason: "Synthetic business decision" }, "synthetic-test-token"));
});
it("returning to transfer cannot reuse a non-transfer ready state", async () => {
  current = employee("active"); await open();
  await screen.findByText("上级候选加载失败，请重试；原关联未改变。");
  const action = screen.getByRole("combobox", { name: "办理事项" });
  fireEvent.change(action, { target: { value: "suspend" } });
  fireEvent.change(action, { target: { value: "transfer" } });
  expect(screen.getByRole("button", { name: "确认办理并留痕" })).toBeDisabled();
  submit(); expect(hrApi.transition).not.toHaveBeenCalled();
});
it("normal read-only employees do not gain a transition control", async () => {
  auth.permissions = ["hr:employees", "hr:employee:read"];
  render(<HrEmployeesClient />); fireEvent.click(await screen.findByRole("button", { name: "查看档案" }));
  await screen.findByRole("heading", { name: "Synthetic transition · 员工详情" });
  expect(screen.queryByRole("button", { name: "确认办理并留痕" })).toBeNull();
  expect(hrApi.transition).not.toHaveBeenCalled();
});
