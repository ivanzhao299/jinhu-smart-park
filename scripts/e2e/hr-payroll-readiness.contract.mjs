import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { diagnosePayrollReadiness, payrollReadinessSql,modernPreparationCountKeys } from '../diagnose-hr-payroll-readiness.mjs';

const good = {modernPreparation:Object.fromEntries(modernPreparationCountKeys.map(key=>[key,0])),latestObservedMonth:'2027-12-01',totalDistinctMonths:25,monthsTruncated:true,observedMonths:Array.from({length:24},(_,i)=>`${2027-Math.floor(i/12)}-${String(12-i%12).padStart(2,'0')}-01`),latestCompleteMonth:'UNVERIFIED',activeBookCount:1,publishedBatchCount:1,stagedBatchCount:2,receiptQualifiedStagedBatchCount:1,latestMappedSnapshots:2,latestUnmappedSnapshots:1,latestEffectiveClosedAttendanceBatches:1,latestAttendanceMonth:'2026-06-01',latestClosedInsuranceInputs:1,latestInsuranceMonth:'2026-06-01',latestFormalRuns:1,latestFormalDraftRuns:0,latestFormalCalculatedRuns:0,latestFormalReviewingRuns:1,latestConfirmedFormalRuns:0,latestFormalCancelledRuns:0,latestReceiptQualifiedFrozenSources:1,reconciliationCalculatingRuns:0,reconciliationReviewRuns:1,reconciliationAcceptedRuns:0,reconciliationRejectedRuns:0,approvedFormulaCount:2,currentNetPolicyCount:1};
test('fixed count-only SQL is repeatable-read, bounded, fixed scope and read-only',()=>{
 const result=diagnosePayrollReadiness('/synthetic',(cmd,args,options)=>{assert.equal(cmd,'docker');assert.ok(args.includes('postgres'));assert.equal(options.input,payrollReadinessSql);assert.equal(options.timeout,15000);return JSON.stringify(good);});
 assert.equal(result.latestCompleteMonth,'UNVERIFIED'); assert.equal(result.eligibility,'UNVERIFIED'); assert.equal(result.productionImport,'HOLD');
 assert.match(payrollReadinessSql,/REPEATABLE READ READ ONLY/);assert.match(payrollReadinessSql,/statement_timeout/);assert.match(payrollReadinessSql,/ROLLBACK;/);assert.match(payrollReadinessSql,/tenant_id='10000001' AND .*park_id='20000001'/);assert.match(payrollReadinessSql,/hr_payroll_source_is_current/);assert.match(payrollReadinessSql,/hr_payroll_frozen_source_is_current/);assert.match(payrollReadinessSql,/reconciliation_source_id/);assert.doesNotMatch(payrollReadinessSql,/\b(INSERT|UPDATE|DELETE|CREATE|ALTER|GRANT)\b/i);
});
test('rejects private, malformed and failed output rather than inventing zeros',()=>{
 assert.throws(()=>diagnosePayrollReadiness('/synthetic',()=>JSON.stringify({...good,secret:'x'})),/RESULT_INVALID/);
 assert.throws(()=>diagnosePayrollReadiness('/synthetic',()=>JSON.stringify({...good,latestCompleteMonth:'2026-06-01'})),/RESULT_INVALID/);
 assert.throws(()=>diagnosePayrollReadiness('/synthetic',()=>JSON.stringify({...good,observedMonths:[...good.observedMonths].reverse()})),/RESULT_INVALID/);
 assert.throws(()=>diagnosePayrollReadiness('/synthetic',()=>JSON.stringify({...good,latestObservedMonth:['2027-12-01']})),/RESULT_INVALID/);
 assert.throws(()=>diagnosePayrollReadiness('/synthetic',()=>JSON.stringify({...good,observedMonths:[null,...good.observedMonths.slice(1)]})),/RESULT_INVALID/);
 assert.throws(()=>diagnosePayrollReadiness('/synthetic',()=>{throw new Error('private database error');}),/PROBE_FAILED/);
});
test('workflow gate stays optional and diagnostic-only',()=>{const workflow=readFileSync(new URL('../../.github/workflows/deploy-production.yml',import.meta.url),'utf8');const step=workflow.split('- name: Diagnose HR payroll readiness counts (read-only)')[1].split('- name: Diagnose production runtime image revisions')[0];assert.match(step,/inputs.deploy_mode == 'diagnose-production-runtime-revision' && inputs.diagnose_payroll_readiness/);assert.doesNotMatch(step,/prod:deploy|db:migrate|db:seed/);});

test('modern preparation is strictly separate from old formula counts and never claims calculation readiness',()=>{
 const modernPreparation={sourceBookCount:2,linkedRuleBookCount:2,effectiveRuleBookCount:2,draftInputCount:0,confirmedInputCount:2,currentRuleConfirmedInputCount:2,bookWithCurrentRuleConfirmedInputCount:2,exactRosterBookCount:2};
 const result=diagnosePayrollReadiness('/synthetic',()=>JSON.stringify({...good,activeBookCount:2,approvedFormulaCount:0,currentNetPolicyCount:0,modernPreparation}));
 assert.equal(result.modernPreparation.exactRosterBookCount,2);assert.equal(result.modernCalculationReadiness,'UNVERIFIED');assert.equal(result.legacyFormulaCountsAreModernPrerequisites,false);
 for(const change of [{secret:'private'},{sourceBookCount:-1},{exactRosterBookCount:3},{confirmedInputCount:1},{effectiveRuleBookCount:3},{currentRuleConfirmedInputCount:'2'}]) assert.throws(()=>diagnosePayrollReadiness('/synthetic',()=>JSON.stringify({...good,activeBookCount:2,modernPreparation:{...modernPreparation,...change}})),/RESULT_INVALID/);
 assert.throws(()=>diagnosePayrollReadiness('/synthetic',()=>JSON.stringify({...good,modernPreparation:null})),/RESULT_INVALID/);
 assert.throws(()=>diagnosePayrollReadiness('/synthetic',()=>JSON.stringify({...good,modernPreparation})),/RESULT_INVALID/,'Source books cannot exceed active books');
 for(const key of ['draftInputCount','confirmedInputCount'])assert.throws(()=>diagnosePayrollReadiness('/synthetic',()=>JSON.stringify({...good,modernPreparation:{...good.modernPreparation,[key]:1}})),/RESULT_INVALID/,'Inputs cannot exist without a linked rule book');
 const missing={...good.modernPreparation};delete missing.exactRosterBookCount;
 assert.throws(()=>diagnosePayrollReadiness('/synthetic',()=>JSON.stringify({...good,modernPreparation:missing})),/RESULT_INVALID/);
});
