import {fireEvent,render,screen} from "@testing-library/react";
import {expect,it} from "vitest";
import {AttendancePayrollLeaveFacts} from "../../app/hr/attendance/AttendancePayrollLeaveFacts";
import type {HrAttendancePayrollInput} from "../../lib/hr-api";
it("frozen leave facts show unknown and zero separately and page the whole selected batch",()=>{
 const input:HrAttendancePayrollInput={periodId:"period",periodMonth:"2026-07-01",batchId:"batch",batchNo:1,batchType:"close",summaryVersion:1,items:Array.from({length:21},(_,i)=>({id:String(i),employeeId:String(i),employeeCode:`SYN-${i}`,employeeName:`合成人员${i}`,approvedLeaveMinutes:i===0?null:i===1?0:125,workedMinutes:0,lateMinutes:0,earlyMinutes:0,absenceDays:0,missingPunchDays:0}))};
 render(<AttendancePayrollLeaveFacts input={{...input,items:input.items.map((item,i)=>({...item,approvedOvertimeMs:i===0?"0":i===1?null:i===2?({} as unknown as string):undefined,approvedBusinessTripMs:i===0?"3601001":undefined,approvedBusinessTripDeclaredDays:i===0?"0":i===1?null:i===2?"7":undefined}))}}/>);fireEvent.click(screen.getByText(/封账工资输入的考勤数量/));
 expect(screen.getByText("批准请假：未提供")).toBeInTheDocument();expect(screen.getByText("批准请假：0 分钟")).toBeInTheDocument();expect(screen.getByText("批准加班区间：0 秒")).toBeInTheDocument();expect(screen.getByText("批准加班区间：待核对")).toBeInTheDocument();expect(screen.getByText("批准加班区间：数量待核对")).toBeInTheDocument();expect(screen.getByText("批准出差区间：1 小时 1.001 秒")).toBeInTheDocument();expect(screen.getByText("批准出差申报天数：0 天")).toBeInTheDocument();expect(screen.getByText("批准出差申报天数：待核对")).toBeInTheDocument();expect(screen.getByText("批准出差申报天数：7 天")).toBeInTheDocument();expect(screen.queryByText("合成人员20 · SYN-20")).toBeNull();
 fireEvent.click(screen.getByRole("button",{name:"下一页"}));expect(screen.getByText("合成人员20 · SYN-20")).toBeInTheDocument();expect(screen.getByRole("button",{name:"下一页"})).toBeDisabled();
});
