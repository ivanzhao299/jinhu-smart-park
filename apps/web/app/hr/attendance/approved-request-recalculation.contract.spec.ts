import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const read=(name:string)=>readFileSync(resolve(__dirname,name),"utf8");

test("approved request recalculation keeps a bounded sequential plan and per-date retry keys",()=>{
 const component=read("ApprovedRequestRecalculation.tsx"),api=read("../../../lib/hr-api.ts");
 assert.match(api,/attendanceRequestRecalculationPlan:/);
 assert.match(api,/recalculateAttendance:\(body:object,token\?:string,idempotencyKey\?:string\)/);
 assert.match(component,/plan\.workDates\.length<=32/);
 assert.match(component,/for\(const date of current\.workDates\)/);
 assert.match(component,/if\(stopRequested\.current\)break/);
 assert.match(component,/const key=keys\.current\.get\(date\)\?\?crypto\.randomUUID\(\)/);
 assert.match(component,/keys\.current\.set\(date,key\)/);
 assert.match(component,/if\(completedDates\.current\.has\(date\)\)continue/);
 assert.match(component,/后续日期尚未发出/);
 assert.match(component,/停止后续日期/);
});

test("approved request recalculation stops for plan drift and separates refresh failures from committed dates",()=>{
 const component=read("ApprovedRequestRecalculation.tsx"),workflow=read("AttendanceRequestWorkflow.tsx");
 assert.match(component,/if\(!samePlan\(planRef\.current,current\)\)/);
 assert.match(component,/申请版本、员工或日期范围已变化/);
 assert.match(component,/await onRecalculated\(\)/);
 assert.match(component,/已成功办理的日期保持不变/);
 assert.match(component,/mounted\.current=false;stopRequested\.current=true/);
 assert.match(workflow,/canOperate&&row\.status==="approved"/);
 assert.match(workflow,/ApprovedRequestRecalculation/);
});
