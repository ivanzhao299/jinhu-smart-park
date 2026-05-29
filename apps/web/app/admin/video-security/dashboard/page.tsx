"use client";

import { Card, DataTable, StatusPill } from "@jinhu/ui";
import { Activity, AlertTriangle, Building2, Camera, RefreshCw, ShieldCheck, Video } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { SYSTEM_PERMISSIONS } from "@jinhu/shared";
import { PermissionGuard } from "../../../../components/auth/PermissionGuard";
import { apiRequest } from "../../../../lib/api-client";
import { getAccessToken } from "../../../../lib/authz";

const VIDEO_MODULE = "video";

interface OverviewData {
  camera_total: number;
  online_count: number;
  offline_count: number;
  online_rate: number;
  today_alert_count: number;
  active_alert_count: number;
  high_risk_alert_count: number;
  recent_evidence_count: number;
  inspection_link_count: number;
  hazard_link_count: number;
}

interface TrendRow {
  date: string;
  count: number;
  high_count: number;
}

interface DeviceStatusRow {
  status: string;
  count: number;
}

interface MapRow {
  building_id: string | null;
  area_id: string | null;
  camera_count: number;
  online_count: number;
}

interface AlertRow {
  id: string;
  alertCode: string;
  alertType: string;
  alertLevel: string;
  title: string;
  cameraName: string | null;
  processStatus: string;
  triggeredAt: string;
}

const emptyOverview: OverviewData = {
  camera_total: 0,
  online_count: 0,
  offline_count: 0,
  online_rate: 0,
  today_alert_count: 0,
  active_alert_count: 0,
  high_risk_alert_count: 0,
  recent_evidence_count: 0,
  inspection_link_count: 0,
  hazard_link_count: 0
};

type StatusVariant = "default" | "success" | "warning" | "danger" | "info" | "primary" | "muted";

export default function VideoSecurityDashboardPage() {
  const [overview, setOverview] = useState<OverviewData>(emptyOverview);
  const [trends, setTrends] = useState<TrendRow[]>([]);
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatusRow[]>([]);
  const [parkMap, setParkMap] = useState<MapRow[]>([]);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [message, setMessage] = useState("");
  const [lastRefreshAt, setLastRefreshAt] = useState<Date | null>(null);

  const onlineRate = useMemo(() => `${(overview.online_rate * 100).toFixed(2)}%`, [overview.online_rate]);

  const load = useCallback(async () => {
    setMessage("");
    try {
      const token = getAccessToken();
      const [overviewResponse, trendsResponse, statusResponse, mapResponse, alertsResponse] = await Promise.all([
        apiRequest<OverviewData>("/video-security/dashboard/overview", { token }),
        apiRequest<TrendRow[]>("/video-security/dashboard/alert-trends", { token }),
        apiRequest<DeviceStatusRow[]>("/video-security/dashboard/device-status", { token }),
        apiRequest<MapRow[]>("/video-security/dashboard/park-map", { token }),
        apiRequest<AlertRow[]>("/video-security/dashboard/realtime-alerts?limit=12", { token })
      ]);
      setOverview(overviewResponse.data);
      setTrends(trendsResponse.data);
      setDeviceStatus(statusResponse.data);
      setParkMap(mapResponse.data);
      setAlerts(alertsResponse.data);
      setLastRefreshAt(new Date());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "加载安防指挥中心失败");
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 15000);
    return () => window.clearInterval(timer);
  }, [load]);

  return (
    <PermissionGuard module={VIDEO_MODULE} permission={SYSTEM_PERMISSIONS.VIDEO_SECURITY_DASHBOARD_READ} fallback={<Forbidden />}>
      <main className="video-screen-page">
        <section className="video-screen-hero">
          <div>
            <p>JINHU VIDEO SECURITY</p>
            <h1>园区安防指挥中心</h1>
            <span>实时摄像头状态、告警态势、巡检与隐患联动</span>
          </div>
          <button className="secondary-button" type="button" onClick={() => void load()}>
            <RefreshCw size={16} /> 刷新
          </button>
        </section>

        {message ? <div className="system-message">{message}</div> : null}

        <section className="video-screen-kpis">
          <ScreenKpi icon={<Camera size={18} />} label="摄像头总数" value={overview.camera_total} />
          <ScreenKpi icon={<ShieldCheck size={18} />} label="在线率" value={onlineRate} />
          <ScreenKpi icon={<Video size={18} />} label="离线设备" value={overview.offline_count} />
          <ScreenKpi icon={<AlertTriangle size={18} />} label="今日告警" value={overview.today_alert_count} />
          <ScreenKpi icon={<Activity size={18} />} label="高危告警" value={overview.high_risk_alert_count} />
          <ScreenKpi icon={<Building2 size={18} />} label="视频取证" value={overview.recent_evidence_count} />
        </section>

        <section className="video-screen-grid">
          <Card className="video-screen-card">
            <h2>告警趋势</h2>
            <div className="video-screen-bars">
              {trends.length ? trends.map((row) => (
                <div className="video-screen-bar-row" key={row.date}>
                  <span>{row.date}</span>
                  <meter value={row.count} min={0} max={Math.max(1, ...trends.map((trend) => Number(trend.count) || 0))} />
                  <strong>{row.count}</strong>
                </div>
              )) : <EmptyState text="暂无告警趋势" />}
            </div>
          </Card>
          <Card className="video-screen-card">
            <h2>摄像头状态分布</h2>
            <DataTable>
              <thead><tr><th>状态</th><th>数量</th></tr></thead>
              <tbody>
                {deviceStatus.map((row) => <tr key={row.status}><td><StatusPill variant={statusTone(row.status)}>{row.status}</StatusPill></td><td>{row.count}</td></tr>)}
                {deviceStatus.length === 0 ? <tr><td colSpan={2}><EmptyState text="暂无设备状态" /></td></tr> : null}
              </tbody>
            </DataTable>
          </Card>
        </section>

        <section className="video-screen-grid">
          <Card className="video-screen-card video-screen-card-wide">
            <h2>实时告警滚动</h2>
            <DataTable>
              <thead><tr><th>告警编号</th><th>标题</th><th>摄像头</th><th>等级</th><th>状态</th><th>触发时间</th></tr></thead>
              <tbody>
                {alerts.map((row) => (
                  <tr key={row.id}>
                    <td>{row.alertCode}</td>
                    <td>{row.title}</td>
                    <td>{row.cameraName ?? "-"}</td>
                    <td><StatusPill variant={levelTone(row.alertLevel)}>{row.alertLevel}</StatusPill></td>
                    <td>{row.processStatus}</td>
                    <td>{formatDate(row.triggeredAt)}</td>
                  </tr>
                ))}
                {alerts.length === 0 ? <tr><td colSpan={6}><EmptyState text="暂无实时告警" /></td></tr> : null}
              </tbody>
            </DataTable>
          </Card>
          <Card className="video-screen-card">
            <h2>楼栋 / 区域分布</h2>
            <div className="video-screen-bars">
              {parkMap.map((row) => (
                <div className="video-screen-bar-row" key={`${row.building_id ?? "none"}-${row.area_id ?? "none"}`}>
                  <span>{row.building_id ?? row.area_id ?? "未绑定"}</span>
                  <meter value={row.camera_count} min={0} max={Math.max(1, ...parkMap.map((item) => Number(item.camera_count) || 0))} />
                  <strong>{row.online_count}/{row.camera_count}</strong>
                </div>
              ))}
              {parkMap.length === 0 ? <EmptyState text="暂无楼栋分布" /> : null}
            </div>
          </Card>
        </section>

        <section className="video-screen-footer">
          <span>巡检联动 {overview.inspection_link_count}</span>
          <span>隐患联动 {overview.hazard_link_count}</span>
          <span>最后刷新 {lastRefreshAt ? lastRefreshAt.toLocaleTimeString() : "-"}</span>
        </section>
      </main>
    </PermissionGuard>
  );
}

function ScreenKpi({ icon, label, value }: { icon: ReactNode; label: string; value: string | number }) {
  return <Card className="video-screen-kpi"><span>{icon}</span><p>{label}</p><strong>{value}</strong></Card>;
}

function statusTone(status: string): StatusVariant {
  if (status === "ONLINE") return "success";
  if (status === "OFFLINE") return "danger";
  if (status === "DISABLED") return "default";
  return "warning";
}

function levelTone(level: string): StatusVariant {
  if (level === "CRITICAL") return "danger";
  if (level === "HIGH") return "warning";
  if (level === "MEDIUM") return "primary";
  return "default";
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function EmptyState({ text }: { text: string }) {
  return <div className="empty-state">{text}</div>;
}

function Forbidden() {
  return <main className="page-container"><Card className="page-content"><EmptyState text="无权访问安防指挥中心" /></Card></main>;
}
