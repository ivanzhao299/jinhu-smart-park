import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { DataSource } from "typeorm";
import { ConflictException } from "@nestjs/common";
import { HrService } from "./hr.service";
import { HrEmployeeEntity, HrEmployeeProfileEntity } from "./entities/hr.entities";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";

const enabled=process.env.HR_PROFILE_CAS_PG_REQUIRED==="1";
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const scope={tenantId:"synthetic-tenant",parkId:"synthetic-park"},actor={sub:id(99)} as JwtPrincipal;
test("profile CAS against real TypeORM on a new isolated PostgreSQL container",{skip:!enabled,timeout:90_000},async t=>{
 const suffix=randomBytes(10).toString("hex"),name=`hr-profile-cas-${suffix}`,database=`hr_profile_cas_${suffix}`;
 const password=randomBytes(24).toString("hex"),env={...process.env,POSTGRES_PASSWORD:password};
 const docker=(args:string[])=>execFileSync("docker",args,{encoding:"utf8",env,stdio:["ignore","pipe","pipe"],timeout:20000}).trim();
 const sources:DataSource[]=[];let created=false;
 try{
  docker(["image","inspect","postgres:16-alpine","--format","{{.Id}}"]);
  docker(["run","--detach","--name",name,"--label",`hr-profile-cas=${suffix}`,"--tmpfs","/var/lib/postgresql/data","--publish","127.0.0.1::5432","--env","POSTGRES_PASSWORD","--env",`POSTGRES_DB=${database}`,"postgres:16-alpine"]);created=true;
  let ready=false;
  for(let attempt=0;attempt<60;attempt++){try{docker(["exec",name,"pg_isready","-h","127.0.0.1","-U","postgres","-d",database]);ready=true;break;}catch{await delay(250);}}
  assert.ok(ready,"new PostgreSQL did not become ready");
  const endpoint=docker(["port",name,"5432/tcp"]);assert.match(endpoint,/^127\.0\.0\.1:[0-9]+$/);
  const port=Number(endpoint.split(":")[1]);
  const make=async(applicationName:string)=>{
   const db=new DataSource({type:"postgres",host:"127.0.0.1",port,database,username:"postgres",password,
    entities:[HrEmployeeEntity,HrEmployeeProfileEntity],synchronize:false,applicationName,extra:{max:1,statement_timeout:10000,lock_timeout:5000}});
   await db.initialize();sources.push(db);return db;
  };
  const db=await make("cas-observer"),left=await make("cas-left"),right=await make("cas-right");
  // Exact production entity metadata; isolated table fixture, not a full-migration claim.
  await db.synchronize();
  await db.query("CREATE TABLE profile_write_probe (profile_id uuid,version integer)");
  await db.query("CREATE FUNCTION profile_probe() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN INSERT INTO profile_write_probe VALUES(NEW.id,NEW.version); RETURN NEW; END $$");
  await db.query("CREATE TRIGGER profile_probe AFTER INSERT OR UPDATE ON hr_employee_profile FOR EACH ROW EXECUTE FUNCTION profile_probe()");
  const employees=db.getRepository(HrEmployeeEntity),profiles=db.getRepository(HrEmployeeProfileEntity);
  for(let n=1;n<=4;n++)await employees.save(employees.create({id:id(n),...scope,employeeCode:`SYN-${n}`,fullName:`Synthetic ${n}`,employmentType:"full_time",employmentStatus:"active"}));
  const service=(source:DataSource)=>{
   const value=Object.create(HrService.prototype) as HrService;
   Object.assign(value,{dataSource:source,employees:source.getRepository(HrEmployeeEntity),sensitiveData:{identityProfile:()=>{throw new Error("Unexpected identity encryption");}}});
   // Exercise the production write transaction; scope/permission detail reads have separate tests.
   Object.assign(value,{detailEmployee:async(s:typeof scope,employeeId:string)=>source.getRepository(HrEmployeeEntity).findOneByOrFail({...s,id:employeeId,isDeleted:false})});
   return value;
  };
  const a=service(left),b=service(right);
  await t.test("create=1, update/no-op increment exactly once, and stale save changes no row or probe",async()=>{
   const first=await a.updateEmployeeProfile(scope,actor,id(1),{expectedVersion:0,nativePlace:"Synthetic place",degree:"Synthetic degree"});assert.equal(first.version,1);
   const second=await a.updateEmployeeProfile(scope,actor,id(1),{expectedVersion:1,nativePlace:"Synthetic place"});assert.equal(second.version,2);assert.equal(second.degree,null);
   const third=await a.updateEmployeeProfile(scope,actor,id(1),{expectedVersion:2,nativePlace:"Synthetic place"});assert.equal(third.version,3);
   const before=await profiles.findOneByOrFail({employeeId:id(1)}),probe=await db.query("SELECT count(*)::int n FROM profile_write_probe");
   await assert.rejects(b.updateEmployeeProfile(scope,actor,id(1),{expectedVersion:2,remark:"stale"}),ConflictException);
   assert.deepEqual(await profiles.findOneByOrFail({employeeId:id(1)}),before);assert.deepEqual(await db.query("SELECT count(*)::int n FROM profile_write_probe"),probe);
   assert.deepEqual((await db.query("SELECT version FROM profile_write_probe ORDER BY version")).map((row:{version:number})=>row.version),[1,2,3]);
  });
  async function race(employeeId:string,expectedVersion:number){
   const blocker=db.createQueryRunner();await blocker.connect();await blocker.startTransaction();
   try{
    await blocker.query("SELECT id FROM hr_employee WHERE id=$1 FOR UPDATE",[employeeId]);
    const pending=Promise.allSettled([a.updateEmployeeProfile(scope,actor,employeeId,{expectedVersion,nativePlace:"Synthetic A"}),b.updateEmployeeProfile(scope,actor,employeeId,{expectedVersion,nativePlace:"Synthetic B"})]);
    let blocked=0;
    for(let attempt=0;attempt<80;attempt++){
     const rows=await blocker.query("SELECT count(DISTINCT pid)::int n FROM pg_stat_activity WHERE application_name IN ('cas-left','cas-right') AND wait_event_type='Lock'");
     blocked=rows[0].n;if(blocked===2)break;await delay(25);
    }
    assert.equal(blocked,2,"both independent sessions must wait on the anchor");
    await blocker.commitTransaction();
    const outcomes=await pending;assert.equal(outcomes.filter(x=>x.status==="fulfilled").length,1);
    const rejected=outcomes.find(x=>x.status==="rejected");assert.ok(rejected?.status==="rejected"&&rejected.reason instanceof ConflictException);
   }finally{if(blocker.isTransactionActive)await blocker.rollbackTransaction();await blocker.release();}
  }
  await t.test("two independent first creates serialize on employee and create only version1",async()=>{
   await race(id(2),0);const rows=await profiles.findBy({employeeId:id(2)});assert.equal(rows.length,1);assert.equal(rows[0]!.version,1);
   await assert.rejects(a.updateEmployeeProfile(scope,actor,id(2),{expectedVersion:0}),ConflictException);
  });
  await t.test("two independent existing updates permit one winner",async()=>{
   await race(id(2),1);assert.equal((await profiles.findOneByOrFail({employeeId:id(2)})).version,2);
  });
  await t.test("missing, deleted, and ambiguous profile fail closed without writes",async()=>{
   await assert.rejects(a.updateEmployeeProfile(scope,actor,id(3),{expectedVersion:1}),ConflictException);
   await profiles.save(profiles.create({...scope,employeeId:id(3),version:1,isDeleted:true}));
   const deletedBefore=await db.query("SELECT to_jsonb(p) row FROM hr_employee_profile p WHERE employee_id=$1 ORDER BY id",[id(3)]),deletedProbe=await db.query("SELECT count(*)::int n FROM profile_write_probe");
   await assert.rejects(a.updateEmployeeProfile(scope,actor,id(3),{expectedVersion:0}),ConflictException);
   assert.deepEqual(await db.query("SELECT to_jsonb(p) row FROM hr_employee_profile p WHERE employee_id=$1 ORDER BY id",[id(3)]),deletedBefore);assert.deepEqual(await db.query("SELECT count(*)::int n FROM profile_write_probe"),deletedProbe);
   await assert.rejects(a.updateEmployeeProfile(scope,actor,id(3),{expectedVersion:1}),ConflictException);
   await profiles.save([profiles.create({...scope,employeeId:id(4)}),profiles.create({...scope,employeeId:id(4)})]);
   const before=await db.query("SELECT to_jsonb(p) row FROM hr_employee_profile p ORDER BY id"),probe=await db.query("SELECT count(*)::int n FROM profile_write_probe");
   await assert.rejects(a.updateEmployeeProfile(scope,actor,id(4),{expectedVersion:1}),ConflictException);
   assert.deepEqual(await db.query("SELECT to_jsonb(p) row FROM hr_employee_profile p ORDER BY id"),before);assert.deepEqual(await db.query("SELECT count(*)::int n FROM profile_write_probe"),probe);
  });
  await t.test("one active profile can update when an unrelated deleted history row exists",async()=>{
   await profiles.save(profiles.create({...scope,employeeId:id(1),version:1,isDeleted:true}));
   const updated=await a.updateEmployeeProfile(scope,actor,id(1),{expectedVersion:3,nativePlace:"Synthetic current"});
   assert.equal(updated.version,4);const rows=await profiles.findBy({employeeId:id(1)});assert.equal(rows.filter(row=>!row.isDeleted).length,1);assert.equal(rows.filter(row=>row.isDeleted).length,1);
  });
 }finally{
  await Promise.all(sources.map(source=>source.destroy()));
  if(created)docker(["rm","--force",name]);
  assert.equal(docker(["ps","-aq","--filter",`label=hr-profile-cas=${suffix}`]),"");
  t.diagnostic("new isolated container removed; named volumes created=0; custom networks created=0");
 }
});
