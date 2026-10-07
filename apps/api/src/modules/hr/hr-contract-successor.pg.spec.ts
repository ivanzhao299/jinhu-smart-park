import "reflect-metadata";
import assert from "node:assert/strict";
import {randomBytes,createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import test from "node:test";
import {DataSource} from "typeorm";
import {HR_PERMISSIONS} from "@jinhu/shared";
import {HrService} from "./hr.service";
import {HrContractReminderService} from "./hr-contract-reminder.service";
import {HrEmployeeEntity,HrContractEntity,HrContractTypeEntity,HrContractChangeEntity,HrContractActionEntity} from "./entities/hr.entities";
import type {JwtPrincipal} from "../../shared/types/jwt-principal";

const required=process.env.HR_CONTRACT_SUCCESSOR_PG_REQUIRED==="1";
const migrated=process.env.HR_CONTRACT_SUCCESSOR_MIGRATIONS_REQUIRED==="1";
test("isolated PostgreSQL historical contract to modern successor",{skip:!required,timeout:90000},async t=>{
 assert.equal(process.env.POSTGRES_HOST,"127.0.0.1");assert.ok([55491,55492].includes(Number(process.env.POSTGRES_PORT)));assert.equal(process.env.POSTGRES_DB,"postgres");
 const schema=`hr_successor_${randomBytes(8).toString("hex")}`;
 const connection={type:"postgres" as const,host:"127.0.0.1",port:Number(process.env.POSTGRES_PORT),database:"postgres",username:process.env.POSTGRES_USER,password:process.env.POSTGRES_PASSWORD};
 const admin=new DataSource(connection);await admin.initialize();
 const cryptoCatalog="SELECT e.oid,n.nspname,e.extversion FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='pgcrypto'";
 const cryptoBefore=migrated?await admin.query(cryptoCatalog):[];
 let db:DataSource|undefined;
 try{
  await admin.query(`CREATE SCHEMA ${schema}`);
  if(migrated){
   // The generator needs the original baseline's real pgcrypto dependency.
   // If absent, own it in this disposable schema so final CASCADE removes it.
   assert.ok(cryptoBefore.every((row:{nspname:string})=>row.nspname==="public"),"Existing pgcrypto must belong to public");
   if(!cryptoBefore.length)await admin.query(`CREATE EXTENSION pgcrypto WITH SCHEMA ${schema}`);
   const [crypto]=await admin.query("SELECT n.nspname FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='pgcrypto'");
   assert.ok(crypto.nspname===schema||crypto.nspname==="public");
  }
  const entities=[HrEmployeeEntity,HrContractEntity,HrContractTypeEntity,HrContractChangeEntity,HrContractActionEntity];
  const extra={max:6,options:`-c search_path=${schema},public`};
  if(migrated){
   // Only the employee dependency is synchronized. Contract tables, constraints and
   // audit triggers come from these exact checked-in production migrations.
   const bootstrap=new DataSource({...connection,schema,synchronize:true,entities:[HrEmployeeEntity],extra});await bootstrap.initialize();
   try{
    await bootstrap.query(`CREATE UNIQUE INDEX ON hr_employee(tenant_id,park_id,id);
     CREATE TABLE sys_user(id uuid PRIMARY KEY,tenant_id varchar(64),park_id varchar(64),UNIQUE(tenant_id,park_id,id))`);
    const runner=bootstrap.createQueryRunner();await runner.connect();
    try{for(const file of ["000238_hr_contract_history.sql","000244_hr_contract_online_drafts.sql","000272_hr_contract_legacy_parity.sql","000277_hr_contract_chain_reminder.sql"]){await runner.query(readFileSync(resolve(__dirname,"../../../../../database/migrations",file),"utf8"));}}finally{await runner.release();}
   }finally{await bootstrap.destroy();}
  }
  db=new DataSource({...connection,schema,synchronize:!migrated,entities,extra});await db.initialize();
  if(!migrated)await db.query(`CREATE TABLE ${schema}.hr_contract_reminder(id uuid,contract_id uuid,tenant_id varchar(64),park_id varchar(64),status text,cancelled_at timestamptz,cancelled_by uuid,cancel_reason text,update_time timestamptz);
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
  const reviewer={...actor,permissions:[HR_PERMISSIONS.HR_CONTRACT_MANAGE]} as JwtPrincipal;
  await t.test("information review preserves identity, source evidence and omitted salary; requires separate activation",async()=>{
   const f=await fixture({status:"needs_review",startDate:null,endDate:null,baseSalary:"1234.00",sourceSnapshot:{synthetic:true,originalNumber:"retained"}});
   const completed=await service.reviewContractInformation(scope,reviewer,f.old.id,{...f.dto,contractNo:f.old.contractNo,expectedVersion:f.old.version});
   assert.equal(completed.id,f.old.id);assert.equal(completed.status,"draft");assert.equal(completed.version,f.old.version+1);assert.equal("baseSalary" in completed,false);
   const saved=await contracts.findOneByOrFail({id:f.old.id});assert.equal(saved.baseSalary,"1234.00");assert.equal(saved.sourceSnapshot.originalNumber,"retained");
   const action=await db!.getRepository(HrContractActionEntity).findOneByOrFail({contractId:f.old.id});assert.equal(action.fromStatus,"needs_review");assert.equal(action.toStatus,"draft");assert.equal((action.snapshot.previousInformation as Record<string,unknown>).startDate,null);assert.equal(JSON.stringify(action.snapshot).includes("1234.00"),false);
   await service.actContract(scope,reviewer,f.old.id,{action:"activate"});assert.equal((await contracts.findOneByOrFail({id:f.old.id})).status,"active");
  });
  await t.test("review rejects wrong scope, missing authority, salary writes, stale versions and invalid dates without changing data",async()=>{
   const f=await fixture({status:"needs_review",startDate:null,endDate:null});const dto={...f.dto,contractNo:f.old.contractNo,expectedVersion:f.old.version};
   await assert.rejects(service.reviewContractInformation(scope,actor,f.old.id,dto),/permission/);
   await assert.rejects(service.reviewContractInformation({...scope,parkId:"foreign"},reviewer,f.old.id,dto),/not found/);
   await assert.rejects(service.reviewContractInformation(scope,reviewer,f.old.id,{...dto,baseSalary:"100.00"}),/permission/i);
   await assert.rejects(service.reviewContractInformation(scope,reviewer,f.old.id,{...dto,expectedVersion:999}),/changed/);
   await assert.rejects(service.reviewContractInformation(scope,reviewer,f.old.id,{...dto,startDate:"2090-02-30"}),/valid calendar date/);
   await assert.rejects(service.reviewContractInformation(scope,reviewer,f.old.id,{...dto,expectedVersion:"1" as unknown as number}),/expected version/);
   assert.equal(JSON.stringify(await contracts.findOneByOrFail({id:f.old.id})),f.unchanged);
  });
  await t.test("review rejects wrong states, duplicate numbers, another draft and pending changes",async()=>{
   const active=await fixture();await assert.rejects(service.reviewContractInformation(scope,reviewer,active.old.id,{...active.dto,expectedVersion:active.old.version}),/awaiting information review/);
   const f=await fixture({status:"needs_review",startDate:null,endDate:null}),other=await fixture();const dto={...f.dto,contractNo:f.old.contractNo,expectedVersion:f.old.version};
   await assert.rejects(service.reviewContractInformation(scope,reviewer,f.old.id,{...dto,contractNo:other.old.contractNo}),/already exists/);
   const created=await service.createContract(scope,actor,f.dto);await assert.rejects(service.reviewContractInformation(scope,reviewer,f.old.id,dto),/active or draft contract/);
   await service.actContract(scope,actor,created.id,{action:"cancel"});
   const changes=db!.getRepository(HrContractChangeEntity);await changes.save(changes.create({...scope,contractId:f.old.id,sequenceNo:1,changeType:"amendment",newStartDate:"2090-01-01",status:"draft",isHistoricalImport:false,sourceSnapshot:{}}));
   await assert.rejects(service.reviewContractInformation(scope,reviewer,f.old.id,dto),/pending contract change/);assert.equal(JSON.stringify(await contracts.findOneByOrFail({id:f.old.id})),f.unchanged);
  });
  await t.test("concurrent review has one winner and audit failure rolls back the contract",async()=>{
   const f=await fixture({status:"needs_review",startDate:null,endDate:null});const dto={...f.dto,contractNo:f.old.contractNo,expectedVersion:f.old.version};
   const results=await Promise.allSettled([service.reviewContractInformation(scope,reviewer,f.old.id,dto),service.reviewContractInformation(scope,reviewer,f.old.id,dto)]);assert.equal(results.filter(r=>r.status==="fulfilled").length,1);assert.equal(await db!.getRepository(HrContractActionEntity).countBy({contractId:f.old.id}),1);
   const g=await fixture({status:"needs_review",startDate:null,endDate:null});
   const failing=Object.create(service) as HrService;Object.assign(failing,{appendContractAction:async()=>{throw new Error("synthetic audit failure");}});
   await assert.rejects(failing.reviewContractInformation(scope,reviewer,g.old.id,{...g.dto,contractNo:g.old.contractNo,expectedVersion:g.old.version}),/synthetic audit failure/);assert.equal(JSON.stringify(await contracts.findOneByOrFail({id:g.old.id})),g.unchanged);
  });
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
   for(const overrides of [{endDate:null},{endDate:"2090-12-31"},{isHistoricalImport:false,endDate:null},{status:"draft"}]){
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
  await t.test("agreement flags read back, omitted edits preserve, explicit false clears only modern facts",async()=>{
   const f=await fixture({confidentialityAgreement:true,nonCompeteAgreement:false,trainingServiceAgreement:true});
   const created=await service.createContract(scope,actor,{...f.dto,confidentialityAgreement:true,nonCompeteAgreement:false,trainingServiceAgreement:true});assert.equal(created.confidentialityAgreement,true);assert.equal(created.nonCompeteAgreement,false);assert.equal(created.trainingServiceAgreement,true);
   const retained=await service.updateContract(scope,actor,created.id,{...f.dto,remark:"Synthetic unrelated edit"});assert.equal(retained.confidentialityAgreement,true);assert.equal(retained.trainingServiceAgreement,true);
   const cleared=await service.updateContract(scope,actor,created.id,{...f.dto,confidentialityAgreement:false});assert.equal(cleared.confidentialityAgreement,false);assert.equal(cleared.trainingServiceAgreement,true);
   assert.equal(JSON.stringify(await contracts.findOneByOrFail({id:f.old.id})),f.unchanged);
  });
  await t.test("scoped historical detail reads original year facts without raw snapshot or mutation",async()=>{
   const f=await fixture({sourceSnapshot:{unconfirmedTerm:2,unconfirmedTotalTerm:5,unconfirmedRenewalYears:0,raw:"synthetic-private"}});
   Object.assign(service,{contracts,employees,contractTypes:types,contractChanges:db!.getRepository(HrContractChangeEntity),auditService:{recordOperationRequired:async()=>{}}});
   const reader={...actor,permissions:["hr:contract:read"]};const detail=await service.contractDetail(scope,reader,f.old.id);
   assert.ok("originalTermYears" in detail);assert.deepEqual(detail.originalTermYears,{initial:{value:2,status:"recorded"},total:{value:5,status:"recorded"},renewal:{value:0,status:"recorded"}});assert.equal(Object.hasOwn(detail,"sourceSnapshot"),false);assert.equal(JSON.stringify(await contracts.findOneByOrFail({id:f.old.id})),f.unchanged);
   await assert.rejects(service.contractDetail({...scope,parkId:"synthetic-foreign"},reader,f.old.id),/Contract not found/);
   const projection=Reflect.get(service,"projectSelfContract") as (row:typeof detail)=>Record<string,unknown>;assert.equal(Object.hasOwn(projection.call(service,detail),"originalTermYears"),false);
  });
  await t.test("renewal carries explicit term and signature facts and omission clears stale segment facts",async()=>{
   const f=await fixture();const created=await service.createContract(scope,actor,{...f.dto,contractTermMonths:24,signatureDate:"2089-12-15"});await contracts.update(created.id,{cumulativeTermMonths:24});await service.actContract(scope,actor,created.id,{action:"activate"});
   const change=await service.createContractChange(scope,actor,created.id,{changeType:"renewal",newStartDate:"2092-01-01",newEndDate:"2092-12-31",contractTermMonths:12,signatureDate:"2091-12-15"});assert.equal(change.contractTermMonths,12);assert.equal(change.signatureDate,"2091-12-15");
   const reader={...actor,permissions:["hr:contract:read"]};const detail=await service.contractDetail(scope,reader,created.id);assert.equal(detail.changes[0]?.contractTermMonths,12);assert.equal(detail.changes[0]?.signatureDate,"2091-12-15");assert.equal(Object.hasOwn(detail.changes[0],"sourceSnapshot"),false);
   await employees.update(f.employee.id,{userId:actor.sub});const self=await service.contractDetail(scope,{...actor,permissions:["hr:contract:self_read"]},created.id);const selfChange=self.changes[0];assert.ok(selfChange);assert.equal(Object.hasOwn(selfChange,"contractTermMonths"),false);assert.equal(Object.hasOwn(selfChange,"signatureDate"),false);
   await assert.rejects(service.contractDetail({...scope,parkId:"synthetic-foreign"},reader,created.id),/Contract not found/);
   const holder=service as unknown as {appendContractAction:(...args:unknown[])=>Promise<void>},original=holder.appendContractAction;holder.appendContractAction=async()=>{throw new Error("synthetic apply audit failure");};
   try{await assert.rejects(service.actContractChange(scope,actor,created.id,change.id,{action:"apply"}),/synthetic apply audit failure/);}finally{holder.appendContractAction=original;}
   assert.equal((await contracts.findOneByOrFail({id:created.id})).contractTermMonths,24);assert.equal((await db!.getRepository(HrContractChangeEntity).findOneByOrFail({id:change.id})).status,"draft");
   await service.actContractChange(scope,actor,created.id,change.id,{action:"apply"});const saved=await contracts.findOneByOrFail({id:created.id});assert.equal(saved.contractTermMonths,12);assert.equal(saved.signatureDate,"2091-12-15");assert.equal(saved.cumulativeTermMonths,null);assert.equal((await db!.getRepository(HrContractChangeEntity).findOneByOrFail({id:change.id})).signedAt,null);
   const next=await service.createContractChange(scope,actor,created.id,{changeType:"renewal",newStartDate:"2093-01-01",newEndDate:"2093-12-31"});await service.actContractChange(scope,actor,created.id,next.id,{action:"apply"});const missing=await contracts.findOneByOrFail({id:created.id});assert.equal(missing.contractTermMonths,null);assert.equal(missing.signatureDate,null);
   const before=await db!.getRepository(HrContractActionEntity).findOneByOrFail({contractId:created.id,action:"change_created",changeId:change.id});assert.equal(before.snapshot.contractTermMonths,24);assert.equal(before.snapshot.cumulativeTermMonths,24);assert.equal(before.snapshot.signatureDate,"2089-12-15");
   const actions=await db!.getRepository(HrContractActionEntity).find({where:{contractId:created.id,action:"change_applied"},order:{sequenceNo:"ASC"}});assert.deepEqual(actions[0]?.snapshot.changeFacts,{contractTermMonths:12,signatureDate:"2091-12-15"});assert.ok(actions.every(x=>x.occurredAt instanceof Date));assert.equal(JSON.stringify(await contracts.findOneByOrFail({id:f.old.id})),f.unchanged);
  });
  await t.test("same-date open-ended renewal cannot inherit prior segment facts",async()=>{
   const f=await fixture();const created=await service.createContract(scope,actor,{...f.dto,endDate:undefined,contractTermMonths:24,signatureDate:"2089-12-15"});await service.actContract(scope,actor,created.id,{action:"activate"});
   const change=await service.createContractChange(scope,actor,created.id,{changeType:"renewal",newStartDate:f.dto.startDate});
   await service.actContractChange(scope,actor,created.id,change.id,{action:"apply"});const saved=await contracts.findOneByOrFail({id:created.id});assert.equal(saved.contractTermMonths,null);assert.equal(saved.signatureDate,null);assert.equal(JSON.stringify(await contracts.findOneByOrFail({id:f.old.id})),f.unchanged);
  });
  if(migrated)await t.test("renewal invalidates acknowledged reminders without altering terminal history or delivered outbox",async()=>{
   await db!.query("INSERT INTO sys_user(id,tenant_id,park_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",[actor.sub,scope.tenantId,scope.parkId]);
   const [policy]=await db!.query("INSERT INTO hr_contract_reminder_policy(tenant_id,park_id,reminder_kind,window_days,recipient_scope) VALUES($1,$2,'contract_expiry',60,'employee') RETURNING id",[scope.tenantId,scope.parkId]);
   for(const via of ["renewal","stale-service"]){
    const f=await fixture(),created=await service.createContract(scope,actor,f.dto);await service.actContract(scope,actor,created.id,{action:"activate"});
    const ids:Record<string,string>={};
    for(const status of ["open","read","acknowledged","resolved","cancelled"]){
     const digest=createHash("sha256").update(`${created.id}|${status}`).digest("hex");
     const [row]=await db!.query(`INSERT INTO hr_contract_reminder(tenant_id,park_id,contract_id,employee_id,policy_id,rule_version,reminder_kind,window_days,window_date,due_date,recipient_scope,recipient_user_id,source_date,source_contract_version,dedupe_key,status,acknowledged_at,acknowledged_by) VALUES($1,$2,$3,$4,$5,1,'contract_expiry',60,'2091-11-01'::date+$9::int,'2091-12-31'::date+$9::int,'employee',$6,'2091-12-31'::date+$9::int,1,$7,$8::varchar,CASE WHEN $8::varchar='acknowledged' THEN '2091-11-01T00:00:00Z'::timestamptz ELSE NULL END,CASE WHEN $8::varchar='acknowledged' THEN $6::uuid ELSE NULL END) RETURNING id`,[scope.tenantId,scope.parkId,created.id,f.employee.id,policy.id,actor.sub,digest,status,["open","read","acknowledged","resolved","cancelled"].indexOf(status)]);ids[status]=String(row.id);
     await db!.query("INSERT INTO hr_contract_reminder_outbox(tenant_id,park_id,reminder_id,recipient_user_id,dedupe_key,status) VALUES($1,$2,$3,$4,$5,$6)",[scope.tenantId,scope.parkId,row.id,actor.sub,digest,status==="read"?"delivered":"pending"]);
    }
    const reminderState=async()=>({
     reminders:await db!.query("SELECT * FROM hr_contract_reminder WHERE contract_id=$1 ORDER BY id",[created.id]),
     outboxes:await db!.query("SELECT * FROM hr_contract_reminder_outbox WHERE reminder_id=ANY($1::uuid[]) ORDER BY id",[Object.values(ids)])
    });const before=await reminderState();
    const reminderService=new HrContractReminderService(db!,{} as never);
    await db!.transaction(m=>reminderService.cancelStale(m,{...scope,parkId:"foreign"},created.id,actor.sub,"CONTRACT_RENEWED"));
    assert.equal(Number((await db!.query("SELECT count(*)::int n FROM hr_contract_reminder WHERE contract_id=$1 AND status IN('open','read','acknowledged')",[created.id]))[0].n),3);
    assert.deepEqual(await reminderState(),before);
    if(via==="renewal"){
     const change=await service.createContractChange(scope,actor,created.id,{changeType:"renewal",newStartDate:"2092-01-01",newEndDate:"2093-12-31"});
     const holder=service as unknown as {appendContractAction:(...args:unknown[])=>Promise<void>},original=holder.appendContractAction;holder.appendContractAction=async()=>{throw new Error("synthetic reminder audit rollback");};
     try{await assert.rejects(service.actContractChange(scope,actor,created.id,change.id,{action:"apply"}),/reminder audit rollback/);}finally{holder.appendContractAction=original;}
     assert.equal(Number((await db!.query("SELECT count(*)::int n FROM hr_contract_reminder WHERE contract_id=$1 AND status IN('open','read','acknowledged')",[created.id]))[0].n),3);
    assert.deepEqual(await reminderState(),before);
     await service.actContractChange(scope,actor,created.id,change.id,{action:"apply"});
    }else await db!.transaction(m=>reminderService.cancelStale(m,scope,created.id,actor.sub,"CONTRACT_RENEWED"));
    const rows=await db!.query("SELECT id,status,cancel_reason,acknowledged_at,acknowledged_by FROM hr_contract_reminder WHERE contract_id=$1",[created.id]);const byId=new Map<string,Record<string,unknown>>(rows.map((row:Record<string,unknown>)=>[String(row.id),row] as const));
    const reminder=(status:string)=>{const id=ids[status];assert.ok(id);const row=byId.get(id);assert.ok(row);return row;};
    for(const status of ["open","read","acknowledged"]){assert.equal(reminder(status).status,"cancelled");assert.equal(reminder(status).cancel_reason,"CONTRACT_RENEWED");}
    assert.equal(reminder("resolved").status,"resolved");assert.equal(reminder("cancelled").cancel_reason,null);assert.equal(reminder("acknowledged").acknowledged_by,actor.sub);assert.deepEqual(reminder("acknowledged").acknowledged_at,new Date("2091-11-01T00:00:00Z"));
    const outbox=await db!.query("SELECT reminder_id,status FROM hr_contract_reminder_outbox WHERE reminder_id=ANY($1::uuid[])",[Object.values(ids)]);assert.equal(outbox.find((x:Record<string,unknown>)=>x.reminder_id===ids.read)?.status,"delivered");assert.ok(outbox.filter((x:Record<string,unknown>)=>x.reminder_id!==ids.read).every((x:Record<string,unknown>)=>x.status==="cancelled"));
    assert.equal(JSON.stringify(await contracts.findOneByOrFail({id:f.old.id})),f.unchanged);
   }
  });
  if(migrated)await t.test("reminder generation uses Shanghai windows independently of session timezone",async()=>{
   const dateScope={tenantId:"date-tenant",parkId:"date-park"},dateActor:JwtPrincipal={...dateScope,sub:"00000000-0000-4000-8000-000000000002",username:"synthetic-date",roles:[],permissions:[HR_PERMISSIONS.HR_CONTRACT_REMINDER_RUN]};
   await db!.query("ALTER TABLE sys_user ADD COLUMN is_deleted boolean DEFAULT false,ADD COLUMN is_enabled boolean DEFAULT true");
   await db!.query("INSERT INTO sys_user(id,tenant_id,park_id) VALUES($1,$2,$3)",[dateActor.sub,dateScope.tenantId,dateScope.parkId]);
   const dateType=await types.save(types.create({...dateScope,typeCode:"date-fixed",typeName:"Synthetic date",status:"enabled",isHistoricalImport:false}));
   await db!.query("INSERT INTO hr_contract_reminder_policy(tenant_id,park_id,reminder_kind,window_days,recipient_scope) VALUES($1,$2,'contract_expiry',60,'employee')",[dateScope.tenantId,dateScope.parkId]);
   for(const offset of [-1,0,1]){
    const e=await employees.save(employees.create({...dateScope,employeeCode:`date-${offset}`,fullName:"Synthetic date",userId:dateActor.sub,employmentStatus:"active",employmentType:"formal"}));
    const [day]=await db!.query("SELECT (timezone('Asia/Shanghai',now())::date+60+$1::int)::text due",[offset]);
    await contracts.save(contracts.create({...dateScope,employeeId:e.id,contractTypeId:dateType.id,contractNo:`date-${offset}`,startDate:"2000-01-01",endDate:String(day.due),status:"active",isHistoricalImport:false,sourceSnapshot:{}}));
   }
   for(const zone of ["UTC","Etc/GMT+12","Pacific/Kiritimati"]){
    const runner=db!.createQueryRunner();await runner.connect();await runner.startTransaction();
    try{
     await runner.query("SELECT set_config('TimeZone',$1,true)",[zone]);
     await runner.query("CREATE TEMP TABLE sys_role(id uuid,tenant_id varchar(64),park_id varchar(64),code varchar(64),is_deleted boolean) ON COMMIT DROP;CREATE TEMP TABLE rel_user_role(user_id uuid,role_id uuid,tenant_id varchar(64),park_id varchar(64),is_deleted boolean) ON COMMIT DROP");
     const generator=new HrContractReminderService({transaction:async(callback:(manager:typeof runner.manager)=>Promise<unknown>)=>callback(runner.manager)} as never,{recordOperationRequired:async()=>{}} as never);
     await assert.rejects(generator.run(dateScope,{...dateActor,permissions:[]}),/Contract reminder permission is required/);
     assert.equal((await generator.run({...dateScope,parkId:"foreign-date-park"},{...dateActor,parkId:"foreign-date-park"})).created,0,`${zone} foreign scope`);
     assert.equal((await generator.run(dateScope,dateActor)).created,2,zone);
     assert.equal((await generator.run(dateScope,dateActor)).created,0,`${zone} replay`);
     const rows=await runner.query("SELECT (window_date-timezone('Asia/Shanghai',now())::date)::int day_offset FROM hr_contract_reminder WHERE tenant_id=$1 AND park_id=$2 ORDER BY window_date",[dateScope.tenantId,dateScope.parkId]);
     assert.deepEqual(rows.map((row:{day_offset:number})=>row.day_offset),[-1,0],zone);
     const [outbox]=await runner.query("SELECT count(*)::int n FROM hr_contract_reminder_outbox WHERE tenant_id=$1 AND park_id=$2",[dateScope.tenantId,dateScope.parkId]);assert.equal(outbox.n,2);
    }finally{await runner.rollbackTransaction();await runner.release();}
   }
   const [remaining]=await db!.query("SELECT count(*)::int n FROM hr_contract_reminder WHERE tenant_id=$1 AND park_id=$2",[dateScope.tenantId,dateScope.parkId]);assert.equal(remaining.n,0);
   const [remainingOutbox]=await db!.query("SELECT count(*)::int n FROM hr_contract_reminder_outbox WHERE tenant_id=$1 AND park_id=$2",[dateScope.tenantId,dateScope.parkId]);assert.equal(remainingOutbox.n,0);
  });
  if(migrated)await t.test("production contract audit triggers reject mutation and foreign scope",async()=>{
   const f=await fixture(),created=await service.createContract(scope,actor,f.dto);
   const [action]=await db!.query("SELECT id FROM hr_contract_action WHERE contract_id=$1",[created.id]);
   await assert.rejects(db!.query("UPDATE hr_contract_action SET remark='synthetic-tamper' WHERE id=$1",[action.id]),/append-only/);
   await assert.rejects(db!.query("INSERT INTO hr_contract_action(tenant_id,park_id,contract_id,sequence_no,action,to_status,actor_user_id) VALUES('synthetic-foreign',$1,$2,2,'updated','draft',$3)",[scope.parkId,created.id,actor.sub]),/scope mismatch/);
   assert.equal(await db!.getRepository(HrContractActionEntity).countBy({contractId:created.id}),1);
  });
  await t.test("imported contracts continue on their original IDs while source evidence and normal guards remain",async()=>{
   const f=await fixture({status:"draft",sourceSnapshot:{sourceIdentity:"source-identity",sourceRowHash:"source-row-hash",importReceipt:"receipt-1"}});
   const originalId=f.old.id;
   const updated=await service.updateContract(scope,actor,originalId,{...f.dto,contractNo:f.old.contractNo,startDate:"1900-01-01",endDate:"1901-12-31",positionTitle:"Modern correction"});
   assert.equal(updated.id,originalId);assert.equal(updated.isHistoricalImport,true);
   await service.actContract(scope,actor,originalId,{action:"activate"});
   const draft=await service.createContractChange(scope,actor,originalId,{changeType:"renewal",newStartDate:"2090-01-01",newEndDate:"2091-12-31"});
   await service.actContractChange(scope,actor,originalId,draft.id,{action:"apply"});
   const saved=await contracts.findOneByOrFail({id:originalId});assert.equal(saved.id,originalId);assert.equal(saved.isHistoricalImport,true);assert.equal(saved.sourceSnapshot.sourceIdentity,"source-identity");assert.equal(saved.sourceSnapshot.sourceRowHash,"source-row-hash");assert.equal(saved.sourceSnapshot.importReceipt,"receipt-1");assert.equal(await contracts.countBy({employeeId:f.employee.id}),1);
   await assert.rejects(service.actContractChange(scope,actor,originalId,draft.id,{action:"cancel"}),/Only a draft/u);
   await assert.rejects(service.createContractChange({...scope,parkId:"foreign"},actor,originalId,{changeType:"renewal",newStartDate:"2092-01-01"}),/Contract not found/u);
   await assert.rejects(service.createContract(scope,actor,{...f.dto,baseSalary:"100.00"}),/Compensation management permission/);
  });
 }finally{
  try{if(db?.isInitialized)await db.destroy();await admin.query(`DROP SCHEMA ${schema} CASCADE`);const [row]=await admin.query("SELECT NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname=$1) clean",[schema]);assert.equal(row.clean,true);if(migrated)assert.deepEqual(await admin.query(cryptoCatalog),cryptoBefore,"pgcrypto catalog must return to its original state");}finally{await admin.destroy();}
 }
});
