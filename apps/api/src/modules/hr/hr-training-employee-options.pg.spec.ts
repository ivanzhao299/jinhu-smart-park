import "reflect-metadata";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import test from "node:test";
import {DataSource} from "typeorm";
import {HR_PERMISSIONS} from "@jinhu/shared";
import type {JwtPrincipal} from "../../shared/types/jwt-principal";
import {HrTrainingService} from "./hr-training.service";

const required=process.env.HR_TRAINING_OPTIONS_PG_REQUIRED==="1";
test("real PostgreSQL candidate pagination/search excludes other scopes, deleted and departed rows",{skip:!required},async()=>{
 if(process.env.POSTGRES_HOST!=="127.0.0.1"||process.env.POSTGRES_PORT!=="15482")throw new Error("Training options test requires isolated loopback port15482");
 const connection={type:"postgres" as const,host:"127.0.0.1",port:15482,username:"postgres"};
 const name=`hr_training_options_lab_${randomUUID().replaceAll("-","")}`;
 const admin=new DataSource({...connection,database:"postgres"});let db:DataSource|undefined,created=false;
 try{
  await admin.initialize();await admin.query(`CREATE DATABASE ${name}`);created=true;
  db=new DataSource({...connection,database:name,});await db.initialize();
  assert.equal((await db.query("SELECT current_database() AS name"))[0].name,name);
  // Query fixture only, not a substitute for migration/fresh-schema acceptance.
  await db.query("CREATE TABLE hr_employee(id uuid PRIMARY KEY,tenant_id text,park_id text,employee_code text,full_name text,employment_status text,is_deleted boolean,work_mobile text)");
  for(let number=1;number<=601;number++)await db.query("INSERT INTO hr_employee VALUES($1,'tenant-a','park-a',$2,$3,$4,false,'excluded')",[randomUUID(),`SYN-${String(number).padStart(3,"0")}`,`合成人员${number}`,["preboarding","probation","active","suspended"][number%4]]);
  await db.query("INSERT INTO hr_employee VALUES($1,'tenant-a','park-a','LITERAL','A_%\\','active',false,'excluded'),($2,'foreign','park-a','FOREIGN-T','Foreign','active',false,'excluded'),($3,'tenant-a','foreign','FOREIGN-P','Foreign','active',false,'excluded'),($4,'tenant-a','park-a','DELETED','Deleted','active',true,'excluded'),($5,'tenant-a','park-a','DEPARTED','Departed','departed',false,'excluded')",Array.from({length:5},()=>randomUUID()));
  const service=new HrTrainingService(db,{recordOperationRequired:async()=>{}} as never);
  const scope={tenantId:"tenant-a",parkId:"park-a"};const actor:JwtPrincipal={...scope,sub:randomUUID(),username:"synthetic-operator",roles:[],permissions:[HR_PERMISSIONS.HR_TRAINING_PLAN_MANAGE]};
  const seen=new Set<string>();
  for(let page=1;page<=31;page++){
   const result=await service.employeeOptions(scope,actor,{page,page_size:20});assert.equal(result.total,602);
   for(const row of result.items){assert.deepEqual(Object.keys(row).sort(),["employeeCode","fullName","id"]);assert.ok(!seen.has(row.id));seen.add(row.id);assert.ok(!/FOREIGN|DELETED|DEPARTED/.test(row.employeeCode));}
  }
  assert.equal(seen.size,602);
  const later=await service.employeeOptions(scope,actor,{page:1,page_size:20,keyword:"SYN-601"});assert.equal(later.total,1);assert.equal(later.items[0]?.fullName,"合成人员601");
  const empty=await service.employeeOptions(scope,actor,{page:999,page_size:20});assert.equal(empty.total,602);assert.deepEqual(empty.items,[]);
  const literal=await service.employeeOptions(scope,actor,{page:1,page_size:20,keyword:"A_%\\"});assert.equal(literal.total,1);assert.equal(literal.items[0]?.employeeCode,"LITERAL");
  const wildcard=await service.employeeOptions(scope,actor,{page:1,page_size:20,keyword:"%"});assert.equal(wildcard.total,1);
 }finally{
  if(db?.isInitialized)await db.destroy();
  if(admin.isInitialized){if(created){await admin.query(`DROP DATABASE ${name}`);assert.equal((await admin.query("SELECT count(*)::int AS total FROM pg_database WHERE datname=$1",[name]))[0].total,0);}await admin.destroy();}
 }
});
