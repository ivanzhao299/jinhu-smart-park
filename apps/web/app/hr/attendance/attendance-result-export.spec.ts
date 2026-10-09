import assert from "node:assert/strict";
import test from "node:test";
import {attendanceDailyCsv,attendanceMonthCsv} from "./attendance-result-export";
import type {HrAttendanceDailyResult,HrAttendanceMonthSummary} from "../../../lib/hr-api";
const daily:HrAttendanceDailyResult={id:"PRIVATE-ID",employeeId:"PRIVATE-EMPLOYEE",employeeCode:"SYN-CODE",employeeName:"=SYNTHETIC()",workDate:"2026-10-01",firstInAt:"2026-09-30T23:30:00Z",lastOutAt:null,workedMinutes:0,leaveMinutes:240,lateMinutes:0,earlyMinutes:0,resultStatus:"normal",anomalyCodes:["PRIVATE-ANOMALY"],corrected:false,calculationVersionId:"PRIVATE-VERSION",isSelf:false};
const monthly:HrAttendanceMonthSummary={id:"PRIVATE-ID",employeeId:"PRIVATE-EMPLOYEE",employeeCode:"SYN-CODE",employeeName:"=SYNTHETIC()",summaryVersion:3,scheduledDays:22,normalDays:21.5,workedMinutes:10320,lateMinutes:0,earlyMinutes:0,absenceDays:0.5,missingPunchDays:0};
test("daily export preserves calendar dates, Beijing punches, blank punches, zeros and escaped formula text",()=>{
 const csv=attendanceDailyCsv([daily],false);assert(csv.startsWith("\uFEFF"));assert(csv.includes("2026-10-01 07:30:00"));assert(csv.includes('"2026-10-01"'));assert(csv.includes('"","0","240","0","0","正常","否"'));assert(csv.includes("'=SYNTHETIC()"));assert(!csv.includes("PRIVATE-"));
 assert(!attendanceDailyCsv([daily],true).match(/姓名|员工编号|SYN-CODE|SYNTHETIC/));
});
test("monthly report retains fractional business days and binds month and version",()=>{
 const csv=attendanceMonthCsv([monthly],false,"2026-10",3);assert(csv.includes('"2026-10","3","22","21.5","10320","0","0","0.5","0"'));assert(!csv.includes("PRIVATE-"));assert(!attendanceMonthCsv([monthly],true,"2026-10",3).match(/姓名|员工编号|SYN-CODE|SYNTHETIC/));
 assert.throws(()=>attendanceMonthCsv([monthly],false,"2026-10",4),/版本已变化/);assert.throws(()=>attendanceMonthCsv([],false,"2026-13",3),/有效的考勤期间/);assert.throws(()=>attendanceMonthCsv([],false,"2026-10",0),/有效的考勤期间/);
});
test("unknown status remains explicit and malformed source facts do not become a plausible report",()=>{
 assert(attendanceDailyCsv([{...daily,resultStatus:"future-status"}],false).includes("未识别状态：future-status"));
 for(const change of [{workDate:"2026-02-30"},{firstInAt:"invalid"},{workedMinutes:NaN},{leaveMinutes:-1}])assert.throws(()=>attendanceDailyCsv([{...daily,...change}],false));
 assert.throws(()=>attendanceMonthCsv([{...monthly,normalDays:NaN}],false,"2026-10",3));
});
