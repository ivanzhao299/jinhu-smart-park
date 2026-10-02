import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import {plainToInstance} from "class-transformer";
import {DataSource} from "typeorm";
import {HR_PERMISSIONS} from "@jinhu/shared";
import {HrContractReminderQueryDto} from "./dto/hr-contract-reminder.dto";
import {HrContractReminderService} from "./hr-contract-reminder.service";
import type {JwtPrincipal} from "../../shared/types/jwt-principal";
const required=process.env.HR_CONTRACT_REMINDER_QUERY_PG_REQUIRED==="1";
const uuid=(value:number)=>`00000000-0000-4000-8000-${value.toString(16).padStart(12,"0")}`;
test("isolated PostgreSQL complete scoped reminder inbox",{skip:!required,timeout:60_000},async t=>{
 const host=process.env.POSTGRES_HOST,port=Number(process.env.POSTGRES_PORT);
 assert.equal(host,"127.0.0.1");assert.ok([55491,55492].includes(port));assert.equal(process.env.POSTGRES_DB,"postgres");
 const db=new DataSource({type:"postgres",host,port,database:"postgres",username:process.env.POSTGRES_USER,password:process.env.POSTGRES_PASSWORD,extra:{max:1}});
 await db.initialize();
 try{await db.transaction(async manager=>{
  // All service SQL uses this one transaction connection. No persistent table is read or written.
  await manager.query(`CREATE TEMP TABLE sys_org(id uuid PRIMARY KEY,tenant_id varchar(64),park_id varchar(64),leader_user_id uuid,parent_id uuid,is_deleted boolean DEFAULT false,status varchar(32) DEFAULT 'enabled') ON COMMIT DROP;
   CREATE TEMP TABLE hr_employee(id uuid PRIMARY KEY,tenant_id varchar(64),park_id varchar(64),user_id uuid,primary_org_id uuid,is_deleted boolean DEFAULT false) ON COMMIT DROP;
   CREATE TEMP TABLE hr_contract_reminder(id uuid PRIMARY KEY,tenant_id varchar(64),park_id varchar(64),contract_id uuid,employee_id uuid,reminder_kind varchar(32),window_days integer,due_date date,status varchar(32),recipient_user_id uuid) ON COMMIT DROP;`);
  const scope={tenantId:"synthetic-tenant",parkId:"synthetic-park"};
  await manager.query(`INSERT INTO sys_org(id,tenant_id,park_id,leader_user_id,parent_id) VALUES($1,$4,$5,$6,NULL),($2,$4,$5,NULL,$1),($3,$4,$5,NULL,NULL)`,[uuid(11),uuid(12),uuid(13),scope.tenantId,scope.parkId,uuid(1)]);
  await manager.query(`INSERT INTO hr_employee(id,tenant_id,park_id,user_id,primary_org_id) VALUES($1,$4,$5,$6,$9),($2,$4,$5,$7,$10),($3,$4,$5,$8,$11)`,[uuid(21),uuid(22),uuid(23),scope.tenantId,scope.parkId,uuid(1),uuid(2),uuid(3),uuid(11),uuid(12),uuid(13)]);
  let sequence=100;
  async function insert(count:number,employee:number,recipient:number,kind="contract_expiry",days=60,status="open",tenant=scope.tenantId,park=scope.parkId){
   const first=sequence;sequence+=count;
   await manager.query(`INSERT INTO hr_contract_reminder SELECT ('00000000-0000-4000-8000-'||lpad(to_hex(n),12,'0'))::uuid,$1,$2,$3,$4,$5,$6,'2026-11-01'::date,$7,$8 FROM generate_series($9::int,$10::int) n`,[tenant,park,uuid(31),uuid(employee),kind,days,status,uuid(recipient),first,sequence-1]);
  }
  await insert(113,22,2);await insert(113,22,1);await insert(37,22,2,"probation_expiry",30,"read");
  await insert(5,22,2,"contract_expiry",60,"resolved");await insert(17,22,3);await insert(9,23,1);
  await insert(25,22,2,"contract_expiry",60,"open","foreign-tenant");await insert(26,22,2,"contract_expiry",60,"open",scope.tenantId,"foreign-park");
  let audits=0;const service=new HrContractReminderService(manager as never,{recordOperationRequired:async()=>{audits++;}} as never);
  const actor=(user:number,permission:string):JwtPrincipal=>({sub:uuid(user),username:"synthetic",tenantId:scope.tenantId,parkId:scope.parkId,roles:[],permissions:[permission]});
  const query=(fields:Partial<HrContractReminderQueryDto>={})=>plainToInstance(HrContractReminderQueryDto,{page:1,page_size:50,...fields});
  await t.test("self reaches all 113 filtered rows without other recipient or scope leakage",async()=>{
   const pages:Awaited<ReturnType<HrContractReminderService["list"]>>[]=[];
   for(const page of [1,2,3])pages.push(await service.list(scope,actor(2,HR_PERMISSIONS.HR_CONTRACT_REMINDER_SELF_READ),query({page,status:"open",kind:"contract_expiry",window_days:60})));
   assert.deepEqual(pages.map(p=>p.items.length),[50,50,13]);assert.ok(pages.every(p=>p.total===113&&p.active_sixty_day_total===113));
   assert.equal(new Set(pages.flatMap(p=>p.items.map(row=>row.id))).size,113);
  });
  await t.test("server type/window/status filters leave whole-scope KPI intact",async()=>{
   const result=await service.list(scope,actor(2,HR_PERMISSIONS.HR_CONTRACT_REMINDER_SELF_READ),query({kind:"probation_expiry",window_days:30,status:"read"}));
   assert.equal(result.total,37);assert.equal(result.items.length,37);assert.equal(result.active_sixty_day_total,113);
   assert.ok(result.items.every(row=>row.kind==="probation_expiry"&&row.windowDays===30&&row.status==="read"));
  });
  await t.test("managed tree retains recipient and excludes outside employees",async()=>{
   const result=await service.list(scope,actor(1,HR_PERMISSIONS.HR_CONTRACT_REMINDER_TEAM_READ),query());
   assert.equal(result.total,113);assert.equal(result.active_sixty_day_total,113);assert.ok(result.items.every(row=>row.employeeId===uuid(22)));
   const empty=await service.list(scope,actor(1,HR_PERMISSIONS.HR_CONTRACT_REMINDER_TEAM_READ),query({kind:"probation_expiry",window_days:30}));
   assert.equal(empty.total,0);assert.equal(empty.active_sixty_day_total,113);
  });
  await t.test("park aggregate excludes foreign tenant/park and closed reminders",async()=>{
   const result=await service.list(scope,actor(1,HR_PERMISSIONS.HR_CONTRACT_REMINDER_PARK_READ),query());
   assert.equal(result.total,294);assert.equal(result.active_sixty_day_total,252);
  });
  assert.equal(audits,7);
 });
 await t.test("temporary tables are gone after the fixture transaction",async()=>{
  const [row]=await db.query("SELECT to_regclass('pg_temp.hr_contract_reminder') IS NULL AND to_regclass('pg_temp.hr_employee') IS NULL AND to_regclass('pg_temp.sys_org') IS NULL AS clean");
  assert.equal(row.clean,true);
 });
 }finally{await db.destroy();}
});
