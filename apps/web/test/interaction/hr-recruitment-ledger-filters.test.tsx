import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { HrRecruitmentClient } from "../../app/hr/recruitment/HrRecruitmentClient";
import { hrApi, type HrCandidate, type HrOnboardingApplication, type HrRequisition } from "../../lib/hr-api";

const auth = vi.hoisted(() => ({ user: { id: "hr", permissions: [] as string[], enabled_modules: [{ module_code: "hr" }] } }));
vi.mock("../../lib/auth-context", () => ({ useAuthUser: () => auth.user }));
vi.mock("../../lib/authz", () => ({ getAccessToken: () => "synthetic-token" }));
vi.mock("../../lib/hr-api", () => ({ hrApi: {
  recruitmentRequisitions: vi.fn(), recruitmentCandidates: vi.fn(), onboardingApplications: vi.fn(),
  onboardingApplicationAction: vi.fn(), directoryOptions: vi.fn(), positions: vi.fn()
} }));
// Keep the real parent selection and editable child lifetime, without unrelated API reads.
vi.mock("../../app/hr/recruitment/CandidateProfile", () => ({ CandidateProfile: () => <input aria-label="合成档案草稿" defaultValue="" /> }));
vi.mock("../../app/hr/recruitment/RequisitionOperations", () => ({ RequisitionOperations: () => <input aria-label="合成需求草稿" defaultValue="" /> }));
vi.mock("../../app/hr/recruitment/CandidateDocuments", () => ({ CandidateDocuments: () => null }));
vi.mock("../../app/hr/recruitment/CandidateAssessment", () => ({ CandidateAssessment: () => null }));
vi.mock("../../app/hr/recruitment/CandidateInterviews", () => ({ CandidateInterviews: () => null }));
vi.mock("../../app/hr/recruitment/CandidateStageHistory", () => ({ CandidateStageHistory: () => null }));
const req: HrRequisition = { id: "req-1", requisitionCode: "SYN-R1", title: "合成岗位", orgId: "org", orgName: "合成部门", positionId: null, positionName: null, headcount: 2, hiredCount: 0, ownerUserId: "hr", ownerName: null, plannedOnboardDate: null, status: "open" };
const candidate: HrCandidate = { id: "candidate-1", candidateNo: "SYN-C1", fullName: "合成人员", requisitionId: "req-1", requisitionTitle: "合成岗位", stage: "screening", source: null, expectedOnboardDate: null, latestEvaluation: null, mobileMasked: null, emailMasked: null, identityMasked: null, convertedEmployeeId: null };
const application: HrOnboardingApplication = { id: "app-1", version: 1, entryType: "initial", applicationNo: "SYN-A1", applicationName: "合成申请", employeeId: "employee-1", candidateId: "candidate-1", applicationDate: "2026-10-01", plannedHireDate: "2026-10-10", probationMonths: 3, attendanceCardNo: "123", status: "draft", reviewComment: null, reviewedAt: null, confirmedAt: null, remark: null };
const list = <T,>(items: T[], page = 1) => ({ items, total: 45, page, page_size: 20 });
beforeEach(() => {
  vi.resetAllMocks();
  auth.user = { id: "hr", permissions: ["hr:recruitment", "hr:requisition:read", "hr:candidate:read", "hr:onboarding:read", "hr:onboarding:manage"], enabled_modules: [{ module_code: "hr" }] };
  vi.mocked(hrApi.recruitmentRequisitions).mockImplementation(async (_token, page) => list([req], page));
  vi.mocked(hrApi.recruitmentCandidates).mockImplementation(async (_token, page, _size, filters) => list(filters?.stage === "hired" ? [] : [candidate], page));
  vi.mocked(hrApi.onboardingApplications).mockResolvedValue(list([application]));
});
async function ready() { render(<HrRecruitmentClient />); await screen.findByRole("button", { name: "下一动作" }); }
function search(kind: "招聘需求" | "候选人", keyword: string, status?: string) {
  const form = screen.getByRole("form", { name: `${kind}筛选` });
  fireEvent.change(within(form).getByLabelText(`${kind}关键词`), { target: { value: keyword } });
  if (status !== undefined) fireEvent.change(within(form).getByRole("combobox"), { target: { value: status } });
  fireEvent.submit(form);
}

it("applies trimmed filters explicitly, resets only its page, and retains filters on paging and manual refresh", async () => {
  await ready(); fireEvent.click(screen.getByRole("button", { name: "需求下一页" }));
  await waitFor(() => expect(hrApi.recruitmentRequisitions).toHaveBeenLastCalledWith("synthetic-token", 2, 20, { keyword: "", status: "" }, expect.any(AbortSignal)));
  const calls = vi.mocked(hrApi.recruitmentRequisitions).mock.calls.length;
  fireEvent.change(screen.getByLabelText("招聘需求关键词"), { target: { value: "  SYN-R  " } });
  expect(hrApi.recruitmentRequisitions).toHaveBeenCalledTimes(calls);
  search("招聘需求", "  SYN-R  ", "paused");
  await waitFor(() => expect(hrApi.recruitmentRequisitions).toHaveBeenLastCalledWith("synthetic-token", 1, 20, { keyword: "SYN-R", status: "paused" }, expect.any(AbortSignal)));
  await waitFor(() => expect(screen.getByRole("button", { name: "需求下一页" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "需求下一页" }));
  await waitFor(() => expect(hrApi.recruitmentRequisitions).toHaveBeenLastCalledWith("synthetic-token", 2, 20, { keyword: "SYN-R", status: "paused" }, expect.any(AbortSignal)));
  await waitFor(() => expect(screen.getByRole("button", { name: "刷新" })).toBeEnabled()); fireEvent.click(screen.getByRole("button", { name: "刷新" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "刷新" })).toBeEnabled());
  expect(hrApi.recruitmentRequisitions).toHaveBeenLastCalledWith("synthetic-token", 2, 20, { keyword: "SYN-R", status: "paused" }, expect.any(AbortSignal));
});

it("keeps the two ledgers independent and reset clears both applied and draft fields", async () => {
  await ready(); search("招聘需求", "岗位", "open");
  await waitFor(() => expect(screen.getByRole("button", { name: "候选人下一页" })).toBeEnabled()); fireEvent.click(screen.getByRole("button", { name: "候选人下一页" }));
  await waitFor(() => expect(hrApi.recruitmentCandidates).toHaveBeenLastCalledWith("synthetic-token", 2, 20, { keyword: "", stage: "" }, expect.any(AbortSignal)));
  search("候选人", " 人员 ", "interview");
  await waitFor(() => expect(hrApi.recruitmentCandidates).toHaveBeenLastCalledWith("synthetic-token", 1, 20, { keyword: "人员", stage: "interview" }, expect.any(AbortSignal)));
  expect(hrApi.recruitmentRequisitions).toHaveBeenLastCalledWith("synthetic-token", 1, 20, { keyword: "岗位", status: "open" }, expect.any(AbortSignal));
  fireEvent.click(screen.getByRole("button", { name: "重置候选人筛选" }));
  await waitFor(() => expect(hrApi.recruitmentCandidates).toHaveBeenLastCalledWith("synthetic-token", 1, 20, { keyword: "", stage: "" }, expect.any(AbortSignal)));
  expect(screen.getByLabelText("候选人关键词")).toHaveValue(""); expect(screen.getByLabelText("候选人阶段")).toHaveValue(""); expect(screen.getByLabelText("招聘需求关键词")).toHaveValue("岗位");
});

it("aborts replaced queries and ignores a late success that no longer matches the search", async () => {
  await ready(); let resolve!: (value: ReturnType<typeof list<HrCandidate>>) => void;
  vi.mocked(hrApi.recruitmentCandidates).mockImplementationOnce(() => new Promise(done => { resolve = done; })); search("候选人", "旧查询");
  const signal = vi.mocked(hrApi.recruitmentCandidates).mock.calls.at(-1)?.[4]; search("候选人", "新查询");
  await waitFor(() => expect(hrApi.recruitmentCandidates).toHaveBeenLastCalledWith("synthetic-token", 1, 20, { keyword: "新查询", stage: "" }, expect.any(AbortSignal)));
  expect(signal?.aborted).toBe(true); await act(async () => resolve(list([{ ...candidate, fullName: "过期查询人员" }])));
  expect(screen.queryByText(/过期查询人员/)).toBeNull();
});

it("preserves open business selections and unsaved candidate and onboarding drafts during list searches", async () => {
  await ready(); fireEvent.click(screen.getByRole("button", { name: "下一动作" })); fireEvent.change(screen.getByLabelText("合成档案草稿"), { target: { value: "未保存档案" } });
  fireEvent.click(screen.getByRole("button", { name: "查看与办理需求" })); fireEvent.change(screen.getByLabelText("合成需求草稿"), { target: { value: "未保存需求" } });
  fireEvent.click(screen.getByRole("button", { name: "编辑" })); const form = screen.getByRole("button", { name: "保存修改" }).closest("form")!;
  fireEvent.change(within(form).getByLabelText("申请名称"), { target: { value: "未保存申请" } }); search("候选人", "筛选");
  await waitFor(() => expect(screen.getByRole("button", { name: "刷新" })).toBeEnabled());
  expect(screen.getByLabelText("合成档案草稿")).toHaveValue("未保存档案"); expect(screen.getByLabelText("合成需求草稿")).toHaveValue("未保存需求"); expect(within(form).getByLabelText("申请名称")).toHaveValue("未保存申请");
});

it("locks filter actions during an uncertain onboarding write, including a same-frame form submission", async () => {
  await ready(); vi.mocked(hrApi.onboardingApplicationAction).mockRejectedValueOnce(new TypeError("合成连接中断"));
  const filter = screen.getByRole("form", { name: "候选人筛选" }); fireEvent.change(screen.getByLabelText("候选人关键词"), { target: { value: "不应查询" } });
  const count = vi.mocked(hrApi.recruitmentCandidates).mock.calls.length;
  act(() => { fireEvent.click(screen.getByRole("button", { name: "提交审批" })); fireEvent.submit(filter); }); await screen.findByText("合成连接中断");
  expect(hrApi.recruitmentCandidates).toHaveBeenCalledTimes(count); expect(screen.getByLabelText("候选人关键词")).toBeDisabled(); expect(screen.getByRole("button", { name: "重置招聘需求筛选" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "重试原入职请求" })).toBeEnabled();
});

it("cancels a pending list search when business processing begins and does not overwrite its receipt", async () => {
  await ready(); let resolve!: (value: ReturnType<typeof list<HrCandidate>>) => void;
  vi.mocked(hrApi.recruitmentCandidates).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  search("候选人", "检索中"); const signal = vi.mocked(hrApi.recruitmentCandidates).mock.calls.at(-1)?.[4];
  vi.mocked(hrApi.onboardingApplicationAction).mockResolvedValueOnce({ ...application, version: 2, status: "submitted" });
  fireEvent.click(screen.getByRole("button", { name: "提交审批" })); await screen.findByText("入职申请已提交审批。");
  expect(signal?.aborted).toBe(true); await act(async () => resolve(list([candidate])));
  expect(within(screen.getByRole("region", { name: "入职办理回执" })).getByText("办理状态：待审批")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "提交审批" })).toBeNull();
  search("招聘需求", "岗位"); await waitFor(() => expect(screen.getByRole("button", { name: "刷新" })).toBeEnabled());
  expect(within(screen.getByRole("region", { name: "入职办理回执" })).getByText("办理状态：待审批")).toBeInTheDocument();
});

it("does not expose or query a ledger without corresponding read authority", async () => {
  auth.user.permissions = ["hr:recruitment", "hr:onboarding:read"]; render(<HrRecruitmentClient />); await screen.findByText(/合成申请/);
  expect(screen.queryByRole("form", { name: "招聘需求筛选" })).toBeNull(); expect(screen.queryByRole("form", { name: "候选人筛选" })).toBeNull(); expect(hrApi.recruitmentRequisitions).not.toHaveBeenCalled(); expect(hrApi.recruitmentCandidates).not.toHaveBeenCalled();
});

it("clears failed-query rows instead of showing stale matches, while retaining a selected business draft", async () => {
  await ready(); fireEvent.click(screen.getByRole("button", { name: "下一动作" }));
  fireEvent.change(screen.getByLabelText("合成档案草稿"), { target: { value: "保留业务草稿" } });
  vi.mocked(hrApi.recruitmentCandidates).mockRejectedValueOnce(new Error("合成检索失败")); search("候选人", "新条件");
  await screen.findByText("合成检索失败"); expect(screen.queryByRole("button", { name: "下一动作" })).toBeNull();
  expect(screen.getByLabelText("合成档案草稿")).toHaveValue("保留业务草稿");
  search("候选人", "新条件"); await screen.findByRole("button", { name: "下一动作" });
  expect(screen.getByLabelText("合成档案草稿")).toHaveValue("保留业务草稿");
});

it("clears draft and applied filters on account context change", async () => {
  const view = render(<HrRecruitmentClient />); await screen.findByRole("button", { name: "下一动作" }); search("候选人", "旧账号", "interview");
  await waitFor(() => expect(hrApi.recruitmentCandidates).toHaveBeenLastCalledWith("synthetic-token", 1, 20, { keyword: "旧账号", stage: "interview" }, expect.any(AbortSignal)));
  auth.user = { ...auth.user, id: "other" }; view.rerender(<HrRecruitmentClient />); await screen.findByRole("button", { name: "下一动作" });
  expect(screen.getByLabelText("候选人关键词")).toHaveValue(""); expect(hrApi.recruitmentCandidates).toHaveBeenLastCalledWith("synthetic-token", 1, 20, { keyword: "", stage: "" }, expect.any(AbortSignal));
});
