import type {
  HrPerformanceLegacyDepartmentMatchMode,
  PaginatedResult,
} from "@jinhu/shared";
import { apiRequest } from "./api-client";

export interface HrPerformanceLegacyAssessmentMasterQueryRow {
  unresolvedLegacyAssessmentMasterId: null;
  sourcePersonCode: string | null;
  employeeDisplayName: string | null;
  sourceAssGrade: string | null;
  sourceItemValue: string | null;
  sourceMasterValue: string | null;
  sourceTimekeepValue: string | null;
  sourceBonusValue: string | null;
  sourceAppraisal: string | null;
  sourceAssessmentPerson: string | null;
  sourceRecordedAt: string | null;
  sourceOperatorCode: string | null;
}

export interface HrPerformanceLegacyAssessmentMasterFilters {
  assSession: string;
  assessmentType: string;
  departmentLike: string;
  departmentMatchMode: HrPerformanceLegacyDepartmentMatchMode;
}

const unwrap = async <T>(request: Promise<{ data: T }>): Promise<T> =>
  (await request).data;

export function performanceLegacyAssessmentMasterQuery(
  filters: HrPerformanceLegacyAssessmentMasterFilters,
  token?: string,
  page = 1,
  pageSize = 20,
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({
    ass_session: filters.assSession,
    assessment_type: filters.assessmentType,
    department_like: filters.departmentLike,
    department_match_mode: filters.departmentMatchMode,
    page: String(page),
    page_size: String(pageSize),
  });
  return unwrap(
    apiRequest<PaginatedResult<HrPerformanceLegacyAssessmentMasterQueryRow>>(
      `/hr/performance-legacy/query-reports/assessment-master?${query.toString()}`,
      { token, signal },
    ),
  );
}
