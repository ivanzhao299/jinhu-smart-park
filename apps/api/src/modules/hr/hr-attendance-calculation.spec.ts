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
 assert.match(migration,/timezone='Asia\/Shanghai'/);assert.match(migration,/uq_hr_attendance_punch_event_key[\s\S]*tenant_id,park_id,source,event_key/);assert.match(migration,/uq_hr_attendance_daily_result[\s\S]*work_date,calculation_version_id/);assert.match(migration,/idx_hr_attendance_daily_latest/);assert.match(migration,/source_trace jsonb/);assert.match(migration,/correction_request_id uuid REFERENCES hr_attendance_request/);assert.doesNotMatch(migration,/ALTER TABLE hr_attendance_day|UPDATE hr_attendance_day|INSERT INTO hr_attendance_day/);
});
