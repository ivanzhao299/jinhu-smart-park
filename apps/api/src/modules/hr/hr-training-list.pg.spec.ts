import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { DataSource } from "typeorm";
import { HR_PERMISSIONS } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { HrTrainingService } from "./hr-training.service";

const enabled = process.env.HR_TRAINING_LIST_PG_REQUIRED === "1";
const scope = { tenantId:"10000001", parkId:"20000001" };
const database = `jinhu_hr_training_query_lab_${randomUUID().replaceAll("-", "")}`;
let admin:DataSource, db:DataSource, service:HrTrainingService, created=false;
const managerId=randomUUID(), selfId=randomUUID(), org=randomUUID(), child=randomUUID(), sibling=randomUUID();
const employees=[randomUUID(),randomUUID(),randomUUID(),randomUUID(),randomUUID()];
const audits:unknown[]=[];
const actor=(permission:string,sub=randomUUID()):JwtPrincipal=>({sub,username:"synthetic-training-query",...scope,roles:[],permissions:[permission]});

before(async()=>{
  if(!enabled)return;
  assert.equal(process.env.POSTGRES_HOST,"127.0.0.1");
  assert.equal(process.env.POSTGRES_PORT,"55491");
  const config={type:"postgres" as const,host:"127.0.0.1",port:55491,username:process.env.POSTGRES_USER,password:process.env.POSTGRES_PASSWORD};
  admin=new DataSource({...config,database:"postgres"});await admin.initialize();
  await admin.query(`CREATE DATABASE "${database}" TEMPLATE template0`);created=true;
  db=new DataSource({...config,database});await db.initialize();
  assert.equal((await db.query("SELECT current_database() name"))[0].name,database);
  await db.query(`
    CREATE TABLE sys_org(id uuid PRIMARY KEY,tenant_id text,park_id text,parent_id uuid,leader_user_id uuid,is_deleted boolean DEFAULT false,status text DEFAULT 'enabled');
    CREATE TABLE hr_employee(id uuid PRIMARY KEY,tenant_id text,park_id text,primary_org_id uuid,user_id uuid);
    CREATE TABLE hr_training_plan(id uuid PRIMARY KEY,tenant_id text,park_id text,plan_code text,plan_name text,status text,mandatory boolean DEFAULT false,start_date date,end_date date,snapshot jsonb DEFAULT '{}',budget_amount numeric,cost_currency text,is_deleted boolean DEFAULT false);
    CREATE TABLE hr_training_participant(id uuid PRIMARY KEY,tenant_id text,park_id text,plan_id uuid,employee_id uuid,status text,actual_cost numeric);
    CREATE TABLE hr_training_plan_fact_revision(tenant_id text,park_id text,plan_id uuid,course_title text,start_date date,end_date date,sequence_no integer);
    CREATE TABLE hr_training_result_correction(tenant_id text,park_id text,participant_id uuid,corrected_actual_cost numeric,cost_present boolean GENERATED ALWAYS AS (corrected_actual_cost IS NOT NULL) STORED,sequence_no integer);
  `);
  await db.query(`INSERT INTO sys_org(id,tenant_id,park_id,parent_id,leader_user_id) VALUES($1,$4,$5,NULL,$6),($2,$4,$5,$1,NULL),($3,$4,$5,NULL,NULL)`,[org,child,sibling,scope.tenantId,scope.parkId,managerId]);
  for(let i=0;i<employees.length;i++)await db.query(`INSERT INTO hr_employee VALUES($1,$2,$3,$4,$5)`,[employees[i],i===4?"10000002":scope.tenantId,i===3?"20000002":scope.parkId,[org,child,sibling,org,org][i],i===0?selfId:randomUUID()]);
  const definitions=[{status:"published",members:[0,1]},{status:"in_progress",members:[2]},{status:"completed",members:[1]},{status:"published",members:[3],park:"20000002"},{status:"published",members:[4],tenant:"10000002"},{status:"published",members:[0],deleted:true},{status:"published",members:[]}];
  for(const [i,d] of definitions.entries()){
    const id=randomUUID(),tenant=d.tenant??scope.tenantId,park=d.park??scope.parkId;
    await db.query(`INSERT INTO hr_training_plan(id,tenant_id,park_id,plan_code,plan_name,status,start_date,end_date,is_deleted,budget_amount,cost_currency) VALUES($1,$2,$3,$4,'synthetic plan',$5,'2026-10-01','2026-10-02',$6,100,'CNY')`,[id,tenant,park,`SYNTH-${i}`,d.status,d.deleted??false]);
    for(const index of d.members)await db.query(`INSERT INTO hr_training_participant VALUES($1,$2,$3,$4,$5,'assigned',10)`,[randomUUID(),tenant,park,id,employees[index]]);
  }
  service=new HrTrainingService(db,{recordOperationRequired:async(value:unknown)=>{audits.push(value);}} as never);
});
after(async()=>{
  if(db?.isInitialized)await db.destroy();
  if(admin?.isInitialized){
    try{if(created){await admin.query(`DROP DATABASE "${database}"`);assert.equal((await admin.query("SELECT count(*)::int n FROM pg_database WHERE datname=$1",[database]))[0].n,0);}}
    finally{await admin.destroy();}
  }
});

test("out-of-range training pages retain distinct plan counts for park, recursive team and self scopes",{skip:!enabled},async()=>{
  for(const [principal,total] of [[actor(HR_PERMISSIONS.HR_TRAINING_READ),3],[actor(HR_PERMISSIONS.HR_TRAINING_TEAM_READ,managerId),2],[actor(HR_PERMISSIONS.HR_TRAINING_SELF_READ,selfId),1]] as const){
    const first=await service.listPlans(scope,principal,{page:1,page_size:1});assert.equal(first.total,total);assert.equal(first.items.length,1);
    const empty=await service.listPlans(scope,principal,{page:50,page_size:1});assert.deepEqual(empty.items,[]);assert.equal(empty.total,total);
    const filtered=await service.listPlans(scope,principal,{page:50,page_size:1,status:"published"});assert.equal(filtered.total,1);assert.deepEqual(filtered.items,[]);
    assert.equal("budgetAmount" in first.items[0],false);assert.equal("actualCost" in first.items[0],false);
  }
  assert.ok(audits.length>=9);
});

test("unmatched status and no-permission training views expose zero counts",{skip:!enabled},async()=>{
  const empty=await service.listPlans(scope,actor(HR_PERMISSIONS.HR_TRAINING_READ),{page:50,page_size:1,status:"draft"});assert.equal(empty.total,0);assert.deepEqual(empty.items,[]);
  const auditCount=audits.length;
  const denied=await service.listPlans(scope,actor("unrelated:read"),{page:50,page_size:1});assert.equal(denied.total,0);assert.deepEqual(denied.items,[]);assert.equal(audits.length,auditCount);
});

test("exact cost permission retains the financial projection and the same empty-page total",{skip:!enabled},async()=>{
  const principal=actor(HR_PERMISSIONS.HR_TRAINING_READ);principal.permissions.push(HR_PERMISSIONS.HR_TRAINING_COST_READ);
  const first=await service.listPlans(scope,principal,{page:1,page_size:1});assert.equal(first.total,3);assert.equal("budgetAmount" in first.items[0],true);assert.equal("actualCost" in first.items[0],true);
  const empty=await service.listPlans(scope,principal,{page:50,page_size:1});assert.equal(empty.total,3);assert.deepEqual(empty.items,[]);
});
