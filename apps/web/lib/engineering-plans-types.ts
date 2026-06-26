import type { PaginatedResult } from "@jinhu/shared";
import type { EngineeringRiskLevel } from "./engineering-projects-types";

export type EngineeringPlanType = "MASTER" | "PHASE" | "WEEKLY" | "DAILY" | "SPECIAL" | "MILESTONE";
export type EngineeringPlanStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "IN_PROGRESS" | "DELAYED" | "COMPLETED" | "CANCELLED";
export type EngineeringPlanLevel = "L1" | "L2" | "L3" | "L4";

export interface EngineeringPlan {
  id: string;
  tenantId: string;
  parkId: string;
  orgId: string | null;
  projectId: string;
  planCode: string;
  planName: string;
  planType: EngineeringPlanType;
  parentPlanId: string | null;
  planLevel: EngineeringPlanLevel;
  description: string | null;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  actualStartDate: string | null;
  actualEndDate: string | null;
  plannedProgressPercent: number;
  actualProgressPercent: number;
  weight: string | null;
  ownerUserId: string | null;
  ownerOrgId: string | null;
  contractorOrgId: string | null;
  status: EngineeringPlanStatus;
  delayDays: number;
  riskLevel: EngineeringRiskLevel;
  sortOrder: number;
  remark: string | null;
  createBy: string | null;
  updateBy: string | null;
  createTime: string;
  updateTime: string;
}

export interface EngineeringPlanQuery {
  project_id?: string;
  keyword?: string;
  plan_type?: EngineeringPlanType | "";
  status?: EngineeringPlanStatus | "";
  plan_level?: EngineeringPlanLevel | "";
  owner_user_id?: string;
  owner_org_id?: string;
  contractor_org_id?: string;
  planned_start_from?: string;
  planned_start_to?: string;
  page?: number;
  page_size?: number;
  sort?: string;
}

export interface CreateEngineeringPlanInput {
  project_id: string;
  plan_name: string;
  plan_type: EngineeringPlanType;
  parent_plan_id?: string;
  plan_level?: EngineeringPlanLevel;
  description?: string;
  planned_start_date?: string;
  planned_end_date?: string;
  planned_progress_percent?: number;
  weight?: number;
  owner_user_id?: string;
  owner_org_id?: string;
  contractor_org_id?: string;
  risk_level?: EngineeringRiskLevel;
  sort_order?: number;
  remark?: string;
}

export interface UpdateEngineeringPlanInput {
  plan_name?: string;
  plan_type?: EngineeringPlanType;
  parent_plan_id?: string;
  plan_level?: EngineeringPlanLevel;
  description?: string;
  planned_start_date?: string;
  planned_end_date?: string;
  actual_start_date?: string;
  actual_end_date?: string;
  planned_progress_percent?: number;
  actual_progress_percent?: number;
  weight?: number;
  owner_user_id?: string;
  owner_org_id?: string;
  contractor_org_id?: string;
  risk_level?: EngineeringRiskLevel;
  sort_order?: number;
  remark?: string;
}

export interface UpdateEngineeringPlanProgressInput {
  actual_progress_percent: number;
  actual_start_date?: string;
  actual_end_date?: string;
  comment?: string;
}

export interface UpdateEngineeringPlanStatusInput {
  status: EngineeringPlanStatus;
  reason: string;
  comment?: string;
}

export interface EngineeringPlanTreeNode extends EngineeringPlan {
  children: EngineeringPlanTreeNode[];
  depth: number;
}

export type EngineeringPlanPage = PaginatedResult<EngineeringPlan>;
