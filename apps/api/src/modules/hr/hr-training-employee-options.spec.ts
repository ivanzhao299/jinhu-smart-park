import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import {plainToInstance} from "class-transformer";
import {validate} from "class-validator";
import {HR_PERMISSIONS} from "@jinhu/shared";
import {BadRequestException,ForbiddenException,ValidationPipe} from "@nestjs/common";
import {PERMISSIONS_KEY} from "../../shared/decorators/permissions.decorator";
import type {JwtPrincipal} from "../../shared/types/jwt-principal";
import {HrTrainingEmployeeOptionsDto} from "./dto/hr-training-employee-options.dto";
import {HrTrainingController} from "./hr-training.controller";
import {HrTrainingService} from "./hr-training.service";
const scope={tenantId:"tenant-a",parkId:"park-a"};
const actor:JwtPrincipal={...scope,sub:"synthetic",username:"synthetic",roles:[],permissions:[HR_PERMISSIONS.HR_TRAINING_PLAN_MANAGE]};
function fixture(){const calls:Array<{sql:string;params:unknown[]}>=[],audits:unknown[]=[];const service=new HrTrainingService({query:async(sql:string,params:unknown[])=>{calls.push({sql,params});return sql.startsWith("SELECT count")?[{total:601}]:[{id:"candidate",employeeCode:"SYN-601",fullName:"合成人员601",private:"excluded"}];}} as never,{recordOperationRequired:async(input:unknown)=>{audits.push(input);}} as never);return {service,calls,audits};}
test("exact plan-only authority, stable bounded projection and metadata audit",async()=>{
 const {service,calls,audits}=fixture();assert.deepEqual(await service.employeeOptions(scope,actor,{page:31,page_size:20}),{items:[{id:"candidate",employeeCode:"SYN-601",fullName:"合成人员601"}],total:601,page:31,page_size:20});
 assert.match(calls[0]!.sql,/ORDER BY employee_code,id LIMIT \$3 OFFSET \$4/);assert.deepEqual(calls[0]!.params,["tenant-a","park-a",20,600]);
 assert.match(calls[0]!.sql,/IN\('preboarding','probation','active','suspended'\)/);
 assert.equal((audits[0] as {path:string}).path,"/hr/training/employee-options");assert.deepEqual((audits[0] as {afterJson:unknown}).afterJson,{fieldGroups:["identity"],projection:"metadata",itemCount:1});
 for(const method of ["employeeOptions","courseOptions"] as const)assert.deepEqual(Reflect.getMetadata(PERMISSIONS_KEY,HrTrainingController.prototype[method]),[HR_PERMISSIONS.HR_TRAINING_PLAN_MANAGE]);
});
test("foreign scope and unrelated read authority reject before database access",async()=>{
 for(const denied of [{...actor,permissions:[]},{...actor,permissions:[HR_PERMISSIONS.HR_TRAINING_READ]},{...actor,permissions:[HR_PERMISSIONS.HR_EMPLOYEE_READ]},{...actor,tenantId:"foreign"},{...actor,parkId:"foreign"}]){const {service,calls}=fixture();await assert.rejects(service.employeeOptions(scope,denied,{page:1,page_size:20}),ForbiddenException);await assert.rejects(service.courseOptions(scope,denied),ForbiddenException);assert.equal(calls.length,0);}
});
test("search is escaped, bound and omitted from audits; audit rejection fails closed",async()=>{
 const {service,calls,audits}=fixture();await service.employeeOptions(scope,actor,{page:1,page_size:20,keyword:" A_%\\ "});assert.equal(calls[0]!.params[2],"%A\\_\\%\\\\%");assert.ok(!calls[0]!.sql.includes("A_"));assert.ok(!JSON.stringify(audits).includes("A_"));
 const rejecting=new HrTrainingService({query:async(sql:string)=>sql.startsWith("SELECT count")?[{total:0}]:[]} as never,{recordOperationRequired:async()=>{throw new Error("audit failure");}} as never);await assert.rejects(rejecting.employeeOptions(scope,actor,{page:1,page_size:20}),/audit failure/);
});
test("strict query defaults, scalar decimal integers and bounded literal keywords",async()=>{
 const defaults=plainToInstance(HrTrainingEmployeeOptionsDto,{});assert.deepEqual([defaults.page,defaults.page_size],[1,20]);assert.equal((await validate(defaults)).length,0);
 for(const value of [0,-1,1.5,true,null,[],[1],{},""," ","1.0","1e2","0x10","+1",2147483648])assert.ok((await validate(plainToInstance(HrTrainingEmployeeOptionsDto,{page:value}))).length,JSON.stringify(value));
 for(const value of [0,101,true,[20]])assert.ok((await validate(plainToInstance(HrTrainingEmployeeOptionsDto,{page_size:value}))).length);
 for(const value of ["x".repeat(101),[],1])assert.ok((await validate(plainToInstance(HrTrainingEmployeeOptionsDto,{keyword:value}))).length);
 const valid=plainToInstance(HrTrainingEmployeeOptionsDto,{page:"31",page_size:"100",keyword:" SYN-601 "});assert.equal((await validate(valid)).length,0);assert.equal(valid.keyword,"SYN-601");
});
test("HTTP query pipe enforces bounds, repeated-query shape and whitelist",async()=>{
 const pipe=new ValidationPipe({transform:true,whitelist:true,forbidNonWhitelisted:true});
 const metadata={type:"query" as const,metatype:HrTrainingEmployeeOptionsDto};
 for(const query of [{page:["1","2"]},{page:"2147483648"},{page:true},{page:null},{page_size:["20"]},{page_size:"101"},{keyword:["one","two"]},{extra:"unknown"}])await assert.rejects(pipe.transform(query,metadata),BadRequestException);
 const valid=await pipe.transform({page:"31",page_size:"20"},metadata) as HrTrainingEmployeeOptionsDto;assert.equal(valid.page,31);assert.equal(valid.page_size,20);
});
