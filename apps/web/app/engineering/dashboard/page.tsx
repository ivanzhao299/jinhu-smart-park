"use client";

import { Card, DataTable, StatusPill } from "@jinhu/ui";
import { AlertTriangle, BarChart3, ClipboardCheck, FileCheck2, Gauge, HardHat, RefreshCw, ShieldCheck } from "lucide-react";
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

  return (
    <PermissionGuard module="engineering" permission="ENGINEERING_DASHBOARD_VIEW" fallback={<Forbidden />}>
      <main className="content">
        <header className="header">
          <div className="header-title">
            <strong>工程 Dashboard</strong>
            <span>项目、计划、日报、巡检、整改和验收的 Phase 1 闭环态势。</span>
          </div>
          <div className="page-actions">
            <button className="secondary-button" type="button" onClick={() => void loadDashboard()}>
              <RefreshCw size={16} />
              刷新
            </button>
            <Link className="primary-button" href="/engineering/projects">工程项目</Link>
          </div>
        </header>

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
            <Card className="asset-stat-summary">
              <StatCard icon={<HardHat size={16} />} label="项目总数" value={summary.project_total} />
              <StatCard icon={<Gauge size={16} />} label="施工中项目" value={summary.executing_project_count} />
              <StatCard icon={<ShieldCheck size={16} />} label="待整改" value={summary.pending_rectification_count} />
              <StatCard icon={<AlertTriangle size={16} />} label="逾期整改" value={summary.overdue_rectification_count} />
              <StatCard icon={<ClipboardCheck size={16} />} label="今日巡检" value={summary.today_inspection_count} />
              <StatCard icon={<BarChart3 size={16} />} label="本周日报" value={summary.weekly_daily_report_count} />
              <StatCard icon={<FileCheck2 size={16} />} label="待验收" value={summary.pending_acceptance_count} />
              <StatCard icon={<ShieldCheck size={16} />} label="验收通过率" value={`${summary.acceptance_pass_rate}%`} />
              <StatCard icon={<Gauge size={16} />} label="整改关闭率" value={`${summary.rectification_close_rate}%`} />
            </Card>

            <section className="dashboard-grid">
              <DistributionCard title="项目状态分布" rows={data.project_status_distribution} labels={engineeringProjectStatusLabels} variant={(key) => projectStatusVariant(key as never)} />
              <DistributionCard title="项目类型分布" rows={data.project_type_distribution} labels={engineeringProjectTypeLabels} />
              <DistributionCard title="计划状态分布" rows={data.plan_status_distribution} labels={engineeringPlanStatusLabels} variant={(key) => planStatusVariant(key as never)} />
              <DistributionCard title="问题等级分布" rows={data.issue_severity_distribution} labels={engineeringIssueSeverityLabels} variant={(key) => issueSeverityVariant(key as never)} />
              <DistributionCard title="整改状态分布" rows={data.rectification_status_distribution} labels={engineeringRectificationStatusLabels} variant={(key) => rectificationStatusVariant(key as never)} />
              <DistributionCard title="验收状态分布" rows={data.acceptance_status_distribution} labels={engineeringAcceptanceStatusLabels} variant={(key) => acceptanceStatusVariant(key as never)} />
            </section>

            <Card>
              <div className="section-heading">
                <h2>施工单位整改排名</h2>
                <span>按整改任务总量排序，辅助识别逾期和关闭率。</span>
              </div>
              {data.contractor_rectification_ranking.length ? (
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
              ) : (
                <div className="empty-state">
                  <strong>暂无整改排名</strong>
                  <span>产生整改任务后会自动形成施工单位闭环统计。</span>
                </div>
              )}
            </Card>

            <p className="form-hint">数据生成时间：{generatedAt || "暂无"}</p>
          </>
        )}
      </main>
    </PermissionGuard>
  );
}

function StatCard({ icon, label, value }: { icon: ReactNode; label: string; value: string | number }) {
  return (
    <div className="stat-card">
      <span>{icon}</span>
      <strong>{value}</strong>
      <small>{label}</small>
    </div>
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
  return (
    <Card>
      <div className="section-heading">
        <h2>{title}</h2>
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
        <div className="empty-state">
          <strong>暂无数据</strong>
        </div>
      )}
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
          <strong>无权查看工程 Dashboard</strong>
          <span>请联系管理员开通工程管理权限。</span>
        </div>
      </Card>
    </main>
  );
}
