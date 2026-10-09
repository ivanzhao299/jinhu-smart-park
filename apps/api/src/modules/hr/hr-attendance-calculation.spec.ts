import "reflect-metadata";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { HR_PERMISSIONS } from "@jinhu/shared";
import { PERMISSIONS_KEY } from "../../shared/decorators/permissions.decorator";
import { AUDIT_LOG_KEY } from "../audit/decorators/audit-log.decorator";
import { HrController } from "./hr.controller";
import { HrService } from "./hr.service";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { CreateHrAttendanceShiftDto } from "./dto/hr.dto";
import { HrEmployeeEntity, HrEmployeeScheduleEntity, HrAttendanceShiftEntity } from "./entities/hr.entities";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";

test("attendance calculation writes use one atomic operation permission and body-free idempotent routes",()=>{
 for(const method of ["createAttendanceShift","createAttendanceSchedule","createAttendancePunch","recalculateAttendance"] as const){assert.deepEqual(Reflect.getMetadata(PERMISSIONS_KEY,HrController.prototype[method]),[HR_PERMISSIONS.HR_ATTENDANCE_OPERATE]);assert.ok(Reflect.getMetadata("__interceptors__",HrController.prototype[method])?.length);assert.equal(Reflect.getMetadata(AUDIT_LOG_KEY,HrController.prototype[method]).captureBody,false);}
});

test("Shanghai local instants preserve cross-midnight business-day ownership",()=>{
 const local=(HrService.prototype as unknown as {shanghaiLocalInstant:(date:string,time:string,nextDay?:boolean)=>Date}).shanghaiLocalInstant;
 assert.equal(local.call({},"2026-08-24","23:00").toISOString(),"2026-08-24T15:00:00.000Z");
 assert.equal(local.call({},"2026-08-24","07:00",true).toISOString(),"2026-08-24T23:00:00.000Z");
});

test("attendance core migration is independent from historical calendar templates",()=>{
 const migration=readFileSync(resolve(__dirname,"../../../../../database/migrations/000246_hr_attendance_calculation_core.sql"),"utf8");
 for(const table of ["hr_attendance_shift","hr_employee_schedule","hr_attendance_punch_event","hr_attendance_calculation_version","hr_employee_attendance_daily_result"])assert.match(migration,new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
 assert.match(migration,/timezone='Asia\/Shanghai'/);assert.match(migration,/uq_hr_attendance_punch_event_key[\s\S]*tenant_id,park_id,source,event_key/);assert.match(migration,/uq_hr_attendance_daily_result[\s\S]*work_date,calculation_version_id/);assert.match(migration,/idx_hr_attendance_daily_latest/);assert.match(migration,/source_trace jsonb/);assert.match(migration,/correction_request_id uuid REFERENCES hr_attendance_request/);assert.match(HrService.prototype.recalculateAttendanceDay.toString(),/approvedRequestSources/);assert.doesNotMatch(migration,/ALTER TABLE hr_attendance_day|UPDATE hr_attendance_day|INSERT INTO hr_attendance_day/);
});

test("shift grace DTO accepts zero and240, rejecting fractional, negative and coerced values",async()=>{
 const body={shiftCode:"SYN",shiftName:"合成班",startLocal:"09:00",endLocal:"18:00",ruleVersion:"v1"};
 for(const field of ["lateGraceMinutes","earlyGraceMinutes"]){
  for(const value of [0,240])assert.equal((await validate(plainToInstance(CreateHrAttendanceShiftDto,{...body,[field]:value}))).length,0);
  for(const value of [-1,241,1.5,"5",true,[]])assert.ok((await validate(plainToInstance(CreateHrAttendanceShiftDto,{...body,[field]:value}))).some(error=>error.property===field));
 }
});
test("an existing schedule with an unavailable shift fails before allocating a calculation version",async()=>{
 const service=Object.create(HrService.prototype) as HrService,accessed:unknown[]=[];
 const manager={query:async()=>[],getRepository:(entity:unknown)=>{
  accessed.push(entity);
  if(entity===HrEmployeeEntity)return {findOne:async()=>({id:"synthetic-employee"})};
  if(entity===HrEmployeeScheduleEntity)return {findOne:async()=>({id:"synthetic-schedule",shiftId:"missing-shift"})};
  if(entity===HrAttendanceShiftEntity)return {findOne:async()=>null};
  throw new Error("Unexpected write repository access");
 }};
 Object.defineProperty(service,"dataSource",{value:{transaction:async(callback:(value:typeof manager)=>Promise<unknown>)=>callback(manager)}});
 await assert.rejects(service.recalculateAttendanceDay({tenantId:"synthetic-tenant",parkId:"synthetic-park"},{sub:"synthetic-user"} as JwtPrincipal,{employeeId:"synthetic-employee",workDate:"2026-10-10",ruleVersion:"draft"}),/Scheduled shift is unavailable/);
 assert.deepEqual(accessed,[HrEmployeeEntity,HrEmployeeScheduleEntity,HrAttendanceShiftEntity]);
});
