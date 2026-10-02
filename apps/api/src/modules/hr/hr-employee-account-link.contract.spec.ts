import assert from "node:assert/strict";
import test from "node:test";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { HrService } from "./hr.service";
import { LinkHrEmployeeAccountDto } from "./dto/hr.dto";
import { HrEmployeeEntity,HrEmploymentEventEntity } from "./entities/hr.entities";
import { UserEntity } from "../users/entities/user.entity";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
const userId="00000000-0000-4000-8000-000000000001",scope={tenantId:"tenant",parkId:"park"},actor={sub:"actor"} as JwtPrincipal;
const body={userId,expectedUserId:null,reason:"Reviewed exact identity"};
function fixture(options:{linked?:string|null;status?:string;account?:boolean;occupied?:boolean;saveError?:string}={}){
 const row={id:"employee",...scope,userId:options.linked??null,employeeCode:"E1",fullName:"Test",employmentStatus:options.status??"active",hireDate:"2020-01-01",primaryOrgId:"org",workLocation:"original",isDeleted:false} as HrEmployeeEntity;
 const writes:unknown[]=[],events:unknown[]=[],reads:unknown[]=[];
 const repo={findOne:async(input:unknown)=>{reads.push(input);return row},exists:async()=>options.occupied??false,save:async(input:unknown)=>{if(options.saveError)throw {code:options.saveError};writes.push(input);return input}};
 const eventRepo={create:(input:unknown)=>input,save:async(input:unknown)=>{events.push(input)}};
 const accountRepo={findOne:async(input:unknown)=>{reads.push(input);return options.account===false?null:{id:userId}}};
 const service=Object.create(HrService.prototype) as HrService;
 Object.assign(service,{dataSource:{transaction:async(run:(manager:unknown)=>unknown)=>run({getRepository:(entity:unknown)=>entity===HrEmployeeEntity?repo:entity===HrEmploymentEventEntity?eventRepo:entity===UserEntity?accountRepo:null})}});
 return {service,row,writes,events,reads};
}
test("association preserves all employee fields and records before and after",async()=>{
 const f=fixture(),before={...f.row};const result=await f.service.linkEmployeeAccount(scope,actor,"employee",body);
 assert.equal(result.userId,userId);assert.deepEqual(f.row,{...before,userId,updateBy:"actor"});assert.equal(f.events.length,1);
 const e=f.events[0] as {beforeSnapshot:{userId:null};afterSnapshot:{userId:string};reason:string};assert.equal(e.beforeSnapshot.userId,null);assert.equal(e.afterSnapshot.userId,userId);assert.equal(e.reason,body.reason);
 const reads=f.reads as Array<{where:Record<string,unknown>;lock:{mode:string}}>;
 assert.ok(reads[0]);assert.ok(reads[1]);
 assert.deepEqual(reads[0].where,{id:"employee",...scope,isDeleted:false});assert.equal(reads[0].lock.mode,"pessimistic_write");
 assert.deepEqual(reads[1].where,{id:userId,...scope,isDeleted:false,isEnabled:true,status:"enabled"});assert.equal(reads[1].lock.mode,"pessimistic_write");
});
test("stale link rejects before writes",async()=>{const f=fixture({linked:"newer"});await assert.rejects(f.service.linkEmployeeAccount(scope,actor,"employee",body),/changed/);assert.equal(f.writes.length,0);assert.equal(f.events.length,0)});
test("foreign disabled and occupied accounts reject before writes",async()=>{for(const options of [{account:false},{occupied:true}]){const f=fixture(options);await assert.rejects(f.service.linkEmployeeAccount(scope,actor,"employee",body),/unavailable|already linked/);assert.equal(f.writes.length,0);assert.equal(f.events.length,0)}});
test("departed employee may only remove an old association",async()=>{const f=fixture({status:"departed"});await assert.rejects(f.service.linkEmployeeAccount(scope,actor,"employee",body),/Departed/);const old=fixture({status:"departed",linked:userId});await old.service.linkEmployeeAccount(scope,actor,"employee",{userId:null,expectedUserId:userId,reason:"Reviewed unlink"});assert.equal(old.row.userId,null);assert.equal(old.row.employmentStatus,"departed")});
test("no-op creates no event and unique-index races become conflict",async()=>{const f=fixture({linked:userId});await f.service.linkEmployeeAccount(scope,actor,"employee",{...body,expectedUserId:userId});assert.equal(f.writes.length,0);assert.equal(f.events.length,0);const race=fixture({saveError:"23505"});await assert.rejects(race.service.linkEmployeeAccount(scope,actor,"employee",body),/already linked/);assert.equal(race.events.length,0)});
test("DTO requires both explicit nullable identities and nonblank reason",async()=>{
 for(const invalid of [{reason:"review"},{...body,expectedUserId:undefined},{...body,userId:"not-uuid"},{...body,reason:"  "}])assert.ok((await validate(plainToInstance(LinkHrEmployeeAccountDto,invalid))).length);
 for(const valid of [body,{userId:null,expectedUserId:userId,reason:"unlink"}])assert.equal((await validate(plainToInstance(LinkHrEmployeeAccountDto,valid))).length,0);
});
