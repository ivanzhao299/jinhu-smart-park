import "reflect-metadata";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import test from "node:test";
import {DataSource} from "typeorm";
import {HR_PERMISSIONS as H} from "@jinhu/shared";
import type {JwtPrincipal} from "../../shared/types/jwt-principal";
import {HrTalentService} from "./hr-talent.service";

const required=process.env.HR_TALENT_OPTIONS_PG_REQUIRED==="1";
test("real PostgreSQL complete talent candidates, literal search, managed subtree and self",{skip:!required},async()=>{
 if(process.env.POSTGRES_HOST!=="127.0.0.1"||process.env.POSTGRES_PORT!=="15482")throw new Error("Talent options test requires owned loopback15482");
 const connection={type:"postgres" as const,host:"127.0.0.1",port:15482,username:"postgres"};
 const name=`hr_talent_options_lab_${randomUUID().replaceAll("-","")}`;
 const admin=new DataSource({...connection,database:"postgres"});let db:DataSource|undefined,created=false;
 try{
  await admin.initialize();await admin.query(`CREATE DATABASE ${name}`);created=true;
  db=new DataSource({...connection,database:name});await db.initialize();
  assert.equal((await db.query("SELECT current_database() AS name"))[0].name,name);
  await db.query("CREATE TABLE sys_org(id uuid PRIMARY KEY,parent_id uuid,tenant_id text,park_id text,leader_user_id uuid,is_deleted boolean,status text)");
  await db.query("CREATE TABLE hr_employee(id uuid PRIMARY KEY,tenant_id text,park_id text,employee_code text,full_name text,employment_status text,is_deleted boolean,primary_org_id uuid,user_id uuid,work_mobile text)");
  const leader=randomUUID(),root=randomUUID(),child=randomUUID(),other=randomUUID(),self=randomUUID();
  await db.query("INSERT INTO sys_org VALUES($1,null,'tenant-a','park-a',$4,false,'enabled'),($2,$1,'tenant-a','park-a',null,false,'enabled'),($3,null,'tenant-a','park-a',null,false,'enabled')",[root,child,other,leader]);
  await db.query("INSERT INTO hr_employee SELECT md5('synthetic-'||n)::uuid,'tenant-a','park-a','SYN-'||lpad(n::text,3,'0'),'合成人员'||n,'active',false,CASE WHEN n=601 THEN $1::uuid ELSE $2::uuid END,CASE WHEN n=601 THEN $3::uuid ELSE null END,'excluded' FROM generate_series(1,601) n",[child,other,self]);
  await db.query("INSERT INTO hr_employee VALUES($1,'tenant-a','park-a','LITERAL','A_%\\','active',false,$7,null,'excluded'),($2,'foreign','park-a','FOREIGN-T','Foreign','active',false,$7,null,'excluded'),($3,'tenant-a','foreign','FOREIGN-P','Foreign','active',false,$7,null,'excluded'),($4,'tenant-a','park-a','DELETED','Deleted','active',true,$7,null,'excluded'),($5,'tenant-a','park-a','DEPARTED','Departed','departed',false,$7,null,'excluded'),($6,'tenant-a','park-a','PROBATION','Probation','probation',false,$7,null,'excluded')",[...Array.from({length:6},()=>randomUUID()),root]);
  const audits:unknown[]=[];
  const service=new HrTalentService(db,{recordOperationRequired:async(input:unknown)=>{audits.push(input);}} as never,{} as never);
  const scope={tenantId:"tenant-a",parkId:"park-a"};const actor:JwtPrincipal={...scope,sub:leader,username:"synthetic",roles:[],permissions:[H.HR_TALENT_PROFILE_CREATE]};
  const seen=new Set<string>();
  for(let page=1;page<=31;page++){
   const result=await service.employeeOptions(scope,actor,{page,page_size:20});assert.equal(result.total,602);
   for(const row of result.items){assert.deepEqual(Object.keys(row).sort(),["employeeCode","fullName","id"]);assert.ok(!seen.has(row.id));seen.add(row.id);assert.ok(!/FOREIGN|DELETED|DEPARTED|PROBATION/.test(row.employeeCode));}
  }
  assert.equal(seen.size,602);
  const later=await service.employeeOptions(scope,actor,{page:1,page_size:20,keyword:"SYN-601"});assert.equal(later.total,1);assert.equal(later.items[0]?.fullName,"合成人员601");
  const empty=await service.employeeOptions(scope,actor,{page:999,page_size:20});assert.equal(empty.total,602);assert.deepEqual(empty.items,[]);
  for(const keyword of ["A_%\\","%","_"]){const result=await service.employeeOptions(scope,actor,{page:1,page_size:20,keyword});assert.equal(result.total,1);assert.equal(result.items[0]?.employeeCode,"LITERAL");}
  for(const permission of [H.HR_TALENT_TEAM_READ,H.HR_DEVELOPMENT_MANAGE]){const result=await service.employeeOptions(scope,{...actor,permissions:[permission]},{page:1,page_size:20});assert.equal(result.total,2);assert.deepEqual(result.items.map(row=>row.employeeCode),["LITERAL","SYN-601"]);}
  const own=await service.employeeOptions(scope,{...actor,sub:self,permissions:[H.HR_TALENT_SELF_READ]},{page:1,page_size:20});assert.equal(own.total,1);assert.equal(own.items[0]?.employeeCode,"SYN-601");
  const unmanaged=await service.employeeOptions(scope,{...actor,sub:randomUUID(),permissions:[H.HR_DEVELOPMENT_MANAGE]},{page:1,page_size:20});assert.deepEqual(unmanaged.items,[]);assert.equal(unmanaged.total,0);
  assert.ok(audits.length>31);assert.ok(!JSON.stringify(audits).includes("SYN-601"));
 }finally{
  if(db?.isInitialized)await db.destroy();
  if(admin.isInitialized){if(created){await admin.query(`DROP DATABASE ${name}`);assert.equal((await admin.query("SELECT count(*)::int total FROM pg_database WHERE datname=$1",[name]))[0].total,0);}await admin.destroy();}
 }
});
