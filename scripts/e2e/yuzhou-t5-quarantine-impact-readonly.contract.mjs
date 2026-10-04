import assert from 'node:assert/strict';
import test from 'node:test';
import {buildT5QuarantineImpactReadonlySql,sanitizeT5QuarantineImpactObservation} from '../diagnose-production-runtime-revision.mjs';
const group=()=>({targetTable:'hr_employee_profile',reasonCode:'EMPLOYEE_PROFILE_IDENTITY_AMBIGUOUS',records:3,historicalCandidateRecords:1,currentImpactRecords:1,unknownImpactRecords:1,ownerEmployees:2,sourceMissingRecords:1,sourceAmbiguousRecords:0,ownerMapInvalidRecords:0,financialDependencyRecords:1,openPayrollRecords:1,unclosedLegacyBookRecords:1,unclosedModernInsuranceRecords:0,pendingReconciliationRecords:0});
const fixture=()=>({operationBound:true,sourceAggregateMatches:true,receiptAggregateMatches:true,quarantineCount:3,financialContext:{openPayrollPeriods:1,openPayrollPeriodsWithoutParticipants:0,unclosedLegacyBookPeriods:1,unclosedLegacyBookPeriodsWithoutMappedMembers:0,unmappedLegacyBookMemberships:0,pendingReconciliationRuns:0,pendingReconciliationRunsWithoutResults:0},groups:[group()]});
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
test('conserved screen reports overlapping potential records and excludes financial acceptance',()=>{
 const r=check(fixture());assert.equal(r.status,'PASS');assert.equal(r.productionWrites,false);assert.equal(r.archiveDecisionApplied,false);for(const scope of ['T4_payroll','future_source_changes','external_systems','unmapped_owner_impact','business_selected_period_and_amount_acceptance','unrecorded_financial_dependencies','account_permissions'])assert.ok(r.excludedScope.includes(scope));
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

test('financial flags preserve disjoint classification, latest insurance and same-scope joins',()=>{
 const sql=buildT5QuarantineImpactReadonlySql();
 for(const part of ["p.status='open'","r.status<>'cancelled'","s.status<>'cancelled'",'NOT s.is_deleted','s.tenant_id=r.tenant_id AND s.park_id=r.park_id',
  'p.legacy_close_state=0',"mapping_status='mapped'",'n.revision_no>r.revision_no','c.revision_id=r.id',"r.status IN ('calculating','review')",'n.supersedes_run_id=r.id',
  'x.run_id=r.id AND x.tenant_id=r.tenant_id AND x.park_id=r.park_id'])assert.ok(sql.includes(part),part);
 assert.ok(sql.indexOf("WHEN e.id IS NULL OR m.id IS NULL")<sql.indexOf("WHEN f.employee_id IS NOT NULL"));
 const r=check(fixture());assert.equal(r.archivalClosureCertified,false);assert.equal(r.financialPeriodSelectionAccepted,false);
 assert.equal(r.financialCountSemantics,'overlapping_record_counts_not_additive_or_employee_counts');
 for(const change of [g=>g.financialDependencyRecords=2,g=>g.openPayrollRecords=2,g=>{g.openPayrollRecords=0;g.unclosedLegacyBookRecords=0;},g=>g.pendingReconciliationRecords=0.5]){
  const v=fixture();change(v.groups[0]);invalid(v);
 }
});
test('participant-free and unmapped uncertainty metadata is finite and strict',()=>{
 for(const key of Object.keys(fixture().financialContext))for(const n of [-1,1.5,'1',1000001,null]){
  const v=fixture();v.financialContext[key]=n;invalid(v);
 }
 for(const key of ['openPayrollPeriodsWithoutParticipants','unclosedLegacyBookPeriodsWithoutMappedMembers','pendingReconciliationRunsWithoutResults']){
  const v=fixture();v.financialContext[key]=2;invalid(v);
 }
 const extra=fixture();extra.financialContext.employeeId='private';invalid(extra);
 const unknown=fixture();unknown.groups[0].currentImpactRecords=0;unknown.groups[0].unknownImpactRecords=2;invalid(unknown);
});

test('financial record counts cannot contradict zero recorded participants',()=>{
 for(const [category,total,empty] of [
  ['openPayrollRecords','openPayrollPeriods','openPayrollPeriodsWithoutParticipants'],
  ['unclosedLegacyBookRecords','unclosedLegacyBookPeriods','unclosedLegacyBookPeriodsWithoutMappedMembers'],
  ['pendingReconciliationRecords','pendingReconciliationRuns','pendingReconciliationRunsWithoutResults'],
 ])for(const n of [0,1]){
  const v=fixture();v.groups[0][category]=1;v.financialContext[total]=n;v.financialContext[empty]=n;
  if(total==='unclosedLegacyBookPeriods')v.financialContext.unmappedLegacyBookMemberships=0;
  invalid(v);
 }
});
