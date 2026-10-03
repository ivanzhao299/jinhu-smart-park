import process from 'node:process';
import { deserialize, serialize } from 'node:v8';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildOriginalBaselineReadonlySql, sanitizeOriginalBaselineObservation, buildT5ProfileAggregateReadonlySql } from '../diagnose-production-runtime-revision.mjs';

const root=resolve(import.meta.dirname,'../..');
const retained=JSON.parse(readFileSync(join(root,'.trellis/tasks/10-04-yuzhou-initial-baseline/research/readonly-original-receipt-expectation.json'),'utf8'));
const expectation=Object.fromEntries(['operationId','sealedPlanSha256','targetScope','triple','domains'].map(k=>[k,retained[k]]));
const valid=()=>({operationBound:true,domains:expectation.domains.map(d=>({...d,eligibleRecords:d.records,eligibleDependencies:d.dependencies,availableTargets:d.records,acceptedBaselines:0,currentTargetRowsSha256:'c'.repeat(64)}))});
const reject=(value)=>assert.throws(()=>sanitizeOriginalBaselineObservation(value),{code:'PRODUCTION_RUNTIME_ORIGINAL_RESULT_INVALID'});

test('fixed SQL matches genuine aggregate expectation, SELECT-only bounded read-only transaction',()=>{
  const sql=buildOriginalBaselineReadonlySql();
  assert.equal(sql,buildOriginalBaselineReadonlySql(expectation));
  assert.ok(sql.startsWith('BEGIN TRANSACTION READ ONLY;'));
  assert.ok(sql.endsWith('ROLLBACK;\n'));
  assert.ok(sql.includes("AND d.target_table=r.target_table\n WHERE r.operation_id="));
  assert.ok(sql.includes("AND r.disposition='insert'\n), dependencies"));
  for(const snippet of ["statement_timeout='30s'","lock_timeout='2s'","search_path=public,pg_catalog",'COLLATE "C"','chr(31)','chr(10)','current_database()','hr_yuzhou_production_import_projection_receipt','eligible AS MATERIALIZED'])assert.ok(sql.includes(snippet));
  assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE|COPY|CALL|DO|FOR SHARE|FOR UPDATE)\b/u);
  assert.doesNotMatch(sql,/source_snapshot\b|provenance_encrypted|full_name|work_mobile|password|salary/u);
  assert.equal((sql.match(/;/gu)||[]).length,6);
});
test('strict test-only expectation rejects extra keys, SQL injection and incorrect domain types',()=>{
  for(const change of [e=>{e.sql='SELECT 1';},e=>{e.operationId="x';DROP TABLE hr_employee;";},e=>{e.targetScope.tenantId="x'";},e=>{e.domains[0].records='2938';},e=>{e.domains[0].phase='T3';},e=>{e.triple.codeSha=4;},e=>{e.domains[0].recordSetSha256='INVALID';}]){
    const e=deserialize(serialize(expectation));change(e);assert.throws(()=>buildOriginalBaselineReadonlySql(e),{code:'PRODUCTION_RUNTIME_ORIGINAL_EXPECTATION_INVALID'});
  }
});
test('sanitizer permits readiness only, separate accepted baselines and immutable digest drift',()=>{
  const observation=sanitizeOriginalBaselineObservation(JSON.stringify(valid()));
  assert.equal(observation.status,'PASS');assert.equal(observation.authorizationGranted,false);assert.equal(observation.productionImport,'HOLD');assert.equal(observation.baselineAnchoring,'HOLD');
  for(const change of [v=>{v.operationBound=false;},v=>{v.domains[0].eligibleRecords--;},v=>{v.domains[0].eligibleDependencies--;},v=>{v.domains[1].availableTargets--;},v=>{v.domains[0].recordSetSha256='a'.repeat(64);},v=>{v.domains[1].dependencySetSha256='a'.repeat(64);}]){const v=valid();change(v);assert.equal(sanitizeOriginalBaselineObservation(JSON.stringify(v)).status,'FAIL');}
  const accepted=valid();accepted.domains[0].acceptedBaselines=1;assert.equal(sanitizeOriginalBaselineObservation(JSON.stringify(accepted)).status,'PASS');
  const currentEdit=valid();currentEdit.domains[0].currentTargetRowsSha256='d'.repeat(64);assert.equal(sanitizeOriginalBaselineObservation(JSON.stringify(currentEdit)).status,'PASS','current target fingerprint is separate from immutable source readiness');
  assert.ok(buildOriginalBaselineReadonlySql().includes('to_jsonb(t)::text AS row_json'));
  assert.ok(buildOriginalBaselineReadonlySql().includes('ORDER BY t.target_id COLLATE "C"'));
  const invalid=valid();invalid.domains[0].currentTargetRowsSha256='private';reject(JSON.stringify(invalid));
});
test('sanitizer fails closed for private/unknown output, invalid sizes and count/hash types',()=>{
  for(const raw of ['not JSON','x'.repeat(16385),null,JSON.stringify({...valid(),privateName:'private'}),JSON.stringify({...valid(),domains:[]})])reject(raw);
  for(const change of [v=>{v.domains[0].records='2938';},v=>{v.domains[0].eligibleRecords=99999;},v=>{v.domains[0].recordSetSha256='private';},v=>{v.domains[0].privateName='private';},v=>{v.domains[0].acceptedBaselines=-1;},v=>{v.domains.reverse();}]){const v=valid();change(v);reject(JSON.stringify(v));}
});
test('standalone and stdin prove images first, execute fixed container command, suppress sensitive failures',t=>{
  const dir=mkdtempSync(join(tmpdir(),'original-readonly-contract-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const docker=join(dir,'docker'),log=join(dir,'log'),sql=join(dir,'sql');
  writeFileSync(docker,`#!/usr/bin/env node
const fs=require('node:fs');const a=process.argv.slice(2);fs.appendFileSync(process.env.TEST_LOG,JSON.stringify(a)+'\\n');
if(a[2]==='exec'){const sql=fs.readFileSync(0,'utf8');fs.writeFileSync(process.env.TEST_SQL,sql);if(process.env.TEST_FAIL==='query'){console.error('sensitive credentials private row');process.exit(1);}console.log(sql.includes('WITH operation AS (')?process.env.TEST_T5_RESULT:process.env.TEST_RESULT);process.exit(0);}
const id=a.at(-1);const service=id.includes('api')||id==='1'.repeat(64)||id==='sha256:'+'3'.repeat(64)?'api':'web';
const n=service==='api'?'1':'2',m=service==='api'?'3':'4';const revision=process.env.TEST_FAIL==='image'?'b'.repeat(40):'a'.repeat(40);
if(a[2]==='image')console.log(JSON.stringify(['sha256:'+m.repeat(64),revision,service]));
else if(a[5].includes('.Mounts'))console.log('');
else console.log(JSON.stringify([n.repeat(64),'sha256:'+m.repeat(64),true,false,false,'2026-10-04T12:00:00Z',0,'/jinhu-smart-park-prod-'+service]));
`,{mode:0o700});
  for(const stdin of [false,true])for(const failure of ['', 'image','query','t5-mismatch']){
    writeFileSync(log,'');
    const args=stdin?['--input-type=module','-']:['scripts/diagnose-production-runtime-revision.mjs'];
    const result=spawnSync(process.execPath,[...args,'--expected-commit','a'.repeat(40)],{cwd:root,input:stdin?readFileSync(join(root,'scripts/diagnose-production-runtime-revision.mjs'),'utf8'):undefined,encoding:'utf8',env:{...process.env,PATH:`${dir}:${process.env.PATH}`,TEST_LOG:log,TEST_SQL:sql,TEST_FAIL:failure,TEST_RESULT:JSON.stringify(valid()),TEST_T5_RESULT:JSON.stringify({operationBound:true,profileCount:2859,profileReceiptCount:2859,profileSha256:'a'.repeat(64),profileAggregateMatches:failure!=='t5-mismatch',receiptCount:80000,receiptSha256:'b'.repeat(64),receiptAggregateMatches:true})}});
    const calls=readFileSync(log,'utf8').trim().split('\n').map(line=>JSON.parse(line));
    if(failure==='image'){assert.equal(result.status,1);assert.equal(result.stderr,'PRODUCTION_RUNTIME_REVISION_MISMATCH\n');assert.ok(calls.every(a=>a[2]!=='exec'));}
    else {assert.deepEqual(calls.at(-1),['--host','unix:///var/run/docker.sock','exec','-i','jinhu-smart-park-prod-postgres','sh','-c','exec psql -X -q -A -t -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"']);assert.equal(readFileSync(sql,'utf8'),failure==='query'?buildOriginalBaselineReadonlySql():buildT5ProfileAggregateReadonlySql());
      if(failure==='query'){assert.equal(result.status,1);assert.equal(result.stdout,'');assert.equal(result.stderr,'PRODUCTION_RUNTIME_ORIGINAL_QUERY_FAILED\n');}
      else {assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).originalBaseline.status,'PASS');assert.equal(JSON.parse(result.stdout).t5OriginalProfileAggregate.status,failure==='t5-mismatch'?'FAIL':'PASS');}}
  }
  const result=spawnSync(process.execPath,['scripts/diagnose-production-runtime-revision.mjs','--expected-commit','a'.repeat(40),'--operation-id',expectation.operationId],{cwd:root,encoding:'utf8'});assert.equal(result.stderr,'PRODUCTION_RUNTIME_ARGUMENT_INVALID\n');
});
