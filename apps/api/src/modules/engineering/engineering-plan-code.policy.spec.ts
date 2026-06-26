import assert from "node:assert/strict";
import test from "node:test";
import {
  buildEngineeringPlanCode,
  buildEngineeringPlanCodePrefix,
  nextEngineeringPlanCode,
  parseEngineeringPlanCodeSequence
} from "./domain/engineering-plan-code.policy";

test("engineering plan code uses GCJHYYYYMMDDNNN format", () => {
  const date = new Date("2026-06-26T09:10:00.000+08:00");

  assert.equal(buildEngineeringPlanCodePrefix(date), "GCJH20260626");
  assert.equal(buildEngineeringPlanCode(date, 1), "GCJH20260626001");
  assert.equal(buildEngineeringPlanCode(date, 27), "GCJH20260626027");
});

test("engineering plan code increments from latest code for the same date", () => {
  const date = new Date("2026-06-26T09:10:00.000+08:00");

  assert.equal(nextEngineeringPlanCode(date, null), "GCJH20260626001");
  assert.equal(nextEngineeringPlanCode(date, "GCJH20260626009"), "GCJH20260626010");
});

test("engineering plan code ignores codes outside the current date prefix", () => {
  const date = new Date("2026-06-26T09:10:00.000+08:00");

  assert.equal(parseEngineeringPlanCodeSequence("GCJH20260625099", "GCJH20260626"), null);
  assert.equal(nextEngineeringPlanCode(date, "GCJH20260625099"), "GCJH20260626001");
});
