import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { HrRecruitmentClient } from "../../app/hr/recruitment/HrRecruitmentClient";
import { hrApi } from "../../lib/hr-api";
const gate = vi.hoisted(() => ({ attempt: () => {}, manage: true, onSaved: (_row: unknown) => {} }));
vi.mock("../../lib/auth-context", () => ({ useAuthUser: () => ({ id: "hr", permissions: ["hr:recruitment", "hr:requisition:read", "hr:candidate:read", "hr:candidate:stage", ...(gate.manage ? ["hr:requisition:manage"] : [])], enabled_modules: [{ module_code: "hr" }] }) }));
vi.mock("../../lib/authz", () => ({ getAccessToken: () => "synthetic-token" }));
vi.mock("../../app/hr/recruitment/RequisitionOperations", () => ({ RequisitionOperations: ({ requisitionId, canManage, onBusyChange, onSaved }: { requisitionId: string; canManage: boolean; onBusyChange: (busy: boolean) => void; onSaved: (row: unknown) => void }) => {
  gate.onSaved = onSaved; return <button onClick={() => { onBusyChange(true); gate.attempt(); }}>{canManage ? "合成需求保存" : "合成只读需求"} {requisitionId}</button>;
} }));
vi.mock("../../app/hr/recruitment/CandidateProfile", () => ({ CandidateProfile: () => null }));
vi.mock("../../app/hr/recruitment/CandidateInterviews", () => ({ CandidateInterviews: () => null }));
vi.mock("../../app/hr/recruitment/CandidateAssessment", () => ({ CandidateAssessment: () => null }));
vi.mock("../../app/hr/recruitment/CandidateStageHistory", () => ({ CandidateStageHistory: () => null }));
vi.mock("../../lib/hr-api", () => ({ hrApi: { recruitmentRequisitions: vi.fn(), recruitmentCandidates: vi.fn(), moveRecruitmentCandidate: vi.fn(), directoryOptions: vi.fn(), positions: vi.fn() } }));
const req = { id: "req-a", requisitionCode: "R-1", title: "合成需求", orgId: "org-a", orgName: "合成部门", positionId: null, positionName: null, headcount: 3, hiredCount: 1, ownerUserId: "owner-a", ownerName: "负责人", plannedOnboardDate: null, status: "open" };
beforeEach(() => { vi.resetAllMocks(); gate.manage = true; gate.attempt = () => {}; vi.mocked(hrApi.recruitmentRequisitions).mockResolvedValue({ items: [req, { ...req, id: "req-b", title: "第二需求" }], total: 2, page: 1, page_size: 20 }); vi.mocked(hrApi.recruitmentCandidates).mockResolvedValue({ items: [{ id: "candidate-a", candidateNo: "C-1", fullName: "合成候选人", requisitionId: "req-a", requisitionTitle: "合成需求", stage: "screening", source: null, expectedOnboardDate: null, latestEvaluation: null, mobileMasked: null, emailMasked: null, identityMasked: null, convertedEmployeeId: null }], total: 1, page: 1, page_size: 20 }); vi.mocked(hrApi.directoryOptions).mockResolvedValue({ orgs: [], users: [] }); vi.mocked(hrApi.positions).mockResolvedValue([]); });
it("a child write synchronously blocks refresh, demand switch, close and candidate-stage writes", async () => {
  render(<HrRecruitmentClient />); await screen.findByText("第二需求"); fireEvent.click(screen.getByRole("button", { name: "下一动作" })); fireEvent.click(screen.getAllByRole("button", { name: "查看与办理需求" })[0]!);
  const refresh = screen.getByRole("button", { name: "刷新" }), close = screen.getByRole("button", { name: "关闭需求办理" }), other = screen.getAllByRole("button", { name: "查看与办理需求" })[1]!, stage = screen.getByRole("button", { name: "面试" });
  const count = vi.mocked(hrApi.recruitmentRequisitions).mock.calls.length; gate.attempt = () => { fireEvent.click(refresh); fireEvent.click(close); fireEvent.click(other); fireEvent.click(stage); };
  fireEvent.click(screen.getByRole("button", { name: "合成需求保存 req-a" })); await waitFor(() => expect(refresh).toBeDisabled()); expect(screen.getByRole("button", { name: "合成需求保存 req-a" })).toBeInTheDocument(); expect(hrApi.recruitmentRequisitions).toHaveBeenCalledTimes(count); expect(hrApi.moveRecruitmentCandidate).not.toHaveBeenCalled();
});
it("read-only parent opens the exact demand without granting edit authority", async () => {
  gate.manage = false; render(<HrRecruitmentClient />); await screen.findByText("第二需求"); fireEvent.click(screen.getAllByRole("button", { name: "查看与办理需求" })[1]!); expect(screen.getByRole("button", { name: "合成只读需求 req-b" })).toBeInTheDocument();
});
