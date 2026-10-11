import {fireEvent,render,screen} from "@testing-library/react";
import {expect,it} from "vitest";
import {AttendancePayrollLeaveFacts} from "../../app/hr/attendance/AttendancePayrollLeaveFacts";
import type {HrAttendancePayrollInput} from "../../lib/hr-api";
it("frozen leave facts show unknown and zero separately and page the whole selected batch",()=>{
 const input:HrAttendancePayrollInput={periodId:"period",periodMonth:"2026-07-01",batchId:"batch",batchNo:1,batchType:"close",summaryVersion:1,items:Array.from({length:21},(_,i)=>({id:String(i),employeeId:String(i),employeeCode:`SYN-${i}`,employeeName:`合成人员${i}`,approvedLeaveMinutes:i===0?null:i===1?0:125,workedMinutes:0,lateMinutes:0,earlyMinutes:0,absenceDays:0,missingPunchDays:0}))};
 render(<AttendancePayrollLeaveFacts input={input}/>);fireEvent.click(screen.getByText(/封账工资输入的批准请假数量/));
 expect(screen.getByText("批准请假：未提供")).toBeInTheDocument();expect(screen.getByText("批准请假：0 分钟")).toBeInTheDocument();expect(screen.queryByText("合成人员20 · SYN-20")).toBeNull();
 fireEvent.click(screen.getByRole("button",{name:"下一页"}));expect(screen.getByText("合成人员20 · SYN-20")).toBeInTheDocument();expect(screen.getByRole("button",{name:"下一页"})).toBeDisabled();
});
