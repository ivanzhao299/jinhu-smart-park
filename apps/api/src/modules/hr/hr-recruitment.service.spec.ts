import assert from "node:assert/strict";
import test from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { HR_PERMISSIONS } from "@jinhu/shared";
import { HrRecruitmentService } from "./hr-recruitment.service";

const scope={tenantId:"tenant-1",parkId:"park-1"};
const principal=(permissions:string[])=>({sub:"user-1",username:"user-1",tenantId:scope.tenantId,parkId:scope.parkId,roles:[],permissions});

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
