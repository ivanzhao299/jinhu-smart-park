import "reflect-metadata";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { HR_PERMISSIONS } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { ANY_PERMISSIONS_KEY } from "../../shared/decorators/permissions.decorator";
import { HrController } from "./hr.controller";
import { HrService } from "./hr.service";

const actor=(permissions:string[]):JwtPrincipal=>({sub:"user-1",username:"tester",tenantId:"tenant-1",parkId:"park-1",roles:[],permissions,isSuper:false});

test("u_errandrecords business-trip projection preserves organization and nullable declared days without leaking source binding",()=>{
 const service=Reflect.construct(HrService,Array(32).fill({})) as HrService;
 const project=(service as unknown as {projectAttendanceRequest:(row:Record<string,unknown>,access:"park",actorUserId?:string)=>Record<string,unknown>}).projectAttendanceRequest.bind(service);
 const source={id:"request-1",request_no:"TRIP-1",employee_id:"employee-1",employee_code:"E-1",employee_name:"Employee",employee_user_id:"user-2",organization_name:"Organization",request_type:"business_trip",start_at:"2026-09-01T01:00:00.000Z",end_at:"2026-09-02T09:00:00.000Z",attendance_date:null,duration_minutes:1920,legacy_declared_days:2,legacy_source_id:7,legacy_source_identity_sha256:"a".repeat(64),reason:"fixture",status:"approved",submitted_at:null,reviewed_at:null,review_comment:null};
 const before=structuredClone(source),row=project(source,"park","user-1");
 assert.deepEqual(source,before);
 assert.equal(row.requestType,"business_trip");
 assert.equal(row.employeeCode,"E-1");
 assert.equal(row.employeeName,"Employee");
 assert.equal(row.startAt,"2026-09-01T01:00:00.000Z");
 assert.equal(row.endAt,"2026-09-02T09:00:00.000Z");
 assert.equal(row.durationMinutes,1920);
 assert.equal(row.organizationName,"Organization");
 assert.equal(row.legacyDeclaredDays,2);
 assert.equal("legacySourceId" in row,false);
 assert.equal("legacySourceIdentitySha256" in row,false);
 assert.equal(project({...source,legacy_declared_days:null},"park","user-1").legacyDeclaredDays,null);
});

test("u_errandrecords modern list remains fail-closed without an exact attendance read permission",async()=>{
 assert.deepEqual(Reflect.getMetadata(ANY_PERMISSIONS_KEY,HrController.prototype.attendanceRequests),[
  HR_PERMISSIONS.HR_ATTENDANCE_READ,
  HR_PERMISSIONS.HR_ATTENDANCE_TEAM_READ,
  HR_PERMISSIONS.HR_ATTENDANCE_SELF_READ,
 ]);
 assert.deepEqual(Reflect.getMetadata(ANY_PERMISSIONS_KEY,HrController.prototype.attendanceRequest),[
  HR_PERMISSIONS.HR_ATTENDANCE_READ,
  HR_PERMISSIONS.HR_ATTENDANCE_TEAM_READ,
  HR_PERMISSIONS.HR_ATTENDANCE_SELF_READ,
 ]);
 const service=Reflect.construct(HrService,Array(32).fill({})) as HrService;
 assert.deepEqual(await service.listAttendanceRequests({tenantId:"tenant-1",parkId:"park-1"},actor([HR_PERMISSIONS.HR_ATTENDANCE_REQUEST]),{page:1,page_size:20,type:"business_trip"}),{items:[],total:0,page:1,page_size:20});
 await assert.rejects(service.detailAttendanceRequest({tenantId:"tenant-1",parkId:"park-1"},actor([HR_PERMISSIONS.HR_ATTENDANCE_REQUEST]),"00000000-0000-4000-8000-000000000001"),/Attendance request not found/);
});

test("u_errandrecords detail applies park read authority and audits the scoped projection before returning",async()=>{
 const row={id:"request-1",request_no:"TRIP-1",employee_id:"employee-1",employee_code:"E-1",employee_name:"Employee",employee_user_id:"user-2",organization_name:"Organization",request_type:"business_trip",start_at:"2026-09-01T01:00:00.000Z",end_at:"2026-09-02T09:00:00.000Z",attendance_date:null,duration_minutes:1920,legacy_declared_days:2,reason:"fixture",status:"approved",submitted_at:null,reviewed_at:null,review_comment:null};
 const query={innerJoin(){return this;},leftJoin(){return this;},where(){return this;},select(){return this;},andWhere(){return this;},async getRawOne(){return row;}};
 const audits:Array<Record<string,unknown>>=[];
 const service=Reflect.construct(HrService,Array(32).fill({})) as HrService;
 Object.assign(service as unknown as Record<string,unknown>,{attendanceRequests:{createQueryBuilder:()=>query},auditService:{recordOperationRequired:async(input:Record<string,unknown>)=>{audits.push(input);}}});
 const result=await service.detailAttendanceRequest({tenantId:"tenant-1",parkId:"park-1"},actor([HR_PERMISSIONS.HR_ATTENDANCE_READ]),"00000000-0000-4000-8000-000000000001") as Record<string,unknown>;
 assert.equal(result.organizationName,"Organization");
 assert.equal(result.legacyDeclaredDays,2);
 assert.equal(audits.length,1);
 assert.deepEqual(audits[0]?.afterJson,{fieldGroups:["attendance"],projection:"park",itemCount:1});
});

test("u_errandrecords compatibility check does not invent write-side equivalence",()=>{
 const listSource=HrService.prototype.listAttendanceRequests.toString();
 assert.match(listSource,/request_type=:type/);
 const querySource=(HrService.prototype as unknown as {attendanceRequestReadQuery:()=>unknown}).attendanceRequestReadQuery.toString();
 assert.match(querySource,/innerJoin\([^,]*HrEmployeeEntity/);
 assert.match(querySource,/leftJoin\([^,]*OrgEntity/);
 assert.doesNotMatch(listSource,/\.save\(|\.insert\(|\.update\(|\.delete\(/);
});

test("legacy source binding is migration-only and remains auditable for exact rollback",()=>{
 const migration=readFileSync("database/migrations/000297_hr_attendance_business_trip_legacy_source.sql","utf8");
 for(const field of ["legacy_source_table","legacy_source_id","legacy_declared_days","legacy_source_identity_sha256","legacy_source_row_sha256"])assert.match(migration,new RegExp(field));
 assert.match(migration,/legacy_source_table = 'dbo\.errand'/);
 assert.match(migration,/request_type = 'business_trip'/);
 assert.match(migration,/approval_request_id IS NULL/);
 assert.match(migration,/status = 'approved'/);
 assert.match(migration,/uq_hr_attendance_request_legacy_source_id/);
 assert.match(migration,/legacy_record_map for audited load and rollback/);
 const writeSource=HrService.prototype.createAttendanceRequest.toString();
 for(const field of ["isHistoricalImport","legacySourceTable","legacySourceId","legacyDeclaredDays","legacySourceIdentitySha256","legacySourceRowSha256"])assert.match(writeSource,new RegExp(`${field}:\\s*(?:false|null)`));
});
