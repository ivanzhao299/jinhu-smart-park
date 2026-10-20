import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID as uuid } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { HR_PERMISSIONS as P } from "@jinhu/shared";
import { DataSource } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import type { IdentityScopePort } from "../../runtime/identity-scope.port";
import { UserMessageEntity } from "../workflow/entities/user-message.entity";
import { HrNotificationService } from "./hr-notification.service";
import { HrEmployeeReminderService } from "./hr-employee-reminder.service";
import type { HrEmployeeReminderGenerateDto } from "./dto/hr-employee-reminder.dto";

// Explicit opt-in, owned random schema, synthetic facts only. No shared table resets.
test("employee date reminders isolated PostgreSQL transaction and current scope gate",{skip:process.env.HR_EMPLOYEE_REMINDER_PG_REQUIRED!=="1",timeout:120_000},async t=>{
 assert.equal(process.env.POSTGRES_HOST,"127.0.0.1");
 assert.ok(Number(process.env.POSTGRES_PORT)>1024&&Number(process.env.POSTGRES_PORT)!==5432,"explicit isolated non-default port required");
 assert.equal(process.env.POSTGRES_DB,"postgres");
 const schema=`hr_date_reminder_${uuid().replaceAll("-","")}`;
 const db=new DataSource({type:"postgres",host:process.env.POSTGRES_HOST,port:Number(process.env.POSTGRES_PORT),database:process.env.POSTGRES_DB,username:process.env.POSTGRES_USER,password:process.env.POSTGRES_PASSWORD,schema,uuidExtension:"pgcrypto",installExtensions:false,entities:[UserMessageEntity],extra:{options:`-c search_path=${schema},public`,max:8}});
 await db.initialize();
 try{
  await db.query(`CREATE SCHEMA "${schema}"`);await db.synchronize();
  await db.query(`
   CREATE FUNCTION "${schema}".uuid_generate_v4() RETURNS uuid LANGUAGE sql AS 'SELECT gen_random_uuid()';
   CREATE TABLE sys_user(id uuid PRIMARY KEY,tenant_id varchar(64),park_id varchar(64),username text,display_name text,is_enabled boolean DEFAULT true,status text DEFAULT 'enabled',is_deleted boolean DEFAULT false,UNIQUE(tenant_id,park_id,id));
   CREATE TABLE sys_role(id uuid PRIMARY KEY,tenant_id varchar(64),park_id varchar(64),code text,role_scope text DEFAULT 'park',is_enabled boolean DEFAULT true,status text DEFAULT 'enabled',is_deleted boolean DEFAULT false);
   CREATE TABLE sys_permission(id uuid PRIMARY KEY,tenant_id varchar(64),park_id varchar(64),code text,is_enabled boolean DEFAULT true,status text DEFAULT 'enabled',is_deleted boolean DEFAULT false);
   CREATE TABLE rel_user_role(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id varchar(64),park_id varchar(64),user_id uuid,role_id uuid,is_deleted boolean DEFAULT false);
   CREATE TABLE rel_role_perm(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id varchar(64),park_id varchar(64),role_id uuid,permission_id uuid,is_deleted boolean DEFAULT false);
   CREATE TABLE sys_org(id uuid PRIMARY KEY,tenant_id varchar(64),park_id varchar(64),parent_id uuid,leader_user_id uuid,status text DEFAULT 'enabled',is_deleted boolean DEFAULT false);
   CREATE TABLE hr_employee(id uuid PRIMARY KEY,tenant_id varchar(64),park_id varchar(64),user_id uuid,manager_employee_id uuid,primary_org_id uuid,employee_code text DEFAULT 'SYNTHETIC-EMP',full_name text DEFAULT 'Synthetic private name',employment_status text DEFAULT 'active',hire_date date,is_deleted boolean DEFAULT false,version integer DEFAULT 1,UNIQUE(tenant_id,park_id,id));
   CREATE TABLE hr_employee_profile(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id varchar(64),park_id varchar(64),employee_id uuid,date_of_birth date,is_deleted boolean DEFAULT false,version integer DEFAULT 1);
   CREATE TABLE sys_tenant(id uuid PRIMARY KEY,tenant_id varchar(64),status integer DEFAULT 1,is_deleted boolean DEFAULT false,expire_time timestamptz);
   CREATE TABLE sys_business_scope(id uuid PRIMARY KEY,tenant_id varchar(64),tenant_row_id uuid,scope_key varchar(64),scope_kind text DEFAULT 'enterprise',status text DEFAULT 'enabled',is_deleted boolean DEFAULT false);
   CREATE TABLE sys_user_business_scope_membership(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id varchar(64),scope_id uuid,user_id uuid,status text DEFAULT 'enabled',is_deleted boolean DEFAULT false);
  `);
  const root=process.cwd().endsWith("/apps/api")?resolve(process.cwd(),"../.."):process.cwd();
  const migrationRunner=db.createQueryRunner();await migrationRunner.connect();
  try{await migrationRunner.query(readFileSync(resolve(root,"database/migrations/000382_hr_employee_date_reminders.sql"),"utf8"));}
  catch(error){await migrationRunner.query("ROLLBACK");throw error;}
  finally{await migrationRunner.release();}
  const messages=db.getRepository(UserMessageEntity),notifications=new HrNotificationService(messages);
  let auditFails=false;const auditEvents:unknown[]=[];
  const audit={recordOperationRequired:async(input:unknown)=>{if(auditFails)throw new Error("synthetic required audit unavailable");auditEvents.push(input);}};
  const service=new HrEmployeeReminderService(db,audit as never,notifications,messages,{} as IdentityScopePort);
  const query={page:1,page_size:100};
  const dto:HrEmployeeReminderGenerateDto={kind:"birthday",windowDays:3,leapDayPolicy:"skip",recipients:["hr","manager","employee"],businessDate:"2026-12-30"};
  async function fixture(){
   const s={tenantId:`test-${uuid()}`,parkId:`park-${uuid()}`},scopeId=uuid(),tenantRow=uuid();
   await db.query("INSERT INTO sys_tenant(id,tenant_id) VALUES($1,$2)",[tenantRow,s.tenantId]);
   await db.query("INSERT INTO sys_business_scope(id,tenant_id,tenant_row_id,scope_key) VALUES($1,$2,$3,$4)",[scopeId,s.tenantId,tenantRow,s.parkId]);
   async function user(permissions:string[]):Promise<JwtPrincipal>{
    const id=uuid(),role=uuid();
    await db.query("INSERT INTO sys_user(id,tenant_id,park_id,username) VALUES($1,$2,$3,$4)",[id,s.tenantId,s.parkId,`synthetic-${id}`]);
    await db.query("INSERT INTO sys_user_business_scope_membership(tenant_id,scope_id,user_id) VALUES($1,$2,$3)",[s.tenantId,scopeId,id]);
    await db.query("INSERT INTO sys_role(id,tenant_id,park_id,code) VALUES($1,$2,$3,'CUSTOM_NARROW_DATE_ROLE')",[role,s.tenantId,s.parkId]);
    await db.query("INSERT INTO rel_user_role(tenant_id,park_id,user_id,role_id) VALUES($1,$2,$3,$4)",[s.tenantId,s.parkId,id,role]);
    for(const permission of permissions){const p=uuid();await db.query("INSERT INTO sys_permission(id,tenant_id,park_id,code) VALUES($1,$2,$3,$4)",[p,s.tenantId,s.parkId,permission]);await db.query("INSERT INTO rel_role_perm(tenant_id,park_id,role_id,permission_id) VALUES($1,$2,$3,$4)",[s.tenantId,s.parkId,role,p]);}
    return {...s,sub:id,username:`synthetic-${id}`,roles:["CUSTOM_NARROW_DATE_ROLE"],permissions};
   }
   const hr=await user([P.HR_EMPLOYEE_REMINDER_PARK_READ,P.HR_EMPLOYEE_REMINDER_RUN,P.HR_EMPLOYEE_REMINDER_MANAGE,P.HR_EMPLOYEE_REMINDER_ACK]);
   const manager=await user([P.HR_EMPLOYEE_REMINDER_TEAM_READ,P.HR_EMPLOYEE_REMINDER_ACK]);
   const self=await user([P.HR_EMPLOYEE_REMINDER_SELF_READ,P.HR_EMPLOYEE_REMINDER_ACK]);
   const outside=await user([P.HR_EMPLOYEE_REMINDER_SELF_READ,P.HR_EMPLOYEE_REMINDER_ACK]);
   const unbound=await user([P.HR_EMPLOYEE_REMINDER_SELF_READ,P.HR_EMPLOYEE_REMINDER_ACK]);
   const org=uuid(),childOrg=uuid(),outsideOrg=uuid(),managerEmployee=uuid(),employee=uuid(),outsider=uuid();
   await db.query("INSERT INTO sys_org(id,tenant_id,park_id,parent_id,leader_user_id) VALUES($1,$2,$3,NULL,$4),($5,$2,$3,$1,NULL),($6,$2,$3,NULL,NULL)",[org,s.tenantId,s.parkId,manager.sub,childOrg,outsideOrg]);
   await db.query("INSERT INTO hr_employee(id,tenant_id,park_id,user_id,primary_org_id,manager_employee_id,hire_date) VALUES($1,$2,$3,$4,$5,NULL,NULL),($6,$2,$3,$7,$8,$1,'2020-12-31'),($9,$2,$3,$10,$11,NULL,'2020-12-31')",[managerEmployee,s.tenantId,s.parkId,manager.sub,org,employee,self.sub,childOrg,outsider,outside.sub,outsideOrg]);
   await db.query("INSERT INTO hr_employee_profile(tenant_id,park_id,employee_id,date_of_birth) VALUES($1,$2,$3,'1990-12-31'),($1,$2,$4,'1991-12-31')",[s.tenantId,s.parkId,employee,outsider]);
   return {s,hr,manager,self,outside,unbound,employee,outsider,managerEmployee,org,childOrg,outsideOrg,scopeId,user};
  }
  type Fixture=Awaited<ReturnType<typeof fixture>>;
  async function reminder(f:Fixture,recipient=f.self.sub,employee=f.employee){const rows=await db.query("SELECT * FROM hr_employee_date_reminder WHERE tenant_id=$1 AND park_id=$2 AND employee_id=$3 AND recipient_user_id=$4 ORDER BY create_time,id",[f.s.tenantId,f.s.parkId,employee,recipient]);assert.equal(rows.length,1);return rows[0] as {id:string;status:string};}
  async function count(f:Fixture,table:"hr_employee_date_reminder"|"hr_employee_date_reminder_action"|"biz_user_message"){return Number((await db.query(`SELECT count(*)::int n FROM ${table} WHERE tenant_id=$1 AND park_id=$2`,[f.s.tenantId,f.s.parkId]))[0].n);}

  await t.test("real date columns preserve cross-year bounds, leap policies and first anniversary",async()=>{
   const f=await fixture();await db.query("UPDATE hr_employee_profile SET date_of_birth=CASE WHEN employee_id=$1 THEN '1990-01-01'::date ELSE '1990-12-30'::date END WHERE tenant_id=$2",[f.employee,f.s.tenantId]);
   assert.equal((await service.preview(f.s,f.hr,{...dto,windowDays:2})).matched,2);
   assert.equal((await service.preview(f.s,f.hr,{...dto,windowDays:1})).matched,1);
   assert.equal((await service.preview(f.s,f.hr,{...dto,windowDays:0})).matched,1);
   await db.query("UPDATE hr_employee_profile SET date_of_birth=CASE WHEN employee_id=$1 THEN '2024-02-29'::date ELSE NULL END WHERE tenant_id=$2",[f.employee,f.s.tenantId]);
   await db.query("UPDATE hr_employee SET hire_date=CASE WHEN id=$1 THEN '2024-02-29'::date ELSE NULL END WHERE tenant_id=$2",[f.employee,f.s.tenantId]);
   for(const kind of ["birthday","hire_anniversary"] as const)for(const [leapDayPolicy,businessDate,matched] of [["skip","2025-02-28",0],["feb_28","2025-02-28",1],["mar_1","2025-03-01",1],["skip","2028-02-29",1]] as const){assert.equal((await service.preview(f.s,f.hr,{...dto,kind,leapDayPolicy,businessDate,windowDays:0})).matched,matched,`${kind}/${leapDayPolicy}/${businessDate}`);}
   await db.query("UPDATE hr_employee SET hire_date='2027-01-01' WHERE id=$1",[f.employee]);
   assert.equal((await service.preview(f.s,f.hr,{...dto,kind:"hire_anniversary",businessDate:"2027-01-01",windowDays:0})).matched,0);
  });
  await t.test("custom narrow roles, concurrent generation, retries and changed windows dedupe messages and reminders",async()=>{
   const f=await fixture(),runs=await Promise.all([service.generate(f.s,f.hr,dto),service.generate(f.s,f.hr,dto)]);assert.equal(runs.reduce((n,r)=>n+r.created,0),5);
   assert.equal((await service.generate(f.s,f.hr,{...dto,windowDays:7})).created,0);assert.equal(await count(f,"hr_employee_date_reminder"),5);assert.equal(await count(f,"biz_user_message"),5);
   for(const row of await messages.findBy(f.s)){assert.equal(row.sourceType,"hr_employee_date_reminder");assert.equal(row.targetUrl,`/hr/employee-reminders?reminder=${row.sourceId}`);assert.doesNotMatch(JSON.stringify({content:row.content,payload:row.payload,title:row.title}),/1990|1991|Synthetic private|source_date|dateOfBirth|fullName/);}
  });
  await t.test("enterprise recipients retain cross-home identity and tenant-wide permission storage",async()=>{
   for(const tenantRole of [false,true]){const f=await fixture(),home=`home-${uuid()}`;
    await db.query("UPDATE sys_user SET park_id=$2 WHERE tenant_id=$1",[f.s.tenantId,home]);
    await db.query("UPDATE sys_permission SET park_id=$2 WHERE tenant_id=$1",[f.s.tenantId,home]);
    if(tenantRole)await db.query("UPDATE sys_role SET role_scope='tenant',park_id=$2 WHERE tenant_id=$1",[f.s.tenantId,home]);
    assert.equal((await service.generate(f.s,f.hr,dto)).created,5,tenantRole?"tenant role":"park role with tenant permission");
    const row=await reminder(f);assert.equal((await service.detail(f.s,f.self,row.id)).status,"open");
    await service.action(f.s,f.self,row.id,{action:"acknowledge"});assert.equal((await reminder(f)).status,"acknowledged");
   }
  });
  await t.test("HR downgrade to self cannot expose former recipients' other-employee history",async()=>{
   const f=await fixture();await service.generate(f.s,f.hr,dto);const old=await reminder(f,f.hr.sub);
   await db.query("UPDATE sys_permission SET code=$2 WHERE tenant_id=$1",[f.s.tenantId,P.HR_EMPLOYEE_REMINDER_SELF_READ]);
   const downgraded={...f.hr,permissions:[P.HR_EMPLOYEE_REMINDER_SELF_READ]};
   assert.equal((await service.list(f.s,downgraded,query)).total,0,"unbound former HR must not inherit park visibility through old recipient IDs");
   await assert.rejects(service.detail(f.s,downgraded,old.id),/not found/i);
  });
  await t.test("park, recursive team, self, unbound, no-authority and cross-scope direct UUID checks",async()=>{
   const f=await fixture();await service.generate(f.s,f.hr,dto);assert.equal((await service.list(f.s,f.hr,query)).total,5);
   for(const actor of [f.manager,f.self]){const page=await service.list(f.s,actor,query);assert.equal(page.total,1);assert.equal(page.items[0]!.employeeId,f.employee);}
   for(const actor of [f.unbound,{...f.hr,permissions:[]}])assert.equal((await service.list(f.s,actor,query)).total,0);
   const other=await reminder(f,f.outside.sub,f.outsider);
   for(const actor of [f.manager,f.self,f.unbound]){await assert.rejects(service.detail(f.s,actor,other.id),/not found/i);await assert.rejects(service.action(f.s,actor,other.id,{action:"acknowledge"}),/not found/i);}
   for(const s of [{...f.s,tenantId:"foreign"},{...f.s,parkId:"foreign"}])await assert.rejects(service.detail(s,f.hr,other.id),/not found/i);
  });
  await t.test("missing capability, disabled identity and expired membership do not receive new reminders",async()=>{
   for(const mutation of ["permission","user","membership"]){const f=await fixture();
    if(mutation==="permission")await db.query("UPDATE rel_user_role SET is_deleted=true WHERE user_id=$1",[f.self.sub]);
    if(mutation==="user")await db.query("UPDATE sys_user SET is_enabled=false,status='disabled' WHERE id=$1",[f.self.sub]);
    if(mutation==="membership")await db.query("UPDATE sys_user_business_scope_membership SET status='disabled' WHERE user_id=$1",[f.self.sub]);
    await service.generate(f.s,f.hr,{...dto,recipients:["employee"]});assert.equal((await db.query("SELECT id FROM hr_employee_date_reminder WHERE tenant_id=$1 AND recipient_user_id=$2",[f.s.tenantId,f.self.sub])).length,0,mutation);
   }
  });
  await t.test("preview reasons respect the selected recipient capabilities and missing source dates",async()=>{
   const f=await fixture();await db.query("UPDATE rel_user_role SET is_deleted=true WHERE user_id=$1",[f.self.sub]);
   const preview=await service.preview(f.s,f.hr,{...dto,recipients:["employee"]});
   assert.equal(preview.matched,2);assert.equal(preview.missingDate,1);assert.equal(preview.noRecipient,1);
   const result=await service.generate(f.s,f.hr,{...dto,recipients:["employee"]});assert.equal(result.skippedNoRecipient,preview.noRecipient);assert.equal(result.created,1);
  });
  await t.test("actual message constraint failure rolls back both reminder and message inserts",async()=>{
   const f=await fixture();await db.query(`ALTER TABLE biz_user_message ADD CONSTRAINT synthetic_message_failure CHECK(tenant_id <> '${f.s.tenantId}')`);
   try{await assert.rejects(service.generate(f.s,f.hr,dto),/synthetic_message_failure/);assert.equal(await count(f,"hr_employee_date_reminder"),0);assert.equal(await count(f,"biz_user_message"),0);}finally{await db.query("ALTER TABLE biz_user_message DROP CONSTRAINT synthetic_message_failure");}
  });
  await t.test("required audit failure rolls back generated reminders/messages and action state",async()=>{
   const f=await fixture();auditFails=true;
   try{await assert.rejects(service.generate(f.s,f.hr,dto),/audit unavailable/);assert.equal(await count(f,"hr_employee_date_reminder"),0);assert.equal(await count(f,"biz_user_message"),0);}finally{auditFails=false;}
   await service.generate(f.s,f.hr,dto);const row=await reminder(f);auditFails=true;
   try{await assert.rejects(service.action(f.s,f.self,row.id,{action:"acknowledge"}),/audit unavailable/);assert.equal((await reminder(f)).status,"open");assert.equal(await count(f,"hr_employee_date_reminder_action"),0);await assert.rejects(service.detail(f.s,f.self,row.id),/audit unavailable/);}finally{auditFails=false;}
  });
  await t.test("non-date employee/profile version changes preserve both reminder kinds",async()=>{
   for(const kind of ["birthday","hire_anniversary"] as const){const f=await fixture();await service.generate(f.s,f.hr,{...dto,kind});const row=await reminder(f);
    await db.query("UPDATE hr_employee SET version=version+1,full_name='Synthetic updated' WHERE id=$1",[f.employee]);await db.query("UPDATE hr_employee_profile SET version=version+1 WHERE employee_id=$1",[f.employee]);
    assert.equal((await service.detail(f.s,f.self,row.id)).status,"open");assert.equal(await count(f,"hr_employee_date_reminder_action"),0);
   }
  });
  await t.test("changed source/status invalidates only owned recipient history and records real triggering actor",async()=>{
   for(const mutation of ["birthday","hire_anniversary","departed","deleted"]){const f=await fixture(),kind=mutation==="hire_anniversary"?"hire_anniversary":"birthday";await service.generate(f.s,f.hr,{...dto,kind});const row=await reminder(f);
    if(mutation==="birthday")await db.query("UPDATE hr_employee_profile SET date_of_birth='1990-12-29',version=version+1 WHERE employee_id=$1",[f.employee]);
    if(mutation==="hire_anniversary")await db.query("UPDATE hr_employee SET hire_date='2020-12-29',version=version+1 WHERE id=$1",[f.employee]);
    if(mutation==="departed")await db.query("UPDATE hr_employee SET employment_status='departed' WHERE id=$1",[f.employee]);
    if(mutation==="deleted")await db.query("UPDATE hr_employee SET is_deleted=true WHERE id=$1",[f.employee]);
    assert.equal((await service.detail(f.s,f.self,row.id)).status,"cancelled",mutation);assert.equal((await reminder(f,f.hr.sub)).status,"open","self read cannot modify HR recipient history");
    const actions=await db.query("SELECT actor_user_id,action FROM hr_employee_date_reminder_action WHERE reminder_id=$1",[row.id]);assert.equal(actions.length,1);assert.equal(actions[0].actor_user_id,f.self.sub);assert.equal(actions[0].action,"cancel");
    await service.list(f.s,f.hr,query);const hrRow=await reminder(f,f.hr.sub);assert.equal(hrRow.status,"cancelled");assert.equal((await db.query("SELECT actor_user_id FROM hr_employee_date_reminder_action WHERE reminder_id=$1",[hrRow.id]))[0].actor_user_id,f.hr.sub);
   }
  });
  await t.test("changed manager, org, account binding, capability and enterprise membership cancel obsolete recipients",async()=>{
   for(const mutation of ["manager","org","binding","permission","membership"]){const f=await fixture();await service.generate(f.s,f.hr,dto);const isManager=["manager","org"].includes(mutation),target=await reminder(f,isManager?f.manager.sub:f.self.sub);
    if(mutation==="manager")await db.query("UPDATE hr_employee SET manager_employee_id=NULL WHERE id=$1",[f.employee]);
    if(mutation==="org")await db.query("UPDATE hr_employee SET primary_org_id=$2 WHERE id=$1",[f.employee,f.outsideOrg]);
    if(mutation==="binding")await db.query("UPDATE hr_employee SET user_id=NULL WHERE id=$1",[f.employee]);
    if(mutation==="permission")await db.query("UPDATE rel_user_role SET is_deleted=true WHERE user_id=$1",[f.self.sub]);
    if(mutation==="membership")await db.query("UPDATE sys_user_business_scope_membership SET status='disabled' WHERE user_id=$1",[f.self.sub]);
    await service.list(f.s,f.hr,query);assert.equal((await db.query("SELECT status FROM hr_employee_date_reminder WHERE id=$1",[target.id]))[0].status,"cancelled",mutation);
    await assert.rejects(service.action(f.s,isManager?f.manager:f.self,target.id,{action:"acknowledge"}),/not found|not allowed|permission|scope|member/i);
   }
  });
  await t.test("ordered immutable detail actions and resolved history survive later source changes",async()=>{
   const f=await fixture();await service.generate(f.s,f.hr,dto);const row=await reminder(f);
   await service.action(f.s,f.self,row.id,{action:"read"});await service.action(f.s,f.self,row.id,{action:"acknowledge",comment:"Synthetic handling note"});await service.action(f.s,f.hr,row.id,{action:"resolve"});
   const detail=await service.detail(f.s,f.hr,row.id);assert.equal(detail.status,"resolved");const actions=detail.actions as Array<{sequence:number;action:string;actorUserId:string}>;
   assert.deepEqual(actions.map(a=>a.sequence),[1,2,3]);assert.deepEqual(actions.map(a=>a.action),["read","acknowledge","resolve"]);assert.deepEqual(actions.map(a=>a.actorUserId),[f.self.sub,f.self.sub,f.hr.sub]);
   await assert.rejects(service.action(f.s,f.self,row.id,{action:"acknowledge"}),/not allowed/i);await db.query("UPDATE hr_employee_profile SET date_of_birth='1990-12-29' WHERE employee_id=$1",[f.employee]);
   assert.equal((await service.detail(f.s,f.hr,row.id)).status,"resolved");assert.deepEqual((await service.detail(f.s,f.hr,row.id)).actions,detail.actions);
   await assert.rejects(db.query("UPDATE hr_employee_date_reminder_action SET action='cancel' WHERE reminder_id=$1",[row.id]),/immutable|append|forbidden/i);
   await assert.rejects(db.query("DELETE FROM hr_employee_date_reminder_action WHERE reminder_id=$1",[row.id]),/immutable|append|forbidden/i);
  });
  await t.test("own HR message adapter excludes workorders and other recipients without broader permissions",async()=>{
   const f=await fixture();await service.generate(f.s,f.hr,dto);const row=await reminder(f);
   await messages.save(messages.create({...f.s,recipientId:f.self.sub,sourceType:"workorder",bizType:"workorder",sourceId:uuid(),title:"Unrelated",uniqueKey:uuid(),payload:{}}));
   const page=await service.messagesForActor(f.s,f.self,query);assert.equal(page.total,1);assert.equal(page.items[0]!.sourceId,row.id);assert.ok((await service.markMessageRead(f.s,f.self,page.items[0]!.id)).readAt);
   await assert.rejects(service.markMessageRead(f.s,f.outside,page.items[0]!.id),/not found/i);const unrelated=await messages.findOneByOrFail({...f.s,sourceType:"workorder"});await assert.rejects(service.markMessageRead(f.s,f.self,unrelated.id),/not found/i);
   await assert.rejects(service.messagesForActor(f.s,{...f.self,permissions:[]},query),/permission/i);
  });
  assert.ok(auditEvents.length>0);
 }finally{await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await db.destroy();}
});
