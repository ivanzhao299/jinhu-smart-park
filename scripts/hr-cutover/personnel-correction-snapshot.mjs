import { Buffer } from 'node:buffer';
import { URL } from 'node:url';
import { createHash,createPublicKey,verify,randomUUID } from 'node:crypto';
import { readFileSync,writeFileSync,mkdirSync,lstatSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { snapshotColumns,snapshotRelations,snapshotCaptureQueries,snapshotAggregateSql,snapshotSchemaSql } from './personnel-correction-snapshot-contract.mjs';
import { validateCorrectionLabTarget,correctionAuthoritySha256,correctionExecutionSha256 } from './personnel-correction-lab.mjs';
import { snapshotCorrectionCtes,sealSelect,profileBeforeSelect } from './personnel-correction-sql.mjs';
const fail = code => { throw new Error(`PERSONNEL_CORRECTION_SNAPSHOT_${code}`); };
const tripleEqual=(a,b)=>exact(a,'codeSha sourceSnapshotHash mappingContractHash') && exact(b,'codeSha sourceSnapshotHash mappingContractHash') && Object.keys(a).every(k=>a[k]===b[k]);
const hash = value => createHash('sha256').update(value).digest('hex');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const exact = (v, names) => v && typeof v==='object' && !Array.isArray(v) && Object.keys(v).sort().join(' ' )===names.split(' ').sort().join(' ');
export function snapshotContractSha256() {
 return hash(['personnel-correction-snapshot.mjs','personnel-correction-snapshot-contract.mjs','personnel-correction-sql.mjs',
  '../diagnose-yuzhou-personnel-alias.mjs','../../database/migrations/000325_hr_personnel_correction_snapshot.sql','../../database/migrations/000328_hr_personnel_correction_profile_cas.sql']
  .map(p=>readFileSync(new URL(p,import.meta.url))).reduce((a,b)=>Buffer.concat([a,b]),Buffer.alloc(0)));
}
function safeError(error) {
 if (/^PERSONNEL_CORRECTION_[A-Z_]+$/.test(error.message)) return new Error(error.message);
 return new Error(/^[A-Z0-9]{5}$/.test(error.code||'')
  ? `PERSONNEL_CORRECTION_SNAPSHOT_DATABASE_SQLSTATE_${error.code}` : 'PERSONNEL_CORRECTION_SNAPSHOT_DATABASE_OR_ARTIFACT_FAILURE');
}
async function schema(client) {
 const rows=(await client.query(snapshotSchemaSql,[snapshotRelations])).rows;
 for (const name of snapshotRelations) {
  const actual=rows.filter(r=>r.relname===name).map(r=>r.attname);
  const required=snapshotColumns[name].split(' ');
  if (required.some(c=>!actual.includes(c)) || (['hr_employee_profile','hr_employee'].includes(name) && actual.length!==required.length)) fail('SCHEMA_CONTRACT');
 }
 return hash(JSON.stringify(rows));
}
async function registry(client,id) {
 if (!uuid.test(id)) fail('REGISTRY_REQUIRED');
 const r=await client.query(`SELECT r.*,l.database_name,l.database_user,l.authority_key_sha256
  FROM hr_correction_snapshot.origin_registry r JOIN public.hr_personnel_correction_lab l USING(lab_id)
  WHERE r.registry_id=$1 AND l.database_name=current_database() AND r.expires_at>clock_timestamp()`,[id]);
 if (r.rowCount!==1 || r.rows[0].contract_sha256!==snapshotContractSha256()) fail('REGISTRY_REQUIRED');
 return r.rows[0];
}
function checkOrigin(payload,r) {
 if (!exact(payload,'version purpose snapshotId registryId originDatabase originIdentitySha256 migrationHistorySha256 tenantId parkId sourceOperationId parentOperationId triple contractSha256 schemaSha256 capturedAt transactionSnapshot relations')
  || payload.version!==1 || payload.purpose!=='PERSONNEL_CORRECTION_SOURCE_SNAPSHOT' || !uuid.test(payload.snapshotId)
  || payload.registryId!==r.registry_id || payload.originDatabase!==r.origin_database
  || payload.originIdentitySha256!==r.origin_identity_sha256 || payload.migrationHistorySha256!==r.migration_history_sha256
  || payload.tenantId!==r.tenant_id || payload.parkId!==r.park_id
  || payload.sourceOperationId!==r.source_operation_id || payload.parentOperationId!==r.parent_operation_id
  || !tripleEqual(payload.triple,r.triple)
  || payload.contractSha256!==snapshotContractSha256()
  || !/^[0-9a-f]{64}$/.test(payload.schemaSha256) || !Number.isSafeInteger(payload.capturedAt)
  || payload.capturedAt>Date.now() || typeof payload.transactionSnapshot!=='string'
  || !exact(payload.relations,snapshotRelations.join(' '))) fail('ORIGIN_BINDING');
 for (const rel of Object.values(payload.relations)) {
  if (!exact(rel,'count sha256') || !Number.isSafeInteger(rel.count) || rel.count<0 || rel.count>100000
   || !/^[0-9a-f]{64}$/.test(rel.sha256)) fail('RELATION_CONTRACT');
 }
}
function signedOrigin(token,r) {
 try {
  if (!exact(token,'payload signature') || typeof token.payload!=='string' || token.payload.length>32768
   || typeof token.signature!=='string' || !/^[A-Za-z0-9+/]{86}==$/.test(token.signature)
   || createPublicKey(r.authority_public_key).asymmetricKeyType!=='ed25519'
   || !verify(null,Buffer.from(token.payload),r.authority_public_key,Buffer.from(token.signature,'base64'))) fail('SIGNATURE');
  const payload=JSON.parse(token.payload); checkOrigin(payload,r); return payload;
 } catch(error) { throw safeError(error); }
}
async function aggregate(client,query,params=[]) {
 const a=(await client.query(snapshotAggregateSql(query),params)).rows[0];
 if(a.count>100000 || Buffer.byteLength(a.rows)>64*1024*1024) fail('RELATION_LIMIT');
 return { rows:a.rows,count:a.count,sha256:hash(a.rows) };
}
function artifactFile(directory,name) {
 const root=lstatSync(directory);
 const file=join(directory,name),stat=lstatSync(file);
 if (!root.isDirectory() || root.isSymbolicLink() || (root.mode&0o777)!==0o700
  || !stat.isFile() || stat.isSymbolicLink() || (stat.mode&0o777)!==0o600 || stat.nlink!==1 || stat.size>64*1024*1024) fail('PRIVATE_ARTIFACT_REQUIRED');
 return readFileSync(file,'utf8');
}
function save(directory,name,value) {writeFileSync(join(directory,name),value,{mode:0o600,flag:'wx'});}
// Capture never opens a connection or signs an origin. The caller supplies two
// established sessions; origin identity is obtained ONLY from the trusted lab registry.
// The source session must be idle. All source queries are fixed, scoped and READ ONLY.
export async function capturePersonnelCorrectionSnapshot({registryClient,sourceClient,registryId,directory}) {
 let begun=false;
 try {
  const r=await registry(registryClient,registryId);
  if(typeof sourceClient.on!=='function' || typeof sourceClient.removeListener!=='function') fail('SOURCE_SESSION_CLIENT');
  let nested=false;
  const notice=n=>{if(n.code==='25001') nested=true;};
  sourceClient.on('notice',notice);
  try{await sourceClient.query('BEGIN');}finally{sourceClient.removeListener('notice',notice);}
  if(nested) fail('SOURCE_SESSION_NOT_IDLE'); // We do not own or roll back the caller's transaction.
  begun=true;
  await sourceClient.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await sourceClient.query("SET LOCAL search_path=pg_catalog,public; SET LOCAL statement_timeout='30s'; SET LOCAL lock_timeout='5s'; SET LOCAL timezone='UTC'");
  const identity=(await sourceClient.query("SELECT current_database() database,current_setting('transaction_read_only') readonly,current_setting('transaction_isolation') isolation,pg_current_snapshot()::text snapshot")).rows[0];
  if(identity.database!==r.origin_database) fail('ORIGIN_DATABASE');
  if(identity.readonly!=='on' || identity.isolation!=='repeatable read') fail('ORIGIN_TRANSACTION');
  const origin=await originIdentity(sourceClient);
  if(origin.identitySha256!==r.origin_identity_sha256 || origin.historySha256!==r.migration_history_sha256) fail('ORIGIN_IDENTITY');
  const manifest={version:1,purpose:'PERSONNEL_CORRECTION_SOURCE_SNAPSHOT',snapshotId:randomUUID(),registryId,
   originDatabase:r.origin_database,originIdentitySha256:origin.identitySha256,migrationHistorySha256:origin.historySha256,tenantId:r.tenant_id,parkId:r.park_id,sourceOperationId:r.source_operation_id,
   parentOperationId:r.parent_operation_id,triple:r.triple,contractSha256:snapshotContractSha256(),schemaSha256:await schema(sourceClient),
   capturedAt:Date.now(),transactionSnapshot:identity.snapshot,relations:{}};
  mkdirSync(directory,{mode:0o700});
  for(const name of snapshotRelations) {
   const a=await aggregate(sourceClient,snapshotCaptureQueries[name],[r.tenant_id,r.park_id,r.source_operation_id,r.parent_operation_id]);
   manifest.relations[name]={count:a.count,sha256:a.sha256};save(directory,`${name}.json`,a.rows);
  }
  checkOrigin(manifest,r);
  await sourceClient.query('COMMIT');begun=false;
  save(directory,'origin-unsigned.json',JSON.stringify(manifest));
  return {status:'CAPTURED_UNSIGNED',productionImport:'HOLD',snapshotId:manifest.snapshotId,
   contractSha256:manifest.contractSha256,schemaSha256:manifest.schemaSha256,relations:manifest.relations};
 } catch(error) { if(begun) await sourceClient.query('ROLLBACK').catch(()=>{});throw safeError(error); }
}
async function connect(config) {
 validateCorrectionLabTarget(config); // before dependency loading or connection
 const require=createRequire(new URL('../../apps/api/package.json',import.meta.url));
 const {Client}=require('pg');
 const c=new Client({host:config.host,port:config.port,database:config.database,user:config.user,password:config.password,
  ssl:false,connectionTimeoutMillis:5000,application_name:'isolated-personnel-snapshot'});
 await c.connect();return c;
}
async function executorGate(client,config,r) {
 if(r.lab_id!==config.labId || r.database_name!==config.database || r.database_user!==config.user
  || r.authority_key_sha256!==correctionAuthoritySha256(config.authorityPublicKey)) fail('LAB_REGISTRATION');
 const role=(await client.query(`SELECT rolsuper,rolcreaterole,rolcreatedb,
  EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='hr_correction_snapshot' AND pg_has_role(current_user,c.relowner,'MEMBER')) owns_snapshot
  FROM pg_roles WHERE rolname=current_user`)).rows[0];
 if(!role || role.rolsuper || role.rolcreaterole || role.rolcreatedb || role.owns_snapshot) fail('UNPRIVILEGED_EXECUTOR_REQUIRED');
}
// Recheck immutable evidence on every use, including replay and rollback. The
// returned origin_database is trusted registry data, never taken from a token.
export async function verifyPersonnelCorrectionSnapshot(client,config,binding) {
 await client.query("SET LOCAL timezone='UTC'");
 const b=binding.snapshot;
 if(!exact(b,'snapshotId manifestSha256') || !uuid.test(b.snapshotId) || !/^[0-9a-f]{64}$/.test(b.manifestSha256)) fail('BINDING');
 const stored=await client.query('SELECT payload,signature FROM hr_correction_snapshot.manifest WHERE snapshot_id=$1',[b.snapshotId]);
 if(stored.rowCount!==1) fail('PREPARE_REQUIRED');
 const token=stored.rows[0];
 if(hash(token.payload+'\n'+token.signature)!==b.manifestSha256) fail('MANIFEST_HASH');
 let parsed;try{parsed=JSON.parse(token.payload);}catch{fail('MANIFEST_INVALID');}
 const r=await registry(client,parsed.registryId);await executorGate(client,config,r);
 const p=signedOrigin(token,r);
 const approved=await client.query(`SELECT 1 FROM hr_correction_snapshot.prepare_approval WHERE snapshot_id=$1 AND registry_id=$2
  AND manifest_sha256=$3 AND expires_at>clock_timestamp()`,[b.snapshotId,p.registryId,b.manifestSha256]);
 if(approved.rowCount!==1) fail('PREPARE_APPROVAL');
 if(p.snapshotId!==b.snapshotId || binding.tenantId!==p.tenantId || binding.parkId!==p.parkId
  || binding.sourceOperationId!==p.sourceOperationId || binding.parentOperationId!==p.parentOperationId
  || !tripleEqual(binding.triple,p.triple)) fail('SCOPE_DRIFT');
 if(await schema(client)!==p.schemaSha256) fail('SCHEMA_DRIFT');
 for(const name of snapshotRelations) {
  const a=await aggregate(client,`SELECT * FROM hr_correction_snapshot.${name}`);
  if(a.count!==p.relations[name].count || a.sha256!==p.relations[name].sha256) fail('RELATION_HASH');
 }
 return {originDatabase:r.origin_database,manifest:p};
}
// One exact, independently approved manifest per new lab. No trust registration,
// CREATE ROLE, grants, import controls, arbitrary relation mapping or production CLI.
export async function preparePersonnelCorrectionSnapshotLab(config,token,directory) {
 let client,begun=false;
 try {
  validateCorrectionLabTarget(config);
  let parsed;try{parsed=JSON.parse(token.payload);}catch{fail('MANIFEST_INVALID');}
  client=await connect(config);
  await client.query('BEGIN');begun=true;
  await client.query("SET LOCAL search_path=pg_catalog,public; SET LOCAL timezone='UTC'; SET LOCAL statement_timeout='30s'; SET LOCAL lock_timeout='5s'");
  await client.query('SELECT pg_advisory_xact_lock(734192,324)');
  const r=await registry(client,parsed.registryId);await executorGate(client,config,r);
  const p=signedOrigin(token,r),manifestSha256=hash(token.payload+'\n'+token.signature);
  if(await schema(client)!==p.schemaSha256) fail('SCHEMA_DRIFT');
  const approved=await client.query(`SELECT 1 FROM hr_correction_snapshot.prepare_approval WHERE snapshot_id=$1 AND registry_id=$2
   AND manifest_sha256=$3 AND expires_at>clock_timestamp()`,[p.snapshotId,p.registryId,manifestSha256]);
  if(approved.rowCount!==1) fail('PREPARE_APPROVAL');
  await client.query('LOCK TABLE public.hr_employee,public.hr_employee_profile IN SHARE ROW EXCLUSIVE MODE');
  const empty=(await client.query(`SELECT (SELECT count(*) FROM public.hr_employee)+(SELECT count(*) FROM public.hr_employee_profile)
   +(SELECT count(*) FROM hr_correction_snapshot.manifest) n`)).rows[0];
  if(Number(empty.n)!==0) fail('EMPTY_TARGET_REQUIRED');
  await client.query('INSERT INTO hr_correction_snapshot.manifest(snapshot_id,payload,signature) VALUES($1,$2,$3)',[p.snapshotId,token.payload,token.signature]);
  for(const name of snapshotRelations) {
   const rows=artifactFile(directory,`${name}.json`);
   if(hash(rows)!==p.relations[name].sha256) fail('ARTIFACT_HASH');
   // PostgreSQL performs type conversion; invalid/extra/missing keys are rejected by exact round-trip hashing below.
   await client.query(`INSERT INTO hr_correction_snapshot.${name} SELECT * FROM jsonb_populate_recordset(NULL::hr_correction_snapshot.${name},$1::jsonb)`,[rows]);
  }
  const binding={tenantId:p.tenantId,parkId:p.parkId,sourceOperationId:p.sourceOperationId,parentOperationId:p.parentOperationId,triple:p.triple,
   snapshot:{snapshotId:p.snapshotId,manifestSha256}};
  await verifyPersonnelCorrectionSnapshot(client,config,binding);
  // Carrier only. Original platform links/status and every source employee value
  // remain immutable above; correction SQL never joins these carrier rows as source.
  await client.query(`INSERT INTO public.hr_employee(id,tenant_id,park_id,employee_code,full_name,employment_type,employment_status,is_deleted)
   SELECT id,tenant_id,park_id,employee_code,full_name,employment_type,employment_status,is_deleted FROM hr_correction_snapshot.hr_employee`);
  const columns=snapshotColumns.hr_employee_profile.split(' ').join(',');
  await client.query(`INSERT INTO public.hr_employee_profile(${columns}) SELECT ${columns} FROM hr_correction_snapshot.hr_employee_profile`);
  const same=await client.query(`SELECT count(*)::int n FROM public.hr_employee_profile p JOIN hr_correction_snapshot.hr_employee_profile s ON p.id=s.id
   WHERE to_jsonb(p)=to_jsonb(s)-'origin_xmin'`);
  if(same.rows[0].n!==p.relations.hr_employee_profile.count) fail('PROFILE_BEFORE_DRIFT');
  const params=[p.tenantId,p.parkId,p.sourceOperationId,p.parentOperationId,r.origin_database];
  const seal=(await client.query(`${snapshotCorrectionCtes} ${sealSelect}`,params)).rows[0].seal;
  const profileBeforeSha256=(await client.query(`${snapshotCorrectionCtes} ${profileBeforeSelect}`,params)).rows[0].hash;
  const descriptor={version:1,purpose:'REVIEW_PERSONNEL_CORRECTION_SNAPSHOT_LAB',productionImport:'HOLD',
   target:{host:config.host,port:config.port,database:config.database,user:config.user,labId:config.labId},
   binding:{...binding,executionSha256:correctionExecutionSha256(),profileBeforeSha256,seal},relations:p.relations};
  // A descriptor is only review material. Existing independent apply/rollback
  // authorization remains mandatory, with fresh operation/idempotency/nonce IDs.
  save(directory,`lab-review-${config.labId}.json`,JSON.stringify(descriptor,null,2)+'\n');
  await assertPersonnelCorrectionSnapshotApproval(client,binding.snapshot);
  await client.query('COMMIT');begun=false;
  return {status:'PREPARED',productionImport:'HOLD',snapshot:binding.snapshot,seal,profileBeforeSha256,relations:p.relations};
 } catch(error) {if(begun) await client.query('ROLLBACK').catch(()=>{});throw safeError(error);}
 finally {if(client) await client.end().catch(()=>{});}
}

// Requires the operator's pre-existing read privilege for pg_control_system.
// Emits digests only; no host, system identifier or database OID is exported.
export async function originIdentity(client) {
 const identity=(await client.query(`SELECT encode(digest(convert_to(jsonb_build_object('system',s.system_identifier::text,
  'databaseOid',d.oid::text,'database',d.datname)::text,'UTF8'),'sha256'),'hex') hash
  FROM pg_control_system() s CROSS JOIN pg_database d WHERE d.datname=current_database()`)).rows[0];
 const history=(await client.query(`SELECT count(*)::int n,count(*) FILTER(WHERE status<>'succeeded')::int bad,
  encode(digest(convert_to(COALESCE(jsonb_agg(jsonb_build_object('filename',filename,'checksum',checksum,'status',status)
  ORDER BY filename COLLATE "C"),'[]'::jsonb)::text,'UTF8'),'sha256'),'hex') hash FROM public.sys_schema_migration_history`)).rows[0];
 if(!identity || history.n<1 || history.bad!==0) fail('MIGRATION_HISTORY');
 return {identitySha256:identity.hash,historySha256:history.hash};
}

// Offline descriptor generation does not create a database, register trust or
// read an environment/credential file. Operator-owned credentials are explicit.
export function createPersonnelCorrectionSnapshotLabDescriptor({directory,port,user,password,authorityPublicKey}) {
 const config={host:'127.0.0.1',port,database:`jinhu_hr_correction_lab_${randomUUID().replaceAll('-','').slice(0,24)}`,
  user,password,labId:randomUUID(),authorityPublicKey};
 validateCorrectionLabTarget(config);correctionAuthoritySha256(authorityPublicKey);
 mkdirSync(directory,{mode:0o700});
 save(directory,'lab-config.json',JSON.stringify(config,null,2)+'\n');
 save(directory,'resource-intent.json',JSON.stringify({version:1,status:'DESCRIPTOR_ONLY_NOT_PROVISIONED',productionImport:'HOLD',
  target:{host:config.host,port:config.port,database:config.database,user:config.user,labId:config.labId},
  contractSha256:snapshotContractSha256()},null,2)+'\n');
 return {status:'DESCRIPTOR_ONLY_NOT_PROVISIONED',productionImport:'HOLD',database:config.database,labId:config.labId};
}
export function readPersonnelCorrectionSnapshotLabDescriptor(directory) {
 let config;try{config=JSON.parse(artifactFile(directory,'lab-config.json'));}catch(error){throw safeError(error);}
 validateCorrectionLabTarget(config);correctionAuthoritySha256(config.authorityPublicKey);return config;
}

// Recheck the clock after waiting for target locks and again at commit. Immutable
// source hashes need not be recomputed solely because the clock advanced.
export async function assertPersonnelCorrectionSnapshotApproval(client,snapshot) {
 const checked=await client.query(`SELECT 1 FROM hr_correction_snapshot.prepare_approval a
  JOIN hr_correction_snapshot.origin_registry r USING(registry_id)
  JOIN hr_correction_snapshot.manifest m USING(snapshot_id)
  WHERE a.snapshot_id=$1 AND a.manifest_sha256=$2 AND a.expires_at>clock_timestamp() AND r.expires_at>clock_timestamp()`,
  [snapshot.snapshotId,snapshot.manifestSha256]);
 if(checked.rowCount!==1) fail('PREPARE_APPROVAL');
}
