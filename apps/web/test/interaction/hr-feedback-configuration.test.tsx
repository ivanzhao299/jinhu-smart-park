import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { StrictMode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { HR_PERMISSIONS } from "@jinhu/shared";
import { FeedbackConfiguration } from "../../app/hr/feedback-360/FeedbackConfiguration";
import { FeedbackConfigurationEditor } from "../../app/hr/feedback-360/FeedbackConfigurationEditor";
import { HrFeedbackClient } from "../../app/hr/feedback-360/HrFeedbackClient";
import type { HrFeedback360Configuration } from "../../lib/hr-api";
const state = vi.hoisted(() => ({ user: { id: "actor", tenant_id: "tenant", park_id: "park", permissions: [] as string[] }, api: { feedback360Configuration: vi.fn(), createFeedback360Model: vi.fn(), createFeedback360ModelVersion: vi.fn(), createFeedback360Questionnaire: vi.fn(), createFeedback360QuestionnaireVersion: vi.fn(), publishFeedback360Model: vi.fn(), publishFeedback360Questionnaire: vi.fn(), feedback360Options: vi.fn(), feedback360Cycles: vi.fn(), feedback360Results: vi.fn(), myFeedback360Assignments: vi.fn(), feedback360PendingNominations: vi.fn() } }));
vi.mock("../../lib/auth-context", () => ({ useAuthUser: () => state.user }));
vi.mock("../../lib/authz", () => ({ getAccessToken: () => "synthetic-token" }));
vi.mock("../../lib/hr-api", () => ({ hrApi: state.api }));
vi.mock("../../components/auth/PermissionGuard", () => ({ PermissionGuard: ({ children }: { children: React.ReactNode }) => children }));
const configuration: HrFeedback360Configuration = { models: [{ id: "model", modelCode: "SYN-MODEL", modelName: "Actual model", currentVersionNo: 1, status: "published", versionId: "model-version", versionNo: 1, versionName: "Initial model", versionStatus: "published", scaleMin: "1.25", scaleMax: "7.50", dimensions: [{ code: "QUALITY", name: "Actual quality", description: "Preserve description", weight: "1.0000", anchors: [{ level: "1.25", text: "Basic behavior" }, { level: "7.50", text: "Target behavior" }] }] }], questionnaires: [{ id: "questionnaire", questionnaireCode: "SYN-QUEST", questionnaireName: "Actual questionnaire", status: "published", currentVersionNo: 1, versionId: "questionnaire-version", versionNo: 1, versionName: "Initial questionnaire", versionStatus: "published", modelVersionId: "model-version", modelName: "Actual model", modelVersionName: "Initial model", questions: [{ code: "NOTE", dimensionCode: "QUALITY", text: "Actual question", type: "text", required: false }] }] };
beforeEach(() => {
  vi.resetAllMocks(); state.user = { id: "actor", tenant_id: "tenant", park_id: "park", permissions: [HR_PERMISSIONS.HR_FEEDBACK_360_PAGE, HR_PERMISSIONS.HR_FEEDBACK_MODEL_MANAGE] };
  state.api.feedback360Configuration.mockResolvedValue(configuration);
  state.api.createFeedback360Model.mockResolvedValue({ id: "created" }); state.api.createFeedback360ModelVersion.mockResolvedValue({ versionId: "next" });
  state.api.createFeedback360Questionnaire.mockResolvedValue({ id: "created" }); state.api.createFeedback360QuestionnaireVersion.mockResolvedValue({ versionId: "next" });
});
const change = (label: string, value: string, scope: Pick<typeof screen, "getByLabelText"> = screen) => fireEvent.change(scope.getByLabelText(label), { target: { value } });
const properties = () => ({ models: configuration.models, writeLock: { current: false }, onBusyChange: vi.fn(), onSaved: vi.fn(), onCancel: vi.fn() });
function fillModel() {
  change("配置编号", "SYN-NEW"); change("配置名称", "Actual configured model"); change("新版本名称", "First version"); change("量表最低分", "1.25"); change("量表最高分", "7.5");
  change("维度编号", "ACTUAL"); change("维度名称", "Actual dimension"); change("维度权重（%）", "100"); change("锚点1分值", "1.25"); change("锚点1行为说明", "Actual basic behavior"); change("锚点2分值", "7.5"); change("锚点2行为说明", "Actual target behavior");
  return screen.getByRole("button", { name: "保存配置草稿" }).closest("form")!;
}
it("model-only manager uses the full page without employee/cycle options and creates a draft without publishing", async () => {
  render(<HrFeedbackClient />); await screen.findByText("Actual model · Initial model"); fireEvent.click(screen.getByRole("button", { name: "创建模型" }));
  const form = fillModel(); fireEvent.submit(form);
  await waitFor(() => expect(state.api.createFeedback360Model).toHaveBeenCalledWith(expect.objectContaining({ scaleMin: 1.25, scaleMax: 7.5, dimensions: [expect.objectContaining({ code: "ACTUAL", weight: 1 })] }), "synthetic-token"));
  expect(state.api.feedback360Options).not.toHaveBeenCalled(); expect(state.api.feedback360Cycles).not.toHaveBeenCalled(); expect(state.api.publishFeedback360Model).not.toHaveBeenCalled();
});
it("failed save retains full edited model and allows retry", async () => {
  state.api.createFeedback360Model.mockRejectedValueOnce(new Error("synthetic save failure")); render(<FeedbackConfigurationEditor kind="model" {...properties()} />); const form = fillModel(); fireEvent.submit(form);
  await screen.findByRole("alert"); expect(screen.getByLabelText("锚点2行为说明")).toHaveValue("Actual target behavior"); expect(screen.getByLabelText("配置名称")).toHaveValue("Actual configured model"); fireEvent.submit(form);
  await waitFor(() => expect(state.api.createFeedback360Model).toHaveBeenCalledTimes(2));
});
it("continued model preserves guide and immutable identity with optimistic version", async () => {
  render(<FeedbackConfigurationEditor kind="model" model={configuration.models[0]} {...properties()} />); change("新版本名称", "Next model"); fireEvent.submit(screen.getByRole("button", { name: "保存配置草稿" }).closest("form")!);
  await waitFor(() => expect(state.api.createFeedback360ModelVersion).toHaveBeenCalledWith("model", expect.objectContaining({ expectedVersionId: "model-version", modelCode: "SYN-MODEL", dimensions: [expect.objectContaining({ description: "Preserve description", weight: 1 })] }), "synthetic-token"));
});
it("questionnaire binds actual model dimensions, preserves optional text and orders added questions", async () => {
  render(<FeedbackConfigurationEditor kind="questionnaire" questionnaire={configuration.questionnaires[0]} {...properties()} />); change("新版本名称", "Next questionnaire"); fireEvent.click(screen.getByRole("button", { name: "添加题目" }));
  const second = within(screen.getByRole("group", { name: "题目2" })); change("题目编号", "SCORE", second); change("所属维度", "QUALITY", second); change("题目内容", "Actual scoring question", second); fireEvent.click(second.getByRole("button", { name: "题目上移" }));
  fireEvent.submit(screen.getByRole("button", { name: "保存配置草稿" }).closest("form")!);
  await waitFor(() => expect(state.api.createFeedback360QuestionnaireVersion).toHaveBeenCalledWith("questionnaire", expect.objectContaining({ expectedVersionId: "questionnaire-version", modelVersionId: "model-version", questions: [expect.objectContaining({ code: "SCORE", dimensionCode: "QUALITY", type: "rating", required: true }), expect.objectContaining({ code: "NOTE", type: "text", required: false })] }), "synthetic-token"));
});
it("invalid weights and duplicate anchor levels cannot submit", async () => {
  render(<FeedbackConfigurationEditor kind="model" {...properties()} />); const form = fillModel(); change("维度权重（%）", "99"); fireEvent.submit(form); await screen.findByText(/权重合计必须为100%/);
  change("维度权重（%）", "100"); change("锚点2分值", "1.25"); fireEvent.submit(form); await screen.findByText(/分值须唯一/); expect(state.api.createFeedback360Model).not.toHaveBeenCalled();
});
it("read role sees complete configuration without mutation controls", async () => {
  state.user.permissions = [HR_PERMISSIONS.HR_FEEDBACK_READ]; render(<FeedbackConfiguration />); await screen.findByText("Actual model · Initial model");
  expect(screen.getByText("Preserve description")).toBeInTheDocument(); expect(screen.getByText(/（NOTE）.*QUALITY.*文字题.*选填/)).toBeInTheDocument(); expect(screen.queryByRole("button", { name: "创建模型" })).toBeNull(); expect(screen.queryByRole("button", { name: "继续模型版本" })).toBeNull();
});
it("context change aborts old configuration and clears drafts", async () => {
  let finish!: (v: HrFeedback360Configuration) => void; state.api.feedback360Configuration.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const view = render(<FeedbackConfiguration />); const signal = state.api.feedback360Configuration.mock.calls[0]![1] as AbortSignal; fireEvent.click(screen.getByRole("button", { name: "创建模型" })); change("配置名称", "Old park draft");
  state.user = { ...state.user, park_id: "other" }; view.rerender(<FeedbackConfiguration />); expect(signal.aborted).toBe(true); await act(async () => finish(configuration)); expect(screen.queryByLabelText("配置名称")).toBeNull();
});
it("synchronous duplicate submission owns one writer and refresh failure keeps committed success", async () => {
  let finish!: (v: object) => void; state.api.createFeedback360Model.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  render(<StrictMode><FeedbackConfigurationEditor kind="model" {...properties()} onSaved={async () => { throw new Error("refresh failure"); }} /></StrictMode>); const form = fillModel(); fireEvent.submit(form); fireEvent.submit(form); expect(state.api.createFeedback360Model).toHaveBeenCalledTimes(1); await act(async () => finish({ id: "created" }));
  await screen.findByText("草稿已保存，刷新失败；请重新加载后查看，勿重复保存。"); expect(screen.getByRole("button", { name: "保存配置草稿" })).toBeDisabled(); fireEvent.submit(form); expect(state.api.createFeedback360Model).toHaveBeenCalledTimes(1);
});
it.each([{ models: [{ ...configuration.models[0], modelName: {} }] }, { questionnaires: [{ ...configuration.questionnaires[0], questions: [{ ...configuration.questionnaires[0]!.questions[0], required: "false" }] }] }])("rejects malformed configuration before JSX %j", async invalid => {
  state.api.feedback360Configuration.mockResolvedValue({ ...configuration, ...invalid }); render(<FeedbackConfiguration />); await screen.findByText("360配置响应不完整，请重新加载。"); expect(screen.queryByText("Actual model · Initial model")).toBeNull();
});
it("publication refreshes cycle options and survives list refresh failure", async () => {
  state.api.feedback360Configuration.mockResolvedValue({ models: [{ ...configuration.models[0], status: "draft", versionStatus: "draft" }], questionnaires: [] }); const refresh = vi.fn(); render(<FeedbackConfiguration onPublished={refresh} />); fireEvent.click(await screen.findByRole("button", { name: "发布模型" }));
  await screen.findByText("模型已发布，可为该版本配置问卷。"); await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  state.api.feedback360Configuration.mockRejectedValueOnce(new Error("refresh failure")); fireEvent.click(screen.getByRole("button", { name: "发布模型" })); await screen.findByText("发布已成功，配置刷新失败；请重新加载后查看。");
});
it("saved editor unmount releases the parent's shared mutation gate", async () => {
  render(<FeedbackConfiguration />); fireEvent.click(await screen.findByRole("button", { name: "继续模型版本" })); change("新版本名称", "Next version"); fireEvent.submit(screen.getByRole("button", { name: "保存配置草稿" }).closest("form")!);
  await waitFor(() => expect(screen.queryByRole("button", { name: "保存配置草稿" })).toBeNull()); expect(screen.getByRole("button", { name: "刷新配置" })).toBeEnabled(); expect(screen.getByRole("button", { name: "创建模型" })).toBeEnabled();
});
it("row limits keep actual maximum configurations intact", () => {
  const model = configuration.models[0]!;
  const dimensions = Array.from({ length: 30 }, (_, i) => ({ ...model.dimensions[0]!, code: `D${i.toString().padStart(2, "0")}`, weight: i === 29 ? "0.7100" : "0.0100", anchors: Array.from({ length: 20 }, (_, j) => ({ level: (1.25 + j * .25).toFixed(2), text: `Anchor ${j}` })) }));
  const view = render(<FeedbackConfigurationEditor kind="model" model={{ ...model, dimensions }} {...properties()} />); expect(screen.getByText("添加维度", { selector: "button" })).toBeDisabled(); expect(screen.getAllByText("添加锚点", { selector: "button" }).every(button => (button as HTMLButtonElement).disabled)).toBe(true); view.unmount();
  const questionnaire = configuration.questionnaires[0]!; render(<FeedbackConfigurationEditor kind="questionnaire" questionnaire={{ ...questionnaire, questions: Array.from({ length: 100 }, (_, i) => ({ ...questionnaire.questions[0]!, code: `Q${i.toString().padStart(2, "0")}` })) }} {...properties()} />); expect(screen.getByText("添加题目", { selector: "button" })).toBeDisabled();
});
