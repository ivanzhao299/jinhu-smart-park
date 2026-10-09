import "reflect-metadata";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import test from "node:test";
import {DataSource} from "typeorm";
import {HR_PERMISSIONS as H} from "@jinhu/shared";
import {HrTalentService} from "./hr-talent.service";

test("owned PostgreSQL: complete talent profile history, scoped totals, source projection and snapshot",{skip:process.env.HR_TALENT_PROFILE_PAGE_PG_REQUIRED!=="1"},async()=>{
 if(process.env.POSTGRES_HOST!=="127.0.0.1"||process.env.POSTGRES_PORT!=="15482")throw Error("Talent profile test requires owned loopback15482");
 const connection={type:"postgres" as const,host:"127.0.0.1",port:15482,username:"postgres"};
 const name=`hr_talent_profile_lab_${randomUUID().replaceAll("-","")}`,admin=new DataSource({...connection,database:"postgres"});let db:DataSource|undefined,created=false;
 try{
  await admin.initialize();await admin.query(`CREATE DATABASE ${name}`);created=true;db=new DataSource({...connection,database:name});await db.initialize();assert.equal((await db.query("SELECT current_database() name"))[0].name,name);
  // Projection fixture only, not production migrations or HR lifecycle acceptance.
  await db.query("CREATE TABLE sys_org(id uuid PRIMARY KEY,parent_id uuid,tenant_id text,park_id text,leader_user_id uuid,is_deleted boolean,status text)");
  await db.query("CREATE TABLE hr_employee(id uuid PRIMARY KEY,tenant_id text,park_id text,employee_code text,full_name text,employment_status text,is_deleted boolean,primary_org_id uuid,user_id uuid,work_mobile text)");
  await db.query("CREATE TABLE hr_talent_profile_snapshot(id uuid PRIMARY KEY,tenant_id text,park_id text,employee_id uuid,snapshot_no int,as_of_date date,performance_source jsonb,feedback_source jsonb,created_at timestamptz)");
  const leader=randomUUID(),root=randomUUID(),child=randomUUID(),other=randomUUID(),user=randomUUID(),own=randomUUID(),outside=randomUUID(),literal=randomUUID(),foreignEmployee=randomUUID();
  await db.query("INSERT INTO sys_org VALUES($1,null,'tenant','park',$4,false,'enabled'),($2,$1,'tenant','park',null,false,'enabled'),($3,null,'tenant','park',null,false,'enabled')",[root,child,other,leader]);
  await db.query("INSERT INTO hr_employee VALUES($1,'tenant','park','SYN-601','合成人员601','departed',true,$5,$8,'excluded'),($2,'tenant','park','SYN-OTHER','合成人员2','active',false,$6,null,'excluded'),($3,'tenant','park','LITERAL','A_%\\','active',false,$7,null,'excluded'),($4,'foreign','foreign','FOREIGN','Foreign','active',false,$7,null,'excluded')",[own,outside,literal,foreignEmployee,child,other,root,user]);
  await db.query("INSERT INTO hr_talent_profile_snapshot SELECT md5('profile-'||n)::uuid,'tenant','park',$1,n,'2026-09-01','{\"id\":\"hidden-performance\",\"finalLevelCode\":\"A\"}'::jsonb,'{\"subjectId\":\"hidden-subject\",\"cycleName\":\"合成周期\"}'::jsonb,'2026-10-01T00:00:00Z' FROM generate_series(1,600) n",[outside]);
  const insert=async(id:string,e=own,tenant="tenant",park="park",snapshot=1)=>db!.query("INSERT INTO hr_talent_profile_snapshot VALUES($1,$2,$3,$4,$5,'2026-08-01','{\"id\":\"hidden-performance\",\"finalLevelCode\":\"B\"}','{\"subjectId\":\"hidden-subject\",\"cycleName\":\"合成历史\"}','2026-09-01T00:00:00Z')",[id,tenant,park,e,snapshot]);
  await insert(randomUUID());await insert(randomUUID(),own,"tenant","park",2);await insert(randomUUID(),literal);await insert(randomUUID(),foreignEmployee,"foreign","foreign");await insert(randomUUID(),own,"foreign","park");await insert(randomUUID(),own,"tenant","foreign");await insert(randomUUID(),foreignEmployee);
  const scope={tenantId:"tenant",parkId:"park"},actor=(sub=leader,permissions:string[]=[H.HR_TALENT_READ])=>({...scope,sub,username:"synthetic",roles:[],permissions});const audits:unknown[]=[],audit={recordOperationRequired:async(event:unknown)=>{audits.push(event);}};const service=new HrTalentService(db,audit as never,{} as never);
  const seen=new Set<string>();for(let page=1;page<=31;page++){
   const value=await service.profilePage(scope,actor(),{page,page_size:20});assert.equal(value.total,603);assert.equal(value.employeeCount,3);
   for(const row of value.items){assert.ok(!seen.has(String(row.id)));seen.add(String(row.id));assert.deepEqual(Object.keys(row).sort(),["asOfDate","createdAt","employeeCode","employeeName","feedbackSource","id","performanceSource","snapshotNo"]);assert.ok(!JSON.stringify(row).includes("hidden-"));assert.notEqual(row.employeeCode,"FOREIGN");}
  }assert.equal(seen.size,603);
  const first=await service.profilePage(scope,actor(),{page:1,page_size:20});const again=await service.profilePage(scope,actor(),{page:1,page_size:20});assert.deepEqual(first.items.map(row=>row.id),again.items.map(row=>row.id));
  const tail=await service.profilePage(scope,actor(),{page:31,page_size:20});assert.equal(tail.items.length,3);assert.ok(tail.items.some(row=>row.employeeCode==="SYN-601"));const empty=await service.profilePage(scope,actor(),{page:999,page_size:20});assert.equal(empty.total,603);assert.equal(empty.employeeCount,3);assert.deepEqual(empty.items,[]);
  const exact=await service.profilePage(scope,actor(),{page:1,page_size:20,keyword:"SYN-601"});assert.equal(exact.total,2);assert.equal(exact.employeeCount,1);const old=await service.profiles(scope,actor(),{employeeId:own});assert.deepEqual(exact.items,old.sort((a:{id:string},b:{id:string})=>b.id.localeCompare(a.id)));
  for(const keyword of ["A_%\\","%","_"]){const value=await service.profilePage(scope,actor(),{page:1,page_size:20,keyword});assert.equal(value.total,1);assert.equal(value.items[0]?.employeeCode,"LITERAL");}
  const team=await service.profilePage(scope,actor(leader,[H.HR_TALENT_TEAM_READ]),{page:1,page_size:20});assert.equal(team.total,3);assert.equal(team.employeeCount,2);
  const self=await service.profilePage(scope,actor(user,[H.HR_TALENT_SELF_READ]),{page:1,page_size:20});assert.equal(self.total,2);assert.equal(self.employeeCount,1);
  const wrongId=await service.profilePage(scope,actor(user,[H.HR_TALENT_SELF_READ]),{page:1,page_size:20,employeeId:outside});assert.equal(wrongId.total,0);assert.deepEqual(wrongId.items,[]);
  const unmanaged=await service.profilePage(scope,actor(randomUUID(),[H.HR_TALENT_TEAM_READ]),{page:1,page_size:20});assert.equal(unmanaged.total,0);
  const failing=new HrTalentService(db,{recordOperationRequired:async()=>{throw Error("required audit failure");}} as never,{} as never);await assert.rejects(failing.profilePage(scope,actor(),{page:1,page_size:20}),/required audit failure/);
  const snap=new HrTalentService({transaction:async(level:"REPEATABLE READ",job:(m:unknown)=>Promise<unknown>)=>db!.transaction(level,m=>job({query:async(sql:string,args?:unknown[])=>{const rows=await m.query(sql,args);if(sql.startsWith("SELECT count(*)"))await insert(randomUUID(),outside);return rows;}}))} as never,audit as never,{} as never);
  const before=await snap.profilePage(scope,actor(),{page:31,page_size:20});assert.equal(before.total,603);assert.equal(before.items.length,3);assert.equal((await service.profilePage(scope,actor(),{page:31,page_size:20})).total,604);assert.ok(!JSON.stringify(audits).includes("SYN-601"));
 }finally{
  if(db?.isInitialized)await db.destroy();if(admin.isInitialized){if(created){await admin.query(`DROP DATABASE ${name}`);assert.equal((await admin.query("SELECT count(*)::int total FROM pg_database WHERE datname=$1",[name]))[0].total,0);}await admin.destroy();}
 }
});
