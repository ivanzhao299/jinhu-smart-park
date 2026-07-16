"use client";

import { AlertTriangle, ArrowRight, BarChart3, CheckCircle2, ClipboardCheck, FileCheck2, FileText, Gauge, HardHat, ListTodo, RefreshCw, Save, ShieldCheck, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import type { FormEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { UserContext } from "@jinhu/shared";
import { PermissionGuard } from "../../../components/auth/PermissionGuard";
import { useMobileTerminalMode } from "../../../components/mobile/useMobileTerminalMode";
import { useAuthUser } from "../../../lib/auth-context";
import { getAccessToken } from "../../../lib/authz";
import { engineeringDashboardApi } from "../../../lib/engineering-dashboard-api";
import type { EngineeringDashboardOverview } from "../../../lib/engineering-dashboard-types";
import { engineeringDailyReportsApi } from "../../../lib/engineering-daily-reports-api";
import { engineeringWeatherTypeOptions } from "../../../lib/engineering-daily-reports-display";
import type { CreateEngineeringDailyReportInput, EngineeringWeatherType } from "../../../lib/engineering-daily-reports-types";
import { todayDateString } from "../../../lib/engineering-daily-reports-utils";
import { hasModule, hasPermission } from "../../../lib/permissions";
import { engineeringAcceptancesApi } from "../../../lib/engineering-acceptances-api";
import { engineeringAcceptanceTypeOptions } from "../../../lib/engineering-acceptances-display";
import { ENGINEERING_ACCEPTANCE_PERMISSIONS, hasEngineeringAcceptancePermission } from "../../../lib/engineering-acceptances-permissions";
import type { CreateEngineeringAcceptanceInput, EngineeringAcceptance, EngineeringAcceptanceType } from "../../../lib/engineering-acceptances-types";
import { engineeringProjectsApi } from "../../../lib/engineering-projects-api";
import { engineeringProjectStatusLabels, engineeringRiskLevelOptions, projectStatusVariant } from "../../../lib/engineering-projects-display";
import type { EngineeringProject, EngineeringRiskLevel } from "../../../lib/engineering-projects-types";
import { engineeringRectificationsApi } from "../../../lib/engineering-rectifications-api";
import { engineeringRectificationActionLabels, engineeringRectificationStatusLabels } from "../../../lib/engineering-rectifications-display";
import { ENGINEERING_RECTIFICATION_PERMISSIONS, hasEngineeringRectificationPermission } from "../../../lib/engineering-rectifications-permissions";
import type { EngineeringRectification, EngineeringRectificationAction, EngineeringRectificationActionInput } from "../../../lib/engineering-rectifications-types";
import { availableRectificationActions } from "../../../lib/engineering-rectifications-utils";
import styles from "./engineering-mobile-terminal.module.css";

const emptyDashboard: EngineeringDashboardOverview = {
  summary: {
    project_total: 0,
    executing_project_count: 0,
    pending_rectification_count: 0,
    overdue_rectification_count: 0,
    today_inspection_count: 0,
    weekly_daily_report_count: 0,
    pending_acceptance_count: 0,
    acceptance_pass_rate: 0,
    rectification_close_rate: 0
  },
  project_status_distribution: [],
  project_type_distribution: [],
  plan_status_distribution: [],
  issue_severity_distribution: [],
  rectification_status_distribution: [],
  acceptance_status_distribution: [],
  contractor_rectification_ranking: [],
  generated_at: ""
};

const ENGINEERING_DASHBOARD_PERMISSION = "ENGINEERING_DASHBOARD_VIEW";
const ENGINEERING_PROJECT_PERMISSION = "ENGINEERING_PROJECT_VIEW";
const ENGINEERING_PLAN_PERMISSION = "ENGINEERING_PLAN_VIEW";
const ENGINEERING_DAILY_REPORT_PERMISSION = "ENGINEERING_DAILY_REPORT_VIEW";
const ENGINEERING_DAILY_REPORT_CREATE_PERMISSION = "ENGINEERING_DAILY_REPORT_CREATE";
const ENGINEERING_INSPECTION_PERMISSION = "ENGINEERING_INSPECTION_VIEW";
const ENGINEERING_INSPECTION_CREATE_PERMISSION = "ENGINEERING_INSPECTION_CREATE";
const ENGINEERING_RECTIFICATION_PERMISSION = "ENGINEERING_RECTIFICATION_VIEW";
const ENGINEERING_ACCEPTANCE_PERMISSION = "ENGINEERING_ACCEPTANCE_VIEW";

interface EngineeringTerminalModule {
  key: string;
  title: string;
  summary: string;
  href: Route;
  icon: LucideIcon;
  permission: string;
  moduleCode?: string;
}

const ENGINEERING_TERMINAL_MODULES: EngineeringTerminalModule[] = [
  {
    key: "projects",
    title: "工程项目",
    summary: "立项、负责人、状态和预算总入口",
    href: "/engineering/projects",
    icon: HardHat,
    permission: ENGINEERING_PROJECT_PERMISSION,
    moduleCode: "engineering"
  },
  {
    key: "plans",
    title: "工程计划",
    summary: "拆阶段、排节点、跟进执行顺序",
    href: "/engineering/plans",
    icon: ListTodo,
    permission: ENGINEERING_PLAN_PERMISSION,
    moduleCode: "engineering"
  },
  {
    key: "dailyReports",
    title: "施工日报",
    summary: "当天施工、人材机、问题和明日计划",
    href: "/engineering/daily-reports",
    icon: FileText,
    permission: ENGINEERING_DAILY_REPORT_PERMISSION,
    moduleCode: "engineering"
  },
  {
    key: "inspections",
    title: "现场巡检",
    summary: "质量、安全、进度巡检和问题发现",
    href: "/engineering/inspections",
    icon: ClipboardCheck,
    permission: ENGINEERING_INSPECTION_PERMISSION,
    moduleCode: "engineering"
  },
  {
    key: "rectifications",
    title: "整改闭环",
    summary: "逾期、待复查、责任反馈和闭环结果",
    href: "/engineering/rectifications",
    icon: ShieldCheck,
    permission: ENGINEERING_RECTIFICATION_PERMISSION,
    moduleCode: "engineering"
  },
  {
    key: "acceptances",
    title: "工程验收",
    summary: "阶段、专项和竣工验收办理",
    href: "/engineering/acceptances",
    icon: FileCheck2,
    permission: ENGINEERING_ACCEPTANCE_PERMISSION,
    moduleCode: "engineering"
  },
  {
    key: "dashboard",
    title: "工程看板",
    summary: "管理视角查看项目、整改和验收态势",
    href: "/engineering/dashboard",
    icon: BarChart3,
    permission: ENGINEERING_DASHBOARD_PERMISSION,
    moduleCode: "engineering"
  }
];

interface EngineeringRoleGuideCard {
  title: string;
  value: string;
  detail: string;
  href: Route;
  icon: LucideIcon;
  emphasis?: boolean;
}

interface EngineeringRoleGuide {
  title: string;
  summary: string;
  identityLabel: string;
  identityHint: string;
  primaryHref: Route;
  primaryLabel: string;
  moduleOrder: string[];
  chain: string[];
  focusCards: EngineeringRoleGuideCard[];
}

interface EngineeringRoleAction {
  key: string;
  label: string;
  href?: Route;
  kind?: "quickDailyReport" | "quickAcceptance";
  emphasis?: boolean;
}

interface QuickAcceptanceForm {
  projectId: string;
  acceptanceName: string;
  acceptanceType: EngineeringAcceptanceType;
  plannedAcceptanceDate: string;
  riskLevel: EngineeringRiskLevel;
  acceptanceScope: string;
  acceptanceCriteria: string;
}

interface RectificationActionState {
  rectification: EngineeringRectification;
  action: EngineeringRectificationAction;
}

interface QuickDailyReportForm {
  projectId: string;
  reportDate: string;
  weather: EngineeringWeatherType;
  workContent: string;
  completedWork: string;
  tomorrowPlan: string;
  workerCount: string;
  managerCount: string;
  progressPercent: string;
  qualitySummary: string;
  safetySummary: string;
  issueSummary: string;
}

const defaultQuickDailyReportForm: QuickDailyReportForm = {
  projectId: "",
  reportDate: todayDateString(),
  weather: "SUNNY",
  workContent: "",
  completedWork: "",
  tomorrowPlan: "",
  workerCount: "0",
  managerCount: "0",
  progressPercent: "0",
  qualitySummary: "",
  safetySummary: "",
  issueSummary: ""
};

const defaultQuickAcceptanceForm: QuickAcceptanceForm = {
  projectId: "",
  acceptanceName: "",
  acceptanceType: "STAGE",
  plannedAcceptanceDate: todayDateString(),
  riskLevel: "MEDIUM",
  acceptanceScope: "",
  acceptanceCriteria: ""
};

export function EngineeringMobileTerminalClient() {
  const authUser = useAuthUser();
  useMobileTerminalMode(["mobile-terminal-mode", "operations-terminal-safe-area", "engineering-terminal-mode"]);

  const [dashboard, setDashboard] = useState<EngineeringDashboardOverview>(emptyDashboard);
  const [projects, setProjects] = useState<EngineeringProject[]>([]);
  const [rectifications, setRectifications] = useState<EngineeringRectification[]>([]);
  const [acceptances, setAcceptances] = useState<EngineeringAcceptance[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [dailyReportOpen, setDailyReportOpen] = useState(false);
  const [dailyReportSaving, setDailyReportSaving] = useState(false);
  const [dailyReportForm, setDailyReportForm] = useState<QuickDailyReportForm>(defaultQuickDailyReportForm);
  const [rectificationAction, setRectificationAction] = useState<RectificationActionState | null>(null);
  const [rectificationActionSaving, setRectificationActionSaving] = useState(false);
  const [rectificationActionForm, setRectificationActionForm] = useState({ reason: "", feedback: "", recheckComment: "", comment: "" });
  const [acceptanceOpen, setAcceptanceOpen] = useState(false);
  const [acceptanceSaving, setAcceptanceSaving] = useState(false);
  const [acceptanceForm, setAcceptanceForm] = useState<QuickAcceptanceForm>(defaultQuickAcceptanceForm);

  const summary = dashboard.summary;
  const riskCount = summary.overdue_rectification_count + summary.pending_rectification_count + summary.pending_acceptance_count;
  const completionLabel = `${summary.rectification_close_rate}%`;
  const generatedAt = useMemo(() => formatDateTime(dashboard.generated_at), [dashboard.generated_at]);
  const roleLabel = useMemo(() => resolveEngineeringRoleLabel(authUser), [authUser]);
  const visibleModules = useMemo(() => resolveVisibleEngineeringModules(authUser), [authUser]);
  const roleGuide = useMemo(
    () => resolveEngineeringRoleGuide({
      user: authUser,
      roleLabel,
      summary,
      visibleModules
    }),
    [authUser, roleLabel, summary, visibleModules]
  );
  const orderedModules = useMemo(
    () => orderEngineeringModules(visibleModules, roleGuide.moduleOrder),
    [roleGuide.moduleOrder, visibleModules]
  );
  const canQuickDailyReport = useMemo(
    () => Boolean(authUser?.is_super) || hasPermission(authUser, ENGINEERING_DAILY_REPORT_CREATE_PERMISSION),
    [authUser]
  );
  const canCreateInspection = useMemo(
    () => Boolean(authUser?.is_super) || hasPermission(authUser, ENGINEERING_INSPECTION_CREATE_PERMISSION),
    [authUser]
  );
  const canCreateAcceptance = useMemo(
    () => hasEngineeringAcceptancePermission(authUser, ENGINEERING_ACCEPTANCE_PERMISSIONS.CREATE),
    [authUser]
  );
  const roleActions = useMemo(
    () => resolveEngineeringRoleActions({
      user: authUser,
      roleGuide,
      orderedModules,
      visibleModules,
      canQuickDailyReport,
      canCreateInspection,
      canCreateAcceptance
    }),
    [authUser, canCreateAcceptance, canCreateInspection, canQuickDailyReport, orderedModules, roleGuide, visibleModules]
  );

  const loadAll = useCallback(async (options?: { clearMessage?: boolean }) => {
    setLoading(true);
    if (options?.clearMessage !== false) {
      setMessage("");
    }
    const token = getAccessToken();
    const [dashboardResult, projectResult, rectificationResult, acceptanceResult] = await Promise.allSettled([
      engineeringDashboardApi.getOverview(token),
      engineeringProjectsApi.listProjects({ page: 1, page_size: 20, sort: "-updateTime" }, token),
      engineeringRectificationsApi.listRectifications({ page: 1, page_size: 20, sort: "-updateTime" }, token),
      engineeringAcceptancesApi.listAcceptances({ page: 1, page_size: 20, sort: "-updateTime" }, token)
    ]);

    if (dashboardResult.status === "fulfilled") {
      setDashboard(dashboardResult.value);
    }
    if (projectResult.status === "fulfilled") {
      setProjects(projectResult.value.items);
    }
    if (rectificationResult.status === "fulfilled") {
      setRectifications(rectificationResult.value.items);
    }
    if (acceptanceResult.status === "fulfilled") {
      setAcceptances(acceptanceResult.value.items);
    }
    if (dashboardResult.status === "rejected") {
      setMessage(dashboardResult.reason instanceof Error ? dashboardResult.reason.message : "加载工程终端失败");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  function openQuickDailyReport() {
    if (loading) {
      setMessage("工程项目正在同步，请稍候再试。");
      return;
    }
    setDailyReportForm({
      ...defaultQuickDailyReportForm,
      projectId: projects[0]?.id ?? "",
      reportDate: todayDateString()
    });
    setMessage("");
    setDailyReportOpen(true);
  }

  async function submitQuickDailyReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validateQuickDailyReportForm(dailyReportForm);
    if (validation) {
      setMessage(validation);
      return;
    }
    setDailyReportSaving(true);
    setMessage("");
    try {
      const saved = await engineeringDailyReportsApi.createDailyReport(toQuickDailyReportInput(dailyReportForm), getAccessToken());
      setDailyReportOpen(false);
      await loadAll({ clearMessage: false });
      setMessage(`施工日报已保存：${saved.reportCode}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存施工日报失败");
    } finally {
      setDailyReportSaving(false);
    }
  }

  function setQuickDailyReportValue<K extends keyof QuickDailyReportForm>(key: K, value: QuickDailyReportForm[K]) {
    setDailyReportForm((current) => ({ ...current, [key]: value }));
  }

  function openQuickAcceptance() {
    if (loading) {
      setMessage("工程项目正在同步，请稍候再试。");
      return;
    }
    setAcceptanceForm({
      ...defaultQuickAcceptanceForm,
      projectId: projects[0]?.id ?? "",
      plannedAcceptanceDate: todayDateString()
    });
    setMessage("");
    setAcceptanceOpen(true);
  }

  async function submitQuickAcceptance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validateQuickAcceptanceForm(acceptanceForm);
    if (validation) {
      setMessage(validation);
      return;
    }
    setAcceptanceSaving(true);
    setMessage("");
    try {
      const saved = await engineeringAcceptancesApi.createAcceptance(toQuickAcceptanceInput(acceptanceForm), getAccessToken());
      setAcceptanceOpen(false);
      await loadAll({ clearMessage: false });
      setMessage(`工程验收已发起：${saved.acceptanceCode}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "发起工程验收失败");
    } finally {
      setAcceptanceSaving(false);
    }
  }

  function setQuickAcceptanceValue<K extends keyof QuickAcceptanceForm>(key: K, value: QuickAcceptanceForm[K]) {
    setAcceptanceForm((current) => ({ ...current, [key]: value }));
  }

  function openRectificationAction(rectification: EngineeringRectification, action: EngineeringRectificationAction) {
    setRectificationAction({ rectification, action });
    setRectificationActionForm({
      reason: engineeringRectificationActionLabels[action],
      feedback: rectification.feedback ?? "",
      recheckComment: rectification.recheckComment ?? "",
      comment: ""
    });
    setMessage("");
  }

  async function submitRectificationAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!rectificationAction) return;
    const validation = validateRectificationActionForm(rectificationAction.action, rectificationActionForm);
    if (validation) {
      setMessage(validation);
      return;
    }
    setRectificationActionSaving(true);
    setMessage("");
    try {
      const input: EngineeringRectificationActionInput = {
        action: rectificationAction.action,
        reason: emptyToUndefined(rectificationActionForm.reason),
        feedback: emptyToUndefined(rectificationActionForm.feedback),
        recheck_comment: emptyToUndefined(rectificationActionForm.recheckComment),
        comment: emptyToUndefined(rectificationActionForm.comment)
      };
      const saved = await engineeringRectificationsApi.executeRectificationAction(rectificationAction.rectification.id, input, getAccessToken());
      setRectificationAction(null);
      await loadAll({ clearMessage: false });
      setMessage(`整改任务已更新：${engineeringRectificationStatusLabels[saved.status]}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "执行整改动作失败");
    } finally {
      setRectificationActionSaving(false);
    }
  }

  return (
    <PermissionGuard module="engineering" permission="ENGINEERING_DASHBOARD_VIEW" fallback={<TerminalForbidden />}>
      <main className={`content ds-page ${styles.page}`}>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow} data-testid="engineering-terminal-role-badge">工程终端 · {roleGuide.identityLabel}</span>
            <h1 data-testid="engineering-terminal-headline">{roleGuide.title}</h1>
            <p>{roleGuide.summary}</p>
            <div className={styles.heroActions} data-testid="engineering-terminal-hero-actions">
              {roleActions.map((action, index) => {
                const className = action.emphasis || index === 0 ? styles.primaryAction : styles.secondaryAction;
                if (action.kind === "quickDailyReport") {
                  return (
                    <button className={className} data-testid={`engineering-terminal-action-${action.key}`} disabled={loading} key={action.key} type="button" onClick={openQuickDailyReport}>
                      {action.label}
                    </button>
                  );
                }
                if (action.kind === "quickAcceptance") {
                  return (
                    <button className={className} data-testid={`engineering-terminal-action-${action.key}`} disabled={loading} key={action.key} type="button" onClick={openQuickAcceptance}>
                      {action.label}
                    </button>
                  );
                }
                return (
                  <Link className={className} data-testid={`engineering-terminal-action-${action.key}`} href={action.href ?? roleGuide.primaryHref} key={action.key}>
                    {action.label}
                  </Link>
                );
              })}
            </div>
            <div className={styles.heroMeta}>
              <span>{roleGuide.identityHint}</span>
              <span>{generatedAt ? `更新 ${generatedAt}` : loading ? "正在同步工程数据" : "等待工程数据"}</span>
            </div>
          </div>
          <button className={styles.refreshButton} type="button" onClick={() => void loadAll()} aria-label="刷新工程终端">
            <RefreshCw size={18} />
          </button>
          <div className={styles.heroStats}>
            <Metric label="项目" value={summary.project_total} />
            <Metric label="施工中" value={summary.executing_project_count} />
            <Metric label="待处理" value={riskCount} />
          </div>
        </section>

        {message ? <p className={`${styles.message} ${isSuccessMessage(message) ? styles.messageSuccess : ""}`} data-testid="engineering-terminal-message">{message}</p> : null}

        <section className={styles.panel}>
          <div className={styles.sectionHeader}>
            <div>
              <h2>今日动作</h2>
            </div>
          </div>
          <div className={styles.focusGrid} aria-label="工程角色重点动作">
            {roleGuide.focusCards.map((item) => {
              const Icon = item.icon;
              return (
                <Link className={`${styles.focusCard} ${item.emphasis ? styles.focusCardEmphasis : ""}`} href={item.href} key={item.title}>
                  <span className={styles.focusIcon}><Icon size={20} /></span>
                  <div className={styles.focusBody}>
                    <strong>{item.title}</strong>
                    <b>{item.value}</b>
                    <small>{item.detail}</small>
                  </div>
                  <ArrowRight size={18} />
                </Link>
              );
            })}
          </div>
          <div className={styles.chainStrip} aria-label="工程闭环顺序">
            {roleGuide.chain.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </section>

        <section className={styles.statusStrip} aria-label="工程关键指标">
          <StatusItem icon={<ClipboardCheck size={17} />} label="今日巡检" value={summary.today_inspection_count} />
          <StatusItem icon={<BarChart3 size={17} />} label="近 7 日日报" value={summary.weekly_daily_report_count} />
          <StatusItem icon={<AlertTriangle size={17} />} label="逾期整改" value={summary.overdue_rectification_count} emphasis={summary.overdue_rectification_count > 0} />
          <StatusItem icon={<Gauge size={17} />} label="关闭率" value={completionLabel} />
        </section>

        <section className={styles.panel}>
          <div className={styles.sectionHeader}>
            <div>
              <h2>功能入口</h2>
            </div>
          </div>
          <div className={styles.moduleGrid} aria-label="工程模块入口">
            {orderedModules.map((item) => {
              const Icon = item.icon;
              return (
                <Link className={styles.moduleCard} href={item.href} key={item.key}>
                  <div className={styles.moduleCardHead}>
                    <span className={styles.moduleIcon}><Icon size={20} /></span>
                    <span className={styles.moduleBadge}>{resolveEngineeringModuleBadge(item.key, summary)}</span>
                  </div>
                  <div className={styles.moduleBody}>
                    <strong>{item.title}</strong>
                    <small>{item.summary}</small>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2>我的工程</h2>
              <span>{generatedAt ? `更新 ${generatedAt}` : loading ? "正在加载" : "暂无更新时间"}</span>
            </div>
            <Link href="/engineering/projects">全部</Link>
          </div>
          <div className={styles.projectList}>
            {projects.length > 0 ? projects.slice(0, 4).map((project) => (
              <Link className={styles.projectCard} href={`/engineering/projects/${project.id}`} key={project.id}>
                <div>
                  <strong>{project.projectName}</strong>
                  <span>{project.projectCode}</span>
                </div>
                <ProjectStatus status={project.status} />
              </Link>
            )) : (
              <EmptyBlock title={loading ? "正在读取工程项目" : "暂无工程项目"} detail="先从工程项目中心创建项目，移动终端会自动聚合。">
                <Link href="/engineering/projects/new">新建项目</Link>
              </EmptyBlock>
            )}
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2>整改待办</h2>
              <span>优先处理逾期、高风险、待复查事项</span>
            </div>
            <Link href="/engineering/rectifications">全部</Link>
          </div>
          <div className={styles.todoList}>
            {rectifications.length > 0 ? rectifications.slice(0, 6).map((item) => {
              const action = resolveQuickRectificationAction(authUser, item);
              return (
                <article className={styles.todoCard} data-testid={`engineering-terminal-rectification-${item.id}`} key={item.id}>
                  <Link className={styles.todoCardMain} href={`/engineering/rectifications/${item.id}`}>
                    <span>{item.rectificationCode} · {engineeringRectificationStatusLabels[item.status]}</span>
                    <strong>{item.rectificationTitle}</strong>
                    <small>{item.deadline ? `期限 ${formatDate(item.deadline)}` : "未设置期限"}</small>
                  </Link>
                  {action ? (
                    <button className={styles.todoAction} data-testid={`rectification-action-${action.toLowerCase()}`} type="button" onClick={() => openRectificationAction(item, action)}>
                      {engineeringRectificationActionLabels[action]}
                    </button>
                  ) : null}
                </article>
              );
            }) : (
              <EmptyBlock title={loading ? "正在读取整改任务" : "暂无整改待办"} detail="巡检发现问题后，整改任务会在这里出现。" />
            )}
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2>验收办理</h2>
              <span>阶段、专项、竣工和移交预验收</span>
            </div>
            {canCreateAcceptance ? <button className={styles.panelAction} data-testid="engineering-terminal-quick-acceptance" type="button" onClick={openQuickAcceptance}>发起</button> : <Link href="/engineering/acceptances">全部</Link>}
          </div>
          <div className={styles.todoList}>
            {acceptances.length > 0 ? acceptances.slice(0, 4).map((item) => (
              <Link className={styles.acceptanceCard} href={`/engineering/acceptances/${item.id}`} key={item.id}>
                <span className={styles.acceptanceIcon}><CheckCircle2 size={20} /></span>
                <div>
                  <strong>{item.acceptanceName}</strong>
                  <small>{item.acceptanceCode} · {item.plannedAcceptanceDate.slice(0, 10)}</small>
                </div>
                <span className={styles.acceptanceStatus}>{item.acceptanceStatus === "DRAFT" ? "草稿" : item.acceptanceStatus === "SUBMITTED" ? "待验收" : engineeringAcceptanceTypeOptions.find((option) => option.value === item.acceptanceType)?.label}</span>
              </Link>
            )) : (
              <EmptyBlock title={loading ? "正在读取验收事项" : "暂无验收事项"} detail="项目具备验收条件后，可直接从工程终端发起。">
                {canCreateAcceptance ? <button type="button" onClick={openQuickAcceptance}>发起验收</button> : null}
              </EmptyBlock>
            )}
          </div>
        </section>

        {dailyReportOpen ? (
          <div className={styles.mobileDrawerBackdrop} role="presentation">
            <section className={styles.mobileDrawer} aria-label="快速新建施工日报" data-testid="engineering-terminal-quick-daily-report-drawer">
              <header className={styles.mobileDrawerHeader}>
                <div>
                  <span>施工日报</span>
                  <h2>快速新建日报</h2>
                  <p>记录今日施工内容，保存后可在完整页面补充附件和更多资料。</p>
                </div>
                <button type="button" onClick={() => setDailyReportOpen(false)} aria-label="关闭">
                  <X size={22} />
                </button>
              </header>
              <form className={styles.mobileDrawerForm} data-testid="engineering-terminal-quick-daily-report-form" onSubmit={(event) => void submitQuickDailyReport(event)}>
                {projects.length === 0 ? (
                  <div className={styles.drawerEmptyNotice} role="status">
                    <strong>暂无可填报的工程项目</strong>
                    <span>先创建或分配工程项目，再返回这里提交施工日报。</span>
                    <Link href="/engineering/projects/new">创建工程项目</Link>
                  </div>
                ) : null}
                <label>
                  所属项目
                  <select data-testid="quick-daily-project" required value={dailyReportForm.projectId} onChange={(event) => setQuickDailyReportValue("projectId", event.target.value)}>
                    <option value="">请选择项目</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>{project.projectName}</option>
                    ))}
                  </select>
                </label>
                <div className={styles.twoColumnFields}>
                  <label>
                    日期
                    <input data-testid="quick-daily-date" required type="date" value={dailyReportForm.reportDate} onChange={(event) => setQuickDailyReportValue("reportDate", event.target.value)} />
                  </label>
                  <label>
                    天气
                    <select data-testid="quick-daily-weather" value={dailyReportForm.weather} onChange={(event) => setQuickDailyReportValue("weather", event.target.value as EngineeringWeatherType)}>
                      {engineeringWeatherTypeOptions.map((item) => (
                        <option key={item.value} value={item.value}>{item.label}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <label>
                  今日施工内容
                  <textarea data-testid="quick-daily-work-content" required value={dailyReportForm.workContent} placeholder="例如：A5 楼三层消防管线安装，完成支架定位和部分管线敷设。" onChange={(event) => setQuickDailyReportValue("workContent", event.target.value)} />
                </label>
                <label>
                  已完成工作
                  <textarea data-testid="quick-daily-completed-work" value={dailyReportForm.completedWork} placeholder="可填写今日完成量、关键节点或照片说明。" onChange={(event) => setQuickDailyReportValue("completedWork", event.target.value)} />
                </label>
                <label>
                  明日计划
                  <textarea data-testid="quick-daily-tomorrow-plan" value={dailyReportForm.tomorrowPlan} placeholder="可填写明日施工安排、材料/人员需求。" onChange={(event) => setQuickDailyReportValue("tomorrowPlan", event.target.value)} />
                </label>
                <div className={styles.threeColumnFields}>
                  <label>
                    工人
                    <input data-testid="quick-daily-worker-count" min="0" type="number" value={dailyReportForm.workerCount} onChange={(event) => setQuickDailyReportValue("workerCount", event.target.value)} />
                  </label>
                  <label>
                    管理
                    <input data-testid="quick-daily-manager-count" min="0" type="number" value={dailyReportForm.managerCount} onChange={(event) => setQuickDailyReportValue("managerCount", event.target.value)} />
                  </label>
                  <label>
                    进度 %
                    <input data-testid="quick-daily-progress-percent" max="100" min="0" type="number" value={dailyReportForm.progressPercent} onChange={(event) => setQuickDailyReportValue("progressPercent", event.target.value)} />
                  </label>
                </div>
                <label>
                  质量情况
                  <textarea data-testid="quick-daily-quality-summary" value={dailyReportForm.qualitySummary} placeholder="可填写质量检查、偏差或整改要求。" onChange={(event) => setQuickDailyReportValue("qualitySummary", event.target.value)} />
                </label>
                <label>
                  安全文明施工
                  <textarea data-testid="quick-daily-safety-summary" value={dailyReportForm.safetySummary} placeholder="可填写安全交底、临边防护、动火/用电等情况。" onChange={(event) => setQuickDailyReportValue("safetySummary", event.target.value)} />
                </label>
                <label>
                  存在问题
                  <textarea data-testid="quick-daily-issue-summary" value={dailyReportForm.issueSummary} placeholder="可填写需协调问题，后续可转巡检问题或整改任务。" onChange={(event) => setQuickDailyReportValue("issueSummary", event.target.value)} />
                </label>
                <footer className={styles.mobileDrawerFooter}>
                  <Link className={styles.fullFormLink} href="/engineering/daily-reports/new">完整表单</Link>
                  <button className={styles.saveButton} data-testid="quick-daily-save" disabled={dailyReportSaving || projects.length === 0} type="submit">
                    <Save size={18} />
                    {dailyReportSaving ? "保存中" : "保存日报"}
                  </button>
                </footer>
              </form>
            </section>
          </div>
        ) : null}

        {rectificationAction ? (
          <div className={styles.mobileDrawerBackdrop} role="presentation">
            <section className={styles.mobileDrawer} aria-label="整改任务处理" data-testid="engineering-terminal-rectification-drawer">
              <header className={styles.mobileDrawerHeader}>
                <div>
                  <span>整改闭环</span>
                  <h2>{engineeringRectificationActionLabels[rectificationAction.action]}</h2>
                  <p>{rectificationAction.rectification.rectificationTitle}</p>
                </div>
                <button type="button" onClick={() => setRectificationAction(null)} aria-label="关闭"><X size={22} /></button>
              </header>
              <form className={styles.mobileDrawerForm} data-testid="engineering-terminal-rectification-form" onSubmit={(event) => void submitRectificationAction(event)}>
                <label>
                  动作原因
                  <input data-testid="rectification-action-reason" value={rectificationActionForm.reason} onChange={(event) => setRectificationActionForm((current) => ({ ...current, reason: event.target.value }))} />
                </label>
                {rectificationAction.action === "START" || rectificationAction.action === "SUBMIT" ? (
                  <label>
                    整改反馈{rectificationAction.action === "SUBMIT" ? " *" : ""}
                    <textarea data-testid="rectification-action-feedback" value={rectificationActionForm.feedback} placeholder="填写处理措施、完成情况和现场结果" onChange={(event) => setRectificationActionForm((current) => ({ ...current, feedback: event.target.value }))} />
                  </label>
                ) : null}
                {rectificationAction.action === "START_RECHECK" || rectificationAction.action === "PASS" || rectificationAction.action === "REJECT" ? (
                  <label>
                    复查意见{rectificationAction.action === "REJECT" ? " *" : ""}
                    <textarea data-testid="rectification-action-recheck-comment" value={rectificationActionForm.recheckComment} placeholder="填写复查结论或驳回原因" onChange={(event) => setRectificationActionForm((current) => ({ ...current, recheckComment: event.target.value }))} />
                  </label>
                ) : null}
                <label>
                  备注
                  <textarea data-testid="rectification-action-comment" value={rectificationActionForm.comment} onChange={(event) => setRectificationActionForm((current) => ({ ...current, comment: event.target.value }))} />
                </label>
                <footer className={styles.mobileDrawerFooter}>
                  <Link className={styles.fullFormLink} href={`/engineering/rectifications/${rectificationAction.rectification.id}`}>查看详情</Link>
                  <button className={styles.saveButton} data-testid="rectification-action-save" disabled={rectificationActionSaving} type="submit">
                    <Save size={18} />{rectificationActionSaving ? "处理中" : "确认提交"}
                  </button>
                </footer>
              </form>
            </section>
          </div>
        ) : null}

        {acceptanceOpen ? (
          <div className={styles.mobileDrawerBackdrop} role="presentation">
            <section className={styles.mobileDrawer} aria-label="快速发起工程验收" data-testid="engineering-terminal-acceptance-drawer">
              <header className={styles.mobileDrawerHeader}>
                <div>
                  <span>工程验收</span>
                  <h2>发起验收</h2>
                  <p>选择项目并明确验收范围和标准，保存后进入验收流程。</p>
                </div>
                <button type="button" onClick={() => setAcceptanceOpen(false)} aria-label="关闭"><X size={22} /></button>
              </header>
              <form className={styles.mobileDrawerForm} data-testid="engineering-terminal-acceptance-form" onSubmit={(event) => void submitQuickAcceptance(event)}>
                {projects.length === 0 ? (
                  <div className={styles.drawerEmptyNotice} role="status">
                    <strong>暂无可验收的工程项目</strong>
                    <span>先创建或分配工程项目，再返回这里发起工程验收。</span>
                    <Link href="/engineering/projects/new">创建工程项目</Link>
                  </div>
                ) : null}
                <label>
                  所属项目
                  <select data-testid="quick-acceptance-project" required value={acceptanceForm.projectId} onChange={(event) => setQuickAcceptanceValue("projectId", event.target.value)}>
                    <option value="">请选择项目</option>
                    {projects.map((project) => <option key={project.id} value={project.id}>{project.projectName}</option>)}
                  </select>
                </label>
                <label>
                  验收名称
                  <input data-testid="quick-acceptance-name" required value={acceptanceForm.acceptanceName} placeholder="例如：A1 楼消防安装阶段验收" onChange={(event) => setQuickAcceptanceValue("acceptanceName", event.target.value)} />
                </label>
                <div className={styles.twoColumnFields}>
                  <label>
                    验收类型
                    <select data-testid="quick-acceptance-type" value={acceptanceForm.acceptanceType} onChange={(event) => setQuickAcceptanceValue("acceptanceType", event.target.value as EngineeringAcceptanceType)}>
                      {engineeringAcceptanceTypeOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                    </select>
                  </label>
                  <label>
                    计划日期
                    <input data-testid="quick-acceptance-date" required type="date" value={acceptanceForm.plannedAcceptanceDate} onChange={(event) => setQuickAcceptanceValue("plannedAcceptanceDate", event.target.value)} />
                  </label>
                </div>
                <label>
                  风险等级
                  <select data-testid="quick-acceptance-risk" value={acceptanceForm.riskLevel} onChange={(event) => setQuickAcceptanceValue("riskLevel", event.target.value as EngineeringRiskLevel)}>
                    {engineeringRiskLevelOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </label>
                <label>
                  验收范围
                  <textarea data-testid="quick-acceptance-scope" required value={acceptanceForm.acceptanceScope} placeholder="填写楼栋、楼层、专业和本次验收边界" onChange={(event) => setQuickAcceptanceValue("acceptanceScope", event.target.value)} />
                </label>
                <label>
                  验收标准
                  <textarea data-testid="quick-acceptance-criteria" required value={acceptanceForm.acceptanceCriteria} placeholder="填写图纸、规范、合同或检查标准" onChange={(event) => setQuickAcceptanceValue("acceptanceCriteria", event.target.value)} />
                </label>
                <footer className={styles.mobileDrawerFooter}>
                  <Link className={styles.fullFormLink} href="/engineering/acceptances/new">完整表单</Link>
                  <button className={styles.saveButton} data-testid="quick-acceptance-save" disabled={acceptanceSaving || projects.length === 0} type="submit">
                    <Save size={18} />{acceptanceSaving ? "发起中" : "发起验收"}
                  </button>
                </footer>
              </form>
            </section>
          </div>
        ) : null}
      </main>
    </PermissionGuard>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <span>
      <strong>{value}</strong>
      {label}
    </span>
  );
}

function StatusItem({ icon, label, value, emphasis = false }: { icon: ReactNode; label: string; value: number | string; emphasis?: boolean }) {
  return (
    <div className={emphasis ? styles.statusItemWarn : styles.statusItem}>
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ProjectStatus({ status }: { status: EngineeringProject["status"] }) {
  return <span className={`${styles.projectStatus} ${styles[projectStatusVariant(status)]}`}>{engineeringProjectStatusLabels[status] ?? status}</span>;
}

function EmptyBlock({ title, detail, children }: { title: string; detail: string; children?: ReactNode }) {
  return (
    <div className={styles.emptyBlock}>
      <strong>{title}</strong>
      <span>{detail}</span>
      {children ? <div>{children}</div> : null}
    </div>
  );
}

function resolveQuickRectificationAction(user: UserContext | null, rectification: EngineeringRectification): EngineeringRectificationAction | null {
  const actions = availableRectificationActions(rectification.status).filter((action) => action !== "MARK_OVERDUE");
  return actions.find((action) => canExecuteRectificationAction(user, action)) ?? null;
}

function canExecuteRectificationAction(user: UserContext | null, action: EngineeringRectificationAction): boolean {
  if (action === "SUBMIT") {
    return hasEngineeringRectificationPermission(user, ENGINEERING_RECTIFICATION_PERMISSIONS.SUBMIT);
  }
  if (action === "START_RECHECK" || action === "PASS" || action === "REJECT") {
    return hasEngineeringRectificationPermission(user, ENGINEERING_RECTIFICATION_PERMISSIONS.RECHECK);
  }
  if (action === "CLOSE") {
    return hasEngineeringRectificationPermission(user, ENGINEERING_RECTIFICATION_PERMISSIONS.CLOSE);
  }
  return hasEngineeringRectificationPermission(user, ENGINEERING_RECTIFICATION_PERMISSIONS.UPDATE);
}

function validateRectificationActionForm(
  action: EngineeringRectificationAction,
  form: { reason: string; feedback: string; recheckComment: string; comment: string }
): string {
  if (action === "SUBMIT" && !form.feedback.trim()) return "请填写整改反馈";
  if (action === "REJECT" && !form.recheckComment.trim() && !form.comment.trim()) return "请填写驳回复查意见";
  return "";
}

function validateQuickAcceptanceForm(form: QuickAcceptanceForm): string {
  if (!form.projectId) return "请选择所属项目";
  if (!form.acceptanceName.trim()) return "请填写验收名称";
  if (!form.plannedAcceptanceDate) return "请选择计划验收日期";
  if (!form.acceptanceScope.trim()) return "请填写验收范围";
  if (!form.acceptanceCriteria.trim()) return "请填写验收标准";
  return "";
}

function toQuickAcceptanceInput(form: QuickAcceptanceForm): CreateEngineeringAcceptanceInput {
  return {
    project_id: form.projectId,
    acceptance_name: form.acceptanceName.trim(),
    acceptance_type: form.acceptanceType,
    planned_acceptance_date: form.plannedAcceptanceDate,
    risk_level: form.riskLevel,
    acceptance_scope: form.acceptanceScope.trim(),
    acceptance_criteria: form.acceptanceCriteria.trim(),
    description: "由工程移动终端快速发起"
  };
}

function emptyToUndefined(value: string): string | undefined {
  const normalized = value.trim();
  return normalized || undefined;
}

function isSuccessMessage(message: string): boolean {
  return /已保存|已发起|已更新/.test(message);
}

function TerminalForbidden() {
  return (
    <main className={`content ds-page ${styles.page}`}>
      <section className={styles.panel}>
        <h1>无工程终端权限</h1>
        <p>请联系管理员开通工程看板、工程项目或工程作业权限。</p>
      </section>
    </main>
  );
}

function resolveVisibleEngineeringModules(user: UserContext | null): EngineeringTerminalModule[] {
  if (!user) {
    return ENGINEERING_TERMINAL_MODULES.filter((item) => item.key === "projects" || item.key === "dashboard");
  }
  if (user.is_super) {
    return ENGINEERING_TERMINAL_MODULES;
  }
  const visible = ENGINEERING_TERMINAL_MODULES.filter((item) => hasModule(user, item.moduleCode) && hasPermission(user, item.permission));
  return visible.length > 0 ? visible : ENGINEERING_TERMINAL_MODULES.filter((item) => item.key === "projects" || item.key === "dashboard");
}

function resolveEngineeringRoleLabel(user: UserContext | null): string {
  if (!user) return "访客";
  if (user.is_super) return "管理员总控";
  const roles = getEngineeringRoleCodes(user);
  if (roles.has("GROUP_LEADER") || roles.has("ENGINEERING_DIRECTOR") || roles.has("JH_GROUP_PRESIDENT") || roles.has("JH_ENGINEERING_PROPERTY_MANAGER")) {
    return "管理总控";
  }
  if (roles.has("PROJECT_MANAGER")) return "项目统筹";
  if (roles.has("SUPERVISOR")) return "监理复查";
  if (roles.has("CONTRACTOR_MANAGER")) return "施工协同";
  if (roles.has("ENGINEER") || roles.has("MAINTENANCE_ENGINEER") || roles.has("JH_INSTALLATION_ENGINEER")) return "现场工程";
  if (roles.has("SAFETY_MANAGER")) return "安全协同";
  if (roles.has("PROPERTY_MANAGER") || roles.has("PROPERTY_STAFF")) return "物业接管";
  if (roles.has("FINANCE_MANAGER") || roles.has("FINANCE_USER")) return "财务观察";
  if (roles.has("INVEST_MANAGER") || roles.has("LEASING_MANAGER")) return "招商协同";
  if (roles.has("IOT_MANAGER") || roles.has("IOT_OPERATOR")) return "设备协同";
  if (hasPermission(user, ENGINEERING_ACCEPTANCE_PERMISSION)) return "验收协同";
  if (hasPermission(user, ENGINEERING_INSPECTION_PERMISSION)) return "巡检执行";
  return "工程协同";
}

function getEngineeringRoleCodes(user: UserContext | null): Set<string> {
  return new Set((user?.roles ?? []).map((role) => role.role_code.toUpperCase()));
}

function orderEngineeringModules(modules: EngineeringTerminalModule[], order: string[]): EngineeringTerminalModule[] {
  const orderMap = new Map(order.map((item, index) => [item, index]));
  return [...modules].sort((left, right) => {
    const leftIndex = orderMap.get(left.key) ?? Number.MAX_SAFE_INTEGER;
    const rightIndex = orderMap.get(right.key) ?? Number.MAX_SAFE_INTEGER;
    if (leftIndex !== rightIndex) return leftIndex - rightIndex;
    return left.title.localeCompare(right.title, "zh-CN");
  });
}

function resolveEngineeringRoleActions(input: {
  user: UserContext | null;
  roleGuide: EngineeringRoleGuide;
  orderedModules: EngineeringTerminalModule[];
  visibleModules: EngineeringTerminalModule[];
  canQuickDailyReport: boolean;
  canCreateInspection: boolean;
  canCreateAcceptance: boolean;
}): EngineeringRoleAction[] {
  const { user, roleGuide, orderedModules, visibleModules, canQuickDailyReport, canCreateInspection, canCreateAcceptance } = input;
  const roles = getEngineeringRoleCodes(user);
  const moduleMap = new Map(visibleModules.map((item) => [item.key, item]));
  const resolveHref = (key: string): Route | undefined => moduleMap.get(key)?.href;
  const actions: EngineeringRoleAction[] = [];
  const isFieldEngineer = roles.has("ENGINEER") || roles.has("MAINTENANCE_ENGINEER") || roles.has("JH_INSTALLATION_ENGINEER");

  function add(action: EngineeringRoleAction | false | null | undefined) {
    if (!action) return;
    if (action.kind !== "quickDailyReport" && action.kind !== "quickAcceptance" && !action.href) return;
    if (actions.some((item) => item.key === action.key)) return;
    actions.push(action);
  }

  const isManagement = Boolean(user?.is_super) || roles.has("GROUP_LEADER") || roles.has("ENGINEERING_DIRECTOR") || roles.has("JH_GROUP_PRESIDENT") || roles.has("JH_ENGINEERING_PROPERTY_MANAGER");

  if (isManagement) {
    add({ key: "dashboard", label: "工程看板", href: resolveHref("dashboard") ?? roleGuide.primaryHref, emphasis: true });
    add({ key: "rectifications", label: "整改闭环", href: resolveHref("rectifications") });
    add(canCreateAcceptance ? { key: "quickAcceptance", label: "发起验收", kind: "quickAcceptance" } : { key: "acceptances", label: "工程验收", href: resolveHref("acceptances") });
  } else if (roles.has("PROJECT_MANAGER")) {
    add({ key: "projects", label: "我的项目", href: resolveHref("projects") ?? roleGuide.primaryHref, emphasis: true });
    add({ key: "plans", label: "项目计划", href: resolveHref("plans") });
    add(canQuickDailyReport ? { key: "quickDailyReport", label: "快速日报", kind: "quickDailyReport" } : { key: "dailyReports", label: "施工日报", href: resolveHref("dailyReports") });
  } else if (roles.has("SUPERVISOR")) {
    add(canCreateInspection ? { key: "createInspection", label: "新建巡检", href: "/engineering/inspections/new", emphasis: true } : { key: "inspections", label: "现场巡检", href: resolveHref("inspections") ?? roleGuide.primaryHref, emphasis: true });
    add({ key: "rectifications", label: "整改复查", href: resolveHref("rectifications") });
    add(canCreateAcceptance ? { key: "quickAcceptance", label: "发起验收", kind: "quickAcceptance" } : { key: "acceptances", label: "验收确认", href: resolveHref("acceptances") });
  } else if (roles.has("CONTRACTOR_MANAGER")) {
    add(canQuickDailyReport ? { key: "quickDailyReport", label: "提交日报", kind: "quickDailyReport", emphasis: true } : { key: "dailyReports", label: "施工日报", href: resolveHref("dailyReports") ?? roleGuide.primaryHref, emphasis: true });
    add({ key: "rectifications", label: "整改反馈", href: resolveHref("rectifications") });
    add({ key: "plans", label: "查看计划", href: resolveHref("plans") });
  } else if (isFieldEngineer) {
    add(canCreateInspection ? { key: "createInspection", label: "新建巡检", href: "/engineering/inspections/new", emphasis: true } : { key: "inspections", label: "现场巡检", href: resolveHref("inspections") ?? roleGuide.primaryHref, emphasis: true });
    add(canQuickDailyReport ? { key: "quickDailyReport", label: "快速日报", kind: "quickDailyReport" } : { key: "dailyReports", label: "施工日报", href: resolveHref("dailyReports") });
    add({ key: "rectifications", label: "整改待办", href: resolveHref("rectifications") });
  } else if (roles.has("SAFETY_MANAGER")) {
    add(canCreateInspection ? { key: "createInspection", label: "新建巡检", href: "/engineering/inspections/new", emphasis: true } : { key: "inspections", label: "现场巡检", href: resolveHref("inspections") ?? roleGuide.primaryHref, emphasis: true });
    add({ key: "rectifications", label: "整改闭环", href: resolveHref("rectifications") });
    add({ key: "dashboard", label: "工程看板", href: resolveHref("dashboard") });
  } else if (roles.has("PROPERTY_MANAGER") || roles.has("PROPERTY_STAFF")) {
    add(canCreateAcceptance ? { key: "quickAcceptance", label: "发起验收", kind: "quickAcceptance", emphasis: true } : { key: "acceptances", label: "验收移交", href: resolveHref("acceptances") ?? roleGuide.primaryHref, emphasis: true });
    add({ key: "rectifications", label: "整改跟踪", href: resolveHref("rectifications") });
    add({ key: "projects", label: "工程项目", href: resolveHref("projects") });
  } else if (roles.has("FINANCE_MANAGER") || roles.has("FINANCE_USER")) {
    add({ key: "dashboard", label: "工程看板", href: resolveHref("dashboard") ?? roleGuide.primaryHref, emphasis: true });
    add({ key: "projects", label: "项目台账", href: resolveHref("projects") });
    add({ key: "acceptances", label: "验收状态", href: resolveHref("acceptances") });
  } else if (roles.has("INVEST_MANAGER") || roles.has("LEASING_MANAGER")) {
    add({ key: "projects", label: "关联工程", href: resolveHref("projects") ?? roleGuide.primaryHref, emphasis: true });
    add({ key: "plans", label: "交付计划", href: resolveHref("plans") });
    add({ key: "dashboard", label: "工程看板", href: resolveHref("dashboard") });
  } else if (roles.has("IOT_MANAGER") || roles.has("IOT_OPERATOR")) {
    add({ key: "inspections", label: "设备巡检", href: resolveHref("inspections") ?? roleGuide.primaryHref, emphasis: true });
    add({ key: "rectifications", label: "设备整改", href: resolveHref("rectifications") });
    add({ key: "dashboard", label: "工程看板", href: resolveHref("dashboard") });
  } else {
    add(canCreateInspection ? { key: "createInspection", label: "新建巡检", href: "/engineering/inspections/new", emphasis: true } : { key: "inspections", label: "现场巡检", href: resolveHref("inspections") ?? roleGuide.primaryHref, emphasis: true });
    add(canQuickDailyReport ? { key: "quickDailyReport", label: "快速日报", kind: "quickDailyReport" } : { key: "dailyReports", label: "施工日报", href: resolveHref("dailyReports") });
    add({ key: "rectifications", label: "整改待办", href: resolveHref("rectifications") });
  }

  if (actions.length === 0) {
    add({ key: "primary", label: roleGuide.primaryLabel, href: roleGuide.primaryHref, emphasis: true });
    add(orderedModules[0] ? { key: orderedModules[0].key, label: orderedModules[0].title, href: orderedModules[0].href } : null);
  }

  return actions.slice(0, 3).map((action, index) => ({ ...action, emphasis: action.emphasis || index === 0 }));
}

function resolveEngineeringRoleGuide(input: {
  user: UserContext | null;
  roleLabel: string;
  summary: EngineeringDashboardOverview["summary"];
  visibleModules: EngineeringTerminalModule[];
}): EngineeringRoleGuide {
  const { user, roleLabel, summary, visibleModules } = input;
  const moduleMap = new Map(visibleModules.map((item) => [item.key, item]));
  const resolveHref = (key: string, fallback: Route = "/engineering/projects") => moduleMap.get(key)?.href ?? fallback;
  const canCreateInspection = Boolean(user?.is_super) || hasPermission(user, ENGINEERING_INSPECTION_CREATE_PERMISSION);
  const inspectionActionHref: Route = canCreateInspection ? "/engineering/inspections/new" : resolveHref("inspections", "/engineering/inspections");
  const overdueRectification = summary.overdue_rectification_count;
  const pendingRectification = summary.pending_rectification_count;
  const pendingAcceptance = summary.pending_acceptance_count;
  const weeklyDailyReports = summary.weekly_daily_report_count;
  const todayInspection = summary.today_inspection_count;
  const roles = getEngineeringRoleCodes(user);
  const isFieldEngineer = roles.has("ENGINEER") || roles.has("MAINTENANCE_ENGINEER") || roles.has("JH_INSTALLATION_ENGINEER");
  const isManagement = Boolean(user?.is_super) || roles.has("GROUP_LEADER") || roles.has("ENGINEERING_DIRECTOR") || roles.has("JH_GROUP_PRESIDENT") || roles.has("JH_ENGINEERING_PROPERTY_MANAGER");

  if (isManagement) {
    return {
      title: "工程总控工作台",
      summary: "先看项目盘面，再盯整改、验收和日报节奏，管理层在手机端也能抓住闭环重点。",
      identityLabel: roleLabel,
      identityHint: "适合总监、管理层和总控角色开场检查。",
      primaryHref: resolveHref("dashboard", "/engineering/dashboard"),
      primaryLabel: "打开工程看板",
      moduleOrder: ["dashboard", "projects", "acceptances", "rectifications", "plans", "dailyReports", "inspections"],
      chain: ["看盘面", "盯整改", "推验收", "回项目"],
      focusCards: [
        {
          title: "项目态势",
          value: summary.executing_project_count > 0 ? `${summary.executing_project_count} 项施工中` : "先建项目",
          detail: "先确认当前有哪些项目真正进入执行阶段。",
          href: resolveHref("dashboard", "/engineering/dashboard"),
          icon: BarChart3,
          emphasis: true
        },
        {
          title: "整改压力",
          value: overdueRectification > 0 ? `${overdueRectification} 项逾期` : `${pendingRectification} 项待整改`,
          detail: overdueRectification > 0 ? "先处理逾期整改，再看一般待办。" : "把整改和复查压回责任人。",
          href: resolveHref("rectifications", "/engineering/rectifications"),
          icon: AlertTriangle
        },
        {
          title: "验收进度",
          value: pendingAcceptance > 0 ? `${pendingAcceptance} 项待验收` : "验收队列平稳",
          detail: "阶段验收和竣工验收要随时回看。",
          href: resolveHref("acceptances", "/engineering/acceptances"),
          icon: FileCheck2
        }
      ]
    };
  }

  if (roles.has("PROJECT_MANAGER")) {
    return {
      title: "项目经理工作台",
      summary: "每天盯项目、计划、日报和整改，让节点、责任人和风险都在一条线上推进。",
      identityLabel: roleLabel,
      identityHint: "以项目推进为中心，不必先切到管理看板。",
      primaryHref: resolveHref("projects", "/engineering/projects"),
      primaryLabel: "进入工程项目",
      moduleOrder: ["projects", "plans", "dailyReports", "rectifications", "inspections", "acceptances", "dashboard"],
      chain: ["看项目", "拆计划", "收日报", "追整改", "推进验收"],
      focusCards: [
        {
          title: "在管项目",
          value: summary.project_total > 0 ? `${summary.project_total} 个项目` : "先建项目",
          detail: "先看项目中心，确认编号、负责人和周期是否齐全。",
          href: resolveHref("projects", "/engineering/projects"),
          icon: HardHat,
          emphasis: true
        },
        {
          title: "日报节奏",
          value: weeklyDailyReports > 0 ? `近 7 日 ${weeklyDailyReports} 份` : "日报还未启动",
          detail: "日报是现场推进和后续验收的底稿。",
          href: resolveHref("dailyReports", "/engineering/daily-reports"),
          icon: FileText
        },
        {
          title: "整改闭环",
          value: pendingRectification > 0 ? `${pendingRectification} 项待推进` : "当前无整改积压",
          detail: "发现问题后，要尽快拉责任人进整改链路。",
          href: resolveHref("rectifications", "/engineering/rectifications"),
          icon: ShieldCheck
        }
      ]
    };
  }

  if (roles.has("SUPERVISOR")) {
    return {
      title: "监理复查工作台",
      summary: "优先处理巡检、整改复查和验收，不把时间花在与自己无关的管理字段上。",
      identityLabel: roleLabel,
      identityHint: "适合监理和复查角色按闭环节点工作。",
      primaryHref: inspectionActionHref,
      primaryLabel: canCreateInspection ? "新建现场巡检" : "进入现场巡检",
      moduleOrder: ["inspections", "rectifications", "acceptances", "projects", "plans", "dashboard", "dailyReports"],
      chain: ["做巡检", "压整改", "复查", "去验收"],
      focusCards: [
        {
          title: "现场巡检",
          value: todayInspection > 0 ? `今日 ${todayInspection} 项` : "先检查巡检计划",
          detail: "问题要及时发现，不要留到验收节点才暴露。",
          href: inspectionActionHref,
          icon: ClipboardCheck,
          emphasis: true
        },
        {
          title: "复查任务",
          value: pendingRectification > 0 ? `${pendingRectification} 项待看` : "暂无待复查",
          detail: "整改提交后，监理应尽快给出通过或退回结论。",
          href: resolveHref("rectifications", "/engineering/rectifications"),
          icon: ShieldCheck
        },
        {
          title: "验收联动",
          value: pendingAcceptance > 0 ? `${pendingAcceptance} 项待验收` : "当前无验收阻塞",
          detail: "把巡检和整改结果自然接到验收。",
          href: resolveHref("acceptances", "/engineering/acceptances"),
          icon: FileCheck2
        }
      ]
    };
  }

  if (roles.has("CONTRACTOR_MANAGER")) {
    return {
      title: "施工协同工作台",
      summary: "按计划组织施工、按日报留痕、按整改要求反馈，手机端就该先给施工方这些入口。",
      identityLabel: roleLabel,
      identityHint: "适合施工单位项目经理和现场负责人。",
      primaryHref: resolveHref("dailyReports", "/engineering/daily-reports"),
      primaryLabel: "进入施工日报",
      moduleOrder: ["dailyReports", "plans", "rectifications", "projects", "inspections", "acceptances", "dashboard"],
      chain: ["看计划", "写日报", "回整改", "配合验收"],
      focusCards: [
        {
          title: "日报优先",
          value: weeklyDailyReports > 0 ? `近 7 日 ${weeklyDailyReports} 份` : "先提交第一份日报",
          detail: "施工单位先把日报做实，后面的巡检和验收才有依据。",
          href: resolveHref("dailyReports", "/engineering/daily-reports"),
          icon: FileText,
          emphasis: true
        },
        {
          title: "当前计划",
          value: summary.executing_project_count > 0 ? `${summary.executing_project_count} 个项目执行中` : "先确认项目节点",
          detail: "按计划节拍组织人材机，不要靠口头传达。",
          href: resolveHref("plans", "/engineering/plans"),
          icon: ListTodo
        },
        {
          title: "整改反馈",
          value: pendingRectification > 0 ? `${pendingRectification} 项待处理` : "暂无待整改",
          detail: "被退回或要求补充材料的项要尽快回填。",
          href: resolveHref("rectifications", "/engineering/rectifications"),
          icon: ShieldCheck
        }
      ]
    };
  }

  if (isFieldEngineer) {
    return {
      title: "现场工程工作台",
      summary: "先做巡检和日报，再把异常推入整改，保证一线工程人员在手机端就能把链路跑顺。",
      identityLabel: roleLabel,
      identityHint: "适合工程师、安装工程师和现场执行角色。",
      primaryHref: inspectionActionHref,
      primaryLabel: canCreateInspection ? "新建现场巡检" : "开始现场巡检",
      moduleOrder: ["inspections", "dailyReports", "rectifications", "projects", "plans", "acceptances", "dashboard"],
      chain: ["查现场", "写日报", "推整改", "跟验收"],
      focusCards: [
        {
          title: "今日巡检",
          value: todayInspection > 0 ? `${todayInspection} 项待查` : "先看项目状态",
          detail: "先处理今日巡检和现场发现的问题。",
          href: inspectionActionHref,
          icon: ClipboardCheck,
          emphasis: true
        },
        {
          title: "日报提交",
          value: weeklyDailyReports > 0 ? `近 7 日 ${weeklyDailyReports} 份` : "日报尚未启动",
          detail: "日报要把施工、人材机和问题说明白。",
          href: resolveHref("dailyReports", "/engineering/daily-reports"),
          icon: FileText
        },
        {
          title: "待整改",
          value: pendingRectification > 0 ? `${pendingRectification} 项待处理` : "当前无整改积压",
          detail: "异常不要停留在发现层，尽快拉进整改闭环。",
          href: resolveHref("rectifications", "/engineering/rectifications"),
          icon: AlertTriangle
        }
      ]
    };
  }

  if (roles.has("SAFETY_MANAGER")) {
    return {
      title: "安全协同工作台",
      summary: "优先处理现场巡检、隐患整改和工程安全风险，把安全问题推入闭环。",
      identityLabel: roleLabel,
      identityHint: "适合安全主管联动工程整改。",
      primaryHref: inspectionActionHref,
      primaryLabel: canCreateInspection ? "新建现场巡检" : "进入现场巡检",
      moduleOrder: ["inspections", "rectifications", "dashboard", "projects", "acceptances", "dailyReports", "plans"],
      chain: ["查风险", "建问题", "追整改", "看闭环"],
      focusCards: [
        {
          title: "安全巡检",
          value: todayInspection > 0 ? `今日 ${todayInspection} 项` : "先看现场",
          detail: "安全问题必须从现场动作进入闭环。",
          href: inspectionActionHref,
          icon: ClipboardCheck,
          emphasis: true
        },
        {
          title: "整改闭环",
          value: pendingRectification > 0 ? `${pendingRectification} 项待跟踪` : "暂无整改积压",
          detail: "安全隐患要压到责任人和期限。",
          href: resolveHref("rectifications", "/engineering/rectifications"),
          icon: AlertTriangle
        },
        {
          title: "风险总览",
          value: overdueRectification > 0 ? `${overdueRectification} 项逾期` : "风险平稳",
          detail: "看全局风险后再下钻到项目。",
          href: resolveHref("dashboard", "/engineering/dashboard"),
          icon: BarChart3
        }
      ]
    };
  }

  if (roles.has("PROPERTY_MANAGER") || roles.has("PROPERTY_STAFF")) {
    return {
      title: "物业接管工作台",
      summary: "关注验收、整改和待移交项目，提前把后续运营接管风险看清楚。",
      identityLabel: roleLabel,
      identityHint: "适合物业负责人和派单人员查看移交准备。",
      primaryHref: resolveHref("acceptances", "/engineering/acceptances"),
      primaryLabel: "验收移交",
      moduleOrder: ["acceptances", "rectifications", "projects", "dashboard", "inspections", "dailyReports", "plans"],
      chain: ["看验收", "看整改", "接移交", "回运营"],
      focusCards: [
        {
          title: "待接事项",
          value: pendingAcceptance > 0 ? `${pendingAcceptance} 项待验收` : "移交平稳",
          detail: "物业先看会影响接管的验收和整改。",
          href: resolveHref("acceptances", "/engineering/acceptances"),
          icon: FileCheck2,
          emphasis: true
        },
        {
          title: "整改遗留",
          value: pendingRectification > 0 ? `${pendingRectification} 项待跟踪` : "暂无遗留整改",
          detail: "未闭环问题不要带入运营。",
          href: resolveHref("rectifications", "/engineering/rectifications"),
          icon: ShieldCheck
        },
        {
          title: "工程项目",
          value: summary.project_total > 0 ? `${summary.project_total} 个项目` : "暂无项目",
          detail: "按项目查看后续接管对象。",
          href: resolveHref("projects", "/engineering/projects"),
          icon: HardHat
        }
      ]
    };
  }

  if (roles.has("FINANCE_MANAGER") || roles.has("FINANCE_USER")) {
    return {
      title: "工程财务观察台",
      summary: "只看项目台账、验收状态和交付节奏，为后续结算和预算复核做准备。",
      identityLabel: roleLabel,
      identityHint: "适合财务角色只读观察，不进入现场执行。",
      primaryHref: resolveHref("dashboard", "/engineering/dashboard"),
      primaryLabel: "工程看板",
      moduleOrder: ["dashboard", "projects", "acceptances", "plans", "dailyReports", "rectifications", "inspections"],
      chain: ["看台账", "看验收", "看计划", "等结算"],
      focusCards: [
        {
          title: "项目台账",
          value: summary.project_total > 0 ? `${summary.project_total} 个项目` : "暂无项目",
          detail: "先确认工程项目主数据是否完整。",
          href: resolveHref("projects", "/engineering/projects"),
          icon: HardHat,
          emphasis: true
        },
        {
          title: "验收状态",
          value: pendingAcceptance > 0 ? `${pendingAcceptance} 项待验收` : "验收平稳",
          detail: "验收结果会影响后续结算准备。",
          href: resolveHref("acceptances", "/engineering/acceptances"),
          icon: FileCheck2
        },
        {
          title: "计划节奏",
          value: summary.executing_project_count > 0 ? `${summary.executing_project_count} 项执行中` : "暂无施工项目",
          detail: "用工程节奏判断财务后续压力。",
          href: resolveHref("plans", "/engineering/plans"),
          icon: ListTodo
        }
      ]
    };
  }

  if (roles.has("INVEST_MANAGER") || roles.has("LEASING_MANAGER")) {
    return {
      title: "招商交付协同台",
      summary: "关注会影响招商交付的工程项目、计划节点和验收结果。",
      identityLabel: roleLabel,
      identityHint: "适合招商与租赁角色了解交付进度。",
      primaryHref: resolveHref("projects", "/engineering/projects"),
      primaryLabel: "关联工程",
      moduleOrder: ["projects", "plans", "acceptances", "dashboard", "rectifications", "dailyReports", "inspections"],
      chain: ["看项目", "看计划", "看验收", "同步客户"],
      focusCards: [
        {
          title: "关联工程",
          value: summary.project_total > 0 ? `${summary.project_total} 个项目` : "暂无关联工程",
          detail: "先看可能影响招商交付的工程项目。",
          href: resolveHref("projects", "/engineering/projects"),
          icon: HardHat,
          emphasis: true
        },
        {
          title: "交付计划",
          value: summary.executing_project_count > 0 ? `${summary.executing_project_count} 项推进` : "暂无推进项目",
          detail: "用计划节点对齐客户预期。",
          href: resolveHref("plans", "/engineering/plans"),
          icon: ListTodo
        },
        {
          title: "验收结果",
          value: pendingAcceptance > 0 ? `${pendingAcceptance} 项待验收` : "验收无阻塞",
          detail: "验收完成后才能进入稳定交付。",
          href: resolveHref("acceptances", "/engineering/acceptances"),
          icon: FileCheck2
        }
      ]
    };
  }

  if (roles.has("IOT_MANAGER") || roles.has("IOT_OPERATOR")) {
    return {
      title: "设备协同工作台",
      summary: "围绕设备相关巡检、整改和工程交付状态协同处理。",
      identityLabel: roleLabel,
      identityHint: "适合设备物联和运维角色查看工程关联事项。",
      primaryHref: resolveHref("inspections", "/engineering/inspections"),
      primaryLabel: "设备巡检",
      moduleOrder: ["inspections", "rectifications", "dashboard", "projects", "plans", "dailyReports", "acceptances"],
      chain: ["看设备", "查现场", "推整改", "回看板"],
      focusCards: [
        {
          title: "设备巡检",
          value: todayInspection > 0 ? `今日 ${todayInspection} 项` : "暂无巡检",
          detail: "设备相关问题先进入巡检入口。",
          href: resolveHref("inspections", "/engineering/inspections"),
          icon: ClipboardCheck,
          emphasis: true
        },
        {
          title: "设备整改",
          value: pendingRectification > 0 ? `${pendingRectification} 项待处理` : "暂无整改",
          detail: "设备整改要进入闭环跟踪。",
          href: resolveHref("rectifications", "/engineering/rectifications"),
          icon: ShieldCheck
        },
        {
          title: "工程看板",
          value: `${summary.rectification_close_rate}% 关闭率`,
          detail: "从工程看板查看整体态势。",
          href: resolveHref("dashboard", "/engineering/dashboard"),
          icon: BarChart3
        }
      ]
    };
  }

  return {
    title: "现场工程工作台",
    summary: "先做巡检和日报，再把异常推入整改，保证一线工程人员在手机端就能把链路跑顺。",
    identityLabel: roleLabel,
    identityHint: "适合工程师、安装工程师和现场执行角色。",
    primaryHref: inspectionActionHref,
    primaryLabel: canCreateInspection ? "新建现场巡检" : "开始现场巡检",
    moduleOrder: ["inspections", "dailyReports", "rectifications", "projects", "plans", "acceptances", "dashboard"],
    chain: ["查现场", "写日报", "推整改", "跟验收"],
    focusCards: [
      {
        title: "今日巡检",
        value: todayInspection > 0 ? `${todayInspection} 项待查` : "先看项目状态",
        detail: "先处理今日巡检和现场发现的问题。",
        href: inspectionActionHref,
        icon: ClipboardCheck,
        emphasis: true
      },
      {
        title: "日报提交",
        value: weeklyDailyReports > 0 ? `近 7 日 ${weeklyDailyReports} 份` : "日报尚未启动",
        detail: "日报要把施工、人材机和问题说明白。",
        href: resolveHref("dailyReports", "/engineering/daily-reports"),
        icon: FileText
      },
      {
        title: "待整改",
        value: pendingRectification > 0 ? `${pendingRectification} 项待处理` : "当前无整改积压",
        detail: "异常不要停留在发现层，尽快拉进整改闭环。",
        href: resolveHref("rectifications", "/engineering/rectifications"),
        icon: AlertTriangle
      }
    ]
  };
}

function resolveEngineeringModuleBadge(key: string, summary: EngineeringDashboardOverview["summary"]): string {
  switch (key) {
    case "projects":
      return `${summary.project_total} 项`;
    case "plans":
      return summary.executing_project_count > 0 ? `${summary.executing_project_count} 项推进` : "按节点推进";
    case "dailyReports":
      return `${summary.weekly_daily_report_count} 份`;
    case "inspections":
      return `${summary.today_inspection_count} 项`;
    case "rectifications":
      return summary.overdue_rectification_count > 0 ? `${summary.overdue_rectification_count} 项逾期` : `${summary.pending_rectification_count} 项待办`;
    case "acceptances":
      return `${summary.pending_acceptance_count} 项待验收`;
    case "dashboard":
      return `${summary.rectification_close_rate}% 关闭率`;
    default:
      return "查看";
  }
}

function validateQuickDailyReportForm(form: QuickDailyReportForm): string {
  if (!form.projectId) return "请选择所属工程项目";
  if (!form.reportDate) return "请选择日报日期";
  if (!form.workContent.trim()) return "请填写今日施工内容";
  const workerCount = Number(form.workerCount || 0);
  const managerCount = Number(form.managerCount || 0);
  const progressPercent = Number(form.progressPercent || 0);
  if (!Number.isFinite(workerCount) || workerCount < 0) return "现场工人人数不能为负数";
  if (!Number.isFinite(managerCount) || managerCount < 0) return "管理人员人数不能为负数";
  if (!Number.isFinite(progressPercent) || progressPercent < 0 || progressPercent > 100) return "当日进度必须在 0 到 100 之间";
  return "";
}

function toQuickDailyReportInput(form: QuickDailyReportForm): CreateEngineeringDailyReportInput {
  return {
    project_id: form.projectId,
    report_date: form.reportDate,
    weather: form.weather,
    work_content: form.workContent.trim(),
    completed_work: form.completedWork.trim() || undefined,
    tomorrow_plan: form.tomorrowPlan.trim() || undefined,
    worker_count: Number(form.workerCount || 0),
    manager_count: Number(form.managerCount || 0),
    progress_percent: Number(form.progressPercent || 0),
    quality_summary: form.qualitySummary.trim() || undefined,
    safety_summary: form.safetySummary.trim() || undefined,
    issue_summary: form.issueSummary.trim() || undefined
  };
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "";
  return value.slice(0, 10);
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace("T", " ").slice(0, 16);
}
