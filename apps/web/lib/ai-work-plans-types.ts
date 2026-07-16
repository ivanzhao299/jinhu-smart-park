export type AiWorkPlanStatus =
  | "DRAFT"
  | "NEEDS_CLARIFICATION"
  | "READY_FOR_REVIEW"
  | "APPROVED"
  | "MATERIALIZED"
  | "REJECTED"
  | "CANCELLED";

export interface AiWorkPlan {
  id: string;
  planCode: string;
  rawInstruction: string;
  normalizedGoal: string;
  plannerMode: string;
  plannerVersion: string;
  status: AiWorkPlanStatus;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  locationText: string | null;
  assumptions: string[];
  clarificationQuestions: string[];
  taskCount: number;
  approvedAt: string | null;
  materializedAt: string | null;
  createTime: string;
}
export interface AiAssignmentCandidate {
  id: string;
  candidateUserId: string;
  candidateName: string;
  orgId: string | null;
  orgName: string | null;
  roleCodes: string[];
  postName: string | null;
  activeWorkload: number;
  score: number;
  reasons: string[];
  isSelected: boolean;
}

export interface AiWorkPlanTask {
  id: string;
  taskCode: string;
  sequenceNo: number;
  title: string;
  description: string;
  workOrderType: string;
  departmentId: string | null;
  departmentName: string | null;
  confirmedAssigneeId: string | null;
  confirmedAssigneeName: string | null;
  assignmentStrategy: string;
  assignmentConfidence: number;
  priority: "low" | "medium" | "high";
  urgency: "low" | "normal" | "urgent" | "critical";
  dueAt: string | null;
  plannedEffortMinutes: number | null;
  dependencyTaskCodes: string[];
  acceptanceCriteria: string;
  evidenceRequirements: string[];
  status: "PLANNED" | "MATERIALIZED" | "CANCELLED";
  workOrderId: string | null;
  candidates: AiAssignmentCandidate[];
}

export interface AiWorkPlanDetail {
  plan: AiWorkPlan;
  tasks: AiWorkPlanTask[];
  readiness: {
    ready: boolean;
    missingAssigneeTaskCodes: string[];
    missingDueAtTaskCodes: string[];
    clarificationQuestions: string[];
  };
}

export interface WorkforceDirectoryPerson {
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
