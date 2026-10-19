import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {after,before,test} from "node:test";
import {HR_PERMISSIONS as H} from "@jinhu/shared";
import {DataSource} from "typeorm";
import type {AuditService} from "../audit/audit.service";
import {HrJobChangeService} from "./hr-job-change.service";

const enabled=process.env.HR_JOB_CHANGE_LINKED_TARGET_PG_REQUIRED==="1",scope={tenantId:"synthetic-linked-tenant",parkId:"synthetic-linked-park"};
let admin:DataSource,db:DataSource|undefined,service:HrJobChangeService,schema:string;
const manager=randomUUID(),employeeUser=randomUUID(),outsider=randomUUID(),org=randomUUID(),child=randomUUID(),sibling=randomUUID(),employee=randomUUID(),otherEmployee=randomUUID(),target=randomUUID(),otherTarget=randomUUID();
const audits:Array<Record<string,unknown>>=[];
const actor=(sub:string,permissions:string[])=>({sub,username:"synthetic-linked-target",tenantId:scope.tenantId,parkId:scope.parkId,roles:[],permissions});
const park=actor(manager,[H.HR_JOB_CHANGE_READ]),team=actor(manager,[H.HR_JOB_CHANGE_TEAM_READ]),self=actor(employeeUser,[H.HR_JOB_CHANGE_SELF_READ]);
const query={page:1,page_size:20};
before(async()=>{
 if(!enabled)return;
 const port=Number(process.env.POSTGRES_PORT);
 if(process.env.POSTGRES_HOST!=="127.0.0.1"||![55491,55497].includes(port)||process.env.POSTGRES_DB!=="postgres")throw Error("Requires the owned linked-target PostgreSQL fixture");
 const connection={type:"postgres" as const,host:"127.0.0.1",port,username:process.env.POSTGRES_USER??"postgres",password:process.env.POSTGRES_PASSWORD,database:"postgres"};
 admin=new DataSource(connection);await admin.initialize();schema=`hr_linked_target_${randomUUID().replaceAll("-","")}`;await admin.query(`CREATE SCHEMA "${schema}"`);
 db=new DataSource({...connection,extra:{options:`-c search_path=${schema},public`}});await db.initialize();
 await db.query(`CREATE TABLE sys_org(id uuid PRIMARY KEY,tenant_id text,park_id text,parent_id uuid,leader_user_id uuid,org_name text,status text,is_deleted boolean DEFAULT false);
 CREATE TABLE hr_position(id uuid PRIMARY KEY,tenant_id text,park_id text,position_name text);
 CREATE TABLE hr_employee(id uuid PRIMARY KEY,tenant_id text,park_id text,user_id uuid,primary_org_id uuid,employee_code text,full_name text);
 CREATE TABLE hr_job_change_application(id uuid PRIMARY KEY,tenant_id text,park_id text,subject_employee_id uuid,applicant_user_id uuid,application_no text,application_name text,application_date date,effective_date date,status text,before_org_id uuid,after_org_id uuid,before_position_id uuid,after_position_id uuid,version integer DEFAULT 1,is_deleted boolean DEFAULT false,create_time timestamptz DEFAULT now());
 CREATE TABLE hr_job_change_approval_fulfillment(tenant_id text,park_id text,job_change_application_id uuid,approval_request_id uuid,source_version integer);`);
 await db.query(`INSERT INTO sys_org(id,tenant_id,park_id,parent_id,leader_user_id,org_name,status) VALUES($1,$4,$5,NULL,$6,'Managed','enabled'),($2,$4,$5,$1,NULL,'Child','enabled'),($3,$4,$5,NULL,NULL,'Sibling','enabled')`,[org,child,sibling,scope.tenantId,scope.parkId,manager]);
 await db.query(`INSERT INTO hr_employee VALUES($1,$3,$4,$5,$6,'SYN-51','Synthetic target employee'),($2,$3,$4,$7,$8,'SYN-52','Synthetic sibling employee')`,[employee,otherEmployee,scope.tenantId,scope.parkId,employeeUser,child,outsider,sibling]);
 // Target sorts beyond the default first20. The scoped ID predicate must run before LIMIT.
 for(let i=1;i<=25;i++)await db.query(`INSERT INTO hr_job_change_application(id,tenant_id,park_id,subject_employee_id,applicant_user_id,application_no,application_name,application_date,effective_date,status,after_org_id) VALUES($1,$2,$3,$4,$5,$6,'Synthetic change',$7,'2026-10-01','returned',$8)`,[i===1?target:randomUUID(),scope.tenantId,scope.parkId,employee,outsider,`SYN-${i}`,`2026-10-${String(i).padStart(2,"0")}`,child]);
 await db.query(`INSERT INTO hr_job_change_application(id,tenant_id,park_id,subject_employee_id,applicant_user_id,application_no,application_date,status) VALUES($1,$2,$3,$4,$5,'SYN-SIBLING','2026-10-26','returned')`,[otherTarget,scope.tenantId,scope.parkId,otherEmployee,outsider]);
 service=new HrJobChangeService(db,{recordOperationRequired:async(input:Record<string,unknown>)=>{audits.push(input);}} as unknown as AuditService);
});
after(async()=>{if(db?.isInitialized)await db.destroy();if(admin?.isInitialized){await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.destroy();}});

test("exact target before pagination retains tenant/park, recursive team, self and employee isolation",{skip:!enabled},async()=>{
 const ordinary=await service.list(scope,park,query);assert.equal(ordinary.total,26);assert.equal(ordinary.items.length,20);assert.ok(!ordinary.items.some(row=>row.id===target));
 for(const status of ["returned","approved","applied"]){
  await db!.query(`UPDATE hr_job_change_application SET status=$1 WHERE id=$2`,[status,target]);
  for(const principal of [park,team,self]){
   const result=await service.list(scope,principal,{...query,application_id:target});assert.equal(result.total,1);assert.deepEqual(result.items.map(row=>row.id),[target]);assert.equal(result.items[0]?.employeeId,employee);assert.equal(result.items[0]?.status,status);
  }
 }
 const negatives=[
  {scope:{...scope,tenantId:"foreign-tenant"},actor:park,id:target},
  {scope:{...scope,parkId:"foreign-park"},actor:park,id:target},
  {scope,actor:team,id:otherTarget},
  {scope,actor:self,id:otherTarget},
  {scope,actor:actor(manager,[H.HR_JOB_CHANGE_SELF_READ]),id:target},
  {scope,actor:actor(employeeUser,[H.HR_JOB_CHANGE_TEAM_READ]),id:target},
  {scope,actor:actor(outsider,[]),id:target},
  {scope,actor:park,id:randomUUID()}
 ];
 for(const negative of negatives){const result=await service.list(negative.scope,negative.actor,{...query,application_id:negative.id});assert.deepEqual(result.items,[]);assert.equal(result.total,0);}
 const statusMismatch=await service.list(scope,park,{...query,application_id:target,status:"returned"});assert.equal(statusMismatch.total,0);assert.deepEqual(statusMismatch.items,[]);
 // Explicit filter cannot change the employee join or elevate an otherwise self-scoped caller.
 const before=audits.length;await service.list(scope,team,{...query,application_id:otherTarget});assert.equal(audits.length,before+1);
 const failing=new HrJobChangeService(db!,{recordOperationRequired:async()=>{throw Error("Synthetic audit unavailable");}} as unknown as AuditService);
 await assert.rejects(failing.list(scope,self,{...query,application_id:target}),/Synthetic audit unavailable/);assert.ok(audits.length>=18);
});
