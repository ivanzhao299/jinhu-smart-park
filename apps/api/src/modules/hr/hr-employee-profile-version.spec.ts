import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { BadRequestException, ConflictException } from "@nestjs/common";
import { HrService } from "./hr.service";
import { HrEmployeeEntity } from "./entities/hr.entities";
import { UpdateHrEmployeeProfileDto } from "./dto/hr.dto";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";

test("profile DTO requires an explicit bounded integer version including the absent sentinel",async()=>{
 for(const value of [undefined,null,-1,0.5,"1",true,NaN,Infinity,2147483647]){
  const dto=plainToInstance(UpdateHrEmployeeProfileDto,{expectedVersion:value});
  assert.ok((await validate(dto)).some(error=>error.property==="expectedVersion"));
 }
 for(const expectedVersion of [0,1,2147483646])assert.equal((await validate(plainToInstance(UpdateHrEmployeeProfileDto,{expectedVersion}))).length,0);
});

test("stale, deleted, absent, and ambiguous profiles fail before encryption or persistence",async()=>{
let rows:Array<{version:number;isDeleted?:boolean}>=[],saved=0,encrypted=0,anchors=0;
 const query={where:()=>query,setLock:()=>query,getMany:async()=>rows};
 const profiles={createQueryBuilder:()=>query,save:async()=>{saved++;}};
 const employees={findOne:async()=>{anchors++;return {id:"employee"};}};
 const service=Object.create(HrService.prototype) as HrService;
 Object.assign(service,{detailEmployee:async()=>({id:"employee"}),sensitiveData:{identityProfile:()=>{encrypted++;}},
  dataSource:{transaction:async(fn:(m:unknown)=>unknown)=>fn({getRepository:(entity:unknown)=>entity===HrEmployeeEntity?employees:profiles})}});
 for(const [actual,expectedVersion] of [[[],1],[[{version:2}],1],[[{version:2}],0],[[{version:2},{version:3}],2],[[{version:1,isDeleted:true}],0]] as const){
  rows=[...actual];await assert.rejects(service.updateEmployeeProfile({tenantId:"t",parkId:"p"},{sub:"actor"} as JwtPrincipal,"employee",{expectedVersion,idNumber:"synthetic"}),ConflictException);
 }
 await assert.rejects(service.updateEmployeeProfile({tenantId:"t",parkId:"p"},{sub:"actor"} as JwtPrincipal,"employee",{} as UpdateHrEmployeeProfileDto),BadRequestException);
 assert.deepEqual({saved,encrypted,anchors},{saved:0,encrypted:0,anchors:5});
});

test("an active profile remains updateable when a deleted historical profile also exists",async()=>{
 let saved=0;const row={version:4,isDeleted:false};const query={where:()=>query,setLock:()=>query,getMany:async()=>[row,{version:1,isDeleted:true}]};
 const profiles={createQueryBuilder:()=>query,save:async(value:typeof row)=>{saved++;return value;}};
 const employees={findOne:async()=>({id:"employee"})};const service=Object.create(HrService.prototype) as HrService;
 Object.assign(service,{detailEmployee:async()=>({id:"employee"}),sensitiveData:{identityProfile:()=>{throw new Error("identity should be omitted");}},dataSource:{transaction:async(fn:(m:unknown)=>unknown)=>fn({getRepository:(entity:unknown)=>entity===HrEmployeeEntity?employees:profiles})}});
 const savedProfile=await service.updateEmployeeProfile({tenantId:"t",parkId:"p"},{sub:"actor"} as JwtPrincipal,"employee",{expectedVersion:4,nativePlace:"Synthetic"});
 assert.equal(saved,1);assert.equal(row.version,5);assert.equal(savedProfile.version,5);
});
