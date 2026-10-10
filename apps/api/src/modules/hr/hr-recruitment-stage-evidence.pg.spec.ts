import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type { TenantParkScope } from "@jinhu/shared";
import { DataSource,type EntityManager } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { HrRecruitmentService } from "./hr-recruitment.service";

// The caller owns the already-migrated disposable original schema. This test creates
// neither a database nor schema and rolls every inserted fixture row back.
const enabled=process.env.HR_RECRUITMENT_STAGE_EVIDENCE_PG==="1";

test("full-schema recruitment stage evidence reads the persisted legal action chain by page and scope",{skip:!enabled},async()=>{
 assert.equal(process.env.HR_RECRUITMENT_STAGE_EVIDENCE_ISOLATED,"yes");assert.equal(process.env.POSTGRES_HOST,"127.0.0.1");assert.equal(process.env.POSTGRES_PORT,"15432");assert.ok(process.env.POSTGRES_DB);
 const db=new DataSource({type:"postgres",host:"127.0.0.1",port:15432,username:process.env.POSTGRES_USER,password:process.env.POSTGRES_PASSWORD,database:process.env.POSTGRES_DB,synchronize:false,entities:[]});await db.initialize();const runner=db.createQueryRunner();await runner.connect();await runner.startTransaction("SERIALIZABLE");
 try{
  const manager=runner.manager,transactional={query:manager.query.bind(manager),transaction:async<T>(levelOrWork:"REPEATABLE READ"|((m:EntityManager)=>Promise<T>),maybeWork?:((m:EntityManager)=>Promise<T>))=>{const work=typeof levelOrWork==="function"?levelOrWork:maybeWork;assert.ok(work);return work(manager);}} as unknown as DataSource;
  const scope:TenantParkScope={tenantId:"10000001",parkId:"20000001"},actorId=randomUUID(),orgId=randomUUID(),suffix=randomUUID().slice(0,8);
  await manager.query(`INSERT INTO sys_user(id,tenant_id,park_id,username,display_name,password_hash,status) VALUES($1,$2,$3,$4,'招聘阶段轨迹测试','not-a-login-hash','enabled')`,[actorId,scope.tenantId,scope.parkId,`recruitment-stage-${suffix}`]);
  await manager.query(`INSERT INTO sys_org(id,tenant_id,park_id,org_code,org_name,org_type,status,leader_user_id,create_by,update_by) VALUES($1,$2,$3,$4,'招聘阶段轨迹测试部门','department','enabled',$5,$5,$5)`,[orgId,scope.tenantId,scope.parkId,`RE-SE-${suffix}`,actorId]);
  const actor:JwtPrincipal={...scope,sub:actorId,username:"recruitment-stage-evidence",roles:[],permissions:["*"]};const audits:unknown[]=[];const service=new HrRecruitmentService(transactional,{} as never,{recordOperationRequired:async(input:unknown)=>{audits.push(input);}} as never);
  const requisition=await service.createRequisition(scope,actor,{requisitionCode:`SE-${suffix}`,title:"阶段轨迹夹具",orgId,headcount:1,ownerUserId:actor.sub,status:"open"});const candidate=await service.createCandidate(scope,actor,{requisitionId:requisition.id,candidateNo:`C-${suffix}`,fullName:"阶段轨迹候选人"});
  await service.moveCandidate(scope,actor,candidate.id,{toStage:"screening",evaluation:"初筛通过"});await service.moveCandidate(scope,actor,candidate.id,{toStage:"interview",evaluation:"安排面试"});await service.moveCandidate(scope,actor,candidate.id,{toStage:"offer",evaluation:"发放 Offer"});
  const first=await service.listCandidateStageActions(scope,actor,candidate.id,{page:1,page_size:2}),second=await service.listCandidateStageActions(scope,actor,candidate.id,{page:2,page_size:2});assert.equal(first.total,3);assert.equal(first.items.length,2);assert.equal(second.items.length,1);assert.deepEqual([...first.items,...second.items].map(row=>[row.sequenceNo,row.fromStage,row.toStage,row.evaluation]),[[1,"talent_pool","screening","初筛通过"],[2,"screening","interview","安排面试"],[3,"interview","offer","发放 Offer"]]);assert.ok([...first.items,...second.items].every(row=>!("actorUserId" in row)&&!("mobile" in row)&&!("identity" in row)));assert.equal(audits.length,2);
  await assert.rejects(service.listCandidateStageActions({...scope,parkId:"foreign-park"},actor,candidate.id,{page:1,page_size:2}),/Candidate not found/);await manager.query("UPDATE hr_candidate SET is_deleted=true WHERE id=$1 AND tenant_id=$2 AND park_id=$3",[candidate.id,scope.tenantId,scope.parkId]);await assert.rejects(service.listCandidateStageActions(scope,actor,candidate.id,{page:1,page_size:2}),/Candidate not found/);
  const failing=new HrRecruitmentService(transactional,{} as never,{recordOperationRequired:async()=>{throw new Error("required audit unavailable");}} as never);const another=await service.createCandidate(scope,actor,{requisitionId:requisition.id,candidateNo:`C2-${suffix}`,fullName:"审计失败候选人"});await assert.rejects(failing.listCandidateStageActions(scope,actor,another.id,{page:1,page_size:2}),/required audit unavailable/);
 }finally{try{if(runner.isTransactionActive)await runner.rollbackTransaction();}finally{await runner.release();await db.destroy();}}
});
