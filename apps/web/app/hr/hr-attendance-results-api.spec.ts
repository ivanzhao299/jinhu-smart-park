import assert from "node:assert/strict";
import test from "node:test";
import {hrApi} from "../../lib/hr-api";

test("attendance GET ledgers carry exact paging, date/status filters and cancellation while preserving summary defaults",async()=>{
 const original=globalThis.fetch;
 const calls:Array<{url:string;init?:RequestInit}>=[];
 globalThis.fetch=async(url,init)=>{calls.push({url:String(url),init});return new Response(JSON.stringify({code:0,message:"success",data:{items:[],total:0,page:2,page_size:100}}),{headers:{"Content-Type":"application/json"}})};
 try{
  const controller=new AbortController();
  await hrApi.attendanceDaily(undefined,2,31,{from:"2026-09-01",to:"2026-09-30",status:"late"},controller.signal);
  await hrApi.attendancePeriods(undefined,2,24,"closed",controller.signal);
  await hrApi.attendanceMonthSummaries("synthetic-period",undefined,2,100,controller.signal);
  await hrApi.payrollAttendanceInputs("synthetic-period",undefined,controller.signal);
  await hrApi.attendancePayrollVersions("synthetic-period",undefined,controller.signal);
  await hrApi.attendanceMonthSummaries("synthetic-period");
  assert.deepEqual(calls.map(call=>call.url),[
   "/api/v1/hr/attendance/daily-results?page=2&page_size=31&from=2026-09-01&to=2026-09-30&status=late",
   "/api/v1/hr/attendance/periods?page=2&page_size=24&status=closed",
   "/api/v1/hr/attendance/periods/synthetic-period/summaries?page=2&page_size=100",
   "/api/v1/hr/attendance/periods/synthetic-period/payroll-inputs",
   "/api/v1/hr/attendance/periods/synthetic-period/payroll-input-versions",
   "/api/v1/hr/attendance/periods/synthetic-period/summaries?page=1&page_size=100",
  ]);
  for(const call of calls.slice(0,5))assert.equal(call.init?.signal,controller.signal);
  for(const call of calls)assert.equal(call.init?.method??"GET","GET");
 }finally{globalThis.fetch=original}
});
