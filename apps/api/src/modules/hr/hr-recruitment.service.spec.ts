import assert from "node:assert/strict";
import test from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { HR_PERMISSIONS } from "@jinhu/shared";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { HrCandidateStageActionListDto } from "./dto/hr-recruitment.dto";
import { HrRecruitmentService } from "./hr-recruitment.service";

const scope={tenantId:"tenant-1",parkId:"park-1"};
const principal=(permissions:string[])=>({sub:"user-1",username:"user-1",tenantId:scope.tenantId,parkId:scope.parkId,roles:[],permissions});

test("candidate stage history pagination accepts only bounded integer query scalars",async()=>{
 const valid=plainToInstance(HrCandidateStageActionListDto,{page:"2",page_size:"100"});assert.equal((await validate(valid)).length,0);assert.deepEqual([valid.page,valid.page_size],[2,100]);
 for(const input of [{page:"0"},{page:"1.5"},{page:"1e2"},{page:true},{page_size:"0"},{page_size:"101"},{page_size:[]},{page_size:"20.0"}])assert.ok((await validate(plainToInstance(HrCandidateStageActionListDto,input))).length,JSON.stringify(input));
});

test("direct candidate reads fail closed before querying",async()=>{
 let queries=0;
 const service=new HrRecruitmentService({query:async()=>{queries+=1;return [];}} as never,{} as never,{} as never);
 await assert.rejects(service.listCandidates(scope,principal([]),{page:1,page_size:20}),ForbiddenException);
 assert.equal(queries,0);
});

test("team requisition reads use the current scoped manager organization tree",async()=>{
 const sql:string[]=[];
 const service=new HrRecruitmentService({query:async(query:string)=>{sql.push(query);return query.includes("count(*)")?[{total:0}]:[];}} as never,{} as never,{} as never);
 await service.listRequisitions(scope,principal([HR_PERMISSIONS.HR_REQUISITION_TEAM_READ]),{page:1,page_size:20});
 assert.equal(sql.length,2);
 for(const query of sql){
   assert.match(query,/WITH RECURSIVE manager_employee/);
   assert.match(query,/child\.tenant_id=r\.tenant_id AND child\.park_id=r\.park_id/);
   assert.match(query,/user_id=\$3/);
 }
});

test("candidate sensitive values are canonicalized before one shared protection service",async()=>{
 const protectedValues:string[]=[];
 const service=new HrRecruitmentService({query:async(_query:string,params:unknown[])=>[{id:"candidate-1",params}]} as never,{identityProfile:(value:string)=>{protectedValues.push(value);return {encrypted:`enc:${value}`,masked:"***",hash:`hash:${value}`};}} as never,{} as never);
 await service.createCandidate(scope,principal([HR_PERMISSIONS.HR_CANDIDATE_MANAGE]),{requisitionId:"00000000-0000-4000-8000-000000000001",candidateNo:"C-1",fullName:"张三",mobile:" 138 0013 8000 ",email:" PERSON@Example.COM ",identityNumber:" ab 12 "});
 assert.deepEqual(protectedValues,["13800138000","person@example.com","AB12"]);
});

test("candidate full detail requires both exact permissions and required audit before return",async()=>{
 let audits=0;
 const row={id:"candidate-1",candidateNo:"C-1",fullName:"张三",requisitionId:"req-1",requisitionTitle:"工程师",stage:"interview",source:null,expectedOnboardDate:null,latestEvaluation:null,mobileEncrypted:"enc:mobile",emailEncrypted:"enc:email",identityEncrypted:"enc:identity",convertedEmployeeId:null};
 const service=new HrRecruitmentService({query:async()=>[row]} as never,{decrypt:(value:string|null)=>value?.slice(4)??null} as never,{recordOperationRequired:async()=>{audits+=1;}} as never);
 await assert.rejects(service.candidateDetail(scope,principal([HR_PERMISSIONS.HR_CANDIDATE_READ]),"candidate-1"),ForbiddenException);
 assert.equal(audits,0);
 const detail=await service.candidateDetail(scope,principal([HR_PERMISSIONS.HR_CANDIDATE_READ,HR_PERMISSIONS.HR_CANDIDATE_SENSITIVE_READ]),"candidate-1");
 assert.deepEqual({mobile:detail.mobile,email:detail.email,identityNumber:detail.identityNumber},{mobile:"mobile",email:"email",identityNumber:"identity"});
 assert.equal(audits,1);
});

test("candidate stage history is permission-first, scoped, paged, metadata-only and required-audited in one snapshot",async()=>{
 const queries:string[]=[],audits:Array<{afterJson:unknown;path:string}>=[];
 const manager={query:async(sql:string)=>{queries.push(sql);if(sql.includes("FROM hr_candidate WHERE"))return [{id:"candidate-1"}];if(sql.includes("count(*)"))return [{total:23}];return [{id:"action-21",sequenceNo:21,action:"stage_change",fromStage:"screening",toStage:"interview",evaluation:"通过",occurredAt:"2026-10-11T00:00:00.000Z",actorDisplayName:"办理人"}];}};
 const db={query:async()=>{throw new Error("query outside transaction");},transaction:async(level:string,fn:(manager:unknown)=>unknown)=>{assert.equal(level,"REPEATABLE READ");return fn(manager);}};
 const service=new HrRecruitmentService(db as never,{} as never,{recordOperationRequired:async(input:{afterJson:unknown;path:string})=>{audits.push(input);}} as never);
 await assert.rejects(service.listCandidateStageActions(scope,principal([]),"candidate-1",{page:2,page_size:20}),ForbiddenException);
 assert.equal(queries.length,0);
 const result=await service.listCandidateStageActions(scope,principal([HR_PERMISSIONS.HR_CANDIDATE_READ]),"candidate-1",{page:2,page_size:20});
 assert.deepEqual(result,{items:[{id:"action-21",sequenceNo:21,action:"stage_change",fromStage:"screening",toStage:"interview",evaluation:"通过",occurredAt:"2026-10-11T00:00:00.000Z",actorDisplayName:"办理人"}],total:23,page:2,page_size:20});
 assert.equal(audits.length,1);assert.equal(audits[0]?.path,"/hr/recruitment/candidates/:id/stage-actions");assert.deepEqual(audits[0]?.afterJson,{fieldGroups:[],projection:"metadata",itemCount:1});
 assert.ok(queries.every(sql=>!sql.includes("mobile_")&&!sql.includes("identity_")));
});

test("candidate stage history rejects a missing or foreign candidate and rolls back when its required audit fails",async()=>{
 const missing=new HrRecruitmentService({transaction:async(_level:string,fn:(manager:{query:()=>Promise<unknown[]>})=>unknown)=>fn({query:async()=>[]})} as never,{} as never,{recordOperationRequired:async()=>undefined} as never);
 await assert.rejects(missing.listCandidateStageActions(scope,principal([HR_PERMISSIONS.HR_CANDIDATE_READ]),"candidate-1",{page:1,page_size:20}),/Candidate not found/);
 const manager={query:async(sql:string)=>sql.includes("FROM hr_candidate WHERE")?[{id:"candidate-1"}]:sql.includes("count(*)")?[{total:0}]:[]};
 const failing=new HrRecruitmentService({transaction:async(_level:string,fn:(manager:unknown)=>unknown)=>fn(manager)} as never,{} as never,{recordOperationRequired:async()=>{throw new Error("audit unavailable");}} as never);
 await assert.rejects(failing.listCandidateStageActions(scope,principal([HR_PERMISSIONS.HR_CANDIDATE_READ]),"candidate-1",{page:1,page_size:20}),/audit unavailable/);
});
