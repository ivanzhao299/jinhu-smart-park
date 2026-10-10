import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { HR_PERMISSIONS as H } from "@jinhu/shared";
import { ApprovedProfileRequestsPanel } from "../../app/hr/approvals/ApprovedProfileRequestsPanel";
import { ApiError } from "../../lib/api-client";
import { hrApi, type HrApprovedProfileBody, type HrApprovedProfileReceipt, type HrApprovedProfileRequest, type HrEmployeeProfile } from "../../lib/hr-api";

const state = vi.hoisted(() => ({ user: { id: "actor", park_id: "park", permissions: [] as string[] } }));
vi.mock("../../lib/auth-context", () => ({ useAuthUser: () => state.user }));
vi.mock("../../lib/authz", () => ({ getAccessToken: () => "synthetic-token" }));
vi.mock("../../lib/hr-api", () => ({ hrApi: { approvedProfileRequests: vi.fn(), profile: vi.fn(), fulfillProfileApproval: vi.fn() } }));
const source: HrApprovedProfileRequest = { id: "source", requestNo: "SYN-001", title: "联系资料变更", description: "合成说明，不能自动填写字段", subjectEmployeeId: "employee", employeeCode: "E001", employeeName: "合成员工", version: 3, completedAt: null, fulfillment: null };
const profile: HrEmployeeProfile = { id: "profile", employeeId: "employee", version: 7, masked: false, idType: "passport", idNumber: "SYNTHETIC", idNumberMasked: "SYN***", jobTitle: "岗位", jobGrade: null, employeeCategory: null, technicalTitle: null, technicalGrade: null, personalMobile: "13800000000", personalEmail: null, address: "原联系地址", emergencyContactName: null, emergencyContactMobile: null, remark: "原备注", gender: "历史保留值", highestEducation: "本科" };
const result = (body: HrApprovedProfileBody): HrApprovedProfileReceipt => ({ sourceApprovalId: "source", sourceApprovalVersion: body.expectedApprovalVersion, employeeId: body.employeeId, profileId: "profile", beforeVersion: body.expectedVersion, afterVersion: body.expectedVersion + 1, fieldNames: ["address"], profile: { ...profile, version: body.expectedVersion + 1 } });
beforeEach(() => {
 vi.resetAllMocks(); state.user = { id: "actor", park_id: "park", permissions: [H.HR_APPROVAL_PARK_REVIEW, H.HR_EMPLOYEE_PROFILE_MANAGE] };
 vi.mocked(hrApi.approvedProfileRequests).mockImplementation(async (_token, page = 1, pageSize = 20) => ({ items: [source], total: 1, page, page_size: pageSize }));
 vi.mocked(hrApi.profile).mockResolvedValue(profile);
 vi.mocked(hrApi.fulfillProfileApproval).mockImplementation(async (_id, body) => result(body));
});
async function edit() { fireEvent.click(await screen.findByRole("button", { name: "办理档案变更" })); await screen.findByRole("button", { name: "保存档案并完成办理" }); }
function save() { fireEvent.submit(screen.getByRole("button", { name: "保存档案并完成办理" }).closest("form")!); }

it.each([{ permissions: [H.HR_APPROVAL_PARK_REVIEW] }, { permissions: [H.HR_EMPLOYEE_PROFILE_MANAGE] }, { permissions: [H.HR_APPROVAL_TEAM_REVIEW, H.HR_EMPLOYEE_PROFILE_MANAGE] }])("requires both exact park review and profile management permissions: $permissions", ({ permissions }) => {
 state.user.permissions = permissions; render(<ApprovedProfileRequestsPanel/>); expect(screen.queryByRole("region", { name: "已批准档案申请办理" })).toBeNull(); expect(hrApi.approvedProfileRequests).not.toHaveBeenCalled();
});
it("reads all existing fields, keeps original values, explicitly clears identity, and binds the real source employee/version", async () => {
 render(<ApprovedProfileRequestsPanel/>); await edit();
 const form = screen.getByRole("button", { name: "保存档案并完成办理" }).closest("form")!;
 expect(form.querySelectorAll("input[name],select[name],textarea[name]")).toHaveLength(33);
 expect(screen.getByLabelText("联系地址")).toHaveValue("原联系地址"); expect(screen.getByLabelText("性别")).toHaveValue("历史保留值");
 fireEvent.change(screen.getByLabelText("证件号（加密保存）"), { target: { value: "" } }); fireEvent.change(screen.getByLabelText("联系地址"), { target: { value: "新联系地址" } }); save();
 await screen.findByText("档案变更已办理");
 expect(hrApi.fulfillProfileApproval).toHaveBeenCalledWith("source", expect.objectContaining({ employeeId: "employee", expectedApprovalVersion: 3, expectedVersion: 7, address: "新联系地址", idNumber: "", gender: "历史保留值", highestEducation: "本科", remark: "原备注" }), "synthetic-token", expect.any(String));
 expect(screen.getByRole("link", { name: "查看正式员工档案" })).toHaveAttribute("href", "/hr/employees?employee_id=employee");
 expect(hrApi.profile).toHaveBeenCalledWith("employee", "synthetic-token", expect.any(AbortSignal));
});
it("supports first formal profile creation with expectedVersion zero", async () => {
 vi.mocked(hrApi.profile).mockResolvedValue(null); render(<ApprovedProfileRequestsPanel/>); await edit(); save(); await screen.findByText("档案变更已办理"); expect(vi.mocked(hrApi.fulfillProfileApproval).mock.calls[0]![1].expectedVersion).toBe(0);
});
it.each(["failed", "foreign", "masked"])("cannot save before an admitted current profile: %s", async kind => {
 if (kind === "failed") vi.mocked(hrApi.profile).mockRejectedValueOnce(new Error("合成读取失败"));
 else vi.mocked(hrApi.profile).mockResolvedValueOnce({ ...profile, ...(kind === "foreign" ? { employeeId: "other" } : { masked: true }) });
 render(<ApprovedProfileRequestsPanel/>); fireEvent.click(await screen.findByRole("button", { name: "办理档案变更" })); await screen.findByRole("button", { name: "重试读取当前档案" }); expect(screen.queryByRole("button", { name: "保存档案并完成办理" })).toBeNull(); expect(hrApi.fulfillProfileApproval).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole("button", { name: "重试读取当前档案" })); await screen.findByRole("button", { name: "保存档案并完成办理" });
});
it.each(["lost", "processing", "malformed"])("freezes an uncertain attempt and retries its exact body/key: %s", async kind => {
 if (kind === "malformed") vi.mocked(hrApi.fulfillProfileApproval).mockImplementationOnce(async (_id, body) => ({ ...result(body), employeeId: "other" }));
 else vi.mocked(hrApi.fulfillProfileApproval).mockRejectedValueOnce(kind === "processing" ? new ApiError("The same idempotency key is still processing", 409) : new Error("合成回执丢失"));
 render(<ApprovedProfileRequestsPanel/>); await edit(); fireEvent.change(screen.getByLabelText("联系地址"), { target: { value: "保留输入" } }); save(); save();
 await screen.findByRole("button", { name: "按原请求重试档案办理" }); expect(hrApi.fulfillProfileApproval).toHaveBeenCalledTimes(1); expect(screen.getByLabelText("联系地址")).toBeDisabled(); expect(screen.getByRole("button", { name: "取消档案办理" })).toBeDisabled();
 expect(screen.queryByRole("region", { name: "档案办理回执" })).toBeNull(); fireEvent.click(screen.getByRole("button", { name: "按原请求重试档案办理" })); await screen.findByText("档案变更已办理");
 const calls = vi.mocked(hrApi.fulfillProfileApproval).mock.calls; expect(calls[1]).toEqual(calls[0]);
});
it("preserves editable input after a known rejection and uses a fresh corrected attempt", async () => {
 vi.mocked(hrApi.fulfillProfileApproval).mockRejectedValueOnce(new ApiError("合成字段校验失败", 400)); render(<ApprovedProfileRequestsPanel/>); await edit(); fireEvent.change(screen.getByLabelText("联系地址"), { target: { value: "保留草稿" } }); save(); await screen.findByText("合成字段校验失败"); expect(screen.getByLabelText("联系地址")).toHaveValue("保留草稿"); expect(screen.getByLabelText("联系地址")).toBeEnabled(); save(); await screen.findByText("档案变更已办理"); const calls = vi.mocked(hrApi.fulfillProfileApproval).mock.calls; expect(calls[1]![3]).not.toBe(calls[0]![3]);
});
it("retains a conflict draft and requires explicit latest-profile reload before another write", async () => {
 vi.mocked(hrApi.fulfillProfileApproval).mockRejectedValueOnce(new ApiError("合成版本冲突", 409)); render(<ApprovedProfileRequestsPanel/>); await edit(); fireEvent.change(screen.getByLabelText("联系地址"), { target: { value: "需先复制" } }); save(); await screen.findByText("合成版本冲突"); expect(screen.getByLabelText("联系地址")).toHaveValue("需先复制"); expect(screen.getByRole("button", { name: "保存档案并完成办理" })).toBeDisabled(); save(); expect(hrApi.fulfillProfileApproval).toHaveBeenCalledTimes(1);
 vi.mocked(hrApi.profile).mockResolvedValue({ ...profile, version: 8, address: "并发最新地址" }); fireEvent.click(screen.getByRole("button", { name: "重新读取最新档案" })); await waitFor(() => expect(screen.getByLabelText("联系地址")).toHaveValue("并发最新地址")); save(); await screen.findByText("档案变更已办理"); expect(vi.mocked(hrApi.fulfillProfileApproval).mock.calls[1]![1].expectedVersion).toBe(8);
});
it("keeps a confirmed receipt and completion even when independent queue refresh fails or is stale", async () => {
 render(<ApprovedProfileRequestsPanel/>); await edit(); vi.mocked(hrApi.approvedProfileRequests).mockRejectedValueOnce(new Error("合成队列刷新失败")); save(); await screen.findByText("档案变更已办理"); await screen.findByText("合成队列刷新失败"); expect(within(screen.getByRole("region", { name: "档案办理回执" })).getByText(/版本 7 → 8/)).toBeInTheDocument();
 fireEvent.click(screen.getByRole("button", { name: "刷新档案办理队列" })); await waitFor(() => expect(hrApi.approvedProfileRequests).toHaveBeenCalledTimes(3)); expect(screen.queryByRole("button", { name: "办理档案变更" })).toBeNull(); expect(hrApi.fulfillProfileApproval).toHaveBeenCalledTimes(1);
});
it("provides scoped search and full paging rather than a first-page-only queue", async () => {
 vi.mocked(hrApi.approvedProfileRequests).mockImplementation(async (_token, page = 1, pageSize = 20) => ({ items: [source], total: 21, page, page_size: pageSize })); render(<ApprovedProfileRequestsPanel/>); await screen.findByRole("button", { name: "办理档案变更" }); fireEvent.click(screen.getByRole("button", { name: "档案申请下一页" })); await waitFor(() => expect(hrApi.approvedProfileRequests).toHaveBeenLastCalledWith("synthetic-token", 2, 20, "", expect.any(AbortSignal)));
 fireEvent.change(screen.getByLabelText("查找已批准档案申请"), { target: { value: "E001" } }); fireEvent.click(screen.getByRole("button", { name: "查询档案申请" })); await waitFor(() => expect(hrApi.approvedProfileRequests).toHaveBeenLastCalledWith("synthetic-token", 1, 20, "E001", expect.any(AbortSignal)));
});
it("blocks other approval writes while selected and clears context on account or park changes", async () => {
 let finish!: (value: HrApprovedProfileReceipt) => void; const onBlockedChange = vi.fn(); vi.mocked(hrApi.fulfillProfileApproval).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })); const view = render(<ApprovedProfileRequestsPanel onBlockedChange={onBlockedChange}/>); await edit(); await waitFor(() => expect(onBlockedChange).toHaveBeenLastCalledWith(true)); save(); await waitFor(() => expect(hrApi.fulfillProfileApproval).toHaveBeenCalledTimes(1)); const body = vi.mocked(hrApi.fulfillProfileApproval).mock.calls[0]![1]; const signal = vi.mocked(hrApi.approvedProfileRequests).mock.calls[0]![4]!;
 state.user = { ...state.user, park_id: "new-park" }; view.rerender(<ApprovedProfileRequestsPanel onBlockedChange={onBlockedChange}/>); expect(signal.aborted).toBe(true); await act(async () => finish(result(body))); expect(screen.queryByRole("region", { name: "档案办理回执" })).toBeNull(); expect(screen.queryByLabelText("联系地址")).toBeNull();
});
