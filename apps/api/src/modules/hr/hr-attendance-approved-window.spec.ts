import assert from "node:assert/strict";
import test from "node:test";
import {approvedLeaveMinutesForWindow} from "./hr-attendance-approved-window";
const instant=(time:string)=>new Date(`2026-07-${time}+08:00`);
const leave=(start:string,end:string)=>({requestType:"leave",status:"approved",startAt:instant(start),endAt:instant(end)});
test("saved overnight window counts next-day leave and unions duplicate intersections",()=>{
 const start=instant("31T23:00:00"),end=new Date("2026-08-01T07:00:00+08:00"),row={requestType:"leave",status:"approved",startAt:new Date("2026-08-01T02:00:00+08:00"),endAt:new Date("2026-08-01T04:00:00+08:00")};
 assert.equal(approvedLeaveMinutesForWindow([row,row,{...row,status:"submitted"},{...row,requestType:"overtime"}],start,end),120);
});
test("saved day window excludes touching boundaries and counts overlapping intervals once",()=>{
 assert.equal(approvedLeaveMinutesForWindow([leave("01T05:00:00","01T08:00:00"),leave("01T07:00:00","01T09:00:00"),leave("01T14:00:00","01T15:00:00")],instant("01T06:00:00"),instant("01T14:00:00")),180);
 assert.equal(approvedLeaveMinutesForWindow([],instant("01T06:00:00"),instant("01T14:00:00")),0);
});
