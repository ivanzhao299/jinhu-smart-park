import "reflect-metadata";
import test from "node:test";
import assert from "node:assert/strict";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { HR_PERMISSIONS } from "@jinhu/shared";
import { HrContractListQueryDto } from "./dto/hr.dto";
import { HrService } from "./hr.service";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";

const employee="00000000-0000-4000-8000-000000000001",other="00000000-0000-4000-8000-000000000002";
const scope={tenantId:"tenant",parkId:"park"};
const principal=(permission:string):JwtPrincipal=>({sub:"user",username:"test",roles:[],permissions:[permission],...scope});
function harness(){
 const clauses:string[]=[];
 const rows=Array.from({length:114},(_,i)=>({id:String(i),employee_id:i<113?employee:other,employee_code:i<113?"EMP-1":"EMP-10",employee_name:"Same name",contract_no:`C-${i}`,tenantId:"tenant",parkId:"park"}));
 function builder(){
  const params:Record<string,unknown>={};let offset=0,limit=50;
  const filtered=()=>rows.filter(row=>row.tenantId===params.tenantId&&row.parkId===params.parkId&&(!params.employeeId||row.employee_id===params.employeeId)&&(!params.employeeIds||(params.employeeIds as string[]).includes(row.employee_id)));
  const query={innerJoin:()=>query,where:(sql:string,values:Record<string,unknown>)=>{clauses.push(sql);Object.assign(params,values);return query},andWhere:(sql:string,values:Record<string,unknown>)=>{clauses.push(sql);Object.assign(params,values);return query},getCount:async()=>filtered().length,clone:()=>query,select:()=>query,orderBy:()=>query,addOrderBy:()=>query,offset:(value:number)=>{offset=value;return query},limit:(value:number)=>{limit=value;return query},getRawMany:async()=>filtered().slice(offset,offset+limit)};
  return query;
 }
 const service=Object.create(HrService.prototype) as HrService;
 Object.assign(service,{contracts:{createQueryBuilder:builder},auditService:{recordOperationRequired:async()=>{}},managedEmployeeIds:async()=>[employee],myEmployee:async()=>({id:employee})});
 return {service,clauses};
}
test("contract employee filter validates UUID and preserves optional backward compatibility",async()=>{
 assert.equal((await validate(plainToInstance(HrContractListQueryDto,{employee_id:employee}))).length,0);
 assert.equal((await validate(new HrContractListQueryDto())).length,0);
 for(const value of ["EMP-1","not-a-uuid",[employee],"'"]){const errors=await validate(plainToInstance(HrContractListQueryDto,{employee_id:value}));assert.ok(errors.some(error=>error.property==="employee_id"));}
});
test("exact employee identity excludes similar codes and returns all history through bounded pages",async()=>{
 const {service,clauses}=harness();const ids:string[]=[];
 for(const page of [1,2,3]){const result=await service.listContracts(scope,principal(HR_PERMISSIONS.HR_CONTRACT_READ),{page,page_size:50,employee_id:employee});assert.equal(result.total,113);assert.equal(result.items.length,page===3?13:50);ids.push(...result.items.map(row=>row.id));}
 assert.equal(new Set(ids).size,113);assert.ok(!ids.includes("113"));assert.ok(clauses.includes("contract.employee_id=:employeeId"));assert.ok(clauses.some(sql=>sql.includes("contract.tenant_id=:tenantId AND contract.park_id=:parkId")));
});
test("exact filter intersects team and self visibility and never broadens foreign scope",async()=>{
 for(const permission of [HR_PERMISSIONS.HR_CONTRACT_TEAM_READ,HR_PERMISSIONS.HR_CONTRACT_SELF_READ]){
  const {service,clauses}=harness();const result=await service.listContracts(scope,principal(permission),{page:1,page_size:50,employee_id:other});assert.equal(result.total,0);assert.deepEqual(result.items,[]);assert.ok(clauses.includes("contract.employee_id IN (:...employeeIds)"));assert.ok(clauses.includes("contract.employee_id=:employeeId"));
 }
 const {service}=harness();assert.equal((await service.listContracts({tenantId:"foreign",parkId:"park"},principal(HR_PERMISSIONS.HR_CONTRACT_READ),{page:1,page_size:50,employee_id:employee})).total,0);
 assert.equal((await service.listContracts(scope,principal(HR_PERMISSIONS.HR_EMPLOYEE_READ),{page:1,page_size:50,employee_id:employee})).total,0);
});
