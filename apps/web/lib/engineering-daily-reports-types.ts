import type { PaginatedResult } from "@jinhu/shared";

export type EngineeringDailyReportStatus = "DRAFT" | "SUBMITTED" | "REVIEWED" | "REJECTED" | "ARCHIVED";
export type EngineeringWeatherType = "SUNNY" | "CLOUDY" | "OVERCAST" | "RAIN" | "SNOW" | "WINDY" | "FOG" | "OTHER";

export interface EngineeringDailyReport {
  id: string;
  tenantId: string;
  parkId: string;
  orgId: string | null;
  projectId: string;
  planId: string | null;
  reportCode: string;
  reportDate: string;
  weather: EngineeringWeatherType;
  temperature: string | null;
  workContent: string;
  completedWork: string | null;
  unfinishedWork: string | null;
  tomorrowPlan: string | null;
  workerCount: number;
  managerCount: number;
  machineSummary: string | null;
  materialSummary: string | null;
  qualitySummary: string | null;
  safetySummary: string | null;
  issueSummary: string | null;
  progressPercent: number;
  reportStatus: EngineeringDailyReportStatus;
  submittedAt: string | null;
  submittedBy: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewComment: string | null;
  contractorOrgId: string | null;
  supervisorOrgId: string | null;
  attachmentIds: string[] | null;
  remark: string | null;
  createBy: string | null;
  updateBy: string | null;
  createTime: string;
  updateTime: string;
}

export interface EngineeringDailyReportQuery {
  project_id?: string;
  plan_id?: string;
  keyword?: string;
  report_status?: EngineeringDailyReportStatus | "";
  weather?: EngineeringWeatherType | "";
  contractor_org_id?: string;
  supervisor_org_id?: string;
  report_date_from?: string;
  report_date_to?: string;
  page?: number;
  page_size?: number;
  sort?: string;
}

export interface CreateEngineeringDailyReportInput {
  project_id: string;
  plan_id?: string;
  report_date: string;
  weather: EngineeringWeatherType;
  temperature?: string;
  work_content: string;
  completed_work?: string;
  unfinished_work?: string;
  tomorrow_plan?: string;
  worker_count?: number;
  manager_count?: number;
  machine_summary?: string;
  material_summary?: string;
  quality_summary?: string;
  safety_summary?: string;
  issue_summary?: string;
  progress_percent?: number;
  contractor_org_id?: string;
  supervisor_org_id?: string;
  attachment_ids?: string[];
  remark?: string;
}

export interface UpdateEngineeringDailyReportInput {
  plan_id?: string;
  weather?: EngineeringWeatherType;
  temperature?: string;
  work_content?: string;
  completed_work?: string;
  unfinished_work?: string;
  tomorrow_plan?: string;
  worker_count?: number;
  manager_count?: number;
  machine_summary?: string;
  material_summary?: string;
  quality_summary?: string;
  safety_summary?: string;
  issue_summary?: string;
  progress_percent?: number;
  contractor_org_id?: string;
  supervisor_org_id?: string;
  attachment_ids?: string[];
  remark?: string;
}

export interface ReviewEngineeringDailyReportInput {
  approved: boolean;
  review_comment?: string;
}

export type EngineeringDailyReportPage = PaginatedResult<EngineeringDailyReport>;
