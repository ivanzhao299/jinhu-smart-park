import type { PaginatedResult } from "@jinhu/shared";
import { apiRequest } from "./api-client";

export interface HrPerformanceLegacyAssessmentValueOfPersonRow {
  compatibleLegacySessionText: string | null;
  unresolvedLegacyGrade: null;
  sourceItemValue: string | null;
  sourceMasterValue: string | null;
  sourceTimekeepValue: string | null;
  sourceBonusValue: string | null;
  legacyLastValueWithoutMaster: string | null;
  sourceAppraisal: string | null;
}

const unwrap = async <T>(request: Promise<{ data: T }>): Promise<T> =>
  (await request).data;

export function performanceLegacyAssessmentValueOfPersonQuery(
  sourcePersonCode: string,
  token?: string,
  page = 1,
  pageSize = 20,
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({
    source_person_code: sourcePersonCode,
    page: String(page),
    page_size: String(pageSize),
  });
  return unwrap(
    apiRequest<PaginatedResult<HrPerformanceLegacyAssessmentValueOfPersonRow>>(
      `/hr/performance-legacy/query-reports/assessment-value-of-person?${query.toString()}`,
      { token, signal },
    ),
  );
}
