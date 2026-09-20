const assert = require("node:assert/strict");
const test = require("node:test");

const {
  HR_PERFORMANCE_LEGACY_DEPARTMENT_MATCH_MODES,
  HR_PERFORMANCE_LEGACY_SESSION_MAX_LENGTH,
  HR_PERFORMANCE_LEGACY_ASSESSMENT_TYPE_MAX_LENGTH,
  HR_PERFORMANCE_LEGACY_DEPARTMENT_PATTERN_MAX_LENGTH,
  HR_PERFORMANCE_LEGACY_PERSON_SUMMARY_ROUTINES,
  isHrPerformanceLegacyDepartmentMatchMode,
  isHrPerformanceLegacyDepartmentPattern,
  isHrPerformanceLegacyDepartmentPrefix,
  isHrPerformanceLegacyPersonSummaryRoutine,
  isHrPerformanceLegacyQueryText,
  normalizeHrPerformanceLegacyQueryText,
} = require("../dist");

test("legacy person-summary routine modes are a closed two-value contract", () => {
  assert.deepEqual(HR_PERFORMANCE_LEGACY_PERSON_SUMMARY_ROUTINES, [
    "web_ass",
    "web_assessmentquery",
  ]);
  for (const value of HR_PERFORMANCE_LEGACY_PERSON_SUMMARY_ROUTINES) {
    assert.equal(isHrPerformanceLegacyPersonSummaryRoutine(value), true);
  }
  for (const value of [undefined, null, "", "web_assquery", "WEB_ASS", 1]) {
    assert.equal(isHrPerformanceLegacyPersonSummaryRoutine(value), false);
  }
});

test("u_assessmentvalue department prefix is literal and bounded", () => {
  for (const value of ["001", "部门_1", "A-1/2.3"]) {
    assert.equal(isHrPerformanceLegacyDepartmentPrefix(value), true);
  }
  for (const value of ["", "001%", "001\\", "001*", "x".repeat(31)]) {
    assert.equal(isHrPerformanceLegacyDepartmentPrefix(value), false);
  }
});

test("u_assessmentmaster match modes and query text are bounded shared contracts", () => {
  assert.deepEqual(HR_PERFORMANCE_LEGACY_DEPARTMENT_MATCH_MODES, [
    "exact",
    "legacy_like",
  ]);
  for (const value of HR_PERFORMANCE_LEGACY_DEPARTMENT_MATCH_MODES) {
    assert.equal(isHrPerformanceLegacyDepartmentMatchMode(value), true);
  }
  for (const value of [undefined, null, "", "prefix", "LIKE", 1]) {
    assert.equal(isHrPerformanceLegacyDepartmentMatchMode(value), false);
  }

  assert.equal(normalizeHrPerformanceLegacyQueryText("  2026 annual  "), "2026 annual");
  assert.equal(normalizeHrPerformanceLegacyQueryText(2026), "");
  assert.equal(
    isHrPerformanceLegacyQueryText("S".repeat(HR_PERFORMANCE_LEGACY_SESSION_MAX_LENGTH), HR_PERFORMANCE_LEGACY_SESSION_MAX_LENGTH),
    true,
  );
  assert.equal(
    isHrPerformanceLegacyQueryText("T".repeat(HR_PERFORMANCE_LEGACY_ASSESSMENT_TYPE_MAX_LENGTH), HR_PERFORMANCE_LEGACY_ASSESSMENT_TYPE_MAX_LENGTH),
    true,
  );
  for (const value of ["", "line\nbreak", "\u0000", "x".repeat(HR_PERFORMANCE_LEGACY_SESSION_MAX_LENGTH + 1)]) {
    assert.equal(isHrPerformanceLegacyQueryText(value, HR_PERFORMANCE_LEGACY_SESSION_MAX_LENGTH), false);
  }

  for (const value of ["001%", "部门_", "A-1/2.3", "9".repeat(HR_PERFORMANCE_LEGACY_DEPARTMENT_PATTERN_MAX_LENGTH)]) {
    assert.equal(isHrPerformanceLegacyDepartmentPattern(value), true);
  }
  for (const value of ["", "001\\%", "001*", "x".repeat(HR_PERFORMANCE_LEGACY_DEPARTMENT_PATTERN_MAX_LENGTH + 1)]) {
    assert.equal(isHrPerformanceLegacyDepartmentPattern(value), false);
  }
});
