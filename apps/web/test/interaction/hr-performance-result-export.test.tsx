import {act,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {beforeEach,expect,it,vi} from "vitest";
import {HR_PERMISSIONS as H} from "@jinhu/shared";
import {HrPerformanceClient} from "../../app/hr/performance/HrPerformanceClient";
import type {HrPerformanceReviewPage,HrPerformanceReviewV2} from "../../lib/hr-api";

const state=vi.hoisted(()=>({user:{id:"actor",park_id:"park",permissions:[] as string[]},api:{performanceCyclesV2:vi.fn(),performanceReviewPageV2:vi.fn(),submitPerformanceSelfReviewV2:vi.fn()}}));
vi.mock("../../lib/auth-context",()=>({useAuthUser:()=>state.user}));vi.mock("../../lib/authz",()=>({getAccessToken:()=>"synthetic-token"}));vi.mock("../../lib/hr-api",()=>({hrApi:state.api}));vi.mock("../../components/auth/PermissionGuard",()=>({PermissionGuard:({children}:{children:React.ReactNode})=><>{children}</>}));
vi.mock("../../app/hr/performance/PerformanceTemplates",()=>({PerformanceTemplates:()=>null}));
vi.mock("../../app/hr/performance/HrPerformanceLegacyPanel",()=>({HrPerformanceLegacyPanel:()=>null}));
vi.mock("../../app/hr/performance/HrPerformanceLegacyRelationsPanel",()=>({HrPerformanceLegacyRelationsPanel:()=>null}));
vi.mock("../../app/hr/performance/HrPerformanceLegacyPersonSummaryPanel",()=>({HrPerformanceLegacyPersonSummaryPanel:()=>null}));
vi.mock("../../app/hr/performance/HrPerformanceLegacyAssessmentMasterPanel",()=>({HrPerformanceLegacyAssessmentMasterPanel:()=>null}));
vi.mock("../../app/hr/performance/HrPerformanceLegacyAssessmentValuePanel",()=>({HrPerformanceLegacyAssessmentValuePanel:()=>null}));
vi.mock("../../app/hr/performance/HrPerformanceLegacyAssessmentValueOfPersonPanel",()=>({HrPerformanceLegacyAssessmentValueOfPersonPanel:()=>null}));
vi.mock("../../app/hr/performance/HrPerformanceLegacyWebAssQueryPanel",()=>({HrPerformanceLegacyWebAssQueryPanel:()=>null}));

const row=(n:number):HrPerformanceReviewV2=>({id:`review-${n}`,cycleId:"cycle",cycleName:"合成周期",status:"self_review",employee:{id:`employee-${n}`,code:`E-${n}`,name:`合成员工${n}`},dimensions:[{code:"work",name:"工作质量",weight:"1",scoreMin:"0",scoreMax:"100"}],selfSubmission:{scores:{work:0},comments:{work:"自评"},score:"0"},managerSubmission:{scores:{work:80},comments:{work:"主管"},score:"80"},calibration:{scores:{work:90},score:"90"},result:{score:"90",levelCode:"A",levelName:"优秀"},appeal:null,actions:{selfReview:true,managerReview:false,acknowledge:false,appeal:false,resolveAppeal:false}});
const page=(pageNumber:number,pageSize:number,total=101):HrPerformanceReviewPage=>({page:pageNumber,pageSize,total,pending:total,confirmed:0,items:Array.from({length:Math.max(0,Math.min(pageSize,total-(pageNumber-1)*pageSize))},(_,index)=>row((pageNumber-1)*pageSize+index+1))});

beforeEach(()=>{vi.resetAllMocks();state.user={id:"actor",park_id:"park",permissions:[H.HR_PERFORMANCE_PAGE,H.HR_PERFORMANCE_SELF_READ,H.HR_PERFORMANCE_SELF_REVIEW]};state.api.performanceCyclesV2.mockResolvedValue([{id:"cycle",cycleName:"合成周期"}]);state.api.performanceReviewPageV2.mockImplementation(async(query:{page:number;pageSize?:number})=>page(query.page,query.pageSize??30));state.api.submitPerformanceSelfReviewV2.mockResolvedValue({});Object.defineProperty(URL,"createObjectURL",{configurable:true,value:vi.fn(()=>"blob:synthetic")});Object.defineProperty(URL,"revokeObjectURL",{configurable:true,value:vi.fn()});vi.spyOn(HTMLAnchorElement.prototype,"click").mockImplementation(()=>{});});

it("exports all 101 matching reviews with the active cycle/status filter and a first-page recheck",async()=>{
 render(<HrPerformanceClient/>);await screen.findByText("合成员工1");fireEvent.change(screen.getByLabelText("评价状态"),{target:{value:"self_review"}});const exportButton=await screen.findByRole("button",{name:"导出筛选绩效评价"});await waitFor(()=>expect(vi.mocked(state.api.performanceReviewPageV2)).toHaveBeenLastCalledWith(expect.objectContaining({pageSize:30,status:"self_review"}),"synthetic-token",expect.any(AbortSignal)));await waitFor(()=>expect(exportButton).toBeEnabled());fireEvent.click(exportButton);
 await waitFor(()=>expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1));
 const exportCalls=vi.mocked(state.api.performanceReviewPageV2).mock.calls.filter(([query])=>query.pageSize===100);
 expect(exportCalls.map(([query])=>query.page)).toEqual([1,2,1]);
 for(const [query,token,signal] of exportCalls){expect(query).toMatchObject({cycleId:"",status:"self_review",pageSize:100});expect(token).toBe("synthetic-token");expect(signal).toBeInstanceOf(AbortSignal);}
});

it("cancels an active export when a write makes the workbench busy",async()=>{
 let resolveExport:(page:HrPerformanceReviewPage)=>void=()=>{};
 state.api.performanceReviewPageV2.mockImplementation((query:{page:number;pageSize?:number})=>query.pageSize===100?new Promise(resolve=>{resolveExport=resolve;}):Promise.resolve(page(query.page,query.pageSize??30,1)));
 let resolveWrite:()=>void=()=>{};state.api.submitPerformanceSelfReviewV2.mockImplementation(()=>new Promise(resolve=>{resolveWrite=()=>resolve({});}));
 render(<HrPerformanceClient/>);await screen.findByText("合成员工1");fireEvent.click(screen.getByRole("button",{name:"导出筛选绩效评价"}));await waitFor(()=>expect(vi.mocked(state.api.performanceReviewPageV2)).toHaveBeenCalledWith(expect.objectContaining({pageSize:100}),"synthetic-token",expect.any(AbortSignal)));
 fireEvent.click(screen.getByRole("button",{name:"填写自评"}));const form=screen.getByRole("heading",{name:"员工自评"}).closest("form")!;fireEvent.change(form.querySelector('[name="score-work"]')!,{target:{value:"0"}});fireEvent.submit(form);expect(screen.getByRole("button",{name:"导出筛选绩效评价"})).toBeDisabled();
 await act(async()=>resolveExport(page(1,100,1)));expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();await act(async()=>resolveWrite());
});

it("reports the expanded dimension row count without changing the shared evaluation count",async()=>{
 state.api.performanceReviewPageV2.mockImplementation(async(query:{page:number;pageSize?:number})=>{
  const result=page(query.page,query.pageSize??30);
  return query.pageSize===100?{...result,items:result.items.map(item=>({...item,dimensions:[...item.dimensions,{code:"collaboration",name:"协作",weight:"0",scoreMin:"0",scoreMax:"100"}]}))}:result;
 });
 render(<HrPerformanceClient/>);await screen.findByText("合成员工1");
 fireEvent.click(screen.getByRole("button",{name:"导出筛选绩效维度"}));
 await screen.findByText("已导出 101 条评价的 202 条维度明细。");
 expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
});

it("rejects malformed export metadata without a partial download and permits retry",async()=>{
 state.api.performanceReviewPageV2.mockImplementation(async(query:{page:number;pageSize?:number})=>{
  const result=page(query.page,query.pageSize??30,1);
  return query.pageSize===100?{...result,pageSize:99}:result;
 });
 render(<HrPerformanceClient/>);await screen.findByText("合成员工1");
 const button=screen.getByRole("button",{name:"导出筛选绩效评价"});fireEvent.click(button);
 await screen.findByText(/绩效评价分页响应无效/);
 expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
 state.api.performanceReviewPageV2.mockImplementation(async(query:{page:number;pageSize?:number})=>page(query.page,query.pageSize??30,1));
 fireEvent.click(button);
 await screen.findByText("已导出 1 条匹配绩效评价。");
 expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
});
