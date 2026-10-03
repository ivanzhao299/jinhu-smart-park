import "reflect-metadata";
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";
import { DataSource, EntityManager } from "typeorm";
import { PartySensitiveDataService } from "../../shared/security/party-sensitive-data.service";
import { HrYuzhouIncrementalImportService } from "./hr-yuzhou-incremental-import.service";
import { HrEmployeeEntity, HrContractEntity, HrContractTypeEntity, HrContractActionEntity } from "./entities/hr.entities";
import { canonicalYuzhouInitialJson, YUZHOU_INITIAL_CANONICALIZATION, YUZHOU_INITIAL_PROJECTION_FIELDS, type YuzhouIncrementalItem, type YuzhouInitialBaselineWitness } from "@jinhu/shared";
import { plainToInstance } from "class-transformer";
import { validateOrReject } from "class-validator";
import { PreviewYuzhouIncrementalImportDto } from "./dto/yuzhou-incremental-import.dto";

const root=resolve(__dirname,"../../../../.."),sha=(s:string)=>createHash("sha256").update(s).digest("hex");
const scope={tenantId:"baseline-tenant",parkId:"baseline-park"};
const actor={sub:randomUUID(),isSuper:true,permissions:["*"]} as never;
const operationId="yzprod-import-20261004T120000Z-123456abcdef";
type Input=Omit<YuzhouIncrementalItem,"rowDigest">;
const pkg=(input:Input,manifestId=randomUUID()):PreviewYuzhouIncrementalImportDto=>({version:1,sourceSystem:"yuzhou-v10",manifestId,extractedAt:"2026-10-04T12:00:00Z",items:[{...input,rowDigest:sha(canonicalYuzhouInitialJson({domain:input.domain,sourceTable:input.sourceTable,sourceKey:input.sourceKey,sourceUpdatedAt:input.sourceUpdatedAt??null,fields:input.fields}))}]});
const result=(value:unknown)=>value as {id:string;status:string;appliedCount:number;unchangedCount:number;plan:Array<{action:string;conflictFields:string[]}>};

test("original receipt baselines: real PostgreSQL proof, isolation, CAS and immutable provenance",{skip:process.env.HR_YUZHOU_INITIAL_BASELINE_PG_REQUIRED!=="1",timeout:90000},async t=>{
  assert.equal(process.env.POSTGRES_HOST,"127.0.0.1"); assert.equal(process.env.POSTGRES_PORT,"55491");
  const database=`jinhu_hr_baseline_lab_${randomBytes(12).toString("hex")}`;
  assert.match(database,/^jinhu_hr_baseline_lab_[a-f0-9]{24}$/);
  const connection={type:"postgres" as const,host:"127.0.0.1",port:55491,username:process.env.POSTGRES_USER,password:process.env.POSTGRES_PASSWORD,database};
  const admin=new DataSource({...connection,database:"postgres"});await admin.initialize();
  let db:DataSource|undefined,created=false;
  try {
    await admin.query(`CREATE DATABASE "${database}" TEMPLATE template0`);created=true;
    db=new DataSource({...connection,synchronize:true,entities:[HrEmployeeEntity,HrContractEntity,HrContractTypeEntity,HrContractActionEntity]});await db.initialize();
    assert.equal((await db.query(`SELECT current_database() AS name`))[0].name,database);
    await db.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; CREATE TABLE hr_legacy_identity_registry(owner_record_map_id uuid,mapping_status varchar(32));`);
    for(const prefix of ["000235_hr_legacy_migration_control","000278_hr_yuzhou_production_import_control","000281_hr_yuzhou_production_import_control_v2","000282_hr_yuzhou_production_import_writer_receipts","000327_hr_yuzhou_incremental_import_ledger","000329_hr_incremental_initial_baseline"]) await db.query(readFileSync(resolve(root,`database/migrations/${prefix}.sql`),"utf8"));
    const sensitive=new PartySensitiveDataService({get:(key:string)=>key==="PARTY_DATA_ENCRYPTION_KEY"?"baseline-fixture-only-encryption-key-1234567890":undefined} as never);
    const service=new HrYuzhouIncrementalImportService(db,sensitive);
    const orgId=randomUUID(),typeId=randomUUID(),positionId=randomUUID();
    await db.getRepository(HrContractTypeEntity).save({id:typeId,...scope,typeCode:"fixed",typeName:"Fixed",status:"enabled"});
    const employees:Input[]=[];
    for(let i=0;i<12;i++) {
      const employee=await db.getRepository(HrEmployeeEntity).save({...scope,employeeCode:`OLD-${i}`,fullName:`Original ${i}`,employmentType:"full_time",employmentStatus:"active",hireDate:"2020-01-01"});
      const projection:Record<string,unknown>=Object.fromEntries(YUZHOU_INITIAL_PROJECTION_FIELDS.hr_employee.map(k=>[k,null]));
      Object.assign(projection,{tenant_id:scope.tenantId,park_id:scope.parkId,employee_code:employee.employeeCode,full_name:employee.fullName,employment_type:"full_time",employment_status:"active",hire_date:"2020-01-01",primary_org_id:orgId,position_id:i===10?positionId:null});
      employees.push({domain:"employee",sourceTable:"dbo.person",sourceKey:`sha256:${sha(`person-${i}`)}`,fields:{employeeCode:employee.employeeCode,fullName:employee.fullName,employmentType:"full_time",employmentStatus:"active",hireDate:"2020-01-01"},initialBaselineWitness:{version:1,operationId,phase:"T0",canonicalizationVersion:YUZHOU_INITIAL_CANONICALIZATION,targetId:employee.id,projection}});
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
        if(process.env.HR_YUZHOU_ORIGINAL_READONLY_PG_ONLY==="1" && ["T0","T2"].includes(phase)) {
          // Genuine source plans also retain quarantined rows without business targets.
          // Their receipts/dependencies must not enter the inserted-record expectation.
          const identity=sha(`quarantined-${phase}`),table=phase==="T0"?"hr_employee":"hr_contract",sourceTable=phase==="T0"?"dbo.person":"dbo.compact";
          await m.query(`INSERT INTO hr_yuzhou_production_import_record(operation_id,phase,source_identity_sha256,source_row_sha256,disposition,planned_target_table,decision_attestation_sha256,source_system,source_table,source_pk_canonical) VALUES($1,$2,$3,$4,'quarantine',$5,$4,'yuzhou-v10',$6,$7)`,[operationId,phase,identity,h,table,sourceTable,`sha256:${identity}`]);
          const deps=phase==="T0"?[["primary_org","T0",sha("org"),"sys_org"]]:[["employee","T0",employees[0]!.sourceKey.slice(7),"hr_employee"],["contract_type","T2",sha("type"),"hr_contract_type"]];
          for(const [role,depPhase,depIdentity,depTable] of deps) await m.query(`INSERT INTO hr_yuzhou_production_import_record_dependency VALUES($1,$2,$3,$4,$5,$6,$7)`,[operationId,phase,identity,role,depPhase,depIdentity,depTable]);
          const map=(await m.query(`INSERT INTO legacy_record_map(batch_id,source_system,source_table,source_pk_canonical,source_identity_sha256,source_row_sha256,target_table,mapping_status) VALUES($1,'yuzhou-v10',$2,$3,$4,$5,$6,'quarantined') RETURNING id`,[batch,sourceTable,`sha256:${identity}`,identity,h,table]))[0].id;
          await m.query(`INSERT INTO hr_yuzhou_production_import_projection_receipt(operation_id,phase,source_identity_sha256,migration_batch_id,legacy_record_map_id) VALUES($1,$2,$3,$4,$5)`,[operationId,phase,identity,batch,map]);
        }
        await m.query(`UPDATE hr_yuzhou_production_import_phase SET status='succeeded',finished_at=now() WHERE operation_id=$1 AND phase=$2`,[operationId,phase]);
      }
      await m.query(`UPDATE hr_yuzhou_production_import_operation SET status='succeeded',finished_at=now() WHERE operation_id=$1`,[operationId]);
    });
    if(process.env.HR_YUZHOU_ORIGINAL_READONLY_PG_ONLY==="1") {
      const probeSource=`import {buildOriginalBaselineReadonlySql, sanitizeOriginalBaselineObservation} from './scripts/diagnose-production-runtime-revision.mjs'; import {readFileSync} from 'node:fs'; const v=JSON.parse(readFileSync(0,'utf8')); console.log(JSON.stringify(v.raw===undefined?{sql:buildOriginalBaselineReadonlySql(v.expectation)}:sanitizeOriginalBaselineObservation(v.raw,v.expectation)));`;
      const runProbe=(input:unknown)=>JSON.parse(execFileSync(process.execPath,["--input-type=module","-e",probeSource],{cwd:root,input:JSON.stringify(input),encoding:"utf8"}));
      const aggregate=(lines:string[])=>sha(lines.sort().map(line=>line+"\n").join(""));
      const recordFields=["phase","source_system","source_table","source_pk_canonical","source_identity_sha256","source_row_sha256","target_table","target_id","target_after_sha256","target_version_after","disposition"];
      const depFields=["phase","source_identity_sha256","dependency_role","depends_on_phase","depends_on_source_identity_sha256","expected_target_table"];
      const domains=[];
      for(const [phase,targetTable] of [["T0","hr_employee"],["T2","hr_contract"]]) {
        const records=await db.query(`SELECT ${recordFields.join(",")} FROM hr_yuzhou_production_import_record WHERE operation_id=$1 AND phase=$2 AND target_table=$3`,[operationId,phase,targetTable]);
        const dependencies=await db.query(`SELECT ${depFields.map(f=>"d."+f).join(",")} FROM hr_yuzhou_production_import_record_dependency d JOIN hr_yuzhou_production_import_record r USING(operation_id,phase,source_identity_sha256) WHERE d.operation_id=$1 AND d.phase=$2 AND r.target_table=$3`,[operationId,phase,targetTable]);
        domains.push({phase,targetTable,records:records.length,recordSetSha256:aggregate(records.map((r:Record<string,unknown>)=>recordFields.map(f=>String(r[f])).join("\u001f"))),dependencies:dependencies.length,dependencySetSha256:aggregate(dependencies.map((d:Record<string,unknown>)=>depFields.map(f=>String(d[f])).join("\u001f")))});
      }
      const expectation={operationId,sealedPlanSha256:sha("fixture"),targetScope:{...scope,scopeSha256:sha(`yuzhou-hr-production-target-scope-v1\0${scope.tenantId}\0${scope.parkId}`)},triple:{codeSha:"a".repeat(40),mappingContractHash:sha("fixture"),sourceSnapshotHash:sha("fixture")},domains};
      const sql=runProbe({expectation}).sql as string;
      const query=async()=>{
        const runner=db!.createQueryRunner();await runner.connect();
        try {let rows:Record<string,unknown>[]=[];for(const statement of sql.split(";").filter(s=>s.trim())) {const result=await runner.query(statement);if(Array.isArray(result)&&result.length)rows=result;}const found=rows.find((r:Record<string,unknown>)=>typeof r.json_build_object==="string");assert.ok(found);return runProbe({expectation,raw:found.json_build_object});}
        finally {await runner.release();}
      };
      const before=await db.query(`SELECT (SELECT count(*) FROM hr_incremental_initial_baseline) baselines,(SELECT sum(version) FROM hr_employee) versions`);
      assert.equal((await db.query(`SELECT count(*)::int AS n FROM hr_yuzhou_production_import_record WHERE disposition='quarantine'`))[0].n,2);
      const initialProof=await query();assert.equal(initialProof.status,"PASS");assert.deepEqual(initialProof.domains.map((d:{records:number})=>d.records),[12,2],"quarantined employee/contract receipts and dependencies do not change inserted-original counts or hashes");
      assert.deepEqual(await db.query(`SELECT (SELECT count(*) FROM hr_incremental_initial_baseline) baselines,(SELECT sum(version) FROM hr_employee) versions`),before);
      await db.query(`UPDATE hr_employee SET full_name='Modern edit',version=version+1 WHERE id=$1`,[employees[0]!.initialBaselineWitness!.targetId]);
      assert.equal((await query()).status,"PASS","modern fields never enter original receipt digest");
      await db.query(`UPDATE hr_yuzhou_production_import_phase SET status='rolled_back' WHERE operation_id=$1 AND phase='T0'`,[operationId]);
      assert.equal((await query()).status,"FAIL");
      await db.query(`UPDATE hr_yuzhou_production_import_phase SET status='succeeded' WHERE operation_id=$1 AND phase='T0'`,[operationId]);
      await db.query(`DROP INDEX uq_legacy_record_map_active_source`);
      const duplicate=(await db.query(`INSERT INTO legacy_record_map(batch_id,source_system,source_table,source_pk_canonical,source_identity_sha256,source_row_sha256,target_table,target_id,mapping_status) SELECT batch_id,source_system,source_table,source_pk_canonical,source_identity_sha256,source_row_sha256,target_table,target_id,mapping_status FROM legacy_record_map WHERE source_identity_sha256=$1 RETURNING id`,[sha("org")]))[0].id;
      const ambiguous=await query();assert.equal(ambiguous.status,"FAIL");assert.equal(ambiguous.domains[0].eligibleDependencies,1,"dependency chains independently reject ambiguous org mapping");
      await db.query(`DELETE FROM legacy_record_map WHERE id=$1`,[duplicate]);
      assert.equal((await query()).status,"PASS");
      const wrong={...expectation,domains:domains.map((d,i)=>i===0?{...d,recordSetSha256:sha("tampered expectation")}:d)};
      const runner=db.createQueryRunner();await runner.connect();
      try {let rows:Record<string,unknown>[]=[];for(const statement of (runProbe({expectation:wrong}).sql as string).split(";").filter(s=>s.trim())) {const result=await runner.query(statement);if(Array.isArray(result)&&result.length)rows=result;}assert.equal(runProbe({expectation:wrong,raw:rows.find((r:Record<string,unknown>)=>typeof r.json_build_object==="string")!.json_build_object}).status,"FAIL");}finally{await runner.release();}
      await db.transaction(async m=>{await m.query(`UPDATE hr_yuzhou_production_import_record SET rollback_status='deleted_insert',rolled_back_at=now() WHERE operation_id=$1 AND source_identity_sha256=$2`,[operationId,employees[5]!.sourceKey.slice(7)]);await m.query(`UPDATE legacy_record_map SET is_active=false,mapping_status='rolled_back' WHERE source_identity_sha256=$1`,[employees[5]!.sourceKey.slice(7)]);});
      assert.equal((await query()).status,"FAIL");
      const anchorOnly={...employees[11]!,fields:{}};
      const targetBefore=await db.query(`SELECT full_name,version FROM hr_employee WHERE id=$1`,[anchorOnly.initialBaselineWitness!.targetId]);
      const dto=plainToInstance(PreviewYuzhouIncrementalImportDto,pkg(anchorOnly));await validateOrReject(dto,{whitelist:true,forbidNonWhitelisted:true});
      const preview=result(await service.preview(scope,actor,dto));assert.equal(preview.plan[0]!.action,"unchanged");
      assert.equal(result(await service.commit(scope,actor,preview.id)).unchangedCount,1);
      assert.deepEqual(await db.query(`SELECT full_name,version FROM hr_employee WHERE id=$1`,[anchorOnly.initialBaselineWitness!.targetId]),targetBefore);
      const anchored=(await db.query(`SELECT source_facts_encrypted,baseline_encrypted FROM hr_incremental_import_item WHERE source_key=$1`,[anchorOnly.sourceKey]))[0];
      const facts=JSON.parse(sensitive.decrypt(anchored.source_facts_encrypted)!);assert.equal(facts.fullName,"Original 11");assert.equal(facts.hireDate,"2020-01-01");assert.ok(anchored.baseline_encrypted.startsWith("enc:v1:"));
      await db.query(`UPDATE hr_employee SET full_name='Modern after anchor',version=version+1 WHERE id=$1`,[anchorOnly.initialBaselineWitness!.targetId]);
      const later=result(await service.preview(scope,actor,pkg({...anchorOnly,initialBaselineWitness:undefined,fields:{fullName:"Source next"}})));
      assert.equal(later.plan[0]!.action,"conflict");assert.ok(later.plan[0]!.conflictFields.includes("fullName"));
      t.diagnostic("Empty-field authenticated witness DTO anchors encrypted full original facts with zero business change; later same-field modern edit conflicts");
      t.diagnostic("Readonly original receipt SQL: actual migrations/writer fixture, hash parity, modern edits, independent ambiguous dependency chain, rollback and tamper refusal; business/baseline query writes=0");
      return;
    }
    const snapshot=async()=>Promise.all(["hr_employee","hr_contract","legacy_record_map","hr_yuzhou_production_import_record","hr_yuzhou_production_import_projection_receipt","migration_batch"].map(table=>db!.query(`SELECT row_to_json(r) AS row FROM ${table} r ORDER BY row_to_json(r)::text`)));
    const previewCommit=async(item:Input)=>{const dto=plainToInstance(PreviewYuzhouIncrementalImportDto,pkg(item));await validateOrReject(dto,{whitelist:true,forbidNonWhitelisted:true});const p=result(await service.preview(scope,actor,dto));return {preview:p,committed:result(await service.commit(scope,actor,p.id))};};
    const counts=async()=> (await db!.query(`SELECT (SELECT count(*)::int FROM hr_incremental_import_item) items,(SELECT count(*)::int FROM hr_incremental_initial_baseline) baselines,(SELECT count(*)::int FROM hr_incremental_import_revision) revisions`))[0];
    const original=await snapshot();
    const validated=plainToInstance(PreviewYuzhouIncrementalImportDto,pkg(employees[0]!));
    await validateOrReject(validated,{whitelist:true,forbidNonWhitelisted:true});
    const unchanged=result(await service.preview(scope,actor,validated));
    assert.equal(unchanged.plan[0]!.action,"unchanged");assert.deepEqual(await snapshot(),original);assert.deepEqual(await counts(),{items:0,baselines:0,revisions:0});
    assert.equal(result(await service.commit(scope,actor,unchanged.id)).unchangedCount,1);assert.deepEqual(await snapshot(),original);
    assert.equal(result(await service.commit(scope,actor,unchanged.id)).unchangedCount,1);assert.deepEqual(await counts(),{items:1,baselines:1,revisions:1});
    const provenance=(await db.query(`SELECT * FROM hr_incremental_initial_baseline`))[0];assert.ok(provenance.provenance_encrypted.startsWith("enc:v1:"));assert.equal(JSON.stringify(provenance).includes("Original 0"),false);
    await assert.rejects(db.query(`UPDATE hr_incremental_initial_baseline SET created_at=now()`),/IMMUTABLE/);
    await db.query(`UPDATE hr_employee SET work_location='Modern site',employment_status='suspended',version=version+1 WHERE id=$1`,[employees[1]!.initialBaselineWitness!.targetId]);
    const revised={...employees[1]!,fields:{...employees[1]!.fields,fullName:"Source correction"}};
    assert.equal((await previewCommit(revised)).committed.appliedCount,1);
    assert.deepEqual((await db.query(`SELECT full_name,work_location,employment_status FROM hr_employee WHERE id=$1`,[employees[1]!.initialBaselineWitness!.targetId]))[0],{full_name:"Source correction",work_location:"Modern site",employment_status:"suspended"});
    const later={...revised,initialBaselineWitness:undefined,fields:{...revised.fields,hireDate:"2020-02-01"}};assert.equal((await previewCommit(later)).committed.appliedCount,1);
    // Same-field modern correction conflicts, while independent baseline provenance remains usable.
    await db.query(`UPDATE hr_employee SET full_name='Modern name',version=version+1 WHERE id=$1`,[employees[2]!.initialBaselineWitness!.targetId]);
    const conflict={...employees[2]!,fields:{...employees[2]!.fields,fullName:"Source name"}};
    assert.equal((await previewCommit(conflict)).committed.status,"conflicted");
    const ledger=(await db.query(`SELECT * FROM hr_incremental_import_item WHERE source_key=$1`,[employees[2]!.sourceKey]))[0];assert.deepEqual(ledger.target_baseline,{});
    assert.equal((await previewCommit({...employees[2]!,initialBaselineWitness:undefined})).committed.unchangedCount,1);
    // An old unknown conflict can gain a baseline without rewriting the old revision.
    const unknown={...employees[3]!,initialBaselineWitness:undefined};assert.equal((await previewCommit(unknown)).committed.status,"conflicted");
    const historical=await db.query(`SELECT r.* FROM hr_incremental_import_revision r JOIN hr_incremental_import_item i ON i.id=r.item_id WHERE i.source_key=$1`,[unknown.sourceKey]);
    assert.equal((await previewCommit({...employees[3]!,fields:{...employees[3]!.fields,fullName:"Recovered"}})).committed.appliedCount,1);
    assert.deepEqual(await db.query(`SELECT * FROM hr_incremental_import_revision WHERE id=$1`,[historical[0].id]),historical);
    const lifecycle={...employees[4]!,fields:{...employees[4]!.fields,employmentStatus:"suspended"}};
    const life=await previewCommit(lifecycle);assert.ok(life.preview.plan[0]!.conflictFields.includes("NORMAL_EMPLOYMENT_WORKFLOW_REQUIRED"));assert.equal(life.committed.status,"conflicted");
    const c=await previewCommit({...contracts[0]!,fields:{...contracts[0]!.fields,endDate:"2031-01-01"}});assert.equal(c.committed.appliedCount,1);
    const active=await previewCommit({...contracts[1]!,fields:{...contracts[1]!.fields,endDate:"2031-01-01"}});assert.ok(active.preview.plan[0]!.conflictFields.includes("NORMAL_CONTRACT_WORKFLOW_REQUIRED"));assert.equal(active.committed.status,"conflicted");
    for(const mutate of [
      (w:YuzhouInitialBaselineWitness)=>{w.projection.full_name="forged";},
      (w:YuzhouInitialBaselineWitness)=>{w.projection.tenant_id="other";},
      (w:YuzhouInitialBaselineWitness)=>{w.targetId=randomUUID();},
      (w:YuzhouInitialBaselineWitness)=>{w.operationId="yzprod-import-20261004T130000Z-123456abcdef";},
      (w:YuzhouInitialBaselineWitness)=>{delete w.projection.primary_org_id;},
    ]) {const item=structuredClone(employees[5]!);mutate(item.initialBaselineWitness!);await assert.rejects(service.preview(scope,actor,pkg(item)),/EVIDENCE_INVALID/);}
    const rebaseline=structuredClone(employees[0]!);rebaseline.initialBaselineWitness!.projection.full_name="replacement";await assert.rejects(service.preview(scope,actor,pkg(rebaseline)),/ALREADY_KNOWN/);
    assert.deepEqual((await snapshot()).slice(2),original.slice(2),"original maps, batches and receipts remain unchanged by baseline/revision processing");
    await assert.rejects(service.preview({...scope,parkId:"other"},actor,pkg(employees[5]!)),/EVIDENCE_INVALID/);
    const wrongSource={...employees[5]!,sourceKey:employees[10]!.sourceKey};await assert.rejects(service.preview(scope,actor,pkg(wrongSource)),/EVIDENCE_INVALID/);
    // Simulate historical ambiguity that predates the active-source unique index.
    await db.query(`DROP INDEX uq_legacy_record_map_active_source`);
    const duplicate=(await db.query(`INSERT INTO legacy_record_map(batch_id,source_system,source_table,source_pk_canonical,source_identity_sha256,source_row_sha256,target_table,target_id,mapping_status) SELECT batch_id,source_system,source_table,source_pk_canonical,source_identity_sha256,source_row_sha256,target_table,target_id,mapping_status FROM legacy_record_map WHERE source_identity_sha256=$1 RETURNING id`,[employees[10]!.sourceKey.slice(7)]))[0].id;
    await assert.rejects(service.preview(scope,actor,pkg(employees[10]!)),/EVIDENCE_INVALID/);
    await db.query(`DELETE FROM legacy_record_map WHERE id=$1`,[duplicate]);
    await db.query(`CREATE UNIQUE INDEX uq_legacy_record_map_active_source ON legacy_record_map(source_system,source_table,source_identity_sha256) WHERE is_active`);
    assert.equal((await previewCommit(employees[10]!)).committed.unchangedCount,1);
    await assert.rejects(service.preview(scope,actor,pkg({...employees[11]!,domain:"profile",fields:{}})),/PROFILE_PROOF_UNAVAILABLE/);
    // Replaced/inactive map and stale phase/record are rejected against live state.
    await db.query(`UPDATE hr_yuzhou_production_import_phase SET status='rolled_back' WHERE operation_id=$1 AND phase='T0'`,[operationId]);
    await assert.rejects(service.preview(scope,actor,pkg(employees[5]!)),/EVIDENCE_INVALID/);
    await db.query(`UPDATE hr_yuzhou_production_import_phase SET status='succeeded' WHERE operation_id=$1 AND phase='T0'`,[operationId]);
    await db.transaction(async m=>{await m.query(`UPDATE hr_yuzhou_production_import_record SET rollback_status='deleted_insert',rolled_back_at=now() WHERE operation_id=$1 AND source_identity_sha256=$2`,[operationId,employees[5]!.sourceKey.slice(7)]);await m.query(`UPDATE legacy_record_map SET is_active=false,mapping_status='rolled_back' WHERE source_identity_sha256=$1`,[employees[5]!.sourceKey.slice(7)]);});
    await assert.rejects(service.preview(scope,actor,pkg(employees[5]!)),/EVIDENCE_INVALID/);
    await db.query(`UPDATE hr_employee SET is_deleted=true WHERE id=$1`,[employees[6]!.initialBaselineWitness!.targetId]);await assert.rejects(service.preview(scope,actor,pkg(employees[6]!)),/no longer exists/);
    // Source identity lock serializes independent connection commits; one provenance row.
    const race={...employees[7]!,fields:{...employees[7]!.fields,fullName:"Concurrent source"}};
    const racePreviews=await Promise.all([service.preview(scope,actor,pkg(race)),service.preview(scope,actor,pkg(race))]);
    const raced=await Promise.all(racePreviews.map(p=>service.commit(scope,actor,result(p).id)));
    assert.equal(raced.filter(r=>result(r).appliedCount===1).length,1);assert.equal(raced.filter(r=>result(r).unchangedCount===1).length,1);
    assert.equal((await db.query(`SELECT count(*)::int AS n FROM hr_incremental_initial_baseline b JOIN hr_incremental_import_item i ON i.id=b.item_id WHERE i.source_key=$1`,[race.sourceKey]))[0].n,1);
    // Inject a failure AFTER anchoring and target mutation: entire transaction disappears.
    const failure={...employees[8]!,fields:{...employees[8]!.fields,fullName:"Never committed"}},failurePreview=result(await service.preview(scope,actor,pkg(failure))),beforeFailure=await snapshot(),beforeCounts=await counts();
    const failingDb=Object.create(db) as DataSource;
    failingDb.transaction=(async(callback:(manager:EntityManager)=>Promise<unknown>)=>db!.transaction(async m=>{const proxy=Object.create(m) as EntityManager;proxy.query=async(sql:string,params?:unknown[])=>{if(sql.startsWith("INSERT INTO hr_incremental_import_revision"))throw new Error("INJECTED_FAILURE");return m.query(sql,params);};return callback(proxy);})) as DataSource["transaction"];
    await assert.rejects(new HrYuzhouIncrementalImportService(failingDb,sensitive).commit(scope,actor,failurePreview.id),/INJECTED_FAILURE/);assert.deepEqual(await snapshot(),beforeFailure);assert.deepEqual(await counts(),beforeCounts);
    // Independent modern writer between comparison and conditional update loses no edits.
    const cas={...employees[9]!,fields:{...employees[9]!.fields,fullName:"CAS correction"}},casPreview=result(await service.preview(scope,actor,pkg(cas))),countsBeforeCas=await counts();
    let reached!:()=>void,release!:()=>void,paused=false;const atRead=new Promise<void>(done=>{reached=done;}),resume=new Promise<void>(done=>{release=done;});
    const casDb=Object.create(db) as DataSource;casDb.transaction=(async(callback:(manager:EntityManager)=>Promise<unknown>)=>db!.transaction(async m=>{const proxy=Object.create(m) as EntityManager;let reads=0;proxy.query=async(sql:string,params?:unknown[])=>{const rows=await m.query(sql,params);if(sql.startsWith("SELECT *,")&&sql.includes("FROM hr_employee")&&params?.[0]===cas.initialBaselineWitness!.targetId&&++reads===2&&!paused){paused=true;reached();await resume;}return rows;};return callback(proxy);})) as DataSource["transaction"];
    const committing=new HrYuzhouIncrementalImportService(casDb,sensitive).commit(scope,actor,casPreview.id);
    await Promise.race([atRead,new Promise((_,reject)=>setTimeout(()=>reject(new Error("CAS barrier timeout")),3000))]);
    await db.query(`UPDATE hr_employee SET work_location='Independent edit',version=version+1 WHERE id=$1`,[cas.initialBaselineWitness!.targetId]);release();await assert.rejects(committing,/changed concurrently/);assert.deepEqual(await counts(),countsBeforeCas);
    assert.deepEqual((await db.query(`SELECT full_name,work_location FROM hr_employee WHERE id=$1`,[cas.initialBaselineWitness!.targetId]))[0],{full_name:"Original 9",work_location:"Independent edit"});
    t.diagnostic("Original writer hash parity; full historical receipt migrations; preview zero baseline/business writes; encrypted immutable provenance; actual DB concurrency and rollback verified");
  } finally {
    if(db?.isInitialized)await db.destroy();
    if(created){await admin.query(`DROP DATABASE "${database}"`);assert.equal((await admin.query(`SELECT count(*)::int AS n FROM pg_database WHERE datname=$1`,[database]))[0].n,0);}
    await admin.destroy();if(created)t.diagnostic("Dedicated strict-new-name database current_database asserted; cleanup residual=0");
  }
});
