import { Drawer } from "@jinhu/ui";
import type { FileRecord } from "@jinhu/shared";
import { SYSTEM_PERMISSIONS } from "@jinhu/shared";
import { X } from "lucide-react";
import { PermissionGuard } from "../../../../components/auth/PermissionGuard";
import { AttachmentList } from "../../../../components/files/AttachmentList";
import { FileUploader } from "../../../../components/files/FileUploader";
import type { UnitAttachmentMode, UnitRow } from "../types";

export function UnitAttachmentsPanel({
  unit,
  mode,
  refreshKey,
  onClose,
  onUploaded
}: {
  unit: UnitRow;
  mode: UnitAttachmentMode;
  refreshKey: number;
  onClose: () => void;
  onUploaded: (file: FileRecord) => void;
}) {
  return (
    <Drawer size="md" onClose={onClose}>
      <div className="task-item">
        <h2 className="panel-title">{unit.unitName} {mode === "photos" ? "照片" : "平面图"}</h2>
        <button type="button" title="关闭" onClick={onClose}><X size={16} /></button>
      </div>
      <PermissionGuard permission={SYSTEM_PERMISSIONS.UNIT_UPDATE}>
        <FileUploader
          bizType={mode === "photos" ? "unit_photo" : "unit_floorplan"}
          bizId={unit.id}
          uploadPath={`/park-units/${unit.id}/${mode}`}
          onUploaded={onUploaded}
        />
      </PermissionGuard>
      <AttachmentList
        bizType={mode === "photos" ? "unit_photo" : "unit_floorplan"}
        bizId={unit.id}
        refreshKey={refreshKey}
      />
    </Drawer>
  );
}
