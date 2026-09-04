import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { HR_PERMISSIONS } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { ANY_PERMISSIONS_KEY } from "../../shared/decorators/permissions.decorator";
import { HrController } from "./hr.controller";
import { HrService } from "./hr.service";
import { projectLeaveRoutineImpact } from "./hr-leave-routine-equivalence";

const actor=(permissions:string[]):JwtPrincipal=>({sub:"user-1",username:"tester",tenantId:"tenant-1",parkId:"park-1",roles:[],permissions,isSuper:false});

test("bs_readfromLeave modern read projection remains fail-closed behind exact attendance permissions",async()=>{
 assert.deepEqual(Reflect.getMetadata(ANY_PERMISSIONS_KEY,HrController.prototype.attendanceRequests),[
  HR_PERMISSIONS.HR_ATTENDANCE_READ,
  HR_PERMISSIONS.HR_ATTENDANCE_TEAM_READ,
  HR_PERMISSIONS.HR_ATTENDANCE_SELF_READ,
 ]);
 const service=Reflect.construct(HrService,Array(32).fill({})) as HrService;
 assert.deepEqual(await service.listAttendanceRequests({tenantId:"tenant-1",parkId:"park-1"},actor([HR_PERMISSIONS.HR_ATTENDANCE_REQUEST]),{page:1,page_size:20,type:"leave"}),{items:[],total:0,page:1,page_size:20});
});

test("bs_readfromLeave normalized impact conserves minutes and excludes non-approved state",()=>{
 const request={requestType:"leave",startAt:new Date("2026-09-01T10:00:00+08:00"),endAt:new Date("2026-09-03T15:00:00+08:00")};
 const draft=projectLeaveRoutineImpact({...request,status:"draft"});
 const approved=projectLeaveRoutineImpact({...request,status:"approved"});
 assert.equal(draft.plannedMinutes,1260);
 assert.equal(draft.effectiveMinutes,0);
 assert.equal(approved.effectiveMinutes,1260);
 assert.equal(approved.effectiveMinutes,approved.segments.reduce((sum,row)=>sum+row.modernMinutes,0));
});
