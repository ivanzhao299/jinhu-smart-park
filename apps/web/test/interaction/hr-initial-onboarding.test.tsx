import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { HrRecruitmentClient } from "../../app/hr/recruitment/HrRecruitmentClient";
import { hrApi, type HrCandidate, type HrEmployee, type HrOnboardingApplication } from "../../lib/hr-api";

const permissions = ["hr:recruitment", "hr:candidate:read", "hr:onboarding:read", "hr:onboarding:manage", "hr:approval:park_review", "hr:employment:transition"];
const auth = vi.hoisted(() => ({ user: { id: "hr", permissions: [] as string[], enabled_modules: [{ module_code: "hr" }] } }));
vi.mock("../../lib/auth-context", () => ({ useAuthUser: () => auth.user }));
vi.mock("../../lib/authz", () => ({ getAccessToken: () => "synthetic-token" }));
vi.mock("../../lib/hr-api", () => ({ hrApi: {
  recruitmentRequisitions: vi.fn(), recruitmentCandidates: vi.fn(), onboardingApplications: vi.fn(), employees: vi.fn(), directoryOptions: vi.fn(), positions: vi.fn(),
  createOnboardingApplication: vi.fn(), updateOnboardingApplication: vi.fn(), onboardingApplicationAction: vi.fn(), reviewOnboardingApplication: vi.fn(), confirmOnboardingApplication: vi.fn()
} }));
const row = (patch: Partial<HrOnboardingApplication> = {}): HrOnboardingApplication => ({
  id: "application-1", version: 1, entryType: "initial", applicantUserId: "applicant", applicationNo: "SYN-INITIAL-1", applicationName: "合成入职申请",
  employeeId: "employee-1", employeeCode: "SYN-E1", employeeName: "合成员工", candidateId: "candidate-1", applicationDate: "2026-10-01", plannedHireDate: "2026-10-10",
  probationMonths: 3, attendanceCardNo: "123", status: "draft", reviewComment: null, reviewedAt: null, confirmedAt: null, remark: null, ...patch
});
const person: HrCandidate = { id: "candidate-1", candidateNo: "SYN-C1", fullName: "合成员工", requisitionId: "req-1", requisitionTitle: "合成岗位", stage: "hired", source: null, expectedOnboardDate: null, latestEvaluation: null, mobileMasked: null, emailMasked: null, identityMasked: null, convertedEmployeeId: "employee-1" };
const employee = (index: number): HrEmployee => ({ id: `employee-${index}`, employeeCode: `SYN-E${index}`, fullName: `预入职员工${index}`, employmentStatus: "preboarding", userId: null, primaryOrgId: "org-1", positionId: "position-1", managerEmployeeId: null, employmentType: "full_time", legacyJobstateCode: null, legacyJobstateName: null, hireDate: null, departureDate: null, workLocation: null, workMobile: null, workEmail: null });
const list = <T,>(items: T[]) => ({ items, total: items.length, page: 1, page_size: 20 });
const rejection = (status: number, message: string) => Object.assign(new Error(message), { status });
beforeEach(() => {
  vi.resetAllMocks(); auth.user = { id: "hr", permissions: [...permissions], enabled_modules: [{ module_code: "hr" }] };
  vi.mocked(hrApi.recruitmentRequisitions).mockResolvedValue(list([]));
  vi.mocked(hrApi.recruitmentCandidates).mockImplementation(async (_token, _page, _size, filters) => list(filters?.stage === "hired" ? [person] : []));
  vi.mocked(hrApi.employees).mockImplementation(async (_token, page = 1) => ({ items: Array.from({ length: 21 }, (_, index) => employee(index + 1)).slice((page - 1) * 20, page * 20), total: 21, page, page_size: 20 }));
  vi.mocked(hrApi.onboardingApplications).mockResolvedValue(list([row()]));
  vi.mocked(hrApi.createOnboardingApplication).mockImplementation(async body => ({ ...row(), ...body, id: "new-application", version: 1, applicationNo: "SYN-NEW" }));
});

it("lets HR without candidate read select a paged preboarding employee, clears the other source, and retries the exact direct request", async () => {
  auth.user.permissions = ["hr:recruitment", "hr:onboarding:read", "hr:onboarding:manage", "hr:employee:read"];
  vi.mocked(hrApi.createOnboardingApplication).mockRejectedValueOnce(new TypeError("直接员工请求中断"))
    .mockImplementationOnce(async body => ({ ...row(), ...body, candidateId: null, id: "employee-direct", applicationNo: "SYN-DIRECT", version: 1 }));
  render(<HrRecruitmentClient />);
  expect(hrApi.recruitmentCandidates).not.toHaveBeenCalled();
  fireEvent.click(screen.getByLabelText("已有预入职员工"));
  await screen.findByRole("option", { name: "预入职员工1 · SYN-E1" });
  expect(hrApi.employees).toHaveBeenLastCalledWith("synthetic-token", 1, 20, { keyword: "", status: "preboarding" }, expect.any(AbortSignal));
  fireEvent.click(screen.getByRole("button", { name: "员工下一页" }));
  await screen.findByRole("option", { name: "预入职员工21 · SYN-E21" });
  fireEvent.change(screen.getByLabelText("员工"), { target: { value: "employee-21" } });
  fireEvent.click(screen.getByLabelText("招聘录用人员"));
  fireEvent.click(screen.getByLabelText("已有预入职员工"));
  expect(screen.getByLabelText("员工")).toHaveValue("");
  await screen.findByText("员工目录第 1 / 2 页 · 共 21 人");
  fireEvent.click(screen.getByRole("button", { name: "员工下一页" }));
  await screen.findByRole("option", { name: "预入职员工21 · SYN-E21" });
  fireEvent.change(screen.getByLabelText("员工"), { target: { value: "employee-21" } });
  const form = screen.getByRole("button", { name: "保存入职申请草稿" }).closest("form")!;
  fireEvent.change(within(form).getByLabelText("申请名称"), { target: { value: "直接办理" } });
  fireEvent.change(within(form).getByLabelText("申请日期"), { target: { value: "2026-10-01" } });
  fireEvent.change(within(form).getByLabelText("入职日期"), { target: { value: "2026-10-10" } });
  fireEvent.change(within(form).getByLabelText("考勤卡号"), { target: { value: "321" } });
  fireEvent.submit(form);
  await screen.findByText("直接员工请求中断");
  expect(vi.mocked(hrApi.createOnboardingApplication)).toHaveBeenCalledWith(expect.objectContaining({ employeeId: "employee-21", candidateId: undefined }), "synthetic-token", expect.any(String));
  expect(screen.getByLabelText("已有预入职员工")).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "重试原入职请求" }));
  await screen.findByText("入职申请草稿已保存，可继续提交审批。");
  expect(vi.mocked(hrApi.createOnboardingApplication).mock.calls[1]).toEqual(vi.mocked(hrApi.createOnboardingApplication).mock.calls[0]);
});

it("rejects and labels a non-preboarding row from an anomalous scoped directory response", async () => {
  auth.user.permissions = ["hr:recruitment", "hr:onboarding:read", "hr:onboarding:manage", "hr:employee:read"];
  vi.mocked(hrApi.employees).mockResolvedValueOnce(list([{ ...employee(1), employmentStatus: "active" }]));
  render(<HrRecruitmentClient />);
  fireEvent.click(screen.getByLabelText("已有预入职员工"));
  const option = await screen.findByRole("option", { name: "预入职员工1 · SYN-E1（非预入职）" });
  expect(option).toBeDisabled();
  fireEvent.change(screen.getByLabelText("员工"), { target: { value: "employee-1" } });
  expect(screen.getByLabelText("员工")).toHaveValue("");
});
async function fillCreate() {
  fireEvent.click(await screen.findByRole("button", { name: "选择 合成员工 · SYN-C1" }));
  const form = screen.getByRole("button", { name: "保存入职申请草稿" }).closest("form")!;
  fireEvent.change(within(form).getByLabelText("申请名称"), { target: { value: "新入职草稿" } });
  fireEvent.change(within(form).getByLabelText("申请日期"), { target: { value: "2026-10-01" } });
  fireEvent.change(within(form).getByLabelText("入职日期"), { target: { value: "2026-10-10" } });
  fireEvent.change(within(form).getByLabelText("考勤卡号"), { target: { value: "123" } });
  return form;
}

it("keeps the exact create request across network uncertainty, locks parent operations and retains success after read failure", async () => {
  vi.mocked(hrApi.createOnboardingApplication).mockRejectedValueOnce(new TypeError("合成连接中断"));
  render(<HrRecruitmentClient />); const form = await fillCreate(); fireEvent.submit(form);
  await screen.findByText("合成连接中断");
  expect(within(form).getByLabelText("申请名称")).toHaveValue("新入职草稿");
  expect(within(form).getByLabelText("申请名称")).toBeDisabled();
  expect(screen.getByRole("button", { name: "刷新" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "提交审批" })).toBeDisabled();
  expect(screen.getByLabelText("入职申请状态")).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "重试原入职请求" }));
  await screen.findByText("入职申请草稿已保存，可继续提交审批。");
  expect(hrApi.createOnboardingApplication).toHaveBeenCalledTimes(2);
  expect(vi.mocked(hrApi.createOnboardingApplication).mock.calls[1]).toEqual(vi.mocked(hrApi.createOnboardingApplication).mock.calls[0]);
  expect(screen.getAllByRole("button", { name: "提交审批" })).toHaveLength(2);
  expect(within(form).getByLabelText("申请名称")).toHaveValue("");
  vi.mocked(hrApi.onboardingApplications).mockRejectedValueOnce(new Error("合成列表读取失败"));
  fireEvent.click(screen.getByRole("button", { name: "刷新" })); await screen.findByText("合成列表读取失败");
  expect(within(screen.getByRole("region", { name: "入职办理回执" })).getByText(/SYN-NEW/)).toBeInTheDocument();
});

it("retains a returned edit until confirmed save and uses the same body and key for retry", async () => {
  vi.mocked(hrApi.onboardingApplications).mockResolvedValue(list([row({ status: "returned", reviewComment: "补齐日期" })]));
  vi.mocked(hrApi.updateOnboardingApplication).mockRejectedValueOnce(rejection(503, "合成保存待确认"))
    .mockImplementationOnce(async (_id, body) => ({ ...row(), ...body, version: 2 }));
  render(<HrRecruitmentClient />); fireEvent.click(await screen.findByRole("button", { name: "编辑" }));
  const form = screen.getByRole("button", { name: "保存修改" }).closest("form")!;
  fireEvent.change(within(form).getByLabelText("申请名称"), { target: { value: "已补齐草稿" } }); fireEvent.submit(form);
  await screen.findByText("合成保存待确认"); expect(screen.getByRole("button", { name: "取消编辑" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "重试原入职请求" })); await screen.findByText("入职申请修改已保存。");
  expect(vi.mocked(hrApi.updateOnboardingApplication).mock.calls[1]).toEqual(vi.mocked(hrApi.updateOnboardingApplication).mock.calls[0]);
  expect(screen.queryByRole("button", { name: "保存修改" })).toBeNull(); expect(screen.getByText("已补齐草稿 · 草稿")).toBeInTheDocument();
});

it.each(["submit", "resubmit", "cancel"] as const)("preserves the exact %s action and applies the authoritative status", async action => {
  vi.mocked(hrApi.onboardingApplications).mockResolvedValue(list([row({ status: action === "resubmit" ? "returned" : "draft" })]));
  vi.mocked(hrApi.onboardingApplicationAction).mockRejectedValueOnce(rejection(408, "合成动作超时"))
    .mockResolvedValueOnce(row({ version: 2, status: action === "cancel" ? "cancelled" : "submitted" }));
  render(<HrRecruitmentClient />); fireEvent.click(await screen.findByRole("button", { name: action === "submit" ? "提交审批" : action === "resubmit" ? "重新提交" : "取消申请" }));
  await screen.findByText("合成动作超时"); fireEvent.click(screen.getByRole("button", { name: "重试原入职请求" }));
  await screen.findByRole("region", { name: "入职办理回执" });
  expect(vi.mocked(hrApi.onboardingApplicationAction).mock.calls[1]).toEqual(vi.mocked(hrApi.onboardingApplicationAction).mock.calls[0]);
  expect(screen.getByText(`合成入职申请 · ${action === "cancel" ? "已取消" : "待审批"}`)).toBeInTheDocument();
});

it("requires real return comments and preserves them through uncertainty before showing the actual review timestamp", async () => {
  vi.mocked(hrApi.onboardingApplications).mockResolvedValue(list([row({ status: "submitted" })]));
  vi.mocked(hrApi.reviewOnboardingApplication).mockRejectedValueOnce(new Error("合成审批响应中断"))
    .mockResolvedValueOnce(row({ version: 2, status: "returned", reviewComment: "请核对入职日期", reviewedAt: "2026-10-11T06:00:00Z" }));
  render(<HrRecruitmentClient />); fireEvent.click(await screen.findByRole("button", { name: "退回" }));
  await screen.findByText("退回入职申请时必须填写审批意见"); expect(hrApi.reviewOnboardingApplication).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("审批意见（退回时必填）"), { target: { value: "请核对入职日期" } });
  fireEvent.click(screen.getByRole("button", { name: "退回" })); await screen.findByText("合成审批响应中断");
  expect(screen.getByLabelText("审批意见（退回时必填）")).toHaveValue("请核对入职日期");
  expect(screen.getByLabelText("审批意见（退回时必填）")).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "重试原入职请求" })); await screen.findByText("入职申请已退回，可修改后重新提交。");
  expect(vi.mocked(hrApi.reviewOnboardingApplication).mock.calls[1]).toEqual(vi.mocked(hrApi.reviewOnboardingApplication).mock.calls[0]);
  expect(within(screen.getByRole("region", { name: "入职办理回执" })).getByText("审批时间：2026-10-11T06:00:00Z")).toBeInTheDocument();
});

it("confirms employment once and retains the actual effective receipt", async () => {
  vi.mocked(hrApi.onboardingApplications).mockResolvedValue(list([row({ status: "approved" })]));
  let done!: (value: HrOnboardingApplication) => void;
  vi.mocked(hrApi.confirmOnboardingApplication).mockImplementationOnce(() => new Promise(resolve => { done = resolve; }));
  render(<HrRecruitmentClient />); const button = await screen.findByRole("button", { name: "确认入职" });
  fireEvent.click(button); fireEvent.click(button); expect(hrApi.confirmOnboardingApplication).toHaveBeenCalledTimes(1);
  await act(async () => done(row({ version: 2, status: "confirmed", confirmedAt: "2026-10-11T06:01:00Z" })));
  await screen.findByText("员工入职已确认生效。"); expect(screen.queryByRole("button", { name: "确认入职" })).toBeNull();
  expect(within(screen.getByRole("region", { name: "入职办理回执" })).getByText("确认生效时间：2026-10-11T06:01:00Z")).toBeInTheDocument();
});

it.each(["wrongEmployee", "wrongCandidate", "rehire", "staleVersion", "missingTime"])("keeps malformed %s confirmation uncertain", async kind => {
  vi.mocked(hrApi.onboardingApplications).mockResolvedValue(list([row({ status: "approved" })]));
  const value = row({ version: 2, status: "confirmed", confirmedAt: "2026-10-11T06:01:00Z" });
  if (kind === "wrongEmployee") value.employeeId = "other";
  if (kind === "wrongCandidate") value.candidateId = "other";
  if (kind === "rehire") value.entryType = "rehire";
  if (kind === "staleVersion") value.version = 1;
  if (kind === "missingTime") value.confirmedAt = null;
  vi.mocked(hrApi.confirmOnboardingApplication).mockResolvedValueOnce(value);
  render(<HrRecruitmentClient />); fireEvent.click(await screen.findByRole("button", { name: "确认入职" }));
  await screen.findByRole("button", { name: "重试原入职请求" }); expect(screen.queryByRole("region", { name: "入职办理回执" })).toBeNull();
  expect(screen.getByRole("button", { name: "刷新" })).toBeDisabled();
});

it("allows correction after a definite conflict without reusing the rejected key", async () => {
  vi.mocked(hrApi.onboardingApplications).mockResolvedValue(list([row({ status: "submitted" })]));
  vi.mocked(hrApi.reviewOnboardingApplication).mockRejectedValueOnce(rejection(409, "申请已变化，请核对"))
    .mockResolvedValueOnce(row({ version: 2, status: "approved", reviewComment: "核对通过", reviewedAt: "2026-10-11T06:00:00Z" }));
  render(<HrRecruitmentClient />); fireEvent.click(await screen.findByRole("button", { name: "批准" }));
  await screen.findByText("申请已变化，请核对"); expect(screen.queryByRole("button", { name: "重试原入职请求" })).toBeNull();
  fireEvent.change(screen.getByLabelText("审批意见（退回时必填）"), { target: { value: "核对通过" } }); fireEvent.click(screen.getByRole("button", { name: "批准" }));
  await screen.findByText("入职申请已批准，尚需确认入职。");
  expect(vi.mocked(hrApi.reviewOnboardingApplication).mock.calls[1]?.[4]).not.toBe(vi.mocked(hrApi.reviewOnboardingApplication).mock.calls[0]?.[4]);
});

it("blocks self review and independently gates management and employment confirmation", async () => {
  auth.user.permissions = ["hr:recruitment", "hr:onboarding:read", "hr:approval:park_review"];
  vi.mocked(hrApi.onboardingApplications).mockResolvedValue(list([row({ status: "submitted", applicantUserId: "hr" }), row({ id: "approved", status: "approved" })]));
  render(<HrRecruitmentClient />); await screen.findByText("本人提交的申请须由其他有权限人员审批。");
  expect(screen.queryByRole("button", { name: "批准" })).toBeNull(); expect(screen.queryByRole("button", { name: "确认入职" })).toBeNull();
  expect(screen.queryByRole("button", { name: "保存入职申请草稿" })).toBeNull(); expect(hrApi.recruitmentCandidates).not.toHaveBeenCalled();
});

it("discards a late operation after the identity context changes", async () => {
  let done!: (value: HrOnboardingApplication) => void;
  vi.mocked(hrApi.onboardingApplicationAction).mockImplementationOnce(() => new Promise(resolve => { done = resolve; }));
  const view = render(<HrRecruitmentClient />); fireEvent.click(await screen.findByRole("button", { name: "提交审批" }));
  auth.user = { ...auth.user, id: "other-hr" }; view.rerender(<HrRecruitmentClient />); await screen.findByRole("button", { name: "提交审批" });
  await act(async () => done(row({ version: 2, status: "submitted" })));
  expect(screen.queryByRole("region", { name: "入职办理回执" })).toBeNull();
  await waitFor(() => expect(screen.getByRole("button", { name: "刷新" })).toBeEnabled());
});

it("retries a still-processing idempotency conflict with the original key", async () => {
  vi.mocked(hrApi.onboardingApplicationAction).mockRejectedValueOnce(rejection(409, "The same idempotency key is still processing"))
    .mockResolvedValueOnce(row({ version: 2, status: "submitted" }));
  render(<HrRecruitmentClient />); fireEvent.click(await screen.findByRole("button", { name: "提交审批" }));
  fireEvent.click(await screen.findByRole("button", { name: "重试原入职请求" }));
  await screen.findByText("入职申请已提交审批。");
  expect(vi.mocked(hrApi.onboardingApplicationAction).mock.calls[1]).toEqual(vi.mocked(hrApi.onboardingApplicationAction).mock.calls[0]);
});

it("does not clear a create draft when the saved field projection differs", async () => {
  vi.mocked(hrApi.createOnboardingApplication).mockImplementationOnce(async body => ({ ...row(), ...body, plannedHireDate: "2026-10-20" }));
  render(<HrRecruitmentClient />); const form = await fillCreate(); fireEvent.submit(form);
  await screen.findByRole("button", { name: "重试原入职请求" });
  expect(within(form).getByLabelText("入职日期")).toHaveValue("2026-10-10");
  expect(screen.queryByRole("region", { name: "入职办理回执" })).toBeNull();
});

it("preserves the creator identity when mutation projections omit applicant metadata", async () => {
  vi.mocked(hrApi.createOnboardingApplication).mockImplementationOnce(async body => ({ ...row(), ...body, applicantUserId: undefined, id: "new-application", applicationNo: "SYN-NEW" }));
  vi.mocked(hrApi.onboardingApplicationAction).mockResolvedValueOnce(row({ id: "new-application", applicantUserId: undefined, version: 2, status: "submitted" }));
  render(<HrRecruitmentClient />); fireEvent.submit(await fillCreate());
  await screen.findByText("入职申请草稿已保存，可继续提交审批。");
  const article = screen.getByText("新入职草稿 · 草稿").closest("article")!;
  fireEvent.click(within(article).getByRole("button", { name: "提交审批" }));
  await screen.findByText("本人提交的申请须由其他有权限人员审批。");
  expect(screen.queryByRole("button", { name: "批准" })).toBeNull();
});
