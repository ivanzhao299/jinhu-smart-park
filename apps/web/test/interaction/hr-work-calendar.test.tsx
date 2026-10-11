import {StrictMode} from "react";
import {act,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {beforeEach,expect,it,vi} from "vitest";
import {WorkCalendarPanel,monthDates} from "../../app/hr/attendance/WorkCalendarPanel";
import {AttendanceDateRangeScheduleEditor} from "../../app/hr/attendance/AttendanceDateRangeScheduleEditor";
import type {WorkCalendarDay} from "../../lib/hr-work-calendar-api";
let token="scope-a";
const calendar=vi.hoisted(()=>({range:vi.fn(),history:vi.fn(),put:vi.fn()}));
const schedules=vi.hoisted(()=>({attendanceSchedule:vi.fn(),createAttendanceSchedule:vi.fn(),updateAttendanceSchedule:vi.fn()}));
vi.mock("../../lib/hr-work-calendar-api",async importOriginal=>({...await importOriginal<object>(),workCalendarApi:calendar}));
vi.mock("../../lib/hr-api",()=>({hrApi:schedules}));
vi.mock("../../lib/authz",()=>({getAccessToken:()=>token}));
const row:WorkCalendarDay={id:"day1",workDate:"2026-07-01",dayKind:"working",dayName:"调休上班",version:3,updatedAt:"2026-06-01T00:00:00Z"};
beforeEach(()=>{vi.resetAllMocks();token="scope-a";calendar.range.mockImplementation((from:string,to:string)=>Promise.resolve({from,to,items:from.startsWith("2026-07")?[row]:[]}));calendar.history.mockResolvedValue({items:[],total:0,page:1,page_size:20});calendar.put.mockResolvedValue({...row,version:4});schedules.attendanceSchedule.mockResolvedValue(null);});
async function open(){render(<StrictMode><WorkCalendarPanel/></StrictMode>);await waitFor(()=>expect(screen.getByRole("button",{name:"重新读取工作日历"})).toBeEnabled());fireEvent.change(screen.getByLabelText("工作日历月份"),{target:{value:"2026-07"}});await screen.findByRole("button",{name:/2026-07-01 工作日/});fireEvent.click(screen.getByRole("button",{name:/2026-07-01 工作日/}));await screen.findByRole("heading",{name:"2026-07-01 · 当前版本 V3"});}
it("enumerates exact real months and leaves unconfigured days explicit",async()=>{
 expect(monthDates("2028-02")).toHaveLength(29);expect(monthDates("2026-02")).toHaveLength(28);expect(monthDates("2026-13")).toEqual([]);
 await open();expect(screen.getByRole("button",{name:"2026-07-02 未设置"})).toBeInTheDocument();expect(calendar.put).not.toHaveBeenCalled();
});
it("retains failed draft and retries the exact version body and key with a synchronous submit lock",async()=>{
 await open();fireEvent.change(screen.getByLabelText("日期名称"),{target:{value:"公共假日确认"}});fireEvent.change(screen.getByLabelText("日历修改原因"),{target:{value:"依据HR安排"}});
 let reject:(error:Error)=>void=()=>{};calendar.put.mockImplementationOnce(()=>new Promise((_,failure)=>{reject=failure}));
 const button=screen.getByRole("button",{name:"保存日历设置"});fireEvent.click(button);fireEvent.click(button);expect(calendar.put).toHaveBeenCalledTimes(1);
 await act(async()=>reject(new Error("network unknown")));expect(screen.getByLabelText("日期名称")).toHaveValue("公共假日确认");
 fireEvent.click(button);await screen.findByText(/日历设置已保存/);expect(calendar.put.mock.calls[0]).toEqual(calendar.put.mock.calls[1]);expect(calendar.put.mock.calls[1]?.[1].expectedVersion).toBe(3);expect(screen.getByLabelText("日历修改原因")).toHaveValue("");
});
it("keeps committed success after history refresh failure and recovers history independently",async()=>{
 await open();fireEvent.change(screen.getByLabelText("日历修改原因"),{target:{value:"HR确认"}});calendar.history.mockRejectedValueOnce(new Error("history failed"));
 fireEvent.click(screen.getByRole("button",{name:"保存日历设置"}));await screen.findByText(/日历已保存；历史刷新失败/);expect(screen.getByText(/日历设置已保存/)).toBeInTheDocument();expect(screen.getByRole("heading",{name:"2026-07-01 · 当前版本 V4"})).toBeInTheDocument();
 fireEvent.click(screen.getByRole("button",{name:"重新读取历史"}));await waitFor(()=>expect(screen.queryByText(/日历已保存；历史刷新失败/)).toBeNull());expect(calendar.put).toHaveBeenCalledTimes(1);
});
it("does not authorize writes after failed reads and ignores old month responses",async()=>{
 calendar.range.mockRejectedValue(new Error("read failed"));render(<WorkCalendarPanel/>);await screen.findByRole("alert");expect(screen.queryByRole("button",{name:"保存日历设置"})).toBeNull();
 calendar.range.mockResolvedValue({from:"2026-07-01",to:"2026-07-31",items:[row]});fireEvent.change(screen.getByLabelText("工作日历月份"),{target:{value:"2026-07"}});await screen.findByRole("button",{name:/2026-07-01 工作日/});
 let resolve:(value:unknown)=>void=()=>{};calendar.range.mockImplementationOnce(()=>new Promise(done=>{resolve=done}));fireEvent.change(screen.getByLabelText("工作日历月份"),{target:{value:"2026-08"}});
 calendar.range.mockResolvedValue({from:"2026-09-01",to:"2026-09-30",items:[]});fireEvent.change(screen.getByLabelText("工作日历月份"),{target:{value:"2026-09"}});await screen.findByRole("button",{name:"2026-09-01 未设置"});await act(async()=>resolve({items:[row]}));expect(screen.queryByRole("button",{name:/2026-07-01/})).toBeNull();
});
it("pages history and presents retained unset versions",async()=>{
 calendar.history.mockImplementation((date:string,page:number)=>Promise.resolve({items:[{id:`history${page}`,version:page===1?21:1,dayKind:page===1?"unset":"working",dayName:"保留历史",reason:`原因第${page}页`,occurredAt:"2026-01-01"}],total:21,page,page_size:20}));await open();await screen.findByText("原因第1页");fireEvent.click(screen.getByRole("button",{name:"日历历史下一页"}));await screen.findByText("原因第2页");expect(screen.queryByText("原因第1页")).toBeNull();
});
it("uses only explicitly configured working dates for schedule selection and keeps unknown dates unselected",async()=>{
 calendar.range.mockResolvedValue({from:"2026-07-01",to:"2026-07-03",items:[row,{...row,id:"rest",workDate:"2026-07-02",dayKind:"rest",dayName:"休息安排",version:1}]});
 render(<AttendanceDateRangeScheduleEditor employeeId="employee" shifts={[]} disabled={false} onBusyChange={()=>{}} onSaved={async()=>{}}/>);
 fireEvent.change(screen.getByLabelText("范围开始日期"),{target:{value:"2026-07-01"}});fireEvent.change(screen.getByLabelText("范围结束日期"),{target:{value:"2026-07-03"}});fireEvent.click(screen.getByRole("button",{name:"读取范围工作日历"}));await screen.findByText(/调休上班 · V3/);fireEvent.click(screen.getByRole("button",{name:"选择已设工作日"}));expect(screen.getByRole("checkbox",{name:"2026-07-01"})).toBeChecked();expect(screen.getByRole("checkbox",{name:"2026-07-02"})).not.toBeChecked();expect(screen.getByRole("checkbox",{name:"2026-07-03"})).not.toBeChecked();expect(schedules.createAttendanceSchedule).not.toHaveBeenCalled();
});
it("refuses a save when login changes without rendering",async()=>{
 await open();fireEvent.change(screen.getByLabelText("日历修改原因"),{target:{value:"HR确认"}});token="scope-b";fireEvent.click(screen.getByRole("button",{name:"保存日历设置"}));expect(calendar.put).not.toHaveBeenCalled();expect(screen.getByText(/登录状态已变化/)).toBeInTheDocument();
});
