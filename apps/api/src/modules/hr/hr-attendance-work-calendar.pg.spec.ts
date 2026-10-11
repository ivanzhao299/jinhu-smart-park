import "reflect-metadata";
import assert from "node:assert/strict";
import {after,before,describe,it} from "node:test";
import {DataSource,type EntityManager} from "typeorm";
import {HrAttendanceWorkCalendarService} from "./hr-attendance-work-calendar.service";
import type {AuditService} from "../audit/audit.service";
import type {JwtPrincipal} from "../../shared/types/jwt-principal";
const required=process.env.HR_WORK_CALENDAR_PG_REQUIRED==="1";
if(required&&(process.env.POSTGRES_HOST!=="127.0.0.1"||process.env.POSTGRES_PORT!=="15432"||process.env.POSTGRES_DB!=="jinhu_hr_migration_lab_review_calendar_20261011"||!process.env.POSTGRES_PASSWORD))throw new Error("Use the exclusively owned current-migration work-calendar fixture");
(required?describe:describe.skip)("Work calendar real PostgreSQL atomic continuity",()=>{
 let db:DataSource,service:HrAttendanceWorkCalendarService,fail=false;
 const scope={tenantId:"10000001",parkId:"20000001"},date="2026-07-01";
 const actor={...scope,sub:"00000000-0000-4000-8000-00000000da01",username:"synthetic-calendar",permissions:["hr:attendance:operate"],roles:[]} as JwtPrincipal;
 before(async()=>{
  db=new DataSource({type:"postgres",host:"127.0.0.1",port:15432,username:"jinhu",database:process.env.POSTGRES_DB,password:process.env.POSTGRES_PASSWORD});await db.initialize();
  await db.query("CREATE TABLE calendar_gate_audit(event jsonb NOT NULL)");
  await db.query("INSERT INTO sys_user(id,tenant_id,park_id,username,display_name,password_hash) VALUES($1,$2,$3,'CALENDAR-GATE','合成日历人员','not-a-login-hash')",[actor.sub,scope.tenantId,scope.parkId]);
  const audit={recordOperationRequired:async(event:{method:string},manager?:EntityManager)=>{if(fail)throw new Error("Required audit failure");if(event.method==='PUT'){assert.ok(manager);await manager.query("INSERT INTO calendar_gate_audit(event) VALUES($1::jsonb)",[JSON.stringify(event)])}}};
  service=new HrAttendanceWorkCalendarService(db,audit as unknown as AuditService);
 });
 after(async()=>{if(db?.isInitialized)await db.destroy();}); // The runner drops the entire owned database; immutable history is never bypassed.
 const write=(version:number,kind:"working"|"rest"|"statutory_holiday"|"unset"="working")=>service.put(scope,actor,date,{expectedVersion:version,dayKind:kind,dayName:"合成日历设置",reason:"合成业务核对"});
 it("creates a date without inventing missing dates and preserves all monthly facts",async()=>{
  assert.deepEqual((await service.list(scope,actor,{from:date,to:"2026-07-31"})).items,[]);
  const before=await db.query("SELECT (SELECT count(*)::int FROM hr_employee_schedule) schedules,(SELECT count(*)::int FROM hr_employee_attendance_daily_result) daily,(SELECT count(*)::int FROM hr_attendance_payroll_input_batch) inputs");
  const saved=await write(0);assert.equal(saved.version,1);assert.equal(saved.workDate,date);
  const list=await service.list(scope,actor,{from:date,to:"2026-07-31"});assert.equal(list.items.length,1);
  assert.deepEqual(await db.query("SELECT (SELECT count(*)::int FROM hr_employee_schedule) schedules,(SELECT count(*)::int FROM hr_employee_attendance_daily_result) daily,(SELECT count(*)::int FROM hr_attendance_payroll_input_batch) inputs"),before);
  await assert.rejects(write(0),/已变化/);
 });
 it("serializes concurrent CAS edits with exactly one winner",async()=>{
  const results=await Promise.allSettled([write(1,"rest"),write(1,"statutory_holiday")]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);
  assert.equal((await service.history(scope,actor,date,{page:1,page_size:20})).total,2);
 });
 it("rolls current row history and required audit back atomically",async()=>{
  const before=await service.list(scope,actor,{from:date,to:date});const audits=await db.query("SELECT count(*)::int count FROM calendar_gate_audit");
  fail=true;try{await assert.rejects(write(2),/audit failure/)}finally{fail=false}
  assert.deepEqual(await service.list(scope,actor,{from:date,to:date}),before);assert.equal((await service.history(scope,actor,date,{page:1,page_size:20})).total,2);assert.deepEqual(await db.query("SELECT count(*)::int count FROM calendar_gate_audit"),audits);
 });
 it("retains unset history and pages every version without mutating prior rows",async()=>{
  for(let version=2;version<23;version++)await write(version,version===22?"unset":"working");
  const current=(await service.list(scope,actor,{from:date,to:date})).items[0]!;assert.equal(current.version,23);assert.equal(current.dayKind,"unset");
  const first=await service.history(scope,actor,date,{page:1,page_size:20}),second=await service.history(scope,actor,date,{page:2,page_size:20});assert.equal(first.total,23);assert.equal(first.items.length,20);assert.equal(second.items.length,3);assert.equal(new Set([...first.items,...second.items].map(row=>row.id)).size,23);
  await assert.rejects(db.query("UPDATE hr_attendance_work_calendar_history SET change_reason='changed' WHERE calendar_id=$1",[current.id]),/append-only/);
  await assert.rejects(db.query("DELETE FROM hr_attendance_work_calendar_history WHERE calendar_id=$1",[current.id]),/append-only/);
 });
 it("returns no foreign-park rows or history and refuses cross-scope actors",async()=>{
  const foreign={...scope,parkId:"foreign-calendar"},other={...actor,...foreign};
  assert.equal((await service.list(foreign,other,{from:date,to:date})).items.length,0);assert.equal((await service.history(foreign,other,date,{page:1,page_size:20})).total,0);
  await assert.rejects(service.list(foreign,actor,{from:date,to:date}),/权限不足/);
 });
});
