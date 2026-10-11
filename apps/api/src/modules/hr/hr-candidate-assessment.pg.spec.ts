import "reflect-metadata";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import test from "node:test";
import {DataSource} from "typeorm";
import type {TenantParkScope} from "@jinhu/shared";
import type {JwtPrincipal} from "../../shared/types/jwt-principal";
import {HrRecruitmentService} from "./hr-recruitment.service";

const enabled=process.env.HR_CANDIDATE_ASSESSMENT_PG==="1";
test("full-schema candidate assessment persists exact scores, serializes concurrent writers and rolls back audit failures",{skip:!enabled},async()=>{
 assert.equal(process.env.HR_CANDIDATE_ASSESSMENT_ISOLATED,"yes");assert.equal(process.env.POSTGRES_HOST,"127.0.0.1");assert.equal(process.env.POSTGRES_PORT,"15432");assert.match(process.env.POSTGRES_DB??"",/^jinhu_hr_migration_lab_review_final_[0-9_]+$/);
 const db=new DataSource({type:"postgres",host:"127.0.0.1",port:15432,username:process.env.POSTGRES_USER,password:process.env.POSTGRES_PASSWORD,database:process.env.POSTGRES_DB,entities:[],synchronize:false});await db.initialize();
 try {
  const scope:TenantParkScope={tenantId:"10000001",parkId:"20000001"},actorId=randomUUID(),orgId=randomUUID(),suffix=randomUUID().slice(0,8);
  await db.query(`INSERT INTO sys_user(id,tenant_id,park_id,username,display_name,password_hash,status)VALUES($1,$2,$3,$4,'测评测试','not-a-login-hash','enabled')`,[actorId,scope.tenantId,scope.parkId,`assessment-${suffix}`]);
  await db.query(`INSERT INTO sys_org(id,tenant_id,park_id,org_code,org_name,org_type,status,leader_user_id,create_by,update_by)VALUES($1,$2,$3,$4,'测评测试部门','department','enabled',$5,$5,$5)`,[orgId,scope.tenantId,scope.parkId,`AS-${suffix}`,actorId]);
  const actor:JwtPrincipal={...scope,sub:actorId,username:"assessment",roles:[],permissions:["*"]};
  const service=new HrRecruitmentService(db,{} as never,{recordOperationRequired:async(_input:unknown,manager:unknown)=>{assert.ok(manager);}} as never);
  const req=await service.createRequisition(scope,actor,{requisitionCode:`AS-${suffix}`,title:"测评夹具",orgId,headcount:1,ownerUserId:actorId,status:"open"});
  const candidate=await service.createCandidate(scope,actor,{requisitionId:req.id,candidateNo:`C-${suffix}`,fullName:"合成候选人"});
  const effects=()=>db.query(`SELECT (SELECT count(*) FROM hr_employee) employees,(SELECT count(*) FROM hr_payroll_run) payroll,(SELECT count(*) FROM hr_payslip) payslips,(SELECT count(*) FROM biz_user_message) messages,(SELECT count(*) FROM hr_candidate_action) stage_actions`);
  const before=await effects();const empty=await service.candidateAssessment(scope,actor,candidate.id);assert.equal(empty.version,0);assert.equal(empty.heartTest,null);
  const body={expectedVersion:0,heartTest:"999999999999999999",heartMemo:"心理",knowledgeTest:"0",knowledgeMemo:null,jobTest:null,jobMemo:null,assignmentTest:null,assignmentMemo:null,knowhowTest:"9999999999999999.99",knowhowMemo:"专业",faceTest:"-1.20",faceMemo:null,totalTest:"12.30",totalTestMemo:"人工总评"};
  const first=await service.saveCandidateAssessment(scope,actor,candidate.id,body) as Record<string,unknown>;assert.equal(first.version,1);assert.equal(first.heartTest,body.heartTest);assert.equal(first.knowhowTest,body.knowhowTest);
  await assert.rejects(service.saveCandidateAssessment(scope,actor,candidate.id,body),/changed/);
  const changed={...body,expectedVersion:1,heartTest:null,heartMemo:null,totalTest:null,totalTestMemo:null};
  const winners=await Promise.allSettled([service.saveCandidateAssessment(scope,actor,candidate.id,changed),service.saveCandidateAssessment(scope,actor,candidate.id,{...changed,faceTest:"9.99"})]);
  assert.equal(winners.filter(x=>x.status==="fulfilled").length,1);const loser=winners.find(x=>x.status==="rejected") as PromiseRejectedResult;assert.match(String(loser.reason),/changed/);
  const current=await service.candidateAssessment(scope,actor,candidate.id);assert.equal(current.version,2);assert.equal(current.heartTest,null);assert.equal(current.knowledgeTest,"0");
  const page1=await service.listCandidateAssessmentHistory(scope,actor,candidate.id,{page:1,page_size:1}),page2=await service.listCandidateAssessmentHistory(scope,actor,candidate.id,{page:2,page_size:1});
  assert.equal(page1.total,2);assert.equal(page1.items.length,1);assert.equal(page1.items[0].version,2);assert.equal(page2.items[0].version,1);assert.equal(page2.items[0].heartTest,body.heartTest);assert.ok(!("actorUserId" in page2.items[0]));
  const failing=new HrRecruitmentService(db,{} as never,{recordOperationRequired:async()=>{throw new Error("required audit unavailable");}} as never);
  await assert.rejects(failing.saveCandidateAssessment(scope,actor,candidate.id,{...body,expectedVersion:2,totalTest:"99.99"}),/required audit unavailable/);
  assert.deepEqual(await service.candidateAssessment(scope,actor,candidate.id),current);assert.equal((await service.listCandidateAssessmentHistory(scope,actor,candidate.id,{page:1,page_size:1})).total,2);
  await assert.rejects(failing.candidateAssessment(scope,actor,candidate.id),/required audit unavailable/);
  await assert.rejects(failing.listCandidateAssessmentHistory(scope,actor,candidate.id,{page:1,page_size:1}),/required audit unavailable/);
  await assert.rejects(db.query(`UPDATE hr_candidate_assessment_history SET total_test=1 WHERE candidate_id=$1`,[candidate.id]),/append-only/);
  await assert.rejects(db.query(`DELETE FROM hr_candidate_assessment_history WHERE candidate_id=$1`,[candidate.id]),/append-only/);
  const readOnly={...actor,permissions:["hr:candidate:read"]};await service.candidateAssessment(scope,readOnly,candidate.id);await assert.rejects(service.saveCandidateAssessment(scope,readOnly,candidate.id,{...body,expectedVersion:2}),/permission/i);
  for(const foreign of [{...scope,parkId:"foreign"},{...scope,tenantId:"foreign"}]){await assert.rejects(service.candidateAssessment(foreign,actor,candidate.id),/Candidate not found/);await assert.rejects(service.saveCandidateAssessment(foreign,actor,candidate.id,{...body,expectedVersion:2}),/Candidate not found/);}
  assert.deepEqual(await effects(),before);assert.equal((await db.query(`SELECT stage FROM hr_candidate WHERE id=$1`,[candidate.id]))[0].stage,"talent_pool");
  await db.query(`UPDATE hr_candidate SET is_deleted=true WHERE id=$1`,[candidate.id]);await assert.rejects(service.candidateAssessment(scope,actor,candidate.id),/Candidate not found/);await assert.rejects(service.listCandidateAssessmentHistory(scope,actor,candidate.id,{page:1,page_size:1}),/Candidate not found/);await assert.rejects(service.saveCandidateAssessment(scope,actor,candidate.id,{...body,expectedVersion:2}),/Candidate not found/);
 } finally {await db.destroy();}
 // Root owns final DROP of this guarded, unique disposable database, including committed synthetic fixtures.
});
