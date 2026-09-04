import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { NotFoundException } from "@nestjs/common";
import { HR_PERMISSIONS } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { PERMISSIONS_KEY } from "../../shared/decorators/permissions.decorator";
import { HrController } from "./hr.controller";
import { HrService } from "./hr.service";

const scope={tenantId:"tenant-1",parkId:"park-1"};
const employeeId="10000000-0000-4000-8000-000000000001";
const actor:JwtPrincipal={sub:"20000000-0000-4000-8000-000000000001",username:"hr-admin",tenantId:scope.tenantId,parkId:scope.parkId,roles:["HR_MANAGER"],permissions:[HR_PERMISSIONS.HR_EMPLOYMENT_EVENT_READ]};
const event={
 id:"30000000-0000-4000-8000-000000000001",eventNo:"EVT-20260904-0001",eventType:"transfer",effectiveDate:"2026-09-04",reason:"岗位调整",createTime:new Date("2026-09-04T08:00:00.000Z"),
 tenantId:scope.tenantId,parkId:scope.parkId,employeeId,beforeSnapshot:{private:"before"},afterSnapshot:{private:"after"},status:"effective",legacyEventNo:"legacy-private",legacyEventType:"legacy-private",legacyState:"legacy-private",sourceEffectiveAt:new Date("2026-09-04T07:00:00.000Z"),migrationDecision:"accepted",isHistoricalImport:true,createBy:"private-actor",updateBy:"private-actor",updateTime:new Date("2026-09-04T08:00:00.000Z"),isDeleted:false,version:1,remark:"private-remark",
};

function fixture(rows:Array<typeof event>,audit:()=>Promise<void>=async()=>undefined){
 const employeeReads:unknown[]=[];
 const eventQueries:unknown[]=[];
 const auditInputs:unknown[]=[];
 const target={
  employees:{findOne:async(options:unknown)=>{employeeReads.push(options);return {id:employeeId};}},
  events:{find:async(options:unknown)=>{eventQueries.push(options);return rows;}},
  auditService:{recordOperationRequired:async(input:unknown)=>{auditInputs.push(input);await audit();}},
  detailEmployee:HrService.prototype.detailEmployee,
 };
 return {employeeReads,eventQueries,auditInputs,run:(principal=actor)=>HrService.prototype.employeeEvents.call(target as never,scope,principal,employeeId)};
}

test("employee-event list binds actor, exact permission, and tenant-park scope",async()=>{
 assert.deepEqual(Reflect.getMetadata(PERMISSIONS_KEY,HrController.prototype.events),[HR_PERMISSIONS.HR_EMPLOYMENT_EVENT_READ]);
 const current=fixture([event]);
 await current.run();
 assert.deepEqual(current.employeeReads,[{where:{id:employeeId,...scope,isDeleted:false}}]);
 const query=current.eventQueries[0] as {select:Record<string,boolean>;where:Array<Record<string,unknown>>};
 assert.deepEqual(Object.keys(query.select).sort(),["createTime","effectiveDate","eventNo","eventType","id","reason"]);
 assert.equal(query.where.length,2);
 for(const where of query.where){assert.equal(where.tenantId,scope.tenantId);assert.equal(where.parkId,scope.parkId);assert.equal(where.employeeId,employeeId);assert.equal(where.isDeleted,false);}
 await assert.rejects(current.run({...actor,tenantId:"tenant-2"}),NotFoundException);
 await assert.rejects(current.run({...actor,parkId:"park-2"}),NotFoundException);
 await assert.rejects(current.run({...actor,permissions:[]}),NotFoundException);
});

test("employee-event response is an explicit allowlist without legacy, source, audit, or snapshot fields",async()=>{
 const current=fixture([event]);
 const result=await current.run();
 assert.deepEqual(result,[{id:event.id,eventNo:event.eventNo,eventType:event.eventType,effectiveDate:event.effectiveDate,reason:event.reason,createTime:"2026-09-04T08:00:00.000Z"}]);
 assert.deepEqual(Object.keys(result[0]!).sort(),["createTime","effectiveDate","eventNo","eventType","id","reason"]);
 for(const forbidden of ["tenantId","parkId","employeeId","employeeName","employeeCode","fullName","mobile","idNumber","beforeSnapshot","afterSnapshot","status","legacyEventNo","legacyEventType","legacyState","sourceEffectiveAt","migrationDecision","isHistoricalImport","createBy","updateBy","updateTime","isDeleted","version","remark","source_ref","source_hash"]){
  assert.equal(forbidden in result[0]!,false,`${forbidden} must not be exposed`);
 }
});

test("authorized empty event reads are audited and required-audit failure blocks the response",async()=>{
 const empty=fixture([]);
 assert.deepEqual(await empty.run(),[]);
 assert.equal(empty.auditInputs.length,1);
 assert.deepEqual(empty.auditInputs[0],{
  tenantId:scope.tenantId,parkId:scope.parkId,userId:actor.sub,username:actor.username,realName:null,roleCodes:actor.roles,module:"人力资源管理",resource:"hr.employment_event",action:"读取员工任职历史",bizType:"hr_employee",bizId:employeeId,beforeJson:null,afterJson:{fieldGroups:[],projection:"park",itemCount:0},method:"GET",path:"/hr/employees/:id/events",success:true,result:"success",requestId:null,
 });
 const failed=fixture([event],async()=>{throw new Error("required audit unavailable");});
 await assert.rejects(failed.run(),/required audit unavailable/u);
});
