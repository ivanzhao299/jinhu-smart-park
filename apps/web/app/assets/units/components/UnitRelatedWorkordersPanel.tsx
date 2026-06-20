import { Card, DataTable } from "@jinhu/ui";
import type { UserContext } from "@jinhu/shared";
import { Eye } from "lucide-react";
import { maskField } from "../../../../lib/field-policy";
import { dictLabelText, fieldText } from "../lib/unit-page-utils";
import type { DictItemRow, UnitWorkOrdersResponse } from "../types";
import { StringDictBadge } from "./UnitPageFields";

export function UnitRelatedWorkordersPanel({
  data,
  loading,
  error,
  dicts,
  authUser,
  canViewReporterMobile
}: {
  data: UnitWorkOrdersResponse | null;
  loading: boolean;
  error: string;
  dicts: Record<string, DictItemRow[]>;
  authUser: UserContext | null;
  canViewReporterMobile: boolean;
}) {
  if (loading) {
    return <p className="muted-text">正在加载工单数据...</p>;
  }
  if (error) {
    return <p className="status-pill status-warning">{error}</p>;
  }
  const items = data?.recent_items ?? [];
  return (
    <section className="detail-stack">
      <div className="system-grid">
        <Card><strong>{data?.summary.total_count ?? 0}</strong><span>工单总数</span></Card>
        <Card><strong>{data?.summary.open_count ?? 0}</strong><span>未闭环</span></Card>
        <Card><strong>{data?.summary.overdue_count ?? 0}</strong><span>超时</span></Card>
      </div>
      <DataTable >
        <thead>
          <tr>
            <th>工单编号</th>
            <th>标题</th>
            <th>类型</th>
            <th>优先级</th>
            <th>状态</th>
            <th>报告人</th>
            <th>处理人</th>
            <th>超时</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map((row) => (
            <tr key={row.id}>
              <td>{row.wo_code}</td>
              <td>{row.title}</td>
              <td>{dictLabelText(dicts.workorder_type, row.wo_type)}</td>
              <td><StringDictBadge items={dicts.workorder_priority} value={row.priority} /></td>
              <td><StringDictBadge items={dicts.workorder_status} value={row.status} /></td>
              <td>
                {fieldText(row.reporter_name)}
                {canViewReporterMobile ? ` / ${fieldText(maskField(authUser, "workorder", "work_order", "reporterMobile", row.reporter_mobile))}` : ""}
              </td>
              <td>{fieldText(row.assignee_name)}</td>
              <td><span className={`status-pill ${row.overdue_flag ? "status-danger" : "status-success"}`}>{row.overdue_flag ? "超时" : "正常"}</span></td>
              <td>
                <button className="inline-action-button" type="button" onClick={() => { window.location.href = `/workorders/${row.id}`; }}>
                  <Eye size={16} />
                  查看
                </button>
              </td>
            </tr>
          ))}
          {items.length === 0 ? <tr><td colSpan={9}>暂无关联工单</td></tr> : null}
        </tbody>
      </DataTable>
    </section>
  );
}
