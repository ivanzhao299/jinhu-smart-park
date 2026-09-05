import type { PaginatedResult } from "@jinhu/shared";
import { apiRequest } from "./api-client";

export interface HrPerformanceLegacyWebAssQueryRow {
  sourcePersonCode: string | null;
  employeeDisplayName: string | null;
  sourceSelfGrade: string | null;
  sourceAssGrade: string | null;
  sourceItemValue: string | null;
  sourceTotalValue: string | null;
}

export interface HrPerformanceLegacyWebAssQueryFilters {
  assSession: string;
  personLike?: string;
  rightScopePrefix: string;
  itemValueMin: number;
  itemValueMax: number;
}

const unwrap = async <T>(request: Promise<{ data: T }>): Promise<T> =>
  (await request).data;

export function performanceLegacyWebAssQuery(
  filters: HrPerformanceLegacyWebAssQueryFilters,
  token?: string,
  page = 1,
  pageSize = 20,
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({
    ass_session: filters.assSession,
    right_scope_prefix: filters.rightScopePrefix,
    item_value_min: String(filters.itemValueMin),
    item_value_max: String(filters.itemValueMax),
    page: String(page),
    page_size: String(pageSize),
  });
  if (filters.personLike) query.set("person_like", filters.personLike);
  return unwrap(
    apiRequest<PaginatedResult<HrPerformanceLegacyWebAssQueryRow>>(
      `/hr/performance-legacy/query-reports/web-ass-query?${query.toString()}`,
      { token, signal },
    ),
  );
}
