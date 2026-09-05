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
