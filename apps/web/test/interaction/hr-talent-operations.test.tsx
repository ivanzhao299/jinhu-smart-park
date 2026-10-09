import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { HR_PERMISSIONS as H } from "@jinhu/shared";
import { HrTalentClient } from "../../app/hr/talent/HrTalentClient";
import { hrApi } from "../../lib/hr-api";

const state = vi.hoisted(() => ({ user: { permissions: [] as string[] } }));
vi.mock("../../lib/auth-context", () => ({ useAuthUser: () => state.user }));
vi.mock("../../lib/authz", () => ({ getAccessToken: () => "synthetic-token" }));
vi.mock("../../components/auth/PermissionGuard", () => ({ PermissionGuard: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("../../lib/hr-api", () => ({ hrApi: {
  talentOptions: vi.fn(), talentProfiles: vi.fn(), talentSessions: vi.fn(), talentSuccession: vi.fn(),
  developmentPlans: vi.fn(), talentSubjects: vi.fn(), createTalentProfile: vi.fn(),
  decideTalentSubject: vi.fn(), createTalentSession: vi.fn(), createCriticalPosition: vi.fn(), createSuccessor: vi.fn(),
} }));

beforeEach(() => {
  vi.resetAllMocks();
  state.user = { permissions: [H.HR_TALENT_READ, H.HR_TALENT_PROFILE_CREATE, H.HR_TALENT_REVIEW, H.HR_SUCCESSION_MANAGE] };
  vi.mocked(hrApi.talentOptions).mockResolvedValue({ employees: [{ id: "employee-a", fullName: "合成员工", employeeCode: "SYN-E", orgId: null }], positions: [] });
  vi.mocked(hrApi.talentProfiles).mockResolvedValue([{ id: "profile-a", snapshotNo: 1, asOfDate: "2090-01-01", employeeName: "合成员工", employeeCode: "SYN-E", performanceSource: {}, feedbackSource: {}, createdAt: "2090-01-01" }]);
  vi.mocked(hrApi.talentSessions).mockResolvedValue([{ id: "session-a", sessionCode: "SYN-S", sessionName: "合成盘点", reviewDate: "2090-01-01", status: "active", subjectCount: 1 }]);
  vi.mocked(hrApi.talentSubjects).mockResolvedValue([{ id: "subject-a", employeeName: "合成员工", employeeCode: "SYN-E", profileAsOf: "2090-01-01", performanceBand: null, potentialBand: null, nineBox: null, potentialScore: null, reason: null }]);
  vi.mocked(hrApi.talentSuccession).mockResolvedValue([{ criticalPositionId: "position-a", positionName: "合成岗位", criticality: "critical", positionRisk: "high", candidateName: "合成候选", employeeCode: "SYN-C", readiness: "ready_now", candidateRisk: "low", riskReason: "合成依据", assessedAt: "2090-01-01" }]);
  vi.mocked(hrApi.developmentPlans).mockResolvedValue([]);
});

it("freezes the exact chosen employee and date through the existing operation", async () => {
  render(<HrTalentClient />);
  await screen.findByRole("option", { name: /合成盘点/ });
  fireEvent.click(screen.getByRole("button", { name: "冻结画像" }));
  fireEvent.change(screen.getByLabelText("员工"), { target: { value: "employee-a" } });
  fireEvent.change(screen.getByLabelText("数据时点"), { target: { value: "2090-01-02" } });
  fireEvent.submit(screen.getByRole("button", { name: "确认冻结" }).closest("form")!);
  await waitFor(() => expect(hrApi.createTalentProfile).toHaveBeenCalledWith({ employeeId: "employee-a", asOfDate: "2090-01-02" }, "synthetic-token"));
  await screen.findByText("人才画像已按已确认来源冻结");
});

it("keeps rejected nine-box inputs and retries the same subject with precise evidence", async () => {
  vi.mocked(hrApi.decideTalentSubject).mockRejectedValueOnce(new Error("合成决议失败"));
  render(<HrTalentClient />);
  await screen.findByRole("option", { name: /合成盘点/ });
  fireEvent.change(screen.getByLabelText("盘点会议"), { target: { value: "session-a" } });
  const reason = await screen.findByLabelText("决议依据");
  fireEvent.change(screen.getByLabelText("绩效档位"), { target: { value: "medium" } });
  fireEvent.change(screen.getByLabelText("潜力分数"), { target: { value: "81.25" } });
  fireEvent.change(reason, { target: { value: "合成会议确认依据" } });
  fireEvent.submit(reason.closest("form")!);
  await screen.findByText("合成决议失败");
  expect(reason).toHaveValue("合成会议确认依据");
  expect(screen.getByLabelText("潜力分数")).toHaveValue(81.25);
  expect(hrApi.decideTalentSubject).toHaveBeenCalledWith("subject-a", { performanceBand: "medium", potentialBand: "high", potentialScore: 81.25, reason: "合成会议确认依据", evidence: [{ type: "meeting_record", note: "合成会议确认依据" }] }, "synthetic-token");
  fireEvent.submit(reason.closest("form")!);
  await screen.findByText("九宫格决议已追加");
  expect(hrApi.decideTalentSubject).toHaveBeenCalledTimes(2);
});

it("read-only review access has no profile, decision, session or succession write controls", async () => {
  state.user = { permissions: [H.HR_TALENT_READ] };
  render(<HrTalentClient />);
  await screen.findByRole("option", { name: /合成盘点/ });
  fireEvent.change(screen.getByLabelText("盘点会议"), { target: { value: "session-a" } });
  await waitFor(() => expect(hrApi.talentSubjects).toHaveBeenCalled());
  for (const name of ["冻结画像", "新建盘点", "新建发展计划", "登记岗位", "评估候选", "结束盘点"]) expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
  expect(screen.queryByText("记录决议")).not.toBeInTheDocument();
  expect(screen.queryByText("合成候选")).not.toBeInTheDocument();
  expect(hrApi.talentSuccession).not.toHaveBeenCalled();
  expect(hrApi.decideTalentSubject).not.toHaveBeenCalled();
});

it("succession readers can see candidates without management controls or unrelated reads", async () => {
  state.user = { permissions: [H.HR_SUCCESSION_READ] };
  render(<HrTalentClient />);
  await screen.findByText("合成候选");
  expect(screen.queryByRole("button", { name: "登记岗位" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "评估候选" })).not.toBeInTheDocument();
  expect(hrApi.talentProfiles).not.toHaveBeenCalled();
  expect(hrApi.talentSessions).not.toHaveBeenCalled();
  expect(hrApi.talentOptions).not.toHaveBeenCalled();
});

it("removes an open mutable panel when its exact authority is revoked", async () => {
  const view = render(<HrTalentClient />);
  await screen.findByRole("option", { name: /合成盘点/ });
  fireEvent.click(screen.getByRole("button", { name: "冻结画像" }));
  expect(screen.getByLabelText("数据时点")).toBeInTheDocument();
  state.user = { permissions: [H.HR_TALENT_READ] };
  view.rerender(<HrTalentClient />);
  await waitFor(() => expect(screen.queryByLabelText("数据时点")).not.toBeInTheDocument());
  expect(hrApi.createTalentProfile).not.toHaveBeenCalled();
});
