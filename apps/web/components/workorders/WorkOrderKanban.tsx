import Link from "next/link";
import { MapPin, UserRound } from "lucide-react";
import type { DictItemRow, WorkOrderRow } from "./types";
import { PriorityBadge, WorkOrderStatusBadge } from "./WorkOrderBadges";

export interface WorkOrderKanbanColumn {
  key: string;
  title: string;
  statuses: string[];
}

export function WorkOrderKanban({
  columns,
  items,
  priorityItems,
  statusItems,
  loading = false
}: {
  columns: WorkOrderKanbanColumn[];
  items: WorkOrderRow[];
  priorityItems: DictItemRow[];
  statusItems: DictItemRow[];
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="workorder-kanban">
        {columns.slice(0, 4).map((column) => (
          <section className="workorder-kanban-column" key={column.key}>
            <div className="workorder-kanban-column-head">
              <strong>{column.title}</strong>
              <span className="status-pill">加载中</span>
            </div>
            <div className="skeleton-stack">
              <span className="skeleton-line skeleton-line-lg" />
              <span className="skeleton-line" />
              <span className="skeleton-line skeleton-line-sm" />
            </div>
          </section>
        ))}
      </div>
    );
  }

  return (
    <div className="workorder-kanban">
      {columns.map((column) => {
        const columnItems = items.filter((item) => column.statuses.includes(item.status));
        return (
          <section className="workorder-kanban-column" key={column.key}>
            <div className="workorder-kanban-column-head">
              <strong>{column.title}</strong>
              <span className="status-pill">{columnItems.length} 单</span>
            </div>
            <div className="workorder-kanban-cards">
              {columnItems.map((item) => (
                <Link className="workorder-kanban-card" href={`/workorders/${item.id}`} key={item.id}>
                  <div className="workorder-kanban-card-head">
                    <strong>{item.woCode}</strong>
                    {item.overdueFlag ? <span className="status-pill status-danger">超时</span> : null}
                  </div>
                  <h3>{item.title}</h3>
                  <div className="workorder-kanban-card-tags">
                    <PriorityBadge items={priorityItems} value={item.priority} />
                    <WorkOrderStatusBadge items={statusItems} value={item.status} />
                  </div>
                  <p><UserRound size={14} /> {item.assigneeName ?? "未派单"}</p>
                  <p><MapPin size={14} /> {item.location ?? item.unit?.unitName ?? item.roomLabel ?? "-"}</p>
                </Link>
              ))}
              {columnItems.length === 0 ? <div className="workorder-kanban-empty">暂无工单</div> : null}
            </div>
          </section>
        );
      })}
    </div>
  );
}
