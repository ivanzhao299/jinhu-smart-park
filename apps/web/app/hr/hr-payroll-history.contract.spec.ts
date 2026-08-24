import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const payroll=readFileSync(resolve(__dirname,"payroll/HrPayrollClient.tsx"),"utf8");
const css=readFileSync(resolve(__dirname,"payroll/payroll.module.css"),"utf8");
const api=readFileSync(resolve(__dirname,"../../lib/hr-api.ts"),"utf8");

test("T4 payroll API contracts use exact paged history and review routes",()=>{
  for(const route of ["/hr/payroll/history?","/hr/payroll/history/${id}","/hr/payroll/history/${id}/items","/hr/payroll/history-books?","/hr/payroll/history-items?","/hr/payroll/history-formulas?","/hr/payroll/history-review-cases?"]){
    assert.ok(api.includes(route),`missing API route ${route}`);
  }
  assert.match(api,/PaginatedResult<HrPayrollHistoryRow>/);
  assert.match(api,/PaginatedResult<HrPayrollReviewCase>/);
  assert.match(api,/idempotencyKey:crypto\.randomUUID\(\)/);
});

test("T4 payroll work areas fail closed before sensitive requests",()=>{
  for(const permission of ["HR_PAYROLL_HISTORY_READ","HR_PAYROLL_HISTORY_SELF_READ","HR_PAYROLL_HISTORY_TEAM_SUMMARY","HR_PAYROLL_RULE_READ","HR_PAYROLL_FORMULA_REVIEW"]){
    assert.match(payroll,new RegExp(`HR_PERMISSIONS\\.${permission}`));
  }
  assert.match(payroll,/area==="history"&&\(canHistory\|\|canSelfHistory\)/);
  assert.match(payroll,/area==="rules"&&canRules/);
  assert.match(payroll,/availableAreas\.length===0/);
  assert.match(payroll,/const canReadOnline=hasPermission\(user,HR_PERMISSIONS\.HR_PAYROLL_READ\);/);
  assert.doesNotMatch(payroll,/canReadOnline=.*\|\|canManage/);
  assert.doesNotMatch(payroll,/payrollHistoryTeamSummary\(/);
});

test("T4 payroll history is paged, stale-safe, and clears sensitive detail",()=>{
  assert.match(payroll,/<Pager page=\{result\.page\}/);
  assert.match(payroll,/abort\.current\?\.abort\(\)/);
  assert.match(payroll,/request\.current!==generation\.current/);
  assert.match(payroll,/setFilters\(\{periodFrom,periodTo\}\)/);
  assert.match(payroll,/setSelected\(null\);setDetailTarget\(null\);setItems\(\[\]\);setDetailState\("empty"\)/);
  assert.match(payroll,/detailAbort\.current\?\.abort\(\)/);
  assert.match(payroll,/result\.total===0/);
  for(const state of ["loading","forbidden","error","empty"]){assert.match(payroll,new RegExp(`state===?"${state}"|state===\\"${state}\\"`));}
});

test("T4 payroll uses DS mobile records and hides sensitive management on phone",()=>{
  assert.match(payroll,/ds-panel/);
  assert.match(payroll,/ds-mobile-record-list/);
  assert.match(payroll,/ds-mobile-record/);
  assert.match(css,/@media \(max-width:720px\)/);
  assert.match(css,/\.desktopSensitive \{ display:none; \}/);
  assert.doesNotMatch(payroll,/付款|银行代发|正式发薪/);
});
