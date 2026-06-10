import { Card, DataTable } from "@jinhu/ui";
import { Eye } from "lucide-react";
import { dictLabelText, fieldText, formatDateTime } from "../lib/unit-page-utils";
import type { DictItemRow, UnitEmergenciesResponse, UnitHazardsResponse, UnitWorkPermitsResponse } from "../types";
import { StringDictBadge } from "./UnitPageFields";

export function UnitHazardsPanel({
  data,
  loading,
  error,
  dicts
}: {
  data: UnitHazardsResponse | null;
  loading: boolean;
  error: string;
  dicts: Record<string, DictItemRow[]>;
}) {
  if (loading) {
    return <p className="muted-text">正在加载隐患数据...</p>;
  }
  if (error) {
    return <p className="status-pill status-warning">{error}</p>;
  }
  const items = data?.recent_items ?? [];
  return (
    <section className="detail-stack">
      <div className="system-grid">
        <Card><strong>{data?.summary.total_count ?? 0}</strong><span>隐患总数</span></Card>
        <Card><strong>{data?.summary.open_count ?? 0}</strong><span>未闭环</span></Card>
        <Card><strong>{data?.summary.overdue_count ?? 0}</strong><span>超期</span></Card>
        <Card><strong>{data?.summary.major_count ?? 0}</strong><span>重大隐患</span></Card>
      </div>
      <DataTable>
        <thead>
          <tr>
            <th>隐患编号</th>
            <th>标题</th>
            <th>类型</th>
            <th>风险</th>
            <th>状态</th>
            <th>位置</th>
            <th>整改人</th>
            <th>超期</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map((row) => (
            <tr key={row.id}>
              <td>{row.hazard_code}</td>
              <td>{row.title}</td>
              <td>{dictLabelText(dicts.safety_hazard_type, row.hazard_type)}</td>
              <td><StringDictBadge items={dicts.safety_risk_level} value={row.risk_level} /></td>
              <td><StringDictBadge items={dicts.safety_hazard_status} value={row.status} /></td>
              <td>{fieldText(row.location)}</td>
              <td>{fieldText(row.rectify_user_name)}</td>
              <td><span className={`status-pill ${row.overdue_flag ? "status-danger" : "status-success"}`}>{row.overdue_flag ? "超期" : "正常"}</span></td>
              <td>
                <button type="button" onClick={() => { window.location.href = `/safety/hazards?hazard_id=${encodeURIComponent(row.id)}`; }}>
                  <Eye size={16} />
                  查看
                </button>
              </td>
            </tr>
          ))}
          {items.length === 0 ? <tr><td colSpan={9}>暂无关联隐患</td></tr> : null}
        </tbody>
      </DataTable>
    </section>
  );
}

export function UnitEmergenciesPanel({
  data,
  loading,
  error,
  dicts
}: {
  data: UnitEmergenciesResponse | null;
  loading: boolean;
  error: string;
  dicts: Record<string, DictItemRow[]>;
}) {
  if (loading) {
    return <p className="muted-text">正在加载应急事件...</p>;
  }
  if (error) {
    return <p className="status-pill status-warning">{error}</p>;
  }
  const items = data?.recent_items ?? [];
  return (
    <section className="detail-stack">
      <div className="system-grid">
        <Card><strong>{data?.summary.total_count ?? 0}</strong><span>事件总数</span></Card>
        <Card><strong>{data?.summary.open_count ?? 0}</strong><span>未闭环</span></Card>
        <Card><strong>{data?.summary.closed_count ?? 0}</strong><span>已闭环</span></Card>
        <Card><strong>{data?.summary.major_count ?? 0}</strong><span>重大事件</span></Card>
      </div>
      <DataTable>
        <thead>
          <tr>
            <th>事件编号</th>
            <th>标题</th>
            <th>类型</th>
            <th>严重等级</th>
            <th>响应等级</th>
            <th>状态</th>
            <th>位置</th>
            <th>上报人</th>
            <th>上报时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map((row) => (
            <tr key={row.id}>
              <td>{row.emergency_code}</td>
              <td>{row.title}</td>
              <td>{dictLabelText(dicts.safety_emergency_incident_type, row.incident_type)}</td>
              <td><StringDictBadge items={dicts.safety_emergency_severity} value={row.severity_level} /></td>
              <td><StringDictBadge items={dicts.safety_emergency_response_level} value={row.response_level} /></td>
              <td><StringDictBadge items={dicts.safety_emergency_status} value={row.status} /></td>
              <td>{fieldText(row.location)}</td>
              <td>{fieldText(row.reporter_name)}</td>
              <td>{formatDateTime(row.report_time)}</td>
              <td>
                <button type="button" onClick={() => { window.location.href = `/safety/emergencies?emergency_id=${encodeURIComponent(row.id)}`; }}>
                  <Eye size={16} />
                  查看
                </button>
              </td>
            </tr>
          ))}
          {items.length === 0 ? <tr><td colSpan={10}>暂无关联应急事件</td></tr> : null}
        </tbody>
      </DataTable>
    </section>
  );
}

export function UnitWorkPermitsPanel({
  data,
  loading,
  error,
  dicts
}: {
  data: UnitWorkPermitsResponse | null;
  loading: boolean;
  error: string;
  dicts: Record<string, DictItemRow[]>;
}) {
  if (loading) {
    return <p className="muted-text">正在加载作业许可...</p>;
  }
  if (error) {
    return <p className="status-pill status-warning">{error}</p>;
  }
  const items = data?.recent_items ?? [];
  return (
    <section className="detail-stack">
      <div className="system-grid">
        <Card><strong>{data?.summary.total_count ?? 0}</strong><span>许可总数</span></Card>
        <Card><strong>{data?.summary.in_progress_count ?? 0}</strong><span>开工中</span></Card>
        <Card><strong>{data?.summary.violation_count ?? 0}</strong><span>违规次数</span></Card>
        <Card><strong>{data?.summary.closed_count ?? 0}</strong><span>已闭环</span></Card>
      </div>
      <DataTable>
        <thead>
          <tr>
            <th>许可编号</th>
            <th>类型</th>
            <th>风险</th>
            <th>状态</th>
            <th>位置</th>
            <th>申请人</th>
            <th>施工方</th>
            <th>监护人</th>
            <th>作业时间</th>
            <th>违规</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map((row) => (
            <tr key={row.id}>
              <td>{row.permit_code}</td>
              <td>{dictLabelText(dicts.safety_work_permit_type, row.permit_type)}</td>
              <td><StringDictBadge items={dicts.safety_risk_level} value={row.risk_level} /></td>
              <td><StringDictBadge items={dicts.safety_work_permit_status} value={row.status} /></td>
              <td>{fieldText(row.location)}</td>
              <td>{fieldText(row.apply_user_name)}</td>
              <td>{fieldText(row.contractor_name)}</td>
              <td>{fieldText(row.monitor_user_name)}</td>
              <td>{`${formatDateTime(row.time_start)} - ${formatDateTime(row.time_end)}`}</td>
              <td>{row.violation_count}</td>
              <td>
                <button type="button" onClick={() => { window.location.href = `/safety/work-permits?permit_id=${encodeURIComponent(row.id)}`; }}>
                  <Eye size={16} />
                  查看
                </button>
              </td>
            </tr>
          ))}
          {items.length === 0 ? <tr><td colSpan={11}>暂无关联作业许可</td></tr> : null}
        </tbody>
      </DataTable>
    </section>
  );
}
