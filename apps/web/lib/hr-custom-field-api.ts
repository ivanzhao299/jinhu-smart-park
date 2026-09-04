import { apiRequest, createIdempotencyKey } from "./api-client";

export type HrCustomFieldRuleClassification = "declarative" | "inert" | "review_required";
export type HrCustomFieldReviewStatus = "pending" | "approved" | "rejected";
export type HrCustomFieldCoverageStatus = "unmapped" | "mapped" | "excluded" | "blocked";
export type HrCustomFieldReviewReasonCode = "confirmed_declarative" | "confirmed_inert" | "requires_remediation" | "mapped_to_modern_field" | "excluded_obsolete" | "insufficient_evidence";

export interface HrCustomFieldDefinition {
  id: string;
  fieldCode: string;
  displayLabel: string;
  valueType: string;
  fieldGroup: string | null;
  sortOrder: number;
  sensitivity: string;
  status: string;
  sourceColumn: string | null;
  legacyDefinitionId: string | null;
  legacyDatatype: string | null;
  legacyGroupId: string | null;
  legacySortOrder: number | null;
  legacyNullable: boolean | null;
  baseClassification: "text" | "numeric" | "date" | null;
  descriptionD: { present: boolean | null; fingerprinted: boolean };
  legacyRules: {
    sqltextPresent: boolean | null;
    crosssqlPresent: boolean | null;
    importedClassification: HrCustomFieldRuleClassification | null;
    classification: HrCustomFieldRuleClassification;
  };
  review: { status: HrCustomFieldReviewStatus; reasonCode: HrCustomFieldReviewReasonCode | null; version: number };
  coverage: { status: HrCustomFieldCoverageStatus; targetFieldKey: string | null };
  logicCoverage: { captured: number; denominator: 10; complete: boolean };
  metadataCoverage: "complete" | "partial" | "missing";
}

export interface HrCustomFieldDefinitionResult {
  items: HrCustomFieldDefinition[];
  total: number;
  page: number;
  page_size: number;
  summary: { total: number; pending: number; mapped: number; blocked: number; complete: number };
}

export interface HrCustomFieldDefinitionFilters {
  keyword?: string;
  classification?: HrCustomFieldRuleClassification | "";
  reviewStatus?: HrCustomFieldReviewStatus | "";
  coverageStatus?: HrCustomFieldCoverageStatus | "";
}

async function unwrap<T>(promise: Promise<{ data: T }>): Promise<T> {
  return (await promise).data;
}

export const hrCustomFieldApi = {
  list(token: string | undefined, page: number, pageSize: number, filters: HrCustomFieldDefinitionFilters, signal?: AbortSignal) {
    const query = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
    if (filters.keyword) query.set("keyword", filters.keyword);
    if (filters.classification) query.set("classification", filters.classification);
    if (filters.reviewStatus) query.set("review_status", filters.reviewStatus);
    if (filters.coverageStatus) query.set("coverage_status", filters.coverageStatus);
    return unwrap(apiRequest<HrCustomFieldDefinitionResult>(`/hr/custom-field-definitions/legacy?${query}`, { token, signal }));
  },
  review(id: string, body: object, token?: string) {
    return unwrap(apiRequest<{ id: string; reviewStatus: HrCustomFieldReviewStatus; coverageStatus: HrCustomFieldCoverageStatus; reviewVersion: number }>(`/hr/custom-field-definitions/legacy/${id}/review`, {
      method: "PUT",
      body,
      token,
      idempotencyKey: createIdempotencyKey("hr-custom-field-review")
    }));
  }
};
