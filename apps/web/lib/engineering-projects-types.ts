import type { PaginatedResult } from "@jinhu/shared";

export type EngineeringProjectType =
  | "NEW_BUILD"
  | "RENOVATION"
  | "DECORATION"
  | "INSTALLATION"
  | "REPAIR"
  | "MUNICIPAL"
  | "LANDSCAPE"
  | "ELECTRICAL"
  | "WEAK_CURRENT"
  | "FIRE_PROTECTION"
  | "HVAC"
  | "OTHER";

export type EngineeringProjectStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "APPROVED"
  | "PLANNING"
  | "EXECUTING"
  | "INSPECTING"
  | "RECTIFYING"
  | "ACCEPTING"
  | "ACCEPTED"
  | "TRANSFER_READY"
  | "SETTLEMENT_READY"
  | "CLOSED"
  | "ARCHIVED"
  | "CANCELLED";

export type EngineeringProjectLevel = "NORMAL" | "IMPORTANT" | "MAJOR";
export type EngineeringRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type EngineeringTransferStatus = "NOT_READY" | "READY" | "TRANSFER_PENDING" | "TRANSFERRED" | "REJECTED";
export type EngineeringFinanceStatus = "NOT_REQUIRED" | "PENDING" | "PARTIAL" | "COMPLETED";
export type EngineeringAssetStatus = "NOT_REQUIRED" | "PENDING" | "GENERATED";

export type EngineeringProjectAction =
  | "SUBMIT"
  | "APPROVE"
  | "CANCEL"
  | "START_PLANNING"
  | "START_EXECUTION"
  | "START_INSPECTION"
  | "REQUIRE_RECTIFICATION"
  | "START_ACCEPTANCE"
  | "ACCEPTANCE_PASSED"
  | "ACCEPTANCE_FAILED"
  | "MARK_TRANSFER_READY"
  | "MARK_SETTLEMENT_READY"
  | "CLOSE"
  | "ARCHIVE";

export interface EngineeringProject {
  id: string;
  tenantId: string;
  orgId: string | null;
  parkId: string;
  projectCode: string;
  projectName: string;
  projectType: EngineeringProjectType;
  projectLevel: EngineeringProjectLevel;
  projectSource: string | null;
  description: string | null;
  locationText: string | null;
  buildingId: string | null;
  floorId: string | null;
  spaceId: string | null;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  actualStartDate: string | null;
  actualEndDate: string | null;
  budgetAmount: string | null;
  contractAmount: string | null;
  settlementAmount: string | null;
  projectManagerId: string | null;
  engineeringDirectorId: string | null;
  contractorOrgId: string | null;
  supervisorOrgId: string | null;
  status: EngineeringProjectStatus;
  progressPercent: number;
  riskLevel: EngineeringRiskLevel;
  qualityScore: string | null;
  safetyScore: string | null;
  workflowInstanceId: string | null;
  transferStatus: EngineeringTransferStatus;
  financeStatus: EngineeringFinanceStatus;
  assetStatus: EngineeringAssetStatus;
  remark: string | null;
  createBy: string | null;
  updateBy: string | null;
  createTime: string;
  updateTime: string;
}

export interface EngineeringProjectQuery {
  keyword?: string;
  project_type?: EngineeringProjectType | "";
  status?: EngineeringProjectStatus | "";
  project_level?: EngineeringProjectLevel | "";
  risk_level?: EngineeringRiskLevel | "";
  org_id?: string;
  park_id?: string;
  project_manager_id?: string;
  contractor_org_id?: string;
  planned_start_from?: string;
  planned_start_to?: string;
  created_from?: string;
  created_to?: string;
  page?: number;
  page_size?: number;
  sort?: string;
}

export interface CreateEngineeringProjectInput {
  org_id?: string;
  project_name: string;
  project_type: EngineeringProjectType;
  planned_start_date: string;
  planned_end_date: string;
  project_manager_id: string;
  project_level?: EngineeringProjectLevel;
  project_source?: string;
  description?: string;
  location_text?: string;
  building_id?: string;
  floor_id?: string;
  space_id?: string;
  budget_amount?: number;
  contract_amount?: number;
  engineering_director_id?: string;
  contractor_org_id?: string;
  supervisor_org_id?: string;
  risk_level?: EngineeringRiskLevel;
  remark?: string;
}

export interface UpdateEngineeringProjectInput {
  org_id?: string;
  project_name?: string;
  project_type?: EngineeringProjectType;
  project_level?: EngineeringProjectLevel;
  project_source?: string;
  description?: string;
  location_text?: string;
  building_id?: string;
  floor_id?: string;
  space_id?: string;
  planned_start_date?: string;
  planned_end_date?: string;
  actual_start_date?: string;
  actual_end_date?: string;
  budget_amount?: number;
  contract_amount?: number;
  project_manager_id?: string;
  engineering_director_id?: string;
  contractor_org_id?: string;
  supervisor_org_id?: string;
  progress_percent?: number;
  risk_level?: EngineeringRiskLevel;
  remark?: string;
}

export interface ExecuteEngineeringProjectActionInput {
  reason: string;
  comment?: string;
  workflow_instance_id?: string;
}

export interface EngineeringProjectAvailableAction {
  action: EngineeringProjectAction;
  targetStatus: EngineeringProjectStatus;
  requiredPermission: string;
}

export interface EngineeringProjectStatusLog {
  id: string;
  tenantId: string;
  parkId: string;
  projectId: string;
  fromStatus: EngineeringProjectStatus;
  toStatus: EngineeringProjectStatus;
  action: EngineeringProjectAction;
  reason: string;
  comment: string | null;
  actorUserId: string;
  actorName: string | null;
  workflowInstanceId: string | null;
  requestId: string | null;
  createdAt: string;
}

export type EngineeringProjectPage = PaginatedResult<EngineeringProject>;
