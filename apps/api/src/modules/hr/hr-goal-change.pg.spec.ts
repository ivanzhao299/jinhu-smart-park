import "reflect-metadata";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {test} from "node:test";
import {DataSource,type EntityManager} from "typeorm";
import {HR_PERMISSIONS as H} from "@jinhu/shared";
import {HrGoalReportService} from "./hr-goal-report.service";
import type {ChangeHrGoalDto} from "./dto/hr-goal-report.dto";
test("goal definition continuity with original migrations: concurrent version, rollback, immutable history and scope",{skip:process.env.HR_GOAL_CHANGE_PG_REQUIRED!=="1"},async()=>{
 assert.equal(process.env.POSTGRES_HOST,"127.0.0.1");assert.equal(process.env.POSTGRES_PORT,"15484");
 const config={type:"postgres" as const,host:"127.0.0.1",port:15484,username:"postgres"},name=`hr_goal_change_${randomUUID().replaceAll("-","")}`;
 const admin=new DataSource({...config,database:"postgres"});let db:DataSource|undefined,created=false;
 try{
  await admin.initialize();await admin.query(`CREATE DATABASE ${name}`);created=true;db=new DataSource({...config,database:name});await db.initialize();
  // Only dependency catalogs are fixtures. Goal/report DDL and guards are the original migrations.
  await db.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";CREATE TABLE sys_org(id uuid PRIMARY KEY,tenant_id varchar(64),park_id varchar(64),parent_id uuid,leader_user_id uuid,org_name text,status text DEFAULT 'enabled',is_deleted boolean DEFAULT false);CREATE TABLE hr_employee(id uuid PRIMARY KEY,tenant_id varchar(64),park_id varchar(64),user_id uuid,primary_org_id uuid,full_name text,employment_status text DEFAULT 'active',is_deleted boolean DEFAULT false);CREATE TABLE sys_file(id uuid PRIMARY KEY);CREATE TABLE test_required_audit(id uuid DEFAULT uuid_generate_v4(),detail jsonb);`);
  for(const file of ["000231_hr_goals_work_reports.sql","000257_hr_goal_report_execution.sql"])await db.query(readFileSync(resolve(process.cwd(),"../../database/migrations",file),"utf8"));
  const scope={tenantId:"t",parkId:"p"},user=randomUUID(),org=randomUUID(),outside=randomUUID(),employee=randomUUID();
  await db.query(`INSERT INTO sys_org(id,tenant_id,park_id,leader_user_id,org_name)VALUES($1,'t','p',$3,'Own'),($2,'t','p',NULL,'Outside')`,[org,outside,user]);
  await db.query(`INSERT INTO hr_employee(id,tenant_id,park_id,primary_org_id,full_name)VALUES($1,'t','p',$2,'Synthetic')`,[employee,org]);
  const actor={...scope,sub:user,username:"synthetic",roles:[],permissions:[H.HR_GOAL_MANAGE,H.HR_GOAL_CYCLE_MANAGE,H.HR_GOAL_READ,H.HR_GOAL_CHANGE]};
  let failAudit=false;
  const audit={recordOperationRequired:async(input:unknown,m?:EntityManager)=>{if(!m)return;if(failAudit)throw Error("audit unavailable");await m.query("INSERT INTO test_required_audit(detail)VALUES($1)",[input]);}};
  const service=new HrGoalReportService(db,{} as never,audit as never);
  const cycle=await service.createCycle(scope,actor,{cycleCode:"oct",cycleName:"October",startDate:"2026-10-01",endDate:"2026-10-31"});
  await service.cycleAction(scope,actor,cycle.id,{action:"activate"});
  const base={cycleId:cycle.id,goalName:"Root",goalLevel:"group",weight:1,metricType:"count",metricName:"Count",targetValue:10,unit:"items",startDate:"2026-10-01",dueDate:"2026-10-31"};
  const root=await service.createGoal(scope,actor,base);await service.goalAction(scope,actor,String(root.id),{action:"activate",reason:"Start"});
  const child=await service.createGoal(scope,actor,{...base,goalName:"Department",weight:.5,goalLevel:"department",parentGoalId:String(root.id),ownerOrgId:org,collaboratorEmployeeIds:[employee]});
  await service.goalAction(scope,actor,String(child.id),{action:"activate",reason:"Start"});
  await db.query("UPDATE hr_goal SET progress=.4,current_value=4,version=version+1 WHERE id=$1",[child.id]);
  const change={...base,weight:.5,goalName:"Updated",goalLevel:"department",parentGoalId:String(root.id),ownerOrgId:org,targetValue:null,expectedVersionNo:1,changeReason:"Definition update"} as ChangeHrGoalDto;
  const results=await Promise.allSettled([service.changeGoal(scope,actor,String(child.id),change),service.changeGoal(scope,actor,String(child.id),change)]);
  assert.equal(results.filter(r=>r.status==="fulfilled").length,1);assert.equal(results.filter(r=>r.status==="rejected").length,1);assert.match(String((results.find(r=>r.status==="rejected") as PromiseRejectedResult).reason),/changed/);
  const detail=await service.goalChangeDetail(scope,actor,String(child.id));assert.equal(detail.goal.currentVersionNo,2);assert.equal(detail.goal.progress,"0.4000");assert.equal(detail.goal.currentValue,"4.0000");assert.equal(detail.goal.targetValue,null);assert.equal(detail.collaborators[0]?.employeeId,employee);assert.equal(detail.versions.length,2);assert.deepEqual(detail.versions[0]?.snapshot.collaboratorEmployeeIds,[employee]);assert.equal(Object.hasOwn(detail.versions[1]!.snapshot,"collaboratorEmployeeIds"),false);
  const counts=async()=>db!.query("SELECT (SELECT count(*)::int FROM hr_goal_version) versions,(SELECT count(*)::int FROM hr_goal_action) actions,(SELECT count(*)::int FROM test_required_audit) audits");const before=await counts();
  failAudit=true;await assert.rejects(service.changeGoal(scope,actor,String(child.id),{...change,expectedVersionNo:2,goalName:"Must rollback"}),/audit unavailable/);failAudit=false;
  assert.deepEqual(await counts(),before);assert.equal((await service.goalChangeDetail(scope,actor,String(child.id))).goal.goalName,"Updated");
  await assert.rejects(service.changeGoal(scope,actor,String(child.id),{...change,expectedVersionNo:2,dueDate:"2026-11-01"}),/outside cycle/);assert.deepEqual(await counts(),before);
  await assert.rejects(db.query("UPDATE hr_goal_version SET change_reason='rewrite' WHERE goal_id=$1",[child.id]),/append-only/);
  // A CHANGE-only manager cannot pull a known foreign goal into their own organization.
  await assert.rejects(service.changeGoal(scope,actor,String(root.id),{...base,expectedVersionNo:1,changeReason:"Shorten",dueDate:"2026-10-15"}),/child goals must remain/);
  const foreign=await service.createGoal(scope,actor,{...base,goalName:"Foreign",goalLevel:"department",parentGoalId:String(root.id),ownerOrgId:outside,weight:.5});
  await assert.rejects(service.changeGoal(scope,{...actor,permissions:[H.HR_GOAL_CHANGE]},String(foreign.id),change),/outside/);
  await assert.rejects(service.changeGoal(scope,{...actor,permissions:[H.HR_GOAL_CHANGE]},String(root.id),{...change,expectedVersionNo:1}),/Only park/);
  await service.goalAction(scope,actor,String(child.id),{action:"complete",reason:"Complete"});await assert.rejects(service.changeGoal(scope,actor,String(child.id),{...change,expectedVersionNo:2}),/Closed goal/);
 }finally{
  if(db?.isInitialized)await db.destroy();if(admin.isInitialized){if(created){await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);assert.equal((await admin.query("SELECT count(*)::int n FROM pg_database WHERE datname=$1",[name]))[0].n,0);}await admin.destroy();}
 }
});
