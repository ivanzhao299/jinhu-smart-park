import {act,fireEvent,render,screen,waitFor,within} from "@testing-library/react";
import {beforeEach,expect,it,vi} from "vitest";
import {HrAttendanceClient} from "../../app/hr/attendance/HrAttendanceClient";
import {hrApi,type HrAttendanceDailyResult,type HrAttendancePeriod,type HrAttendanceMonthSummary} from "../../lib/hr-api";
import {downloadCsv} from "../../lib/scoped-csv-export";
import type * as CsvModule from "../../lib/scoped-csv-export";
vi.mock("../../lib/scoped-csv-export",async()=>({...await vi.importActual<typeof CsvModule>("../../lib/scoped-csv-export"),downloadCsv:vi.fn()}));
const state=vi.hoisted(()=>({user:{id:"reader",permissions:["hr:attendance","hr:attendance:read"],enabled_modules:[{module_code:"hr"}]}}));
vi.mock("../../lib/auth-context",()=>({useAuthUser:()=>state.user}));
vi.mock("../../lib/authz",()=>({getAccessToken:()=>"synthetic-token"}));
vi.mock("../../lib/hr-api",()=>({hrApi:{attendanceRequests:vi.fn(),attendanceDaily:vi.fn(),attendancePeriods:vi.fn(),attendanceCalendars:vi.fn(),attendanceMonthSummaries:vi.fn(),payrollAttendanceInputs:vi.fn(),attendancePayrollVersions:vi.fn(),closeAttendancePeriod:vi.fn()}}));
const daily=(id:string):HrAttendanceDailyResult=>({id,workDate:"2026-10-01",firstInAt:null,lastOutAt:null,workedMinutes:480,leaveMinutes:0,lateMinutes:0,earlyMinutes:0,resultStatus:"normal",anomalyCodes:[],corrected:false,calculationVersionId:"synthetic-version",isSelf:false,employeeName:id});
const period=(id:string,month="2026-10",status="open"):HrAttendancePeriod=>({id,periodMonth:`${month}-01`,status,activeVersion:1,calculationStartedAt:null,calculationCompletedAt:null,failureCode:null,closedAt:null});
const summary=(id:string):HrAttendanceMonthSummary=>({id,summaryVersion:1,scheduledDays:22,normalDays:22,workedMinutes:10560,lateMinutes:0,earlyMinutes:0,absenceDays:0,missingPunchDays:0,employeeName:id});
const page=<T,>(items:T[],total:number,current=1,size=31)=>({items,total,page:current,page_size:size});
beforeEach(()=>{
 vi.resetAllMocks();state.user={id:"reader",permissions:["hr:attendance","hr:attendance:read"],enabled_modules:[{module_code:"hr"}]};
 vi.mocked(hrApi.attendanceRequests).mockResolvedValue(page([],0,1,30));
 vi.mocked(hrApi.attendanceCalendars).mockResolvedValue(page([],0,1,20));
 vi.mocked(hrApi.attendanceDaily).mockImplementation(async(_token,current=1)=>page([daily(`日员工${current===1?1:32}`)],32,current));
 vi.mocked(hrApi.attendancePeriods).mockImplementation(async(_token,current=1)=>page(current===1?[period("period-a"),period("period-b","2026-09")]:[period("period-25","2024-10")],25,current,24));
 vi.mocked(hrApi.attendanceMonthSummaries).mockImplementation(async(id,_token,current=1)=>page([summary(`${id}-员工${current===1?1:101}`)],101,current,100));
});
it("daily results reach employee32, filter by dates and status, and return to page1",async()=>{
 render(<HrAttendanceClient/>);await screen.findByText("日结果第 1 / 2 页 · 共 32 条");
 fireEvent.click(screen.getByRole("button",{name:"日结果下一页"}));await screen.findByText("日员工32 · 2026-10-01");
 expect(vi.mocked(hrApi.attendanceDaily).mock.calls.at(-1)?.slice(0,3)).toEqual(["synthetic-token",2,31]);
 fireEvent.change(screen.getByLabelText("日结果开始日期"),{target:{value:"2026-09-01"}});
 await waitFor(()=>expect(vi.mocked(hrApi.attendanceDaily).mock.calls.at(-1)?.[3]).toEqual(expect.objectContaining({from:"2026-09-01"})));
 fireEvent.change(screen.getByLabelText("日结果结束日期"),{target:{value:"2026-09-30"}});fireEvent.change(screen.getByLabelText("日结果状态"),{target:{value:"late"}});
 await waitFor(()=>expect(vi.mocked(hrApi.attendanceDaily).mock.calls.at(-1)?.slice(0,4)).toEqual(["synthetic-token",1,31,{from:"2026-09-01",to:"2026-09-30",status:"late"}]));
 expect(screen.getByLabelText("日结果结束日期")).toHaveAttribute("min","2026-09-01");
});
it("daily filter replacement aborts slow reads, failure clears rows, and refresh recovers",async()=>{
 let finish!:(value:ReturnType<typeof page<HrAttendanceDailyResult>>)=>void;
 vi.mocked(hrApi.attendanceDaily).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}));
 render(<HrAttendanceClient/>);const signal=vi.mocked(hrApi.attendanceDaily).mock.calls[0]?.[4];
 fireEvent.change(screen.getByLabelText("日结果状态"),{target:{value:"late"}});await screen.findByText("日员工1 · 2026-10-01");expect(signal?.aborted).toBe(true);
 await act(async()=>finish(page([daily("晚到旧结果")],32)));expect(screen.queryByText(/晚到旧结果/)).toBeNull();
 vi.mocked(hrApi.attendanceDaily).mockRejectedValueOnce(new Error("日结果读取失败"));fireEvent.click(screen.getByRole("button",{name:"刷新日结果"}));await screen.findByText("日结果读取失败");expect(screen.queryByText("日员工1 · 2026-10-01")).toBeNull();
 fireEvent.click(screen.getByRole("button",{name:"刷新日结果"}));await screen.findByText("日员工1 · 2026-10-01");expect(screen.queryByText("日结果读取失败")).toBeNull();
});
it("period25 and summary employee101 remain reachable with independent pagination",async()=>{
 render(<HrAttendanceClient/>);await screen.findByText("期间第 1 / 2 页 · 共 25 期");
 fireEvent.click(screen.getAllByRole("button",{name:"查看汇总"})[0]!);await screen.findByText(/period-a-员工1 ·/);
 fireEvent.click(screen.getByRole("button",{name:"汇总下一页"}));await screen.findByText(/period-a-员工101 ·/);
 expect(vi.mocked(hrApi.attendanceMonthSummaries).mock.calls.at(-1)?.slice(0,4)).toEqual(["period-a","synthetic-token",2,100]);
 fireEvent.click(screen.getByRole("button",{name:"期间下一页"}));await screen.findByText("2024-10 · 待计算");
 expect(screen.getByText("汇总第 2 / 2 页 · 共 101 人")).toBeInTheDocument();
 fireEvent.click(screen.getByRole("button",{name:"查看汇总"}));await screen.findByText(/period-25-员工1 ·/);expect(screen.queryByText(/period-a-员工101/)).toBeNull();
 expect(screen.getByText("汇总第 1 / 2 页 · 共 101 人")).toBeInTheDocument();
});
it("rapid period switching owns its response, clears prior correction draft and blocks stale payroll chain",async()=>{
 state.user.permissions.push("hr:attendance:correct","hr:attendance:payroll_input_read");
 vi.mocked(hrApi.attendancePeriods).mockResolvedValue(page([period("period-a","2026-10","closed"),period("period-b","2026-09","closed")],2,1,24));
 vi.mocked(hrApi.payrollAttendanceInputs).mockResolvedValue({periodId:"period-a",periodMonth:"2026-10",batchId:"batch",batchNo:1,batchType:"initial",summaryVersion:1,items:[]});
 let finish!:(value:Awaited<ReturnType<typeof hrApi.attendancePayrollVersions>>)=>void;
 vi.mocked(hrApi.attendancePayrollVersions).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve})).mockResolvedValue([]);
 render(<HrAttendanceClient/>);await screen.findByText("期间第 1 / 1 页 · 共 2 期");fireEvent.click(screen.getAllByRole("button",{name:"查看汇总"})[0]!);
 await waitFor(()=>expect(hrApi.attendancePayrollVersions).toHaveBeenCalled());const signal=vi.mocked(hrApi.attendanceMonthSummaries).mock.calls[0]?.[4],inputSignal=vi.mocked(hrApi.payrollAttendanceInputs).mock.calls[0]?.[2],versionsSignal=vi.mocked(hrApi.attendancePayrollVersions).mock.calls[0]?.[2];
 fireEvent.change(screen.getByLabelText("更正原因"),{target:{value:"上一期原因"}});fireEvent.click(screen.getAllByRole("button",{name:"查看汇总"})[1]!);await screen.findByText(/period-b-员工1 ·/);
 expect(signal?.aborted).toBe(true);expect(inputSignal?.aborted).toBe(true);expect(versionsSignal?.aborted).toBe(true);expect(screen.getByLabelText("更正原因")).toHaveValue("");
 await act(async()=>finish([{id:"old-chain",batchNo:999,batchType:"initial",status:"active",summaryVersion:1,employeeCount:1,changedEmployeeCount:0,createdAt:"2026-10-01"}]));expect(screen.queryByText(/批次 #999/)).toBeNull();
});
it("summary page failure clears old employee facts and retry restores the requested page",async()=>{
 render(<HrAttendanceClient/>);await screen.findByText("期间第 1 / 2 页 · 共 25 期");fireEvent.click(screen.getAllByRole("button",{name:"查看汇总"})[0]!);await screen.findByText(/period-a-员工1 ·/);
 vi.mocked(hrApi.attendanceMonthSummaries).mockRejectedValueOnce(new Error("汇总读取失败"));fireEvent.click(screen.getByRole("button",{name:"汇总下一页"}));await screen.findByText("汇总读取失败");expect(screen.queryByText(/period-a-员工1 ·/)).toBeNull();
 fireEvent.click(screen.getByRole("button",{name:"刷新汇总"}));await screen.findByText(/period-a-员工101 ·/);expect(screen.queryByText("汇总读取失败")).toBeNull();
});
it("context replacement aborts private reads and removes old rows without extra permission probes",async()=>{
 const view=render(<HrAttendanceClient/>);await screen.findByText("日员工1 · 2026-10-01");const dailySignal=vi.mocked(hrApi.attendanceDaily).mock.calls[0]?.[4],periodSignal=vi.mocked(hrApi.attendancePeriods).mock.calls[0]?.[4];
 state.user={...state.user,id:"other",permissions:["hr:attendance"]};view.rerender(<HrAttendanceClient/>);expect(dailySignal?.aborted).toBe(true);expect(periodSignal?.aborted).toBe(true);expect(screen.queryByText("日员工1 · 2026-10-01")).toBeNull();expect(hrApi.attendanceDaily).toHaveBeenCalledTimes(1);
 expect(screen.getByText(/无权访问考勤管理/)).toBeInTheDocument();
});
it("successful period close clears its detail and reloads the first period page",async()=>{
 state.user.permissions.push("hr:attendance:close");vi.mocked(hrApi.attendancePeriods).mockResolvedValue(page([period("period-a","2026-10","review")],1,1,24));vi.mocked(hrApi.closeAttendancePeriod).mockResolvedValue(period("period-a","2026-10","closed"));
 render(<HrAttendanceClient/>);await screen.findByText("期间第 1 / 1 页 · 共 1 期");fireEvent.click(screen.getByRole("button",{name:"查看汇总"}));await screen.findByText(/period-a-员工1 ·/);
 fireEvent.click(screen.getByRole("button",{name:"确认封账"}));await screen.findByText("月度考勤期间已更新。");expect(screen.queryByRole("navigation",{name:"员工月汇总分页"})).toBeNull();expect(hrApi.closeAttendancePeriod).toHaveBeenCalledWith("period-a","synthetic-token");expect(hrApi.attendancePeriods).toHaveBeenCalledTimes(2);
});
it("an invalid date range makes no new query and exposes a recoverable local error",async()=>{
 render(<HrAttendanceClient/>);await screen.findByText("日员工1 · 2026-10-01");fireEvent.change(screen.getByLabelText("日结果开始日期"),{target:{value:"2026-10-10"}});await waitFor(()=>expect(hrApi.attendanceDaily).toHaveBeenCalledTimes(2));
 fireEvent.change(screen.getByLabelText("日结果结束日期"),{target:{value:"2026-10-01"}});await screen.findByText("开始日期不能晚于结束日期。");expect(hrApi.attendanceDaily).toHaveBeenCalledTimes(2);expect(within(screen.getByRole("navigation",{name:"日考勤结果分页"})).getByRole("button",{name:"日结果下一页"})).toBeDisabled();
});
it.each(["hr:attendance:read","hr:attendance:team_read"])("daily export collects 101 filtered records with %s using the same token and excludes internal facts",async permission=>{
 state.user.permissions=["hr:attendance",permission];
 vi.mocked(hrApi.attendanceDaily).mockImplementation(async(_token,current=1,size=31,query)=>page(Array.from({length:Math.min(size,101-(current-1)*size)},(_,i)=>({...daily(`${query?.status==="late"?"迟到":""}员工${(current-1)*size+i+1}`),resultStatus:query?.status==="late"?"late":"normal"})),101,current,size));
 render(<HrAttendanceClient/>);await screen.findByText("日结果第 1 / 4 页 · 共 101 条");expect(screen.getByRole("heading",{name:permission==="hr:attendance:read"?"员工日考勤":"团队日考勤"})).toBeInTheDocument();expect(screen.queryByText(/synthetic-version/)).toBeNull();expect(screen.getAllByText("正常 · 工作 480 分钟").length).toBe(31);expect(screen.getByRole("option",{name:"缺勤"})).toHaveValue("absence");
 fireEvent.change(screen.getByLabelText("日结果状态"),{target:{value:"late"}});
 // Wait for the filtered ledger, not a transient enabled button from the previous query.
 await screen.findByText("迟到员工1 · 2026-10-01");
 await waitFor(()=>expect(screen.getByRole("button",{name:"导出筛选日考勤"})).toBeEnabled());
 fireEvent.click(screen.getByRole("button",{name:"导出筛选日考勤"}));await screen.findByText("已导出 101 条匹配日考勤。");
 const calls=vi.mocked(hrApi.attendanceDaily).mock.calls.filter(c=>c[2]===100);
 expect(calls.map(c=>c[1])).toEqual([1,2,1]);expect(calls.every(c=>c[0]==="synthetic-token"&&c[3]?.status==="late"&&c[4] instanceof AbortSignal)).toBe(true);
 const csv=vi.mocked(downloadCsv).mock.calls[0]![0];expect(csv).toContain("迟到员工101");expect(csv).not.toContain("synthetic-version");expect(csv).not.toContain("anomalyCodes");
});
it("self export omits even unexpectedly returned employee identity",async()=>{
 state.user.permissions=["hr:attendance","hr:attendance:self_read"];
 vi.mocked(hrApi.attendanceDaily).mockImplementation(async(_token,current=1,size=31)=>page([daily("不应导出的姓名")],1,current,size));
 render(<HrAttendanceClient/>);await waitFor(()=>expect(screen.getByRole("button",{name:"导出筛选日考勤"})).toBeEnabled());
 fireEvent.click(screen.getByRole("button",{name:"导出筛选日考勤"}));await screen.findByText("已导出 1 条匹配日考勤。");
 expect(screen.getByRole("heading",{name:"我的考勤日历"})).toBeInTheDocument();expect(vi.mocked(downloadCsv).mock.calls[0]![0]).not.toMatch(/员工编号|姓名|不应导出的姓名/);
});
it("changing a daily filter cancels an in-flight export even when the transport returns late",async()=>{
 let finish!:(value:ReturnType<typeof page<HrAttendanceDailyResult>>)=>void;
 vi.mocked(hrApi.attendanceDaily).mockImplementation(async(_token,current=1,size=31)=>page([daily("当前")],1,current,size));
 render(<HrAttendanceClient/>);await waitFor(()=>expect(screen.getByRole("button",{name:"导出筛选日考勤"})).toBeEnabled());
 vi.mocked(hrApi.attendanceDaily).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}));
 fireEvent.click(screen.getByRole("button",{name:"导出筛选日考勤"}));const signal=vi.mocked(hrApi.attendanceDaily).mock.calls.at(-1)![4];
 fireEvent.change(screen.getByLabelText("日结果状态"),{target:{value:"normal"}});expect(signal?.aborted).toBe(true);
 await act(async()=>finish(page([daily("过期")],1,1,100)));expect(downloadCsv).not.toHaveBeenCalled();
});
it("monthly export collects the selected period and refuses a changed summary version",async()=>{
 vi.mocked(hrApi.attendanceMonthSummaries).mockImplementation(async(id,_token,current=1,size=100)=>page(Array.from({length:Math.min(size,101-(current-1)*size)},(_,i)=>summary(`${id}-员工${(current-1)*size+i+1}`)),101,current,size));
 render(<HrAttendanceClient/>);await screen.findByText("期间第 1 / 2 页 · 共 25 期");fireEvent.click(screen.getAllByRole("button",{name:"查看汇总"})[1]!);
 await waitFor(()=>expect(screen.getByRole("button",{name:"导出筛选月考勤汇总"})).toBeEnabled());vi.mocked(hrApi.attendanceMonthSummaries).mockClear();
 fireEvent.click(screen.getByRole("button",{name:"导出筛选月考勤汇总"}));await screen.findByText("已导出 101 条匹配月考勤汇总。");
 const calls=vi.mocked(hrApi.attendanceMonthSummaries).mock.calls;expect(calls.map(c=>c[2])).toEqual([1,2,1]);expect(calls.every(c=>c[0]==="period-b"&&c[1]==="synthetic-token"&&c[3]===100&&c[4] instanceof AbortSignal)).toBe(true);
 expect(vi.mocked(downloadCsv).mock.calls[0]![0]).toContain("2026-09");expect(vi.mocked(downloadCsv).mock.calls[0]![0]).toContain("period-b-员工101");
 vi.mocked(downloadCsv).mockClear();vi.mocked(hrApi.attendanceMonthSummaries).mockImplementation(async(_id,_token,current=1,size=100)=>page([{...summary("changed"),summaryVersion:2}],1,current,size));
 fireEvent.click(screen.getByRole("button",{name:"导出筛选月考勤汇总"}));await screen.findByText("考勤汇总版本已变化，请刷新期间后重新导出。");expect(downloadCsv).not.toHaveBeenCalled();
});
it("switching the selected month permanently cancels its export",async()=>{
 vi.mocked(hrApi.attendanceMonthSummaries).mockImplementation(async(id,_token,current=1,size=100)=>page([summary(id)],1,current,size));
 render(<HrAttendanceClient/>);await screen.findByText("期间第 1 / 2 页 · 共 25 期");fireEvent.click(screen.getAllByRole("button",{name:"查看汇总"})[0]!);
 await waitFor(()=>expect(screen.getByRole("button",{name:"导出筛选月考勤汇总"})).toBeEnabled());
 let finish!:(value:ReturnType<typeof page<HrAttendanceMonthSummary>>)=>void;
 vi.mocked(hrApi.attendanceMonthSummaries).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}));fireEvent.click(screen.getByRole("button",{name:"导出筛选月考勤汇总"}));const signal=vi.mocked(hrApi.attendanceMonthSummaries).mock.calls.at(-1)![4];
 fireEvent.click(screen.getAllByRole("button",{name:"查看汇总"})[1]!);expect(signal?.aborted).toBe(true);await act(async()=>finish(page([summary("过期")],1,1,100)));expect(downloadCsv).not.toHaveBeenCalled();
 await waitFor(()=>expect(screen.getByRole("button",{name:"导出筛选月考勤汇总"})).toBeEnabled());
});
