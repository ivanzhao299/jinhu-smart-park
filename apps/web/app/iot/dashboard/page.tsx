"use client";

import { Card, DataTable, StatusPill } from "@jinhu/ui";
import { Activity, AlertTriangle, BellRing, Cpu, DatabaseZap, Radio, RefreshCw, Router, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { SYSTEM_PERMISSIONS, type PaginatedResult } from "@jinhu/shared";
import { PermissionGuard } from "../../../components/auth/PermissionGuard";
import { apiRequest } from "../../../lib/api-client";
import { getAccessToken } from "../../../lib/authz";

const IOT_MODULE = "iot";

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

interface DashboardSummary {
  total_devices: number;
  online_devices: number;
  offline_devices: number;
  fault_devices: number;
  today_report_count: number;
  active_alert_count: number;
  severe_alert_count: number;
}

interface DeviceTypeBucket {
  device_type: string;
  count: number;
}

interface RecentAlert {
  id: string;
  alert_code: string;
  alert_title: string;
  alert_level: string;
  status: string;
  device_id: string;
  device_code: string;
  device_name: string;
  metric_code: string;
  trigger_value: string | null;
  last_trigger_time: string;
}

interface RecentDevice {
  id: string;
  device_code: string;
  device_name: string;
  device_type: string;
  online_status: string;
  status: string;
  location: string | null;
  last_data_time: string | null;
}

interface IotDashboardData {
  summary: DashboardSummary;
  by_device_type: DeviceTypeBucket[];
  recent_alerts: RecentAlert[];
  recent_devices: RecentDevice[];
}

const emptySummary: DashboardSummary = {
  total_devices: 0,
  online_devices: 0,
  offline_devices: 0,
  fault_devices: 0,
  today_report_count: 0,
  active_alert_count: 0,
  severe_alert_count: 0
};

export default function IotDashboardPage() {
  const [data, setData] = useState<IotDashboardData | null>(null);
  const [dicts, setDicts] = useState<DictMap>({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const summary = data?.summary ?? emptySummary;
  const healthRate = useMemo(() => {
    if (!summary.total_devices) return "0.00%";
    return `${((summary.online_devices / summary.total_devices) * 100).toFixed(2)}%`;
  }, [summary.online_devices, summary.total_devices]);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const response = await apiRequest<IotDashboardData>("/iot/dashboard", { token: getAccessToken() });
      setData(response.data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "加载 IoT 看板失败");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDicts = useCallback(async () => {
    const typeResponse = await apiRequest<PaginatedResult<DictTypeRow>>("/dict-types?page=1&page_size=300", {
      token: getAccessToken()
    });
    const typeMap = new Map(typeResponse.data.items.map((item) => [item.dictCode, item.id]));
    const codes = ["iot_device_type", "iot_device_status", "iot_alert_level", "iot_alert_status"];
    const entries = await Promise.all(codes.map(async (code) => {
      const dictTypeId = typeMap.get(code);
      if (!dictTypeId) return [code, []] as const;
      const response = await apiRequest<PaginatedResult<DictItemRow>>(`/dict-items?page=1&page_size=200&dict_type_id=${dictTypeId}`, {
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
    <PermissionGuard module={IOT_MODULE} permission={SYSTEM_PERMISSIONS.IOT_DASHBOARD_READ} fallback={<Forbidden />}>
      <main className="page-container asset-statistics-page">
        <Card className="page-header">
          <div>
            <h1>IoT 设备看板</h1>
            <p>查看设备在线状态、数据上报、设备类型分布和告警态势。</p>
          </div>
          <div className="page-actions">
            <button className="secondary-button" type="button" onClick={() => void loadDashboard()}>
              <RefreshCw size={16} />
              刷新
            </button>
            <Link className="primary-button" href="/iot/devices">
              <Cpu size={16} />
              设备管理
            </Link>
          </div>
        </Card>

        {message ? <p className="form-error">{message}</p> : null}

        {loading ? <DashboardSkeleton /> : null}

        {!loading ? (
          <>
            <Card className="asset-stat-summary">
              <StatCard icon={<Router size={16} />} label="设备总数" value={formatInteger(summary.total_devices)} />
              <StatCard icon={<Activity size={16} />} label="在线设备数" value={formatInteger(summary.online_devices)} />
              <StatCard icon={<Radio size={16} />} label="离线设备数" value={formatInteger(summary.offline_devices)} />
              <StatCard icon={<ShieldAlert size={16} />} label="故障设备数" value={formatInteger(summary.fault_devices)} />
              <StatCard icon={<DatabaseZap size={16} />} label="今日数据上报量" value={formatInteger(summary.today_report_count)} />
              <StatCard icon={<BellRing size={16} />} label="活跃告警数" value={formatInteger(summary.active_alert_count)} />
              <StatCard icon={<AlertTriangle size={16} />} label="严重告警数" value={formatInteger(summary.severe_alert_count)} />
              <StatCard icon={<Activity size={16} />} label="在线率" value={healthRate} />
            </Card>

            <section className="dashboard-grid">
              <Card className="asset-stat-panel">
                <h2 className="panel-title">设备类型分布</h2>
                {data?.by_device_type.length ? (
                  <DataTable>
                    <thead>
                      <tr>
                        <th>设备类型</th>
                        <th>数量</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.by_device_type.map((item) => (
                        <tr key={item.device_type}>
                          <td><StatusPill dictCode="iot_device_type" value={item.device_type} dicts={dicts} /></td>
                          <td>{formatInteger(item.count)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </DataTable>
                ) : <EmptyState text="暂无设备类型分布" />}
              </Card>

              <Card className="asset-stat-panel">
                <h2 className="panel-title">最近上报设备</h2>
                {data?.recent_devices.length ? (
                  <DataTable>
                    <thead>
                      <tr>
                        <th>设备</th>
                        <th>类型</th>
                        <th>在线</th>
                        <th>最近数据</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recent_devices.map((item) => (
                        <tr key={item.id}>
                          <td>
                            <Link className="text-link" href={`/iot/devices/${item.id}`}>
                              {item.device_code} {item.device_name}
                            </Link>
                          </td>
                          <td><StatusPill dictCode="iot_device_type" value={item.device_type} dicts={dicts} /></td>
                          <td><StatusPill dictCode="iot_device_status" value={item.online_status} dicts={dicts} /></td>
                          <td>{formatDateTime(item.last_data_time)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </DataTable>
                ) : <EmptyState text="暂无最近上报设备" />}
              </Card>
            </section>

            <Card className="asset-stat-panel">
              <h2 className="panel-title">最近告警</h2>
              {data?.recent_alerts.length ? (
                <DataTable>
                  <thead>
                    <tr>
                      <th>告警编号</th>
                      <th>告警标题</th>
                      <th>设备</th>
                      <th>指标</th>
                      <th>级别</th>
                      <th>状态</th>
                      <th>触发值</th>
                      <th>最近触发</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent_alerts.map((item) => (
                      <tr key={item.id}>
                        <td>{item.alert_code}</td>
                        <td>
                          <Link className="text-link" href="/iot/alerts">
                            {item.alert_title}
                          </Link>
                        </td>
                        <td>
                          <Link className="text-link" href={`/iot/devices/${item.device_id}`}>
                            {item.device_code} {item.device_name}
                          </Link>
                        </td>
                        <td>{item.metric_code}</td>
                        <td><StatusPill dictCode="iot_alert_level" value={item.alert_level} dicts={dicts} /></td>
                        <td><StatusPill dictCode="iot_alert_status" value={item.status} dicts={dicts} /></td>
                        <td>{item.trigger_value ?? "-"}</td>
                        <td>{formatDateTime(item.last_trigger_time)}</td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
              ) : <EmptyState text="暂无设备告警" />}
            </Card>
          </>
        ) : null}
      </main>
    </PermissionGuard>
  );
}

function StatCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="asset-stat-card">
      <div className="asset-stat-card-header">
        <span className="asset-stat-card-icon">{icon}</span>
        <span>{label}</span>
      </div>
      <strong className="asset-stat-card-value">{value}</strong>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <Card className="page-content">
      <div className="skeleton-stack">
        <span className="skeleton-line skeleton-line-lg" />
        <span className="skeleton-line" />
        <span className="skeleton-line skeleton-line-sm" />
      </div>
    </Card>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="empty-state">{text}</div>;
}

function Forbidden() {
  return (
    <main className="page-container">
      <Card className="page-content">
        <div className="empty-state">403：无权访问 IoT 看板，或当前租户未启用 iot 模块。</div>
      </Card>
    </main>
  );
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function formatDateTime(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", { hour12: false });
}
