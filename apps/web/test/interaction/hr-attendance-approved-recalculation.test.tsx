import {StrictMode,useState} from "react";
import {act,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {beforeEach,expect,it,vi} from "vitest";
import {ApprovedRequestRecalculation} from "../../app/hr/attendance/ApprovedRequestRecalculation";
import type {HrAttendanceRequest,HrAttendanceRequestRecalculationPlan} from "../../lib/hr-api";

let token="scope-a";
const api=vi.hoisted(()=>({attendanceRequestRecalculationPlan:vi.fn(),recalculateAttendance:vi.fn()}));
vi.mock("../../lib/hr-api",()=>({hrApi:api}));
vi.mock("../../lib/authz",()=>({getAccessToken:()=>token}));

const row:HrAttendanceRequest={id:"request-1",requestNo:"ATT-1",requestType:"leave",startAt:"2026-10-10T00:00:00.000Z",endAt:"2026-10-12T00:00:00.000Z",attendanceDate:null,durationMinutes:2880,legacyDeclaredDays:null,leavePlannedMinutes:0,leaveEffectiveMinutes:0,leaveDayCount:2,reason:"合成",status:"approved",submittedAt:null,reviewedAt:null,reviewComment:null,organizationName:null,isSelf:false,employeeId:"employee-1",employeeCode:"E-1",employeeName:"员工甲"};
const plan=(version=3,dates=["2026-10-10","2026-10-11"]):HrAttendanceRequestRecalculationPlan=>({requestId:"request-1",requestNo:"ATT-1",requestType:"leave",requestVersion:version,employeeId:"employee-1",employeeCode:"E-1",employeeName:"员工甲",workDates:dates});
const refreshed=vi.fn();
function Harness({request=row,onRecalculated=refreshed}:{request?:HrAttendanceRequest;onRecalculated?:()=>Promise<void>}){const [busy,setBusy]=useState(false);return <ApprovedRequestRecalculation key={request.id} row={request} busy={busy} onBusyChange={setBusy} onRecalculated={onRecalculated}/>;}
async function inspect(){fireEvent.click(screen.getByRole("button",{name:"核对并重算"}));await screen.findByText(/日期范围：2026-10-10、2026-10-11/);}
beforeEach(()=>{token="scope-a";vi.resetAllMocks();api.attendanceRequestRecalculationPlan.mockResolvedValue(plan());api.recalculateAttendance.mockResolvedValue({id:"daily"});refreshed.mockResolvedValue(undefined);});

it("stops after a date failure, keeps that date key on continuation, and skips the completed date",async()=>{
 api.recalculateAttendance.mockResolvedValueOnce({id:"first"}).mockRejectedValueOnce(new Error("合成中断")).mockResolvedValueOnce({id:"second"});render(<Harness/>);await inspect();fireEvent.click(screen.getByRole("button",{name:"确认按日期顺序重算"}));await screen.findByText(/2026-10-11 未确认完成/);
 const failedKey=api.recalculateAttendance.mock.calls[1]?.[2];expect(api.recalculateAttendance.mock.calls.map(call=>(call[0] as {workDate:string}).workDate)).toEqual(["2026-10-10","2026-10-11"]);
 fireEvent.click(screen.getByRole("button",{name:"核对并重算"}));await screen.findByText(/请确认员工和日期范围后再开始办理/);fireEvent.click(screen.getByRole("button",{name:"确认按日期顺序重算"}));await waitFor(()=>expect(api.recalculateAttendance).toHaveBeenCalledTimes(3));expect(api.recalculateAttendance.mock.calls[2]?.[0].workDate).toBe("2026-10-11");expect(api.recalculateAttendance.mock.calls[2]?.[2]).toBe(failedKey);expect(refreshed).toHaveBeenCalledTimes(2);
});

it("stopping only prevents the next date after the in-flight call settles",async()=>{
 let finish:(value:unknown)=>void=()=>{};api.recalculateAttendance.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));render(<Harness/>);await inspect();fireEvent.click(screen.getByRole("button",{name:"确认按日期顺序重算"}));await waitFor(()=>expect(api.recalculateAttendance).toHaveBeenCalledTimes(1));fireEvent.click(screen.getByRole("button",{name:"停止后续日期"}));await act(async()=>finish({id:"first"}));await screen.findByText(/已停止后续日期/);expect(api.recalculateAttendance).toHaveBeenCalledTimes(1);expect(screen.getByText(/2026-10-10 · 已成功/)).toBeInTheDocument();expect(screen.getByText(/2026-10-11 · 待办理/)).toBeInTheDocument();
});

it("requires fresh confirmation when the request version or date range drifts",async()=>{
 api.attendanceRequestRecalculationPlan.mockResolvedValueOnce(plan(3)).mockResolvedValueOnce(plan(4,["2026-10-10"]));render(<Harness/>);await inspect();fireEvent.click(screen.getByRole("button",{name:"确认按日期顺序重算"}));await screen.findByText(/申请版本、员工或日期范围已变化/);expect(api.recalculateAttendance).not.toHaveBeenCalled();
});

it("StrictMode cleanup does not disable a new inspection, and duplicate inspection is synchronous",async()=>{
 let finishPlan:(value:HrAttendanceRequestRecalculationPlan)=>void=()=>{};api.attendanceRequestRecalculationPlan.mockImplementationOnce(()=>new Promise(resolve=>{finishPlan=resolve;}));render(<StrictMode><Harness/></StrictMode>);const inspectButton=screen.getByRole("button",{name:"核对并重算"});act(()=>{fireEvent.click(inspectButton);fireEvent.click(inspectButton)});expect(api.attendanceRequestRecalculationPlan).toHaveBeenCalledTimes(1);await act(async()=>finishPlan(plan()));await screen.findByText(/日期范围：2026-10-10、2026-10-11/);
});

it("does not publish an unmounted write completion and releases the parent busy owner",async()=>{
 let finish:(value:unknown)=>void=()=>{};const busy=vi.fn();api.recalculateAttendance.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));const {unmount}=render(<ApprovedRequestRecalculation row={row} busy={false} onBusyChange={busy} onRecalculated={refreshed}/>);await inspect();fireEvent.click(screen.getByRole("button",{name:"确认按日期顺序重算"}));await waitFor(()=>expect(api.recalculateAttendance).toHaveBeenCalledTimes(1));unmount();expect(busy).toHaveBeenLastCalledWith(false);await act(async()=>finish({id:"first"}));expect(refreshed).not.toHaveBeenCalled();
});

it("keeps successful dates visible when the result refresh fails and stops future writes after context changes",async()=>{
 refreshed.mockRejectedValueOnce(new Error("合成刷新失败"));render(<Harness/>);await inspect();fireEvent.click(screen.getByRole("button",{name:"确认按日期顺序重算"}));await screen.findByText("合成刷新失败");expect(screen.getByText(/2026-10-10 · 已成功/)).toBeInTheDocument();
 api.recalculateAttendance.mockClear();api.attendanceRequestRecalculationPlan.mockResolvedValue(plan(3,["2026-10-12","2026-10-13"]));fireEvent.click(screen.getByRole("button",{name:"核对并重算"}));await screen.findByText(/2026-10-12、2026-10-13/);token="scope-b";fireEvent.click(screen.getByRole("button",{name:"确认按日期顺序重算"}));await screen.findByText(/当前身份范围已变化/);expect(api.recalculateAttendance).not.toHaveBeenCalled();
});

it("stops the remaining dates and does not publish an old completion when scope changes in flight",async()=>{
 let finish:(value:unknown)=>void=()=>{};api.recalculateAttendance.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));render(<Harness/>);await inspect();fireEvent.click(screen.getByRole("button",{name:"确认按日期顺序重算"}));await waitFor(()=>expect(api.recalculateAttendance).toHaveBeenCalledTimes(1));token="scope-b";await act(async()=>finish({id:"first"}));await screen.findByText(/当前身份范围已变化/);expect(api.recalculateAttendance).toHaveBeenCalledTimes(1);expect(screen.getByText(/2026-10-10 · 办理中/)).toBeInTheDocument();expect(refreshed).not.toHaveBeenCalled();
});
