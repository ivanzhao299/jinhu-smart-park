import assert from "node:assert/strict";
import test from "node:test";
import { approvedLeaveMinutesForWorkDate,projectLeaveRoutineImpact,projectLeaveRoutineSegments } from "./hr-leave-routine-equivalence";

test("bs_readfromLeave family keeps historical branches visible but normalizes every day to minute precision",()=>{
 const segments=projectLeaveRoutineSegments(new Date("2026-09-01T10:00:00+08:00"),new Date("2026-09-03T15:00:00+08:00"));
 assert.deepEqual(segments,[
  {workDate:"2026-09-01",branch:"first_insert",legacyHours:7,modernMinutes:420},
  {workDate:"2026-09-02",branch:"middle_select",legacyHours:8,modernMinutes:480},
  {workDate:"2026-09-03",branch:"final_select",legacyHours:6,modernMinutes:360},
 ]);
 assert.equal(segments.reduce((sum,row)=>sum+row.modernMinutes,0),1260);
});

test("single-day, outside-work-window and null inputs cover dormant and negative paths",()=>{
 assert.deepEqual(projectLeaveRoutineSegments(null,new Date("2026-09-01T17:00:00+08:00")),[]);
 assert.deepEqual(projectLeaveRoutineSegments(new Date("2026-09-01T17:00:00+08:00"),new Date("2026-09-01T08:00:00+08:00")),[]);
 assert.deepEqual(projectLeaveRoutineSegments(new Date("2026-09-01T08:00:00+08:00"),new Date("2026-10-03T08:00:00+08:00")),[]);
 assert.deepEqual(projectLeaveRoutineSegments(new Date("2026-09-01T18:00:00+08:00"),new Date("2026-09-01T19:00:00+08:00")),[
  {workDate:"2026-09-01",branch:"single_first_insert",legacyHours:-1,modernMinutes:0},
 ]);
});

test("only approved leave contributes effective attendance minutes",()=>{
 const base={requestType:"leave",startAt:new Date("2026-09-01T08:00:00+08:00"),endAt:new Date("2026-09-01T12:00:00+08:00")};
 assert.deepEqual(projectLeaveRoutineImpact({...base,status:"submitted"}),{plannedMinutes:180,effectiveMinutes:0,dayCount:1,segments:[{workDate:"2026-09-01",branch:"single_first_insert",legacyHours:9,modernMinutes:180}]});
 assert.equal(projectLeaveRoutineImpact({...base,status:"approved"}).effectiveMinutes,180);
 assert.equal(approvedLeaveMinutesForWorkDate([{...base,status:"approved"},{...base,status:"cancelled"},{...base,requestType:"overtime",status:"approved"}],"2026-09-01"),180);
});
