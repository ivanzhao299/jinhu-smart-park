import assert from "node:assert/strict";
import test from "node:test";
import {
  buildEngineeringRectificationCode,
  buildEngineeringRectificationCodePrefix,
  nextEngineeringRectificationCode,
  parseEngineeringRectificationCodeSequence
} from "./domain/engineering-rectification-code.policy";

test("engineering rectification code uses GCZGYYYYMMDDNNN format", () => {
  const date = new Date("2026-06-26T10:00:00.000Z");

  assert.equal(buildEngineeringRectificationCodePrefix(date), "GCZG20260626");
  assert.equal(buildEngineeringRectificationCode(date, 1), "GCZG20260626001");
  assert.equal(buildEngineeringRectificationCode(date, 27), "GCZG20260626027");
});

test("engineering rectification code increments from latest code for the same date", () => {
  const date = new Date("2026-06-26T10:00:00.000Z");

  assert.equal(nextEngineeringRectificationCode(date, null), "GCZG20260626001");
  assert.equal(nextEngineeringRectificationCode(date, "GCZG20260626009"), "GCZG20260626010");
  assert.equal(parseEngineeringRectificationCodeSequence("GCZG20260625099", "GCZG20260626"), null);
});
