import assert from "node:assert/strict";
import {after,before,describe,it} from "node:test";
import {setTimeout as delay} from "node:timers/promises";
import {DataSource,type EntityManager} from "typeorm";
import type {JwtPrincipal} from "../../shared/types/jwt-principal";
import * as entities from "./entities/hr.entities";
import {HrService} from "./hr.service";

const required=process.env.HR_ATTENDANCE_SCHEDULE_PG_REQUIRED==="1";
if(required&&(!process.env.POSTGRES_PASSWORD||process.env.POSTGRES_HOST!=="127.0.0.1"||process.env.POSTGRES_PORT!=="55495"||process.env.POSTGRES_DB!=="schedule_gate"))throw new Error("Use the owned loopback schedule_gate fixture on55495");
(required?describe:describe.skip)("Editable attendance schedule PostgreSQL continuity",()=>{
 let db:DataSource,service:HrService,shiftA:string,shiftB:string,shiftC:string,schedule:string,version:number,periodId:string,auditFailure=false,auditReadFailure=false;
 let auditBarrier:(()=>Promise<void>)|null=null;
 const scope={tenantId:"10000001",parkId:"20000001"},user="00000000-0000-4000-8000-00000000d501",employee="00000000-0000-4000-8000-00000000d502",date="2026-09-14";
 const actor:JwtPrincipal={sub:user,username:"synthetic-schedule",...scope,roles:[],permissions:["hr:attendance:operate","hr:attendance:read","hr:attendance:payroll_input_read"]};
 before(async()=>{
  db=new DataSource({type:"postgres",host:"127.0.0.1",port:55495,database:"schedule_gate",username:process.env.POSTGRES_USER??"postgres",password:process.env.POSTGRES_PASSWORD,extra:{application_name:"schedule-continuity-gate"},entities:Object.values(entities).filter(value=>typeof value==="function")});await db.initialize();
  await db.query("CREATE TABLE schedule_gate_audit(event jsonb NOT NULL)");
  const args=Array(32).fill(undefined);args[0]=db.getRepository(entities.HrEmployeeEntity);args[26]=db.getRepository(entities.HrAttendanceRequestEntity);args[30]=db;args[31]={recordOperationRequired:async(event:{method?:string},manager?:EntityManager)=>{if(event.method!=="PUT"){if(auditReadFailure)throw new Error("Synthetic read audit failure");return;}if(auditFailure)throw new Error("Synthetic required audit failure");assert.ok(manager);await manager.query("INSERT INTO schedule_gate_audit(event) VALUES($1::jsonb)",[JSON.stringify(event)]);if(auditBarrier)await auditBarrier()}};service=Reflect.construct(HrService,args) as HrService;
  await db.query("INSERT INTO sys_user(id,tenant_id,park_id,username,display_name,password_hash) VALUES($1,$2,$3,'SCHEDULE-GATE','合成排班运营','not-a-login-hash')",[user,scope.tenantId,scope.parkId]);
  await db.query("INSERT INTO hr_employee(id,tenant_id,park_id,employee_code,full_name,employment_status) VALUES($1,$2,$3,'SCHEDULE-GATE','合成排班员工','active')",[employee,scope.tenantId,scope.parkId]);
  const create=(code:string,startLocal:string,endLocal:string)=>service.createAttendanceShift(scope,actor,{shiftCode:code,shiftName:code,startLocal,endLocal,ruleVersion:code});
  shiftA=(await create("SCHEDULE-A","09:00","18:00")).id;shiftB=(await create("SCHEDULE-B","10:00","19:00")).id;shiftC=(await create("SCHEDULE-C","11:00","20:00")).id;
 });
 after(async()=>{if(!db?.isInitialized)return;
  await db.query("DELETE FROM hr_attendance_payroll_input_item WHERE employee_id=$1",[employee]);
  await db.query("DELETE FROM hr_attendance_payroll_input_batch WHERE create_by=$1",[user]);
  await db.query("DELETE FROM hr_attendance_month_summary WHERE employee_id=$1",[employee]);
  await db.query("DELETE FROM hr_attendance_period WHERE create_by=$1",[user]);
  await db.query("DELETE FROM hr_employee_attendance_daily_result WHERE employee_id=$1",[employee]);
  await db.query("DELETE FROM hr_attendance_calculation_version WHERE triggered_by=$1",[user]);
  await db.query("DELETE FROM hr_attendance_punch_event WHERE employee_id=$1",[employee]);
  await db.query("DELETE FROM hr_employee_schedule WHERE employee_id=$1",[employee]);
  await db.query("DELETE FROM hr_attendance_shift WHERE create_by=$1",[user]);
  await db.query("DELETE FROM hr_employee WHERE id=$1",[employee]);await db.query("DELETE FROM sys_user WHERE id=$1",[user]);await db.query("DROP TABLE schedule_gate_audit");await db.destroy();
 });
 const current=()=>service.getEmployeeSchedule(scope,actor,{employee_id:employee,work_date:date});
 const recalculate=(workDate=date)=>service.recalculateAttendanceDay(scope,actor,{employeeId:employee,workDate,ruleVersion:"unused-draft"});
 const update=(shiftId:string,expectedVersion=version)=>service.updateEmployeeSchedule(scope,actor,schedule,{shiftId,expectedVersion,reason:"正式业务调班核对"});
 const period=async()=>db.getRepository(entities.HrAttendancePeriodEntity).findOneByOrFail({id:periodId});
 it("reads an exact employee/date and creates a single binding with an explicit recalculation state",async()=>{
  assert.equal(await current(),null);const created=await service.createEmployeeSchedule(scope,actor,{employeeId:employee,shiftId:shiftA,workDate:date});schedule=created.id;version=created.version;assert.equal(version,1);assert.equal(created.requiresRecalculation,true);
  await assert.rejects(service.createEmployeeSchedule(scope,actor,{employeeId:employee,shiftId:shiftB,workDate:date}),/already has a schedule/);
  for(const [eventKey,occurredAt,eventType] of [["SCHEDULE-IN",`${date}T09:00:00+08:00`,"clock_in"],["SCHEDULE-OUT",`${date}T18:00:00+08:00`,"clock_out"]] as const)await service.createAttendancePunch(scope,actor,{employeeId:employee,eventKey,occurredAt,eventType,source:"manual"});
  const first=await recalculate();assert.equal(first.earlyMinutes,0);assert.equal((await current())?.requiresRecalculation,false);
  const row=await db.getRepository(entities.HrEmployeeAttendanceDailyResultEntity).findOneByOrFail({id:first.id});assert.equal(row.sourceTrace.scheduleVersion,1);
 });
 it("adjusts by CAS and reason, preserves old results, reopens review and rejects stale monthly inputs",async()=>{
  periodId=(await service.createAttendancePeriod(scope,actor,{periodMonth:"2026-09-01"})).id;await service.calculateAttendancePeriod(scope,actor,periodId);assert.equal((await period()).status,"review");
  const before=await db.query("SELECT id,source_trace,early_minutes FROM hr_employee_attendance_daily_result WHERE employee_id=$1 ORDER BY create_time,id",[employee]);
  const saved=await update(shiftB);version=saved.version;assert.equal(version,2);assert.equal(saved.requiresRecalculation,true);assert.equal((await period()).status,"open");
  assert.deepEqual(await db.query("SELECT id,source_trace,early_minutes FROM hr_employee_attendance_daily_result WHERE employee_id=$1 ORDER BY create_time,id",[employee]),before);
  await assert.rejects(update(shiftA,1),/排班已被更新/);await assert.rejects(service.calculateAttendancePeriod(scope,actor,periodId),/without daily results/);assert.equal((await period()).status,"failed");
  const second=await recalculate();assert.equal(second.earlyMinutes,60);assert.equal((await current())?.requiresRecalculation,false);await service.calculateAttendancePeriod(scope,actor,periodId);assert.equal((await period()).activeVersion,2);
  const summaries=await db.query("SELECT summary_version,early_minutes FROM hr_attendance_month_summary WHERE period_id=$1 ORDER BY summary_version",[periodId]);assert.deepEqual(summaries,[{summary_version:1,early_minutes:0},{summary_version:2,early_minutes:60}]);
 });
 it("keeps closed input immutable and requires a fresh day before the existing correction flow",async()=>{
  await service.closeAttendancePeriod(scope,actor,periodId);const original=await service.payrollAttendanceInputs(scope,actor,periodId);assert.equal(original.items[0]?.earlyMinutes,60);
  const saved=await update(shiftA);version=saved.version;assert.equal((await period()).status,"closed");assert.equal((await service.payrollAttendanceInputs(scope,actor,periodId)).batchId,original.batchId);
  await assert.rejects(service.createAttendanceCorrectionBatch(scope,actor,periodId,{reason:"按正式调班更正"}),/without daily results/);
  await recalculate();const correction=await service.createAttendanceCorrectionBatch(scope,actor,periodId,{reason:"按正式调班更正"});assert.equal(correction.batchNo,2);
  const next=await service.payrollAttendanceInputs(scope,actor,periodId);assert.equal(next.items[0]?.earlyMinutes,0);
  const frozen=await db.getRepository(entities.HrAttendancePayrollInputItemEntity).findOneByOrFail({batchId:original.batchId,employeeId:employee});assert.equal(frozen.earlyMinutes,60);
 });
 it("rejects foreign/denied reads and rolls business state back when required audit fails",async()=>{
  await assert.rejects(service.getEmployeeSchedule(scope,{...actor,permissions:["hr:attendance:self_read"]},{employee_id:employee,work_date:date}),/permission is required/);
  await assert.rejects(service.getEmployeeSchedule({...scope,parkId:"foreign"},actor,{employee_id:employee,work_date:date}),/permission is required/);
  await assert.rejects(service.getEmployeeSchedule(scope,actor,{employee_id:"00000000-0000-4000-8000-00000000d599",work_date:date}),/not found/);
  await assert.rejects(update("00000000-0000-4000-8000-00000000d598"),/班次不可用/);
  const foreign=await service.createAttendanceShift({...scope,parkId:"foreign"},actor,{shiftCode:"SCHEDULE-FOREIGN",shiftName:"范围外班次",startLocal:"09:00",endLocal:"18:00",ruleVersion:"v1"});await assert.rejects(update(foreign.id),/班次不可用/);
  await db.query("UPDATE hr_attendance_shift SET status='disabled' WHERE id=$1",[shiftC]);await assert.rejects(update(shiftC),/班次不可用/);await db.query("UPDATE hr_attendance_shift SET status='enabled' WHERE id=$1",[shiftC]);
  auditReadFailure=true;try{await assert.rejects(current(),/read audit failure/)}finally{auditReadFailure=false}
  assert.deepEqual(Object.keys((await current())!).sort(),["id","employeeId","workDate","shiftId","shiftName","startLocal","endLocal","version","requiresRecalculation"].sort());
  await assert.rejects(service.updateEmployeeSchedule(scope,actor,schedule,{shiftId:shiftB,expectedVersion:version,reason:" "}),/原因/);
  auditFailure=true;try{await assert.rejects(update(shiftB),/required audit failure/)}finally{auditFailure=false}
  assert.equal((await current())?.version,version);assert.equal((await current())?.shiftId,shiftA);assert.equal(Number((await db.query("SELECT count(*)::int AS count FROM schedule_gate_audit"))[0].count),2);
 });
 it("serializes concurrent edits and preserves exactly one CAS winner",async()=>{
  const results=await Promise.allSettled([update(shiftB),update(shiftC)]);assert.equal(results.filter(value=>value.status==="fulfilled").length,1);assert.equal(results.filter(value=>value.status==="rejected").length,1);assert.equal((await current())?.version,version+1);
 });
 async function waitForMonthWaiter(){
  for(let attempt=0;attempt<100;attempt++){const rows=await db.query("SELECT pid FROM pg_stat_activity WHERE application_name='schedule-continuity-gate' AND wait_event_type='Lock'");if(rows.length)return;await delay(20)}throw new Error("Expected an actual PostgreSQL month-lock waiter");
 }
 it("orders schedule-first and calculation-first races without closing stale facts",async()=>{
  const workDate="2026-11-14",row=await service.createEmployeeSchedule(scope,actor,{employeeId:employee,shiftId:shiftA,workDate});await recalculate(workDate);
  const p=(await service.createAttendancePeriod(scope,actor,{periodMonth:"2026-11-01"})).id;
  let release=()=>{},entered=()=>{};const hold=new Promise<void>(done=>{release=done}),atAudit=new Promise<void>(done=>{entered=done});auditBarrier=async()=>{entered();await hold};
  const edit=service.updateEmployeeSchedule(scope,actor,row.id,{shiftId:shiftB,expectedVersion:1,reason:"先调班"});await atAudit;
  const calculation=service.calculateAttendancePeriod(scope,actor,p);await waitForMonthWaiter();release();await edit;auditBarrier=null;await assert.rejects(calculation,/without daily results/);
  await recalculate(workDate);
  const internal=service as unknown as {createAttendanceMonthSummaries:(manager:EntityManager,s:typeof scope,period:entities.HrAttendancePeriodEntity,v:number,userId:string)=>Promise<unknown>},original=internal.createAttendanceMonthSummaries;
  let releaseCalc=()=>{},enteredCalc=()=>{};const calcHold=new Promise<void>(done=>{releaseCalc=done}),atCalc=new Promise<void>(done=>{enteredCalc=done});
  internal.createAttendanceMonthSummaries=async function(...args){enteredCalc();await calcHold;return original.apply(this,args)};
  try{
   const first=service.calculateAttendancePeriod(scope,actor,p);await atCalc;const second=service.updateEmployeeSchedule(scope,actor,row.id,{shiftId:shiftA,expectedVersion:2,reason:"月计算后调班"});await waitForMonthWaiter();releaseCalc();assert.equal((await first).status,"review");await second;
   assert.equal((await db.getRepository(entities.HrAttendancePeriodEntity).findOneByOrFail({id:p})).status,"open");await assert.rejects(service.closeAttendancePeriod(scope,actor,p),/Only reviewed/);
  }finally{releaseCalc();internal.createAttendanceMonthSummaries=original}
 });
});
