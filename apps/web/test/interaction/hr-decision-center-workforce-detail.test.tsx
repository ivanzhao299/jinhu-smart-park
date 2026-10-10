import { act,fireEvent,render,screen,waitFor } from "@testing-library/react";
import { beforeEach,expect,it,vi } from "vitest";
import { HR_PERMISSIONS } from "@jinhu/shared";
import { HrDecisionCenterClient } from "../../app/hr/decision-center/HrDecisionCenterClient";
import { hrApi,type HrWorkforceDecisionSnapshot } from "../../lib/hr-api";

const auth=vi.hoisted(()=>({user:{id:"actor-a",tenant_id:"tenant",park_id:"park",permissions:[] as string[]}}));
vi.mock("../../lib/auth-context",()=>({useAuthUser:()=>auth.user}));
vi.mock("../../lib/authz",()=>({getAccessToken:()=>"captured-token"}));
vi.mock("../../lib/hr-api",()=>({hrApi:{workforceDecisionSnapshot:vi.fn()}}));
vi.mock("../../components/auth/PermissionGuard",()=>({PermissionGuard:({children}:{children:React.ReactNode})=>children}));
vi.mock("../../components/auth/ForbiddenState",()=>({ForbiddenState:({message}:{message:string})=><p>{message}</p>}));

const value=(from:string,to:string):HrWorkforceDecisionSnapshot=>({from,to,employeeTotal:1,activeHeadcount:1,byStatus:[],byType:[],staffing:{positionTotal:1,configuredPositionCount:1,unconfiguredPositionCount:0,headcountLimit:1,activeAssignedHeadcount:1,activeUnassignedHeadcount:0,vacancyCount:0,overCapacityPositionCount:0},departments:[{code:"ORG",name:"当前组织",status:"enabled",employeeTotal:1,activeCount:1,probationCount:0,preboardingCount:0,suspendedCount:0,departedCount:0,plannedHeadcount:1}],positions:[{orgCode:"ORG",orgName:"当前组织",positionCode:"P1",positionName:"当前岗位",headcountLimit:1,activeHeadcount:1,vacancyCount:0,overCapacityCount:0}],employmentEvents:{from,to,total:0,employeeCount:0,historicalCount:0,onlineCount:0,byType:[],byMonth:[]}});
const currentTo=new Date().toISOString().slice(0,10);

beforeEach(()=>{vi.resetAllMocks();auth.user={id:"actor-a",tenant_id:"tenant",park_id:"park",permissions:[HR_PERMISSIONS.HR_DECISION_CENTER_PAGE]};});

it("drops a late old-range response and only shows the matching current snapshot",async()=>{
 let first!:(next:HrWorkforceDecisionSnapshot)=>void,second!:(next:HrWorkforceDecisionSnapshot)=>void;
 vi.mocked(hrApi.workforceDecisionSnapshot).mockImplementationOnce(()=>new Promise(resolve=>{first=resolve;})).mockImplementationOnce(()=>new Promise(resolve=>{second=resolve;}));
 render(<HrDecisionCenterClient/>);const start=screen.getByLabelText("开始日期");fireEvent.change(start,{target:{value:"2026-02-01"}});
 await act(async()=>first(value("2026-01-01",currentTo)));expect(screen.queryByText("当前组织")).toBeNull();
 await act(async()=>second(value("2026-02-01",currentTo)));expect(await screen.findByText("当前组织")).toBeVisible();
 const calls=vi.mocked(hrApi.workforceDecisionSnapshot).mock.calls;expect(calls[1]![0]).toBe("captured-token");expect(calls[1]![1]).toEqual({from:"2026-02-01",to:currentTo});expect(calls[0]![2]).toBeInstanceOf(AbortSignal);
});

it("keeps exports unavailable after a failed refresh and retries using the current identity",async()=>{
 vi.mocked(hrApi.workforceDecisionSnapshot).mockRejectedValueOnce(new Error("读取失败")).mockResolvedValueOnce(value(new Date().toISOString().slice(0,4)+"-01-01",new Date().toISOString().slice(0,10)));
 render(<HrDecisionCenterClient/>);expect(await screen.findByText("读取失败")).toBeVisible();expect(screen.queryByRole("button",{name:"导出全部部门台账"})).toBeNull();
 fireEvent.click(screen.getByRole("button",{name:"重试"}));await screen.findByText("当前组织");expect(vi.mocked(hrApi.workforceDecisionSnapshot)).toHaveBeenCalledTimes(2);
});

it("hides a previous identity's result before a replacement identity read resolves",async()=>{
 let resolve!:(next:HrWorkforceDecisionSnapshot)=>void;vi.mocked(hrApi.workforceDecisionSnapshot).mockResolvedValueOnce(value(new Date().toISOString().slice(0,4)+"-01-01",new Date().toISOString().slice(0,10))).mockImplementationOnce(()=>new Promise(done=>{resolve=done}));
 const view=render(<HrDecisionCenterClient/>);await screen.findByText("当前组织");auth.user={...auth.user,id:"actor-b",permissions:[HR_PERMISSIONS.HR_DECISION_CENTER_PAGE]};view.rerender(<HrDecisionCenterClient/>);
 expect(screen.queryByText("当前组织")).toBeNull();await act(async()=>resolve(value(new Date().toISOString().slice(0,4)+"-01-01",new Date().toISOString().slice(0,10))));await waitFor(()=>expect(screen.getByText("当前组织")).toBeVisible());
});
