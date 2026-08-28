import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { after,before,describe,it } from "node:test";
import { DataSource } from "typeorm";

const required=process.env.HR_DEPARTMENT_MANAGER_SEED_PG_REQUIRED==="1";
if(required&&!process.env.POSTGRES_PASSWORD)throw new Error("POSTGRES_PASSWORD is required for the HR department-manager seed PostgreSQL gate");
const suite=required?describe:describe.skip;
const seed=readFileSync(resolve(process.cwd(),"../../database/seeds/production/000017_hr_department_manager_directory.sql"),"utf8");

suite("HR department manager directory production seed PostgreSQL gate",()=>{
 let dataSource:DataSource;
 const defaultRole="00000000-0000-4000-8000-000000000001",foreignRole="00000000-0000-4000-8000-000000000002";
 const pagePermission="00000000-0000-4000-8000-000000000011",teamPermission="00000000-0000-4000-8000-000000000012",profileTeamPermission="00000000-0000-4000-8000-000000000013",foreignPermission="00000000-0000-4000-8000-000000000014",forbiddenPermission="00000000-0000-4000-8000-000000000015";
 before(async()=>{
  dataSource=new DataSource({type:"postgres",host:process.env.POSTGRES_HOST??"127.0.0.1",port:Number(process.env.POSTGRES_PORT??"5432"),database:process.env.POSTGRES_DB??"jinhu_smart_park",username:process.env.POSTGRES_USER??"jinhu",password:process.env.POSTGRES_PASSWORD});
  await dataSource.initialize();
  await dataSource.query("CREATE TEMP TABLE sys_role(id uuid PRIMARY KEY,tenant_id text,park_id text,code text,is_deleted boolean,is_enabled boolean,status text)");
  await dataSource.query("CREATE TEMP TABLE sys_permission(id uuid PRIMARY KEY,tenant_id text,park_id text,code text,is_deleted boolean,is_enabled boolean,status text)");
  await dataSource.query("CREATE TEMP TABLE rel_role_perm(id bigserial PRIMARY KEY,tenant_id text,park_id text,role_id uuid,permission_id uuid,create_time timestamptz,update_time timestamptz,is_deleted boolean,version integer,remark text)");
  await dataSource.query("CREATE UNIQUE INDEX uq_hr_seed_relation ON rel_role_perm(tenant_id,park_id,role_id,permission_id) WHERE is_deleted=false");
  await dataSource.query("INSERT INTO sys_role VALUES ($1,'10000001','20000001','DEPARTMENT_MANAGER',false,true,'enabled'),($2,'10000001','other-park','DEPARTMENT_MANAGER',false,true,'enabled')",[defaultRole,foreignRole]);
  await dataSource.query("INSERT INTO sys_permission VALUES ($1,'10000001','20000001','hr:employees',false,true,'enabled'),($2,'10000001','20000001','hr:employee:team_read',false,true,'enabled'),($3,'10000001','20000001','hr:employee_profile:team_read',false,true,'enabled'),($4,'10000001','other-park','hr:employees',false,true,'enabled'),($5,'10000001','20000001','hr:employee:read',false,true,'enabled')",[pagePermission,teamPermission,profileTeamPermission,foreignPermission,forbiddenPermission]);
  await dataSource.query("INSERT INTO rel_role_perm(tenant_id,park_id,role_id,permission_id,create_time,update_time,is_deleted,version,remark) VALUES('10000001','20000001',$1,$2,now(),now(),false,1,'stale broad grant')",[defaultRole,forbiddenPermission]);
 });
 after(async()=>{if(dataSource?.isInitialized)await dataSource.destroy();});

 it("replays idempotently, binds only the exact park identity and grants no forbidden read",async()=>{
  await dataSource.query(seed);
  await dataSource.query(seed);
  const rows=await dataSource.query("SELECT tenant_id,park_id,role_id::text AS role_id,permission_id::text AS permission_id FROM rel_role_perm WHERE is_deleted=false") as Array<Record<string,string>>;
  assert.deepEqual(rows.map(row=>row.permission_id).sort(),[pagePermission,teamPermission,profileTeamPermission].sort());
  assert.equal((await dataSource.query("SELECT count(*)::int count FROM rel_role_perm WHERE permission_id=$1 AND is_deleted=true",[forbiddenPermission]))[0].count,1);
 });

 it("fails closed when the exact current-park role identity is ambiguous",async()=>{
  const duplicate="00000000-0000-4000-8000-000000000003";
  await dataSource.query("INSERT INTO sys_role VALUES ($1,'10000001','20000001','DEPARTMENT_MANAGER',false,true,'enabled')",[duplicate]);
  try{
   await assert.rejects(dataSource.query(seed),/Expected exactly one active DEPARTMENT_MANAGER role/u);
  }finally{
   await dataSource.query("ROLLBACK");
   await dataSource.query("DELETE FROM sys_role WHERE id=$1",[duplicate]);
  }
  assert.equal((await dataSource.query("SELECT count(*)::int AS count FROM rel_role_perm WHERE is_deleted=false"))[0].count,3);
 });
});
