import "reflect-metadata";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import test from "node:test";
import {DataSource,type QueryRunner} from "typeorm";
import {HR_PERMISSIONS as H} from "@jinhu/shared";
import {HrPositionMaintenanceService} from "./hr-position-maintenance.service";

test("owned PostgreSQL: formal position maintenance, historical preservation and both assignment race orders",{skip:process.env.HR_POSITION_MAINTENANCE_PG_REQUIRED!=="1"},async()=>{
 if(process.env.POSTGRES_HOST!=="127.0.0.1"||process.env.POSTGRES_PORT!=="15483")throw Error("Position fixture requires owned loopback15483");
 const connection={type:"postgres" as const,host:"127.0.0.1",port:15483,username:"postgres"};
 const name=`hr_position_lab_${randomUUID().replaceAll("-","")}`,admin=new DataSource({...connection,database:"postgres"});let db:DataSource|undefined,created=false;
 const runners:QueryRunner[]=[];
 try{
  await admin.initialize();await admin.query(`CREATE DATABASE ${name}`);created=true;db=new DataSource({...connection,database:name});await db.initialize();
  // Run the real foundation and additive guards. Other modules use minimal FK stubs.
  await db.query(`CREATE EXTENSION "uuid-ossp";
   CREATE TABLE sys_org(id uuid PRIMARY KEY,tenant_id text,park_id text,org_name text,status text,is_deleted boolean DEFAULT false,sort_order int DEFAULT 0);
   CREATE TABLE sys_user(id uuid PRIMARY KEY); CREATE TABLE sys_file(id uuid PRIMARY KEY);`);
  const migration=(file:string)=>readFileSync(resolve(process.cwd(),"../../database/migrations",file),"utf8");
  await db.query(migration("000230_hr_employee_foundation.sql"));
  await db.query("ALTER TABLE hr_position ADD CONSTRAINT fixture_position_scope UNIQUE(tenant_id,park_id,id)");
  await db.query(migration("000295_hr_organization_position_legacy_mapping.sql"));
  await db.query("CREATE TABLE fixture_position_audit(id bigserial PRIMARY KEY,payload jsonb)");
  const org=randomUUID(),nextOrg=randomUUID(),position=randomUUID(),historical=randomUUID();
  await db.query("INSERT INTO sys_org(id,tenant_id,park_id,org_name,status) VALUES($1,'tenant','park','合成组织','enabled'),($2,'tenant','park','合成新组织','enabled')",[org,nextOrg]);
  const addPosition=async(id:string,code:string)=>db!.query("INSERT INTO hr_position(id,tenant_id,park_id,org_id,position_code,position_name,legacy_source_id) VALUES($1,'tenant','park',$2,$3,'合成岗位',991)",[id,org,code]);
  await addPosition(position,"SYN-P");
  // A pre-existing inconsistent historical row must survive migration and metadata editing.
  await db.query("INSERT INTO hr_employee(id,tenant_id,park_id,primary_org_id,position_id,employee_code,full_name,employment_status) VALUES($1,'tenant','park',$2,$3,'HISTORY','合成历史人员','active')",[historical,nextOrg,position]);
  const before=await db.query("SELECT * FROM hr_employee ORDER BY id");
  await db.query(migration("000352_hr_position_assignment_continuity.sql"));
  assert.deepEqual(await db.query("SELECT * FROM hr_employee ORDER BY id"),before);
  await db.query("UPDATE hr_employee SET full_name='历史资料更正' WHERE id=$1",[historical]);
  const scope={tenantId:"tenant",parkId:"park"},actor={...scope,sub:randomUUID(),username:"synthetic",roles:[],permissions:[H.HR_POSITION_MANAGE]};
  let failAudit=false;
  const audit={recordOperationRequired:async(event:unknown,manager?:{query:(sql:string,args?:unknown[])=>Promise<unknown>})=>{if(!manager)return;if(failAudit)throw Error("required audit failure");await manager.query("INSERT INTO fixture_position_audit(payload) VALUES($1)",[JSON.stringify(event)]);}};
  const scopes={buildScopeFilter:async()=>({unrestricted:false,allowed_ids:[org,nextOrg]})};
  const service=new HrPositionMaintenanceService(db,scopes as never,audit as never);
  const context=await service.context(scope,actor,position);assert.equal(context.position.version,1);assert.equal(context.orgs.length,2);assert.ok(!("legacySourceId" in context.position));
  const saved=await service.update(scope,actor,position,{expectedVersion:1,reason:"核对正式岗位",positionName:"正式岗位名称",jobFamily:"职族",jobLevel:"级别",headcountLimit:0,hierarchyLevel:2,sortOrder:3,authority:"权限",qualification:"资格",responsibilities:"职责",positionManual:"岗位说明",remark:"备注"});
  assert.equal(saved.version,2);assert.equal(saved.headcountLimit,0);assert.equal(saved.positionManual,"岗位说明");
  assert.equal((await db.query("SELECT legacy_source_id FROM hr_position WHERE id=$1",[position]))[0].legacy_source_id,991);
  await assert.rejects(service.update(scope,actor,position,{expectedVersion:1,reason:"过期版本",positionName:"覆盖"}),/已被修改/);
  failAudit=true;await assert.rejects(service.update(scope,actor,position,{expectedVersion:2,reason:"审计回滚",positionName:"不得留下"}),/required audit failure/);failAudit=false;
  assert.equal((await db.query("SELECT version,position_name FROM hr_position WHERE id=$1",[position]))[0].position_name,"正式岗位名称");assert.equal((await db.query("SELECT count(*)::int n FROM fixture_position_audit"))[0].n,1);
  await assert.rejects(service.update(scope,actor,position,{expectedVersion:2,reason:"迁组织",orgId:nextOrg}),/任职引用/);
  await assert.rejects(db.query("UPDATE hr_position SET org_id=$2 WHERE id=$1",[position,nextOrg]),/retained employee/);
  await assert.rejects(db.query("UPDATE hr_position SET status='disabled' WHERE id=$1",[position]),/current employee/);
  const insertEmployee=(runner:{query:(sql:string,args?:unknown[])=>Promise<unknown>},id:string,p:string,owner=org,tenant="tenant",status="active")=>runner.query("INSERT INTO hr_employee(id,tenant_id,park_id,primary_org_id,position_id,employee_code,full_name,employment_status) VALUES($1,$2,'park',$3,$4,$5,'合成并发人员',$6)",[id,tenant,owner,p,id,status]);
  await assert.rejects(insertEmployee(db,randomUUID(),position,nextOrg),/assigned organization/);
  await assert.rejects(insertEmployee(db,randomUUID(),position,org,"foreign"),/this scope/);
  // Observe an actual blocked connection, rather than assuming a timing delay proves a race.
  const waitForLock=async(pid:number)=>{for(let i=0;i<100;i++){const rows=await admin.query("SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1",[pid]);if(rows[0]?.wait_event_type==="Lock")return;await new Promise(r=>setTimeout(r,20));}throw Error("Expected independent connection to wait on position lock");};
  const a=db.createQueryRunner(),b=db.createQueryRunner();runners.push(a,b);await a.connect();await b.connect();
  const pid=(await b.query("SELECT pg_backend_pid() pid"))[0].pid;
  for(const operation of ["move","disable"]){
   const p=randomUUID();await addPosition(p,`RACE-${operation}`);await a.startTransaction();
   await a.query(operation==="move"?"UPDATE hr_position SET org_id=$2 WHERE id=$1":"UPDATE hr_position SET status='disabled' WHERE id=$1",operation==="move"?[p,nextOrg]:[p]);
   const pending=insertEmployee(b,randomUUID(),p).then(()=>({ok:true,error:""}),e=>({ok:false,error:String(e)}));await waitForLock(pid);await a.commitTransaction();const result=await pending;assert.equal(result.ok,false);assert.match(result.error,/assigned organization/);
   const p2=randomUUID();await addPosition(p2,`REVERSE-${operation}`);await a.startTransaction();await insertEmployee(a,randomUUID(),p2);
   const reverse=b.query(operation==="move"?"UPDATE hr_position SET org_id=$2 WHERE id=$1":"UPDATE hr_position SET status='disabled' WHERE id=$1",operation==="move"?[p2,nextOrg]:[p2]).then(()=>({ok:true,error:""}),e=>({ok:false,error:String(e)}));await waitForLock(pid);await a.commitTransaction();const blocked=await reverse;assert.equal(blocked.ok,false);assert.match(blocked.error,/employee assignments/);
  }
  const free=randomUUID();await addPosition(free,"FREE");const concurrent=await Promise.allSettled([service.update(scope,actor,free,{expectedVersion:1,reason:"并发一",qualification:"一"}),service.update(scope,actor,free,{expectedVersion:1,reason:"并发二",qualification:"二"})]);assert.equal(concurrent.filter(r=>r.status==="fulfilled").length,1);assert.equal((await db.query("SELECT version FROM hr_position WHERE id=$1",[free]))[0].version,2);
  for(const isolation of ["REPEATABLE READ","SERIALIZABLE"] as const){
   await a.startTransaction(isolation);await a.query("SELECT * FROM hr_position WHERE id=$1",[free]);
   await assert.rejects(a.query("UPDATE hr_position SET org_id=$2 WHERE id=$1",[free,nextOrg]),/current assignment workflow/);await a.rollbackTransaction();
  }
  await service.update(scope,actor,free,{expectedVersion:2,reason:"空岗迁移",orgId:nextOrg,status:"disabled"});
  const departed=randomUUID();await insertEmployee(db,departed,free,org,"tenant","departed");await assert.rejects(db.query("UPDATE hr_employee SET employment_status='active' WHERE id=$1",[departed]),/assigned organization/);
  await db.query("UPDATE hr_employee SET remark='历史备注可维护' WHERE id=$1",[departed]);
  await assert.rejects(db.query("UPDATE hr_position SET is_deleted=true WHERE id=$1",[free]),/retained employee/);
  const choices=await service.options(scope,actor);assert.equal(choices.orgs.length,2);assert.ok(!("users" in choices));
  const createdPosition=await service.create(scope,actor,{orgId:org,positionCode:"CREATED",positionName:"新建正式岗位",reportsToPositionId:position,jobFamily:"完整职族",jobLevel:"L1",headcountLimit:0,hierarchyLevel:1,sortOrder:5,authority:"权限",qualification:"资格",responsibilities:"职责",positionManual:"说明",status:"enabled",remark:"备注"});
  assert.equal(createdPosition.version,1);assert.equal(createdPosition.positionManual,"说明");assert.equal((await db.query("SELECT legacy_source_id FROM hr_position WHERE id=$1",[createdPosition.id]))[0].legacy_source_id,null);
  await assert.rejects(service.create(scope,actor,{orgId:org,positionCode:"CREATED",positionName:"重复"}),/编码已存在/);
  await assert.rejects(service.create(scope,actor,{orgId:randomUUID(),positionCode:"HIDDEN",positionName:"隐藏组织"}),/outside the permitted scope/);
  failAudit=true;await assert.rejects(service.create(scope,actor,{orgId:org,positionCode:"AUDIT-ROLLBACK",positionName:"审计回滚"}),/required audit failure/);failAudit=false;assert.equal((await db.query("SELECT count(*)::int n FROM hr_position WHERE position_code='AUDIT-ROLLBACK'"))[0].n,0);
  const hiddenOrg=randomUUID(),hiddenPosition=randomUUID();await db.query("INSERT INTO sys_org(id,tenant_id,park_id,org_name,status) VALUES($1,'tenant','park','范围外合成组织','enabled')",[hiddenOrg]);await db.query("INSERT INTO hr_position(id,tenant_id,park_id,org_id,position_code,position_name) VALUES($1,'tenant','park',$2,'HIDDEN','范围外合成岗位')",[hiddenPosition,hiddenOrg]);
  const list=await service.list(scope,{...actor,permissions:[H.HR_POSITION_READ]});assert.ok(list.some(r=>r.id===createdPosition.id));assert.ok(!list.some(r=>r.id===hiddenPosition));assert.ok(!list.some(r=>"legacySourceId" in r));await assert.rejects(service.context(scope,actor,hiddenPosition),/Position not found/);
 }finally{
  for(const runner of runners){if(runner.isTransactionActive)await runner.rollbackTransaction();await runner.release();}
  if(db?.isInitialized)await db.destroy();if(admin.isInitialized){if(created){await admin.query(`DROP DATABASE ${name}`);assert.equal((await admin.query("SELECT count(*)::int n FROM pg_database WHERE datname=$1",[name]))[0].n,0);}await admin.destroy();}
 }
});
