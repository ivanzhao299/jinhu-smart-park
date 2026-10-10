import "reflect-metadata";
import assert from "node:assert/strict";
import {test} from "node:test";
import {BadRequestException,ValidationPipe} from "@nestjs/common";
import {plainToInstance} from "class-transformer";
import {HR_PERMISSIONS} from "@jinhu/shared";
import {HrJobChangeEmployeeOptionsDto} from "./dto/hr-job-change.dto";
import {HrJobChangeService} from "./hr-job-change.service";

const scope={tenantId:"tenant",parkId:"park"},actor={...scope,sub:"manager",username:"synthetic",roles:[],permissions:[HR_PERMISSIONS.HR_JOB_CHANGE_MANAGE,HR_PERMISSIONS.HR_JOB_CHANGE_READ]};

test("job-change candidate DTO accepts only bounded decimal pagination",async()=>{
 const pipe=new ValidationPipe({transform:true,whitelist:true,forbidNonWhitelisted:true}),meta={type:"query" as const,metatype:HrJobChangeEmployeeOptionsDto};
 for(const query of [{page:true},{page:"1e2"},{page:"0x10"},{page:["1"]},{page:null},{page:""},{page:"2147483648"},{page_size:"101"},{keyword:["name"]},{keyword:"a".repeat(101)},{unknown:"x"}])await assert.rejects(pipe.transform(query,meta),BadRequestException);
 const defaults=await pipe.transform({},meta);assert.equal(defaults.page,1);assert.equal(defaults.page_size,20);
 const valid=await pipe.transform({page:"31",page_size:"20",keyword:" SYN-601 "},meta);assert.equal(valid.page,31);assert.equal(valid.page_size,20);assert.equal(valid.keyword,"SYN-601");
});

test("job-change candidates bind literal search, expose minimal rows, and require audit",async()=>{
 const calls:Array<{sql:string;params:unknown[]}>=[],audits:unknown[]=[];
 const service=new HrJobChangeService({query:async(sql:string,params:unknown[])=>{calls.push({sql,params});return sql.startsWith("SELECT count")?[{total:601}]:[{id:"employee-601",employeeCode:"SYN-601",fullName:"合成员工601"}];}} as never,{recordOperationRequired:async(value:unknown)=>{audits.push(value);}} as never);
 const result=await service.employeeOptions(scope,actor,plainToInstance(HrJobChangeEmployeeOptionsDto,{page:31,page_size:20,keyword:" A_%\\ "}));
 assert.deepEqual(result,{items:[{id:"employee-601",employeeCode:"SYN-601",fullName:"合成员工601"}],total:601,page:31,page_size:20});assert.equal(calls[0]!.params[2],"%A\\_\\%\\\\%");assert.match(calls[0]!.sql,/ESCAPE '\\'/);assert.match(calls[1]!.sql,/ORDER BY e\.full_name ASC,e\.id ASC LIMIT \$4 OFFSET \$5/);assert.deepEqual((audits[0] as {afterJson:unknown}).afterJson,{fieldGroups:[],projection:"park",itemCount:1});
 const rejecting=new HrJobChangeService({query:async(sql:string)=>sql.startsWith("SELECT count")?[{total:0}]:[]} as never,{recordOperationRequired:async()=>{throw new Error("audit unavailable");}} as never);await assert.rejects(rejecting.employeeOptions(scope,actor,new HrJobChangeEmployeeOptionsDto()),/audit unavailable/);
});
