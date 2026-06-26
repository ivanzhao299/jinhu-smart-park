import type { PaginatedResult } from "@jinhu/shared";
import type { EngineeringIssueSeverity } from "./engineering-inspections-types";

export type EngineeringRectificationStatus = "PENDING" | "IN_PROGRESS" | "SUBMITTED" | "RECHECKING" | "PASSED" | "REJECTED" | "OVERDUE" | "CLOSED";
export type EngineeringRectificationAction = "START" | "SUBMIT" | "START_RECHECK" | "PASS" | "REJECT" | "CLOSE" | "MARK_OVERDUE";

export interface EngineeringRectification {
  id: string;
  tenantId: string;
  parkId: string;
  orgId: string | null;
  projectId: string;
  issueId: string | null;
  inspectionId: string | null;
  rectificationCode: string;
  rectificationTitle: string;
  description: string;
  severity: EngineeringIssueSeverity;
  status: EngineeringRectificationStatus;
  responsibleUserId: string | null;
  responsibleOrgId: string | null;
  contractorOrgId: string | null;
  supervisorOrgId: string | null;
  locationText: string | null;
  buildingId: string | null;
  floorId: string | null;
  spaceId: string | null;
  deadline: string | null;
  startedAt: string | null;
  submittedAt: string | null;
  submittedBy: string | null;
  feedback: string | null;
  recheckedAt: string | null;
  recheckedBy: string | null;
  recheckComment: string | null;
  closedAt: string | null;
  closedBy: string | null;
  attachmentIds: string[] | null;
  remark: string | null;
  createBy: string | null;
  updateBy: string | null;
  createTime: string;
  updateTime: string;
}

export interface EngineeringRectificationQuery {
  project_id?: string;
  issue_id?: string;
  inspection_id?: string;
  keyword?: string;
  status?: EngineeringRectificationStatus | "";
  severity?: EngineeringIssueSeverity | "";
  responsible_user_id?: string;
  responsible_org_id?: string;
  contractor_org_id?: string;
  deadline_from?: string;
  deadline_to?: string;
  page?: number;
  page_size?: number;
  sort?: string;
}

export interface CreateEngineeringRectificationInput {
  project_id: string;
  issue_id?: string;
  inspection_id?: string;
  rectification_title: string;
  description: string;
  severity: EngineeringIssueSeverity;
  responsible_user_id?: string;
  responsible_org_id?: string;
  contractor_org_id?: string;
  supervisor_org_id?: string;
  location_text?: string;
  building_id?: string;
  floor_id?: string;
  space_id?: string;
  deadline?: string;
  attachment_ids?: string[];
  remark?: string;
}

export type UpdateEngineeringRectificationInput = Partial<Omit<CreateEngineeringRectificationInput, "project_id" | "issue_id" | "inspection_id">>;

export interface EngineeringRectificationActionInput {
  action: EngineeringRectificationAction;
  reason?: string;
  comment?: string;
  feedback?: string;
  recheck_comment?: string;
}

export type EngineeringRectificationPage = PaginatedResult<EngineeringRectification>;
