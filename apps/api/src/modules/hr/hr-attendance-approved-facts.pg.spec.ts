import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {after,before,describe,it} from "node:test";
import {setTimeout as delay} from "node:timers/promises";
import {DataSource,type EntityManager} from "typeorm";
import type {JwtPrincipal} from "../../shared/types/jwt-principal";
import * as entities from "./entities/hr.entities";
import {HrService} from "./hr.service";

const required=process.env.HR_ATTENDANCE_APPROVED_FACT_PG_REQUIRED==="1";
const localFixture=process.env.POSTGRES_PORT==="55498"&&process.env.POSTGRES_DB==="approved_fact_gate";
const ciFixture=process.env.APP_ENV==="ci"&&process.env.POSTGRES_PORT==="5432"&&process.env.POSTGRES_DB==="jinhu_release_smoke";
if(required&&(!process.env.POSTGRES_PASSWORD||process.env.POSTGRES_HOST!=="127.0.0.1"||(!localFixture&&!ciFixture)))throw new Error("Use the owned loopback approved_fact_gate fixture or disposable release-smoke database");
(required?describe:describe.skip)("Approved attendance facts PostgreSQL continuity",()=>{
 let db:DataSource,service:HrService;
 let notificationBarrier:(()=>Promise<void>)|null=null;
 const scope={tenantId:"10000001",parkId:"20000001"},employeeUser=randomUUID(),reviewerUser=randomUUID(),employeeId=randomUUID();
 const employee:JwtPrincipal={sub:employeeUser,username:"synthetic-fact-employee",...scope,roles:[],permissions:[]};
 const reviewer:JwtPrincipal={sub:reviewerUser,username:"synthetic-fact-reviewer",...scope,roles:[],permissions:["hr:attendance:read","hr:attendance:operate","hr:attendance:payroll_input_read"]};
 before(async()=>{
  db=new DataSource({type:"postgres",host:"127.0.0.1",port:Number(process.env.POSTGRES_PORT),database:process.env.POSTGRES_DB,username:process.env.POSTGRES_USER??"postgres",password:process.env.POSTGRES_PASSWORD,extra:{application_name:"approved-fact-gate"},entities:Object.values(entities).filter(value=>typeof value==="function")});await db.initialize();
  await db.query("INSERT INTO sys_user(id,tenant_id,park_id,username,display_name,password_hash) VALUES($1,$2,$3,'FACT-EMPLOYEE','合成员工','not-a-login-hash'),($4,$2,$3,'FACT-REVIEWER','合成审批人','not-a-login-hash')",[employeeUser,scope.tenantId,scope.parkId,reviewerUser]);
  await db.query("INSERT INTO hr_employee(id,tenant_id,park_id,employee_code,full_name,user_id,employment_status) VALUES($1,$2,$3,'FACT-EMPLOYEE','合成员工',$4,'active')",[employeeId,scope.tenantId,scope.parkId,employeeUser]);
  const args=Array(32).fill(undefined);args[0]=db.getRepository(entities.HrEmployeeEntity);args[18]=db.getRepository(entities.HrApprovalRequestEntity);args[26]=db.getRepository(entities.HrAttendanceRequestEntity);args[29]={publishAttendanceRequestSubmitted:async()=>undefined,publishAttendanceRequestReviewed:async()=>{if(notificationBarrier)await notificationBarrier()}};args[30]=db;args[31]={recordOperationRequired:async()=>undefined};service=Reflect.construct(HrService,args) as HrService;
 });
 after(async()=>{if(!db?.isInitialized)return;
  await db.query("DELETE FROM hr_attendance_payroll_input_item WHERE employee_id=$1",[employeeId]);
  await db.query("DELETE FROM hr_attendance_payroll_input_batch WHERE create_by=$1",[reviewerUser]);
  await db.query("DELETE FROM hr_attendance_month_summary WHERE employee_id=$1",[employeeId]);
  await db.query("DELETE FROM hr_attendance_period WHERE create_by=$1",[reviewerUser]);
  await db.query("DELETE FROM hr_employee_attendance_daily_result WHERE employee_id=$1",[employeeId]);
  await db.query("DELETE FROM hr_attendance_calculation_version WHERE triggered_by=$1",[reviewerUser]);
  await db.query("DELETE FROM hr_employee_schedule WHERE employee_id=$1",[employeeId]);
  await db.query("DELETE FROM hr_attendance_shift WHERE create_by=$1",[reviewerUser]);
  await db.query("DELETE FROM hr_approval_action WHERE request_id IN(SELECT id FROM hr_approval_request WHERE create_by=$1)",[employeeUser]);
  await db.query("DELETE FROM hr_attendance_request WHERE create_by=$1",[employeeUser]);
  await db.query("DELETE FROM hr_approval_request WHERE create_by=$1",[employeeUser]);
  await db.query("DELETE FROM hr_employee WHERE id=$1",[employeeId]);await db.query("DELETE FROM sys_user WHERE id IN($1,$2)",[employeeUser,reviewerUser]);await db.destroy();
 });
 const recalculate=(workDate:string)=>service.recalculateAttendanceDay(scope,reviewer,{employeeId,workDate,ruleVersion:"fact-v1"});
 const period=(id:string)=>db.getRepository(entities.HrAttendancePeriodEntity).findOneByOrFail({id});
 async function submitted(date:string){const row=await service.createAttendanceRequest(scope,employee,{requestType:"correction",attendanceDate:date,reason:"合成正式更正核对"});await service.submitAttendanceRequest(scope,employee,row.id);return row;}
 const approve=(id:string)=>service.reviewAttendanceRequest(scope,reviewer,id,"approve",{});
 async function waitForMonthWaiter(){for(let n=0;n<100;n++){const rows=await db.query("SELECT pid FROM pg_stat_activity WHERE application_name='approved-fact-gate' AND wait_event_type='Lock' AND wait_event='advisory'");if(rows.length)return;await delay(20)}throw new Error("Expected an actual PostgreSQL month advisory-lock waiter");}
 it("allows closed-period late approval only through fresh-day correction and preserves original payroll quantities",async()=>{
  const workDate="2027-01-15",shift=await service.createAttendanceShift(scope,reviewer,{shiftCode:"FACT-DAY",shiftName:"合成日班",startLocal:"09:00",endLocal:"18:00",ruleVersion:"fact-v1"});await service.createEmployeeSchedule(scope,reviewer,{employeeId,shiftId:shift.id,workDate});await recalculate(workDate);
  const p=await service.createAttendancePeriod(scope,reviewer,{periodMonth:"2027-01-01"});await service.calculateAttendancePeriod(scope,reviewer,p.id);await service.closeAttendancePeriod(scope,reviewer,p.id);
  const original=await service.payrollAttendanceInputs(scope,reviewer,p.id);assert.equal(original.items[0]?.missingPunchDays,1);
  const request=await submitted(workDate);await approve(request.id);assert.equal((await period(p.id)).status,"closed");assert.equal((await service.payrollAttendanceInputs(scope,reviewer,p.id)).batchId,original.batchId);
  await assert.rejects(service.createAttendanceCorrectionBatch(scope,reviewer,p.id,{reason:"补批后更正"}),/daily request sources changed/);
  await recalculate(workDate);assert.equal((await service.createAttendanceCorrectionBatch(scope,reviewer,p.id,{reason:"补批后更正"})).batchNo,2);
  assert.equal((await service.payrollAttendanceInputs(scope,reviewer,p.id)).items[0]?.missingPunchDays,0);
  assert.equal((await db.getRepository(entities.HrAttendancePayrollInputItemEntity).findOneByOrFail({batchId:original.batchId,employeeId})).missingPunchDays,1);
 });
 it("requires a no-schedule approved day and accepts its actual matching daily source after recalculation",async()=>{
  const workDate="2027-02-15",request=await submitted(workDate);await approve(request.id);const p=await service.createAttendancePeriod(scope,reviewer,{periodMonth:"2027-02-01"});
  await assert.rejects(service.calculateAttendancePeriod(scope,reviewer,p.id),/approved requests without recalculated daily results/);
  const daily=await recalculate(workDate);assert.equal((await service.calculateAttendancePeriod(scope,reviewer,p.id)).status,"review");
  for(const trace of [{},{approvedRequestSources:[]}]){await db.query("UPDATE hr_employee_attendance_daily_result SET source_trace=$2::jsonb WHERE id=$1",[daily.id,JSON.stringify(trace)]);await db.query("UPDATE hr_attendance_period SET status='open' WHERE id=$1",[p.id]);await assert.rejects(service.calculateAttendancePeriod(scope,reviewer,p.id),/daily request sources changed/);}
  await recalculate(workDate);assert.equal((await service.calculateAttendancePeriod(scope,reviewer,p.id)).status,"review");
 });
 it("serializes approval-first and calculation-first races without approving a stale month",async()=>{
  const date="2027-03-15";await recalculate(date);const p=await service.createAttendancePeriod(scope,reviewer,{periodMonth:"2027-03-01"}),request=await submitted(date);
  let release=()=>{},entered=()=>{};const hold=new Promise<void>(done=>{release=done}),atNotification=new Promise<void>(done=>{entered=done});notificationBarrier=async()=>{entered();await hold};
  const approval=approve(request.id);await atNotification;const calculation=service.calculateAttendancePeriod(scope,reviewer,p.id);
  try{await waitForMonthWaiter();release();await approval;await assert.rejects(calculation,/daily request sources changed/);}finally{release();notificationBarrier=null;await Promise.allSettled([approval,calculation]);}
  await recalculate(date);await service.calculateAttendancePeriod(scope,reviewer,p.id);
  const date2="2027-04-15";await recalculate(date2);const p2=await service.createAttendancePeriod(scope,reviewer,{periodMonth:"2027-04-01"}),request2=await submitted(date2);
  const internal=service as unknown as {createAttendanceMonthSummaries:(m:EntityManager,s:typeof scope,p:entities.HrAttendancePeriodEntity,v:number,u:string)=>Promise<unknown>},original=internal.createAttendanceMonthSummaries;
  let releaseCalc=()=>{},enteredCalc=()=>{};const calcHold=new Promise<void>(done=>{releaseCalc=done}),atCalc=new Promise<void>(done=>{enteredCalc=done});internal.createAttendanceMonthSummaries=async function(...args){enteredCalc();await calcHold;return original.apply(this,args)};
  const first=service.calculateAttendancePeriod(scope,reviewer,p2.id);await atCalc;const second=approve(request2.id);
  try{await waitForMonthWaiter();releaseCalc();assert.equal((await first).status,"review");await second;assert.equal((await period(p2.id)).status,"open");await assert.rejects(service.closeAttendancePeriod(scope,reviewer,p2.id),/Only reviewed/);}finally{releaseCalc();internal.createAttendanceMonthSummaries=original;await Promise.allSettled([first,second]);}
  await recalculate(date2);assert.equal((await service.calculateAttendancePeriod(scope,reviewer,p2.id)).status,"review");
 });
 it("rejects approval when the request version and dates drift while awaiting its month lock",async()=>{
  const request=await submitted("2027-05-15"),blocker=db.createQueryRunner();await blocker.connect();await blocker.startTransaction();
  const internal=service as unknown as {lockAttendanceMonth:(m:EntityManager,s:typeof scope,month:string)=>Promise<void>};await internal.lockAttendanceMonth(blocker.manager,scope,"2027-05-01");
  const review=approve(request.id);
  try{await waitForMonthWaiter();await db.query("UPDATE hr_attendance_request SET attendance_date='2027-06-15',version=version+1 WHERE id=$1",[request.id]);await blocker.commitTransaction();await assert.rejects(review,/request changed/);assert.equal((await db.getRepository(entities.HrAttendanceRequestEntity).findOneByOrFail({id:request.id})).status,"submitted");}finally{if(blocker.isTransactionActive)await blocker.rollbackTransaction();await blocker.release();await Promise.allSettled([review]);}
 });
 it("keeps a reviewed month unchanged on return and refuses stale same-employee daily snapshots at close",async()=>{
  const date="2027-07-15";await recalculate(date);const p=await service.createAttendancePeriod(scope,reviewer,{periodMonth:"2027-07-01"});await service.calculateAttendancePeriod(scope,reviewer,p.id);const request=await submitted(date);await service.reviewAttendanceRequest(scope,reviewer,request.id,"reject",{comment:"补充核对"});assert.equal((await period(p.id)).status,"review");
  await recalculate(date);
  // Reproduce an existing stale review projection while retaining the real new daily version.
  await db.query("UPDATE hr_attendance_period SET status='review' WHERE id=$1",[p.id]);
  await assert.rejects(service.closeAttendancePeriod(scope,reviewer,p.id),/daily facts changed/);assert.equal((await period(p.id)).status,"review");
 });
});
