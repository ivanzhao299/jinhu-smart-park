"use client";

import {
  Drawer,
  DrawerFooter,
  DrawerForm,
  DrawerFormGrid,
  DrawerHeader,
  EmptyState,
  StatusPill
} from "@jinhu/ui";
import { CheckCircle2, LocateFixed, MapPin, PlayCircle, Send, Camera } from "lucide-react";
import type { FormEvent } from "react";
import type { CheckInForm, DictMap, InspectTaskRow, ResultInput } from "./terminal-types";
import { PermissionButton } from "../auth/PermissionButton";
import { OperationPhotoUploader } from "./OperationPhotoUploader";
import { AttachmentCounter, TerminalField } from "./TerminalFields";
import styles from "./OperationsTerminal.module.css";

export function InspectionExecutionDrawer({
  task,
  dicts,
  checkInForm,
  resultInputs,
  itemResultItems,
  onClose,
  onLocate,
  onStart,
  onSubmitCheckIn,
  onSubmitResults,
  onCheckInChange,
  onResultInputChange,
  previewMode = false
}: {
  task: InspectTaskRow;
  dicts: DictMap;
  checkInForm: CheckInForm;
  resultInputs: Record<string, ResultInput>;
  itemResultItems: Array<{ id: string; itemLabel: string; itemValue: string }>;
  onClose: () => void;
  onLocate: () => void;
  onStart: () => void;
  onSubmitCheckIn: (event: FormEvent<HTMLFormElement>) => void;
  onSubmitResults: (event: FormEvent<HTMLFormElement>) => void;
  onCheckInChange: (patch: Partial<CheckInForm>) => void;
  onResultInputChange: (itemId: string, patch: Partial<ResultInput>) => void;
  previewMode?: boolean;
}) {
  const canStart = task.status === "10";
  const canCheckIn = task.status === "20" || task.status === "10";
  const canSubmit = task.status === "20";

  return (
    <Drawer size="xl" onClose={onClose}>
      <DrawerHeader
        eyebrow="现场巡检执行"
        title={task.template?.templateName ?? task.taskCode}
        description={`${task.point?.pointName ?? "巡检点"} · ${formatDateTime(task.planTime)}`}
        onClose={onClose}
      />

      <div className={styles.drawerSummary}>
        <span><MapPin size={16} /> {task.point?.pointName ?? "-"}</span>
        <span><Camera size={16} /> 最少照片 {task.point?.requiredPhotoCount ?? 0} 张</span>
        <span><StatusPill dictCode="safety_inspect_task_status" value={task.status} dicts={dicts} /></span>
      </div>

      <div className={styles.drawerActions}>
        {previewMode ? (
          <button className="primary-button" type="button" disabled={!canStart} onClick={onStart}>
            <PlayCircle size={16} />
            开始巡检
          </button>
        ) : (
          <PermissionButton className="primary-button" permission="safety_inspect_task:start" type="button" disabled={!canStart} onClick={onStart}>
            <PlayCircle size={16} />
            开始巡检
          </PermissionButton>
        )}
        <button className="secondary-button" type="button" onClick={onLocate}>
          <LocateFixed size={16} />
          获取定位
        </button>
      </div>

      <DrawerForm onSubmit={onSubmitCheckIn}>
        <h3 className={styles.formSectionTitle}>打卡信息</h3>
        <DrawerFormGrid>
          <TerminalField label="二维码 / 点位码">
            <input value={checkInForm.qrCode} onChange={(event) => onCheckInChange({ qrCode: event.target.value })} />
          </TerminalField>
          <TerminalField label="经度">
            <input type="number" value={checkInForm.gpsLng} onFocus={(event) => event.target.select()} onChange={(event) => onCheckInChange({ gpsLng: event.target.value })} />
          </TerminalField>
          <TerminalField label="纬度">
            <input type="number" value={checkInForm.gpsLat} onFocus={(event) => event.target.select()} onChange={(event) => onCheckInChange({ gpsLat: event.target.value })} />
          </TerminalField>
          <TerminalField label="现场照片">
            <OperationPhotoUploader bizType="safety_inspect_task_checkin" bizId={task.id} onUploaded={(file) => onCheckInChange({ photoFileIds: appendUnique(checkInForm.photoFileIds, file.id) })} />
            <AttachmentCounter count={checkInForm.photoFileIds.length} />
          </TerminalField>
        </DrawerFormGrid>
        <DrawerFooter>
          <button className="secondary-button" type="button" onClick={onClose}>稍后处理</button>
          <button className="primary-button" type="submit" disabled={!canCheckIn}>
            <CheckCircle2 size={16} />
            提交打卡
          </button>
        </DrawerFooter>
      </DrawerForm>

      <DrawerForm onSubmit={onSubmitResults}>
        <h3 className={styles.formSectionTitle}>检查项</h3>
        <div className={styles.checklist}>
          {(task.items ?? []).map((item) => {
            const input = resultInputs[item.id] ?? { result: "normal", valueText: "", photoFileIds: [], createHazard: false };
            const abnormal = input.result === "abnormal";
            return (
              <section className={styles.checkItem} key={item.id}>
                <div className={styles.checkItemTitle}>
                  <strong>{item.itemName}{item.required ? " *" : ""}</strong>
                  <select value={input.result} onChange={(event) => onResultInputChange(item.id, { result: event.target.value })}>
                    {itemResultItems.map((dict) => <option key={dict.id} value={dict.itemValue}>{dict.itemLabel}</option>)}
                  </select>
                </div>
                <textarea value={input.valueText} onChange={(event) => onResultInputChange(item.id, { valueText: event.target.value })} placeholder={abnormal ? "请描述异常情况" : "可填写现场说明"} />
                <div className={styles.checkItemActions}>
                  <OperationPhotoUploader bizType="safety_inspect_task_result" bizId={task.id} onUploaded={(file) => onResultInputChange(item.id, { photoFileIds: appendUnique(input.photoFileIds, file.id) })} />
                  <AttachmentCounter count={input.photoFileIds.length} />
                  <label className={styles.checkboxRow}>
                    <input checked={input.createHazard} type="checkbox" onChange={(event) => onResultInputChange(item.id, { createHazard: event.target.checked })} />
                    异常时生成隐患
                  </label>
                </div>
              </section>
            );
          })}
          {(task.items ?? []).length === 0 ? <EmptyState compact title="暂无检查项" /> : null}
        </div>
        <DrawerFooter>
          <button className="secondary-button" type="button" onClick={onClose}>关闭</button>
          <button className="primary-button" type="submit" disabled={!canSubmit}>
            <Send size={16} />
            提交并完成
          </button>
        </DrawerFooter>
      </DrawerForm>
    </Drawer>
  );
}

function appendUnique(values: string[], next: string): string[] {
  return Array.from(new Set([...values, next].filter(Boolean)));
}

function formatDateTime(value?: string | null): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(value));
}
