import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { CandidateConversion } from "../../app/hr/recruitment/CandidateConversion";
import { HrRecruitmentClient } from "../../app/hr/recruitment/HrRecruitmentClient";
import { hrApi, type HrCandidate } from "../../lib/hr-api";
const auth = vi.hoisted(() => ({ user: { id: "hr", permissions: ["*"], enabled_modules: [{ module_code: "hr" }] } }));
vi.mock("../../lib/auth-context", () => ({ useAuthUser: () => auth.user }));
vi.mock("../../lib/authz", () => ({ getAccessToken: () => "synthetic-token" }));
vi.mock("../../app/hr/recruitment/CandidateProfile", () => ({ CandidateProfile: () => null }));
vi.mock("../../app/hr/recruitment/CandidateInterviews", () => ({ CandidateInterviews: () => null }));
vi.mock("../../app/hr/recruitment/CandidateAssessment", () => ({ CandidateAssessment: () => null }));
vi.mock("../../app/hr/recruitment/CandidateDocuments", () => ({ CandidateDocuments: () => null }));
vi.mock("../../app/hr/recruitment/CandidateStageHistory", () => ({ CandidateStageHistory: () => null }));
vi.mock("../../lib/hr-api", () => ({ hrApi: { convertRecruitmentCandidate: vi.fn(), recruitmentRequisitions: vi.fn(), recruitmentCandidates: vi.fn(), onboardingApplications: vi.fn(), directoryOptions: vi.fn(), positions: vi.fn(), recruitmentCandidateDetail: vi.fn(), createOnboardingApplication: vi.fn() } }));
const employeeId = "00000000-0000-4000-8000-000000000001", checklistId = "00000000-0000-4000-8000-000000000002";
const candidate: HrCandidate = { id: "candidate-a", candidateNo: "SYN-C", fullName: "合成候选人", requisitionId: "req-a", requisitionTitle: "合成需求", stage: "offer", source: null, expectedOnboardDate: "2026-10-15", latestEvaluation: null, mobileMasked: null, emailMasked: null, identityMasked: null, convertedEmployeeId: null };
const receipt = { candidateId: candidate.id, employeeId, checklistId, employeeStatus: "preboarding", loginCreated: false };
const list = <T,>(items: T[]) => ({ items, total: items.length, page: 1, page_size: 20 });
beforeEach(() => {
  vi.resetAllMocks(); auth.user = { id: "hr", permissions: ["*"], enabled_modules: [{ module_code: "hr" }] };
  vi.mocked(hrApi.convertRecruitmentCandidate).mockResolvedValue(receipt);
  vi.mocked(hrApi.recruitmentRequisitions).mockResolvedValue(list([]));
  vi.mocked(hrApi.recruitmentCandidates).mockImplementation(async (_token, _page, _size, filters) => list(filters?.stage === "hired" ? [] : [candidate]));
  vi.mocked(hrApi.onboardingApplications).mockResolvedValue(list([]));
  vi.mocked(hrApi.directoryOptions).mockResolvedValue({ orgs: [], users: [] }); vi.mocked(hrApi.positions).mockResolvedValue([]);
  vi.mocked(hrApi.recruitmentCandidateDetail).mockResolvedValue({ ...candidate, mobile: null, email: null, identityNumber: null });
});
const edit = () => { fireEvent.change(screen.getByLabelText("员工编号"), { target: { value: "SYN-E" } }); fireEvent.change(screen.getByLabelText("工作地点"), { target: { value: " 合成地点 " } }); };
it("retains exact request/key after uncertain transport and resolves only a valid receipt", async () => {
  const onBusy = vi.fn(), done = vi.fn(); vi.mocked(hrApi.convertRecruitmentCandidate).mockRejectedValueOnce(new Error("网络结果不明确"));
  render(<CandidateConversion candidate={candidate} positions={[]} disabled={false} onBusyChange={onBusy} onConverted={done} />); edit(); fireEvent.click(screen.getByRole("button", { name: "转入预入职" }));
  await screen.findByRole("button", { name: "原请求重试" }); expect(screen.getByLabelText("员工编号")).toBeDisabled(); expect(onBusy).toHaveBeenLastCalledWith(true);
  fireEvent.click(screen.getByRole("button", { name: "原请求重试" })); await waitFor(() => expect(done).toHaveBeenCalledWith(receipt, candidate, "SYN-E"));
  expect(hrApi.convertRecruitmentCandidate).toHaveBeenCalledTimes(2); expect(vi.mocked(hrApi.convertRecruitmentCandidate).mock.calls[1]).toEqual(vi.mocked(hrApi.convertRecruitmentCandidate).mock.calls[0]);
  expect(vi.mocked(hrApi.convertRecruitmentCandidate).mock.calls[0]?.[1]).toEqual({ employeeCode: "SYN-E", hireDate: "2026-10-15", workLocation: "合成地点" }); expect(onBusy).toHaveBeenLastCalledWith(false);
});
it("definite permission rejection preserves editable draft and a corrected attempt gets a new key", async () => {
  const done = vi.fn(); vi.mocked(hrApi.convertRecruitmentCandidate).mockRejectedValueOnce(Object.assign(new Error("需员工档案管理权限"), { status: 403 }));
  render(<CandidateConversion candidate={candidate} positions={[]} disabled={false} onBusyChange={vi.fn()} onConverted={done} />); edit(); fireEvent.click(screen.getByRole("button", { name: "转入预入职" })); await screen.findByText("需员工档案管理权限");
  expect(screen.getByLabelText("员工编号")).toBeEnabled(); expect(screen.getByLabelText("员工编号")).toHaveValue("SYN-E"); fireEvent.change(screen.getByLabelText("员工编号"), { target: { value: "SYN-E2" } }); fireEvent.click(screen.getByRole("button", { name: "转入预入职" })); await waitFor(() => expect(done).toHaveBeenCalledTimes(1));
  expect(vi.mocked(hrApi.convertRecruitmentCandidate).mock.calls[1]?.[3]).not.toEqual(vi.mocked(hrApi.convertRecruitmentCandidate).mock.calls[0]?.[3]);
});
it("processing409 remains uncertain while a definitive business409 releases editing", async () => {
  vi.mocked(hrApi.convertRecruitmentCandidate).mockRejectedValueOnce(Object.assign(new Error("The same idempotency key is still processing"), { status: 409 })).mockRejectedValueOnce(Object.assign(new Error("HR_CANDIDATE_PROFILE_TARGET_CONFLICT"), { status: 409 }));
  const busy = vi.fn(); render(<CandidateConversion candidate={candidate} positions={[]} disabled={false} onBusyChange={busy} onConverted={vi.fn()} />); edit(); fireEvent.click(screen.getByRole("button", { name: "转入预入职" })); await screen.findByRole("button", { name: "原请求重试" }); expect(screen.getByLabelText("员工编号")).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "原请求重试" })); await screen.findByText("候选人与已有员工档案资料不一致，请核对后再办理，已有资料未被覆盖。"); expect(screen.getByLabelText("员工编号")).toBeEnabled(); expect(busy).toHaveBeenLastCalledWith(false);
});
it("malformed successful response keeps the original request and never claims success", async () => {
  vi.mocked(hrApi.convertRecruitmentCandidate).mockResolvedValueOnce({ ...receipt, employeeId: "bad-id" }); const done = vi.fn();
  render(<CandidateConversion candidate={candidate} positions={[]} disabled={false} onBusyChange={vi.fn()} onConverted={done} />); edit(); fireEvent.click(screen.getByRole("button", { name: "转入预入职" })); await screen.findByRole("button", { name: "原请求重试" }); expect(done).not.toHaveBeenCalled(); expect(screen.getByLabelText("员工编号")).toBeDisabled();
});
it("same-frame submit is serialized and late completion after unmount is discarded", async () => {
  let resolve: (value: typeof receipt) => void = () => {}; vi.mocked(hrApi.convertRecruitmentCandidate).mockImplementationOnce(() => new Promise(done => { resolve = done; })); const done = vi.fn();
  const view = render(<CandidateConversion candidate={candidate} positions={[]} disabled={false} onBusyChange={() => { fireEvent.submit(screen.getByRole("form", { name: "转入预入职办理" })); }} onConverted={done} />); edit(); fireEvent.click(screen.getByRole("button", { name: "转入预入职" })); expect(hrApi.convertRecruitmentCandidate).toHaveBeenCalledTimes(1); view.unmount(); await act(async () => resolve(receipt)); expect(done).not.toHaveBeenCalled();
});
it("actual parent preserves confirmed receipt through refresh failure and preselects exact employee for onboarding", async () => {
  render(<HrRecruitmentClient />); fireEvent.click(await screen.findByRole("button", { name: "下一动作" })); edit(); fireEvent.click(screen.getByRole("button", { name: "转入预入职" }));
  await screen.findByRole("region", { name: "预入职办理回执" }); expect(screen.getByRole("link", { name: "查看员工档案" })).toHaveAttribute("href", `/hr/employees?employee_id=${employeeId}`);
  expect(screen.getByText("已选：合成候选人 · SYN-C")).toBeInTheDocument(); expect(screen.queryByRole("button", { name: "转入预入职" })).toBeNull();
  vi.mocked(hrApi.recruitmentRequisitions).mockRejectedValueOnce(new Error("合成读取失败")); fireEvent.click(screen.getByRole("button", { name: "刷新" })); await screen.findByText("合成读取失败"); expect(screen.getByRole("region", { name: "预入职办理回执" })).toBeInTheDocument(); expect(hrApi.convertRecruitmentCandidate).toHaveBeenCalledTimes(1);
  fireEvent.change(screen.getByLabelText("申请名称"), { target: { value: "后续入职" } }); fireEvent.change(screen.getByLabelText("申请日期"), { target: { value: "2026-10-11" } }); fireEvent.change(screen.getByLabelText("入职日期"), { target: { value: "2026-10-15" } }); fireEvent.change(screen.getByLabelText("考勤卡号"), { target: { value: "123" } });
  vi.mocked(hrApi.createOnboardingApplication).mockRejectedValueOnce(new Error("合成草稿保留")); fireEvent.click(screen.getByRole("button", { name: "保存入职申请草稿" })); await screen.findByText("合成草稿保留"); expect(hrApi.createOnboardingApplication).toHaveBeenCalledWith(expect.objectContaining({ candidateId: candidate.id, employeeId }), "synthetic-token", expect.any(String));
});
it("actual parent locks refresh/close synchronously throughout uncertain conversion", async () => {
  vi.mocked(hrApi.convertRecruitmentCandidate).mockRejectedValueOnce(new Error("网络未知")); render(<HrRecruitmentClient />); fireEvent.click(await screen.findByRole("button", { name: "下一动作" })); edit();
  const before = vi.mocked(hrApi.recruitmentCandidates).mock.calls.length; fireEvent.click(screen.getByRole("button", { name: "转入预入职" })); await screen.findByRole("button", { name: "原请求重试" }); expect(screen.getByRole("button", { name: "刷新" })).toBeDisabled(); expect(screen.getByRole("button", { name: "关闭" })).toBeDisabled(); fireEvent.click(screen.getByRole("button", { name: "刷新" })); expect(hrApi.recruitmentCandidates).toHaveBeenCalledTimes(before);
});
it("restricted reader gets no employee link and context change clears old confirmation", async () => {
  auth.user.permissions = ["hr:recruitment", "hr:candidate:read", "hr:candidate:convert"]; const view = render(<HrRecruitmentClient />); fireEvent.click(await screen.findByRole("button", { name: "下一动作" })); edit(); fireEvent.click(screen.getByRole("button", { name: "转入预入职" })); await screen.findByRole("region", { name: "预入职办理回执" }); expect(screen.queryByRole("link", { name: "查看员工档案" })).toBeNull(); expect(screen.queryByRole("link", { name: "继续填写入职申请" })).toBeNull();
  auth.user = { ...auth.user, id: "other-hr" }; view.rerender(<HrRecruitmentClient />); await screen.findByText("合成候选人 · Offer"); expect(screen.queryByRole("region", { name: "预入职办理回执" })).toBeNull();
});
