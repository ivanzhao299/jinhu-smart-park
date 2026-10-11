import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { DataSource } from "typeorm";
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { HR_PERMISSIONS as H } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditService } from "../audit/audit.service";
import { OpLogEntity } from "../audit/entities/op-log.entity";
import * as entities from "./entities/hr.entities";
import { HrService } from "./hr.service";

test("isolated PG allocation: CAS/audit/immutable history, exact totals, stale declaration and frozen correction", { skip: process.env.HR_TRIP_ALLOCATION_PG !== "1" }, async()=>{
  assert.equal(process.env.HR_TRIP_ALLOCATION_ISOLATED,"yes");
  assert.equal(process.env.POSTGRES_HOST,"127.0.0.1");
  assert.match(process.env.POSTGRES_DB??"",/^jinhu_hr_migration_lab_allocation_[a-f0-9]{8}$/);
  const db=new DataSource({type:"postgres",host:process.env.POSTGRES_HOST,port:Number(process.env.POSTGRES_PORT),username:process.env.POSTGRES_USER,password:process.env.POSTGRES_PASSWORD,database:process.env.POSTGRES_DB,entities:[...entities.HR_ENTITIES,OpLogEntity]});
  await db.initialize();
  try {
    const scope={tenantId:`allocation-${randomUUID()}`,parkId:`park-${randomUUID()}`},user=randomUUID();
    const actor:JwtPrincipal={...scope,sub:user,username:"synthetic",roles:[],permissions:[H.HR_ATTENDANCE_OPERATE],isSuper:false};
    await db.query("INSERT INTO sys_user(id,tenant_id,park_id,username,display_name,password_hash) VALUES($1,$2,$3,'synthetic','Synthetic','disabled-fixture')",[user,scope.tenantId,scope.parkId]);
    const employee=await db.getRepository(entities.HrEmployeeEntity).save({...scope,employeeCode:"ALLOC",fullName:"Synthetic",employmentStatus:"active"});
    const audit=new AuditService(undefined!,db.getRepository(OpLogEntity));let failAudit=false;
    const args=Array(32).fill(undefined);args[0]=db.getRepository(entities.HrEmployeeEntity);args[26]=db.getRepository(entities.HrAttendanceRequestEntity);args[30]=db;
    args[31]={recordOperationRequired:async(...input:Parameters<AuditService["recordOperationRequired"]>)=>{if(failAudit)throw new Error("synthetic audit rollback");return audit.recordOperationRequired(...input);}};
    const service=Reflect.construct(HrService,args) as HrService;
    const request=randomUUID();
    await db.query("INSERT INTO hr_attendance_request(id,tenant_id,park_id,employee_id,request_no,request_type,start_at,end_at,duration_minutes,declared_days,reason,status) VALUES($1,$2,$3,$4,'ALLOCATION','business_trip','2026-07-31T08:00:00+08:00','2026-08-02T17:00:00+08:00',3420,3,'synthetic','approved')",[request,scope.tenantId,scope.parkId,employee.id]);
    const july=await service.createAttendancePeriod(scope,actor,{periodMonth:"2026-07-01"});
    const august=await service.createAttendancePeriod(scope,actor,{periodMonth:"2026-08-01"});
    const recalculate=async()=>{for(const workDate of ["2026-07-31","2026-08-01","2026-08-02"])await service.recalculateAttendanceDay(scope,actor,{employeeId:employee.id,workDate,ruleVersion:"allocation-v1"});};
    await recalculate();await service.calculateAttendancePeriod(scope,actor,july.id);await service.calculateAttendancePeriod(scope,actor,august.id);
    const before=await service.businessTripMonthAllocation(scope,actor,request);assert.deepEqual(before.months,["2026-07","2026-08"]);assert.equal(before.currentAllocation,null);assert.equal(before.availability,"ready");
    const dto={expectedVersion:1,reason:"Explicit synthetic allocation",allocations:[{month:"2026-07",days:1},{month:"2026-08",days:2}]};
    for(const method of [()=>service.businessTripMonthAllocation(scope,{...actor,permissions:[]},request),()=>service.businessTripMonthAllocationHistory(scope,{...actor,permissions:[]},request,{page:1,page_size:1}),()=>service.allocateBusinessTripMonth(scope,{...actor,permissions:[]},request,dto)])await assert.rejects(method,ForbiddenException);
    await assert.rejects(service.allocateBusinessTripMonth({...scope,parkId:"foreign"},{...actor,parkId:"foreign"},request,dto),NotFoundException);
    for(const allocations of [[dto.allocations[0]!],[dto.allocations[0]!,dto.allocations[0]!],[{month:"2026-07",days:2},{month:"2026-08",days:2}]])await assert.rejects(service.allocateBusinessTripMonth(scope,actor,request,{...dto,allocations}),BadRequestException);
    failAudit=true;await assert.rejects(service.allocateBusinessTripMonth(scope,actor,request,dto),/synthetic audit rollback/);failAudit=false;
    assert.equal((await service.businessTripMonthAllocation(scope,actor,request)).amendVersion,1);assert.equal((await db.query("SELECT status FROM hr_attendance_period WHERE id=$1",[july.id]))[0].status,"review");
    const race=await Promise.allSettled([service.allocateBusinessTripMonth(scope,actor,request,dto),service.allocateBusinessTripMonth(scope,actor,request,dto)]);assert.equal(race.filter(row=>row.status==="fulfilled").length,1);assert.equal(race.filter(row=>row.status==="rejected"&&row.reason instanceof ConflictException).length,1);
    const current=await service.businessTripMonthAllocation(scope,actor,request);assert.equal(current.amendVersion,2);assert.equal(current.currentAllocation.requestVersion,2);
    const history=await service.businessTripMonthAllocationHistory(scope,actor,request,{page:1,page_size:1});assert.equal(history.total,1);
    await assert.rejects(db.query("UPDATE hr_business_trip_month_allocation SET change_reason='overwrite' WHERE request_id=$1",[request]),/append-only/);
    await assert.rejects(db.query("DELETE FROM hr_business_trip_month_allocation WHERE request_id=$1",[request]),/append-only/);
    await assert.rejects(service.calculateAttendancePeriod(scope,actor,july.id),ConflictException);
    await recalculate();
    const existingSummaries=await db.getRepository(entities.HrAttendanceMonthSummaryEntity).find({where:{...scope,periodId:july.id,summaryVersion:1}});
    const assertFresh=(service as unknown as {assertAttendanceSummaryFacts:(manager:typeof db.manager,scope:typeof actor,period:entities.HrAttendancePeriodEntity,summaries:entities.HrAttendanceMonthSummaryEntity[])=>Promise<void>}).assertAttendanceSummaryFacts.bind(service);
    await assert.rejects(assertFresh(db.manager,actor,await db.getRepository(entities.HrAttendancePeriodEntity).findOneByOrFail({id:july.id}),existingSummaries),/出差月份归属已变化/);
    await service.calculateAttendancePeriod(scope,actor,july.id);await service.calculateAttendancePeriod(scope,actor,august.id);
    const [summary]=await db.query("SELECT approved_business_trip_declared_days,source_trip_allocation_trace FROM hr_attendance_month_summary WHERE period_id=$1 ORDER BY summary_version DESC",[august.id]);assert.equal(summary.approved_business_trip_declared_days,"2");assert.equal(summary.source_trip_allocation_trace.length,1,"two daily results do not duplicate a trip");
    await service.closeAttendancePeriod(scope,actor,july.id);const frozen=await service.payrollAttendanceInputs(scope,actor,july.id);assert.equal(frozen.items[0]!.approvedBusinessTripDeclaredDays,"1");
    await service.amendBusinessTripDeclaredDays(scope,actor,request,{expectedVersion:2,declaredDays:4,reason:"synthetic total correction"});assert.equal((await service.businessTripMonthAllocation(scope,actor,request)).currentAllocation,null);
    await recalculate();await service.createAttendanceCorrectionBatch(scope,actor,july.id,{reason:"explicitly unknown current allocation"});const unknown=await service.payrollAttendanceInputs(scope,actor,july.id);assert.equal(unknown.items[0]!.approvedBusinessTripDeclaredDays,null);
    const [unknownDelta]=await db.query("SELECT difference_trace FROM hr_attendance_payroll_input_item WHERE batch_id=$1",[unknown.batchId]);assert.equal(unknownDelta.difference_trace.approvedBusinessTripDeclaredDays,null);assert.equal(unknownDelta.difference_trace.approvedBusinessTripDeclaredDaysAvailability,"current_unknown");
    await service.allocateBusinessTripMonth(scope,actor,request,{expectedVersion:3,reason:"corrected month fact",allocations:[{month:"2026-07",days:2},{month:"2026-08",days:2}]});
    await recalculate();await service.createAttendanceCorrectionBatch(scope,actor,july.id,{reason:"explicit known corrected allocation"});const corrected=await service.payrollAttendanceInputs(scope,actor,july.id);assert.equal(corrected.items[0]!.approvedBusinessTripDeclaredDays,"2");
    const versions=await service.attendancePayrollVersions(scope,actor,july.id);assert.equal(versions[0].changedEmployeeCount,1);assert.equal(versions[1].changedEmployeeCount,1);
    const [old]=await db.query("SELECT approved_business_trip_declared_days FROM hr_attendance_payroll_input_item WHERE batch_id=$1",[frozen.batchId]);assert.equal(old.approved_business_trip_declared_days,"1");
    assert.equal((await service.businessTripMonthAllocationHistory(scope,actor,request,{page:2,page_size:1})).items[0].requestVersion,2);
    assert.equal((await db.query("SELECT status FROM hr_attendance_period WHERE id=$1",[july.id]))[0].status,"closed");
    await db.query("UPDATE hr_attendance_period SET status='calculating' WHERE id=$1",[august.id]);await assert.rejects(service.allocateBusinessTripMonth(scope,actor,request,{...dto,expectedVersion:4,allocations:[{month:"2026-07",days:2},{month:"2026-08",days:2}]}),ConflictException);
    // Null/negative source records remain readable but cannot receive guessed allocations.
    for(const declaredDays of [null,-1]){
      const id=randomUUID();await db.query("INSERT INTO hr_attendance_request(id,tenant_id,park_id,employee_id,request_no,request_type,start_at,end_at,duration_minutes,declared_days,reason,status) VALUES($1,$2,$3,$4,$5,'business_trip','2026-09-01T08:00:00+08:00','2026-09-01T17:00:00+08:00',540,$6,'synthetic','approved')",[id,scope.tenantId,scope.parkId,employee.id,`INVALID-${id}`,declaredDays]);
      assert.equal((await service.businessTripMonthAllocation(scope,actor,id)).availability,"needs_correction");await assert.rejects(service.allocateBusinessTripMonth(scope,actor,id,{expectedVersion:1,reason:"must not guess",allocations:[{month:"2026-09",days:0}]}),BadRequestException);
    }
    const boundaryId=randomUUID();
    await db.query("INSERT INTO hr_attendance_request(id,tenant_id,park_id,employee_id,request_no,request_type,start_at,end_at,duration_minutes,declared_days,reason,status) VALUES($1,$2,$3,$4,'THREE-MONTH','business_trip','2026-01-31T12:00:00+08:00','2026-03-01T12:00:00+08:00',41760,2,'synthetic','approved')",[boundaryId,scope.tenantId,scope.parkId,employee.id]);
    const three=await service.businessTripMonthAllocation(scope,actor,boundaryId);assert.deepEqual(three.months,["2026-01","2026-02","2026-03"]);
    await service.allocateBusinessTripMonth(scope,actor,boundaryId,{expectedVersion:1,reason:"explicit three-month allocation",allocations:[{month:"2026-01",days:0},{month:"2026-02",days:1},{month:"2026-03",days:1}]});
    const octoberId=randomUUID();
    await db.query("INSERT INTO hr_attendance_request(id,tenant_id,park_id,employee_id,request_no,request_type,start_at,end_at,duration_minutes,declared_days,reason,status) VALUES($1,$2,$3,$4,'OCTOBER','business_trip','2026-10-01T08:00:00+08:00','2026-11-01T00:00:00+08:00',44160,3,'synthetic','approved')",[octoberId,scope.tenantId,scope.parkId,employee.id]);
    assert.deepEqual((await service.businessTripMonthAllocation(scope,actor,octoberId)).months,["2026-10"]);
    // Freeze explicit unknown first, then append a correction without modifying the frozen null.
    for(let day=1;day<=31;day++)await service.recalculateAttendanceDay(scope,actor,{employeeId:employee.id,workDate:`2026-10-${String(day).padStart(2,"0")}`,ruleVersion:"allocation-v1"});
    const october=await service.createAttendancePeriod(scope,actor,{periodMonth:"2026-10-01"});await service.calculateAttendancePeriod(scope,actor,october.id);await service.closeAttendancePeriod(scope,actor,october.id);
    const oldUnknown=await service.payrollAttendanceInputs(scope,actor,october.id);assert.equal(oldUnknown.items[0]!.approvedBusinessTripDeclaredDays,null);
    await service.allocateBusinessTripMonth(scope,actor,octoberId,{expectedVersion:1,reason:"explicit after-close allocation",allocations:[{month:"2026-10",days:3}]});
    for(let day=1;day<=31;day++)await service.recalculateAttendanceDay(scope,actor,{employeeId:employee.id,workDate:`2026-10-${String(day).padStart(2,"0")}`,ruleVersion:"allocation-v1"});
    await service.createAttendanceCorrectionBatch(scope,actor,october.id,{reason:"correct original unknown frozen input"});
    const fixed=await service.payrollAttendanceInputs(scope,actor,october.id);assert.equal(fixed.items[0]!.approvedBusinessTripDeclaredDays,"3");
    const [difference]=await db.query("SELECT difference_trace FROM hr_attendance_payroll_input_item WHERE batch_id=$1",[fixed.batchId]);assert.equal(difference.difference_trace.approvedBusinessTripDeclaredDaysAvailability,"previous_unknown");assert.equal(difference.difference_trace.approvedBusinessTripDeclaredDays,null);
    assert.equal((await db.query("SELECT approved_business_trip_declared_days FROM hr_attendance_payroll_input_item WHERE batch_id=$1",[oldUnknown.batchId]))[0].approved_business_trip_declared_days,null);
  } finally {await db.destroy();} // Owner harness drops the isolated DB; append-only rows are never deleted.
});
