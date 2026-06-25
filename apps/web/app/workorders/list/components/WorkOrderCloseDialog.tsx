import { Drawer, DrawerFooter, DrawerForm, DrawerFormGrid, DrawerHeader } from "@jinhu/ui";
import { X } from "lucide-react";
import type { FormEvent } from "react";
import type { ClosureActionState, ClosureFormState } from "../types";

interface WorkOrderCloseDialogProps {
  action: ClosureActionState;
  form: ClosureFormState;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onFormChange: (patch: Partial<ClosureFormState>) => void;
}

export function WorkOrderCloseDialog({ action, form, onClose, onSubmit, onFormChange }: WorkOrderCloseDialogProps) {
  return (
    <Drawer className="ds-compact-drawer" size="md" onClose={onClose}>
      <DrawerHeader
        eyebrow={action.mode === "confirm" ? "确认完成" : action.mode === "evaluate" ? "工单评价" : "关闭工单"}
        title={action.row.woCode}
        description={
          action.mode === "confirm"
            ? "确认处理结果后，工单进入已确认状态。"
            : action.mode === "evaluate"
              ? "填写满意度和评价内容，完成服务反馈。"
              : "关闭后工单进入闭环，不能继续处理或评价。"
        }
        onClose={onClose}
        closeIcon={<X size={16} />}
      />
      <DrawerForm onSubmit={onSubmit}>
        <DrawerFormGrid single>
          {action.mode === "confirm" ? (
            <TextAreaField
              label="确认说明"
              value={form.confirmNote}
              onChange={(value) => onFormChange({ confirmNote: value })}
            />
          ) : null}
          {action.mode === "evaluate" ? (
            <>
              <NumberField
                label="满意度"
                value={form.satisfaction}
                min={1}
                max={5}
                onChange={(value) => onFormChange({ satisfaction: value })}
              />
              <TextAreaField
                label="评价内容"
                value={form.evaluation}
                onChange={(value) => onFormChange({ evaluation: value })}
              />
            </>
          ) : null}
          {action.mode === "close" ? (
            <TextAreaField
              label="关闭原因"
              value={form.reason}
              required
              onChange={(value) => onFormChange({ reason: value })}
            />
          ) : null}
        </DrawerFormGrid>
        <DrawerFooter>
          <button className="secondary-button" type="button" onClick={onClose}>取消</button>
          <button className="primary-button" type="submit">
            {action.mode === "confirm" ? "确认完成" : action.mode === "evaluate" ? "提交评价" : "确认关闭"}
          </button>
        </DrawerFooter>
      </DrawerForm>
    </Drawer>
  );
}

function NumberField({
  label,
  value,
  min = 0,
  max,
  onChange
}: {
  label: string;
  value: string;
  min?: number;
  max?: number;
  onChange: (value: string) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        step="1"
        value={value}
        onFocus={(event) => event.target.select()}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
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
