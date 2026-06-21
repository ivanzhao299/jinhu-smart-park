"use client";

import type { CSSProperties, ReactNode } from "react";
import { useEffect, useState } from "react";
import { apiRequest } from "../../../lib/api-client";
import { useAuthUser } from "../../../lib/auth-context";
import { getAccessToken } from "../../../lib/authz";
import { hasAccess } from "../../../lib/permissions";

interface AssetSummary {
  total_units: number;
  rented_units: number;
  expiring_units: number;
  occupancy_rate: number;
}

interface WorkOrderSummary {
  pending_count: number;
  in_progress_count: number;
  overdue_count: number;
}

interface SafetySummary {
  hazard_open_count: number;
  overdue_hazard_count: number;
  major_hazard_count: number;
}

interface IotSummary {
  total_devices: number;
  online_devices: number;
  active_alert_count: number;
}

interface EnergySummary {
  meter_count: number;
  active_alert_count: number;
}

interface Snapshot {
  asset: AssetSummary | null;
  workorder: WorkOrderSummary | null;
  safety: SafetySummary | null;
  iot: IotSummary | null;
  energy: EnergySummary | null;
}

function fmt(n: number | null | undefined): string {
  return n == null ? "—" : n.toLocaleString("zh-CN");
}

function pct(r: number | null | undefined): string {
  return r == null ? "—" : `${(r * 100).toFixed(1)}%`;
}

function alertStyle(n: number, severity: "danger" | "warn"): CSSProperties | undefined {
  return n > 0 ? { color: severity === "danger" ? "var(--status-danger)" : "var(--status-warning)" } : undefined;
}

function KpiCard({ label, value, meta, style }: { label: string; value: ReactNode; meta: string; style?: CSSProperties }) {
  return (
    <div className="ds-kpi-card">
      <span>{label}</span>
      <strong style={style}>{value}</strong>
      <small>{meta}</small>
    </div>
  );
}

export function DashboardMetrics() {
  const user = useAuthUser();
  const [snap, setSnap] = useState<Snapshot | null>(null);

  useEffect(() => {
    if (!user) return;
    const token = getAccessToken();

    let asset: AssetSummary | null = null;
    let workorder: WorkOrderSummary | null = null;
    let safety: SafetySummary | null = null;
    let iot: IotSummary | null = null;
    let energy: EnergySummary | null = null;

    const tasks: Promise<void>[] = [];

    if (hasAccess(user, "asset:read", "asset") && hasAccess(user, "asset:statistics", "asset")) {
      tasks.push(
        apiRequest<{ summary: AssetSummary }>("/assets/statistics", { token })
          .then((r) => { asset = r.data.summary; })
          .catch(() => undefined)
      );
    }

    if (hasAccess(user, "workorder:stats", "workorder")) {
      tasks.push(
        apiRequest<{ summary: WorkOrderSummary }>("/work-orders/stats", { token })
          .then((r) => { workorder = r.data.summary; })
          .catch(() => undefined)
      );
    }

    if (hasAccess(user, "safety_statistics:read", "safety")) {
      tasks.push(
        apiRequest<{ summary: SafetySummary }>("/safety/statistics", { token })
          .then((r) => { safety = r.data.summary; })
          .catch(() => undefined)
      );
    }

    if (hasAccess(user, "iot_dashboard:read", "iot")) {
      tasks.push(
        apiRequest<{ summary: IotSummary }>("/iot/dashboard", { token })
          .then((r) => { iot = r.data.summary; })
          .catch(() => undefined)
      );
    }

    if (hasAccess(user, "energy_dashboard:read", "energy")) {
      tasks.push(
        apiRequest<{ summary: EnergySummary }>("/energy/dashboard/overview", { token })
          .then((r) => { energy = r.data.summary; })
          .catch(() => undefined)
      );
    }

    if (tasks.length === 0) {
      setSnap({ asset: null, workorder: null, safety: null, iot: null, energy: null });
      return;
    }

    void Promise.all(tasks).then(() => setSnap({ asset, workorder, safety, iot, energy }));
  }, [user]);

  if (!snap) return null;
  if (!snap.asset && !snap.workorder && !snap.safety && !snap.iot && !snap.energy) return null;

  return (
    <section className="ds-kpi-grid" aria-label="运营指标概览">
      {snap.asset ? (
        <>
          <KpiCard
            label="出租率"
            value={pct(snap.asset.occupancy_rate)}
            meta={`已租 ${fmt(snap.asset.rented_units)} / 总计 ${fmt(snap.asset.total_units)} 间`}
          />
          <KpiCard
            label="即将到期"
            value={fmt(snap.asset.expiring_units)}
            meta="30 日内到期合同房源（间）"
            style={alertStyle(snap.asset.expiring_units, "warn")}
          />
        </>
      ) : null}
      {snap.workorder ? (
        <>
          <KpiCard
            label="待处理工单"
            value={fmt(snap.workorder.pending_count + snap.workorder.in_progress_count)}
            meta="待接 + 处理中，未闭环"
          />
          <KpiCard
            label="超时工单"
            value={fmt(snap.workorder.overdue_count)}
            meta="超出 SLA 时限"
            style={alertStyle(snap.workorder.overdue_count, "danger")}
          />
        </>
      ) : null}
      {snap.safety ? (
        <>
          <KpiCard
            label="开放隐患"
            value={fmt(snap.safety.hazard_open_count)}
            meta={`含重大隐患 ${fmt(snap.safety.major_hazard_count)} 项`}
            style={alertStyle(snap.safety.hazard_open_count, "warn")}
          />
          <KpiCard
            label="超期隐患"
            value={fmt(snap.safety.overdue_hazard_count)}
            meta="整改已逾期"
            style={alertStyle(snap.safety.overdue_hazard_count, "danger")}
          />
        </>
      ) : null}
      {snap.iot ? (
        <>
          <KpiCard
            label="设备在线"
            value={`${fmt(snap.iot.online_devices)} / ${fmt(snap.iot.total_devices)}`}
            meta="IoT 设备在线台数"
          />
          <KpiCard
            label="IoT 活跃告警"
            value={fmt(snap.iot.active_alert_count)}
            meta="待处理设备告警"
            style={alertStyle(snap.iot.active_alert_count, "danger")}
          />
        </>
      ) : null}
      {snap.energy ? (
        <>
          <KpiCard
            label="计量仪表"
            value={fmt(snap.energy.meter_count)}
            meta="电 / 水 / 气计量表数量"
          />
          <KpiCard
            label="能耗异常"
            value={fmt(snap.energy.active_alert_count)}
            meta="仪表活跃告警"
            style={alertStyle(snap.energy.active_alert_count, "danger")}
          />
        </>
      ) : null}
    </section>
  );
}
