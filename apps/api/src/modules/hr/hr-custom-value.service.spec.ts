import assert from "node:assert/strict";
import test from "node:test";
import { projectHrCustomValue, validateHrCustomValue, type HrCustomValueReadRow } from "./hr-custom-value.service";

test("custom fields keep explicit null distinct from empty text and false", () => {
  assert.equal(validateHrCustomValue("text", ""), "");
  assert.equal(validateHrCustomValue("text", null), null);
  assert.equal(validateHrCustomValue("boolean", "false"), "false");
  assert.equal(validateHrCustomValue("numeric", "0"), "0");
  assert.throws(() => validateHrCustomValue("text", undefined));
  assert.throws(() => validateHrCustomValue("boolean", false));
});

test("effective values retain source until maintained and explicit null never falls back", () => {
  const source: HrCustomValueReadRow = { definitionId: "definition", code: "def1", label: "Field", valueType: "text", group: null, sortOrder: "1", value: "source", sourceValid: false, maintenanceVersion: null, maintainedType: null, maintainedStatus: null, valueEncrypted: null };
  assert.deepEqual(projectHrCustomValue(source, () => { throw new Error("source must not decrypt"); }), {
    definitionId: "definition", code: "def1", label: "Field", valueType: "text", group: null, sortOrder: 1, value: "source", sourceValid: false, version: 0
  });
  const maintained = { ...source, maintenanceVersion: 1, maintainedType: "text" as const, maintainedStatus: "null" as const, valueEncrypted: "synthetic-envelope" };
  const cleared = projectHrCustomValue(maintained, () => JSON.stringify({ value: null }));
  assert.equal(cleared.value, null);
  assert.equal(cleared.sourceValid, true);
  assert.equal("valueEncrypted" in cleared, false);
  assert.throws(() => projectHrCustomValue(maintained, () => null));
  assert.throws(() => projectHrCustomValue(maintained, () => JSON.stringify({ value: "updated" })));
  assert.throws(() => projectHrCustomValue({ ...maintained, maintainedType: "boolean" }, () => JSON.stringify({ value: null })));
});

test("custom numeric and calendar values reject precision loss and invalid dates", () => {
  assert.equal(validateHrCustomValue("numeric", "12345678901234567890.12345678"), "12345678901234567890.12345678");
  for (const value of ["1e3", "NaN", "123456789012345678901", "1.123456789", ""]) assert.throws(() => validateHrCustomValue("numeric", value));
  assert.equal(validateHrCustomValue("date", "2024-02-29"), "2024-02-29");
  for (const value of ["2023-02-29", "2024-04-31", "0000-01-01", "2024-01-01T00:00:00Z"]) assert.throws(() => validateHrCustomValue("date", value));
  assert.throws(() => validateHrCustomValue("text", "a".repeat(4001)));
});
