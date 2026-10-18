import { StrictMode } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { HR_PERMISSIONS as H, type UserContext } from "@jinhu/shared";
import { HrWorkbench } from "../../app/hr/HrWorkbench";
import { AuthUserContext } from "../../lib/auth-context";
import { ApiError } from "../../lib/api-client";

const api = vi.hoisted(() => ({
  me: vi.fn(), employees: vi.fn(), recruitmentRequisitions: vi.fn(), lifecycleChecklists: vi.fn(),
  trainingPlans: vi.fn(), rewardCases: vi.fn(), contracts: vi.fn(), attendanceCalendars: vi.fn(),
  insurancePeriods: vi.fn(), goals: vi.fn(), teamWorkReports: vi.fn(), myWorkReports: vi.fn(),
  teamPerformancePlans: vi.fn(), myPerformancePlans: vi.fn(), myFeedbackAssignments: vi.fn(),
  developmentPlans: vi.fn(), pendingApprovals: vi.fn(), myApprovals: vi.fn(), payrollRuns: vi.fn(), myPayslips: vi.fn()
}));
vi.mock("../../lib/hr-api", () => ({ hrApi: api }));
vi.mock("../../lib/authz", () => ({ getAccessToken: () => "synthetic-token" }));
function user(permissions: string[] = [H.HR_EMPLOYEE_READ, H.HR_GOAL_READ]): UserContext {
  return { id: "synthetic-actor", username: "synthetic", real_name: "合成用户", mobile: null, email: null,
    tenant_id: "tenant-a", park_id: "park-a", org_id: null, org_name: null, roles: [], data_scope: "park", is_super: false,
    permissions: ["hr:dashboard", ...permissions], enabled_modules: [{ module_code: "hr", module_name: "人力资源", module_group: "management", enabled: true }] };
}
const view = (actor: UserContext, strict = false) => <AuthUserContext.Provider value={actor}>{strict ? <StrictMode><HrWorkbench /></StrictMode> : <HrWorkbench />}</AuthUserContext.Provider>;
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}
const page = (total: number) => ({ total, items: [] });
const metric = (title: string) => within(screen.getByRole("article", { name: `${title}统计` }));
beforeEach(() => {
  Object.values(api).forEach((method) => method.mockReset().mockResolvedValue([]));
  api.employees.mockResolvedValue(page(2));
  api.me.mockResolvedValue({ employmentStatus: "active" });
  for (const method of [api.recruitmentRequisitions, api.lifecycleChecklists, api.trainingPlans, api.rewardCases, api.contracts, api.attendanceCalendars, api.insurancePeriods]) method.mockResolvedValue(page(0));
});

it("shows authorized navigation before any request resolves and publishes independent successes", async () => {
  const employees = deferred<ReturnType<typeof page>>();
  const goals = deferred<{ status: string }[]>();
  api.employees.mockReturnValue(employees.promise); api.goals.mockReturnValue(goals.promise);
  render(view(user()));
  const navigation = within(screen.getByRole("region", { name: "按场景办理" }));
  expect(navigation.getByRole("link", { name: "员工档案" })).toHaveAttribute("href", "/hr/employees");
  expect(navigation.getByRole("link", { name: "战略与目标" })).toHaveAttribute("href", "/hr/goals");
  expect(metric("员工档案").getByText("正在加载统计…")).toBeVisible();
  await act(async () => { goals.resolve([{ status: "active" }]); });
  expect(metric("战略与目标").getByText("1")).toBeVisible();
  expect(metric("员工档案").getByText("正在加载统计…")).toBeVisible();
  expect(screen.queryByText("当前没有待处理事项")).toBeNull();
  await act(async () => { employees.resolve(page(7)); });
  expect(metric("员工档案").getByText("7")).toBeVisible();
});

it.each([new Error("synthetic failure"), new ApiError("Forbidden", 403), new ApiError("No employee profile is linked to current user", 404)])("keeps failure or unavailable visible and retries only its own module %#", async (error) => {
  api.employees.mockRejectedValueOnce(error).mockResolvedValueOnce(page(9));
  render(view(user()));
  const retry = await screen.findByRole("button", { name: "重试员工档案统计" });
  expect(screen.queryByText("当前没有待处理事项")).toBeNull();
  expect(metric("战略与目标").getByText("0")).toBeVisible();
  expect(metric("员工档案").getByText(error instanceof ApiError ? "当前范围不可访问或未关联员工档案" : "统计加载失败，请重试")).toBeVisible();
  fireEvent.click(retry);
  expect(metric("员工档案").getByText("正在加载统计…")).toBeVisible();
  expect(await metric("员工档案").findByText("9")).toBeVisible();
  expect(api.goals).toHaveBeenCalledTimes(1);
  expect(api.employees).toHaveBeenCalledTimes(2);
  expect(screen.getByText("当前没有待处理事项")).toBeVisible();
});

it.each(["module", "dashboard", "both"])("denies %s before mounting reads", async (denial) => {
  const actor = user();
  if (denial !== "dashboard") actor.enabled_modules = [];
  if (denial !== "module") actor.permissions = [H.HR_EMPLOYEE_READ];
  render(view(actor));
  await act(async () => {});
  expect(screen.getByText("无权访问人力资源管理")).toBeVisible();
  for (const method of Object.values(api)) expect(method).not.toHaveBeenCalled();
});

it.each(["id", "tenant_id", "park_id", "org_id", "data_scope", "permissions"] as const)("immediately clears changed %s context and ignores the previous result", async (field) => {
  const oldRequest = deferred<ReturnType<typeof page>>();
  const newRequest = deferred<ReturnType<typeof page>>();
  api.employees.mockReturnValueOnce(oldRequest.promise).mockReturnValueOnce(newRequest.promise);
  let actor = user(); const { rerender } = render(view(actor));
  await act(async () => {});
  actor = { ...actor, [field]: field === "permissions" ? ["hr:dashboard", H.HR_EMPLOYEE_READ] : "changed" };
  rerender(view(actor));
  expect(metric("员工档案").getByText("正在加载统计…")).toBeVisible();
  await act(async () => { newRequest.resolve(page(22)); });
  await act(async () => { oldRequest.resolve(page(88)); });
  expect(metric("员工档案").getByText("22")).toBeVisible();
  expect(screen.queryByText("88")).toBeNull();
  expect(api.employees).toHaveBeenCalledTimes(2);
});

it.each(["module", "dashboard"])("discards pending reads when %s access is revoked and starts fresh when restored", async (denial) => {
  const oldRequest = deferred<ReturnType<typeof page>>();
  const restoredRequest = deferred<ReturnType<typeof page>>();
  api.employees.mockReturnValueOnce(oldRequest.promise).mockReturnValueOnce(restoredRequest.promise);
  const actor = user();
  const { rerender } = render(view(actor));
  await act(async () => {});
  const denied = denial === "module" ? { ...actor, enabled_modules: [] } : { ...actor, permissions: [H.HR_EMPLOYEE_READ] };
  rerender(view(denied));
  expect(screen.getByText("无权访问人力资源管理")).toBeVisible();
  expect(screen.queryByRole("article", { name: "员工档案统计" })).toBeNull();
  await act(async () => { oldRequest.resolve(page(88)); });
  expect(screen.queryByText("88")).toBeNull();
  expect(api.employees).toHaveBeenCalledTimes(1);
  expect(api.goals).toHaveBeenCalledTimes(1);
  rerender(view(actor));
  expect(metric("员工档案").getByText("正在加载统计…")).toBeVisible();
  await act(async () => { restoredRequest.resolve(page(12)); });
  expect(metric("员工档案").getByText("12")).toBeVisible();
  expect(api.employees).toHaveBeenCalledTimes(2);
  expect(api.goals).toHaveBeenCalledTimes(2);
});

it("removes successful data synchronously on scope or permission revocation", async () => {
  const actor = user(); const { rerender } = render(view(actor));
  expect(await metric("员工档案").findByText("2")).toBeVisible();
  const next = deferred<ReturnType<typeof page>>(); api.employees.mockReturnValue(next.promise);
  rerender(view({ ...actor, park_id: "park-b" }));
  expect(metric("员工档案").queryByText("2")).toBeNull();
  rerender(view({ ...actor, permissions: ["hr:dashboard"] }));
  expect(screen.queryByRole("article", { name: "员工档案统计" })).toBeNull();
  await act(async () => { next.resolve(page(55)); });
  expect(screen.queryByText("55")).toBeNull();
  expect(screen.queryByText("当前没有待处理事项")).toBeNull();
});

it("refresh clears old data and a late initial or retry response cannot replace a later refresh", async () => {
  const initial = deferred<ReturnType<typeof page>>();
  const retry = deferred<ReturnType<typeof page>>();
  const latest = deferred<ReturnType<typeof page>>();
  api.employees.mockReturnValueOnce(initial.promise).mockRejectedValueOnce(new Error("failed refresh")).mockReturnValueOnce(retry.promise).mockReturnValueOnce(latest.promise);
  render(view(user())); await act(async () => {});
  fireEvent.click(screen.getByRole("button", { name: "刷新中" }));
  fireEvent.click(await screen.findByRole("button", { name: "重试员工档案统计" }));
  await act(async () => {});
  fireEvent.click(screen.getByRole("button", { name: "刷新中" }));
  expect(metric("战略与目标").getByText("正在加载统计…")).toBeVisible();
  await act(async () => { latest.resolve(page(31)); });
  await act(async () => { initial.resolve(page(77)); retry.resolve(page(66)); });
  expect(metric("员工档案").getByText("31")).toBeVisible();
  expect(screen.queryByText("77")).toBeNull(); expect(screen.queryByText("66")).toBeNull();
  expect(api.employees).toHaveBeenCalledTimes(4);
});

it("survives StrictMode effect replay and late promises after unmount", async () => {
  const old = deferred<ReturnType<typeof page>>();
  const current = deferred<ReturnType<typeof page>>();
  api.employees.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
  const { unmount } = render(view(user(), true));
  await act(async () => {});
  expect(api.employees).toHaveBeenCalledTimes(1);
  unmount();
  render(view({ ...user(), park_id: "different-park" }, true));
  await act(async () => {});
  await act(async () => { current.resolve(page(13)); });
  await act(async () => { old.reject(new Error("late unmounted failure")); });
  expect(metric("员工档案").getByText("13")).toBeVisible();
  expect(screen.queryByRole("button", { name: "重试员工档案统计" })).toBeNull();
  expect(api.employees).toHaveBeenCalledTimes(2);
});

it("preserves self endpoints, status counting, and contract/insurance self flags", async () => {
  const actor = user([H.HR_EMPLOYEE_SELF_READ, H.HR_CONTRACT_SELF_READ, H.HR_INSURANCE_SELF_READ, H.HR_GOAL_SELF_READ,
    H.HR_WORK_REPORT_SELF_MANAGE, H.HR_PERFORMANCE_SELF_REVIEW, H.HR_FEEDBACK_RESPOND, H.HR_TALENT_SELF_READ,
    H.HR_APPROVAL_SELF_MANAGE, H.HR_PAYSLIP_SELF_READ]);
  api.myWorkReports.mockResolvedValue([{ status: "returned" }, { status: "submitted" }]);
  api.myPerformancePlans.mockResolvedValue([{ status: "draft" }, { status: "confirmed" }]);
  api.myFeedbackAssignments.mockResolvedValue([{ status: "draft" }, { status: "completed" }]);
  api.developmentPlans.mockResolvedValue([{ actions: [{ status: "draft" }, { status: "completed" }] }]);
  api.myApprovals.mockResolvedValue([{ status: "draft" }, { status: "pending" }, { status: "approved" }]);
  api.myPayslips.mockResolvedValue([{}, {}]);
  render(view(actor));
  expect(await metric("人事审批").findByText("2")).toBeVisible();
  for (const title of ["员工档案", "工作汇报", "绩效考核", "360 评价", "人才发展"]) expect(metric(title).getByText("1")).toBeVisible();
  expect(metric("我的工资条").getByText("2")).toBeVisible();
  expect(api.me).toHaveBeenCalledWith("synthetic-token"); expect(api.employees).not.toHaveBeenCalled();
  expect(api.contracts).toHaveBeenCalledWith("synthetic-token", 1, 1, {}, true);
  expect(api.insurancePeriods).toHaveBeenCalledWith("synthetic-token", 1, 1, {}, true);
  expect(api.goals).toHaveBeenCalledWith(true, "synthetic-token");
  for (const method of [api.teamWorkReports, api.teamPerformancePlans, api.pendingApprovals, api.payrollRuns]) expect(method).not.toHaveBeenCalled();
});

it("preserves team/HR precedence and original count requests", async () => {
  api.teamWorkReports.mockResolvedValue([{ status: "submitted" }, { status: "returned" }]);
  api.teamPerformancePlans.mockResolvedValue([{ status: "draft" }, { status: "paid" }]);
  api.pendingApprovals.mockResolvedValue([{ status: "pending" }, { status: "approved" }]);
  api.payrollRuns.mockResolvedValue([{ status: "draft" }, { status: "confirmed" }]);
  render(view(user(Object.values(H))));
  expect(await metric("工资核算").findByText("1")).toBeVisible();
  for (const title of ["工作汇报", "绩效考核", "人事审批"]) expect(metric(title).getByText("1")).toBeVisible();
  expect(api.contracts).toHaveBeenCalledWith("synthetic-token", 1, 1, {}, false);
  expect(api.insurancePeriods).toHaveBeenCalledWith("synthetic-token", 1, 1, {}, false);
  expect(api.goals).toHaveBeenCalledWith(false, "synthetic-token");
  expect(api.recruitmentRequisitions).toHaveBeenCalledWith("synthetic-token", 1, 1, { status: "open" });
  for (const method of [api.lifecycleChecklists, api.trainingPlans, api.rewardCases, api.attendanceCalendars]) expect(method).toHaveBeenCalledWith("synthetic-token", 1, 1);
  for (const method of [api.me, api.myWorkReports, api.myPerformancePlans, api.myApprovals, api.myPayslips]) expect(method).not.toHaveBeenCalled();
});
