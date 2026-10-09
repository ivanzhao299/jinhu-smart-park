import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { HrRewardsClient } from "../../app/hr/rewards/HrRewardsClient";
import { hrApi } from "../../lib/hr-api";

const state = vi.hoisted(() => ({ user: { id: "actor", tenant_id: "tenant-a", park_id: "park-a", permissions: ["hr:rewards", "hr:reward:manage", "hr:reward:read"] } }));
vi.mock("../../lib/auth-context", () => ({ useAuthUser: () => state.user }));
vi.mock("../../lib/authz", () => ({ getAccessToken: () => "synthetic-token" }));
vi.mock("../../components/auth/PermissionGuard", () => ({ PermissionGuard: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("../../components/files/FileUploader", () => ({ FileUploader: () => null }));
vi.mock("../../components/files/AttachmentList", () => ({ AttachmentList: () => null }));
vi.mock("../../lib/hr-api", () => ({ hrApi: { rewardCases: vi.fn(), rewardCategories: vi.fn(), rewardCaseOptions: vi.fn(), rewardEmployeeOptions: vi.fn(), employees: vi.fn(), rewardCase: vi.fn(), createRewardCase: vi.fn(), updateRewardCase: vi.fn(), createRewardCategory: vi.fn(), rewardCategoryVersions:vi.fn(), publishRewardCategoryVersion:vi.fn(), rewardCaseAction: vi.fn(), appendRewardCorrection: vi.fn(), appendRewardAppeal: vi.fn(), rewardPayrollLinkOptions:vi.fn(), linkRewardPayrollInput:vi.fn() } }));

const employee = (n: number) => ({ id: `employee-${n}`, employeeCode: `SYN-${n}`, fullName: `Synthetic ${n}` });
const category = { id: "category-1", code: "SYN-REWARD", versionNo: 1, name: "Synthetic category", kind: "reward" as const, impactLevel: "normal", status: "enabled" };
const row = { id: "case-1", code: "SYN-CASE", status: "draft", occurredOn: "2090-01-01", employeeName: "Synthetic 1", kind: "reward", categoryName: category.name, impactLevel: "normal", summary: "Existing reward" };
beforeEach(() => {
  vi.resetAllMocks();
  state.user = { id: "actor", tenant_id: "tenant-a", park_id: "park-a", permissions: ["hr:rewards", "hr:reward:manage", "hr:reward:read"] };
  vi.mocked(hrApi.rewardCaseOptions).mockResolvedValue({ categories: [category] });
  vi.mocked(hrApi.rewardCategories).mockResolvedValue([category]);
  vi.mocked(hrApi.rewardCases).mockResolvedValue({ items: [row], total: 1, page: 1, page_size: 20 });
  vi.mocked(hrApi.rewardEmployeeOptions).mockImplementation(async (page = 1, keyword = "") => ({ items: [employee(keyword ? 601 : page)], total: keyword ? 1 : 602, page, page_size: 20 }));
  vi.mocked(hrApi.rewardCase).mockResolvedValue(row);
  vi.mocked(hrApi.createRewardCase).mockResolvedValue(row);
  vi.mocked(hrApi.createRewardCategory).mockResolvedValue(category);
  vi.mocked(hrApi.updateRewardCase).mockResolvedValue(row);
});
async function fillCase() {
  await screen.findByRole("option", { name: "Synthetic 1 · SYN-1" });
  await screen.findByRole("option", { name: "奖励 · Synthetic category" });
  fireEvent.change(screen.getByLabelText("员工"), { target: { value: "employee-1" } });
  fireEvent.change(screen.getByLabelText("事项编号"), { target: { value: "SYN-NEW" } });
  fireEvent.change(screen.getByLabelText("类别"), { target: { value: category.id } });
  fireEvent.change(screen.getByLabelText("发生日期"), { target: { value: "2090-01-01" } });
  fireEvent.change(screen.getByLabelText("事实摘要"), { target: { value: "Synthetic draft" } });
  return screen.getByRole("button", { name: "保存草稿" }).closest("form")!;
}

it("manage-only loads operation options and employee601 without unrelated read APIs", async () => {
  state.user.permissions = ["hr:rewards", "hr:reward:manage"];
  render(<HrRewardsClient />);
  await screen.findByRole("option", { name: "奖励 · Synthetic category" });
  fireEvent.change(screen.getByLabelText("搜索奖惩员工"), { target: { value: "SYN-601" } });
  fireEvent.keyDown(screen.getByLabelText("搜索奖惩员工"), { key: "Enter" });
  await screen.findByRole("option", { name: "Synthetic 601 · SYN-601" });
  expect(hrApi.rewardCases).not.toHaveBeenCalled();
  expect(hrApi.rewardCategories).not.toHaveBeenCalled();
  expect(hrApi.employees).not.toHaveBeenCalled();
  expect(hrApi.rewardEmployeeOptions).toHaveBeenCalledWith(1, "SYN-601", "synthetic-token", expect.any(AbortSignal));
});

it("retains the selected employee across paging and a candidate outage", async () => {
  render(<HrRewardsClient />);
  const form = await fillCase();
  fireEvent.click(screen.getByRole("button", { name: "员工下一页" }));
  await screen.findByRole("option", { name: "Synthetic 2 · SYN-2" });
  expect(screen.getByLabelText("员工")).toHaveValue("employee-1");
  vi.mocked(hrApi.rewardEmployeeOptions).mockRejectedValueOnce(new Error("candidate outage"));
  fireEvent.change(screen.getByLabelText("搜索奖惩员工"), { target: { value: "missing" } });
  fireEvent.keyDown(screen.getByLabelText("搜索奖惩员工"), { key: "Enter" });
  await screen.findByText(/candidate outage/);
  expect(screen.getByText("Existing reward")).toBeVisible();
  expect(screen.getByLabelText("员工")).toHaveValue("employee-1");
  fireEvent.submit(form);
  await waitFor(() => expect(hrApi.createRewardCase).toHaveBeenCalledWith(expect.objectContaining({ employeeId: "employee-1", factSummary: "Synthetic draft" }), "synthetic-token"));
});

it("failed case save retains all draft values and succeeds on retry", async () => {
  vi.mocked(hrApi.createRewardCase).mockRejectedValueOnce(new Error("save rejected"));
  render(<HrRewardsClient />);
  const form = await fillCase();
  fireEvent.submit(form);
  await screen.findByText(/save rejected/);
  expect(screen.getByLabelText("事项编号")).toHaveValue("SYN-NEW");
  expect(screen.getByLabelText("事实摘要")).toHaveValue("Synthetic draft");
  expect(screen.getByLabelText("员工")).toHaveValue("employee-1");
  expect(screen.getByLabelText("类别")).toHaveValue(category.id);
  fireEvent.submit(form);
  await screen.findByText("操作已保存。");
  await waitFor(() => expect(screen.getByLabelText("事项编号")).toHaveValue(""));
  expect(hrApi.createRewardCase).toHaveBeenCalledTimes(2);
});

it("category failure preserves its inputs and existing case data", async () => {
  vi.mocked(hrApi.createRewardCategory).mockRejectedValueOnce(new Error("category save rejected"));
  render(<HrRewardsClient />);
  await screen.findByText("Existing reward");
  fireEvent.change(screen.getByLabelText("类别编号"), { target: { value: "SYN-CATEGORY" } });
  fireEvent.change(screen.getByLabelText("类别名称"), { target: { value: "Synthetic draft category" } });
  fireEvent.submit(screen.getByRole("button", { name: "新增类别" }).closest("form")!);
  await screen.findByText(/category save rejected/);
  expect(screen.getByLabelText("类别编号")).toHaveValue("SYN-CATEGORY");
  expect(screen.getByLabelText("类别名称")).toHaveValue("Synthetic draft category");
  expect(screen.getByText("Existing reward")).toBeVisible();
});

it("failed edit retains the original target and edited fields", async () => {
  vi.mocked(hrApi.updateRewardCase).mockRejectedValueOnce(new Error("edit rejected"));
  render(<HrRewardsClient />);
  await screen.findByText("Existing reward");
  fireEvent.click(screen.getByRole("button", { name: "查看" }));
  const form = (await screen.findByRole("button", { name: "保存修改" })).closest("form")!;
  const summary = form.querySelector('input[name="summary"]')!;
  fireEvent.change(summary, { target: { value: "Edited synthetic draft" } });
  fireEvent.submit(form);
  await screen.findByText(/edit rejected/);
  expect(summary).toHaveValue("Edited synthetic draft");
  expect(hrApi.updateRewardCase).toHaveBeenCalledWith(row.id, expect.objectContaining({ factSummary: "Edited synthetic draft" }), "synthetic-token");
});

it("same-permission identity and park replacement clears forms and selections", async () => {
  const view = render(<HrRewardsClient />);
  await fillCase();
  state.user = { ...state.user, id: "actor-b", park_id: "park-b" };
  view.rerender(<HrRewardsClient />);
  await screen.findByRole("option", { name: "Synthetic 1 · SYN-1" });
  expect(screen.getByLabelText("事项编号")).toHaveValue("");
  expect(screen.getByLabelText("员工")).toHaveValue("");
  expect(screen.getByLabelText("事实摘要")).toHaveValue("");
  expect(hrApi.rewardEmployeeOptions).toHaveBeenCalledTimes(2);
});

it("synchronous duplicate submissions have one writer", async () => {
  let finish!: (value: typeof row) => void;
  vi.mocked(hrApi.createRewardCase).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  render(<HrRewardsClient />);
  const form = await fillCase();
  fireEvent.submit(form);
  fireEvent.submit(form);
  expect(hrApi.createRewardCase).toHaveBeenCalledTimes(1);
  await act(async () => finish(row));
  await screen.findByText("操作已保存。");
});

it("committed success survives refresh failure and resets only the submitted form", async () => {
  render(<HrRewardsClient />);
  const form = await fillCase();
  fireEvent.change(screen.getByLabelText("类别名称"), { target: { value: "Other draft" } });
  vi.mocked(hrApi.rewardCases).mockRejectedValueOnce(new Error("refresh unavailable"));
  fireEvent.submit(form);
  await screen.findByText("保存已成功，页面刷新失败，请刷新后核对。");
  expect(screen.getByText("操作已保存。")).toBeVisible();
  expect(screen.getByLabelText("事项编号")).toHaveValue("");
  expect(screen.getByLabelText("类别名称")).toHaveValue("Other draft");
  expect(hrApi.createRewardCase).toHaveBeenCalledTimes(1);
});

it("malformed employee rows expose retry without crashing the workbench", async () => {
  vi.mocked(hrApi.rewardEmployeeOptions).mockResolvedValueOnce({ items: [{ ...employee(1), fullName: { invalid: true } }], total: 1, page: 1, page_size: 20 } as never);
  render(<HrRewardsClient />);
  await screen.findByText("员工候选响应无效，请重试。");
  expect(screen.getByText("Existing reward")).toBeVisible();
  expect(screen.getByRole("button", { name: "搜索员工" })).toBeEnabled();
});


it("category refresh outage preserves a separate case draft and selection", async () => {
  render(<HrRewardsClient />);
  await fillCase();
  fireEvent.change(screen.getByLabelText("类别编号"), { target: { value: "SYN-CATEGORY" } });
  fireEvent.change(screen.getByLabelText("类别名称"), { target: { value: "New synthetic category" } });
  vi.mocked(hrApi.rewardCaseOptions).mockRejectedValueOnce(new Error("option refresh outage"));
  fireEvent.submit(screen.getByRole("button", { name: "新增类别" }).closest("form")!);
  await screen.findByText("保存已成功，页面刷新失败，请刷新后核对。");
  expect(screen.getByLabelText("类别")).toHaveValue(category.id);
  expect(screen.getByLabelText("事项编号")).toHaveValue("SYN-NEW");
  expect(screen.getByLabelText("员工")).toHaveValue("employee-1");
  expect(screen.getByLabelText("事实摘要")).toHaveValue("Synthetic draft");
});

it("successful category creation preserves an unrelated open edit draft", async () => {
  render(<HrRewardsClient />);
  await screen.findByText("Existing reward");
  fireEvent.click(screen.getByRole("button", { name: "查看" }));
  const editForm = (await screen.findByRole("button", { name: "保存修改" })).closest("form")!;
  const summary = editForm.querySelector('input[name="summary"]')!;
  fireEvent.change(summary, { target: { value: "Unsubmitted edit" } });
  fireEvent.change(screen.getByLabelText("类别编号"), { target: { value: "SYN-CATEGORY" } });
  fireEvent.change(screen.getByLabelText("类别名称"), { target: { value: "New synthetic category" } });
  fireEvent.submit(screen.getByRole("button", { name: "新增类别" }).closest("form")!);
  await screen.findByText("操作已保存。");
  expect(summary).toBeInTheDocument();
  expect(summary).toHaveValue("Unsubmitted edit");
  expect(hrApi.updateRewardCase).not.toHaveBeenCalled();
});

it("read-only rewards page does not expose or read category version maintenance",async()=>{state.user.permissions=["hr:rewards","hr:reward:read"];render(<HrRewardsClient/>);await screen.findByText("Existing reward");expect(screen.queryByRole("button",{name:/维护版本/})).toBeNull();expect(hrApi.rewardCategoryVersions).not.toHaveBeenCalled();});
it("category publication shares the real page write lock and closes before a failed list refresh",async()=>{vi.mocked(hrApi.rewardCategoryVersions).mockResolvedValue({category:{id:category.id,code:category.code,status:'enabled',currentVersionNo:1},items:[{id:'v1',versionNo:1,kind:'reward',name:category.name,impactLevel:'normal',description:'原制度说明',createdAt:'2026-10-09'}],total:1,page:1,page_size:20});let finish=()=>{};vi.mocked(hrApi.publishRewardCategoryVersion).mockImplementation(()=>new Promise(resolve=>{finish=()=>resolve({id:'v2',versionNo:2,kind:'reward',name:category.name,impactLevel:'normal'});}));render(<HrRewardsClient/>);fireEvent.click(await screen.findByRole('button',{name:'维护版本 Synthetic category'}));await screen.findByDisplayValue('原制度说明');const f=screen.getByRole('form',{name:'发布奖惩类别版本'});fireEvent.submit(f);fireEvent.submit(f);expect(hrApi.publishRewardCategoryVersion).toHaveBeenCalledTimes(1);expect(screen.getByRole('button',{name:'保存草稿'})).toBeDisabled();expect(screen.getByRole('button',{name:'新增类别'})).toBeDisabled();vi.mocked(hrApi.rewardCases).mockRejectedValueOnce(Error('合成列表刷新失败'));await act(async()=>finish());await screen.findByText('保存已成功，页面刷新失败，请刷新后核对。');expect(screen.queryByRole('form',{name:'发布奖惩类别版本'})).toBeNull();expect(screen.getByText('操作已保存。')).toHaveAttribute('role','status');});

it("approved manager can append a correction while preserving immutable approved summary", async () => {
  vi.mocked(hrApi.rewardCase).mockResolvedValue({ ...row, status: "approved", corrections: [] });
  vi.mocked(hrApi.appendRewardCorrection).mockResolvedValue({id:"correction-1",sequenceNo:1});
  render(<HrRewardsClient />);
  await screen.findByText("Existing reward"); fireEvent.click(screen.getByRole("button",{name:"查看"}));
  fireEvent.change(await screen.findByLabelText("更正摘要"),{target:{value:"补充事实"}});
  fireEvent.change(screen.getByLabelText("更正原因"),{target:{value:"复核说明"}});
  fireEvent.submit(screen.getByRole("form",{name:"追加奖惩更正"}));
  await screen.findByText("第 1 条更正已保存，原审批记录保留。");
  expect(hrApi.appendRewardCorrection).toHaveBeenCalledWith(row.id,{type:"correction",summary:"补充事实",reason:"复核说明"},"synthetic-token",expect.any(String));
  expect(hrApi.updateRewardCase).not.toHaveBeenCalled();
});
it("readonly approved detail shows authorized history without correction controls", async () => {
  state.user.permissions=["hr:rewards","hr:reward:read"];
  vi.mocked(hrApi.rewardCase).mockResolvedValue({...row,status:"approved",corrections:[{sequenceNo:1,type:"appeal",summary:"授权摘要",createdAt:"2090-01-02"}]});
  render(<HrRewardsClient />); await screen.findByText("Existing reward");fireEvent.click(screen.getByRole("button",{name:"查看"}));
  await screen.findByText("授权摘要");expect(screen.queryByLabelText("更正原因")).not.toBeInTheDocument();
});
it("pending correction cannot publish success or read history after identity changes", async () => {
  let resolve!:(value:{id:string;sequenceNo:number})=>void;
  vi.mocked(hrApi.rewardCase).mockResolvedValue({...row,status:"approved",corrections:[]});
  vi.mocked(hrApi.appendRewardCorrection).mockReturnValue(new Promise(r=>{resolve=r;}));
  const view=render(<HrRewardsClient />);await screen.findByText("Existing reward");fireEvent.click(screen.getByRole("button",{name:"查看"}));
  fireEvent.change(await screen.findByLabelText("更正摘要"),{target:{value:"未完成草稿"}});fireEvent.change(screen.getByLabelText("更正原因"),{target:{value:"合成复核"}});fireEvent.submit(screen.getByRole("form",{name:"追加奖惩更正"}));
  state.user={...state.user,id:"actor-b",park_id:"park-b"};view.rerender(<HrRewardsClient />);
  await act(async()=>resolve({id:"correction-1",sequenceNo:1}));
  expect(screen.queryByText(/第 1 条更正已保存/)).not.toBeInTheDocument();expect(screen.queryByLabelText("更正摘要")).not.toBeInTheDocument();expect(hrApi.rewardCase).toHaveBeenCalledTimes(1);
});

it("self role uses authoritative own-case capability to submit appeal without HR correction controls",async()=>{
 state.user.permissions=["hr:rewards","hr:reward:self_read"];
 vi.mocked(hrApi.rewardCase).mockResolvedValue({...row,status:"approved",canAppeal:true,ownAppeals:[]});vi.mocked(hrApi.appendRewardAppeal).mockResolvedValue({id:"appeal-1",sequenceNo:2});
 render(<HrRewardsClient/>);await screen.findByText("Existing reward");fireEvent.click(screen.getByRole("button",{name:"查看"}));
 fireEvent.change(await screen.findByLabelText("申诉摘要"),{target:{value:"本人申请复核"}});fireEvent.change(screen.getByLabelText("申诉原因"),{target:{value:"补充本人说明"}});
 fireEvent.submit(screen.getByRole("form",{name:"提交本人奖惩申诉"}));await screen.findByText("第 2 条申诉已保存，原审批记录保留。");
 expect(hrApi.appendRewardAppeal).toHaveBeenCalledWith(row.id,{type:"appeal",summary:"本人申请复核",reason:"补充本人说明"},"synthetic-token",expect.any(String));expect(hrApi.appendRewardCorrection).not.toHaveBeenCalled();expect(screen.queryByLabelText("更正原因")).not.toBeInTheDocument();
});
it("self permission alone and stale capability without self permission never expose appeal form",async()=>{
 state.user.permissions=["hr:rewards","hr:reward:self_read"];vi.mocked(hrApi.rewardCase).mockResolvedValue({...row,status:"approved",canAppeal:false});
 const view=render(<HrRewardsClient/>);await screen.findByText("Existing reward");fireEvent.click(screen.getByRole("button",{name:"查看"}));await screen.findByRole("button",{name:"关闭"});expect(screen.queryByLabelText("申诉原因")).not.toBeInTheDocument();
 state.user={...state.user,id:"read-user",permissions:["hr:rewards","hr:reward:read"]};vi.mocked(hrApi.rewardCase).mockResolvedValue({...row,status:"approved",canAppeal:true,ownAppeals:[]});view.rerender(<HrRewardsClient/>);await screen.findByText("Existing reward");fireEvent.click(screen.getByRole("button",{name:"查看"}));await screen.findByRole("button",{name:"关闭"});expect(screen.queryByLabelText("申诉原因")).not.toBeInTheDocument();
});
it("HR correction and own appeal retain independent drafts and share the parent write lock",async()=>{
 state.user.permissions=["hr:rewards","hr:reward:read","hr:reward:manage","hr:reward:self_read"];
 vi.mocked(hrApi.rewardCase).mockResolvedValue({...row,status:"approved",canAppeal:true,ownAppeals:[],corrections:[]});
 let reject!:(e:Error)=>void;vi.mocked(hrApi.appendRewardAppeal).mockReturnValue(new Promise((_,r)=>{reject=r;}));render(<HrRewardsClient/>);await screen.findByText("Existing reward");fireEvent.click(screen.getByRole("button",{name:"查看"}));
 fireEvent.change(await screen.findByLabelText("更正摘要"),{target:{value:"HR独立草稿"}});fireEvent.change(screen.getByLabelText("更正原因"),{target:{value:"HR独立原因"}});fireEvent.change(screen.getByLabelText("申诉摘要"),{target:{value:"本人独立草稿"}});fireEvent.change(screen.getByLabelText("申诉原因"),{target:{value:"本人独立原因"}});
 fireEvent.submit(screen.getByRole("form",{name:"提交本人奖惩申诉"}));expect(screen.getByRole("button",{name:"保存追加更正"})).toBeDisabled();fireEvent.submit(screen.getByRole("form",{name:"追加奖惩更正"}));expect(hrApi.appendRewardCorrection).not.toHaveBeenCalled();
 await act(async()=>reject(Error("合成申诉失败")));expect(screen.getByLabelText("更正摘要")).toHaveValue("HR独立草稿");expect(screen.getByLabelText("申诉摘要")).toHaveValue("本人独立草稿");
});

it("payroll association requires approved detail and exact read plus payroll-link permissions",async()=>{
 state.user.permissions=["hr:rewards","hr:reward:read","hr:reward:link_payroll"];
 vi.mocked(hrApi.rewardCase).mockResolvedValue({...row,status:"approved",corrections:[]});
 vi.mocked(hrApi.rewardPayrollLinkOptions).mockResolvedValue({caseId:row.id,status:"approved",existing:null,items:[],total:0,page:1,page_size:20});
 const view=render(<HrRewardsClient/>);await screen.findByText("Existing reward");fireEvent.click(screen.getByRole("button",{name:"查看"}));await screen.findByText("本员工暂无有效工资输入，请先完成对应月份的考勤月结或补正。");expect(hrApi.rewardPayrollLinkOptions).toHaveBeenCalledTimes(1);
 view.unmount();state.user.permissions=["hr:rewards","hr:reward:read"];render(<HrRewardsClient/>);await screen.findByText("Existing reward");fireEvent.click(screen.getByRole("button",{name:"查看"}));await screen.findByRole("button",{name:/^关闭$/});expect(screen.queryByRole("region",{name:"奖惩工资输入关联"})).not.toBeInTheDocument();expect(hrApi.rewardPayrollLinkOptions).toHaveBeenCalledTimes(1);
});


it.each(["0","123.4567"])("authorized reward create retains and transports reason and amount %s",async amount=>{
 state.user.permissions.push("hr:reward_amount:read","hr:reward_reason:read");vi.mocked(hrApi.createRewardCase).mockRejectedValueOnce(new Error("sensitive draft rejected"));
 render(<HrRewardsClient/>);const f=await fillCase();fireEvent.change(screen.getByLabelText("详细原因"),{target:{value:"合成详细依据"}});fireEvent.change(screen.getByLabelText("金额建议"),{target:{value:amount}});
 fireEvent.submit(f);await screen.findByText(/sensitive draft rejected/);expect(screen.getByLabelText("详细原因")).toHaveValue("合成详细依据");expect(screen.getByLabelText("金额建议")).toHaveValue(Number(amount));
 fireEvent.submit(f);await waitFor(()=>expect(hrApi.createRewardCase).toHaveBeenCalledTimes(2));expect(hrApi.createRewardCase).toHaveBeenLastCalledWith(expect.objectContaining({detailedReason:"合成详细依据",amountSuggestion:amount,currency:"CNY"}),"synthetic-token");
});
it("authorized reward edit retains reason and decimal amount after failure",async()=>{
 state.user.permissions.push("hr:reward_amount:read","hr:reward_reason:read");vi.mocked(hrApi.rewardCase).mockResolvedValue({...row,detailedReason:"合成原依据",amountSuggestion:"12.3456",currency:"CNY"});vi.mocked(hrApi.updateRewardCase).mockRejectedValueOnce(new Error("sensitive edit rejected"));
 render(<HrRewardsClient/>);await screen.findByText("Existing reward");fireEvent.click(screen.getByRole("button",{name:"查看"}));await screen.findByRole("button",{name:"保存修改"});expect(screen.getByText("合成原依据",{selector:"p"})).toBeVisible();const f=screen.getByRole("button",{name:"保存修改"}).closest("form")!;
 fireEvent.change(f.querySelector('[name="reason"]')!,{target:{value:"合成新依据"}});fireEvent.change(f.querySelector('[name="amount"]')!,{target:{value:"0"}});fireEvent.submit(f);await screen.findByText(/sensitive edit rejected/);
 expect(f.querySelector('[name="reason"]')).toHaveValue("合成新依据");expect(f.querySelector('[name="amount"]')).toHaveValue(0);expect(hrApi.updateRewardCase).toHaveBeenCalledWith(row.id,expect.objectContaining({detailedReason:"合成新依据",amountSuggestion:"0",currency:"CNY"}),"synthetic-token");
});
it("reward reason and amount stay absent without field permissions even in an overbroad response",async()=>{
 vi.mocked(hrApi.rewardCases).mockResolvedValue({items:[{...row,amountSuggestion:"123.4567",currency:"CNY"}],total:1,page:1,page_size:20});vi.mocked(hrApi.rewardCase).mockResolvedValue({...row,detailedReason:"合成受限原因",amountSuggestion:"123.4567",currency:"CNY"});
 render(<HrRewardsClient/>);const f=await fillCase();fireEvent.submit(f);await waitFor(()=>expect(hrApi.createRewardCase).toHaveBeenCalledTimes(1));expect(vi.mocked(hrApi.createRewardCase).mock.calls[0]![0]).not.toHaveProperty("detailedReason");expect(vi.mocked(hrApi.createRewardCase).mock.calls[0]![0]).not.toHaveProperty("amountSuggestion");
 fireEvent.click(screen.getByRole("button",{name:"查看"}));await screen.findByRole("button",{name:"保存修改"});expect(screen.queryByText("合成受限原因")).toBeNull();expect(screen.queryByText(/123\.4567/)).toBeNull();expect(screen.queryByLabelText("详细原因")).toBeNull();expect(screen.queryByLabelText("金额建议")).toBeNull();
});
