import { Card, DataTable } from "@jinhu/ui";
import type { AssignmentMode, DictItemRow, WorkOrderRow, WorkOrdersPageData } from "../types";
import { formatDateTime, labelFor } from "../lib/workorder-page-utils";
import { WorkOrderActionButtons } from "./WorkOrderActionButtons";
import { WorkOrderPriorityBadge } from "./WorkOrderPriorityBadge";
import { WorkOrderStatusBadge } from "./WorkOrderStatusBadge";

interface WorkOrdersTableProps {
  pageData: WorkOrdersPageData;
  typeItems: DictItemRow[];
  priorityItems: DictItemRow[];
  statusItems: DictItemRow[];
  canAssignWorkOrder: (row: WorkOrderRow) => boolean;
  canReassignWorkOrder: (row: WorkOrderRow) => boolean;
  onOpenDetail: (row: WorkOrderRow) => void;
  onOpenEdit: (row: WorkOrderRow) => void;
  onOpenAssignment: (row: WorkOrderRow, mode: AssignmentMode) => void;
  onRemove: (row: WorkOrderRow) => void;
  onPageChange: (page: number) => void;
}

export function WorkOrdersTable({
  pageData,
  typeItems,
  priorityItems,
  statusItems,
  canAssignWorkOrder,
  canReassignWorkOrder,
  onOpenDetail,
  onOpenEdit,
  onOpenAssignment,
  onRemove,
  onPageChange
}: WorkOrdersTableProps) {
  const totalPages = Math.max(1, Math.ceil(pageData.total / pageData.page_size));

  return (
    <Card className="table-scroll">
      <DataTable>
        <thead>
          <tr>
            <th>工单编号</th>
            <th>标题</th>
            <th>类型</th>
            <th>优先级</th>
            <th>状态</th>
            <th>租户企业</th>
            <th>位置</th>
            <th>报告人</th>
            <th>处理人</th>
            <th>超时</th>
            <th>创建时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {pageData.items.map((row) => (
            <tr key={row.id}>
              <td>{row.woCode}</td>
              <td>{row.title}</td>
              <td>{labelFor(typeItems, row.woType)}</td>
              <td><WorkOrderPriorityBadge items={priorityItems} value={row.priority} /></td>
              <td><WorkOrderStatusBadge items={statusItems} value={row.status} /></td>
              <td>{row.parkTenant?.companyName ?? "-"}</td>
              <td>{row.location ?? row.unit?.unitName ?? row.roomLabel ?? "-"}</td>
              <td>{row.reporterName ?? "-"}</td>
              <td>{row.assigneeName ?? "-"}</td>
              <td>{row.overdueFlag ? <span className="status-pill status-danger">超时</span> : <span className="status-pill status-muted">正常</span>}</td>
              <td>{formatDateTime(row.createTime)}</td>
              <td>
                <WorkOrderActionButtons
                  row={row}
                  canAssign={canAssignWorkOrder(row)}
                  canReassign={canReassignWorkOrder(row)}
                  onOpenDetail={onOpenDetail}
                  onOpenEdit={onOpenEdit}
                  onOpenAssignment={onOpenAssignment}
                  onRemove={onRemove}
                />
              </td>
            </tr>
          ))}
          {pageData.items.length === 0 ? (
            <tr>
              <td colSpan={12}>暂无工单数据</td>
            </tr>
          ) : null}
        </tbody>
      </DataTable>
      <div className="task-item">
        <span>共 {pageData.total} 条，第 {pageData.page} / {totalPages} 页</span>
        <span>
          <button type="button" disabled={pageData.page <= 1} onClick={() => onPageChange(Math.max(1, pageData.page - 1))}>上一页</button>
          <button type="button" disabled={pageData.page >= totalPages} onClick={() => onPageChange(pageData.page + 1)}>下一页</button>
        </span>
      </div>
    </Card>
  );
}
