import {act,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {StrictMode} from "react";
import {beforeEach,expect,it,vi} from "vitest";
import {HR_PERMISSIONS as H,type PaginatedResult} from "@jinhu/shared";
import {HrPerformanceLegacyPanel} from "../../app/hr/performance/HrPerformanceLegacyPanel";
import type {HrPerformanceLegacyRubric,HrPerformanceLegacyTemplate} from "../../lib/hr-api";

const state=vi.hoisted(()=>({user:{id:"reader",tenant_id:"tenant",park_id:"park",permissions:[] as string[]},api:{performanceLegacyTemplates:vi.fn(),performanceLegacyLevels:vi.fn(),performanceLegacyDimensions:vi.fn(),performanceLegacyGuides:vi.fn(),performanceLegacyResults:vi.fn(),performanceLegacyMasters:vi.fn(),performanceLegacyRubric:vi.fn()}}));
vi.mock("../../lib/auth-context",()=>({useAuthUser:()=>state.user}));
vi.mock("../../lib/authz",()=>({getAccessToken:()=>"synthetic-token"}));
vi.mock("../../lib/hr-api",()=>({hrApi:state.api}));

const page=<T,>(items:T[],page=1,total=items.length):PaginatedResult<T>=>({items,page,page_size:20,total});
const template=(id:string,assessment:number,name:string|null):HrPerformanceLegacyTemplate=>({id,sourceAssessment:assessment,sourceAssessmentName:name,sourceDepartment:null,sourceMPercent:null,sourceTPercent:null,sourceXPercent:null,sourceCPercent:null,sourceSPercent:null,sourceTimekeep:null,sourceBonus:null,sourceMaster:null,targetTemplateId:null,targetTemplateVersionId:null});
const rubric=(id:number):HrPerformanceLegacyRubric=>({sourceAssessmentId:id,levels:[],items:[{sourceItemId:id,sourceItemName:`项目${id}`,sourceFullValue:"100",sourceMyOrder:1,descriptions:{}}]});

beforeEach(()=>{
 vi.resetAllMocks();state.user={id:"reader",tenant_id:"tenant",park_id:"park",permissions:[H.HR_PERFORMANCE_TEMPLATE_READ]};
 state.api.performanceLegacyTemplates.mockResolvedValue(page([template("template-zero",0,"零号考核表"),template("template-four",4,"四号考核表")]));
 state.api.performanceLegacyLevels.mockResolvedValue(page([]));state.api.performanceLegacyDimensions.mockResolvedValue(page([]));state.api.performanceLegacyGuides.mockResolvedValue(page([]));state.api.performanceLegacyResults.mockResolvedValue(page([]));state.api.performanceLegacyMasters.mockResolvedValue(page([]));state.api.performanceLegacyRubric.mockImplementation((id:number)=>Promise.resolve(rubric(id)));
});

it("opens a template's exact captured zero-valued assessment and retains its selected business context",async()=>{
 render(<HrPerformanceLegacyPanel/>);await screen.findAllByRole("button",{name:"查看评分标准"});fireEvent.click(screen.getAllByRole("button",{name:"查看评分标准"})[0]!);
 await screen.findByText("当前考核表 零号考核表 · #0");expect(screen.getByLabelText("考核表编号")).toHaveValue(0);expect(state.api.performanceLegacyRubric).toHaveBeenCalledWith(0,"synthetic-token",expect.any(AbortSignal));await screen.findAllByText("项目0");
});

it("does not invent a rubric request for users without definition read access",async()=>{
 state.user.permissions=[H.HR_PERFORMANCE_READ];render(<HrPerformanceLegacyPanel/>);await waitFor(()=>expect(state.api.performanceLegacyResults).toHaveBeenCalled());
 expect(state.api.performanceLegacyTemplates).not.toHaveBeenCalled();expect(state.api.performanceLegacyRubric).not.toHaveBeenCalled();expect(screen.queryByRole("button",{name:"查看评分标准"})).toBeNull();
});

it("aborts a quick template switch and discards the late old rubric response",async()=>{
 let finishOld!:(value:HrPerformanceLegacyRubric)=>void;state.api.performanceLegacyRubric.mockImplementationOnce(()=>new Promise(resolve=>{finishOld=resolve;})).mockResolvedValueOnce(rubric(4));
 render(<HrPerformanceLegacyPanel/>);await screen.findAllByRole("button",{name:"查看评分标准"});const buttons=screen.getAllByRole("button",{name:"查看评分标准"});fireEvent.click(buttons[0]!);const oldSignal=state.api.performanceLegacyRubric.mock.calls[0]![2] as AbortSignal;fireEvent.click(buttons[1]!);
 expect(oldSignal.aborted).toBe(true);await screen.findByText("当前考核表 四号考核表 · #4");await screen.findAllByText("项目4");await act(async()=>finishOld(rubric(0)));expect(screen.queryAllByText("项目0")).toHaveLength(0);
});

it("keeps the same selected target available for retry after a rubric failure",async()=>{
 state.api.performanceLegacyRubric.mockRejectedValueOnce(new Error("temporary failure")).mockResolvedValueOnce(rubric(4));render(<HrPerformanceLegacyPanel/>);await screen.findAllByRole("button",{name:"查看评分标准"});fireEvent.click(screen.getAllByRole("button",{name:"查看评分标准"})[1]!);
 await screen.findByText("temporary failure");expect(screen.getByText("当前考核表 四号考核表 · #4")).toBeVisible();expect(screen.getByLabelText("考核表编号")).toHaveValue(4);fireEvent.click(screen.getAllByRole("button",{name:"查看评分标准"}).at(-1)!);await screen.findAllByText("项目4");expect(state.api.performanceLegacyRubric.mock.calls.map(call=>call[0])).toEqual([4,4]);
});

it("clears and reenables a pending rubric when the template page changes",async()=>{
 state.api.performanceLegacyTemplates.mockResolvedValue(page([template("template-zero",0,"零号考核表")],1,21));state.api.performanceLegacyRubric.mockImplementationOnce(()=>new Promise(()=>{}));render(<HrPerformanceLegacyPanel/>);await screen.findAllByRole("button",{name:"查看评分标准"});fireEvent.click(screen.getAllByRole("button",{name:"查看评分标准"})[0]!);const signal=state.api.performanceLegacyRubric.mock.calls[0]![2] as AbortSignal;fireEvent.click(screen.getByRole("button",{name:"下一页"}));expect(signal.aborted).toBe(true);await waitFor(()=>expect(screen.getAllByRole("button",{name:"查看评分标准"}).at(-1)).toBeEnabled());expect(screen.queryByText(/当前考核表/)).toBeNull();
});

it("clears a selected rubric when a result batch query replaces the current view",async()=>{
 state.user.permissions=[H.HR_PERFORMANCE_TEMPLATE_READ,H.HR_PERFORMANCE_READ];state.api.performanceLegacyRubric.mockImplementationOnce(()=>new Promise(()=>{}));render(<HrPerformanceLegacyPanel/>);await screen.findAllByRole("button",{name:"查看评分标准"});fireEvent.click(screen.getAllByRole("button",{name:"查看评分标准"})[0]!);const signal=state.api.performanceLegacyRubric.mock.calls[0]![2] as AbortSignal;fireEvent.click(screen.getByRole("tab",{name:"历史结果"}));const batch=await screen.findByLabelText("考核批次（可选）");fireEvent.change(batch,{target:{value:"7"}});fireEvent.click(screen.getByRole("button",{name:"查询"}));expect(signal.aborted).toBe(true);await waitFor(()=>expect(screen.queryByText(/当前考核表/)).toBeNull());
});

it("rejects an invalid manual identifier by cancelling the selected request and context",async()=>{
 state.api.performanceLegacyRubric.mockImplementationOnce(()=>new Promise(()=>{}));render(<HrPerformanceLegacyPanel/>);await screen.findAllByRole("button",{name:"查看评分标准"});fireEvent.click(screen.getAllByRole("button",{name:"查看评分标准"})[0]!);const signal=state.api.performanceLegacyRubric.mock.calls[0]![2] as AbortSignal;fireEvent.change(screen.getByLabelText("考核表编号"),{target:{value:"-1"}});expect(signal.aborted).toBe(true);expect(screen.queryByText(/当前考核表/)).toBeNull();const manual=screen.getAllByRole("button",{name:"查看评分标准"}).at(-1)!;expect(manual).toBeEnabled();fireEvent.click(manual);await screen.findByText("请输入 0 至 2147483647 之间的整数编号。");
});

it("does not turn a missing assessment into zero and aborts the selected request on context replacement",async()=>{
 let finish!:(value:HrPerformanceLegacyRubric)=>void;state.api.performanceLegacyTemplates.mockResolvedValue(page([{...template("missing",0,"缺少编号"),sourceAssessment:undefined} as unknown as HrPerformanceLegacyTemplate,template("template-four",4,"四号考核表")]));state.api.performanceLegacyRubric.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));const view=render(<HrPerformanceLegacyPanel/>);await screen.findAllByRole("button",{name:"查看评分标准"});expect(screen.getAllByRole("button",{name:"查看评分标准"})).toHaveLength(2);fireEvent.click(screen.getAllByRole("button",{name:"查看评分标准"})[0]!);const signal=state.api.performanceLegacyRubric.mock.calls[0]![2] as AbortSignal;state.user={...state.user,park_id:"other"};view.rerender(<HrPerformanceLegacyPanel/>);expect(signal.aborted).toBe(true);await act(async()=>finish(rubric(4)));expect(screen.queryAllByText("项目4")).toHaveLength(0);
});

it("preserves the payroll permission boundary for result summaries",async()=>{
 const master={id:"master",sourceMasterId:1,sourceSessionId:1,sourcePersonCode:"P",sourceSelfGrade:null,sourceAssGrade:null,sourceSelfValue:null,sourceItemValue:null,sourceMItemValue:null,sourceXItemValue:null,sourceCItemValue:null,sourceMasterValue:null,sourceTimekeepValue:null,sourceBonusValue:null,sourceTotalValue:null,sourceSelfAppraisal:null,sourceAppraisal:null,sourcePay:"987.65",sourceAssessmentPerson:null,sourceRecordedAt:null,sourceOperatorCode:null,sourceDescription:null,legacyTemplateProfileId:null,targetCycleEmployeeId:null,targetTemplateVersionId:null,calculatedTotal:null,expectedAssGrade:null,winningMinValue:null,winningCandidateCount:0,parityStatus:"MATCH" as const};
 state.user.permissions=[H.HR_PERFORMANCE_READ];state.api.performanceLegacyMasters.mockResolvedValue(page([master]));const view=render(<HrPerformanceLegacyPanel/>);fireEvent.click(await screen.findByRole("tab",{name:"汇总与总分"}));await screen.findByText("批次 1 · 人员 P");fireEvent.click(screen.getByText("批次 1 · 人员 P"));expect(screen.queryByText("绩效金额（按工资权限）")).toBeNull();state.user={...state.user,permissions:[H.HR_PERFORMANCE_READ,H.HR_PAYROLL_DETAIL_READ]};view.rerender(<HrPerformanceLegacyPanel/>);fireEvent.click(await screen.findByRole("tab",{name:"汇总与总分"}));fireEvent.click(await screen.findByText("批次 1 · 人员 P"));expect(screen.getByText("绩效金额（按工资权限）")).toBeVisible();expect(screen.getByText("987.65")).toBeVisible();
});

it("remains usable after StrictMode effect replay",async()=>{
 render(<StrictMode><HrPerformanceLegacyPanel/></StrictMode>);await screen.findAllByRole("button",{name:"查看评分标准"});fireEvent.click(screen.getAllByRole("button",{name:"查看评分标准"})[0]!);await screen.findByText("当前考核表 零号考核表 · #0");await screen.findAllByText("项目0");expect(state.api.performanceLegacyRubric).toHaveBeenLastCalledWith(0,"synthetic-token",expect.any(AbortSignal));
});
