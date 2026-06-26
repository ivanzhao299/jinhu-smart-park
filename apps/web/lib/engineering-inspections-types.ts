import type { PaginatedResult } from "@jinhu/shared";

export type EngineeringInspectionType =
  | "ROUTINE"
  | "QUALITY"
  | "SAFETY"
  | "PROGRESS"
  | "MATERIAL"
  | "HIDDEN_WORK"
  | "SPECIAL"
  | "ACCEPTANCE_PRECHECK"
  | "OTHER";

export type EngineeringInspectionStatus = "DRAFT" | "SUBMITTED" | "COMPLETED" | "CANCELLED";

export type EngineeringIssueType = "QUALITY" | "SAFETY" | "PROGRESS" | "DESIGN" | "MATERIAL" | "ENVIRONMENT" | "CIVILIZED_CONSTRUCTION" | "OTHER";
export type EngineeringIssueSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type EngineeringIssueStatus = "OPEN" | "RECTIFICATION_PENDING" | "RECTIFYING" | "RECHECKING" | "CLOSED" | "CANCELLED";
export type EngineeringIssueSourceType = "INSPECTION" | "DAILY_REPORT" | "MANUAL" | "OTHER";

export interface EngineeringInspection {
  id: string;
  tenantId: string;
  parkId: string;
  orgId: string | null;
  projectId: string;
  planId: string | null;
  dailyReportId: string | null;
  inspectionCode: string;
  inspectionTitle: string;
  inspectionType: EngineeringInspectionType;
  inspectionDate: string;
  inspectorUserId: string | null;
  inspectorOrgId: string | null;
  contractorOrgId: string | null;
  supervisorOrgId: string | null;
  locationText: string | null;
  buildingId: string | null;
  floorId: string | null;
  spaceId: string | null;
  inspectionStatus: EngineeringInspectionStatus;
  summary: string | null;
  overallResult: string | null;
  issueCount: number;
  criticalIssueCount: number;
  attachmentIds: string[] | null;
  submittedAt: string | null;
  submittedBy: string | null;
  remark: string | null;
  createBy: string | null;
  updateBy: string | null;
  createTime: string;
  updateTime: string;
}

export interface EngineeringIssue {
  id: string;
  tenantId: string;
  parkId: string;
  orgId: string | null;
  projectId: string;
  inspectionId: string | null;
  planId: string | null;
  dailyReportId: string | null;
  issueCode: string;
  issueTitle: string;
  issueType: EngineeringIssueType;
  severity: EngineeringIssueSeverity;
  issueStatus: EngineeringIssueStatus;
  description: string;
  locationText: string | null;
  buildingId: string | null;
  floorId: string | null;
  spaceId: string | null;
  responsibleUserId: string | null;
  responsibleOrgId: string | null;
  contractorOrgId: string | null;
  supervisorOrgId: string | null;
  discoveredAt: string;
  deadline: string | null;
  rectificationId: string | null;
  sourceType: EngineeringIssueSourceType;
  sourceId: string | null;
  attachmentIds: string[] | null;
  closedAt: string | null;
  closedBy: string | null;
  remark: string | null;
  createBy: string | null;
  updateBy: string | null;
  createTime: string;
  updateTime: string;
}

export interface EngineeringInspectionQuery {
  project_id?: string;
  plan_id?: string;
  daily_report_id?: string;
  keyword?: string;
  inspection_type?: EngineeringInspectionType | "";
  inspection_status?: EngineeringInspectionStatus | "";
  inspector_user_id?: string;
  inspector_org_id?: string;
  contractor_org_id?: string;
  supervisor_org_id?: string;
  inspection_date_from?: string;
  inspection_date_to?: string;
  page?: number;
  page_size?: number;
  sort?: string;
}

export interface EngineeringIssueQuery {
  project_id?: string;
  inspection_id?: string;
  plan_id?: string;
  daily_report_id?: string;
  keyword?: string;
  issue_type?: EngineeringIssueType | "";
  severity?: EngineeringIssueSeverity | "";
  issue_status?: EngineeringIssueStatus | "";
  responsible_user_id?: string;
  responsible_org_id?: string;
  contractor_org_id?: string;
  supervisor_org_id?: string;
  deadline_from?: string;
  deadline_to?: string;
  page?: number;
  page_size?: number;
  sort?: string;
}

export interface CreateEngineeringInspectionInput {
  project_id: string;
  plan_id?: string;
  daily_report_id?: string;
  inspection_title: string;
  inspection_type: EngineeringInspectionType;
  inspection_date: string;
  inspector_user_id?: string;
  inspector_org_id?: string;
  contractor_org_id?: string;
  supervisor_org_id?: string;
  location_text?: string;
  building_id?: string;
  floor_id?: string;
  space_id?: string;
  summary?: string;
  overall_result?: string;
  issue_count?: number;
  critical_issue_count?: number;
  attachment_ids?: string[];
  remark?: string;
}

export type UpdateEngineeringInspectionInput = Partial<Omit<CreateEngineeringInspectionInput, "project_id">>;

export interface CreateEngineeringIssueInput {
  project_id?: string;
  inspection_id?: string;
  plan_id?: string;
  daily_report_id?: string;
  issue_title: string;
  issue_type: EngineeringIssueType;
  severity: EngineeringIssueSeverity;
  description: string;
  location_text?: string;
  building_id?: string;
  floor_id?: string;
  space_id?: string;
  responsible_user_id?: string;
  responsible_org_id?: string;
  contractor_org_id?: string;
  supervisor_org_id?: string;
  deadline?: string;
  source_type?: EngineeringIssueSourceType;
  source_id?: string;
  attachment_ids?: string[];
  remark?: string;
}

export interface UpdateEngineeringIssueInput {
  plan_id?: string;
  daily_report_id?: string;
  issue_title?: string;
  issue_type?: EngineeringIssueType;
  severity?: EngineeringIssueSeverity;
  issue_status?: EngineeringIssueStatus;
  description?: string;
  location_text?: string;
  building_id?: string;
  floor_id?: string;
  space_id?: string;
  responsible_user_id?: string;
  responsible_org_id?: string;
  contractor_org_id?: string;
  supervisor_org_id?: string;
  deadline?: string;
  rectification_id?: string;
  attachment_ids?: string[];
  remark?: string;
}

export interface GenerateEngineeringRectificationInput {
  rectification_title?: string;
  description?: string;
  responsible_user_id?: string;
  responsible_org_id?: string;
  contractor_org_id?: string;
  supervisor_org_id?: string;
  deadline?: string;
  attachment_ids?: string[];
  remark?: string;
}

export type EngineeringInspectionPage = PaginatedResult<EngineeringInspection>;
export type EngineeringIssuePage = PaginatedResult<EngineeringIssue>;
