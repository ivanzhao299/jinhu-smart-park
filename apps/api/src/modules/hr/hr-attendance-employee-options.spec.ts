import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import {plainToInstance} from "class-transformer";
import {validate} from "class-validator";
import {HR_PERMISSIONS} from "@jinhu/shared";
import {ForbiddenException} from "@nestjs/common";
import {PERMISSIONS_KEY} from "../../shared/decorators/permissions.decorator";
import type {JwtPrincipal} from "../../shared/types/jwt-principal";
import {HrAttendanceEmployeeOptionsQueryDto} from "./dto/hr.dto";
import {HrController} from "./hr.controller";
import {HrService} from "./hr.service";

const scope={tenantId:"tenant-a",parkId:"park-a"};
const actor:JwtPrincipal={...scope,sub:"operator",username:"synthetic-operator",roles:[],permissions:[HR_PERMISSIONS.HR_ATTENDANCE_OPERATE]};
function fixture(){
 const calls:Record<string,unknown>[]=[];const audits:Record<string,unknown>[]=[];
 const service=Object.assign(Object.create(HrService.prototype),{
  employees:{findAndCount:async(options:Record<string,unknown>)=>{calls.push(options);return [[{id:"employee-101",employeeCode:"SYN-101",fullName:"合成人员101",workMobile:"excluded",userId:"excluded",tenantId:"excluded"}],205];}},
  auditService:{recordOperationRequired:async(input:Record<string,unknown>)=>{audits.push(input);}}
 }) as HrService;
 return {service,calls,audits};
}
test("attendance operation authority returns minimal candidates past first100 with bounded stable pagination",async()=>{
 const {service,calls,audits}=fixture();const result=await service.listAttendanceEmployeeOptions(scope,actor,{page:6,page_size:20});
 assert.deepEqual(result,{items:[{id:"employee-101",employeeCode:"SYN-101",fullName:"合成人员101"}],total:205,page:6,page_size:20});
 assert.deepEqual(calls[0],{where:{...scope,isDeleted:false,employmentStatus:"active"},select:{id:true,employeeCode:true,fullName:true},order:{employeeCode:"ASC",id:"ASC"},skip:100,take:20});
 assert.deepEqual(audits[0]?.afterJson,{fieldGroups:["attendance"],projection:"metadata",itemCount:1});assert.equal(audits[0]?.path,"/hr/attendance/employee-options");assert.equal(audits[0]?.beforeJson,null);
});
test("literal name/code search stays in the active scope and does not log keyword values",async()=>{
 const {service,calls,audits}=fixture();await service.listAttendanceEmployeeOptions(scope,actor,{page:1,page_size:20,keyword:" A_%\\ "});
 const where=calls[0]!.where as Array<Record<string,unknown>>;assert.equal(where.length,2);
 for(const row of where){assert.equal(row.tenantId,scope.tenantId);assert.equal(row.parkId,scope.parkId);assert.equal(row.employmentStatus,"active");assert.equal(row.isDeleted,false);}
 assert.equal((where[0]!.fullName as {value:string}).value,"%A\\_\\%\\\\%");assert.equal((where[1]!.employeeCode as {value:string}).value,"%A\\_\\%\\\\%");
 assert.ok(!JSON.stringify(audits).includes("A_"));
});
test("read-only, self and foreign scopes cannot query operation candidates directly",async()=>{
 for(const denied of [{...actor,permissions:[HR_PERMISSIONS.HR_ATTENDANCE_SELF_READ]},{...actor,permissions:[HR_PERMISSIONS.HR_EMPLOYEE_READ]},{...actor,tenantId:"foreign"},{...actor,parkId:"foreign"}]){
  const {service,calls,audits}=fixture();await assert.rejects(service.listAttendanceEmployeeOptions(scope,denied,{page:1,page_size:20}),ForbiddenException);assert.equal(calls.length,0);assert.equal(audits.length,0);
 }
 assert.deepEqual(Reflect.getMetadata(PERMISSIONS_KEY,HrController.prototype.attendanceEmployeeOptions),[HR_PERMISSIONS.HR_ATTENDANCE_OPERATE]);
});
test("required metadata audit failure prevents a candidate response",async()=>{
 const {service}=fixture();Object.assign(service,{auditService:{recordOperationRequired:async()=>{throw new Error("synthetic audit failure");}}});
 await assert.rejects(service.listAttendanceEmployeeOptions(scope,actor,{page:1,page_size:20}),/synthetic audit failure/);
});
test("candidate query validates bounded pages and name/code length",async()=>{
 const defaults=plainToInstance(HrAttendanceEmployeeOptionsQueryDto,{});assert.deepEqual([defaults.page,defaults.page_size],[1,20]);assert.equal((await validate(defaults)).length,0);
 for(const input of [{page:0},{page:1.5},{page_size:101},{page_size:0},{keyword:"x".repeat(101)}])assert.ok((await validate(plainToInstance(HrAttendanceEmployeeOptionsQueryDto,input))).length);
 const query=plainToInstance(HrAttendanceEmployeeOptionsQueryDto,{page:"6",page_size:"20",keyword:"  SYN-101  "});assert.equal((await validate(query)).length,0);assert.equal(query.keyword,"SYN-101");assert.equal(query.page,6);
});
