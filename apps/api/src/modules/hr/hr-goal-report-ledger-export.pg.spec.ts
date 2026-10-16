import "reflect-metadata";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {randomUUID} from "node:crypto";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import test from "node:test";
import {Module,ValidationPipe} from "@nestjs/common";
import {NestFactory,Reflector} from "@nestjs/core";
import {DataSource} from "typeorm";
import {HR_PERMISSIONS as H} from "@jinhu/shared";
import {PermissionGuard} from "../../shared/guards/permission.guard";
import {HrGoalReportController} from "./hr-goal-report.controller";
import {HrGoalReportService} from "./hr-goal-report.service";

test("owned PostgreSQL and real HTTP: ledger scope, snapshot, precision, bounds and required audit",{
 skip:process.env.HR_GOAL_LEDGER_PG_REQUIRED!=="1",timeout:120000
},async()=>{
 const name=`hr-ledger-test-${randomUUID()}`,docker=(...args:string[])=>execFileSync("docker",args,{encoding:"utf8",stdio:["ignore","pipe","pipe"]}).trim();
 let owned=false,db:DataSource|undefined,writer:DataSource|undefined,app:Awaited<ReturnType<typeof NestFactory.create>>|undefined;
 try{
  docker("run","-d","--name",name,"--label",`jinhu.hr-ledger-test=${name}`,"--tmpfs","/var/lib/postgresql/data:rw","-e","POSTGRES_HOST_AUTH_METHOD=trust","-p","127.0.0.1::5432","postgres:16-alpine");owned=true;
  const port=Number(docker("port",name,"5432/tcp").split(":").pop());assert.ok(port>0);
  for(let i=0;;i++){try{docker("exec",name,"pg_isready","-h","127.0.0.1","-U","postgres");break;}catch(e){if(i===50)throw e;await new Promise(r=>setTimeout(r,100));}}
  const config={type:"postgres" as const,host:"127.0.0.1",port,username:"postgres",database:"postgres"};
  db=new DataSource(config);writer=new DataSource(config);await db.initialize();await writer.initialize();
  await db.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
   CREATE TABLE sys_org(id uuid PRIMARY KEY,tenant_id varchar(64),park_id varchar(64),parent_id uuid,leader_user_id uuid,org_name text,status text DEFAULT 'enabled',is_deleted boolean DEFAULT false);
   CREATE TABLE hr_employee(id uuid PRIMARY KEY,tenant_id varchar(64),park_id varchar(64),user_id uuid,primary_org_id uuid,manager_employee_id uuid,full_name text,employment_status text DEFAULT 'active',is_deleted boolean DEFAULT false);
   CREATE TABLE sys_file(id uuid PRIMARY KEY);`);
  for(const f of ["000231_hr_goals_work_reports.sql","000257_hr_goal_report_execution.sql","000268_hr_work_report_legacy_parity.sql"])await db.query(readFileSync(resolve(process.cwd(),"../../database/migrations",f),"utf8"));
  const scope={tenantId:"synthetic-t",parkId:"synthetic-p"},manager=randomUUID(),user=randomUUID(),org=randomUUID(),childOrg=randomUUID(),outside=randomUUID(),employee=randomUUID(),other=randomUUID();
  await db.query(`INSERT INTO sys_org(id,tenant_id,park_id,parent_id,leader_user_id,org_name)VALUES($1,$5,$6,NULL,$4,'Synthetic own'),($2,$5,$6,$1,NULL,'Synthetic child'),($3,$5,$6,NULL,NULL,'Synthetic outside')`,[org,childOrg,outside,manager,scope.tenantId,scope.parkId]);
  await db.query(`INSERT INTO hr_employee(id,tenant_id,park_id,user_id,primary_org_id,full_name)VALUES($1,$5,$6,$3,$7,'Synthetic self'),($2,$5,$6,$4,$8,'Synthetic outside')`,[employee,other,user,randomUUID(),scope.tenantId,scope.parkId,childOrg,outside]);
  const principal=(sub:string,permissions:string[])=>({...scope,sub,username:"synthetic",roles:[],permissions});
  const park=principal(manager,[H.HR_GOAL_READ,H.HR_WORK_REPORT_TEAM_READ]),team=principal(manager,[H.HR_GOAL_TEAM_READ,H.HR_WORK_REPORT_TEAM_READ]),self=principal(user,[H.HR_GOAL_SELF_READ,H.HR_WORK_REPORT_SELF_READ]),none=principal(user,[]);
  let failAudit=false;const audits:Array<{path:string;afterJson:{itemCount:number;projection:string}}>=[];
  const audit={recordOperationRequired:async(input:typeof audits[number])=>{if(failAudit)throw Error("synthetic required audit failure");audits.push(input);}};
  const service=new HrGoalReportService(db,{} as never,audit as never);
  const cycle=async(code:string,t=scope.tenantId,p=scope.parkId)=>(await db!.query(`INSERT INTO hr_goal_cycle(tenant_id,park_id,cycle_code,cycle_name,start_date,end_date,status)VALUES($1,$2,$3,'Synthetic cycle','2026-01-01','2026-12-31','active')RETURNING id`,[t,p,code]))[0].id as string;
  const c=await cycle("scope"),bulk=await cycle("bulk"),foreign=await cycle("foreign","synthetic-other-t","synthetic-other-p");
  const goal=async(id:string,level:string,owner:string|null,parent:string|null,status="active",cycleId=c,t=scope.tenantId,p=scope.parkId)=>db!.query(`INSERT INTO hr_goal(id,tenant_id,park_id,cycle_id,parent_goal_id,goal_level,goal_name,owner_org_id,owner_employee_id,weight,metric_type,metric_name,target_value,current_value,progress,start_date,due_date,status)VALUES($1,$2,$3,$4,$5,$6,'Synthetic goal',CASE WHEN $6::varchar='department' THEN $7::uuid END,CASE WHEN $6::varchar='employee' THEN $7::uuid END,.1,'numeric','Synthetic metric',99999999999999.9999,0,.3,'2026-01-01','2026-12-31',$8)`,[id,t,p,cycleId,parent,level,owner,status]);
  const root=randomUUID(),dept=randomUUID(),own=randomUUID(),draft=randomUUID(),foreignDept=randomUUID(),foreignRoot=randomUUID();
  await goal(root,"group",null,null);await goal(dept,"department",org,root);await goal(own,"employee",employee,dept);await goal(draft,"employee",employee,dept,"draft");await goal(foreignDept,"department",outside,root);await goal(foreignRoot,"group",null,null,"active",foreign,"synthetic-other-t","synthetic-other-p");
  await db.query(`INSERT INTO hr_goal_checkin(tenant_id,park_id,goal_id,progress,current_value,summary,confidence)VALUES($1,$2,$3,.3,1.2345,'Synthetic progress','high'),($1,$2,$4,.2,2,'Outside progress','medium')`,[scope.tenantId,scope.parkId,own,foreignDept]);
  const report=randomUUID();await db.query(`INSERT INTO hr_work_report(id,tenant_id,park_id,employee_id,report_type,period_start,period_end,title,completed_work,hours,status)VALUES($1,$4,$5,$2,'daily','2026-10-16','2026-10-16','Synthetic own','Synthetic work',7.25,'draft'),(uuid_generate_v4(),$4,$5,$3,'daily','2026-10-16','2026-10-16','Outside','Outside',1,'draft')`,[report,employee,other,scope.tenantId,scope.parkId]);
  const deletedEmployee=randomUUID();await db.query(`INSERT INTO hr_employee(id,tenant_id,park_id,primary_org_id,full_name,is_deleted)VALUES($1,$2,$3,$4,'Synthetic deleted',true)`,[deletedEmployee,scope.tenantId,scope.parkId,childOrg]);await db.query(`INSERT INTO hr_work_report(tenant_id,park_id,employee_id,report_type,period_start,period_end,completed_work,status)VALUES($1,$2,$3,'daily','2026-10-16','2026-10-16','Synthetic deleted','draft')`,[scope.tenantId,scope.parkId,deletedEmployee]);
  await db.query(`INSERT INTO hr_work_report_goal(tenant_id,park_id,report_id,goal_id,proposed_progress,proposed_current_value,suggestion_summary)VALUES($1,$2,$3,$4,.4,2.3456,'Synthetic suggestion')`,[scope.tenantId,scope.parkId,report,own]);
  class Fixture{}Module({controllers:[HrGoalReportController],providers:[{provide:HrGoalReportService,useValue:service}]})(Fixture);
  app=await NestFactory.create(Fixture,{logger:false});const identities:Record<string,typeof park>={park,team,self,none};app.use((req:{user?:unknown;header:(s:string)=>string|undefined},_res:unknown,next:()=>void)=>{req.user=identities[req.header("x-synthetic-role")??"none"]??none;next();});app.useGlobalGuards(new PermissionGuard(new Reflector()));app.useGlobalPipes(new ValidationPipe({transform:true,whitelist:true,forbidNonWhitelisted:true}));await app.listen(0,"127.0.0.1");const base=await app.getUrl();
  const get=(path:string,role="self")=>fetch(`${base}/hr/${path}`,{headers:{"x-synthetic-role":role}});
  assert.equal((await get("goals/ledger-export","none")).status,403);assert.equal(audits.length,0);
  assert.equal((await get("goals/ledger-export?status=invalid")).status,400);assert.equal(audits.length,0);
  assert.equal((await get("goals/checkins/ledger-export")).status,200);
  const selfRows=await (await get("goals/ledger-export")).json();assert.deepEqual(selfRows.items.map((x:{id:string})=>x.id),[own]);assert.equal(selfRows.items[0].targetValue,"99999999999999.9999");
  const teamRows=await (await get("goals/ledger-export","team")).json();assert.deepEqual(new Set(teamRows.items.map((x:{id:string})=>x.id)),new Set([root,dept,own]));
  const parkRows=await (await get("goals/ledger-export","park")).json();assert.equal(parkRows.total,5);assert.ok(!parkRows.items.some((x:{id:string})=>x.id===foreignRoot));
  const progress=await service.exportGoalCheckinLedger(scope,self,{});assert.equal(progress.total,1);assert.ok(progress.items[0]);assert.equal(progress.items[0].currentValue,"1.2345");
  const mine=await (await get("work-reports/me/ledger-export")).json();assert.equal(mine.total,1);assert.equal(mine.items[0].goalSuggestions[0].proposedCurrentValue,"2.3456");
  const managed=await (await get("work-reports/team/ledger-export","team")).json();assert.equal(managed.total,1);assert.equal(managed.items[0].employeeName,"Synthetic self");
  assert.equal((await get("work-reports/team/ledger-export")).status,403);
  assert.equal((await service.exportGoalLedger(scope,park,{cycle_id:foreign})).total,0);
  assert.equal((await service.exportWorkReportLedger(scope,self,{status:"submitted"})).total,0);
  failAudit=true;assert.equal((await get("goals/ledger-export")).status,500);assert.equal((await get("goals/checkins/ledger-export")).status,500);assert.equal((await get("work-reports/me/ledger-export")).status,500);failAudit=false;
  // A committed write on a genuinely independent connection lands after the snapshot timestamp.
  const create=db.createQueryRunner.bind(db);let intercepted=false;
  db.createQueryRunner=(mode)=>{const runner=create(mode),query=runner.query.bind(runner);runner.query=async(...args:Parameters<typeof query>)=>{const value=await query(...args);if(!intercepted&&String(args[0]).includes("snapshot_at")){intercepted=true;const readerPid=(await query("SELECT pg_backend_pid() pid"))[0].pid;assert.notEqual(readerPid,(await writer!.query("SELECT pg_backend_pid() pid"))[0].pid);await writer!.query("UPDATE hr_goal SET goal_name='Committed after snapshot' WHERE id=$1",[own]);}return value;};return runner;};
  try{const first=await service.exportGoalLedger(scope,self,{});assert.equal(first.items[0].goalName,"Synthetic goal");assert.equal((await service.exportGoalLedger(scope,self,{})).items[0].goalName,"Committed after snapshot");assert.ok(intercepted);}finally{db.createQueryRunner=create;}
  await db.query(`INSERT INTO hr_goal(tenant_id,park_id,cycle_id,goal_level,goal_name,weight,metric_type,start_date,due_date,status)SELECT $1,$2,$3,'group','Synthetic bounded '||n,.0001,'numeric','2026-01-01','2026-12-31','active' FROM generate_series(1,5000)n`,[scope.tenantId,scope.parkId,bulk]);
  assert.equal((await service.exportGoalLedger(scope,park,{cycle_id:bulk})).total,5000);
  await db.query(`INSERT INTO hr_goal(tenant_id,park_id,cycle_id,goal_level,goal_name,weight,metric_type,start_date,due_date,status)VALUES($1,$2,$3,'group','Synthetic overflow',.0001,'numeric','2026-01-01','2026-12-31','active')`,[scope.tenantId,scope.parkId,bulk]);
  await assert.rejects(service.exportGoalLedger(scope,park,{cycle_id:bulk}),/exceeds 5000/);
  await db.query(`INSERT INTO hr_goal_checkin(tenant_id,park_id,goal_id,progress,summary,confidence)SELECT $1,$2,$3,.3,'Synthetic bounded','high' FROM generate_series(1,4999)`,[scope.tenantId,scope.parkId,own]);assert.equal((await service.exportGoalCheckinLedger(scope,self,{})).total,5000);
  await db.query(`INSERT INTO hr_goal_checkin(tenant_id,park_id,goal_id,progress,summary,confidence)VALUES($1,$2,$3,.3,'Synthetic overflow','high')`,[scope.tenantId,scope.parkId,own]);await assert.rejects(service.exportGoalCheckinLedger(scope,self,{}),/exceeds 5000/);
  await db.query(`INSERT INTO hr_work_report(tenant_id,park_id,employee_id,report_type,period_start,period_end,completed_work,status)SELECT $1,$2,$3,'daily','2000-01-01'::date+n,'2000-01-01'::date+n,'Synthetic bounded','draft' FROM generate_series(1,4999)n`,[scope.tenantId,scope.parkId,employee]);assert.equal((await service.exportWorkReportLedger(scope,self,{})).total,5000);
  await db.query(`INSERT INTO hr_work_report(tenant_id,park_id,employee_id,report_type,period_start,period_end,completed_work,status)VALUES($1,$2,$3,'daily','1999-01-01','1999-01-01','Synthetic overflow','draft')`,[scope.tenantId,scope.parkId,employee]);await assert.rejects(service.exportWorkReportLedger(scope,self,{}),/exceeds 5000/);
  assert.ok(audits.some(x=>x.afterJson.itemCount===5000));
 }finally{
  await app?.close();if(writer?.isInitialized)await writer.destroy();if(db?.isInitialized)await db.destroy();
  if(owned){assert.equal(docker("inspect","--format",'{{index .Config.Labels "jinhu.hr-ledger-test"}}',name),name);docker("rm","-fv",name);assert.equal(docker("ps","-aq","--filter",`name=^/${name}$`),"");}
 }
});
