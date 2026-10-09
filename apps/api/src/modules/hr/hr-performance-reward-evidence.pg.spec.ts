import "reflect-metadata";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import test from "node:test";
import {DataSource} from "typeorm";
import {HR_PERMISSIONS as H} from "@jinhu/shared";
import {HrPerformanceEvaluationService} from "./hr-performance-evaluation.service";
test('owned PG: immutable reward projection, exact own/team scope, complete paging and consistent snapshot',{skip:process.env.HR_PERFORMANCE_REWARD_EVIDENCE_PG_REQUIRED!=='1'},async()=>{
 const connection={type:'postgres' as const,host:'127.0.0.1',port:15491,username:'postgres'},database=`hr_reward_evidence_${randomUUID().replaceAll('-','')}`,admin=new DataSource({...connection,database:'postgres'});let db:DataSource|undefined;
 await admin.initialize();await admin.query(`CREATE DATABASE "${database}"`);
 try{
  db=new DataSource({...connection,database});await db.initialize();
  // Owned projection fixture; no production connection or migration is performed.
  await db.query(`CREATE TABLE sys_org(id uuid PRIMARY KEY,parent_id uuid,tenant_id text,park_id text,leader_user_id uuid,is_deleted boolean DEFAULT false,status text);
   CREATE TABLE hr_employee(id uuid PRIMARY KEY,tenant_id text,park_id text,user_id uuid,primary_org_id uuid);
   CREATE TABLE hr_performance_review_cycle(id uuid PRIMARY KEY,tenant_id text,park_id text);
   CREATE TABLE hr_performance_cycle_employee(id uuid PRIMARY KEY,tenant_id text,park_id text,cycle_id uuid,employee_id uuid);
   CREATE TABLE hr_performance_evidence_reference(id uuid PRIMARY KEY,tenant_id text,park_id text,cycle_employee_id uuid,source_type text,source_id uuid,source_version int,source_snapshot jsonb,create_time timestamptz DEFAULT now());`);
  const scope={tenantId:'t',parkId:'p'},own=randomUUID(),manager=randomUUID(),root=randomUUID(),child=randomUUID(),other=randomUUID(),employee=randomUUID(),outsider=randomUUID(),cycle=randomUUID(),review=randomUUID(),otherReview=randomUUID();
  await db.query(`INSERT INTO sys_org(id,parent_id,tenant_id,park_id,leader_user_id,status)VALUES($1,null,'t','p',$4,'enabled'),($2,$1,'t','p',null,'enabled'),($3,null,'t','p',null,'enabled')`,[root,child,other,manager]);
  await db.query(`INSERT INTO hr_employee VALUES($1,'t','p',$2,$3),($4,'t','p',$5,$6)`,[employee,own,child,outsider,randomUUID(),other]);await db.query(`INSERT INTO hr_performance_review_cycle VALUES($1,'t','p')`,[cycle]);await db.query(`INSERT INTO hr_performance_cycle_employee VALUES($1,'t','p',$2,$3),($4,'t','p',$2,$5)`,[review,cycle,employee,otherReview,outsider]);
  const insert=async(n:number,target=review,type='reward',tenant='t')=>db!.query(`INSERT INTO hr_performance_evidence_reference(id,tenant_id,park_id,cycle_employee_id,source_type,source_id,source_version,source_snapshot)VALUES($1,$2,'p',$3,$4,$5,3,$6)`,[randomUUID(),tenant,target,type,randomUUID(),{caseCode:`SYN-${n}`,kind:'reward',occurredOn:'2090-01-01',amount:'private',reason:'private',evidenceFileIds:['private']}]);
  for(let n=0;n<43;n++)await insert(n);await insert(999,otherReview);await insert(998,review,'training');await insert(997,review,'reward','other-tenant');
  const actor=(sub=own,permissions:string[]=[H.HR_PERFORMANCE_SELF_READ])=>({sub,username:'synthetic',...scope,roles:[],permissions});const audit={recordOperationRequired:async()=>{}};const service=new HrPerformanceEvaluationService(db,audit as never);
  const one=await service.rewardEvidence(scope,actor(),review,{page:1,page_size:20}),two=await service.rewardEvidence(scope,actor(),review,{page:2,page_size:20}),three=await service.rewardEvidence(scope,actor(),review,{page:3,page_size:20});assert.equal(one.total,43);assert.deepEqual([one.items.length,two.items.length,three.items.length],[20,20,3]);assert.equal(new Set([...one.items,...two.items,...three.items].map(x=>x.id)).size,43);assert.doesNotMatch(JSON.stringify(one),/private|amount|reason|source_snapshot/);
  assert.equal((await service.rewardEvidence(scope,actor(manager,[H.HR_PERFORMANCE_TEAM_READ]),review,{page:1,page_size:20})).total,43);await assert.rejects(service.rewardEvidence(scope,actor(),otherReview,{page:1,page_size:20}),/not found/);await assert.rejects(service.rewardEvidence(scope,actor(manager,[H.HR_PERFORMANCE_TEAM_READ]),otherReview,{page:1,page_size:20}),/not found/);assert.equal((await service.rewardEvidence(scope,actor(manager,[H.HR_PERFORMANCE_READ]),otherReview,{page:1,page_size:20})).total,1);
  const snap=new HrPerformanceEvaluationService({transaction:async(level:'REPEATABLE READ',job:(m:unknown)=>Promise<unknown>)=>db!.transaction(level,m=>job({query:async(sql:string,args?:unknown[])=>{const r=await m.query(sql,args);if(sql.startsWith('SELECT count(*)'))await insert(44);return r;}}))} as never,audit as never);const snapshot=await snap.rewardEvidence(scope,actor(),review,{page:3,page_size:20});assert.equal(snapshot.total,43);assert.equal(snapshot.items.length,3);assert.equal((await service.rewardEvidence(scope,actor(),review,{page:3,page_size:20})).total,44);
  const empty=await service.rewardEvidence(scope,actor(),review,{page:99,page_size:20});assert.equal(empty.total,44);assert.equal(empty.items.length,0);
  await db.query(`UPDATE hr_performance_evidence_reference SET source_snapshot='{"caseCode":{"private":"secret"},"kind":["reward"],"occurredOn":99}' WHERE id=$1`,[one.items[0]!.id]);const malformed=await service.rewardEvidence(scope,actor(),review,{page:1,page_size:20});assert.deepEqual([malformed.items[0]!.caseCode,malformed.items[0]!.kind,malformed.items[0]!.occurredOn],[null,null,null]);
 }finally{if(db?.isInitialized)await db.destroy();await admin.query(`DROP DATABASE "${database}" WITH(FORCE)`);assert.equal((await admin.query('SELECT count(*)::int n FROM pg_database WHERE datname=$1',[database]))[0].n,0);await admin.destroy();}
});
