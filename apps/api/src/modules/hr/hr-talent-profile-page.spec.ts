import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import {ValidationPipe,BadRequestException,ForbiddenException} from "@nestjs/common";
import {HR_PERMISSIONS as H} from "@jinhu/shared";
import {ANY_PERMISSIONS_KEY} from "../../shared/decorators/permissions.decorator";
import type {JwtPrincipal} from "../../shared/types/jwt-principal";
import {HrTalentProfilePageDto} from "./dto/hr-talent-profile-page.dto";
import {HrTalentController} from "./hr-talent.controller";
import {HrTalentService} from "./hr-talent.service";
const scope={tenantId:"tenant",parkId:"park"},actor:JwtPrincipal={...scope,sub:"synthetic-actor",username:"synthetic",roles:[],permissions:[H.HR_TALENT_READ]};
function fixture(failAudit=false){
 const calls:Array<{sql:string;params:unknown[]}>=[],events:unknown[]=[];let transactions=0;
 const service=new HrTalentService({transaction:async(isolation:string,job:(m:unknown)=>Promise<unknown>)=>{transactions++;assert.equal(isolation,"REPEATABLE READ");return job({query:async(sql:string,params:unknown[]=[])=>{calls.push({sql,params});if(sql.startsWith("SELECT count"))return[{total:601,employeeCount:3}];if(sql.startsWith("SELECT p.id"))return[{id:"profile",snapshotNo:2,asOfDate:"2026-09-01",employeeName:"合成员工",employeeCode:"SYN-E",performanceSource:{finalLevelCode:"A"},feedbackSource:{cycleName:"合成周期"},createdAt:"2026-10-01"}];return[];}});}} as never,{recordOperationRequired:async(event:unknown)=>{if(failAudit)throw Error("synthetic required audit failure");events.push(event);}} as never,{} as never);
 return {service,calls,events,transactions:()=>transactions};
}
test("exact original read atoms, bounded projection and same-snapshot counts",async()=>{
 assert.deepEqual(Reflect.getMetadata(ANY_PERMISSIONS_KEY,HrTalentController.prototype.profilePage),[H.HR_TALENT_READ,H.HR_TALENT_TEAM_READ,H.HR_TALENT_SELF_READ]);
 const f=fixture(),value=await f.service.profilePage(scope,actor,{page:31,page_size:20});assert.equal(value.total,601);assert.equal(value.employeeCount,3);assert.equal(value.items.length,1);assert.equal(f.calls[0]!.sql,"SET TRANSACTION READ ONLY");assert.match(f.calls[1]!.sql,/count\(DISTINCT p.employee_id\)/);assert.match(f.calls[2]!.sql,/ORDER BY p.created_at DESC,p.id DESC LIMIT \$4 OFFSET \$5/);assert.deepEqual(f.calls[2]!.params,["tenant","park","synthetic-actor",20,600]);assert.match(f.calls[2]!.sql,/performance_source-'id'/);assert.match(f.calls[2]!.sql,/feedback_source-'subjectId'/);assert.doesNotMatch(f.calls[2]!.sql,/employment_status=|e.is_deleted=|work_mobile/);
 assert.equal((f.events[0] as {path:string}).path,"/hr/talent/profiles-page");assert.deepEqual((f.events[0] as {afterJson:unknown}).afterJson,{fieldGroups:["feedback"],projection:"park",itemCount:1});
});
test("write-only, foreign scope and invalid direct pages fail before transaction",async()=>{
 for(const permissions of [[],[H.HR_TALENT_PROFILE_CREATE],[H.HR_TALENT_REVIEW],[H.HR_SUCCESSION_READ],[H.HR_SUCCESSION_MANAGE],[H.HR_DEVELOPMENT_MANAGE],[H.HR_EMPLOYEE_READ]]){const f=fixture();await assert.rejects(f.service.profilePage(scope,{...actor,permissions},{page:1,page_size:20}),ForbiddenException);assert.equal(f.transactions(),0);}
 for(const denied of [{...actor,tenantId:"foreign"},{...actor,parkId:"foreign"}]){const f=fixture();await assert.rejects(f.service.profilePage(scope,denied,{page:1,page_size:20}),ForbiddenException);assert.equal(f.transactions(),0);}
 for(const query of [{page:0,page_size:20},{page:2147483648,page_size:20},{page:1,page_size:101}]){const f=fixture();await assert.rejects(f.service.profilePage(scope,actor,query),BadRequestException);assert.equal(f.transactions(),0);}
});
test("literal search and employee ID bind into both queries; team/self projections and audit failure",async()=>{
 for(const [permission,projection,scopePattern] of [[H.HR_TALENT_TEAM_READ,"team","WITH RECURSIVE managed_org"],[H.HR_TALENT_SELF_READ,"self","e.user_id=$3"]]){
  const f=fixture();await f.service.profilePage(scope,{...actor,permissions:[permission!]},{page:1,page_size:20,employeeId:"employee",keyword:" A_%\\ "});for(const call of f.calls.slice(1)){assert.ok(call.sql.includes(scopePattern!));assert.deepEqual(call.params.slice(0,5),["tenant","park","synthetic-actor","employee","%A\\_\\%\\\\%"]);assert.ok(!call.sql.includes("A_%"));}assert.equal((f.events[0] as {afterJson:{projection:string}}).afterJson.projection,projection);assert.ok(!JSON.stringify(f.events).includes("A_%"));
 }
 await assert.rejects(fixture(true).service.profilePage(scope,actor,{page:1,page_size:20}),/required audit failure/);
});
test("real HTTP validation inherits strict scalar pages, literal keyword and optional UUID whitelist",async()=>{
 const pipe=new ValidationPipe({transform:true,whitelist:true,forbidNonWhitelisted:true}),meta={type:"query" as const,metatype:HrTalentProfilePageDto};
 for(const query of [{page:["1","2"]},{page:true},{page:null},{page:"1e2"},{page:"0x10"},{page:""},{page:"2147483648"},{page_size:"101"},{keyword:["a"]},{keyword:"x".repeat(101)},{employeeId:"invalid"},{employeeId:["a"]},{sessionId:"extra"}])await assert.rejects(pipe.transform(query,meta),BadRequestException);
 const valid=await pipe.transform({page:"31",page_size:"20",keyword:" SYN-601 ",employeeId:"00000000-0000-4000-8000-000000000601"},meta) as HrTalentProfilePageDto;assert.equal(valid.page,31);assert.equal(valid.keyword,"SYN-601");const defaults=await pipe.transform({},meta) as HrTalentProfilePageDto;assert.equal(defaults.page,1);assert.equal(defaults.page_size,20);
});
