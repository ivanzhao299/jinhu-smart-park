import {act,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {beforeEach,expect,it,vi} from "vitest";
import {useState} from "react";
import {AttendanceScheduleEditor} from "../../app/hr/attendance/AttendanceScheduleEditor";
import {hrApi,type HrEmployeeSchedule,type HrAttendanceShift} from "../../lib/hr-api";
vi.mock("../../lib/authz",()=>({getAccessToken:()=>"synthetic-token"}));
vi.mock("../../lib/hr-api",()=>({hrApi:{attendanceSchedule:vi.fn(),createAttendanceSchedule:vi.fn(),updateAttendanceSchedule:vi.fn()}}));
const shifts:HrAttendanceShift[]=[{id:"A",shiftCode:"A",shiftName:"日班",startLocal:"09:00",endLocal:"18:00",crossesMidnight:false,lateGraceMinutes:0,earlyGraceMinutes:0,ruleVersion:"A",status:"enabled"},{id:"B",shiftCode:"B",shiftName:"晚班",startLocal:"10:00",endLocal:"19:00",crossesMidnight:false,lateGraceMinutes:5,earlyGraceMinutes:10,ruleVersion:"B",status:"enabled"}];
const saved:HrEmployeeSchedule={id:"schedule",employeeId:"employee",workDate:"2026-10-10",shiftId:"A",shiftName:"日班",startLocal:"09:00",endLocal:"18:00",version:1,requiresRecalculation:false};
const refresh=vi.fn();
function Host({employeeId="employee",date="2026-10-10",onSaved=refresh}:{employeeId?:string;date?:string;onSaved?:()=>Promise<void>}){const [busy,setBusy]=useState(false);return <AttendanceScheduleEditor key={`${employeeId}/${date}`} employeeId={employeeId} workDate={date} shifts={shifts} disabled={busy} onBusyChange={setBusy} onSaved={onSaved}/>}
beforeEach(()=>{vi.resetAllMocks();vi.mocked(hrApi.attendanceSchedule).mockResolvedValue(saved);vi.mocked(hrApi.updateAttendanceSchedule).mockResolvedValue({...saved,shiftId:"B",shiftName:"晚班",version:2,requiresRecalculation:true});vi.mocked(hrApi.createAttendanceSchedule).mockResolvedValue({...saved,requiresRecalculation:true});refresh.mockResolvedValue(undefined)});
async function chooseAdjustment(){await screen.findByText(/当前排班：日班/);fireEvent.change(screen.getByLabelText("班次",{exact:true}),{target:{value:"B"}});fireEvent.change(screen.getByLabelText("排班调整原因"),{target:{value:"正式调班"}})}
it("loads the actual saved shift and updates its ID/version rather than creating a duplicate",async()=>{
 render(<Host/>);await screen.findByText(/当前排班：日班/);expect(screen.getByLabelText("班次",{exact:true})).toHaveValue("A");expect(screen.getByRole("button",{name:"保存排班调整"})).toBeDisabled();
 await chooseAdjustment();fireEvent.click(screen.getByRole("button",{name:"保存排班调整"}));await screen.findByText(/排班已保存，请重算/);
 expect(hrApi.updateAttendanceSchedule).toHaveBeenCalledWith("schedule",{shiftId:"B",expectedVersion:1,reason:"正式调班"},"synthetic-token",expect.any(String));expect(hrApi.createAttendanceSchedule).not.toHaveBeenCalled();expect(screen.getByLabelText("排班调整原因")).toHaveValue("");expect(screen.getByText(/待重算日考勤/)).toBeInTheDocument();
});
it("preserves failed adjustment and the same idempotency key until payload changes",async()=>{
 vi.mocked(hrApi.updateAttendanceSchedule).mockRejectedValueOnce(new Error("合成响应中断"));render(<Host/>);await chooseAdjustment();const submit=screen.getByRole("button",{name:"保存排班调整"});fireEvent.click(submit);await screen.findByText("合成响应中断");
 expect(screen.getByLabelText("班次",{exact:true})).toHaveValue("B");expect(screen.getByLabelText("排班调整原因")).toHaveValue("正式调班");fireEvent.click(submit);await screen.findByText(/排班已保存，请重算/);
 const calls=vi.mocked(hrApi.updateAttendanceSchedule).mock.calls;expect(calls[0]).toEqual(calls[1]);
});
it("a read error blocks blind creation, while explicit retry can load an empty day and create",async()=>{
 vi.mocked(hrApi.attendanceSchedule).mockRejectedValueOnce(new Error("合成读取失败")).mockResolvedValueOnce(null);render(<Host/>);await screen.findByText("合成读取失败");expect(screen.getByRole("button",{name:"保存当日排班"})).toBeDisabled();
 fireEvent.click(screen.getByRole("button",{name:"重新读取排班"}));await screen.findByText("当天尚未排班，可以新增。");fireEvent.click(screen.getByRole("button",{name:"保存当日排班"}));await screen.findByText(/排班已保存，请重算/);
 expect(hrApi.createAttendanceSchedule).toHaveBeenCalledWith({employeeId:"employee",shiftId:"A",workDate:"2026-10-10"},"synthetic-token",expect.any(String));expect(hrApi.attendanceSchedule).toHaveBeenCalledTimes(2);
});
it("a post-save ledger refresh failure preserves committed success",async()=>{
 refresh.mockRejectedValueOnce(new Error("合成刷新失败"));render(<Host/>);await chooseAdjustment();fireEvent.click(screen.getByRole("button",{name:"保存排班调整"}));await screen.findByText("排班已保存；结果列表刷新失败，请重新读取。");expect(screen.getByLabelText("排班调整原因")).toHaveValue("");expect(hrApi.updateAttendanceSchedule).toHaveBeenCalledTimes(1);
});
it("pending saves synchronously lock duplicate clicks and editable controls",async()=>{
 let resolve:(row:HrEmployeeSchedule)=>void=()=>{};vi.mocked(hrApi.updateAttendanceSchedule).mockImplementationOnce(()=>new Promise(done=>{resolve=done}));render(<Host/>);await chooseAdjustment();const submit=screen.getByRole("button",{name:"保存排班调整"});act(()=>{fireEvent.click(submit);fireEvent.click(submit)});
 expect(hrApi.updateAttendanceSchedule).toHaveBeenCalledTimes(1);expect(screen.getByLabelText("班次",{exact:true})).toBeDisabled();expect(screen.getByLabelText("排班调整原因")).toBeDisabled();await act(async()=>resolve({...saved,shiftId:"B",version:2,requiresRecalculation:true}));await screen.findByText(/排班已保存，请重算/);
});
it("replaced employee/date cancels the old read and cannot bind its late response",async()=>{
 let resolve:(row:HrEmployeeSchedule)=>void=()=>{};vi.mocked(hrApi.attendanceSchedule).mockImplementationOnce(()=>new Promise(done=>{resolve=done})).mockResolvedValueOnce(null);const {rerender}=render(<Host/>);const signal=vi.mocked(hrApi.attendanceSchedule).mock.calls[0]?.[3];rerender(<Host employeeId="next" date="2026-10-11"/>);await screen.findByText("当天尚未排班，可以新增。");expect(signal?.aborted).toBe(true);await act(async()=>resolve(saved));expect(screen.queryByText(/当前排班：日班/)).toBeNull();
});
it("a version conflict retains the draft until explicit reload replaces the baseline",async()=>{
 vi.mocked(hrApi.updateAttendanceSchedule).mockRejectedValueOnce(new Error("排班已被更新，请重新读取后核对再保存。"));render(<Host/>);await chooseAdjustment();fireEvent.click(screen.getByRole("button",{name:"保存排班调整"}));await screen.findByText(/排班已被更新/);expect(screen.getByLabelText("排班调整原因")).toHaveValue("正式调班");
 vi.mocked(hrApi.attendanceSchedule).mockResolvedValueOnce({...saved,shiftId:"B",shiftName:"晚班",version:2});fireEvent.click(screen.getByRole("button",{name:"重新读取排班"}));await screen.findByText(/当前排班：晚班/);expect(screen.getByLabelText("班次",{exact:true})).toHaveValue("B");expect(screen.getByLabelText("排班调整原因")).toHaveValue("");
});
it("unselected employees do not read or enable a mutation",()=>{render(<Host employeeId=""/>);expect(hrApi.attendanceSchedule).not.toHaveBeenCalled();expect(screen.getByRole("button",{name:"保存当日排班"})).toBeDisabled()});

it("an older save completion cannot publish into a newly selected employee",async()=>{
 let resolve:(row:HrEmployeeSchedule)=>void=()=>{};vi.mocked(hrApi.updateAttendanceSchedule).mockImplementationOnce(()=>new Promise(done=>{resolve=done}));const {rerender}=render(<Host/>);await chooseAdjustment();fireEvent.click(screen.getByRole("button",{name:"保存排班调整"}));
 vi.mocked(hrApi.attendanceSchedule).mockResolvedValueOnce(null);rerender(<Host employeeId="next"/>);await screen.findByText("当天尚未排班，可以新增。");await act(async()=>resolve({...saved,shiftId:"B",version:2}));expect(screen.queryByText(/排班已保存/)).toBeNull();expect(refresh).not.toHaveBeenCalled();await waitFor(()=>expect(screen.getByRole("button",{name:"保存当日排班"})).toBeEnabled());
});

it("a delayed save refreshes the latest ledger context rather than an old callback",async()=>{
 let resolve:(row:HrEmployeeSchedule)=>void=()=>{};vi.mocked(hrApi.updateAttendanceSchedule).mockImplementationOnce(()=>new Promise(done=>{resolve=done}));const oldRefresh=vi.fn().mockResolvedValue(undefined),latestRefresh=vi.fn().mockResolvedValue(undefined);
 const {rerender}=render(<Host onSaved={oldRefresh}/>);await chooseAdjustment();fireEvent.click(screen.getByRole("button",{name:"保存排班调整"}));rerender(<Host onSaved={latestRefresh}/>);await act(async()=>resolve({...saved,shiftId:"B",version:2}));await screen.findByText(/排班已保存，请重算/);expect(latestRefresh).toHaveBeenCalledTimes(1);expect(oldRefresh).not.toHaveBeenCalled();
});
