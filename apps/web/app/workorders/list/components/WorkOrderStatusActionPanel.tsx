import { SYSTEM_PERMISSIONS } from "@jinhu/shared";
import {
  Archive,
  Ban,
  CheckCircle2,
  CornerDownLeft,
  Hammer,
  PackageSearch,
  PlayCircle,
  Send,
  ShieldAlert,
  Shuffle,
  Star
} from "lucide-react";
import { PermissionButton } from "../../../../components/auth/PermissionButton";
import type { AssignmentMode, ClosureActionMode, ExceptionActionMode, ProcessActionMode, WorkOrderRow } from "../types";

interface WorkOrderStatusActionPanelProps {
  detail: WorkOrderRow;
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
  onOpenAssignment: (row: WorkOrderRow, mode: AssignmentMode) => void;
  onDirectProcessAction: (row: WorkOrderRow, action: "accept" | "start") => void;
  onOpenProcessAction: (row: WorkOrderRow, mode: ProcessActionMode) => void;
  onOpenClosureAction: (row: WorkOrderRow, mode: ClosureActionMode) => void;
  onOpenExceptionAction: (row: WorkOrderRow, mode: ExceptionActionMode) => void;
}

export function WorkOrderStatusActionPanel({
  detail,
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
  onOpenAssignment,
  onDirectProcessAction,
  onOpenProcessAction,
  onOpenClosureAction,
  onOpenExceptionAction
}: WorkOrderStatusActionPanelProps) {
  const hasActions = canAssign || canReassign || canAccept || canStart || canWaitMaterial || canFinish || canConfirm || canEvaluate || canClose || canCancel || canReturn || canReject;

  if (!hasActions) return null;

  return (
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
  );
}
