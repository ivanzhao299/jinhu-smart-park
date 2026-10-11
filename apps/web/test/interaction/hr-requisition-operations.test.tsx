import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { RequisitionOperations, projectRequisition } from "../../app/hr/recruitment/RequisitionOperations";
import { hrApi, type HrRequisitionDetail } from "../../lib/hr-api";
vi.mock("../../lib/authz", () => ({ getAccessToken: () => "synthetic-token" }));
vi.mock("../../lib/hr-api", () => ({ hrApi: { recruitmentRequisition: vi.fn(), recruitmentRequisitionHistory: vi.fn(), recruitmentRequisitionReferences: vi.fn(), saveRecruitmentRequisition: vi.fn() } }));
const row = (extra: Partial<HrRequisitionDetail> = {}): HrRequisitionDetail => ({ id: "req-a", version: 4, requisitionCode: "R-1", title: "合成需求", orgId: "org-a", orgName: "合成部门", positionId: "position-a", positionName: "合成岗位", ownerUserId: "owner-a", ownerName: "合成负责人", headcount: 3, hiredCount: 1, plannedOnboardDate: "2026-11-01", approvalNote: "原说明", status: "open", ...extra });
const props = { requisitionId: "req-a", canManage: true, disabled: false, onBusyChange: vi.fn(), onSaved: vi.fn() };
beforeEach(() => { vi.resetAllMocks(); vi.mocked(hrApi.recruitmentRequisition).mockResolvedValue(row()); vi.mocked(hrApi.recruitmentRequisitionHistory).mockResolvedValue({ items: [], total: 0, page: 1, page_size: 10 }); });
async function edit() { fireEvent.click(await screen.findByRole("button", { name: "修改需求或办理状态" })); }
const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const save = () => fireEvent.submit(screen.getByRole("form", { name: "修改招聘需求" }));

it("reads actual detail, preserves existing links and sends only explicitly changed metadata", async () => {
  vi.mocked(hrApi.saveRecruitmentRequisition).mockResolvedValue(row({ version: 5, title: "更正标题", plannedOnboardDate: null }));
  render(<RequisitionOperations {...props} />); await edit(); change("需求标题", "更正标题"); change("计划到岗日", ""); change("变更理由", "更正登记"); save();
  await screen.findByText("招聘需求已保存，版本 5。"); expect(hrApi.saveRecruitmentRequisition).toHaveBeenCalledWith("req-a", { expectedVersion: 4, changeReason: "更正登记", title: "更正标题", plannedOnboardDate: null }, "synthetic-token", expect.any(String));
  expect(props.onSaved).toHaveBeenCalledWith(row({ version: 5, title: "更正标题", plannedOnboardDate: null })); expect(screen.queryByRole("form")).not.toBeInTheDocument();
});
it("retains an uncertain request and key, freezes edits and prevents parent navigation until retry resolves", async () => {
  vi.mocked(hrApi.saveRecruitmentRequisition).mockRejectedValueOnce(Error("synthetic timeout")).mockResolvedValueOnce(row({ version: 5, title: "新标题" }));
  render(<RequisitionOperations {...props} />); await edit(); change("需求标题", "新标题"); change("变更理由", "真实更正"); save(); await screen.findByRole("alert");
  expect(screen.getByLabelText("需求标题")).toBeDisabled(); expect(props.onBusyChange).toHaveBeenLastCalledWith(true); save(); await screen.findByText("招聘需求已保存，版本 5。");
  expect(vi.mocked(hrApi.saveRecruitmentRequisition).mock.calls[0]).toEqual(vi.mocked(hrApi.saveRecruitmentRequisition).mock.calls[1]); expect(props.onBusyChange).toHaveBeenLastCalledWith(false);
});
it("rebases only explicit changes after a definite CAS conflict and preserves another operator's owner/count", async () => {
  vi.mocked(hrApi.recruitmentRequisition).mockResolvedValueOnce(row()).mockResolvedValueOnce(row({ version: 6, ownerUserId: "owner-b", ownerName: "新负责人", headcount: 5 }));
  vi.mocked(hrApi.saveRecruitmentRequisition).mockRejectedValueOnce(Object.assign(Error("HR_REQUISITION_VERSION_CONFLICT"), { status: 409 })).mockResolvedValueOnce(row({ version: 7, ownerUserId: "owner-b", ownerName: "新负责人", headcount: 5, title: "本地标题" }));
  render(<RequisitionOperations {...props} />); await edit(); change("需求标题", "本地标题"); change("变更理由", "更正"); save(); await screen.findByText("服务器版本 6");
  fireEvent.click(screen.getByRole("button", { name: "确认以草稿更新" })); expect(screen.getByLabelText("计划招聘人数")).toHaveValue(5); save(); await screen.findByText("招聘需求已保存，版本 7。");
  expect(vi.mocked(hrApi.saveRecruitmentRequisition).mock.calls[1]![1]).toEqual({ expectedVersion: 6, changeReason: "更正", title: "本地标题" });
});
it("does not rebase an idempotency in-progress 409", async () => {
  vi.mocked(hrApi.saveRecruitmentRequisition).mockRejectedValue(Object.assign(Error("Request is still processing"), { status: 409 }));
  render(<RequisitionOperations {...props} />); await edit(); change("需求标题", "新标题"); change("变更理由", "更正"); save(); await screen.findByRole("alert");
  expect(screen.queryByRole("region", { name: "需求冲突比较" })).not.toBeInTheDocument(); expect(hrApi.recruitmentRequisition).toHaveBeenCalledTimes(1); expect(screen.getByRole("button", { name: "使用原请求重试保存" })).toBeEnabled();
});
it("read-only roles have detail and independent history without mutable controls or option probes", async () => {
  render(<RequisitionOperations {...props} canManage={false} />); await screen.findByText("版本 4 · 已录用 1 人"); expect(screen.queryByRole("button", { name: "修改需求或办理状态" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "读取需求历史" })); await waitFor(() => expect(hrApi.recruitmentRequisitionHistory).toHaveBeenCalled()); expect(hrApi.recruitmentRequisitionReferences).not.toHaveBeenCalled();
});
it("history pagination returns to page one without overwriting an unsaved draft", async () => {
  vi.mocked(hrApi.recruitmentRequisitionHistory).mockImplementation(async (_id, _token, page = 1) => ({ items: [{ id: `history-${page}`, version: page === 1 ? 4 : 3, changeReason: `合成记录${page}`, actorName: "合成办理人", createdAt: "2026-10-11T01:00:00Z", before: row({ version: page === 1 ? 3 : 2 }), after: row({ version: page === 1 ? 4 : 3 }) }], total: 11, page, page_size: 10 }));
  render(<RequisitionOperations {...props} />); await edit(); change("需求标题", "未保存草稿"); fireEvent.click(screen.getByRole("button", { name: "读取需求历史" })); await screen.findByText("版本 3 → 4");
  fireEvent.click(screen.getByRole("button", { name: "需求历史下一页" })); await screen.findByText("版本 2 → 3"); fireEvent.click(screen.getByRole("button", { name: "需求历史上一页" })); await screen.findByText("版本 3 → 4"); expect(screen.getByLabelText("需求标题")).toHaveValue("未保存草稿");
});
it("a malformed detail never becomes an editable empty record", async () => {
  vi.mocked(hrApi.recruitmentRequisition).mockResolvedValueOnce({ ...row(), version: undefined } as never); render(<RequisitionOperations {...props} />); await screen.findByRole("alert"); expect(screen.queryByRole("form")).not.toBeInTheDocument();
  expect(() => projectRequisition(row({ plannedOnboardDate: "2026-02-30" }), "req-a")).toThrow(); expect(() => projectRequisition(row({ plannedOnboardDate: "0000-01-01" }), "req-a")).toThrow(); expect(() => projectRequisition(row({ hiredCount: 4 }), "req-a")).toThrow();
});
it("same-frame repeated submit cannot dispatch duplicate writes", async () => {
  let resolve!: (value: HrRequisitionDetail) => void; vi.mocked(hrApi.saveRecruitmentRequisition).mockReturnValue(new Promise(done => { resolve = done; }));
  render(<RequisitionOperations {...props} />); await edit(); change("需求标题", "新标题"); change("变更理由", "更正"); save(); save(); expect(hrApi.saveRecruitmentRequisition).toHaveBeenCalledTimes(1);
  await act(async () => resolve(row({ version: 5, title: "新标题" }))); await screen.findByText("招聘需求已保存，版本 5。");
});
it("reaches a later owner option and keeps the selected owner across a reopened picker", async () => {
  vi.mocked(hrApi.recruitmentRequisitionReferences).mockImplementation(async (_id, _kind, _token, page = 1) => ({ items: [{ id: page === 1 ? "owner-1" : "owner-21", label: page === 1 ? "合成负责人1" : "合成负责人21" }], total: 21, page, page_size: 20 }));
  vi.mocked(hrApi.saveRecruitmentRequisition).mockResolvedValue(row({ version: 5, ownerUserId: "owner-21", ownerName: "合成负责人21" }));
  render(<RequisitionOperations {...props} />); await edit(); fireEvent.click(screen.getByRole("button", { name: "更换负责人" })); await screen.findByRole("button", { name: "合成负责人1" }); fireEvent.click(screen.getByRole("button", { name: "负责人下一页" })); fireEvent.click(await screen.findByRole("button", { name: "合成负责人21" }));
  fireEvent.click(screen.getByRole("button", { name: "更换负责人" })); await screen.findByRole("button", { name: "合成负责人1" }); expect(screen.getByText("负责人：合成负责人21")).toBeInTheDocument(); change("变更理由", "变更招聘负责人"); save(); await screen.findByText("招聘需求已保存，版本 5。");
  expect(vi.mocked(hrApi.saveRecruitmentRequisition).mock.calls[0]![1]).toEqual({ expectedVersion: 4, changeReason: "变更招聘负责人", ownerUserId: "owner-21" });
});
it("clears the prior position when the department changes so the update cannot pair it with the new department", async () => {
  vi.mocked(hrApi.recruitmentRequisition).mockResolvedValue(row({ hiredCount: 0 })); vi.mocked(hrApi.recruitmentRequisitionReferences).mockResolvedValue({ items: [{ id: "org-b", label: "新部门" }], total: 1, page: 1, page_size: 20 });
  vi.mocked(hrApi.saveRecruitmentRequisition).mockResolvedValue(row({ version: 5, hiredCount: 0, orgId: "org-b", orgName: "新部门", positionId: null, positionName: null }));
  render(<RequisitionOperations {...props} />); await edit(); fireEvent.click(screen.getByRole("button", { name: "更换部门" })); fireEvent.click(await screen.findByRole("button", { name: "新部门" })); change("变更理由", "调整部门"); save();
  await screen.findByText("招聘需求已保存，版本 5。"); expect(vi.mocked(hrApi.saveRecruitmentRequisition).mock.calls[0]![1]).toEqual({ expectedVersion: 4, changeReason: "调整部门", orgId: "org-b", positionId: null });
});
it("rejects a position projection outside the draft department", async () => {
  vi.mocked(hrApi.recruitmentRequisition).mockResolvedValue(row({ hiredCount: 0 })); vi.mocked(hrApi.recruitmentRequisitionReferences).mockResolvedValue({ items: [{ id: "position-b", label: "跨部门岗位", orgId: "org-other" }], total: 1, page: 1, page_size: 20 });
  render(<RequisitionOperations {...props} />); await edit(); fireEvent.click(screen.getByRole("button", { name: "更换标准岗位" })); await screen.findByRole("alert");
  expect(screen.queryByRole("button", { name: "跨部门岗位" })).not.toBeInTheDocument();
});
it("a definite unique-code conflict retains an editable draft instead of freezing an impossible retry", async () => {
  vi.mocked(hrApi.saveRecruitmentRequisition).mockRejectedValue(Object.assign(Error("HR_REQUISITION_CODE_CONFLICT"), { status: 409 }));
  render(<RequisitionOperations {...props} />); await edit(); change("需求编号", "DUPLICATE"); change("变更理由", "更正编号"); save(); await screen.findByText("需求编号已被使用，请更换编号后保存。"); expect(screen.getByLabelText("需求编号")).toBeEnabled(); expect(props.onBusyChange).toHaveBeenLastCalledWith(false);
});
it.each(["HR_REQUISITION_STATE_CONFLICT", "HR_REQUISITION_HEADCOUNT_CONFLICT", "HR_REQUISITION_HIRED_REFERENCE_CONFLICT"])("a definite business conflict %s releases the draft for correction", async message => {
  vi.mocked(hrApi.saveRecruitmentRequisition).mockRejectedValue(Object.assign(Error(message), { status: 409 }));
  render(<RequisitionOperations {...props} />); await edit(); change("需求标题", "更正标题"); change("变更理由", "业务更正"); save();
  await screen.findByText("当前状态、已录用人数或部门岗位关系不允许此项变更，请调整草稿后保存。"); expect(screen.getByLabelText("需求标题")).toBeEnabled(); expect(props.onBusyChange).toHaveBeenLastCalledWith(false);
});
