import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const payroll=readFileSync(resolve(__dirname,"payroll/HrPayrollClient.tsx"),"utf8");
const css=readFileSync(resolve(__dirname,"payroll/payroll.module.css"),"utf8");
const api=readFileSync(resolve(__dirname,"../../lib/hr-api.ts"),"utf8");

test("T4 payroll API contracts use exact paged history and review routes",()=>{
  for(const route of ["/hr/payroll/history?","/hr/payroll/history/${id}","/hr/payroll/history/${id}/items","/hr/payroll/history-books?","/hr/payroll/history-tax-rules?","/hr/payroll/history-items?","/hr/payroll/history-formulas?","/hr/payroll/history-review-cases?"]){
    assert.ok(api.includes(route),`missing API route ${route}`);
  }
  assert.match(api,/PaginatedResult<HrPayrollHistoryRow>/);
  assert.match(api,/PaginatedResult<HrPayrollTaxRule>/);
  assert.match(api,/PaginatedResult<HrPayrollReviewCase>/);
  assert.match(api,/idempotencyKey:\s*crypto\.randomUUID\(\)/);
});

test("M3 historical tax rule catalog is paged, semantics-safe, and phone-visible",()=>{
  assert.match(api,/interface HrPayrollTaxRule \{legacyTaxId:number;versionNo:number;baseAmount:string\|null;lowerLimit:string\|null;upperLimit:string\|null;taxPercent:string\|null;offsetAmount:string\|null;semanticsStatus:"pending_review";\}/);
  const taxApi=api.slice(api.indexOf("payrollHistoryTaxRules"),api.indexOf("payrollHistoryCatalogItems"));
  for(const forbidden of ["sourceHash","tenantId","parkId","createTime","updateTime","employeeId","grossAmount","netAmount"])assert.doesNotMatch(taxApi,new RegExp(forbidden));
  assert.match(payroll,/payrollHistoryTaxRules\(getAccessToken\(\),taxPage,20,controller\.signal\)/);
  assert.match(payroll,/<Pager page=\{taxRules\.page\} pageSize=\{taxRules\.page_size\} total=\{taxRules\.total\} onPage=\{setTaxPage\}\/>/);
  assert.match(payroll,/暂无历史税率规则。/);
  assert.match(payroll,/税率单位、区间边界、舍入和期间语义待复核；仅展示历史规则，不代表旧系统计算等价。/);
  assert.match(payroll,/税率原始值 \{decimalText\(rule\.taxPercent\)\}/);
  assert.doesNotMatch(payroll,/taxPercent\)}%/);
  assert.match(payroll,/<\/div><section className="ds-panel" aria-labelledby="history-tax-rules-heading">[\s\S]*className="ds-mobile-record"/);
  assert.match(payroll,/if\(state==="loading"\|\|state==="forbidden"\|\|state==="error"\)return <StatePanel/);
});

test("T4 payroll work areas fail closed before sensitive requests",()=>{
  for(const permission of ["HR_PAYROLL_HISTORY_READ","HR_PAYROLL_HISTORY_SELF_READ","HR_PAYROLL_HISTORY_TEAM_SUMMARY","HR_PAYROLL_RULE_READ","HR_PAYROLL_FORMULA_REVIEW"]){
    assert.match(payroll,new RegExp(`HR_PERMISSIONS\\.${permission}`));
  }
  assert.match(payroll,/area\s*===\s*"history"\s*&&\s*\(canHistory\s*\|\|\s*canSelfHistory\)/);
  assert.match(payroll,/area\s*===\s*"rules"\s*&&\s*canRules/);
  assert.match(payroll,/availableAreas\.length\s*===\s*0/);
  assert.match(payroll,/const canReadOnline\s*=\s*hasPermission\(user,\s*HR_PERMISSIONS\.HR_PAYROLL_READ\);/);
  assert.doesNotMatch(payroll,/canReadOnline=.*\|\|canManage/);
  assert.doesNotMatch(payroll,/payrollHistoryTeamSummary\(/);
  assert.match(payroll,/ReconciliationWorkbench/);
  assert.match(payroll,/SIMULATION · 不可发薪/);
  assert.match(payroll,/desktopSensitive/);
  assert.match(payroll,/payrollReconciliations/);
});

test("T4 payroll history is paged, stale-safe, and clears sensitive detail",()=>{
  assert.match(payroll,/<Pager\s+page=\{result\.page\}/);
  assert.match(payroll,/abort\.current\?\.abort\(\)/);
  assert.match(payroll,/request\.current\s*!==\s*generation\.current/);
  assert.match(payroll,/setFilters\(\{\s*periodFrom,\s*periodTo\s*\}\)/);
  assert.match(payroll,/setSelected\(null\);\s*setDetailTarget\(null\);\s*setItems\(\[\]\);\s*setDetailState\("empty"\)/);
  assert.match(payroll,/detailAbort\.current\?\.abort\(\)/);
  assert.match(payroll,/result\.total\s*===\s*0/);
  for(const state of ["loading","forbidden","error","empty"]){assert.match(payroll,new RegExp(`state\\s*===\\s*"${state}"`));}
});

test("T4 payroll uses DS mobile records and hides sensitive management on phone",()=>{
  assert.match(payroll,/ds-panel/);
  assert.match(payroll,/ds-mobile-record-list/);
  assert.match(payroll,/ds-mobile-record/);
  assert.match(css,/@media \(max-width:720px\)/);
  assert.match(css,/\.desktopSensitive \{ display:none; \}/);
  assert.doesNotMatch(payroll,/付款|银行代发|正式发薪/);
});
