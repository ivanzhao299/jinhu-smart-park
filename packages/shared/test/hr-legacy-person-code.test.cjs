const assert = require("node:assert/strict");
const test = require("node:test");

const {
  HR_LEGACY_PERSON_CODE_MAX_LENGTH,
  isHrLegacyPersonCode,
  normalizeHrLegacyPersonCode,
} = require("../dist");

test("legacy person codes preserve exact Unicode letters and safe literal separators", () => {
  assert.equal(HR_LEGACY_PERSON_CODE_MAX_LENGTH, 10);
  assert.equal(normalizeHrLegacyPersonCode("  汉01_A  "), "汉01_A");
  for (const value of ["EMP_01", "A-01", "汉01", "１２３"]) {
    assert.equal(isHrLegacyPersonCode(value), true, value);
  }
});

test("legacy person codes reject patterns, SQL metacharacters, whitespace and controls", () => {
  for (const value of [
    "",
    "EMP 01",
    "EMP%",
    "EMP*",
    "EMP?",
    "EMP.01",
    "EMP'01",
    'EMP"01',
    "EMP;01",
    "EMP\\01",
    "EMP\n01",
    "😀01",
    "汉".repeat(11),
    101,
    null,
  ]) {
    assert.equal(isHrLegacyPersonCode(value), false, String(value));
  }
});
