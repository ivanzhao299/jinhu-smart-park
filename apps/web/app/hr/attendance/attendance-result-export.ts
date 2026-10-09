import type {HrAttendanceDailyResult,HrAttendanceMonthSummary} from "../../../lib/hr-api";
import {csvDocument} from "../../../lib/scoped-csv-export";

import {attendanceResultStatusLabel} from "./attendance-result-presentation";
function minutes(value:number){if(!Number.isFinite(value)||value<0)throw Error("考勤数值未完整返回，请刷新后重新导出。");return value;}
function validDate(value:string){const date=new Date(`${value}T00:00:00Z`);return /^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;}
function punchTime(value:string|null){
 if(value===null)return null;
 const date=new Date(value);if(!Number.isFinite(date.getTime()))throw Error("打卡时间无效，请刷新后重新导出。");
 const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Shanghai",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"}).formatToParts(date),values=new Map(parts.map(p=>[p.type,p.value]));
 return `${values.get("year")}-${values.get("month")}-${values.get("day")} ${values.get("hour")}:${values.get("minute")}:${values.get("second")}`;
}
export function attendanceDailyCsv(rows:readonly HrAttendanceDailyResult[],selfOnly:boolean){
 return csvDocument([[...selfOnly?[]:["员工编号","姓名"],"考勤日期","上班打卡时间（北京时间）","下班打卡时间（北京时间）","工作分钟","请假分钟","迟到分钟","早退分钟","考勤状态","已更正"],...rows.map(row=>{
  if(!validDate(row.workDate)||typeof row.resultStatus!=="string"||typeof row.corrected!=="boolean")throw Error("日考勤资料未完整返回，请刷新后重新导出。");
  return [...selfOnly?[]:[row.employeeCode,row.employeeName],row.workDate,punchTime(row.firstInAt),punchTime(row.lastOutAt),minutes(row.workedMinutes),minutes(row.leaveMinutes),minutes(row.lateMinutes),minutes(row.earlyMinutes),attendanceResultStatusLabel(row.resultStatus),row.corrected?"是":"否"];
 })]);
}
export function attendanceMonthCsv(rows:readonly HrAttendanceMonthSummary[],selfOnly:boolean,month:string,version:number){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||!Number.isSafeInteger(version)||version<1)throw Error("请重新选择有效的考勤期间。");
 return csvDocument([[...selfOnly?[]:["员工编号","姓名"],"考勤月份","汇总版本","应出勤天数","正常天数","工作分钟","迟到分钟","早退分钟","缺勤天数","缺卡天数"],...rows.map(row=>{
  if(row.summaryVersion!==version)throw Error("考勤汇总版本已变化，请刷新期间后重新导出。");
  return [...selfOnly?[]:[row.employeeCode,row.employeeName],month,version,minutes(row.scheduledDays),minutes(row.normalDays),minutes(row.workedMinutes),minutes(row.lateMinutes),minutes(row.earlyMinutes),minutes(row.absenceDays),minutes(row.missingPunchDays)];
 })]);
}
