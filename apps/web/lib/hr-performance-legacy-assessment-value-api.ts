import type { PaginatedResult } from "@jinhu/shared";
import { apiRequest } from "./api-client";

export interface HrPerformanceLegacyAssessmentValueQueryRow {
  sourcePersonCode: string | null;
  employeeDisplayName: string | null;
  unresolvedLegacyGrade: null;
  sourceItemValue: string | null;
  sourceMasterValue: string | null;
  sourceTimekeepValue: string | null;
  sourceBonusValue: string | null;
  legacyLastValueWithoutMaster: string | null;
  sourceAppraisal: string | null;
}

export interface HrPerformanceLegacyAssessmentValueFilters {
  assSession: string;
  departmentPrefix: string;
}

const unwrap = async <T>(request: Promise<{ data: T }>): Promise<T> =>
  (await request).data;

export function performanceLegacyAssessmentValueQuery(
  filters: HrPerformanceLegacyAssessmentValueFilters,
  token?: string,
  page = 1,
  pageSize = 20,
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({
    ass_session: filters.assSession,
    department_prefix: filters.departmentPrefix,
    page: String(page),
    page_size: String(pageSize),
  });
  return unwrap(
    apiRequest<PaginatedResult<HrPerformanceLegacyAssessmentValueQueryRow>>(
      `/hr/performance-legacy/query-reports/assessment-value?${query.toString()}`,
      { token, signal },
    ),
  );
}
