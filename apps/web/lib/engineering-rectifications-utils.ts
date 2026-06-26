import type { EngineeringRectificationAction, EngineeringRectificationStatus } from "./engineering-rectifications-types";

export function availableRectificationActions(status: EngineeringRectificationStatus): EngineeringRectificationAction[] {
  if (status === "PENDING") return ["START", "MARK_OVERDUE"];
  if (status === "IN_PROGRESS") return ["SUBMIT", "MARK_OVERDUE"];
  if (status === "SUBMITTED") return ["START_RECHECK", "MARK_OVERDUE"];
  if (status === "RECHECKING") return ["PASS", "REJECT", "MARK_OVERDUE"];
  if (status === "REJECTED") return ["START", "MARK_OVERDUE"];
  if (status === "PASSED") return ["CLOSE"];
  if (status === "OVERDUE") return ["START", "SUBMIT"];
  return [];
}

export function isRectificationEditable(status: EngineeringRectificationStatus): boolean {
  return status !== "PASSED" && status !== "CLOSED";
}

export function isRectificationDeletable(status: EngineeringRectificationStatus): boolean {
  return status === "PENDING" || status === "REJECTED";
}
