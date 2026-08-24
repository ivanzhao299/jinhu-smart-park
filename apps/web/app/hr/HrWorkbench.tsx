"use client";

import { HR_PERMISSIONS } from "@jinhu/shared";
import { BadgeDollarSign, CalendarDays, ClipboardCheck, FileClock, FileText, Network, RefreshCw, ShieldCheck, Target, UserRoundSearch, UsersRound } from "lucide-react";
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
interface Snapshot { recruitment:MetricState; employees: MetricState; contracts:MetricState; attendance:MetricState; insurance:MetricState; goals: MetricState; reports: MetricState; performance: MetricState; feedback: MetricState; approvals: MetricState; payroll: MetricState }
const EMPTY: Snapshot = { recruitment:null, employees: null, contracts:null, attendance:null, insurance:null, goals: null, reports: null, performance: null, feedback: null, approvals: null, payroll: null };
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
    { key: "recruitment", title: "招聘管理", href: "/hr/recruitment", icon: UserRoundSearch },
    { key: "employees", title: "在职员工", href: "/hr/employees", icon: UsersRound },
    { key: "contracts", title: "劳动合同", href: "/hr/contracts", icon: FileText },
    { key: "attendance", title: "考勤管理", href: "/hr/attendance", icon: CalendarDays },
    { key: "insurance", title: "五险一金", href: "/hr/insurance", icon: ShieldCheck },
    { key: "goals", title: "进行中目标", href: "/hr/goals", icon: Target },
    { key: "reports", title: "工作汇报", href: "/hr/work-reports", icon: FileClock },
    { key: "performance", title: "绩效任务", href: "/hr/performance", icon: ClipboardCheck },
    { key: "feedback", title: "360 评价", href: "/hr/feedback-360", icon: Network },
    { key: "approvals", title: "人事审批", href: "/hr/approvals", icon: ClipboardCheck },
    { key: "payroll", title: hasPermission(user, HR_PERMISSIONS.HR_PAYROLL_READ) ? "工资批次" : "我的工资条", href: "/hr/payroll", icon: BadgeDollarSign }
  ].filter((item) => snapshot[item.key as keyof Snapshot] !== null), [snapshot, user]);
  const roleLabel = canManagePeople ? "人力资源工作台" : canReviewTeam ? "团队管理工作台" : "我的人事工作台";
  const forbidden = <main className="content ds-page"><section className="ds-panel"><h1>无权访问人力资源管理</h1><p>当前账号缺少人力资源模块或工作台权限，请联系系统管理员授权。</p></section></main>;

  return <PermissionGuard module="hr" permission="hr:dashboard" fallback={forbidden}><main className={`content ds-page ${styles.page}`}>
    <section className={styles.workbenchHeader}><div><span className="ds-eyebrow">人力资源管理</span><h1>{roleLabel}</h1><p>处理员工、目标、汇报、绩效、审批与薪酬事项。</p></div><button className="ds-button ds-button-secondary" type="button" onClick={() => void load()} disabled={loading}><RefreshCw size={16}/>{loading ? "刷新中" : "刷新"}</button></section>
    <section aria-labelledby="hr-overview-title" className={styles.section}><header className={styles.sectionHeader}><div><span className="ds-eyebrow">今日工作</span><h2 id="hr-overview-title">需要关注的事项</h2></div></header>
      {loading ? <div className={`ds-panel ${styles.loadingPanel}`}>正在加载工作台…</div> : cards.length ? <div className={`ds-kpi-grid ${styles.metricGrid}`}>{cards.map(({ key, title, href, icon: Icon }) => { const metric = snapshot[key as keyof Snapshot]; if (metric === null) return null; const unavailable = metric === "unavailable"; const failed = metric === "error"; return <Link className={`ds-kpi-card ${styles.metricCard}`} href={href as Route} key={key}><span className={styles.metricIcon}><Icon size={19}/></span><strong>{unavailable ? "—" : failed ? "!" : metric.value}</strong><span>{title}</span><small>{unavailable ? "当前范围暂无访问权限" : failed ? "加载失败，可刷新重试" : metric.detail}</small></Link>; })}</div> : <div className="ds-panel">当前账号暂无可汇总的 HR 事项。</div>}
    </section>
    <section className={styles.section} aria-labelledby="hr-shortcuts-title"><header className={styles.sectionHeader}><div><span className="ds-eyebrow">常用入口</span><h2 id="hr-shortcuts-title">快速办理</h2></div></header><div className={`ds-command-grid ${styles.shortcutGrid}`}>{cards.map(({ key, title, href, icon: Icon }) => <Link className="ds-command-card" href={href as Route} key={key}><Icon size={20}/><strong>{title}</strong><span>进入办理</span></Link>)}</div></section>
  </main></PermissionGuard>;
}
