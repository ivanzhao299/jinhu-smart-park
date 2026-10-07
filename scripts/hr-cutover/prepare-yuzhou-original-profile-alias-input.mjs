#!/usr/bin/env node
/** Private preparation only: existing sealed T5 source -> existing ordered builder.
 * The API remains the sole business writer. No SQL Server extraction or DB writes. */
import process from 'node:process';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, lstatSync, realpathSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { dirname, resolve, isAbsolute } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { originalProfileAliasInputSql, originalProfileAliasObservationSql, originalProfileAliasRowsSql, validatePersonnelAliasObservation } from '../diagnose-yuzhou-personnel-alias.mjs';
import { observeProductionRuntimeRevision } from '../diagnose-production-runtime-revision.mjs';
import { verifyProfileSource, canonicalProfile } from './yuzhou-profile-incremental-projection.mjs';
import { YUZHOU_REUSABLE_INCREMENTAL_RECIPE_SHA256 } from './build-yuzhou-reusable-incremental-package.mjs';
import { buildYuzhouProfileAliasBatch, materializeYuzhouProfileAliasBatch } from './build-yuzhou-profile-alias-batch.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const plain = value => value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
const fail = code => { throw new Error(`YUZHOU_PROFILE_ALIAS_SOURCE_${code}`); };
const exact = (value, keys) => { if (!plain(value) || Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) fail('SCHEMA_INVALID'); };
export const YUZHOU_ORIGINAL_PROFILE_ALIAS_INPUT_CODE_SHA256 = sha(readFileSync(fileURLToPath(import.meta.url)));
const CODE_SHA256 = YUZHOU_ORIGINAL_PROFILE_ALIAS_INPUT_CODE_SHA256;
export { originalProfileAliasInputSql, originalProfileAliasObservationSql, originalProfileAliasRowsSql };
const contract = JSON.parse(readFileSync(new URL('./contracts/legacy-personnel-alias-backfill-v1.json',import.meta.url)));
const scope = Object.freeze({tenantId:'10000001',parkId:'20000001'});
export function validateOriginalProfileAliasExpected(expected) {
  exact(expected,['sourceSetSha256','profileCount','aliasProfiles','nativePlaceFills','degreeFills','planSha256','beforeSha256']);
  for (const key of ['sourceSetSha256','planSha256','beforeSha256']) if (!/^[a-f0-9]{64}$/u.test(expected[key] ?? '')) fail('EXPECTED_INVALID');
  for (const key of ['profileCount','aliasProfiles','nativePlaceFills','degreeFills']) if (!Number.isSafeInteger(expected[key]) || expected[key] < 0) fail('EXPECTED_INVALID');
  if (expected.profileCount < 1 || expected.aliasProfiles < 1 || expected.aliasProfiles > expected.profileCount) fail('EXPECTED_INVALID');
  return expected;
}

/** Only accepts an already decrypted private envelope. Raw source authentication
 * reuses the fixed retained decoder; hashes/employee bindings are never repaired. */
export function assembleOriginalProfileAliasInput(envelope, expected, extractedAt) {
  validateOriginalProfileAliasExpected(expected);
  exact(envelope,['observation','operations','rows','sourceLedger']);
  const observed = validatePersonnelAliasObservation(envelope.observation);
  if (observed.originalBaselineSetStatus !== 'OBSERVED_INTACT_FOR_API_RECHECK'
    || observed.correctionPlanStatus !== 'MATCHED_SUBSET_FOR_REVIEW'
    || observed.sourceSetSha256 !== expected.sourceSetSha256 || observed.profileMatchedCount !== expected.profileCount
    || observed.correctionPlan.plannedProfiles !== expected.aliasProfiles || observed.correctionPlan.nativePlaceFills !== expected.nativePlaceFills
    || observed.correctionPlan.degreeFills !== expected.degreeFills || observed.correctionPlan.planSha256 !== expected.planSha256
    || observed.correctionPlan.beforeSha256 !== expected.beforeSha256) fail('OBSERVATION_DRIFT');
  if (!Array.isArray(envelope.sourceLedger) || envelope.sourceLedger.length !== observed.sourceRecords) fail('SOURCE_LEDGER_INVALID');
  const sourceLedger=new Map();
  for (const entry of envelope.sourceLedger) {
    exact(entry,['sourceIdentitySha256','sourceRowSha256']);
    if (![entry.sourceIdentitySha256,entry.sourceRowSha256].every(value=>typeof value==='string' && /^[a-f0-9]{64}$/u.test(value))
      || sourceLedger.has(entry.sourceIdentitySha256)) fail('SOURCE_LEDGER_INVALID');
    sourceLedger.set(entry.sourceIdentitySha256,entry.sourceRowSha256);
  }
  // PostgreSQL interprets the observer's escape-string separator as a newline.
  if (sha([...sourceLedger.entries()].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([id,row])=>`${id}:${row}`).join('\n'))
    !== expected.sourceSetSha256) fail('SOURCE_LEDGER_DRIFT');
  if (!Array.isArray(envelope.operations) || envelope.operations.length !== 1 || !Array.isArray(envelope.rows)
    || envelope.rows.length !== expected.profileCount) fail('SET_INVALID');
  const op = envelope.operations[0];exact(op,['operationId','bindingSha256','binding']);
  const b = op.binding;
  if (!plain(b) || sha(canonicalProfile(b)) !== op.bindingSha256 || b.operationId !== op.operationId
    || !/^yzprod-import-\d{8}T\d{6}Z-[a-f0-9]{12}$/u.test(op.operationId)
    || b.intent !== 'APPEND_T5_FULL_HISTORY_ONCE' || !plain(b.targetScope)
    || Object.keys(b.targetScope).sort().join(',') !== 'parkId,scopeSha256,tenantId'
    || b.targetScope.tenantId !== scope.tenantId || b.targetScope.parkId !== scope.parkId
    || !/^[a-f0-9]{64}$/u.test(b.targetScopeSha256 ?? '') || b.targetScope.scopeSha256 !== b.targetScopeSha256
    || b.executionCodeSha !== '7c3df1c230bde74badbf414acae36030d5fe8709'
    || b.sourceMappingContractSha256 !== 'd44b0f904fb3240d45a52b8dc8a3510ce5622ecb6f7f41356fbe6e48fa53b7e0'
    || !plain(b.triple) || !/^[a-f0-9]{64}$/u.test(b.triple.sourceSnapshotHash ?? '')) fail('OPERATION_INVALID');
  const profileRecords=[], employeeIndex=[], employees=[], profiles=[], sourceRecords=[], beforeImages=[];
  const seen = new Set();
  for (const row of envelope.rows) {
    exact(row,['sourceIdentitySha256','sourceRowSha256','source','employeeId','employeeSourceIdentitySha256','profileId','nativePlace','degree','profileVersion']);
    if (sourceLedger.get(row.sourceIdentitySha256)!==row.sourceRowSha256) fail('ROW_SOURCE_RECEIPT_MISMATCH');
    const raw = verifyProfileSource({sourceTable:'dbo.person.core_residue',sourceKey:String(row.source?.id),
      sourceIdentitySha256:row.sourceIdentitySha256,sourceRowSha256:row.sourceRowSha256,source:row.source});
    if (seen.has(raw.sourceIdentitySha256) || sha(`dbo.person\0${raw.source.person.trim()}`) !== row.employeeSourceIdentitySha256
      || !Number.isSafeInteger(row.profileVersion) || row.profileVersion < 1) fail('ROW_BINDING_INVALID');
    seen.add(raw.sourceIdentitySha256);
    profileRecords.push(raw);
    employeeIndex.push({employeeCode:raw.source.person.trim(),sourceTable:'dbo.person',sourceKey:raw.source.person.trim()});
    employees.push({id:row.employeeId,...scope,isDeleted:false,sourceIdentitySha256:row.employeeSourceIdentitySha256});
    profiles.push({id:row.profileId,employeeId:row.employeeId,employeeSourceIdentitySha256:row.employeeSourceIdentitySha256,
      ...scope,isDeleted:false,sourceIdentitySha256:raw.sourceIdentitySha256,nativePlace:row.nativePlace,degree:row.degree});
    sourceRecords.push({sourceIdentitySha256:raw.sourceIdentitySha256,sourceRowSha256:raw.sourceRowSha256,
      oldaddr:raw.source.oldaddr,edulevel:raw.source.edulevel});
    beforeImages.push({profileId:row.profileId,employeeId:row.employeeId,version:row.profileVersion,nativePlace:row.nativePlace,degree:row.degree});
  }
  const input={importInput:{recipeVersion:'yuzhou-reusable-incremental-v2',recipeSha256:YUZHOU_REUSABLE_INCREMENTAL_RECIPE_SHA256,
    sourceSystem:'yuzhou-v10',extractedAt,employeeRecords:[],employeeIndex,records:[],profileRecords},
    originalWitness:{version:1,proof:'original_t5_whole_set_v1',operationId:op.operationId,bindingSha256:op.bindingSha256},
    plannerInput:{contract,binding:{codeSha256:CODE_SHA256,sourceEvidenceSha256:sha(canonicalProfile({expected,originalBindingSha256:op.bindingSha256})),
      sourceSnapshotSha256:b.triple.sourceSnapshotHash,targetScope:scope},employees,profiles,sourceRecords}};
  const batch=buildYuzhouProfileAliasBatch(input);
  if (batch.receipt.aliasProfiles !== expected.aliasProfiles || batch.receipt.nativePlaceFills !== expected.nativePlaceFills
    || batch.receipt.degreeFills !== expected.degreeFills) fail('PLAN_DRIFT');
  return {input,beforeImages,batch};
}

// The payload uses direct receipt-bound rows; the complete same-snapshot observer
// certificate is authenticated by assembleOriginalProfileAliasInput before files exist.
// Never bootstrap Nest or start background jobs. Existing runtime keyring and
// DB credentials stay in the API container; raw rows travel only through a pipe.
export const originalProfileAliasReadProgram = String.raw`
const {Client}=require('/app/apps/api/node_modules/pg');
const {ConfigService}=require('/app/apps/api/node_modules/@nestjs/config');
const {PartySensitiveDataService}=require('/app/apps/api/dist/shared/security/party-sensitive-data.service.js');
let input='';process.stdin.setEncoding('utf8');process.stdin.on('data',c=>{input+=c;if(input.length>1048576)process.exit(1)});
process.stdin.on('end',async()=>{
 const client=new Client({host:process.env.POSTGRES_HOST,port:Number(process.env.POSTGRES_PORT||5432),
  database:process.env.POSTGRES_DB,user:process.env.POSTGRES_USER,password:process.env.POSTGRES_PASSWORD,
  options:'-c default_transaction_read_only=on -c jit=off',connectionTimeoutMillis:5000});
 let stage='KEYRING';
 try {
  const sensitive=new PartySensitiveDataService(new ConfigService(process.env));
  stage='INPUT';const {observationSql,rowsSql}=JSON.parse(input);
  stage='CONNECT';await client.connect();
  stage='OBSERVATION_QUERY';const observedResults=await client.query(observationSql);
  stage='OBSERVATION_ENVELOPE';
  const observation=(Array.isArray(observedResults)?observedResults:[observedResults]).find(r=>r.rows?.[0]?.json_build_object)?.rows[0].json_build_object;
  if(!observation||typeof observation!=='object'||Array.isArray(observation))throw Error();
  stage='ROWS_QUERY';await client.query('SET LOCAL enable_nestloop=on');const results=await client.query(rowsSql);
  stage='ENVELOPE';
  const envelope=(Array.isArray(results)?results:[results]).find(r=>r.rows?.[0]?.json_build_object)?.rows[0].json_build_object;
  if(!envelope||!Array.isArray(envelope.rows)||envelope.rows.length>20000)throw Error();
  envelope.observation=observation;
  for(const row of envelope.rows){stage='DECRYPT';const raw=sensitive.decrypt(row.encryptedSource);if(!raw||raw.length>1048576)throw Error();stage='SOURCE_JSON';row.source=JSON.parse(raw);delete row.encryptedSource;}
  stage='OUTPUT';
  process.stdout.write(JSON.stringify(envelope));
 }catch(error){
  if(['OBSERVATION_QUERY','ROWS_QUERY'].includes(stage) && error?.code==='57014')stage+='_TIMEOUT';
  if(['OBSERVATION_QUERY','ROWS_QUERY'].includes(stage) && error?.code==='55P03')stage+='_LOCK';
  process.stderr.write('YUZHOU_PROFILE_ALIAS_SOURCE_READ_FAILED_'+stage+'\n');process.exitCode=1;
 }
 finally{await client.query('ROLLBACK').catch(()=>{});await client.end().catch(()=>{});}
});`;

function privatePath(path,directory=false) {
  if (typeof path !== 'string' || !isAbsolute(path) || resolve(path) !== path || realpathSync(path) !== path) fail('PATH_UNSAFE');
  const s=lstatSync(path);
  if (s.isSymbolicLink() || (directory ? !s.isDirectory() || (s.mode&0o777)!==0o700
    : !s.isFile() || s.nlink!==1 || (s.mode&0o777)!==0o600 || s.size>65536)) fail('PATH_UNSAFE');
}
export function prepareOriginalProfileAliasInput({configPath,outputDir}, {run=execFileSync,observe=observeProductionRuntimeRevision,now=()=>new Date()}={}) {
  privatePath(configPath);privatePath(dirname(configPath),true);
  if (typeof outputDir!=='string' || !isAbsolute(outputDir) || resolve(outputDir)!==outputDir || existsSync(outputDir)) fail('OUTPUT_INVALID');
  privatePath(dirname(outputDir),true);
  const config=JSON.parse(readFileSync(configPath,'utf8'));exact(config,['deployPath','expectedRuntimeCommit','expected']);
  if (typeof config.deployPath!=='string' || !isAbsolute(config.deployPath) || resolve(config.deployPath)!==config.deployPath
    || realpathSync(config.deployPath)!==config.deployPath || !/^[a-f0-9]{40}$/u.test(config.expectedRuntimeCommit??'')) fail('CONFIG_INVALID');
  validateOriginalProfileAliasExpected(config.expected);
  const before=observe(config.expectedRuntimeCommit);
  const raw=run('docker',['--host','unix:///var/run/docker.sock','exec','-i','jinhu-smart-park-prod-api','node','-e',originalProfileAliasReadProgram],
    {cwd:config.deployPath,input:JSON.stringify({observationSql:originalProfileAliasObservationSql,rowsSql:originalProfileAliasRowsSql}),encoding:'utf8',timeout:20000,maxBuffer:64*1024*1024,stdio:['pipe','pipe','pipe']});
  const prepared=assembleOriginalProfileAliasInput(JSON.parse(raw),config.expected,now().toISOString());
  const after=observe(config.expectedRuntimeCommit);
  if (canonicalProfile(before.observations)!==canonicalProfile(after.observations)) fail('RUNTIME_CHANGED');
  const inputText=JSON.stringify(prepared.input)+'\n',beforeText=JSON.stringify(prepared.beforeImages)+'\n';
  const receipt={formatVersion:1,kind:'yuzhou_original_profile_alias_private_preparation',collectorSha256:CODE_SHA256,
    runtimeCommit:config.expectedRuntimeCommit,expected:config.expected,inputSha256:sha(inputText),beforeImagesSha256:sha(beforeText),
    batchReceiptSha256:prepared.batch.receipt.receiptSha256,sourceProfiles:prepared.batch.receipt.sourceProfiles,
    aliasProfiles:prepared.batch.receipt.aliasProfiles,productionImport:'HOLD',authorizationGranted:false,writerPresent:false};
  mkdirSync(outputDir,{mode:0o700});
  try {
    writeFileSync(`${outputDir}/input.json`,inputText,{flag:'wx',mode:0o600});
    writeFileSync(`${outputDir}/before-images.json`,beforeText,{flag:'wx',mode:0o600});
    materializeYuzhouProfileAliasBatch({inputPath:`${outputDir}/input.json`,outputDir:`${outputDir}/batch`});
    writeFileSync(`${outputDir}/preparation-receipt.json`,JSON.stringify(receipt)+'\n',{flag:'wx',mode:0o600});
  } catch(error) {rmSync(outputDir,{recursive:true,force:true});throw error;}
  return receipt;
}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const args=process.argv.slice(2);if(args.length!==4||args[0]!=='--config'||args[2]!=='--output')fail('ARGUMENT_INVALID');
    process.stdout.write(JSON.stringify(prepareOriginalProfileAliasInput({configPath:args[1],outputDir:args[3]}))+'\n');
  } catch {process.stderr.write('YUZHOU_PROFILE_ALIAS_SOURCE_PREPARE_FAILED\n');process.exitCode=1;}
}
