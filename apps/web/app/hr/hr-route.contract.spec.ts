import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

test("HR top-level route keeps the authenticated dashboard and visible permission fallback", () => {
  const layout = readFileSync(resolve(__dirname, "layout.tsx"), "utf8");
  const workbench = readFileSync(resolve(__dirname, "HrWorkbench.tsx"), "utf8");

  assert.match(layout, /import \{ DashboardLayout \}/);
  assert.match(layout, /<DashboardLayout>\{children\}<\/DashboardLayout>/);
  assert.match(workbench, /module="hr"/);
  assert.match(workbench, /permission="hr:dashboard"/);
  assert.match(workbench, /无权访问人力资源管理/);
});

test("HR operational forms collapse to one column on phone width", () => {
  const styles = readFileSync(resolve(__dirname, "hr-workbench.module.css"), "utf8");
  const organization = readFileSync(resolve(__dirname, "organization/HrOrganizationClient.tsx"), "utf8");
  const reports = readFileSync(resolve(__dirname, "work-reports/HrWorkReportsClient.tsx"), "utf8");

  assert.match(styles, /@media \(max-width: 520px\)[\s\S]*\.formGrid\s*\{[\s\S]*grid-template-columns:\s*1fr/);
  assert.match(styles, /\.capabilityCard\s*\{[\s\S]*grid-template-columns:\s*1fr/);
  assert.match(organization, /ds-mobile-record-list/);
  assert.match(organization, /type="number" min="0" max="100000" step="1"/);
  assert.match(reports, /ds-mobile-record-list/);
  assert.match(reports, /type="number" min="0" max="744" step="0\.25"/);
});

test("HR M3 key pages keep shared mobile record and overflow contracts",()=>{
  const styles=readFileSync(resolve(__dirname,"hr-workbench.module.css"),"utf8");
  const workbench=readFileSync(resolve(__dirname,"HrWorkbench.tsx"),"utf8");
  const pages=["employees/HrEmployeesClient.tsx","work-reports/HrWorkReportsClient.tsx","performance/HrPerformanceClient.tsx","feedback-360/HrFeedbackClient.tsx","payroll/HrPayrollClient.tsx","approvals/HrApprovalsClient.tsx"];
  assert.match(workbench,/ds-command-grid/);
  for(const page of pages){
    const source=readFileSync(resolve(__dirname,page),"utf8");
    assert.match(source,/ds-page/,`${page} must use ds-page`);
    assert.match(source,/ds-mobile-record-list/,`${page} must expose mobile records`);
    assert.match(source,/ds-mobile-record/,`${page} must render mobile record cards`);
  }
  assert.match(styles,/overflow-wrap:\s*anywhere/);
  assert.match(styles,/\.formGrid input,[\s\S]*max-width:\s*100%/);
  assert.match(styles,/@media \(max-width: 520px\)[\s\S]*min-height:\s*44px/);
});

test("department manager directory stays team-scoped without broad employee permission",()=>{
  const employeePage=readFileSync(resolve(__dirname,"employees/HrEmployeesClient.tsx"),"utf8");
  const seed=readFileSync(resolve(__dirname,"../../../../database/seeds/production/000017_hr_department_manager_directory.sql"),"utf8");
  assert.match(employeePage,/HR_WORK_REPORT_TEAM_REVIEW/);
  assert.match(employeePage,/HR_PERFORMANCE_MANAGER_REVIEW/);
  assert.match(employeePage,/canReadAll\|\|canReadTeam\?\(await hrApi\.employees/);
  assert.match(employeePage,/isForbiddenError/);
  assert.match(employeePage,/ForbiddenState/);
  assert.match(seed,/code='DEPARTMENT_MANAGER'/);
  assert.match(seed,/code='hr:employees'/);
  assert.doesNotMatch(seed,/hr:employee:read|hr:employee_profile:read|hr:payroll:read/);
});
