import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import process from 'node:process';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {runInNewContext} from 'node:vm';
import {EventEmitter} from 'node:events';
import {setImmediate} from 'node:timers';
import {mkdtempSync,realpathSync,writeFileSync,readFileSync,chmodSync,rmSync,existsSync,statSync,readdirSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {URL,fileURLToPath} from 'node:url';
import {assembleOriginalProfileAliasInput,prepareOriginalProfileAliasInput,originalProfileAliasInputSql,originalProfileAliasReadProgram} from '../prepare-yuzhou-original-profile-alias-input.mjs';
import {canonicalProfile} from '../yuzhou-profile-incremental-projection.mjs';
import {personnelAliasSql} from '../../diagnose-yuzhou-personnel-alias.mjs';

const sha=v=>createHash('sha256').update(v).digest('hex');
const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const clone=v=>globalThis.structuredClone(v);
function fixture() {
  const rows=[0,1].map(i=>{
    const source={id:i+1,person:`SYN${i+1}`,sex:null,birthday:null,handtel:null,email:null,addr:null,idcard:null,oldaddr:'合成籍贯',edulevel:i===0?'合成学历':null};
    return {sourceIdentitySha256:sha(`dbo.person.core_residue\0${source.id}`),sourceRowSha256:sha(canonicalProfile(source)),source,
      employeeId:uuid(i+1),employeeSourceIdentitySha256:sha(`dbo.person\0${source.person}`),profileId:uuid(i+3),nativePlace:null,degree:null,profileVersion:1};
  });
  const sourceLedger=rows.map(({sourceIdentitySha256,sourceRowSha256})=>({sourceIdentitySha256,sourceRowSha256}));
  const sourceSetSha256=sha([...sourceLedger].sort((a,b)=>a.sourceIdentitySha256<b.sourceIdentitySha256?-1:1).map(r=>`${r.sourceIdentitySha256}:${r.sourceRowSha256}`).join('\n'));
  const expected={sourceSetSha256,profileCount:2,aliasProfiles:2,nativePlaceFills:2,degreeFills:1,planSha256:'a'.repeat(64),beforeSha256:'b'.repeat(64)};
  const field={targetNullSourceValid:0,existingEqualPreserved:0,existingDifferentPreserved:0,whitespaceOnlySource:0,missingOrInvalidSource:0};
  const observation={operationCount:1,sourceRecords:2,receiptMatchedSourceRecords:2,missingSourceReceiptCount:0,mappedRecords:2,unmappedRecords:0,otherOwnerStatusRecords:0,duplicateSourceRows:0,t0MappedRecords:2,profileMatchedCount:2,duplicateProfiles:0,ambiguousArchiveRegistryCount:0,missingArchiveCount:0,sourceSetSha256,
    originalBaselineSet:{operationCount:1,validOperationCount:1,nonEmptyProfileSetCount:1,matchingProfileSetCount:1,matchingReceiptSetCount:1,intactWholeSetCount:1},
    fields:{nativePlace:{...field,targetNullSourceValid:2},degree:{...field,targetNullSourceValid:1,missingOrInvalidSource:1}},
    profileGaps:{matched:2,receiptMissing:0,receiptSourceMismatch:0,receiptNotInserted:0,targetMissing:0,targetDeleted:0,targetScopeOrOwnerMismatch:0,targetSourceMismatch:0,ambiguousActiveProfiles:0},
    profileNonInsertSummary:{reasons:{identityAmbiguous:0,sourceMaterializationQuarantined:0,employeeNotMapped:0,other:0},employmentStatus:{departed:0,nonDeparted:0,unknown:0},linkedAccountCount:0,currentContractCandidateCount:0},
    correctionPlan:{sealVersion:1,mappingVersion:'yuzhou-personnel-alias-null-fill-v1',plannedProfiles:2,nativePlaceFills:2,degreeFills:1,planSha256:expected.planSha256,beforeSha256:expected.beforeSha256,afterSha256:'c'.repeat(64)}};
  const binding={operationId:'yzprod-import-20261004T130000Z-abcdef123456',intent:'APPEND_T5_FULL_HISTORY_ONCE',targetScope:{tenantId:'10000001',parkId:'20000001'},executionCodeSha:'7c3df1c230bde74badbf414acae36030d5fe8709',sourceMappingContractSha256:'d44b0f904fb3240d45a52b8dc8a3510ce5622ecb6f7f41356fbe6e48fa53b7e0',triple:{sourceSnapshotHash:'d'.repeat(64)}};
  return {envelope:{rows,sourceLedger,observation,operations:[{operationId:binding.operationId,bindingSha256:sha(canonicalProfile(binding)),binding}]},expected};
}
const at='2026-10-05T10:00:00.000Z';
test('actual container reader reports closed stages without private exception text or partial rows',async()=>{
  for(const stage of ['KEYRING','INPUT','CONNECT','QUERY','QUERY_TIMEOUT','QUERY_LOCK','ENVELOPE','DECRYPT','SOURCE_JSON','OUTPUT','PASS']){
    const stdin=new EventEmitter();stdin.setEncoding=()=>{};
    let stdout='',stderr='',closed=false;
    const privateError=()=>Object.assign(Error('synthetic private-row /secret/path'),{code:stage==='QUERY_TIMEOUT'?'57014':stage==='QUERY_LOCK'?'55P03':'untrusted private-code'});
    class Client {
      constructor(config){assert.equal(config.options,'-c default_transaction_read_only=on -c jit=off')}
      async connect(){if(stage==='CONNECT')throw privateError()}
      async query(){if(stage.startsWith('QUERY'))throw privateError();return [{rows:[{json_build_object:stage==='ENVELOPE'?null:{rows:[{encryptedSource:'synthetic-cipher'}]}}]}]}
      async end(){closed=true}
    }
    class Sensitive {
      constructor(){if(stage==='KEYRING')throw privateError()}
      decrypt(){if(stage==='DECRYPT')return null;return stage==='SOURCE_JSON'?'synthetic-private-not-json':'{"value":"synthetic-source"}'}
    }
    const proc={env:{},stdin,stdout:{write:value=>{if(stage==='OUTPUT')throw privateError();stdout+=value}},stderr:{write:value=>{stderr+=value}},exitCode:0};
    runInNewContext(originalProfileAliasReadProgram,{process:proc,require:path=>path.endsWith('/pg')?{Client}:path.endsWith('/@nestjs/config')?{ConfigService:class {}}:{PartySensitiveDataService:Sensitive}});
    stdin.emit('data',stage==='INPUT'?'bad-json':JSON.stringify({sql:'synthetic query'}));stdin.emit('end');
    for(let i=0;i<10&&!closed;i++)await new Promise(resolve=>setImmediate(resolve));
    assert.equal(closed,true);
    if(stage==='PASS'){assert.equal(proc.exitCode,0);assert.equal(stderr,'');assert.deepEqual(JSON.parse(stdout),{rows:[{source:{value:'synthetic-source'}}]})}
    else {assert.equal(proc.exitCode,1);assert.equal(stdout,'');assert.equal(stderr,`YUZHOU_PROFILE_ALIAS_SOURCE_READ_FAILED_${stage}\n`);assert.doesNotMatch(stderr,/private-row|secret|untrusted/)}
  }
});
test('real input assembly retains original witness and drives existing ordered public packages',()=>{
  const {envelope,expected}=fixture();const prepared=assembleOriginalProfileAliasInput(envelope,expected,at);
  assert.equal(prepared.batch.receipt.sourceProfiles,2);assert.equal(prepared.batch.receipt.aliasProfiles,2);
  assert.equal(prepared.input.originalWitness.bindingSha256,envelope.operations[0].bindingSha256);
  assert.deepEqual(prepared.batch.packages[0].packageDto.items.map(i=>i.fields),[{},{}]);
  const aliases=prepared.batch.packages.slice(1).flatMap(x=>x.packageDto.items);
  assert.equal(aliases.length,2);assert.equal(aliases.filter(i=>i.fields.degree).length,1);
  assert.equal(prepared.beforeImages[0].version,1);
  assert.equal(prepared.batch.receipt.productionImport,'HOLD');
});
test('ordered private batch authenticates unrelated historical invalid fields without writing or validating them as aliases',()=>{
  const {envelope,expected}=fixture();
  for(const row of envelope.rows){
    Object.assign(row.source,{birthday:'historical unknown',email:'historical invalid',idcard:'enc:historical evidence',addr:'x'.repeat(501)});
    row.sourceRowSha256=sha(canonicalProfile(row.source));
  }
  envelope.sourceLedger=envelope.rows.map(({sourceIdentitySha256,sourceRowSha256})=>({sourceIdentitySha256,sourceRowSha256}));
  expected.sourceSetSha256=sha([...envelope.sourceLedger].sort((a,b)=>a.sourceIdentitySha256<b.sourceIdentitySha256?-1:1).map(row=>`${row.sourceIdentitySha256}:${row.sourceRowSha256}`).join('\n'));
  envelope.observation.sourceSetSha256=expected.sourceSetSha256;
  const prepared=assembleOriginalProfileAliasInput(envelope,expected,at);
  assert.deepEqual(prepared.batch.packages[0].packageDto.items.map(item=>item.fields),[{},{}]);
  for(const item of prepared.batch.packages.slice(1).flatMap(entry=>entry.packageDto.items))assert.ok(Object.keys(item.fields).every(field=>['nativePlace','degree'].includes(field)));
  const forged=clone(envelope);forged.rows[0].source.email='changed without digest';
  assert.throws(()=>assembleOriginalProfileAliasInput(forged,expected,at));
});
test('expected seals, original scope/mapper, complete row hashes and employee identities cannot be forged or rebound',()=>{
  const {envelope,expected}=fixture();
  for(const change of [e=>{e.observation.correctionPlan.beforeSha256='e'.repeat(64)},e=>{e.rows.pop()},
    e=>{e.rows[0].source.oldaddr='篡改'},e=>{e.rows[0].employeeSourceIdentitySha256='f'.repeat(64)},
    e=>{e.rows[0].sourceRowSha256='f'.repeat(64)},e=>{e.sourceLedger[0].sourceRowSha256='f'.repeat(64)},
    e=>{e.operations[0].binding.targetScope.tenantId='foreign';e.operations[0].bindingSha256=sha(canonicalProfile(e.operations[0].binding))},
    e=>{e.operations[0].binding.executionCodeSha='e'.repeat(40);e.operations[0].bindingSha256=sha(canonicalProfile(e.operations[0].binding))},
    e=>{e.observation.originalBaselineSet.matchingProfileSetCount=0;e.observation.originalBaselineSet.intactWholeSetCount=0},
    e=>{e.rows[0].encryptedSource='forbidden-extra'}]) {
    const changed=clone(envelope);change(changed);assert.throws(()=>assembleOriginalProfileAliasInput(changed,expected,at));
  }
  const escaped=clone(envelope);escaped.rows[0].source.oldaddr='\\u5408\\u6210\\u7c4d\\u8d2f';
  assert.equal(assembleOriginalProfileAliasInput(escaped,expected,at).input.importInput.profileRecords[0].source.oldaddr,'合成籍贯');
});
test('private preparation observes runtime around read, emits only metadata and owns exactly its new directory',()=>{
  const root=realpathSync(mkdtempSync(join(tmpdir(),'profile-source-')));chmodSync(root,0o700);
  try {
    const {envelope,expected}=fixture();const config=join(root,'config.json');
    writeFileSync(config,JSON.stringify({deployPath:root,expectedRuntimeCommit:'a'.repeat(40),expected}),{mode:0o600});
    let reads=0,observes=0;const observe=()=>{observes++;return {observations:[{service:'api',revision:'a'.repeat(40),containerId:'one'}]}};
    const run=(binary,args,options)=>{reads++;assert.equal(binary,'docker');assert.ok(args.includes('jinhu-smart-park-prod-api'));
      assert.equal(args.at(-1),originalProfileAliasReadProgram);assert.equal(options.timeout,20000);
      assert.equal(JSON.parse(options.input).sql,originalProfileAliasInputSql);return JSON.stringify(envelope)};
    const output=join(root,'output');const result=prepareOriginalProfileAliasInput({configPath:config,outputDir:output},{run,observe,now:()=>new Date(at)});
    assert.equal(reads,1);assert.equal(observes,2);assert.equal(result.writerPresent,false);
    assert.doesNotMatch(JSON.stringify(result),/合成|SYN|output|employeeId|profileId|password/);
    assert.equal(statSync(output).mode&0o777,0o700);
    for(const name of ['input.json','before-images.json','preparation-receipt.json'])assert.equal(statSync(join(output,name)).mode&0o777,0o600);
    for(const name of readdirSync(join(output,'batch')))assert.equal(statSync(join(output,'batch',name)).mode&0o777,0o600);
    assert.equal(sha(readFileSync(join(output,'input.json'))),result.inputSha256);
    assert.throws(()=>prepareOriginalProfileAliasInput({configPath:config,outputDir:output},{run,observe}));assert.equal(reads,1);
    symlinkSync(config,join(root,'link'));assert.throws(()=>prepareOriginalProfileAliasInput({configPath:join(root,'link'),outputDir:join(root,'bad')},{run,observe}));assert.equal(reads,1);
    let n=0;assert.throws(()=>prepareOriginalProfileAliasInput({configPath:config,outputDir:join(root,'changed')},{run,observe:()=>({observations:[{containerId:String(n++)}]}),now:()=>new Date(at)}),/RUNTIME_CHANGED/);
    assert.equal(existsSync(join(root,'changed')),false);
  }finally{rmSync(root,{recursive:true,force:true})}
});
test('private query shares existing CTE, read-only snapshot and digest/decoder semantics; runtime starts no app',()=>{
  const prefix=personnelAliasSql.slice(0,personnelAliasSql.indexOf('\nSELECT json_build_object('));
  assert.ok(originalProfileAliasInputSql.startsWith(prefix.replace('BEGIN TRANSACTION READ ONLY;','BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;')));
  assert.doesNotMatch(originalProfileAliasInputSql,/UPDATE |DELETE |INSERT |LOCK TABLE|FOR UPDATE|FOR SHARE/);
  assert.match(originalProfileAliasReadProgram,/default_transaction_read_only=on/);
  assert.match(originalProfileAliasReadProgram,/PartySensitiveDataService/);
  assert.doesNotMatch(originalProfileAliasReadProgram,/NestFactory|AppModule|createApplicationContext|console\./);
});

test('actual read-only SQL and runtime crypto produce verified packages in a fresh disposable PostgreSQL',
  {skip:process.env.HR_PROFILE_ALIAS_SOURCE_PG!=='1'},async()=>{
  const root=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
  const require=createRequire(new URL('../../../apps/api/package.json',import.meta.url));
  const {Client}=require('pg');const {ConfigService}=require('@nestjs/config');
  const {PartySensitiveDataService}=require('./dist/shared/security/party-sensitive-data.service.js');
  const key=randomBytes(32).toString('hex');const sensitive=new PartySensitiveDataService(new ConfigService({PARTY_DATA_ENCRYPTION_KEY:key}));
  const database=`jinhu_hr_profile_source_${randomBytes(12).toString('hex')}`;
  const port=Number(process.env.POSTGRES_PORT||55491);
  assert.ok(Number.isSafeInteger(port)&&port>=1024&&port<=65535,'isolated loopback port required');
  const config={host:'127.0.0.1',port,user:process.env.POSTGRES_USER,password:process.env.POSTGRES_PASSWORD};
  const admin=new Client({...config,database:'postgres'});let client,created=false;
  try {
    await admin.connect();await admin.query(`CREATE DATABASE "${database}" TEMPLATE template0`);created=true;
    client=new Client({...config,database});await client.connect();
    assert.equal((await client.query('SELECT current_database() db')).rows[0].db,database);
    await client.query(readFileSync(new URL('./personnel-correction-fixture.sql',import.meta.url),'utf8'));
    await client.query(`ALTER TABLE hr_yuzhou_t5_followon_operation ADD COLUMN binding_sha256 text,
      ADD COLUMN owned_state jsonb,ADD COLUMN finished_at timestamptz,ADD COLUMN rolled_back_at timestamptz;
      ALTER TABLE hr_yuzhou_t5_followon_source ADD COLUMN encrypted_source text;
      CREATE TABLE hr_contract(tenant_id text,park_id text,employee_id uuid,is_deleted bool,status text,end_date date);
      SET TIME ZONE 'Asia/Shanghai';`);
    const {envelope}=fixture();const op=envelope.operations[0],parent='synthetic-parent',core=randomUUID(),follow=randomUUID();
    const triple={codeSha:'a'.repeat(40),sourceSnapshotHash:'d'.repeat(64),mappingContractHash:'c'.repeat(64)};
    Object.assign(op.binding,{triple,parent:{sealedPlanSha256:'e'.repeat(64)},targetIdentitySha256:'f'.repeat(64),targetScopeSha256:'1'.repeat(64)});
    op.bindingSha256=sha(canonicalProfile(op.binding));
    const insert=async(table,row)=>{const keys=Object.keys(row);await client.query(`INSERT INTO ${table} (${keys.join(',')}) VALUES(${keys.map((_,i)=>`$${i+1}`).join(',')})`,Object.values(row))};
    await insert('hr_yuzhou_production_import_operation',{operation_id:parent,status:'succeeded',target_tenant_id:'10000001',target_park_id:'20000001',code_sha:triple.codeSha,source_snapshot_sha256:triple.sourceSnapshotHash,mapping_contract_sha256:triple.mappingContractHash,sealed_plan_sha256:op.binding.parent.sealedPlanSha256,target_identity_sha256:op.binding.targetIdentitySha256,target_scope_sha256:op.binding.targetScopeSha256,execution_contract_version:2});
    await insert('hr_yuzhou_t5_followon_operation',{operation_id:op.operationId,parent_operation_id:parent,status:'succeeded',binding:op.binding,binding_sha256:op.bindingSha256,finished_at:new Date(at)});
    await insert('migration_batch',{id:follow,t5_followon_operation_id:op.operationId,run_id:op.operationId,execution_context:'t5_production_followon',status:'succeeded',target_database:database});
    await insert('migration_batch',{id:core,execution_context:'production_import',production_import_operation_id:parent,production_import_phase:'T0',status:'succeeded'});
    await insert('hr_yuzhou_production_import_phase',{operation_id:parent,phase:'T0',status:'succeeded'});
    for(const row of envelope.rows) {
      const sourceId=randomUUID(),mapId=randomUUID(),registry=randomUUID(),archive=randomUUID();
      const scope={tenant_id:'10000001',park_id:'20000001'};
      await insert('hr_employee',{id:row.employeeId,...scope,is_deleted:false,employment_status:'active'});
      await insert('legacy_record_map',{id:mapId,target_id:row.employeeId,target_table:'hr_employee',source_system:'yuzhou-v10',source_table:'dbo.person',is_active:true,mapping_status:'verified',source_pk_canonical:`sha256:${row.employeeSourceIdentitySha256}`,source_identity_sha256:row.employeeSourceIdentitySha256,source_row_sha256:row.sourceRowSha256,batch_id:core});
      await insert('hr_yuzhou_production_import_record',{operation_id:parent,phase:'T0',source_identity_sha256:row.employeeSourceIdentitySha256,source_row_sha256:row.sourceRowSha256,source_system:'yuzhou-v10',source_table:'dbo.person',source_pk_canonical:`sha256:${row.employeeSourceIdentitySha256}`,target_table:'hr_employee',target_id:row.employeeId,disposition:'insert',rollback_status:'not_started'});
      await insert('hr_yuzhou_production_import_projection_receipt',{operation_id:parent,phase:'T0',source_identity_sha256:row.employeeSourceIdentitySha256,legacy_record_map_id:mapId,migration_batch_id:core});
      await insert('hr_yuzhou_t5_followon_source',{id:sourceId,operation_id:op.operationId,...scope,source_domain:'person_core',source_table:'dbo.person.core_residue',source_identity_sha256:row.sourceIdentitySha256,source_row_sha256:row.sourceRowSha256,owner_status:'mapped',employee_id:row.employeeId,owner_record_map_id:mapId,encrypted_source:sensitive.encrypt(JSON.stringify(row.source))});
      await insert('hr_legacy_identity_registry',{id:registry,...scope,source_system:'yuzhou-v10',source_table:'dbo.person.core_residue',source_identity_sha256:row.sourceIdentitySha256,source_row_sha256:row.sourceRowSha256,mapping_status:'mapped',owner_employee_id:row.employeeId,owner_record_map_id:mapId,owner_source_system:'yuzhou-v10',owner_source_table:'dbo.person',owner_source_identity_sha256:row.employeeSourceIdentitySha256});
      await insert('hr_legacy_archive_record',{id:archive,identity_registry_id:registry,...scope,restricted_safe_projection:{legacyFields:{oldaddr:row.source.oldaddr,edulevel:row.source.edulevel}}});
      await insert('hr_employee_profile',{id:row.profileId,...scope,employee_id:row.employeeId,is_deleted:false,legacy_source_identity_sha256:row.sourceIdentitySha256,legacy_source_row_sha256:row.sourceRowSha256,native_place:null,degree:null,version:1});
      for(const [table,id] of [['hr_yuzhou_t5_followon_source',sourceId],['hr_employee_profile',row.profileId],['hr_legacy_identity_registry',registry],['hr_legacy_archive_record',archive]]) {
        await insert('hr_yuzhou_t5_followon_projection_receipt',{operation_id:op.operationId,target_table:table,target_id:id,source_identity_sha256:row.sourceIdentitySha256,source_row_sha256:row.sourceRowSha256,disposition:'insert'});
      }
    }
    const seal=async table=>{const rows=(await client.query(`SELECT to_jsonb(t)::text text FROM ${table} t`)).rows;
      return {count:rows.length,sha256:sha(rows.map(r=>sha(r.text)).sort().join(''))}};
    await client.query('UPDATE hr_yuzhou_t5_followon_operation SET owned_state=$1',[{hr_employee_profile:await seal('hr_employee_profile'),receipts:await seal('hr_yuzhou_t5_followon_projection_receipt')}]);
    const program=originalProfileAliasReadProgram.replaceAll('/app/',`${root}/`);
    const run=(sql=originalProfileAliasInputSql)=>spawnSync(process.execPath,['-e',program],{input:JSON.stringify({sql}),encoding:'utf8',timeout:20000,maxBuffer:1024*1024,
      env:{...process.env,POSTGRES_HOST:'127.0.0.1',POSTGRES_PORT:String(config.port),POSTGRES_DB:database,POSTGRES_USER:config.user,POSTGRES_PASSWORD:config.password,
        PARTY_DATA_ENCRYPTION_KEY:key,PARTY_DATA_ACTIVE_KEY_ID:'',PARTY_DATA_ENCRYPTION_KEYRING:''}});
    const result=run();assert.equal(result.status,0,result.stderr);
    const actual=JSON.parse(result.stdout),o=actual.observation;
    const forcedThresholds=run(originalProfileAliasInputSql.replace('SET LOCAL enable_nestloop=off;',
      'SET LOCAL enable_nestloop=off; SET LOCAL jit_above_cost=0; SET LOCAL jit_inline_above_cost=0; SET LOCAL jit_optimize_above_cost=0;'));
    assert.equal(forcedThresholds.status,0,forcedThresholds.stderr);
    assert.deepEqual(JSON.parse(forcedThresholds.stdout),actual,'JIT cost thresholds must not alter read-only source and receipt facts');
    assert.equal(o.originalBaselineSet.intactWholeSetCount,1);
    assert.equal(o.sourceSetSha256,envelope.observation.sourceSetSha256,'SQL and JS source-set separator must agree');
    assert.doesNotMatch(result.stdout,/enc:v1:|encryptedSource/);
    const expected={sourceSetSha256:o.sourceSetSha256,profileCount:o.profileMatchedCount,aliasProfiles:o.correctionPlan.plannedProfiles,nativePlaceFills:o.correctionPlan.nativePlaceFills,degreeFills:o.correctionPlan.degreeFills,planSha256:o.correctionPlan.planSha256,beforeSha256:o.correctionPlan.beforeSha256};
    assert.equal(assembleOriginalProfileAliasInput(actual,expected,at).batch.receipt.aliasProfiles,2);
    await client.query("UPDATE hr_employee_profile SET version=version+1 WHERE id=$1",[envelope.rows[0].profileId]);
    const changed=run();assert.equal(changed.status,0,changed.stderr);
    assert.throws(()=>assembleOriginalProfileAliasInput(JSON.parse(changed.stdout),expected,at),/OBSERVATION_DRIFT/);
  }finally {
    if(client)await client.end();if(created){await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);assert.equal((await admin.query('SELECT count(*)::int n FROM pg_database WHERE datname=$1',[database])).rows[0].n,0)}await admin.end();
  }
});
