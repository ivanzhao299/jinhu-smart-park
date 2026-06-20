import { Drawer, DrawerFooter, DrawerForm, DrawerFormGrid, DrawerHeader } from "@jinhu/ui";
import { X } from "lucide-react";
import type { FormEvent } from "react";
import type { ExceptionActionState, ExceptionFormState } from "../types";

interface WorkOrderExceptionActionDialogProps {
  action: ExceptionActionState;
  form: ExceptionFormState;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onFormChange: (patch: Partial<ExceptionFormState>) => void;
}

export function WorkOrderExceptionActionDialog({ action, form, onClose, onSubmit, onFormChange }: WorkOrderExceptionActionDialogProps) {
  return (
    <Drawer size="md" onClose={onClose}>
      <DrawerHeader
        eyebrow={action.mode === "cancel" ? "取消工单" : action.mode === "return" ? "退回工单" : "驳回工单"}
        title={action.row.woCode}
        description={
          action.mode === "cancel"
            ? "取消后工单进入已取消状态，只保留历史记录。"
            : action.mode === "return"
              ? "退回后工单进入已退回状态，可重新派单。"
              : "驳回后工单进入已退回状态，等待补充或重新处理。"
        }
        onClose={onClose}
        closeIcon={<X size={16} />}
      />
      <DrawerForm onSubmit={onSubmit}>
        <DrawerFormGrid single>
          <TextAreaField
            label={action.mode === "cancel" ? "取消原因" : action.mode === "return" ? "退回原因" : "驳回原因"}
            value={form.reason}
            required
            onChange={(value) => onFormChange({ reason: value })}
          />
        </DrawerFormGrid>
        <DrawerFooter>
          <button className="secondary-button" type="button" onClick={onClose}>取消</button>
          <button className="primary-button" type="submit">
            {action.mode === "cancel" ? "确认取消" : action.mode === "return" ? "确认退回" : "确认驳回"}
          </button>
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
