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
import { ValidationPipe } from "@nestjs/common";
import { originalProfileAliasProof, type OriginalProfile } from "./hr-yuzhou-profile-baseline";
import { originalFamily, certifyOriginalFamilies, originalFamilySourceFacts } from "./hr-yuzhou-family-baseline";
import { originalExtendedRecord, certifyOriginalRecords, originalRecordSourceFacts } from "./hr-yuzhou-record-baseline";
import { executeYuzhouRecordItem, type YuzhouPreparedRecordItem } from "./hr-yuzhou-record-executor";
import { mutateFamilyRecordInTransaction } from "./hr-family-transaction-write";
import { HrLifecycleService } from "./hr-lifecycle.service";
import { PreviewYuzhouIncrementalImportDto } from "./dto/yuzhou-incremental-import.dto";

const root=resolve(__dirname,"../../../../.."),sha=(s:string)=>createHash("sha256").update(s).digest("hex");
const scope={tenantId:"baseline-tenant",parkId:"baseline-park"};
const actor={sub:randomUUID(),isSuper:true,permissions:["*"]} as never;
const operationId="yzprod-import-20261004T120000Z-123456abcdef";
type Input=Omit<YuzhouIncrementalItem,"rowDigest">;
const validationPipe=new ValidationPipe({whitelist:true,transform:true,forbidNonWhitelisted:true});
const requestDto=(value:unknown):Promise<PreviewYuzhouIncrementalImportDto>=>validationPipe.transform(value,{type:"body",metatype:PreviewYuzhouIncrementalImportDto});
const result=(value:unknown)=>value as {id:string;status:string;appliedCount:number;unchangedCount:number;plan:Array<{action:string;conflictFields:string[]}>};

test("T5 profile CLI continuity: original-set certificate, raw bridge, CAS and immutable provenance",{skip:process.env.HR_YUZHOU_PROFILE_BASELINE_PG_REQUIRED!=="1",timeout:90000},async t=>{
  assert.equal(process.env.POSTGRES_HOST,"127.0.0.1"); const port=Number(process.env.POSTGRES_PORT);assert.ok([55491,55496].includes(port));
  const database=`jinhu_hr_profile_lab_${randomBytes(12).toString("hex")}`;
  assert.match(database,/^jinhu_hr_profile_lab_[a-f0-9]{24}$/);
  const connection={type:"postgres" as const,host:"127.0.0.1",port,username:process.env.POSTGRES_USER,password:process.env.POSTGRES_PASSWORD,database};
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
    const certifiedSource={...originalSource,oldaddr:"原籍",edulevel:"学士"};
    const profileIdentity=sha("dbo.person.core_residue\0"+originalSource.id),sourceHash=sha(canonicalYuzhouInitialJson(certifiedSource));
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
      const sourceId=(await m.query(`INSERT INTO hr_yuzhou_t5_followon_source(operation_id,tenant_id,park_id,source_domain,source_table,source_identity_sha256,source_row_sha256,encrypted_source,owner_status,employee_id,owner_record_map_id) VALUES($1,$2,$3,'person_core','dbo.person.core_residue',$4,$5,$6,'mapped',$7,$8) RETURNING id`,[originalOperation,scope.tenantId,scope.parkId,profileIdentity,sourceHash,sensitive.encrypt(JSON.stringify(certifiedSource)),profile.employeeId,map]))[0].id;
      for(const [table,id] of [["hr_employee_profile",profile.id],["hr_yuzhou_t5_followon_source",sourceId]])await m.query(`INSERT INTO hr_yuzhou_t5_followon_projection_receipt VALUES($1,$2,$3,$4,'insert',$5,NULL)`,[originalOperation,table,profileIdentity,sourceHash,id]);
      // Original PostgreSQL algorithm (not the new verifier) freezes commitment.
      await m.query(`SET LOCAL TIME ZONE 'Asia/Shanghai'`);
      const agg=async(q:string)=>(await m.query(`SELECT count(*)::int AS count,encode(digest(COALESCE(string_agg(h,'' ORDER BY h),''),'sha256'),'hex') sha256 FROM (SELECT encode(digest(to_jsonb(x)::text,'sha256'),'hex') h FROM (${q}) x) a`))[0];
      const profiles=await agg(`SELECT * FROM hr_employee_profile WHERE id='${profile.id}'`),receipts=await agg(`SELECT * FROM hr_yuzhou_t5_followon_projection_receipt WHERE operation_id='${originalOperation}'`);
      await m.query(`UPDATE hr_yuzhou_t5_followon_operation SET owned_state=$2 WHERE operation_id=$1`,[originalOperation,{hr_employee_profile:profiles,receipts}]);
    });
    const fixtureRoot=mkdtempSync(resolve(realpathSync(tmpdir()),"yuzhou-profile-fixture-"));
    let batch=0;
    const produce=(source:typeof originalSource & {oldaddr?:string|null;edulevel?:string|null},witness?:unknown,includeEmployees=false,aliasAcceptance?:unknown)=>{
      const path=resolve(fixtureRoot,`source-${batch}.json`),out=resolve(fixtureRoot,`batch-${batch++}`);
      writeFileSync(path,JSON.stringify({sources:[source],scope,witness,includeEmployees,aliasAcceptance}),{mode:0o600});
      const output=JSON.parse(execFileSync(process.execPath,["scripts/e2e/yuzhou-profile-staging-fixture.mjs","--root",out,"--source",path],{cwd:root,encoding:"utf8"}));
      return JSON.parse(readFileSync(output.packagePath,"utf8")) as PreviewYuzhouIncrementalImportDto;
    };
    const witness={version:1,proof:"original_t5_whole_set_v1",operationId:originalOperation,bindingSha256:bindingHash};
    const commit=async(dto:PreviewYuzhouIncrementalImportDto)=>{const preview=result(await service.preview(scope,actor,await requestDto(dto)));return {preview,outcome:result(await service.commit(scope,actor,preview.id))};};
    const business=async()=>await db!.query(`SELECT to_jsonb(p) AS row FROM hr_employee_profile p ORDER BY id`);
    try {
      const anchored=await requestDto(produce(originalSource,witness));
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
      // Explicit alias-only admission uses the authenticated original raw source
      // and immutable whole-set-certified original null target, never live null.
      const acceptance={version:1,proof:"original_t5_alias_fields_v1",operationId:originalOperation,bindingSha256:bindingHash,fields:["nativePlace","degree"]};
      const aliasWire=produce(certifiedSource,undefined,false,acceptance);
      const aliasDto=await requestDto(aliasWire);
      assert.deepEqual(JSON.parse(JSON.stringify(aliasDto)),aliasWire);
      assert.deepEqual(JSON.parse(JSON.stringify(aliasDto.items[0]!.profileAliasAcceptance)),acceptance);
      for(const marker of [{...acceptance,extra:"forged"},{...acceptance,fields:["degree","degree"]},{...acceptance,proof:"forged"}]) await assert.rejects(requestDto({...aliasWire,items:[{...aliasWire.items[0]!,profileAliasAcceptance:marker}]}));
      assert.deepEqual(Object.keys(aliasDto.items[0]!.fields).sort(),["degree","nativePlace"]);
      await assert.rejects(service.preview(scope,actor,{...aliasDto,items:[{...aliasDto.items[0]!,fields:{...aliasDto.items[0]!.fields,englishName:"forged other field"}}]}),/PROFILE_ALIAS_ACCEPTANCE_INVALID/);
      const oldBaseline=(await db.query(`SELECT baseline_encrypted FROM hr_incremental_import_item WHERE source_key=$1`,[`sha256:${profileIdentity}`]))[0].baseline_encrypted;
      const oldProof=(await db.query(`SELECT provenance_encrypted FROM hr_incremental_profile_baseline`))[0].provenance_encrypted;
      const oldReceipts=await db.query(`SELECT to_jsonb(r) AS row FROM hr_yuzhou_t5_followon_projection_receipt r ORDER BY target_table`);
      const unknownAlias=await commit(produce(certifiedSource));
      assert.ok(unknownAlias.preview.plan[0]!.conflictFields.includes("INITIAL_FIELD_BASELINE_UNKNOWN"));assert.equal(unknownAlias.outcome.status,"conflicted");
      await assert.rejects(service.preview(scope,actor,{...aliasDto,items:[{...aliasDto.items[0]!,profileAliasAcceptance:undefined}]}),/rowDigest/);
      await assert.rejects(service.preview({...scope,parkId:"wrong"},actor,aliasDto),/PROFILE_ALIAS_ORIGINAL_BASELINE_REQUIRED/);
      await assert.rejects(service.preview(scope,actor,produce(certifiedSource,undefined,false,{...acceptance,bindingSha256:sha("wrong")})),/PROFILE_ALIAS_BINDING_MISMATCH/);
      const changedOriginal=await commit(produce({...certifiedSource,oldaddr:"Different initial source"},undefined,false,acceptance));
      assert.ok(changedOriginal.preview.plan[0]!.conflictFields.includes("PROFILE_ALIAS_ORIGINAL_SOURCE_CHANGED"));assert.equal(changedOriginal.outcome.status,"conflicted");
      const singleAlias=result(await service.preview(scope,actor,produce(certifiedSource,undefined,false,{...acceptance,fields:["nativePlace"]})));
      assert.equal(singleAlias.plan[0]!.action,"update");
      // Exercise one-field admission and the remaining-field boundary in a real
      // PostgreSQL transaction, then roll it back without resetting any baseline.
      const sandboxRollback=new Error("synthetic alias-order rollback");
      await assert.rejects(db.transaction(async manager=>{
        const transactionDb=Object.create(db!) as DataSource;
        transactionDb.query=manager.query.bind(manager);
        transactionDb.transaction=(async(fn:(m:EntityManager)=>Promise<unknown>)=>fn(manager)) as DataSource["transaction"];
        const sandboxService=new HrYuzhouIncrementalImportService(transactionDb,sensitive);
        assert.equal(result(await sandboxService.commit(scope,actor,singleAlias.id)).appliedCount,1);
        assert.deepEqual((await manager.query(`SELECT native_place,degree FROM hr_employee_profile WHERE id=$1`,[profile.id]))[0],{native_place:"原籍",degree:null});
        const remaining=await requestDto(produce(certifiedSource,undefined,false,{...acceptance,fields:["degree"]}));
        const denied=result(await sandboxService.preview(scope,actor,remaining));
        assert.ok(denied.plan[0]!.conflictFields.includes("PROFILE_ALIAS_TARGET_HISTORY_CHANGED"));
        assert.equal(result(await sandboxService.commit(scope,actor,denied.id)).status,"conflicted");
        throw sandboxRollback;
      }),error=>error===sandboxRollback);
      assert.equal((await db.query(`SELECT baseline_encrypted FROM hr_incremental_import_item WHERE source_key=$1`,[`sha256:${profileIdentity}`]))[0].baseline_encrypted,oldBaseline);
      assert.deepEqual((await db.query(`SELECT native_place,degree,version FROM hr_employee_profile WHERE id=$1`,[profile.id]))[0],{native_place:null,degree:null,version:profile.version});

      await historicalMutation(`UPDATE hr_yuzhou_t5_followon_projection_receipt SET source_row_sha256=$2 WHERE operation_id=$1 AND target_table='hr_yuzhou_t5_followon_source'`,[originalOperation,sha("wrong alias receipt")]);
      await assert.rejects(service.preview(scope,actor,aliasDto),/PROFILE_ORIGINAL_EVIDENCE_INVALID/);
      await historicalMutation(`UPDATE hr_yuzhou_t5_followon_projection_receipt SET source_row_sha256=$2 WHERE operation_id=$1 AND target_table='hr_yuzhou_t5_followon_source'`,[originalOperation,sourceHash]);
      await historicalMutation(`UPDATE hr_yuzhou_t5_followon_source SET employee_id=$2 WHERE source_identity_sha256=$1`,[profileIdentity,employees[1]!.initialBaselineWitness!.targetId]);
      await assert.rejects(service.preview(scope,actor,aliasDto),/PROFILE_ORIGINAL_EVIDENCE_INVALID/);
      await historicalMutation(`UPDATE hr_yuzhou_t5_followon_source SET employee_id=$2 WHERE source_identity_sha256=$1`,[profileIdentity,profile.employeeId]);
      const sourceStored=(await db.query(`SELECT encrypted_source FROM hr_yuzhou_t5_followon_source WHERE source_identity_sha256=$1`,[profileIdentity]))[0].encrypted_source;
      await historicalMutation(`UPDATE hr_yuzhou_t5_followon_source SET encrypted_source=$2 WHERE source_identity_sha256=$1`,[profileIdentity,sensitive.encrypt(JSON.stringify({...certifiedSource,oldaddr:"tampered"}))]);
      await assert.rejects(service.preview(scope,actor,aliasDto),/PROFILE_ORIGINAL_EVIDENCE_INVALID/);
      await historicalMutation(`UPDATE hr_yuzhou_t5_followon_source SET encrypted_source=$2 WHERE source_identity_sha256=$1`,[profileIdentity,sourceStored]);
      const provenance=JSON.parse(sensitive.decrypt(oldProof)!);
      for(const kind of ["target","certificate"] as const) {
        const forged=JSON.parse(JSON.stringify(provenance));
        if(kind==="target") forged.certifiedOriginalTarget.native_place="Original nonempty";
        else forged.certificate.profiles.sha256=sha("tampered certificate");
        await historicalMutation(`UPDATE hr_incremental_profile_baseline SET provenance_encrypted=$1`,[sensitive.encrypt(JSON.stringify(forged))]);
        if(kind==="certificate") await assert.rejects(service.preview(scope,actor,aliasDto),/PROFILE_ALIAS_PROVENANCE_INVALID/);
        else {const denied=await commit({...aliasDto,manifestId:randomUUID()});assert.ok(denied.preview.plan[0]!.conflictFields.includes("PROFILE_ALIAS_ORIGINAL_TARGET_NOT_EMPTY"));assert.equal(denied.outcome.status,"conflicted");}
        await historicalMutation(`UPDATE hr_incremental_profile_baseline SET provenance_encrypted=$1`,[oldProof]);
      }
      for(const kind of ["alias","unrelated","edit_clear"] as const) {
        if(kind==="unrelated") await db.query(`UPDATE hr_employee_profile SET english_name='Modern',version=version+1 WHERE id=$1`,[profile.id]);
        else await db.query(`UPDATE hr_employee_profile SET native_place='Modern',version=version+1 WHERE id=$1`,[profile.id]);
        if(kind==="edit_clear") await db.query(`UPDATE hr_employee_profile SET native_place=NULL,version=version+1 WHERE id=$1`,[profile.id]);
        const denied=await commit({...aliasDto,manifestId:randomUUID()});
        assert.ok(denied.preview.plan[0]!.conflictFields.includes("PROFILE_ALIAS_TARGET_HISTORY_CHANGED"));assert.equal(denied.outcome.status,"conflicted");
        assert.equal((await db.query(`SELECT native_place FROM hr_employee_profile WHERE id=$1`,[profile.id]))[0].native_place,kind==="alias"?"Modern":null);
        // Restore only this synthetic test row between independent negative cases.
        await db.query(`UPDATE hr_employee_profile SET native_place=NULL,english_name=NULL,version=$2 WHERE id=$1`,[profile.id,profile.version]);
      }
      // Competing connection edits after the admission observation: CAS rollback
      // includes the pending acceptance and the ordinary ledger revision.
      const aliasPreview=result(await service.preview(scope,actor,aliasDto));assert.equal(aliasPreview.plan[0]!.action,"update");
      let aliasReached!:()=>void,aliasRelease!:()=>void;const aliasBarrier=new Promise<void>(done=>{aliasReached=done}),aliasResume=new Promise<void>(done=>{aliasRelease=done});let aliasPaused=false;
      const aliasRaceDb=Object.create(db!) as DataSource;
      aliasRaceDb.transaction=(async(fn:(m:EntityManager)=>Promise<unknown>)=>db!.transaction(async m=>{const proxy=Object.create(m) as EntityManager;proxy.query=async(sql:string,args?:unknown[])=>{const out=await m.query(sql,args);if(!aliasPaused&&sql.startsWith("SELECT *,")&&sql.includes("FROM hr_employee_profile")){aliasPaused=true;aliasReached();await aliasResume;}return out;};return fn(proxy);})) as DataSource["transaction"];
      const aliasPending=new HrYuzhouIncrementalImportService(aliasRaceDb,sensitive).commit(scope,actor,aliasPreview.id);
      await Promise.race([aliasBarrier,new Promise((_,reject)=>setTimeout(()=>reject(new Error("alias CAS barrier timeout")),3000))]);
      await db.query(`UPDATE hr_employee_profile SET english_name='Concurrent modern',version=version+1 WHERE id=$1`,[profile.id]);aliasRelease();await assert.rejects(aliasPending,/changed concurrently/);
      assert.equal(result(await service.status(scope,actor,aliasPreview.id)).status,"previewed");
      assert.equal((await db.query(`SELECT baseline_encrypted FROM hr_incremental_import_item WHERE source_key=$1`,[`sha256:${profileIdentity}`]))[0].baseline_encrypted,oldBaseline);
      await db.query(`UPDATE hr_employee_profile SET english_name=NULL,version=$2 WHERE id=$1`,[profile.id,profile.version]);
      const storedAlias=JSON.parse(sensitive.decrypt((await db.query(`SELECT package_encrypted FROM hr_incremental_import_operation WHERE id=$1`,[aliasPreview.id]))[0].package_encrypted)!);
      assert.deepEqual(storedAlias.items[0].profileAliasAcceptance,acceptance);
      assert.equal(storedAlias.items[0].rowDigest,aliasWire.items[0]!.rowDigest);
      const otherPreview=result(await service.preview(scope,actor,{...aliasDto,manifestId:randomUUID()}));
      const admitted=await Promise.all([service.commit(scope,actor,aliasPreview.id),service.commit(scope,actor,otherPreview.id)]);
      assert.equal(admitted.reduce((sum,out)=>sum+result(out).appliedCount,0),1);
      assert.deepEqual((await db.query(`SELECT native_place,degree FROM hr_employee_profile WHERE id=$1`,[profile.id]))[0],{native_place:"原籍",degree:"学士"});
      assert.equal(result(await service.commit(scope,actor,aliasPreview.id)).status,"committed");
      assert.equal((await db.query(`SELECT count(*)::int n FROM hr_incremental_import_revision WHERE field_diff @> '[{"code":"PROFILE_ALIAS_FIELDS_ACCEPTED"}]'`))[0].n,1);
      assert.equal((await db.query(`SELECT provenance_encrypted FROM hr_incremental_profile_baseline`))[0].provenance_encrypted,oldProof);
      assert.deepEqual(await db.query(`SELECT to_jsonb(r) AS row FROM hr_yuzhou_t5_followon_projection_receipt r ORDER BY target_table`),oldReceipts);
      const accepted=JSON.parse(sensitive.decrypt((await db.query(`SELECT baseline_encrypted FROM hr_incremental_import_item WHERE source_key=$1`,[`sha256:${profileIdentity}`]))[0].baseline_encrypted)!);
      const oldAccepted=JSON.parse(sensitive.decrypt(oldBaseline)!);
      for(const key of Object.keys(oldAccepted.fields)) assert.deepEqual(accepted.fields[key],oldAccepted.fields[key]);
      for(const key of Object.keys(oldAccepted.target).filter(k=>k!=="targetVersion")) assert.deepEqual(accepted.target[key],oldAccepted.target[key]);
      assert.equal(result(await service.commit(scope,actor,initial.preview.id)).unchangedCount,1);
      assert.equal((await commit(produce(originalSource))).outcome.unchangedCount,1);
      assert.equal((await commit(produce(certifiedSource,undefined,false,{...acceptance,fields:["degree"]}))).outcome.unchangedCount,1);
      assert.equal((await commit(produce({...certifiedSource,oldaddr:"来源修订"}))).outcome.appliedCount,1);
      await db.query(`UPDATE hr_employee_profile SET native_place='现代籍贯',version=version+1 WHERE id=$1`,[profile.id]);
      const modernAlias=await commit(produce({...certifiedSource,oldaddr:"冲突来源"}));assert.equal(modernAlias.outcome.status,"conflicted");assert.ok(modernAlias.preview.plan[0]!.conflictFields.includes("nativePlace"));
      assert.equal((await db.query(`SELECT native_place FROM hr_employee_profile WHERE id=$1`,[profile.id]))[0].native_place,"现代籍贯");
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
      const newProfile=await commit(produce({...certifiedSource,id:8,person:"OLD-1",idcard:"NEW-ID"}));
      assert.equal(newProfile.preview.plan[0]!.action,"create");assert.equal(newProfile.outcome.appliedCount,1);
      assert.deepEqual((await db.query(`SELECT native_place,degree FROM hr_employee_profile WHERE employee_id=$1`,[employees[1]!.initialBaselineWitness!.targetId]))[0],{native_place:"原籍",degree:"学士"});
      assert.equal((await commit(produce({...certifiedSource,id:8,person:"OLD-1",idcard:"NEW-ID",oldaddr:null}))).outcome.appliedCount,1);
      assert.equal((await db.query(`SELECT native_place FROM hr_employee_profile WHERE employee_id=$1`,[employees[1]!.initialBaselineWitness!.targetId]))[0].native_place,null);
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
    await verifyFamilyOriginalReceipts(db,sensitive,employees[0]!.initialBaselineWitness!.targetId,employees[0]!.sourceKey.slice(7));
    t.diagnostic("Family original proof and actual DTO/preview/commit/status PASS: source create/update/replay/modern conflicts/archive/rollback plus employee dependency");
    await verifyExtendedRecordOriginalReceipts(db,sensitive,employees[0]!.initialBaselineWitness!.targetId,employees[0]!.sourceKey.slice(7));
    t.diagnostic("Skill/credential original proof, internal executor and public DTO/preview/commit/status PASS; production acceptance remains pending");
  } finally {
    if(db?.isInitialized)await db.destroy();
    if(created){await admin.query(`DROP DATABASE "${database}"`);assert.equal((await admin.query(`SELECT count(*)::int n FROM pg_database WHERE datname=$1`,[database]))[0].n,0);}
    await admin.destroy();if(created)t.diagnostic("Dedicated profile database identity asserted; residual=0");
  }
});

/** Small synthetic T5 fixture reuses the same real core ownership chain.
 * Replica mode installs/tampers historical fixtures only in the random lab DB. */
async function verifyExtendedRecordOriginalReceipts(db:DataSource,sensitive:PartySensitiveDataService,employeeId:string,employeeIdentity:string) {
  const migration=(name:string)=>readFileSync(resolve(root,"database/migrations",name),"utf8");
  const schema=migration("000252_hr_lifecycle_employee_records.sql");
  await db.query(schema.slice(schema.indexOf("CREATE TABLE hr_employee_experience ("),schema.indexOf("CREATE FUNCTION hr_lifecycle_append_only()")));
  const materialization=migration("000276_hr_legacy_employee_profile_materialization.sql");
  for(const kind of ["skill","credential"])await db.query(materialization.match(new RegExp(`ALTER TABLE hr_employee_${kind}[\\s\\S]*?;`))![0]);
  await db.query(migration("000338_hr_extended_record_changes.sql"));
  await db.query(migration("000339_hr_incremental_record_baselines.sql"));
  const actorId=randomUUID();await db.query("INSERT INTO sys_user VALUES($1,$2,$3)",[scope.tenantId,scope.parkId,actorId]);
  const parent=(await db.query("SELECT * FROM hr_yuzhou_t5_followon_operation WHERE operation_id=$1",["yzprod-import-20261004T130000Z-abcdef123456"]))[0];
  const map=(await db.query("SELECT id FROM legacy_record_map WHERE source_identity_sha256=$1 AND source_table='dbo.person' AND is_active",[employeeIdentity]))[0].id;
  const historicalMutation=(sql:string,args:unknown[])=>db.transaction(async m=>{await m.query("SET LOCAL session_replication_role=replica");await m.query(sql,args);});
  for(const kind of ["skill","credential"] as const){
    const table=`hr_employee_${kind}`,sourceTable=kind==="skill"?"dbo.knowhow":"dbo.ticket",domain=kind==="skill"?"knowhow":"ticket";
    const op=`yzprod-import-20261004T15${kind==="skill"?"00":"10"}00Z-abcdef123456`,binding={...parent.binding,operationId:op};
    const ids=[randomUUID(),randomUUID(),randomUUID()],sourceIds:string[]=[],sources:Array<Record<string,unknown>>=ids.map((_,i)=>kind==="skill"
      ?{id:2700+i,person:"OLD-0",knowhow:`Synthetic original skill ${i}`,grade:"Original grade",memo:null}
      :{id:2710+i,person:"OLD-0",tickettype:i===0?null:"synthetic",ticket:i===0?"Synthetic credential 0":'Synthetic credential "1"',ticketno:`SYN-NUMBER-${i}`,org:"Synthetic authority",getdate:"2020-02-29 00:00:00",validdate:i===0?"2030-01-01":"1900-02-29",memo:null,ticketfilename:i===0?null:"synthetic/source.pdf"});
    const identities=sources.map(source=>sha(`${sourceTable}\0${source.id}`)),hashes=sources.map(source=>sha(canonicalYuzhouInitialJson(source)));
    await db.transaction(async m=>{
      await m.query("SET LOCAL session_replication_role=replica");
      await m.query(`INSERT INTO hr_yuzhou_t5_followon_operation(operation_id,parent_operation_id,payroll_operation_id,binding_sha256,binding,status,finished_at) VALUES($1,$2,$3,$4,$5,'succeeded',now())`,[op,parent.parent_operation_id,parent.payroll_operation_id,sha(canonicalYuzhouInitialJson(binding)),binding]);
      await m.query(`INSERT INTO migration_batch(run_id,source_system,source_snapshot_sha256,target_database,execution_context,t5_followon_operation_id,status,tool_version) VALUES($1,'yuzhou-v10',$2,current_database(),'t5_production_followon',$1,'succeeded',$3)`,[op,sha("fixture"),`t5-followon-v1@${binding.executionCodeSha}`]);
      for(const [i,source] of sources.entries()){
        if(kind==="skill")await m.query(`INSERT INTO ${table}(id,tenant_id,park_id,employee_id,skill_name,legacy_grade,note,create_by,update_by,legacy_source_identity_sha256,legacy_source_row_sha256) VALUES($1,$2,$3,$4,$5,$6,NULL,$7,$7,$8,$9)`,[ids[i],scope.tenantId,scope.parkId,employeeId,source.knowhow,source.grade,actorId,identities[i],hashes[i]]);
        else{const number=sensitive.identityProfile(String(source.ticketno));await m.query(`INSERT INTO ${table}(id,tenant_id,park_id,employee_id,credential_type,credential_name,number_encrypted,number_masked,number_fingerprint,issuing_authority,acquired_date,valid_to,note,legacy_file_reference_sha256,create_by,update_by,legacy_source_identity_sha256,legacy_source_row_sha256) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'2020-02-29',$11,NULL,$12,$13,$13,$14,$15)`,[ids[i],scope.tenantId,scope.parkId,employeeId,source.tickettype??"legacy",source.ticket,number.encrypted,number.masked,number.hash,source.org,i===0?"2030-01-01":null,i===0?null:sha(String(source.ticketfilename)),actorId,identities[i],hashes[i]]);}
        const transported=kind==="credential"&&i===1?{...source,ticket:JSON.stringify(source.ticket).slice(1,-1)}:source;
        const sourceId=(await m.query(`INSERT INTO hr_yuzhou_t5_followon_source(operation_id,tenant_id,park_id,source_domain,source_table,source_identity_sha256,source_row_sha256,encrypted_source,owner_status,employee_id,owner_record_map_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'mapped',$9,$10) RETURNING id`,[op,scope.tenantId,scope.parkId,domain,sourceTable,identities[i],hashes[i],sensitive.encrypt(JSON.stringify(transported)),employeeId,map]))[0].id;sourceIds.push(sourceId);
        for(const [target,id] of [[table,ids[i]],["hr_yuzhou_t5_followon_source",sourceId]])await m.query(`INSERT INTO hr_yuzhou_t5_followon_projection_receipt VALUES($1,$2,$3,$4,'insert',$5,NULL)`,[op,target,identities[i],hashes[i],id]);
      }
      await m.query("SET LOCAL TIME ZONE 'Asia/Shanghai'");
      const agg=async(q:string,args:unknown[])=>(await m.query(`SELECT count(*)::int count,encode(digest(COALESCE(string_agg(h,'' ORDER BY h),''),'sha256'),'hex') sha256 FROM (SELECT encode(digest(to_jsonb(x)::text,'sha256'),'hex') h FROM (${q}) x) hashes`,args))[0];
      const records=await agg(`SELECT * FROM ${table} WHERE id=ANY($1::uuid[])`,[ids]),receipts=await agg("SELECT * FROM hr_yuzhou_t5_followon_projection_receipt WHERE operation_id=$1",[op]);
      await m.query("UPDATE hr_yuzhou_t5_followon_operation SET owned_state=$2 WHERE operation_id=$1",[op,{[table]:records,receipts}]);
    });
    const proof=(targetScope=scope)=>db.transaction(async m=>{
      const original=await originalExtendedRecord(m,targetScope,kind,identities[0]!,sensitive);assert.ok(original);
      assert.deepEqual(original.source,sources[0]);
      const certified=await certifyOriginalRecords(m,original,targetScope,sensitive),facts=originalRecordSourceFacts(original,certified,sensitive);
      assert.equal(facts.fields[kind==="skill"?"skillName":"credentialName"],sources[0]![kind==="skill"?"knowhow":"ticket"]);
      const second=await originalExtendedRecord(m,targetScope,kind,identities[1]!,sensitive);assert.ok(second);assert.deepEqual(second.source,sources[1]);
      const secondFacts=originalRecordSourceFacts(second,certified,sensitive);
      assert.deepEqual(secondFacts.pendingFields,kind==="credential"?["validTo","attachmentAssociation"]:[]);
      assert.equal("proficiency" in facts.fields,false);assert.equal("legacyFileReferenceSha256" in facts.fields,false);
      assert.throws(()=>originalRecordSourceFacts(original,new Map([[original.target_id,{...certified.get(original.target_id),[kind==="skill"?"skill_name":"credential_name"]:"forged"}]]),sensitive),/RECORD_ORIGINAL_FIELD_INCOMPATIBLE/);
      return certified;
    });
    const before=await proof();await assert.rejects(proof({...scope,parkId:"foreign"}),/RECORD_ORIGINAL_EVIDENCE_INVALID/);
    const service=new HrLifecycleService(db,sensitive,{} as never),actor={...scope,sub:actorId,username:"synthetic",isSuper:true,roles:[],permissions:["*"]};
    await service.mutateEmployeeRecord(scope,actor,employeeId,kind,ids[0]!,{expectedVersion:1,...(kind==="skill"?{proficiency:"advanced",legacyGrade:"Modern grade"}:{credentialNumber:null})},"update");
    await service.mutateEmployeeRecord(scope,actor,employeeId,kind,ids[0]!,{expectedVersion:2},"archive");
    const archived=(await db.query(`SELECT to_jsonb(r) row FROM ${table} r WHERE id=$1`,[ids[0]]))[0];
    assert.deepEqual(await proof(),before);assert.deepEqual((await db.query(`SELECT to_jsonb(r) row FROM ${table} r WHERE id=$1`,[ids[0]]))[0],archived);
    await historicalMutation("UPDATE hr_yuzhou_t5_followon_operation SET status='rolled_back',rolled_back_at=now() WHERE operation_id=$1",[op]);
    await assert.rejects(proof(),/RECORD_ORIGINAL_EVIDENCE_INVALID/);
    await historicalMutation("UPDATE hr_yuzhou_t5_followon_operation SET status='succeeded',rolled_back_at=NULL WHERE operation_id=$1",[op]);
    await historicalMutation("UPDATE hr_yuzhou_t5_followon_projection_receipt SET source_row_sha256=$3 WHERE operation_id=$1 AND source_identity_sha256=$2",[op,identities[1],sha("tampered sibling")]);
    await assert.rejects(proof(),/RECORD_ORIGINAL_RECEIPTS_CHANGED/);
    await historicalMutation("UPDATE hr_yuzhou_t5_followon_projection_receipt SET source_row_sha256=$3 WHERE operation_id=$1 AND source_identity_sha256=$2",[op,identities[1],hashes[1]]);
    const encrypted=(await db.query("SELECT encrypted_source FROM hr_yuzhou_t5_followon_source WHERE id=$1",[sourceIds[0]]))[0].encrypted_source;
    await historicalMutation("UPDATE hr_yuzhou_t5_followon_source SET encrypted_source=$2 WHERE id=$1",[sourceIds[0],sensitive.encrypt(JSON.stringify({...sources[0],memo:"tampered"}))]);
    await assert.rejects(proof(),/RECORD_ORIGINAL_EVIDENCE_INVALID/);
    await historicalMutation("UPDATE hr_yuzhou_t5_followon_source SET encrypted_source=$2 WHERE id=$1",[sourceIds[0],encrypted]);
    await historicalMutation("UPDATE legacy_record_map SET is_active=false WHERE id=$1",[map]);await assert.rejects(proof(),/RECORD_ORIGINAL_EVIDENCE_INVALID/);await historicalMutation("UPDATE legacy_record_map SET is_active=true WHERE id=$1",[map]);
    assert.deepEqual(await proof(),before);
    // Actual forward-migration constraints: ciphertext-only facts and an
    // immutable provenance row bound to authenticated original certificates.
    const originalOp=(await db.query("SELECT * FROM hr_yuzhou_t5_followon_operation WHERE operation_id=$1",[op]))[0];
    const importId=randomUUID(),itemId=randomUUID(),baselineTable=`hr_incremental_${kind}_baseline`;
    const cipher=sensitive.encrypt(JSON.stringify({fixture:"synthetic encrypted facts"}));
    await db.query(`INSERT INTO hr_incremental_import_operation(id,tenant_id,park_id,source_system,manifest_id,package_sha256,package_encrypted,item_count,created_by) VALUES($1,$2,$3,'yuzhou-v10',$4,$5,$6,1,$7)`,[importId,scope.tenantId,scope.parkId,`synthetic-record-${kind}`,sha(kind),cipher,actorId]);
    const insertItem=(id:string,target:string|null,baseline:string|null,fieldBaseline:unknown={})=>db.query(`INSERT INTO hr_incremental_import_item(id,tenant_id,park_id,source_system,source_table,source_key,domain,target_table,target_id,last_row_sha256,field_baseline,source_facts_encrypted,source_facts_sha256,target_version,last_operation_id,baseline_encrypted) VALUES($1,$2,$3,'yuzhou-v10',$4,$5,$6,$7,$8,$9,$10,$11,$12,3,$13,$14)`,[id,scope.tenantId,scope.parkId,sourceTable,`sha256:${identities[0]}`,kind,target,ids[0],hashes[0],fieldBaseline,cipher,sha("source facts"),importId,baseline]);
    await assert.rejects(insertItem(randomUUID(),null,cipher),/ck_hr_incremental_record_private_baseline/);
    await assert.rejects(insertItem(randomUUID(),table,null),/ck_hr_incremental_record_private_baseline/);
    await assert.rejects(insertItem(randomUUID(),table,cipher,{note:"plaintext"}),/ck_hr_incremental_record_private_baseline/);
    await insertItem(itemId,table,cipher);
    const bindingArgs=[itemId,importId,scope.tenantId,scope.parkId,employeeId,ids[0],op,sourceIds[0],identities[0],hashes[0],originalOp.owned_state[table].sha256,originalOp.owned_state.receipts.sha256,originalOp.binding_sha256,sha("witness"),cipher,actorId];
    const insertProvenance=(args:unknown[])=>db.query(`INSERT INTO ${baselineTable}(item_id,operation_id,tenant_id,park_id,employee_id,record_id,original_operation_id,original_source_id,source_identity_sha256,original_source_row_sha256,original_record_set_sha256,original_receipt_set_sha256,original_binding_sha256,witness_sha256,provenance_encrypted,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,args);
    for(const [index,value] of [[3,"foreign"],[5,ids[1]],[7,sourceIds[1]],[8,identities[1]],[9,sha("wrong source")],[10,sha("wrong set")],[11,sha("wrong receipts")],[12,sha("wrong binding")]] as Array<[number,unknown]>){const args=[...bindingArgs];args[index]=value;await assert.rejects(insertProvenance(args),/RECORD_BASELINE_BINDING_INVALID/);}
    await insertProvenance(bindingArgs);
    await assert.rejects(db.query(`UPDATE ${baselineTable} SET provenance_encrypted=$2 WHERE item_id=$1`,[itemId,cipher]),/INITIAL_BASELINE_PROVENANCE_IMMUTABLE/);
    await assert.rejects(db.query(`DELETE FROM ${baselineTable} WHERE item_id=$1`,[itemId]),/INITIAL_BASELINE_PROVENANCE_IMMUTABLE/);
    await assert.rejects(db.query("UPDATE hr_incremental_import_item SET target_id=$2 WHERE id=$1",[itemId,ids[1]]),/RECORD_INCREMENTAL_SOURCE_IMMUTABLE/);
    await assert.rejects(db.query("UPDATE hr_incremental_import_item SET source_key=$2 WHERE id=$1",[itemId,`sha256:${sha("rebind")}`]),/RECORD_INCREMENTAL_SOURCE_IMMUTABLE/);
    await assert.rejects(db.query("UPDATE hr_incremental_import_item SET target_version=2 WHERE id=$1",[itemId]),/RECORD_INCREMENTAL_SOURCE_IMMUTABLE/);
    await assert.rejects(db.query("DELETE FROM hr_incremental_import_item WHERE id=$1",[itemId]),/RECORD_INCREMENTAL_SOURCE_IMMUTABLE/);
    await db.query("UPDATE hr_incremental_import_item SET version=version+1,last_row_sha256=$2,baseline_encrypted=$3 WHERE id=$1",[itemId,sha("new source facts"),cipher]);
    assert.deepEqual((await db.query(`SELECT to_jsonb(r) row FROM ${table} r WHERE id=$1`,[ids[0]]))[0],archived);
    const item=(key:string,fields:Record<string,unknown>):YuzhouPreparedRecordItem=>{
      const value={domain:kind,sourceTable,sourceKey:key,fields:{employeeSourceTable:"dbo.person",employeeSourceKey:`sha256:${employeeIdentity}`,...fields}};
      return {...value,rowDigest:sha(canonicalYuzhouInitialJson({...value,sourceUpdatedAt:null}))};
    };
    const execute=(value:YuzhouPreparedRecordItem,commit=true)=>db.transaction(async m=>{
      const operation=randomUUID();
      if(commit)await m.query(`INSERT INTO hr_incremental_import_operation(id,tenant_id,park_id,source_system,manifest_id,package_sha256,package_encrypted,item_count,created_by) VALUES($1,$2,$3,'yuzhou-v10',$4,$5,$6,1,$7)`,[operation,scope.tenantId,scope.parkId,`synthetic-executor-${operation}`,sha(operation),cipher,actorId]);
      return executeYuzhouRecordItem(m,scope,actor,value,sensitive,async(key,ownerTable)=>{assert.equal(key,`sha256:${employeeIdentity}`);assert.equal(ownerTable,"dbo.person");return employeeId;},commit?operation:undefined);
    });
    const originalKey=`sha256:${identities[1]}`,originalItem=item(originalKey,{note:null});
    assert.equal((await execute(originalItem,false) as {action:string}).action,"unchanged");
    assert.equal(await execute(originalItem),"unchanged");assert.equal(await execute(originalItem),"unchanged");
    assert.equal((await db.query(`SELECT version FROM ${table} WHERE id=$1`,[ids[1]]))[0].version,1);
    assert.equal(await execute(item(originalKey,{note:"Source updated"})),"applied");
    await service.mutateEmployeeRecord(scope,actor,employeeId,kind,ids[1]!,{expectedVersion:2,note:"Modern note"},"update");
    assert.equal(await execute(item(originalKey,{note:"Divergent source"})),"conflict");
    assert.equal(await execute(item(originalKey,{note:"Source updated"})),"unchanged");
    assert.equal((await db.query(`SELECT note FROM ${table} WHERE id=$1`,[ids[1]]))[0].note,"Modern note");
    assert.equal(await execute(item(originalKey,{note:"Modern note"})),"applied");
    assert.equal((await db.query(`SELECT version FROM ${table} WHERE id=$1`,[ids[1]]))[0].version,3);
    await service.mutateEmployeeRecord(scope,actor,employeeId,kind,ids[1]!,{expectedVersion:3},"archive");
    assert.equal(await execute(item(originalKey,{note:"Resurrection attempt"})),"conflict");
    const newKey=`sha256:${sha(`${sourceTable}\0new-synthetic`)}`,newItem=item(newKey,kind==="skill"?{skillName:"Synthetic repeatable skill",legacyGrade:"Original raw grade"}:{credentialType:"synthetic",credentialName:"Synthetic repeatable credential",credentialNumber:"SYN-NEW",acquiredDate:"2020-01-01"});
    assert.equal((await execute(newItem,false) as {action:string}).action,"create");
    assert.equal(await execute(newItem),"applied");assert.equal(await execute(newItem),"unchanged");
    const created=(await db.query("SELECT target_id FROM hr_incremental_import_item WHERE domain=$1 AND source_key=$2",[kind,newKey]))[0].target_id;
    assert.equal((await db.query(`SELECT count(*)::int n FROM ${table}_change WHERE record_id=$1 AND action='create'`,[created]))[0].n,1);
    await assert.rejects(db.transaction(m=>executeYuzhouRecordItem(m,scope,{...actor,isSuper:false,permissions:[]},newItem,sensitive,async()=>employeeId)),/Forbidden/);
    const beforeFailure=await db.query(`SELECT to_jsonb(r) row FROM ${table} r WHERE id=$1`,[created]);
    const ledgerBeforeFailure=await db.query("SELECT to_jsonb(i) row FROM hr_incremental_import_item i WHERE target_id=$1",[created]);
    await db.query(`CREATE FUNCTION synthetic_${kind}_executor_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic executor journal failure'; END $$; CREATE TRIGGER synthetic_${kind}_executor_failure BEFORE INSERT ON ${table}_change FOR EACH ROW EXECUTE FUNCTION synthetic_${kind}_executor_failure()`);
    await assert.rejects(execute(item(newKey,{note:"Rollback source"})),/synthetic executor journal failure/);
    assert.deepEqual(await db.query(`SELECT to_jsonb(r) row FROM ${table} r WHERE id=$1`,[created]),beforeFailure);
    assert.deepEqual(await db.query("SELECT to_jsonb(i) row FROM hr_incremental_import_item i WHERE target_id=$1",[created]),ledgerBeforeFailure);
    await db.query(`DROP TRIGGER synthetic_${kind}_executor_failure ON ${table}_change`);
    assert.equal(await execute(item(newKey,{note:"Rollback source"})),"applied");
    const ledgerBeforeRace=await db.query("SELECT to_jsonb(i) row FROM hr_incremental_import_item i WHERE target_id=$1",[created]);
    let raced=false;
    await assert.rejects(db.transaction(async m=>{
      const operation=randomUUID();await m.query(`INSERT INTO hr_incremental_import_operation(id,tenant_id,park_id,source_system,manifest_id,package_sha256,package_encrypted,item_count,created_by) VALUES($1,$2,$3,'yuzhou-v10',$4,$5,$6,1,$7)`,[operation,scope.tenantId,scope.parkId,operation,sha(operation),cipher,actorId]);
      const proxy=Object.create(m) as EntityManager;
      proxy.query=async(sql:string,args?:unknown[])=>{const out=await m.query(sql,args);
        if(!raced&&sql.startsWith("SELECT to_jsonb(r) snapshot")&&sql.includes(`FROM ${table}`)){
          raced=true;await service.mutateEmployeeRecord(scope,actor,employeeId,kind,created,{expectedVersion:2,note:"Concurrent modern"},"update");
        }return out;};
      return executeYuzhouRecordItem(proxy,scope,actor,item(newKey,{note:"Lost CAS source"}),sensitive,async()=>employeeId,operation);
    }),/Employee record changed/);
    assert.equal(raced,true);assert.deepEqual(await db.query("SELECT to_jsonb(i) row FROM hr_incremental_import_item i WHERE target_id=$1",[created]),ledgerBeforeRace);
    assert.equal((await db.query(`SELECT note FROM ${table} WHERE id=$1`,[created]))[0].note,"Concurrent modern");
    const parallel=item(newKey,kind==="skill"?{legacyGrade:"Parallel source"}:{issuingAuthority:"Parallel source"});
    const outcomes=await Promise.all([execute(parallel),execute(parallel)]);assert.deepEqual(outcomes.sort(),["applied","unchanged"]);
    assert.equal((await db.query(`SELECT version FROM ${table} WHERE id=$1`,[created]))[0].version,4);
    const orphanIdentity=sha(`${sourceTable}\0uncertified-synthetic`);
    await db.query(`UPDATE ${table} SET legacy_source_identity_sha256=$2,legacy_source_row_sha256=$3 WHERE id=$1`,[created,orphanIdentity,sha("uncertified raw row")]);
    await assert.rejects(execute(item(`sha256:${orphanIdentity}`,kind==="skill"?{skillName:"Must not duplicate"}:{credentialType:"synthetic",credentialName:"Must not duplicate"})),/RECORD_IMPORT_EVIDENCE_INVALID/);
    const importer=new HrYuzhouIncrementalImportService(db,sensitive);
    const publicPackage=async(items:YuzhouIncrementalItem[],manifest=randomUUID())=>requestDto({version:1,sourceSystem:"yuzhou-v10",manifestId:manifest,extractedAt:"2026-10-04T18:00:00Z",items});
    const publicImport=async(items:YuzhouIncrementalItem[])=>{
      const dto=await publicPackage(items),preview=result(await importer.preview(scope,actor,dto));
      return {dto,preview,outcome:result(await importer.commit(scope,actor,preview.id))};
    };
    const originalPublic=item(`sha256:${identities[2]}`,{note:"Public source update"});
    const accepted=await publicImport([originalPublic]);assert.equal(accepted.preview.plan[0]!.action,"update");assert.equal(accepted.outcome.appliedCount,1);
    assert.equal(result(await importer.commit(scope,actor,accepted.preview.id)).appliedCount,1);
    assert.equal(result(await importer.preview(scope,actor,accepted.dto)).id,accepted.preview.id);
    assert.equal(result(await importer.status(scope,actor,accepted.preview.id)).status,"committed");
    assert.equal((await db.query(`SELECT version FROM ${table} WHERE id=$1`,[ids[2]]))[0].version,2);
    assert.equal((await publicImport([originalPublic])).outcome.unchangedCount,1);
    await assert.rejects(importer.preview(scope,{...actor,isSuper:false,permissions:[]},await publicPackage([originalPublic])),/permission is required/);
    const readOnly={...actor,isSuper:false,permissions:[kind==="skill"?"hr:employee_record:read":"hr:employee_credential:read"]};
    assert.equal(result(await importer.status(scope,readOnly,accepted.preview.id)).status,"committed");
    await assert.rejects(importer.commit(scope,readOnly,accepted.preview.id),/permission is required/);
    const employeeKey=`sha256:${sha(`dbo.person\0public-${kind}`)}`;
    const employeeItem:Input={domain:"employee",sourceTable:"dbo.person",sourceKey:employeeKey,fields:{employeeCode:`PUBLIC-${kind}`,fullName:"Synthetic dependent employee",employmentStatus:"preboarding"}};
    const dependent=item(`sha256:${sha(`${sourceTable}\0public-dependent`)}`,kind==="skill"?{skillName:"Synthetic dependent skill"}:{credentialType:"synthetic",credentialName:"Synthetic dependent credential"});
    dependent.fields.employeeSourceKey=employeeKey;
    const digestItem=(value:Input):YuzhouIncrementalItem=>({...value,rowDigest:sha(canonicalYuzhouInitialJson({...value,sourceUpdatedAt:null}))});
    const {rowDigest:_unused,...dependentInput}=dependent;void _unused;
    const linked=await publicImport([digestItem(dependentInput),digestItem(employeeItem)]);assert.equal(linked.outcome.appliedCount,2);
    const row=(await db.query(`SELECT r.employee_id,e.employee_code FROM hr_incremental_import_item i JOIN ${table} r ON r.id=i.target_id JOIN hr_employee e ON e.id=r.employee_id WHERE i.domain=$1 AND i.source_key=$2`,[kind,dependent.sourceKey]))[0];assert.equal(row.employee_code,`PUBLIC-${kind}`);
  }
}


test("first alias proof requires nonempty authenticated original source; malformed Unicode is rejected",async()=>{
  const sensitive=new PartySensitiveDataService({get:(key:string)=>key==="PARTY_DATA_ENCRYPTION_KEY"?"baseline-fixture-only-encryption-key-1234567890":undefined} as never);
  for(const value of [null,"","  ","\ud800","bad\0text"]) {
    const source={id:7,person:"EMP",oldaddr:value};
    const original:OriginalProfile={operation_id:operationId,owner_record_map_id:"map",owned_state:{},original:{},encrypted_source:sensitive.encrypt(JSON.stringify(source)),source_row_sha256:sha(canonicalYuzhouInitialJson(source)),source_identity_sha256:sha("dbo.person.core_residue\0"+7),employee_key:`sha256:${sha("dbo.person\0EMP")}`,target_id:"target",employee_id:"employee",binding_sha256:sha("binding"),binding:{targetScope:scope}};
    const provenance={certificate:{sourceRowSha256:original.source_row_sha256,bindingSha256:original.binding_sha256},certifiedOriginalTarget:{id:"target",employee_id:"employee",tenant_id:scope.tenantId,park_id:scope.parkId,version:1,native_place:null}};
    assert.throws(()=>originalProfileAliasProof(original,provenance,sensitive,["nativePlace"]),/PROFILE_ALIAS_ORIGINAL_(SOURCE_EMPTY|FIELD_INVALID)/);
  }
  // The global pipe does not validate arbitrary fields' values: the service must
  // reject invalid new aliases before it opens a transaction or probes a target.
  let queried=false;
  const service=new HrYuzhouIncrementalImportService({transaction:()=>{queried=true;throw new Error("unexpected query");}} as unknown as DataSource,sensitive);
  for(const value of ["\ud800","bad\0text"]) {
    const item={domain:"profile" as const,sourceTable:"dbo.profile",sourceKey:`sha256:${sha("source")}`,fields:{nativePlace:value}};
    const dto=await requestDto({version:1,sourceSystem:"yuzhou-v10",manifestId:"unicode-proof",extractedAt:"2026-10-04T12:00:00Z",items:[{...item,rowDigest:sha(canonicalYuzhouInitialJson({...item,sourceUpdatedAt:null}))}]});
    await assert.rejects(service.preview(scope,actor,dto),/PROFILE_ALIAS_FIELD_INVALID/);
  }
  assert.equal(queried,false);
});


/** Reuse the real original core ownership fixture, with a separate T5 operation.
 * This tiny declared fixture is not a rehearsal or actual source import. */
async function verifyFamilyOriginalReceipts(db:DataSource,sensitive:PartySensitiveDataService,employeeId:string,employeeIdentity:string) {
  const historicalMutation=(sql:string,args:unknown[])=>db.transaction(async m=>{await m.query("SET LOCAL session_replication_role=replica");await m.query(sql,args);});
  const migration=(name:string)=>readFileSync(resolve(root,"database/migrations",name),"utf8");
  await db.query(`CREATE TABLE sys_user(tenant_id varchar(64),park_id varchar(64),id uuid,UNIQUE(tenant_id,park_id,id))`);
  const schema=migration("000252_hr_lifecycle_employee_records.sql");
  await db.query(schema.slice(schema.indexOf("CREATE TABLE hr_employee_family ("),schema.indexOf("CREATE TABLE hr_employee_experience (")));
  const materialization=migration("000276_hr_legacy_employee_profile_materialization.sql");
  await db.query(materialization.match(/ALTER TABLE hr_employee_family[\s\S]*?;/)![0]);
  await db.query(migration("000336_hr_family_record_changes.sql"));
  await db.query(migration("000337_hr_incremental_family_baseline.sql"));
  const actorId=randomUUID();await db.query("INSERT INTO sys_user VALUES($1,$2,$3)",[scope.tenantId,scope.parkId,actorId]);
  const familyOperation="yzprod-import-20261004T140000Z-abcdef123456";
  const parent=(await db.query("SELECT * FROM hr_yuzhou_t5_followon_operation WHERE operation_id=$1",["yzprod-import-20261004T130000Z-abcdef123456"]))[0];
  const binding={...parent.binding,operationId:familyOperation};
  const map=(await db.query("SELECT id FROM legacy_record_map WHERE source_identity_sha256=$1 AND source_table='dbo.person' AND is_active",[employeeIdentity]))[0].id;
  const ids=[randomUUID(),randomUUID(),randomUUID()],sources=ids.map((_,i)=>({id:70+i,person:"OLD-0",rela:"子女",member:i===1?'Synthetic family "1"':"Synthetic family 0",tel:null,birthday:i===1?"1900-02-29":null,jobunit:"原单位",jobname:null,political:null}));
  const identities=sources.map(source=>sha(`dbo.family\0${source.id}`));
  const hashes=sources.map(source=>sha(canonicalYuzhouInitialJson(source)));
  await db.transaction(async m=>{
    await m.query("SET LOCAL session_replication_role=replica");
    await m.query(`INSERT INTO hr_yuzhou_t5_followon_operation(operation_id,parent_operation_id,payroll_operation_id,binding_sha256,binding,status,finished_at) VALUES($1,$2,$3,$4,$5,'succeeded',now())`,[familyOperation,parent.parent_operation_id,parent.payroll_operation_id,sha(canonicalYuzhouInitialJson(binding)),binding]);
    await m.query(`INSERT INTO migration_batch(run_id,source_system,source_snapshot_sha256,target_database,execution_context,t5_followon_operation_id,status,tool_version) VALUES($1,'yuzhou-v10',$2,current_database(),'t5_production_followon',$1,'succeeded',$3)`,[familyOperation,sha("fixture"),`t5-followon-v1@${binding.executionCodeSha}`]);
    for(let i=0;i<ids.length;i++) {
      const name=sensitive.identityProfile(sources[i]!.member);
      await m.query(`INSERT INTO hr_employee_family(id,tenant_id,park_id,employee_id,relationship,full_name_encrypted,full_name_masked,full_name_fingerprint,work_unit,create_by,update_by,legacy_source_identity_sha256,legacy_source_row_sha256) VALUES($1,$2,$3,$4,'子女',$5,$6,$7,'原单位',$8,$8,$9,$10)`,[ids[i],scope.tenantId,scope.parkId,employeeId,name.encrypted,name.masked,name.hash,actorId,identities[i],hashes[i]]);
      const sourceId=(await m.query(`INSERT INTO hr_yuzhou_t5_followon_source(operation_id,tenant_id,park_id,source_domain,source_table,source_identity_sha256,source_row_sha256,encrypted_source,owner_status,employee_id,owner_record_map_id) VALUES($1,$2,$3,'family','dbo.family',$4,$5,$6,'mapped',$7,$8) RETURNING id`,[familyOperation,scope.tenantId,scope.parkId,identities[i],hashes[i],sensitive.encrypt(JSON.stringify(i===1?{...sources[i],member:JSON.stringify(sources[i]!.member).slice(1,-1)}:sources[i])),employeeId,map]))[0].id;
      for(const [table,id] of [["hr_employee_family",ids[i]],["hr_yuzhou_t5_followon_source",sourceId]])await m.query(`INSERT INTO hr_yuzhou_t5_followon_projection_receipt VALUES($1,$2,$3,$4,'insert',$5,NULL)`,[familyOperation,table,identities[i],hashes[i],id]);
    }
    await m.query("SET LOCAL TIME ZONE 'Asia/Shanghai'");
    const agg=async(q:string,args:unknown[])=>(await m.query(`SELECT count(*)::int AS count,encode(digest(COALESCE(string_agg(h,'' ORDER BY h),''),'sha256'),'hex') AS sha256 FROM (SELECT encode(digest(to_jsonb(x)::text,'sha256'),'hex') h FROM (${q}) x) hashes`,args))[0];
    const families=await agg("SELECT * FROM hr_employee_family WHERE id=ANY($1::uuid[])",[ids]),receipts=await agg("SELECT * FROM hr_yuzhou_t5_followon_projection_receipt WHERE operation_id=$1",[familyOperation]);
    await m.query("UPDATE hr_yuzhou_t5_followon_operation SET owned_state=$2 WHERE operation_id=$1",[familyOperation,{hr_employee_family:families,receipts}]);
  });
  const resolveOriginal=(targetScope=scope)=>db.transaction(async m=>{
    const original=await originalFamily(m,targetScope,identities[0]!,sensitive);assert.ok(original);
    assert.deepEqual(original.source,sources[0]);
    const certified=await certifyOriginalFamilies(m,original,targetScope,sensitive);
    const facts=originalFamilySourceFacts(original,certified,sensitive);
    assert.equal(facts.fields.workUnit,"原单位");assert.deepEqual(facts.pendingFields,[]);
    const second=await originalFamily(m,targetScope,identities[1]!,sensitive);assert.ok(second);
    const secondFacts=originalFamilySourceFacts(second,certified,sensitive);
    assert.equal(secondFacts.fields.birthDate,null);assert.deepEqual(secondFacts.pendingFields,["birthDate"]);
    assert.equal("identityNumber" in facts.fields,false);assert.equal("isEmergencyContact" in facts.fields,false);
    assert.throws(()=>originalFamilySourceFacts(original,new Map([[original.target_id,{...certified.get(original.target_id),work_unit:"invented baseline"}]]),sensitive),/FAMILY_ORIGINAL_FIELD_INCOMPATIBLE/);
    return certified;
  });
  const before=await resolveOriginal();assert.equal(before.size,3);
  await assert.rejects(resolveOriginal({...scope,parkId:"foreign"}),/FAMILY_ORIGINAL_EVIDENCE_INVALID/);
  await assert.rejects(originalFamily(db.manager,scope,identities[0]!,sensitive),/FAMILY_ORIGINAL_EVIDENCE_INVALID/);
  assert.equal(await db.transaction(m=>originalFamily(m,scope,sha("absent"),sensitive)),null);
  const lifecycle=new HrLifecycleService(db,sensitive,{recordOperationRequired:async()=>undefined} as never);
  const managerActor={sub:actorId,isSuper:true,permissions:["*"]} as never;
  let certificateLocked!:()=>void,releaseCertificate!:()=>void;
  const reached=new Promise<void>(resolve=>{certificateLocked=resolve}),released=new Promise<void>(resolve=>{releaseCertificate=resolve});
  const accepting=db.transaction(async m=>{
    const original=await originalFamily(m,scope,identities[0]!,sensitive);assert.ok(original);
    await certifyOriginalFamilies(m,original,scope,sensitive);certificateLocked();await released;
    return mutateFamilyRecordInTransaction(m,scope,managerActor,employeeId,ids[0]!,{expectedVersion:1,workUnit:"现代单位"},"update",sensitive);
  });
  await reached;
  let competingSettled=false;
  const competing=lifecycle.updateFamilyRecord(scope,managerActor,employeeId,ids[0]!,{expectedVersion:1,workUnit:"competing"}).then(()=>{competingSettled=true;return null;},error=>{competingSettled=true;return error;});
  await new Promise(resolve=>setTimeout(resolve,100));const blocked=!competingSettled;releaseCertificate();
  assert.equal((await accepting).version,2);assert.equal(blocked,true);
  assert.match(String(await competing),/Family record changed/);
  assert.deepEqual(await resolveOriginal(),before);
  await lifecycle.archiveFamilyRecord(scope,managerActor,employeeId,ids[0]!,{expectedVersion:2});
  assert.deepEqual(await resolveOriginal(),before);
  const archived=(await db.query("SELECT to_jsonb(f) AS row FROM hr_employee_family f WHERE id=$1",[ids[0]]))[0];
  assert.equal(archived.row.is_deleted,true);
  await historicalMutation("UPDATE hr_yuzhou_t5_followon_operation SET status='rolled_back',rolled_back_at=now() WHERE operation_id=$1",[familyOperation]);
  await assert.rejects(resolveOriginal(),/FAMILY_ORIGINAL_EVIDENCE_INVALID/);
  await historicalMutation("UPDATE hr_yuzhou_t5_followon_operation SET status='succeeded',rolled_back_at=NULL WHERE operation_id=$1",[familyOperation]);
  await historicalMutation("UPDATE hr_yuzhou_t5_followon_projection_receipt SET source_row_sha256=$3 WHERE operation_id=$1 AND source_identity_sha256=$2 AND target_table='hr_employee_family'",[familyOperation,identities[1],sha("tamper")]);
  await assert.rejects(resolveOriginal(),/FAMILY_ORIGINAL_RECEIPTS_CHANGED/);
  await historicalMutation("UPDATE hr_yuzhou_t5_followon_projection_receipt SET source_row_sha256=$3 WHERE operation_id=$1 AND source_identity_sha256=$2 AND target_table='hr_employee_family'",[familyOperation,identities[1],hashes[1]]);
  await historicalMutation("UPDATE hr_yuzhou_t5_followon_source SET encrypted_source=$3 WHERE operation_id=$1 AND source_identity_sha256=$2",[familyOperation,identities[0],sensitive.encrypt(JSON.stringify({...sources[0],person:"OTHER"}))]);
  await assert.rejects(resolveOriginal(),/FAMILY_ORIGINAL_EVIDENCE_INVALID/);
  await historicalMutation("UPDATE hr_yuzhou_t5_followon_source SET encrypted_source=$3 WHERE operation_id=$1 AND source_identity_sha256=$2",[familyOperation,identities[0],sensitive.encrypt(JSON.stringify(sources[0]))]);
  await historicalMutation("UPDATE legacy_record_map SET is_active=false WHERE id=$1",[map]);
  await assert.rejects(resolveOriginal(),/FAMILY_ORIGINAL_EVIDENCE_INVALID/);
  await historicalMutation("UPDATE legacy_record_map SET is_active=true WHERE id=$1",[map]);
  const firstJournal=(await db.query("SELECT to_jsonb(j) AS row FROM hr_employee_family_change j WHERE family_id=$1 AND version=2",[ids[0]]))[0].row;
  await historicalMutation("DELETE FROM hr_employee_family_change WHERE family_id=$1 AND version=2",[ids[0]]);
  await assert.rejects(resolveOriginal(),/FAMILY_ORIGINAL_SET_INVALID/);
  await historicalMutation("INSERT INTO hr_employee_family_change SELECT * FROM jsonb_populate_record(NULL::hr_employee_family_change,$1::jsonb)",[JSON.stringify(firstJournal)]);
  await historicalMutation("UPDATE hr_employee_family_change SET before_encrypted=$2 WHERE family_id=$1 AND version=2",[ids[0],sensitive.encrypt("[]")]);
  await assert.rejects(resolveOriginal(),/FAMILY_ORIGINAL_SET_INVALID/);
  await historicalMutation("UPDATE hr_employee_family_change SET before_encrypted=$2 WHERE family_id=$1 AND version=2",[ids[0],firstJournal.before_encrypted]);
  assert.deepEqual(await resolveOriginal(),before);
  assert.deepEqual((await db.query("SELECT to_jsonb(f) AS row FROM hr_employee_family f WHERE id=$1",[ids[0]]))[0],archived);
  // Persist the actual new schema's encrypted baseline/provenance, independently
  // of the still-pending API admission. No family source is declared imported.
  const incrementalOperation=(await db.query(`INSERT INTO hr_incremental_import_operation(tenant_id,park_id,source_system,manifest_id,package_sha256,package_encrypted,item_count,created_by) VALUES($1,$2,'yuzhou-v10',$3,$4,$5,1,$6) RETURNING id`,[scope.tenantId,scope.parkId,randomUUID(),sha("family-schema-fixture"),sensitive.encrypt("{}"),actorId]))[0].id;
  const itemArgs=[scope.tenantId,scope.parkId,`sha256:${identities[0]}`,ids[0],hashes[0],sensitive.encrypt(JSON.stringify(sources[0])),sha(canonicalYuzhouInitialJson(sources[0])),incrementalOperation,sensitive.encrypt(JSON.stringify({fields:{workUnit:"原单位"},target:{workUnit:"原单位"}}))];
  const itemSql=`INSERT INTO hr_incremental_import_item(tenant_id,park_id,source_system,source_table,source_key,domain,target_table,target_id,last_row_sha256,source_facts_encrypted,source_facts_sha256,last_operation_id,baseline_encrypted) VALUES($1,$2,'yuzhou-v10','dbo.family',$3,'family','hr_employee_family',$4,$5,$6,$7,$8,$9) RETURNING id`;
  await assert.rejects(db.query(itemSql,[...itemArgs.slice(0,8),null]),/ck_hr_incremental_family_private_baseline/);
  await assert.rejects(db.query(itemSql,[...itemArgs.slice(0,8),"plain private baseline"]),/ck_hr_incremental_family_private_baseline/);
  await assert.rejects(db.query(itemSql.replace("'hr_employee_family'","NULL"),itemArgs),/ck_hr_incremental_family_private_baseline/);
  const itemId=(await db.query(itemSql,itemArgs))[0].id;
  await assert.rejects(db.query(`UPDATE hr_incremental_import_item SET field_baseline='{"fullName":"plain private name"}' WHERE id=$1`,[itemId]),/ck_hr_incremental_family_private_baseline/);
  await assert.rejects(db.query("UPDATE hr_incremental_import_item SET target_table=NULL WHERE id=$1",[itemId]),/FAMILY_INCREMENTAL_SOURCE_IMMUTABLE/);
  await assert.rejects(db.query("UPDATE hr_incremental_import_item SET source_key=$2 WHERE id=$1",[itemId,`sha256:${sha("rebind")}`]),/FAMILY_INCREMENTAL_SOURCE_IMMUTABLE/);
  await assert.rejects(db.query("UPDATE hr_incremental_import_item SET target_id=$2 WHERE id=$1",[itemId,ids[1]]),/FAMILY_INCREMENTAL_SOURCE_IMMUTABLE/);
  await assert.rejects(db.query("UPDATE hr_incremental_import_item SET domain='profile' WHERE id=$1",[itemId]),/FAMILY_INCREMENTAL_SOURCE_IMMUTABLE/);
  await assert.rejects(db.query("DELETE FROM hr_incremental_import_item WHERE id=$1",[itemId]),/FAMILY_INCREMENTAL_SOURCE_IMMUTABLE/);
  await db.query("UPDATE hr_incremental_import_item SET version=version+1,baseline_encrypted=$2 WHERE id=$1",[itemId,itemArgs[8]]);
  await assert.rejects(db.query("UPDATE hr_incremental_import_item SET version=1 WHERE id=$1",[itemId]),/FAMILY_INCREMENTAL_SOURCE_IMMUTABLE/);
  const storedItem=(await db.query("SELECT field_baseline,target_baseline,baseline_encrypted,source_facts_encrypted FROM hr_incremental_import_item WHERE id=$1",[itemId]))[0];
  assert.deepEqual(storedItem.field_baseline,{});assert.deepEqual(storedItem.target_baseline,{});assert.match(storedItem.baseline_encrypted,/^enc:v1:/);
  const sourceId=(await db.query("SELECT id FROM hr_yuzhou_t5_followon_source WHERE operation_id=$1 AND source_identity_sha256=$2",[familyOperation,identities[0]]))[0].id;
  const frozen=(await db.query("SELECT owned_state FROM hr_yuzhou_t5_followon_operation WHERE operation_id=$1",[familyOperation]))[0].owned_state;
  const insertBaseline=`INSERT INTO hr_incremental_family_baseline(item_id,operation_id,tenant_id,park_id,employee_id,family_id,original_operation_id,original_source_id,source_identity_sha256,original_source_row_sha256,original_family_set_sha256,original_receipt_set_sha256,original_binding_sha256,witness_sha256,provenance_encrypted,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`;
  const baselineArgs=[itemId,incrementalOperation,scope.tenantId,scope.parkId,employeeId,ids[0],familyOperation,sourceId,identities[0],hashes[0],frozen.hr_employee_family.sha256,frozen.receipts.sha256,sha(canonicalYuzhouInitialJson(binding)),sha("family-witness"),sensitive.encrypt(JSON.stringify({originalSource:sources[0],originalTarget:before.get(ids[0]!)})),actorId];
  for(const [index,value] of [[3,"foreign"],[4,randomUUID()],[9,sha("changed row")],[10,sha("changed set")],[11,sha("changed receipt set")],[12,sha("changed binding")]] as const) {
    const invalid=[...baselineArgs];invalid[index]=value;
    await assert.rejects(db.query(insertBaseline,invalid),/FAMILY_BASELINE_BINDING_INVALID/);
  }
  const privateInvalid=[...baselineArgs];privateInvalid[14]="plain private provenance";
  await assert.rejects(db.query(insertBaseline,privateInvalid),/provenance_encrypted_check/);
  await db.query(insertBaseline,baselineArgs);
  // The import executor must use this same manager for ledger, target and journal.
  // Here a real journal INSERT failure verifies transaction reuse, not a mocked
  // transaction wrapper or a second independently committed maintenance call.
  const secondItemArgs=[...itemArgs];secondItemArgs[2]=`sha256:${identities[1]}`;secondItemArgs[3]=ids[1];secondItemArgs[4]=hashes[1];
  const secondItemId=(await db.query(itemSql,secondItemArgs))[0].id;
  const targetBefore=(await db.query("SELECT to_jsonb(f) AS row FROM hr_employee_family f WHERE id=$1",[ids[1]]))[0];
  const ledgerBefore=(await db.query("SELECT to_jsonb(i) AS row FROM hr_incremental_import_item i WHERE id=$1",[secondItemId]))[0];
  await assert.rejects(mutateFamilyRecordInTransaction(db.manager,scope,managerActor,employeeId,ids[1]!,{expectedVersion:1,workUnit:"outside"},"update",sensitive),/active transaction/);
  await assert.rejects(db.transaction(m=>mutateFamilyRecordInTransaction(m,scope,{sub:actorId,permissions:[],isSuper:false} as never,employeeId,ids[1]!,{expectedVersion:1,workUnit:"denied"},"update",sensitive)),/Forbidden/);
  const importedCipher=sensitive.encrypt(JSON.stringify({fields:{workUnit:"来源新单位"},target:{workUnit:"来源新单位"}}));
  const transactionWrite=()=>db.transaction(async m=>{
    await m.query("UPDATE hr_incremental_import_item SET version=version+1,baseline_encrypted=$2 WHERE id=$1",[secondItemId,importedCipher]);
    return mutateFamilyRecordInTransaction(m,scope,managerActor,employeeId,ids[1]!,{expectedVersion:1,workUnit:"来源新单位"},"update",sensitive);
  });
  await db.query(`CREATE FUNCTION synthetic_family_import_journal_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'SYNTHETIC_IMPORT_JOURNAL_FAILURE'; END $$; CREATE TRIGGER synthetic_family_import_journal_failure BEFORE INSERT ON hr_employee_family_change FOR EACH ROW EXECUTE FUNCTION synthetic_family_import_journal_failure()`);
  await assert.rejects(transactionWrite(),/SYNTHETIC_IMPORT_JOURNAL_FAILURE/);
  assert.deepEqual((await db.query("SELECT to_jsonb(f) AS row FROM hr_employee_family f WHERE id=$1",[ids[1]]))[0],targetBefore);
  assert.deepEqual((await db.query("SELECT to_jsonb(i) AS row FROM hr_incremental_import_item i WHERE id=$1",[secondItemId]))[0],ledgerBefore);
  assert.equal((await db.query("SELECT count(*)::int n FROM hr_employee_family_change WHERE family_id=$1",[ids[1]]))[0].n,0);
  await db.query("DROP TRIGGER synthetic_family_import_journal_failure ON hr_employee_family_change");
  assert.equal((await transactionWrite()).version,2);
  assert.equal((await db.query("SELECT version FROM hr_incremental_import_item WHERE id=$1",[secondItemId]))[0].version,2);
  assert.equal((await db.query("SELECT count(*)::int n FROM hr_employee_family_change WHERE family_id=$1 AND version=2",[ids[1]]))[0].n,1);
  await assert.rejects(transactionWrite(),/Family record changed/);
  assert.equal((await db.query("SELECT version FROM hr_incremental_import_item WHERE id=$1",[secondItemId]))[0].version,2);

  await assert.rejects(db.query("UPDATE hr_incremental_family_baseline SET witness_sha256=$2 WHERE item_id=$1",[itemId,sha("reset")]),/INITIAL_BASELINE_PROVENANCE_IMMUTABLE/);
  await assert.rejects(db.query("DELETE FROM hr_incremental_family_baseline WHERE item_id=$1",[itemId]),/INITIAL_BASELINE_PROVENANCE_IMMUTABLE/);
  // Genuine DTO -> shared public package -> service preview/commit/status path.
  // The third original family row has no synthetic manually seeded ledger.
  const importer=new HrYuzhouIncrementalImportService(db,sensitive);
  const familyItem=(key:string,fields:Record<string,unknown>):YuzhouIncrementalItem=>{
    const row={domain:"family" as const,sourceTable:"dbo.family",sourceKey:key,fields:{employeeSourceKey:`sha256:${employeeIdentity}`,employeeSourceTable:"dbo.person",...fields}};
    return {...row,rowDigest:sha(canonicalYuzhouInitialJson({...row,sourceUpdatedAt:null}))};
  };
  const familyPackage=async(items:YuzhouIncrementalItem[])=>requestDto({version:1,sourceSystem:"yuzhou-v10",manifestId:randomUUID(),extractedAt:"2026-10-04T16:00:00Z",items});
  const previewFamily=async(items:YuzhouIncrementalItem[])=>result(await importer.preview(scope,managerActor,await familyPackage(items)));
  const importFamily=async(items:YuzhouIncrementalItem[])=>{const preview=await previewFamily(items);return {preview,outcome:result(await importer.commit(scope,managerActor,preview.id))};};
  const originalApiItem=familyItem(`sha256:${identities[2]}`,{workUnit:"来源首次更新"});
  const originalPreview=await previewFamily([originalApiItem]);assert.equal(originalPreview.plan[0]!.action,"update");
  const originalOutcome=result(await importer.commit(scope,managerActor,originalPreview.id));assert.equal(originalOutcome.appliedCount,1);
  const committedTarget=(await db.query("SELECT to_jsonb(f) AS row FROM hr_employee_family f WHERE id=$1",[ids[2]]))[0];
  assert.equal(committedTarget.row.work_unit,"来源首次更新");assert.equal(committedTarget.row.version,2);
  await importer.commit(scope,managerActor,originalPreview.id);
  assert.deepEqual((await db.query("SELECT to_jsonb(f) AS row FROM hr_employee_family f WHERE id=$1",[ids[2]]))[0],committedTarget);
  assert.equal((await db.query("SELECT count(*)::int n FROM hr_incremental_family_baseline WHERE family_id=$1",[ids[2]]))[0].n,1);
  assert.equal((await importFamily([originalApiItem])).outcome.unchangedCount,1);
  await lifecycle.updateFamilyRecord(scope,managerActor,employeeId,ids[2]!,{expectedVersion:2,contact:"MODERN-CONTACT"});
  const independent=await importFamily([familyItem(`sha256:${identities[2]}`,{workUnit:"来源再次更新",contact:null})]);
  assert.equal(independent.outcome.appliedCount,1);
  const independentTarget=(await db.query("SELECT * FROM hr_employee_family WHERE id=$1",[ids[2]]))[0];
  assert.equal(sensitive.decrypt(independentTarget.contact_encrypted),"MODERN-CONTACT");assert.equal(independentTarget.work_unit,"来源再次更新");
  const conflict=await importFamily([familyItem(`sha256:${identities[2]}`,{contact:"DIFFERENT-SOURCE"})]);
  assert.equal(conflict.outcome.status,"conflicted");assert.equal(conflict.outcome.appliedCount,0);
  assert.deepEqual((await db.query("SELECT * FROM hr_employee_family WHERE id=$1",[ids[2]]))[0],independentTarget);
  const converged=await importFamily([familyItem(`sha256:${identities[2]}`,{contact:"MODERN-CONTACT"})]);assert.equal(converged.outcome.appliedCount,1);
  assert.deepEqual((await db.query("SELECT * FROM hr_employee_family WHERE id=$1",[ids[2]]))[0],independentTarget);
  const newIdentity=`sha256:${sha("dbo.family\0"+9001)}`;
  const newFamilyItem=familyItem(newIdentity,{relationship:"父亲",fullName:"New synthetic family",birthDate:"2000-02-29"});
  const newFamily=await importFamily([newFamilyItem]);assert.equal(newFamily.preview.plan[0]!.action,"create");assert.equal(newFamily.outcome.appliedCount,1);
  const newTarget=(await db.query("SELECT target_id FROM hr_incremental_import_item WHERE domain='family' AND source_key=$1",[newIdentity]))[0].target_id;
  assert.equal((await db.query("SELECT count(*)::int n FROM hr_employee_family_change WHERE family_id=$1 AND action='create'",[newTarget]))[0].n,1);
  await importer.commit(scope,managerActor,newFamily.preview.id);
  assert.equal((await importFamily([newFamilyItem])).outcome.unchangedCount,1);
  const sourceUpdatedNew=await importFamily([familyItem(newIdentity,{contact:"NEW-SOURCE-CONTACT"})]);assert.equal(sourceUpdatedNew.outcome.appliedCount,1);
  await assert.rejects(importer.preview(scope,{sub:actorId,permissions:[],isSuper:false} as never,await familyPackage([originalApiItem])),/permission is required/);
  await assert.rejects(importer.preview({...scope,parkId:"foreign"},managerActor,await familyPackage([originalApiItem])),/FAMILY_ORIGINAL_EVIDENCE_INVALID/);
  await lifecycle.archiveFamilyRecord(scope,managerActor,employeeId,ids[2]!,{expectedVersion:4});
  assert.equal((await importFamily([familyItem(`sha256:${identities[2]}`,{workUnit:"resurrection attempt"})])).outcome.status,"conflicted");
  assert.equal((await db.query("SELECT is_deleted FROM hr_employee_family WHERE id=$1",[ids[2]]))[0].is_deleted,true);
  const failedNew=familyItem(`sha256:${sha("dbo.family\0"+9002)}`,{relationship:"子女",fullName:"Rollback source member"});
  const failedPreview=await previewFamily([failedNew]);
  await db.query(`CREATE TRIGGER synthetic_family_import_journal_failure BEFORE INSERT ON hr_employee_family_change FOR EACH ROW EXECUTE FUNCTION synthetic_family_import_journal_failure()`);
  const countBefore=(await db.query("SELECT count(*)::int n FROM hr_employee_family"))[0].n;
  await assert.rejects(importer.commit(scope,managerActor,failedPreview.id),/SYNTHETIC_IMPORT_JOURNAL_FAILURE/);
  assert.equal((await db.query("SELECT count(*)::int n FROM hr_employee_family"))[0].n,countBefore);
  assert.equal((await db.query("SELECT count(*)::int n FROM hr_incremental_import_item WHERE source_key=$1",[failedNew.sourceKey]))[0].n,0);
  assert.equal(result(await importer.status(scope,managerActor,failedPreview.id)).status,"previewed");
  await db.query("DROP TRIGGER synthetic_family_import_journal_failure ON hr_employee_family_change");
  assert.equal(result(await importer.commit(scope,managerActor,failedPreview.id)).appliedCount,1);
  const employeeSourceKey=`sha256:${sha("dbo.person\0FAMILY-NEW-EMP")}`;
  const employeeFields={employeeCode:"FAMILY-NEW-EMP",fullName:"Family new employee",employmentStatus:"active",employmentType:"full_time",orgSourceKey:`sha256:${sha("dbo.departmentcode\0INC-ORG")}`};
  const employeeRow={domain:"employee" as const,sourceTable:"dbo.person",sourceKey:employeeSourceKey,fields:employeeFields};
  const employeeItem={...employeeRow,rowDigest:sha(canonicalYuzhouInitialJson({...employeeRow,sourceUpdatedAt:null}))};
  const dependent=familyItem(`sha256:${sha("dbo.family\0"+9003)}`,{employeeSourceKey,relationship:"子女",fullName:"Dependent source member"});
  const mixed=await importFamily([dependent,employeeItem]);assert.equal(mixed.outcome.appliedCount,2);
  const linked=(await db.query(`SELECT f.employee_id,e.employee_code FROM hr_incremental_import_item i JOIN hr_employee_family f ON f.id=i.target_id JOIN hr_employee e ON e.id=f.employee_id WHERE i.domain='family' AND i.source_key=$1`,[dependent.sourceKey]))[0];
  assert.equal(linked.employee_code,"FAMILY-NEW-EMP");
  assert.equal((await importFamily([dependent,employeeItem])).outcome.unchangedCount,2);
  const revisions=await db.query("SELECT field_diff,before_receipt,after_receipt FROM hr_incremental_import_revision WHERE operation_id=$1",[originalPreview.id]);
  assert.equal(JSON.stringify(revisions).includes("来源首次更新"),false);assert.equal(JSON.stringify(revisions).includes("MODERN-CONTACT"),false);

  assert.deepEqual(await resolveOriginal(),before);
  assert.deepEqual((await db.query("SELECT to_jsonb(f) AS row FROM hr_employee_family f WHERE id=$1",[ids[0]]))[0],archived);

}
