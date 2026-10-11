import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {after,before,describe,it} from "node:test";
import {DataSource,type EntityManager} from "typeorm";
import {setTimeout as delay} from "node:timers/promises";
import type {JwtPrincipal} from "../../shared/types/jwt-principal";
import {HR_ENTITIES,HrAttendanceRequestEntity,HrEmployeeEntity,HrEmployeeAttendanceDailyResultEntity,HrAttendancePeriodEntity,HrAttendancePayrollInputItemEntity} from "./entities/hr.entities";
import {HrService} from "./hr.service";
const enabled=process.env.HR_ATTENDANCE_OVERNIGHT_PG_REQUIRED==="1";
const owned=process.env.POSTGRES_HOST==="127.0.0.1"&&((process.env.POSTGRES_PORT==="55498"&&process.env.POSTGRES_DB==="approved_fact_gate")||(process.env.APP_ENV==="ci"&&process.env.POSTGRES_PORT==="5432"&&process.env.POSTGRES_DB==="jinhu_release_smoke"));
if(enabled&&(!owned||!process.env.POSTGRES_PASSWORD))throw new Error("Use only the owned loopback overnight fixture or disposable release smoke");
(enabled?describe:describe.skip)("scheduled overnight approved attendance facts",()=>{
 let db:DataSource,service:HrService;const scope={tenantId:"10000001",parkId:"20000001"},user=randomUUID(),reviewer=randomUUID(),employee=randomUUID();
 const actor:JwtPrincipal={sub:reviewer,username:"synthetic-overnight",...scope,roles:[],permissions:["hr:attendance:operate","hr:attendance:read","hr:attendance:payroll_input_read"]};
 before(async()=>{
  db=new DataSource({type:"postgres",host:"127.0.0.1",port:Number(process.env.POSTGRES_PORT),database:process.env.POSTGRES_DB,username:process.env.POSTGRES_USER??"postgres",password:process.env.POSTGRES_PASSWORD,extra:{application_name:"overnight-facts-gate"},entities:HR_ENTITIES});await db.initialize();
  await db.query("INSERT INTO sys_user(id,tenant_id,park_id,username,display_name,password_hash)VALUES($1,$2,$3,$4,'合成夜班测试','not-a-login-hash')",[user,scope.tenantId,scope.parkId,'OVERNIGHT-'+user]);
  await db.query("INSERT INTO sys_user(id,tenant_id,park_id,username,display_name,password_hash)VALUES($1,$2,$3,$4,'合成复核人','not-a-login-hash')",[reviewer,scope.tenantId,scope.parkId,'REVIEW-'+reviewer]);
  await db.query("INSERT INTO hr_employee(id,tenant_id,park_id,employee_code,full_name,user_id,employment_status)VALUES($1,$2,$3,$4,'合成夜班员工',$5,'active')",[employee,scope.tenantId,scope.parkId,'OVERNIGHT-'+employee,user]);
  service=Object.create(HrService.prototype) as HrService;Object.defineProperties(service,{dataSource:{value:db},employees:{value:db.getRepository(HrEmployeeEntity)},attendanceRequests:{value:db.getRepository(HrAttendanceRequestEntity)},auditService:{value:{recordOperationRequired:async()=>undefined}},notifications:{value:{publishAttendanceRequestSubmitted:async()=>undefined,publishAttendanceRequestReviewed:async()=>undefined}}});
 });
 after(async()=>{if(db?.isInitialized)await db.destroy();});
 it("counts next-day02:00–04:00 approved leave in the preceding23:00–07:00 scheduled work day",async()=>{
  const shift=await service.createAttendanceShift(scope,actor,{shiftCode:'NIGHT-'+randomUUID(),shiftName:"合成夜班",startLocal:"23:00",endLocal:"07:00",ruleVersion:"scheduled-night-1"});
  await service.createEmployeeSchedule(scope,actor,{employeeId:employee,shiftId:shift.id,workDate:"2040-08-31"});const leave=randomUUID();
  await db.query("INSERT INTO hr_attendance_request(id,tenant_id,park_id,request_no,employee_id,request_type,start_at,end_at,duration_minutes,reason,status)VALUES($1,$2,$3,$4,$5,'leave','2040-09-01T02:00:00+08:00','2040-09-01T04:00:00+08:00',120,'合成夜班请假','approved')",[leave,scope.tenantId,scope.parkId,'ATT-'+leave,employee]);
  const result=await service.recalculateAttendanceDay(scope,actor,{employeeId:employee,workDate:"2040-08-31",ruleVersion:"unused-draft"});assert.equal(result.leaveMinutes,120);
  const stored=await db.getRepository(HrEmployeeAttendanceDailyResultEntity).findOneByOrFail({id:result.id});assert.ok((stored.sourceTrace.approvedRequestSources as Array<{id:string}>).some(s=>s.id===leave));
  const plan=await service.attendanceRequestRecalculationPlan(scope,actor,leave);assert.deepEqual(plan.workDates,["2040-08-31","2040-09-01"]);
 });
 const day=(workDate:string)=>service.recalculateAttendanceDay(scope,actor,{employeeId:employee,workDate,ruleVersion:"unused"});
 async function shiftDay(workDate:string,startLocal="23:00",endLocal="07:00"){
  const shift=await service.createAttendanceShift(scope,actor,{shiftCode:"SHIFT-"+randomUUID(),shiftName:"合成班次",startLocal,endLocal,ruleVersion:"saved-window-1"});
  return service.createEmployeeSchedule(scope,actor,{employeeId:employee,shiftId:shift.id,workDate});
 }
 async function approved(startAt:string,endAt:string,status="approved",requestType="leave"){
  const id=randomUUID();await db.query("INSERT INTO hr_attendance_request(id,tenant_id,park_id,request_no,employee_id,request_type,start_at,end_at,duration_minutes,reason,status)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'合成区间',$10)",[id,scope.tenantId,scope.parkId,"REQ-"+id,employee,requestType,startAt,endAt,(new Date(endAt).getTime()-new Date(startAt).getTime())/60000,status]);return id;
 }
 it("uses actual day-shift hours, merges overlapping leave, and excludes touching, unapproved and other-type intervals",async()=>{
  await shiftDay("2040-10-10","06:00","14:00");
  await approved("2040-10-10T05:00:00+08:00","2040-10-10T08:00:00+08:00");
  await approved("2040-10-10T07:00:00+08:00","2040-10-10T09:00:00+08:00");
  await approved("2040-10-10T14:00:00+08:00","2040-10-10T15:00:00+08:00");
  await approved("2040-10-10T09:00:00+08:00","2040-10-10T10:00:00+08:00","submitted");
  await approved("2040-10-10T10:00:00+08:00","2040-10-10T11:00:00+08:00","approved","business_trip");
  assert.equal((await day("2040-10-10")).leaveMinutes,180);
  const request=await approved("2040-10-11T08:00:00+08:00","2040-10-11T12:00:00+08:00");
  const rest=await day("2040-10-11");assert.equal(rest.leaveMinutes,180);assert.equal(rest.resultStatus,"rest");
  assert.deepEqual((await service.attendanceRequestRecalculationPlan(scope,actor,request)).workDates,["2040-10-11"]);
 });
 it("checks next-month sources at month close and requires fresh scheduled leave calculation basis",async()=>{
  const period=await service.createAttendancePeriod(scope,actor,{periodMonth:"2040-08-01"});
  const previous=await db.getRepository(HrEmployeeAttendanceDailyResultEntity).findOneByOrFail({employeeId:employee,workDate:"2040-08-31"});
  await db.query("UPDATE hr_employee_attendance_daily_result SET source_trace=jsonb_set(source_trace,'{approvedRequestSources}','[]') WHERE id=$1",[previous.id]);
  await assert.rejects(service.calculateAttendancePeriod(scope,actor,period.id),/daily request sources changed/);
  const current=await day("2040-08-31");
  await db.query("UPDATE hr_employee_attendance_daily_result SET source_trace=jsonb_set(source_trace,'{algorithmVersion}','\"attendance-v1\"') WHERE id=$1",[current.id]);
  await assert.rejects(service.calculateAttendancePeriod(scope,actor,period.id),/scheduled leave basis changed/);
  await day("2040-08-31");assert.equal((await service.calculateAttendancePeriod(scope,actor,period.id)).status,"review");
  assert.equal((await service.closeAttendancePeriod(scope,actor,period.id)).status,"closed");
 });
 it("reopens the preceding reviewed year-month on approval and preserves closed payroll inputs until explicit correction",async()=>{
  await shiftDay("2041-12-31");await day("2041-12-31");
  const period=await service.createAttendancePeriod(scope,actor,{periodMonth:"2041-12-01"});await service.calculateAttendancePeriod(scope,actor,period.id);
  const employeeActor={...actor,sub:user,permissions:[]};
  const request=await service.createAttendanceRequest(scope,employeeActor,{requestType:"leave",startAt:"2042-01-01T02:00:00+08:00",endAt:"2042-01-01T04:00:00+08:00",reason:"合成跨年请假"});
  await service.submitAttendanceRequest(scope,employeeActor,request.id);await service.reviewAttendanceRequest(scope,actor,request.id,"approve",{});
  assert.equal((await db.getRepository(HrAttendancePeriodEntity).findOneByOrFail({id:period.id})).status,"open");
  await assert.rejects(service.calculateAttendancePeriod(scope,actor,period.id),/daily request sources changed/);
  await day("2041-12-31");await service.calculateAttendancePeriod(scope,actor,period.id);await service.closeAttendancePeriod(scope,actor,period.id);
  const original=await service.payrollAttendanceInputs(scope,actor,period.id);
  const correction=await service.createAttendanceRequest(scope,employeeActor,{requestType:"correction",attendanceDate:"2041-12-31",reason:"合成更正"});await service.submitAttendanceRequest(scope,employeeActor,correction.id);await service.reviewAttendanceRequest(scope,actor,correction.id,"approve",{});
  assert.equal((await db.getRepository(HrAttendancePeriodEntity).findOneByOrFail({id:period.id})).status,"closed");assert.equal((await service.payrollAttendanceInputs(scope,actor,period.id)).batchId,original.batchId);
  await assert.rejects(service.createAttendanceCorrectionBatch(scope,actor,period.id,{reason:"合成更正"}),/daily request sources changed/);
  await day("2041-12-31");await service.createAttendanceCorrectionBatch(scope,actor,period.id,{reason:"合成更正"});
  assert.equal((await db.getRepository(HrAttendancePayrollInputItemEntity).findOneByOrFail({batchId:original.batchId,employeeId:employee})).missingPunchDays,1);
  assert.equal((await service.payrollAttendanceInputs(scope,actor,period.id)).items[0]?.missingPunchDays,0);
 });
 it("does not reopen or reject an unrelated preceding month merely because it was conservatively locked",async()=>{
  const previous=await service.createAttendancePeriod(scope,actor,{periodMonth:"2043-12-01"});await db.query("UPDATE hr_attendance_period SET status='calculating' WHERE id=$1",[previous.id]);
  const employeeActor={...actor,sub:user,permissions:[]},request=await service.createAttendanceRequest(scope,employeeActor,{requestType:"leave",startAt:"2044-01-01T09:00:00+08:00",endAt:"2044-01-01T10:00:00+08:00",reason:"合成无跨夜申请"});await service.submitAttendanceRequest(scope,employeeActor,request.id);await service.reviewAttendanceRequest(scope,actor,request.id,"approve",{});
  assert.equal((await db.getRepository(HrAttendancePeriodEntity).findOneByOrFail({id:previous.id})).status,"calculating");
 });

 it("waits on the actual preceding-month lock and rejects approval while that affected month is calculating",async()=>{
  await shiftDay("2045-12-31");const p=await service.createAttendancePeriod(scope,actor,{periodMonth:"2045-12-01"});
  const employeeActor={...actor,sub:user,permissions:[]},request=await service.createAttendanceRequest(scope,employeeActor,{requestType:"leave",startAt:"2046-01-01T02:00:00+08:00",endAt:"2046-01-01T04:00:00+08:00",reason:"合成跨月锁"});await service.submitAttendanceRequest(scope,employeeActor,request.id);
  await db.query("UPDATE hr_attendance_period SET status='calculating' WHERE id=$1",[p.id]);await assert.rejects(service.reviewAttendanceRequest(scope,actor,request.id,"approve",{}),/月考勤正在计算/);
  assert.equal((await db.getRepository(HrAttendanceRequestEntity).findOneByOrFail({id:request.id})).status,"submitted");await db.query("UPDATE hr_attendance_period SET status='review' WHERE id=$1",[p.id]);
  const blocker=db.createQueryRunner();await blocker.connect();await blocker.startTransaction();
  await (service as unknown as {lockAttendanceMonth:(manager:EntityManager,s:typeof scope,date:string)=>Promise<unknown>}).lockAttendanceMonth(blocker.manager,scope,"2045-12-01");
  const review=service.reviewAttendanceRequest(scope,actor,request.id,"approve",{});
  try{let waiting=false;for(let n=0;n<100;n++){const rows=await db.query("SELECT pid FROM pg_stat_activity WHERE application_name='overnight-facts-gate' AND wait_event_type='Lock' AND wait_event='advisory'");if(rows.length){waiting=true;break;}await delay(20);}assert.ok(waiting,"approval must wait on December's real month lock");await blocker.commitTransaction();await review;assert.equal((await db.getRepository(HrAttendancePeriodEntity).findOneByOrFail({id:p.id})).status,"open");}
  finally{if(blocker.isTransactionActive)await blocker.rollbackTransaction();await blocker.release();await Promise.allSettled([review]);}
 });
 it("returns all 33 dates at the maximum timed boundary and scopes schedule joins to the request park",async()=>{
  await shiftDay("2047-12-31");const request=await approved("2048-01-01T02:00:00+08:00","2048-02-01T02:00:00+08:00");
  const plan=await service.attendanceRequestRecalculationPlan(scope,actor,request);assert.equal(plan.workDates.length,33);assert.equal(plan.workDates[0],"2047-12-31");assert.equal(plan.workDates.at(-1),"2048-02-01");
  const row=await db.getRepository(HrAttendanceRequestEntity).findOneByOrFail({id:request});const internal=service as unknown as {attendanceRequestScheduleDates:(manager:EntityManager,s:typeof scope,rows:HrAttendanceRequestEntity[])=>Promise<Map<string,string[]>>};
  assert.equal((await internal.attendanceRequestScheduleDates(db.manager,{...scope,parkId:"20000002"},[row])).size,0);
 });

 it("locks employee before request so employee-first self operations cannot deadlock with approval",async()=>{
  const employeeActor={...actor,sub:user,permissions:[]},request=await service.createAttendanceRequest(scope,employeeActor,{requestType:"correction",attendanceDate:"2049-03-15",reason:"合成锁序"});await service.submitAttendanceRequest(scope,employeeActor,request.id);
  const blocker=db.createQueryRunner();await blocker.connect();await blocker.startTransaction();await blocker.query("SELECT id FROM hr_employee WHERE id=$1 FOR UPDATE",[employee]);
  const review=service.reviewAttendanceRequest(scope,actor,request.id,"approve",{});
  try{let waiting=false;for(let n=0;n<100;n++){const rows=await db.query("SELECT pid FROM pg_stat_activity WHERE application_name='overnight-facts-gate' AND wait_event_type='Lock' AND wait_event='transactionid'");if(rows.length){waiting=true;break;}await delay(20);}assert.ok(waiting,"approval must wait for the employee lock before locking request");await blocker.query("SELECT id FROM hr_attendance_request WHERE id=$1 FOR UPDATE NOWAIT",[request.id]);await blocker.commitTransaction();await review;assert.equal((await db.getRepository(HrAttendanceRequestEntity).findOneByOrFail({id:request.id})).status,"approved");}
  finally{if(blocker.isTransactionActive)await blocker.rollbackTransaction();await blocker.release();await Promise.allSettled([review]);}
 });

});
