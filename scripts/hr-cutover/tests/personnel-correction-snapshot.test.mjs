import { Buffer } from 'node:buffer';
import { URL,fileURLToPath } from 'node:url';
import process from 'node:process';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes,randomUUID,generateKeyPairSync,createHash,sign } from 'node:crypto';
import { readFileSync,writeFileSync,mkdtempSync,mkdirSync,chmodSync,readdirSync,lstatSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';
import { correctionCtes,snapshotCorrectionCtes } from '../personnel-correction-sql.mjs';
import { snapshotRelations,snapshotColumns,snapshotAggregateSql,snapshotCaptureQueries } from '../personnel-correction-snapshot-contract.mjs';
import { capturePersonnelCorrectionSnapshot,preparePersonnelCorrectionSnapshotLab,snapshotContractSha256,originIdentity,createPersonnelCorrectionSnapshotLabDescriptor,readPersonnelCorrectionSnapshotLabDescriptor } from '../personnel-correction-snapshot.mjs';
import { correctionAuthoritySha256,correctionExecutionSha256,executePersonnelCorrectionLab } from '../personnel-correction-lab.mjs';
const hash=v=>createHash('sha256').update(v).digest('hex');
const root=fileURLToPath(new URL('../../../',import.meta.url));
const run=promisify(execFile);
const keys=generateKeyPairSync('ed25519');
const publicKey=keys.publicKey.export({type:'spki',format:'pem'});
const signed=p=>{const payload=JSON.stringify(p);return {payload,signature:sign(null,Buffer.from(payload),keys.privateKey).toString('base64')};};
const privateFile=(p,v)=>writeFileSync(p,v,{mode:0o600,flag:'wx'});
const op=()=>`yzprod-import-20261003T000000Z-${randomBytes(6).toString('hex')}`;

test('snapshot mapping reverses byte-for-byte and preserves target_table string literals',()=>{
 const restored=snapshotRelations.filter(n=>n!=='hr_employee_profile').reduce((s,n)=>s.replaceAll(`hr_correction_snapshot.${n}`,n),snapshotCorrectionCtes)
  .replace('follow_batch.target_database=$5','follow_batch.target_database=current_database()');
 assert.equal(restored,correctionCtes);
 assert.deepEqual(snapshotCorrectionCtes.match(/'hr_[a-z_]+'/g),correctionCtes.match(/'hr_[a-z_]+'/g));
 assert.equal((snapshotCorrectionCtes.match(/\$5/g)||[]).length,1);
 assert.ok(!snapshotCorrectionCtes.includes('JOIN hr_employee e'));
 assert.ok(snapshotCorrectionCtes.includes('JOIN hr_correction_snapshot.hr_employee e'));
});

test('full migration, typed snapshot host and correction in disposable PostgreSQL',
 {skip:process.env.HR_CORRECTION_SNAPSHOT_PG_TEST!=='1',timeout:1800000},async t=>{
 const directory=mkdtempSync(join(process.env.HR_CORRECTION_TEST_ARTIFACT_ROOT||tmpdir(),'correction-snapshot-'));chmodSync(directory,0o700);
 const suffix=randomBytes(12).toString('hex'),project=`correction-snapshot-${suffix}`;
 const origin=`jinhu_hr_correction_lab_${suffix}`,adminUser='snapshot_custodian',password=randomBytes(32).toString('hex');
 const executor='snapshot_executor',executorPassword=randomBytes(24).toString('hex');
 const compose=join(directory,'compose.json');
 privateFile(compose,JSON.stringify({name:project,services:{postgres:{image:'postgres:16-alpine',pull_policy:'never',restart:'no',
  environment:{POSTGRES_USER:adminUser,POSTGRES_PASSWORD:'${CORRECTION_PRIVATE_PASSWORD:?required}',POSTGRES_DB:origin},
  ports:['127.0.0.1::5432'],tmpfs:['/var/lib/postgresql/data:rw,size=1610612736']} }}));
 const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!(/^(PG|POSTGRES_|COMPOSE_|MIGRATION_)/.test(k)||k==='DATABASE_URL')));
 Object.assign(env,{COMPOSE_FILE:compose,COMPOSE_PROJECT_NAME:project,CORRECTION_PRIVATE_PASSWORD:password,
  POSTGRES_USER:adminUser,POSTGRES_DB:origin,MIGRATION_BASELINE_ON_NONEMPTY_DB:'no'});
 const docker=async args=>(await run('docker',['compose','-f',compose,...args],{env,cwd:root,maxBuffer:1024*1024})).stdout.trim();
 let admin,reader,started=false;
 const clients=[];
 const require=createRequire(new URL('../../../apps/api/package.json',import.meta.url));const {Client}=require('pg');
 const result={kind:'synthetic_full_schema_snapshot',productionImport:'HOLD',sourceBoundAB:'NOT_EXECUTED',status:'RUNNING',residual:null};
 const subtest=(name,fn)=>t.test(name,async()=>{try{await fn();}catch(error){result.failedCases=(result.failedCases||0)+1;throw error;}});
 try{
  assert.equal((await run('docker',['ps','-aq','--filter',`label=com.docker.compose.project=${project}`])).stdout.trim(),'');
  await docker(['up','-d','--no-build','--pull','never']);started=true;
  for(let i=0;i<60;i++){try{await docker(['exec','-T','postgres','pg_isready','-h','127.0.0.1','-U',adminUser,'-d',origin]);break;}catch{if(i===59)throw new Error('SYNTHETIC_START_TIMEOUT');await delay(500);}}
  const published=await docker(['port','postgres','5432']);assert.match(published,/^127\.0\.0\.1:[0-9]+$/);const port=Number(published.split(':')[1]);
  admin=new Client({host:'127.0.0.1',port,user:adminUser,password,database:origin});await admin.connect();
  // Cheap permission root-cause proof precedes the full migration. This temp-only
  // probe does not change public schema or any existing database.
  await admin.query(`CREATE ROLE ${executor} LOGIN PASSWORD '${executorPassword}';
   CREATE TEMP TABLE correction_permission_probe(id int);
   GRANT SELECT,INSERT ON correction_permission_probe TO ${executor}`);
  await admin.query(`BEGIN; SET LOCAL ROLE ${executor}`);
  await assert.rejects(admin.query('LOCK TABLE pg_temp.correction_permission_probe IN SHARE ROW EXCLUSIVE MODE'),e=>e.code==='42501');
  await admin.query('ROLLBACK');
  await admin.query(`GRANT UPDATE ON correction_permission_probe TO ${executor}; BEGIN; SET LOCAL ROLE ${executor}`);
  await admin.query('LOCK TABLE pg_temp.correction_permission_probe IN SHARE ROW EXCLUSIVE MODE');
  await admin.query('ROLLBACK; DROP TABLE correction_permission_probe');result.permissionPreflight='PASS';
  if(process.env.HR_CORRECTION_SNAPSHOT_PREFLIGHT_ONLY==='1'){result.status='PREFLIGHT_PASS';return;}
  const migrationInputs=['database/migrations','database/migration-prerequisites'].flatMap(dir=>
   readdirSync(join(root,dir),{recursive:true}).filter(n=>n.endsWith('.sql')).map(n=>`${dir}/${n}`))
   .concat(['database/migration-replacements.txt','scripts/db-migrate.sh']).sort();
  const migrationTreeSha256=hash(migrationInputs.map(n=>`${n}:${hash(readFileSync(join(root,n)))}`).join('\n'));
  const cid=await docker(['ps','-q','postgres']);
  const imageId=(await run('docker',['inspect',cid,'--format','{{.Image}}'])).stdout.trim();
  const postgresql=(await admin.query(`SELECT json_build_object('serverVersion',current_setting('server_version'),
   'serverVersionNum',current_setting('server_version_num'),'encoding',pg_encoding_to_char(encoding),'collation',datcollate,
   'ctype',datctype,'localeProvider',datlocprovider,'icuLocale',daticulocale,'collationVersion',datcollversion,'timezone',current_setting('timezone')) facts
   FROM pg_database WHERE datname=current_database()`)).rows[0].facts;
  const environment={kind:'ISOLATED_SCHEMA_CACHE_ENVIRONMENT_ONLY',imageId,postgresql,
   setup:{imageReference:'postgres:16-alpine',pullPolicy:'never',tmpfs:['/var/lib/postgresql/data:rw,size=1610612736'],
    portPolicy:'random-loopback-only',databaseInitialization:'fresh-image-initdb-defaults',schemaRestore:'pg_dump-no-owner-preserve-ACL'}};
  privateFile(join(directory,'environment-provenance.json'),JSON.stringify(environment));
  const cached=process.env.HR_CORRECTION_SNAPSHOT_SCHEMA_CACHE;
  if(cached){
   assert.equal(lstatSync(cached).mode&0o777,0o700);assert.equal(lstatSync(cached).isSymbolicLink(),false);
   for(const name of ['full-schema-cache.sql','full-schema-cache.json','environment-provenance.json','full-schema-cache-environment-binding.json']){
    const st=lstatSync(join(cached,name));assert.equal(st.isFile(),true);assert.equal(st.isSymbolicLink(),false);assert.equal(st.mode&0o777,0o600);
   }
   const cache=JSON.parse(readFileSync(join(cached,'full-schema-cache.json'),'utf8'));
   assert.equal(cache.kind,'STANDARD_FULL_MIGRATION_EMPTY_TEMPLATE');assert.equal(cache.migrationTreeSha256,migrationTreeSha256);
   assert.equal(hash(readFileSync(join(cached,'full-schema-cache.sql'))),cache.dumpSha256);
   const provenance=JSON.parse(readFileSync(join(cached,'environment-provenance.json'),'utf8'));
   assert.deepEqual(environment,provenance,'PostgreSQL image, version, locale and setup must be unchanged');
   const binding=JSON.parse(readFileSync(join(cached,'full-schema-cache-environment-binding.json'),'utf8'));
   assert.equal(binding.dumpSha256,cache.dumpSha256);assert.equal(binding.migrationTreeSha256,cache.migrationTreeSha256);
   assert.equal(binding.environmentSha256,hash(readFileSync(join(cached,'environment-provenance.json'))));
   // pg_dump does not include cluster-wide NOLOGIN roles. Reproduce only the
   // eight immutable predecessor definitions required by the preserved ACLs.
   // These files are already part of migrationTreeSha256; no role name or SQL
   // comes from cache data, config or an external source.
   const roleFiles=['000308_hr_yuzhou_performance_relations_production.sql','000309_hr_yuzhou_performance_person_assessment_production.sql',
    '000310_hr_yuzhou_performance_fact_identity_production.sql','000311_hr_yuzhou_performance_facts_production.sql'];
   const roleStatements=roleFiles.flatMap(file=>readFileSync(join(root,'database/migrations',file),'utf8')
    .match(/CREATE ROLE jinhu_hr_yuzhou_[a-z_]+\s+NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION(?: NOBYPASSRLS)?;/g)||[]);
   assert.equal(roleStatements.length,8);
   for(const statement of roleStatements)await admin.query(statement);
   const roleState=await admin.query(`SELECT count(*)::int n,count(*) FILTER(WHERE rolcanlogin OR rolinherit OR rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)::int unsafe
    FROM pg_roles WHERE rolname=ANY($1::text[])`,[roleStatements.map(s=>s.split(/\s+/)[2])]);
   assert.equal(roleState.rows[0].n,8);assert.equal(roleState.rows[0].unsafe,0);
   await docker(['cp',join(cached,'full-schema-cache.sql'),'postgres:/tmp/correction-full-schema-cache.sql']);
   const restored=await docker(['exec','-T','postgres','psql','-X','-v','ON_ERROR_STOP=1','-U',adminUser,'-d',origin,'-f','/tmp/correction-full-schema-cache.sql']).catch(error=>{
    privateFile(join(directory,'cache-restore-failure.log'),String(error.stdout||'')+String(error.stderr||''));throw new Error('FULL_SCHEMA_CACHE_RESTORE_FAILED');});
   privateFile(join(directory,'cache-restore.log'),restored);result.schemaPreparation='VERIFIED_STANDARD_MIGRATION_TEMPLATE_CACHE';
  }else{
   const migration=await run('sh',['scripts/db-migrate.sh'],{env,cwd:root,maxBuffer:16*1024*1024,timeout:1200000}).catch(e=>{
    privateFile(join(directory,'migration.log'),String(e.stdout||'')+String(e.stderr||''));throw new Error('FULL_MIGRATION_FAILED');});
   privateFile(join(directory,'migration.log'),migration.stdout+ migration.stderr);
   // This cache is created before any source fixture, trust row or application data.
   const dump=(await run('docker',['compose','-f',compose,'exec','-T','postgres','pg_dump','--no-owner','-U',adminUser,'-d',origin],
    {env,cwd:root,maxBuffer:32*1024*1024})).stdout;
   privateFile(join(directory,'full-schema-cache.sql'),dump);
   privateFile(join(directory,'full-schema-cache.json'),JSON.stringify({kind:'STANDARD_FULL_MIGRATION_EMPTY_TEMPLATE',migrationTreeSha256,dumpSha256:hash(dump)}));
   privateFile(join(directory,'full-schema-cache-environment-binding.json'),JSON.stringify({migrationTreeSha256,dumpSha256:hash(dump),environmentSha256:hash(readFileSync(join(directory,'environment-provenance.json')))}));
   result.schemaPreparation='STANDARD_FULL_MIGRATION';
  }
  const history=(await admin.query("SELECT count(*)::int n,count(*) FILTER(WHERE status<>'succeeded')::int bad FROM sys_schema_migration_history")).rows[0];
  assert.ok(history.n>=327);assert.equal(history.bad,0);result.historyRows=history.n;
  const identity=await originIdentity(admin);result.migrationHistorySha256=identity.historySha256;
  const platformBaseline=(await admin.query(snapshotAggregateSql('SELECT * FROM public.sys_user'))).rows[0];
  result.platformBaselineCount=platformBaseline.count;
  const triple={codeSha:'a'.repeat(40),sourceSnapshotHash:'b'.repeat(64),mappingContractHash:'c'.repeat(64)};
  const base={tenantId:'synthetic',parkId:'snapshot',sourceOperationId:op(),parentOperationId:op(),triple};
  async function lab(registryOverride,originExpected=identity){
   const descriptorDir=join(directory,`descriptor-${randomUUID()}`);
   createPersonnelCorrectionSnapshotLabDescriptor({directory:descriptorDir,port,user:executor,password:executorPassword,authorityPublicKey:publicKey});
   const config=readPersonnelCorrectionSnapshotLabDescriptor(descriptorDir);
   // Resource owner creates exactly the generated descriptor's database below.
   await admin.query(`CREATE DATABASE ${config.database} TEMPLATE ${origin}`);
   const c=new Client({host:'127.0.0.1',port,user:adminUser,password,database:config.database});await c.connect();clients.push(c);
   await c.query(`GRANT USAGE ON SCHEMA public,hr_correction_snapshot TO ${executor};
    GRANT SELECT ON ALL TABLES IN SCHEMA public,hr_correction_snapshot TO ${executor};
    GRANT INSERT ON public.hr_employee,public.hr_employee_profile,public.hr_personnel_correction_lab,
    public.hr_personnel_correction_operation,public.hr_personnel_correction_detail,public.hr_personnel_correction_rollback,
    public.hr_personnel_correction_authorization_use,hr_correction_snapshot.manifest TO ${executor};
    GRANT UPDATE ON public.hr_employee,public.hr_employee_profile,public.hr_personnel_correction_lab TO ${executor}`);
   for(const name of snapshotRelations)await c.query(`GRANT INSERT ON hr_correction_snapshot.${name} TO ${executor}`);
   await c.query(`SET ROLE ${executor}`);
   await c.query('INSERT INTO public.hr_personnel_correction_lab(lab_id,database_name,database_user,authority_key_sha256) VALUES($1,$2,$3,$4)',
    [config.labId,config.database,executor,correctionAuthoritySha256(publicKey)]);await c.query('RESET ROLE');
   const registryId=registryOverride||randomUUID();
   await c.query(`INSERT INTO hr_correction_snapshot.origin_registry(registry_id,lab_id,origin_database,origin_identity_sha256,migration_history_sha256,
    tenant_id,park_id,source_operation_id,parent_operation_id,triple,contract_sha256,authority_public_key,expires_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now()+interval '1 hour')`,
    [registryId,config.labId,origin,originExpected.identitySha256,originExpected.historySha256,base.tenantId,base.parkId,base.sourceOperationId,base.parentOperationId,triple,snapshotContractSha256(),publicKey]);
   return {config,c,registryId};
  }
  const a=await lab();
  reader=new Client({host:'127.0.0.1',port,user:executor,password:executorPassword,database:a.config.database});await reader.connect();
  const captureDir=join(directory,'empty-source-capture');
  await subtest('capture uses a real full-schema readonly snapshot and origin/migration identity',async()=>{
   const captured=await capturePersonnelCorrectionSnapshot({registryClient:reader,sourceClient:admin,registryId:a.registryId,directory:captureDir});
   assert.equal(captured.status,'CAPTURED_UNSIGNED');assert.equal(captured.relations.hr_employee_profile.count,0);
   assert.equal((await admin.query("SELECT current_setting('transaction_read_only') value")).rows[0].value,'off');
   const wrong=await lab(undefined,{...identity,identitySha256:hash('same-name-wrong-instance')});
   await assert.rejects(capturePersonnelCorrectionSnapshot({registryClient:wrong.c,sourceClient:admin,registryId:wrong.registryId,directory:join(directory,'impostor')}),/ORIGIN_IDENTITY/);
   const badHistory=await lab(undefined,{...identity,historySha256:hash('wrong-history')});
   await assert.rejects(capturePersonnelCorrectionSnapshot({registryClient:badHistory.c,sourceClient:admin,registryId:badHistory.registryId,directory:join(directory,'wrong-history')}),/ORIGIN_IDENTITY/);
   await admin.query('BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY');
   await admin.query('SELECT 1');
   await assert.rejects(capturePersonnelCorrectionSnapshot({registryClient:reader,sourceClient:admin,registryId:a.registryId,directory:join(directory,'nested-read-committed')}),/SOURCE_SESSION_NOT_IDLE/);
   assert.equal((await admin.query("SELECT current_setting('transaction_read_only') value")).rows[0].value,'on');
   assert.equal((await admin.query("SELECT current_setting('transaction_isolation') value")).rows[0].value,'read committed');
   await admin.query('ROLLBACK');
   await admin.query('CREATE TEMP TABLE caller_owned_probe(id int)');
   await admin.query('BEGIN; INSERT INTO caller_owned_probe VALUES(1)');
   await assert.rejects(capturePersonnelCorrectionSnapshot({registryClient:reader,sourceClient:admin,registryId:a.registryId,directory:join(directory,'nested-read-write')}),/SOURCE_SESSION_NOT_IDLE/);
   assert.equal((await admin.query('SELECT count(*)::int n FROM caller_owned_probe')).rows[0].n,1);
   await admin.query('ROLLBACK');
   assert.equal((await admin.query('SELECT count(*)::int n FROM caller_owned_probe')).rows[0].n,0);
   await admin.query('DROP TABLE caller_owned_probe');
  });
  await subtest('fixed receipt extraction preserves bad candidates and excludes unrelated domains',async()=>{
   const sql=snapshotCaptureQueries.hr_yuzhou_t5_followon_projection_receipt;
   const start=sql.indexOf('SELECT t.operation_id');
   // Use the exact fixed projection/predicate after its CTE closure, with a typed
   // temp source-identity set. Public import controls remain untouched.
   const predicate=sql.slice(start).replace('public.hr_yuzhou_t5_followon_projection_receipt','pg_temp.receipt_probe');
   await admin.query('CREATE TEMP TABLE receipt_probe (LIKE public.hr_yuzhou_t5_followon_projection_receipt)');
   const identity=hash('candidate-identity');
   for(const [id,row,disposition] of [[identity,hash('correct'),'insert'],[identity,hash('bad-row'),'quarantine'],[hash('unrelated-domain'),hash('unrelated'),'insert']]){
    await admin.query(`INSERT INTO receipt_probe(operation_id,target_table,source_identity_sha256,source_row_sha256,disposition,target_id)
     VALUES($1,'hr_employee_profile',$2,$3,$4,$5)`,[base.sourceOperationId,id,row,disposition,randomUUID()]);
   }
   const q=await admin.query(`WITH snap_sources AS (SELECT $5::text source_identity_sha256),
    binding AS (SELECT $1::text tenant_id,$2::text park_id,$3::text operation_id,$4::text parent_operation_id) ${predicate}`,
    [base.tenantId,base.parkId,base.sourceOperationId,base.parentOperationId,identity]);
   assert.equal(q.rowCount,2);assert.ok(q.rows.some(r=>r.disposition==='quarantine'));
   await admin.query('DROP TABLE receipt_probe');
  });
  const captured=JSON.parse(readFileSync(join(captureDir,'origin-unsigned.json'),'utf8'));
  const fixtureDir=join(directory,'synthetic-signed-fixture');mkdirSync(fixtureDir,{mode:0o700});
  const rows=Object.fromEntries(snapshotRelations.map(n=>[n,[]]));
  const sourceIdentity=hash('synthetic-source'),sourceRow=hash('synthetic-row'),ownerIdentity=hash('synthetic-owner');
  const ids=Object.fromEntries(['employee','profile','source','registry','archive','map','batch','follow'].map(n=>[n,randomUUID()]));
  rows.hr_yuzhou_production_import_operation.push({operation_id:base.parentOperationId,status:'succeeded',target_tenant_id:base.tenantId,target_park_id:base.parkId,
   code_sha:triple.codeSha,source_snapshot_sha256:triple.sourceSnapshotHash,mapping_contract_sha256:triple.mappingContractHash,
   sealed_plan_sha256:hash('plan'),target_identity_sha256:hash('target'),target_scope_sha256:hash('scope'),execution_contract_version:2});
  rows.hr_yuzhou_t5_followon_operation.push({operation_id:base.sourceOperationId,parent_operation_id:base.parentOperationId,status:'succeeded',
   binding:{targetScope:{tenantId:base.tenantId,parkId:base.parkId},triple,parent:{sealedPlanSha256:hash('plan')},targetIdentitySha256:hash('target'),targetScopeSha256:hash('scope')}});
  rows.migration_batch.push({id:ids.follow,t5_followon_operation_id:base.sourceOperationId,run_id:base.sourceOperationId,execution_context:'t5_production_followon',status:'succeeded',target_database:origin},
   {id:ids.batch,execution_context:'production_import',production_import_operation_id:base.parentOperationId,production_import_phase:'T0',status:'succeeded',target_database:origin});
  rows.hr_yuzhou_t5_followon_source.push({id:ids.source,operation_id:base.sourceOperationId,tenant_id:base.tenantId,park_id:base.parkId,
   source_domain:'person_core',source_table:'dbo.person.core_residue',source_identity_sha256:sourceIdentity,source_row_sha256:sourceRow,
   owner_status:'mapped',employee_id:ids.employee,owner_record_map_id:ids.map});
  for(const [table,id] of [['hr_yuzhou_t5_followon_source','source'],['hr_legacy_identity_registry','registry'],['hr_legacy_archive_record','archive'],['hr_employee_profile','profile']])
   rows.hr_yuzhou_t5_followon_projection_receipt.push({operation_id:base.sourceOperationId,target_table:table,source_identity_sha256:sourceIdentity,source_row_sha256:sourceRow,disposition:'insert',target_id:ids[id]});
  rows.legacy_record_map.push({id:ids.map,batch_id:ids.batch,source_system:'yuzhou-v10',source_table:'dbo.person',source_pk_canonical:`sha256:${ownerIdentity}`,
   source_identity_sha256:ownerIdentity,source_row_sha256:sourceRow,target_table:'hr_employee',target_id:ids.employee,mapping_status:'loaded',is_active:true});
  rows.hr_yuzhou_production_import_record.push({operation_id:base.parentOperationId,phase:'T0',source_identity_sha256:ownerIdentity,source_row_sha256:sourceRow,
   source_system:'yuzhou-v10',source_table:'dbo.person',source_pk_canonical:`sha256:${ownerIdentity}`,target_table:'hr_employee',target_id:ids.employee,disposition:'insert',rollback_status:'not_started'});
  rows.hr_yuzhou_production_import_phase.push({operation_id:base.parentOperationId,phase:'T0',status:'succeeded'});
  rows.hr_yuzhou_production_import_projection_receipt.push({operation_id:base.parentOperationId,phase:'T0',source_identity_sha256:ownerIdentity,migration_batch_id:ids.batch,legacy_record_map_id:ids.map});
  rows.hr_employee.push({id:ids.employee,tenant_id:base.tenantId,park_id:base.parkId,employee_code:'SYNTHETIC-ONE',full_name:'Synthetic fixture',
   user_id:randomUUID(),employment_type:'full_time',employment_status:'active',is_deleted:false});
  rows.hr_legacy_identity_registry.push({id:ids.registry,tenant_id:base.tenantId,park_id:base.parkId,source_system:'yuzhou-v10',source_table:'dbo.person.core_residue',
   source_identity_sha256:sourceIdentity,source_row_sha256:sourceRow,mapping_status:'mapped',owner_employee_id:ids.employee,owner_record_map_id:ids.map,
   owner_source_system:'yuzhou-v10',owner_source_table:'dbo.person',owner_source_identity_sha256:ownerIdentity});
  rows.hr_legacy_archive_record.push({id:ids.archive,identity_registry_id:ids.registry,tenant_id:base.tenantId,park_id:base.parkId,
   restricted_safe_projection:{legacyFields:{oldaddr:'Synthetic province',edulevel:'Synthetic degree'}}});
  rows.hr_employee_profile.push({id:ids.profile,employee_id:ids.employee,tenant_id:base.tenantId,park_id:base.parkId,is_deleted:false,version:1,
   create_time:'2026-10-03T00:00:00Z',update_time:'2026-10-03T00:00:00Z',source_snapshot:{},native_place:null,degree:'',
   legacy_source_identity_sha256:sourceIdentity,legacy_source_row_sha256:sourceRow,origin_xmin:'42'});
  // Includes an unreceipted active profile and employee: source closure is never reduced to selected fills.
  const otherEmployee=randomUUID();
  rows.hr_employee.push({...rows.hr_employee[0],id:otherEmployee,employee_code:'SYNTHETIC-TWO',user_id:null});
  rows.hr_employee_profile.push({...rows.hr_employee_profile[0],id:randomUUID(),employee_id:otherEmployee,
   legacy_source_identity_sha256:null,legacy_source_row_sha256:null,native_place:'Preserved unrelated'});
  const manifest={...captured,snapshotId:randomUUID(),relations:{}};
  for(const name of snapshotRelations){
   const q=await admin.query(snapshotAggregateSql(`SELECT * FROM jsonb_populate_recordset(NULL::hr_correction_snapshot.${name},$1::jsonb)`),[JSON.stringify(rows[name])]);
   const value=q.rows[0];manifest.relations[name]={count:value.count,sha256:hash(value.rows)};privateFile(join(fixtureDir,`${name}.json`),value.rows);
  }
  const token=signed(manifest);
  async function approve(lab,payload=manifest,originToken=token,seconds=3600){
   await lab.c.query(`INSERT INTO hr_correction_snapshot.prepare_approval(snapshot_id,registry_id,manifest_sha256,expires_at) VALUES($1,$2,$3,now()+($4::int * interval '1 second'))`,
    [payload.snapshotId,lab.registryId,hash(originToken.payload+'\n'+originToken.signature),seconds]);
  }
  await approve(a);
  await subtest('executor cannot self-register trust, unsigned or scope-drift origins fail',async()=>{
   await assert.rejects(reader.query('INSERT INTO hr_correction_snapshot.origin_registry DEFAULT VALUES'),e=>e.code==='42501');
   await assert.rejects(preparePersonnelCorrectionSnapshotLab(a.config,{...token,signature:'A'.repeat(86)+'=='},fixtureDir),/SIGNATURE/);
   await assert.rejects(preparePersonnelCorrectionSnapshotLab(a.config,signed({...manifest,tenantId:'different'}),fixtureDir),/ORIGIN_BINDING/);
   await assert.rejects(preparePersonnelCorrectionSnapshotLab(a.config,signed({...manifest,schemaSha256:hash('drift')}),fixtureDir),/SCHEMA_DRIFT/);
   await assert.rejects(preparePersonnelCorrectionSnapshotLab({...a.config,database:'production'},token,fixtureDir),/LAB_TARGET_REQUIRED/);
  });
  let prepared;
  await subtest('typed immutable snapshot preserves original target DB, full profile and source account evidence',async()=>{
   prepared=await preparePersonnelCorrectionSnapshotLab(a.config,token,fixtureDir);
   assert.equal(prepared.seal.plannedProfiles,1);assert.equal(prepared.seal.nativePlaceFills,1);assert.equal(prepared.seal.degreeFills,0);
   assert.equal((await reader.query('SELECT count(*)::int n FROM public.hr_employee_profile')).rows[0].n,2);
   assert.equal((await reader.query('SELECT count(*)::int n FROM public.hr_yuzhou_t5_followon_operation')).rows[0].n,0);
   const platformAfter=(await reader.query(snapshotAggregateSql('SELECT * FROM public.sys_user'))).rows[0];
   assert.equal(platformAfter.count,platformBaseline.count);assert.equal(hash(platformAfter.rows),hash(platformBaseline.rows));
   assert.equal((await reader.query('SELECT count(*)::int n FROM hr_correction_snapshot.migration_batch WHERE target_database=$1',[origin])).rows[0].n,2);
   assert.equal((await reader.query('SELECT count(*)::int n FROM hr_correction_snapshot.hr_employee WHERE user_id IS NOT NULL')).rows[0].n,1);
   assert.equal((await reader.query('SELECT count(*)::int n FROM public.hr_employee WHERE user_id IS NOT NULL')).rows[0].n,0);
   await assert.rejects(a.c.query('UPDATE hr_correction_snapshot.hr_employee SET user_id=NULL'),/IMMUTABLE/);
   await assert.rejects(a.c.query('TRUNCATE hr_correction_snapshot.hr_employee'),/IMMUTABLE/);
   await assert.rejects(reader.query('INSERT INTO hr_correction_snapshot.hr_employee DEFAULT VALUES'),/STAGING_CLOSED/);
  });
  function authorization(binding,action='apply',config=a.config){
   const {host,port,database,user,labId}=config;
   return signed({version:1,purpose:'ISOLATED_PERSONNEL_CORRECTION',action,nonce:randomUUID(),actorSha256:hash('synthetic-reviewer'),
    issuedAt:Date.now()-1000,expiresAt:Date.now()+600000,target:{host,port,database,user,labId},binding});
  }
  const b={...base,operationId:randomUUID(),idempotencyKey:randomUUID(),executionSha256:correctionExecutionSha256(),snapshot:prepared.snapshot,seal:prepared.seal};
  await subtest('apply, exact replay, SQL NULL preservation and rollback use real profile schema',async()=>{
   const auth=authorization(b);assert.equal((await executePersonnelCorrectionLab(a.config,auth)).replay,false);
   assert.equal((await executePersonnelCorrectionLab(a.config,auth)).replay,true);
   assert.equal((await reader.query('SELECT degree FROM public.hr_employee_profile WHERE id=$1',[ids.profile])).rows[0].degree,'');
   const rollback=authorization(b,'rollback');assert.equal((await executePersonnelCorrectionLab(a.config,rollback)).replay,false);
   assert.equal((await executePersonnelCorrectionLab(a.config,rollback)).replay,true);
   assert.equal((await reader.query('SELECT native_place FROM public.hr_employee_profile WHERE id=$1',[ids.profile])).rows[0].native_place,null);
  });
  await subtest('scope/hash/source drift rejected and unrelated modern edit blocks rollback',async()=>{
   const fresh={...b,operationId:randomUUID(),idempotencyKey:randomUUID()};
   await assert.rejects(executePersonnelCorrectionLab(a.config,authorization({...fresh,parkId:'other'})),/SCOPE_DRIFT/);
   await assert.rejects(executePersonnelCorrectionLab(a.config,authorization({...fresh,snapshot:{...b.snapshot,manifestSha256:hash('different')}})),/MANIFEST_HASH/);
   await executePersonnelCorrectionLab(a.config,authorization(fresh));
   await reader.query('UPDATE public.hr_employee_profile SET remark=$1 WHERE id=$2',['synthetic modern edit',ids.profile]);
   await assert.rejects(executePersonnelCorrectionLab(a.config,authorization(fresh,'rollback')),/ROW_COUNT_CONFLICT/);
  });
  await subtest('second independent lab rejects filtered artifact atomically and approval expiry after prepare',async()=>{
   const second=await lab(a.registryId);await approve(second,manifest,token,5);
   const name='hr_employee_profile',path=join(fixtureDir,`${name}.json`),original=readFileSync(path,'utf8');
   writeFileSync(path,'[]',{mode:0o600});
   await assert.rejects(preparePersonnelCorrectionSnapshotLab(second.config,token,fixtureDir),/ARTIFACT_HASH/);
   assert.equal((await second.c.query('SELECT count(*)::int n FROM hr_correction_snapshot.manifest')).rows[0].n,0);
   assert.equal((await second.c.query('SELECT count(*)::int n FROM public.hr_employee_profile')).rows[0].n,0);
   writeFileSync(path,original,{mode:0o600});
   const secondPrepared=await preparePersonnelCorrectionSnapshotLab(second.config,token,fixtureDir);
   assert.deepEqual(secondPrepared.seal,prepared.seal);
   await delay(5100);
   await assert.rejects(executePersonnelCorrectionLab(second.config,authorization(b,'apply',second.config)),/PREPARE_APPROVAL/);
  });
  await subtest('all ambiguity candidates retained; independently signed ambiguous source still refuses apply',async()=>{
   const ambiguous=await lab(a.registryId),dir=join(directory,'ambiguous-synthetic');mkdirSync(dir,{mode:0o700});
   const p={...manifest,snapshotId:randomUUID(),relations:{...manifest.relations}};
   for(const name of snapshotRelations){
    let text=readFileSync(join(fixtureDir,`${name}.json`),'utf8');
    if(name==='hr_yuzhou_t5_followon_source'){
     const data=JSON.parse(text);data.push({...data[0],id:randomUUID()});
     text=(await admin.query(snapshotAggregateSql(`SELECT * FROM jsonb_populate_recordset(NULL::hr_correction_snapshot.${name},$1::jsonb)`),[JSON.stringify(data)])).rows[0].rows;
     p.relations[name]={count:2,sha256:hash(text)};
    }
    privateFile(join(dir,`${name}.json`),text);
   }
   const tok=signed(p);await approve(ambiguous,p,tok);
   const prep=await preparePersonnelCorrectionSnapshotLab(ambiguous.config,tok,dir);
   assert.equal(prep.relations.hr_yuzhou_t5_followon_source.count,2);
   const bad={...b,operationId:randomUUID(),idempotencyKey:randomUUID(),snapshot:prep.snapshot,seal:prep.seal};
   await assert.rejects(executePersonnelCorrectionLab(ambiguous.config,authorization(bad,'apply',ambiguous.config)),/SOURCE_CARDINALITY_CONFLICT/);
   assert.equal((await ambiguous.c.query('SELECT count(*)::int n FROM public.hr_personnel_correction_operation')).rows[0].n,0);
  });
  await subtest('real nonempty full-schema profile capture keeps all scoped unreceipted profiles',async()=>{
   // These are explicitly synthetic original-table rows in the disposable origin,
   // not copied receipt success or a genuine retained-source import.
   for(const e of rows.hr_employee)await admin.query(`INSERT INTO public.hr_employee(id,tenant_id,park_id,employee_code,full_name,employment_type,employment_status,is_deleted)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[e.id,e.tenant_id,e.park_id,e.employee_code,e.full_name,e.employment_type,e.employment_status,e.is_deleted]);
   const fields=snapshotColumns.hr_employee_profile.split(' ');
   // Fields are the fixed typed schema fixture, not supplied by a user.
   await admin.query(`INSERT INTO public.hr_employee_profile(${fields.join(',')}) SELECT ${fields.join(',')}
    FROM jsonb_populate_recordset(NULL::public.hr_employee_profile,$1::jsonb)`,[readFileSync(join(fixtureDir,'hr_employee_profile.json'),'utf8')]);
   const capturedNonempty=await capturePersonnelCorrectionSnapshot({registryClient:reader,sourceClient:admin,registryId:a.registryId,directory:join(directory,'nonempty-synthetic-source')});
   assert.equal(capturedNonempty.relations.hr_employee_profile.count,2);
   assert.equal(capturedNonempty.relations.hr_employee.count,2);
   assert.equal(capturedNonempty.relations.hr_yuzhou_t5_followon_projection_receipt.count,0);
  });
  await subtest('schema and privileged source tampering rejected on every use',async()=>{
   await a.c.query('ALTER TABLE public.hr_employee_profile ADD COLUMN synthetic_schema_drift text');
   await assert.rejects(executePersonnelCorrectionLab(a.config,authorization(b)),/SCHEMA_CONTRACT|SCHEMA_DRIFT/);
   await a.c.query('ALTER TABLE public.hr_employee_profile DROP COLUMN synthetic_schema_drift');
   // Deliberate privileged fault injection only in this disposable synthetic lab.
   await a.c.query(`ALTER TABLE hr_correction_snapshot.hr_yuzhou_t5_followon_source DISABLE TRIGGER immutable_snapshot;
    UPDATE hr_correction_snapshot.hr_yuzhou_t5_followon_source SET source_row_sha256=repeat('d',64);
    ALTER TABLE hr_correction_snapshot.hr_yuzhou_t5_followon_source ENABLE TRIGGER immutable_snapshot`);
   await assert.rejects(executePersonnelCorrectionLab(a.config,authorization(b)),/RELATION_HASH/);
  });
  assert.equal(result.failedCases||0,0,'all focused cases must pass');
  result.status='PASS';
 }catch(error){result.status='FAIL';throw error;}finally{
  for(const c of [reader,...clients,admin])if(c)await c.end().catch(()=>{});
  if(started){
   const logs=await docker(['logs','--no-color','postgres']).catch(()=> 'PRIVATE_SQL_LOG_UNAVAILABLE');
   privateFile(join(directory,'postgres-private.log'),logs);
   await docker(['down','--volumes']);
  }
  const residual={};for(const [kind,args] of [['containers',['ps','-aq']],['networks',['network','ls','-q']],['volumes',['volume','ls','-q']]]){
   const output=(await run('docker',[...args,'--filter',`label=com.docker.compose.project=${project}`])).stdout.trim();residual[kind]=output?output.split('\n').length:0;
  }
  result.residual=residual;privateFile(join(directory,'result.json'),JSON.stringify(result,null,2)+'\n');
  assert.deepEqual(residual,{containers:0,networks:0,volumes:0});
 }
});
