import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { DataSource } from "typeorm";
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { HR_PERMISSIONS as H } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditService } from "../audit/audit.service";
import { OpLogEntity } from "../audit/entities/op-log.entity";
import * as entities from "./entities/hr.entities";
import { HrService } from "./hr.service";

test("owned PostgreSQL date correction preserves source, CAS/audit/history, old/new overnight months and frozen input", {skip:process.env.HR_TRIP_DATES_PG!=="1"}, async()=>{
 assert.equal(process.env.HR_TRIP_DATES_ISOLATED,"yes");assert.equal(process.env.POSTGRES_HOST,"127.0.0.1");assert.match(process.env.POSTGRES_DB??"",/^jinhu_hr_migration_lab_dates_[a-f0-9]{8}$/);
 const db=new DataSource({type:"postgres",host:process.env.POSTGRES_HOST,port:Number(process.env.POSTGRES_PORT),username:process.env.POSTGRES_USER,password:process.env.POSTGRES_PASSWORD,database:process.env.POSTGRES_DB,entities:[...entities.HR_ENTITIES,OpLogEntity]});await db.initialize();
 try{
  const scope={tenantId:`dates-${randomUUID()}`,parkId:`park-${randomUUID()}`},user=randomUUID();
  const actor:JwtPrincipal={...scope,sub:user,username:"synthetic",roles:[],permissions:[H.HR_ATTENDANCE_OPERATE],isSuper:false};
  await db.query("INSERT INTO sys_user(id,tenant_id,park_id,username,display_name,password_hash) VALUES($1,$2,$3,'synthetic','Synthetic','disabled-fixture')",[user,scope.tenantId,scope.parkId]);
  const employee=await db.getRepository(entities.HrEmployeeEntity).save({...scope,employeeCode:"DATES",fullName:"Synthetic",employmentStatus:"active"});
  const audit=new AuditService(undefined!,db.getRepository(OpLogEntity));let failAudit=false;let auditGate:(()=>Promise<void>)|null=null;
  const args=Array(32).fill(undefined);args[0]=db.getRepository(entities.HrEmployeeEntity);args[26]=db.getRepository(entities.HrAttendanceRequestEntity);args[30]=db;
  args[31]={recordOperationRequired:async(...input:Parameters<AuditService["recordOperationRequired"]>)=>{if(failAudit)throw new Error("synthetic audit rollback");if(auditGate)await auditGate();return audit.recordOperationRequired(...input);}};
  const service=Reflect.construct(HrService,args) as HrService,request=randomUUID();
  await db.query("INSERT INTO hr_attendance_request(id,tenant_id,park_id,employee_id,request_no,request_type,start_at,end_at,duration_minutes,reason,status,is_historical_import,legacy_source_table,legacy_source_id,legacy_declared_days,legacy_source_identity_sha256,legacy_source_row_sha256) VALUES($1,$2,$3,$4,'DATES','business_trip','2026-07-01T02:00:00+08:00','2026-07-01T04:00:00+08:00',120,'synthetic','approved',true,'dbo.errand',1,2,repeat('a',64),repeat('b',64))",[request,scope.tenantId,scope.parkId,employee.id]);
  const shift=await service.createAttendanceShift(scope,actor,{shiftCode:"DATES-NIGHT",shiftName:"Synthetic",startLocal:"23:00",endLocal:"07:00",ruleVersion:"dates-v1"});
  for(const workDate of ["2026-06-30","2026-08-31"])await service.createEmployeeSchedule(scope,actor,{employeeId:employee.id,shiftId:shift.id,workDate});
  const june=await service.createAttendancePeriod(scope,actor,{periodMonth:"2026-06-01"}),july=await service.createAttendancePeriod(scope,actor,{periodMonth:"2026-07-01"}),august=await service.createAttendancePeriod(scope,actor,{periodMonth:"2026-08-01"}),september=await service.createAttendancePeriod(scope,actor,{periodMonth:"2026-09-01"});
  await service.allocateBusinessTripMonth(scope,actor,request,{expectedVersion:1,reason:"synthetic allocation",allocations:[{month:"2026-07",days:2}]});
  const days=["2026-06-30","2026-07-01","2026-08-31","2026-09-01"];
  const recalc=async()=>{for(const workDate of days)await service.recalculateAttendanceDay(scope,actor,{employeeId:employee.id,workDate,ruleVersion:"dates-v1"});};
  await recalc();for(const period of [june,july,august,september])await service.calculateAttendancePeriod(scope,actor,period.id);
  await service.closeAttendancePeriod(scope,actor,june.id);const frozen=await service.payrollAttendanceInputs(scope,actor,june.id);const frozenRows=await db.query("SELECT * FROM hr_attendance_payroll_input_item WHERE batch_id=$1",[frozen.batchId]);
  const dto={startAt:"2026-09-01T02:00:00+08:00",endAt:"2026-09-01T04:00:00+08:00",expectedVersion:2,reason:"synthetic dates correction"};
  await assert.rejects(service.amendBusinessTripDates(scope,{...actor,permissions:[]},request,dto),ForbiddenException);
  await assert.rejects(service.businessTripDatesHistory(scope,{...actor,permissions:[]},request,{page:1,page_size:1}),ForbiddenException);
  await assert.rejects(service.amendBusinessTripDates({...scope,parkId:"foreign"},{...actor,parkId:"foreign"},request,dto),NotFoundException);
  for(const invalid of [{startAt:"2026-09-01T02:00:01+08:00"},{endAt:dto.startAt},{endAt:"2026-11-01T04:00:00+08:00"},{startAt:"2026-09-01T02:00:00"},{reason:" "}])await assert.rejects(service.amendBusinessTripDates(scope,actor,request,{...dto,...invalid}),BadRequestException);
  await assert.rejects(db.query("UPDATE hr_attendance_request SET start_at=start_at+interval '1 minute' WHERE id=$1",[request]),/controlled amendment/);
  const guard=db.createQueryRunner();await guard.connect();await guard.startTransaction();
  try{await guard.query("SELECT set_config('app.hr_business_trip_date_amendment',$1,true)",[request]);await assert.rejects(guard.query("UPDATE hr_attendance_request SET start_at=start_at+interval '1 minute',version=version+1,legacy_source_row_sha256=repeat('c',64) WHERE id=$1",[request]),/controlled amendment/);}finally{await guard.rollbackTransaction();await guard.release();}
  const before=await db.query("SELECT * FROM hr_attendance_request WHERE id=$1",[request]);
  failAudit=true;await assert.rejects(service.amendBusinessTripDates(scope,actor,request,dto),/synthetic audit rollback/);failAudit=false;
  assert.deepEqual(await db.query("SELECT * FROM hr_attendance_request WHERE id=$1",[request]),before);assert.equal((await service.businessTripDatesHistory(scope,actor,request,{page:1,page_size:1})).total,0);
  assert.equal((await db.query("SELECT status FROM hr_attendance_period WHERE id=$1",[july.id]))[0].status,"review");
  // A calculating old or new overnight month must reject the entire amendment.
  for(const period of [july,august]){await db.query("UPDATE hr_attendance_period SET status='calculating' WHERE id=$1",[period.id]);await assert.rejects(service.amendBusinessTripDates(scope,actor,request,dto),ConflictException);await db.query("UPDATE hr_attendance_period SET status='review' WHERE id=$1",[period.id]);}
  const race=await Promise.allSettled([service.amendBusinessTripDates(scope,actor,request,dto),service.amendBusinessTripDates(scope,actor,request,dto)]);
  assert.equal(race.filter(row=>row.status==="fulfilled").length,1);assert.equal(race.filter(row=>row.status==="rejected"&&row.reason instanceof ConflictException).length,1);
  const receipt=race.find(row=>row.status==="fulfilled")!;assert.equal(receipt.status,"fulfilled");if(receipt.status==="fulfilled")assert.deepEqual(receipt.value,{id:request,startAt:"2026-08-31T18:00:00.000Z",endAt:"2026-08-31T20:00:00.000Z",durationMinutes:120,amendVersion:3});
  const after=(await db.query("SELECT * FROM hr_attendance_request WHERE id=$1",[request]))[0];
  for(const key of Object.keys(before[0]))if(!["start_at","end_at","duration_minutes","version","update_by","update_time"].includes(key))assert.deepEqual(after[key],before[0][key],key);
  assert.equal((await service.businessTripMonthAllocation(scope,actor,request)).currentAllocation,null);
  for(const period of [july,august,september]){assert.equal((await db.query("SELECT status FROM hr_attendance_period WHERE id=$1",[period.id]))[0].status,"open");await assert.rejects(service.calculateAttendancePeriod(scope,actor,period.id),/出差日期已更正/);}
  await assert.rejects(service.createAttendanceCorrectionBatch(scope,actor,june.id,{reason:"synthetic closed correction"}),/出差日期已更正/);
  assert.equal((await db.query("SELECT status FROM hr_attendance_period WHERE id=$1",[june.id]))[0].status,"closed");
  const correctionPlan=await service.attendanceRequestRecalculationPlan(scope,actor,request);
  assert.equal(correctionPlan.requestVersion,3);assert.deepEqual(correctionPlan.workDates,days);
  for(const workDate of correctionPlan.workDates)await service.recalculateAttendanceDay(scope,actor,{employeeId:correctionPlan.employeeId,workDate,ruleVersion:"dates-v1"});
  const markerDays=await db.query("SELECT day::text AS work_date FROM hr_business_trip_date_history CROSS JOIN LATERAL unnest(affected_work_dates) day WHERE request_id=$1 ORDER BY day",[request]);assert.deepEqual(markerDays.map((row:{work_date:string})=>row.work_date),days);
  for(const day of days){const [latest]=await db.query("SELECT source_trace FROM hr_employee_attendance_daily_result WHERE employee_id=$1 AND work_date=$2 ORDER BY create_time DESC,id DESC",[employee.id,day]);assert.deepEqual(latest.source_trace.businessTripDateAmendmentSources,[{id:request,requestVersion:3}],day);}
  for(const period of [july,august,september])await service.calculateAttendancePeriod(scope,actor,period.id);
  await service.createAttendanceCorrectionBatch(scope,actor,june.id,{reason:"synthetic closed correction"});
  assert.deepEqual(await db.query("SELECT * FROM hr_attendance_payroll_input_item WHERE batch_id=$1",[frozen.batchId]),frozenRows);
  const julySummary=(await db.query("SELECT approved_business_trip_ms FROM hr_attendance_month_summary WHERE period_id=$1 ORDER BY summary_version DESC",[july.id]))[0];assert.equal(julySummary.approved_business_trip_ms,"0");
  const septemberSummary=(await db.query("SELECT approved_business_trip_ms,approved_business_trip_declared_days FROM hr_attendance_month_summary WHERE period_id=$1 ORDER BY summary_version DESC",[september.id]))[0];assert.equal(septemberSummary.approved_business_trip_ms,"7200000");assert.equal(septemberSummary.approved_business_trip_declared_days,null);
  const history=await service.businessTripDatesHistory(scope,actor,request,{page:1,page_size:1});assert.equal(history.total,1);assert.equal(history.items[0].beforeStartAt.toISOString(),"2026-06-30T18:00:00.000Z");
  for(const sql of ["UPDATE hr_business_trip_date_history SET change_reason='changed' WHERE request_id=$1","DELETE FROM hr_business_trip_date_history WHERE request_id=$1"])await assert.rejects(db.query(sql,[request]),/append-only/);
  await service.amendBusinessTripDates(scope,actor,request,{...dto,expectedVersion:3,endAt:"2026-09-01T05:00:00+08:00"});
  assert.equal((await service.businessTripDatesHistory(scope,actor,request,{page:2,page_size:1})).items[0].requestVersion,3);
  // Existing constraints permit inconsistent long historical spans; repair without enumerating 100 years.
  const long=randomUUID(),longEmployee=await db.getRepository(entities.HrEmployeeEntity).save({...scope,employeeCode:"LONG",fullName:"Synthetic",employmentStatus:"active"});
  await db.query("INSERT INTO hr_attendance_request(id,tenant_id,park_id,employee_id,request_no,request_type,start_at,end_at,duration_minutes,reason,status) VALUES($1,$2,$3,$4,'LONG','business_trip','2000-01-01T00:00:00+08:00','2100-01-01T00:00:00+08:00',1,'synthetic','approved')",[long,scope.tenantId,scope.parkId,longEmployee.id]);
  await service.recalculateAttendanceDay(scope,actor,{employeeId:longEmployee.id,workDate:"2026-07-10",ruleVersion:"long-v1"});
  const repaired=await service.amendBusinessTripDates(scope,actor,long,{...dto,expectedVersion:1});assert.equal(repaired.amendVersion,2);
  const longHistory=await service.businessTripDatesHistory(scope,actor,long,{page:1,page_size:1});assert.equal(longHistory.items[0].beforeEndAt.toISOString(),"2099-12-31T16:00:00.000Z");
  assert.ok((await db.query("SELECT affected_work_dates::text FROM hr_business_trip_date_history WHERE request_id=$1",[long]))[0].affected_work_dates.includes("2026-07-10"));
  // Real waiter order 1: month owner precedes amendment; the request must stay at v2 until release.
  const blocker=db.createQueryRunner();await blocker.connect();await blocker.startTransaction();
  const monthKey=(month:string)=>JSON.stringify(["hr-attendance-month",scope.tenantId,scope.parkId,month]);
  await blocker.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[monthKey("2026-09-01")]);
  const pending=service.amendBusinessTripDates(scope,actor,long,{...dto,expectedVersion:2,startAt:"2026-11-01T02:00:00+08:00",endAt:"2026-11-01T04:00:00+08:00"});
  try{let waiting=false;for(let attempt=0;attempt<100&&!waiting;attempt++){waiting=Number((await db.query("SELECT count(*)::int count FROM pg_stat_activity WHERE datname=current_database() AND wait_event='advisory'"))[0].count)>0;if(!waiting)await delay(10);}assert.equal(waiting,true);assert.equal((await db.query("SELECT version FROM hr_attendance_request WHERE id=$1",[long]))[0].version,2);}finally{await blocker.rollbackTransaction();await blocker.release();}
  assert.equal((await pending).amendVersion,3);
  // Real waiter order 2: amendment owns both old and new month before required audit commits.
  let release!:()=>void,entered!:()=>void;const reached=new Promise<void>(resolve=>{entered=resolve;}),held=new Promise<void>(resolve=>{release=resolve;});auditGate=async()=>{entered();await held;};
  const heldAmendment=service.amendBusinessTripDates(scope,actor,long,{...dto,expectedVersion:3,startAt:"2026-12-01T02:00:00+08:00",endAt:"2026-12-01T04:00:00+08:00"});
  try{await Promise.race([reached,heldAmendment.then(()=>{throw new Error("Audit barrier not reached");})]);for(const month of ["2026-11-01","2026-12-01"]){const [{locked}]=await db.query("SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) locked",[monthKey(month)]);assert.equal(locked,false);}}finally{release();auditGate=null;}
  assert.equal((await heldAmendment).amendVersion,4);
  // A plan retains removed dates from every amendment, even when the latest history no longer mentions them.
  const retainedPlan=await service.attendanceRequestRecalculationPlan(scope,actor,long);
  assert.deepEqual(retainedPlan.workDates,["2026-07-10","2026-09-01","2026-11-01","2026-12-01"]);
  // A long old interval is bounded by persisted facts, not the 31-day limit on new inputs.
  const wide=randomUUID(),wideEmployee=await db.getRepository(entities.HrEmployeeEntity).save({...scope,employeeCode:"WIDE",fullName:"Synthetic",employmentStatus:"active"});
  await db.query("INSERT INTO hr_attendance_request(id,tenant_id,park_id,employee_id,request_no,request_type,start_at,end_at,duration_minutes,reason,status) VALUES($1,$2,$3,$4,'WIDE','business_trip','2000-01-01T00:00:00+08:00','2100-01-01T00:00:00+08:00',1,'synthetic','approved')",[wide,scope.tenantId,scope.parkId,wideEmployee.id]);
  const persistedDays=Array.from({length:34},(_,index)=>new Date(Date.UTC(2025,0,1+index)).toISOString().slice(0,10));
  for(const workDate of persistedDays)await service.recalculateAttendanceDay(scope,actor,{employeeId:wideEmployee.id,workDate,ruleVersion:"dates-v1"});
  await service.amendBusinessTripDates(scope,actor,wide,{...dto,expectedVersion:1});
  assert.deepEqual((await service.attendanceRequestRecalculationPlan(scope,actor,wide)).workDates,[...persistedDays,"2026-09-01"]);
  await assert.rejects(service.attendanceRequestRecalculationPlan({...scope,parkId:"foreign"},{...actor,parkId:"foreign"},wide),NotFoundException);


 }finally{await db.destroy();}
});
