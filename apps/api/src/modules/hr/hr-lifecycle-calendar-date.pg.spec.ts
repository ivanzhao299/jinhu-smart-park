import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {DataSource} from "typeorm";
import {HR_PERMISSIONS} from "@jinhu/shared";
import {HrLifecycleService} from "./hr-lifecycle.service";

const enabled=process.env.HR_LIFECYCLE_TEMPLATE_PG_REQUIRED==="1";
test("lifecycle list/detail calendar dates and null remain stable across process and database zones",{skip:!enabled},async()=>{
 if(process.env.POSTGRES_HOST!=="127.0.0.1"||process.env.POSTGRES_PORT!=="15483")throw new Error("Requires owned loopback15483");
 const connection={type:"postgres" as const,host:"127.0.0.1",port:15483,username:"postgres"};
 const name=`hr_lifecycle_date_lab_${randomUUID().replaceAll("-","")}`,admin=new DataSource({...connection,database:"postgres"});
 const originalZone=process.env.TZ;let db:DataSource|undefined,created=false,audits=0;
 try{
  await admin.initialize();await admin.query(`CREATE DATABASE ${name}`);created=true;db=new DataSource({...connection,database:name});await db.initialize();
  // A narrow query fixture, not full migration/trigger acceptance. The native
  // enterprise continuation fixture separately exercises all real constraints.
  await db.query(`CREATE TABLE hr_employee(id uuid PRIMARY KEY,tenant_id text,park_id text,full_name text,user_id uuid,manager_employee_id uuid,primary_org_id uuid,is_deleted boolean DEFAULT false);
   CREATE TABLE hr_lifecycle_checklist(id uuid PRIMARY KEY,tenant_id text,park_id text,employee_id uuid,checklist_type text,status text,due_date date,snapshot jsonb,is_deleted boolean DEFAULT false);
   CREATE TABLE hr_lifecycle_checklist_item(id uuid PRIMARY KEY,tenant_id text,park_id text,checklist_id uuid,item_code text,item_name text,category text,sequence_no int,status text,responsible_user_id uuid,due_date date,required boolean,completed_at timestamptz);`);
  const scope={tenantId:"date_tenant",parkId:"date_scope"},employee=randomUUID(),dated=randomUUID(),undated=randomUUID();
  await db.query("INSERT INTO hr_employee(id,tenant_id,park_id,full_name) VALUES($1,$2,$3,'Synthetic date employee')",[employee,scope.tenantId,scope.parkId]);
  for(const [id,date,status] of [[dated,"2026-11-01","completed"],[undated,null,"open"]]){
   await db.query("INSERT INTO hr_lifecycle_checklist(id,tenant_id,park_id,employee_id,checklist_type,status,due_date,snapshot) VALUES($1,$2,$3,$4,'onboarding',$5,$6,'{}')",[id,scope.tenantId,scope.parkId,employee,status,date]);
   await db.query("INSERT INTO hr_lifecycle_checklist_item VALUES($1,$2,$3,$4,'DOC','Synthetic date task','documents',1,'pending',NULL,$5,true,NULL)",[randomUUID(),scope.tenantId,scope.parkId,id,date?"2026-11-02":null]);
  }
  const actor={...scope,sub:randomUUID(),username:"synthetic",roles:[],permissions:[HR_PERMISSIONS.HR_LIFECYCLE_READ]};
  const service=new HrLifecycleService(db,{} as never,{recordOperationRequired:async()=>{audits++;}} as never);
  for(const zone of ["UTC","Asia/Shanghai","America/Los_Angeles"]){
   process.env.TZ=zone;await db.query("SELECT set_config('TimeZone',$1,false)",[zone]);
   const list=await service.list(scope,actor,{page:1,page_size:20});
   assert.equal(list.items.find((row:{id:string})=>row.id===dated).dueDate,"2026-11-01");
   assert.equal(list.items.find((row:{id:string})=>row.id===undated).dueDate,null);
   const withDate=await service.detail(scope,actor,dated),withoutDate=await service.detail(scope,actor,undated);
   assert.equal(withDate.dueDate,"2026-11-01");assert.equal(withDate.items[0].dueDate,"2026-11-02");
   assert.equal(withoutDate.dueDate,null);assert.equal(withoutDate.items[0].dueDate,null);
   assert.equal(JSON.parse(JSON.stringify(withDate)).items[0].dueDate,"2026-11-02");
  }
  assert.equal(audits,9);
 }finally{
  if(originalZone===undefined)delete process.env.TZ;else process.env.TZ=originalZone;
  if(db?.isInitialized)await db.destroy();
  if(admin.isInitialized){try{if(created){await admin.query(`DROP DATABASE ${name}`);assert.equal((await admin.query("SELECT count(*)::int n FROM pg_database WHERE datname=$1",[name]))[0].n,0);}}finally{await admin.destroy();}}
 }
});
