import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import {BadRequestException,ConflictException,ForbiddenException,NotFoundException,ValidationPipe} from "@nestjs/common";
import {HR_PERMISSIONS as H} from "@jinhu/shared";
import {PERMISSIONS_KEY} from "../../shared/decorators/permissions.decorator";
import type {JwtPrincipal} from "../../shared/types/jwt-principal";
import {HrRewardPayrollLinkOptionsDto} from "./dto/hr-reward-payroll-link-options.dto";
import {HrRewardsController} from "./hr-rewards.controller";
import {HrRewardsService} from "./hr-rewards.service";
const scope={tenantId:'tenant',parkId:'park'},actor:JwtPrincipal={...scope,sub:'synthetic',username:'synthetic',roles:[],permissions:[H.HR_REWARD_READ,H.HR_REWARD_LINK_PAYROLL]};
function fixture({missing=false,status='approved',auditFail=false}={}){
 const calls:{sql:string;params:unknown[]}[]=[],levels:string[]=[],audits:unknown[]=[];
 const query=async(sql:string,params:unknown[])=>{calls.push({sql,params});if(sql.startsWith('SELECT id,status,employee_id'))return missing?[]:[{id:'case',status,employee_id:'employee'}];if(sql.startsWith('SELECT l.id'))return[{id:'link',targetId:'historical',targetVersion:1,status:'linked',createdAt:'2090',periodMonth:null,batchNo:null,batchType:null}];if(sql.startsWith('SELECT count'))return[{total:43}];if(sql.startsWith('SELECT i.id'))return[{id:'item21',version:2,periodMonth:'2090-01',batchNo:1,batchType:'close'}];return[];};
 const service=new HrRewardsService({transaction:async(level:string,fn:(m:unknown)=>Promise<unknown>)=>{levels.push(level);return fn({query});}} as never,{recordOperationRequired:async(v:unknown)=>{audits.push(v);if(auditFail)throw Error('required audit unavailable');}} as never);return{service,calls,levels,audits};
}
test('payroll link operation uses exact permissions and snapshot-scoped case, retained link, paged items/count',async()=>{
 const f=fixture(),r=await f.service.payrollLinkOptions(scope,actor,'case',{page:2,page_size:20});assert.deepEqual(f.levels,['REPEATABLE READ']);assert.equal(r.total,43);assert.equal(r.existing.targetId,'historical');assert.equal(r.items[0].version,2);assert.deepEqual(f.calls[2]!.params,['tenant','park','employee',20,20]);assert.match(f.calls[2]!.sql,/i.employee_id=\$3/);assert.match(f.calls[2]!.sql,/b.status='effective'/);assert.match(f.calls[2]!.sql,/LIMIT \$4 OFFSET \$5/);assert.ok(!f.calls.some(c=>/amount|worked_minutes|difference_trace/.test(c.sql)));assert.deepEqual(Reflect.getMetadata(PERMISSIONS_KEY,HrRewardsController.prototype.payrollLinkOptions),[H.HR_REWARD_READ,H.HR_REWARD_LINK_PAYROLL]);assert.ok(!JSON.stringify(f.audits).includes('item21'));
});
test('read-only, link-only, team+self and foreign scope including super fail before transaction',async()=>{
 for(const a of [{...actor,permissions:[H.HR_REWARD_READ]},{...actor,permissions:[H.HR_REWARD_LINK_PAYROLL]},{...actor,permissions:[H.HR_REWARD_SELF_READ,H.HR_REWARD_LINK_PAYROLL]},{...actor,parkId:'foreign',isSuper:true}]){const f=fixture();await assert.rejects(f.service.payrollLinkOptions(scope,a,'case',{page:1,page_size:20}),ForbiddenException);assert.equal(f.calls.length,0);assert.equal(f.levels.length,0);}
});
test('missing/nonapproved case and failed required audit never return an operation context',async()=>{
 await assert.rejects(fixture({missing:true}).service.payrollLinkOptions(scope,actor,'case',{page:1,page_size:20}),NotFoundException);await assert.rejects(fixture({status:'draft'}).service.payrollLinkOptions(scope,actor,'case',{page:1,page_size:20}),ConflictException);await assert.rejects(fixture({auditFail:true}).service.payrollLinkOptions(scope,actor,'case',{page:1,page_size:20}),/required audit unavailable/);
});
test('actual strict page DTO rejects array/exponential/extra query inputs',async()=>{
 const pipe=new ValidationPipe({transform:true,whitelist:true,forbidNonWhitelisted:true}),parse=(value:unknown)=>pipe.transform(value,{type:'query',metatype:HrRewardPayrollLinkOptionsDto});assert.equal((await parse({page:'2',page_size:'20'})).page,2);for(const v of [{page:['1','2']},{page:'1e2'},{page_size:'101'},{keyword:'unexpected'}])await assert.rejects(parse(v),BadRequestException);
});
test('existing link write scope and invalid target fail before any transaction',async()=>{
 const f=fixture();await assert.rejects(f.service.link(scope,{...actor,tenantId:'foreign'},'case',{targetType:'payroll_input',targetId:'item',targetVersion:1}),ForbiddenException);await assert.rejects(f.service.link(scope,actor,'case',{targetType:'invalid',targetId:'item',targetVersion:1}),BadRequestException);assert.equal(f.calls.length,0);
});
