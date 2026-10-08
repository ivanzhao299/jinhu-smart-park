import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { StrictMode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { HR_PERMISSIONS } from "@jinhu/shared";
import { HrPerformanceClient } from "../../app/hr/performance/HrPerformanceClient";
import { PerformanceTemplateEditor } from "../../app/hr/performance/PerformanceTemplateEditor";
import { PerformanceTemplates } from "../../app/hr/performance/PerformanceTemplates";
import type { HrPerformanceTemplateDetailV2 } from "../../lib/hr-api";
const state = vi.hoisted(() => ({ user: { id: "actor", tenant_id: "tenant", park_id: "park", permissions: [] as string[] }, api: { performanceTemplatesV2: vi.fn(), performanceTemplateDetailV2: vi.fn(), createPerformanceTemplateV2: vi.fn(), createPerformanceTemplateVersionV2: vi.fn(), publishPerformanceTemplateV2: vi.fn(), performanceCyclesV2: vi.fn(), performanceReviewsV2: vi.fn() } }));
vi.mock("../../lib/auth-context", () => ({ useAuthUser: () => state.user }));
vi.mock("../../lib/authz", () => ({ getAccessToken: () => "synthetic-token" }));
vi.mock("../../lib/hr-api", () => ({ hrApi: state.api }));
vi.mock("../../components/auth/PermissionGuard", () => ({ PermissionGuard: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("../../app/hr/performance/HrPerformanceLegacyPanel", () => ({ HrPerformanceLegacyPanel: () => null }));
vi.mock("../../app/hr/performance/HrPerformanceLegacyRelationsPanel", () => ({ HrPerformanceLegacyRelationsPanel: () => null }));
vi.mock("../../app/hr/performance/HrPerformanceLegacyAssessmentMasterPanel", () => ({ HrPerformanceLegacyAssessmentMasterPanel: () => null }));
vi.mock("../../app/hr/performance/HrPerformanceLegacyAssessmentValuePanel", () => ({ HrPerformanceLegacyAssessmentValuePanel: () => null }));
vi.mock("../../app/hr/performance/HrPerformanceLegacyAssessmentValueOfPersonPanel", () => ({ HrPerformanceLegacyAssessmentValueOfPersonPanel: () => null }));
vi.mock("../../app/hr/performance/HrPerformanceLegacyPersonSummaryPanel", () => ({ HrPerformanceLegacyPersonSummaryPanel: () => null }));
vi.mock("../../app/hr/performance/HrPerformanceLegacyWebAssQueryPanel", () => ({ HrPerformanceLegacyWebAssQueryPanel: () => null }));
const detail: HrPerformanceTemplateDetailV2 = { templateId: "template-1", templateCode: "SYN-PERF", templateName: "Synthetic template", versionId: "version-1", versionNo: 1, versionName: "V1", status: "published", dimensions: [{ code: "work", name: "Work", weight: "1", scoreMin: "0", scoreMax: "100", scoringGuide: { note: "Preserved guide" } }], levels: [{ code: "all", name: "All", scoreMin: "0", scoreMax: "100" }] };
beforeEach(() => {
  vi.resetAllMocks(); state.user = { id: "actor", tenant_id: "tenant", park_id: "park", permissions: [HR_PERMISSIONS.HR_PERFORMANCE_PAGE, HR_PERMISSIONS.HR_PERFORMANCE_TEMPLATE_MANAGE] };
  state.api.performanceTemplatesV2.mockResolvedValue([{ id: detail.templateId, templateCode: detail.templateCode, templateName: detail.templateName, versionId: detail.versionId, versionName: detail.versionName, currentVersionNo: 1, versionStatus: "published", dimensions: detail.dimensions, levels: detail.levels }]);
  state.api.performanceTemplateDetailV2.mockResolvedValue(detail); state.api.createPerformanceTemplateV2.mockResolvedValue({ id: "created" }); state.api.createPerformanceTemplateVersionV2.mockResolvedValue({ versionId: "version-2" });
});
const change = (label: string, value: string, scope: Pick<typeof screen,"getByLabelText"> = screen) => fireEvent.change(scope.getByLabelText(label), { target: { value } });
function fill() {
  change("模板编号", "SYN-NEW"); change("模板名称", "Configured template"); change("版本名称", "Initial version");
  change("维度编号", "work"); change("维度名称", "Work"); change("等级编号", "all"); change("等级名称", "All");
  return screen.getByRole("button", { name: "保存模板草稿" }).closest("form")!;
}
it("template-only operator uses actual full page without cycle/review APIs and submits configurable ordered rows", async () => {
  render(<HrPerformanceClient />); await screen.findByText("Synthetic template");
  fireEvent.click(screen.getByRole("button", { name: "创建评价模板" })); const form = fill();
  change("权重（%）", "60"); fireEvent.click(screen.getByRole("button", { name: "添加维度" }));
  const second = within(screen.getByRole("group", { name: "维度2" })); change("维度编号", "quality", second); change("维度名称", "Quality", second); change("权重（%）", "40", second);
  fireEvent.click(second.getByRole("button", { name: "维度上移" })); fireEvent.submit(form);
  await waitFor(() => expect(state.api.createPerformanceTemplateV2).toHaveBeenCalledWith(expect.objectContaining({ dimensions: [expect.objectContaining({ code: "quality", weight: .4 }), expect.objectContaining({ code: "work", weight: .6 })] }), "synthetic-token"));
  expect(state.api.performanceCyclesV2).not.toHaveBeenCalled(); expect(state.api.performanceReviewsV2).not.toHaveBeenCalled();
});
it("failed creation preserves fields and all configured rows", async () => {
  state.api.createPerformanceTemplateV2.mockRejectedValueOnce(new Error("save rejected"));
  render(<PerformanceTemplateEditor onSaved={vi.fn()} onCancel={vi.fn()} />); const form = fill(); fireEvent.submit(form);
  await screen.findByText("save rejected"); expect(screen.getByLabelText("模板名称")).toHaveValue("Configured template"); expect(screen.getByLabelText("维度名称")).toHaveValue("Work"); expect(screen.getByLabelText("权重（%）")).toHaveValue(100);
  fireEvent.submit(form); await screen.findByText("模板草稿已保存；发布后才可用于新绩效周期。"); expect(state.api.createPerformanceTemplateV2).toHaveBeenCalledTimes(2);
});
it("continued version preserves original identity, expected version and scoring guide", async () => {
  render(<PerformanceTemplates />); fireEvent.click(await screen.findByRole("button", { name: "续建模板版本" }));
  await screen.findByRole("button", { name: "保存模板草稿" }); change("版本名称", "V2"); change("维度名称", "Updated work");
  fireEvent.submit(screen.getByRole("button", { name: "保存模板草稿" }).closest("form")!);
  await waitFor(() => expect(state.api.createPerformanceTemplateVersionV2).toHaveBeenCalledWith(detail.templateId, expect.objectContaining({ expectedVersionId: detail.versionId, templateCode: detail.templateCode, templateName: detail.templateName, dimensions: [expect.objectContaining({ name: "Updated work", scoringGuide: detail.dimensions[0]!.scoringGuide })] }), "synthetic-token"));
  expect(state.api.createPerformanceTemplateV2).not.toHaveBeenCalled();
});
it("rejects incomplete weight and grade coverage before write", async () => {
  render(<PerformanceTemplateEditor onSaved={vi.fn()} onCancel={vi.fn()} />); const form = fill(); change("权重（%）", "99"); fireEvent.submit(form);
  await screen.findByText("维度编号不能重复，权重合计必须为100%。"); change("权重（%）", "100"); change("等级最低分", "1"); fireEvent.submit(form);
  await screen.findByText("等级区间必须按0.01分连续覆盖0至100分，不能重叠或留空。"); expect(state.api.createPerformanceTemplateV2).not.toHaveBeenCalled();
});
it("read-only template role sees complete configuration with no write controls", async () => {
  state.user.permissions = [HR_PERMISSIONS.HR_PERFORMANCE_PAGE, HR_PERMISSIONS.HR_PERFORMANCE_TEMPLATE_READ]; render(<HrPerformanceClient />);
  fireEvent.click(await screen.findByRole("button", { name: "查看模板配置" })); await screen.findByText(/权重100%/);
  expect(screen.queryByRole("button", { name: "创建评价模板" })).toBeNull(); expect(screen.queryByRole("button", { name: "保存模板草稿" })).toBeNull();
  expect(state.api.performanceCyclesV2).not.toHaveBeenCalled(); expect(state.api.performanceReviewsV2).not.toHaveBeenCalled();
});
it("context replacement clears draft and ignores late detail from previous scope", async () => {
  let finish!: (value: HrPerformanceTemplateDetailV2) => void; state.api.performanceTemplateDetailV2.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const view = render(<HrPerformanceClient />); fireEvent.click(await screen.findByRole("button", { name: "续建模板版本" })); const signal = state.api.performanceTemplateDetailV2.mock.calls[0]![2] as AbortSignal;
  state.user = { ...state.user, park_id: "other" }; view.rerender(<HrPerformanceClient />); expect(signal.aborted).toBe(true); await act(async () => finish(detail));
  expect(screen.queryByRole("button", { name: "保存模板草稿" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "创建评价模板" })); expect(screen.getByLabelText("模板名称")).toHaveValue("");
});
it.each([{ templateId: "wrong" }, { dimensions: [{ ...detail.dimensions[0], name: {} }] }, { versionNo: 0 }])("rejects malformed editing detail %j", async invalid => {
  state.api.performanceTemplateDetailV2.mockResolvedValue({ ...detail, ...invalid }); render(<PerformanceTemplates />); fireEvent.click(await screen.findByRole("button", { name: "续建模板版本" }));
  await screen.findByText("评价模板响应无效，请重新加载。"); expect(screen.queryByRole("button", { name: "保存模板草稿" })).toBeNull();
});
it("StrictMode committed save with refresh failure keeps success and disables repeat write", async () => {
  render(<StrictMode><PerformanceTemplateEditor onSaved={async () => { throw new Error("refresh unavailable"); }} onCancel={vi.fn()} /></StrictMode>); const form = fill(); fireEvent.submit(form);
  await screen.findByText("草稿已保存，刷新失败；请重新加载后查看，勿重复保存。"); expect(screen.getByText("模板草稿已保存；发布后才可用于新绩效周期。")).toBeVisible();
  expect(screen.getByRole("button", { name: "保存模板草稿" })).toBeDisabled(); fireEvent.submit(form); expect(state.api.createPerformanceTemplateV2).toHaveBeenCalledTimes(1);
});
it("synchronous double submit has one writer", async () => {
  let finish!: (value: object) => void; state.api.createPerformanceTemplateV2.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  render(<PerformanceTemplateEditor onSaved={vi.fn()} onCancel={vi.fn()} />); const form = fill(); fireEvent.submit(form); fireEvent.submit(form); expect(state.api.createPerformanceTemplateV2).toHaveBeenCalledTimes(1);
  await act(async () => finish({ id: "created" }));
});


it("successful version refresh replaces the editor without locking the workspace", async () => {
  const next = { ...detail, versionId: "version-2", versionNo: 2, status: "draft" as const };
  state.api.performanceTemplateDetailV2.mockResolvedValueOnce(detail).mockResolvedValue(next);
  render(<PerformanceTemplates />); fireEvent.click(await screen.findByRole("button", { name: "续建模板版本" }));
  await screen.findByRole("button", { name: "保存模板草稿" }); change("版本名称", "V2");
  fireEvent.submit(screen.getByRole("button", { name: "保存模板草稿" }).closest("form")!);
  await screen.findByText("基于V2创建新草稿，原版本和已有周期配置保持可追溯。");
  await waitFor(() => expect(screen.getByRole("button", { name: "刷新模板" })).toBeEnabled());
  expect(screen.getByRole("button", { name: "关闭模板编辑" })).toBeEnabled();
});


it("dimension and grade bounds retain the last row and stop at30/20", () => {
  render(<PerformanceTemplateEditor onSaved={vi.fn()} onCancel={vi.fn()} />);
  expect(screen.getByRole("button", { name: "删除维度" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "删除等级" })).toBeDisabled();
  const addDimension=screen.getByRole("button", {name:"添加维度"});
  for(let count=1;count<30;count++)fireEvent.click(addDimension);
  expect(screen.getByRole("button", {name:"添加维度"})).toBeDisabled();
  expect(screen.getAllByLabelText("维度编号")).toHaveLength(30);
  const addLevel=screen.getByRole("button", {name:"添加等级"});
  for(let count=1;count<20;count++)fireEvent.click(addLevel);
  expect(screen.getByRole("button", {name:"添加等级"})).toBeDisabled();
  expect(screen.getAllByLabelText("等级编号")).toHaveLength(20);
});
