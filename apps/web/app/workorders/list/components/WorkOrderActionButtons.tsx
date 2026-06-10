import { DataTableActions } from "@jinhu/ui";
import { SYSTEM_PERMISSIONS } from "@jinhu/shared";
import { Edit3, Eye, Send, Shuffle, Trash2 } from "lucide-react";
import { PermissionButton } from "../../../../components/auth/PermissionButton";
import type { AssignmentMode, WorkOrderRow } from "../types";

interface WorkOrderActionButtonsProps {
  row: WorkOrderRow;
  canAssign: boolean;
  canReassign: boolean;
  onOpenDetail: (row: WorkOrderRow) => void;
  onOpenEdit: (row: WorkOrderRow) => void;
  onOpenAssignment: (row: WorkOrderRow, mode: AssignmentMode) => void;
  onRemove: (row: WorkOrderRow) => void;
}

export function WorkOrderActionButtons({
  row,
  canAssign,
  canReassign,
  onOpenDetail,
  onOpenEdit,
  onOpenAssignment,
  onRemove
}: WorkOrderActionButtonsProps) {
  return (
    <DataTableActions>
      <button className="row-action-button" title="详情" type="button" onClick={() => onOpenDetail(row)}>
        <Eye size={16} />
        详情
      </button>
      <PermissionButton className="row-action-button" permission={SYSTEM_PERMISSIONS.WORKORDER_UPDATE} title="编辑" type="button" onClick={() => onOpenEdit(row)}>
        <Edit3 size={16} />
        编辑
      </PermissionButton>
      {canAssign ? (
        <PermissionButton className="row-action-button" permission={SYSTEM_PERMISSIONS.WORKORDER_ASSIGN} title="派单" type="button" onClick={() => onOpenAssignment(row, "assign")}>
          <Send size={16} />
          派单
        </PermissionButton>
      ) : null}
      {canReassign ? (
        <PermissionButton className="row-action-button" permission={SYSTEM_PERMISSIONS.WORKORDER_REASSIGN} title="改派" type="button" onClick={() => onOpenAssignment(row, "reassign")}>
          <Shuffle size={16} />
          改派
        </PermissionButton>
      ) : null}
      <PermissionButton className="row-action-button row-action-danger" permission={SYSTEM_PERMISSIONS.WORKORDER_DELETE} title="删除" type="button" onClick={() => onRemove(row)}>
        <Trash2 size={16} />
        删除
      </PermissionButton>
    </DataTableActions>
  );
}
