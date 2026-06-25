import { Drawer, DrawerFooter, DrawerForm, DrawerFormGrid, DrawerHeader } from "@jinhu/ui";
import { X } from "lucide-react";
import type { FormEvent } from "react";
import type { AssignmentFormState, AssignmentState, UserRow } from "../types";
import { displayUserName } from "../lib/workorder-page-utils";

interface WorkOrderAssignDialogProps {
  assignment: AssignmentState;
  form: AssignmentFormState;
  users: UserRow[];
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onFormChange: (patch: Partial<AssignmentFormState>) => void;
}

export function WorkOrderAssignDialog({ assignment, form, users, onClose, onSubmit, onFormChange }: WorkOrderAssignDialogProps) {
  return (
    <Drawer className="ds-compact-drawer" size="md" onClose={onClose}>
      <DrawerHeader
        eyebrow={assignment.mode === "assign" ? "工单派单" : "工单改派"}
        title={assignment.row.woCode}
        description={assignment.mode === "assign" ? "选择处理人并记录派单说明。" : "改派必须填写原因，系统会写入工单日志。"}
        onClose={onClose}
        closeIcon={<X size={16} />}
      />
      <DrawerForm onSubmit={onSubmit}>
        <DrawerFormGrid single>
          <Field label="处理人">
            <select required value={form.assigneeId} onChange={(event) => onFormChange({ assigneeId: event.target.value })}>
              <option value="">请选择处理人</option>
              {users.map((user) => <option key={user.id} value={user.id}>{displayUserName(user)}</option>)}
            </select>
          </Field>
          <TextAreaField
            label={assignment.mode === "assign" ? "派单说明" : "改派原因"}
            value={form.reason}
            required={assignment.mode === "reassign"}
            onChange={(value) => onFormChange({ reason: value })}
          />
        </DrawerFormGrid>
        <DrawerFooter>
          <button className="secondary-button" type="button" onClick={onClose}>取消</button>
          <button className="primary-button" type="submit">{assignment.mode === "assign" ? "确认派单" : "确认改派"}</button>
        </DrawerFooter>
      </DrawerForm>
    </Drawer>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  );
}

function TextAreaField({ label, value, required, onChange }: { label: string; value: string; required?: boolean; onChange: (value: string) => void }) {
  return (
    <Field label={label}>
      <textarea value={value} required={required} rows={4} onChange={(event) => onChange(event.target.value)} />
    </Field>
  );
}
