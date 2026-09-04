import type { PaginatedResult } from "@jinhu/shared";
import { apiRequest } from "./api-client";

export interface HrPerformanceLegacySessionRelation {
  sourceSessionId: number;
  sourceSessionName: string;
  sourceDescription: string | null;
  sourceAssessmentType: string | null;
  sourceYear: number | null;
  sourceMonth: number | null;
  sourceQuarter: number | null;
  sourceMyOrder: number | null;
  targetReviewCycleId: string | null;
}

export interface HrPerformanceLegacyScoreSourceRelation {
  sourceScoreId: number;
  sourceSessionId: number | null;
  sourcePersonCode: string | null;
  sourceItemId: number | null;
  sourceRelationType: number | null;
  sourceItemValue: string | null;
  sourceAssGrade: string | null;
  sourceAppraisal: string | null;
  legacySessionId: string | null;
  legacyDimensionProfileId: string | null;
}

export interface HrPerformanceLegacyPersonAssignmentRelation {
  sourceAssignmentId: number;
  sourceSessionId: number | null;
  sourcePersonCode: string | null;
  sourceAssessorCode: string | null;
  sourceRelationType: number | null;
  legacySessionId: string | null;
}

const unwrap = async <T>(request: Promise<{ data: T }>): Promise<T> =>
  (await request).data;

function pageQuery(page: number, pageSize: number, sourceSessionId?: number) {
  const query = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  });
  if (sourceSessionId !== undefined) {
    query.set("source_session_id", String(sourceSessionId));
  }
  return query.toString();
}

export const hrPerformanceLegacyRelationsApi = {
  sessions: (
    token?: string,
    page = 1,
    pageSize = 20,
    signal?: AbortSignal,
  ) =>
    unwrap(
      apiRequest<PaginatedResult<HrPerformanceLegacySessionRelation>>(
        `/hr/performance-legacy/relations/sessions?${pageQuery(page, pageSize)}`,
        { token, signal },
      ),
    ),
  scoreSources: (
    token?: string,
    page = 1,
    pageSize = 20,
    sourceSessionId?: number,
    signal?: AbortSignal,
  ) =>
    unwrap(
      apiRequest<PaginatedResult<HrPerformanceLegacyScoreSourceRelation>>(
        `/hr/performance-legacy/relations/score-sources?${pageQuery(page, pageSize, sourceSessionId)}`,
        { token, signal },
      ),
    ),
  personAssignments: (
    token?: string,
    page = 1,
    pageSize = 20,
    sourceSessionId?: number,
    signal?: AbortSignal,
  ) =>
    unwrap(
      apiRequest<PaginatedResult<HrPerformanceLegacyPersonAssignmentRelation>>(
        `/hr/performance-legacy/relations/source-person-assignments?${pageQuery(page, pageSize, sourceSessionId)}`,
        { token, signal },
      ),
    ),
};
