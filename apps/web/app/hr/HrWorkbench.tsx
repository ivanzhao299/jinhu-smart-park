"use client";

import { HR_PERMISSIONS } from "@jinhu/shared";
import { Award, BadgeDollarSign, CalendarDays, CheckCircle2, ChevronRight, ClipboardCheck, FileClock, FileText, GraduationCap, ListChecks, Network, RefreshCw, ShieldCheck, Sparkles, Target, UserRoundSearch, UsersRound } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PermissionGuard } from "../../components/auth/PermissionGuard";
import { useAuthUser } from "../../lib/auth-context";
import { getAccessToken } from "../../lib/authz";
import { ApiError, isForbiddenError } from "../../lib/api-client";
import { hrApi } from "../../lib/hr-api";
import { hasAnyPermission, hasPermission } from "../../lib/permissions";
import styles from "./hr-workbench.module.css";

type Metric = { value: number; detail: string };
type MetricState = Metric | "unavailable" | "error" | null;
interface Snapshot { recruitment:MetricState; lifecycle:MetricState; training:MetricState; rewards:MetricState; employees: MetricState; contracts:MetricState; attendance:MetricState; insurance:MetricState; goals: MetricState; reports: MetricState; performance: MetricState; feedback: MetricState; talent:MetricState; approvals:MetricState; payroll:MetricState }
const EMPTY: Snapshot = { recruitment:null, lifecycle:null, training:null, rewards:null, employees:null, contracts:null, attendance:null, insurance:null, goals:null, reports:null, performance:null, feedback:null, talent:null, approvals:null, payroll:null };
const isOpen = (status: string) => !["completed", "confirmed", "cancelled", "rejected", "paid"].includes(status);
const isEmployeeContextUnavailable = (error: unknown) =>
  isForbiddenError(error) ||
  (error instanceof ApiError && error.status === 404 && error.message === "No employee profile is linked to current user");

export function HrWorkbench() {
  const user = useAuthUser();
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY);
  const [loading, setLoading] = useState(true);
  const canReadEmployees = hasAnyPermission(user, [HR_PERMISSIONS.HR_EMPLOYEE_READ, HR_PERMISSIONS.HR_EMPLOYEE_SELF_READ, HR_PERMISSIONS.HR_WORK_REPORT_TEAM_REVIEW, HR_PERMISSIONS.HR_PERFORMANCE_MANAGER_REVIEW]);
  const canManagePeople = hasAnyPermission(user, [HR_PERMISSIONS.HR_EMPLOYEE_MANAGE, HR_PERMISSIONS.HR_EMPLOYMENT_TRANSITION, HR_PERMISSIONS.HR_EMPLOYEE_PROFILE_MANAGE]);
  const canReviewTeam = hasAnyPermission(user, [HR_PERMISSIONS.HR_WORK_REPORT_TEAM_REVIEW, HR_PERMISSIONS.HR_PERFORMANCE_MANAGER_REVIEW, HR_PERMISSIONS.HR_APPROVAL_REVIEW]);

  const load = useCallback(async () => {
    const token = getAccessToken();
    const next: Snapshot = { ...EMPTY };
    const jobs: Promise<void>[] = [];
    const add = (key: keyof Snapshot, job: Promise<Metric>) => jobs.push(job.then((metric) => { next[key] = metric; }).catch((error: unknown) => { next[key] = isEmployeeContextUnavailable(error) ? "unavailable" : "error"; }));
    setLoading(true);

    if (canReadEmployees) {
      const selfOnly = hasPermission(user, HR_PERMISSIONS.HR_EMPLOYEE_SELF_READ) && !hasAnyPermission(user, [HR_PERMISSIONS.HR_EMPLOYEE_READ, HR_PERMISSIONS.HR_WORK_REPORT_TEAM_REVIEW, HR_PERMISSIONS.HR_PERFORMANCE_MANAGER_REVIEW]);
      const source = selfOnly
        ? hrApi.me(token).then((employee) => ({ value: employee.employmentStatus === "departed" ? 0 : 1, detail: "本人任职档案" }))
        : hrApi.employees(token).then((result) => ({ value: result.total, detail: `当前页展示 ${result.items.length} 份档案` }));
      add("employees", source);
    }
    if(hasAnyPermission(user,[HR_PERMISSIONS.HR_REQUISITION_READ,HR_PERMISSIONS.HR_REQUISITION_TEAM_READ]))add("recruitment",hrApi.recruitmentRequisitions(token,1,1,{status:"open"}).then(result=>({value:result.total,detail:"开放中的招聘需求"})));
    if(hasAnyPermission(user,[HR_PERMISSIONS.HR_LIFECYCLE_READ,HR_PERMISSIONS.HR_LIFECYCLE_TEAM_READ,HR_PERMISSIONS.HR_LIFECYCLE_SELF_READ]))add("lifecycle",hrApi.lifecycleChecklists(token,1,1).then(result=>({value:result.total,detail:"当前可见入离职任务"})));
    if(hasAnyPermission(user,[HR_PERMISSIONS.HR_TRAINING_READ,HR_PERMISSIONS.HR_TRAINING_TEAM_READ,HR_PERMISSIONS.HR_TRAINING_SELF_READ]))add("training",hrApi.trainingPlans(token,1,1).then(result=>({value:result.total,detail:"当前可见培训任务"})));
    if(hasAnyPermission(user,[HR_PERMISSIONS.HR_REWARD_READ,HR_PERMISSIONS.HR_REWARD_TEAM_READ,HR_PERMISSIONS.HR_REWARD_SELF_READ]))add("rewards",hrApi.rewardCases(token,1,1).then(result=>({value:result.total,detail:"当前可见奖惩事项"})));
    if(hasAnyPermission(user,[HR_PERMISSIONS.HR_CONTRACT_READ,HR_PERMISSIONS.HR_CONTRACT_TEAM_READ,HR_PERMISSIONS.HR_CONTRACT_SELF_READ])){
      const selfOnly=hasPermission(user,HR_PERMISSIONS.HR_CONTRACT_SELF_READ)&&!hasAnyPermission(user,[HR_PERMISSIONS.HR_CONTRACT_READ,HR_PERMISSIONS.HR_CONTRACT_TEAM_READ]);
      add("contracts",hrApi.contracts(token,1,1,{},selfOnly).then(result=>({value:result.total,detail:"当前可见劳动合同"})));
    }
    if(hasAnyPermission(user,[HR_PERMISSIONS.HR_ATTENDANCE_READ,HR_PERMISSIONS.HR_ATTENDANCE_TEAM_READ,HR_PERMISSIONS.HR_ATTENDANCE_SELF_READ]))add("attendance",hrApi.attendanceCalendars(token,1,1).then(result=>({value:result.total,detail:"旧系统历史月历模板"})));
    if(hasAnyPermission(user,[HR_PERMISSIONS.HR_INSURANCE_READ,HR_PERMISSIONS.HR_INSURANCE_TEAM_READ,HR_PERMISSIONS.HR_INSURANCE_SELF_READ])){
      const selfOnly=hasPermission(user,HR_PERMISSIONS.HR_INSURANCE_SELF_READ)&&!hasAnyPermission(user,[HR_PERMISSIONS.HR_INSURANCE_READ,HR_PERMISSIONS.HR_INSURANCE_TEAM_READ]);
      add("insurance",hrApi.insurancePeriods(token,1,1,{},selfOnly).then(result=>({value:result.total,detail:"当前可见月度社保记录"})));
    }
    if (hasAnyPermission(user, [HR_PERMISSIONS.HR_GOAL_READ, HR_PERMISSIONS.HR_GOAL_SELF_READ])) {
      add("goals", hrApi.goals(!hasPermission(user, HR_PERMISSIONS.HR_GOAL_READ), token).then((goals) => ({ value: goals.filter((item) => isOpen(item.status)).length, detail: `共 ${goals.length} 项可见目标` })));
    }
    if (hasPermission(user, HR_PERMISSIONS.HR_WORK_REPORT_TEAM_REVIEW)) {
      add("reports", hrApi.teamWorkReports(token).then((rows) => ({ value: rows.filter((item) => item.status === "submitted").length, detail: "待审核团队汇报" })));
    } else if (hasPermission(user, HR_PERMISSIONS.HR_WORK_REPORT_SELF_MANAGE)) {
      add("reports", hrApi.myWorkReports(token).then((rows) => ({ value: rows.filter((item) => item.status === "returned").length, detail: "退回待修改汇报" })));
    }
    if (hasPermission(user, HR_PERMISSIONS.HR_PERFORMANCE_MANAGER_REVIEW)) {
      add("performance", hrApi.teamPerformancePlans(token).then((rows) => ({ value: rows.filter((item) => isOpen(item.status)).length, detail: "团队绩效待处理" })));
    } else if (hasPermission(user, HR_PERMISSIONS.HR_PERFORMANCE_SELF_REVIEW)) {
      add("performance", hrApi.myPerformancePlans(token).then((rows) => ({ value: rows.filter((item) => isOpen(item.status)).length, detail: "个人绩效待处理" })));
    }
    if (hasPermission(user, HR_PERMISSIONS.HR_FEEDBACK_RESPOND)) add("feedback", hrApi.myFeedbackAssignments(token).then((rows) => ({ value: rows.filter((item) => isOpen(item.status)).length, detail: "待完成 360 评价" })));
    if(hasAnyPermission(user,[HR_PERMISSIONS.HR_TALENT_READ,HR_PERMISSIONS.HR_TALENT_TEAM_READ,HR_PERMISSIONS.HR_TALENT_SELF_READ,HR_PERMISSIONS.HR_DEVELOPMENT_MANAGE,HR_PERMISSIONS.HR_DEVELOPMENT_SELF_ACTION]))add("talent",hrApi.developmentPlans(token).then(rows=>({value:rows.flatMap(x=>x.actions).filter(x=>isOpen(x.status)).length,detail:"待推进发展行动"})));
    if (hasPermission(user, HR_PERMISSIONS.HR_APPROVAL_REVIEW)) {
      add("approvals", hrApi.pendingApprovals(token).then((rows) => ({ value: rows.filter((item) => item.status === "pending").length, detail: "待审核人事申请" })));
    } else if (hasPermission(user, HR_PERMISSIONS.HR_APPROVAL_SELF_MANAGE)) {
      add("approvals", hrApi.myApprovals(token).then((rows) => ({ value: rows.filter((item) => ["draft", "pending"].includes(item.status)).length, detail: "我的进行中申请" })));
    }
    if (hasPermission(user, HR_PERMISSIONS.HR_PAYROLL_READ)) {
      add("payroll", hrApi.payrollRuns(token).then((rows) => ({ value: rows.filter((item) => isOpen(item.status)).length, detail: "进行中工资批次" })));
    } else if (hasPermission(user, HR_PERMISSIONS.HR_PAYSLIP_SELF_READ)) {
      add("payroll", hrApi.myPayslips(token).then((rows) => ({ value: rows.length, detail: "可查看工资条" })));
    }
    await Promise.all(jobs);
    setSnapshot(next);
    setLoading(false);
  }, [canReadEmployees, user]);

  useEffect(() => { void load(); }, [load]);
  const cards = useMemo(() => [
    { key: "recruitment", title: "招聘管理", href: "/hr/recruitment", icon: UserRoundSearch, group: "人员运营", attention: true },
    { key: "lifecycle", title: "入离职办理", href: "/hr/lifecycle", icon: ListChecks, group: "人员运营", attention: true },
    { key: "employees", title: "员工档案", href: "/hr/employees", icon: UsersRound, group: "人员运营", attention: false },
    { key: "contracts", title: "劳动合同", href: "/hr/contracts", icon: FileText, group: "人员运营", attention: false },
    { key: "training", title: "培训管理", href: "/hr/training", icon: GraduationCap, group: "组织效能", attention: true },
    { key: "rewards", title: "奖惩管理", href: "/hr/rewards", icon: Award, group: "组织效能", attention: true },
    { key: "goals", title: "战略与目标", href: "/hr/goals", icon: Target, group: "组织效能", attention: true },
    { key: "reports", title: "工作汇报", href: "/hr/work-reports", icon: FileClock, group: "组织效能", attention: true },
    { key: "performance", title: "绩效考核", href: "/hr/performance", icon: ClipboardCheck, group: "组织效能", attention: true },
    { key: "feedback", title: "360 评价", href: "/hr/feedback-360", icon: Network, group: "组织效能", attention: true },
    { key: "talent", title: "人才发展", href: "/hr/talent", icon: Sparkles, group: "组织效能", attention: true },
    { key: "approvals", title: "人事审批", href: "/hr/approvals", icon: ClipboardCheck, group: "人员运营", attention: true },
    { key: "attendance", title: "考勤管理", href: "/hr/attendance", icon: CalendarDays, group: "薪酬保障", attention: false },
    { key: "insurance", title: "五险一金", href: "/hr/insurance", icon: ShieldCheck, group: "薪酬保障", attention: false },
    { key: "payroll", title: hasPermission(user, HR_PERMISSIONS.HR_PAYROLL_READ) ? "工资核算" : "我的工资条", href: "/hr/payroll", icon: BadgeDollarSign, group: "薪酬保障", attention: hasPermission(user, HR_PERMISSIONS.HR_PAYROLL_READ) }
  ].filter((item) => snapshot[item.key as keyof Snapshot] !== null), [snapshot, user]);
  const attentionCards = cards.filter(({ key, attention }) => { const metric = snapshot[key as keyof Snapshot]; return metric === "error" || (attention && typeof metric === "object" && metric !== null && metric.value > 0); });
  const groups = ["人员运营", "组织效能", "薪酬保障"].map((title) => ({ title, items: cards.filter((item) => item.group === title) })).filter((group) => group.items.length > 0);
  const roleLabel = canManagePeople ? "人力资源工作台" : canReviewTeam ? "团队管理工作台" : "我的人事工作台";
  const forbidden = <main className={`content ds-page ${styles.page}`}><section className="ds-panel"><h1>无权访问人力资源管理</h1><p>当前账号缺少人力资源模块或工作台权限，请联系系统管理员授权。</p></section></main>;

  return <PermissionGuard module="hr" permission="hr:dashboard" fallback={forbidden}><main className={`content ds-page ${styles.page}`}>
    <section className={styles.workbenchHeader}><div><span className="ds-eyebrow">人力资源管理</span><h1>{roleLabel}</h1><p>处理员工、目标、汇报、绩效、审批与薪酬事项。</p></div><button className="ds-button ds-button-secondary" type="button" onClick={() => void load()} disabled={loading}><RefreshCw size={16}/>{loading ? "刷新中" : "刷新"}</button></section>
    <section aria-labelledby="hr-overview-title" className={styles.section}><header className={styles.sectionHeader}><div><span className="ds-eyebrow">今日工作</span><h2 id="hr-overview-title">待办与提醒</h2></div><span className={styles.sectionMeta}>{attentionCards.length} 类事项需要关注</span></header>
      {loading ? <div className={`ds-panel ${styles.loadingPanel}`}>正在加载工作台…</div> : attentionCards.length ? <div className={`ds-kpi-grid ${styles.metricGrid}`}>{attentionCards.map(({ key, title, href, icon: Icon }) => { const metric = snapshot[key as keyof Snapshot]; if (metric === null) return null; const unavailable = metric === "unavailable"; const failed = metric === "error"; return <Link className={`ds-kpi-card ${styles.metricCard}`} href={href as Route} key={key}><span className={styles.metricIcon}><Icon size={19}/></span><span className={styles.metricLabel}>{title}</span><strong>{unavailable ? "—" : failed ? "!" : metric.value}</strong><small>{unavailable ? "当前范围暂无访问权限" : failed ? "加载失败，可刷新重试" : metric.detail}</small><ChevronRight className={styles.metricArrow} size={18}/></Link>; })}</div> : <div className={`ds-panel ${styles.allClear}`}><span className={styles.allClearIcon}><CheckCircle2 size={22}/></span><div><strong>当前没有待处理事项</strong><p>已授权范围内的招聘、合同、目标、汇报、绩效、审批和工资任务均无待办。</p></div></div>}
    </section>
    <section className={styles.section} aria-labelledby="hr-shortcuts-title"><header className={styles.sectionHeader}><div><span className="ds-eyebrow">业务导航</span><h2 id="hr-shortcuts-title">按场景办理</h2></div></header><div className={styles.businessGroups}>{groups.map((group) => <section className={`ds-panel ${styles.businessGroup}`} key={group.title}><header><h3>{group.title}</h3><span>{group.items.length} 个入口</span></header><div className={`ds-command-grid ${styles.shortcutGrid}`}>{group.items.map(({ key, title, href, icon: Icon }) => <Link className={`ds-command-card ${styles.shortcutCard}`} href={href as Route} key={key}><span className={styles.shortcutIcon}><Icon size={18}/></span><strong>{title}</strong><ChevronRight size={16}/></Link>)}</div></section>)}</div></section>
  </main></PermissionGuard>;
}
