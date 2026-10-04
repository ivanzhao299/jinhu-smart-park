import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {buildInsuranceOriginalReceiptReadonlySql,sanitizeInsuranceOriginalReceiptObservation} from '../diagnose-production-runtime-revision.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
const rows=Array.from({length:84},(_,i)=>[hash(`source${i}`),hash(`row${i}`),i<12?'hr_insurance_policy':'hr_insurance_policy_item',randomUUID(),hash(`target${i}`)]);
const expected=hash(JSON.stringify([...rows].sort((a,b)=>a[0]<b[0]?-1:1)));
test('complete original receipt tuples compare independent digest and disclose only counts and hashes',()=>{
 const result=sanitizeInsuranceOriginalReceiptObservation(JSON.stringify({operationBound:true,rows:[...rows].reverse()}),expected);
 assert.equal(result.status,'PASS');assert.equal(result.policyCount,12);assert.equal(result.itemCount,72);
 assert.equal(result.productionWrites,false);assert.equal(result.baselineAccepted,false);
 for(const tuple of rows)assert.equal(JSON.stringify(result).includes(tuple[3]),false);
 assert.equal('rows' in result,false);
});
test('original receipt SQL executes against actual migration schema and rejects a missing operation', {skip:process.env.INSURANCE_RECEIPT_PG_REQUIRED!=='1'},()=>{
 const name=`jinhu-insurance-receipt-lab-${randomUUID()}`;
 const docker=args=>execFileSync('docker',args,{encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:30000});
 const sql=text=>execFileSync('docker',['exec','-i',name,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],{input:text,encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:30000});
 let owned=false;
 try {
  docker(['run','-d','--name',name,'--network','none','--tmpfs','/var/lib/postgresql/data','-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:16-alpine']);owned=true;
  let ready=false;
  for(let i=0;i<30;i++){try{docker(['exec',name,'pg_isready','-h','127.0.0.1','-U','postgres']);ready=true;break;}catch{execFileSync('sleep',['1']);}}
  assert.equal(ready,true);
  sql('CREATE EXTENSION "uuid-ossp"; CREATE EXTENSION pgcrypto; CREATE TABLE hr_legacy_identity_registry(owner_record_map_id uuid,mapping_status varchar(32));');
  for(const file of ['000235_hr_legacy_migration_control','000278_hr_yuzhou_production_import_control','000281_hr_yuzhou_production_import_control_v2','000282_hr_yuzhou_production_import_writer_receipts'])sql(readFileSync(new URL(`../../database/migrations/${file}.sql`,import.meta.url),'utf8'));
  const result=sanitizeInsuranceOriginalReceiptObservation(sql(buildInsuranceOriginalReceiptReadonlySql()).trim());
  assert.equal(result.status,'MISMATCH');assert.equal(result.operationBound,false);assert.equal(result.policyCount,0);assert.equal(result.itemCount,0);
  assert.throws(()=>sql('BEGIN TRANSACTION READ ONLY; DELETE FROM hr_yuzhou_production_import_record; ROLLBACK;'),/Command failed/);
  assert.equal(sql('SELECT count(*) FROM hr_yuzhou_production_import_operation;').trim(),'0');
 } finally {if(owned)docker(['rm','-f',name]);}
 assert.equal(docker(['ps','-a','--filter',`name=^/${name}$`,'--format','{{.Names}}']).trim(),'');
});
test('unbound, omitted or changed original tuples remain downloadable mismatches; invalid shapes fail closed',()=>{
 for(const value of [{operationBound:false,rows},{operationBound:true,rows:rows.slice(1)},{operationBound:true,rows:rows.map((r,i)=>i===0?[r[0],r[1],r[2],r[3],hash('changed')]:r)}])assert.equal(sanitizeInsuranceOriginalReceiptObservation(JSON.stringify(value),expected).status,'MISMATCH');
 for(const value of [{operationBound:true,rows:[...rows,rows[0]]},{operationBound:true,rows:rows.map((r,i)=>i===0?[...r,'private']:r)},{operationBound:true,rows,extra:'secret'},{operationBound:true,rows:rows.map((r,i)=>i===0?[r[0],r[1],'hr_employee',r[3],r[4]]:r)}])assert.throws(()=>sanitizeInsuranceOriginalReceiptObservation(JSON.stringify(value),expected),/RESULT_INVALID/);
});
test('SQL is readonly and authenticates original chain; expectation is initialized before stdin CLI executes',()=>{
 const sql=buildInsuranceOriginalReceiptReadonlySql();assert.match(sql,/BEGIN TRANSACTION READ ONLY/u);assert.match(sql,/ROLLBACK;/u);
 assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/u);
 for(const token of ['payload_bundle_artifact_sha256','sealed_plan_sha256','mapping_contract_sha256','source_snapshot_sha256','projection_receipt','migration_batch','legacy_record_map','mapping_status','target_version_after','rollback_status','current_database()'])assert.ok(sql.includes(token));
 const text=readFileSync(new URL('../diagnose-production-runtime-revision.mjs',import.meta.url),'utf8');assert.ok(text.indexOf('const INSURANCE_RECEIPT_SHA256')<text.indexOf('if (process.argv[1] === "-"'));
});
