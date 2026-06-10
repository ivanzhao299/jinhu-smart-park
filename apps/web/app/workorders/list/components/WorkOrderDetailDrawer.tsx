import {
  Drawer,
  DrawerHeader,
  DrawerTabButton,
  DrawerTabs
} from "@jinhu/ui";
import { type FileRecord } from "@jinhu/shared";
import { Clock3, X } from "lucide-react";
import type { FormEvent } from "react";
import type {
  AssignmentMode,
  ClosureActionMode,
  DetailTab,
  DictItemRow,
  ExceptionActionMode,
  ProcessActionMode,
  WorkOrderLogFormState,
  WorkOrderLogRow,
  WorkOrderRow
} from "../types";
import { labelFor } from "../lib/workorder-page-utils";
import { WorkOrderDetailSummary } from "./WorkOrderDetailSummary";
import { WorkOrderProcessRecordsPanel } from "./WorkOrderProcessRecordsPanel";
import { WorkOrderStatusActionPanel } from "./WorkOrderStatusActionPanel";

interface WorkOrderDetailDrawerProps {
  detail: WorkOrderRow;
  detailTab: DetailTab;
  logs: WorkOrderLogRow[];
  logForm: WorkOrderLogFormState;
  module: string;
  logFileBizType: string;
  statusItems: DictItemRow[];
  typeItems: DictItemRow[];
  priorityItems: DictItemRow[];
  reporterMobileText: string;
  evaluationText: string;
  descriptionText: string;
  canAssign: boolean;
  canReassign: boolean;
  canAccept: boolean;
  canStart: boolean;
  canWaitMaterial: boolean;
  canFinish: boolean;
  canConfirm: boolean;
  canEvaluate: boolean;
  canClose: boolean;
  canCancel: boolean;
  canReturn: boolean;
  canReject: boolean;
  onClose: () => void;
  onTabChange: (tab: DetailTab) => void;
  onRefreshLogs: () => void;
  onOpenAssignment: (row: WorkOrderRow, mode: AssignmentMode) => void;
  onDirectProcessAction: (row: WorkOrderRow, action: "accept" | "start") => void;
  onOpenProcessAction: (row: WorkOrderRow, mode: ProcessActionMode) => void;
  onOpenClosureAction: (row: WorkOrderRow, mode: ClosureActionMode) => void;
  onOpenExceptionAction: (row: WorkOrderRow, mode: ExceptionActionMode) => void;
  onSubmitLog: (event: FormEvent<HTMLFormElement>) => void;
  onLogFormChange: (patch: Partial<WorkOrderLogFormState>) => void;
  onClearLogForm: () => void;
  onLogFileUploaded: (file: FileRecord) => void;
}

export function WorkOrderDetailDrawer({
  detail,
  detailTab,
  logs,
  logForm,
  module,
  logFileBizType,
  statusItems,
  typeItems,
  priorityItems,
  reporterMobileText,
  evaluationText,
  descriptionText,
  canAssign,
  canReassign,
  canAccept,
  canStart,
  canWaitMaterial,
  canFinish,
  canConfirm,
  canEvaluate,
  canClose,
  canCancel,
  canReturn,
  canReject,
  onClose,
  onTabChange,
  onRefreshLogs,
  onOpenAssignment,
  onDirectProcessAction,
  onOpenProcessAction,
  onOpenClosureAction,
  onOpenExceptionAction,
  onSubmitLog,
  onLogFormChange,
  onClearLogForm,
  onLogFileUploaded
}: WorkOrderDetailDrawerProps) {
  return (
    <Drawer size="lg" onClose={onClose}>
      <DrawerHeader
        eyebrow="工单详情"
        title={detail.title}
        description={`${detail.woCode} · ${labelFor(statusItems, detail.status)} · ${detail.reporterName ?? "-"}`}
        onClose={onClose}
        closeIcon={<X size={16} />}
      />
      <WorkOrderStatusActionPanel
        detail={detail}
        canAssign={canAssign}
        canReassign={canReassign}
        canAccept={canAccept}
        canStart={canStart}
        canWaitMaterial={canWaitMaterial}
        canFinish={canFinish}
        canConfirm={canConfirm}
        canEvaluate={canEvaluate}
        canClose={canClose}
        canCancel={canCancel}
        canReturn={canReturn}
        canReject={canReject}
        onOpenAssignment={onOpenAssignment}
        onDirectProcessAction={onDirectProcessAction}
        onOpenProcessAction={onOpenProcessAction}
        onOpenClosureAction={onOpenClosureAction}
        onOpenExceptionAction={onOpenExceptionAction}
      />
      <DrawerTabs>
        <DrawerTabButton active={detailTab === "profile"} onClick={() => onTabChange("profile")}>基础信息</DrawerTabButton>
        <DrawerTabButton active={detailTab === "logs"} onClick={() => {
          onTabChange("logs");
          onRefreshLogs();
        }}>
          <Clock3 size={16} />
          时间线 / 操作日志
        </DrawerTabButton>
      </DrawerTabs>
      {detailTab === "profile" ? (
        <WorkOrderDetailSummary
          detail={detail}
          typeItems={typeItems}
          priorityItems={priorityItems}
          statusItems={statusItems}
          reporterMobileText={reporterMobileText}
          evaluationText={evaluationText}
          descriptionText={descriptionText}
        />
      ) : null}
      {detailTab === "logs" ? (
        <WorkOrderProcessRecordsPanel
          module={module}
          logFileBizType={logFileBizType}
          workOrderId={detail.id}
          logs={logs}
          logForm={logForm}
          statusItems={statusItems}
          onRefresh={onRefreshLogs}
          onSubmitLog={onSubmitLog}
          onLogFormChange={onLogFormChange}
          onClearLogForm={onClearLogForm}
          onLogFileUploaded={onLogFileUploaded}
        />
      ) : null}
    </Drawer>
  );
}
