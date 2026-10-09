import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import {BadRequestException,ForbiddenException,NotFoundException,ValidationPipe} from "@nestjs/common";
import {HR_PERMISSIONS as H} from "@jinhu/shared";
import {PERMISSIONS_KEY} from "../../shared/decorators/permissions.decorator";
import {HrPositionMaintenanceController} from "./hr-position-maintenance.controller";
import {HrPositionMaintenanceService} from "./hr-position-maintenance.service";
import {UpdateHrPositionMaintenanceDto} from "./dto/hr-position-maintenance.dto";
import {CreateHrPositionDto} from "./dto/hr.dto";
const scope={tenantId:"tenant",parkId:"park"},actor={sub:"actor",tenantId:"tenant",parkId:"park",permissions:[H.HR_POSITION_MANAGE]} as never;
const row={id:"position",version:7,org_id:"org",position_code:"SYN-P",position_name:"合成岗位",reports_to_position_id:null,job_family:"原职族",job_level:null,headcount_limit:5,hierarchy_level:1,sort_order:0,authority:null,qualification:"资格",responsibilities:"职责",position_manual:null,status:"enabled",remark:null,legacy_source_id:991};
test("ordinary position read/create/options routes retain exact domain permissions and creation bounds",async()=>{
 for(const name of ["create","options","context","update"] as const)assert.deepEqual(Reflect.getMetadata(PERMISSIONS_KEY,HrPositionMaintenanceController.prototype[name]),[H.HR_POSITION_MANAGE]);
 assert.deepEqual(Reflect.getMetadata(PERMISSIONS_KEY,HrPositionMaintenanceController.prototype.list),[H.HR_POSITION_READ]);
 const pipe=new ValidationPipe({transform:true,whitelist:true,forbidNonWhitelisted:true}),meta={type:"body" as const,metatype:CreateHrPositionDto},base={orgId:"11111111-1111-4111-8111-111111111111",positionCode:"SYN",positionName:"合成岗位"};
 for(const patch of [{positionCode:" "},{positionName:" "},{headcountLimit:100001},{hierarchyLevel:32768},{sortOrder:2147483648},{legacySourceId:991}])await assert.rejects(pipe.transform({...base,...patch},meta),BadRequestException);
});
function fixture(allowed:string[]|null=null){
 const calls:Array<{sql:string;params:unknown[]}>=[],events:Record<string,unknown>[]=[];let duplicate=false,employee=false,child=false,auditFail=false;
 const manager={query:async(sql:string,params:unknown[]=[])=>{calls.push({sql,params});if(sql.startsWith("SELECT * FROM hr_position"))return[{...row}];if(sql.startsWith("SELECT id,status FROM sys_org"))return[{id:"org",status:"enabled"}];if(sql.includes("SELECT id FROM hr_employee"))return employee?[{id:"employee"}]:[];if(sql.includes("reports_to_position_id=$3"))return child?[{id:"child"}]:[];if(sql.includes("position_code=$3"))return duplicate?[{id:"duplicate"}]:[];if(sql.startsWith("SELECT id,org_id,reports_to_position_id"))return [{id:params[0],org_id:"org",reports_to_position_id:params[0]==="cycle"?"position":null}];if(sql.startsWith("UPDATE hr_position")){const saved={...row,version:8};for(const match of sql.matchAll(/(\w+)=\$(\d+)/g)){if(Number(match[2])>5)(saved as Record<string,unknown>)[match[1]!]=params[Number(match[2])-1];}return [[saved],1];}return[];}};
 const db={transaction:async(...args:unknown[])=>{const fn=args.at(-1) as (m:unknown)=>unknown;return fn(manager);}};
 const scopes={buildScopeFilter:async()=>({unrestricted:allowed===null,allowed_ids:allowed??[]})};const audit={recordOperationRequired:async(input:Record<string,unknown>,m?:unknown)=>{if(auditFail)throw Error("required audit failure");events.push({...input,transactionBound:m===manager});}};
 return {calls,events,service:new HrPositionMaintenanceService(db as never,scopes as never,audit as never),duplicate:()=>{duplicate=true;},employee:()=>{employee=true;},child:()=>{child=true;},auditFailure:()=>{auditFail=true;}};
}
test("position HTTP contract rejects malformed versions, nullable required fields, overflows and source-only fields",async()=>{
 const pipe=new ValidationPipe({transform:true,whitelist:true,forbidNonWhitelisted:true}),meta={type:"body" as const,metatype:UpdateHrPositionMaintenanceDto};const base={expectedVersion:7,reason:"维护职责"};
 for(const change of [{expectedVersion:"7"},{expectedVersion:0},{expectedVersion:2147483648},{expectedVersion:[7]},{reason:" "},{reason:null},{orgId:null},{positionName:null},{positionCode:" "},{sortOrder:null},{sortOrder:-1},{hierarchyLevel:32768},{headcountLimit:100001},{headcountLimit:"5"},{status:null},{status:"archived"},{reportsToPositionId:"not-uuid"},{jobFamily:"x".repeat(65)},{legacySourceId:991},{version:7}])await assert.rejects(pipe.transform({...base,...change},meta),BadRequestException);
 const good=await pipe.transform({...base,positionName:" 合成更新 ",jobFamily:null,headcountLimit:null,reportsToPositionId:null},meta) as UpdateHrPositionMaintenanceDto;assert.equal(good.positionName,"合成更新");assert.equal(good.jobFamily,null);assert.equal(good.headcountLimit,null);assert.equal(good.reportsToPositionId,null);
 for(const method of ["context","update"] as const)assert.deepEqual(Reflect.getMetadata(PERMISSIONS_KEY,HrPositionMaintenanceController.prototype[method]),[H.HR_POSITION_MANAGE]);
});
test("maintenance requires exact role/scope before database; hidden target cannot expose context",async()=>{
 const f=fixture();for(const a of [{...actor as object,permissions:[H.HR_POSITION_READ]},{...actor as object,parkId:"foreign"}]){await assert.rejects(f.service.context(scope,a as never,"position"),ForbiddenException);await assert.rejects(f.service.update(scope,a as never,"position",{expectedVersion:7,reason:"维护",positionName:"新名称"}),ForbiddenException);}assert.equal(f.calls.length,0);
 const hidden=fixture([]);await assert.rejects(hidden.service.context(scope,actor,"position"),NotFoundException);assert.equal(hidden.events.length,0);
});
test("context retains all15 business fields/version and scopes candidates without employee users or source data",async()=>{
 const f=fixture(["org"]);const result=await f.service.context(scope,actor,"position");assert.equal(result.position.version,7);assert.equal(result.position.qualification,"资格");assert.equal(result.position.responsibilities,"职责");assert.ok(!JSON.stringify(result).includes("legacy_source_id"));assert.ok(!f.calls.some(c=>c.sql.includes("sys_user")));assert.equal(f.calls[0]!.sql,"SET TRANSACTION READ ONLY");assert.ok(f.calls.some(c=>c.sql.includes("org_id=ANY")));assert.equal(f.events.length,1);
});
test("metadata patch preserves omissions, clears nulls, parses real TypeORM tuple and binds mandatory before/after audit",async()=>{
 const f=fixture();const result=await f.service.update(scope,actor,"position",{expectedVersion:7,reason:"核实岗位职责",jobFamily:null,headcountLimit:0,qualification:"新资格",responsibilities:"新职责",positionManual:"新说明"});assert.equal(result.version,8);assert.equal(result.positionName,"合成岗位");assert.equal(result.jobFamily,null);assert.equal(result.headcountLimit,0);assert.equal(result.qualification,"新资格");assert.equal(result.positionManual,"新说明");const update=f.calls.find(c=>c.sql.startsWith("UPDATE"))!;assert.ok(update.sql.includes("version=$4"));assert.ok(!update.sql.includes("legacy_source"));assert.ok(f.calls[0]!.sql.includes("pg_advisory_xact_lock"));assert.ok(f.calls[1]!.sql.endsWith("FOR UPDATE"));assert.equal(f.events[0]!.transactionBound,true);assert.equal((f.events[0]!.afterJson as Record<string,unknown>).reason,"核实岗位职责");
});
test("stale version and no-op do not update; audit failure never returns a success",async()=>{
 const f=fixture();await assert.rejects(f.service.update(scope,actor,"position",{expectedVersion:6,reason:"维护",positionName:"新名称"}),/已被修改/);const before=f.calls.length;await f.service.update(scope,actor,"position",{expectedVersion:7,reason:"核对",positionName:"合成岗位"});assert.ok(!f.calls.slice(before).some(c=>c.sql.startsWith("UPDATE")));assert.equal(f.events.length,0);
 f.auditFailure();await assert.rejects(f.service.update(scope,actor,"position",{expectedVersion:7,reason:"维护",positionName:"新名称"}),/required audit failure/);
});
test("scope, hierarchy, duplicate code and existing assignment guards reject before writes",async()=>{
 const hidden=fixture(["org"]);await assert.rejects(hidden.service.update(scope,actor,"position",{expectedVersion:7,reason:"维护",orgId:"foreign"}),ForbiddenException);
 const cycle=fixture();await assert.rejects(cycle.service.update(scope,actor,"position",{expectedVersion:7,reason:"维护",reportsToPositionId:"cycle"}),/循环/);
 const duplicate=fixture();duplicate.duplicate();await assert.rejects(duplicate.service.update(scope,actor,"position",{expectedVersion:7,reason:"维护",positionCode:"DUP"}),/编码已存在/);
 const employee=fixture();employee.employee();await assert.rejects(employee.service.update(scope,actor,"position",{expectedVersion:7,reason:"维护",orgId:"next-org"}),/任职引用/);await assert.rejects(employee.service.update(scope,actor,"position",{expectedVersion:7,reason:"维护",status:"disabled"}),/未离职人员/);
 const child=fixture();child.child();await assert.rejects(child.service.update(scope,actor,"position",{expectedVersion:7,reason:"维护",status:"disabled"}),/下级岗位/);
 for(const f of [hidden,cycle,duplicate,employee,child])assert.ok(!f.calls.some(c=>c.sql.startsWith("UPDATE")));
});
