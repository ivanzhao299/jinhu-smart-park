import type {
  ApprovalSummary,
  PropertyTaskAction,
  PropertyTaskDetailResponse,
  PropertyTaskListItem
} from "@jinhu/shared";
import { encodeReturnContext } from "../../features/property-shared/detail/return-context";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface PropertyRuntimeTarget {
  taskId: string | null;
  requestId: string | null;
  invalid: boolean;
}

export function propertyRuntimeDetailHref(
  href: string,
  module: "homestay" | "housing_rental",
  search: string
): string {
  const params = new URLSearchParams(search);
  const query: Record<string, string | string[]> = {};
  params.forEach((value, key) => {
    const current = query[key];
    query[key] = current === undefined
      ? value
      : Array.isArray(current) ? [...current, value] : [current, value];
  });
  const returnTo = encodeReturnContext({
    route: module === "homestay" ? "tasks" : "/housing/tasks",
    query
  });
  const outerQuery = new URLSearchParams({ returnTo });
  return `${href}${href.includes("?") ? "&" : "?"}${outerQuery.toString()}`;
}

export function parsePropertyRuntimeTarget(input: {
  taskId: string | null;
  requestId: string | null;
}): PropertyRuntimeTarget {
  const taskId = input.taskId?.trim() || null;
  const requestId = input.requestId?.trim() || null;
  const validTaskId = taskId !== null && UUID_PATTERN.test(taskId) ? taskId : null;
  const validRequestId = requestId !== null && UUID_PATTERN.test(requestId) ? requestId : null;
  const invalid = (taskId !== null && validTaskId === null)
    || (requestId !== null && validRequestId === null)
    || (validTaskId !== null && validRequestId !== null);
  return {
    taskId: invalid ? null : validTaskId,
    requestId: invalid ? null : validRequestId,
    invalid
  };
}

export function prependUniquePropertyRuntimeItem<T>(
  target: T,
  items: readonly T[],
  id: (item: T) => string
): T[] {
  const targetId = id(target);
  return [target, ...items.filter((item) => id(item) !== targetId)];
}

export function propertyTaskTargetAllowed(
  task: PropertyTaskListItem,
  sourceTypes: readonly string[]
): boolean {
  return sourceTypes.includes(task.sourceType);
}

export function propertyApprovalTargetAllowed(
  approval: ApprovalSummary & { sourceType: string },
  sourceTypes: readonly string[]
): boolean {
  return sourceTypes.includes(approval.sourceType);
}

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
