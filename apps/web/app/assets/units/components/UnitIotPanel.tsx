import { Card, DataTable } from "@jinhu/ui";
import { Eye } from "lucide-react";
import { dictLabelText, fieldText, formatDateTime } from "../lib/unit-page-utils";
import type { DictItemRow, UnitDevicesResponse } from "../types";
import { StringDictBadge } from "./UnitPageFields";

export function UnitDevicesPanel({
  data,
  loading,
  error,
  dicts
}: {
  data: UnitDevicesResponse | null;
  loading: boolean;
  error: string;
  dicts: Record<string, DictItemRow[]>;
}) {
  if (loading) {
    return <p className="muted-text">正在加载设备数据...</p>;
  }
  if (error) {
    return <p className="status-pill status-warning">{error}</p>;
  }
  const items = data?.recent_devices ?? [];
  return (
    <section className="detail-stack">
      <div className="system-grid">
        <Card><strong>{data?.summary.device_count ?? 0}</strong><span>设备总数</span></Card>
        <Card><strong>{data?.summary.online_count ?? 0}</strong><span>在线设备</span></Card>
        <Card><strong>{data?.summary.offline_count ?? 0}</strong><span>离线设备</span></Card>
        <Card><strong>{data?.summary.active_alert_count ?? 0}</strong><span>活跃告警</span></Card>
      </div>
      <DataTable>
        <thead>
          <tr>
            <th>设备编号</th>
            <th>设备名称</th>
            <th>设备类型</th>
            <th>在线状态</th>
            <th>启停状态</th>
            <th>位置</th>
            <th>最近上报</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map((row) => (
            <tr key={row.id}>
              <td>{row.device_code}</td>
              <td>{row.device_name}</td>
              <td>{dictLabelText(dicts.iot_device_type, row.device_type)}</td>
              <td><StringDictBadge items={dicts.iot_device_status} value={row.online_status} /></td>
              <td><StringDictBadge items={dicts.iot_device_status} value={row.status} /></td>
              <td>{fieldText(row.location)}</td>
              <td>{row.last_data_time ? formatDateTime(row.last_data_time) : "-"}</td>
              <td>
                <button type="button" onClick={() => { window.location.href = `/iot/devices/${row.id}`; }}>
                  <Eye size={16} />
                  查看
                </button>
              </td>
            </tr>
          ))}
          {items.length === 0 ? <tr><td colSpan={8}>暂无关联设备</td></tr> : null}
        </tbody>
      </DataTable>
    </section>
  );
}

export function UnitDeviceAlertsPanel({
  data,
  loading,
  error,
  dicts
}: {
  data: UnitDevicesResponse | null;
  loading: boolean;
  error: string;
  dicts: Record<string, DictItemRow[]>;
}) {
  if (loading) {
    return <p className="muted-text">正在加载设备告警...</p>;
  }
  if (error) {
    return <p className="status-pill status-warning">{error}</p>;
  }
  const items = data?.recent_alerts ?? [];
  return (
    <section className="detail-stack">
      <div className="system-grid">
        <Card><strong>{data?.summary.active_alert_count ?? 0}</strong><span>活跃告警</span></Card>
        <Card><strong>{data?.summary.device_count ?? 0}</strong><span>关联设备</span></Card>
      </div>
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
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map((row) => (
            <tr key={row.id}>
              <td>{row.alert_code}</td>
              <td>{row.alert_title}</td>
              <td>{row.device_name || row.device_code}</td>
              <td>{row.metric_code}</td>
              <td><StringDictBadge items={dicts.iot_alert_level} value={row.alert_level} /></td>
              <td><StringDictBadge items={dicts.iot_alert_status} value={row.status} /></td>
              <td>{fieldText(row.trigger_value)}</td>
              <td>{formatDateTime(row.last_trigger_time)}</td>
              <td>
                <button type="button" onClick={() => { window.location.href = `/iot/alerts?device_id=${encodeURIComponent(row.device_id)}`; }}>
                  <Eye size={16} />
                  查看
                </button>
              </td>
            </tr>
          ))}
          {items.length === 0 ? <tr><td colSpan={9}>暂无设备告警</td></tr> : null}
        </tbody>
      </DataTable>
    </section>
  );
}
