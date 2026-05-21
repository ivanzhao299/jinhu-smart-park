import { Clock3 } from "lucide-react";
import type { DictItemRow, WorkOrderLogRow } from "./types";
import { labelFor } from "./WorkOrderBadges";

export function WorkOrderTimeline({
  logs,
  statusItems,
  loading = false
}: {
  logs: WorkOrderLogRow[];
  statusItems: DictItemRow[];
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="skeleton-stack">
        <span className="skeleton-line skeleton-line-lg" />
        <span className="skeleton-line" />
        <span className="skeleton-line skeleton-line-sm" />
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="empty-state">
        <strong>暂无操作日志</strong>
        <span>工单创建、派单、处理、确认、评价、超时等动作会沉淀在这里。</span>
      </div>
    );
  }

  return (
    <div className="timeline-list">
      {logs.map((log) => (
        <article className="timeline-item" key={log.id}>
          <div className="timeline-dot" />
          <div className="timeline-content">
            <div className="timeline-head">
              <strong><Clock3 size={14} /> {actionLabel(log.action)}</strong>
              <span>{formatDateTime(log.opTime)}</span>
            </div>
            <p>{log.operatorName ?? "-"}</p>
            {log.beforeStatus || log.afterStatus ? (
              <p className="muted-text">
                状态：{labelFor(statusItems, log.beforeStatus)} → {labelFor(statusItems, log.afterStatus)}
              </p>
            ) : null}
            {log.reason ? <p>原因：{log.reason}</p> : null}
            {log.content ? <p>{log.content}</p> : null}
            {log.attachmentFileIds.length > 0 ? <p className="muted-text">附件：{log.attachmentFileIds.length} 个</p> : null}
          </div>
        </article>
      ))}
    </div>
  );
}

export function actionLabel(action: string): string {
  const labels: Record<string, string> = {
    create: "创建工单",
    update: "更新工单",
    assign: "派单",
    reassign: "改派",
    accept: "接单",
    start: "开始处理",
    wait_material: "待物料",
    resume: "恢复处理",
    finish: "完成处理",
    confirm: "确认完成",
    evaluate: "评价",
    close: "关闭",
    cancel: "取消",
    return: "退回",
    reject: "驳回",
    overdue: "超时标记",
    overdue_clear: "清除超时",
    system: "补充日志"
  };
  return labels[action] ?? action;
}

function formatDateTime(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", { hour12: false });
}
