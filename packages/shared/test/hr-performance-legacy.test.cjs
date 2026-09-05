const assert = require("node:assert/strict");
const test = require("node:test");

const {
  HR_PERFORMANCE_LEGACY_PERSON_SUMMARY_ROUTINES,
  isHrPerformanceLegacyPersonSummaryRoutine,
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
