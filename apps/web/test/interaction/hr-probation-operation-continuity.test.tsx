import {act,fireEvent,render,screen,waitFor,within} from "@testing-library/react";
import {beforeEach,expect,it,vi} from "vitest";
import {ProbationApplicationsPanel} from "../../app/hr/lifecycle/ProbationApplicationsPanel";
import {hrApi,type HrProbationApplication} from "../../lib/hr-api";

const state=vi.hoisted(()=>({user:{id:"actor",park_id:"park-a",permissions:["hr:lifecycle:read","hr:lifecycle:assign","hr:lifecycle:review","hr:employment:transition"]}}));
vi.mock("../../lib/auth-context",()=>({useAuthUser:()=>state.user}));
vi.mock("../../lib/authz",()=>({getAccessToken:()=>"synthetic-token"}));
vi.mock("../../lib/hr-api",()=>({hrApi:{employees:vi.fn(),probationApplications:vi.fn(),createProbationApplication:vi.fn(),updateProbationApplication:vi.fn(),probationApplicationAction:vi.fn(),reviewProbationApplication:vi.fn(),confirmProbationApplication:vi.fn()}}));
const application=(patch:Partial<HrProbationApplication>={}):HrProbationApplication=>({id:"APP-1",version:1,applicationNo:"SYN-1",applicationName:"Synthetic probation",applicationDate:"2026-10-01",reason:"Synthetic reason",status:"submitted",reviewComment:null,reviewedAt:null,confirmedAt:null,participants:[{id:"PART-1",employeeId:"EMP-1",employeeName:"Synthetic employee",employeeCode:"SYN-EMP-1",plannedConfirmationDate:"2026-10-10",confirmedDate:null,status:"pending"}],...patch});
const list=(row:HrProbationApplication)=>({items:[row],total:1,page:1,page_size:20});
beforeEach(()=>{vi.clearAllMocks();state.user={id:"actor",park_id:"park-a",permissions:["hr:lifecycle:read","hr:lifecycle:assign","hr:lifecycle:review","hr:employment:transition"]};vi.mocked(hrApi.probationApplications).mockResolvedValue(list(application()));});
const editForm=()=>screen.getByRole("button",{name:"保存修改"}).closest("form")!;

it("requires and displays the actual return opinion while stale list data cannot undo it",async()=>{
 const returned=application({version:2,status:"returned",reviewComment:"Correct the actual planned date",reviewedAt:"2026-10-10T03:00:00Z"});
 vi.mocked(hrApi.reviewProbationApplication).mockResolvedValue(returned);
 render(<ProbationApplicationsPanel/>);fireEvent.click(await screen.findByRole("button",{name:"填写审核意见"}));
 fireEvent.click(screen.getByRole("button",{name:"退回"}));expect(hrApi.reviewProbationApplication).not.toHaveBeenCalled();expect(screen.getByText("请填写退回意见")).toBeVisible();
 fireEvent.change(screen.getByLabelText("审核意见"),{target:{value:"  Correct the actual planned date  "}});fireEvent.click(screen.getByRole("button",{name:"退回"}));
 await screen.findByText(/审核意见：Correct the actual planned date/);expect(hrApi.reviewProbationApplication).toHaveBeenCalledWith("APP-1","return","Correct the actual planned date","synthetic-token",expect.any(String));
 await waitFor(()=>expect(hrApi.probationApplications).toHaveBeenCalledTimes(2));expect(screen.getByText("Synthetic probation · 已退回")).toBeVisible();
});

it("keeps the controlled complete draft and retries the identical body token and key after an unknown result",async()=>{
 vi.mocked(hrApi.probationApplications).mockResolvedValue(list(application({status:"returned"})));
 vi.mocked(hrApi.updateProbationApplication).mockRejectedValueOnce(new Error("Synthetic connection lost"));
 render(<ProbationApplicationsPanel/>);fireEvent.click(await screen.findByRole("button",{name:"修改"}));
 fireEvent.change(screen.getByLabelText("申请名称"),{target:{value:"Corrected name"}});fireEvent.change(screen.getByLabelText("申请内容"),{target:{value:"Corrected reason"}});fireEvent.change(within(screen.getByRole("group",{name:"试用期员工与计划转正日期"})).getByLabelText("计划转正日期"),{target:{value:"2026-10-11"}});
 fireEvent.submit(editForm());fireEvent.submit(editForm());
 await screen.findByRole("button",{name:"按原请求重试"});expect(hrApi.updateProbationApplication).toHaveBeenCalledTimes(1);expect(screen.getByLabelText("申请名称")).toHaveValue("Corrected name");expect(screen.getByLabelText("申请内容")).toHaveValue("Corrected reason");
 const first=vi.mocked(hrApi.updateProbationApplication).mock.calls[0]!;
 const saved=application({version:2,status:"draft",applicationName:"Corrected name",reason:"Corrected reason",participants:application().participants.map(p=>({...p,plannedConfirmationDate:"2026-10-11"}))});
 vi.mocked(hrApi.updateProbationApplication).mockResolvedValueOnce(saved);vi.mocked(hrApi.probationApplications).mockRejectedValueOnce(new Error("Synthetic refresh failed"));
 expect(screen.getByRole("button",{name:"按原请求重试"})).toBeEnabled();fireEvent.click(screen.getByRole("button",{name:"按原请求重试"}));await screen.findByText("Corrected name · 草稿");
 expect(vi.mocked(hrApi.updateProbationApplication).mock.calls[1]).toEqual(first);expect(await screen.findByText(/Synthetic refresh failed/)).toBeVisible();expect(screen.queryByRole("button",{name:"按原请求重试"})).toBeNull();expect(screen.getByText("申请已保存：草稿。")).toBeVisible();
});

it("accepts a genuinely newer authorized result instead of pinning the prior confirmed overlay",async()=>{
 const approved=application({version:2,status:"approved"});const newer=application({version:3,status:"confirmed",confirmedAt:"2026-10-10T04:00:00Z",participants:application().participants.map(p=>({...p,status:"confirmed",confirmedDate:p.plannedConfirmationDate}))});
 vi.mocked(hrApi.reviewProbationApplication).mockResolvedValue(approved);vi.mocked(hrApi.probationApplications).mockResolvedValueOnce(list(application())).mockResolvedValueOnce(list(newer));
 render(<ProbationApplicationsPanel/>);fireEvent.click(await screen.findByRole("button",{name:"填写审核意见"}));fireEvent.click(screen.getByRole("button",{name:"批准"}));await screen.findByText("Synthetic probation · 已转正");expect(screen.queryByRole("button",{name:"确认转正"})).toBeNull();
});

it("preserves formal confirmation and participant dates when refreshing the list fails",async()=>{
 const approved=application({status:"approved"}),confirmed=application({version:2,status:"confirmed",confirmedAt:"2026-10-10T04:00:00Z",participants:application().participants.map(p=>({...p,status:"confirmed",confirmedDate:p.plannedConfirmationDate}))});
 vi.mocked(hrApi.probationApplications).mockResolvedValueOnce(list(approved)).mockRejectedValueOnce(new Error("Synthetic list offline"));vi.mocked(hrApi.confirmProbationApplication).mockResolvedValue(confirmed);
 render(<ProbationApplicationsPanel/>);fireEvent.click(await screen.findByRole("button",{name:"确认转正"}));await screen.findByText("Synthetic probation · 已转正");expect(screen.getByText("转正已办理，员工任职和转正日期已保存。")).toBeVisible();expect(screen.getByText("已确认转正日期").nextElementSibling).toHaveTextContent("2026-10-10");await screen.findByText(/Synthetic list offline/);expect(hrApi.confirmProbationApplication).toHaveBeenCalledTimes(1);
});

it("suppresses an old identity write completion after authenticated context replacement",async()=>{
 let resolve!:(row:HrProbationApplication)=>void;vi.mocked(hrApi.reviewProbationApplication).mockImplementation(()=>new Promise(done=>{resolve=done;}));
 const rendered=render(<ProbationApplicationsPanel/>);fireEvent.click(await screen.findByRole("button",{name:"填写审核意见"}));fireEvent.click(screen.getByRole("button",{name:"批准"}));
 state.user={id:"other",park_id:"park-b",permissions:[]};rendered.rerender(<ProbationApplicationsPanel/>);
 await act(async()=>resolve(application({version:2,status:"approved"})));expect(screen.queryByText(/申请已保存/)).toBeNull();expect(screen.queryByText("Synthetic probation · 已批准")).toBeNull();expect(hrApi.probationApplications).toHaveBeenCalledTimes(1);
});

it("treats a malformed confirmation receipt as unresolved and retries the original request",async()=>{
 const approved=application({status:"approved"}),malformed=application({version:2,status:"confirmed",confirmedAt:"2026-10-10T04:00:00Z",participants:application().participants.map(p=>({...p,status:"confirmed",confirmedDate:"2026-10-09"}))}),confirmed=application({version:2,status:"confirmed",confirmedAt:"2026-10-10T04:00:00Z",participants:application().participants.map(p=>({...p,status:"confirmed",confirmedDate:p.plannedConfirmationDate}))});
 vi.mocked(hrApi.probationApplications).mockResolvedValue(list(approved));vi.mocked(hrApi.confirmProbationApplication).mockResolvedValueOnce(malformed).mockResolvedValueOnce(confirmed);
 render(<ProbationApplicationsPanel/>);fireEvent.click(await screen.findByRole("button",{name:"确认转正"}));const retry=await screen.findByRole("button",{name:"按原请求重试"});const original=vi.mocked(hrApi.confirmProbationApplication).mock.calls[0];fireEvent.click(retry);
 await waitFor(()=>expect(hrApi.confirmProbationApplication).toHaveBeenCalledTimes(2));expect(vi.mocked(hrApi.confirmProbationApplication).mock.calls[1]).toEqual(original);expect(await screen.findByText("Synthetic probation · 已转正")).toBeVisible();
});
