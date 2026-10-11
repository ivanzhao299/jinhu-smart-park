import {render,screen} from "@testing-library/react";
import {beforeEach,expect,it,vi} from "vitest";
import {HrAttendanceClient} from "../../app/hr/attendance/HrAttendanceClient";
const state=vi.hoisted(()=>({user:{id:"operator",permissions:["hr:attendance","hr:attendance:operate"],enabled_modules:[{module_code:"hr"}]}}));
const api=vi.hoisted(()=>({attendanceShifts:vi.fn(),attendanceDaily:vi.fn(),attendancePeriods:vi.fn(),attendanceCalendars:vi.fn(),attendanceRequests:vi.fn()}));
const calendar=vi.hoisted(()=>({range:vi.fn()}));
vi.mock("../../lib/auth-context",()=>({useAuthUser:()=>state.user}));
vi.mock("../../lib/authz",()=>({getAccessToken:()=>"synthetic"}));
vi.mock("../../lib/hr-api",()=>({hrApi:api}));
vi.mock("../../lib/hr-work-calendar-api",async original=>({...await original<object>(),workCalendarApi:calendar}));
beforeEach(()=>{vi.resetAllMocks();state.user.permissions=["hr:attendance","hr:attendance:operate"];api.attendanceShifts.mockResolvedValue([]);for(const method of [api.attendanceDaily,api.attendancePeriods,api.attendanceCalendars,api.attendanceRequests])method.mockResolvedValue({items:[],total:0,page:1,page_size:20});calendar.range.mockResolvedValue({items:[]});});
it("opens work-calendar operations without broad attendance or employee read permissions",async()=>{
 render(<HrAttendanceClient/>);await screen.findByRole("heading",{name:"工作日历"});await screen.findAllByRole("button",{name:/未设置/});expect(calendar.range).toHaveBeenCalled();expect(api.attendanceDaily).not.toHaveBeenCalled();expect(api.attendancePeriods).not.toHaveBeenCalled();expect(api.attendanceCalendars).not.toHaveBeenCalled();
});
it("does not mount or read the mutable calendar for an attendance reader",async()=>{
 state.user.permissions=["hr:attendance","hr:attendance:read"];render(<HrAttendanceClient/>);await screen.findByRole("heading",{name:"考勤管理"});expect(screen.queryByRole("heading",{name:"工作日历"})).toBeNull();expect(calendar.range).not.toHaveBeenCalled();expect(api.attendanceShifts).not.toHaveBeenCalled();
});
