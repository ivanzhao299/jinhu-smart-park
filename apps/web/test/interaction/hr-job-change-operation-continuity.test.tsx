import {act,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {beforeEach,expect,it,vi} from "vitest";
import {JobChangeApplicationsPanel} from "../../app/hr/lifecycle/JobChangeApplicationsPanel";
import {hrApi,type HrJobChangeApplication} from "../../lib/hr-api";

const state=vi.hoisted(()=>({user:{id:"actor",park_id:"park-a",permissions:["hr:job_change:read","hr:job_change:manage","hr:job_change:apply"]}}));
vi.mock("../../lib/auth-context",()=>({useAuthUser:()=>state.user}));
vi.mock("../../lib/authz",()=>({getAccessToken:()=>"synthetic-token"}));
vi.mock("../../lib/hr-api",()=>({hrApi:{jobChangeApplications:vi.fn(),jobChangeOptions:vi.fn(),createJobChangeApplication:vi.fn(),updateJobChangeApplication:vi.fn(),jobChangeApplicationAction:vi.fn(),reviewJobChangeApplication:vi.fn(),applyJobChangeApplication:vi.fn()}}));
const row=(n:number,status="draft",effectiveDate="2090-01-01"):HrJobChangeApplication=>({id:`application-${n}`,applicationNo:`SYN-${n}`,applicationName:`Change ${n}`,employeeId:`employee-${n}`,employeeCode:`SYN-${n}`,employeeName:`Synthetic ${n}`,applicationDate:"2090-01-01",effectiveDate,changeType:"transfer",beforeOrgId:"old-org",beforeOrgName:"Old",beforePositionId:null,beforePositionName:null,afterOrgId:"new-org",afterOrgName:"New",afterPositionId:null,afterPositionName:null,reason:"Synthetic change",status,reviewComment:null,reviewedAt:null,appliedAt:null});
const list=(page=1,items=Array.from({length:20},(_,i)=>row((page-1)*20+i+1)),total=51)=>({items,page,page_size:20,total});
const options={employees:[{id:"employee-1",employeeCode:"SYN-1",employeeName:"Synthetic 1",orgId:"old-org",orgName:"Old",positionId:null,positionName:null}],orgs:[{id:"new-org",orgName:"New"}],positions:[]};

beforeEach(()=>{vi.clearAllMocks();state.user={id:"actor",park_id:"park-a",permissions:["hr:job_change:read","hr:job_change:manage","hr:job_change:apply"]};vi.mocked(hrApi.jobChangeApplications).mockImplementation(async(_token,page=1)=>list(page));vi.mocked(hrApi.jobChangeOptions).mockResolvedValue(options);vi.mocked(hrApi.createJobChangeApplication).mockResolvedValue(row(1));vi.mocked(hrApi.updateJobChangeApplication).mockResolvedValue(row(1));});

it("pages past application50 and renders desktop cards with a scoped grid class",async()=>{
 render(<JobChangeApplicationsPanel/>);
 await screen.findByText(/Synthetic 1 · 草稿/);
 const records=screen.getByText(/Synthetic 1 · 草稿/).closest(".ds-mobile-record-list");
 expect(records?.className).toMatch(/checklistRecords/);
 fireEvent.click(screen.getByRole("navigation",{name:"岗位变更申请分页"}).querySelectorAll("button")[1]!);
 await screen.findByText(/Synthetic 21 · 草稿/);
 fireEvent.click(screen.getByRole("navigation",{name:"岗位变更申请分页"}).querySelectorAll("button")[1]!);
 await screen.findByText(/Synthetic 51 · 草稿/);
 expect(hrApi.jobChangeApplications).toHaveBeenLastCalledWith("synthetic-token",3,20,undefined,expect.any(AbortSignal));
});

it("keeps the application list when independent options fail and retries both reads",async()=>{
 vi.mocked(hrApi.jobChangeOptions).mockRejectedValueOnce(new Error("Synthetic options failure"));
 render(<JobChangeApplicationsPanel/>);
 expect(await screen.findByText(/Synthetic 1 · 草稿/)).toBeVisible();
 expect(await screen.findByText(/Synthetic options failure/)).toBeVisible();
 fireEvent.click(screen.getAllByRole("button",{name:"修改"})[0]!);
 expect(screen.getByLabelText("员工")).toHaveValue("employee-1");
 expect(screen.getByLabelText("调整后部门")).toHaveValue("new-org");
 fireEvent.click(screen.getByRole("button",{name:"重试申请和基础数据"}));
 await waitFor(()=>expect(hrApi.jobChangeOptions).toHaveBeenCalledTimes(2));
 expect(screen.getByText(/Synthetic 1 · 草稿/)).toBeVisible();
});

it("retries a failed page and returns to page1 when the server total shrinks",async()=>{
 vi.mocked(hrApi.jobChangeApplications).mockRejectedValueOnce(new Error("Synthetic list failure"));
 render(<JobChangeApplicationsPanel/>);
 expect(await screen.findByText(/Synthetic list failure/)).toBeVisible();
 fireEvent.click(screen.getByRole("button",{name:"重试申请和基础数据"}));
 await screen.findByText(/Synthetic 1 · 草稿/);
 fireEvent.click(screen.getByRole("navigation",{name:"岗位变更申请分页"}).querySelectorAll("button")[1]!);
 await screen.findByText(/Synthetic 21 · 草稿/);
 vi.mocked(hrApi.jobChangeApplications).mockResolvedValueOnce(list(3,[],1)).mockResolvedValueOnce(list(1,[row(1)],1));
 fireEvent.click(screen.getByRole("navigation",{name:"岗位变更申请分页"}).querySelectorAll("button")[1]!);
 await screen.findByText("第 1 / 1 页 · 共 1 条");
 expect(vi.mocked(hrApi.jobChangeApplications).mock.calls.slice(-2).map(call=>call[1])).toEqual([3,1]);
});

it("uses Shanghai business day for default dates and the approved apply gate",async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date("2026-07-24T16:30:00Z"));
 try{
  vi.mocked(hrApi.jobChangeApplications).mockResolvedValue(list(1,[row(1,"approved","2026-07-25"),row(2,"approved","2026-07-26")],2));
  render(<JobChangeApplicationsPanel/>);
  await act(async()=>{});
  expect(screen.getByLabelText("申请日期")).toHaveValue("2026-07-25");
  expect(screen.getByLabelText("生效日期")).toHaveValue("2026-07-25");
  const buttons=screen.getAllByRole("button",{name:"生效变更"});
  expect(buttons[0]).toBeEnabled();expect(buttons[1]).toBeDisabled();
 }finally{vi.useRealTimers();}
});

it("aborts a late old-park list and clears old edit state on full context replacement",async()=>{
 vi.mocked(hrApi.jobChangeApplications).mockResolvedValueOnce(list(1,[row(1)],51));
 const view=render(<JobChangeApplicationsPanel/>);
 fireEvent.click(await screen.findByRole("button",{name:"修改"}));
 expect(screen.getByRole("button",{name:"保存修改"})).toBeVisible();
 let finish!:(value:ReturnType<typeof list>)=>void;
 vi.mocked(hrApi.jobChangeApplications).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 fireEvent.click(screen.getByRole("navigation",{name:"岗位变更申请分页"}).querySelectorAll("button")[1]!);
 // A normal list reload is also possible through a page transition; the context change must cancel either request.
 await waitFor(()=>expect(hrApi.jobChangeApplications).toHaveBeenCalledTimes(2));
 const signal=vi.mocked(hrApi.jobChangeApplications).mock.calls[1]![4]!;
 state.user={...state.user,park_id:"park-b"};view.rerender(<JobChangeApplicationsPanel/>);
 expect(signal.aborted).toBe(true);
 await act(async()=>finish(list(1,[row(999)],1)));
 expect(screen.queryByText(/Synthetic 999 · 草稿/)).toBeNull();
 expect(screen.queryByRole("button",{name:"保存修改"})).toBeNull();
});

it("preserves the authorized employee and original organization/position on save despite option failure",async()=>{
 const original={...row(51),afterPositionId:"original-position",afterPositionName:"Original position"};
 vi.mocked(hrApi.jobChangeApplications).mockResolvedValue(list(1,[original],1));vi.mocked(hrApi.jobChangeOptions).mockRejectedValue(new Error("Synthetic options failure"));
 render(<JobChangeApplicationsPanel/>);fireEvent.click(await screen.findByRole("button",{name:"修改"}));await screen.findByText("Synthetic options failure");
 expect(screen.getByLabelText("调整后岗位")).toHaveValue("original-position");fireEvent.submit(screen.getByRole("button",{name:"保存修改"}).closest("form")!);
 await waitFor(()=>expect(hrApi.updateJobChangeApplication).toHaveBeenCalledTimes(1));expect(vi.mocked(hrApi.updateJobChangeApplication).mock.calls[0]).toEqual(["application-51",expect.objectContaining({employeeId:"employee-51",afterOrgId:"new-org",afterPositionId:"original-position"}),"synthetic-token"]);
});

it("clears an original position on explicit organization change and restores it only when returning to its original organization",async()=>{
 const original={...row(1),afterPositionId:"original-position",afterPositionName:"Original position"};
 vi.mocked(hrApi.jobChangeApplications).mockResolvedValue(list(1,[original],1));vi.mocked(hrApi.jobChangeOptions).mockResolvedValue({...options,orgs:[...options.orgs,{id:"other-org",orgName:"Other"}],positions:[{id:"other-position",orgId:"other-org",positionCode:"OTHER",positionName:"Other position"}]});
 render(<JobChangeApplicationsPanel/>);fireEvent.click(await screen.findByRole("button",{name:"修改"}));expect(screen.getByLabelText("调整后岗位")).toHaveValue("original-position");
 fireEvent.change(screen.getByLabelText("调整后部门"),{target:{value:"other-org"}});expect(screen.getByLabelText("调整后岗位")).toHaveValue("");expect(screen.queryByRole("option",{name:/Original position/})).toBeNull();
 fireEvent.change(screen.getByLabelText("调整后部门"),{target:{value:"new-org"}});expect(screen.getByLabelText("调整后岗位")).toHaveValue("original-position");
 fireEvent.change(screen.getByLabelText("调整后部门"),{target:{value:"other-org"}});fireEvent.change(screen.getByLabelText("调整后岗位"),{target:{value:"other-position"}});fireEvent.submit(screen.getByRole("button",{name:"保存修改"}).closest("form")!);
 await waitFor(()=>expect(hrApi.updateJobChangeApplication).toHaveBeenCalledTimes(1));expect(vi.mocked(hrApi.updateJobChangeApplication).mock.calls[0]![1]).toEqual(expect.objectContaining({afterOrgId:"other-org",afterPositionId:"other-position"}));
});

it("keeps an edited application name and target after a rejected save for correction",async()=>{
 vi.mocked(hrApi.jobChangeApplications).mockResolvedValue(list(1,[row(1)],1));vi.mocked(hrApi.updateJobChangeApplication).mockRejectedValue(new Error("Synthetic conflict"));
 render(<JobChangeApplicationsPanel/>);fireEvent.click(await screen.findByRole("button",{name:"修改"}));fireEvent.change(screen.getByLabelText("申请名称"),{target:{value:"Corrected name"}});fireEvent.submit(screen.getByRole("button",{name:"保存修改"}).closest("form")!);
 await screen.findByText("Synthetic conflict");await act(async()=>{});expect(screen.getByLabelText("申请名称")).toHaveValue("Corrected name");expect(screen.getByLabelText("员工")).toHaveValue("employee-1");
});
