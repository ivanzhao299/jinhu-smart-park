import assert from "node:assert/strict";
import { randomUUID,randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { after,before,test } from "node:test";
import { DataSource } from "typeorm";
import { HR_PERMISSIONS, SYSTEM_PERMISSIONS } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { ConfigService } from "@nestjs/config";
import { PartySensitiveDataService } from "../../shared/security/party-sensitive-data.service";
import {profileCanonical} from "./hr-yuzhou-profile-baseline";
import {createHash} from "node:crypto";
import {executeYuzhouTrainingItem,type TrainingImportItem} from "./hr-yuzhou-training-executor";
import {createTrainingHistoryInTransaction,correctTrainingHistoryHoursInTransaction,correctTrainingHistoryFactsInTransaction} from "./hr-yuzhou-training-transaction";
import {HrTrainingService} from "./hr-training.service";
import {HrYuzhouIncrementalImportService} from "./hr-yuzhou-incremental-import.service";
import type {PreviewYuzhouIncrementalImportDto} from "./dto/yuzhou-incremental-import.dto";
const enabled=process.env.HR_TRAINING_IMPORT_PG_REQUIRED==="1",database=`jinhu_hr_training_import_lab_${randomUUID().replaceAll('-','')}`;
const scope={tenantId:"10000001",parkId:"20000001"},actorId=randomUUID(),employeeId=randomUUID(),foreignEmployee=randomUUID();
const actor:JwtPrincipal={sub:actorId,username:"synthetic-training-import",...scope,roles:[],permissions:[HR_PERMISSIONS.HR_TRAINING_COURSE_MANAGE,HR_PERMISSIONS.HR_TRAINING_PLAN_MANAGE,HR_PERMISSIONS.HR_TRAINING_PROGRESS_MANAGE]};
const facts={courseName:"Synthetic training",startDate:"2020-02-29",endDate:"2020-03-01",hours:"8"};
let admin:DataSource,db:DataSource,created=false;
before(async()=>{
 if(!enabled)return;assert.equal(process.env.POSTGRES_HOST,"127.0.0.1");assert.equal(process.env.POSTGRES_PORT,"55491");
 const config={type:"postgres" as const,host:"127.0.0.1",port:55491,username:process.env.POSTGRES_USER,password:process.env.POSTGRES_PASSWORD};
 admin=new DataSource({...config,database:"postgres"});await admin.initialize();await admin.query(`CREATE DATABASE "${database}" TEMPLATE template0`);created=true;
 db=new DataSource({...config,database});await db.initialize();assert.equal((await db.query('SELECT current_database() name'))[0].name,database);
 await db.query(`CREATE EXTENSION "uuid-ossp";CREATE TABLE sys_user(id uuid PRIMARY KEY,tenant_id varchar(64),park_id varchar(64));CREATE TABLE hr_employee(id uuid PRIMARY KEY,tenant_id varchar(64),park_id varchar(64),is_deleted boolean DEFAULT false,full_name text,user_id uuid);CREATE TABLE sys_file(id uuid PRIMARY KEY,tenant_id varchar(64),park_id varchar(64),biz_type text,biz_id uuid,status integer,is_deleted boolean);`);
 // Exact real training migration, with only prerequisite owner/file fixtures.
 await db.query(readFileSync(resolve(__dirname,"../../../../../database/migrations/000254_hr_training_operations.sql"),"utf8"));
 await db.query(readFileSync(resolve(__dirname,"../../../../../database/migrations/000327_hr_yuzhou_incremental_import_ledger.sql"),"utf8"));
 await db.query(`ALTER TABLE hr_incremental_import_item ADD COLUMN baseline_encrypted text;CREATE TABLE hr_yuzhou_t5_followon_source(id uuid PRIMARY KEY,operation_id text,source_table text,source_identity_sha256 text,tenant_id text,park_id text);`);
 await db.query(readFileSync(resolve(__dirname,"../../../../../database/migrations/000340_hr_incremental_training_history.sql"),"utf8"));
 await db.query(readFileSync(resolve(__dirname,"../../../../../database/migrations/000342_hr_training_memo_continuity.sql"),"utf8"));
 await db.query('INSERT INTO sys_user VALUES($1,$2,$3)',[actorId,scope.tenantId,scope.parkId]);
 await db.query('INSERT INTO hr_employee(id,tenant_id,park_id) VALUES($1,$2,$3),($4,$2,\'20000002\')',[employeeId,scope.tenantId,scope.parkId,foreignEmployee]);
});
test('actual fixed builder package passes public preview commit replay status and exact permissions',{skip:!enabled},async()=>{
 const directory=mkdtempSync(resolve(tmpdir(),'yuzhou-training-public-'));
 try{
  const root=resolve(__dirname,'../../../../..');
  execFileSync(process.execPath,['--input-type=module','-e',`
   import {writeFileSync} from 'node:fs';import {createHash} from 'node:crypto';
   import {canonicalProfile} from './scripts/hr-cutover/yuzhou-profile-incremental-projection.mjs';
   import {materializeYuzhouReusableIncrementalPackage,YUZHOU_REUSABLE_INCREMENTAL_RECIPE_SHA256} from './scripts/hr-cutover/build-yuzhou-reusable-incremental-package.mjs';
   const hash=v=>createHash('sha256').update(v).digest('hex'),dir=process.argv[1];
   const source={id:7654,person:'SYN-PUB',organ:null,coursename:'Synthetic public training',startdate:'2020-02-29T00:00:00',enddate:'2020-03-01T00:00:00',hours:8,attainment:null,test:null,trainmoney:null,memo:null};
   const row={sourceTable:'dbo.trainhis',sourceKey:String(source.id),sourceIdentitySha256:hash('dbo.trainhis\\0'+source.id),sourceRowSha256:hash(canonicalProfile(source)),source};
   writeFileSync(dir+'/input.json',JSON.stringify({recipeVersion:'yuzhou-reusable-incremental-v2',recipeSha256:YUZHOU_REUSABLE_INCREMENTAL_RECIPE_SHA256,sourceSystem:'yuzhou-v10',extractedAt:'2026-10-05T00:00:00Z',employeeIndex:[{employeeCode:'SYN-PUB',sourceTable:'dbo.person',sourceKey:'SYN-PUB'}],employeeRecords:[],records:[],trainingRecords:[row]}),{mode:0o600});
   materializeYuzhouReusableIncrementalPackage({inputPath:dir+'/input.json',outputDir:dir+'/out'});
  `,directory],{cwd:root,stdio:'pipe'});
  const dto=JSON.parse(readFileSync(resolve(directory,'out/package.json'),'utf8')) as PreviewYuzhouIncrementalImportDto;
  const targetKey=String(dto.items[0]!.fields.employeeSourceKey);
  await db.query(`CREATE TABLE legacy_record_map(source_system text,source_table text,source_pk_canonical text,source_identity_sha256 text,target_table text,target_id uuid,mapping_status text,is_active boolean)`);
  await db.query(`INSERT INTO legacy_record_map VALUES('yuzhou-v10','dbo.person',$1,$2,'hr_employee',$3,'verified',true)`,[targetKey,targetKey.slice(7),employeeId]);
  const service=new HrYuzhouIncrementalImportService(db,sensitive),before=await counts();
  for(const permissions of [[HR_PERMISSIONS.HR_CONTRACT_MANAGE],[HR_PERMISSIONS.HR_TRAINING_READ],[HR_PERMISSIONS.HR_TRAINING_COURSE_MANAGE,HR_PERMISSIONS.HR_TRAINING_PLAN_MANAGE]])await assert.rejects(service.preview(scope,{...actor,permissions},dto),/PERMISSION_REQUIRED/);
  const preview=await service.preview(scope,actor,dto);assert.equal(preview.status,'previewed');assert.deepEqual(await counts(),before);
  const id=String(preview.id),committed=await service.commit(scope,actor,id) as Record<string,unknown>;
  assert.equal(committed.status,'committed');assert.equal(committed.appliedCount,1);
  const after=await counts();assert.equal(after.participants,before.participants+1);
  assert.equal((await service.commit(scope,actor,id) as Record<string,unknown>).appliedCount,1);assert.deepEqual(await counts(),after);
  await assert.rejects(service.status(scope,{...actor,permissions:[HR_PERMISSIONS.HR_CONTRACT_READ]},id),/PERMISSION_REQUIRED/);
  assert.equal((await service.status(scope,{...actor,permissions:[HR_PERMISSIONS.HR_TRAINING_READ]},id) as Record<string,unknown>).status,'committed');
  await assert.rejects(service.commit(scope,{...actor,permissions:[HR_PERMISSIONS.HR_TRAINING_READ]},id),/PERMISSION_REQUIRED/);
  await assert.rejects(service.status({...scope,parkId:'20000002'},actor,id),/not found/);
  const next={...dto,manifestId:dto.manifestId+'-next',extractedAt:'2026-11-05T00:00:00Z'};
  const replay=await service.preview(scope,actor,next);const replayed=await service.commit(scope,actor,String(replay.id)) as Record<string,unknown>;
  assert.equal(replayed.unchangedCount,1);assert.deepEqual(await counts(),after);
 }finally{rmSync(directory,{recursive:true,force:true});}
});
test('staged new employee preview has no target writes and never bypasses owner resolution on commit',{skip:!enabled},async()=>{
 const before=await counts(),value=item('9'),missing=async()=>{throw new Error('synthetic unresolved employee');};
 const preview=await db.transaction(m=>executeYuzhouTrainingItem(m,scope,actor,value,sensitive,missing,undefined,true));
 assert.equal(typeof preview,'object');assert.equal((preview as {action:string}).action,'create');assert.deepEqual(await counts(),before);
 await assert.rejects(db.transaction(m=>executeYuzhouTrainingItem(m,scope,actor,value,sensitive,missing,undefined,false)),/unresolved employee/);
 await assert.rejects(db.transaction(m=>executeYuzhouTrainingItem(m,scope,actor,value,sensitive,missing,'00000000-0000-5000-8000-000000000001',true)),/unresolved employee/);
 assert.deepEqual(await counts(),before);
});
after(async()=>{if(db?.isInitialized)await db.destroy();if(admin?.isInitialized){try{if(created){await admin.query(`DROP DATABASE "${database}"`);assert.equal((await admin.query('SELECT count(*)::int n FROM pg_database WHERE datname=$1',[database]))[0].n,0);}}finally{await admin.destroy();}}});
const sourceKey=(n:string)=>`sha256:${n.repeat(64)}`;
const counts=async()=> (await db.query(`SELECT (SELECT count(*)::int FROM hr_training_course) courses,(SELECT count(*)::int FROM hr_training_plan) plans,(SELECT count(*)::int FROM hr_training_participant) participants,(SELECT count(*)::int FROM hr_training_result_correction) corrections,(SELECT count(*)::int FROM hr_training_action) actions`))[0];
test('real training guards accept complete history and reject overwrite/duplicate source codes',{skip:!enabled},async()=>{
 const value=await db.transaction(m=>createTrainingHistoryInTransaction(m,scope,actor,sourceKey('a'),employeeId,facts));
 const p=(await db.query('SELECT status,snapshot FROM hr_training_plan WHERE id=$1',[value.planId]))[0];assert.equal(p.status,'completed');assert.equal(p.snapshot.courseTitle,facts.courseName);
 const participant=(await db.query(`SELECT status,completed_hours::text hours,score,actual_cost,to_char(completed_at AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD HH24:MI:SS') completed FROM hr_training_participant WHERE id=$1`,[value.participantId]))[0];assert.deepEqual(participant,{status:'completed',hours:'8.00',score:null,actual_cost:null,completed:'2020-03-01 00:00:00'});
 assert.equal((await db.query('SELECT count(*)::int n FROM hr_training_action WHERE plan_id=$1',[value.planId]))[0].n,4);
 await assert.rejects(db.query('UPDATE hr_training_participant SET completed_hours=9 WHERE id=$1',[value.participantId]),/requires correction/);
 const before=await counts();await assert.rejects(db.transaction(m=>createTrainingHistoryInTransaction(m,scope,actor,sourceKey('a'),employeeId,facts)),e=>(e as {code:string}).code==='23505');assert.deepEqual(await counts(),before);
 const c=await db.transaction(m=>correctTrainingHistoryHoursInTransaction(m,scope,actor,value.participantId,0,'9'));assert.equal(c.correctionVersion,1);
 assert.equal((await db.query('SELECT completed_hours::text hours FROM hr_training_participant WHERE id=$1',[value.participantId]))[0].hours,'8.00');
 await assert.rejects(db.transaction(m=>correctTrainingHistoryHoursInTransaction(m,scope,actor,value.participantId,0,'10')),/CORRECTION_STALE/);
 const races=await Promise.allSettled([db.transaction(m=>correctTrainingHistoryHoursInTransaction(m,scope,actor,value.participantId,1,'10')),db.transaction(m=>correctTrainingHistoryHoursInTransaction(m,scope,actor,value.participantId,1,'11'))]);assert.equal(races.filter(r=>r.status==='fulfilled').length,1);assert.equal(races.filter(r=>r.status==='rejected').length,1);
});
test('permissions/scope/owner checks reject without writes',{skip:!enabled},async()=>{
 const before=await counts();
 await assert.rejects(db.transaction(m=>createTrainingHistoryInTransaction(m,scope,{...actor,permissions:[]},sourceKey('b'),employeeId,facts)));
 await assert.rejects(db.transaction(m=>createTrainingHistoryInTransaction(m,scope,{...actor,parkId:'20000002'},sourceKey('b'),employeeId,facts)));
 await assert.rejects(db.transaction(m=>createTrainingHistoryInTransaction(m,scope,actor,sourceKey('b'),foreignEmployee,facts)),/employee not found/);
 assert.deepEqual(await counts(),before);
});
test('later failure rolls back whole creation and correction with append-only action',{skip:!enabled},async()=>{
 const before=await counts();await assert.rejects(db.transaction(async m=>{await createTrainingHistoryInTransaction(m,scope,actor,sourceKey('c'),employeeId,facts);await m.query('SELECT 1/0');}));assert.deepEqual(await counts(),before);
 const value=await db.transaction(m=>createTrainingHistoryInTransaction(m,scope,actor,sourceKey('d'),employeeId,facts));
 await db.query(`CREATE FUNCTION fail_import_action() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='correct' AND current_setting('lab.fail_action',true)='yes' THEN RAISE EXCEPTION 'synthetic action failure'; END IF;RETURN NEW;END $$;CREATE TRIGGER lab_fail_import_action BEFORE INSERT ON hr_training_action FOR EACH ROW EXECUTE FUNCTION fail_import_action();`);
 const beforeCorrection=await counts();await assert.rejects(db.transaction(async m=>{await m.query("SELECT set_config('lab.fail_action','yes',true)");await correctTrainingHistoryHoursInTransaction(m,scope,actor,value.participantId,0,'12');}),/synthetic action failure/);assert.deepEqual(await counts(),beforeCorrection);
 assert.equal((await db.query('SELECT count(*)::int n FROM hr_training_result_correction WHERE participant_id=$1',[value.participantId]))[0].n,0);
});
const sensitive=new PartySensitiveDataService(new ConfigService({PARTY_DATA_ENCRYPTION_KEY:randomBytes(32).toString('hex')}));
const digest=(v:unknown)=>createHash('sha256').update(profileCanonical(v)).digest('hex');
const employeeKey=`sha256:${'1'.repeat(64)}`;
function item(n:string,hours='8'):TrainingImportItem {const value={domain:'training_history' as const,sourceTable:'dbo.trainhis',sourceKey:sourceKey(n),fields:{...facts,hours,employeeSourceTable:'dbo.person',employeeSourceKey:employeeKey},rowDigest:''};value.rowDigest=digest({domain:value.domain,sourceTable:value.sourceTable,sourceKey:value.sourceKey,sourceUpdatedAt:null,fields:value.fields});return value;}
async function operation(){return (await db.query(`INSERT INTO hr_incremental_import_operation(tenant_id,park_id,source_system,manifest_id,package_sha256,package_encrypted,item_count,created_by) VALUES($1,$2,'yuzhou-v10','synthetic',$3,$4,1,$5) RETURNING id`,[scope.tenantId,scope.parkId,randomBytes(32).toString('hex'),sensitive.encrypt('{}'),actorId]))[0].id as string;}
const owner=async(key:string,table:string)=>{assert.equal(key,employeeKey);assert.equal(table,'dbo.person');return employeeId;};
async function execute(value:TrainingImportItem,op?:string){return db.transaction(m=>executeYuzhouTrainingItem(m,scope,actor,value,sensitive,owner,op));}
let sourceParticipant:string;
test('formal memo completion corrections clear-null projection and source replay preserve modern changes',{skip:!enabled},async()=>{
 const incoming=(memo:string|null)=>{const v=item('9');v.fields.memo=memo;v.rowDigest=digest({domain:v.domain,sourceTable:v.sourceTable,sourceKey:v.sourceKey,sourceUpdatedAt:null,fields:v.fields});return v;};
 assert.equal(await execute(incoming('  source memo\n  '),await operation()),'applied');
 const binding=(await db.query('SELECT target_id FROM hr_incremental_import_item WHERE source_key=$1',[sourceKey('9')]))[0];
 const participant=(await db.query('SELECT plan_id,memo FROM hr_training_participant WHERE id=$1',[binding.target_id]))[0];
 assert.equal(participant.memo,'  source memo\n  ');
 const service=new HrTrainingService(db,{recordOperationRequired:async()=>undefined} as never);
 const reader={...actor,permissions:[...actor.permissions,HR_PERMISSIONS.HR_TRAINING_READ]};
 const visible=async()=> (await service.planDetail(scope,reader,participant.plan_id)).participants[0].memo;
 assert.equal(await visible(),'  source memo\n  ');
 await service.correct(scope,actor,binding.target_id,{correctedMemo:'modern',reason:'synthetic memo correction'});
 assert.equal(await execute(incoming('  source memo\n  '),await operation()),'unchanged');assert.equal(await visible(),'modern');
 assert.equal(await execute(incoming('source changed'),await operation()),'conflict');assert.equal(await visible(),'modern');
 assert.equal(await execute(incoming('modern'),await operation()),'applied');
 assert.equal(await execute(incoming(null),await operation()),'applied');assert.equal(await visible(),null);
 assert.equal(await execute(incoming(''),await operation()),'applied');assert.equal(await visible(),'');
 await service.correct(scope,actor,binding.target_id,{correctedHours:'11',reason:'synthetic unrelated correction'});assert.equal(await visible(),'');
 await service.correct(scope,actor,binding.target_id,{correctedMemo:null,reason:'synthetic explicit clear'});assert.equal(await visible(),null);
 await assert.rejects(service.correct(scope,{...actor,permissions:[]},binding.target_id,{correctedMemo:'forbidden',reason:'synthetic'}));
 await assert.rejects(db.query('UPDATE hr_training_participant SET memo=$2 WHERE id=$1',[binding.target_id,'overwrite']),/requires correction/);
 assert.equal((await db.query('SELECT memo FROM hr_training_participant WHERE id=$1',[binding.target_id]))[0].memo,'  source memo\n  ');
 const beforeRollback=await counts();
 await assert.rejects(db.transaction(async m=>{await correctTrainingHistoryFactsInTransaction(m,scope,actor,binding.target_id,5,{memo:'must roll back'});await m.query('SELECT 1/0');}));
 assert.deepEqual(await counts(),beforeRollback);assert.equal(await visible(),null);
 const races=await Promise.allSettled(['memo A','memo B'].map(memo=>db.transaction(m=>correctTrainingHistoryFactsInTransaction(m,scope,actor,binding.target_id,5,{memo}))));
 assert.equal(races.filter(r=>r.status==='fulfilled').length,1);assert.ok(['memo A','memo B'].includes(await visible()));

});
test('encrypted source ledger provides preview isolation and successful replay',{skip:!enabled},async()=>{
 const before=await counts(),preview=await execute(item('e'));assert.equal(typeof preview,'object');assert.equal((preview as {action:string}).action,'create');assert.deepEqual(await counts(),before);
 const op=await operation();assert.equal(await execute(item('e'),op),'applied');assert.equal(await execute(item('e'),await operation()),'unchanged');
 const ledger=(await db.query(`SELECT * FROM hr_incremental_import_item WHERE source_key=$1`,[sourceKey('e')]))[0];sourceParticipant=ledger.target_id;
 assert.deepEqual(ledger.field_baseline,{});assert.deepEqual(ledger.target_baseline,{});assert.match(ledger.source_facts_encrypted,/^enc:v1:/);assert.match(ledger.baseline_encrypted,/^enc:v1:/);assert.equal(JSON.parse(sensitive.decrypt(ledger.source_facts_encrypted)!).hours,'8');
 assert.equal((await db.query('SELECT count(*)::int n FROM hr_incremental_training_binding WHERE item_id=$1',[ledger.id]))[0].n,1);
 await assert.rejects(db.query(`UPDATE hr_incremental_import_item SET source_key=$2 WHERE id=$1`,[ledger.id,sourceKey('a')]),/SOURCE_IMMUTABLE/);
 await assert.rejects(db.query('DELETE FROM hr_incremental_training_binding WHERE item_id=$1',[ledger.id]),/BINDING_IMMUTABLE/);
});
test('ledger preserves modern correction, reports divergence and accepts convergence without overwriting',{skip:!enabled},async()=>{
 await db.transaction(m=>correctTrainingHistoryHoursInTransaction(m,scope,actor,sourceParticipant,0,'10'));
 assert.equal(await execute(item('e'),await operation()),'unchanged');
 assert.equal(await execute(item('e','9'),await operation()),'conflict');
 const ledger=(await db.query('SELECT source_facts_encrypted FROM hr_incremental_import_item WHERE source_key=$1',[sourceKey('e')]))[0];assert.equal(JSON.parse(sensitive.decrypt(ledger.source_facts_encrypted)!).hours,'8');
 assert.equal(await execute(item('e','10'),await operation()),'applied');assert.equal((await db.query('SELECT count(*)::int n FROM hr_training_result_correction WHERE participant_id=$1',[sourceParticipant]))[0].n,1);
 assert.equal(await execute(item('e','11'),await operation()),'applied');assert.equal((await db.query('SELECT corrected_hours::text hours FROM hr_training_result_correction WHERE participant_id=$1 ORDER BY sequence_no DESC LIMIT 1',[sourceParticipant]))[0].hours,'11.00');
});
test('concurrent same source creates once and later journal failure rolls back business and ledger',{skip:!enabled},async()=>{
 const ops=await Promise.all([operation(),operation()]);const outcomes=await Promise.all(ops.map(op=>execute(item('f'),op)));assert.deepEqual(outcomes.sort(),['applied','unchanged']);
 assert.equal((await db.query('SELECT count(*)::int n FROM hr_incremental_import_item WHERE source_key=$1',[sourceKey('f')]))[0].n,1);
 await db.query(`CREATE FUNCTION fail_import_revision() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF current_setting('lab.fail_revision',true)='yes' THEN RAISE EXCEPTION 'synthetic revision failure';END IF;RETURN NEW;END $$;CREATE TRIGGER lab_fail_revision BEFORE INSERT ON hr_incremental_import_revision FOR EACH ROW EXECUTE FUNCTION fail_import_revision();`);
 const before=await counts(),op=await operation();await assert.rejects(db.transaction(async m=>{await m.query("SELECT set_config('lab.fail_revision','yes',true)");await executeYuzhouTrainingItem(m,scope,actor,item('0'),sensitive,owner,op);}),/synthetic revision failure/);assert.deepEqual(await counts(),before);
 assert.equal((await db.query('SELECT count(*)::int n FROM hr_incremental_import_item WHERE source_key=$1',[sourceKey('0')]))[0].n,0);
});
test('retained archive source is authenticated before first formal acceptance and stale receipt chain rejects',{skip:!enabled},async()=>{
 await db.query(`ALTER TABLE hr_yuzhou_t5_followon_source ADD COLUMN source_row_sha256 text,ADD COLUMN encrypted_source text,ADD COLUMN source_domain text;
 CREATE TABLE hr_yuzhou_t5_followon_operation(operation_id text PRIMARY KEY,status text,finished_at timestamptz,rolled_back_at timestamptz,binding jsonb,binding_sha256 text,parent_operation_id text,payroll_operation_id text);
 CREATE TABLE hr_yuzhou_t5_followon_projection_receipt(operation_id text,source_identity_sha256 text,source_row_sha256 text,target_table text,target_id uuid,disposition text);
 CREATE TABLE hr_legacy_archive_record(id uuid PRIMARY KEY,tenant_id text,park_id text,record_type text);
 CREATE TABLE migration_batch(t5_followon_operation_id text,status text,execution_context text,run_id text,target_database text,source_snapshot_sha256 text,tool_version text);
 CREATE TABLE hr_yuzhou_production_import_operation(operation_id text PRIMARY KEY,status text,finished_at timestamptz,target_tenant_id text,target_park_id text,source_snapshot_sha256 text,sealed_plan_sha256 text,target_scope_sha256 text);
 CREATE TABLE hr_yuzhou_t4_followon_operation(operation_id text PRIMARY KEY,status text,finished_at timestamptz,rolled_back_at timestamptz,binding_sha256 text);
 CREATE TABLE hr_legacy_training_reward_projection(id uuid,source_table text,source_identity_sha256 text,status text);`);
 const originalOp='yzprod-import-20261001T000000Z-aaaaaaaaaaaa',parent='synthetic-core',payroll='synthetic-payroll';
 const binding={operationId:originalOp,intent:'APPEND_T5_FULL_HISTORY_ONCE',targetScope:scope,targetScopeSha256:'d'.repeat(64),executionCodeSha:'7c3df1c230bde74badbf414acae36030d5fe8709',sourceMappingContractSha256:'d44b0f904fb3240d45a52b8dc8a3510ce5622ecb6f7f41356fbe6e48fa53b7e0',triple:{sourceSnapshotHash:'b'.repeat(64)},parent:{operationId:parent,sealedPlanSha256:'c'.repeat(64)},payrollParent:{operationId:payroll,bindingSha256:'e'.repeat(64)}};
 await db.query(`INSERT INTO hr_yuzhou_t5_followon_operation VALUES($1,'succeeded',now(),NULL,$2::jsonb,$3,$4,$5)`,[originalOp,JSON.stringify(binding),digest(binding),parent,payroll]);
 await db.query(`INSERT INTO hr_yuzhou_production_import_operation VALUES($1,'succeeded',now(),$2,$3,$4,$5,$6)`,[parent,scope.tenantId,scope.parkId,binding.triple.sourceSnapshotHash,binding.parent.sealedPlanSha256,binding.targetScopeSha256]);
 await db.query(`INSERT INTO hr_yuzhou_t4_followon_operation VALUES($1,'succeeded',now(),NULL,$2)`,[payroll,binding.payrollParent.bindingSha256]);
 await db.query(`INSERT INTO migration_batch VALUES($1,'succeeded','t5_production_followon',$1,current_database(),$2,$3)`,[originalOp,binding.triple.sourceSnapshotHash,`t5-followon-v1@${binding.executionCodeSha}`]);
 const raw={id:42,person:'SYN-1',organ:null,coursename:facts.courseName,startdate:`${facts.startDate}T00:00:00`,enddate:`${facts.endDate}T00:00:00`,hours:8,attainment:null,test:null,trainmoney:null,memo:null};
 const identity=createHash('sha256').update('dbo.trainhis\0'+raw.id).digest('hex'),ownerKey=createHash('sha256').update('dbo.person\0'+raw.person).digest('hex'),id=randomUUID(),archive=randomUUID();
 await db.query(`INSERT INTO hr_yuzhou_t5_followon_source(id,operation_id,source_table,source_identity_sha256,tenant_id,park_id,source_row_sha256,encrypted_source,source_domain) VALUES($1,$2,'dbo.trainhis',$3,$4,$5,$6,$7,'trainhis')`,[id,originalOp,identity,scope.tenantId,scope.parkId,digest(raw),sensitive.encrypt(profileCanonical(raw))]);
 await db.query(`INSERT INTO hr_legacy_archive_record VALUES($1,$2,$3,'training_history')`,[archive,scope.tenantId,scope.parkId]);
 for(const [table,target] of [['hr_yuzhou_t5_followon_source',id],['hr_legacy_archive_record',archive]])await db.query(`INSERT INTO hr_yuzhou_t5_followon_projection_receipt VALUES($1,$2,$3,$4,$5,'insert')`,[originalOp,identity,digest(raw),table,target]);
 const value=item('9');value.sourceKey=`sha256:${identity}`;value.fields.employeeSourceKey=`sha256:${ownerKey}`;value.rowDigest=digest({domain:value.domain,sourceTable:value.sourceTable,sourceKey:value.sourceKey,sourceUpdatedAt:null,fields:value.fields});
 const lookup=async(key:string,table:string)=>{assert.equal(key,value.fields.employeeSourceKey);assert.equal(table,'dbo.person');return employeeId;};
 const op=await operation(),beforeAccept=await counts();
 await db.query('UPDATE hr_yuzhou_t5_followon_source SET encrypted_source=$2 WHERE id=$1',[id,sensitive.encrypt(profileCanonical({...raw,hours:9}))]);
 await assert.rejects(db.transaction(m=>executeYuzhouTrainingItem(m,scope,actor,value,sensitive,lookup,op)),/EVIDENCE_INVALID/);assert.deepEqual(await counts(),beforeAccept);
 await db.query('UPDATE hr_yuzhou_t5_followon_source SET encrypted_source=$2 WHERE id=$1',[id,sensitive.encrypt(profileCanonical(raw))]);
 assert.equal(await db.transaction(m=>executeYuzhouTrainingItem(m,scope,actor,value,sensitive,lookup,op)),'applied');
 assert.equal((await db.query('SELECT original_source_id FROM hr_incremental_training_binding WHERE original_source_id=$1',[id]))[0].original_source_id,id);
 const before=await counts();await db.query(`UPDATE migration_batch SET tool_version='wrong' WHERE run_id=$1`,[originalOp]);const retry=await operation();await assert.rejects(db.transaction(m=>executeYuzhouTrainingItem(m,scope,actor,value,sensitive,lookup,retry)),/EVIDENCE_INVALID/);assert.deepEqual(await counts(),before);
});

test('same fixed package creates organization active employee and formal training atomically',{skip:!enabled},async()=>{
 await db.query(`ALTER TABLE hr_employee ALTER COLUMN id SET DEFAULT uuid_generate_v4(),
 ADD COLUMN employee_code text,ADD COLUMN employment_type text,ADD COLUMN employment_status text,
 ADD COLUMN hire_date date,ADD COLUMN work_location text,ADD COLUMN work_mobile text,ADD COLUMN work_email text,
 ADD COLUMN create_by uuid,ADD COLUMN update_by uuid,ADD COLUMN version integer DEFAULT 1,ADD COLUMN primary_org_id uuid,ADD COLUMN position_id uuid,
 ADD COLUMN update_time timestamptz DEFAULT now();
 ALTER TABLE migration_batch ADD COLUMN id uuid DEFAULT uuid_generate_v4() UNIQUE;
 ALTER TABLE legacy_record_map ADD COLUMN batch_id uuid REFERENCES migration_batch(id);
 CREATE TABLE hr_yuzhou_production_import_record(source_system text,source_table text,source_pk_canonical text,target_table text);
 CREATE TABLE hr_incremental_initial_baseline(item_id uuid PRIMARY KEY,original_operation_id text,witness_sha256 text,provenance_encrypted text);
 CREATE TABLE sys_org(id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),tenant_id text,park_id text,parent_id uuid,org_code text,org_name text,org_type text,status text,sort_order integer DEFAULT 0,remark text,contact_phone text,planned_headcount integer,legacy_manager_reference text,legacy_source_id integer,legacy_hierarchy_level integer,version integer DEFAULT 1,is_deleted boolean DEFAULT false,create_by uuid,update_by uuid,update_time timestamptz DEFAULT now());`);
 const dir=mkdtempSync(resolve(tmpdir(),'yuzhou-training-same-package-')),root=resolve(__dirname,'../../../../..');
 try{
  execFileSync(process.execPath,['scripts/e2e/yuzhou-reusable-incremental-package-fixture.mjs','--root',dir,'--contract-type-id','00000000-0000-5000-8000-000000000001','--employee-only','yes'],{cwd:root,stdio:'pipe'});
  const input=JSON.parse(readFileSync(resolve(dir,'input.json'),'utf8'));
  const raw={legacyCode:'INC-ORG',orgName:'Synthetic package organization',rating:2,sortOrder:0,legacyManagerValue:null,plannedHeadcount:null,contactPhone:null,legacySourceId:null};
  input.organizationRecords=[{sourceTable:'dbo.departmentcode',sourceKey:'INC-ORG',sourceIdentitySha256:createHash('sha256').update('dbo.departmentcode\0INC-ORG').digest('hex'),sourceRowSha256:digest(raw),source:raw}];
  const training={id:8765,person:'CLI-E-001',organ:null,coursename:'Synthetic dependency training',startdate:'2020-02-29T00:00:00',enddate:'2020-03-01T00:00:00',hours:8,attainment:null,test:null,trainmoney:null,memo:null};
  input.trainingRecords=[{sourceTable:'dbo.trainhis',sourceKey:String(training.id),sourceIdentitySha256:digest(`dbo.trainhis\0${training.id}`),sourceRowSha256:digest(training),source:training}];
  // The source identity hash is over bytes, whereas the row hash uses canonical JSON.
  input.trainingRecords[0].sourceIdentitySha256=createHash('sha256').update(`dbo.trainhis\0${training.id}`).digest('hex');
  writeFileSync(resolve(dir,'input.json'),JSON.stringify(input),{mode:0o600});
  execFileSync(process.execPath,['scripts/hr-cutover/build-yuzhou-reusable-incremental-package.mjs','--input',resolve(dir,'input.json'),'--output',resolve(dir,'with-training')],{cwd:root,stdio:'pipe'});
  const dto=JSON.parse(readFileSync(resolve(dir,'with-training/package.json'),'utf8')) as PreviewYuzhouIncrementalImportDto;
  const service=new HrYuzhouIncrementalImportService(db,sensitive,{buildScopeFilter:async()=>({unrestricted:true,allowed_ids:[]})} as never);
  const manager={...actor,permissions:[...actor.permissions,HR_PERMISSIONS.HR_EMPLOYEE_MANAGE,SYSTEM_PERMISSIONS.ORG_CREATE,SYSTEM_PERMISSIONS.ORG_UPDATE]};
  const before=await counts(),preview=await service.preview(scope,manager,dto);
  assert.deepEqual(await counts(),before);assert.equal(preview.status,'previewed');
  const committed=await service.commit(scope,manager,String(preview.id));assert.equal(committed.appliedCount,3);
  const employee=(await db.query(`SELECT id,employment_status,primary_org_id FROM hr_employee WHERE employee_code='CLI-E-001'`))[0];
  assert.equal(employee.employment_status,'active');assert.ok(employee.primary_org_id);
  assert.equal((await db.query(`SELECT count(*)::int n FROM hr_training_participant WHERE employee_id=$1 AND status='completed'`,[employee.id]))[0].n,1);
  assert.equal((await service.commit(scope,manager,String(preview.id))).appliedCount,3);
  const aggregate=async()=> (await db.query(`SELECT (SELECT count(*)::int FROM sys_org) orgs,(SELECT count(*)::int FROM hr_employee) employees,(SELECT count(*)::int FROM hr_training_participant) training,(SELECT count(*)::int FROM hr_incremental_import_item) items,(SELECT count(*)::int FROM hr_incremental_import_revision) revisions`))[0];
  const accepted=await aggregate();
  const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
  raw.legacyCode='INC-ORG2';input.organizationRecords[0]={sourceTable:'dbo.departmentcode',sourceKey:raw.legacyCode,sourceIdentitySha256:hash('dbo.departmentcode\0'+raw.legacyCode),sourceRowSha256:digest(raw),source:raw};
  const employeeSource=input.employeeRecords[0];employeeSource.sourceKey='CLI-E-002';employeeSource.source.departmentCode=raw.legacyCode;
  employeeSource.sourceIdentitySha256=hash('dbo.person\0CLI-E-002');employeeSource.sourceRowSha256=digest(employeeSource.source);
  training.id=8766;training.person='CLI-E-002';input.trainingRecords[0]={sourceTable:'dbo.trainhis',sourceKey:String(training.id),sourceIdentitySha256:hash('dbo.trainhis\0'+training.id),sourceRowSha256:digest(training),source:training};
  writeFileSync(resolve(dir,'input.json'),JSON.stringify(input),{mode:0o600});
  execFileSync(process.execPath,['scripts/hr-cutover/build-yuzhou-reusable-incremental-package.mjs','--input',resolve(dir,'input.json'),'--output',resolve(dir,'atomic-failure')],{cwd:root,stdio:'pipe'});
  const failing=JSON.parse(readFileSync(resolve(dir,'atomic-failure/package.json'),'utf8')) as PreviewYuzhouIncrementalImportDto;
  await assert.rejects(service.preview(scope,{...manager,permissions:manager.permissions.filter(p=>p!==HR_PERMISSIONS.HR_EMPLOYEE_MANAGE)},failing),/permission is required/);
  const retry=await service.preview(scope,manager,failing);
  await db.query(`CREATE FUNCTION lab_training_public_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF EXISTS(SELECT 1 FROM hr_incremental_import_item WHERE id=NEW.item_id AND domain='training_history') THEN RAISE EXCEPTION 'synthetic public training failure'; END IF;RETURN NEW;END $$;CREATE TRIGGER lab_training_public_failure BEFORE INSERT ON hr_incremental_import_revision FOR EACH ROW EXECUTE FUNCTION lab_training_public_failure();`);
  try{await assert.rejects(service.commit(scope,manager,String(retry.id)),/synthetic public training failure/);assert.deepEqual(await aggregate(),accepted);assert.equal((await service.status(scope,manager,String(retry.id))).status,'previewed');}
  finally{await db.query('DROP TRIGGER lab_training_public_failure ON hr_incremental_import_revision;DROP FUNCTION lab_training_public_failure()');}
  assert.equal((await service.commit(scope,manager,String(retry.id))).appliedCount,3);

 }finally{rmSync(dir,{recursive:true,force:true});}
});
