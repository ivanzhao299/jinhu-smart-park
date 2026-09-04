#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  buildLegacyFullDaysModernGapReceipt,
  LegacyFullDaysModernGapError,
} from "../hr-cutover/legacy-full-days-modern-gap.mjs";

const root = resolve(import.meta.dirname, "../..");
const contractPath = resolve(root, "scripts/hr-cutover/contracts/legacy-full-days-modern-gap-v1.json");
const contract = () => JSON.parse(readFileSync(contractPath, "utf8"));
const build = value => buildLegacyFullDaysModernGapReceipt({ contract: value, repositoryRoot: root });
const rejects = (code, action) => assert.throws(
  action,
  error => error instanceof LegacyFullDaysModernGapError && error.code === code,
);

test("FullDays maps structural inputs and dependencies to modern surfaces without claiming behavior parity", () => {
  const receipt = build(contract());
  assert.equal(receipt.routineId, "RULE-BD491199DA9913BE");
  assert.deepEqual(receipt.legacyInputs, [["year", "integer"], ["month", "integer"], ["person", "varchar(30)"]]);
  assert.deepEqual(receipt.legacyReadDependencies, ["person", "timekeeptable"]);
  assert.deepEqual(receipt.legacyJoinPredicates, ["person.tablename=timekeeptable.tablename"]);
  assert.equal(receipt.legacyCalledRoutineCount, 0);
  assert.equal(receipt.legacyWriteDependencyCount, 0);
  assert.equal(receipt.sourceArtifact.sourceBodyAvailable, false);
  assert.equal(receipt.domainMap.attendanceStrategy, "decompose_month_columns_to_daily_facts");
  assert.equal(receipt.modernBehavior.leaveProjection, "asia_shanghai_fixed_09_00_to_17_00_overlap_by_calendar_date");
  assert.equal(receipt.modernBehavior.monthlyCalculation, "latest_daily_results_grouped_by_employee_inside_one_period_month");
  assert.equal(receipt.mapping.length, 6);
  assert.equal(receipt.behaviorVerified, false);
  assert.equal(receipt.adapterCreated, false);
  assert.equal(receipt.modernHelperPromotedToLegacyEquivalent, false);
  assert.equal(receipt.status, "STRUCTURAL_MAPPING_DOCUMENTED_LEGACY_BEHAVIOR_UNAVAILABLE");
  assert.deepEqual(receipt.compatibilityCredit, { numerator: 0, denominator: 1 });
  assert.equal(receipt.productionImport, "HOLD");
  assert.match(receipt.receiptSha256, /^[a-f0-9]{64}$/u);
});

test("null no-data cross-month person and timekeeptable dependencies stay explicit gaps", () => {
  const receipt = build(contract());
  for (const code of [
    "FULL_DAYS_NULL_AND_NO_DATA_SEMANTICS_UNPROVEN",
    "FULL_DAYS_PERSON_IDENTITY_AND_TABLE_RESOLUTION_UNPROVEN",
    "FULL_DAYS_TIMEKEEPTABLE_COLUMNS_PREDICATES_AND_AGGREGATION_UNAVAILABLE",
    "FULL_DAYS_CROSS_MONTH_BOUNDARY_SEMANTICS_UNPROVEN",
  ]) assert.ok(receipt.blockingGaps.includes(code), code);
  assert.match(receipt.mapping.find(item => item.legacyEdge?.startsWith("null input"))?.gap ?? "", /null and empty-set/u);
  assert.match(receipt.mapping.find(item => item.legacyEdge?.startsWith("cross-month"))?.gap ?? "", /clipping splitting and boundary/u);
  assert.match(receipt.mapping.find(item => item.legacyInput === "person varchar(30)")?.disposition ?? "", /controlled_identity_map/u);
  assert.match(receipt.mapping.find(item => item.legacyDependency)?.disposition ?? "", /not_behavior_equivalence/u);
});

test("existing modern leave helper is evidence but cannot self-promote to a FullDays implementation", () => {
  const receipt = build(contract());
  assert.equal(receipt.modernBehavior.effectiveLeave, "approved_leave_only");
  assert.equal(receipt.modernBehavior.evidenceFileCount, 7);
  assert.ok(receipt.blockingGaps.includes("FULL_DAYS_MODERN_FIXED_WORK_WINDOW_NOT_SCHEDULE_DRIVEN"));
  assert.ok(receipt.blockingGaps.includes("FULL_DAYS_BOUNDED_SYNTHETIC_PARITY_ORACLE_UNAVAILABLE"));

  for (const mutate of [
    value => { value.behaviorEvidenceStatus = "verified"; },
    value => { value.adapterDisposition = "implemented"; },
    value => { value.modernHelperDisposition = "legacy_equivalent"; },
    value => { value.compatibilityCredit = 1; },
    value => { value.blockingGaps.pop(); },
    value => { value.forbiddenAssumptions.pop(); },
    value => { value.mapping[0].modernSurface = "invented direct equivalent"; },
    value => { value.productionImport = "READY"; },
  ]) {
    const promoted = contract();
    mutate(promoted);
    rejects("FULL_DAYS_MODERN_CONTRACT_INVALID", () => build(promoted));
  }
});

test("source receipt ledger manifest domain maps and modern source drift fail closed", () => {
  for (const mutate of [
    value => { value.sourceReceipt.sha256 = "0".repeat(64); },
    value => { value.sourceManifest.sha256 = "0".repeat(64); },
    value => { value.modernEvidence.tableDomainMap.sha256 = "0".repeat(64); },
    value => { value.modernEvidence.routineCapabilityMap.sha256 = "0".repeat(64); },
    value => { value.modernEvidence.implementationFiles[0].sha256 = "0".repeat(64); },
  ]) {
    const drifted = contract();
    mutate(drifted);
    rejects("FULL_DAYS_MODERN_EVIDENCE_DRIFT", () => build(drifted));
  }
});

test("gap receipt contains no body rows personal data credentials or executable database client", () => {
  const receipt = build(contract());
  assert.equal(receipt.legacyRoutineExecuted, false);
  assert.equal(receipt.legacyDynamicSqlExecuted, false);
  assert.equal(receipt.containsPersonalData, false);
  const serialized = JSON.stringify(receipt);
  assert.doesNotMatch(serialized, /"(?:employeeName|employeeCode|personValue|idcard|password|credential|token|connectionString)"\s*:/iu);
  const source = readFileSync(resolve(root, "scripts/hr-cutover/legacy-full-days-modern-gap.mjs"), "utf8");
  assert.doesNotMatch(source, /\b(?:sqlcmd|mssql|sp_executesql)\b|\b(?:insert|update|delete|merge)\s+(?:into|dbo\.|hr_)/iu);
});
