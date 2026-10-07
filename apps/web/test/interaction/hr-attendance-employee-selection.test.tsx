import {act,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {beforeEach,expect,it,vi} from "vitest";
import {useState} from "react";
import {AttendanceEmployeeSelection} from "../../app/hr/attendance/AttendanceEmployeeSelection";
import {HrAttendanceClient} from "../../app/hr/attendance/HrAttendanceClient";
import {hrApi,type HrAttendanceEmployeeOption} from "../../lib/hr-api";

const state=vi.hoisted(()=>({user:{id:"operator",permissions:["hr:attendance","hr:attendance:operate","hr:attendance:read"],enabled_modules:[{module_code:"hr"}]}}));
vi.mock("../../lib/auth-context",()=>({useAuthUser:()=>state.user}));
vi.mock("../../lib/authz",()=>({getAccessToken:()=>"synthetic-token"}));
vi.mock("../../lib/hr-api",()=>({hrApi:{attendanceEmployeeOptions:vi.fn(),attendanceShifts:vi.fn(),attendanceRequests:vi.fn(),attendanceDaily:vi.fn(),attendancePeriods:vi.fn(),attendanceCalendars:vi.fn(),createAttendanceSchedule:vi.fn(),createAttendancePunch:vi.fn(),recalculateAttendance:vi.fn()}}));
const employee=(number:number)=>({id:`employee-${number}`,employeeCode:`SYN-${String(number).padStart(3,"0")}`,fullName:`合成人员${number}`});
function Selection(){const [selected,setSelected]=useState<HrAttendanceEmployeeOption|null>(null);return <AttendanceEmployeeSelection selected={selected} onChange={setSelected}/>;}
const response=(items=[employee(1)],total=205,page=1)=>({items,total,page,page_size:20});
beforeEach(()=>{
 vi.clearAllMocks();state.user={id:"operator",permissions:["hr:attendance","hr:attendance:operate","hr:attendance:read"],enabled_modules:[{module_code:"hr"}]};
 vi.mocked(hrApi.attendanceEmployeeOptions).mockImplementation(async(_token,page=1,keyword="")=>keyword?response([employee(101)],1,1):response(Array.from({length:Math.min(20,205-(page-1)*20)},(_,index)=>employee((page-1)*20+index+1)),205,page));
 vi.mocked(hrApi.attendanceShifts).mockResolvedValue([{id:"shift",shiftCode:"SYN",shiftName:"合成班次",startLocal:"09:00",endLocal:"18:00",crossesMidnight:false,lateGraceMinutes:0,earlyGraceMinutes:0,ruleVersion:"v1",status:"enabled"}]);
 vi.mocked(hrApi.attendanceRequests).mockResolvedValue({items:[],total:0,page:1,page_size:30});
 vi.mocked(hrApi.attendanceDaily).mockResolvedValue({items:[],total:0,page:1,page_size:31});
 vi.mocked(hrApi.attendancePeriods).mockResolvedValue({items:[],total:0,page:1,page_size:24});
 vi.mocked(hrApi.attendanceCalendars).mockResolvedValue({items:[],total:0,page:1,page_size:20});
});
it("reaches employee101 by server pagination and never picks the first employee implicitly",async()=>{
 render(<Selection/>);await screen.findByText("员工第 1 / 11 页 · 共 205 人");expect(screen.getByLabelText("考勤员工")).toHaveValue("");
 for(let page=2;page<=6;page++){fireEvent.click(screen.getByRole("button",{name:"员工下一页"}));await screen.findByText(`员工第 ${page} / 11 页 · 共 205 人`);}
 fireEvent.change(screen.getByLabelText("考勤员工"),{target:{value:"employee-101"}});expect(screen.getByText("当前操作员工：合成人员101 · SYN-101")).toBeInTheDocument();
 expect(vi.mocked(hrApi.attendanceEmployeeOptions).mock.calls.at(-1)?.slice(0,3)).toEqual(["synthetic-token",6,""]);
});
it("literal search finds later employees and retains explicit selection across filtering",async()=>{
 render(<Selection/>);await screen.findByText("员工第 1 / 11 页 · 共 205 人");fireEvent.change(screen.getByLabelText("考勤员工"),{target:{value:"employee-1"}});
 fireEvent.change(screen.getByLabelText("搜索考勤员工"),{target:{value:"  SYN-101  "}});fireEvent.click(screen.getByRole("button",{name:"搜索员工"}));await screen.findByText("员工第 1 / 1 页 · 共 1 人");
 expect(screen.getByLabelText("考勤员工")).toHaveValue("employee-1");expect(screen.getByRole("option",{name:"合成人员101 · SYN-101"})).toBeInTheDocument();
 expect(vi.mocked(hrApi.attendanceEmployeeOptions).mock.calls.at(-1)?.slice(0,3)).toEqual(["synthetic-token",1,"SYN-101"]);
});
it("new search cancels older reads, discards late rows and clears failed result pages",async()=>{
 let resolve:(value:ReturnType<typeof response>)=>void=()=>{};
 vi.mocked(hrApi.attendanceEmployeeOptions).mockImplementationOnce(()=>new Promise(done=>{resolve=done}));
 render(<Selection/>);const signal=vi.mocked(hrApi.attendanceEmployeeOptions).mock.calls[0]?.[3];
 fireEvent.change(screen.getByLabelText("搜索考勤员工"),{target:{value:"SYN-101"}});fireEvent.click(screen.getByRole("button",{name:"搜索员工"}));await screen.findByText("员工第 1 / 1 页 · 共 1 人");expect(signal?.aborted).toBe(true);
 await act(async()=>resolve(response([employee(1)])));expect(screen.queryByRole("option",{name:"合成人员1 · SYN-001"})).toBeNull();
 vi.mocked(hrApi.attendanceEmployeeOptions).mockRejectedValueOnce(new Error("合成候选读取失败"));fireEvent.click(screen.getByRole("button",{name:"搜索员工"}));await screen.findByRole("alert");expect(screen.queryByRole("option",{name:"合成人员101 · SYN-101"})).toBeNull();
});
it("disabled modules and self readers do not query operation candidates",()=>{
 state.user.permissions=["hr:attendance:self_read"];const {rerender}=render(<Selection/>);expect(screen.queryByLabelText("考勤员工")).toBeNull();
 state.user.permissions=["hr:attendance:operate"];state.user.enabled_modules=[];rerender(<Selection/>);expect(screen.queryByLabelText("考勤员工")).toBeNull();expect(hrApi.attendanceEmployeeOptions).not.toHaveBeenCalled();
});
it("identity changes and unmount cancel pending reads",async()=>{
 let resolve:(value:ReturnType<typeof response>)=>void=()=>{};vi.mocked(hrApi.attendanceEmployeeOptions).mockImplementationOnce(()=>new Promise(done=>{resolve=done}));
 const {rerender,unmount}=render(<Selection/>);const signal=vi.mocked(hrApi.attendanceEmployeeOptions).mock.calls[0]?.[3];state.user={...state.user,id:"another-operator"};rerender(<Selection/>);expect(signal?.aborted).toBe(true);
 await screen.findByText("员工第 1 / 11 页 · 共 205 人");await act(async()=>resolve(response([employee(101)])));expect(screen.queryByRole("option",{name:"合成人员101 · SYN-101"})).toBeNull();unmount();expect(vi.mocked(hrApi.attendanceEmployeeOptions).mock.calls.at(-1)?.[3]?.aborted).toBe(true);
});
it("actual attendance page passes explicit later employee to schedule",async()=>{
 render(<HrAttendanceClient/>);await screen.findByText("员工第 1 / 11 页 · 共 205 人");expect(screen.getByRole("button",{name:"保存当日排班"})).toBeDisabled();expect(screen.getByRole("button",{name:"录入打卡事件"})).toBeDisabled();
 fireEvent.change(screen.getByLabelText("搜索考勤员工"),{target:{value:"SYN-101"}});fireEvent.click(screen.getByRole("button",{name:"搜索员工"}));await screen.findByText("员工第 1 / 1 页 · 共 1 人");fireEvent.change(screen.getByLabelText("考勤员工"),{target:{value:"employee-101"}});
 fireEvent.click(screen.getByRole("button",{name:"保存当日排班"}));await waitFor(()=>expect(hrApi.createAttendanceSchedule).toHaveBeenCalledWith(expect.objectContaining({employeeId:"employee-101",shiftId:"shift"}),"synthetic-token"));
});
it("actual attendance scope change resets the selected employee and pending operation form",async()=>{
 const {rerender}=render(<HrAttendanceClient/>);await screen.findByText("员工第 1 / 11 页 · 共 205 人");fireEvent.change(screen.getByLabelText("考勤员工"),{target:{value:"employee-1"}});expect(screen.getByRole("button",{name:"保存当日排班"})).toBeEnabled();
 state.user={...state.user,id:"another-operator"};rerender(<HrAttendanceClient/>);await screen.findByText("员工第 1 / 11 页 · 共 205 人");expect(screen.getByLabelText("考勤员工")).toHaveValue("");expect(screen.getByRole("button",{name:"保存当日排班"})).toBeDisabled();
});

it("attendance defaults use the Shanghai business day and month across UTC midnight",async()=>{
 vi.useFakeTimers({toFake:["Date"]});vi.setSystemTime(new Date("2026-09-30T16:30:00Z"));
 try{render(<HrAttendanceClient/>);await screen.findByText("员工第 1 / 11 页 · 共 205 人");expect(screen.getByLabelText("业务日期")).toHaveValue("2026-10-01");expect(screen.getByLabelText("期间月份")).toHaveValue("2026-10");}finally{vi.useRealTimers();}
});
