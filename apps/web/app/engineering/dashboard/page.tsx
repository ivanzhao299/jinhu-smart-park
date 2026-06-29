"use client";

import { Card, DataTable, StatusPill } from "@jinhu/ui";
import { AlertTriangle, BarChart3, ClipboardCheck, FileCheck2, Gauge, HardHat, Layers3, RefreshCw, ShieldCheck } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PermissionGuard } from "../../../components/auth/PermissionGuard";
import { getAccessToken } from "../../../lib/authz";
import { engineeringAcceptanceStatusLabels, acceptanceStatusVariant } from "../../../lib/engineering-acceptances-display";
import { engineeringDashboardApi } from "../../../lib/engineering-dashboard-api";
import type { EngineeringDashboardBucket, EngineeringDashboardOverview } from "../../../lib/engineering-dashboard-types";
import { engineeringIssueSeverityLabels, issueSeverityVariant } from "../../../lib/engineering-inspections-display";
import { engineeringPlanStatusLabels, planStatusVariant } from "../../../lib/engineering-plans-display";
import { engineeringProjectStatusLabels, engineeringProjectTypeLabels, projectStatusVariant } from "../../../lib/engineering-projects-display";
import { engineeringRectificationStatusLabels, rectificationStatusVariant } from "../../../lib/engineering-rectifications-display";
import styles from "./engineering-dashboard.module.css";

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

export default function EngineeringDashboardPage() {
  const [data, setData] = useState<EngineeringDashboardOverview>(emptyDashboard);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const summary = data.summary;
  const generatedAt = useMemo(() => formatDateTime(data.generated_at), [data.generated_at]);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const overview = await engineeringDashboardApi.getOverview(getAccessToken());
      setData(overview);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "加载工程 Dashboard 失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const metrics = [
    { key: "project_total", icon: <HardHat size={18} />, label: "项目总数", value: summary.project_total, hint: "全部已登记工程项目" },
    { key: "executing_project_count", icon: <Gauge size={18} />, label: "施工中项目", value: summary.executing_project_count, hint: "已进入执行阶段" },
    { key: "pending_rectification_count", icon: <ShieldCheck size={18} />, label: "待整改", value: summary.pending_rectification_count, hint: "待责任人处理的问题" },
    { key: "overdue_rectification_count", icon: <AlertTriangle size={18} />, label: "逾期整改", value: summary.overdue_rectification_count, hint: "已超过整改期限" },
    { key: "today_inspection_count", icon: <ClipboardCheck size={18} />, label: "今日巡检", value: summary.today_inspection_count, hint: "当天已登记巡检" },
    { key: "weekly_daily_report_count", icon: <BarChart3 size={18} />, label: "本周日报", value: summary.weekly_daily_report_count, hint: "近 7 日施工日报" },
    { key: "pending_acceptance_count", icon: <FileCheck2 size={18} />, label: "待验收", value: summary.pending_acceptance_count, hint: "等待工程验收结论" },
    { key: "acceptance_pass_rate", icon: <ShieldCheck size={18} />, label: "验收通过率", value: `${summary.acceptance_pass_rate}%`, hint: "当前验收通过占比" },
    { key: "rectification_close_rate", icon: <Gauge size={18} />, label: "整改关闭率", value: `${summary.rectification_close_rate}%`, hint: "整改任务关闭完成度" }
  ] as const;

  return (
    <PermissionGuard module="engineering" permission="ENGINEERING_DASHBOARD_VIEW" fallback={<Forbidden />}>
      <main className={`content ds-page ${styles.page}`}>
        <Card className={styles.heroCard}>
          <div className={styles.heroTop}>
            <div className={styles.heroCopy}>
              <span className={styles.heroLabel}>
                <Layers3 size={14} />
                Engineering Control Board
              </span>
              <h1>工程 Dashboard</h1>
              <p>项目、计划、日报、巡检、整改和验收的 Phase 1 闭环态势，在一屏里看全工程交付节奏。</p>
              <div className={styles.heroMeta}>
                <span className={styles.metaChip}>数据生成：{generatedAt || "暂无"}</span>
                <span className={styles.metaChip}>空态时优先引导录入项目主数据</span>
              </div>
            </div>
            <div className={styles.heroActions}>
              <button className="secondary-button" type="button" onClick={() => void loadDashboard()}>
                <RefreshCw size={16} />
                刷新
              </button>
              <Link className="primary-button" href="/engineering/projects">工程项目</Link>
              <Link className="secondary-button" href="/engineering/plans">工程计划</Link>
            </div>
          </div>

          <div className={styles.heroQuickGrid}>
            <div className={styles.quickCard}>
              <span>项目入口</span>
              <strong>先建项目</strong>
              <small>没有工程项目主数据，后面的计划、日报、巡检和验收都不会形成完整闭环。</small>
            </div>
            <div className={styles.quickCard}>
              <span>执行入口</span>
              <strong>接计划与日报</strong>
              <small>有了项目后，把计划拆开，再开始累计施工日报、巡检和整改痕迹。</small>
            </div>
            <div className={styles.quickCard}>
              <span>管理视角</span>
              <strong>盯整改和验收</strong>
              <small>整改逾期、待验收和验收通过率，决定工程交付是不是站得住。</small>
            </div>
            <div className={styles.quickCard}>
              <span>当前阶段</span>
              <strong>Phase 1</strong>
              <small>这张看板先做好闭环总览，后面再接附件、流程审批和更细的图表联动。</small>
            </div>
          </div>
        </Card>

        {message ? <p className="form-error">{message}</p> : null}

        {loading ? (
          <Card>
            <div className="empty-state">
              <strong>正在加载工程态势</strong>
              <span>读取本园区工程运行时统计数据。</span>
            </div>
          </Card>
        ) : (
          <>
            <section className={styles.statsPanel}>
              <div className={styles.statsHeader}>
                <div>
                  <h2>工程闭环核心指标</h2>
                  <p>这部分优先展示项目数量、整改压力和验收结果，先满足项目经理和管理层最常看的三类问题。</p>
                </div>
              </div>
              <div className={styles.statsGrid}>
                {metrics.map((item) => (
                  <StatCard key={item.key} icon={item.icon} label={item.label} value={item.value} hint={item.hint} />
                ))}
              </div>
            </section>

            <section className={styles.boardGrid}>
              <DistributionCard
                title="项目状态分布"
                description="看项目处在哪个交付阶段。"
                rows={data.project_status_distribution}
                labels={engineeringProjectStatusLabels}
                variant={(key) => projectStatusVariant(key as never)}
              />
              <DistributionCard
                title="项目类型分布"
                description="快速识别当前工程构成。"
                rows={data.project_type_distribution}
                labels={engineeringProjectTypeLabels}
              />
              <DistributionCard
                title="计划状态分布"
                description="观察计划推进是否顺畅。"
                rows={data.plan_status_distribution}
                labels={engineeringPlanStatusLabels}
                variant={(key) => planStatusVariant(key as never)}
              />
              <DistributionCard
                title="问题等级分布"
                description="判断现场问题的轻重结构。"
                rows={data.issue_severity_distribution}
                labels={engineeringIssueSeverityLabels}
                variant={(key) => issueSeverityVariant(key as never)}
              />
              <DistributionCard
                title="整改状态分布"
                description="跟踪整改推进和滞留情况。"
                rows={data.rectification_status_distribution}
                labels={engineeringRectificationStatusLabels}
                variant={(key) => rectificationStatusVariant(key as never)}
              />
              <DistributionCard
                title="验收状态分布"
                description="看验收通过和回流整改的比例。"
                rows={data.acceptance_status_distribution}
                labels={engineeringAcceptanceStatusLabels}
                variant={(key) => acceptanceStatusVariant(key as never)}
              />
            </section>

            <Card className={`${styles.boardCard} ${styles.boardCardTall}`}>
              <div className={styles.boardHead}>
                <div>
                  <h2>施工单位整改排名</h2>
                  <p>按整改任务总量排序，优先识别整改密度高、逾期多、关闭率低的施工单位。</p>
                </div>
                <span className={styles.miniCount}>{data.contractor_rectification_ranking.length}</span>
              </div>
              {data.contractor_rectification_ranking.length ? (
                <div className={styles.tableWrap}>
                  <DataTable>
                    <thead>
                      <tr>
                        <th>施工单位</th>
                        <th>整改任务</th>
                        <th>已关闭</th>
                        <th>逾期</th>
                        <th>关闭率</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.contractor_rectification_ranking.map((item) => (
                        <tr key={item.contractor_org_id ?? "unassigned"}>
                          <td>{item.contractor_org_id ?? "未指定施工单位"}</td>
                          <td>{item.total_rectifications}</td>
                          <td>{item.closed_rectifications}</td>
                          <td>{item.overdue_rectifications}</td>
                          <td>{item.close_rate}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </DataTable>
                </div>
              ) : (
                <div className={styles.emptyRanking}>
                  <strong>暂无整改排名</strong>
                  <span>产生整改任务后会自动形成施工单位闭环统计。</span>
                </div>
              )}
            </Card>

            <p className={styles.footerNote}>数据生成时间：{generatedAt || "暂无"}</p>
          </>
        )}
      </main>
    </PermissionGuard>
  );
}

function StatCard({ icon, label, value, hint }: { icon: ReactNode; label: string; value: string | number; hint: string }) {
  return (
    <article className={styles.statCard}>
      <div className={styles.statTop}>
        <span className={styles.statIcon}>{icon}</span>
        <span className={styles.statLabel}>{label}</span>
      </div>
      <strong className={styles.statValue}>{value}</strong>
      <small className={styles.statHint}>{hint}</small>
    </article>
  );
}

function DistributionCard({
  title,
  description,
  rows,
  labels,
  variant
}: {
  title: string;
  description: string;
  rows: EngineeringDashboardBucket[];
  labels: Record<string, string>;
  variant?: (key: string) => "default" | "success" | "warning" | "danger" | "info" | "primary" | "muted";
}) {
  return (
    <Card className={styles.boardCard}>
      <div className={styles.boardHead}>
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <span className={styles.miniCount}>{rows.length}</span>
      </div>
      {rows.length ? (
        <DataTable>
          <thead>
            <tr>
              <th>分类</th>
              <th>数量</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <td>
                  {variant ? (
                    <StatusPill variant={variant(row.key)}>{labels[row.key] ?? row.key}</StatusPill>
                  ) : (
                    labels[row.key] ?? row.key
                  )}
                </td>
                <td>{row.count}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      ) : (
        <div className={styles.emptyChart}>
          <div className={styles.emptyBars}>
            <EmptyBar width="28%" />
            <EmptyBar width="52%" />
            <EmptyBar width="40%" />
            <EmptyBar width="66%" />
          </div>
          <div className={styles.emptyState}>
            <strong>暂无数据</strong>
            <span>先在工程项目中心创建项目，再逐步补充计划、日报、巡检和验收，这里就会开始形成可读分布。</span>
          </div>
        </div>
      )}
    </Card>
  );
}

function EmptyBar({ width }: { width: string }) {
  return (
    <div className={styles.emptyBar}>
      <span className={styles.emptyBarLabel} />
      <span className={styles.emptyBarTrack}>
        <span className={styles.emptyBarFill} style={{ width }} />
      </span>
    </div>
  );
}

function formatDateTime(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}

function Forbidden() {
  return (
    <main className="content">
      <Card>
        <div className="empty-state">
          <strong>无权查看工程 Dashboard</strong>
          <span>请联系管理员开通工程管理权限。</span>
        </div>
      </Card>
    </main>
  );
}
