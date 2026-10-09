import "reflect-metadata";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import test from "node:test";
import {DataSource} from "typeorm";
import {HR_PERMISSIONS as H} from "@jinhu/shared";
import {HrPerformanceEvaluationService} from "./hr-performance-evaluation.service";

test("isolated PostgreSQL: paginated review scope, filtered totals, empty page and consistent snapshot",{skip:process.env.HR_PERFORMANCE_PAGE_PG_REQUIRED!=="1"},async()=>{
 const connection={type:"postgres" as const,host:"127.0.0.1",port:Number(process.env.HR_PERFORMANCE_PAGE_PG_PORT??15484),username:"postgres"};
 const database=`hr_review_page_${randomUUID().replaceAll("-","")}`,admin=new DataSource({...connection,database:"postgres"});let db:DataSource|undefined;
 await admin.initialize();await admin.query(`CREATE DATABASE "${database}"`);
 try{
  db=new DataSource({...connection,database});await db.initialize();
  // SQL projection fixture only: lifecycle constraints are covered by the original
  // performance review PG suite; this isolated database never impersonates it.
  await db.query(`CREATE TABLE sys_org(id uuid PRIMARY KEY,parent_id uuid,tenant_id text,park_id text,leader_user_id uuid,is_deleted boolean DEFAULT false,status text);
   CREATE TABLE hr_employee(id uuid PRIMARY KEY,tenant_id text,park_id text,user_id uuid,manager_employee_id uuid,primary_org_id uuid,is_deleted boolean DEFAULT false);
   CREATE TABLE hr_performance_review_cycle(id uuid PRIMARY KEY,tenant_id text,park_id text,cycle_name text,start_date date,template_snapshot jsonb);
   CREATE TABLE hr_performance_cycle_employee(id uuid PRIMARY KEY,tenant_id text,park_id text,cycle_id uuid,employee_id uuid,status text,employee_snapshot jsonb,self_score numeric,manager_score numeric,calibrated_score numeric,final_score numeric,final_level_code text,final_level_name text);
   CREATE TABLE hr_performance_review_submission(id uuid PRIMARY KEY,tenant_id text,park_id text,cycle_employee_id uuid,submission_type text,submission_no int,dimension_scores jsonb,dimension_comments jsonb);
   CREATE TABLE hr_performance_calibration_entry(id uuid PRIMARY KEY,tenant_id text,park_id text,cycle_employee_id uuid,dimension_scores jsonb,create_time timestamptz);
   CREATE TABLE hr_performance_appeal(id uuid PRIMARY KEY,tenant_id text,park_id text,cycle_employee_id uuid,appeal_no int,status text);
   CREATE TABLE hr_performance_review_action(id uuid PRIMARY KEY,tenant_id text,park_id text,cycle_employee_id uuid,action_no int,action_type text,from_status text,to_status text,reason text,result_snapshot jsonb,create_time timestamptz);`);
  const scope={tenantId:"page-tenant",parkId:"page-park"},managerId=randomUUID(),user=randomUUID(),root=randomUUID(),child=randomUUID(),otherOrg=randomUUID(),managerEmployee=randomUUID(),employee=randomUUID(),otherEmployee=randomUUID(),cycle=randomUUID(),otherCycle=randomUUID();
  await db.query(`INSERT INTO sys_org(id,parent_id,tenant_id,park_id,leader_user_id,status) VALUES($1,null,$4,$5,$6,'enabled'),($2,$1,$4,$5,null,'enabled'),($3,null,$4,$5,null,'enabled')`,[root,child,otherOrg,scope.tenantId,scope.parkId,managerId]);
  for(const [id,u,org,m] of [[managerEmployee,managerId,root,null],[employee,user,child,managerEmployee],[otherEmployee,randomUUID(),otherOrg,null]])await db.query(`INSERT INTO hr_employee(id,user_id,primary_org_id,manager_employee_id,tenant_id,park_id) VALUES($1,$2,$3,$4,$5,$6)`,[id,u,org,m,scope.tenantId,scope.parkId]);
  for(const id of [cycle,otherCycle])await db.query(`INSERT INTO hr_performance_review_cycle VALUES($1,$2,$3,'Synthetic cycle','2026-10-01','{"dimensions":[]}'::jsonb)`,[id,scope.tenantId,scope.parkId]);
  const insert=async(id:string,c=cycle,e=employee,status="self_review",tenant=scope.tenantId,park=scope.parkId)=>db!.query(`INSERT INTO hr_performance_cycle_employee(id,tenant_id,park_id,cycle_id,employee_id,status,employee_snapshot,manager_score,calibrated_score,final_score,final_level_code,final_level_name) VALUES($1,$2,$3,$4,$5,$6,'{"fullName":"Synthetic","employeeCode":"SYN"}'::jsonb,90,95,95,'A','Synthetic')`,[id,tenant,park,c,e,status]);
  const reviewIds:string[]=[];for(let i=0;i<65;i++){const id=randomUUID();reviewIds.push(id);await insert(id,cycle,employee,i<5?"confirmed":"self_review");}
  const hiddenId=reviewIds[5]!;
  await db.query(`INSERT INTO hr_performance_review_submission VALUES($1,$2,$3,$4,'manager',1,'{"result":90}','{"result":"synthetic manager comment"}')`,[randomUUID(),scope.tenantId,scope.parkId,hiddenId]);
  await db.query(`INSERT INTO hr_performance_calibration_entry VALUES($1,$2,$3,$4,'{"result":95}',now())`,[randomUUID(),scope.tenantId,scope.parkId,hiddenId]);
  const isolatedReview=randomUUID();await insert(isolatedReview,cycle,otherEmployee);await insert(randomUUID(),otherCycle);
  // Same UUIDs cannot expand scope through either outer table or joined relation.
  await insert(randomUUID(),cycle,employee,"self_review","foreign-tenant");await insert(randomUUID(),cycle,employee,"self_review",scope.tenantId,"foreign-park");
  const actor=(sub=user,permissions:string[]=[H.HR_PERFORMANCE_SELF_READ])=>({sub,username:"synthetic",...scope,roles:[],permissions});
  const audits:Array<Record<string,unknown>>=[];const audit={recordOperationRequired:async(input:Record<string,unknown>)=>{audits.push(input);}};
  const service=new HrPerformanceEvaluationService(db,audit as never);
  const all=await service.reviewPage(scope,actor(),{cycleId:cycle,page:1,pageSize:30});assert.equal(all.total,65);assert.equal(all.pending,60);assert.equal(all.confirmed,5);assert.equal(all.items.length,30);
  const next=await service.reviewPage(scope,actor(),{cycleId:cycle,page:2,pageSize:30});assert.equal(next.items.length,30);assert.equal(new Set([...all.items,...next.items].map(r=>r.id)).size,60);
  const end=await service.reviewPage(scope,actor(),{cycleId:cycle,page:3,pageSize:30});assert.equal(end.items.length,5);
  const empty=await service.reviewPage(scope,actor(),{cycleId:cycle,page:4,pageSize:30});assert.equal(empty.total,65);assert.equal(empty.items.length,0);
  const confirmed=await service.reviewPage(scope,actor(),{cycleId:cycle,status:"confirmed"});assert.equal(confirmed.total,5);assert.equal(confirmed.pending,0);assert.equal(confirmed.confirmed,5);
  const team=await service.reviewPage(scope,actor(managerId,[H.HR_PERFORMANCE_TEAM_READ]),{cycleId:cycle});assert.equal(team.total,65);
  const park=await service.reviewPage(scope,actor(managerId,[H.HR_PERFORMANCE_READ]),{cycleId:cycle});assert.equal(park.total,66);
  const other=await service.reviewPage({...scope,parkId:"foreign-park"},actor(),{});assert.equal(other.total,0);
  assert.ok(all.items.filter(r=>r.status==="self_review").every(r=>r.managerSubmission===null&&r.calibration===null&&r.result===null));
  assert.ok(all.items.filter(r=>r.status==="confirmed").every(r=>r.result?.score==="95"));assert.equal(audits.length,8);
  const visibleDetail=(await service.reviews(scope,actor(managerId,[H.HR_PERFORMANCE_READ]),{cycleId:cycle})).find(r=>r.id===hiddenId)!;
  assert.deepEqual(visibleDetail.managerSubmission?.scores,{result:90});assert.deepEqual(visibleDetail.calibration?.scores,{result:95});
  const hiddenDetail=(await service.reviews(scope,actor(),{cycleId:cycle})).find(r=>r.id===hiddenId)!;
  assert.equal(hiddenDetail.managerSubmission,null);assert.equal(hiddenDetail.calibration,null);assert.equal(hiddenDetail.result,null);
  for(const [no,type] of [[1,"self_submitted"],[2,"result_finalized"]])await db.query(`INSERT INTO hr_performance_review_action VALUES($1,$2,$3,$4,$5,$6,'self_review','manager_review','synthetic sensitive reason','{"score":95}',now())`,[randomUUID(),scope.tenantId,scope.parkId,hiddenId,no,type]);
  const history=await service.actions(scope,actor(),hiddenId);assert.equal(history.length,1);assert.equal(history[0]!.reason,null);assert.deepEqual(history[0]!.resultSnapshot,{});
  const denied=new HrPerformanceEvaluationService(db,{recordOperationRequired:async()=>{throw new Error("synthetic required audit failure");}} as never);
  await assert.rejects(denied.reviewPage(scope,actor(),{}),/required audit failure/);
  // A concurrent writer between count and page reads cannot change this response's
  // matching set; both reads use the same REPEATABLE READ transaction snapshot.
  const snapService=new HrPerformanceEvaluationService({transaction:async(isolation:"REPEATABLE READ",callback:(m:unknown)=>unknown)=>db!.transaction(isolation,async manager=>callback({query:async(sql:string,args?:unknown[])=>{const result=await manager.query(sql,args);if(sql.startsWith("SELECT count(*)"))await insert(randomUUID());return result;}}))} as never,audit as never);
  const snapshot=await snapService.reviewPage(scope,actor(),{cycleId:cycle,page:3,pageSize:30});assert.equal(snapshot.total,65);assert.equal(snapshot.items.length,5);
  assert.equal((await service.reviewPage(scope,actor(),{cycleId:cycle})).total,66);
  await assert.rejects(service.actions(scope,actor(),isolatedReview),/not found/);
 }finally{if(db?.isInitialized)await db.destroy();await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);assert.equal((await admin.query("SELECT count(*)::int n FROM pg_database WHERE datname=$1",[database]))[0].n,0);await admin.destroy();}
});
