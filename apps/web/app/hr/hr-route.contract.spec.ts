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
  assert.match(employees,/keyword:query\.trim\(\),status:statusFilter/);
  assert.match(employees,/window\.setTimeout\(\(\)=>void load\(\),300\)/);
  assert.match(employees,/当前员工详情不在您的数据权限范围内/);
  assert.match(employees,/employeeContracts/);
  assert.match(employees,/员工生命周期/);
  assert.match(employees,/进入合同台账/);
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

test("HR M4 approvals separate applicant records from reviewer queue",()=>{
  const approvals=readFileSync(resolve(__dirname,"approvals/HrApprovalsClient.tsx"),"utf8");
  assert.match(approvals,/待我审核/);
  assert.match(approvals,/showCreate \? <form/);
  assert.match(approvals,/审核申请/);
  assert.match(approvals,/提交审核/);
  assert.match(approvals,/重新提交/);
  assert.match(approvals,/撤回/);
  assert.match(approvals,/hrLoadErrorMessage\(error, "加载审批失败"\)/);
});

test("HR M4 payroll keeps review, freeze and correction controls explicit",()=>{
  const payroll=readFileSync(resolve(__dirname,"payroll/HrPayrollClient.tsx"),"utf8");
  assert.match(payroll,/待复核/);
  assert.match(payroll,/待确认/);
  assert.match(payroll,/setup === "run" \? <form/);
  assert.match(payroll,/确认并冻结/);
  assert.match(payroll,/校正工资条/);
  assert.match(payroll,/仅限本人数据/);
});

test("HR M4 compensation keeps plan ledger separate from sensitive assignment",()=>{
  const compensation=readFileSync(resolve(__dirname,"compensation/HrCompensationClient.tsx"),"utf8");
  assert.match(compensation,/方案台账/);
  assert.match(compensation,/action === "plan" \? <form/);
  assert.match(compensation,/action === "assignment" \? <form/);
  assert.match(compensation,/排除已离职员工/);
  assert.match(compensation,/仅对授权人事人员开放/);
});

test("HR M5 labor contracts are list-first, server-filtered, and history-aware",()=>{
  const contracts=readFileSync(resolve(__dirname,"contracts/HrContractsClient.tsx"),"utf8");
  const api=readFileSync(resolve(__dirname,"../../lib/hr-api.ts"),"utf8");
  const menu=readFileSync(resolve(__dirname,"../../lib/menu.ts"),"utf8");
  assert.match(contracts,/劳动合同/);
  assert.match(contracts,/姓名、员工编号或合同编号/);
  assert.match(contracts,/加载更多/);
  assert.match(contracts,/续签与变更历史/);
  assert.match(contracts,/旧系统历史记录/);
  assert.match(contracts,/hrLoadErrorMessage\(error,"加载劳动合同失败"\)/);
  assert.match(contracts,/if\(!canRead\)return/);
  assert.match(contracts,/fallback=\{forbidden\}/);
  assert.match(contracts,/canManage/);
  assert.match(contracts,/新建合同/);
  assert.match(contracts,/办理续签\/变更/);
  assert.match(contracts,/保存合同草稿/);
  assert.match(contracts,/保存变更草稿/);
  assert.match(contracts,/确认生效/);
  assert.match(contracts,/确认变更/);
  assert.match(contracts,/selected\.isHistoricalImport/);
  assert.match(contracts,/setAction\(null\);try\{setSelected/);
  assert.match(api,/createContract:/);
  assert.match(api,/createContractChange:/);
  assert.match(api,/contractAction:/);
  assert.match(api,/contractChangeAction:/);
  assert.match(api,/expiry_from/);
  assert.match(api,/expiry_to/);
  assert.match(api,/\/hr\/contracts/);
  assert.match(menu,/"\/hr\/contracts"/);
});

test("HR M6 historical attendance and insurance ledgers are scoped, paged, and mobile-first",()=>{
 const attendance=readFileSync(resolve(__dirname,"attendance/HrAttendanceClient.tsx"),"utf8");
 const insurance=readFileSync(resolve(__dirname,"insurance/HrInsuranceClient.tsx"),"utf8");
 const api=readFileSync(resolve(__dirname,"../../lib/hr-api.ts"),"utf8");
 const menu=readFileSync(resolve(__dirname,"../../lib/menu.ts"),"utf8");
 for(const page of [attendance,insurance]){assert.match(page,/ds-page/);assert.match(page,/ds-mobile-record-list/);assert.match(page,/ds-mobile-record/);assert.match(page,/加载更多/);assert.match(page,/if\(!canRead\)return/);}
 assert.match(attendance,/这些日期不是员工实际出勤记录/);
 assert.match(attendance,/未知符号保留待复核/);
 assert.match(insurance,/单位成本仅向 HR 授权岗位开放/);
 assert.match(insurance,/selfOnly/);
 assert.match(insurance,/full\?<span>单位缴费/);
 assert.match(api,/attendanceCalendars:/);
 assert.match(api,/insurancePeriods:/);
 assert.match(api,/insurancePeriod:/);
 assert.match(menu,/"\/hr\/attendance"/);
 assert.match(menu,/"\/hr\/insurance"/);
});

test("HR M6 attendance requests expose explicit self and approval actions without unauthorized calls",()=>{
 const attendance=readFileSync(resolve(__dirname,"attendance/HrAttendanceClient.tsx"),"utf8");const api=readFileSync(resolve(__dirname,"../../lib/hr-api.ts"),"utf8");
 assert.match(attendance,/canRequest=hasPermission\(user,HR_PERMISSIONS\.HR_ATTENDANCE_REQUEST\)/);assert.match(attendance,/canApprove=hasPermission\(user,HR_PERMISSIONS\.HR_ATTENDANCE_APPROVE\)/);assert.match(attendance,/新建申请/);assert.match(attendance,/保存草稿/);assert.match(attendance,/重新提交/);assert.match(attendance,/取消申请/);assert.match(attendance,/退回补充/);assert.match(attendance,/canApprove&&!row\.isSelf&&row\.status==="submitted"/);assert.match(attendance,/ds-mobile-record-list/);assert.match(attendance,/type="datetime-local"/);assert.match(attendance,/type="date"/);
 for(const method of ["attendanceRequests","createAttendanceRequest","submitAttendanceRequest","cancelAttendanceRequest","reviewAttendanceRequest"])assert.match(api,new RegExp(`${method}:`));assert.match(api,/idempotencyKey:crypto\.randomUUID\(\)/);
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

test("mobile header actions retain the shared 44px touch target",()=>{
  const globals=readFileSync(resolve(__dirname,"../globals.css"),"utf8");
  const mobileHeaderStart=globals.lastIndexOf("@media (max-width: 720px)",globals.lastIndexOf(".app-header .header-actions"));
  const mobileHeaderEnd=globals.indexOf("\n}\n",globals.indexOf(".app-header .user-menu .user-logout-button {",mobileHeaderStart))+3;
  const mobileHeaderBlock=globals.slice(mobileHeaderStart,mobileHeaderEnd);
  assert.match(mobileHeaderBlock,/grid-auto-columns:\s*var\(--form-control-height-touch\)/);
  assert.match(mobileHeaderBlock,/width:\s*var\(--form-control-height-touch\)/);
  assert.match(mobileHeaderBlock,/height:\s*var\(--form-control-height-touch\)/);
});
