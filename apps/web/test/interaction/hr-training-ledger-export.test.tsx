import {act,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {beforeEach,expect,it,vi} from "vitest";
import {HR_PERMISSIONS as H} from "@jinhu/shared";
import {HrTrainingClient} from "../../app/hr/training/HrTrainingClient";
import {TrainingParticipantExport} from "../../app/hr/training/TrainingParticipantExport";
import {hrApi,type HrTrainingPlan,type HrTrainingPlanDetail} from "../../lib/hr-api";
import {downloadCsv} from "../../lib/scoped-csv-export";
import type * as CsvModule from "../../lib/scoped-csv-export";
const auth=vi.hoisted(()=>({user:{id:"actor",park_id:"park",permissions:[] as string[]}}));
vi.mock("../../lib/auth-context",()=>({useAuthUser:()=>auth.user}));
vi.mock("../../lib/authz",()=>({getAccessToken:()=>"captured-token"}));
vi.mock("../../lib/hr-api",()=>({hrApi:{trainingPlans:vi.fn(),trainingCourses:vi.fn(),trainingPlan:vi.fn()}}));
vi.mock("../../lib/scoped-csv-export",async original=>({...await original<typeof CsvModule>(),downloadCsv:vi.fn()}));
vi.mock("../../components/auth/PermissionGuard",()=>({PermissionGuard:({children}:{children:React.ReactNode})=>children}));
const plan=(id="P1"):HrTrainingPlan=>({id,code:id,name:`培训${id}`,courseTitle:"课程",status:"completed",mandatory:false,startDate:"2026-10-01",endDate:"2026-10-02",factRevision:1,participantCount:1,completedCount:1});
const detail:HrTrainingPlanDetail={...plan(),snapshot:{},participants:[{id:"participant",employeeName:"合成学员",status:"completed",checkedInAt:null,completedHours:"0",score:"0",evaluation:"合成评价",memo:"合成备注",actualCost:"19.1234",correctionVersion:2,canAct:false}]};
beforeEach(()=>{vi.resetAllMocks();auth.user={id:"actor",park_id:"park",permissions:[H.HR_TRAINING_PAGE,H.HR_TRAINING_READ]};vi.mocked(hrApi.trainingCourses).mockResolvedValue([]);vi.mocked(hrApi.trainingPlan).mockResolvedValue(detail);vi.mocked(hrApi.trainingPlans).mockImplementation(async(_t,page=1,size=20,status)=>{const rows=Array.from({length:status?101:40},(_,i)=>plan(`P${i+1}`));return {items:rows.slice((page-1)*size,page*size),total:rows.length,page,pageSize:size};});});
it("resets paging on status change and exports all filtered pages using actual pageSize",async()=>{
 render(<HrTrainingClient/>);await screen.findByText("培训P1");fireEvent.click(screen.getByRole("button",{name:"下一页"}));await screen.findByText("培训P21");
 fireEvent.change(screen.getByLabelText("计划状态"),{target:{value:"completed"}});await screen.findByText("培训P1");expect(screen.getByText("第 1 页")).toBeVisible();expect(screen.queryByText("培训P21")).toBeNull();
 fireEvent.click(screen.getByRole("button",{name:"导出筛选培训计划"}));await screen.findByText("已导出 101 条匹配培训计划。");
 expect(downloadCsv).toHaveBeenCalledTimes(1);expect(vi.mocked(downloadCsv).mock.calls[0]![0]).toContain('"P101"');
 const calls=vi.mocked(hrApi.trainingPlans).mock.calls.filter(c=>c[2]===100);expect(calls.map(c=>c[1])).toEqual([1,2,1]);expect(calls.every(c=>c[0]==="captured-token"&&c[3]==="completed"&&c[4] instanceof AbortSignal)).toBe(true);
});
it("does not fake pagination metadata or download after a partial page",async()=>{
 vi.mocked(hrApi.trainingPlans).mockImplementation(async(_t,page=1,size=20)=>({items:[plan()],total:1,page,pageSize:size===100?20:size}));render(<HrTrainingClient/>);await screen.findByText("培训P1");fireEvent.click(screen.getByRole("button",{name:"导出筛选培训计划"}));await screen.findByText("培训计划分页响应无效，请重新导出。");expect(downloadCsv).not.toHaveBeenCalled();
});
it("refetches a selected plan and keeps team results minimal despite injected detail fields",async()=>{
 auth.user.permissions=[H.HR_TRAINING_PAGE,H.HR_TRAINING_TEAM_READ,H.HR_TRAINING_COST_READ];render(<HrTrainingClient/>);await screen.findByText("培训P1");fireEvent.click(screen.getAllByRole("button",{name:"查看"})[0]!);await screen.findByRole("button",{name:"导出本计划培训记录"});
 fireEvent.click(screen.getByRole("button",{name:"导出本计划培训记录"}));await screen.findByText("已导出本计划 1 条可见培训记录。");expect(hrApi.trainingPlan).toHaveBeenCalledTimes(2);
 const csv=vi.mocked(downloadCsv).mock.calls[0]![0];expect(csv).toContain("合成学员");for(const forbidden of ["合成评价","合成备注","19.1234","participant"])expect(csv).not.toContain(forbidden);
});
it("aborts a double-clicked export when its plan context is replaced and drops late data",async()=>{
 let resolve!:(value:HrTrainingPlanDetail)=>void;vi.mocked(hrApi.trainingPlan).mockImplementationOnce(()=>new Promise(done=>{resolve=done}));
 const props={planId:"P1",contextKey:"actor:P1",enabled:true,selfOnly:true,teamOnly:false,canCost:false};const view=render(<TrainingParticipantExport {...props}/>);const button=screen.getByRole("button",{name:"导出本计划培训记录"});fireEvent.click(button);fireEvent.click(button);expect(hrApi.trainingPlan).toHaveBeenCalledTimes(1);const signal=vi.mocked(hrApi.trainingPlan).mock.calls[0]![2]!;
 view.rerender(<TrainingParticipantExport {...props} planId="P2"/>);expect(signal.aborted).toBe(true);await act(async()=>resolve(detail));expect(downloadCsv).not.toHaveBeenCalled();expect(screen.queryByText(/已导出本计划/)).toBeNull();
});
it("rejects mismatched and failed detail reads while allowing a successful retry",async()=>{
 vi.mocked(hrApi.trainingPlan).mockResolvedValueOnce({...detail,id:"other"}).mockRejectedValueOnce(new Error("读取中断")).mockResolvedValueOnce(detail);
 render(<TrainingParticipantExport planId="P1" contextKey="self:P1" enabled selfOnly teamOnly={false} canCost={false}/>);
 fireEvent.click(screen.getByRole("button",{name:"导出本计划培训记录"}));await screen.findByText("培训记录响应无法核对，请重新导出。");expect(downloadCsv).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole("button",{name:"导出本计划培训记录"}));await screen.findByText("读取中断");expect(downloadCsv).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole("button",{name:"导出本计划培训记录"}));await waitFor(()=>expect(downloadCsv).toHaveBeenCalledTimes(1));expect(vi.mocked(downloadCsv).mock.calls[0]![0]).not.toContain("合成学员");
});
