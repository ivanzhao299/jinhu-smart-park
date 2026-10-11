import "reflect-metadata";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {randomUUID} from "node:crypto";
import {after,before,describe,it} from "node:test";
import {setTimeout as delay} from "node:timers/promises";
import {DataSource,type EntityManager} from "typeorm";
import {HR_PERMISSIONS} from "@jinhu/shared";
import type {JwtPrincipal} from "../../shared/types/jwt-principal";
import {AuditService} from "../audit/audit.service";
import {OpLogEntity} from "../audit/entities/op-log.entity";
import * as entities from "./entities/hr.entities";
import {HrService} from "./hr.service";
import {HrAttendanceLeaveCancellationService} from "./hr-attendance-leave-cancellation.service";

const enabled=process.env.HR_LEAVE_CANCELLATION_PG==="1",database=process.env.POSTGRES_DB??"";
if(enabled){assert.equal(process.env.HR_LEAVE_CANCELLATION_ISOLATED,"yes");assert.match(database,/^jinhu_hr_migration_lab_review_lcancel_[A-Za-z0-9_]{6,32}$/);}
(enabled?describe:describe.skip)("Approved leave cancellation actual service and PostgreSQL",()=>{
 let db:DataSource,service:HrAttendanceLeaveCancellationService,hr:HrService,audit:AuditService;
 const scope={tenantId:"10000001",parkId:"20000001"},reviewerId=randomUUID(),operatorId=randomUUID();
 const principal=(id:string,permissions:string[]):JwtPrincipal=>({sub:id,username:`synthetic-${id}`,...scope,roles:[],permissions});
 const reviewer=principal(reviewerId,[HR_PERMISSIONS.HR_ATTENDANCE_READ,HR_PERMISSIONS.HR_ATTENDANCE_APPROVE,HR_PERMISSIONS.HR_ATTENDANCE_OPERATE,HR_PERMISSIONS.HR_ATTENDANCE_CLOSE,HR_PERMISSIONS.HR_ATTENDANCE_CORRECT,HR_PERMISSIONS.HR_ATTENDANCE_PAYROLL_INPUT_READ]);
 const operator=principal(operatorId,[HR_PERMISSIONS.HR_ATTENDANCE_OPERATE,HR_PERMISSIONS.HR_ATTENDANCE_APPROVE,HR_PERMISSIONS.HR_ATTENDANCE_READ]);
 before(async()=>{
  // Credentials stay in process memory, never printed or written as evidence.
  const inspected=JSON.parse(execFileSync("docker",["inspect","jinhu-smart-park-postgres"],{encoding:"utf8",stdio:["ignore","pipe","pipe"]}));
  const env=inspected[0].Config.Env as string[],password=env.find(v=>v.startsWith("POSTGRES_PASSWORD="))?.slice("POSTGRES_PASSWORD=".length);assert.ok(password);
  db=new DataSource({type:"postgres",host:"127.0.0.1",port:15432,username:"jinhu",password,database,entities:[...Object.values(entities).filter(v=>typeof v==="function"),OpLogEntity],extra:{application_name:"leave-cancellation-service-test"}});await db.initialize();
  await db.query("INSERT INTO sys_user(id,tenant_id,park_id,username,display_name,password_hash) VALUES($1::uuid,$3,$4,$1::text,'Synthetic reviewer','not-a-login-hash'),($2::uuid,$3,$4,$2::text,'Synthetic operator','not-a-login-hash')",[reviewerId,operatorId,scope.tenantId,scope.parkId]);
  audit=Object.create(AuditService.prototype) as AuditService;Object.defineProperty(audit,"opLogRepository",{value:db.getRepository(OpLogEntity)});
  const args=Array(33).fill(undefined);args[0]=db.getRepository(entities.HrEmployeeEntity);args[18]=db.getRepository(entities.HrApprovalRequestEntity);args[26]=db.getRepository(entities.HrAttendanceRequestEntity);args[29]={publishAttendanceRequestSubmitted:async()=>undefined,publishAttendanceRequestReviewed:async()=>undefined};args[30]=db;args[31]=audit;
  hr=Reflect.construct(HrService,args) as HrService;service=new HrAttendanceLeaveCancellationService(db,audit,hr);
 });
 after(async()=>{if(db?.isInitialized)await db.destroy();}); // Owned database is dropped by the runner; immutable history is never deleted.
 async function fixture(date="2028-01-15",start="09:00",end="17:00",endDate=date){
  const ownerId=randomUUID(),employeeId=randomUUID(),sourceId=randomUUID(),approvalId=randomUUID();
  await db.query("INSERT INTO sys_user(id,tenant_id,park_id,username,display_name,password_hash) VALUES($1::uuid,$2,$3,$1::text,'Synthetic employee','not-a-login-hash')",[ownerId,scope.tenantId,scope.parkId]);
  await db.query("INSERT INTO hr_employee(id,tenant_id,park_id,employee_code,full_name,user_id,employment_status) VALUES($1::uuid,$2,$3,$1::text,'Synthetic employee',$4,'active')",[employeeId,scope.tenantId,scope.parkId,ownerId]);
  await db.query("INSERT INTO hr_approval_request(id,tenant_id,park_id,request_no,request_type,applicant_employee_id,subject_employee_id,title,status) VALUES($1::uuid,$2,$3,$1::text,'attendance_request',$4,$4,'Original approved leave','approved')",[approvalId,scope.tenantId,scope.parkId,employeeId]);
  const startAt=`${date}T${start}:00+08:00`,endAt=`${endDate}T${end}:00+08:00`;
  await db.query("INSERT INTO hr_attendance_request(id,tenant_id,park_id,request_no,employee_id,request_type,start_at,end_at,duration_minutes,reason,status,approval_request_id) VALUES($1::uuid,$2,$3,$1::text,$4,'leave',$5,$6,$7,'Original','approved',$8)",[sourceId,scope.tenantId,scope.parkId,employeeId,startAt,endAt,(Date.parse(endAt)-Date.parse(startAt))/60000,approvalId]);
  return {employeeId,sourceId,owner:principal(ownerId,[HR_PERMISSIONS.HR_ATTENDANCE_REQUEST,HR_PERMISSIONS.HR_ATTENDANCE_SELF_READ]),input:{sourceRequestId:sourceId,expectedSourceVersion:1,startAt,endAt,reason:"Synthetic cancellation"}};
 }
 it("persists create/edit/return/resubmit/approval histories and required audit; rejects stale versions and self approval",async()=>{
  const f=await fixture(),draft=await service.create(scope,f.owner,f.input);assert.equal(draft.actions.edit,true);
  const edit=await service.update(scope,f.owner,draft.id,{expectedVersion:1,startAt:"2028-01-15T10:00:00+08:00",endAt:"2028-01-15T12:00:00+08:00",reason:"Shorten cancellation"});
  await assert.rejects(service.update(scope,f.owner,draft.id,{expectedVersion:1,...f.input}),/已更新/);
  const submitted=await service.act(scope,f.owner,draft.id,{expectedVersion:edit.version,action:"submit"});
  await assert.rejects(service.act(scope,{...f.owner,permissions:[...f.owner.permissions,HR_PERMISSIONS.HR_ATTENDANCE_READ,HR_PERMISSIONS.HR_ATTENDANCE_APPROVE]},draft.id,{expectedVersion:submitted.version,action:"approve"}),/无权办理/);
  const returned=await service.act(scope,reviewer,draft.id,{expectedVersion:submitted.version,action:"return",comment:"Please verify"});
  const resubmitted=await service.act(scope,f.owner,draft.id,{expectedVersion:returned.version,action:"submit"});
  const approved=await service.act(scope,reviewer,draft.id,{expectedVersion:resubmitted.version,action:"approve"});assert.equal(approved.status,"approved");
  const history=await service.history(scope,f.owner,draft.id,{page:1,page_size:20});assert.deepEqual(history.items.map((r:{action:string})=>r.action),["approve","resubmit","return","submit","edit","create"]);
  assert.equal(Number((await db.query("SELECT count(*) count FROM sys_op_log WHERE biz_id=$1 AND method<>'GET'",[draft.id]))[0].count),6);
  assert.equal((await db.query("SELECT status,version FROM hr_attendance_request WHERE id=$1",[f.sourceId]))[0].status,"approved");
  await assert.rejects(service.update(scope,f.owner,draft.id,{expectedVersion:approved.version,...f.input}),/只能修改/);
 });
 it("scopes sources and histories; HR can act on behalf but cannot approve its own created cancellation",async()=>{
  const f=await fixture(),other=await fixture(),draft=await service.create(scope,f.owner,f.input);
  assert.equal((await service.sources(scope,other.owner,{page:1,page_size:20,employee_id:f.employeeId})).total,0);
  assert.equal((await service.list(scope,other.owner,{page:1,page_size:20,employee_id:f.employeeId})).total,0);
  await assert.rejects(service.history(scope,other.owner,draft.id,{page:1,page_size:20}),/无权访问/);
  await assert.rejects(service.create(scope,other.owner,f.input),/无权办理/);
  await assert.rejects(service.create({...scope,parkId:"foreign"},f.owner,f.input),/园区不匹配/);
  const onBehalf=await service.create(scope,operator,other.input),submitted=await service.act(scope,operator,onBehalf.id,{expectedVersion:1,action:"submit"});
  await assert.rejects(service.act(scope,operator,onBehalf.id,{expectedVersion:submitted.version,action:"approve"}),/无权办理/);
  assert.equal((await service.act(scope,reviewer,onBehalf.id,{expectedVersion:submitted.version,action:"approve"})).status,"approved");
 });
 it("limits a department reviewer to its actual organization tree and keeps other draft/employee histories hidden",async()=>{
  const manager=await fixture(),member=await fixture(),other=await fixture(),org=randomUUID();
  await db.query("INSERT INTO sys_org(id,tenant_id,park_id,org_code,org_name,org_type,leader_user_id,status) VALUES($1::uuid,$2,$3,'LC-TEAM-'||$1::text,'Synthetic department','department',$4,'enabled')",[org,scope.tenantId,scope.parkId,manager.owner.sub]);
  await db.query("UPDATE hr_employee SET primary_org_id=$2 WHERE id=$1",[member.employeeId,org]);
  const actor={...manager.owner,permissions:[HR_PERMISSIONS.HR_ATTENDANCE_TEAM_READ,HR_PERMISSIONS.HR_ATTENDANCE_APPROVE]},draft=await service.create(scope,member.owner,member.input),foreign=await service.create(scope,other.owner,other.input);
  assert.equal((await service.list(scope,actor,{page:1,page_size:20})).total,0);
  const submitted=await service.act(scope,member.owner,draft.id,{expectedVersion:1,action:"submit"}),foreignSubmitted=await service.act(scope,other.owner,foreign.id,{expectedVersion:1,action:"submit"});
  assert.deepEqual((await service.list(scope,actor,{page:1,page_size:20})).items.map(r=>r.id),[draft.id]);
  await assert.rejects(service.act(scope,actor,foreign.id,{expectedVersion:foreignSubmitted.version,action:"approve"}),/无权办理/);
  await assert.rejects(service.history(scope,actor,foreign.id,{page:1,page_size:20}),/无权访问/);
  assert.equal((await service.act(scope,actor,draft.id,{expectedVersion:submitted.version,action:"approve"})).status,"approved");
 });
 it("applies cross-month overnight cancellation to the preceding scheduled work date and invalidates that reviewed month",async()=>{
  const f=await fixture("2028-07-31","23:00","07:00","2028-08-01"),shift=await hr.createAttendanceShift(scope,reviewer,{shiftCode:`NIGHT-${randomUUID().slice(0,8)}`,shiftName:"Synthetic night",startLocal:"23:00",endLocal:"07:00",ruleVersion:"lc-night"});
  await hr.createEmployeeSchedule(scope,reviewer,{employeeId:f.employeeId,shiftId:shift.id,workDate:"2028-07-31"});
  const recalc=()=>hr.recalculateAttendanceDay(scope,reviewer,{employeeId:f.employeeId,workDate:"2028-07-31",ruleVersion:"lc-night"});assert.equal((await recalc()).leaveMinutes,480);
  const july=await hr.createAttendancePeriod(scope,reviewer,{periodMonth:"2028-07-01"});await hr.calculateAttendancePeriod(scope,reviewer,july.id);
  const r=await service.create(scope,f.owner,{...f.input,startAt:"2028-08-01T02:00:00+08:00",endAt:"2028-08-01T04:00:00+08:00"}),submitted=await service.act(scope,f.owner,r.id,{expectedVersion:1,action:"submit"});await service.act(scope,reviewer,r.id,{expectedVersion:submitted.version,action:"approve"});
  assert.equal((await db.query("SELECT status FROM hr_attendance_period WHERE id=$1",[july.id]))[0].status,"open");await assert.rejects(hr.calculateAttendancePeriod(scope,reviewer,july.id),/销假来源已变化/);assert.equal((await recalc()).leaveMinutes,360);await hr.calculateAttendancePeriod(scope,reviewer,july.id);
 });
 it("rolls back both projections and history when required audit fails",async()=>{
  const f=await fixture(),r=await service.create(scope,f.owner,f.input),failing=new HrAttendanceLeaveCancellationService(db,{recordOperationRequired:async()=>{throw new Error("Synthetic required audit failure");}} as unknown as AuditService,hr);
  await assert.rejects(failing.act(scope,f.owner,r.id,{expectedVersion:1,action:"submit"}),/required audit failure/);
  const [state]=await db.query("SELECT c.status,c.version,a.status approval_status,(SELECT count(*)::int FROM hr_attendance_leave_cancellation_history h WHERE h.cancellation_id=c.id) history_count FROM hr_attendance_leave_cancellation c JOIN hr_approval_request a ON a.id=c.approval_request_id WHERE c.id=$1",[r.id]);assert.deepEqual(state,{status:"draft",version:1,approval_status:"draft",history_count:1});
 });
 it("rejects overlapping concurrent submissions with a clean conflict and one committed effect",async()=>{
  const f=await fixture(),one=await service.create(scope,f.owner,f.input),two=await service.create(scope,f.owner,f.input);
  const results=await Promise.allSettled([one,two].map(r=>service.act(scope,f.owner,r.id,{expectedVersion:1,action:"submit"})));
  assert.equal(results.filter(r=>r.status==="fulfilled").length,1);const failed=results.find(r=>r.status==="rejected") as PromiseRejectedResult;assert.match(String(failed.reason),/已有提交或批准/);
  assert.equal((await db.query("SELECT count(*)::int count FROM hr_attendance_leave_cancellation WHERE source_request_id=$1 AND status='submitted'",[f.sourceId]))[0].count,1);
 });
 it("dedicated approval changes daily minutes, reopens review and requires fresh daily sources while retaining closed input batches",async()=>{
  const date="2028-02-15",f=await fixture(date),shift=await hr.createAttendanceShift(scope,reviewer,{shiftCode:`LC-${randomUUID().slice(0,8)}`,shiftName:"Synthetic day",startLocal:"09:00",endLocal:"17:00",ruleVersion:"lc-test"});
  await hr.createEmployeeSchedule(scope,reviewer,{employeeId:f.employeeId,shiftId:shift.id,workDate:date});
  const recalc=()=>hr.recalculateAttendanceDay(scope,reviewer,{employeeId:f.employeeId,workDate:date,ruleVersion:"lc-test"});assert.equal((await recalc()).leaveMinutes,480);
  const period=await hr.createAttendancePeriod(scope,reviewer,{periodMonth:"2028-02-01"});await hr.calculateAttendancePeriod(scope,reviewer,period.id);
  const r=await service.create(scope,f.owner,{...f.input,startAt:`${date}T10:00:00+08:00`,endAt:`${date}T12:00:00+08:00`}),submitted=await service.act(scope,f.owner,r.id,{expectedVersion:1,action:"submit"});
  await service.act(scope,reviewer,r.id,{expectedVersion:submitted.version,action:"approve"});assert.equal((await db.query("SELECT status FROM hr_attendance_period WHERE id=$1",[period.id]))[0].status,"open");
  await assert.rejects(hr.calculateAttendancePeriod(scope,reviewer,period.id),/销假来源已变化/);assert.equal((await recalc()).leaveMinutes,360);await hr.calculateAttendancePeriod(scope,reviewer,period.id);await hr.closeAttendancePeriod(scope,reviewer,period.id);
  const original=await hr.payrollAttendanceInputs(scope,reviewer,period.id),r2=await service.create(scope,f.owner,{...f.input,startAt:`${date}T12:00:00+08:00`,endAt:`${date}T13:00:00+08:00`}),s2=await service.act(scope,f.owner,r2.id,{expectedVersion:1,action:"submit"});await service.act(scope,reviewer,r2.id,{expectedVersion:s2.version,action:"approve"});
  assert.equal((await hr.payrollAttendanceInputs(scope,reviewer,period.id)).batchId,original.batchId);await assert.rejects(hr.createAttendanceCorrectionBatch(scope,reviewer,period.id,{reason:"Synthetic correction"}),/销假来源已变化/);assert.equal((await recalc()).leaveMinutes,300);await hr.createAttendanceCorrectionBatch(scope,reviewer,period.id,{reason:"Synthetic correction"});assert.equal((await db.query("SELECT status FROM hr_attendance_payroll_input_batch WHERE id=$1",[original.batchId]))[0].status,"superseded");
 });
 it("waits for the shared month lock before any cancellation approval and rejects a calculating period",async()=>{
  const f=await fixture("2028-03-15"),r=await service.create(scope,f.owner,f.input),submitted=await service.act(scope,f.owner,r.id,{expectedVersion:1,action:"submit"}),p=await hr.createAttendancePeriod(scope,reviewer,{periodMonth:"2028-03-01"});
  let release=()=>{},entered=()=>{};const hold=new Promise<void>(done=>{release=done}),atLock=new Promise<void>(done=>{entered=done});
  const lock=db.transaction(async(m:EntityManager)=>{await m.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[JSON.stringify(["hr-attendance-month",scope.tenantId,scope.parkId,"2028-03-01"])]);await m.query("UPDATE hr_attendance_period SET status='calculating' WHERE id=$1",[p.id]);entered();await hold;});await atLock;
  const approval=service.act(scope,reviewer,r.id,{expectedVersion:submitted.version,action:"approve"});
  try{let waiting=false;for(let n=0;n<100;n++){if((await db.query("SELECT 1 FROM pg_stat_activity WHERE application_name='leave-cancellation-service-test' AND wait_event='advisory'")).length){waiting=true;break;}await delay(20);}assert.equal(waiting,true);release();await lock;await assert.rejects(approval,/正在计算/);}finally{release();await Promise.allSettled([lock,approval]);}
  assert.equal((await db.query("SELECT status FROM hr_attendance_leave_cancellation WHERE id=$1",[r.id]))[0].status,"submitted");
 });
});
