import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { after,before,describe,it,test } from "node:test";
import { ConflictException } from "@nestjs/common";
import { HR_PERMISSIONS } from "@jinhu/shared";
import { DataSource,EntitySchema } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { OrgEntity } from "../orgs/entities/org.entity";
import { HrApprovalActionEntity,HrApprovalRequestEntity,HrAttendanceRequestEntity,HrEmployeeEntity } from "./entities/hr.entities";
import { HrService } from "./hr.service";

const required=process.env.HR_ATTENDANCE_REQUEST_PG_REQUIRED==="1";
if(required&&!process.env.POSTGRES_PASSWORD)throw new Error("POSTGRES_PASSWORD is required for attendance-request PostgreSQL gate");
const suite=required?describe:describe.skip;
const organizationReadSchema=new EntitySchema<OrgEntity>({name:"AttendanceRequestOrgRead",target:OrgEntity,tableName:"sys_org",columns:{id:{type:"uuid",primary:true},tenantId:{name:"tenant_id",type:"varchar",length:8},parkId:{name:"park_id",type:"varchar",length:8},orgName:{name:"org_name",type:"varchar",length:100},isDeleted:{name:"is_deleted",type:"boolean"}}});

test("attendance reads preserve employees without an organization and project a null label",()=>{
 const service=readFileSync(resolve(__dirname,"hr.service.ts"),"utf8");
 const webApi=readFileSync(resolve(__dirname,"../../../../web/lib/hr-api.ts"),"utf8");
 const query=service.slice(service.indexOf("private attendanceRequestReadQuery"),service.indexOf("private projectAttendanceRequest",service.indexOf("private attendanceRequestReadQuery")));
 const projection=service.slice(service.indexOf("private projectAttendanceRequest("),service.indexOf("private projectAttendanceRequestEntity"));
 assert.match(query,/\.leftJoin\(OrgEntity,"organization"/);
 assert.doesNotMatch(query,/\.innerJoin\(OrgEntity,"organization"/);
 assert.match(projection,/organizationName:row\.organization_name===null\|\|row\.organization_name===undefined\?null:String\(row\.organization_name\)/);
 const attendanceRequest=webApi.match(/export interface HrAttendanceRequest \{([^}]*)\}/)?.[1]??"";
 assert.match(attendanceRequest,/\borganizationName:string\|null;/);
});

suite("HR attendance request PostgreSQL gate",()=>{
 let dataSource:DataSource,service:HrService,employeeUser:string,reviewerUser:string,employeeId:string;
 const scope={tenantId:"10000001",parkId:"20000001"};
 const actor=(sub:string,permissions:string[]=[]):JwtPrincipal=>({sub,username:`attendance-${sub.slice(0,8)}`,tenantId:scope.tenantId,parkId:scope.parkId,roles:[],permissions});

 before(async()=>{
  dataSource=new DataSource({type:"postgres",host:process.env.POSTGRES_HOST??"127.0.0.1",port:Number(process.env.POSTGRES_PORT??"5432"),database:process.env.POSTGRES_DB??"jinhu_smart_park",username:process.env.POSTGRES_USER??"jinhu",password:process.env.POSTGRES_PASSWORD,entities:[organizationReadSchema,HrEmployeeEntity,HrApprovalRequestEntity,HrApprovalActionEntity,HrAttendanceRequestEntity]});
  await dataSource.initialize();
  employeeUser=randomUUID();reviewerUser=randomUUID();employeeId=randomUUID();
  await dataSource.query("INSERT INTO sys_user(id,tenant_id,park_id,username,display_name,password_hash,status) VALUES($1,$2,$3,$4,'Attendance employee','not-a-login-hash','enabled'),($5,$2,$3,$6,'Attendance reviewer','not-a-login-hash','enabled')",[employeeUser,scope.tenantId,scope.parkId,`att-e-${employeeUser.slice(0,8)}`,reviewerUser,`att-r-${reviewerUser.slice(0,8)}`]);
  await dataSource.query("INSERT INTO hr_employee(id,tenant_id,park_id,employee_code,full_name,user_id,employment_status) VALUES($1,$2,$3,$4,'Attendance employee',$5,'active')",[employeeId,scope.tenantId,scope.parkId,`ATT-${employeeId.slice(0,8)}`,employeeUser]);
  const args=Array(32).fill(undefined);
  args[0]=dataSource.getRepository(HrEmployeeEntity);args[18]=dataSource.getRepository(HrApprovalRequestEntity);args[26]=dataSource.getRepository(HrAttendanceRequestEntity);args[29]={publishAttendanceRequestSubmitted:async()=>undefined,publishAttendanceRequestReviewed:async()=>undefined};args[30]=dataSource;args[31]={recordOperationRequired:async()=>undefined};
  service=Reflect.construct(HrService,args) as HrService;
 });

 after(async()=>{
  if(!dataSource?.isInitialized)return;
  await dataSource.query("DELETE FROM hr_approval_action WHERE request_id IN(SELECT id FROM hr_approval_request WHERE create_by=$1)",[employeeUser]);
  await dataSource.query("DELETE FROM hr_attendance_request WHERE create_by=$1",[employeeUser]);
  await dataSource.query("DELETE FROM hr_approval_request WHERE create_by=$1",[employeeUser]);
  await dataSource.query("DELETE FROM hr_employee WHERE id=$1",[employeeId]);
  await dataSource.query("DELETE FROM sys_user WHERE id IN($1,$2)",[employeeUser,reviewerUser]);
  await dataSource.destroy();
 });

 it("keeps request, approval and overlap facts transactionally consistent",async()=>{
  const employee=actor(employeeUser),reviewer=actor(reviewerUser,[HR_PERMISSIONS.HR_ATTENDANCE_READ]);
  const created=await service.createAttendanceRequest(scope,employee,{requestType:"leave",startAt:"2026-08-24T08:00:00+08:00",endAt:"2026-08-24T17:30:00+08:00",reason:"isolated attendance verification"});
  assert.equal(created.status,"draft");assert.equal(created.durationMinutes,570);assert.equal(created.leavePlannedMinutes,480);assert.equal(created.leaveEffectiveMinutes,0);assert.equal(created.leaveDayCount,1);assert.equal(created.isSelf,true);
  const submitted=await service.submitAttendanceRequest(scope,employee,created.id);
  assert.equal(submitted.status,"submitted");
  const reviewed=await service.reviewAttendanceRequest(scope,reviewer,created.id,"approve",{});
  assert.equal(reviewed.status,"approved");assert.equal(reviewed.leaveEffectiveMinutes,480);assert.equal(reviewed.isSelf,false);
  const listed=await service.listAttendanceRequests(scope,reviewer,{page:1,page_size:30});
  const listedCreated=listed.items.find(item=>item.id===created.id);
  assert.ok(listedCreated);
  assert.equal(listedCreated.organizationName,null);
  const actionRows=await dataSource.query("SELECT action,before_status,after_status FROM hr_approval_action WHERE request_id=(SELECT approval_request_id FROM hr_attendance_request WHERE id=$1) ORDER BY create_time,id",[created.id]);
  assert.deepEqual(actionRows.map((row:{action:string;before_status:string;after_status:string})=>[row.action,row.before_status,row.after_status]),[["submit","draft","submitted"],["approve","submitted","approved"]]);
  const overlapping=await service.createAttendanceRequest(scope,employee,{requestType:"overtime",startAt:"2026-08-24T16:30:00+08:00",endAt:"2026-08-24T18:00:00+08:00",reason:"isolated overlap verification"});
  await assert.rejects(service.submitAttendanceRequest(scope,employee,overlapping.id),ConflictException);
  const states=await dataSource.query("SELECT status FROM hr_attendance_request WHERE id IN($1,$2) ORDER BY id",[created.id,overlapping.id]);
  assert.deepEqual(states.map((row:{status:string})=>row.status).sort(),["approved","draft"]);
 });
});
