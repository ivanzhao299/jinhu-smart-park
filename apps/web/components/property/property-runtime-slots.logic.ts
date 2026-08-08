import type {
  PropertyTaskAction,
  PropertyTaskDetailResponse
} from "@jinhu/shared";

export interface PropertyTaskMutationRequest {
  path: string;
  options: {
    method: "POST";
    body: Record<string, unknown>;
    idempotencyKey: string;
  };
}

export function buildPropertyTaskMutationRequest(input: {
  taskId: string;
  action: PropertyTaskAction;
  detail: PropertyTaskDetailResponse;
  reason: string;
  clientKey: string;
}): PropertyTaskMutationRequest {
  const reason = input.reason.trim();
  return {
    path: `/property/tasks/${encodeURIComponent(input.taskId)}/${taskActionPath(input.action)}`,
    options: {
      method: "POST",
      idempotencyKey: input.clientKey,
      body: {
        clientKey: input.clientKey,
        expectedAssignmentVersion: input.detail.assignmentVersion,
        expectedSourceVersion: input.detail.sourceVersion,
        businessOccurrenceKey: input.detail.businessOccurrenceKey,
        ...(input.action === "property.task.block" ? { reason, blockedUntil: null } : {}),
        ...(input.action === "property.task.release" ? { reason } : {})
      }
    }
  };
}

export function taskActionPath(action: PropertyTaskAction): string {
  return action.replace("property.task.", "");
}
