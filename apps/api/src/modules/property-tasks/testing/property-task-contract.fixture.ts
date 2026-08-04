import type { PropertyTaskAction, PropertyTaskStatus } from "@jinhu/shared";

export const SIGNED_PROPERTY_TASK_TRANSITIONS = {
  "property.task.claim": [["open", "claimed"]],
  "property.task.start": [["claimed", "in_progress"]],
  "property.task.block": [["claimed", "blocked"], ["in_progress", "blocked"]],
  "property.task.unblock": [["blocked", "claimed"], ["blocked", "in_progress"]],
  "property.task.release": [["claimed", "open"], ["blocked", "open"]]
} as const satisfies Record<PropertyTaskAction,
  readonly (readonly [PropertyTaskStatus, PropertyTaskStatus])[]>;

export const SOURCE_TERMINAL_TRANSITIONS = [
  ["open", "closed"], ["claimed", "closed"], ["in_progress", "closed"],
  ["blocked", "closed"], ["open", "cancelled"], ["claimed", "cancelled"],
  ["in_progress", "cancelled"], ["blocked", "cancelled"]
] as const satisfies readonly (readonly [PropertyTaskStatus, PropertyTaskStatus])[];

export function signedTransitionAllowed(
  action: PropertyTaskAction,
  from: PropertyTaskStatus,
  to: PropertyTaskStatus
): boolean {
  return (SIGNED_PROPERTY_TASK_TRANSITIONS[action] as
    readonly (readonly [PropertyTaskStatus, PropertyTaskStatus])[])
    .some((edge) => edge[0] === from && edge[1] === to);
}
