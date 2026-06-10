import { Card, DataTable } from "@jinhu/ui";
import { SYSTEM_PERMISSIONS } from "@jinhu/shared";
import { PermissionGuard } from "../../../../components/auth/PermissionGuard";
import { dictLabel, formatDateTime } from "../lib/unit-page-utils";
import type { DictItemRow, UnitStatusLogPage } from "../types";

export function UnitStatusLogsPanel({
  statusLogPage,
  dicts,
  onPageChange
}: {
  statusLogPage: UnitStatusLogPage;
  dicts: Record<string, DictItemRow[]>;
  onPageChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(statusLogPage.total / statusLogPage.page_size));

  return (
    <PermissionGuard permission={SYSTEM_PERMISSIONS.UNIT_STATUS_LOG}>
      <Card >
        <h3 className="panel-title">状态日志</h3>
        <DataTable >
          <thead><tr><th>原状态</th><th>新状态</th><th>原因</th><th>来源</th><th>操作人</th><th>时间</th></tr></thead>
          <tbody>
            {statusLogPage.items.map((log) => (
              <tr key={log.id}>
                <td>{dictLabel(dicts.unit_rental_status, log.beforeStatus)}</td>
                <td>{dictLabel(dicts.unit_rental_status, log.afterStatus)}</td>
                <td>{log.reason || "-"}</td>
                <td>{log.sourceType}</td>
                <td>{log.operatorName ?? log.createBy ?? "-"}</td>
                <td>{formatDateTime(log.opTime ?? log.createTime)}</td>
              </tr>
            ))}
            {statusLogPage.items.length === 0 ? <tr><td colSpan={6}>暂无状态日志</td></tr> : null}
          </tbody>
        </DataTable>
        <div className="task-item">
          <span>共 {statusLogPage.total} 条，第 {statusLogPage.page} / {totalPages} 页</span>
          <span>
            <button type="button" disabled={statusLogPage.page <= 1} onClick={() => onPageChange(Math.max(1, statusLogPage.page - 1))}>上一页</button>
            <button
              type="button"
              disabled={statusLogPage.page >= totalPages}
              onClick={() => onPageChange(statusLogPage.page + 1)}
            >
              下一页
            </button>
          </span>
        </div>
      </Card>
    </PermissionGuard>
  );
}
