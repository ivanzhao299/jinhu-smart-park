import { SYSTEM_PERMISSIONS } from "@jinhu/shared";
import { Download, FileDown, FileUp } from "lucide-react";
import { PermissionButton } from "../../../../components/auth/PermissionButton";

export function UnitImportExportActions({
  onDownloadTemplate,
  onOpenImport,
  onExport
}: {
  onDownloadTemplate: () => void;
  onOpenImport: () => void;
  onExport: () => void;
}) {
  return (
    <>
      <PermissionButton permission={SYSTEM_PERMISSIONS.UNIT_IMPORT_TEMPLATE} type="button" onClick={onDownloadTemplate}>
        <FileDown size={16} />
        下载模板
      </PermissionButton>
      <PermissionButton
        permission={SYSTEM_PERMISSIONS.UNIT_IMPORT}
        type="button"
        onClick={onOpenImport}
      >
        <FileUp size={16} />
        批量导入
      </PermissionButton>
      <PermissionButton permission={SYSTEM_PERMISSIONS.UNIT_EXPORT} type="button" onClick={onExport}>
        <Download size={16} />
        导出
      </PermissionButton>
    </>
  );
}
