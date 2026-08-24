import "reflect-metadata";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { HR_PERMISSIONS } from "@jinhu/shared";
import { PERMISSIONS_KEY } from "../../shared/decorators/permissions.decorator";
import { AUDIT_LOG_KEY } from "../audit/decorators/audit-log.decorator";
import { HrController } from "./hr.controller";

test("month close writes have exact atomic permissions, idempotency and body-free audit",()=>{
 for(const method of ["createAttendancePeriod","calculateAttendancePeriod"] as const)assert.deepEqual(Reflect.getMetadata(PERMISSIONS_KEY,HrController.prototype[method]),[HR_PERMISSIONS.HR_ATTENDANCE_OPERATE]);
 for(const method of ["closeAttendancePeriod","correctAttendancePeriod"] as const)assert.deepEqual(Reflect.getMetadata(PERMISSIONS_KEY,HrController.prototype[method]),[HR_PERMISSIONS.HR_ATTENDANCE_CLOSE]);
 for(const method of ["createAttendancePeriod","calculateAttendancePeriod","closeAttendancePeriod","correctAttendancePeriod"] as const){assert.ok(Reflect.getMetadata("__interceptors__",HrController.prototype[method])?.length);assert.equal(Reflect.getMetadata(AUDIT_LOG_KEY,HrController.prototype[method]).captureBody,false);}
 assert.deepEqual(Reflect.getMetadata(PERMISSIONS_KEY,HrController.prototype.payrollAttendanceInputs),[HR_PERMISSIONS.HR_ATTENDANCE_PAYROLL_INPUT_READ]);
});

test("month close migration keeps immutable version chains outside legacy and payroll tables",()=>{const sql=readFileSync(resolve(__dirname,"../../../../../database/migrations/000247_hr_attendance_month_close.sql"),"utf8");for(const table of ["hr_attendance_period","hr_attendance_month_summary","hr_attendance_payroll_input_batch","hr_attendance_payroll_input_item"])assert.match(sql,new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));assert.match(sql,/status IN\('open','calculating','review','closed','failed'\)/);assert.match(sql,/uq_hr_attendance_payroll_effective/);assert.match(sql,/ck_hr_attendance_payroll_batch_correction/);assert.match(sql,/correction_of_batch_id uuid REFERENCES hr_attendance_payroll_input_batch/);for(const index of ["idx_hr_attendance_month_summary_period_fk","idx_hr_attendance_month_summary_employee_fk","idx_hr_attendance_payroll_batch_correction_fk","idx_hr_attendance_payroll_item_summary_fk"])assert.match(sql,new RegExp(index));assert.match(sql,/source_daily_trace jsonb/);assert.match(sql,/difference_trace jsonb/);assert.doesNotMatch(sql,/ALTER TABLE (hr_attendance_day|hr_payslip|hr_payroll_run)|UPDATE (hr_attendance_day|hr_payslip|hr_payroll_run)/);});

test("month summaries pin only the latest immutable daily result per employee business day",()=>{const service=readFileSync(resolve(__dirname,"hr.service.ts"),"utf8");assert.match(service,/DISTINCT ON \(result\.employee_id,result\.work_date\)/);assert.match(service,/ORDER BY result\.employee_id,result\.work_date,result\.create_time DESC,result\.id DESC/);assert.doesNotMatch(service,/UPDATE hr_employee_attendance_daily_result/);});
