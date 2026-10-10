import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { ApprovalRecordDetails } from "../../app/hr/approvals/ApprovalRecordDetails";
import { hrApi, type HrApproval, type HrApprovalHistory } from "../../lib/hr-api";

vi.mock("../../lib/authz", () => ({ getAccessToken: () => "synthetic-token" }));
vi.mock("../../lib/hr-api", () => ({ hrApi: { approvalHistory: vi.fn() } }));
const item: HrApproval = { id: "request", requestNo: "SYN-001", requestType: "profile_change", applicantEmployeeId: "self", subjectEmployeeId: "self", title: "原申请", payload: { description: "原说明" }, status: "returned", version: 3, submittedAt: null, completedAt: null };
const history: HrApprovalHistory = { request: item, actions: [{ id: "return", action: "return", comment: "请补充联系方式", beforeStatus: "submitted", afterStatus: "returned", createTime: "2026-10-10T00:00:00Z", actorDisplayName: "合成审核人", beforeContent: null, afterContent: null }] };
beforeEach(() => { vi.resetAllMocks(); vi.mocked(hrApi.approvalHistory).mockResolvedValue(history); });

it("loads history only on opening and binds edit to the authoritative version", async () => {
  const revise = vi.fn(), editing = vi.fn();
  render(<ApprovalRecordDetails item={item} canEdit blocked={false} onRevise={revise} onEditingChange={editing} />);
  expect(hrApi.approvalHistory).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "查看办理记录" }));
  await screen.findByText("最近退回意见：请补充联系方式");
  fireEvent.click(screen.getByRole("button", { name: "修改申请内容" }));
  expect(screen.getByLabelText("申请标题")).toHaveValue("原申请");
  fireEvent.change(screen.getByLabelText("申请说明"), { target: { value: " 补充后的说明 " } });
  fireEvent.change(screen.getByLabelText("修改原因"), { target: { value: " 补充退回材料 " } });
  fireEvent.click(screen.getByRole("button", { name: "保存修改" }));
  expect(revise).toHaveBeenCalledWith({ expectedVersion: 3, title: "原申请", description: "补充后的说明", reason: "补充退回材料" });
  expect(editing).toHaveBeenCalledWith(true);
  expect(screen.getByLabelText("申请说明")).toHaveValue(" 补充后的说明 ");
});

it("keeps reviewer history read-only and retains loaded history after refresh failure", async () => {
  render(<ApprovalRecordDetails item={item} canEdit={false} blocked={false} onRevise={vi.fn()} onEditingChange={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "查看办理记录" }));
  await screen.findByText("最近退回意见：请补充联系方式");
  expect(screen.queryByRole("button", { name: "修改申请内容" })).toBeNull();
  vi.mocked(hrApi.approvalHistory).mockRejectedValueOnce(new Error("合成读取中断"));
  fireEvent.click(screen.getByRole("button", { name: "刷新记录" }));
  await screen.findByText("合成读取中断");
  expect(screen.getByText("最近退回意见：请补充联系方式")).toBeVisible();
});

it("blocks edits for terminal projections and drops late reads after close", async () => {
  vi.mocked(hrApi.approvalHistory).mockResolvedValueOnce({ ...history, request: { ...item, status: "approved" } });
  render(<ApprovalRecordDetails item={item} canEdit blocked={false} onRevise={vi.fn()} onEditingChange={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "查看办理记录" }));
  await screen.findByText("最近退回意见：请补充联系方式");
  expect(screen.queryByRole("button", { name: "修改申请内容" })).toBeNull();
  let resolve!: (result: HrApprovalHistory) => void;
  vi.mocked(hrApi.approvalHistory).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  fireEvent.click(screen.getByRole("button", { name: "刷新记录" }));
  fireEvent.click(screen.getByRole("button", { name: "收起办理记录" }));
  await act(async () => { resolve(history); });
  expect(screen.queryByText("最近退回意见：请补充联系方式")).toBeNull();
});

it("requires a current server version before exposing revision controls", async () => {
  vi.mocked(hrApi.approvalHistory).mockResolvedValueOnce({ ...history, request: { ...item, version: undefined } });
  render(<ApprovalRecordDetails item={item} canEdit blocked={false} onRevise={vi.fn()} onEditingChange={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "查看办理记录" }));
  await screen.findByText("最近退回意见：请补充联系方式");
  expect(screen.queryByRole("button", { name: "修改申请内容" })).toBeNull();
});
