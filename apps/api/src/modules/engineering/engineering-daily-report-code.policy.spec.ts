import assert from "node:assert/strict";
import test from "node:test";
import {
  buildEngineeringDailyReportCode,
  buildEngineeringDailyReportCodePrefix,
  nextEngineeringDailyReportCode,
  parseEngineeringDailyReportCodeSequence
} from "./domain/engineering-daily-report-code.policy";

test("engineering daily report code uses GCRBYYYYMMDDNNN format", () => {
  const date = new Date("2026-06-26T09:10:00.000+08:00");

  assert.equal(buildEngineeringDailyReportCodePrefix(date), "GCRB20260626");
  assert.equal(buildEngineeringDailyReportCode(date, 1), "GCRB20260626001");
  assert.equal(buildEngineeringDailyReportCode(date, 27), "GCRB20260626027");
});

test("engineering daily report code increments from latest code for the same date", () => {
  const date = new Date("2026-06-26T09:10:00.000+08:00");

  assert.equal(nextEngineeringDailyReportCode(date, null), "GCRB20260626001");
  assert.equal(nextEngineeringDailyReportCode(date, "GCRB20260626009"), "GCRB20260626010");
});

test("engineering daily report code ignores codes outside current date prefix", () => {
  const date = new Date("2026-06-26T09:10:00.000+08:00");

  assert.equal(parseEngineeringDailyReportCodeSequence("GCRB20260625099", "GCRB20260626"), null);
  assert.equal(nextEngineeringDailyReportCode(date, "GCRB20260625099"), "GCRB20260626001");
});
