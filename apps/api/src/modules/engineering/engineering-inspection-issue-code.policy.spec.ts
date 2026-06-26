import assert from "node:assert/strict";
import test from "node:test";
import {
  buildEngineeringInspectionCode,
  buildEngineeringInspectionCodePrefix,
  nextEngineeringInspectionCode,
  parseEngineeringInspectionCodeSequence
} from "./domain/engineering-inspection-code.policy";
import {
  buildEngineeringIssueCode,
  buildEngineeringIssueCodePrefix,
  nextEngineeringIssueCode,
  parseEngineeringIssueCodeSequence
} from "./domain/engineering-issue-code.policy";

test("engineering inspection code uses GCXJYYYYMMDDNNN format", () => {
  const date = new Date("2026-06-26T09:10:00.000+08:00");

  assert.equal(buildEngineeringInspectionCodePrefix(date), "GCXJ20260626");
  assert.equal(buildEngineeringInspectionCode(date, 1), "GCXJ20260626001");
  assert.equal(buildEngineeringInspectionCode(date, 27), "GCXJ20260626027");
});

test("engineering inspection code increments from latest code for the same date", () => {
  const date = new Date("2026-06-26T09:10:00.000+08:00");

  assert.equal(nextEngineeringInspectionCode(date, null), "GCXJ20260626001");
  assert.equal(nextEngineeringInspectionCode(date, "GCXJ20260626009"), "GCXJ20260626010");
  assert.equal(parseEngineeringInspectionCodeSequence("GCXJ20260625099", "GCXJ20260626"), null);
});

test("engineering issue code uses GCWTYYYYMMDDNNN format", () => {
  const date = new Date("2026-06-26T09:10:00.000+08:00");

  assert.equal(buildEngineeringIssueCodePrefix(date), "GCWT20260626");
  assert.equal(buildEngineeringIssueCode(date, 1), "GCWT20260626001");
  assert.equal(buildEngineeringIssueCode(date, 27), "GCWT20260626027");
});

test("engineering issue code increments from latest code for the same date", () => {
  const date = new Date("2026-06-26T09:10:00.000+08:00");

  assert.equal(nextEngineeringIssueCode(date, null), "GCWT20260626001");
  assert.equal(nextEngineeringIssueCode(date, "GCWT20260626009"), "GCWT20260626010");
  assert.equal(parseEngineeringIssueCodeSequence("GCWT20260625099", "GCWT20260626"), null);
});
