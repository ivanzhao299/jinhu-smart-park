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

const setupSteps = [
  {
    title: "先建项目",
    detail: "录入项目主数据、负责人、预算和工期。",
    href: "/engineering/projects/new"
  },
  {
    title: "再拆计划",
    detail: "补阶段计划和节点，让日报与巡检有基线。",
    href: "/engineering/plans"
  },
  {
    title: "开始留痕",
    detail: "连续录日报、做巡检、带出整改和验收。",
    href: "/engineering/daily-reports"
  }
] as const;

export default function EngineeringDashboardPage() {
  const [data, setData] = useState<EngineeringDashboardOverview>(emptyDashboard);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const summary = data.summary;
  const generatedAt = useMemo(() => formatDateTime(data.generated_at), [data.generated_at]);
  const hasBusinessData = summary.project_total > 0
    || summary.executing_project_count > 0
    || summary.pending_rectification_count > 0
    || summary.overdue_rectification_count > 0
    || summary.today_inspection_count > 0
    || summary.weekly_daily_report_count > 0
    || summary.pending_acceptance_count > 0;

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const overview = await engineeringDashboardApi.getOverview(getAccessToken());
      setData(overview);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "加载工程看板失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const metrics = [
    { key: "project_total", icon: <HardHat size={18} />, label: "项目总数", value: summary.project_total, hint: "全部在管工程项目" },
    { key: "executing_project_count", icon: <Gauge size={18} />, label: "施工中", value: summary.executing_project_count, hint: "已进入执行阶段" },
    { key: "pending_rectification_count", icon: <ShieldCheck size={18} />, label: "待整改", value: summary.pending_rectification_count, hint: "等待责任人处理" },
    { key: "overdue_rectification_count", icon: <AlertTriangle size={18} />, label: "逾期整改", value: summary.overdue_rectification_count, hint: "超过整改期限" },
    { key: "today_inspection_count", icon: <ClipboardCheck size={18} />, label: "今日巡检", value: summary.today_inspection_count, hint: "今天已登记巡检" },
    { key: "weekly_daily_report_count", icon: <BarChart3 size={18} />, label: "近 7 日日报", value: summary.weekly_daily_report_count, hint: "施工过程留痕活跃度" },
    { key: "pending_acceptance_count", icon: <FileCheck2 size={18} />, label: "待验收", value: summary.pending_acceptance_count, hint: "等待验收结论" },
    { key: "acceptance_pass_rate", icon: <ShieldCheck size={18} />, label: "验收通过率", value: `${summary.acceptance_pass_rate}%`, hint: "当前验收通过占比" },
    { key: "rectification_close_rate", icon: <Gauge size={18} />, label: "整改关闭率", value: `${summary.rectification_close_rate}%`, hint: "问题闭环完成度" }
  ] as const;

  return (
    <PermissionGuard module="engineering" permission="ENGINEERING_DASHBOARD_VIEW" fallback={<Forbidden />}>
      <main className={`content ds-page ${styles.page}`}>
        <Card className={styles.heroCard}>
          <div className={styles.heroTop}>
            <div className={styles.heroCopy}>
              <span className={styles.heroLabel}>
                <Layers3 size={14} />
                工程闭环看板
              </span>
              <h1>工程经营看板</h1>
              <p>只保留工程经理和管理层每天真正会看的东西：项目推进、整改压力、日报活跃度和验收节奏。</p>
            </div>
            <div className={styles.heroActions}>
              <button className="secondary-button" type="button" onClick={() => void loadDashboard()}>
                <RefreshCw size={16} />
                刷新
              </button>
              <Link className="secondary-button" href="/engineering/projects">项目</Link>
              <Link className="secondary-button" href="/engineering/plans">计划</Link>
              <Link className="secondary-button" href="/engineering/daily-reports">日报</Link>
            </div>
          </div>
          <div className={styles.heroMeta}>
            <span className={styles.metaChip}>数据时间：{generatedAt || "暂无"}</span>
            <span className={styles.metaChip}>{hasBusinessData ? "已进入真实工程态势" : "等待首批工程数据"}</span>
            <span className={styles.metaChip}>{summary.overdue_rectification_count > 0 ? `逾期整改 ${summary.overdue_rectification_count} 项` : "当前无逾期整改"}</span>
          </div>
        </Card>

        {message ? <p className="form-error">{message}</p> : null}

        {loading ? (
          <Card>
            <div className="empty-state">
              <strong>正在加载工程数据</strong>
              <span>读取项目、计划、日报、巡检、整改和验收统计。</span>
            </div>
          </Card>
        ) : (
          <>
            <section className={styles.statsGrid}>
              {metrics.map((item) => (
                <StatCard key={item.key} icon={item.icon} label={item.label} value={item.value} hint={item.hint} />
              ))}
            </section>

            {!hasBusinessData ? (
              <Card className={styles.emptyLaunchCard}>
                <div className={styles.emptyLaunchHeader}>
                  <h2>现在没有图表，不是因为看板没做好，而是还没有真实工程数据跑进来</h2>
                  <p>先把项目、计划和日报建立起来，巡检、整改和验收数据才会自然形成闭环走势。</p>
                </div>
                <div className={styles.setupGrid}>
                  {setupSteps.map((step, index) => (
                    <article className={styles.setupCard} key={step.title}>
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <strong>{step.title}</strong>
                      <p>{step.detail}</p>
                      <Link className={styles.inlineLink} href={step.href}>立即进入</Link>
                    </article>
                  ))}
                </div>
              </Card>
            ) : (
              <>
                <section className={styles.boardGrid}>
                  <DistributionCard
                    title="项目状态"
                    rows={data.project_status_distribution}
                    labels={engineeringProjectStatusLabels}
                    variant={(key) => projectStatusVariant(key as never)}
                  />
                  <DistributionCard
                    title="项目类型"
                    rows={data.project_type_distribution}
                    labels={engineeringProjectTypeLabels}
                  />
                  <DistributionCard
                    title="计划状态"
                    rows={data.plan_status_distribution}
                    labels={engineeringPlanStatusLabels}
                    variant={(key) => planStatusVariant(key as never)}
                  />
                  <DistributionCard
                    title="问题等级"
                    rows={data.issue_severity_distribution}
                    labels={engineeringIssueSeverityLabels}
                    variant={(key) => issueSeverityVariant(key as never)}
                  />
                  <DistributionCard
                    title="整改状态"
                    rows={data.rectification_status_distribution}
                    labels={engineeringRectificationStatusLabels}
                    variant={(key) => rectificationStatusVariant(key as never)}
                  />
                  <DistributionCard
                    title="验收状态"
                    rows={data.acceptance_status_distribution}
                    labels={engineeringAcceptanceStatusLabels}
                    variant={(key) => acceptanceStatusVariant(key as never)}
                  />
                </section>

                <Card className={`${styles.boardCard} ${styles.boardCardTall}`}>
                  <div className={styles.boardHead}>
                    <div>
                      <h2>施工单位整改排名</h2>
                      <p>优先识别整改任务多、逾期多、关闭率低的施工单位。</p>
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
                      <span>产生整改任务后，这里会自动形成施工单位排名。</span>
                    </div>
                  )}
                </Card>
              </>
            )}

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
  rows,
  labels,
  variant
}: {
  title: string;
  rows: EngineeringDashboardBucket[];
  labels: Record<string, string>;
  variant?: (key: string) => "default" | "success" | "warning" | "danger" | "info" | "primary" | "muted";
}) {
  const total = rows.reduce((sum, row) => sum + row.count, 0);

  return (
    <Card className={styles.boardCard}>
      <div className={styles.boardHead}>
        <h2>{title}</h2>
        <span className={styles.miniCount}>{total}</span>
      </div>
      <div className={styles.distributionList}>
        {rows.length ? rows.map((row) => {
          const ratio = total > 0 ? Math.round((row.count / total) * 100) : 0;
          return (
            <article className={styles.distributionRow} key={row.key}>
              <div className={styles.distributionRowTop}>
                <div className={styles.distributionLabel}>
                  {variant ? (
                    <StatusPill variant={variant(row.key)}>{labels[row.key] ?? row.key}</StatusPill>
                  ) : (
                    <span className={styles.distributionText}>{labels[row.key] ?? row.key}</span>
                  )}
                </div>
                <div className={styles.distributionValues}>
                  <strong>{row.count}</strong>
                  <small>{ratio}%</small>
                </div>
              </div>
              <div className={styles.distributionTrack}>
                <span className={styles.distributionFill} style={{ width: `${Math.max(ratio, row.count > 0 ? 8 : 0)}%` }} />
              </div>
            </article>
          );
        }) : (
          <div className={styles.emptyChart}>
            <strong>暂无数据</strong>
            <span>对应业务数据进入后，这里会自动形成分布。</span>
          </div>
        )}
      </div>
    </Card>
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
          <strong>无权查看工程看板</strong>
          <span>请联系管理员开通工程管理权限。</span>
        </div>
      </Card>
    </main>
  );
}
