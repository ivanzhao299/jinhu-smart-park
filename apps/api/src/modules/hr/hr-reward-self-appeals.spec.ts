import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import {BadRequestException,ConflictException,ForbiddenException,NotFoundException,ValidationPipe} from "@nestjs/common";
import {HR_PERMISSIONS as H} from "@jinhu/shared";
import type {JwtPrincipal} from "../../shared/types/jwt-principal";
import {HrRewardCorrectionDto} from "./dto/hr-rewards.dto";
import {HrRewardsService} from "./hr-rewards.service";
const scope={tenantId:"tenant",parkId:"park"},self:JwtPrincipal={...scope,sub:"owner",username:"synthetic",roles:[],permissions:[H.HR_REWARD_SELF_READ]};
const body={type:"appeal",summary:"本人申诉",reason:"申请复核"};
function fixture({owner="owner",status="approved",auditFail=false,managed=true}={}){
 const calls:{sql:string;params:unknown[]}[]=[],events:string[]=[],audits:unknown[]=[];
 const c={id:"case",user_id:owner,status,case_code:"SYN",occurred_on:"2090-01-01",full_name:"合成员工",primary_org_id:"org",current_kind:"reward",current_category_name:"合成类别",impact_level:"normal",fact_summary:"批准事实",detailed_reason:"HR_PRIVATE",amount_suggestion:"100.0000",evidence_snapshot:["private-file"]};
 const query=async(sql:string,params:unknown[])=>{calls.push({sql,params});events.push(sql);if(sql.startsWith('SELECT c.*'))return[c];if(sql.includes('WITH RECURSIVE'))return managed?[{ok:1}]:[];if(sql.includes('MAX(sequence_no)'))return[{value:1}];if(sql.startsWith('INSERT INTO hr_reward_discipline_correction'))return[{id:'appeal-1',sequenceNo:1}];if(sql.startsWith('SELECT sequence_no'))return[{sequenceNo:1,type:'appeal',summary:'本人申诉',createdAt:'2090-01-02'}];return[];};
 const service=new HrRewardsService({query,transaction:async(fn:(m:unknown)=>Promise<unknown>)=>fn({query})} as never,{recordOperationRequired:async(v:unknown)=>{events.push('AUDIT');audits.push(v);if(auditFail)throw Error('required audit unavailable');}} as never);
 return{service,calls,events,audits};
}
test('actual self detail derives eligibility and reads only own appeal summaries after required audit',async()=>{
 const f=fixture(),result=await f.service.detail(scope,self,'case') as Record<string,unknown>;
 assert.equal(result.canAppeal,true);assert.deepEqual(result.ownAppeals,[{sequenceNo:1,type:'appeal',summary:'本人申诉',createdAt:'2090-01-02'}]);
 for(const key of ['detailedReason','amountSuggestion','evidenceFileIds','corrections','user_id'])assert.equal(Object.hasOwn(result,key),false);
 const history=f.calls.find(c=>c.sql.startsWith('SELECT sequence_no'))!;assert.match(history.sql,/correction_type='appeal' AND create_by=\$4/);assert.deepEqual(history.params,['tenant','park','case','owner']);assert.ok(!history.sql.includes(',reason'));assert.ok(f.events.indexOf('AUDIT')<f.events.indexOf(history.sql));assert.ok(!JSON.stringify(f.audits).includes('本人申诉'));
});
test('base read or team read does not confer self appeal; mixed permission still derives actual owner',async()=>{
 for(const permissions of [[H.HR_REWARD_READ],[H.HR_REWARD_TEAM_READ],[H.HR_REWARD_READ,H.HR_REWARD_SELF_READ]]){
  const f=fixture({owner:'other'}),result=await f.service.detail(scope,{...self,permissions},'case') as Record<string,unknown>;
  assert.equal(result.canAppeal,false);assert.equal(Object.hasOwn(result,'ownAppeals'),false);assert.ok(!f.calls.some(c=>c.sql.startsWith('SELECT sequence_no')));
 }
 const result=await fixture().service.detail(scope,{...self,permissions:[H.HR_REWARD_READ,H.HR_REWARD_SELF_READ]},'case') as Record<string,unknown>;assert.equal(result.canAppeal,true);
});
test('foreign scopes including super and action-only unauthorized principals fail before SQL',async()=>{
 for(const actor of [{...self,tenantId:'foreign'},{...self,parkId:'foreign',isSuper:true}]){const f=fixture();await assert.rejects(f.service.detail(scope,actor,'case'),ForbiddenException);await assert.rejects(f.service.correct(scope,actor,'case',body),ForbiddenException);assert.equal(f.calls.length,0);}
 const f=fixture();await assert.rejects(f.service.correct(scope,{...self,permissions:[H.HR_REWARD_READ]},'case',body),ForbiddenException);assert.equal(f.calls.length,0);
});
test('other employee and nonapproved case never produce self appeal or append',async()=>{
 const other=fixture({owner:'other'});await assert.rejects(other.service.detail(scope,self,'case'),NotFoundException);await assert.rejects(other.service.correct(scope,self,'case',body),ForbiddenException);assert.ok(!other.calls.some(c=>c.sql.startsWith('INSERT')));
 const draft=fixture({status:'draft'});await assert.rejects(draft.service.detail(scope,self,'case'),NotFoundException);await assert.rejects(draft.service.correct(scope,self,'case',body),ConflictException);assert.ok(!draft.calls.some(c=>c.sql.startsWith('INSERT')));
});
test('failed required read audit does not retrieve own appeals; valid append keeps approved workflow',async()=>{
 const f=fixture({auditFail:true});await assert.rejects(f.service.detail(scope,self,'case'),/required audit unavailable/);assert.ok(!f.calls.some(c=>c.sql.startsWith('SELECT sequence_no')));
 const good=fixture();assert.deepEqual(await good.service.correct(scope,self,'case',body),{id:'appeal-1',sequenceNo:1});assert.match(good.calls[0]!.sql,/FOR UPDATE OF c/);assert.ok(good.calls.some(c=>c.sql.includes("'approved','approved'")));assert.ok(!good.calls.some(c=>/UPDATE|DELETE/.test(c.sql)&&!c.sql.includes('FOR UPDATE')));
});
test('DTO and direct service reject blank, invalid type and oversized appeal inputs',async()=>{
 const pipe=new ValidationPipe({transform:true,whitelist:true,forbidNonWhitelisted:true});
 for(const d of [{...body,summary:' '},{...body,reason:' '},{...body,type:'void_note'},{...body,summary:'x'.repeat(301)},{...body,reason:'x'.repeat(1001)}]){await assert.rejects(pipe.transform(d,{type:'body',metatype:HrRewardCorrectionDto}),BadRequestException);const f=fixture();await assert.rejects(f.service.correct(scope,self,'case',d),BadRequestException);assert.equal(f.calls.length,0);}
 const valid=await pipe.transform({...body,summary:' 本人申诉 '},{type:'body',metatype:HrRewardCorrectionDto});assert.equal(valid.summary,body.summary);
});

test('team+self caller outside managed tree still reads own approved minimum projection',async()=>{
 const f=fixture({managed:false}),a={...self,permissions:[H.HR_REWARD_TEAM_READ,H.HR_REWARD_SELF_READ,H.HR_REWARD_REASON_READ]};
 const row=await f.service.detail(scope,a,'case') as Record<string,unknown>;assert.equal(row.canAppeal,true);assert.equal(Object.hasOwn(row,'detailedReason'),false);assert.equal(Object.hasOwn(row,'corrections'),false);assert.ok(JSON.stringify(f.audits).includes('self'));
 await assert.rejects(fixture({managed:false,owner:'other'}).service.detail(scope,a,'case'),NotFoundException);
});

test('mixed team+self list unions managed employees with only own approved cases',async()=>{
 const a={...self,permissions:[H.HR_REWARD_TEAM_READ,H.HR_REWARD_SELF_READ]},f=fixture();await f.service.list(scope,a,{page:1,page_size:20});assert.match(f.calls[0]!.sql,/OR \(e.user_id=\$5 AND c.status='approved'\)/);
 const team=fixture();await team.service.list(scope,{...self,permissions:[H.HR_REWARD_TEAM_READ]},{page:1,page_size:20});assert.ok(!team.calls[0]!.sql.includes('OR (e.user_id='));
});
