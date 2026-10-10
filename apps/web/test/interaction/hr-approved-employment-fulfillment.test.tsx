import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { HR_PERMISSIONS as H } from "@jinhu/shared";
import { ApprovedEmploymentRequestsPanel } from "../../app/hr/approvals/ApprovedEmploymentRequestsPanel";
import { hrApi, type HrApprovedEmploymentDraft, type HrApprovedEmploymentRequest, type HrLinkedJobChangeApplication } from "../../lib/hr-api";
import { ApiError } from "../../lib/api-client";
import type * as ApiClientModule from "../../lib/api-client";

const state = vi.hoisted(() => ({ user: { id: "hr", park_id: "park", permissions: [] as string[] }, nextKey: 0 }));
vi.mock("../../lib/auth-context", () => ({ useAuthUser: () => state.user }));
vi.mock("../../lib/authz", () => ({ getAccessToken: () => "synthetic-token" }));
vi.mock("../../lib/api-client", async original => ({ ...await original<typeof ApiClientModule>(), createIdempotencyKey: () => `key-${++state.nextKey}` }));
vi.mock("../../lib/hr-api", () => ({ hrApi: { approvedEmploymentRequests: vi.fn(), createJobChangeFromApproval: vi.fn(), jobChangeOptions: vi.fn() } }));
const source = (id = "source"): HrApprovedEmploymentRequest => ({ id, requestNo: `SYN-${id}`, title: "合成任职申请", description: "说明不能自动变成岗位字段", subjectEmployeeId: "employee", employeeCode: "SYN-001", employeeName: "合成员工", version: 7, completedAt: null, jobChange: null });
const result = (body: HrApprovedEmploymentDraft): HrLinkedJobChangeApplication => ({ ...body, version: 1, id: "job", applicationNo: "SYN-DZ-001", employeeCode: "SYN-001", employeeName: "合成员工", beforeOrgId: "before", beforeOrgName: "原组织", beforePositionId: null, beforePositionName: null, afterOrgName: "新组织", afterPositionId: body.afterPositionId ?? null, afterPositionName: null, status: "draft", reviewComment: null, reviewedAt: null, appliedAt: null, sourceApprovalId: "source", sourceApprovalVersion: body.expectedApprovalVersion });
beforeEach(() => {
 vi.resetAllMocks(); state.nextKey = 0; state.user = { id: "hr", park_id: "park", permissions: [H.HR_APPROVAL_PARK_REVIEW, H.HR_JOB_CHANGE_MANAGE] };
 vi.mocked(hrApi.approvedEmploymentRequests).mockResolvedValue({ items: [source()], total: 1, page: 1, page_size: 20 });
 vi.mocked(hrApi.jobChangeOptions).mockResolvedValue({ employees: [], orgs: [{ id: "org", orgName: "新组织" }], positions: [{ id: "position", orgId: "org", positionCode: "P1", positionName: "新岗位" }] });
 vi.mocked(hrApi.createJobChangeFromApproval).mockImplementation(async (_id, body) => result(body));
});
async function edit() {
 fireEvent.click(await screen.findByRole("button", { name: "建立岗位变更办理单" }));
 await screen.findByRole("option", { name: "新组织" });
 fireEvent.change(screen.getByLabelText("办理名称"), { target: { value: "正式轮岗" } });
 fireEvent.change(screen.getByLabelText("调整后组织"), { target: { value: "org" } });
 fireEvent.change(screen.getByLabelText("调整后岗位"), { target: { value: "position" } });
 fireEvent.change(screen.getByLabelText("变更原因"), { target: { value: "HR核对后的结构化办理" } });
}
function save() { fireEvent.submit(screen.getByRole("button", { name: "保存关联办理草稿" }).closest("form")!); }

it("requires both permissions and does not read for a team reviewer or job manager alone", async () => {
 for (const permissions of [[H.HR_APPROVAL_TEAM_REVIEW, H.HR_JOB_CHANGE_MANAGE], [H.HR_APPROVAL_PARK_REVIEW], [H.HR_JOB_CHANGE_MANAGE]]) {
  state.user.permissions = permissions; const view = render(<ApprovedEmploymentRequestsPanel/>); expect(screen.queryByRole("region")).toBeNull(); view.unmount();
 }
 expect(hrApi.approvedEmploymentRequests).not.toHaveBeenCalled();
});
it("pages and searches the real queue without a fixed first-page limit", async () => {
 vi.mocked(hrApi.approvedEmploymentRequests).mockImplementation(async (_token, page = 1) => ({ items: [source(`page-${page}`)], total: 21, page, page_size: 20 }));
 render(<ApprovedEmploymentRequestsPanel/>); await screen.findByText("第 1 / 2 页 · 共 21 项"); fireEvent.click(screen.getByRole("button", { name: "下一页" })); await screen.findByText(/SYN-page-2/);
 fireEvent.change(screen.getByLabelText("查找已批准任职申请"), { target: { value: "员工501" } }); fireEvent.click(screen.getByRole("button", { name: "查询" }));
 await waitFor(() => expect(hrApi.approvedEmploymentRequests).toHaveBeenLastCalledWith("synthetic-token", 1, 20, "员工501", expect.any(AbortSignal)));
});
it("keeps source/employee/version fixed, requires explicit business fields and retains the receipt through a failed read", async () => {
 render(<ApprovedEmploymentRequestsPanel/>); await edit(); expect(screen.getByLabelText("办理名称")).toHaveValue("正式轮岗"); expect(screen.getByLabelText("变更原因")).not.toHaveValue(source().description);
 vi.mocked(hrApi.approvedEmploymentRequests).mockRejectedValueOnce(new Error("合成刷新失败")); save();
 await screen.findByText("已建立办理单 SYN-DZ-001"); await screen.findByText("合成刷新失败");
 const call = vi.mocked(hrApi.createJobChangeFromApproval).mock.calls[0]!; expect(call[0]).toBe("source"); expect(call[1]).toMatchObject({ employeeId: "employee", expectedApprovalVersion: 7, afterOrgId: "org", afterPositionId: "position" });
 expect(screen.getByRole("region", { name: "任职办理回执" })).toHaveTextContent("本次仅建立草稿，未执行任职变更"); expect(screen.getByRole("link", { name: "继续岗位变更审批与生效" })).toHaveAttribute("href", "/hr/lifecycle#job-change-applications");
 fireEvent.click(screen.getByRole("button", { name: "刷新办理队列" })); await waitFor(() => expect(hrApi.approvedEmploymentRequests).toHaveBeenCalledTimes(3)); expect(hrApi.createJobChangeFromApproval).toHaveBeenCalledTimes(1);
 expect(screen.queryByRole("button", { name: "建立岗位变更办理单" })).toBeNull();
});
it("freezes one uncertain operation and retries the original key/body only", async () => {
 vi.mocked(hrApi.createJobChangeFromApproval).mockRejectedValueOnce(new Error("回执未确认")); render(<ApprovedEmploymentRequestsPanel/>); await edit(); save(); await screen.findByRole("button", { name: "按原请求重试建立办理单" });
 expect(screen.getByLabelText("变更原因")).toBeDisabled(); expect(screen.getByRole("button", { name: "取消办理" })).toBeDisabled(); fireEvent.click(screen.getByRole("button", { name: "按原请求重试建立办理单" }));
 await screen.findByText("已建立办理单 SYN-DZ-001"); const calls = vi.mocked(hrApi.createJobChangeFromApproval).mock.calls; expect(calls).toHaveLength(2); expect(calls[1]).toEqual(calls[0]);
});
it("a mismatched source receipt cannot publish success or release the original retry", async () => {
 vi.mocked(hrApi.createJobChangeFromApproval).mockImplementationOnce(async (_id, body) => ({ ...result(body), sourceApprovalId: "other" })); render(<ApprovedEmploymentRequestsPanel/>); await edit(); save();
 await screen.findByText("办理回执无法核对，请按原请求重试。"); expect(screen.queryByRole("region", { name: "任职办理回执" })).toBeNull(); fireEvent.click(screen.getByRole("button", { name: "按原请求重试建立办理单" })); await screen.findByText("已建立办理单 SYN-DZ-001");
 expect(vi.mocked(hrApi.createJobChangeFromApproval).mock.calls[1]).toEqual(vi.mocked(hrApi.createJobChangeFromApproval).mock.calls[0]);
});
it("known version rejection preserves the editable draft and starts a fresh corrected attempt", async () => {
 vi.mocked(hrApi.createJobChangeFromApproval).mockRejectedValueOnce(new ApiError("审批版本已变化", 409)); render(<ApprovedEmploymentRequestsPanel/>); await edit(); save(); await screen.findByText("审批版本已变化"); expect(screen.getByLabelText("办理名称")).toHaveValue("正式轮岗"); expect(screen.getByLabelText("办理名称")).toBeEnabled(); expect(screen.queryByText("按原请求重试建立办理单")).toBeNull();
 fireEvent.change(screen.getByLabelText("变更原因"), { target: { value: "重新核对" } }); save(); await screen.findByText("已建立办理单 SYN-DZ-001"); const calls = vi.mocked(hrApi.createJobChangeFromApproval).mock.calls; expect(calls[1]![3]).not.toBe(calls[0]![3]);
});
it("failed references block saving, and retry recovers without dropping the draft", async () => {
 vi.mocked(hrApi.jobChangeOptions).mockRejectedValueOnce(new Error("组织读取失败")); render(<ApprovedEmploymentRequestsPanel/>); fireEvent.click(await screen.findByRole("button", { name: "建立岗位变更办理单" })); await screen.findByText("组织读取失败"); fireEvent.change(screen.getByLabelText("办理名称"), { target: { value: "保留名称" } }); expect(screen.getByRole("button", { name: "保存关联办理草稿" })).toBeDisabled();
 fireEvent.click(screen.getByRole("button", { name: "重试读取组织岗位" })); await screen.findByRole("option", { name: "新组织" }); expect(screen.getByLabelText("办理名称")).toHaveValue("保留名称"); expect(hrApi.jobChangeOptions).toHaveBeenLastCalledWith("synthetic-token", expect.any(AbortSignal), false);
});
it("context replacement aborts old reads and suppresses a late write receipt", async () => {
 let finish!: (row: HrLinkedJobChangeApplication) => void;
 vi.mocked(hrApi.createJobChangeFromApproval).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })); const view = render(<ApprovedEmploymentRequestsPanel/>); await edit(); save(); await waitFor(() => expect(hrApi.createJobChangeFromApproval).toHaveBeenCalledTimes(1));
 const body = vi.mocked(hrApi.createJobChangeFromApproval).mock.calls[0]![1], signal = vi.mocked(hrApi.approvedEmploymentRequests).mock.calls[0]![4]!;
 state.user = { ...state.user, park_id: "new-park" }; view.rerender(<ApprovedEmploymentRequestsPanel/>); expect(signal.aborted).toBe(true); await act(async () => finish(result(body))); expect(screen.queryByRole("region", { name: "任职办理回执" })).toBeNull();
});

it("does not acknowledge an incomplete receipt without its real application number and version", async () => {
 vi.mocked(hrApi.createJobChangeFromApproval).mockImplementationOnce(async (_id, body) => ({ ...result(body), applicationNo: "", version: undefined }));
 render(<ApprovedEmploymentRequestsPanel/>); await edit(); save();
 await screen.findByText("办理回执无法核对，请按原请求重试。"); expect(screen.queryByRole("region", { name: "任职办理回执" })).toBeNull();
 expect(screen.getByLabelText("办理名称")).toBeDisabled(); fireEvent.click(screen.getByRole("button", { name: "按原请求重试建立办理单" }));
 await screen.findByText("已建立办理单 SYN-DZ-001"); expect(vi.mocked(hrApi.createJobChangeFromApproval).mock.calls[1]).toEqual(vi.mocked(hrApi.createJobChangeFromApproval).mock.calls[0]);
});
