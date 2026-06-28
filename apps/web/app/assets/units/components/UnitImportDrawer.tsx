import { Drawer, DrawerFooter, DrawerForm, DrawerFormGrid, DrawerHeader } from "@jinhu/ui";
import { X } from "lucide-react";
import type { FormEvent } from "react";
import type { ImportResult } from "../types";
import { UnitImportResultPanel } from "./UnitImportResultPanel";

export function UnitImportDrawer({
  importResult,
  onClose,
  onFileChange,
  onSubmit,
  onDownloadTemplate
}: {
  importResult: ImportResult | null;
  onClose: () => void;
  onFileChange: (file: File | null) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onDownloadTemplate: () => void;
}) {
  return (
    <Drawer size="md" onClose={onClose}>
      <DrawerHeader
        eyebrow="资产空间"
        title="房源批量导入"
        description="通过 Excel 模板批量导入房源数据。"
        onClose={onClose}
        closeIcon={<X size={18} />}
      />
      <DrawerForm onSubmit={onSubmit}>
        <DrawerFormGrid single>
          <div className="field">
            <label>Excel 文件</label>
            <input
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              required
              type="file"
              onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
            />
          </div>
        </DrawerFormGrid>
        <DrawerFooter>
          <button className="secondary-button" type="button" onClick={onDownloadTemplate}>下载模板</button>
          <button className="secondary-button" type="button" onClick={onClose}>取消</button>
          <button className="primary-button" type="submit">开始导入</button>
        </DrawerFooter>
      </DrawerForm>
      {importResult ? <UnitImportResultPanel importResult={importResult} /> : null}
    </Drawer>
  );
}
