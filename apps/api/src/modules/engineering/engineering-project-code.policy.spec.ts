import assert from "node:assert/strict";
import test from "node:test";
import {
  buildEngineeringProjectCode,
  buildEngineeringProjectCodePrefix,
  nextEngineeringProjectCode,
  parseEngineeringProjectCodeSequence
} from "./domain/engineering-project-code.policy";

test("engineering project code uses GCYYYYMMDDNNN format", () => {
  const date = new Date("2026-06-26T09:10:00.000+08:00");

  assert.equal(buildEngineeringProjectCodePrefix(date), "GC20260626");
  assert.equal(buildEngineeringProjectCode(date, 1), "GC20260626001");
  assert.equal(buildEngineeringProjectCode(date, 27), "GC20260626027");
});

test("engineering project code increments from latest code for the same date", () => {
  const date = new Date("2026-06-26T09:10:00.000+08:00");

  assert.equal(nextEngineeringProjectCode(date, null), "GC20260626001");
  assert.equal(nextEngineeringProjectCode(date, "GC20260626009"), "GC20260626010");
});

test("engineering project code ignores codes outside the current date prefix", () => {
  const date = new Date("2026-06-26T09:10:00.000+08:00");

  assert.equal(parseEngineeringProjectCodeSequence("GC20260625099", "GC20260626"), null);
  assert.equal(nextEngineeringProjectCode(date, "GC20260625099"), "GC20260626001");
});
