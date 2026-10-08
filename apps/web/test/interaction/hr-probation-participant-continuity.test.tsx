import {act,fireEvent,render,screen,waitFor,within} from "@testing-library/react";
import {beforeEach,expect,it,vi} from "vitest";
import {ProbationApplicationsPanel} from "../../app/hr/lifecycle/ProbationApplicationsPanel";
import {hrApi,type HrEmployee,type HrProbationApplication} from "../../lib/hr-api";

const state=vi.hoisted(()=>({user:{id:"actor",park_id:"park-a",permissions:["hr:lifecycle:read","hr:lifecycle:assign","hr:employee:read"]}}));
vi.mock("../../lib/auth-context",()=>({useAuthUser:()=>state.user}));
vi.mock("../../lib/authz",()=>({getAccessToken:()=>"synthetic-token"}));
vi.mock("../../lib/hr-api",()=>({hrApi:{employees:vi.fn(),probationApplications:vi.fn(),createProbationApplication:vi.fn(),updateProbationApplication:vi.fn(),probationApplicationAction:vi.fn(),reviewProbationApplication:vi.fn(),confirmProbationApplication:vi.fn()}}));
const employee=(n:number)=>({id:`employee-${n}`,fullName:`Synthetic ${n}`,employeeCode:`SYN-${n}`,employmentStatus:"probation"}) as HrEmployee;
const candidates=(page=1,items=Array.from({length:20},(_,i)=>employee((page-1)*20+i+1)),total=121)=>({items,page,page_size:20,total});
const participant=(n:number,date="2090-02-01")=>({id:`participant-${n}`,employeeId:`employee-${n}`,employeeName:`Synthetic ${n}`,employeeCode:`SYN-${n}`,plannedConfirmationDate:date,confirmedDate:null,status:"pending"});
const application=(n:number,participants=[participant(199)]):HrProbationApplication=>({id:`application-${n}`,applicationNo:`SYN-APP-${n}`,applicationName:`Application ${n}`,applicationDate:"2090-01-01",reason:"Synthetic reason",status:"draft",reviewComment:null,reviewedAt:null,confirmedAt:null,participants});
const list=(page=1,items=Array.from({length:20},(_,i)=>application((page-1)*20+i+1)),total=51)=>({items,page,page_size:20,total});
function form(){return screen.getByRole("button",{name:/保存(修改|申请草稿)/}).closest("form")!;}
function participantEditor(){return screen.getByRole("group",{name:"试用期员工与计划转正日期"});}

beforeEach(()=>{
 vi.clearAllMocks();state.user={id:"actor",park_id:"park-a",permissions:["hr:lifecycle:read","hr:lifecycle:assign","hr:employee:read"]};
 vi.mocked(hrApi.probationApplications).mockImplementation(async(_token,page=1)=>list(page));
 vi.mocked(hrApi.employees).mockImplementation(async(_token,page=1)=>candidates(page));
 vi.mocked(hrApi.createProbationApplication).mockResolvedValue(application(1));vi.mocked(hrApi.updateProbationApplication).mockResolvedValue(application(1));
});

it("pages to application51 and employee101, adding only after an explicit button and writing the chosen date",async()=>{
 render(<ProbationApplicationsPanel/>);
 await screen.findByText(/Application 1 · 草稿/);
 expect(screen.getByRole("button",{name:"加入参与名单"})).toBeDisabled();
 fireEvent.click(screen.getByRole("navigation",{name:"转正申请分页"}).querySelectorAll("button")[1]!);
 await screen.findByText(/Application 21 · 草稿/);
 fireEvent.click(screen.getByRole("navigation",{name:"转正申请分页"}).querySelectorAll("button")[1]!);
 await screen.findByText(/Application 51 · 草稿/);
 expect(hrApi.probationApplications).toHaveBeenLastCalledWith("synthetic-token",3,20,undefined,expect.any(AbortSignal));
 for(let page=2;page<=6;page++){fireEvent.click(screen.getByRole("button",{name:"员工下一页"}));await screen.findByText(`员工目录第 ${page} / 7 页 · 共 121 人`);}
 fireEvent.change(screen.getByLabelText("员工"),{target:{value:"employee-101"}});
 expect(screen.queryByRole("button",{name:"移除 Synthetic 101"})).toBeNull();
 fireEvent.click(screen.getByRole("button",{name:"加入参与名单"}));
 const editor=participantEditor();expect(screen.getByRole("button",{name:"移除 Synthetic 101"})).toBeVisible();
 vi.mocked(hrApi.employees).mockResolvedValue(candidates(1,[employee(121)],1));
 fireEvent.change(screen.getByLabelText("搜索转正员工"),{target:{value:"SYN-121"}});
 fireEvent.keyDown(screen.getByLabelText("搜索转正员工"),{key:"Enter"});
 await screen.findByRole("option",{name:"Synthetic 121 · SYN-121"});
 expect(screen.getByRole("button",{name:"移除 Synthetic 101"})).toBeVisible();
 fireEvent.change(within(editor).getByLabelText("计划转正日期"),{target:{value:"2090-03-01"}});
 fireEvent.change(screen.getByLabelText("申请名称"),{target:{value:"New probation"}});
 fireEvent.change(screen.getByLabelText("申请日期"),{target:{value:"2090-01-01"}});
 fireEvent.change(screen.getByLabelText("申请内容"),{target:{value:"Synthetic approval"}});
 fireEvent.submit(form());
 await waitFor(()=>expect(hrApi.createProbationApplication).toHaveBeenCalledTimes(1));
 expect(vi.mocked(hrApi.createProbationApplication).mock.calls[0]![0]).toEqual(expect.objectContaining({participants:[{employeeId:"employee-101",plannedConfirmationDate:"2090-03-01"}]}));
 expect(vi.mocked(hrApi.employees).mock.calls.every(call=>call[2]===20&&call[3]?.status==="probation")).toBe(true);
});

it("preserves the full authorized edit seed through search failure and no directory authority",async()=>{
 state.user={id:"actor",park_id:"park-a",permissions:["hr:lifecycle:read","hr:lifecycle:assign"]};
 vi.mocked(hrApi.probationApplications).mockResolvedValue(list(1,[application(1,[participant(199),participant(200,"2090-04-01")])],1));
 render(<ProbationApplicationsPanel/>);
 fireEvent.click(await screen.findByRole("button",{name:"修改"}));
 expect(within(participantEditor()).getByText("Synthetic 199 · SYN-199")).toBeVisible();
 expect(within(participantEditor()).getByText("Synthetic 200 · SYN-200")).toBeVisible();
 expect(screen.getByRole("button",{name:"加入参与名单"})).toBeDisabled();
 expect(hrApi.employees).not.toHaveBeenCalled();
 fireEvent.submit(form());
 await waitFor(()=>expect(hrApi.updateProbationApplication).toHaveBeenCalledTimes(1));
 expect(vi.mocked(hrApi.updateProbationApplication).mock.calls[0]![1]).toEqual(expect.objectContaining({participants:[{employeeId:"employee-199",plannedConfirmationDate:"2090-02-01"},{employeeId:"employee-200",plannedConfirmationDate:"2090-04-01"}]}));
});

it("keeps seeded participants after directory failure; only explicit removal changes the full writer payload",async()=>{
 vi.mocked(hrApi.probationApplications).mockResolvedValue(list(1,[application(1,[participant(199),participant(200)])],1));
 vi.mocked(hrApi.employees).mockRejectedValue(new Error("Synthetic directory failure"));
 render(<ProbationApplicationsPanel/>);
 fireEvent.click(await screen.findByRole("button",{name:"修改"}));
 expect(await screen.findByText(/Synthetic directory failure/)).toBeVisible();
 expect(within(participantEditor()).getByText("Synthetic 199 · SYN-199")).toBeVisible();
 fireEvent.click(screen.getByRole("button",{name:"移除 Synthetic 200"}));
 fireEvent.submit(form());
 await waitFor(()=>expect(hrApi.updateProbationApplication).toHaveBeenCalledTimes(1));
 expect(vi.mocked(hrApi.updateProbationApplication).mock.calls[0]![1]).toEqual(expect.objectContaining({participants:[{employeeId:"employee-199",plannedConfirmationDate:"2090-02-01"}]}));
});

it("rejects empty or undated controlled participants before writing",async()=>{
 vi.mocked(hrApi.probationApplications).mockResolvedValue(list(1,[application(1)],1));
 render(<ProbationApplicationsPanel/>);
 fireEvent.click(await screen.findByRole("button",{name:"修改"}));
 fireEvent.click(screen.getByRole("button",{name:"移除 Synthetic 199"}));
 fireEvent.submit(form());expect(hrApi.updateProbationApplication).not.toHaveBeenCalled();
 expect(await screen.findByText("请至少选择一名试用期员工")).toBeVisible();
 await screen.findByRole("option",{name:"Synthetic 1 · SYN-1"});
 fireEvent.change(screen.getByLabelText("员工"),{target:{value:"employee-1"}});
 fireEvent.click(screen.getByRole("button",{name:"加入参与名单"}));
 fireEvent.submit(form());expect(hrApi.updateProbationApplication).not.toHaveBeenCalled();
 expect(await screen.findByText("请填写所有已选员工的计划转正日期")).toBeVisible();
});

it("retries a failed application page and resets a shrinking page",async()=>{
 vi.mocked(hrApi.probationApplications).mockRejectedValueOnce(new Error("Synthetic list failure"));
 render(<ProbationApplicationsPanel/>);
 expect(await screen.findByText(/Synthetic list failure/)).toBeVisible();
 fireEvent.click(screen.getByRole("button",{name:"重试申请列表"}));
 await screen.findByText(/Application 1 · 草稿/);
 fireEvent.click(screen.getByRole("navigation",{name:"转正申请分页"}).querySelectorAll("button")[1]!);
 await screen.findByText(/Application 21 · 草稿/);
 vi.mocked(hrApi.probationApplications).mockResolvedValueOnce(list(3,[],1)).mockResolvedValueOnce(list(1,[application(1)],1));
 fireEvent.click(screen.getByRole("navigation",{name:"转正申请分页"}).querySelectorAll("button")[1]!);
 await screen.findByText("第 1 / 1 页 · 共 1 条");
 expect(vi.mocked(hrApi.probationApplications).mock.calls.slice(-2).map(call=>call[1])).toEqual([3,1]);
});

it("clears old participant and late list reads when full account or park context changes",async()=>{
 let finish!:(value:ReturnType<typeof list>)=>void;
 vi.mocked(hrApi.probationApplications).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 const view=render(<ProbationApplicationsPanel/>);
 await waitFor(()=>expect(hrApi.probationApplications).toHaveBeenCalledTimes(1));
 const signal=vi.mocked(hrApi.probationApplications).mock.calls[0]![4]!;
 state.user={...state.user,park_id:"park-b"};view.rerender(<ProbationApplicationsPanel/>);
 expect(signal.aborted).toBe(true);
 await act(async()=>finish(list(1,[application(999)],1)));
 expect(screen.queryByText(/Application 999 · 草稿/)).toBeNull();
 expect(within(participantEditor()).queryByText(/Synthetic 199 · SYN-199/)).toBeNull();
});

it("allows native validity with a retained participant and no unadded candidate and preserves the full draft on failed save",async()=>{
 vi.mocked(hrApi.probationApplications).mockResolvedValue(list(1,[application(1,[participant(199),participant(200)])],1));vi.mocked(hrApi.updateProbationApplication).mockRejectedValue(new Error("Synthetic conflict"));
 render(<ProbationApplicationsPanel/>);fireEvent.click(await screen.findByRole("button",{name:"修改"}));await screen.findByRole("option",{name:"Synthetic 1 · SYN-1"});
 expect(screen.getByLabelText("员工")).toHaveValue("");expect(form().checkValidity()).toBe(true);fireEvent.change(screen.getByLabelText("申请名称"),{target:{value:"Corrected name"}});fireEvent.change(within(participantEditor()).getAllByLabelText("计划转正日期")[0]!,{target:{value:"2090-05-01"}});
 fireEvent.submit(form());await screen.findByText("Synthetic conflict");await act(async()=>{});expect(screen.getByLabelText("申请名称")).toHaveValue("Corrected name");expect(within(participantEditor()).getAllByLabelText("计划转正日期")[0]).toHaveValue("2090-05-01");expect(screen.getByRole("button",{name:"移除 Synthetic 200"})).toBeVisible();
});

it("keeps the deliberately opened application and complete participant payload across application pagination",async()=>{
 vi.mocked(hrApi.probationApplications).mockImplementation(async(_token,page=1)=>list(page,[application(page===1?1:21,[participant(page===1?199:299)])],21));
 render(<ProbationApplicationsPanel/>);fireEvent.click(await screen.findByRole("button",{name:"修改"}));fireEvent.click(within(screen.getByRole("navigation",{name:"转正申请分页"})).getByRole("button",{name:"下一页"}));await screen.findByText(/Application 21 · 草稿/);
 fireEvent.submit(form());await waitFor(()=>expect(hrApi.updateProbationApplication).toHaveBeenCalledTimes(1));expect(vi.mocked(hrApi.updateProbationApplication).mock.calls[0]).toEqual(["application-1",expect.objectContaining({participants:[{employeeId:"employee-199",plannedConfirmationDate:"2090-02-01"}]}),"synthetic-token"]);
});
