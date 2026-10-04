import "reflect-metadata";
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, mkdirSync, realpathSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { resolve, join } from "node:path";
import test from "node:test";
import { DataSource, EntityManager } from "typeorm";
import { canonicalYuzhouIncrementalPackage, canonicalYuzhouInitialJson, YUZHOU_INITIAL_CANONICALIZATION, YUZHOU_INITIAL_PROJECTION_FIELDS, HR_PERMISSIONS, SYSTEM_PERMISSIONS, type YuzhouIncrementalItem } from "@jinhu/shared";
import { PartySensitiveDataService } from "../../shared/security/party-sensitive-data.service";
import { HrYuzhouIncrementalImportService } from "./hr-yuzhou-incremental-import.service";
import { HrEmployeeEntity, HrPositionEntity, HrEmployeeProfileEntity } from "./entities/hr.entities";
import { lockOrgHierarchy } from "../orgs/org-hierarchy-lock";
import type { PreviewYuzhouIncrementalImportDto } from "./dto/yuzhou-incremental-import.dto";

const root=resolve(__dirname,"../../../../.."),sha=(s:string)=>createHash("sha256").update(s).digest("hex");
const scope={tenantId:"org-fixture-tenant",parkId:"org-fixture-park"};
const actor={sub:randomUUID(),tenantId:scope.tenantId,parkId:scope.parkId,isSuper:true,permissions:["*"]} as never;
const operationId="yzprod-import-20261004T120000Z-123456abcdef";
const key=(table:string,code:string)=>`sha256:${sha(`${table}\0${code}`)}`;
const item=(domain:YuzhouIncrementalItem["domain"],code:string,fields:Record<string,unknown>):YuzhouIncrementalItem=>{
 const sourceTable=domain==="organization"?"dbo.departmentcode":domain==="position"?"dbo.job":"dbo.person";
 const value={domain,sourceTable,sourceKey:key(sourceTable,code),fields};return {...value,rowDigest:sha(canonicalYuzhouInitialJson({...value,sourceUpdatedAt:null}))};
};
const pkg=(items:YuzhouIncrementalItem[]):PreviewYuzhouIncrementalImportDto=>({version:1,sourceSystem:"yuzhou-v10",manifestId:randomUUID(),extractedAt:"2026-10-04T12:00:00Z",items});
const result=(v:unknown)=>v as {id:string;status:string;appliedCount:number;unchangedCount:number;conflictCount:number;plan:Array<{action:string;conflictFields:string[]}>};

test("organization/position continuity: actual CLI, original proof, scope, hierarchy and rollback",{skip:process.env.HR_YUZHOU_ORGANIZATION_PG_REQUIRED!=="1",timeout:120000},async t=>{
 assert.equal(process.env.POSTGRES_HOST,"127.0.0.1");assert.equal(process.env.POSTGRES_PORT,"55491");
 const database=`jinhu_hr_org_lab_${randomBytes(12).toString("hex")}`;assert.match(database,/^jinhu_hr_org_lab_[a-f0-9]{24}$/);
 const connection={type:"postgres" as const,host:"127.0.0.1",port:55491,username:process.env.POSTGRES_USER,password:process.env.POSTGRES_PASSWORD,database};
 const admin=new DataSource({...connection,database:"postgres"});await admin.initialize();let db:DataSource|undefined,created=false;
 const files=mkdtempSync(join(realpathSync(tmpdir()),"yuzhou-org-cli-"));
 try {
  await admin.query(`CREATE DATABASE "${database}" TEMPLATE template0`);created=true;
  db=new DataSource({...connection,synchronize:true,entities:[HrEmployeeEntity,HrPositionEntity,HrEmployeeProfileEntity]});await db.initialize();
  assert.equal((await db.query(`SELECT current_database() AS name`))[0].name,database);
  await db.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE TABLE hr_legacy_identity_registry(owner_record_map_id uuid,mapping_status varchar(32));
   CREATE TABLE sys_org(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,parent_id uuid,org_code varchar(64) NOT NULL,org_name varchar(100) NOT NULL,org_type varchar(32) NOT NULL,status varchar(32) NOT NULL DEFAULT 'enabled',sort_order integer NOT NULL DEFAULT 0,remark text,version integer NOT NULL DEFAULT 1,is_deleted boolean NOT NULL DEFAULT false,create_by uuid,update_by uuid,create_time timestamptz NOT NULL DEFAULT now(),update_time timestamptz NOT NULL DEFAULT now(),UNIQUE(tenant_id,park_id,id),FOREIGN KEY(tenant_id,park_id,parent_id) REFERENCES sys_org(tenant_id,park_id,id));
   CREATE UNIQUE INDEX ON sys_org(tenant_id,park_id,org_code) WHERE is_deleted=false;
   CREATE UNIQUE INDEX ON hr_position(tenant_id,park_id,id);`);
  for(const prefix of ["000235_hr_legacy_migration_control","000278_hr_yuzhou_production_import_control","000281_hr_yuzhou_production_import_control_v2","000282_hr_yuzhou_production_import_writer_receipts","000295_hr_organization_position_legacy_mapping","000314_hr_position_legacy_references","000327_hr_yuzhou_incremental_import_ledger","000329_hr_incremental_initial_baseline","000331_hr_incremental_org_position"])await db.query(readFileSync(resolve(root,`database/migrations/${prefix}.sql`),"utf8"));
  const sensitive=new PartySensitiveDataService({get:(k:string)=>k==="PARTY_DATA_ENCRYPTION_KEY"?"synthetic-org-fixture-key-12345678901234567890":undefined} as never);
  const service=new HrYuzhouIncrementalImportService(db,sensitive);
  const orgId=randomUUID(),positionId=randomUUID();
  await db.query(`INSERT INTO sys_org(id,tenant_id,park_id,org_code,org_name,org_type) VALUES($1,$2,$3,'OLD','Original org','department')`,[orgId,scope.tenantId,scope.parkId]);
  await db.getRepository(HrPositionEntity).save({id:positionId,...scope,orgId,positionCode:"OLD-J",positionName:"Original job",status:"enabled"});
  // Historical original fallback remains certifiable, but is never reused for new unresolved source relations.
  await db.query(`UPDATE hr_position SET legacy_department_reference='unresolved department',legacy_parent_reference='historical name',legacy_upto_code='classification' WHERE id=$1`,[positionId]);
  const originals=[item("organization","OLD",{}),item("position","OLD-J",{})];
  for(const original of originals) {
   const table=original.domain==="organization"?"sys_org":"hr_position",id=original.domain==="organization"?orgId:positionId;
   const row=(await db.query(`SELECT * FROM ${table} WHERE id=$1`,[id]))[0];
   const projection=Object.fromEntries(YUZHOU_INITIAL_PROJECTION_FIELDS[table].map(c=>[c,row[c]??null]));
   original.initialBaselineWitness={version:1,operationId,phase:"T0",canonicalizationVersion:YUZHOU_INITIAL_CANONICALIZATION,targetId:id,projection};
  }
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
        if(phase==="T0") for(const item of originals) {
          const w=item.initialBaselineWitness!;
          const deps:Array<[string,string,string,string]>=item.domain==="position"?[["org","T0",originals[0]!.sourceKey.slice(7),"sys_org"]]:[];
          await add(item.sourceKey.slice(7),item.sourceTable,item.domain==="organization"?"sys_org":"hr_position",w.targetId,sha(`yuzhou-hr-production-target-canonical-sha256-v1\0${item.domain==="organization"?"sys_org":"hr_position"}\0${canonicalYuzhouInitialJson(w.projection)}`),h,deps);
        }
        await m.query(`UPDATE hr_yuzhou_production_import_phase SET status='succeeded',finished_at=now() WHERE operation_id=$1 AND phase=$2`,[operationId,phase]);
      }
      await m.query(`UPDATE hr_yuzhou_production_import_operation SET status='succeeded',finished_at=now() WHERE operation_id=$1`,[operationId]);
    });
  const originalHashes=JSON.parse(execFileSync(process.execPath,["--input-type=module","-e",`import {readFileSync} from 'node:fs';import {computeProductionImportTargetCanonicalHash as hash} from './scripts/hr-cutover/production-import-target-model.mjs';const values=JSON.parse(readFileSync(0,'utf8'));console.log(JSON.stringify(values.map(v=>hash(v.table,v.scope,v.projection,v.projection))));`],{cwd:root,input:JSON.stringify(originals.map(i=>({table:i.domain==="organization"?"sys_org":"hr_position",scope,projection:i.initialBaselineWitness!.projection}))),encoding:"utf8"})) as string[];
  for(const [index,original] of originals.entries()) assert.equal((await db.query(`SELECT target_after_sha256 FROM hr_yuzhou_production_import_record WHERE operation_id=$1 AND source_identity_sha256=$2`,[operationId,original.sourceKey.slice(7)]))[0].target_after_sha256,originalHashes[index]);
  const business=async()=>Promise.all(["sys_org","hr_position","hr_employee"].map(table=>db!.query(`SELECT row_to_json(r) row FROM ${table} r ORDER BY id`)));
  const counts=async()=>(await db!.query(`SELECT (SELECT count(*)::int FROM hr_incremental_import_item) items,(SELECT count(*)::int FROM hr_incremental_initial_baseline) baselines,(SELECT count(*)::int FROM hr_incremental_import_revision) revisions`))[0];
  const commit=async(items:YuzhouIncrementalItem[])=>{const p=result(await service.preview(scope,actor,pkg(items)));return result(await service.commit(scope,actor,p.id));};
  const duplicateInput=item("organization","DUP-INPUT",{orgName:"one"});
  assert.throws(()=>canonicalYuzhouIncrementalPackage(pkg([duplicateInput,{...duplicateInput,sourceTable:"dbo.other"} ])),/SOURCE_DUPLICATE/);
  const before=await business(),baseline=result(await service.preview(scope,actor,pkg(originals)));
  assert.deepEqual(baseline.plan.map(p=>p.action),["unchanged","unchanged"]);assert.deepEqual(await business(),before);
  assert.equal(result(await service.commit(scope,actor,baseline.id)).unchangedCount,2);assert.deepEqual(await business(),before);
  assert.equal(result(await service.commit(scope,actor,baseline.id)).unchangedCount,2);assert.deepEqual(await counts(),{items:2,baselines:2,revisions:2});
  const tamper=structuredClone(originals[0]!);tamper.initialBaselineWitness!.projection.org_name="Tamper";await assert.rejects(service.preview(scope,actor,pkg([tamper])),/ALREADY_KNOWN/);
  await db.query(`UPDATE sys_org SET contact_phone='Modern phone',version=version+1 WHERE id=$1`,[orgId]);
  assert.equal((await commit([item("organization","OLD",{orgName:"Source org"})])).appliedCount,1);
  assert.equal((await db.query(`SELECT contact_phone FROM sys_org WHERE id=$1`,[orgId]))[0].contact_phone,"Modern phone");
  await db.query(`UPDATE hr_position SET position_name='Modern job',version=version+1 WHERE id=$1`,[positionId]);
  assert.equal((await commit([item("position","OLD-J",{positionName:"Source job"})])).conflictCount,1);
  assert.equal((await commit([item("position","OLD-J",{positionName:"Original job"})])).unchangedCount,1);

  // Invoke the actual public CLI; retain synthetic private inputs only during this test.
  execFileSync(process.execPath,["scripts/e2e/yuzhou-reusable-incremental-package-fixture.mjs","--root",join(files,"base"),"--contract-type-id",randomUUID(),"--employee-only","yes"],{cwd:root,stdio:"pipe"});
  const input=JSON.parse(readFileSync(join(files,"base/input.json"),"utf8"));
  const raw=(sourceTable:string,sourceKey:string,provided:Record<string,unknown>)=>{
   const defaults=sourceTable==="dbo.departmentcode"?{legacyManagerValue:null,plannedHeadcount:null,contactPhone:null}:{legacyUptoCode:null,jobgrade:null,salarygrade:null,authority:null,qualification:null,responsibilities:null,headcountLimit:null,positionManual:null};
   const source={...defaults,legacyCode:sourceKey,rating:null,sortOrder:0,legacySourceId:null,...provided};
   return {sourceTable,sourceKey,sourceIdentitySha256:sha(`${sourceTable}\0${sourceKey}`),sourceRowSha256:sha(canonicalYuzhouInitialJson(source)),source};
  };
  input.organizationRecords=[raw("dbo.departmentcode","N01",{orgName:"New child",rating:2,sortOrder:1}),raw("dbo.departmentcode","N",{orgName:"New parent",rating:2,sortOrder:0})];
  input.positionRecords=[raw("dbo.job","J2",{positionName:"New child job",departmentCode:"N01",parentPositionCode:"J1"}),raw("dbo.job","J1",{positionName:"New parent job",departmentCode:"N01",parentPositionCode:null})];
  input.includeAssignments=true;
  Object.assign(input.employeeRecords[0].source,{departmentCode:"N01",positionCode:"J2"});input.employeeRecords[0].sourceRowSha256=sha(canonicalYuzhouInitialJson(input.employeeRecords[0].source));
  const cli=()=>{const n=randomUUID(),path=join(files,`${n}.json`),out=join(files,n);writeFileSync(path,JSON.stringify(input),{mode:0o600});execFileSync(process.execPath,["scripts/hr-cutover/build-yuzhou-reusable-incremental-package.mjs","--input",path,"--output",out],{cwd:root,stdio:"pipe"});return JSON.parse(readFileSync(join(out,"package.json"),"utf8")) as PreviewYuzhouIncrementalImportDto;};
  const direct=cli(),staging=join(files,"staging-t0");mkdirSync(staging,{mode:0o700});
  const domains:Record<string,unknown>={};
  for(const [domain,file,rows] of [["departments","departments.jsonl",input.organizationRecords],["positions","positions.jsonl",input.positionRecords],["employees","employees.jsonl",input.employeeRecords]] as const) {
    if(domain==="employees")for(const r of rows){r.source.employeeCode=r.sourceKey;r.sourceRowSha256=sha(canonicalYuzhouInitialJson(r.source));}
    const bytes=rows.map((r:unknown)=>JSON.stringify(r)).join("\n")+"\n";writeFileSync(join(staging,file),bytes,{mode:0o600});domains[domain]={rows:rows.length,file,fileSha256:sha(bytes)};
  }
  for(const [domain,file] of [["employeeJobStates","employee-job-states.raw.json"],["jobStateCodeMetadata","job-state-code-metadata.raw.json"],["jobStateCodes","job-state-codes.raw.json"]]) {writeFileSync(join(staging,file!),"[]\n",{mode:0o600});domains[domain!]={rows:0,file,fileSha256:sha("[]\n")};}
  const manifest=JSON.stringify({formatVersion:1,generatedAt:input.extractedAt,domains});writeFileSync(join(staging,"manifest.json"),manifest,{mode:0o600});
  const states=JSON.stringify(input.jobStateDecisionArtifact);writeFileSync(join(files,"states.json"),states,{mode:0o600});
  const config={formatVersion:1,t0Manifest:{path:join(staging,"manifest.json"),sha256:sha(manifest)},includeEmployees:true,includeOrganizations:true,includePositions:true,extractedAt:input.extractedAt,sourceCustody:{sourceSnapshotSha256:sha("synthetic source"),evidenceSha256:sha("synthetic custody"),declaration:"caller_attests_same_controlled_snapshot"},jobStateDecisionArtifact:{path:join(files,"states.json"),sha256:sha(states)},outputDir:join(files,"fixed-entry")};
  writeFileSync(join(files,"config.json"),JSON.stringify(config),{mode:0o600});
  execFileSync(process.execPath,["scripts/hr-cutover/build-yuzhou-import-from-staging.mjs","--config",join(files,"config.json")],{cwd:root,stdio:"pipe"});
  const generated=JSON.parse(readFileSync(join(config.outputDir,"package.json"),"utf8")) as PreviewYuzhouIncrementalImportDto;
  assert.deepEqual(generated.items,direct.items);
  const assembly=JSON.parse(readFileSync(join(config.outputDir,"assembly-receipt.json"),"utf8"));assert.deepEqual(assembly.apiInput,{organization:2,position:2,employee:1,contract:0});
  assert.deepEqual(generated.items.map(i=>i.domain),["organization","organization","position","position","employee"]);
  const preview=result(await service.preview(scope,actor,generated)),applied=result(await service.commit(scope,actor,preview.id));assert.equal(applied.appliedCount,5);
  const assigned=(await db.query(`SELECT e.primary_org_id,e.position_id,o.org_code,p.position_code,p.reports_to_position_id FROM hr_employee e JOIN sys_org o ON o.id=e.primary_org_id JOIN hr_position p ON p.id=e.position_id WHERE e.employee_code='CLI-E-001'`))[0];
  assert.equal(assigned.org_code,"N01");assert.equal(assigned.position_code,"J2");assert.ok(assigned.reports_to_position_id);
  assert.equal((await commit(generated.items)).unchangedCount,5);
  await db.query(`UPDATE sys_org SET parent_id=(SELECT id FROM sys_org WHERE org_code='N'),version=version+1 WHERE id=$1`,[orgId]);
  assert.equal((await commit([item("organization","OLD",{orgName:"Source org after reparent",parentSourceKey:null})])).appliedCount,1);
  assert.equal((await db.query(`SELECT parent_id IS NOT NULL AS preserved FROM sys_org WHERE id=$1`,[orgId]))[0].preserved,true);
  assert.equal((await commit([item("position","OLD-J",{jobLevel:"L2"})])).appliedCount,1);
  assert.equal((await db.query(`SELECT position_name FROM hr_position WHERE id=$1`,[positionId]))[0].position_name,"Modern job");
  const employee=generated.items.find(i=>i.domain==="employee")!;
  await db.query(`UPDATE hr_employee SET primary_org_id=$1,position_id=$2,version=version+1 WHERE employee_code='CLI-E-001'`,[orgId,positionId]);
  assert.equal((await commit([{...item("employee","CLI-E-001",{...employee.fields,fullName:"Revised source name"})}])).appliedCount,1);
  assert.equal((await db.query(`SELECT primary_org_id FROM hr_employee WHERE employee_code='CLI-E-001'`))[0].primary_org_id,orgId);
  assert.equal((await commit([item("employee","CLI-E-001",{...employee.fields,orgSourceKey:originals[0]!.sourceKey,positionSourceKey:originals[1]!.sourceKey})])).conflictCount,1);
  const nKey=key("dbo.departmentcode","N"),childKey=key("dbo.departmentcode","N01");
  const cycle=item("organization","N",{parentSourceKey:childKey});const cyclic=result(await service.preview(scope,actor,pkg([cycle])));await assert.rejects(service.commit(scope,actor,cyclic.id),/CYCLE/);
  await assert.rejects(service.preview(scope,actor,pkg([item("organization","A",{parentSourceKey:key("dbo.departmentcode","B")}),item("organization","B",{parentSourceKey:key("dbo.departmentcode","A")})])),/CYCLE/);
  await assert.rejects(service.preview(scope,actor,pkg([item("position","MISSING",{orgSourceKey:key("dbo.departmentcode","MISSING")})])),/UNAVAILABLE/);
  const mismatch=item("employee","BAD-ASSIGN",{employeeCode:"BAD-ASSIGN",fullName:"Mismatch",employmentStatus:"active",orgSourceKey:nKey,positionSourceKey:key("dbo.job","J2")});
  const mp=result(await service.preview(scope,actor,pkg([mismatch])));await assert.rejects(service.commit(scope,actor,mp.id),/MISMATCH/);
  const sourceOnly={...actor as object,isSuper:false,permissions:[HR_PERMISSIONS.HR_EMPLOYEE_MANAGE]} as never;
  await assert.rejects(service.preview(scope,sourceOnly,pkg([item("organization","OLD",{orgName:"Forbidden"})])),/PERMISSION_REQUIRED/);
  const bounded={...actor as object,isSuper:false,permissions:[SYSTEM_PERMISSIONS.ORG_CREATE,SYSTEM_PERMISSIONS.ORG_UPDATE,HR_PERMISSIONS.HR_POSITION_MANAGE]} as never;
  const hidden=new HrYuzhouIncrementalImportService(db,sensitive,{buildScopeFilter:async()=>({unrestricted:false,allowed_ids:[orgId]})} as never);
  await assert.rejects(hidden.preview(scope,bounded,pkg([item("position","HIDDEN",{orgSourceKey:childKey})])),/UNAVAILABLE/);
  const updateOnly={...bounded as object,permissions:[SYSTEM_PERMISSIONS.ORG_UPDATE]} as never;
  const createOnly={...bounded as object,permissions:[SYSTEM_PERMISSIONS.ORG_CREATE]} as never;
  await assert.rejects(hidden.preview(scope,updateOnly,pkg([item("organization","NEW-RESTRICTED",{orgCode:"NEW-RESTRICTED",orgName:"New",orgType:"department",status:"enabled",parentSourceKey:originals[0]!.sourceKey})])),/ACTION_PERMISSION_REQUIRED/);
  await assert.rejects(hidden.preview(scope,createOnly,pkg([item("organization","OLD",{orgName:"Existing"})])),/ACTION_PERMISSION_REQUIRED/);
  // Exact action permission wins before hidden/missing-parent or deleted-target probes.
  await assert.rejects(hidden.preview(scope,updateOnly,pkg([item("organization","NO-CREATE",{parentSourceKey:key("dbo.departmentcode","ABSENT")})])),/ACTION_PERMISSION_REQUIRED/);
  await assert.rejects(hidden.preview(scope,createOnly,pkg([item("organization","OLD",{parentSourceKey:key("dbo.departmentcode","ABSENT")})])),/ACTION_PERMISSION_REQUIRED/);
  await db.query(`UPDATE sys_org SET is_deleted=true WHERE id=$1`,[orgId]);
  await assert.rejects(hidden.preview(scope,createOnly,pkg([item("organization","OLD",{orgName:"Hidden target"})])),/ACTION_PERMISSION_REQUIRED/);
  await db.query(`UPDATE sys_org SET is_deleted=false WHERE id=$1`,[orgId]);
  await assert.rejects(service.preview(scope,actor,pkg([item("employee","PARTIAL-ASSIGN",{employeeCode:"PARTIAL-ASSIGN",fullName:"Synthetic",employmentStatus:"active",positionSourceKey:key("dbo.job","J2")})])),/EMPLOYEE_ORG_REQUIRED/);

  const beforeUnassigned=await counts();
  for(const employmentStatus of ["active","probation","suspended","departed"]) await assert.rejects(service.preview(scope,actor,pkg([item("employee",`NO-ORG-${employmentStatus}`,{employeeCode:`NO-ORG-${employmentStatus}`,fullName:"Synthetic",employmentStatus})])),/EMPLOYEE_ORG_REQUIRED/);
  assert.deepEqual(await counts(),beforeUnassigned);
  // A package previewed by the older release must also fail at commit, with no
  // employee/ledger effects; preview-only validation would leave this bypass.
  const oldPreview=canonicalYuzhouIncrementalPackage(pkg([item("employee","OLD-PREVIEW-NO-ORG",{employeeCode:"OLD-PREVIEW-NO-ORG",fullName:"Synthetic",employmentStatus:"active"})]));
  const oldOperation=(await db.query(`INSERT INTO hr_incremental_import_operation(tenant_id,park_id,source_system,manifest_id,package_sha256,package_encrypted,status,item_count,created_by) VALUES($1,$2,'yuzhou-v10',$3,$4,$5,'previewed',1,$6) RETURNING id`,[scope.tenantId,scope.parkId,oldPreview.manifestId,sha(canonicalYuzhouInitialJson(oldPreview)),sensitive.encrypt(JSON.stringify(oldPreview)),(actor as {sub:string}).sub]))[0].id;
  await assert.rejects(service.commit(scope,actor,oldOperation),/EMPLOYEE_ORG_REQUIRED/);
  assert.deepEqual(await counts(),beforeUnassigned);
  assert.equal((await db.query(`SELECT count(*)::int n FROM hr_employee WHERE employee_code='OLD-PREVIEW-NO-ORG'`))[0].n,0);
  assert.equal(result(await service.status(scope,actor,oldOperation)).status,"previewed");
  const preboarding=item("employee","PREBOARDING",{employeeCode:"PREBOARDING",fullName:"Synthetic",employmentStatus:"preboarding"});
  assert.equal((await commit([preboarding])).status,"committed");
  assert.deepEqual((await db.query(`SELECT employment_status,primary_org_id,position_id FROM hr_employee WHERE employee_code='PREBOARDING'`))[0],{employment_status:"preboarding",primary_org_id:null,position_id:null});
  assert.equal((await commit([preboarding])).unchangedCount,1);

  await assert.rejects(service.preview({...scope,parkId:"foreign"},actor,pkg([item("position","CROSS",{orgSourceKey:nKey})])),/UNAVAILABLE/);
  const target=async(code:string)=>(await db!.query(`SELECT id FROM sys_org WHERE org_code=$1`,[code]))[0].id as string;
  const childId=await target("N01");
  await db.query(`UPDATE sys_org SET status='disabled' WHERE id=$1`,[childId]);
  await assert.rejects(service.preview(scope,actor,pkg([item("position","INACTIVE",{orgSourceKey:childKey})])),/UNAVAILABLE/);
  await db.query(`UPDATE sys_org SET status='enabled' WHERE id=$1`,[childId]);
  const snapshot=await business(),ledgerBefore=await counts();
  const valid=item("organization","ROLLBACK",{orgCode:"ROLLBACK",orgName:"Rollback",orgType:"department",status:"enabled",parentSourceKey:null});
  const duplicate=item("organization","DUPLICATE",{orgCode:"N",orgName:"Duplicate",orgType:"department",status:"enabled",parentSourceKey:null});
  const rollback=result(await service.preview(scope,actor,pkg([valid,duplicate])));await assert.rejects(service.commit(scope,actor,rollback.id),/already exists/);
  assert.deepEqual(await business(),snapshot);assert.deepEqual(await counts(),ledgerBefore);
  await db.query(`UPDATE hr_position SET is_deleted=true WHERE id=$1`,[positionId]);
  await assert.rejects(service.preview(scope,actor,pkg([item("position","OLD-J",{positionName:"Resurrect"})])),/no longer exists/);

  // Independent connection writes after the compared version: all source state rolls back.
  const casDto=pkg([item("organization","OLD",{orgName:"CAS source revision"})]),casPreview=result(await service.preview(scope,actor,casDto));
  let reached!:()=>void,release!:()=>void,paused=false;
  const barrier=new Promise<void>(r=>{reached=r;}),resume=new Promise<void>(r=>{release=r;});
  const casDb=Object.create(db) as DataSource;
  casDb.transaction=(async(callback:(manager:EntityManager)=>Promise<unknown>)=>db!.transaction(async m=>{
    const proxy=Object.create(m) as EntityManager;let reads=0;
    proxy.query=async(sql:string,params?:unknown[])=>{const rows=await m.query(sql,params);if(sql.startsWith("SELECT * FROM sys_org")&&params?.[0]===orgId&&++reads===4&&!paused){paused=true;reached();await resume;}return rows;};
    return callback(proxy);
  })) as DataSource["transaction"];
  const casService=new HrYuzhouIncrementalImportService(casDb,sensitive),casBefore=await counts();
  const committing=casService.commit(scope,actor,casPreview.id);await barrier;
  await db.query(`UPDATE sys_org SET contact_phone='Concurrent modern edit',version=version+1 WHERE id=$1`,[orgId]);release();
  await assert.rejects(committing,/changed concurrently/);assert.deepEqual(await counts(),casBefore);
  assert.equal((await db.query(`SELECT org_name FROM sys_org WHERE id=$1`,[orgId]))[0].org_name,"Source org after reparent");

  // Independent ordinary hierarchy transaction holds the identical lock.
  const runner=db.createQueryRunner();await runner.connect();await runner.startTransaction();await lockOrgHierarchy(runner.manager,scope);
  const update=item("organization","N01",{orgName:"After serialized edit"});
  const blocked=db.createQueryRunner();await blocked.connect();await blocked.startTransaction();await blocked.query(`SET LOCAL lock_timeout='150ms'`);
  await assert.rejects(lockOrgHierarchy(blocked.manager,scope),/lock timeout/);await blocked.rollbackTransaction();await blocked.release();
  await runner.rollbackTransaction();await runner.release();
  assert.equal((await commit([update])).appliedCount,1);
 } finally {
  rmSync(files,{recursive:true,force:true});
  if(db?.isInitialized)await db.destroy();
  if(created){await admin.query(`DROP DATABASE "${database}"`);assert.equal((await admin.query(`SELECT count(*)::int n FROM pg_database WHERE datname=$1`,[database]))[0].n,0);}
  await admin.destroy();if(created)t.diagnostic("strict new loopback database, CLI private fixture cleanup residual=0");
 }
});
