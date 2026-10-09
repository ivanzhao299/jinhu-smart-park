import {useState} from "react";
import {fireEvent,render,screen,waitFor,within} from "@testing-library/react";
import {beforeEach,expect,it,vi} from "vitest";
import {HR_PERMISSIONS as H} from "@jinhu/shared";
import {TalentEmployeePicker} from "../../app/hr/talent/TalentEmployeePicker";
import {HrTalentClient} from "../../app/hr/talent/HrTalentClient";
import type {HrEmployeeOption} from "../../app/hr/components/HrEmployeeSelection";
import {hrApi} from "../../lib/hr-api";
const state=vi.hoisted(()=>({user:{id:"operator",parkId:"park-a",permissions:[] as string[]}}));
vi.mock("../../lib/auth-context",()=>({useAuthUser:()=>state.user}));
vi.mock("../../lib/authz",()=>({getAccessToken:()=>"synthetic-token"}));
vi.mock("../../components/auth/PermissionGuard",()=>({PermissionGuard:({children}:{children:React.ReactNode})=>children}));
vi.mock("../../lib/hr-api",()=>({hrApi:{talentEmployeeOptions:vi.fn(),talentOptions:vi.fn(),talentProfiles:vi.fn(),talentSessions:vi.fn(),talentSubjects:vi.fn(),talentSuccession:vi.fn(),developmentPlans:vi.fn(),createTalentProfile:vi.fn(),createTalentSession:vi.fn(),createSuccessor:vi.fn(),createDevelopmentPlan:vi.fn(),addDevelopmentAction:vi.fn()}}));
const first={id:"employee-1",employeeCode:"SYN-001",fullName:"合成人员1"},later={id:"employee-601",employeeCode:"SYN-601",fullName:"合成人员601"};
const result=(items:HrEmployeeOption[],page=1,total=601)=>({items,page,total,page_size:20});
function Picker({initial=[]}:{initial?:HrEmployeeOption[]}){const [selected,setSelected]=useState(initial);return <form aria-label="合成盘点"><TalentEmployeePicker name="employeeIds" multiple selected={selected} onChange={setSelected} disabled={false}/></form>;}
const choose=async(row=first)=>{await screen.findByRole("option",{name:`${row.fullName} · ${row.employeeCode}`});fireEvent.change(screen.getByLabelText("员工"),{target:{value:row.id}});};
beforeEach(()=>{
 vi.resetAllMocks();state.user={id:"operator",parkId:"park-a",permissions:[H.HR_TALENT_REVIEW]};
 vi.mocked(hrApi.talentEmployeeOptions).mockImplementation(async(page,keyword)=>result(keyword?[later]:[first],page,keyword?1:601));
 for(const method of ["talentProfiles","talentSessions","talentSubjects","talentSuccession","developmentPlans"] as const)vi.mocked(hrApi[method]).mockResolvedValue([]);
 vi.mocked(hrApi.talentOptions).mockResolvedValue({employees:[],positions:[]});
});
it("retains unique original IDs across pages, literal searches and candidate outages, with removal",async()=>{
 render(<Picker/>);await choose();fireEvent.click(screen.getByRole("button",{name:"员工下一页"}));
 await waitFor(()=>expect(hrApi.talentEmployeeOptions).toHaveBeenCalledWith(2,"","synthetic-token",expect.any(AbortSignal)));
 fireEvent.change(screen.getByLabelText("搜索人才员工"),{target:{value:"SYN-601"}});fireEvent.click(screen.getByRole("button",{name:"搜索员工"}));await choose(later);
 const form=screen.getByRole("form",{name:"合成盘点"}) as HTMLFormElement;
 expect(new FormData(form).getAll("employeeIds")).toEqual([first.id,later.id]);await choose(later);expect(new FormData(form).getAll("employeeIds")).toHaveLength(2);
 vi.mocked(hrApi.talentEmployeeOptions).mockRejectedValueOnce(new Error("合成候选故障"));fireEvent.click(screen.getByRole("button",{name:"搜索员工"}));await screen.findByText("合成候选故障");expect(new FormData(form).getAll("employeeIds")).toEqual([first.id,later.id]);
 fireEvent.click(screen.getByRole("button",{name:`移除${first.fullName}`}));expect(new FormData(form).getAll("employeeIds")).toEqual([later.id]);
});
it("keeps the single selected ID after a candidate failure",async()=>{
 function Single(){const [rows,setRows]=useState<HrEmployeeOption[]>([]);return <form aria-label="合成画像"><TalentEmployeePicker name="employeeId" selected={rows} onChange={setRows} disabled={false}/></form>;}
 render(<Single/>);await choose();vi.mocked(hrApi.talentEmployeeOptions).mockRejectedValueOnce(new Error("合成故障"));fireEvent.click(screen.getByRole("button",{name:"员工下一页"}));await screen.findByText("合成故障");expect(screen.getByLabelText("员工")).toHaveValue(first.id);expect(new FormData(screen.getByRole("form") as HTMLFormElement).get("employeeId")).toBe(first.id);
});
it("caps a meeting at500 while the searchable directory reaches601",async()=>{
 render(<Picker initial={Array.from({length:500},(_,n)=>({id:`selected-${n}`,fullName:`已选${n}`,employeeCode:`S-${n}`}))}/>);await choose();await screen.findByText("单次盘点最多选择500人，请分批创建会议。");expect(new FormData(screen.getByRole("form") as HTMLFormElement).getAll("employeeIds")).toHaveLength(500);
});
it.each([result([{...first,fullName:12} as unknown as HrEmployeeOption]),result([first],2),result([first],1,-1)])("rejects a malformed candidate response without discarding selected IDs",async(payload)=>{
 vi.mocked(hrApi.talentEmployeeOptions).mockResolvedValue(payload);render(<Picker initial={[later]}/>);await screen.findByRole("alert");expect(new FormData(screen.getByRole("form") as HTMLFormElement).getAll("employeeIds")).toEqual([later.id]);expect(screen.queryByRole("option",{name:/合成人员1/})).not.toBeInTheDocument();
});
it("operation-only profile authority loads candidates lazily and submits exact employee601 without employee READ",async()=>{
 state.user.permissions=[H.HR_TALENT_PROFILE_CREATE];render(<HrTalentClient/>);await screen.findByRole("button",{name:"冻结画像"});expect(hrApi.talentEmployeeOptions).not.toHaveBeenCalled();expect(hrApi.talentOptions).not.toHaveBeenCalled();fireEvent.click(screen.getByRole("button",{name:"冻结画像"}));
 fireEvent.change(screen.getByLabelText("搜索人才员工"),{target:{value:"SYN-601"}});fireEvent.click(screen.getByRole("button",{name:"搜索员工"}));await choose(later);fireEvent.change(screen.getByLabelText("数据时点"),{target:{value:"2026-10-10"}});
 vi.mocked(hrApi.createTalentProfile).mockRejectedValueOnce(new Error("合成保存失败"));fireEvent.submit(screen.getByRole("button",{name:"确认冻结"}).closest("form")!);await screen.findByText("合成保存失败");expect(screen.getByLabelText("员工")).toHaveValue(later.id);expect(screen.getByLabelText("数据时点")).toHaveValue("2026-10-10");expect(hrApi.createTalentProfile).toHaveBeenCalledWith({employeeId:later.id,asOfDate:"2026-10-10"},"synthetic-token");expect(hrApi.talentProfiles).not.toHaveBeenCalled();
});
it("submits multiple retained meeting IDs and blocks an empty meeting",async()=>{
 render(<HrTalentClient/>);fireEvent.click(await screen.findByRole("button",{name:"新建盘点"}));expect(screen.getByRole("button",{name:"创建会议"})).toBeDisabled();await choose();
 fireEvent.change(screen.getByLabelText("搜索人才员工"),{target:{value:"SYN-601"}});fireEvent.click(screen.getByRole("button",{name:"搜索员工"}));await choose(later);
 for(const [label,value] of [["会议编码","SYN-REVIEW"],["会议名称","合成会议"],["盘点日期","2026-10-10"],["绩效口径","已确认绩效"],["潜力口径","会议综合评估"]])fireEvent.change(screen.getByLabelText(label!),{target:{value}});
 fireEvent.submit(screen.getByRole("button",{name:"创建会议"}).closest("form")!);await waitFor(()=>expect(hrApi.createTalentSession).toHaveBeenCalledWith(expect.objectContaining({employeeIds:[first.id,later.id]}),"synthetic-token"));
});
it("resets drafts and aborts old candidate reads when park context changes",async()=>{
 state.user.permissions=[H.HR_TALENT_PROFILE_CREATE];const view=render(<HrTalentClient/>);fireEvent.click(await screen.findByRole("button",{name:"冻结画像"}));await choose();const signal=vi.mocked(hrApi.talentEmployeeOptions).mock.calls[0]?.[3];state.user={...state.user,parkId:"park-b"};view.rerender(<HrTalentClient/>);await waitFor(()=>expect(screen.queryByLabelText("数据时点")).not.toBeInTheDocument());expect(signal?.aborted).toBe(true);fireEvent.click(screen.getByRole("button",{name:"冻结画像"}));await screen.findByLabelText("员工");expect(screen.getByLabelText("员工")).toHaveValue("");
});
it("loads action owner candidates only on disclosure and keeps independent plan forms",async()=>{
 state.user.permissions=[H.HR_DEVELOPMENT_MANAGE];vi.mocked(hrApi.developmentPlans).mockResolvedValue(["a","b"].map(id=>({id,planCode:id,planName:`合成计划${id}`,developmentGoal:"实操",startDate:"2026-10-10",endDate:"2026-12-31",status:"active",employeeName:"合成人员",actions:[]})));
 render(<HrTalentClient/>);await screen.findByText(/合成计划a ·/);expect(hrApi.talentEmployeeOptions).not.toHaveBeenCalled();const card=screen.getByText(/合成计划a ·/).closest("article")!;const disclosure=card.querySelector("details")!;disclosure.open=true;fireEvent(disclosure,new Event("toggle"));await choose();
 const otherCard=screen.getByText(/合成计划b ·/).closest("article")!;const otherDisclosure=otherCard.querySelector("details")!;otherDisclosure.open=true;fireEvent(otherDisclosure,new Event("toggle"));await within(otherCard).findByRole("option",{name:`${first.fullName} · ${first.employeeCode}`});fireEvent.change(within(otherCard).getByLabelText("员工"),{target:{value:first.id}});
 fireEvent.change(within(card).getByPlaceholderText("行动名称"),{target:{value:"完成实操"}});const form=within(card).getByRole("button",{name:"添加"}).closest("form")!;fireEvent.change(form.querySelector('[name="dueDate"]')!,{target:{value:"2026-12-01"}});fireEvent.submit(form);await waitFor(()=>expect(hrApi.addDevelopmentAction).toHaveBeenCalledWith("a",{actionName:"完成实操",ownerEmployeeId:first.id,dueDate:"2026-12-01"},"synthetic-token"));expect(otherCard.querySelector<HTMLInputElement>('[name="ownerEmployeeId"]')?.value).toBe(first.id);expect(card.querySelector('[name="ownerEmployeeId"]')).toBeNull();
});
it("read-only actors issue no employee candidate or compatibility option reads",async()=>{
 state.user.permissions=[H.HR_TALENT_READ];render(<HrTalentClient/>);await waitFor(()=>expect(hrApi.talentProfiles).toHaveBeenCalled());expect(hrApi.talentEmployeeOptions).not.toHaveBeenCalled();expect(hrApi.talentOptions).not.toHaveBeenCalled();
});
it("succession-only management submits the searched candidate ID with assessment evidence",async()=>{
 state.user.permissions=[H.HR_SUCCESSION_MANAGE];vi.mocked(hrApi.talentSuccession).mockResolvedValue([{criticalPositionId:"position-a",positionName:"合成关键岗位",criticality:"critical",positionRisk:"high",candidateName:null,employeeCode:null,readiness:null,candidateRisk:null,riskReason:null,assessedAt:null}]);
 render(<HrTalentClient/>);fireEvent.click(await screen.findByRole("button",{name:"评估候选"}));await choose();fireEvent.change(screen.getByLabelText("关键岗位"),{target:{value:"position-a"}});fireEvent.change(screen.getByLabelText("风险与证据说明"),{target:{value:"合成评估依据"}});fireEvent.submit(screen.getByRole("button",{name:"保存候选版本"}).closest("form")!);await waitFor(()=>expect(hrApi.createSuccessor).toHaveBeenCalledWith(expect.objectContaining({employeeId:first.id,criticalPositionId:"position-a",evidence:[{type:"assessment_record",note:"合成评估依据"}]}),"synthetic-token"));expect(hrApi.talentProfiles).not.toHaveBeenCalled();
});
it("development-only management submits the selected employee and original plan inputs",async()=>{
 state.user.permissions=[H.HR_DEVELOPMENT_MANAGE];render(<HrTalentClient/>);fireEvent.click(await screen.findByRole("button",{name:"新建发展计划"}));await choose();
 for(const [label,value] of [["计划编码","SYN-P"],["计划名称","合成发展"],["发展目标","完成业务实操"],["开始日期","2026-10-10"],["结束日期","2026-12-31"]])fireEvent.change(screen.getByLabelText(label!),{target:{value}});
 const form=screen.getByLabelText("计划编码").closest("form")!;fireEvent.submit(form);await waitFor(()=>expect(hrApi.createDevelopmentPlan).toHaveBeenCalledWith({employeeId:first.id,planCode:"SYN-P",planName:"合成发展",developmentGoal:"完成业务实操",startDate:"2026-10-10",endDate:"2026-12-31"},"synthetic-token"));expect(hrApi.talentOptions).not.toHaveBeenCalled();
});
it("ignores an older candidate response after a new literal search",async()=>{
 let resolveOld!:(value:ReturnType<typeof result>)=>void;
 vi.mocked(hrApi.talentEmployeeOptions).mockReturnValueOnce(new Promise(resolve=>{resolveOld=resolve;}));render(<Picker/>);await waitFor(()=>expect(hrApi.talentEmployeeOptions).toHaveBeenCalled());const signal=vi.mocked(hrApi.talentEmployeeOptions).mock.calls[0]?.[3];fireEvent.change(screen.getByLabelText("搜索人才员工"),{target:{value:"SYN-601"}});fireEvent.click(screen.getByRole("button",{name:"搜索员工"}));await choose(later);resolveOld(result([first]));await waitFor(()=>expect(signal?.aborted).toBe(true));expect(screen.queryByRole("option",{name:`${first.fullName} · ${first.employeeCode}`})).not.toBeInTheDocument();expect(new FormData(screen.getByRole("form") as HTMLFormElement).getAll("employeeIds")).toEqual([later.id]);
});
