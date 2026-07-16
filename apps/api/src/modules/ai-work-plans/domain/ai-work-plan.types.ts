export const AI_WORK_PLAN_STATUSES = [
  "DRAFT",
  "NEEDS_CLARIFICATION",
  "READY_FOR_REVIEW",
  "APPROVED",
  "MATERIALIZED",
  "REJECTED",
  "CANCELLED"
] as const;

export type AiWorkPlanStatus = (typeof AI_WORK_PLAN_STATUSES)[number];
export type AiWorkPlanRisk = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type AiWorkPlanTaskStatus = "PLANNED" | "MATERIALIZED" | "CANCELLED";

export interface ParsedWorkPlanTask {
  title: string;
  description: string;
  departmentHint: string | null;
  roleHint: string | null;
  personHint: string | null;
  workOrderType: string;
  priority: "low" | "medium" | "high";
  urgency: "low" | "normal" | "urgent" | "critical";
  dueAt: Date | null;
  acceptanceCriteria: string;
  evidenceRequirements: string[];
  dependencyIndexes: number[];
}
export interface ParsedWorkPlan {
  normalizedGoal: string;
  riskLevel: AiWorkPlanRisk;
  assumptions: string[];
  clarificationQuestions: string[];
  tasks: ParsedWorkPlanTask[];
}

export interface WorkforceCandidate {
  userId: string;
  username: string;
  displayName: string;
  orgId: string | null;
  orgName: string | null;
  postName: string | null;
  roleCodes: string[];
  roleNames: string[];
  activeWorkload: number;
}

export interface ScoredWorkforceCandidate extends WorkforceCandidate {
  score: number;
  confidence: number;
  reasons: string[];
}
