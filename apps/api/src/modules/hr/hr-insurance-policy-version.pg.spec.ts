import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { DataSource } from "typeorm";
import { HR_INSURANCE_POLICY_PERMISSIONS, HR_PERMISSIONS } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditService } from "../audit/audit.service";
import { LoginLogEntity } from "../audit/entities/login-log.entity";
import { OpLogEntity } from "../audit/entities/op-log.entity";
import { HR_INSURANCE_KINDS } from "./hr-insurance-calculation";
import { HrInsurancePolicyVersionService } from "./hr-insurance-policy-version.service";
import type { CreateHrInsurancePolicyVersionDto } from "./dto/hr-insurance-policy-version.dto";

const enabled=process.env.HR_INSURANCE_POLICY_VERSION_PG==="1";
const scope={tenantId:"insurance-version-fixture",parkId:"insurance-version-fixture"};
const actor:JwtPrincipal={...scope,sub:randomUUID(),username:"synthetic-policy",roles:[],permissions:[HR_PERMISSIONS.HR_INSURANCE_READ,HR_PERMISSIONS.HR_INSURANCE_AMOUNT_READ,HR_INSURANCE_POLICY_PERMISSIONS.VERSION_CREATE]};
let db:DataSource,service:HrInsurancePolicyVersionService;
function request(code=`FIXTURE_${randomUUID().slice(0,8)}`):CreateHrInsurancePolicyVersionDto {
  return {requestId:randomUUID(),policyCode:code,policyName:"合成政策",variantNo:1,effectiveFrom:"2026-01",effectiveThrough:"2026-12",reason:"合成业务依据",
    items:HR_INSURANCE_KINDS.map(insuranceKind=>({insuranceKind,factors: { base: { rate: "0.08", fixedAmount: "0.004" }, employer: { rate: "0.08", fixedAmount: "0.004" }, employee: { rate: "0.08", fixedAmount: "0.004" }, supplement: { rate: "0.08", fixedAmount: "0.004" } }}))};
}
before(async()=>{
  if(!enabled)return;
  assert.match(process.env.POSTGRES_DB??"",/^jinhu_hr_migration_lab_[A-Za-z0-9_]{6,64}$/u);
  assert.equal(process.env.POSTGRES_HOST,"127.0.0.1");assert.equal(process.env.HR_INSURANCE_POLICY_VERSION_ISOLATED,"yes");
  db=new DataSource({type:"postgres",host:process.env.POSTGRES_HOST,port:Number(process.env.POSTGRES_PORT),username:process.env.POSTGRES_USER,password:process.env.POSTGRES_PASSWORD,database:process.env.POSTGRES_DB,entities:[OpLogEntity,LoginLogEntity],synchronize:false});await db.initialize();
  service=new HrInsurancePolicyVersionService(db,new AuditService(db.getRepository(LoginLogEntity),db.getRepository(OpLogEntity)));
});
after(async()=>{if(db?.isInitialized)await db.destroy();});

test("full-schema policy creation freezes exact factors and real audit; canonical replay and conflict",{skip:!enabled},async()=>{
  const dto=request();const result=await service.create(scope,actor,dto);
  assert.equal(result.versionNo,1);assert.equal(result.activated,false);
  const detail=await service.detail(scope,actor,result.id);assert.equal(detail.originKind,"manual");assert.equal((detail.items as typeof dto.items)![0]!.factors.employee.rate,"0.080000");
  const row=(await db.query("SELECT definition_sha256=encode(digest(definition::text,'sha256'),'hex') AS matches FROM hr_insurance_policy_version WHERE id=$1",[result.id]))[0];assert.equal(row.matches,true);
  const replay=await service.create(scope,actor,{...dto,items:[...dto.items!].reverse()});assert.equal(replay.id,result.id);assert.equal(replay.replayed,true);
  await assert.rejects(service.create(scope,actor,{...dto,effectiveThrough:"2027-01"}),/REQUEST_CONFLICT/u);
  await assert.rejects(service.create(scope,{...actor,sub:randomUUID()},dto),/REQUEST_CONFLICT/u);
  assert.equal((await db.query("SELECT count(*)::int n FROM hr_insurance_policy_version WHERE request_id=$1",[dto.requestId]))[0].n,1);
  const audits=await db.query("SELECT after_json FROM sys_op_log WHERE biz_id=$1 AND method='POST' ORDER BY create_time",[result.id]);assert.equal(audits.length,2);
  assert.ok(audits.every((a:{after_json:object})=>!JSON.stringify(a.after_json).includes("0.080000")));
  const catalog=await service.list(scope,actor,{page:1,page_size:1,keyword:dto.policyCode});assert.equal(catalog.total,1);assert.equal(catalog.items[0]!.id,result.id);
  await assert.rejects(service.detail({...scope,parkId:"foreign"},actor,result.id),/NOT_FOUND/u);
  await assert.rejects(service.create(scope,{...actor,permissions:actor.permissions.slice(0,2)},request()),/FORBIDDEN/u);
});

test("full-schema concurrent family and identical request creation preserve one identity and monotonic versions",{skip:!enabled},async()=>{
  const dto=request();const replies=await Promise.all([service.create(scope,actor,dto),service.create(scope,actor,dto)]);
  assert.equal(replies[0].id,replies[1].id);assert.equal(replies.filter(r=>r.replayed).length,1);
  const family=request();const versions=await Promise.all([service.create(scope,actor,family),service.create(scope,actor,{...family,requestId:randomUUID(),reason:"另一个明确版本"})]);
  assert.deepEqual(versions.map(v=>v.versionNo).sort(),[1,2]);assert.notEqual(versions[0].id,versions[1].id);
});

test("full-schema audit failure rolls back policy insert and later retry starts at version one",{skip:!enabled},async()=>{
  const dto=request();await db.query("CREATE FUNCTION insurance_version_fixture_audit_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.resource='hr.insurance_policy_version' THEN RAISE EXCEPTION 'synthetic required audit failure'; END IF; RETURN NEW; END $$");
  await db.query("CREATE TRIGGER insurance_version_fixture_audit_fail BEFORE INSERT ON sys_op_log FOR EACH ROW EXECUTE FUNCTION insurance_version_fixture_audit_fail()");
  try {await assert.rejects(service.create(scope,actor,dto),/synthetic required audit failure/u);assert.equal((await db.query("SELECT count(*)::int n FROM hr_insurance_policy_version WHERE request_id=$1",[dto.requestId]))[0].n,0);}finally{await db.query("DROP TRIGGER insurance_version_fixture_audit_fail ON sys_op_log");await db.query("DROP FUNCTION insurance_version_fixture_audit_fail()");}
  assert.equal((await service.create(scope,actor,dto)).versionNo,1);
});

test("full-schema SQL update/delete/truncate and malformed definition are rejected",{skip:!enabled},async()=>{
  const result=await service.create(scope,actor,request());
  for(const sql of ["UPDATE hr_insurance_policy_version SET policy_name='变更' WHERE id=$1","DELETE FROM hr_insurance_policy_version WHERE id=$1"])
    await assert.rejects(db.query(sql,[result.id]),/IMMUTABLE/u);
  await assert.rejects(db.query("TRUNCATE hr_insurance_policy_version"),/IMMUTABLE/u);
  const original=(await db.query("SELECT definition FROM hr_insurance_policy_version WHERE id=$1",[result.id]))[0].definition;
  for(const patch of [{items:[]},{origin:{}},{tenantId:"foreign"},{items:original.items.map((i:unknown)=>i)}]){
    const definition={...original,...patch};if(patch.items?.length)definition.items[0].factors.employee.rate=null;
    await assert.rejects(db.query("INSERT INTO hr_insurance_policy_version(tenant_id,park_id,request_id,request_sha256,policy_code,policy_name,variant_no,version_no,effective_from,effective_through,created_by,definition) SELECT tenant_id,park_id,$2,request_sha256,policy_code,policy_name,variant_no,version_no+99,effective_from,effective_through,created_by,$3::jsonb FROM hr_insurance_policy_version WHERE id=$1",[result.id,randomUUID(),JSON.stringify({...definition,versionNo:100})]),/check constraint/u);
  }
});

test("full-schema imported policy copy checks scope/version and retains immutable source lineage",{skip:!enabled},async()=>{
  const policyId=randomUUID();await db.query("INSERT INTO hr_insurance_policy(id,tenant_id,park_id,policy_code,policy_name) VALUES($1,$2,$3,$4,'合成历史政策')",[policyId,scope.tenantId,scope.parkId,`SOURCE_${policyId.slice(0,8)}`]);
  for(const kind of HR_INSURANCE_KINDS)await db.query("INSERT INTO hr_insurance_policy_item(tenant_id,park_id,policy_id,insurance_kind,variant_no,base_rate,employer_rate,employee_rate,supplement_rate) VALUES($1,$2,$3,$4,1,0.1,0.2,0.08,0)",[scope.tenantId,scope.parkId,policyId,kind]);
  const dto={...request(),items:undefined,sourcePolicyId:policyId,expectedSourceVersion:1};
  await assert.rejects(service.create({...scope,parkId:"foreign"},{...actor,parkId:"foreign"},dto),/SOURCE_NOT_FOUND/u);
  await assert.rejects(service.create(scope,actor,{...dto,expectedSourceVersion:2}),/SOURCE_CHANGED/u);
  const result=await service.create(scope,actor,dto);const frozen=(await db.query("SELECT definition FROM hr_insurance_policy_version WHERE id=$1",[result.id]))[0].definition;
  assert.match(frozen.origin.factorsHash,/^[0-9a-f]{64}$/u);assert.equal(frozen.origin.policyId,policyId);assert.equal(frozen.items[0].factors.employee.fixedAmount,null);
  await db.query("UPDATE hr_insurance_policy SET version=2 WHERE id=$1",[policyId]);
  await db.query("UPDATE hr_insurance_policy_item SET employee_rate=0.09 WHERE policy_id=$1",[policyId]);
  assert.equal((await service.create(scope,actor,dto)).id,result.id);
  assert.deepEqual((await db.query("SELECT definition FROM hr_insurance_policy_version WHERE id=$1",[result.id]))[0].definition,frozen);
  await db.query("UPDATE hr_insurance_policy_item SET employee_rate=NULL WHERE policy_id=$1",[policyId]);
  await assert.rejects(service.create(scope,actor,{...dto,requestId:randomUUID(),expectedSourceVersion:2}),/missing or invalid/u);
});

test("full-schema source parent lock blocks child insert phantoms until definition and real audit commit",{skip:!enabled},async()=>{
  const policyId=randomUUID();await db.query("INSERT INTO hr_insurance_policy(id,tenant_id,park_id,policy_code,policy_name) VALUES($1,$2,$3,$4,'合成锁验证政策')",[policyId,scope.tenantId,scope.parkId,`LOCK_${policyId.slice(0,8)}`]);
  for(const kind of HR_INSURANCE_KINDS)await db.query("INSERT INTO hr_insurance_policy_item(tenant_id,park_id,policy_id,insurance_kind,variant_no,base_rate,employer_rate,employee_rate,supplement_rate) VALUES($1,$2,$3,$4,1,0.1,0.2,0.08,0)",[scope.tenantId,scope.parkId,policyId,kind]);
  let entered!:()=>void,release!:()=>void;const reached=new Promise<void>(resolve=>{entered=resolve;});const gate=new Promise<void>(resolve=>{release=resolve;});
  const gatedAudit=new AuditService(db.getRepository(LoginLogEntity),db.getRepository(OpLogEntity));const record=gatedAudit.recordOperationRequired.bind(gatedAudit);
  gatedAudit.recordOperationRequired=async(input,manager)=>{entered();await gate;await record(input,manager);};
  const pending=new HrInsurancePolicyVersionService(db,gatedAudit).create(scope,actor,{...request(),items:undefined,sourcePolicyId:policyId,expectedSourceVersion:1});
  const reachedOrFailed=Promise.race([reached,pending.then(()=>{throw new Error("audit gate bypassed");})]);
  const competitor=db.createQueryRunner();
  try{
    await reachedOrFailed;await competitor.connect();await competitor.startTransaction();await competitor.query("SET LOCAL lock_timeout='200ms'");
    await assert.rejects(competitor.query("INSERT INTO hr_insurance_policy_item(tenant_id,park_id,policy_id,insurance_kind,variant_no) VALUES($1,$2,$3,'oldage',2)",[scope.tenantId,scope.parkId,policyId]),(error:unknown)=>(error as {driverError:{code:string}}).driverError.code==="55P03");
  }finally{
    if(competitor.isTransactionActive)await competitor.rollbackTransaction();await competitor.release();release();
  }
  const result=await pending;assert.equal((await db.query("SELECT count(*)::int n FROM hr_insurance_policy_item WHERE policy_id=$1",[policyId]))[0].n,6);
  assert.equal((await db.query("SELECT count(*)::int n FROM sys_op_log WHERE biz_id=$1 AND method='POST'",[result.id]))[0].n,1);
});
