"use client";

import { AlertTriangle, ArrowRight, BarChart3, ClipboardCheck, FileCheck2, FileText, Gauge, HardHat, ListTodo, RefreshCw, Save, ShieldCheck, X } from "lucide-react";
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
import { engineeringProjectsApi } from "../../../lib/engineering-projects-api";
import { engineeringProjectStatusLabels, projectStatusVariant } from "../../../lib/engineering-projects-display";
import type { EngineeringProject } from "../../../lib/engineering-projects-types";
import { engineeringRectificationsApi } from "../../../lib/engineering-rectifications-api";
import type { EngineeringRectification } from "../../../lib/engineering-rectifications-types";
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

export function EngineeringMobileTerminalClient() {
  const authUser = useAuthUser();
  useMobileTerminalMode(["mobile-terminal-mode", "operations-terminal-safe-area", "engineering-terminal-mode"]);

  const [dashboard, setDashboard] = useState<EngineeringDashboardOverview>(emptyDashboard);
  const [projects, setProjects] = useState<EngineeringProject[]>([]);
  const [rectifications, setRectifications] = useState<EngineeringRectification[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [dailyReportOpen, setDailyReportOpen] = useState(false);
  const [dailyReportSaving, setDailyReportSaving] = useState(false);
  const [dailyReportForm, setDailyReportForm] = useState<QuickDailyReportForm>(defaultQuickDailyReportForm);

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

  const loadAll = useCallback(async () => {
    setLoading(true);
    setMessage("");
    const token = getAccessToken();
    const [dashboardResult, projectResult, rectificationResult] = await Promise.allSettled([
      engineeringDashboardApi.getOverview(token),
      engineeringProjectsApi.listProjects({ page: 1, page_size: 4, sort: "-updateTime" }, token),
      engineeringRectificationsApi.listRectifications({ page: 1, page_size: 4, sort: "-updateTime" }, token)
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
    if (dashboardResult.status === "rejected") {
      setMessage(dashboardResult.reason instanceof Error ? dashboardResult.reason.message : "加载工程终端失败");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  function openQuickDailyReport() {
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
      setMessage(`施工日报已保存：${saved.reportCode}`);
      await loadAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存施工日报失败");
    } finally {
      setDailyReportSaving(false);
    }
  }

  function setQuickDailyReportValue<K extends keyof QuickDailyReportForm>(key: K, value: QuickDailyReportForm[K]) {
    setDailyReportForm((current) => ({ ...current, [key]: value }));
  }

  return (
    <PermissionGuard module="engineering" permission="ENGINEERING_DASHBOARD_VIEW" fallback={<TerminalForbidden />}>
      <main className={`content ds-page ${styles.page}`}>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}>工程终端 · {roleGuide.identityLabel}</span>
            <h1>{roleGuide.title}</h1>
            <p>{roleGuide.summary}</p>
            <div className={styles.heroMeta}>
              <span>{roleGuide.identityHint}</span>
              <span>{generatedAt ? `更新 ${generatedAt}` : loading ? "正在同步工程数据" : "等待工程数据"}</span>
            </div>
            <div className={styles.heroActions}>
              <Link className={styles.primaryAction} href={roleGuide.primaryHref}>{roleGuide.primaryLabel}</Link>
              {canQuickDailyReport ? (
                <button className={styles.secondaryAction} type="button" onClick={openQuickDailyReport}>快速日报</button>
              ) : (
                <Link className={styles.secondaryAction} href={orderedModules[0]?.href ?? "/engineering/projects"}>查看工程入口</Link>
              )}
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

        {message ? <p className={styles.message}>{message}</p> : null}

        <section className={styles.panel}>
          <div className={styles.sectionHeader}>
            <div>
              <h2>本班先做什么</h2>
              <p>不先读说明，直接从当前角色最值钱的动作开始。</p>
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
              <h2>工程入口</h2>
              <p>按现场闭环组织，不把人丢进说明书式页面里。</p>
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
            {projects.length > 0 ? projects.map((project) => (
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
            {rectifications.length > 0 ? rectifications.map((item) => (
              <Link className={styles.todoCard} href={`/engineering/rectifications/${item.id}`} key={item.id}>
                <span>{item.rectificationCode}</span>
                <strong>{item.rectificationTitle}</strong>
                <small>{item.deadline ? `期限 ${formatDate(item.deadline)}` : "未设置期限"}</small>
              </Link>
            )) : (
              <EmptyBlock title={loading ? "正在读取整改任务" : "暂无整改待办"} detail="巡检发现问题后，整改任务会在这里出现。" />
            )}
          </div>
        </section>

        {dailyReportOpen ? (
          <div className={styles.mobileDrawerBackdrop} role="presentation">
            <section className={styles.mobileDrawer} aria-label="快速新建施工日报">
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
              <form className={styles.mobileDrawerForm} onSubmit={(event) => void submitQuickDailyReport(event)}>
                <label>
                  所属项目
                  <select required value={dailyReportForm.projectId} onChange={(event) => setQuickDailyReportValue("projectId", event.target.value)}>
                    <option value="">请选择项目</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>{project.projectName}</option>
                    ))}
                  </select>
                </label>
                <div className={styles.twoColumnFields}>
                  <label>
                    日期
                    <input required type="date" value={dailyReportForm.reportDate} onChange={(event) => setQuickDailyReportValue("reportDate", event.target.value)} />
                  </label>
                  <label>
                    天气
                    <select value={dailyReportForm.weather} onChange={(event) => setQuickDailyReportValue("weather", event.target.value as EngineeringWeatherType)}>
                      {engineeringWeatherTypeOptions.map((item) => (
                        <option key={item.value} value={item.value}>{item.label}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <label>
                  今日施工内容
                  <textarea required value={dailyReportForm.workContent} placeholder="例如：A5 楼三层消防管线安装，完成支架定位和部分管线敷设。" onChange={(event) => setQuickDailyReportValue("workContent", event.target.value)} />
                </label>
                <label>
                  已完成工作
                  <textarea value={dailyReportForm.completedWork} placeholder="可填写今日完成量、关键节点或照片说明。" onChange={(event) => setQuickDailyReportValue("completedWork", event.target.value)} />
                </label>
                <label>
                  明日计划
                  <textarea value={dailyReportForm.tomorrowPlan} placeholder="可填写明日施工安排、材料/人员需求。" onChange={(event) => setQuickDailyReportValue("tomorrowPlan", event.target.value)} />
                </label>
                <div className={styles.threeColumnFields}>
                  <label>
                    工人
                    <input min="0" type="number" value={dailyReportForm.workerCount} onChange={(event) => setQuickDailyReportValue("workerCount", event.target.value)} />
                  </label>
                  <label>
                    管理
                    <input min="0" type="number" value={dailyReportForm.managerCount} onChange={(event) => setQuickDailyReportValue("managerCount", event.target.value)} />
                  </label>
                  <label>
                    进度 %
                    <input max="100" min="0" type="number" value={dailyReportForm.progressPercent} onChange={(event) => setQuickDailyReportValue("progressPercent", event.target.value)} />
                  </label>
                </div>
                <label>
                  质量情况
                  <textarea value={dailyReportForm.qualitySummary} placeholder="可填写质量检查、偏差或整改要求。" onChange={(event) => setQuickDailyReportValue("qualitySummary", event.target.value)} />
                </label>
                <label>
                  安全文明施工
                  <textarea value={dailyReportForm.safetySummary} placeholder="可填写安全交底、临边防护、动火/用电等情况。" onChange={(event) => setQuickDailyReportValue("safetySummary", event.target.value)} />
                </label>
                <label>
                  存在问题
                  <textarea value={dailyReportForm.issueSummary} placeholder="可填写需协调问题，后续可转巡检问题或整改任务。" onChange={(event) => setQuickDailyReportValue("issueSummary", event.target.value)} />
                </label>
                <footer className={styles.mobileDrawerFooter}>
                  <Link className={styles.fullFormLink} href="/engineering/daily-reports/new">完整表单</Link>
                  <button className={styles.saveButton} disabled={dailyReportSaving} type="submit">
                    <Save size={18} />
                    {dailyReportSaving ? "保存中" : "保存日报"}
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
  const roles = new Set(user.roles.map((role) => role.role_code.toUpperCase()));
  if (roles.has("GROUP_LEADER") || roles.has("ENGINEERING_DIRECTOR") || roles.has("JH_GROUP_PRESIDENT") || roles.has("JH_ENGINEERING_PROPERTY_MANAGER")) {
    return "管理总控";
  }
  if (roles.has("PROJECT_MANAGER")) return "项目统筹";
  if (roles.has("SUPERVISOR")) return "监理复查";
  if (roles.has("CONTRACTOR_MANAGER")) return "施工协同";
  if (roles.has("ENGINEER") || roles.has("MAINTENANCE_ENGINEER") || roles.has("JH_INSTALLATION_ENGINEER")) return "现场工程";
  if (hasPermission(user, ENGINEERING_ACCEPTANCE_PERMISSION)) return "验收协同";
  if (hasPermission(user, ENGINEERING_INSPECTION_PERMISSION)) return "巡检执行";
  return "工程协同";
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

function resolveEngineeringRoleGuide(input: {
  user: UserContext | null;
  roleLabel: string;
  summary: EngineeringDashboardOverview["summary"];
  visibleModules: EngineeringTerminalModule[];
}): EngineeringRoleGuide {
  const { user, roleLabel, summary, visibleModules } = input;
  const moduleMap = new Map(visibleModules.map((item) => [item.key, item]));
  const resolveHref = (key: string, fallback: Route = "/engineering/projects") => moduleMap.get(key)?.href ?? fallback;
  const overdueRectification = summary.overdue_rectification_count;
  const pendingRectification = summary.pending_rectification_count;
  const pendingAcceptance = summary.pending_acceptance_count;
  const weeklyDailyReports = summary.weekly_daily_report_count;
  const todayInspection = summary.today_inspection_count;
  const roles = new Set((user?.roles ?? []).map((role) => role.role_code.toUpperCase()));
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
      primaryHref: resolveHref("inspections", "/engineering/inspections"),
      primaryLabel: "进入现场巡检",
      moduleOrder: ["inspections", "rectifications", "acceptances", "projects", "plans", "dashboard", "dailyReports"],
      chain: ["做巡检", "压整改", "复查", "去验收"],
      focusCards: [
        {
          title: "现场巡检",
          value: todayInspection > 0 ? `今日 ${todayInspection} 项` : "先检查巡检计划",
          detail: "问题要及时发现，不要留到验收节点才暴露。",
          href: resolveHref("inspections", "/engineering/inspections"),
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

  return {
    title: "现场工程工作台",
    summary: "先做巡检和日报，再把异常推入整改，保证一线工程人员在手机端就能把链路跑顺。",
    identityLabel: roleLabel,
    identityHint: "适合工程师、安装工程师和现场执行角色。",
    primaryHref: resolveHref("inspections", "/engineering/inspections"),
    primaryLabel: "开始现场巡检",
    moduleOrder: ["inspections", "dailyReports", "rectifications", "projects", "plans", "acceptances", "dashboard"],
    chain: ["查现场", "写日报", "推整改", "跟验收"],
    focusCards: [
      {
        title: "今日巡检",
        value: todayInspection > 0 ? `${todayInspection} 项待查` : "先看项目状态",
        detail: "先处理今日巡检和现场发现的问题。",
        href: resolveHref("inspections", "/engineering/inspections"),
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
