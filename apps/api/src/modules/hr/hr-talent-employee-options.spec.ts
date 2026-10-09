import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import {plainToInstance} from "class-transformer";
import {validate} from "class-validator";
import {HR_PERMISSIONS} from "@jinhu/shared";
import {BadRequestException,ForbiddenException,ValidationPipe} from "@nestjs/common";
import {ANY_PERMISSIONS_KEY} from "../../shared/decorators/permissions.decorator";
import type {JwtPrincipal} from "../../shared/types/jwt-principal";
import {HrTalentEmployeeOptionsDto} from "./dto/hr-talent-employee-options.dto";
import {HrTalentController} from "./hr-talent.controller";
import {HrTalentService} from "./hr-talent.service";
const scope={tenantId:"tenant-a",parkId:"park-a"};
const actor:JwtPrincipal={...scope,sub:"synthetic",username:"synthetic",roles:[],permissions:[HR_PERMISSIONS.HR_TALENT_PROFILE_CREATE]};
function fixture(){const calls:Array<{sql:string;params:unknown[]}>=[],audits:unknown[]=[];const service=new HrTalentService({query:async(sql:string,params:unknown[])=>{calls.push({sql,params});return sql.startsWith("SELECT count")?[{total:601}]:[{id:"candidate",employeeCode:"SYN-601",fullName:"合成人员601",private:"excluded"}];}} as never,{recordOperationRequired:async(input:unknown)=>{audits.push(input);}} as never,{} as never);return {service,calls,audits};}
test("existing talent authority, stable bounded projection and metadata audit",async()=>{
 const {service,calls,audits}=fixture();assert.deepEqual(await service.employeeOptions(scope,actor,{page:31,page_size:20}),{items:[{id:"candidate",employeeCode:"SYN-601",fullName:"合成人员601"}],total:601,page:31,page_size:20});
 assert.match(calls[0]!.sql,/ORDER BY e.employee_code,e.id LIMIT \$4 OFFSET \$5/);assert.deepEqual(calls[0]!.params,["tenant-a","park-a","synthetic",20,600]);
 assert.match(calls[0]!.sql,/employment_status='active'/);
 assert.equal((audits[0] as {path:string}).path,"/hr/talent/employee-options");assert.deepEqual((audits[0] as {afterJson:unknown}).afterJson,{fieldGroups:["identity"],projection:"park",itemCount:1});
 assert.deepEqual(Reflect.getMetadata(ANY_PERMISSIONS_KEY,HrTalentController.prototype.employeeOptions),[HR_PERMISSIONS.HR_TALENT_READ,HR_PERMISSIONS.HR_TALENT_TEAM_READ,HR_PERMISSIONS.HR_TALENT_SELF_READ,HR_PERMISSIONS.HR_TALENT_PROFILE_CREATE,HR_PERMISSIONS.HR_TALENT_REVIEW,HR_PERMISSIONS.HR_SUCCESSION_MANAGE,HR_PERMISSIONS.HR_DEVELOPMENT_MANAGE]);
 assert.deepEqual(Reflect.getMetadata(ANY_PERMISSIONS_KEY,HrTalentController.prototype.employeeOptions),Reflect.getMetadata(ANY_PERMISSIONS_KEY,HrTalentController.prototype.options));
});
test("foreign scope and unrelated read authority reject before database access",async()=>{
 for(const denied of [{...actor,permissions:[]},{...actor,permissions:[HR_PERMISSIONS.HR_SUCCESSION_READ]},{...actor,permissions:[HR_PERMISSIONS.HR_EMPLOYEE_READ]},{...actor,tenantId:"foreign"},{...actor,parkId:"foreign"}]){const {service,calls}=fixture();await assert.rejects(service.employeeOptions(scope,denied,{page:1,page_size:20}),ForbiddenException);assert.equal(calls.length,0);}
});
test("search is escaped, bound and omitted from audits; audit rejection fails closed",async()=>{
 const {service,calls,audits}=fixture();await service.employeeOptions(scope,actor,{page:1,page_size:20,keyword:" A_%\\ "});assert.equal(calls[0]!.params[3],"%A\\_\\%\\\\%");assert.ok(!calls[0]!.sql.includes("A_"));assert.ok(!JSON.stringify(audits).includes("A_"));
 const rejecting=new HrTalentService({query:async(sql:string)=>sql.startsWith("SELECT count")?[{total:0}]:[]} as never,{recordOperationRequired:async()=>{throw new Error("audit failure");}} as never,{} as never);await assert.rejects(rejecting.employeeOptions(scope,actor,{page:1,page_size:20}),/audit failure/);
});
test("strict query defaults, scalar decimal integers and bounded literal keywords",async()=>{
 const defaults=plainToInstance(HrTalentEmployeeOptionsDto,{});assert.deepEqual([defaults.page,defaults.page_size],[1,20]);assert.equal((await validate(defaults)).length,0);
 for(const value of [0,-1,1.5,true,null,[],[1],{},""," ","1.0","1e2","0x10","+1",2147483648])assert.ok((await validate(plainToInstance(HrTalentEmployeeOptionsDto,{page:value}))).length,JSON.stringify(value));
 for(const value of [0,101,true,[20]])assert.ok((await validate(plainToInstance(HrTalentEmployeeOptionsDto,{page_size:value}))).length);
 for(const value of ["x".repeat(101),[],1])assert.ok((await validate(plainToInstance(HrTalentEmployeeOptionsDto,{keyword:value}))).length);
 const valid=plainToInstance(HrTalentEmployeeOptionsDto,{page:"31",page_size:"100",keyword:" SYN-601 "});assert.equal((await validate(valid)).length,0);assert.equal(valid.keyword,"SYN-601");
});
test("HTTP query pipe enforces bounds, repeated-query shape and whitelist",async()=>{
 const pipe=new ValidationPipe({transform:true,whitelist:true,forbidNonWhitelisted:true});
 const metadata={type:"query" as const,metatype:HrTalentEmployeeOptionsDto};
 for(const query of [{page:["1","2"]},{page:"2147483648"},{page:true},{page:null},{page_size:["20"]},{page_size:"101"},{keyword:["one","two"]},{extra:"unknown"}])await assert.rejects(pipe.transform(query,metadata),BadRequestException);
 const valid=await pipe.transform({page:"31",page_size:"20"},metadata) as HrTalentEmployeeOptionsDto;assert.equal(valid.page,31);assert.equal(valid.page_size,20);
});
