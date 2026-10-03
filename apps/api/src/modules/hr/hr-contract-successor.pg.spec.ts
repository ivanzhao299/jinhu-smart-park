import "reflect-metadata";
import assert from "node:assert/strict";
import {randomBytes} from "node:crypto";
import test from "node:test";
import {DataSource} from "typeorm";
import {HrService} from "./hr.service";
import {HrEmployeeEntity,HrContractEntity,HrContractTypeEntity,HrContractChangeEntity,HrContractActionEntity} from "./entities/hr.entities";
import type {JwtPrincipal} from "../../shared/types/jwt-principal";

const required=process.env.HR_CONTRACT_SUCCESSOR_PG_REQUIRED==="1";
test("isolated PostgreSQL historical contract to modern successor",{skip:!required,timeout:90000},async t=>{
 assert.equal(process.env.POSTGRES_HOST,"127.0.0.1");assert.ok([55491,55492].includes(Number(process.env.POSTGRES_PORT)));assert.equal(process.env.POSTGRES_DB,"postgres");
 const schema=`hr_successor_${randomBytes(8).toString("hex")}`;
 const connection={type:"postgres" as const,host:"127.0.0.1",port:Number(process.env.POSTGRES_PORT),database:"postgres",username:process.env.POSTGRES_USER,password:process.env.POSTGRES_PASSWORD};
 const admin=new DataSource(connection);await admin.initialize();
 let db:DataSource|undefined;
 try{
  await admin.query(`CREATE SCHEMA ${schema}`);
  db=new DataSource({...connection,schema,synchronize:true,entities:[HrEmployeeEntity,HrContractEntity,HrContractTypeEntity,HrContractChangeEntity,HrContractActionEntity],extra:{max:6,options:`-c search_path=${schema},public`}});await db.initialize();
  await db.query(`CREATE TABLE ${schema}.hr_contract_reminder(id uuid,contract_id uuid,tenant_id varchar(64),park_id varchar(64),status text,cancelled_at timestamptz,cancelled_by uuid,cancel_reason text,update_time timestamptz);
   CREATE TABLE ${schema}.hr_contract_reminder_outbox(reminder_id uuid,status text,update_time timestamptz)`);
  const service=Object.create(HrService.prototype) as HrService;Object.assign(service,{dataSource:db});
  const scope={tenantId:"synthetic-tenant",parkId:"synthetic-park"};
  const actor={sub:"00000000-0000-4000-8000-000000000001",permissions:[]} as unknown as JwtPrincipal;
  const types=db.getRepository(HrContractTypeEntity),employees=db.getRepository(HrEmployeeEntity),contracts=db.getRepository(HrContractEntity);
  const type=await types.save(types.create({...scope,typeCode:"synthetic-fixed",typeName:"Synthetic",status:"enabled",isHistoricalImport:false}));
  let sequence=0;
  async function fixture(overrides:Partial<HrContractEntity>={}){
   const employee=await employees.save(employees.create({...scope,employeeCode:`SYN-${++sequence}`,fullName:"Synthetic",employmentStatus:"active"}));
   const old=await contracts.save(contracts.create({...scope,employeeId:employee.id,contractTypeId:type.id,contractNo:`SYN-OLD-${sequence}`,startDate:"1900-01-01",endDate:"1901-12-31",status:"active",isHistoricalImport:true,sourceSnapshot:{synthetic:true},...overrides}));
   const dto={employeeId:employee.id,contractTypeId:type.id,contractNo:`SYN-NEW-${sequence}`,startDate:"2090-01-01",endDate:"2091-12-31"};
   const unchanged=JSON.stringify(await contracts.findOneByOrFail({id:old.id}));
   return{old,dto,unchanged,employee};
  }
  await t.test("create edit activate renew and apply preserve historical facts and bind predecessor",async()=>{
   const f=await fixture();const created=await service.createContract(scope,actor,f.dto);
   const edited=await service.updateContract(scope,actor,created.id,{...f.dto,startDate:"2090-02-01"});assert.equal(edited.startDate,"2090-02-01");
   await service.actContract(scope,actor,created.id,{action:"activate"});
   const change=await service.createContractChange(scope,actor,created.id,{changeType:"renewal",newStartDate:"2092-01-01",newEndDate:"2093-12-31"});
   await service.actContractChange(scope,actor,created.id,change.id,{action:"apply"});
   const saved=await contracts.findOneByOrFail({id:created.id});assert.equal(saved.status,"active");assert.equal(saved.startDate,"2092-01-01");assert.equal(saved.renewalCount,1);assert.deepEqual(saved.sourceSnapshot.historicalPredecessorContractIds,[f.old.id]);
   assert.equal(JSON.stringify(await contracts.findOneByOrFail({id:f.old.id})),f.unchanged);
   const actions=await db!.getRepository(HrContractActionEntity).find({where:{contractId:created.id},order:{sequenceNo:"ASC"}});assert.deepEqual(actions.map(r=>r.action),["created","updated","activated","change_created","change_applied"]);assert.ok(actions.every(r=>JSON.stringify(r.snapshot.historicalPredecessorContractIds)===JSON.stringify([f.old.id])));
  });
  await t.test("future unknown overlapping and modern duplicate contracts reject without partial write",async()=>{
   for(const overrides of [{endDate:null},{endDate:"2090-12-31"},{isHistoricalImport:false},{status:"draft"}]){
    const f=await fixture(overrides);await assert.rejects(service.createContract(scope,actor,f.dto),/active or draft contract/);assert.equal(await contracts.countBy({employeeId:f.employee.id}),1);
   }
   const f=await fixture();await assert.rejects(service.createContract(scope,actor,{...f.dto,startDate:"1901-12-31"}),/active or draft contract/);
  });
  await t.test("edit activation and applied amendment recheck predecessor date and scope",async()=>{
   const f=await fixture(),created=await service.createContract(scope,actor,f.dto);
   await assert.rejects(service.updateContract(scope,actor,created.id,{...f.dto,startDate:"1901-12-31"}),/active or draft contract/);
   await assert.rejects(service.updateContract({...scope,parkId:"foreign"},actor,created.id,f.dto),/Contract not found/);
   await contracts.update(created.id,{startDate:"1901-12-31"});await assert.rejects(service.actContract(scope,actor,created.id,{action:"activate"}),/active or draft contract/);
   await contracts.update(created.id,{startDate:f.dto.startDate});await service.actContract(scope,actor,created.id,{action:"activate"});
   await assert.rejects(service.createContractChange(scope,actor,created.id,{changeType:"amendment",newStartDate:"1901-12-31"}),/active or draft contract/);
   const change=await service.createContractChange(scope,actor,created.id,{changeType:"amendment",newStartDate:"2090-02-01"});
   await db!.getRepository(HrContractChangeEntity).update(change.id,{newStartDate:"1901-12-31"});await assert.rejects(service.actContractChange(scope,actor,created.id,change.id,{action:"apply"}),/active or draft contract/);
   assert.equal((await contracts.findOneByOrFail({id:created.id})).startDate,f.dto.startDate);assert.equal((await db!.getRepository(HrContractChangeEntity).findOneByOrFail({id:change.id})).status,"draft");
  });
  await t.test("concurrent new drafts serialize on employee and produce one winner",async()=>{
   const f=await fixture();const result=await Promise.allSettled([service.createContract(scope,actor,f.dto),service.createContract(scope,actor,{...f.dto,contractNo:f.dto.contractNo+"-RACE"})]);
   assert.equal(result.filter(r=>r.status==="fulfilled").length,1);assert.equal(await contracts.countBy({employeeId:f.employee.id,isHistoricalImport:false}),1);assert.equal(JSON.stringify(await contracts.findOneByOrFail({id:f.old.id})),f.unchanged);
  });
  await t.test("action failure rolls back modern draft and leaves history intact",async()=>{
   const f=await fixture(),holder=service as unknown as {appendContractAction:(...args:unknown[])=>Promise<void>},original=holder.appendContractAction;
   holder.appendContractAction=async()=>{throw new Error("synthetic action failure");};
   try{await assert.rejects(service.createContract(scope,actor,f.dto),/synthetic action failure/);}finally{holder.appendContractAction=original;}
   assert.equal(await contracts.countBy({employeeId:f.employee.id}),1);assert.equal(JSON.stringify(await contracts.findOneByOrFail({id:f.old.id})),f.unchanged);
  });
  await t.test("historical mutation and unauthorized salary remain denied",async()=>{
   const f=await fixture();await assert.rejects(service.actContract(scope,actor,f.old.id,{action:"cancel"}),/Historical imported contracts are immutable/);await assert.rejects(service.createContractChange(scope,actor,f.old.id,{changeType:"renewal",newStartDate:"2090-01-01"}),/Historical imported contracts are immutable/);await assert.rejects(service.createContract(scope,actor,{...f.dto,baseSalary:"100.00"}),/Compensation management permission/);
  });
 }finally{
  if(db?.isInitialized)await db.destroy();await admin.query(`DROP SCHEMA ${schema} CASCADE`);const [row]=await admin.query("SELECT NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname=$1) clean",[schema]);assert.equal(row.clean,true);await admin.destroy();
 }
});
