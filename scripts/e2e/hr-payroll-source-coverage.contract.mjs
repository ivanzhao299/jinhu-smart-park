import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { payrollSourceCoverageSql, diagnosePayrollSourceCoverage, validatePayrollSourceCoverage } from '../diagnose-hr-payroll-source-coverage.mjs';

const month='2026-07-01';
const empty={bookCount:0,snapshotCount:0,sourceRowCount:0,mappedCount:0,unmappedCount:0,duplicateSourceCount:0,quarantinedCount:0,employeeCount:0,itemCount:0,unresolvedItemCount:0,eligibleSourceCount:0,unqualifiedBatchCount:0,unavailableReferenceCount:0,unavailableEmployeeCount:0,duplicateEmployeeExtraCount:0};
const row={...empty,bookCount:1,snapshotCount:2,sourceRowCount:3,mappedCount:2,employeeCount:1,itemCount:4,eligibleSourceCount:1,unqualifiedBatchCount:1,duplicateEmployeeExtraCount:1};
const noInsurance={cohortEmployeeCount:0,historicalOnlyCount:0,modernOnlyCount:0,bothCount:0,neitherCount:0,historicalAmbiguousCount:0,historicalNeedsReviewCount:0,noHistoricalPeriodCount:0,modernAmbiguousCount:0,noModernRevisionCount:0};
const good={periodMonth:month,totals:{...row,bookCount:2,snapshotCount:4,sourceRowCount:6,mappedCount:4,itemCount:8,eligibleSourceCount:2,unqualifiedBatchCount:2,duplicateEmployeeExtraCount:2},books:[{scheme:1,...row},{scheme:2,...row}],insuranceCoverage:{...noInsurance,cohortEmployeeCount:1,neitherCount:1,noHistoricalPeriodCount:1,noModernRevisionCount:1}};
test('explicit month and fixed-scope count-only SQL execute with bounded read-only transaction',()=>{
 const sql=payrollSourceCoverageSql(month);
 const result=diagnosePayrollSourceCoverage('/synthetic',month,(cmd,args,options)=>{assert.equal(cmd,'docker');assert.ok(args.includes('postgres'));assert.equal(options.input,sql);assert.equal(options.timeout,15000);assert.equal(options.maxBuffer,65536);return JSON.stringify(good);});
 assert.equal(result.kind,'hr_payroll_source_coverage_counts');assert.equal(result.totals.employeeCount,1);assert.equal(result.books.reduce((n,b)=>n+b.employeeCount,0),2);
 assert.equal(result.amountReconciliation,'UNVERIFIED');assert.equal(result.productionWrites,0);
 assert.equal(result.insuranceAmountCompleteness,'UNVERIFIED');assert.equal(result.insuranceCoverage.cohortEmployeeCount,1);
 assert.match(sql,/REPEATABLE READ READ ONLY/);assert.match(sql,/ROLLBACK;/);assert.match(sql,/p.period_month=date '2026-07-01'/);
 assert.match(sql,/control.target_database=current_database\(\)/);assert.doesNotMatch(sql,/\b(INSERT|UPDATE|DELETE|CREATE|ALTER|GRANT)\b/i);
});
test('invalid months never reach a process, errors never leak raw database details',()=>{
 for(const value of ['',null,'2026-07','2026-07-02','2026-13-01',"2026-07-01'; SELECT 1; --",'2026-07-01\n']) assert.throws(()=>diagnosePayrollSourceCoverage('/synthetic',value,()=>assert.fail('must not execute')),/MONTH_INVALID/);
 assert.throws(()=>diagnosePayrollSourceCoverage('relative',month),/PATH_INVALID/);
 assert.throws(()=>diagnosePayrollSourceCoverage('/synthetic',month,()=>{throw Error('private SQL detail');}),{message:'HR_PAYROLL_COVERAGE_PROBE_FAILED'});
 assert.throws(()=>diagnosePayrollSourceCoverage('/synthetic',month,()=>'{invalid'),/PROBE_FAILED/);
});
test('strict projections enforce category and book conservation without summing distinct people',()=>{
 assert.equal(validatePayrollSourceCoverage({periodMonth:month,totals:empty,books:[],insuranceCoverage:noInsurance},month).totals.snapshotCount,0);
 const mutations=[d=>{d.private='salary';},d=>{d.periodMonth='2026-08-01';},d=>{d.totals.mappedCount=3;},d=>{d.totals.eligibleSourceCount=3;},d=>{d.books.reverse();},d=>{d.books[0].employeeName='private';},d=>{d.books[0].scheme=36;},d=>{d.totals.sourceRowCount=2;},d=>{d.totals.snapshotCount=Number.MAX_SAFE_INTEGER+1;},d=>{d.totals.itemCount=7;},d=>{d.totals.employeeCount=0;},d=>{d.books[0].bookCount=0;}];
 for(const change of mutations){const value=structuredClone(good);change(value);assert.throws(()=>validatePayrollSourceCoverage(value,month),/RESULT_INVALID/);}
});
test('insurance exact projection rejects private rows, false readiness and inconsistent source categories',()=>{
 const changes=[d=>{delete d.insuranceCoverage;},d=>{d.insuranceCoverage.employeeIds=['private'];},d=>{d.insuranceCoverage.cohortEmployeeCount=2;},d=>{d.insuranceCoverage.neitherCount=0;},d=>{d.insuranceCoverage.modernOnlyCount=1;},d=>{d.insuranceCoverage.noModernRevisionCount=0;},d=>{d.insuranceCoverage.noHistoricalPeriodCount=-1;},d=>{d.insuranceCoverage.historicalNeedsReviewCount=1;}];
 for(const change of changes){const d=structuredClone(good);change(d);assert.throws(()=>validatePayrollSourceCoverage(d,month),/RESULT_INVALID/);}
 const d=structuredClone(good);d.insuranceCoverage={...noInsurance,cohortEmployeeCount:1,bothCount:1};assert.equal(validatePayrollSourceCoverage(d,month).insuranceCoverage.bothCount,1);
});
test('workflow keeps month in env, validates before SSH and retains a separate diagnostic-only artifact',()=>{
 const workflow=readFileSync(new URL('../../.github/workflows/deploy-production.yml',import.meta.url),'utf8');
 const step=workflow.split('- name: Diagnose HR payroll source coverage (read-only)')[1].split('- name: Diagnose Yuzhou personnel alias')[0];
 assert.match(step,/inputs.deploy_mode == 'diagnose-production-runtime-revision' && inputs.diagnose_payroll_readiness && inputs.payroll_coverage_month != ''/);
 assert.match(step,/PAYROLL_COVERAGE_MONTH: \$\{\{ inputs.payroll_coverage_month \}\}/);
 const run=step.split('run: |')[1];assert.doesNotMatch(run,/\$\{\{/);assert.ok(run.indexOf('MONTH_INVALID')<run.indexOf('ssh -p'));
 assert.match(run,/diagnose-hr-payroll-source-coverage\.mjs/);assert.doesNotMatch(run,/prod:deploy|db:migrate|db:seed/);
 assert.match(workflow,/name: hr-payroll-source-coverage-observation/);
});
test('actual diagnostic shell rejects injection before SSH and suppresses private remote errors',()=>{
 const workflow=readFileSync(new URL('../../.github/workflows/deploy-production.yml',import.meta.url),'utf8');
 const step=workflow.split('- name: Diagnose HR payroll source coverage (read-only)')[1].split('- name: Diagnose Yuzhou personnel alias')[0];
 const shell=step.split('run: |')[1].split('\n').map(line=>line.startsWith('          ')?line.slice(10):line).join('\n');
 const dir=mkdtempSync(join(tmpdir(),'payroll-coverage-shell-'));mkdirSync(join(dir,'bin'));
 try {
  writeFileSync(join(dir,'bin','ssh'),'#!/bin/sh\nprintf invoked > "$RUNNER_TEMP/invoked"\nprintf "HR_PAYROLL_COVERAGE_PROBE_FAILED\\nPRIVATE_REMOTE_DETAIL\\n" >&2\nexit 1\n',{mode:0o700});
  const env={...process.env,PATH:`${join(dir,'bin')}:${process.env.PATH}`,RUNNER_TEMP:dir,PROD_SSH_HOST:'synthetic',PROD_SSH_USER:'synthetic',PROD_SSH_PORT:'22',PROD_DEPLOY_PATH:'/synthetic'};
  for(const month of ['2026-07-01\n',"2026-07-01'; touch /tmp/forbidden",'2026-00-01','2026-07-02']) {
   const result=spawnSync('bash',['-c',shell],{env:{...env,PAYROLL_COVERAGE_MONTH:month},encoding:'utf8'});
   assert.notEqual(result.status,0);assert.match(result.stderr,/MONTH_INVALID/);assert.equal(existsSync(join(dir,'invoked')),false);
  }
  const result=spawnSync('bash',['-c',shell],{env:{...env,PAYROLL_COVERAGE_MONTH:'2026-07-01'},encoding:'utf8'});
  assert.notEqual(result.status,0);assert.equal(existsSync(join(dir,'invoked')),true);assert.match(result.stderr,/HR_PAYROLL_COVERAGE_REMOTE_FAILED/);assert.doesNotMatch(result.stderr,/PRIVATE_REMOTE_DETAIL/);
 } finally {rmSync(dir,{recursive:true,force:true});}
});
