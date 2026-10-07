import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { DataSource } from "typeorm";
import { HR_PERMISSIONS } from "@jinhu/shared";
import { HrOnboardingService } from "./hr-onboarding.service";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import type { SaveHrOnboardingApplicationDto } from "./dto/hr-onboarding.dto";

test("approved rehiring preserves the employee and historical evidence in real PostgreSQL", { skip: process.env.HR_ONBOARDING_REHIRE_PG_REQUIRED !== "1", timeout: 60_000 }, async t => {
 assert.equal(process.env.POSTGRES_HOST,"127.0.0.1");
 assert.ok([55491,55498].includes(Number(process.env.POSTGRES_PORT)));
 assert.equal(process.env.POSTGRES_DB,"postgres");
 const schema=`hr_rehire_${randomUUID().replaceAll("-","")}`;
 const db=new DataSource({type:"postgres",host:process.env.POSTGRES_HOST,port:Number(process.env.POSTGRES_PORT),database:"postgres",username:process.env.POSTGRES_USER,password:process.env.POSTGRES_PASSWORD,extra:{options:`-c search_path=${schema},public`}});
 await db.initialize();
 const scope={tenantId:"synthetic-tenant",parkId:"synthetic-park"},makerId=randomUUID(),reviewerId=randomUUID(),orgId=randomUUID(),positionId=randomUUID();
 const actor:JwtPrincipal={sub:makerId,username:"synthetic-hr",...scope,roles:[],permissions:[HR_PERMISSIONS.HR_EMPLOYEE_MANAGE,HR_PERMISSIONS.HR_EMPLOYMENT_TRANSITION]};
 const reviewer={...actor,sub:reviewerId};
 const service=new HrOnboardingService(db);
 try{
  await db.query(`CREATE SCHEMA "${schema}"`);
  await db.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public`);
  await db.query(`CREATE TABLE sys_user(id uuid PRIMARY KEY,tenant_id varchar(64),park_id varchar(64),status text DEFAULT 'enabled',UNIQUE(tenant_id,park_id,id));
   CREATE TABLE sys_org(id uuid PRIMARY KEY,tenant_id varchar(64),park_id varchar(64),org_name text DEFAULT 'Synthetic department',status text DEFAULT 'enabled',is_deleted boolean DEFAULT false,UNIQUE(tenant_id,park_id,id));
   CREATE TABLE hr_position(id uuid PRIMARY KEY,tenant_id varchar(64),park_id varchar(64),org_id uuid,position_name text DEFAULT 'Synthetic position',status text DEFAULT 'enabled',is_deleted boolean DEFAULT false,UNIQUE(tenant_id,park_id,id));
   CREATE TABLE hr_candidate(id uuid PRIMARY KEY,tenant_id varchar(64),park_id varchar(64),converted_employee_id uuid,stage text,is_deleted boolean DEFAULT false,UNIQUE(tenant_id,park_id,id));
   CREATE TABLE hr_employee(id uuid PRIMARY KEY,tenant_id varchar(64),park_id varchar(64),employee_code text,full_name text,employment_status text,primary_org_id uuid,position_id uuid,manager_employee_id uuid,user_id uuid,hire_date date,departure_date date,probation_end_date date,version integer DEFAULT 1,is_deleted boolean DEFAULT false,update_by uuid,update_time timestamptz,UNIQUE(tenant_id,park_id,id));
   CREATE TABLE hr_employment_event(id uuid DEFAULT uuid_generate_v4(),tenant_id varchar(64),park_id varchar(64),employee_id uuid,event_type text,effective_date date,before_snapshot jsonb,after_snapshot jsonb,reason text,status text,create_by uuid,update_by uuid);
   CREATE TABLE hr_contract(id uuid PRIMARY KEY,employee_id uuid,status text);
   CREATE TABLE hr_payroll_run(id uuid PRIMARY KEY,status text);`);
  for(const file of ["000269_hr_onboarding_application_parity.sql","000345_hr_onboarding_rehire_continuity.sql"]){const sql=readFileSync(resolve(__dirname,"../../../../../database/migrations",file),"utf8").replace(/^BEGIN;\s*/,"").replace(/COMMIT;\s*$/,"");await db.transaction(m=>m.query(sql));}
  await db.query(`INSERT INTO sys_user(id,tenant_id,park_id) VALUES($1,$3,$4),($2,$3,$4)`,[makerId,reviewerId,scope.tenantId,scope.parkId]);
  await db.query(`INSERT INTO sys_org(id,tenant_id,park_id) VALUES($1,$2,$3)`,[orgId,scope.tenantId,scope.parkId]);
  await db.query(`INSERT INTO hr_position(id,tenant_id,park_id,org_id) VALUES($1,$2,$3,$4)`,[positionId,scope.tenantId,scope.parkId,orgId]);
  const employee=async(status="departed",departure:string|null="2026-01-01")=>{const id=randomUUID();await db.query(`INSERT INTO hr_employee(id,tenant_id,park_id,employee_code,full_name,employment_status,primary_org_id,position_id,manager_employee_id,user_id,hire_date,departure_date) VALUES($1,$2,$3,$4,'Synthetic employee',$5,$6,$7,$8,$9,'2020-01-01',$10)`,[id,scope.tenantId,scope.parkId,`SYN-${id}`,status,orgId,positionId,randomUUID(),makerId,departure]);return id;};
  const dto=(id:string,extra:Partial<SaveHrOnboardingApplicationDto>={}):SaveHrOnboardingApplicationDto=>({entryType:"rehire",expectedEmployeeVersion:1,targetOrgId:orgId,targetPositionId:positionId,targetManagerEmployeeId:null,employeeId:id,applicationName:"Synthetic rehire",applicationDate:"2026-02-01",plannedHireDate:"2026-02-02",probationMonths:0,attendanceCardNo:String(Math.floor(Math.random()*1e12)),...extra});
  const approved=async(id:string,extra:Partial<SaveHrOnboardingApplicationDto>={})=>{const app=await service.create(scope,actor,dto(id,extra));await service.act(scope,actor,app.id,{action:"submit"});await service.review(scope,reviewer,app.id,{action:"approve"});return app;};
  await t.test("rehire options are scoped, searchable and paginated without unrelated private fields",async()=>{
   const departed=await employee(),manager=await employee("active",null);
   const base={page:1,page_size:1,kind:"employee" as const};
   const found=await service.rehireOptions(scope,actor,{...base,employeeId:departed});assert.equal(found.total,1);assert.equal(found.items[0].id,departed);assert.equal(found.items[0].version,1);
   assert.equal(found.orgs[0].id,orgId);assert.equal(found.positions[0].id,positionId);assert.equal(found.items[0].user_id,undefined);
   const foreign=await service.rehireOptions({...scope,parkId:"foreign"},actor,base);assert.equal(foreign.total,0);assert.deepEqual(foreign.orgs,[]);
   const managers=await service.rehireOptions(scope,actor,{...base,kind:"manager",keyword:`SYN-${manager}`});assert.equal(managers.total,1);assert.equal(managers.items[0].id,manager);
   await assert.rejects(service.rehireOptions(scope,{...actor,permissions:[]},base),/Rehire requires employee management/);
   await employee();const page=await service.rehireOptions(scope,actor,{...base,page:2});assert.equal(page.items.length,1);assert.ok(page.total>=2);
  });
  await t.test("the same employee returns through approval; old dates and assignment survive as event evidence",async()=>{
   const id=await employee();await db.query(`INSERT INTO hr_contract VALUES($1,$2,'expired')`,[randomUUID(),id]);
   const app=await service.create(scope,actor,dto(id));
   const listed=await service.list(scope,{page:1,page_size:20,entryType:"rehire",employeeId:id});
   assert.equal(listed.total,1);assert.equal(listed.items[0].targetOrgName,"Synthetic department");assert.equal(listed.items[0].targetPositionName,"Synthetic position");assert.equal(listed.items[0].applicantUserId,makerId);assert.equal(listed.items[0].applicationDate,"2026-02-01");
   await assert.rejects(service.confirm(scope,actor,app.id),/Only approved/);
   await service.act(scope,actor,app.id,{action:"submit"});
   await assert.rejects(service.review(scope,actor,app.id,{action:"approve"}),/Applicants cannot review/);
   await service.review(scope,reviewer,app.id,{action:"approve"});
   const results=await Promise.allSettled([service.confirm(scope,actor,app.id),service.confirm(scope,actor,app.id)]);
   assert.equal(results.filter(x=>x.status==="fulfilled").length,1,results.map(x=>x.status==="rejected"?String(x.reason):"ok").join(" | "));
   const rows=await db.query(`SELECT id,employment_status,hire_date::text,departure_date,manager_employee_id,user_id,version FROM hr_employee WHERE id=$1`,[id]);
   assert.deepEqual(rows[0],{id,employment_status:"active",hire_date:"2026-02-02",departure_date:null,manager_employee_id:null,user_id:makerId,version:2});
   const events=await db.query(`SELECT * FROM hr_employment_event WHERE employee_id=$1`,[id]);assert.equal(events.length,1);
   assert.equal(events[0].before_snapshot.hire_date,"2020-01-01");assert.equal(events[0].before_snapshot.departure_date,"2026-01-01");assert.ok(events[0].before_snapshot.manager_employee_id);
   assert.equal(events[0].after_snapshot.id,id);assert.equal(events[0].event_type,"confirm_employment");assert.match(events[0].reason,/回聘申请/);
   assert.deepEqual(await db.query(`SELECT status FROM hr_contract WHERE employee_id=$1`,[id]),[{status:"expired"}]);
   assert.equal((await db.query(`SELECT count(*)::int n FROM hr_payroll_run`))[0].n,0);
   assert.equal((await db.query(`SELECT count(*)::int n FROM sys_user`))[0].n,2);
   await assert.rejects(db.query(`UPDATE hr_onboarding_application SET remark='tampered' WHERE id=$1`,[app.id]),/TERMINAL_IMMUTABLE/);
   await assert.rejects(db.query(`DELETE FROM hr_onboarding_application_action WHERE application_id=$1`,[app.id]),/append-only/);
   // A completed cycle cannot block a later employment cycle of the same person.
   await db.query(`UPDATE hr_employee SET employment_status='departed',departure_date='2026-03-01',version=version+1 WHERE id=$1`,[id]);
   const again=await service.create(scope,actor,dto(id,{expectedEmployeeVersion:3,applicationDate:"2026-03-02",plannedHireDate:"2026-03-03"}));assert.notEqual(again.id,app.id);
  });
  await t.test("state, scope, authority, strict dates, target relationships and duplicate active applications are enforced",async()=>{
   const id=await employee();
   await assert.rejects(service.create(scope,{...actor,permissions:[]},dto(id)),/Rehire requires employee management/);
   await assert.rejects(service.create({...scope,parkId:"foreign"},actor,dto(id)),/Employee not found/);
   await assert.rejects(service.create(scope,actor,dto(await employee("active"))),/departed employee/);
   await assert.rejects(service.create(scope,actor,dto(id,{expectedEmployeeVersion:2})),/refresh and resubmit/);
   await assert.rejects(service.create(scope,actor,dto(id,{targetOrgId:randomUUID()})),/outside the current scope/);
   await assert.rejects(service.create(scope,actor,dto(id,{applicationDate:"2026-02-30"})),/valid calendar dates/);
   await assert.rejects(service.create(scope,actor,dto(id,{applicationDate:"2025-01-01",plannedHireDate:"2026-01-01"})),/after the previous departure/);
   await assert.rejects(service.create(scope,actor,dto(id,{targetManagerEmployeeId:id})),/manager is unavailable/);
   await assert.rejects(service.create(scope,actor,dto(id,{targetManagerEmployeeId:undefined})),/Choose a rehire manager/);
   const app=await service.create(scope,actor,dto(id));await assert.rejects(service.create(scope,actor,dto(id)),/already exists/);
   await service.act(scope,actor,app.id,{action:"submit"});
   await assert.rejects(db.query(`UPDATE hr_onboarding_application SET expected_employee_version=9,status='approved',reviewed_by=$2,reviewed_at=now() WHERE id=$1`,[app.id,reviewerId]),/REHIRE_SUBMITTED_FIELDS_IMMUTABLE/);
   await assert.rejects(db.query(`UPDATE hr_onboarding_application SET entry_type='initial',status='approved',reviewed_by=$2,reviewed_at=now() WHERE id=$1`,[app.id,reviewerId]),/ENTRY_TYPE_IMMUTABLE/);
  });
  await t.test("a stale approved request cannot change an employee and can be cancelled before a fresh request",async()=>{
   const id=await employee(),app=await approved(id);
   await db.query(`UPDATE hr_employee SET version=version+1 WHERE id=$1`,[id]);
   await assert.rejects(service.confirm(scope,actor,app.id),/refresh and resubmit/);
   assert.equal((await db.query(`SELECT count(*)::int n FROM hr_employment_event WHERE employee_id=$1`,[id]))[0].n,0);
   await service.act(scope,actor,app.id,{action:"cancel"});
   const fresh=await service.create(scope,actor,dto(id,{expectedEmployeeVersion:2}));assert.equal(fresh.status,"draft");
  });
  await t.test("future confirmation is refused; missing historical departure date does not bar formal rehiring",async()=>{
   const app=await approved(await employee(),{applicationDate:"2099-01-01",plannedHireDate:"2099-01-02"});await assert.rejects(service.confirm(scope,actor,app.id),/before the planned hire date/);
   const undated=await approved(await employee("departed",null));assert.equal((await service.confirm(scope,actor,undated.id)).status,"confirmed");
  });
  await t.test("an explicitly chosen current manager is applied, and returned drafts can refresh a changed employee",async()=>{
   const manager=await employee("active",null),id=await employee(),app=await service.create(scope,actor,dto(id,{targetManagerEmployeeId:manager}));
   await service.act(scope,actor,app.id,{action:"submit"});await service.review(scope,reviewer,app.id,{action:"return",comment:"Refresh assignment"});
   await db.query(`UPDATE hr_employee SET version=version+1 WHERE id=$1`,[id]);
   await service.update(scope,actor,app.id,dto(id,{expectedEmployeeVersion:2,targetManagerEmployeeId:manager}));
   await service.act(scope,actor,app.id,{action:"submit"});await service.review(scope,reviewer,app.id,{action:"approve"});await service.confirm(scope,actor,app.id);
   assert.equal((await db.query(`SELECT manager_employee_id FROM hr_employee WHERE id=$1`,[id]))[0].manager_employee_id,manager);
  });
  await t.test("initial onboarding still supports preboarding without any rehire fields",async()=>{
   const id=await employee("preboarding",null);const d=dto(id,{entryType:"initial",expectedEmployeeVersion:undefined,targetOrgId:undefined,targetPositionId:undefined,targetManagerEmployeeId:undefined,probationMonths:3});
   const app=await service.create(scope,actor,d);await service.act(scope,actor,app.id,{action:"submit"});await service.review(scope,reviewer,app.id,{action:"approve"});await service.confirm(scope,actor,app.id);
   assert.equal((await db.query(`SELECT employment_status FROM hr_employee WHERE id=$1`,[id]))[0].employment_status,"probation");
   assert.equal((await service.list(scope,{page:1,page_size:20,entryType:"rehire",employeeId:id})).total,0);
  });
  await t.test("a final action insertion failure also rolls back every confirmation effect",async()=>{
   const id=await employee(),app=await approved(id);
   await db.query(`ALTER TABLE hr_onboarding_application_action ADD CONSTRAINT synthetic_rehire_action_failure CHECK(NOT(application_id='${app.id}'::uuid AND action='confirmed'))`);
   await assert.rejects(service.confirm(scope,actor,app.id));
   assert.deepEqual((await db.query(`SELECT employment_status,version FROM hr_employee WHERE id=$1`,[id]))[0],{employment_status:"departed",version:1});
   assert.equal((await db.query(`SELECT status FROM hr_onboarding_application WHERE id=$1`,[app.id]))[0].status,"approved");
   assert.equal((await db.query(`SELECT count(*)::int n FROM hr_employment_event WHERE employee_id=$1`,[id]))[0].n,0);
  });
  await t.test("a late event failure rolls back the employee, application and action history",async()=>{
   const id=await employee(),app=await approved(id);
   await db.query(`ALTER TABLE hr_employment_event ADD CONSTRAINT synthetic_rehire_event_failure CHECK(employee_id <> '${id}'::uuid)`);
   await assert.rejects(service.confirm(scope,actor,app.id));
   const e=(await db.query(`SELECT employment_status,version FROM hr_employee WHERE id=$1`,[id]))[0];assert.deepEqual(e,{employment_status:"departed",version:1});
   assert.equal((await db.query(`SELECT status FROM hr_onboarding_application WHERE id=$1`,[app.id]))[0].status,"approved");
   assert.equal((await db.query(`SELECT count(*)::int n FROM hr_onboarding_application_action WHERE application_id=$1 AND action='confirmed'`,[app.id]))[0].n,0);
  });
 }finally{await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await db.destroy();}
});
