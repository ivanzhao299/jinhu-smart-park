export type WorkOrderAssignmentMode = "assign" | "reassign";

export interface WorkOrderAssignmentFormState {
  assigneeId: string;
  reason: string;
}

interface WorkOrderAssigneeCandidate {
  status?: string;
}

export function filterEnabledWorkOrderAssignees<T extends WorkOrderAssigneeCandidate>(users: T[]): T[] {
  return users.filter((user) => user.status === "enabled");
}

export function getWorkOrderAssignmentError(
  mode: WorkOrderAssignmentMode,
  form: WorkOrderAssignmentFormState
): string | null {
  if (!form.assigneeId.trim()) return "请选择处理人";
  if (mode === "reassign" && !form.reason.trim()) return "改派原因必填";
  return null;
}

export function buildWorkOrderAssignmentBody(form: WorkOrderAssignmentFormState): {
  assignee_id: string;
  reason?: string;
} {
  const reason = form.reason.trim();
  return {
    assignee_id: form.assigneeId.trim(),
    ...(reason ? { reason } : {})
  };
}

export function buildWorkOrderAssignmentRequest(
  workOrderId: string,
  mode: WorkOrderAssignmentMode,
  form: WorkOrderAssignmentFormState,
  idempotencyKey: string
): {
  path: string;
  idempotencyKey: string;
  body: ReturnType<typeof buildWorkOrderAssignmentBody>;
} {
  return {
    path: `/work-orders/${workOrderId}/${mode}`,
    idempotencyKey,
    body: buildWorkOrderAssignmentBody(form)
  };
}
