import { Drawer, DrawerFooter, DrawerForm, DrawerFormGrid, DrawerHeader } from "@jinhu/ui";
import { X } from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import type { UserRow } from "./types";
import {
  isWorkOrderAssigneeSelectionUnavailable,
  resolveWorkOrderAssigneeOptions,
  type WorkOrderAssignmentFormState,
  type WorkOrderAssignmentMode
} from "./work-order-assignment.logic";

interface WorkOrderAssignmentTarget {
  mode: WorkOrderAssignmentMode;
  row: {
    woCode: string;
  };
}

interface WorkOrderAssignDialogProps {
  assignment: WorkOrderAssignmentTarget;
  form: WorkOrderAssignmentFormState;
  users: UserRow[];
  usersLoading?: boolean;
  usersError?: string | null;
  error?: string | null;
  submitting?: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onFormChange: (patch: Partial<WorkOrderAssignmentFormState>) => void;
}

export function WorkOrderAssignDialog({
  assignment,
  form,
  users,
  usersLoading = false,
  usersError = null,
  error = null,
  submitting = false,
  onClose,
  onSubmit,
  onFormChange
}: WorkOrderAssignDialogProps) {
  const controlsDisabled = usersLoading || submitting;
  const assigneeOptions = resolveWorkOrderAssigneeOptions(users);
  const submitDisabled = controlsDisabled
    || assigneeOptions.length === 0
    || assigneeOptions.every((option) => option.disabled)
    || isWorkOrderAssigneeSelectionUnavailable(assigneeOptions, form.assigneeId);
  const emptyLabel = usersLoading
    ? "正在加载处理人..."
    : usersError
      ? "处理人加载失败"
      : users.length === 0
      ? "暂无可选处理人"
      : "请选择处理人";

  return (
    <Drawer size="md" onClose={onClose}>
      <DrawerHeader
        eyebrow="工单运维"
        title={`${assignment.mode === "assign" ? "派单" : "改派"} · ${assignment.row.woCode}`}
        description={assignment.mode === "assign" ? "选择处理人并记录派单说明。" : "改派必须填写原因，系统会写入工单日志。"}
        onClose={onClose}
        closeIcon={<X size={16} />}
      />
      <DrawerForm noValidate onSubmit={onSubmit}>
        {usersError ? <p className="status-pill status-danger" role="alert">处理人加载失败：{usersError}，请关闭后重试。</p> : null}
        {error ? <p className="status-pill status-danger" role="alert">{error}</p> : null}
        <DrawerFormGrid single>
          <Field label="处理人">
            <select
              required
              disabled={controlsDisabled || users.length === 0}
              value={form.assigneeId}
              onChange={(event) => onFormChange({ assigneeId: event.target.value })}
            >
              <option value="">{emptyLabel}</option>
              {assigneeOptions.map((option) => (
                <option key={option.id} value={option.id} disabled={option.disabled}>{option.label}</option>
              ))}
            </select>
          </Field>
          <TextAreaField
            label={assignment.mode === "assign" ? "派单说明" : "改派原因"}
            value={form.reason}
            required={assignment.mode === "reassign"}
            disabled={submitting}
            onChange={(value) => onFormChange({ reason: value })}
          />
        </DrawerFormGrid>
        <DrawerFooter>
          <button className="secondary-button" type="button" disabled={submitting} onClick={onClose}>取消</button>
          <button className="primary-button" type="submit" disabled={submitDisabled}>
            {submitting ? "提交中..." : assignment.mode === "assign" ? "确认派单" : "确认改派"}
          </button>
        </DrawerFooter>
      </DrawerForm>
    </Drawer>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function TextAreaField({
  label,
  value,
  required,
  disabled,
  onChange
}: {
  label: string;
  value: string;
  required?: boolean;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <textarea
        value={value}
        required={required}
        disabled={disabled}
        rows={4}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}
