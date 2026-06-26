import assert from "node:assert/strict";
import test from "node:test";
import { buildEngineeringAcceptanceCodePrefix, nextEngineeringAcceptanceCode } from "./domain/engineering-acceptance-code.policy";

test("engineering acceptance code uses GCYSYYYYMMDDNNN format", () => {
  const date = new Date("2026-06-26T09:10:00.000+08:00");

  assert.equal(buildEngineeringAcceptanceCodePrefix(date), "GCYS20260626");
  assert.equal(nextEngineeringAcceptanceCode(date, null), "GCYS20260626001");
});

test("engineering acceptance code increments from latest code for the same date", () => {
  const date = new Date("2026-06-26T09:10:00.000+08:00");

  assert.equal(nextEngineeringAcceptanceCode(date, "GCYS20260626009"), "GCYS20260626010");
});

test("engineering acceptance code ignores codes outside current date prefix", () => {
  const date = new Date("2026-06-26T09:10:00.000+08:00");

  assert.equal(nextEngineeringAcceptanceCode(date, "GCYS20260625099"), "GCYS20260626001");
});
