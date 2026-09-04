#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  LegacyStaffingDiscrepancyReportParityError,
  projectLegacyStaffingDiscrepancyRows,
  verifyLegacyStaffingDiscrepancyReportParity,
} from "../hr-cutover/legacy-staffing-discrepancy-report-parity.mjs";
import { evaluateLegacyRoutineParityContract } from "../hr-cutover/legacy-routine-parity-contract.mjs";

const root = resolve(import.meta.dirname, "../..");
const json = path => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const contract = json("scripts/hr-cutover/contracts/legacy-staffing-discrepancy-report-parity-v1.json");
const fixture = json("scripts/hr-cutover/contracts/legacy-staffing-discrepancy-report-parity-fixture-v1.json");

test("u_job_r is source-bound but remains zero-credit until row-level semantics exist", () => {
  const receipt = verifyLegacyStaffingDiscrepancyReportParity({ contract, fixture, repositoryRoot: root });
  assert.deepEqual(
    {
      status: receipt.status,
      reviewed: receipt.sourceRoutinesReviewed,
      verified: receipt.verifiedRoutines,
      credit: receipt.compatibilityCredit,
      writes: receipt.sourceBusinessWrites,
      dynamicSql: receipt.dynamicSqlExecutions,
      cases: receipt.fixtureCases,
    },
    { status: "GAP_CONFIRMED", reviewed: 1, verified: 0, credit: 0, writes: 0, dynamicSql: 0, cases: 10 },
  );
  assert.equal(receipt.containsSourceRows, false);
  assert.equal(receipt.containsPersonalData, false);
  assert.equal(receipt.productionImport, "HOLD");
});

test("legacy overstaff scope and unscoped understaff branch are frozen exactly", () => {
  const rows = projectLegacyStaffingDiscrepancyRows(fixture.sourceRows, fixture.scopePattern);
  assert.deepEqual(rows.map(row => [row.positionName, row.status]), [
    ["Fixture Position A", "overstaffed"],
    ["Fixture Position D", "overstaffed"],
    ["Fixture Position C", "understaffed"],
  ]);
  assert.equal(rows.some(row => row.positionName === "Fixture Position B"), false);
  assert.equal(rows.some(row => row.positionName === "Fixture Position C"), true);
  assert.equal(rows.find(row => row.positionName === "Fixture Position D")?.departmentName, null);
});

test("equal null and empty inputs produce no discrepancy rows", () => {
  for (const positionCode of ["POS-E", "POS-F", "POS-G"]) {
    const row = fixture.sourceRows.find(item => item.positionCode === positionCode);
    assert.ok(row);
    assert.deepEqual(projectLegacyStaffingDiscrepancyRows([row], fixture.scopePattern), []);
  }
  assert.deepEqual(projectLegacyStaffingDiscrepancyRows([], fixture.scopePattern), []);
  assert.deepEqual(projectLegacyStaffingDiscrepancyRows(fixture.sourceRows, null), [
    {
      positionName: "Fixture Position C",
      departmentName: "Fixture Organization C",
      definedPersons: 3,
      realPersons: 1,
      status: "understaffed",
    },
  ]);
});

test("all semantic dimensions are explicit and unresolved dimensions stay pending", () => {
  const routine = contract.routines[0];
  assert.equal(routine.parityStatus, "pending");
  assert.equal(routine.review.status, "pending");
  for (const name of ["parameterMappings", "outputFieldMappings", "readMappings", "nullSemantics"]) {
    assert.equal(routine.semantics[name].status, "pending", name);
    assert.ok(routine.semantics[name].entries.length > 0, name);
  }
  assert.equal(routine.semantics.writeMappings.applicability, "not_applicable");
  assert.equal(routine.semantics.roundingSemantics.applicability, "not_applicable");
  assert.equal(routine.semantics.transaction.status, "verified");
  assert.equal(routine.semantics.stateSideEffects.status, "verified");
  assert.equal(routine.semantics.dynamicSql.status, "none");
  for (const kind of ["positive", "negative", "permission", "conservation"]) {
    assert.ok(routine.testEvidence[kind].length > 0, kind);
  }
});

test("generic parity gate reports one pending routine and never grants percentage credit", () => {
  const report = evaluateLegacyRoutineParityContract({ contract, routineLedger: fixture.sourceRoutineLedger });
  assert.equal(report.status, "IN_PROGRESS");
  assert.equal(report.summary.sourceRoutines, 1);
  assert.equal(report.summary.verifiedRoutines, 0);
  assert.equal(report.summary.pendingRoutines, 1);
  assert.equal(report.summary.verifiedSemanticParityPercent, 0);
  assert.deepEqual(report.reasonCodes, ["ROUTINE_SEMANTIC_EVIDENCE_PENDING"]);
  assert.equal(report.productionImport, "HOLD");
});

test("attempting to promote a gap or drift evidence fails closed", () => {
  const promoted = structuredClone(contract);
  promoted.routines[0].parityStatus = "verified";
  promoted.routines[0].review.status = "approved";
  promoted.routines[0].review.evidenceSha256 = "a".repeat(64);
  assert.throws(
    () => verifyLegacyStaffingDiscrepancyReportParity({ contract: promoted, fixture, repositoryRoot: root }),
    error => error instanceof LegacyStaffingDiscrepancyReportParityError && error.code === "STAFFING_PARITY_CONTRACT_INVALID",
  );

  const drifted = structuredClone(contract);
  drifted.evidenceBindings.modernService.sha256 = "f".repeat(64);
  assert.throws(
    () => verifyLegacyStaffingDiscrepancyReportParity({ contract: drifted, fixture, repositoryRoot: root }),
    error => error instanceof LegacyStaffingDiscrepancyReportParityError && error.code === "STAFFING_PARITY_EVIDENCE_DRIFT",
  );
});

console.log("Yuzhou legacy staffing discrepancy report parity gap contract passed.");
