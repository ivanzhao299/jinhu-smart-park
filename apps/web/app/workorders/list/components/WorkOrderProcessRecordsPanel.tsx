import { DrawerFooter, DrawerFormGrid } from "@jinhu/ui";
import { SYSTEM_PERMISSIONS, type FileRecord } from "@jinhu/shared";
import { RefreshCw } from "lucide-react";
import type { FormEvent } from "react";
import { PermissionGuard } from "../../../../components/auth/PermissionGuard";
import { FileUploader } from "../../../../components/files/FileUploader";
import type { DictItemRow, WorkOrderLogFormState, WorkOrderLogRow } from "../types";
import { formatDateTime, labelFor } from "../lib/workorder-page-utils";

interface WorkOrderProcessRecordsPanelProps {
  module: string;
  logFileBizType: string;
  workOrderId: string;
  logs: WorkOrderLogRow[];
  logForm: WorkOrderLogFormState;
  statusItems: DictItemRow[];
  onRefresh: () => void;
  onSubmitLog: (event: FormEvent<HTMLFormElement>) => void;
  onLogFormChange: (patch: Partial<WorkOrderLogFormState>) => void;
  onClearLogForm: () => void;
  onLogFileUploaded: (file: FileRecord) => void;
}

export function WorkOrderProcessRecordsPanel({
  module,
  logFileBizType,
  workOrderId,
  logs,
  logForm,
  statusItems,
  onRefresh,
  onSubmitLog,
  onLogFormChange,
  onClearLogForm,
  onLogFileUploaded
}: WorkOrderProcessRecordsPanelProps) {
  return (
    <section className="work-panel">
      <div className="task-item">
        <h3 className="panel-title">时间线</h3>
        <button type="button" onClick={onRefresh}>
          <RefreshCw size={16} />
          刷新
        </button>
      </div>
      <div className="timeline-list">
        {logs.map((log) => (
          <article className="timeline-item" key={log.id}>
            <div className="timeline-dot" />
            <div className="timeline-content">
              <div className="timeline-head">
                <strong>{actionLabel(log.action)}</strong>
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
        {logs.length === 0 ? <p className="muted-text">暂无操作日志</p> : null}
      </div>
      <PermissionGuard permission={SYSTEM_PERMISSIONS.WORKORDER_LOG_CREATE} module={module} fallback={null}>
        <form className="form-stack" onSubmit={onSubmitLog}>
          <DrawerFormGrid single>
            <TextField label="补充原因" value={logForm.reason} onChange={(value) => onLogFormChange({ reason: value })} />
            <TextAreaField label="补充内容" value={logForm.content} required onChange={(value) => onLogFormChange({ content: value })} />
            <div className="work-panel">
              <h3 className="panel-title">日志附件</h3>
              <FileUploader bizType={logFileBizType} bizId={workOrderId} onUploaded={onLogFileUploaded} />
              <p className="muted-text">已选择 {logForm.attachmentFileIds.length} 个附件</p>
            </div>
          </DrawerFormGrid>
          <DrawerFooter>
            <button type="button" onClick={onClearLogForm}>清空</button>
            <button className="primary-button" type="submit">补充日志</button>
          </DrawerFooter>
        </form>
      </PermissionGuard>
    </section>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function TextAreaField({ label, value, required, onChange }: { label: string; value: string; required?: boolean; onChange: (value: string) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <textarea value={value} required={required} rows={4} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function actionLabel(action: string): string {
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
