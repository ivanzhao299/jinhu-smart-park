import { Drawer, DrawerFooter, DrawerHeader } from "@jinhu/ui";
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
      <DrawerHeader
        eyebrow="资产空间"
        title={`${unit.unitName} ${mode === "photos" ? "照片" : "平面图"}`}
        description="上传与查看房源的照片与平面图附件。"
        onClose={onClose}
        closeIcon={<X size={18} />}
      />
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
      <DrawerFooter>
        <button className="secondary-button" type="button" onClick={onClose}>关闭</button>
      </DrawerFooter>
    </Drawer>
  );
}
