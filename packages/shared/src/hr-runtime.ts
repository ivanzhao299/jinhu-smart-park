import type {EnterpriseBusinessScopeContext} from './business-scope';
export type HrApplicationRuntimeMode='integrated'|'hr_enterprise';
export interface EnterpriseContext {enterprise_id:string;scope_key:string;enterprise_code:string;enterprise_name:string;}
export interface HrEnterpriseRuntimeContext {
 runtime_mode:'hr_enterprise';
 business_scope:EnterpriseBusinessScopeContext;
 current_enterprise:EnterpriseContext;
 accessible_enterprises:EnterpriseContext[];
}

/** Canonical UUID remains public identity; fixed 32-character key is only the legacy storage bridge. */
export function enterpriseStorageScopeKey(enterpriseId:string):string {
 if(typeof enterpriseId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(enterpriseId))throw new Error('Invalid enterprise identity');
 return enterpriseId.replaceAll('-','').toLowerCase();
}
export const HR_ENTERPRISE_PAGE_ROUTES:Readonly<Record<string,string>>={
 'hr:dashboard':'/hr','hr:decision_center':'/hr/decision-center','hr:organization':'/hr/organization','hr:employees':'/hr/employees','hr:legacy_archive':'/hr/employees/legacy','hr:legacy_unclaimed':'/hr/employees/unclaimed','hr:recruitment':'/hr/recruitment','hr:lifecycle':'/hr/lifecycle','hr:contracts':'/hr/contracts','hr:employee_reminders':'/hr/employee-reminders','hr:attendance':'/hr/attendance','hr:insurance':'/hr/insurance','hr:compensation':'/hr/compensation','hr:payroll':'/hr/payroll','hr:goals':'/hr/goals','hr:work_reports':'/hr/work-reports','hr:performance':'/hr/performance','hr:feedback_360':'/hr/feedback-360','hr:talent':'/hr/talent','hr:training':'/hr/training','hr:rewards':'/hr/rewards','hr:approvals':'/hr/approvals'
};

/** Canonical server-owned page names, independent of API permission display names. */
export const HR_ENTERPRISE_PAGE_LABELS:Readonly<Record<string,string>>={
  "hr:dashboard": "人力资源工作台",
  "hr:decision_center": "人力资源决策中心",
  "hr:organization": "组织与岗位",
  "hr:employees": "员工档案",
  "hr:legacy_archive": "档案沿革",
  "hr:legacy_unclaimed": "待认领档案",
  "hr:recruitment": "招聘管理",
  "hr:lifecycle": "入离职办理",
  "hr:contracts": "劳动合同",
  "hr:employee_reminders": "员工重要日期提醒",
  "hr:attendance": "考勤管理",
  "hr:insurance": "五险一金",
  "hr:compensation": "薪酬方案",
  "hr:payroll": "工资核算",
  "hr:goals": "战略与目标",
  "hr:work_reports": "工作汇报",
  "hr:performance": "绩效考核",
  "hr:feedback_360": "360评价",
  "hr:talent": "人才发展",
  "hr:training": "培训管理",
  "hr:rewards": "奖惩管理",
  "hr:approvals": "人事审批"
};
