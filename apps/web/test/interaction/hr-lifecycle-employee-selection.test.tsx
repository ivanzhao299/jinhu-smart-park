import {act,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {beforeEach,expect,it,vi} from "vitest";
import {HrLifecycleClient} from "../../app/hr/lifecycle/HrLifecycleClient";
import {hrApi,type HrDirectoryUserOption,type HrEmployee,type HrEmploymentEvent,type HrLifecycleChecklist,type HrLifecycleChecklistDetail,type HrLifecycleTemplate} from "../../lib/hr-api";

const state=vi.hoisted(()=>({user:{id:"actor",park_id:"park-a",permissions:["hr:lifecycle:read","hr:lifecycle:assign","hr:employee:read"]}}));
vi.mock("../../lib/auth-context",()=>({useAuthUser:()=>state.user}));
vi.mock("../../lib/authz",()=>({getAccessToken:()=>"synthetic-token"}));
vi.mock("../../components/auth/PermissionGuard",()=>({PermissionGuard:({children}:{children:React.ReactNode})=>children}));
vi.mock("../../app/hr/lifecycle/ProbationApplicationsPanel",()=>({ProbationApplicationsPanel:()=>null}));
vi.mock("../../app/hr/lifecycle/JobChangeApplicationsPanel",()=>({JobChangeApplicationsPanel:()=>null}));
vi.mock("../../app/hr/lifecycle/DepartureApplicationsPanel",()=>({DepartureApplicationsPanel:()=>null}));
vi.mock("../../app/hr/lifecycle/RehireApplicationsPanel",()=>({RehireApplicationsPanel:()=>null}));
vi.mock("../../lib/hr-api",()=>({hrApi:{employees:vi.fn(),lifecycleChecklists:vi.fn(),lifecycleChecklist:vi.fn(),lifecycleTemplateOptions:vi.fn(),directoryOptions:vi.fn(),events:vi.fn(),createLifecycleChecklist:vi.fn()}}));

const employee=(index:number,status="active")=>({id:`employee-${index}`,fullName:`Synthetic ${index}`,employeeCode:`SYN-${index}`,employmentStatus:status}) as HrEmployee;
const candidates=(page=1,items=Array.from({length:20},(_,index)=>employee((page-1)*20+index+1)),total=121)=>({items,page,page_size:20,total});
const checklist:HrLifecycleChecklist={id:"checklist-1",employeeId:"employee-2",employeeName:"Existing checklist",type:"onboarding",status:"open",dueDate:null,itemCount:1,doneCount:0,overdueCount:0};
const departure:HrEmploymentEvent={id:"event-101",eventNo:"SYN-EVENT",eventType:"depart",effectiveDate:"2090-01-01",reason:"Synthetic departure",createTime:"2090-01-01"};
const template={id:"template-1",code:"SYN",name:"Synthetic template",type:"offboarding",versionId:"version-1",versionNo:1,itemCount:1};
const detail:HrLifecycleChecklistDetail={...checklist,items:[{id:"item-1",itemCode:"SYN-TASK",itemName:"Synthetic task",category:"documents",sequenceNo:1,status:"pending",responsibleUserId:null,dueDate:null,required:true,completedAt:null,overdue:false}]};

beforeEach(()=>{
 vi.clearAllMocks();
 state.user={id:"actor",park_id:"park-a",permissions:["hr:lifecycle:read","hr:lifecycle:assign","hr:employee:read"]};
 vi.mocked(hrApi.employees).mockImplementation(async(_token,page=1)=>candidates(page));
 vi.mocked(hrApi.lifecycleChecklists).mockResolvedValue({items:[checklist],page:1,page_size:20,total:1});
 vi.mocked(hrApi.lifecycleTemplateOptions).mockResolvedValue([template]);
 vi.mocked(hrApi.lifecycleChecklist).mockResolvedValue(detail);
 vi.mocked(hrApi.directoryOptions).mockResolvedValue({users:[],orgs:[]});
 vi.mocked(hrApi.events).mockResolvedValue([]);
});

it("reaches employee101 on page6, retains an explicit selection across search, and writes the selected target",async()=>{
 render(<HrLifecycleClient/>);
 await screen.findByText(/Existing checklist/);
 expect(screen.getByLabelText("员工")).toHaveValue("");
 for(let page=2;page<=6;page++){fireEvent.click(screen.getByRole("button",{name:"员工下一页"}));await screen.findByText(`员工目录第 ${page} / 7 页 · 共 121 人`);}
 fireEvent.change(screen.getByLabelText("员工"),{target:{value:"employee-101"}});
 expect(hrApi.events).toHaveBeenCalledWith("employee-101","synthetic-token",expect.any(AbortSignal));
 vi.mocked(hrApi.employees).mockResolvedValue(candidates(1,[employee(121)],1));
 fireEvent.change(screen.getByLabelText("搜索清单员工"),{target:{value:"SYN-121"}});
 fireEvent.keyDown(screen.getByLabelText("搜索清单员工"),{key:"Enter"});
 await screen.findByRole("option",{name:"Synthetic 101 · SYN-101（已选）"});
 fireEvent.change(screen.getByLabelText("模板版本"),{target:{value:"version-1"}});
 fireEvent.submit(screen.getByRole("button",{name:"创建清单"}).closest("form")!);
 await waitFor(()=>expect(hrApi.createLifecycleChecklist).toHaveBeenCalledTimes(1));
 expect(vi.mocked(hrApi.createLifecycleChecklist).mock.calls[0]).toEqual([expect.objectContaining({employeeId:"employee-101",templateVersionId:"version-1"}),"synthetic-token"]);
 expect(vi.mocked(hrApi.employees).mock.calls.every(call=>call[2]===20)).toBe(true);
});

it("allows a departed employee and sends only that employee's selected departure event",async()=>{
 vi.mocked(hrApi.employees).mockResolvedValue(candidates(1,[employee(101,"departed"),employee(102)],2));
 vi.mocked(hrApi.events).mockImplementation(async(id)=>id==="employee-101"?[departure]:[]);
 render(<HrLifecycleClient/>);
 const departed=await screen.findByRole("option",{name:"Synthetic 101 · SYN-101"});expect(departed).toBeEnabled();
 fireEvent.change(screen.getByLabelText("员工"),{target:{value:"employee-101"}});
 await screen.findByRole("option",{name:"2090-01-01 · Synthetic departure"});
 fireEvent.change(screen.getByLabelText("离职任职事件"),{target:{value:"event-101"}});
 fireEvent.change(screen.getByLabelText("员工"),{target:{value:"employee-102"}});
 expect(screen.getByLabelText("离职任职事件")).toHaveValue("");
 expect(screen.queryByRole("option",{name:"2090-01-01 · Synthetic departure"})).toBeNull();
 fireEvent.change(screen.getByLabelText("员工"),{target:{value:"employee-101"}});
 await screen.findByRole("option",{name:"2090-01-01 · Synthetic departure"});
 fireEvent.change(screen.getByLabelText("离职任职事件"),{target:{value:"event-101"}});
 fireEvent.change(screen.getByLabelText("模板版本"),{target:{value:"version-1"}});
 fireEvent.submit(screen.getByRole("button",{name:"创建清单"}).closest("form")!);
 await waitFor(()=>expect(hrApi.createLifecycleChecklist).toHaveBeenCalledTimes(1));
 expect(vi.mocked(hrApi.createLifecycleChecklist).mock.calls[0]![0]).toEqual(expect.objectContaining({employeeId:"employee-101",employmentEventId:"event-101"}));
});

it("keeps existing checklists visible when the independent employee directory fails",async()=>{
 vi.mocked(hrApi.employees).mockRejectedValue(new Error("synthetic directory failure"));
 render(<HrLifecycleClient/>);
 expect(await screen.findByText(/Existing checklist/)).toBeVisible();
 expect(await screen.findByText(/synthetic directory failure/)).toBeVisible();
 expect(hrApi.lifecycleChecklists).toHaveBeenCalledTimes(1);
});

it("requires an explicit employee before the writer is called",async()=>{
 render(<HrLifecycleClient/>);
 await screen.findByRole("option",{name:/Synthetic template/});
 fireEvent.change(screen.getByLabelText("模板版本"),{target:{value:"version-1"}});
 fireEvent.submit(screen.getByRole("button",{name:"创建清单"}).closest("form")!);
 expect(hrApi.createLifecycleChecklist).not.toHaveBeenCalled();
 expect(await screen.findByText("请明确选择员工后创建清单。")).toBeVisible();
});

it.each(["account","permission","park"])("clears selection and discards late directory/event responses after %s context change",async mode=>{
 let finishDirectory!:(value:ReturnType<typeof candidates>)=>void;
 let finishEvent!:(value:HrEmploymentEvent[])=>void;
 vi.mocked(hrApi.employees).mockImplementationOnce(()=>new Promise(resolve=>{finishDirectory=resolve;}));
 vi.mocked(hrApi.events).mockImplementationOnce(()=>new Promise(resolve=>{finishEvent=resolve;}));
 const view=render(<HrLifecycleClient/>);
 await waitFor(()=>expect(hrApi.employees).toHaveBeenCalledTimes(1));
 const directorySignal=vi.mocked(hrApi.employees).mock.calls[0]![4]!;
 await act(async()=>{finishDirectory(candidates(1,[employee(101)],1));});
 fireEvent.change(screen.getByLabelText("员工"),{target:{value:"employee-101"}});
 const eventSignal=vi.mocked(hrApi.events).mock.calls[0]![2]!;
 state.user=mode==="account"?{...state.user,id:"other"}:mode==="park"?{...state.user,park_id:"park-b"}:{...state.user,permissions:["hr:lifecycle:read","hr:lifecycle:assign"]};
 view.rerender(<HrLifecycleClient/>);
 expect(eventSignal.aborted).toBe(true);
 expect(directorySignal.aborted).toBe(true);
 await act(async()=>{finishEvent([departure]);});
 expect(screen.getByLabelText("员工")).toHaveValue("");
 expect(screen.queryByRole("option",{name:"2090-01-01 · Synthetic departure"})).toBeNull();
});

it("clears form, detail and pending events when employee navigation changes",async()=>{
 let finishEvent!:(value:HrEmploymentEvent[])=>void;
 vi.mocked(hrApi.events).mockImplementationOnce(()=>new Promise(resolve=>{finishEvent=resolve;}));
 const view=render(<HrLifecycleClient employeeId="employee-1"/>);
 await screen.findByRole("option",{name:"Synthetic 1 · SYN-1"});fireEvent.change(screen.getByLabelText("员工"),{target:{value:"employee-1"}});
 fireEvent.change(screen.getByLabelText("模板版本"),{target:{value:"version-1"}});fireEvent.change(screen.getByLabelText("截止日期"),{target:{value:"2090-02-01"}});
 fireEvent.click(screen.getByRole("button",{name:"查看任务"}));await screen.findByText("Synthetic task");
 const signal=vi.mocked(hrApi.events).mock.calls[0]![2]!;view.rerender(<HrLifecycleClient employeeId="employee-2"/>);
 expect(signal.aborted).toBe(true);expect(screen.getByLabelText("员工")).toHaveValue("");expect(screen.getByLabelText("模板版本")).toHaveValue("");expect(screen.getByLabelText("截止日期")).toHaveValue("");expect(screen.queryByText("Synthetic task")).toBeNull();
 await act(async()=>{finishEvent([departure]);});expect(screen.queryByRole("option",{name:"2090-01-01 · Synthetic departure"})).toBeNull();
});

it("checklist paging leaves independent pending templates, assignees and selected employee events running",async()=>{
 let finishTemplates!:(value:HrLifecycleTemplate[])=>void,finishUsers!:(value:{users:HrDirectoryUserOption[];orgs:[]})=>void,finishEvents!:(value:HrEmploymentEvent[])=>void;
 vi.mocked(hrApi.lifecycleTemplateOptions).mockImplementationOnce(()=>new Promise(resolve=>{finishTemplates=resolve;}));
 vi.mocked(hrApi.directoryOptions).mockImplementationOnce(()=>new Promise(resolve=>{finishUsers=resolve;}));
 vi.mocked(hrApi.events).mockImplementationOnce(()=>new Promise(resolve=>{finishEvents=resolve;}));
 vi.mocked(hrApi.lifecycleChecklists).mockImplementation(async(_token,page=1)=>({items:[checklist],page,page_size:20,total:21}));
 render(<HrLifecycleClient/>);await screen.findByRole("option",{name:"Synthetic 1 · SYN-1"});fireEvent.change(screen.getByLabelText("员工"),{target:{value:"employee-1"}});
 const templateSignal=vi.mocked(hrApi.lifecycleTemplateOptions).mock.calls[0]![1]!,userSignal=vi.mocked(hrApi.directoryOptions).mock.calls[0]![1]!,eventSignal=vi.mocked(hrApi.events).mock.calls[0]![2]!;
 fireEvent.click(screen.getByRole("button",{name:"下一页"}));await screen.findByText("第 2 页");
 expect(templateSignal.aborted).toBe(false);expect(userSignal.aborted).toBe(false);expect(eventSignal.aborted).toBe(false);
 await act(async()=>{finishTemplates([template]);finishUsers({users:[{id:"assignee-1",username:"synthetic",displayName:"Synthetic assignee",status:"enabled"}],orgs:[]});finishEvents([departure]);});
 expect(await screen.findByRole("option",{name:/Synthetic template/})).toBeVisible();expect(await screen.findByRole("option",{name:"2090-01-01 · Synthetic departure"})).toBeVisible();expect(screen.getByLabelText("员工")).toHaveValue("employee-1");
 fireEvent.click(screen.getByRole("button",{name:"查看任务"}));expect(await screen.findByRole("option",{name:"Synthetic assignee"})).toBeVisible();
 expect(hrApi.lifecycleTemplateOptions).toHaveBeenCalledTimes(1);expect(hrApi.directoryOptions).toHaveBeenCalledTimes(1);expect(hrApi.events).toHaveBeenCalledTimes(1);
});

it("removes the cancelled detail loading state when paging away from a pending detail",async()=>{
 let finishDetail!:(value:HrLifecycleChecklistDetail)=>void;vi.mocked(hrApi.lifecycleChecklist).mockImplementationOnce(()=>new Promise(resolve=>{finishDetail=resolve;}));
 vi.mocked(hrApi.lifecycleChecklists).mockImplementation(async(_token,page=1)=>({items:[checklist],page,page_size:20,total:21}));
 render(<HrLifecycleClient/>);fireEvent.click(await screen.findByRole("button",{name:"查看任务"}));await screen.findByText("正在加载任务详情…");
 const signal=vi.mocked(hrApi.lifecycleChecklist).mock.calls[0]![2]!;fireEvent.click(screen.getByRole("button",{name:"下一页"}));await screen.findByText("第 2 页");
 expect(signal.aborted).toBe(true);expect(screen.queryByText("正在加载任务详情…")).toBeNull();await act(async()=>{finishDetail(detail);});expect(screen.queryByText("Synthetic task")).toBeNull();
});

it("retries failed independent assignee reads through the visible retry control",async()=>{
 vi.mocked(hrApi.directoryOptions).mockRejectedValueOnce(new Error("synthetic assignee failure")).mockResolvedValue({users:[{id:"assignee-1",username:"synthetic",displayName:"Synthetic assignee",status:"enabled"}],orgs:[]});
 render(<HrLifecycleClient/>);await screen.findByText("synthetic assignee failure");fireEvent.click(screen.getByRole("button",{name:"重试"}));
 await waitFor(()=>expect(hrApi.directoryOptions).toHaveBeenCalledTimes(2));fireEvent.click(await screen.findByRole("button",{name:"查看任务"}));expect(await screen.findByRole("option",{name:"Synthetic assignee"})).toBeVisible();
});
