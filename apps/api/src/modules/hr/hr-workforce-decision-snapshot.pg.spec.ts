import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { DataSource } from "typeorm";
import { HrService } from "./hr.service";

test("isolated PostgreSQL: workforce detail ledgers keep direct organization membership and enabled-position staffing",{skip:process.env.HR_WORKFORCE_DETAIL_PG_REQUIRED!=="1",timeout:60_000},async()=>{
 const name=`hr_workforce_${randomUUID().replaceAll("-","")}`;
 const connection={type:"postgres" as const,host:process.env.POSTGRES_HOST??"127.0.0.1",port:Number(process.env.POSTGRES_PORT??"5432"),username:process.env.POSTGRES_USER??"postgres",password:process.env.POSTGRES_PASSWORD};
 const admin=new DataSource({...connection,database:"postgres"});let db:DataSource|undefined,created=false;
 try{
  await admin.initialize();await admin.query(`CREATE DATABASE ${name}`);created=true;db=new DataSource({...connection,database:name});await db.initialize();
  await db.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
   CREATE TABLE sys_org(id uuid PRIMARY KEY,tenant_id text NOT NULL,park_id text NOT NULL,org_code text NOT NULL,org_name text NOT NULL,status text NOT NULL,is_deleted boolean NOT NULL DEFAULT false);
   CREATE TABLE sys_user(id uuid PRIMARY KEY);CREATE TABLE sys_file(id uuid PRIMARY KEY);`);
  const migration=(file:string)=>readFileSync(resolve(process.cwd(),"../../database/migrations",file),"utf8");
  await db.query(migration("000230_hr_employee_foundation.sql"));
  await db.query("ALTER TABLE hr_position ADD CONSTRAINT fixture_position_scope UNIQUE(tenant_id,park_id,id)");
  await db.query(migration("000237_hr_employment_event_legacy_compatibility.sql"));
  await db.query(migration("000295_hr_organization_position_legacy_mapping.sql"));
  const scope={tenantId:"synthetic-tenant",parkId:"synthetic-park"},actor={sub:randomUUID(),username:"synthetic",...scope,roles:[],permissions:[],isSuper:false};
  const orgA=randomUUID(),orgB=randomUUID(),emptyOrg=randomUUID(),deletedOrg=randomUUID(),foreignOrg=randomUUID(),foreignParkOrg=randomUUID(),positionA=randomUUID(),positionB=randomUUID(),nullLimitPosition=randomUUID(),vacancyPosition=randomUUID(),disabledPosition=randomUUID(),deletedPosition=randomUUID();
  await db.query(`INSERT INTO sys_org(id,tenant_id,park_id,org_code,org_name,status,planned_headcount) VALUES
    ($1,$7,$8,'ORG-A','组织 A','enabled',8),($2,$7,$8,'ORG-B','组织 B','disabled',NULL),($3,$7,$8,'ORG-EMPTY','空部门','enabled',0),($4,$7,$8,'ORG-DELETED','已删除组织','enabled',5),($5,'foreign-tenant',$8,'FOREIGN','范围外组织','enabled',99),($6,$7,'foreign-park','FOREIGN-PARK','范围外园区组织','enabled',99)`,[orgA,orgB,emptyOrg,deletedOrg,foreignOrg,foreignParkOrg,scope.tenantId,scope.parkId]);
  await db.query("UPDATE sys_org SET is_deleted=true WHERE id=$1",[deletedOrg]);
  await db.query(`INSERT INTO hr_position(id,tenant_id,park_id,org_id,position_code,position_name,headcount_limit,status) VALUES
    ($1,$6,$7,$2,'A-LEAD','A 负责人',2,'enabled'),($3,$6,$7,$2,'A-OPEN','A 空岗',0,'enabled'),($4,$6,$7,$2,'A-NULL','A 未设编制',NULL,'enabled'),($5,$6,$7,$2,'A-VACANCY','A 缺编岗位',4,'enabled'),($8,$6,$7,$2,'A-DISABLED','不应出现',5,'disabled')`,[positionA,orgA,positionB,nullLimitPosition,vacancyPosition,scope.tenantId,scope.parkId,disabledPosition]);
  await db.query("INSERT INTO hr_position(id,tenant_id,park_id,org_id,position_code,position_name,headcount_limit,status,is_deleted) VALUES($1,$2,$3,$4,'A-DELETED','不应出现',5,'enabled',true)",[deletedPosition,scope.tenantId,scope.parkId,orgA]);
  const addEmployee=async(status:string,org:string|null,position:string|null)=>db!.query(`INSERT INTO hr_employee(id,tenant_id,park_id,employee_code,full_name,primary_org_id,position_id,employment_status) VALUES($1,$2,$3,$4,'Synthetic employee',$5,$6,$7)`,[randomUUID(),scope.tenantId,scope.parkId,`E-${randomUUID()}`,org,position,status]);
  await addEmployee("active",orgA,positionA);await addEmployee("probation",orgA,positionA);await addEmployee("active",orgA,positionA);await addEmployee("preboarding",orgA,null);await addEmployee("departed",orgB,null);await addEmployee("suspended",null,null);
  await addEmployee("active",orgB,positionA);await addEmployee("active",orgA,disabledPosition);await addEmployee("active",deletedOrg,deletedPosition);await addEmployee("active",orgA,nullLimitPosition);await addEmployee("active",foreignOrg,null);
  const deletedEmployee=randomUUID();await db.query("INSERT INTO hr_employee(id,tenant_id,park_id,employee_code,full_name,primary_org_id,position_id,employment_status,is_deleted) VALUES($1,$2,$3,$4,'Deleted employee',$5,$6,'active',true)",[deletedEmployee,scope.tenantId,scope.parkId,`E-${randomUUID()}`,orgA,positionA]);
  await db.query("INSERT INTO hr_employee(id,tenant_id,park_id,employee_code,full_name,primary_org_id,employment_status) VALUES($1,$2,'foreign-park',$3,'Foreign park employee',$4,'active')",[randomUUID(),scope.tenantId,`E-${randomUUID()}`,foreignParkOrg]);
  await db.query("INSERT INTO hr_employee(id,tenant_id,park_id,employee_code,full_name,primary_org_id,employment_status) VALUES($1,'foreign-tenant',$2,$3,'Foreign tenant employee',$4,'active')",[randomUUID(),scope.parkId,`E-${randomUUID()}`,foreignOrg]);
  const result=await HrService.prototype.workforceDecisionSnapshot.call({dataSource:db,auditService:{recordOperationRequired:async()=>undefined}} as never,scope,actor,{from:"2026-01-01",to:"2026-12-31"}) as {employeeTotal:number;activeHeadcount:number;departments:Array<Record<string,unknown>>;positions:Array<Record<string,unknown>>;staffing:Record<string,number>};
  const department=Object.fromEntries(result.departments.map(row=>[String(row.code),row]));
  assert.deepEqual(department["ORG-A"],{code:"ORG-A",name:"组织 A",status:"enabled",employeeTotal:6,activeCount:4,probationCount:1,preboardingCount:1,suspendedCount:0,departedCount:0,plannedHeadcount:8});
  assert.deepEqual(department["ORG-B"],{code:"ORG-B",name:"组织 B",status:"disabled",employeeTotal:2,activeCount:1,probationCount:0,preboardingCount:0,suspendedCount:0,departedCount:1,plannedHeadcount:null});
  assert.deepEqual(department["ORG-EMPTY"],{code:"ORG-EMPTY",name:"空部门",status:"enabled",employeeTotal:0,activeCount:0,probationCount:0,preboardingCount:0,suspendedCount:0,departedCount:0,plannedHeadcount:0});
  assert.deepEqual(department.null,{code:null,name:"未归属",status:"unassigned",employeeTotal:3,activeCount:2,probationCount:0,preboardingCount:0,suspendedCount:1,departedCount:0,plannedHeadcount:null});
  assert.equal(result.departments.reduce((sum,row)=>sum+Number(row.employeeTotal),0),result.employeeTotal);assert.equal(result.departments.reduce((sum,row)=>sum+Number(row.activeCount)+Number(row.probationCount),0),result.activeHeadcount);
  const position=Object.fromEntries(result.positions.map(row=>[String(row.positionCode),row]));
  assert.equal(result.positions.length,4);assert.deepEqual(position["A-LEAD"],{orgCode:"ORG-A",orgName:"组织 A",positionCode:"A-LEAD",positionName:"A 负责人",headcountLimit:2,activeHeadcount:4,vacancyCount:0,overCapacityCount:2});
  assert.deepEqual(position["A-NULL"],{orgCode:"ORG-A",orgName:"组织 A",positionCode:"A-NULL",positionName:"A 未设编制",headcountLimit:null,activeHeadcount:1,vacancyCount:null,overCapacityCount:null});
  assert.deepEqual(position["A-VACANCY"],{orgCode:"ORG-A",orgName:"组织 A",positionCode:"A-VACANCY",positionName:"A 缺编岗位",headcountLimit:4,activeHeadcount:0,vacancyCount:4,overCapacityCount:0});
  assert.equal(result.positions.filter(row=>row.headcountLimit!==null).reduce((sum,row)=>sum+Number(row.headcountLimit),0),result.staffing.headcountLimit);assert.equal(result.positions.reduce((sum,row)=>sum+Number(row.activeHeadcount),0),result.staffing.activeAssignedHeadcount);assert.equal(result.positions.filter(row=>row.vacancyCount!==null).reduce((sum,row)=>sum+Number(row.vacancyCount),0),result.staffing.vacancyCount);assert.equal(result.positions.filter(row=>Number(row.overCapacityCount)>0).length,result.staffing.overCapacityPositionCount);assert.equal(result.staffing.activeUnassignedHeadcount,3);
  assert.doesNotMatch(JSON.stringify(result),/employee_code|full_name|[0-9a-f]{8}-[0-9a-f-]{27}/iu);
 }finally{
  if(db?.isInitialized)await db.destroy();if(admin.isInitialized){if(created)await admin.query(`DROP DATABASE ${name}`);await admin.destroy();}
 }
});
