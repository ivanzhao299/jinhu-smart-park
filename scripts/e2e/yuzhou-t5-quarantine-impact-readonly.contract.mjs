import assert from 'node:assert/strict';
import test from 'node:test';
import {buildT5QuarantineImpactReadonlySql,sanitizeT5QuarantineImpactObservation} from '../diagnose-production-runtime-revision.mjs';
const group=()=>({targetTable:'hr_employee_profile',reasonCode:'EMPLOYEE_PROFILE_IDENTITY_AMBIGUOUS',records:3,historicalCandidateRecords:1,currentImpactRecords:1,unknownImpactRecords:1,ownerEmployees:2,sourceMissingRecords:1,sourceAmbiguousRecords:0,ownerMapInvalidRecords:0});
const fixture=()=>({operationBound:true,sourceAggregateMatches:true,receiptAggregateMatches:true,quarantineCount:3,groups:[group()]});
const check=v=>sanitizeT5QuarantineImpactObservation(JSON.stringify(v));
const invalid=v=>assert.throws(()=>check(v),{code:'PRODUCTION_RUNTIME_T5_IMPACT_RESULT_INVALID'});
test('current owner screen reads immutable owners without source decryption or writes',()=>{
 const sql=buildT5QuarantineImpactReadonlySql();
 assert.match(sql,/^BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;/u);
 assert.ok(sql.endsWith('ROLLBACK;\n'));
 assert.doesNotMatch(sql.replace(/'(?:''|[^'])*'/gu,"''"),/\b(?:INSERT|UPDATE|DELETE|COPY|CALL|DO|FOR SHARE|FOR UPDATE|decrypt)\b/iu);
 for(const part of ['current_database()',"TIME ZONE 'Asia/Shanghai'",'source_count<>1',"m.source_table='dbo.person'","e.tenant_id='10000001'","c.park_id=e.park_id","c.status='active'","u.is_enabled AND u.status<>'disabled'","o.owned_state->'hr_yuzhou_t5_followon_source'",'to_jsonb(x)::text','to_jsonb(r)::text'])assert.ok(sql.includes(part));
 assert.ok(sql.includes("WHEN e.employment_status='departed' AND NOT EXISTS("));
 assert.doesNotMatch(sql,/c\.(?:start_date|end_date)/u);
 assert.ok(sql.includes('am.source_identity_sha256=m.source_identity_sha256 AND am.is_active)=1'));
});
test('conserved screen stays a candidate classification and explicitly excludes payroll',()=>{
 const r=check(fixture());assert.equal(r.status,'PASS');assert.equal(r.productionWrites,false);assert.equal(r.archiveDecisionApplied,false);for(const scope of ['T4_payroll','open_payroll_periods','open_insurance_periods','account_permissions'])assert.ok(r.excludedScope.includes(scope));
 for(const field of ['operationBound','sourceAggregateMatches','receiptAggregateMatches'])assert.equal(check({...fixture(),[field]:false}).status,'FAIL');
 assert.equal(check({...fixture(),quarantineCount:0,groups:[]}).status,'PASS');
});
test('unknown owners cannot disappear into historical counts or break conservation',()=>{
 for(const change of [g=>g.unknownImpactRecords=0,g=>g.ownerEmployees=4,g=>g.sourceMissingRecords=2,g=>g.sourceAmbiguousRecords=1,g=>g.ownerMapInvalidRecords=1,g=>g.records=0,g=>g.records='3',g=>g.currentImpactRecords=-1]){const v=fixture();change(v.groups[0]);invalid(v);}
 invalid({...fixture(),quarantineCount:4});invalid({...fixture(),groups:[group(),group()],quarantineCount:6});
});
test('strict result schema excludes personal rows and malformed nested values',()=>{
 invalid({...fixture(),privateValue:'x'});invalid({...fixture(),groups:[{...group(),employeeName:'x'}]});
 for(const g of [null,[],{...group(),targetTable:'private_table'},{...group(),reasonCode:'private name'}])invalid({...fixture(),groups:[g]});
 for(const raw of [null,'not json','null','x'.repeat(65537)])assert.throws(()=>sanitizeT5QuarantineImpactObservation(raw),{code:'PRODUCTION_RUNTIME_T5_IMPACT_RESULT_INVALID'});
});
