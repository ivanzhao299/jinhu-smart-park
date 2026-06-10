import {
  Drawer,
  DrawerHeader,
  DrawerTabButton,
  DrawerTabs
} from "@jinhu/ui";
import { SYSTEM_PERMISSIONS, type FileRecord } from "@jinhu/shared";
import {
  Archive,
  Ban,
  CheckCircle2,
  Clock3,
  CornerDownLeft,
  Hammer,
  PackageSearch,
  PlayCircle,
  Send,
  ShieldAlert,
  Shuffle,
  Star,
  X
} from "lucide-react";
import type { FormEvent } from "react";
import { PermissionButton } from "../../../../components/auth/PermissionButton";
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
  const hasActions = canAssign || canReassign || canAccept || canStart || canWaitMaterial || canFinish || canConfirm || canEvaluate || canClose || canCancel || canReturn || canReject;

  return (
    <Drawer size="lg" onClose={onClose}>
      <DrawerHeader
        eyebrow="工单详情"
        title={detail.title}
        description={`${detail.woCode} · ${labelFor(statusItems, detail.status)} · ${detail.reporterName ?? "-"}`}
        onClose={onClose}
        closeIcon={<X size={16} />}
      />
      {hasActions ? (
        <div className="drawer-action-bar">
          {canAssign ? (
            <PermissionButton className="drawer-action-button" permission={SYSTEM_PERMISSIONS.WORKORDER_ASSIGN} type="button" onClick={() => onOpenAssignment(detail, "assign")}>
              <Send size={16} />
              派单
            </PermissionButton>
          ) : null}
          {canReassign ? (
            <PermissionButton className="drawer-action-button" permission={SYSTEM_PERMISSIONS.WORKORDER_REASSIGN} type="button" onClick={() => onOpenAssignment(detail, "reassign")}>
              <Shuffle size={16} />
              改派
            </PermissionButton>
          ) : null}
          {canAccept ? (
            <PermissionButton className="drawer-action-button" permission={SYSTEM_PERMISSIONS.WORKORDER_ACCEPT} type="button" onClick={() => onDirectProcessAction(detail, "accept")}>
              <CheckCircle2 size={16} />
              接单
            </PermissionButton>
          ) : null}
          {canStart ? (
            <PermissionButton className="drawer-action-button" permission={SYSTEM_PERMISSIONS.WORKORDER_START} type="button" onClick={() => onDirectProcessAction(detail, "start")}>
              <PlayCircle size={16} />
              {detail.status === "45" ? "恢复处理" : "开始处理"}
            </PermissionButton>
          ) : null}
          {canWaitMaterial ? (
            <PermissionButton className="drawer-action-button" permission={SYSTEM_PERMISSIONS.WORKORDER_WAIT_MATERIAL} type="button" onClick={() => onOpenProcessAction(detail, "wait-material")}>
              <PackageSearch size={16} />
              待物料
            </PermissionButton>
          ) : null}
          {canFinish ? (
            <PermissionButton className="drawer-action-button" permission={SYSTEM_PERMISSIONS.WORKORDER_FINISH} type="button" onClick={() => onOpenProcessAction(detail, "finish")}>
              <Hammer size={16} />
              完成处理
            </PermissionButton>
          ) : null}
          {canConfirm ? (
            <PermissionButton className="drawer-action-button" permission={SYSTEM_PERMISSIONS.WORKORDER_CONFIRM} type="button" onClick={() => onOpenClosureAction(detail, "confirm")}>
              <CheckCircle2 size={16} />
              确认完成
            </PermissionButton>
          ) : null}
          {canEvaluate ? (
            <PermissionButton className="drawer-action-button" permission={SYSTEM_PERMISSIONS.WORKORDER_EVALUATE} type="button" onClick={() => onOpenClosureAction(detail, "evaluate")}>
              <Star size={16} />
              评价
            </PermissionButton>
          ) : null}
          {canClose ? (
            <PermissionButton className="drawer-action-button" permission={SYSTEM_PERMISSIONS.WORKORDER_CLOSE} type="button" onClick={() => onOpenClosureAction(detail, "close")}>
              <Archive size={16} />
              关闭
            </PermissionButton>
          ) : null}
          {canCancel ? (
            <PermissionButton className="drawer-action-button danger-button" permission={SYSTEM_PERMISSIONS.WORKORDER_CANCEL} type="button" onClick={() => onOpenExceptionAction(detail, "cancel")}>
              <Ban size={16} />
              取消
            </PermissionButton>
          ) : null}
          {canReturn ? (
            <PermissionButton className="drawer-action-button" permission={SYSTEM_PERMISSIONS.WORKORDER_RETURN} type="button" onClick={() => onOpenExceptionAction(detail, "return")}>
              <CornerDownLeft size={16} />
              退回
            </PermissionButton>
          ) : null}
          {canReject ? (
            <PermissionButton className="drawer-action-button danger-button" permission={SYSTEM_PERMISSIONS.WORKORDER_REJECT} type="button" onClick={() => onOpenExceptionAction(detail, "reject")}>
              <ShieldAlert size={16} />
              驳回
            </PermissionButton>
          ) : null}
        </div>
      ) : null}
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
