import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { HR_PERMISSIONS as H } from "@jinhu/shared";
import { CompensationAssignmentLedger } from "../../app/hr/compensation/CompensationAssignmentLedger";
import { ApiError } from "../../lib/api-client";
import { HrCompensationClient } from "../../app/hr/compensation/HrCompensationClient";
import { CompensationAssignmentEditor } from "../../app/hr/compensation/CompensationAssignmentEditor";
import { CompensationEmployeePicker } from "../../app/hr/compensation/CompensationEmployeePicker";
import { hrApi, type HrApprovedCompensationRequest, type HrCompensationAssignment, type HrCompensationEmployeeOption, type HrCompensationPlan } from "../../lib/hr-api";

const state = vi.hoisted(() => ({user:{id:"actor",park_id:"park",permissions:[] as string[]}}));
vi.mock("../../lib/auth-context",() => ({useAuthUser:() => state.user}));
vi.mock("../../lib/authz",() => ({getAccessToken:() => "synthetic-token"}));
vi.mock("../../lib/hr-api",() => ({hrApi:{assignCompensation:vi.fn(),compensationAssignments:vi.fn(),compensationPlans:vi.fn(),employees:vi.fn(),compensationEmployeeOptions:vi.fn(),approvedCompensationRequests:vi.fn(),createCompensationPlan:vi.fn(),fulfillCompensationApproval:vi.fn()}}));
vi.mock("../../components/auth/PermissionGuard",()=>({PermissionGuard:({children}:{children:ReactNode})=><>{children}</>}));
const row:HrCompensationAssignment={id:"record",employeeId:"employee",employeeCode:"SYN001",employeeName:"合成员工",planId:"plan",planCode:"PLAN001",planName:"合成方案",effectiveFrom:"2026-09-01",effectiveTo:null,baseSalary:"9999999999999999.99",allowanceAmount:"0.01",variableTarget:"0.00",status:"active",version:2};
const result=(page=1,total=1,items=[row]) => ({items,total,page,page_size:20});
beforeEach(() => {
 vi.resetAllMocks(); state.user={id:"actor",park_id:"park",permissions:[H.HR_COMPENSATION_PAGE,H.HR_COMPENSATION_READ]};
 vi.mocked(hrApi.compensationAssignments).mockImplementation(async (_token,page=1) => result(page));
 vi.mocked(hrApi.compensationPlans).mockResolvedValue([]);
 vi.mocked(hrApi.employees).mockResolvedValue({items:[],total:0,page:1,page_size:100});
 vi.mocked(hrApi.assignCompensation).mockResolvedValue({id:"record",assignment:{...row,version:1},replaced:null});
 vi.mocked(hrApi.compensationEmployeeOptions).mockResolvedValue({items:[],total:0,page:1,page_size:20,selected:null});
 vi.mocked(hrApi.approvedCompensationRequests).mockResolvedValue({items:[],total:0,page:1,page_size:20});
});
it("requires compensation read before requesting sensitive rows",() => {
 state.user.permissions=[];render(<CompensationAssignmentLedger/>);expect(hrApi.compensationAssignments).not.toHaveBeenCalled();expect(screen.queryByRole("region",{name:"员工定薪台账"})).toBeNull();
});
it("shows exact decimal strings, source versions and open-ended dates",async () => {
 render(<CompensationAssignmentLedger/>);await screen.findByText("合成员工 · SYN001");expect(screen.getByText("9999999999999999.99 元")).toBeInTheDocument();expect(screen.getByText("0.01 元")).toBeInTheDocument();expect(screen.getByText("启用 · 记录版本 2")).toBeInTheDocument();expect(screen.getByText(/未设置截止日期/)).toBeInTheDocument();
});
it("pages all results and resets search to the first page",async () => {
 vi.mocked(hrApi.compensationAssignments).mockImplementation(async (_token,page=1) => result(page,21));
 render(<CompensationAssignmentLedger/>);fireEvent.click(await screen.findByRole("button",{name:"定薪记录下一页"}));await waitFor(() => expect(hrApi.compensationAssignments).toHaveBeenLastCalledWith("synthetic-token",2,20,"",expect.any(AbortSignal)));
 fireEvent.change(screen.getByLabelText("查找员工或薪酬方案"),{target:{value:"  SYN001  "}});fireEvent.click(screen.getByRole("button",{name:"查询定薪记录"}));await waitFor(() => expect(hrApi.compensationAssignments).toHaveBeenLastCalledWith("synthetic-token",1,20,"SYN001",expect.any(AbortSignal)));
});
it("clears previous records on refresh failure and supports a fresh read",async () => {
 render(<CompensationAssignmentLedger/>);await screen.findByText("合成员工 · SYN001");vi.mocked(hrApi.compensationAssignments).mockRejectedValueOnce(new Error("合成读取失败"));fireEvent.click(screen.getByRole("button",{name:"刷新定薪台账"}));await screen.findByText("合成读取失败");expect(screen.queryByText("合成员工 · SYN001")).toBeNull();fireEvent.click(screen.getByRole("button",{name:"重试读取定薪台账"}));await screen.findByText("合成员工 · SYN001");
});
it("ignores a delayed earlier search even if its transport ignores abort",async () => {
 let complete!:(value:ReturnType<typeof result>)=>void;vi.mocked(hrApi.compensationAssignments).mockImplementationOnce(() => new Promise(resolve => {complete=resolve;}));render(<CompensationAssignmentLedger/>);
 await waitFor(() => expect(hrApi.compensationAssignments).toHaveBeenCalledTimes(1));const signal=vi.mocked(hrApi.compensationAssignments).mock.calls[0]![4]!;
 fireEvent.change(screen.getByLabelText("查找员工或薪酬方案"),{target:{value:"new"}});fireEvent.click(screen.getByRole("button",{name:"查询定薪记录"}));await screen.findByText("合成员工 · SYN001");expect(signal.aborted).toBe(true);
 await act(async () => complete(result(1,1,[{...row,employeeName:"过时员工"}])));expect(screen.queryByText(/过时员工/)).toBeNull();
});
it("drops salary rows synchronously on identity/park or permission changes",async () => {
 const view=render(<CompensationAssignmentLedger/>);await screen.findByText("合成员工 · SYN001");vi.mocked(hrApi.compensationAssignments).mockImplementationOnce(() => new Promise(() => {}));state.user={...state.user,park_id:"other-park"};view.rerender(<CompensationAssignmentLedger/>);expect(screen.queryByText("合成员工 · SYN001")).toBeNull();state.user.permissions=[];view.rerender(<CompensationAssignmentLedger/>);expect(screen.queryByRole("region",{name:"员工定薪台账"})).toBeNull();
});
it("reloads the ledger after a confirmed save notification without owning write errors",async () => {
 const view=render(<CompensationAssignmentLedger refreshVersion={0}/>);await screen.findByText("合成员工 · SYN001");vi.mocked(hrApi.compensationAssignments).mockRejectedValueOnce(new Error("台账刷新失败"));view.rerender(<CompensationAssignmentLedger refreshVersion={1}/>);await screen.findByText("台账刷新失败");expect(hrApi.compensationAssignments).toHaveBeenCalledTimes(2);expect(screen.queryByText(/定薪失败/)).toBeNull();
});
it("returns to the first page if deletions make a later page unavailable",async () => {
 vi.mocked(hrApi.compensationAssignments).mockResolvedValueOnce(result(1,21)).mockResolvedValueOnce(result(2,0,[])).mockResolvedValueOnce(result(1,0,[]));render(<CompensationAssignmentLedger/>);fireEvent.click(await screen.findByRole("button",{name:"定薪记录下一页"}));await screen.findByText("暂无匹配的员工定薪记录。");expect(hrApi.compensationAssignments).toHaveBeenLastCalledWith("synthetic-token",1,20,"",expect.any(AbortSignal));
});
it("rejects malformed monetary projections rather than presenting guessed zeroes",async () => {
 vi.mocked(hrApi.compensationAssignments).mockResolvedValueOnce(result(1,1,[{...row,baseSalary:NaN as unknown as string}]));render(<CompensationAssignmentLedger/>);await screen.findByText("定薪台账响应无法核对，请重新读取。");expect(screen.queryByText("合成员工 · SYN001")).toBeNull();
});
it("rejects invalid or inverted effective-date projections",async () => {
 vi.mocked(hrApi.compensationAssignments).mockResolvedValueOnce(result(1,1,[{...row,effectiveFrom:"2026-02-30"}])).mockResolvedValueOnce(result(1,1,[{...row,effectiveTo:"2026-08-31"}]));
 const view=render(<CompensationAssignmentLedger/>);await screen.findByText("定薪台账响应无法核对，请重新读取。");fireEvent.click(screen.getByRole("button",{name:"重试读取定薪台账"}));await screen.findByText("定薪台账响应无法核对，请重新读取。");expect(screen.queryByText("合成员工 · SYN001")).toBeNull();view.unmount();
});
it("drops parent plan and employee context synchronously when identity changes",async () => {
 vi.mocked(hrApi.compensationPlans).mockResolvedValue([{id:"plan",planCode:"OLD",planName:"旧园区方案",effectiveFrom:"2026-09-01",effectiveTo:null,status:"active",currency:"CNY"}]);
 vi.mocked(hrApi.employees).mockResolvedValue({items:[{id:"employee",employeeCode:"OLD001",fullName:"旧园区员工",userId:null,primaryOrgId:null,positionId:null,managerEmployeeId:null,employmentType:"formal",employmentStatus:"active",legacyJobstateCode:null,legacyJobstateName:null,hireDate:null,departureDate:null,workLocation:null,workMobile:null,workEmail:null}],total:1,page:1,page_size:100});
 const view=render(<HrCompensationClient/>);await screen.findByText("旧园区方案");vi.mocked(hrApi.compensationPlans).mockImplementationOnce(() => new Promise(() => {}));vi.mocked(hrApi.employees).mockImplementationOnce(() => new Promise(() => {}));state.user={...state.user,id:"other-actor",park_id:"other-park"};view.rerender(<HrCompensationClient/>);expect(screen.queryByText("旧园区方案")).toBeNull();expect(screen.queryByText("旧园区员工")).toBeNull();view.unmount();
});
const employee:HrCompensationEmployeeOption={id:"employee",employeeCode:"SYN001",employeeName:"合成员工",employmentStatus:"active"};
const plan:HrCompensationPlan={id:"plan",planCode:"PLAN001",planName:"合成方案",effectiveFrom:"2026-01-01",effectiveTo:null,status:"active",currency:"CNY"};
const source:HrApprovedCompensationRequest={id:"approval",requestNo:"APR-001",title:"合成薪酬申请",description:"仅供核对",subjectEmployeeId:employee.id,employeeCode:employee.employeeCode,employeeName:employee.employeeName,version:3,completedAt:null,fulfillment:null};
function fillAssignment(){fireEvent.change(screen.getByLabelText("薪酬方案"),{target:{value:plan.id}});fireEvent.change(screen.getByLabelText("生效日期"),{target:{value:"2026-09-01"}});fireEvent.change(screen.getByLabelText("基本工资"),{target:{value:"1234.50"}});}
it("accepts only a receipt bound to the submitted approved source and keeps it for the parent",async () => {
 const saved=vi.fn();vi.mocked(hrApi.compensationAssignments).mockResolvedValue({items:[],total:0,page:1,page_size:20});
 const receipt={id:"new",assignment:{...row,id:"new",effectiveFrom:"2026-09-01",baseSalary:"1234.50",allowanceAmount:"0.00",variableTarget:"0.00",version:1},replaced:null,sourceApprovalId:source.id,sourceApprovalVersion:source.version,fulfilledAt:"2026-10-10T00:00:00.000Z"};vi.mocked(hrApi.fulfillCompensationApproval).mockResolvedValue(receipt);
 render(<CompensationAssignmentEditor employee={employee} source={source} plans={[plan]} onCancel={()=>undefined} onSaved={saved}/>);await screen.findByText("此员工尚无定薪记录。");fillAssignment();fireEvent.submit(screen.getByRole("button",{name:"保存定薪并完成办理"}).closest("form")!);
 await waitFor(()=>expect(saved).toHaveBeenCalledWith(receipt));expect(hrApi.fulfillCompensationApproval).toHaveBeenCalledWith(source.id,{employeeId:employee.id,planId:plan.id,effectiveFrom:"2026-09-01",baseSalary:"1234.50",allowanceAmount:"0",variableTarget:"0",expectedApprovalVersion:source.version},"synthetic-token",expect.any(String));
});
it("freezes an unknown assignment attempt and retries the same body token and key",async () => {
 vi.mocked(hrApi.compensationAssignments).mockResolvedValue({items:[],total:0,page:1,page_size:20});vi.mocked(hrApi.assignCompensation).mockRejectedValueOnce(new Error("network interrupted")).mockResolvedValueOnce({id:"new",assignment:{...row,id:"new",effectiveFrom:"2026-09-01",baseSalary:"1234.50",allowanceAmount:"0.00",variableTarget:"0.00",version:1},replaced:null});
 const saved=vi.fn();render(<CompensationAssignmentEditor employee={employee} plans={[plan]} onCancel={()=>undefined} onSaved={saved}/>);await screen.findByText("此员工尚无定薪记录。");fillAssignment();fireEvent.submit(screen.getByRole("button",{name:"确认定薪"}).closest("form")!);await screen.findByRole("button",{name:"按原请求重试定薪"});expect(screen.getByLabelText("基本工资")).toBeDisabled();fireEvent.click(screen.getByRole("button",{name:"按原请求重试定薪"}));await waitFor(()=>expect(saved).toHaveBeenCalledTimes(1));const calls=vi.mocked(hrApi.assignCompensation).mock.calls;expect(calls).toHaveLength(2);expect(calls[1]).toEqual(calls[0]);
});
it("suppresses an old employee-options result when its transport ignores abort",async () => {
 let resolveOld!:(value:{items:HrCompensationEmployeeOption[];total:number;page:number;page_size:number;selected:null})=>void;vi.mocked(hrApi.compensationEmployeeOptions).mockImplementationOnce(()=>new Promise(resolve=>{resolveOld=resolve;})).mockResolvedValueOnce({items:[{...employee,employeeName:"新员工"}],total:1,page:1,page_size:20,selected:null});
 render(<CompensationEmployeePicker onSelect={()=>undefined}/>);await waitFor(()=>expect(hrApi.compensationEmployeeOptions).toHaveBeenCalledTimes(1));fireEvent.change(screen.getByLabelText("查找定薪员工"),{target:{value:"new"}});fireEvent.click(screen.getByRole("button",{name:"查询员工"}));await screen.findByText("新员工 · SYN001");await act(async()=>resolveOld({items:[{...employee,employeeName:"旧员工"}],total:1,page:1,page_size:20,selected:null}));expect(screen.queryByText("旧员工 · SYN001")).toBeNull();
});
it("binds a predecessor CAS version to its strict replacement receipt and retains a known conflict draft",async () => {
 const predecessor={...row,id:"previous",effectiveFrom:"2026-01-01",effectiveTo:null,version:7};vi.mocked(hrApi.compensationAssignments).mockResolvedValue({items:[predecessor],total:1,page:1,page_size:20});const saved=vi.fn();vi.mocked(hrApi.assignCompensation).mockRejectedValueOnce(new ApiError("版本冲突",409));
 render(<CompensationAssignmentEditor employee={employee} plans={[plan]} onCancel={()=>undefined} onSaved={saved}/>);await screen.findByText("合成方案 · 版本 7");fireEvent.click(screen.getByRole("button",{name:"选择结束此记录"}));fillAssignment();fireEvent.submit(screen.getByRole("button",{name:"确认定薪"}).closest("form")!);await screen.findByText(/草稿已保留/);expect(screen.getByLabelText("基本工资")).toHaveValue(1234.5);expect(hrApi.assignCompensation).toHaveBeenCalledWith(expect.objectContaining({replaceAssignmentId:predecessor.id,expectedReplacementVersion:7}),"synthetic-token",expect.any(String));fireEvent.click(screen.getByRole("button",{name:"重新读取已有定薪"}));await screen.findByText("合成方案 · 版本 7");expect(screen.queryByText(/将结束原记录/)).toBeNull();expect(saved).not.toHaveBeenCalled();
});
it("keeps an ordinary saved receipt visible when the independent ledger refresh fails",async () => {
 state.user={id:"actor",park_id:"park",permissions:[H.HR_COMPENSATION_PAGE,H.HR_COMPENSATION_READ,H.HR_COMPENSATION_MANAGE]};vi.mocked(hrApi.compensationPlans).mockResolvedValue([plan]);vi.mocked(hrApi.compensationEmployeeOptions).mockResolvedValue({items:[employee],total:1,page:1,page_size:20,selected:null});let ledgerRefreshes=0;vi.mocked(hrApi.compensationAssignments).mockImplementation(async(_token,_page,_size,_keyword,_signal,employeeId)=>{if(employeeId)return {items:[],total:0,page:1,page_size:20};if(ledgerRefreshes++)throw new Error("台账刷新失败");return result();});vi.mocked(hrApi.assignCompensation).mockResolvedValue({id:"new",assignment:{...row,id:"new",effectiveFrom:"2026-09-01",baseSalary:"1234.50",allowanceAmount:"0.00",variableTarget:"0.00",version:1},replaced:null});
 render(<HrCompensationClient/>);fireEvent.click(await screen.findByRole("button",{name:"员工定薪"}));fireEvent.click(await screen.findByRole("button",{name:"为此员工定薪"}));await screen.findByText("此员工尚无定薪记录。");fillAssignment();fireEvent.submit(screen.getByRole("button",{name:"确认定薪"}).closest("form")!);await screen.findByRole("status",{name:"正式定薪回执"});await screen.findByText("台账刷新失败");expect(screen.getByText("员工定薪已保存")).toBeInTheDocument();expect(screen.queryByText("保存定薪失败。 ")).toBeNull();
});
it("keeps an approved-source receipt when the source queue refresh fails",async () => {
 state.user={id:"actor",park_id:"park",permissions:[H.HR_COMPENSATION_PAGE,H.HR_COMPENSATION_READ,H.HR_COMPENSATION_MANAGE,H.HR_APPROVAL_PARK_REVIEW]};vi.mocked(hrApi.compensationPlans).mockResolvedValue([plan]);vi.mocked(hrApi.approvedCompensationRequests).mockResolvedValueOnce({items:[source],total:1,page:1,page_size:20}).mockRejectedValueOnce(new Error("来源队列刷新失败"));vi.mocked(hrApi.compensationAssignments).mockImplementation(async(_token,_page,_size,_keyword,_signal,employeeId)=>employeeId?{items:[],total:0,page:1,page_size:20}:result());const receipt={id:"new",assignment:{...row,id:"new",effectiveFrom:"2026-09-01",baseSalary:"1234.50",allowanceAmount:"0.00",variableTarget:"0.00",version:1},replaced:null,sourceApprovalId:source.id,sourceApprovalVersion:source.version,fulfilledAt:"2026-10-10T00:00:00.000Z"};vi.mocked(hrApi.fulfillCompensationApproval).mockResolvedValue(receipt);
 render(<HrCompensationClient/>);fireEvent.click(await screen.findByRole("button",{name:"办理薪酬变更"}));await screen.findByText("此员工尚无定薪记录。");fillAssignment();fireEvent.submit(screen.getByRole("button",{name:"保存定薪并完成办理"}).closest("form")!);await screen.findByRole("status",{name:"正式定薪回执"});await screen.findByText("来源队列刷新失败");expect(screen.getByText("薪酬申请已关联正式定薪记录。")).toBeInTheDocument();expect(hrApi.fulfillCompensationApproval).toHaveBeenCalledTimes(1);
});
