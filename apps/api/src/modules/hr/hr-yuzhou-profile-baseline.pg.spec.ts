import "reflect-metadata";
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";
import { DataSource, EntityManager } from "typeorm";
import { PartySensitiveDataService } from "../../shared/security/party-sensitive-data.service";
import { HrYuzhouIncrementalImportService } from "./hr-yuzhou-incremental-import.service";
import { HrEmployeeProfileEntity, HrEmployeeEntity, HrContractEntity, HrContractTypeEntity, HrContractActionEntity } from "./entities/hr.entities";
import { canonicalYuzhouInitialJson, YUZHOU_INITIAL_CANONICALIZATION, YUZHOU_INITIAL_PROJECTION_FIELDS, type YuzhouIncrementalItem } from "@jinhu/shared";
import { plainToInstance } from "class-transformer";
import { validateOrReject } from "class-validator";
import { PreviewYuzhouIncrementalImportDto } from "./dto/yuzhou-incremental-import.dto";

const root=resolve(__dirname,"../../../../.."),sha=(s:string)=>createHash("sha256").update(s).digest("hex");
const scope={tenantId:"baseline-tenant",parkId:"baseline-park"};
const actor={sub:randomUUID(),isSuper:true,permissions:["*"]} as never;
const operationId="yzprod-import-20261004T120000Z-123456abcdef";
type Input=Omit<YuzhouIncrementalItem,"rowDigest">;
const result=(value:unknown)=>value as {id:string;status:string;appliedCount:number;unchangedCount:number;plan:Array<{action:string;conflictFields:string[]}>};

test("T5 profile CLI continuity: original-set certificate, raw bridge, CAS and immutable provenance",{skip:process.env.HR_YUZHOU_PROFILE_BASELINE_PG_REQUIRED!=="1",timeout:90000},async t=>{
  assert.equal(process.env.POSTGRES_HOST,"127.0.0.1"); assert.equal(process.env.POSTGRES_PORT,"55491");
  const database=`jinhu_hr_profile_lab_${randomBytes(12).toString("hex")}`;
  assert.match(database,/^jinhu_hr_profile_lab_[a-f0-9]{24}$/);
  const connection={type:"postgres" as const,host:"127.0.0.1",port:55491,username:process.env.POSTGRES_USER,password:process.env.POSTGRES_PASSWORD,database};
  const admin=new DataSource({...connection,database:"postgres"});await admin.initialize();
  let db:DataSource|undefined,created=false;
  try {
    await admin.query(`CREATE DATABASE "${database}" TEMPLATE template0`);created=true;
    db=new DataSource({...connection,synchronize:true,entities:[HrEmployeeProfileEntity,HrEmployeeEntity,HrContractEntity,HrContractTypeEntity,HrContractActionEntity]});await db.initialize();
    assert.equal((await db.query(`SELECT current_database() AS name`))[0].name,database);
    await db.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; CREATE TABLE hr_legacy_identity_registry(owner_record_map_id uuid,mapping_status varchar(32));`);
    for(const prefix of ["000235_hr_legacy_migration_control","000278_hr_yuzhou_production_import_control","000281_hr_yuzhou_production_import_control_v2","000282_hr_yuzhou_production_import_writer_receipts","000327_hr_yuzhou_incremental_import_ledger","000329_hr_incremental_initial_baseline","000331_hr_incremental_org_position"]) await db.query(readFileSync(resolve(root,`database/migrations/${prefix}.sql`),"utf8"));
    await db.query(`CREATE UNIQUE INDEX profile_employee_fixture ON hr_employee_profile(tenant_id,park_id,employee_id) WHERE NOT is_deleted; CREATE UNIQUE INDEX employee_scope_fixture ON hr_employee(tenant_id,park_id,id); CREATE UNIQUE INDEX profile_identity_fixture ON hr_employee_profile(tenant_id,park_id,id_number_fingerprint) WHERE NOT is_deleted AND id_number_fingerprint IS NOT NULL;`);
    const sensitive=new PartySensitiveDataService({get:(key:string)=>key==="PARTY_DATA_ENCRYPTION_KEY"?"baseline-fixture-only-encryption-key-1234567890":undefined} as never);
    const service=new HrYuzhouIncrementalImportService(db,sensitive);
    await db.query(`CREATE TABLE sys_org(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,parent_id uuid,org_code varchar(64) NOT NULL,org_name varchar(100) NOT NULL,org_type varchar(32) NOT NULL,status varchar(32) NOT NULL DEFAULT 'enabled',sort_order integer NOT NULL DEFAULT 0,remark text,version integer NOT NULL DEFAULT 1,is_deleted boolean NOT NULL DEFAULT false,create_by uuid,update_by uuid,create_time timestamptz NOT NULL DEFAULT now(),update_time timestamptz NOT NULL DEFAULT now(),UNIQUE(tenant_id,park_id,id),UNIQUE(tenant_id,park_id,org_code),FOREIGN KEY(tenant_id,park_id,parent_id) REFERENCES sys_org(tenant_id,park_id,id));`);
    // A fresh accepted source organization supports the actual CLI's new active
    // employee; original T0/T5 receipts below remain unchanged.
    const newOrg:Input={domain:"organization",sourceTable:"dbo.departmentcode",sourceKey:`sha256:${sha("dbo.departmentcode\0INC-ORG")}`,fields:{orgCode:"INC-ORG",orgName:"Synthetic organization",orgType:"department",status:"enabled"}};
    const newOrgPreview=result(await service.preview(scope,actor,{version:1,sourceSystem:"yuzhou-v10",manifestId:randomUUID(),extractedAt:"2026-10-04T12:00:00Z",items:[{...newOrg,rowDigest:sha(canonicalYuzhouInitialJson({...newOrg,sourceUpdatedAt:null}))}]}));
    assert.equal(result(await service.commit(scope,actor,newOrgPreview.id)).status,"committed");
    const orgId=randomUUID(),typeId=randomUUID(),positionId=randomUUID();
    await db.getRepository(HrContractTypeEntity).save({id:typeId,...scope,typeCode:"fixed",typeName:"Fixed",status:"enabled"});
    const employees:Input[]=[];
    for(let i=0;i<12;i++) {
      const employee=await db.getRepository(HrEmployeeEntity).save({...scope,employeeCode:`OLD-${i}`,fullName:`Original ${i}`,employmentType:"full_time",employmentStatus:"active",hireDate:"2020-01-01"});
      const projection:Record<string,unknown>=Object.fromEntries(YUZHOU_INITIAL_PROJECTION_FIELDS.hr_employee.map(k=>[k,null]));
      Object.assign(projection,{tenant_id:scope.tenantId,park_id:scope.parkId,employee_code:employee.employeeCode,full_name:employee.fullName,employment_type:"full_time",employment_status:"active",hire_date:"2020-01-01",primary_org_id:orgId,position_id:i===10?positionId:null});
      employees.push({domain:"employee",sourceTable:"dbo.person",sourceKey:`sha256:${sha(`dbo.person\0OLD-${i}`)}`,fields:{employeeCode:employee.employeeCode,fullName:employee.fullName,employmentType:"full_time",employmentStatus:"active",hireDate:"2020-01-01"},initialBaselineWitness:{version:1,operationId,phase:"T0",canonicalizationVersion:YUZHOU_INITIAL_CANONICALIZATION,targetId:employee.id,projection}});
    }
    const contracts:Input[]=[];
    for(let i=0;i<2;i++) {
      const contract=await db.getRepository(HrContractEntity).save({...scope,employeeId:employees[i]!.initialBaselineWitness!.targetId,contractTypeId:typeId,contractNo:`ORIG-C-${i}`,startDate:"2020-01-01",endDate:"2030-01-01",status:i===0?"draft":"active",isHistoricalImport:true});
      const identity=sha(`contract-${i}`),rowHash=sha(`contract-row-${i}`);
      const projection:Record<string,unknown>=Object.fromEntries(YUZHOU_INITIAL_PROJECTION_FIELDS.hr_contract.map(k=>[k,null]));
      Object.assign(projection,{tenant_id:scope.tenantId,park_id:scope.parkId,contract_no:contract.contractNo,start_date:"2020-01-01",end_date:"2030-01-01",status:contract.status,employee_id:contract.employeeId,contract_type_id:typeId,legacy_source_identity_sha256:identity,legacy_source_row_sha256:rowHash,source_snapshot:{"10":"ten","2":"two",nested:{b:null,a:true}},is_historical_import:true,renewal_count:0,confidentiality_agreement:false,non_compete_agreement:false,training_service_agreement:false,legacy_text_present:false});
      contracts.push({domain:"contract",sourceTable:"dbo.compact",sourceKey:`sha256:${identity}`,fields:{employeeSourceKey:employees[i]!.sourceKey,employeeSourceTable:"dbo.person",contractTypeId:typeId,contractStatus:contract.status,contractNo:contract.contractNo,startDate:"2020-01-01",endDate:"2030-01-01"},initialBaselineWitness:{version:1,operationId,phase:"T2",canonicalizationVersion:YUZHOU_INITIAL_CANONICALIZATION,targetId:contract.id,projection}});
    }
    // Compute hashes with the ORIGINAL writer, not the API implementation under test.
    const fixtureRows=[...employees,...contracts].map(item=>({table:item.domain==="employee"?"hr_employee":"hr_contract",projection:item.initialBaselineWitness!.projection}));
    const hashes=JSON.parse(execFileSync(process.execPath,["--input-type=module","-e",`import {readFileSync} from 'node:fs'; import {computeProductionImportTargetCanonicalHash as hash} from './scripts/hr-cutover/production-import-target-model.mjs'; const rows=JSON.parse(readFileSync(0,'utf8')); console.log(JSON.stringify(rows.map(r=>hash(r.table,{tenantId:r.projection.tenant_id,parkId:r.projection.park_id},r.projection,r.projection))));`],{cwd:root,input:JSON.stringify(fixtureRows),encoding:"utf8"})) as string[];
    await db.transaction("SERIALIZABLE",async m=>{
      const h=sha("fixture");
      await m.query(`INSERT INTO hr_yuzhou_production_import_operation(operation_id,intent,status,code_sha,source_snapshot_sha256,mapping_contract_sha256,sealed_plan_sha256,target_identity_sha256,authorization_artifact_sha256,authorization_nonce_sha256,authorization_issued_at,authorization_expires_at,window_starts_at,window_ends_at,approval_set_sha256,manifest_sha256,final_rehearsal_pair_sha256,rehearsal_a_manifest_sha256,rehearsal_b_manifest_sha256,phase_order,execution_contract_version,target_tenant_id,target_park_id,target_scope_sha256) VALUES($1,'production_import','running',$2,$3,$3,$3,$3,$3,$3,now()-interval '1 hour',now()+interval '1 hour',now()-interval '2 hours',now()+interval '2 hours',$3,$3,$3,$3,$4,'["T0","T1","T2","T3"]',2,$5,$6,$7)`,[operationId,"a".repeat(40),h,sha("B"),scope.tenantId,scope.parkId,sha(`yuzhou-hr-production-target-scope-v1\0${scope.tenantId}\0${scope.parkId}`)]);
      for(const [ordinal,phase] of ["T0","T1","T2","T3"].entries()) await m.query(`INSERT INTO hr_yuzhou_production_import_phase(operation_id,phase,phase_ordinal,status,source_batch_manifest_sha256,planned_record_count,before_canonical_sha256,payload_bundle_artifact_sha256,payload_bundle_sha256,canonicalization_version) VALUES($1,$2,$3,'planned',$4,30,$4,$4,$4,$5)`,[operationId,phase,ordinal,h,YUZHOU_INITIAL_CANONICALIZATION]);
      for(const phase of ["T0","T1","T2","T3"]) {
        await m.query(`UPDATE hr_yuzhou_production_import_operation SET current_phase=$2 WHERE operation_id=$1`,[operationId,phase]);
        await m.query(`UPDATE hr_yuzhou_production_import_phase SET status='running' WHERE operation_id=$1 AND phase=$2`,[operationId,phase]);
        const batch=(await m.query(`INSERT INTO migration_batch(run_id,source_system,source_snapshot_sha256,target_database,tool_version,execution_context,production_import_operation_id,production_import_phase,status) VALUES($1,'yuzhou-v10',$2,current_database(),$3,'production_import',$4,$5,'succeeded') RETURNING id`,[`${operationId}-${phase.toLowerCase()}`,h,`prod-import-v2@${"a".repeat(40)}`,operationId,phase]))[0].id;
        const add=async(identity:string,sourceTable:string,table:string,id:string,after:string,rowHash:string,dependencies:Array<[string,string,string,string]>)=>{
          await m.query(`INSERT INTO hr_yuzhou_production_import_record(operation_id,phase,source_identity_sha256,source_row_sha256,disposition,target_table,planned_target_table,target_id,target_after_sha256,source_system,source_table,source_pk_canonical,business_identity_sha256,target_version_after,owner_source_identity_sha256) VALUES($1,$2,$3,$4,'insert',$5,$5,$6,$7,'yuzhou-v10',$8,$9,$10,1,$11)`,[operationId,phase,identity,rowHash,table,id,after,sourceTable,`sha256:${identity}`,h,null]);
          for(const [role,depPhase,depIdentity,depTable] of dependencies) await m.query(`INSERT INTO hr_yuzhou_production_import_record_dependency VALUES($1,$2,$3,$4,$5,$6,$7)`,[operationId,phase,identity,role,depPhase,depIdentity,depTable]);
          const map=(await m.query(`INSERT INTO legacy_record_map(batch_id,source_system,source_table,source_pk_canonical,source_identity_sha256,source_row_sha256,target_table,target_id,mapping_status) VALUES($1,'yuzhou-v10',$2,$3,$4,$5,$6,$7,'verified') RETURNING id`,[batch,sourceTable,`sha256:${identity}`,identity,rowHash,table,id]))[0].id;
          await m.query(`INSERT INTO hr_yuzhou_production_import_projection_receipt(operation_id,phase,source_identity_sha256,migration_batch_id,legacy_record_map_id) VALUES($1,$2,$3,$4,$5)`,[operationId,phase,identity,batch,map]);
        };
        if(phase==="T0") {
          await add(sha("org"),"dbo.departmentcode","sys_org",orgId,h,h,[]);
          await add(sha("position"),"dbo.job","hr_position",positionId,h,h,[["org","T0",sha("org"),"sys_org"]]);
          for(const [i,item] of employees.entries()) await add(item.sourceKey.slice(7),item.sourceTable,"hr_employee",item.initialBaselineWitness!.targetId,hashes[i]!,h,[["primary_org","T0",sha("org"),"sys_org"],...(i===10?[["position","T0",sha("position"),"hr_position"] as [string,string,string,string]]:[])]);
        }
        if(phase==="T2") {
          await add(sha("type"),"dbo.compacttypecode","hr_contract_type",typeId,h,h,[]);
          for(const [i,item] of contracts.entries()) await add(item.sourceKey.slice(7),item.sourceTable,"hr_contract",item.initialBaselineWitness!.targetId,hashes[employees.length+i]!,sha(`contract-row-${i}`),[["employee","T0",employees[i]!.sourceKey.slice(7),"hr_employee"],["contract_type","T2",sha("type"),"hr_contract_type"]]);
        }
        await m.query(`UPDATE hr_yuzhou_production_import_phase SET status='succeeded',finished_at=now() WHERE operation_id=$1 AND phase=$2`,[operationId,phase]);
      }
      await m.query(`UPDATE hr_yuzhou_production_import_operation SET status='succeeded',finished_at=now() WHERE operation_id=$1`,[operationId]);
    });
    // Apply real T5 schema and guards; seed a declared small synthetic original
    // set under replica mode solely for historical receipt fixture installation.
    await db.query(`CREATE TABLE hr_yuzhou_t4_followon_operation(operation_id varchar(64) PRIMARY KEY,parent_operation_id varchar(64),binding_sha256 char(64),status varchar(16)); ALTER TABLE migration_batch ADD COLUMN t4_followon_operation_id varchar(64);`);
    await db.query(readFileSync(resolve(root,"database/migrations/000317_hr_yuzhou_t5_followon.sql"),"utf8"));
    await db.query(readFileSync(resolve(root,"database/migrations/000330_hr_incremental_profile_baseline.sql"),"utf8"));
    const originalOperation="yzprod-import-20261004T130000Z-abcdef123456",payrollOperation="yzprod-import-20261004T125000Z-abcdef123456";
    const originalSource={id:7,person:"OLD-0",sex:"女",birthday:"1990-02-03T00:00:00",handtel:"13000000000",email:"source@example.test",addr:"Original address",idcard:" ab c ",unknownExtension:"pending"};
    const profileIdentity=sha("dbo.person.core_residue\0"+originalSource.id),sourceHash=sha(canonicalYuzhouInitialJson(originalSource));
    const binding={formatVersion:1,artifactKind:"yuzhou_t5_followon_binding",operationId:originalOperation,intent:"APPEND_T5_FULL_HISTORY_ONCE",executionCodeSha:"7c3df1c230bde74badbf414acae36030d5fe8709",sourceMappingContractSha256:"d44b0f904fb3240d45a52b8dc8a3510ce5622ecb6f7f41356fbe6e48fa53b7e0",triple:{sourceSnapshotHash:sha("fixture")},targetScope:scope,targetScopeSha256:sha(`yuzhou-hr-production-target-scope-v1\0${scope.tenantId}\0${scope.parkId}`),parent:{operationId,sealedPlanSha256:sha("fixture")},payrollParent:{operationId:payrollOperation,bindingSha256:sha("payroll")}};
    const bindingHash=sha(canonicalYuzhouInitialJson(binding));
    const protectedId=sensitive.identityProfile("ab c");
    const profile=await db.getRepository(HrEmployeeProfileEntity).save({...scope,employeeId:employees[0]!.initialBaselineWitness!.targetId,gender:"女",dateOfBirth:"1990-02-03",personalMobile:originalSource.handtel,personalEmail:originalSource.email,address:originalSource.addr,idType:"resident_id",idNumberEncrypted:protectedId.encrypted,idNumberMasked:protectedId.masked,idNumberFingerprint:protectedId.hash,legacySourceIdentitySha256:profileIdentity,legacySourceRowSha256:sourceHash});
    await db.transaction(async m=>{
      await m.query(`SET LOCAL session_replication_role=replica`);
      await m.query(`INSERT INTO hr_yuzhou_t4_followon_operation VALUES($1,$2,$3,'succeeded')`,[payrollOperation,operationId,sha("payroll")]);
      await m.query(`INSERT INTO hr_yuzhou_t5_followon_operation(operation_id,parent_operation_id,payroll_operation_id,binding_sha256,binding,status,finished_at) VALUES($1,$2,$3,$4,$5,'succeeded',now())`,[originalOperation,operationId,payrollOperation,bindingHash,binding]);
      await m.query(`INSERT INTO migration_batch(run_id,source_system,source_snapshot_sha256,target_database,execution_context,t5_followon_operation_id,status,tool_version) VALUES($1,'yuzhou-v10',$2,current_database(),'t5_production_followon',$1,'succeeded',$3)`,[originalOperation,sha("fixture"),`t5-followon-v1@${binding.executionCodeSha}`]);
      const map=(await m.query(`SELECT id FROM legacy_record_map WHERE source_identity_sha256=$1`,[employees[0]!.sourceKey.slice(7)]))[0].id;
      const sourceId=(await m.query(`INSERT INTO hr_yuzhou_t5_followon_source(operation_id,tenant_id,park_id,source_domain,source_table,source_identity_sha256,source_row_sha256,encrypted_source,owner_status,employee_id,owner_record_map_id) VALUES($1,$2,$3,'person_core','dbo.person.core_residue',$4,$5,$6,'mapped',$7,$8) RETURNING id`,[originalOperation,scope.tenantId,scope.parkId,profileIdentity,sourceHash,sensitive.encrypt(JSON.stringify(originalSource)),profile.employeeId,map]))[0].id;
      for(const [table,id] of [["hr_employee_profile",profile.id],["hr_yuzhou_t5_followon_source",sourceId]])await m.query(`INSERT INTO hr_yuzhou_t5_followon_projection_receipt VALUES($1,$2,$3,$4,'insert',$5,NULL)`,[originalOperation,table,profileIdentity,sourceHash,id]);
      // Original PostgreSQL algorithm (not the new verifier) freezes commitment.
      await m.query(`SET LOCAL TIME ZONE 'Asia/Shanghai'`);
      const agg=async(q:string)=>(await m.query(`SELECT count(*)::int AS count,encode(digest(COALESCE(string_agg(h,'' ORDER BY h),''),'sha256'),'hex') sha256 FROM (SELECT encode(digest(to_jsonb(x)::text,'sha256'),'hex') h FROM (${q}) x) a`))[0];
      const profiles=await agg(`SELECT * FROM hr_employee_profile WHERE id='${profile.id}'`),receipts=await agg(`SELECT * FROM hr_yuzhou_t5_followon_projection_receipt WHERE operation_id='${originalOperation}'`);
      await m.query(`UPDATE hr_yuzhou_t5_followon_operation SET owned_state=$2 WHERE operation_id=$1`,[originalOperation,{hr_employee_profile:profiles,receipts}]);
    });
    const fixtureRoot=mkdtempSync(resolve(realpathSync(tmpdir()),"yuzhou-profile-fixture-"));
    let batch=0;
    const produce=(source:typeof originalSource,witness?:unknown,includeEmployees=false)=>{
      const path=resolve(fixtureRoot,`source-${batch}.json`),out=resolve(fixtureRoot,`batch-${batch++}`);
      writeFileSync(path,JSON.stringify({sources:[source],scope,witness,includeEmployees}),{mode:0o600});
      const output=JSON.parse(execFileSync(process.execPath,["scripts/e2e/yuzhou-profile-staging-fixture.mjs","--root",out,"--source",path],{cwd:root,encoding:"utf8"}));
      return JSON.parse(readFileSync(output.packagePath,"utf8")) as PreviewYuzhouIncrementalImportDto;
    };
    const witness={version:1,proof:"original_t5_whole_set_v1",operationId:originalOperation,bindingSha256:bindingHash};
    const commit=async(dto:PreviewYuzhouIncrementalImportDto)=>{const preview=result(await service.preview(scope,actor,dto));return {preview,outcome:result(await service.commit(scope,actor,preview.id))};};
    const business=async()=>await db!.query(`SELECT to_jsonb(p) AS row FROM hr_employee_profile p ORDER BY id`);
    try {
      const anchored=produce(originalSource,witness);await validateOrReject(plainToInstance(PreviewYuzhouIncrementalImportDto,anchored),{whitelist:true,forbidNonWhitelisted:true});
      const unknown=result(await service.preview(scope,actor,produce(originalSource)));assert.equal(unknown.plan[0]!.action,"conflict");assert.ok(unknown.plan[0]!.conflictFields.includes("INITIAL_FIELD_BASELINE_UNKNOWN"));
      // Certification must reject current-target edits, wrong scope and original
      // receipt/rollback tampering before admitting any baseline ledger row.
      await assert.rejects(service.preview({...scope,parkId:"wrong-scope"},actor,anchored),/PROFILE_ORIGINAL_EVIDENCE_INVALID/);
      const originalAddress=(await db.query(`SELECT address FROM hr_employee_profile WHERE id=$1`,[profile.id]))[0].address;
      await db.query(`UPDATE hr_employee_profile SET address='unaccepted modern edit' WHERE id=$1`,[profile.id]);
      await assert.rejects(service.preview(scope,actor,anchored),/PROFILE_ORIGINAL_SET_CHANGED/);
      await db.query(`UPDATE hr_employee_profile SET address=$2 WHERE id=$1`,[profile.id,originalAddress]);
      const historicalMutation=async(sql:string,args:unknown[])=>db!.transaction(async m=>{await m.query(`SET LOCAL session_replication_role=replica`);await m.query(sql,args);});
      await historicalMutation(`UPDATE hr_yuzhou_t5_followon_operation SET status='rolled_back',rolled_back_at=now() WHERE operation_id=$1`,[originalOperation]);
      await assert.rejects(service.preview(scope,actor,anchored),/PROFILE_ORIGINAL_EVIDENCE_INVALID/);
      await historicalMutation(`UPDATE hr_yuzhou_t5_followon_operation SET status='succeeded',rolled_back_at=NULL WHERE operation_id=$1`,[originalOperation]);
      await historicalMutation(`UPDATE hr_yuzhou_t5_followon_projection_receipt SET source_row_sha256=$2 WHERE operation_id=$1 AND target_table='hr_yuzhou_t5_followon_source'`,[originalOperation,sha("tampered")]);
      await assert.rejects(service.preview(scope,actor,anchored),/PROFILE_ORIGINAL_EVIDENCE_INVALID/);
      await historicalMutation(`UPDATE hr_yuzhou_t5_followon_projection_receipt SET source_row_sha256=$2 WHERE operation_id=$1 AND target_table='hr_yuzhou_t5_followon_source'`,[originalOperation,sourceHash]);
      assert.equal((await db.query(`SELECT count(*)::int n FROM hr_incremental_profile_baseline`))[0].n,0);
      // Actual competing connections must wait behind initial set/operation
      // locks, rather than mutate certified rows or begin original rollback.
      let locked!:()=>void,unlock!:()=>void;const lockReached=new Promise<void>(done=>{locked=done}),unlockPromise=new Promise<void>(done=>{unlock=done});
      const lockingDb=Object.create(db!) as DataSource;
      lockingDb.transaction=(async(fn:(m:EntityManager)=>Promise<unknown>)=>db!.transaction(async m=>{const proxy=Object.create(m) as EntityManager;proxy.query=async(sql:string,args?:unknown[])=>{const out=await m.query(sql,args);if(sql.startsWith("LOCK TABLE hr_employee_profile")){locked();await unlockPromise;}return out;};return fn(proxy);})) as DataSource["transaction"];
      const lockedPreview=new HrYuzhouIncrementalImportService(lockingDb,sensitive).preview(scope,actor,{...anchored,manifestId:randomUUID()});await lockReached;
      let modernSettled=false,rollbackSettled=false,ownerSettled=false;
      const waitingModern=db.query(`UPDATE hr_employee_profile SET address=address WHERE id=$1`,[profile.id]).then(()=>{modernSettled=true;});
      const waitingOwner=db.query(`UPDATE hr_employee SET full_name=full_name WHERE id=$1`,[profile.employeeId]).then(()=>{ownerSettled=true;});
      const waitingRollback=db.transaction(async m=>{await m.query(`SELECT operation_id FROM hr_yuzhou_t5_followon_operation WHERE operation_id=$1 FOR UPDATE`,[originalOperation]);rollbackSettled=true;});
      await new Promise(done=>setTimeout(done,100));assert.equal(modernSettled,false);assert.equal(rollbackSettled,false);assert.equal(ownerSettled,false);unlock();
      await lockedPreview;await Promise.all([waitingModern,waitingRollback,waitingOwner]);
      const before=await business();
      const staged=result(await service.preview(scope,actor,anchored));
      const failingDb=Object.create(db!) as DataSource;
      failingDb.transaction=(async(fn:(m:EntityManager)=>Promise<unknown>)=>db!.transaction(async m=>{const proxy=Object.create(m) as EntityManager;proxy.query=async(sql:string,args?:unknown[])=>{const out=await m.query(sql,args);if(sql.startsWith("INSERT INTO hr_incremental_profile_baseline"))throw new Error("synthetic post-certificate failure");return out;};return fn(proxy);})) as DataSource["transaction"];
      await assert.rejects(new HrYuzhouIncrementalImportService(failingDb,sensitive).commit(scope,actor,staged.id),/post-certificate failure/);
      assert.equal((await db.query(`SELECT count(*)::int n FROM hr_incremental_profile_baseline`))[0].n,0);assert.deepEqual(await business(),before);
      assert.equal(result(await service.status(scope,actor,staged.id)).status,"previewed");
      const initial=await commit(anchored);assert.equal(staged.plan[0]!.action,"unchanged");assert.equal(initial.outcome.unchangedCount,1);assert.deepEqual(await business(),before);
      assert.equal(result(await service.commit(scope,actor,initial.preview.id)).unchangedCount,1);
      assert.equal((await commit(produce(originalSource))).outcome.unchangedCount,1);assert.deepEqual(await business(),before);
      await assert.rejects(db.query(`UPDATE hr_incremental_profile_baseline SET created_at=now()`),/IMMUTABLE/);
      // No whole-set gate after acceptance; modern edits remain intact.
      await db.query(`UPDATE hr_employee_profile SET english_name='Modern name',version=version+1 WHERE id=$1`,[profile.id]);
      assert.equal((await commit(produce({...originalSource,addr:"Source address revision"}))).outcome.appliedCount,1);
      assert.deepEqual((await db.query(`SELECT address,english_name FROM hr_employee_profile WHERE id=$1`,[profile.id]))[0],{address:"Source address revision",english_name:"Modern name"});
      await db.query(`UPDATE hr_employee_profile SET address='Modern address',version=version+1 WHERE id=$1`,[profile.id]);
      assert.equal((await commit(produce({...originalSource,addr:"Competing source address"}))).outcome.status,"conflicted");
      assert.equal((await db.query(`SELECT address FROM hr_employee_profile WHERE id=$1`,[profile.id]))[0].address,"Modern address");
      // Two connections: after observation, a modern writer advances version.
      const dto=produce({...originalSource,addr:"Source address revision",handtel:"13100000000"}),preview=result(await service.preview(scope,actor,dto));
      let reached!:()=>void,release!:()=>void;const barrier=new Promise<void>(done=>{reached=done}),resume=new Promise<void>(done=>{release=done});let paused=false;
      const raceDb=Object.create(db!) as DataSource;raceDb.transaction=(async(fn:(m:EntityManager)=>Promise<unknown>)=>db!.transaction(async m=>{const proxy=Object.create(m) as EntityManager;proxy.query=async(sql:string,args?:unknown[])=>{const out=await m.query(sql,args);if(!paused&&sql.startsWith("SELECT *,")&&sql.includes("FROM hr_employee_profile")){paused=true;reached();await resume;}return out;};return fn(proxy);})) as DataSource["transaction"];
      const countsBefore=await db.query(`SELECT count(*)::int n FROM hr_incremental_import_revision`);
      const pending=new HrYuzhouIncrementalImportService(raceDb,sensitive).commit(scope,actor,preview.id);
      await Promise.race([barrier,new Promise((_,reject)=>setTimeout(()=>reject(new Error("profile CAS barrier timeout")),3000))]);
      await db.query(`UPDATE hr_employee_profile SET english_name='CAS modern',version=version+1 WHERE id=$1`,[profile.id]);release();await assert.rejects(pending,/changed concurrently/);
      assert.deepEqual(await db.query(`SELECT count(*)::int n FROM hr_incremental_import_revision`),countsBefore);assert.equal(result(await service.status(scope,actor,preview.id)).status,"previewed");
      // Protected comparison uses fingerprints, so random encryption and old
      // trim-only spelling neither overwrite unchanged ID nor invent a conflict.
      const beforeId=(await db.query(`SELECT id_number_encrypted FROM hr_employee_profile WHERE id=$1`,[profile.id]))[0].id_number_encrypted;
      assert.equal((await commit(produce({...originalSource,addr:"Source address revision",handtel:"13100000000"}))).outcome.appliedCount,1);
      assert.equal((await db.query(`SELECT id_number_encrypted FROM hr_employee_profile WHERE id=$1`,[profile.id]))[0].id_number_encrypted,beforeId);
      const modernId=sensitive.identityProfile("MODERN-ID");
      await db.query(`UPDATE hr_employee_profile SET id_number_encrypted=$2,id_number_masked=$3,id_number_fingerprint=$4,version=version+1 WHERE id=$1`,[profile.id,modernId.encrypted,modernId.masked,modernId.hash]);
      const protectedConflict=await commit(produce({...originalSource,addr:"Source address revision",handtel:"13100000000",idcard:"SOURCE-ID"}));
      assert.equal(protectedConflict.outcome.status,"conflicted");assert.ok(protectedConflict.preview.plan[0]!.conflictFields.includes("idNumberFingerprint"));
      assert.equal((await db.query(`SELECT id_number_fingerprint FROM hr_employee_profile WHERE id=$1`,[profile.id]))[0].id_number_fingerprint,modernId.hash);
      // A genuinely new source profile for another exact employee is admitted.
      const newProfile=await commit(produce({...originalSource,id:8,person:"OLD-1",idcard:"NEW-ID"}));
      assert.equal(newProfile.preview.plan[0]!.action,"create");assert.equal(newProfile.outcome.appliedCount,1);
      assert.equal((await db.query(`SELECT count(*)::int n FROM hr_employee_profile WHERE employee_id=$1`,[employees[1]!.initialBaselineWitness!.targetId]))[0].n,1);
      const duplicateProfile=result(await service.preview(scope,actor,produce({...originalSource,id:10,person:"OLD-1",idcard:"DUPLICATE-ID"})));
      await assert.rejects(service.commit(scope,actor,duplicateProfile.id),/already exists/);
      assert.equal(result(await service.status(scope,actor,duplicateProfile.id)).status,"previewed");
      const newEmployeeAndProfile=await commit(produce({...originalSource,id:9,person:"NEW-CLI",idcard:"NEW-CLI-ID"},undefined,true));
      assert.equal(newEmployeeAndProfile.outcome.appliedCount,2);
      assert.equal((await db.query(`SELECT count(*)::int n FROM hr_employee e JOIN hr_employee_profile p ON p.employee_id=e.id WHERE e.employee_code='NEW-CLI'`))[0].n,1);
      // Permission and immutable witness identity are independently enforced.
      await assert.rejects(service.preview(scope,{sub:randomUUID(),permissions:[]} as never,produce(originalSource)),/profile:manage/);
      await assert.rejects(service.preview(scope,actor,produce(originalSource,{...witness,bindingSha256:sha("wrong")})),/ALREADY_ANCHORED/);
      assert.equal((await db.query(`SELECT count(*)::int n FROM hr_employee_profile WHERE employee_id=$1`,[profile.employeeId]))[0].n,1);
      t.diagnostic("Real CLI producer -> profile baseline -> ordinary three-way/CAS; business baseline equality and rollback asserted");
    } finally {rmSync(fixtureRoot,{recursive:true,force:true});}
  } finally {
    if(db?.isInitialized)await db.destroy();
    if(created){await admin.query(`DROP DATABASE "${database}"`);assert.equal((await admin.query(`SELECT count(*)::int n FROM pg_database WHERE datname=$1`,[database]))[0].n,0);}
    await admin.destroy();if(created)t.diagnostic("Dedicated profile database identity asserted; residual=0");
  }
});
