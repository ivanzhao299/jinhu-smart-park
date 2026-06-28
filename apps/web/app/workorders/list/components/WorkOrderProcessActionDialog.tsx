import { Drawer, DrawerFooter, DrawerForm, DrawerFormGrid, DrawerHeader } from "@jinhu/ui";
import { type FileRecord } from "@jinhu/shared";
import { X } from "lucide-react";
import type { FormEvent } from "react";
import { FileUploader } from "../../../../components/files/FileUploader";
import type { ProcessActionState, ProcessFormState } from "../types";

interface WorkOrderProcessActionDialogProps {
  action: ProcessActionState;
  form: ProcessFormState;
  finishFileBizType: string;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onFormChange: (patch: Partial<ProcessFormState>) => void;
  onFinishFileUploaded: (file: FileRecord) => void;
}

export function WorkOrderProcessActionDialog({
  action,
  form,
  finishFileBizType,
  onClose,
  onSubmit,
  onFormChange,
  onFinishFileUploaded
}: WorkOrderProcessActionDialogProps) {
  return (
    <Drawer size="md" onClose={onClose}>
      <DrawerHeader
        eyebrow="工单运维"
        title={`${action.mode === "wait-material" ? "标记待物料" : "完成处理"} · ${action.row.woCode}`}
        description={action.mode === "wait-material" ? "记录缺料原因，工单进入待物料状态。" : "填写处理说明，可上传处理后的现场图片。"}
        onClose={onClose}
        closeIcon={<X size={16} />}
      />
      <DrawerForm onSubmit={onSubmit}>
        <DrawerFormGrid single>
          {action.mode === "wait-material" ? (
            <TextAreaField
              label="待物料原因"
              value={form.reason}
              required
              onChange={(value) => onFormChange({ reason: value })}
            />
          ) : (
            <>
              <TextAreaField
                label="处理说明"
                value={form.resolveNote}
                required
                onChange={(value) => onFormChange({ resolveNote: value })}
              />
              <div className="work-panel">
                <h2 className="panel-title">处理图片</h2>
                <FileUploader bizType={finishFileBizType} bizId={action.row.id} onUploaded={onFinishFileUploaded} />
                <p className="muted-text">已选择 {form.imageFileIds.length} 个处理附件</p>
              </div>
            </>
          )}
        </DrawerFormGrid>
        <DrawerFooter>
          <button className="secondary-button" type="button" onClick={onClose}>取消</button>
          <button className="primary-button" type="submit">{action.mode === "wait-material" ? "确认待物料" : "确认完成"}</button>
        </DrawerFooter>
      </DrawerForm>
    </Drawer>
  );
}

function TextAreaField({ label, value, required, onChange }: { label: string; value: string; required?: boolean; onChange: (value: string) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <textarea value={value} required={required} rows={4} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}
