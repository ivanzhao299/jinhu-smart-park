import { StrictMode } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { HR_PERMISSIONS as H, type UserContext } from "@jinhu/shared";
import { HrWorkReportsClient } from "../../app/hr/work-reports/HrWorkReportsClient";
import { HrWorkbench } from "../../app/hr/HrWorkbench";
import { AuthUserContext } from "../../lib/auth-context";
import { ApiError } from "../../lib/api-client";

const api = vi.hoisted(() => ({
  me: vi.fn(), employees: vi.fn(), recruitmentRequisitions: vi.fn(), lifecycleChecklists: vi.fn(),
  trainingPlans: vi.fn(), rewardCases: vi.fn(), contracts: vi.fn(), attendanceCalendars: vi.fn(),
  insurancePeriods: vi.fn(), workReportsPage: vi.fn(), goals: vi.fn(), teamWorkReports: vi.fn(), myWorkReports: vi.fn(),
  teamPerformancePlans: vi.fn(), myPerformancePlans: vi.fn(), myFeedbackAssignments: vi.fn(),
  developmentPlans: vi.fn(), pendingApprovals: vi.fn(), myApprovals: vi.fn(), payrollRuns: vi.fn(), myPayslips: vi.fn()
}));
vi.mock("../../lib/hr-api", () => ({ hrApi: api }));
const session = vi.hoisted(() => ({ token: "synthetic-token" }));
vi.mock("../../lib/authz", () => ({ getAccessToken: () => session.token }));
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
const reportPage = (pending = 7, returned = 3, total = 43) => ({
  total, page: 1, page_size: 20, summary: { pending, returned },
  items: Array.from({ length: Math.min(20, total) }, (_, index) => ({ id: `report-${index}`, reportType: "daily", status: index ? "submitted" : "resubmitted", periodStart: "2026-10-01", periodEnd: "2026-10-01", completedWork: "合成工作", goalSuggestions: [] }))
});
const metric = (title: string) => within(screen.getByRole("article", { name: `${title}统计` }));
beforeEach(() => {
  Object.values(api).forEach((method) => method.mockReset().mockResolvedValue([]));
  session.token = "synthetic-token";
  api.workReportsPage.mockResolvedValue(reportPage());
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
    H.HR_WORK_REPORTS_PAGE, H.HR_WORK_REPORT_SELF_READ, H.HR_PERFORMANCE_SELF_REVIEW, H.HR_FEEDBACK_RESPOND, H.HR_TALENT_SELF_READ,
    H.HR_APPROVALS_PAGE, H.HR_APPROVAL_SELF_MANAGE, H.HR_PAYSLIP_SELF_READ]);
  api.workReportsPage.mockResolvedValue(reportPage(0, 1));
  api.myPerformancePlans.mockResolvedValue([{ status: "draft" }, { status: "confirmed" }]);
  api.myFeedbackAssignments.mockResolvedValue([{ status: "draft" }, { status: "completed" }]);
  api.developmentPlans.mockResolvedValue([{ actions: [{ status: "draft" }, { status: "completed" }] }]);
  api.myApprovals.mockResolvedValue([{ status: "draft" }, { status: "submitted" }, { status: "approved" }]);
  api.myPayslips.mockResolvedValue([{}, {}]);
  render(view(actor));
  expect(await metric("人事审批").findByText("2")).toBeVisible();
  for (const title of ["员工档案", "本人退回汇报", "绩效考核", "360 评价", "人才发展"]) expect(metric(title).getByText("1")).toBeVisible();
  expect(metric("我的工资条").getByText("2")).toBeVisible();
  expect(api.me).toHaveBeenCalledWith("synthetic-token"); expect(api.employees).not.toHaveBeenCalled();
  expect(api.contracts).toHaveBeenCalledWith("synthetic-token", 1, 1, {}, true);
  expect(api.insurancePeriods).toHaveBeenCalledWith("synthetic-token", 1, 1, {}, true);
  expect(api.goals).toHaveBeenCalledWith(true, "synthetic-token");
  for (const method of [api.teamWorkReports, api.teamPerformancePlans, api.pendingApprovals, api.payrollRuns]) expect(method).not.toHaveBeenCalled();
});

it("preserves team/HR precedence and original count requests", async () => {
  api.workReportsPage.mockResolvedValue(reportPage(1, 1));
  api.teamPerformancePlans.mockResolvedValue([{ status: "draft" }, { status: "paid" }]);
  api.pendingApprovals.mockResolvedValue([{ status: "submitted" }, { status: "approved" }]);
  api.payrollRuns.mockResolvedValue([{ status: "draft" }, { status: "confirmed" }]);
  render(view(user(Object.values(H))));
  expect(await metric("工资核算").findByText("1")).toBeVisible();
  for (const title of ["本人退回汇报", "团队待审汇报", "绩效考核", "人事审批"]) expect(metric(title).getByText("1")).toBeVisible();
  expect(api.contracts).toHaveBeenCalledWith("synthetic-token", 1, 1, {}, false);
  expect(api.insurancePeriods).toHaveBeenCalledWith("synthetic-token", 1, 1, {}, false);
  expect(api.goals).toHaveBeenCalledWith(false, "synthetic-token");
  expect(api.recruitmentRequisitions).toHaveBeenCalledWith("synthetic-token", 1, 1, { status: "open" });
  for (const method of [api.lifecycleChecklists, api.trainingPlans, api.rewardCases, api.attendanceCalendars]) expect(method).toHaveBeenCalledWith("synthetic-token", 1, 1);
  for (const method of [api.me, api.myWorkReports, api.myPerformancePlans, api.myApprovals, api.myPayslips]) expect(method).not.toHaveBeenCalled();
});


it.each([
  [H.HR_WORK_REPORT_SELF_READ, false, "本人退回汇报", "3"],
  [H.HR_WORK_REPORT_TEAM_READ, true, "团队待审汇报", "7"],
  [H.HR_WORK_REPORT_REVIEW, true, "团队待审汇报", "7"]
] as const)("uses exact %s authority and complete summary without employee or goal probes", async (permission, team, title, count) => {
  render(view(user([H.HR_WORK_REPORTS_PAGE, permission])));
  expect(await metric(title).findByText(count)).toBeVisible();
  expect(api.workReportsPage).toHaveBeenCalledExactlyOnceWith(team, 1, {}, "synthetic-token");
  for (const method of [api.me, api.employees, api.goals, api.myWorkReports, api.teamWorkReports]) expect(method).not.toHaveBeenCalled();
  const navigation = within(screen.getByRole("region", { name: "按场景办理" }));
  expect(navigation.getAllByRole("link", { name: "工作汇报" })).toHaveLength(1);
  expect(screen.getAllByRole("article")).toHaveLength(1);
});

it.each([H.HR_WORK_REPORT_DRAFT, H.HR_WORK_REPORT_SUBMIT])("exposes page plus %s business entry without inventing a readable statistic", async permission => {
  render(view(user([H.HR_WORK_REPORTS_PAGE, permission])));
  expect(screen.getByRole("link", { name: "工作汇报" })).toHaveAttribute("href", "/hr/work-reports");
  await act(async () => {});
  expect(screen.queryByRole("article")).toBeNull();
  for (const method of Object.values(api)) expect(method).not.toHaveBeenCalled();
  expect(screen.queryByText("当前没有待处理事项")).toBeNull();
});

it.each([
  { permissions: [H.HR_WORK_REPORTS_PAGE] },
  { permissions: [H.HR_WORK_REPORT_SELF_READ, H.HR_WORK_REPORT_TEAM_READ, H.HR_WORK_REPORT_REVIEW, H.HR_WORK_REPORT_DRAFT] },
  { permissions: [H.HR_WORK_REPORTS_PAGE, H.HR_WORK_REPORT_SELF_MANAGE, H.HR_WORK_REPORT_TEAM_REVIEW] }
])("does not infer modern report reads or entry from missing page or legacy atoms %#", async ({ permissions }) => {
  render(view(user(permissions))); await act(async () => {});
  expect(api.workReportsPage).not.toHaveBeenCalled();
  expect(api.myWorkReports).not.toHaveBeenCalled(); expect(api.teamWorkReports).not.toHaveBeenCalled();
  expect(screen.queryByRole("link", { name: "工作汇报" })).toBeNull();
});

it("publishes full own returned summary while team is slow and retries only malformed team summary with the current token", async () => {
  const team = deferred<ReturnType<typeof reportPage>>();
  api.workReportsPage.mockImplementation((isTeam: boolean) => isTeam ? team.promise : Promise.resolve(reportPage(4, 27)));
  render(view(user([H.HR_WORK_REPORTS_PAGE, H.HR_WORK_REPORT_SELF_READ, H.HR_WORK_REPORT_TEAM_READ])));
  expect(await metric("本人退回汇报").findByText("27")).toBeVisible();
  expect(metric("团队待审汇报").getByText("正在加载统计…")).toBeVisible();
  expect(screen.queryByText("当前没有待处理事项")).toBeNull();
  await act(async () => { team.resolve(reportPage(30, 30)); });
  const retry = await screen.findByRole("button", { name: "重试团队待审汇报统计" });
  expect(metric("本人退回汇报").getByText("27")).toBeVisible();
  session.token = "replacement-token"; api.workReportsPage.mockResolvedValue(reportPage(32, 2));
  fireEvent.click(retry);
  expect(await metric("团队待审汇报").findByText("32")).toBeVisible();
  expect(api.workReportsPage).toHaveBeenCalledTimes(3);
  expect(api.workReportsPage).toHaveBeenLastCalledWith(true, 1, {}, "replacement-token");
});

it.each(["page", "summary", "negative", "fraction", "items"])("rejects malformed report %s without fabricated zero", async field => {
  const response = reportPage();
  if (field === "page") response.page = 2;
  if (field === "summary") response.summary.pending = 44;
  if (field === "negative") response.summary.returned = -1;
  if (field === "fraction") response.summary.returned = 0.5;
  if (field === "items") response.items = [];
  api.workReportsPage.mockResolvedValue(response);
  render(view(user([H.HR_WORK_REPORTS_PAGE, H.HR_WORK_REPORT_SELF_READ])));
  await screen.findByRole("button", { name: "重试本人退回汇报统计" });
  expect(metric("本人退回汇报").queryByText("0")).toBeNull();
  expect(screen.queryByText("当前没有待处理事项")).toBeNull();
});

it("keeps own and team request generations independent across retry, refresh, StrictMode and page revocation", async () => {
  const initial = deferred<ReturnType<typeof reportPage>>(), retry = deferred<ReturnType<typeof reportPage>>();
  let ownCalls = 0;
  api.workReportsPage.mockImplementation((team: boolean) => {
    if (team) return Promise.resolve(reportPage(31, 0));
    ownCalls++;
    if (ownCalls === 1) return initial.promise;
    if (ownCalls === 2) return Promise.reject(new Error("synthetic failure"));
    if (ownCalls === 3) return retry.promise;
    return Promise.resolve(reportPage(0, 24));
  });
  const actor = user([H.HR_WORK_REPORTS_PAGE, H.HR_WORK_REPORT_SELF_READ, H.HR_WORK_REPORT_REVIEW]);
  const { rerender } = render(view(actor, true)); await act(async () => {});
  expect(api.workReportsPage).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByRole("button", { name: "刷新中" }));
  fireEvent.click(await screen.findByRole("button", { name: "重试本人退回汇报统计" })); await act(async () => {});
  expect(metric("团队待审汇报").getByText("31")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "刷新中" }));
  expect(await metric("本人退回汇报").findByText("24")).toBeVisible();
  await act(async () => { initial.resolve(reportPage(0, 42)); retry.resolve(reportPage(0, 41)); });
  expect(metric("本人退回汇报").getByText("24")).toBeVisible();
  rerender(view({ ...actor, permissions: ["hr:dashboard", H.HR_WORK_REPORT_SELF_READ] }, true));
  expect(screen.queryByRole("article", { name: "本人退回汇报统计" })).toBeNull();
  expect(screen.queryByText("24")).toBeNull();
});

it.each(["module", "page"])("report page denies %s before mounting workspace reads and aborts revoked requests", async denial => {
  const pending = deferred<ReturnType<typeof reportPage>>(); api.workReportsPage.mockReturnValue(pending.promise);
  const actor = user([H.HR_WORK_REPORTS_PAGE, H.HR_WORK_REPORT_SELF_READ, H.HR_WORK_REPORT_DRAFT, H.HR_GOAL_SELF_READ]);
  const reportView = (u: UserContext) => <AuthUserContext.Provider value={u}><HrWorkReportsClient /></AuthUserContext.Provider>;
  const denied = denial === "module" ? { ...actor, enabled_modules: [] } : { ...actor, permissions: actor.permissions.filter(p => p !== H.HR_WORK_REPORTS_PAGE) };
  const { rerender } = render(reportView(denied)); await act(async () => {});
  expect(screen.getByText("无权访问工作汇报")).toBeVisible();
  expect(api.workReportsPage).not.toHaveBeenCalled(); expect(api.goals).not.toHaveBeenCalled();
  rerender(reportView(actor)); await act(async () => {});
  expect(api.workReportsPage).toHaveBeenCalledTimes(1);
  const signal = api.workReportsPage.mock.calls[0]![4] as AbortSignal;
  rerender(reportView(denied)); expect(signal.aborted).toBe(true);
  await act(async () => { pending.resolve(reportPage()); });
  expect(screen.getByText("无权访问工作汇报")).toBeVisible();
  expect(screen.queryByText("合成工作")).toBeNull();
});


it.each(["id", "tenant_id", "park_id", "org_id", "data_scope", "permissions"] as const)("report metrics discard both pending reads when %s context changes", async field => {
  const oldOwn = deferred<ReturnType<typeof reportPage>>(), oldTeam = deferred<ReturnType<typeof reportPage>>();
  api.workReportsPage.mockImplementationOnce(() => oldOwn.promise).mockImplementationOnce(() => oldTeam.promise).mockResolvedValue(reportPage(23, 4));
  const actor = user([H.HR_WORK_REPORTS_PAGE, H.HR_WORK_REPORT_SELF_READ, H.HR_WORK_REPORT_TEAM_READ]);
  const { rerender } = render(view(actor)); await act(async () => {});
  const changed = { ...actor, [field]: field === "permissions" ? [...actor.permissions, H.HR_WORK_REPORT_REVIEW] : "changed" };
  rerender(view(changed));
  expect(metric("本人退回汇报").getByText("正在加载统计…")).toBeVisible();
  expect(await metric("团队待审汇报").findByText("23")).toBeVisible();
  await act(async () => { oldOwn.resolve(reportPage(0, 42)); oldTeam.resolve(reportPage(41, 0)); });
  expect(metric("本人退回汇报").getByText("4")).toBeVisible();
  expect(metric("团队待审汇报").getByText("23")).toBeVisible();
  expect(screen.queryByText("42")).toBeNull(); expect(screen.queryByText("41")).toBeNull();
  expect(api.workReportsPage).toHaveBeenCalledTimes(4);
});

it.each(["module", "dashboard"])("report metrics do not mount without workbench %s grant", async denial => {
  const actor = user([H.HR_WORK_REPORTS_PAGE, H.HR_WORK_REPORT_SELF_READ, H.HR_WORK_REPORT_REVIEW]);
  if (denial === "module") actor.enabled_modules = [];
  else actor.permissions = actor.permissions.filter(p => p !== "hr:dashboard");
  render(view(actor)); await act(async () => {});
  expect(screen.getByText("无权访问人力资源管理")).toBeVisible();
  expect(api.workReportsPage).not.toHaveBeenCalled();
});


it.each([
  { name: "team", permissions: [H.HR_APPROVAL_TEAM_REVIEW] },
  { name: "park", permissions: [H.HR_APPROVAL_PARK_REVIEW] },
  { name: "compatibility alias", permissions: [H.HR_APPROVAL_REVIEW] },
  { name: "self and team", permissions: [H.HR_APPROVAL_SELF_MANAGE, H.HR_APPROVAL_TEAM_REVIEW] },
  { name: "park and team", permissions: [H.HR_APPROVAL_PARK_REVIEW, H.HR_APPROVAL_TEAM_REVIEW] }
])("shows one immediate approval entry and existing pending semantics for $name", async ({ permissions }) => {
  expect(H.HR_APPROVAL_REVIEW).toBe(H.HR_APPROVAL_PARK_REVIEW);
  const pending = deferred<{ status: string }[]>(); api.pendingApprovals.mockReturnValue(pending.promise);
  render(view(user([H.HR_APPROVALS_PAGE, ...permissions])));
  const navigation = within(screen.getByRole("region", { name: "按场景办理" }));
  expect(navigation.getAllByRole("link", { name: "人事审批" })).toHaveLength(1);
  expect(navigation.getByRole("link", { name: "人事审批" })).toHaveAttribute("href", "/hr/approvals");
  expect(screen.getByRole("heading", { name: "团队管理工作台" })).toBeVisible();
  expect(metric("人事审批").getByText("正在加载统计…")).toBeVisible();
  await act(async () => { pending.resolve([{ status: "submitted" }, { status: "submitted" }, { status: "approved" }, { status: "draft" }]); });
  expect(metric("人事审批").getByText("2")).toBeVisible();
  expect(api.pendingApprovals).toHaveBeenCalledExactlyOnceWith("synthetic-token");
  for (const method of [api.myApprovals, api.me, api.employees, api.goals, api.workReportsPage]) expect(method).not.toHaveBeenCalled();
  if (permissions.length === 1 && permissions[0] === H.HR_APPROVAL_TEAM_REVIEW) expect(screen.queryByRole("link", { name: /建议与投诉/ })).toBeNull();
});

it("preserves self-only approval count definition and never queries the review queue", async () => {
  api.myApprovals.mockResolvedValue([{ status: "draft" }, { status: "submitted" }, { status: "returned" }, { status: "approved" }]);
  render(view(user([H.HR_APPROVALS_PAGE, H.HR_APPROVAL_SELF_MANAGE])));
  expect(await metric("人事审批").findByText("2")).toBeVisible();
  expect(metric("人事审批").getByText("我的草稿与待审核申请")).toBeVisible();
  expect(api.myApprovals).toHaveBeenCalledExactlyOnceWith("synthetic-token");
  expect(api.pendingApprovals).not.toHaveBeenCalled();
});

it.each([
  { name: "missing approval page", permissions: [H.HR_APPROVAL_TEAM_REVIEW, H.HR_APPROVAL_PARK_REVIEW, H.HR_APPROVAL_SELF_MANAGE] },
  { name: "page without action", permissions: [H.HR_APPROVALS_PAGE] }
])("does not expose approval statistics or navigation for $name", async ({ permissions }) => {
  render(view(user(permissions))); await act(async () => {});
  expect(api.pendingApprovals).not.toHaveBeenCalled(); expect(api.myApprovals).not.toHaveBeenCalled();
  expect(screen.queryByRole("article", { name: "人事审批统计" })).toBeNull();
  expect(screen.queryByRole("link", { name: "人事审批" })).toBeNull();
});

it.each(["module", "dashboard"])("prevents approval reads before mounting denied %s workbench", async denial => {
  const actor = user([H.HR_APPROVALS_PAGE, H.HR_APPROVAL_TEAM_REVIEW, H.HR_APPROVAL_SELF_MANAGE]);
  if (denial === "module") actor.enabled_modules = [];
  else actor.permissions = actor.permissions.filter(permission => permission !== "hr:dashboard");
  render(view(actor)); await act(async () => {});
  expect(screen.getByText("无权访问人力资源管理")).toBeVisible();
  expect(api.pendingApprovals).not.toHaveBeenCalled(); expect(api.myApprovals).not.toHaveBeenCalled();
});

it("retries only failed team approvals with a fresh token while both report metrics stay visible", async () => {
  api.pendingApprovals.mockRejectedValueOnce(new Error("synthetic queue failure")).mockResolvedValueOnce([{ status: "submitted" }]);
  render(view(user([H.HR_APPROVALS_PAGE, H.HR_APPROVAL_TEAM_REVIEW, H.HR_WORK_REPORTS_PAGE, H.HR_WORK_REPORT_SELF_READ, H.HR_WORK_REPORT_TEAM_READ])));
  const retry = await screen.findByRole("button", { name: "重试人事审批统计" });
  expect(metric("本人退回汇报").getByText("3")).toBeVisible();
  expect(metric("团队待审汇报").getByText("7")).toBeVisible();
  expect(screen.queryByText("当前没有待处理事项")).toBeNull();
  session.token = "current-approval-token"; fireEvent.click(retry);
  expect(await metric("人事审批").findByText("1")).toBeVisible();
  expect(api.pendingApprovals).toHaveBeenLastCalledWith("current-approval-token");
  expect(api.workReportsPage).toHaveBeenCalledTimes(2); expect(api.myApprovals).not.toHaveBeenCalled();
});

it("refresh supersedes a pending team approval request without waiting for its old completion", async () => {
  const old = deferred<{ status: string }[]>();
  api.pendingApprovals.mockReturnValueOnce(old.promise).mockResolvedValueOnce([{ status: "submitted" }]);
  render(view(user([H.HR_APPROVALS_PAGE, H.HR_APPROVAL_TEAM_REVIEW]), true)); await act(async () => {});
  expect(api.pendingApprovals).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "刷新中" }));
  expect(await metric("人事审批").findByText("1")).toBeVisible();
  await act(async () => { old.resolve([{ status: "submitted" }, { status: "submitted" }]); });
  expect(metric("人事审批").getByText("1")).toBeVisible();
  expect(metric("人事审批").queryByText("2")).toBeNull();
});

it.each(["id", "tenant_id", "park_id", "org_id", "data_scope", "permissions"] as const)("team approval metric discards a late queue after %s replacement", async field => {
  const old = deferred<{ status: string }[]>();
  api.pendingApprovals.mockReturnValueOnce(old.promise).mockResolvedValueOnce([{ status: "submitted" }]);
  const actor = user([H.HR_APPROVALS_PAGE, H.HR_APPROVAL_TEAM_REVIEW]);
  const { rerender } = render(view(actor)); await act(async () => {});
  rerender(view({ ...actor, [field]: field === "permissions" ? [...actor.permissions, H.HR_APPROVAL_SELF_MANAGE] : "changed" }));
  expect(metric("人事审批").getByText("正在加载统计…")).toBeVisible();
  expect(await metric("人事审批").findByText("1")).toBeVisible();
  await act(async () => { old.resolve([{ status: "submitted" }, { status: "submitted" }]); });
  expect(metric("人事审批").getByText("1")).toBeVisible();
  expect(metric("人事审批").queryByText("2")).toBeNull();
  expect(api.pendingApprovals).toHaveBeenCalledTimes(2); expect(api.myApprovals).not.toHaveBeenCalled();
});

it("revoking approval page discards pending data and restoring it starts a new request", async () => {
  const old = deferred<{ status: string }[]>();
  api.pendingApprovals.mockReturnValueOnce(old.promise).mockResolvedValueOnce([{ status: "submitted" }]);
  const actor = user([H.HR_APPROVALS_PAGE, H.HR_APPROVAL_TEAM_REVIEW]);
  const { rerender } = render(view(actor)); await act(async () => {});
  rerender(view({ ...actor, permissions: actor.permissions.filter(permission => permission !== H.HR_APPROVALS_PAGE) }));
  expect(screen.queryByRole("article", { name: "人事审批统计" })).toBeNull();
  await act(async () => { old.resolve([{ status: "submitted" }, { status: "submitted" }]); });
  expect(screen.queryByRole("link", { name: "人事审批" })).toBeNull();
  expect(api.pendingApprovals).toHaveBeenCalledTimes(1);
  rerender(view(actor)); expect(await metric("人事审批").findByText("1")).toBeVisible();
  expect(api.pendingApprovals).toHaveBeenCalledTimes(2);
});
