import "reflect-metadata";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { BadRequestException } from "@nestjs/common";
import { HR_PERMISSIONS } from "@jinhu/shared";
import { PERMISSIONS_KEY } from "../../shared/decorators/permissions.decorator";
import { AUDIT_LOG_KEY } from "../audit/decorators/audit-log.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { HrController } from "./hr.controller";
import { HrService } from "./hr.service";

const actor=(permissions:string[]):JwtPrincipal=>({sub:"user-1",username:"tester",tenantId:"tenant-1",parkId:"park-1",roles:[],permissions,isSuper:false});

test("attendance request write routes use exact action permissions, idempotency and body-free audit",()=>{
 for(const method of ["createAttendanceRequest","submitAttendanceRequest","cancelAttendanceRequest"] as const){assert.deepEqual(Reflect.getMetadata(PERMISSIONS_KEY,HrController.prototype[method]),[HR_PERMISSIONS.HR_ATTENDANCE_REQUEST]);assert.ok(Reflect.getMetadata("__interceptors__",HrController.prototype[method])?.length);assert.equal(Reflect.getMetadata(AUDIT_LOG_KEY,HrController.prototype[method]).captureBody,false);}
 for(const method of ["approveAttendanceRequest","rejectAttendanceRequest"] as const){assert.deepEqual(Reflect.getMetadata(PERMISSIONS_KEY,HrController.prototype[method]),[HR_PERMISSIONS.HR_ATTENDANCE_APPROVE]);assert.ok(Reflect.getMetadata("__interceptors__",HrController.prototype[method])?.length);assert.equal(Reflect.getMetadata(AUDIT_LOG_KEY,HrController.prototype[method]).captureBody,false);}
});

test("attendance request timing is server-authoritative and type-shaped",()=>{
 const validate=(HrService.prototype as unknown as {validateAttendanceRequest:(dto:Record<string,unknown>)=>{durationMinutes:number;attendanceDate:string|null}}).validateAttendanceRequest;
 assert.equal(validate.call({}, {requestType:"leave",startAt:"2026-08-24T08:00:00+08:00",endAt:"2026-08-24T17:30:00+08:00",reason:"年假"}).durationMinutes,570);
 assert.deepEqual(validate.call({}, {requestType:"correction",attendanceDate:"2026-08-24",reason:"打卡异常"}),{startAt:null,endAt:null,attendanceDate:"2026-08-24",durationMinutes:0});
 for(const dto of [{requestType:"correction",startAt:"2026-08-24T08:00:00Z",reason:"x"},{requestType:"leave",attendanceDate:"2026-08-24",reason:"x"},{requestType:"overtime",startAt:"2026-08-24T08:00:30Z",endAt:"2026-08-24T09:00:00Z",reason:"x"},{requestType:"business_trip",startAt:"2026-08-25T08:00:00Z",endAt:"2026-08-24T08:00:00Z",reason:"x"},{requestType:"leave",startAt:"2026-08-24T08:00:00Z",endAt:"2026-10-01T08:00:00Z",reason:"x"}])assert.throws(()=>validate.call({},dto),BadRequestException);
});

test("returning an attendance request requires an actionable comment",async()=>{
 const service=Reflect.construct(HrService,Array(32).fill({})) as HrService;
 await assert.rejects(service.reviewAttendanceRequest({tenantId:"tenant-1",parkId:"park-1"},actor([HR_PERMISSIONS.HR_ATTENDANCE_APPROVE]),"00000000-0000-4000-8000-000000000001","reject",{}),BadRequestException);
});

test("attendance request migration enforces forward-only domain shape and indexed identities",()=>{
 const migration=readFileSync(resolve(__dirname,"../../../../../database/migrations/000245_hr_attendance_requests.sql"),"utf8");
 assert.match(migration,/CREATE TABLE IF NOT EXISTS hr_attendance_request/);assert.match(migration,/CHECK\(request_type IN \('leave','overtime','business_trip','correction'\)\)/);assert.match(migration,/CHECK\(status IN \('draft','submitted','approved','returned','cancelled'\)\)/);assert.match(migration,/duration_minutes integer NOT NULL/);assert.match(migration,/uq_hr_attendance_request_no/);assert.match(migration,/uq_hr_attendance_request_approval/);assert.doesNotMatch(migration,/ALTER TABLE hr_attendance_day/);
 assert.match(migration,/duration_minutes BETWEEN 0 AND 44640/);
 assert.match(migration,/date_trunc\('minute',start_at\)/);
});

test("attendance request listing is fail-closed without exact read permission",async()=>{
 const service=Reflect.construct(HrService,Array(32).fill({})) as HrService;
 assert.deepEqual(await service.listAttendanceRequests({tenantId:"tenant-1",parkId:"park-1"},actor([HR_PERMISSIONS.HR_ATTENDANCE_REQUEST]),{page:1,page_size:20}),{items:[],total:0,page:1,page_size:20});
});

test("attendance request source never captures reason or medical details in audit metadata",()=>{
 const controller=readFileSync(resolve(__dirname,"hr.controller.ts"),"utf8");
 for(const method of ["创建考勤申请草稿","提交考勤申请","取消考勤申请","批准考勤申请","退回考勤申请"])assert.match(controller,new RegExp(`action:"${method}"[^}]*captureBody:false`));
 assert.doesNotMatch(controller,/captureBody:true/);
});
