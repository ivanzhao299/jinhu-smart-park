import {fireEvent,render,screen,waitFor,within} from "@testing-library/react";
import {beforeEach,expect,it,vi} from "vitest";
import {HR_PERMISSIONS as H} from "@jinhu/shared";
import type {HrTalentProfile} from "../../lib/hr-api";
import {hrApi} from "../../lib/hr-api";
import {TalentProfileHistory} from "../../app/hr/talent/TalentProfileHistory";
import {HrTalentClient} from "../../app/hr/talent/HrTalentClient";
const state=vi.hoisted(()=>({user:{id:"operator",parkId:"park-a",permissions:[] as string[]}}));
vi.mock("../../lib/auth-context",()=>({useAuthUser:()=>state.user}));
vi.mock("../../lib/authz",()=>({getAccessToken:()=>"synthetic-token"}));
vi.mock("../../components/auth/PermissionGuard",()=>({PermissionGuard:({children}:{children:React.ReactNode})=>children}));
vi.mock("../../lib/hr-api",()=>({hrApi:{talentProfilePage:vi.fn(),talentProfiles:vi.fn(),talentEmployeeOptions:vi.fn(),talentOptions:vi.fn(),talentSessions:vi.fn(),talentSubjects:vi.fn(),talentSuccession:vi.fn(),developmentPlans:vi.fn(),createTalentProfile:vi.fn()}}));
const row=(number:number):HrTalentProfile=>({id:`profile-${number}`,snapshotNo:number,asOfDate:"2026-09-01",employeeName:`合成人员${number}`,employeeCode:`SYN-${number}`,performanceSource:{finalLevelCode:"A"},feedbackSource:{cycleName:"合成周期"},createdAt:"2026-10-01"});
const page=(items:HrTalentProfile[],number=1,total=61,employeeCount=3)=>({items,page:number,page_size:20,total,employeeCount});
const summary=vi.fn();
beforeEach(()=>{
 vi.resetAllMocks();state.user={id:"operator",parkId:"park-a",permissions:[H.HR_TALENT_READ,H.HR_TALENT_PROFILE_CREATE]};
 vi.mocked(hrApi.talentProfilePage).mockImplementation(async(number,keyword)=>page([row(keyword?601:number)],number,keyword?1:61,keyword?1:3));
 vi.mocked(hrApi.talentEmployeeOptions).mockResolvedValue({items:[{id:"employee-601",fullName:"合成人员601",employeeCode:"SYN-601"}],page:1,page_size:20,total:1});
 vi.mocked(hrApi.talentOptions).mockResolvedValue({employees:[],positions:[]});
 for(const method of ["talentSessions","talentSubjects","talentSuccession","developmentPlans"] as const)vi.mocked(hrApi[method]).mockResolvedValue([]);
});
it("browses older profiles with complete filtered totals and literal search returning employee601",async()=>{
 render(<TalentProfileHistory busy={false} refreshKey={0} onEmployeeCount={summary}/>);await screen.findByText("合成人员1 · SYN-1");expect(screen.getByRole("status")).toHaveTextContent("第 1 / 4 页 · 共 61 条画像 · 涉及 3 人");expect(summary).toHaveBeenLastCalledWith(3);
 fireEvent.click(screen.getByRole("button",{name:"画像下一页"}));await screen.findByText("合成人员2 · SYN-2");expect(screen.queryByText("合成人员1 · SYN-1")).not.toBeInTheDocument();expect(hrApi.talentProfilePage).toHaveBeenLastCalledWith(2,"","synthetic-token",expect.any(AbortSignal));
 fireEvent.change(screen.getByLabelText("搜索人才画像"),{target:{value:" SYN-601 "}});fireEvent.keyDown(screen.getByLabelText("搜索人才画像"),{key:"Enter"});await screen.findByText("合成人员601 · SYN-601");expect(hrApi.talentProfilePage).toHaveBeenLastCalledWith(1,"SYN-601","synthetic-token",expect.any(AbortSignal));expect(summary).toHaveBeenLastCalledWith(1);expect(screen.getByRole("button",{name:"画像下一页"})).toBeDisabled();
});
it("clears failed-page records and counts then retries exactly the same page",async()=>{
 render(<TalentProfileHistory busy={false} refreshKey={0} onEmployeeCount={summary}/>);await screen.findByText("合成人员1 · SYN-1");vi.mocked(hrApi.talentProfilePage).mockRejectedValueOnce(new Error("合成读取失败"));fireEvent.click(screen.getByRole("button",{name:"画像下一页"}));await screen.findByText("合成读取失败");expect(screen.queryByText("合成人员1 · SYN-1")).not.toBeInTheDocument();expect(summary).toHaveBeenLastCalledWith(null);fireEvent.click(screen.getByRole("button",{name:"重试画像"}));await screen.findByText("合成人员2 · SYN-2");expect(hrApi.talentProfilePage).toHaveBeenLastCalledWith(2,"","synthetic-token",expect.any(AbortSignal));expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
it("ignores an aborted older response after search",async()=>{
 let old!:(value:ReturnType<typeof page>)=>void;vi.mocked(hrApi.talentProfilePage).mockReturnValueOnce(new Promise(resolve=>{old=resolve;}));render(<TalentProfileHistory busy={false} refreshKey={0} onEmployeeCount={summary}/>);await waitFor(()=>expect(hrApi.talentProfilePage).toHaveBeenCalled());const signal=vi.mocked(hrApi.talentProfilePage).mock.calls[0]?.[3];fireEvent.change(screen.getByLabelText("搜索人才画像"),{target:{value:"SYN-601"}});fireEvent.click(screen.getByRole("button",{name:"搜索画像"}));await screen.findByText("合成人员601 · SYN-601");old(page([row(1)]));await waitFor(()=>expect(signal?.aborted).toBe(true));expect(screen.queryByText("合成人员1 · SYN-1")).not.toBeInTheDocument();expect(summary).toHaveBeenLastCalledWith(1);
});
it.each([
 {...page([row(1)]),employeeCount:99},{...page([row(1)]),employeeCount:0},page([{...row(1),employeeName:42} as unknown as HrTalentProfile]),page([row(1),row(1)]),page([row(1)],2),{...page([row(1)]),total:-1},{...page([row(1)]),items:Array.from({length:21},(_,n)=>row(n))},page([{...row(1),snapshotNo:0}]),page([{...row(1),performanceSource:[] as unknown as Record<string,unknown>}]),
])("rejects malformed rows, pages and totals without rendering stale records",async(value)=>{
 vi.mocked(hrApi.talentProfilePage).mockResolvedValue(value);render(<TalentProfileHistory busy={false} refreshKey={0} onEmployeeCount={summary}/>);await screen.findByRole("alert");expect(screen.queryByText("合成人员1 · SYN-1")).not.toBeInTheDocument();expect(summary).toHaveBeenLastCalledWith(null);
});
it("keeps active search while refreshing a committed profile and locks controls during writes",async()=>{
 const view=render(<TalentProfileHistory busy={false} refreshKey={0} onEmployeeCount={summary}/>);await screen.findByText("合成人员1 · SYN-1");fireEvent.change(screen.getByLabelText("搜索人才画像"),{target:{value:"SYN-601"}});fireEvent.click(screen.getByRole("button",{name:"搜索画像"}));await screen.findByText("合成人员601 · SYN-601");view.rerender(<TalentProfileHistory busy refreshKey={0} onEmployeeCount={summary}/>);for(const button of screen.getAllByRole("button"))expect(button).toBeDisabled();const count=vi.mocked(hrApi.talentProfilePage).mock.calls.length;view.rerender(<TalentProfileHistory busy={false} refreshKey={1} onEmployeeCount={summary}/>);await waitFor(()=>expect(hrApi.talentProfilePage).toHaveBeenCalledTimes(count+1));expect(hrApi.talentProfilePage).toHaveBeenLastCalledWith(1,"SYN-601","synthetic-token",expect.any(AbortSignal));
});
it("an ancillary read failure leaves independently authorized profile history available",async()=>{
 vi.mocked(hrApi.talentSessions).mockRejectedValue(new Error("合成盘点读取失败"));render(<HrTalentClient/>);await screen.findByText("合成人员1 · SYN-1");await screen.findByText("合成盘点读取失败");expect(hrApi.talentProfiles).not.toHaveBeenCalled();expect(screen.getByRole("region",{name:"人才画像历史"})).toBeInTheDocument();
});
it("failed freeze preserves inputs without refreshing history; committed freeze refreshes once",async()=>{
 vi.mocked(hrApi.createTalentProfile).mockRejectedValueOnce(new Error("合成保存失败"));render(<HrTalentClient/>);await screen.findByText("合成人员1 · SYN-1");fireEvent.click(screen.getByRole("button",{name:"冻结画像"}));await screen.findByRole("option",{name:"合成人员601 · SYN-601"});fireEvent.change(screen.getByLabelText("员工"),{target:{value:"employee-601"}});fireEvent.change(screen.getByLabelText("数据时点"),{target:{value:"2026-09-01"}});fireEvent.submit(screen.getByRole("button",{name:"确认冻结"}).closest("form")!);await screen.findByText("合成保存失败");expect(screen.getByLabelText("数据时点")).toHaveValue("2026-09-01");expect(hrApi.talentProfilePage).toHaveBeenCalledTimes(1);fireEvent.submit(screen.getByRole("button",{name:"确认冻结"}).closest("form")!);await screen.findByText("人才画像已按已确认来源冻结");await waitFor(()=>expect(hrApi.talentProfilePage).toHaveBeenCalledTimes(2));expect(screen.queryByLabelText("数据时点")).not.toBeInTheDocument();
});
it("full context reset aborts profile requests, discards filters and prevents stale publication",async()=>{
 let old!:(value:ReturnType<typeof page>)=>void;vi.mocked(hrApi.talentProfilePage).mockReturnValueOnce(new Promise(resolve=>{old=resolve;}));const view=render(<HrTalentClient/>);await waitFor(()=>expect(hrApi.talentProfilePage).toHaveBeenCalled());const signal=vi.mocked(hrApi.talentProfilePage).mock.calls[0]?.[3];fireEvent.change(screen.getByLabelText("搜索人才画像"),{target:{value:"old draft"}});state.user={...state.user,parkId:"park-b"};view.rerender(<HrTalentClient/>);await screen.findByText("合成人员1 · SYN-1");old(page([row(999)]));await waitFor(()=>expect(signal?.aborted).toBe(true));expect(screen.getByLabelText("搜索人才画像")).toHaveValue("");expect(screen.queryByText("合成人员999 · SYN-999")).not.toBeInTheDocument();
});
it("write-only actors do not request profile history",async()=>{
 state.user.permissions=[H.HR_TALENT_PROFILE_CREATE];render(<HrTalentClient/>);await screen.findByRole("button",{name:"冻结画像"});expect(hrApi.talentProfilePage).not.toHaveBeenCalled();expect(screen.queryByRole("region",{name:"人才画像历史"})).not.toBeInTheDocument();
});
it("the empty filtered set shows zero and no next page",async()=>{
 vi.mocked(hrApi.talentProfilePage).mockResolvedValue(page([],1,0,0));render(<TalentProfileHistory busy={false} refreshKey={0} onEmployeeCount={summary}/>);await screen.findByText("当前条件下没有可见的人才画像。");expect(screen.getByRole("status")).toHaveTextContent("共 0 条画像 · 涉及 0 人");expect(summary).toHaveBeenLastCalledWith(0);expect(within(screen.getByRole("navigation")).getByRole("button",{name:"画像下一页"})).toBeDisabled();
});

it("recovers an out-of-range page after the filtered set shrinks",async()=>{
 vi.mocked(hrApi.talentProfilePage).mockResolvedValueOnce(page([row(1)])).mockResolvedValueOnce(page([],2,1,1)).mockResolvedValueOnce(page([row(1)],1,1,1));render(<TalentProfileHistory busy={false} refreshKey={0} onEmployeeCount={summary}/>);await screen.findByText("合成人员1 · SYN-1");fireEvent.click(screen.getByRole("button",{name:"画像下一页"}));await waitFor(()=>expect(hrApi.talentProfilePage).toHaveBeenCalledTimes(3));expect(hrApi.talentProfilePage).toHaveBeenLastCalledWith(1,"","synthetic-token",expect.any(AbortSignal));await screen.findByText("合成人员1 · SYN-1");expect(screen.getByRole("status")).toHaveTextContent("第 1 / 1 页");
});
