import type { PaginatedResult } from "@jinhu/shared";
import type { EngineeringRiskLevel } from "./engineering-projects-types";

export type EngineeringAcceptanceType = "HIDDEN_WORK" | "STAGE" | "SPECIAL" | "COMPLETION" | "TRANSFER_PRECHECK";
export type EngineeringAcceptanceStatus = "DRAFT" | "SUBMITTED" | "REVIEWING" | "PASSED" | "FAILED" | "RECTIFICATION_REQUIRED" | "CLOSED";

export interface EngineeringAcceptance {
  id: string;
  tenantId: string;
  parkId: string;
  orgId: string | null;
  projectId: string;
  planId: string | null;
  acceptanceCode: string;
  acceptanceName: string;
  acceptanceType: EngineeringAcceptanceType;
  acceptanceStatus: EngineeringAcceptanceStatus;
  riskLevel: EngineeringRiskLevel;
  plannedAcceptanceDate: string;
  actualAcceptanceDate: string | null;
  description: string | null;
  acceptanceScope: string | null;
  acceptanceCriteria: string | null;
  resultSummary: string | null;
  reviewComment: string | null;
  responsibleUserId: string | null;
  acceptanceOrgId: string | null;
  contractorOrgId: string | null;
  supervisorOrgId: string | null;
  locationText: string | null;
  buildingId: string | null;
  floorId: string | null;
  spaceId: string | null;
  submittedAt: string | null;
  submittedBy: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  closedAt: string | null;
  closedBy: string | null;
  workflowInstanceId: string | null;
  attachmentIds: string[] | null;
  remark: string | null;
  createBy: string | null;
  updateBy: string | null;
  createTime: string;
  updateTime: string;
}

export interface EngineeringAcceptanceQuery {
  project_id?: string;
  plan_id?: string;
  keyword?: string;
  acceptance_type?: EngineeringAcceptanceType | "";
  acceptance_status?: EngineeringAcceptanceStatus | "";
  risk_level?: EngineeringRiskLevel | "";
  responsible_user_id?: string;
  acceptance_org_id?: string;
  contractor_org_id?: string;
  planned_date_from?: string;
  planned_date_to?: string;
  page?: number;
  page_size?: number;
  sort?: string;
}

export interface CreateEngineeringAcceptanceInput {
  project_id: string;
  plan_id?: string;
  acceptance_name: string;
  acceptance_type: EngineeringAcceptanceType;
  planned_acceptance_date: string;
  risk_level?: EngineeringRiskLevel;
  description?: string;
  acceptance_scope?: string;
  acceptance_criteria?: string;
  responsible_user_id?: string;
  acceptance_org_id?: string;
  contractor_org_id?: string;
  supervisor_org_id?: string;
  location_text?: string;
  building_id?: string;
  floor_id?: string;
  space_id?: string;
  workflow_instance_id?: string;
  attachment_ids?: string[];
}

export type UpdateEngineeringAcceptanceInput = Partial<Omit<CreateEngineeringAcceptanceInput, "project_id" | "workflow_instance_id">> & {
  actual_acceptance_date?: string;
  result_summary?: string;
};

export interface ReviewEngineeringAcceptanceInput {
  passed: boolean;
  rectification_required?: boolean;
  actual_acceptance_date?: string;
  result_summary?: string;
  review_comment?: string;
}

export type EngineeringAcceptancePage = PaginatedResult<EngineeringAcceptance>;
