export const HR_PERFORMANCE_LEGACY_PERSON_SUMMARY_ROUTINES = [
  "web_ass",
  "web_assessmentquery",
] as const;

export type HrPerformanceLegacyPersonSummaryRoutine =
  (typeof HR_PERFORMANCE_LEGACY_PERSON_SUMMARY_ROUTINES)[number];

export function isHrPerformanceLegacyPersonSummaryRoutine(
  value: unknown,
): value is HrPerformanceLegacyPersonSummaryRoutine {
  return HR_PERFORMANCE_LEGACY_PERSON_SUMMARY_ROUTINES.some(routine => routine === value);
}

export const HR_PERFORMANCE_LEGACY_DEPARTMENT_MATCH_MODES = [
  "exact",
  "legacy_like",
] as const;

export type HrPerformanceLegacyDepartmentMatchMode =
  (typeof HR_PERFORMANCE_LEGACY_DEPARTMENT_MATCH_MODES)[number];

export const HR_PERFORMANCE_LEGACY_SESSION_MAX_LENGTH = 30;
export const HR_PERFORMANCE_LEGACY_ASSESSMENT_TYPE_MAX_LENGTH = 4;
export const HR_PERFORMANCE_LEGACY_DEPARTMENT_PATTERN_MAX_LENGTH = 30;

export const HR_PERFORMANCE_LEGACY_QUERY_TEXT_PATTERN = /^[\p{L}\p{M}\p{N}\p{P}\p{S}\p{Zs}]+$/u;
export const HR_PERFORMANCE_LEGACY_DEPARTMENT_PATTERN = /^[\p{L}\p{N}._%/-]+$/u;

export function normalizeHrPerformanceLegacyQueryText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function isHrPerformanceLegacyDepartmentMatchMode(
  value: unknown,
): value is HrPerformanceLegacyDepartmentMatchMode {
  return HR_PERFORMANCE_LEGACY_DEPARTMENT_MATCH_MODES.some(mode => mode === value);
}

export function isHrPerformanceLegacyQueryText(value: unknown, maxLength: number): value is string {
  return typeof value === "string"
    && value.length >= 1
    && value.length <= maxLength
    && HR_PERFORMANCE_LEGACY_QUERY_TEXT_PATTERN.test(value);
}

export function isHrPerformanceLegacyDepartmentPattern(value: unknown): value is string {
  return isHrPerformanceLegacyQueryText(
    value,
    HR_PERFORMANCE_LEGACY_DEPARTMENT_PATTERN_MAX_LENGTH,
  ) && HR_PERFORMANCE_LEGACY_DEPARTMENT_PATTERN.test(value);
}
