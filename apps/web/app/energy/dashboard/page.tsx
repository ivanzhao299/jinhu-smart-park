"use client";

import { Card, DataTable, StatusPill } from "@jinhu/ui";
import { Activity, AlertTriangle, Droplets, Gauge, RefreshCw, Zap } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { SYSTEM_PERMISSIONS, type PaginatedResult } from "@jinhu/shared";
import { PermissionGuard } from "../../../components/auth/PermissionGuard";
import { apiRequest } from "../../../lib/api-client";
import { getAccessToken } from "../../../lib/authz";

const ENERGY_MODULE = "energy";

interface DictTypeRow {
  id: string;
  dictCode: string;
}

interface DictItemRow {
  id: string;
  itemLabel: string;
  itemValue: string;
  status: string;
  tagType?: string | null;
}

type DictMap = Record<string, DictItemRow[]>;

interface EnergyOverview {
  summary: {
    meter_count: number;
    electric_meter_count: number;
    water_meter_count: number;
    gas_meter_count: number;
    confirmed_consumption: string;
    active_alert_count: number;
    disabled_meter_count: number;
  };
  recent_alerts: EnergyAlertRow[];
}

interface EnergyAlertRow {
  id: string;
  alertCode: string;
  alertType: string;
  alertLevel: string;
  title: string;
  processStatus: string;
  triggeredAt: string;
}

interface GroupRow {
  building_id?: string | null;
  park_tenant_id?: string | null;
  meter_type: string;
  consumption: string;
}

interface TrendRow {
  date: string;
  meter_type: string;
  consumption: string;
}

const emptyOverview: EnergyOverview = {
  summary: {
    meter_count: 0,
    electric_meter_count: 0,
    water_meter_count: 0,
    gas_meter_count: 0,
    confirmed_consumption: "0.0000",
    active_alert_count: 0,
    disabled_meter_count: 0
  },
  recent_alerts: []
};

export default function EnergyDashboardPage() {
  const [overview, setOverview] = useState<EnergyOverview>(emptyOverview);
  const [buildingRows, setBuildingRows] = useState<GroupRow[]>([]);
  const [tenantRows, setTenantRows] = useState<GroupRow[]>([]);
  const [trendRows, setTrendRows] = useState<TrendRow[]>([]);
  const [dicts, setDicts] = useState<DictMap>({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const totalMeters = overview.summary.meter_count;
  const alertRate = useMemo(() => {
    if (!totalMeters) return "0.00%";
    return `${((overview.summary.active_alert_count / totalMeters) * 100).toFixed(2)}%`;
  }, [overview.summary.active_alert_count, totalMeters]);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const [overviewResponse, buildingResponse, tenantResponse, trendResponse] = await Promise.all([
        apiRequest<EnergyOverview>("/energy/dashboard/overview", { token: getAccessToken() }),
        apiRequest<{ items: GroupRow[] }>("/energy/dashboard/by-building", { token: getAccessToken() }),
        apiRequest<{ items: GroupRow[] }>("/energy/dashboard/by-tenant", { token: getAccessToken() }),
        apiRequest<{ items: TrendRow[] }>("/energy/dashboard/trends", { token: getAccessToken() })
      ]);
      setOverview(overviewResponse.data);
      setBuildingRows(buildingResponse.data.items);
      setTenantRows(tenantResponse.data.items);
      setTrendRows(trendResponse.data.items);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "加载能源看板失败");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDicts = useCallback(async () => {
    const typeResponse = await apiRequest<PaginatedResult<DictTypeRow>>("/dict-types?page=1&page_size=100", {
      token: getAccessToken()
    });
    const typeMap = new Map(typeResponse.data.items.map((item) => [item.dictCode, item.id]));
    const codes = ["energy_meter_type", "energy_alert_type", "energy_alert_level", "energy_alert_process_status"];
    const entries = await Promise.all(codes.map(async (code) => {
      const dictTypeId = typeMap.get(code);
      if (!dictTypeId) return [code, []] as const;
      const response = await apiRequest<PaginatedResult<DictItemRow>>(`/dict-items?page=1&page_size=100&dict_type_id=${dictTypeId}`, {
        token: getAccessToken()
      });
      return [code, response.data.items.filter((item) => item.status === "enabled")] as const;
    }));
    setDicts(Object.fromEntries(entries));
  }, []);

  useEffect(() => {
    void Promise.all([loadDashboard(), loadDicts()]).catch((error: Error) => setMessage(error.message));
  }, [loadDashboard, loadDicts]);

  return (
    <PermissionGuard module={ENERGY_MODULE} permission={SYSTEM_PERMISSIONS.ENERGY_DASHBOARD_READ} fallback={<Forbidden />}>
      <main className="page-container energy-dashboard-page">
        <Card className="page-header">
          <div>
            <h1>能源监测看板</h1>
            <p>按表计确认读数统计园区用电、用水、用气与异常告警。</p>
          </div>
          <div className="page-actions">
            <button className="secondary-button" type="button" onClick={() => void loadDashboard()}>
              <RefreshCw size={16} />
              刷新
            </button>
            <Link className="primary-button" href="/energy/meters">
              <Gauge size={16} />
              表计管理
            </Link>
          </div>
        </Card>

        {message ? <p className="form-error">{message}</p> : null}
        {loading ? <DashboardSkeleton /> : null}

        {!loading ? (
          <>
            <Card className="asset-stat-summary">
              <StatCard icon={<Gauge size={16} />} label="表计总数" value={formatInteger(overview.summary.meter_count)} />
              <StatCard icon={<Zap size={16} />} label="电表" value={formatInteger(overview.summary.electric_meter_count)} />
              <StatCard icon={<Droplets size={16} />} label="水表" value={formatInteger(overview.summary.water_meter_count)} />
              <StatCard icon={<Activity size={16} />} label="气表" value={formatInteger(overview.summary.gas_meter_count)} />
              <StatCard icon={<Activity size={16} />} label="确认用量" value={formatDecimal(overview.summary.confirmed_consumption)} />
              <StatCard icon={<AlertTriangle size={16} />} label="活跃告警" value={formatInteger(overview.summary.active_alert_count)} />
              <StatCard icon={<Gauge size={16} />} label="停用表计" value={formatInteger(overview.summary.disabled_meter_count)} />
              <StatCard icon={<AlertTriangle size={16} />} label="告警占比" value={alertRate} />
            </Card>

            <section className="dashboard-grid">
              <MetricPanel title="楼栋用量" rows={buildingRows} idKey="building_id" dicts={dicts} />
              <MetricPanel title="租户用量" rows={tenantRows} idKey="park_tenant_id" dicts={dicts} />
            </section>

            <Card className="asset-stat-panel">
              <h2 className="panel-title">用能趋势</h2>
              {trendRows.length ? (
                <DataTable>
                  <thead>
                    <tr>
                      <th>日期</th>
                      <th>表计类型</th>
                      <th>确认用量</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trendRows.map((row) => (
                      <tr key={`${row.date}-${row.meter_type}`}>
                        <td>{formatDate(row.date)}</td>
                        <td><StatusPill dictCode="energy_meter_type" value={row.meter_type} dicts={dicts} /></td>
                        <td>{formatDecimal(row.consumption)}</td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
              ) : <EmptyState text="暂无确认读数趋势" />}
            </Card>

            <Card className="asset-stat-panel">
              <h2 className="panel-title">最近能源告警</h2>
              {overview.recent_alerts.length ? (
                <DataTable>
                  <thead>
                    <tr>
                      <th>告警编号</th>
                      <th>标题</th>
                      <th>类型</th>
                      <th>级别</th>
                      <th>状态</th>
                      <th>触发时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.recent_alerts.map((alert) => (
                      <tr key={alert.id}>
                        <td>{alert.alertCode}</td>
                        <td>{alert.title}</td>
                        <td><StatusPill dictCode="energy_alert_type" value={alert.alertType} dicts={dicts} /></td>
                        <td><StatusPill dictCode="energy_alert_level" value={alert.alertLevel} dicts={dicts} /></td>
                        <td><StatusPill dictCode="energy_alert_process_status" value={alert.processStatus} dicts={dicts} /></td>
                        <td>{formatDateTime(alert.triggeredAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
              ) : <EmptyState text="暂无能源告警" />}
            </Card>
          </>
        ) : null}
      </main>
    </PermissionGuard>
  );
}

function MetricPanel({ title, rows, idKey, dicts }: { title: string; rows: GroupRow[]; idKey: "building_id" | "park_tenant_id"; dicts: DictMap }) {
  const maxConsumption = Math.max(...rows.map((row) => Number(row.consumption) || 0), 1);

  return (
    <Card className="asset-stat-panel energy-rank-panel">
      <h2 className="panel-title">{title}</h2>
      {rows.length ? (
        <ul className="energy-rank-list">
          {rows.map((row, index) => {
            const consumption = Number(row.consumption) || 0;
            const label = row[idKey] ?? "未绑定";
            return (
              <li className="energy-rank-item" key={`${label}-${row.meter_type}-${index}`}>
                <div className="energy-rank-meta">
                  <strong>{label}</strong>
                  <StatusPill dictCode="energy_meter_type" value={row.meter_type} dicts={dicts} />
                </div>
                <div className="energy-rank-value">
                  <span>{formatDecimal(row.consumption)}</span>
                  <progress aria-label={`${label}确认用量`} max={maxConsumption} value={consumption} />
                </div>
              </li>
            );
          })}
        </ul>
      ) : <EmptyState text="暂无确认读数" />}
    </Card>
  );
}

function StatCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="asset-stat-card">
      <div className="asset-stat-card-header">
        <span>{label}</span>
        <span className="asset-stat-card-icon">{icon}</span>
      </div>
      <strong className="asset-stat-card-value">{value}</strong>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <Card className="asset-stat-panel">
      <p>正在加载能源数据...</p>
    </Card>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="empty-state">{text}</p>;
}

function Forbidden() {
  return (
    <main className="page-container">
      <Card>
        <h1>403</h1>
        <p>无权访问能源监测看板，或当前租户未开通能耗能力。</p>
      </Card>
    </main>
  );
}

function formatInteger(value: number) {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function formatDecimal(value: string | number) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue.toFixed(2) : "-";
}

function formatDate(value: string) {
  return value ? new Date(value).toLocaleDateString("zh-CN") : "-";
}

function formatDateTime(value?: string | null) {
  return value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "-";
}
