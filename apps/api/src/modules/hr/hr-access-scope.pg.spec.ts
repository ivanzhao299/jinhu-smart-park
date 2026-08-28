import assert from "node:assert/strict";
import { after,before,describe,it } from "node:test";
import { DataSource } from "typeorm";
import { HR_MANAGED_EMPLOYEE_IDS_SQL,isHrEmployeeIdAccessible } from "./hr-access-policy";

const required=process.env.HR_ACCESS_SCOPE_PG_REQUIRED==="1";
if(required&&!process.env.POSTGRES_PASSWORD)throw new Error("POSTGRES_PASSWORD is required for the HR access-scope PostgreSQL gate");
const suite=required?describe:describe.skip;

suite("HR employee access scope PostgreSQL gate",()=>{
 let dataSource:DataSource;
 before(async()=>{
  dataSource=new DataSource({type:"postgres",host:process.env.POSTGRES_HOST??"127.0.0.1",port:Number(process.env.POSTGRES_PORT??"5432"),database:process.env.POSTGRES_DB??"jinhu_smart_park",username:process.env.POSTGRES_USER??"jinhu",password:process.env.POSTGRES_PASSWORD});
  await dataSource.initialize();
  await dataSource.query("CREATE TEMP TABLE sys_org(id uuid PRIMARY KEY,parent_id uuid,tenant_id text,park_id text,leader_user_id uuid,is_deleted boolean,status text)");
  await dataSource.query("CREATE TEMP TABLE hr_employee(id uuid PRIMARY KEY,tenant_id text,park_id text,user_id uuid,manager_employee_id uuid,primary_org_id uuid,is_deleted boolean)");
  await dataSource.query("CREATE TEMP TABLE hr_approval_request(id uuid PRIMARY KEY,tenant_id text,park_id text,applicant_employee_id uuid,subject_employee_id uuid,status text,is_deleted boolean)");
 });
 after(async()=>{if(dataSource?.isInitialized)await dataSource.destroy();});

 it("includes direct reports and managed org descendants while excluding foreign tenant, park and sibling org",async()=>{
  const actor="00000000-0000-4000-8000-000000000001",manager="00000000-0000-4000-8000-000000000002";
  const root="00000000-0000-4000-8000-000000000010",child="00000000-0000-4000-8000-000000000011",sibling="00000000-0000-4000-8000-000000000012";
  await dataSource.query("INSERT INTO sys_org VALUES ($1,NULL,'tenant-a','park-a',$4,false,'enabled'),($2,$1,'tenant-a','park-a',NULL,false,'enabled'),($3,NULL,'tenant-a','park-a',NULL,false,'enabled')",[root,child,sibling,actor]);
  await dataSource.query("INSERT INTO hr_employee VALUES ($1,'tenant-a','park-a',$2,NULL,$3,false)",[manager,actor,root]);
  const rows=[
   ["00000000-0000-4000-8000-000000000020","tenant-a","park-a",manager,sibling],
   ["00000000-0000-4000-8000-000000000021","tenant-a","park-a",null,child],
   ["00000000-0000-4000-8000-000000000022","tenant-a","park-a",null,sibling],
   ["00000000-0000-4000-8000-000000000023","tenant-b","park-a",manager,root],
   ["00000000-0000-4000-8000-000000000024","tenant-a","park-b",manager,root]
  ];
  for(const [id,tenant,park,directManager,org] of rows)await dataSource.query("INSERT INTO hr_employee VALUES ($1,$2,$3,NULL,$4,$5,false)",[id,tenant,park,directManager,org]);
  const result=await dataSource.query(HR_MANAGED_EMPLOYEE_IDS_SQL,["tenant-a","park-a",actor,manager]) as Array<{id:string}>;
  assert.deepEqual(result.map(row=>row.id).sort(),["00000000-0000-4000-8000-000000000020","00000000-0000-4000-8000-000000000021"]);
  assert.equal(isHrEmployeeIdAccessible("self",manager,manager,[]),true);
  assert.equal(isHrEmployeeIdAccessible("park",rows[2]![0]!,manager,[]),true);
  assert.equal(isHrEmployeeIdAccessible("none",manager,manager,[manager]),false);
  await dataSource.query("INSERT INTO hr_approval_request VALUES ('00000000-0000-4000-8000-000000000030','tenant-a','park-a',$1,$1,'submitted',false),('00000000-0000-4000-8000-000000000031','tenant-a','park-a',$2,$2,'submitted',false),('00000000-0000-4000-8000-000000000032','tenant-a','park-b',$1,$1,'submitted',false)",[rows[1]![0],rows[2]![0]]);
  const managed=result.map(row=>row.id);
  const approvals=await dataSource.query("SELECT id FROM hr_approval_request WHERE tenant_id=$1 AND park_id=$2 AND applicant_employee_id=ANY($3::uuid[]) AND subject_employee_id=ANY($3::uuid[]) AND status='submitted' AND is_deleted=false ORDER BY id",["tenant-a","park-a",managed]) as Array<{id:string}>;
  assert.deepEqual(approvals.map(row=>row.id),["00000000-0000-4000-8000-000000000030"]);
 });
});
