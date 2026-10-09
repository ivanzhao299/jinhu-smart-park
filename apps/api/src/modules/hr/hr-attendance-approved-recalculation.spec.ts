import "reflect-metadata";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { ConflictException, ForbiddenException } from "@nestjs/common";
import { HR_PERMISSIONS } from "@jinhu/shared";
import { AUDIT_LOG_KEY } from "../audit/decorators/audit-log.decorator";
import { PERMISSIONS_KEY } from "../../shared/decorators/permissions.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { HrController } from "./hr.controller";
import { HrService } from "./hr.service";

const scope={tenantId:"tenant-1",parkId:"park-1"};
const actor=(permissions:string[]):JwtPrincipal=>({sub:"operator-1",username:"operator",tenantId:scope.tenantId,parkId:scope.parkId,roles:[],permissions,isSuper:false});

test("approved-request recalculation plan is an audited operate-only metadata route",()=>{
 assert.deepEqual(Reflect.getMetadata(PERMISSIONS_KEY,HrController.prototype.attendanceRequestRecalculationPlan),[HR_PERMISSIONS.HR_ATTENDANCE_OPERATE]);
 assert.equal(Reflect.getMetadata(AUDIT_LOG_KEY,HrController.prototype.attendanceRequestRecalculationPlan).captureBody,false);
 const controller=readFileSync(resolve(__dirname,"hr.controller.ts"),"utf8");
 assert.match(controller,/@Get\("attendance\/requests\/:id\/recalculation-plan"\)[\s\S]*?@RequirePermissions\(HR_PERMISSIONS\.HR_ATTENDANCE_OPERATE\)/);
});

test("approved-request recalculation plan is bounded, scoped, and derives dates from the shared Shanghai helper",async()=>{
 const service=Object.create(HrService.prototype) as HrService;
 Object.defineProperties(service,{
  attendanceRequests:{value:{findOne:async()=>({
   id:"request-1",requestNo:"ATT-1",requestType:"leave",version:5,employeeId:"employee-1",status:"approved",attendanceDate:null,
   startAt:new Date("2026-12-31T16:00:00.000Z"),endAt:new Date("2027-01-02T16:00:00.000Z")
  })}},
  employees:{value:{findOne:async()=>({id:"employee-1",employeeCode:"E-1",fullName:"员工甲"})}},
  auditService:{value:{recordOperationRequired:async()=>undefined}}
 });
 const result=await service.attendanceRequestRecalculationPlan(scope,actor([HR_PERMISSIONS.HR_ATTENDANCE_OPERATE]),"request-1");
 assert.deepEqual(result,{requestId:"request-1",requestNo:"ATT-1",requestType:"leave",requestVersion:5,employeeId:"employee-1",employeeCode:"E-1",employeeName:"员工甲",workDates:["2027-01-01","2027-01-02"]});
 const source=readFileSync(resolve(__dirname,"hr.service.ts"),"utf8");
 assert.match(source,/const workDates=this\.attendanceRequestWorkDates\(request\)/);
 assert.match(source,/request\.status!=="approved"/);
 assert.match(source,/where:\{id,\.\.\.scope,isDeleted:false\}/);
});

test("approved-request recalculation plan rejects operate permission gaps and non-approved requests",async()=>{
 const service=Object.create(HrService.prototype) as HrService;
 Object.defineProperties(service,{attendanceRequests:{value:{findOne:async()=>({status:"submitted"})}},employees:{value:{findOne:async()=>null}},auditService:{value:{recordOperationRequired:async()=>undefined}}});
 await assert.rejects(service.attendanceRequestRecalculationPlan(scope,actor([]),"request-1"),ForbiddenException);
 await assert.rejects(service.attendanceRequestRecalculationPlan(scope,actor([HR_PERMISSIONS.HR_ATTENDANCE_OPERATE]),"request-1"),ConflictException);
});

test("approved-request recalculation plan rejects a mismatched actor scope before reads and keeps required audit failures visible",async()=>{
 let requestReads=0;const service=Object.create(HrService.prototype) as HrService;
 Object.defineProperties(service,{attendanceRequests:{value:{findOne:async()=>{requestReads++;return {id:"request-1",requestNo:"ATT-1",requestType:"correction",version:1,employeeId:"employee-1",status:"approved",attendanceDate:"2026-10-10",startAt:null,endAt:null};}}},employees:{value:{findOne:async()=>({id:"employee-1",employeeCode:"E-1",fullName:"员工甲"})}},auditService:{value:{recordOperationRequired:async()=>{throw new Error("required audit unavailable");}}}});
 await assert.rejects(service.attendanceRequestRecalculationPlan(scope,{...actor([HR_PERMISSIONS.HR_ATTENDANCE_OPERATE]),parkId:"other-park"},"request-1"),ForbiddenException);
 assert.equal(requestReads,0);
 await assert.rejects(service.attendanceRequestRecalculationPlan(scope,actor([HR_PERMISSIONS.HR_ATTENDANCE_OPERATE]),"request-1"),/required audit unavailable/);
 assert.equal(requestReads,1);
});

test("shared work-date helper preserves undated emptiness and the approved plan accepts a 32-day boundary",()=>{
 const dates=(HrService.prototype as unknown as {attendanceRequestWorkDates:(row:{attendanceDate:string|null;startAt:Date|null;endAt:Date|null})=>string[]}).attendanceRequestWorkDates;
 assert.deepEqual(dates.call(HrService.prototype,{attendanceDate:null,startAt:null,endAt:null}),[]);
 assert.equal(dates.call(HrService.prototype,{attendanceDate:null,startAt:new Date("2026-01-01T00:00:00+08:00"),endAt:new Date("2026-02-02T00:00:00+08:00")}).length,32);
});
