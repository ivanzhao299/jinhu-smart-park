import type {
  HrPerformanceLegacyPersonSummaryRoutine,
  PaginatedResult,
} from "@jinhu/shared";
import { apiRequest } from "./api-client";

export interface HrPerformanceLegacyPersonSummary {
  sourcePersonCode: string | null;
  employeeDisplayName: string | null;
  sourceSelfGrade: string | null;
  sourceAssGrade: string | null;
  sourceItemValue: string | null;
  sourceTotalValue: string | null;
}

const unwrap = async <T>(request: Promise<{ data: T }>): Promise<T> =>
  (await request).data;

export function performanceLegacyPersonSummary(
  sourceRoutine: HrPerformanceLegacyPersonSummaryRoutine,
  sourcePersonCode: string,
  token?: string,
  page = 1,
  pageSize = 20,
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({
    source_routine: sourceRoutine,
    source_person_code: sourcePersonCode,
    page: String(page),
    page_size: String(pageSize),
  });
  return unwrap(
    apiRequest<PaginatedResult<HrPerformanceLegacyPersonSummary>>(
      `/hr/performance-legacy/query-reports/person-summary?${query.toString()}`,
      { token, signal },
    ),
  );
}
