"use client";

import { AlertTriangle, BarChart3, ClipboardCheck, FileCheck2, Gauge, RefreshCw, Save, ShieldCheck, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import type { FormEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PermissionGuard } from "../../../components/auth/PermissionGuard";
import { useMobileTerminalMode } from "../../../components/mobile/useMobileTerminalMode";
import { getAccessToken } from "../../../lib/authz";
import { engineeringDashboardApi } from "../../../lib/engineering-dashboard-api";
import type { EngineeringDashboardOverview } from "../../../lib/engineering-dashboard-types";
import { engineeringDailyReportsApi } from "../../../lib/engineering-daily-reports-api";
import { engineeringWeatherTypeOptions } from "../../../lib/engineering-daily-reports-display";
import type { CreateEngineeringDailyReportInput, EngineeringWeatherType } from "../../../lib/engineering-daily-reports-types";
import { todayDateString } from "../../../lib/engineering-daily-reports-utils";
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

const actionCards: Array<{
  title: string;
  detail: string;
  href?: Route;
  action?: "daily-report";
  icon: LucideIcon;
  tone: "primary" | "normal" | "warn";
}> = [
  {
    title: "新建日报",
    detail: "记录今日施工、人材机和问题",
    action: "daily-report",
    icon: BarChart3,
    tone: "primary"
  },
  {
    title: "工程巡检",
    detail: "现场质量、安全、进度检查",
    href: "/engineering/inspections/new",
    icon: ClipboardCheck,
    tone: "normal"
  },
  {
    title: "整改反馈",
    detail: "处理待整改、提交复查材料",
    href: "/engineering/rectifications",
    icon: ShieldCheck,
    tone: "warn"
  },
  {
    title: "验收办理",
    detail: "阶段、专项、竣工验收",
    href: "/engineering/acceptances",
    icon: FileCheck2,
    tone: "normal"
  }
];

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
            <span className={styles.eyebrow}>工程终端</span>
            <h1>工程移动作业台</h1>
            <p>项目、日报、巡检、整改、验收从手机端开始闭环。</p>
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

        <section className={styles.actionGrid} aria-label="工程快捷操作">
          {actionCards.map((item) => {
            const Icon = item.icon;
            return item.action === "daily-report" ? (
              <button className={`${styles.actionCard} ${styles[item.tone]}`} type="button" onClick={openQuickDailyReport} key={item.title}>
                <span className={styles.actionIcon}><Icon size={21} /></span>
                <strong>{item.title}</strong>
                <small>{item.detail}</small>
              </button>
            ) : (
              <Link className={`${styles.actionCard} ${styles[item.tone]}`} href={item.href as Route} key={item.title}>
                <span className={styles.actionIcon}><Icon size={21} /></span>
                <strong>{item.title}</strong>
                <small>{item.detail}</small>
              </Link>
            );
          })}
        </section>

        <section className={styles.statusStrip} aria-label="工程关键指标">
          <StatusItem icon={<ClipboardCheck size={17} />} label="今日巡检" value={summary.today_inspection_count} />
          <StatusItem icon={<BarChart3 size={17} />} label="近 7 日日报" value={summary.weekly_daily_report_count} />
          <StatusItem icon={<AlertTriangle size={17} />} label="逾期整改" value={summary.overdue_rectification_count} emphasis={summary.overdue_rectification_count > 0} />
          <StatusItem icon={<Gauge size={17} />} label="关闭率" value={completionLabel} />
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

        <section className={styles.flowPanel}>
          <h2>现场流程</h2>
          <div className={styles.flowSteps}>
            <span>建项目</span>
            <span>拆计划</span>
            <span>写日报</span>
            <span>做巡检</span>
            <span>整改单</span>
            <span>验收</span>
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
        <p>请联系管理员开通工程看板或工程作业权限。</p>
      </section>
    </main>
  );
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
