import assert from 'node:assert/strict';
import test from 'node:test';
import { buildT5ProfileAggregateReadonlySql, sanitizeT5ProfileAggregateObservation } from '../diagnose-production-runtime-revision.mjs';
const valid=()=>({operationBound:true,profileCount:2859,profileReceiptCount:2859,profileSha256:'a'.repeat(64),profileAggregateMatches:true,receiptCount:80000,receiptSha256:'b'.repeat(64),receiptAggregateMatches:true,profileExclusions:[]});
test('snapshot query preserves original whole-row digest algorithm and is read only',()=>{
 const sql=buildT5ProfileAggregateReadonlySql();
 assert.match(sql,/^BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;/u);
 for(const part of ["TIME ZONE 'Asia/Shanghai'","statement_timeout='30s'","lock_timeout='2s'",'to_jsonb(x)::text','to_jsonb(r)::text',"string_agg(row_hash,'' ORDER BY row_hash)",'current_database()',"o.status='succeeded'","o.rolled_back_at IS NULL","b.finished_at IS NOT NULL","b.source_snapshot_sha256=o.binding->'triple'->>'sourceSnapshotHash'","b.tool_version='t5-followon-v1@'||(o.binding->>'executionCodeSha')"])assert.ok(sql.includes(part));
 assert.ok(sql.endsWith('ROLLBACK;\n'));
 assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE|COPY|CALL|DO|FOR SHARE|FOR UPDATE)\b/u);
});
test('observation never writes or certifies and refuses aggregate drift',()=>{
 const result=sanitizeT5ProfileAggregateObservation(JSON.stringify(valid()));
 assert.equal(result.status,'PASS');assert.equal(result.baselineCertified,false);assert.equal(result.productionWrites,false);
 for(const change of [v=>{v.operationBound=false;},v=>{v.profileCount--;},v=>{v.profileAggregateMatches=false;},v=>{v.receiptAggregateMatches=false;},v=>{v.profileCount=0;v.profileReceiptCount=0;}]){const v=valid();change(v);assert.equal(sanitizeT5ProfileAggregateObservation(JSON.stringify(v)).status,'FAIL');}
});
test('private extra keys and malformed count or hash outputs fail closed',()=>{
 for(const change of [v=>{v.privateValue='secret';},v=>{v.profileSha256='private';},v=>{v.receiptCount='80000';},v=>{v.receiptCount=0;},v=>{v.profileCount=-1;},v=>{v.receiptAggregateMatches='true';}]){const v=valid();change(v);assert.throws(()=>sanitizeT5ProfileAggregateObservation(JSON.stringify(v)),{code:'PRODUCTION_RUNTIME_T5_RESULT_INVALID'});}
 for(const raw of [null,'not json','x'.repeat(65537)])assert.throws(()=>sanitizeT5ProfileAggregateObservation(raw),{code:'PRODUCTION_RUNTIME_T5_RESULT_INVALID'});
});

test('hashed original exclusion rows remain scoped and strict without private fields',()=>{
 const entry={sourceIdentitySha256:'c'.repeat(64),sourceRowSha256:'d'.repeat(64),decisionReceiptSha256:'e'.repeat(64),reasonCode:'ORIGINAL_QUARANTINE'};
 const v=valid();v.profileExclusions=[entry];assert.equal(sanitizeT5ProfileAggregateObservation(JSON.stringify(v)).profileExclusions.length,1);
 for(const entries of [[entry,entry],[{...entry,privateName:'private'}],[{...entry,reasonCode:'arbitrary private text'}],Array(201).fill(entry)])assert.throws(()=>sanitizeT5ProfileAggregateObservation(JSON.stringify({...valid(),profileExclusions:entries})),{code:'PRODUCTION_RUNTIME_T5_RESULT_INVALID'});
});
