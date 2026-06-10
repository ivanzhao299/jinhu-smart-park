import { Drawer } from "@jinhu/ui";
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
      <div className="task-item">
        <h2 className="panel-title">房源批量导入</h2>
        <button type="button" title="关闭" onClick={onClose}><X size={16} /></button>
      </div>
      <form className="form-stack" onSubmit={onSubmit}>
        <div className="field">
          <label>Excel 文件</label>
          <input
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            required
            type="file"
            onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
          />
        </div>
        <button className="primary-button" type="submit">开始导入</button>
        <button type="button" onClick={onDownloadTemplate}>下载模板</button>
      </form>
      {importResult ? <UnitImportResultPanel importResult={importResult} /> : null}
    </Drawer>
  );
}
