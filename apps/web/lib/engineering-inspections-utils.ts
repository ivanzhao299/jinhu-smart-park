import type { EngineeringInspectionStatus } from "./engineering-inspections-types";

export function isInspectionEditable(status: EngineeringInspectionStatus): boolean {
  return status === "DRAFT";
}

export function isInspectionSubmittable(status: EngineeringInspectionStatus): boolean {
  return status === "DRAFT";
}

export function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

export function validateInspectionCounts(issueCount: string, criticalIssueCount: string): string {
  const issue = Number(issueCount);
  const critical = Number(criticalIssueCount);
  if (!Number.isFinite(issue) || issue < 0) return "问题数量不能为负数";
  if (!Number.isFinite(critical) || critical < 0) return "重大问题数量不能为负数";
  if (critical > issue) return "重大问题数量不能超过问题总数";
  return "";
}
