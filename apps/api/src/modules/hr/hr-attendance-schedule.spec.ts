import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import {ValidationPipe} from "@nestjs/common";
import {HR_PERMISSIONS} from "@jinhu/shared";
import {PERMISSIONS_KEY} from "../../shared/decorators/permissions.decorator";
import {AUDIT_LOG_KEY} from "../audit/decorators/audit-log.decorator";
import {HrController} from "./hr.controller";
import {HrEmployeeScheduleQueryDto,UpdateHrEmployeeScheduleDto} from "./dto/hr.dto";
import {HrService} from "./hr.service";
import type {JwtPrincipal} from "../../shared/types/jwt-principal";

test("schedule read and update retain exact attendance operation authority and idempotent body-free writes",()=>{
 for(const method of ["attendanceSchedule","updateAttendanceSchedule"] as const)assert.deepEqual(Reflect.getMetadata(PERMISSIONS_KEY,HrController.prototype[method]),[HR_PERMISSIONS.HR_ATTENDANCE_OPERATE]);
 assert.ok(Reflect.getMetadata("__interceptors__",HrController.prototype.updateAttendanceSchedule)?.length);assert.equal(Reflect.getMetadata(AUDIT_LOG_KEY,HrController.prototype.updateAttendanceSchedule).captureBody,false);
});
test("schedule query and adjustment reject invalid dates, versions, references and empty reasons through the real pipe",async()=>{
 const pipe=new ValidationPipe({transform:true,whitelist:true,forbidNonWhitelisted:true}),id="00000000-0000-4000-8000-00000000d501";
 const query={employee_id:id,work_date:"2026-10-10"},body={shiftId:id,expectedVersion:1,reason:"  正式调班  "};
 assert.equal((await pipe.transform(body,{type:"body",metatype:UpdateHrEmployeeScheduleDto})).reason,"正式调班");
 for(const invalid of [{...query,work_date:"2026-02-30"},{...query,work_date:"2026-10-10T01:00:00Z"},{...query,employee_id:[id]},{...query,other:"value"}])await assert.rejects(pipe.transform(invalid,{type:"query",metatype:HrEmployeeScheduleQueryDto}));
 for(const invalid of [{...body,expectedVersion:0},{...body,expectedVersion:1.5},{...body,expectedVersion:"1"},{...body,reason:"  "},{...body,reason:"x".repeat(501)},{...body,shiftId:"wrong"},{...body,employeeId:id}])await assert.rejects(pipe.transform(invalid,{type:"body",metatype:UpdateHrEmployeeScheduleDto}));
});
test("denied or mismatched principals fail before any schedule database access",async()=>{
 const service=Object.create(HrService.prototype) as HrService,scope={tenantId:"tenant",parkId:"park"},actor={sub:"user",...scope,roles:[],permissions:["hr:attendance:self_read"]} as unknown as JwtPrincipal;
 await assert.rejects(service.getEmployeeSchedule(scope,actor,{employee_id:"employee",work_date:"2026-10-10"}),/permission is required/);
 await assert.rejects(service.updateEmployeeSchedule(scope,{...actor,permissions:[HR_PERMISSIONS.HR_ATTENDANCE_OPERATE],parkId:"foreign"},"id",{shiftId:"shift",expectedVersion:1,reason:"业务调班"}),/permission is required/);
});

test("calculating months reject a daily fact change before accessing employee or result writes",async()=>{
 const service=Object.create(HrService.prototype) as HrService,scope={tenantId:"tenant",parkId:"park"};let reads=0;
 const manager={query:async(sql:string)=>{reads++;return sql.includes("FROM hr_attendance_period")?[{id:"period",status:"calculating"}]:[]},getRepository:()=>{throw new Error("Unexpected fact repository access")}};
 Object.defineProperty(service,"dataSource",{value:{transaction:async(callback:(value:typeof manager)=>Promise<unknown>)=>callback(manager)}});
 await assert.rejects(service.recalculateAttendanceDay(scope,{sub:"user"} as JwtPrincipal,{employeeId:"employee",workDate:"2026-10-10",ruleVersion:"v1"}),/月考勤正在计算/);assert.equal(reads,2);
});
