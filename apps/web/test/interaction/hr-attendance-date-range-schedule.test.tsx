import {StrictMode,useState} from "react";
import {act,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {beforeEach,expect,it,vi} from "vitest";
import {AttendanceDateRangeScheduleEditor} from "../../app/hr/attendance/AttendanceDateRangeScheduleEditor";
import type {HrAttendanceShift,HrEmployeeSchedule} from "../../lib/hr-api";

let token="scope-a";
const api=vi.hoisted(()=>({attendanceSchedule:vi.fn(),createAttendanceSchedule:vi.fn(),updateAttendanceSchedule:vi.fn()}));
vi.mock("../../lib/hr-api",()=>({hrApi:api}));
vi.mock("../../lib/authz",()=>({getAccessToken:()=>token}));
const shifts:HrAttendanceShift[]=[{id:"A",shiftCode:"A",shiftName:"日班",startLocal:"09:00",endLocal:"18:00",crossesMidnight:false,lateGraceMinutes:0,earlyGraceMinutes:0,ruleVersion:"A",status:"enabled"}];
const saved:HrEmployeeSchedule={id:"saved",employeeId:"employee",workDate:"2026-02-28",shiftId:"B",shiftName:"旧班",startLocal:"09:00",endLocal:"18:00",version:3,requiresRecalculation:false};
const refresh=vi.fn();
function Host({id="employee"}:{id?:string}){const [busy,setBusy]=useState(false);return <AttendanceDateRangeScheduleEditor key={id} employeeId={id} employeeName="员工甲" shifts={shifts} disabled={busy} onBusyChange={setBusy} onSaved={refresh}/>;}
function selectRange(){fireEvent.change(screen.getByLabelText("范围开始日期"),{target:{value:"2026-02-28"}});fireEvent.change(screen.getByLabelText("范围结束日期"),{target:{value:"2026-03-01"}});fireEvent.change(screen.getByLabelText("范围排班班次"),{target:{value:"A"}});fireEvent.click(screen.getByRole("button",{name:"全选当前日期范围"}));}
async function prepare(){selectRange();fireEvent.click(screen.getByRole("button",{name:"核对日期范围排班"}));await screen.findByText(/已完成只读核对/);}
beforeEach(()=>{token="scope-a";vi.resetAllMocks();api.attendanceSchedule.mockResolvedValue(null);api.createAttendanceSchedule.mockResolvedValue({...saved,shiftId:"A",shiftName:"日班"});api.updateAttendanceSchedule.mockResolvedValue({...saved,shiftId:"A",shiftName:"日班",version:4});refresh.mockResolvedValue(undefined);});
it("rejects invalid dates and a 32-day range before reads",()=>{render(<Host/>);fireEvent.change(screen.getByLabelText("范围开始日期"),{target:{value:"2026-02-29"}});expect(screen.getByText(/有效的自然日期范围/)).toBeInTheDocument();fireEvent.change(screen.getByLabelText("范围开始日期"),{target:{value:"2026-01-01"}});fireEvent.change(screen.getByLabelText("范围结束日期"),{target:{value:"2026-02-01"}});expect(screen.getByText(/有效的自然日期范围/)).toBeInTheDocument();expect(api.attendanceSchedule).not.toHaveBeenCalled();});
it("previews mixed create update and unchanged rows, requiring a reason before adjustment confirmation",async()=>{api.attendanceSchedule.mockImplementation((_:string,date:string)=>Promise.resolve(date==="2026-02-28"?saved:date==="2026-03-01"?{...saved,id:"same",workDate:date,shiftId:"A",shiftName:"日班"}:null));render(<Host/>);await prepare();expect(screen.getByText(/旧班 V3/)).toBeInTheDocument();expect(screen.getByText(/无需变更/)).toBeInTheDocument();expect(screen.getByLabelText("范围排班调整原因")).toBeInTheDocument();expect(screen.getByRole("button",{name:"确认按日期顺序保存"})).toBeDisabled();});
it("blocks writes after preview read failure",async()=>{api.attendanceSchedule.mockRejectedValueOnce(new Error("合成读取失败"));render(<Host/>);selectRange();fireEvent.click(screen.getByRole("button",{name:"核对日期范围排班"}));await screen.findByText(/合成读取失败/);expect(api.createAttendanceSchedule).not.toHaveBeenCalled();expect(screen.queryByRole("button",{name:"确认按日期顺序保存"})).toBeNull();});
it("runs sequentially, stops on failure, and retries the frozen request body and key without replaying success",async()=>{api.createAttendanceSchedule.mockResolvedValueOnce({...saved,workDate:"2026-02-28"}).mockRejectedValueOnce(new Error("合成中断")).mockResolvedValueOnce({...saved,workDate:"2026-03-01"});render(<Host/>);await prepare();fireEvent.click(screen.getByRole("button",{name:"确认按日期顺序保存"}));await screen.findByText(/2026-03-01 未确认完成/);const failed=api.createAttendanceSchedule.mock.calls[1];fireEvent.click(screen.getByRole("button",{name:"确认按日期顺序保存"}));await waitFor(()=>expect(api.createAttendanceSchedule).toHaveBeenCalledTimes(3));expect(api.createAttendanceSchedule.mock.calls[2]).toEqual(failed);expect(api.createAttendanceSchedule.mock.calls.map(call=>(call[0] as {workDate:string}).workDate)).toEqual(["2026-02-28","2026-03-01","2026-03-01"]);});
it("synchronously blocks duplicate confirmation, stop blocks future dates, and keeps committed success on refresh failure",async()=>{let finish:(value:HrEmployeeSchedule)=>void=()=>{};api.createAttendanceSchedule.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));refresh.mockRejectedValueOnce(new Error("合成刷新失败"));render(<Host/>);await prepare();const confirm=screen.getByRole("button",{name:"确认按日期顺序保存"});act(()=>{fireEvent.click(confirm);fireEvent.click(confirm)});await waitFor(()=>expect(api.createAttendanceSchedule).toHaveBeenCalledTimes(1));fireEvent.click(screen.getByRole("button",{name:"停止后续日期"}));await act(async()=>finish({...saved,shiftId:"A"}));await screen.findByText(/已停止后续日期/);expect(api.createAttendanceSchedule).toHaveBeenCalledTimes(1);expect(screen.getByText(/2026-02-28 .* 已保存/)).toBeInTheDocument();});
it("does not publish late completion after target/context replacement and tolerates StrictMode",async()=>{let finish:(value:HrEmployeeSchedule)=>void=()=>{};api.createAttendanceSchedule.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));const {rerender}=render(<StrictMode><Host/></StrictMode>);await prepare();fireEvent.click(screen.getByRole("button",{name:"确认按日期顺序保存"}));await waitFor(()=>expect(api.createAttendanceSchedule).toHaveBeenCalledTimes(1));token="scope-b";rerender(<StrictMode><Host id="next"/></StrictMode>);await act(async()=>finish({...saved,shiftId:"A"}));expect(refresh).not.toHaveBeenCalled();});
it("keeps an uncertain POST and successes when rereading finds the committed row",async()=>{
 api.createAttendanceSchedule.mockResolvedValueOnce(saved).mockRejectedValueOnce(new Error("响应中断")).mockResolvedValueOnce(saved);
 render(<Host/>);await prepare();fireEvent.click(screen.getByRole("button",{name:"确认按日期顺序保存"}));
 await screen.findByText(/2026-03-01 未确认完成/);const frozen=api.createAttendanceSchedule.mock.calls[1];
 api.attendanceSchedule.mockResolvedValue({...saved,shiftId:"A"});
 fireEvent.click(screen.getByRole("button",{name:"核对日期范围排班"}));await screen.findByText(/已完成只读核对/);
 fireEvent.click(screen.getByRole("button",{name:"确认按日期顺序保存"}));
 await screen.findByText(/选定日期排班已处理完成/);
 expect(api.createAttendanceSchedule).toHaveBeenCalledTimes(3);expect(api.createAttendanceSchedule.mock.calls[2]).toEqual(frozen);
 expect(api.updateAttendanceSchedule).not.toHaveBeenCalled();
});
it("disables old confirmation after reread failure",async()=>{
 render(<Host/>);await prepare();api.attendanceSchedule.mockRejectedValueOnce(new Error("重读失败"));
 fireEvent.click(screen.getByRole("button",{name:"核对日期范围排班"}));await screen.findByText(/重读失败/);
 expect(screen.getByRole("button",{name:"确认按日期顺序保存"})).toBeDisabled();
 expect(api.createAttendanceSchedule).not.toHaveBeenCalled();
});
it("selects and clears only the current range and excludes hidden previous dates",async()=>{
 render(<Host/>);selectRange();fireEvent.change(screen.getByLabelText("范围开始日期"),{target:{value:"2026-03-01"}});
 fireEvent.click(screen.getByRole("button",{name:"清空日期"}));expect(screen.getByLabelText("2026-03-01")).not.toBeChecked();
 fireEvent.click(screen.getByRole("button",{name:"全选当前日期范围"}));expect(screen.getByLabelText("2026-03-01")).toBeChecked();
 fireEvent.click(screen.getByRole("button",{name:"核对日期范围排班"}));await screen.findByText(/已完成只读核对/);
 expect(api.attendanceSchedule.mock.calls.map(call=>call[1])).toEqual(["2026-03-01"]);
});
it("executes a reasoned mixed create update unchanged plan",async()=>{
 api.attendanceSchedule.mockImplementation((_:string,date:string)=>Promise.resolve(date==="2026-02-28"?saved:date==="2026-03-01"?{...saved,shiftId:"A"}:null));
 render(<Host/>);selectRange();fireEvent.change(screen.getByLabelText("范围结束日期"),{target:{value:"2026-03-02"}});
 fireEvent.click(screen.getByRole("button",{name:"全选当前日期范围"}));fireEvent.change(screen.getByLabelText("范围排班调整原因"),{target:{value:"正式调班"}});
 fireEvent.click(screen.getByRole("button",{name:"核对日期范围排班"}));await screen.findByText(/已完成只读核对/);
 fireEvent.click(screen.getByRole("button",{name:"确认按日期顺序保存"}));await screen.findByText(/选定日期排班已处理完成/);
 expect(api.updateAttendanceSchedule).toHaveBeenCalledTimes(1);expect(api.updateAttendanceSchedule.mock.calls[0]?.[1]).toEqual({shiftId:"A",expectedVersion:3,reason:"正式调班"});
 expect(api.createAttendanceSchedule).toHaveBeenCalledTimes(1);expect(api.createAttendanceSchedule.mock.calls[0]?.[0].workDate).toBe("2026-03-02");
});
it("suppresses late failure after the access token changes",async()=>{
 let reject:(error:Error)=>void=()=>{};api.createAttendanceSchedule.mockImplementationOnce(()=>new Promise((_,failure)=>{reject=failure}));
 render(<Host/>);await prepare();fireEvent.click(screen.getByRole("button",{name:"确认按日期顺序保存"}));
 await waitFor(()=>expect(api.createAttendanceSchedule).toHaveBeenCalledTimes(1));token="scope-b";
 await act(async()=>reject(new Error("旧身份错误")));expect(screen.queryByText(/旧身份错误/)).toBeNull();expect(refresh).not.toHaveBeenCalled();
});
it("includes leap day and the 31st natural date",async()=>{
 render(<Host/>);selectRange();fireEvent.change(screen.getByLabelText("范围开始日期"),{target:{value:"2028-02-01"}});
 fireEvent.change(screen.getByLabelText("范围结束日期"),{target:{value:"2028-03-02"}});fireEvent.click(screen.getByRole("button",{name:"全选当前日期范围"}));
 expect(screen.getByRole("checkbox",{name:"2028-02-29"})).toBeChecked();expect(screen.getAllByRole("checkbox")).toHaveLength(31);
 fireEvent.click(screen.getByRole("button",{name:"核对日期范围排班"}));await screen.findByText(/已完成只读核对/);expect(api.attendanceSchedule).toHaveBeenCalledTimes(31);
});
it("suppresses stale refresh errors after token replacement",async()=>{
 let reject:(error:Error)=>void=()=>{};refresh.mockImplementationOnce(()=>new Promise((_,failure)=>{reject=failure}));
 render(<Host/>);await prepare();fireEvent.click(screen.getByRole("button",{name:"确认按日期顺序保存"}));
 await waitFor(()=>expect(refresh).toHaveBeenCalledTimes(1));token="scope-b";await act(async()=>reject(new Error("刷新失败")));
 expect(screen.queryByText(/结果列表刷新失败/)).toBeNull();expect(api.createAttendanceSchedule).toHaveBeenCalledTimes(2);
});
it("requires a new preview if the token changes before confirmation without a render",async()=>{
 render(<Host/>);await prepare();token="scope-b";
 fireEvent.click(screen.getByRole("button",{name:"确认按日期顺序保存"}));
 expect(api.createAttendanceSchedule).not.toHaveBeenCalled();expect(api.updateAttendanceSchedule).not.toHaveBeenCalled();
 expect(screen.getByText(/登录状态已变化/)).toBeInTheDocument();
 expect(screen.getByRole("button",{name:"确认按日期顺序保存"})).toBeDisabled();
});
it("does not start preview under a token different from the rendered context",()=>{
 render(<Host/>);selectRange();token="scope-b";
 fireEvent.click(screen.getByRole("button",{name:"核对日期范围排班"}));
 expect(api.attendanceSchedule).not.toHaveBeenCalled();expect(screen.getByText(/登录状态已变化/)).toBeInTheDocument();
});
