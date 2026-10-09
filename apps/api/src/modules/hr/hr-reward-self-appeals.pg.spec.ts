import "reflect-metadata";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import test from "node:test";
import {ForbiddenException,NotFoundException,ConflictException} from "@nestjs/common";
import {DataSource} from "typeorm";
import {HR_PERMISSIONS as H} from "@jinhu/shared";
import type {JwtPrincipal} from "../../shared/types/jwt-principal";
import {HrRewardsService} from "./hr-rewards.service";
const required=process.env.HR_REWARD_APPEALS_PG_REQUIRED==='1';
test('owned PG concurrent self appeal and HR correction preserve approved facts and isolate own history',{skip:!required},async()=>{
 if(process.env.POSTGRES_HOST!=='127.0.0.1'||process.env.POSTGRES_PORT!=='15489')throw Error('Self appeal fixture requires owned loopback15489');
 const connection={type:'postgres' as const,host:'127.0.0.1',port:15489,username:'postgres'},name=`hr_reward_appeals_${randomUUID().replace(/-/g,'')}`;
 const admin=new DataSource({...connection,database:'postgres'});let db:DataSource|undefined,other:DataSource|undefined,created=false;
 try{
  await admin.initialize();await admin.query(`CREATE DATABASE ${name}`);created=true;db=new DataSource({...connection,database:name});other=new DataSource({...connection,database:name});await db.initialize();await other.initialize();
  // Minimal owned SQL contract fixture; not full production schema/migration acceptance.
  await db.query(`CREATE TABLE sys_org(id uuid PRIMARY KEY,tenant_id text,park_id text,leader_user_id uuid,status text,is_deleted boolean,parent_id uuid);
CREATE TABLE hr_employee(id uuid PRIMARY KEY,tenant_id text,park_id text,user_id uuid,primary_org_id uuid,full_name text);
CREATE TABLE hr_reward_discipline_category_version(id uuid PRIMARY KEY,tenant_id text,park_id text,kind text,name text,description text);
CREATE TABLE hr_reward_discipline_case(id uuid PRIMARY KEY,tenant_id text,park_id text,employee_id uuid,category_version_id uuid,status text,is_deleted boolean DEFAULT false,case_code text,occurred_on date,category_snapshot jsonb,impact_level text,fact_summary text,detailed_reason text,amount_suggestion numeric(20,4),currency text,evidence_snapshot jsonb);
CREATE TABLE hr_reward_discipline_correction(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id text,park_id text,case_id uuid,sequence_no int,correction_type text CHECK(correction_type IN('correction','appeal')),summary text,reason text,create_by text,create_time timestamptz DEFAULT now(),UNIQUE(case_id,sequence_no));
CREATE TABLE hr_reward_discipline_action(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id text,park_id text,case_id uuid,action text,from_status text,to_status text,note text,actor_user_id text);`);
  const otherUser=randomUUID(),scope={tenantId:'tenant',parkId:'park'},self:JwtPrincipal={...scope,sub:randomUUID(),username:'synthetic',roles:[],permissions:[H.HR_REWARD_SELF_READ]},hr={...self,sub:randomUUID(),permissions:[H.HR_REWARD_READ,H.HR_REWARD_MANAGE,H.HR_REWARD_REASON_READ]},ids={employee:randomUUID(),version:randomUUID(),case:randomUUID(),otherCase:randomUUID(),otherEmployee:randomUUID()};
  const audit={recordOperationRequired:async()=>{}} as never,service=new HrRewardsService(db,audit),writer=new HrRewardsService(other,audit);
  await db.query("INSERT INTO hr_employee VALUES($1,'tenant','park',$4,$2,'合成员工'),($3,'tenant','park',$5,$2,'另一合成员工')",[ids.employee,randomUUID(),ids.otherEmployee,self.sub,otherUser]);
  await db.query("INSERT INTO hr_reward_discipline_category_version VALUES($1,'tenant','park','reward','合成奖励','制度原文')",[ids.version]);
  for(const [id,employee] of [[ids.case,ids.employee],[ids.otherCase,ids.otherEmployee]])await db.query("INSERT INTO hr_reward_discipline_case VALUES($1,'tenant','park',$2,$3,'approved',false,'SYN','2090-01-01','{\"kind\":\"reward\",\"name\":\"批准制度快照\"}','normal','批准事实','HR详细原因',100.0000,'CNY','[\"retained-evidence\"]')",[id,employee,ids.version]);
  const before=(await db.query('SELECT * FROM hr_reward_discipline_case WHERE id=$1',[ids.case]))[0];
  const results=await Promise.all([service.correct(scope,self,ids.case,{type:'appeal',summary:'本人申诉摘要',reason:'本人复核原因'}),writer.correct(scope,hr,ids.case,{type:'correction',summary:'HR更正摘要',reason:'HR_PRIVATE'})]);
  assert.deepEqual(results.map(r=>r.sequenceNo).sort(),[1,2]);assert.deepEqual((await db.query('SELECT * FROM hr_reward_discipline_case WHERE id=$1',[ids.case]))[0],before);
  await db.query("INSERT INTO hr_reward_discipline_correction(tenant_id,park_id,case_id,sequence_no,correction_type,summary,reason,create_by) VALUES('tenant','park',$1,3,'appeal','另一账号申诉','OTHER_PRIVATE','other')",[ids.case]);
  const selfDetail=await service.detail(scope,self,ids.case) as Record<string,unknown>;assert.equal(selfDetail.canAppeal,true);const history=selfDetail.ownAppeals as {summary:string}[];assert.equal(history.length,1);assert.equal(history[0]!.summary,'本人申诉摘要');for(const key of ['corrections','detailedReason','amountSuggestion','evidenceFileIds','user_id'])assert.equal(Object.hasOwn(selfDetail,key),false);assert.ok(!JSON.stringify(selfDetail).includes('PRIVATE'));assert.ok(!JSON.stringify(selfDetail).includes('HR更正摘要'));
  const dual={...self,permissions:[H.HR_REWARD_TEAM_READ,H.HR_REWARD_SELF_READ]};
  const listed=await service.list(scope,dual,{page:1,page_size:20});assert.deepEqual(listed.items.map((r:{id:string})=>r.id),[ids.case]);assert.equal((await service.detail(scope,dual,ids.case)).canAppeal,true);
  await assert.rejects(service.detail(scope,self,ids.otherCase),NotFoundException);await assert.rejects(service.correct(scope,self,ids.otherCase,{type:'appeal',summary:'禁止',reason:'禁止'}),ForbiddenException);
  await assert.rejects(service.detail({...scope,parkId:'foreign'},self,ids.case),ForbiddenException);
  const hrDetail=await service.detail(scope,hr,ids.case) as Record<string,unknown>;assert.equal(hrDetail.canAppeal,false);assert.equal(Object.hasOwn(hrDetail,'ownAppeals'),false);assert.equal((hrDetail.corrections as unknown[]).length,3);
  await db.query("UPDATE hr_reward_discipline_case SET status='draft' WHERE id=$1",[ids.otherCase]);await assert.rejects(service.correct(scope,{...self,sub:otherUser},ids.otherCase,{type:'appeal',summary:'禁止草稿',reason:'禁止草稿'}),ConflictException);
  const actions=await db.query('SELECT action,from_status,to_status FROM hr_reward_discipline_action WHERE case_id=$1 ORDER BY action',[ids.case]);assert.deepEqual(actions,[{action:'appeal',from_status:'approved',to_status:'approved'},{action:'correct',from_status:'approved',to_status:'approved'}]);assert.equal((await db.query('SELECT count(*)::int total FROM hr_reward_discipline_correction WHERE case_id=$1',[ids.otherCase]))[0].total,0);
 }finally{if(other?.isInitialized)await other.destroy();if(db?.isInitialized)await db.destroy();if(admin.isInitialized){if(created){await admin.query(`DROP DATABASE ${name}`);assert.equal((await admin.query('SELECT count(*)::int total FROM pg_database WHERE datname=$1',[name]))[0].total,0);}await admin.destroy();}}
});
