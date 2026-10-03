import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {DataSource,type EntityManager} from "typeorm";
import {HrService} from "./hr.service";
import {HrEmployeeEntity,HrEmploymentEventEntity} from "./entities/hr.entities";
import {UserEntity} from "../users/entities/user.entity";
import {UserRoleEntity} from "../roles/entities/user-role.entity";
import {RoleEntity} from "../roles/entities/role.entity";
import {PermissionEntity} from "../permissions/entities/permission.entity";
import {RolePermissionEntity} from "../permissions/entities/role-permission.entity";
import type {JwtPrincipal} from "../../shared/types/jwt-principal";
import type {UpdateHrEmployeeDto} from "./dto/hr.dto";
const required=process.env.HR_EMPLOYEE_ACCOUNT_LINK_PG_REQUIRED==="1";
const id=(n:number)=>`00000000-0000-4000-8000-${n.toString(16).padStart(12,"0")}`;
const scope={tenantId:"synthetic-tenant",parkId:"synthetic-park"},actor={sub:id(999)} as JwtPrincipal;
test("isolated PostgreSQL employee account associations",{skip:!required,timeout:60_000},async t=>{
 const host=process.env.POSTGRES_HOST,port=Number(process.env.POSTGRES_PORT);
 assert.equal(host,"127.0.0.1");assert.ok([55491,55492].includes(port));assert.equal(process.env.POSTGRES_DB,"postgres");
 const schema=`hr_account_link_pg_${randomUUID().replaceAll("-","")}`;
 const db=new DataSource({type:"postgres",host,port,database:"postgres",username:process.env.POSTGRES_USER,password:process.env.POSTGRES_PASSWORD,
  schema,uuidExtension:"pgcrypto",installExtensions:false,entities:[HrEmployeeEntity,HrEmploymentEventEntity,UserEntity,UserRoleEntity,RoleEntity,PermissionEntity,RolePermissionEntity]});
 let created=false;
 await db.initialize();
 try{
  assert.ok(db.entityMetadatas.every(meta=>meta.schema===schema));
  await db.query(`CREATE SCHEMA "${schema}"`);created=true;await db.synchronize();
  await db.query(`CREATE UNIQUE INDEX uq_hr_employee_scope_user ON "${schema}".hr_employee(tenant_id,park_id,user_id) WHERE is_deleted=false AND user_id IS NOT NULL`);
  const employees=db.getRepository(HrEmployeeEntity),users=db.getRepository(UserEntity),events=db.getRepository(HrEmploymentEventEntity);
  const service=Object.create(HrService.prototype) as HrService;Object.assign(service,{dataSource:db});
  const employee=(n:number,extra:Partial<HrEmployeeEntity>={})=>employees.save(employees.create({id:id(n),...scope,employeeCode:`SYN-${n}`,fullName:`Synthetic ${n}`,employmentStatus:"active",hireDate:"2020-01-01",primaryOrgId:id(500),workLocation:"original",...extra}));
  const user=(n:number,extra:Partial<UserEntity>={})=>users.save(users.create({id:id(n),...scope,username:`synthetic-${n}`,displayName:`Synthetic ${n}`,passwordHash:"synthetic-not-a-login-hash",isEnabled:true,status:"enabled",...extra}));
  const link=(employee:number,user:number|null,expected:string|null=null,reason="Synthetic identity review")=>service.linkEmployeeAccount(scope,actor,id(employee),{userId:user===null?null:id(user),expectedUserId:expected,reason});
  for(let n=1;n<=12;n++)await employee(n);
  for(let n=101;n<=110;n++)await user(n);
  await t.test("association changes only account and audit metadata, with atomic snapshots",async()=>{
   const before=await employees.findOneByOrFail({id:id(1)});await link(1,101);const after=await employees.findOneByOrFail({id:id(1)});
   const {userId:oldUser,updateBy:oldUpdater,updateTime:oldTime,version:oldVersion,...beforeFacts}=before;
   const {userId:newUser,updateBy:newUpdater,updateTime:newTime,version:newVersion,...afterFacts}=after;
   void oldUpdater;void oldTime;void newTime;
   assert.equal(oldUser,null);assert.equal(newUser,id(101));assert.equal(newUpdater,actor.sub);assert.equal(newVersion,oldVersion+1);assert.deepEqual(afterFacts,beforeFacts);
   const event=await events.findOneByOrFail({employeeId:id(1)});assert.equal(event.beforeSnapshot.userId,null);assert.equal(event.afterSnapshot.userId,id(101));assert.equal(event.reason,"Synthetic identity review");
  });
  await t.test("ordinary profile updates preserve omitted imported dates in PostgreSQL",async()=>{
   await employee(30,{probationEndDate:"2020-04-01"});
   await service.updateEmployee(scope,actor,id(30),{employeeCode:"SYN-30",fullName:"Synthetic revised name",employmentStatus:"active"});
   const row=await employees.findOneByOrFail({id:id(30)});
   assert.equal(row.hireDate,"2020-01-01");assert.equal(row.probationEndDate,"2020-04-01");assert.equal(row.fullName,"Synthetic revised name");
   const event=await events.findOneByOrFail({employeeId:id(30)});
   assert.equal(event.beforeSnapshot.hireDate,"2020-01-01");assert.equal(event.afterSnapshot.hireDate,"2020-01-01");
  });
  await t.test("explicit nullable date updates keep the existing PostgreSQL clearing contract",async()=>{
   await employee(31,{probationEndDate:"2020-04-01"});
   await service.updateEmployee(scope,actor,id(31),{employeeCode:"SYN-31",fullName:"Synthetic cleared dates",employmentStatus:"active",hireDate:null,probationEndDate:null} as unknown as UpdateHrEmployeeDto);
   const row=await employees.findOneByOrFail({id:id(31)});assert.equal(row.hireDate,null);assert.equal(row.probationEndDate,null);
  });
  await t.test("a real event insert failure rolls back the ordinary profile date update",async()=>{
   await employee(32,{probationEndDate:"2020-04-01"});
   await db.query(`ALTER TABLE "${schema}".hr_employment_event ADD CONSTRAINT synthetic_date_event_failure CHECK(employee_id IS DISTINCT FROM '${id(32)}'::uuid)`);
   await assert.rejects(service.updateEmployee(scope,actor,id(32),{employeeCode:"SYN-32",fullName:"Synthetic rejected update",employmentStatus:"active",hireDate:"2021-01-01"}));
   const row=await employees.findOneByOrFail({id:id(32)});assert.equal(row.fullName,"Synthetic 32");assert.equal(row.hireDate,"2020-01-01");assert.equal(row.probationEndDate,"2020-04-01");assert.equal(await events.countBy({employeeId:id(32)}),0);
  });
  await t.test("stale expected association fails and no-op adds no event",async()=>{
   const before=await employees.findOneByOrFail({id:id(1)}),count=await events.count();
   await assert.rejects(link(1,102),/changed/);await link(1,101,id(101));
   assert.deepEqual(await employees.findOneByOrFail({id:id(1)}),before);assert.equal(await events.count(),count);
  });
  await t.test("foreign, disabled and deleted references fail without writes",async()=>{
   for(const [n,extra] of [[201,{tenantId:"foreign"}],[202,{parkId:"foreign"}],[203,{isEnabled:false}],[204,{status:"disabled"}],[205,{isDeleted:true}]] as const){await user(n,extra);await assert.rejects(link(2,n),/unavailable/);}
   await employee(21,{tenantId:"foreign"});await assert.rejects(link(21,102),/not found/i);
   assert.equal((await employees.findOneByOrFail({id:id(2)})).userId,null);assert.equal(await events.countBy({employeeId:id(2)}),0);
  });
  await t.test("departed employees may unlink but may not gain an association",async()=>{
   await employees.update(id(3),{employmentStatus:"departed",userId:id(103)});
   await assert.rejects(link(3,102,id(103)),/Departed/);await link(3,null,id(103));
   const row=await employees.findOneByOrFail({id:id(3)});assert.equal(row.userId,null);assert.equal(row.employmentStatus,"departed");
  });
  await t.test("two employees cannot claim one account concurrently",async()=>{
   const result=await Promise.allSettled([link(4,104),link(5,104)]);
   assert.equal(result.filter(r=>r.status==="fulfilled").length,1);assert.equal(result.filter(r=>r.status==="rejected").length,1);
   const rejected=result.find(r=>r.status==="rejected") as PromiseRejectedResult;assert.equal(rejected.reason.getStatus(),409);
   assert.equal(await employees.countBy({...scope,userId:id(104),isDeleted:false}),1);
   assert.equal(await events.countBy([{employeeId:id(4)},{employeeId:id(5)}]),1);
  });
  await t.test("concurrent changes to one employee reject the stale writer",async()=>{
   const result=await Promise.allSettled([link(6,105),link(6,106)]);
   assert.equal(result.filter(r=>r.status==="fulfilled").length,1);
   const rejected=result.find(r=>r.status==="rejected") as PromiseRejectedResult;assert.equal(rejected.reason.getStatus(),409);assert.match(rejected.reason.message,/changed/);
   assert.equal(await events.countBy({employeeId:id(6)}),1);
  });
  await t.test("event failure rolls back the employee association",async()=>{
   await db.query(`ALTER TABLE "${schema}".hr_employment_event ADD CONSTRAINT synthetic_event_failure CHECK(reason IS DISTINCT FROM 'synthetic-fail')`);
   await assert.rejects(link(7,107,null,"synthetic-fail"));
   assert.equal((await employees.findOneByOrFail({id:id(7)})).userId,null);assert.equal(await events.countBy({employeeId:id(7)}),0);
  });
  await t.test("a committed external writer triggers the real unique index and becomes 409",async()=>{
   const writer=db.createQueryRunner();await writer.connect();await writer.startTransaction();
   await writer.manager.getRepository(HrEmployeeEntity).update(id(8),{userId:id(108)});
   let signal!:()=>void;const observed=new Promise<void>(resolve=>signal=resolve);
   let resume!:()=>void;const proceed=new Promise<void>(resolve=>resume=resolve);
   const racing=Object.create(HrService.prototype) as HrService;
   Object.assign(racing,{dataSource:{transaction:(run:(manager:EntityManager)=>Promise<unknown>)=>db.transaction(async manager=>{
    const get=manager.getRepository.bind(manager);
    manager.getRepository=((target:typeof HrEmployeeEntity)=>{
     const repo=get(target);
     if(target===HrEmployeeEntity){const exists=repo.exists.bind(repo);repo.exists=async options=>{const result=await exists(options);signal();await proceed;return result;};}
     return repo;
    }) as EntityManager["getRepository"];
    return run(manager);
   })}});
   const pending=racing.linkEmployeeAccount(scope,actor,id(9),{userId:id(108),expectedUserId:null,reason:"Synthetic race"});
   // Capture rejection immediately, then release the deterministic race barrier.
   const rejected=assert.rejects(pending,error=>(error as {getStatus():number}).getStatus()===409);
   try{await observed;await writer.commitTransaction();resume();await rejected;}
   finally{resume();if(writer.isTransactionActive)await writer.rollbackTransaction();await writer.release();}
   assert.equal((await employees.findOneByOrFail({id:id(9)})).userId,null);assert.equal(await events.countBy({employeeId:id(9)}),0);
  });
  await t.test("soft-deleted historical associations do not reserve the active account",async()=>{
   await employee(22,{isDeleted:true,userId:id(109)});await link(10,109);
   assert.equal(await employees.countBy({...scope,userId:id(109),isDeleted:false}),1);
  });
 }finally{
  try{if(created){await db.query(`DROP SCHEMA "${schema}" CASCADE`);const rows=await db.query("SELECT count(*)::int n FROM pg_namespace WHERE nspname=$1",[schema]);assert.equal(rows[0].n,0);}}
  finally{await db.destroy();}
 }
});
