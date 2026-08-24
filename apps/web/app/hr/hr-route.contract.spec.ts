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
  assert.match(employeePage,/if\(canReadAll\|\|canReadTeam\)\{const result=await hrApi\.employees/);
  assert.match(employeePage,/isForbiddenError/);
  assert.match(employeePage,/ForbiddenState/);
  assert.match(seed,/code='DEPARTMENT_MANAGER'/);
  assert.match(seed,/code='hr:employees'/);
  assert.doesNotMatch(seed,/hr:employee:read|hr:employee_profile:read|hr:payroll:read/);
});

test("HR M4 workbench is operational and removes delivery-plan copy",()=>{
  const workbench=readFileSync(resolve(__dirname,"HrWorkbench.tsx"),"utf8");
  assert.match(workbench,/今日工作/);
  assert.match(workbench,/快速办理/);
  assert.match(workbench,/hrApi\.pendingApprovals/);
  assert.match(workbench,/hrApi\.teamWorkReports/);
  assert.match(workbench,/isEmployeeContextUnavailable\(error\) \? "unavailable" : "error"/);
  assert.match(workbench,/No employee profile is linked to current user/);
  assert.match(workbench,/当前范围暂无访问权限/);
  assert.match(workbench,/加载失败，可刷新重试/);
  assert.doesNotMatch(workbench,/\.catch\(\(\) => undefined\)/);
  assert.doesNotMatch(workbench,/规划能力|交付路线|基础期|执行期|绩效期|薪酬期/);
});

test("HR M4 employee directory is list-first with explicit create and filters",()=>{
  const employees=readFileSync(resolve(__dirname,"employees/HrEmployeesClient.tsx"),"utf8");
  assert.match(employees,/createOpen\?"收起新增":"新增员工"/);
  assert.match(employees,/canManage&&createOpen\?<form/);
  assert.match(employees,/type="search"/);
  assert.match(employees,/statusFilter/);
  assert.match(employees,/visibleRows\.map/);
  assert.match(employees,/rows\.length<total/);
  assert.match(employees,/加载更多员工/);
});

test("HR M4 work reports are record-first and keep write forms behind explicit actions",()=>{
  const reports=readFileSync(resolve(__dirname,"work-reports/HrWorkReportsClient.tsx"),"utf8");
  assert.match(reports,/填写汇报/);
  assert.match(reports,/showCreate \? <form/);
  assert.match(reports,/团队待审/);
  assert.match(reports,/<details className=\{styles\.actionDisclosure\}>/);
  assert.match(reports,/mine\.length === 0/);
});

test("HR M4 goals use an execution ledger with explicit actions",()=>{
  const goals=readFileSync(resolve(__dirname,"goals/HrGoalsClient.tsx"),"utf8");
  assert.match(goals,/目标台账/);
  assert.match(goals,/分解目标/);
  assert.match(goals,/action === "goal" \? <form/);
  assert.match(goals,/action === "checkin" \? <form/);
  assert.match(goals,/当前范围暂无目标/);
});

test("HR M4 performance separates personal and manager queues",()=>{
  const performance=readFileSync(resolve(__dirname,"performance/HrPerformanceClient.tsx"),"utf8");
  assert.match(performance,/团队待办/);
  assert.match(performance,/setup === "plan" \? <form/);
  assert.match(performance,/填写员工自评/);
  assert.match(performance,/填写主管评价/);
  assert.match(performance,/执行 HR 校准/);
});

test("HR M4 360 feedback uses explicit setup and personal task actions",()=>{
  const feedback=readFileSync(resolve(__dirname,"feedback-360/HrFeedbackClient.tsx"),"utf8");
  assert.match(feedback,/待我评价/);
  assert.match(feedback,/action === "cycle" \? <form/);
  assert.match(feedback,/action === "assignment" \? <form/);
  assert.match(feedback,/<details className=\{styles\.actionDisclosure\}>/);
  assert.match(feedback,/当前没有需要处理的 360 评价/);
});

test("mobile dashboard navigation is hidden by default and requires an explicit open class",()=>{
  const layout=readFileSync(resolve(__dirname,"../../components/layout/DashboardLayout.tsx"),"utf8");
  const globals=readFileSync(resolve(__dirname,"../globals.css"),"utf8");
  assert.match(layout,/mobileNavigation && !sidebarCollapsed \? " mobile-navigation-open"/);
  const finalMobileBlock=globals.slice(globals.lastIndexOf("@media (max-width: 720px)"));
  const defaultSidebarRule=finalMobileBlock.match(/\.dashboard-shell \.app-sidebar\s*\{([^}]*)\}/)?.[1]??"";
  assert.match(defaultSidebarRule,/display:\s*none/);
  assert.doesNotMatch(defaultSidebarRule,/display:\s*block/);
  assert.match(globals,/\.dashboard-shell\.mobile-navigation-open \.app-sidebar\s*\{[\s\S]*display:\s*block/);
});
