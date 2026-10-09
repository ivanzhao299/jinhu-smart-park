import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import {plainToInstance} from "class-transformer";
import {validate} from "class-validator";
import {ForbiddenException,NotFoundException,BadRequestException} from "@nestjs/common";
import {HR_PERMISSIONS as H} from "@jinhu/shared";
import {ANY_PERMISSIONS_KEY} from "../../shared/decorators/permissions.decorator";
import {HrPerformanceReviewController} from "./hr-performance-review.controller";
import {HrPerformanceEvaluationService} from "./hr-performance-evaluation.service";
import {HrPerformanceRewardEvidenceQueryDto} from "./dto/hr-performance-reward-evidence-query.dto";
const scope={tenantId:"t",parkId:"p"},actor={sub:"u",username:"synthetic",...scope,roles:[],permissions:[H.HR_PERFORMANCE_READ] as string[]};
function fixture(visible=true){const calls:Array<{sql:string;args:unknown[]}>=[],events:unknown[]=[];const manager={query:async(sql:string,args:unknown[]=[])=>{calls.push({sql,args});if(sql.startsWith('SELECT ce.id'))return visible?[{id:'review'}]:[];if(sql.includes('count(*)'))return[{total:21}];if(sql.includes('source_version'))return[{id:'ref',sourceVersion:3,capturedAt:'2090-01-01',caseCode:'SYN-1',kind:'reward',occurredOn:'2090-01-01',amount:'must not leak',reason:'must not leak',source_snapshot:{private:'must not leak'}}];return[];}};const audit={recordOperationRequired:async(e:unknown)=>events.push(e)};return {calls,events,audit,service:new HrPerformanceEvaluationService({transaction:async(level:string,fn:(m:typeof manager)=>unknown)=>{assert.equal(level,'REPEATABLE READ');return fn(manager);}} as never,audit as never)};}
test('evidence route preserves exact existing read capabilities and strict scalar paging',async()=>{
 assert.deepEqual(Reflect.getMetadata(ANY_PERMISSIONS_KEY,HrPerformanceReviewController.prototype.rewardEvidence),[H.HR_PERFORMANCE_READ,H.HR_PERFORMANCE_TEAM_READ,H.HR_PERFORMANCE_SELF_READ]);assert.equal((await validate(plainToInstance(HrPerformanceRewardEvidenceQueryDto,{page:'2',page_size:'20'}))).length,0);for(const q of [{page:[1]},{page:'1e1'},{page:' '},{page:0},{page_size:101}])assert.ok((await validate(plainToInstance(HrPerformanceRewardEvidenceQueryDto,q))).length);
});
test('snapshot projection returns only allowlisted immutable business values and complete page metadata',async()=>{
 const f=fixture(),result=await f.service.rewardEvidence(scope,actor,'review',{page:2,page_size:20});assert.deepEqual(result,{reviewId:'review',items:[{id:'ref',sourceVersion:3,capturedAt:'2090-01-01',caseCode:'SYN-1',kind:'reward',occurredOn:'2090-01-01'}],total:21,page:2,page_size:20});assert.equal(f.calls[0]!.sql,'SET TRANSACTION READ ONLY');assert.deepEqual(f.calls.at(-1)?.args,['t','p','review',20,20]);assert.match(f.calls.at(-1)!.sql,/source_type='reward'/);assert.equal(f.events.length,1);assert.doesNotMatch(JSON.stringify(f.events),/must not leak|SYN-1/);
});
test('none and foreign scopes reject before transaction; nonexistent and out-of-range review remain not found',async()=>{
 const f=fixture();for(const a of [{...actor,permissions:[]},{...actor,tenantId:'other'},{...actor,parkId:'other',isSuper:true}])await assert.rejects(f.service.rewardEvidence(scope,a,'review',{page:1,page_size:20}),ForbiddenException);await assert.rejects(f.service.rewardEvidence(scope,actor,'review',{page:0,page_size:20}),BadRequestException);assert.equal(f.calls.length,0);const missing=fixture(false);await assert.rejects(missing.service.rewardEvidence(scope,actor,'review',{page:1,page_size:20}),NotFoundException);assert.equal(missing.events.length,0);assert.equal(missing.calls.length,2);
});
test('team and own visibility are reused from actual review filter, and audit failure fails read',async()=>{
 for(const permission of [H.HR_PERFORMANCE_TEAM_READ,H.HR_PERFORMANCE_SELF_READ]){const f=fixture();await f.service.rewardEvidence(scope,{...actor,permissions:[permission]},'review',{page:1,page_size:20});const query=f.calls[1]!;assert.ok(query.args.includes('u'));assert.match(query.sql,permission===H.HR_PERFORMANCE_SELF_READ?/e.user_id=/ : /managed_org/);}
 const f=fixture();f.audit.recordOperationRequired=async()=>{throw Error('audit unavailable');};await assert.rejects(f.service.rewardEvidence(scope,actor,'review',{page:1,page_size:20}),/audit unavailable/);
});
