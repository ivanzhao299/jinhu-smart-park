import assert from "node:assert/strict";
import test from "node:test";
import { normalizeFileIdInput, normalizeNumericInput } from "./inspect-task-form.logic";

test("inspection execution normalizes attachment projections before opening the form", () => {
  assert.equal(normalizeFileIdInput([" file-a ", "", "file-b"]), "file-a,file-b");
  assert.equal(normalizeFileIdInput(undefined), "");
  assert.equal(normalizeFileIdInput(null), "");
  assert.equal(normalizeFileIdInput("***"), "");
  assert.equal(normalizeFileIdInput(["file-a", 42, null]), "file-a");
});

test("inspection execution accepts only finite numeric GPS projections", () => {
  assert.equal(normalizeNumericInput(" 120.123 "), "120.123");
  assert.equal(normalizeNumericInput(31.234), "31.234");
  assert.equal(normalizeNumericInput("***"), "");
  assert.equal(normalizeNumericInput(Number.NaN), "");
  assert.equal(normalizeNumericInput(undefined), "");
});
