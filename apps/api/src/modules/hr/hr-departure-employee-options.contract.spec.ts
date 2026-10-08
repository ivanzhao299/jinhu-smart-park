import assert from "node:assert/strict";
import {test} from "node:test";
import {plainToInstance} from "class-transformer";
import {validate} from "class-validator";
import {BadRequestException,ValidationPipe} from "@nestjs/common";
import {HR_PERMISSIONS} from "@jinhu/shared";
import type {DataSource} from "typeorm";
import {HrDepartureEmployeeOptionsDto} from "./dto/hr-departure.dto";
import {HrDepartureService} from "./hr-departure.service";
const scope={tenantId:"tenant",parkId:"park"};
const actor=(permissions:string[])=>({sub:"actor",username:"test",...scope,roles:[],permissions});
test("departure candidate bounds and purpose validate before queries",async()=>{
 const defaults=plainToInstance(HrDepartureEmployeeOptionsDto,{});assert.equal(defaults.page_size,20);assert.equal(defaults.purpose,"application");assert.deepEqual(await validate(defaults),[]);
 for(const input of [{page:0},{page:1.5},{page_size:101},{page_size:0},{keyword:"a".repeat(101)},{purpose:"employee"},{selected_id:"no"},{exclude_employee_id:"no"}])assert.ok((await validate(plainToInstance(HrDepartureEmployeeOptionsDto,input))).length);
 assert.equal(plainToInstance(HrDepartureEmployeeOptionsDto,{keyword:"  employee  "}).keyword,"employee");
});
test("HTTP query validation rejects malformed scalar pages and unsafe offsets",async()=>{
 const pipe=new ValidationPipe({transform:true,whitelist:true,forbidNonWhitelisted:true});
 const metadata={type:"query" as const,metatype:HrDepartureEmployeeOptionsDto};
 for(const input of [{page:"1e30"},{page:"2147483648"},{page:1e30},{page:["1"]},{page:["1","2"]},{page:true},{page:null},{page_size:["20"]},{page_size:"1.5"},{page_size:""},{keyword:["one","two"]},{purpose:["application","handover"]}])await assert.rejects(pipe.transform(input,metadata),BadRequestException);
 const valid=await pipe.transform({page:"26",page_size:"20"},metadata) as HrDepartureEmployeeOptionsDto;
 assert.equal(valid.page,26);assert.equal(valid.page_size,20);
});
test("exact purpose permissions and departure scope reject before database access",async()=>{
 let queries=0;const service=new HrDepartureService({query:async()=>{queries++;return [];}} as unknown as DataSource,{} as never);
 for(const permissions of [[],["hr:employee:read"],[HR_PERMISSIONS.HR_DEPARTURE_MANAGE],[HR_PERMISSIONS.HR_DEPARTURE_HANDOVER,HR_PERMISSIONS.HR_DEPARTURE_READ]])await assert.rejects(service.employeeOptions(scope,actor(permissions),new HrDepartureEmployeeOptionsDto()),/permission|scope/i);
 await assert.rejects(service.employeeOptions(scope,{...actor(["*"]),parkId:"foreign"},new HrDepartureEmployeeOptionsDto()),/scope mismatch/i);assert.equal(queries,0);
});
test("handover-only action users use their departure team scope, stable paging and literal keywords",async()=>{
 const calls:Array<{sql:string;args:unknown[]}>=[];
 const service=new HrDepartureService({query:async(sql:string,args:unknown[])=>{calls.push({sql,args});return sql.includes("count(*)")?[{total:501}]:[];}} as unknown as DataSource,{recordOperationRequired:async()=>undefined} as never);
 const result=await service.employeeOptions(scope,actor([HR_PERMISSIONS.HR_DEPARTURE_HANDOVER,HR_PERMISSIONS.HR_DEPARTURE_TEAM_READ]),plainToInstance(HrDepartureEmployeeOptionsDto,{purpose:"handover",page:26,keyword:"%_\\",selected_id:"00000000-0000-4000-8000-000000000011"}));
 assert.equal(result.total,501);assert.equal(calls.length,3);
 for(const call of calls)assert.match(call.sql,/WITH RECURSIVE managed_org/);
 assert.match(calls[2]!.sql,/ORDER BY e.full_name,e.id LIMIT \$5 OFFSET \$6/);assert.deepEqual(calls[2]!.args,["tenant","park","actor","%\\%\\_\\\\%",20,500]);assert.doesNotMatch(calls[0]!.sql,/ILIKE/);
});

test("candidate audit failure prevents a successful response",async()=>{
 const service=new HrDepartureService({query:async(sql:string)=>sql.includes("count(*)")?[{total:0}]:[]} as unknown as DataSource,{recordOperationRequired:async()=>{throw new Error("audit unavailable");}} as never);
 await assert.rejects(service.employeeOptions(scope,actor([HR_PERMISSIONS.HR_DEPARTURE_READ,HR_PERMISSIONS.HR_DEPARTURE_MANAGE]),new HrDepartureEmployeeOptionsDto()),/audit unavailable/);
});
