const assert = require("node:assert/strict");
const test = require("node:test");

const {
  HR_LEGACY_PERSON_CODE_MAX_LENGTH,
  HR_LEGACY_PERSON_CODE_MAX_UTF16_LENGTH,
  isHrLegacyPersonCode,
  normalizeHrLegacyPersonCode,
} = require("../dist");

test("legacy person codes preserve exact Unicode letters and safe literal separators", () => {
  assert.equal(HR_LEGACY_PERSON_CODE_MAX_LENGTH, 10);
  assert.equal(HR_LEGACY_PERSON_CODE_MAX_UTF16_LENGTH, 20);
  assert.equal(normalizeHrLegacyPersonCode("  汉01_A  "), "汉01_A");
  for (const value of ["EMP_01", "A-01", "汉01", "１２３"]) {
    assert.equal(isHrLegacyPersonCode(value), true, value);
  }
});

test("legacy person code length is ten Unicode code points without normalization", () => {
  const supplementaryLetter = "𐐀";
  assert.equal([...supplementaryLetter.repeat(10)].length, 10);
  assert.equal(supplementaryLetter.repeat(10).length, HR_LEGACY_PERSON_CODE_MAX_UTF16_LENGTH);
  assert.equal(isHrLegacyPersonCode(supplementaryLetter.repeat(10)), true);
  assert.equal(isHrLegacyPersonCode(supplementaryLetter.repeat(11)), false);
  assert.equal(isHrLegacyPersonCode("é01"), true);
  assert.equal(isHrLegacyPersonCode("e\u030101"), false);
  assert.equal(normalizeHrLegacyPersonCode("\u3000汉01\u3000"), "汉01");
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
