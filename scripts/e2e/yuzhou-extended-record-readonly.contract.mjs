import assert from 'node:assert/strict';
import test from 'node:test';
import {buildExtendedRecordReadonlySql,sanitizeExtendedRecordObservation} from '../diagnose-production-runtime-revision.mjs';
const valid=()=>Object.fromEntries(['experience','skill','credential'].map(k=>[k,{count:10,activeCount:9,sha256:'a'.repeat(64)}]));
test('formal snapshots read archived and active rows in a bounded read-only transaction',()=>{
 const sql=buildExtendedRecordReadonlySql();assert.match(sql,/REPEATABLE READ READ ONLY/);assert.ok(sql.endsWith('ROLLBACK;\n'));assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE|COPY|CALL|DO|FOR SHARE|FOR UPDATE)\b/);
 for(const kind of ['experience','skill','credential'])assert.ok(sql.includes(`public.hr_employee_${kind}`));
 assert.ok(sql.includes("tenant_id='10000001' AND park_id='20000001'"));assert.ok(sql.includes('to_jsonb(record)::text'));assert.ok(sql.includes("statement_timeout='30s'"));
 const result=sanitizeExtendedRecordObservation(JSON.stringify(valid()));assert.equal(result.productionWrites,false);assert.equal(result.baselineCertified,false);assert.equal(result.status,'PASS');
});
test('extra fields, private values and impossible aggregate results fail closed',()=>{
 for(const mutate of [v=>{v.privateName='private'},v=>{v.skill.privateValue='private'},v=>{v.skill.count=-1},v=>{v.skill.activeCount=11},v=>{v.credential.sha256='private'},v=>{delete v.experience}]){const v=valid();mutate(v);assert.throws(()=>sanitizeExtendedRecordObservation(JSON.stringify(v)));}
 for(const raw of [null,'x'.repeat(4097),'not json'])assert.throws(()=>sanitizeExtendedRecordObservation(raw));
});
