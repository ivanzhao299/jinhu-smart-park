#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  LegacyAttendanceItemSchemaHookParityError,
  verifyLegacyAttendanceItemSchemaHookParity,
} from "../hr-cutover/legacy-attendance-item-schema-hook-parity.mjs";
import { evaluateLegacyRoutineParityContract } from "../hr-cutover/legacy-routine-parity-contract.mjs";

const root = resolve(import.meta.dirname, "../..");
const json = path => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const contract = json("scripts/hr-cutover/contracts/legacy-attendance-item-schema-hook-parity-v1.json");
const fixture = json("scripts/hr-cutover/contracts/legacy-attendance-item-schema-hook-fixture-v1.json");

test("active insert/delete trigger bodies close exactly two source-bound routine identities", () => {
  const receipt = verifyLegacyAttendanceItemSchemaHookParity({ contract, fixture, repositoryRoot: root });
  assert.deepEqual(
    {
      status: receipt.status,
      routines: receipt.verifiedRoutines,
      writes: receipt.activeBusinessWrites,
      dynamicSql: receipt.dynamicSqlExecutions,
      columnDelta: receipt.normalizedFactColumnDelta,
    },
    { status: "COMPLETE", routines: 2, writes: 0, dynamicSql: 0, columnDelta: 0 },
  );
  assert.equal(receipt.containsSourceRows, false);
  assert.equal(receipt.containsPersonalData, false);
  assert.equal(receipt.productionImport, "HOLD");
});

test("generic semantic parity gate sees both routines as complete without global denominator claims", () => {
  const report = evaluateLegacyRoutineParityContract({ contract, routineLedger: fixture.sourceRoutineLedger });
  assert.equal(report.status, "COMPLETE");
  assert.equal(report.summary.sourceRoutines, 2);
  assert.equal(report.summary.verifiedRoutines, 2);
  assert.equal(report.summary.pendingRoutines, 0);
  assert.equal(report.summary.verifiedSemanticParityPercent, 100);
  assert.deepEqual(report.reasonCodes, []);
  assert.equal(report.productionImport, "HOLD");
});

test("parameter output read write transaction null rounding side-effect and dormant evidence are explicit", () => {
  assert.deepEqual(contract.routines.map(row => row.canonicalFamily), ["tr_addtimekeepitem", "tr_droptimekeepitem"]);
  for (const row of contract.routines) {
    assert.equal(row.parityStatus, "verified");
    assert.equal(row.review.status, "approved");
    assert.equal(row.semantics.parameterMappings.status, "verified");
    assert.equal(row.semantics.outputFieldMappings.status, "verified");
    assert.equal(row.semantics.readMappings.status, "verified");
    assert.equal(row.semantics.writeMappings.status, "verified");
    assert.equal(row.semantics.transaction.status, "verified");
    assert.equal(row.semantics.nullSemantics.status, "verified");
    assert.equal(row.semantics.roundingSemantics.status, "verified");
    assert.equal(row.semantics.stateSideEffects.status, "verified");
    assert.equal(row.semantics.dynamicSql.status, "none");
    assert.equal(row.semantics.dormantPaths.triggerFiringCase.status, "covered");
    assert.equal(row.semantics.writeMappings.applicability, "not_applicable");
    assert.equal(row.semantics.nullSemantics.applicability, "not_applicable");
    assert.equal(row.semantics.roundingSemantics.applicability, "not_applicable");
    for (const kind of ["positive", "negative", "permission", "conservation"]) {
      assert.ok(row.testEvidence[kind].length > 0, `${row.canonicalFamily}:${kind}`);
    }
  }
});

test("commented wide-table DDL intent is frozen as retired design, never mistaken for active dynamic SQL", () => {
  assert.deepEqual(contract.sourceShape, {
    activeStatement: "select_constant_one",
    activeBusinessWrites: 0,
    activeDynamicSqlExecutions: 0,
    commentedInsertIntent: "add_numeric_column_named_by_inserted_item_code_to_timekeeprecord",
    commentedDeleteIntent: "drop_column_named_by_deleted_item_code_from_timekeeprecord",
    commentedIntentDisposition: "retired_in_favor_of_normalized_rows_no_physical_fact_schema_mutation",
  });
  for (const row of contract.routines) {
    assert.equal(row.retiredCommentedIntent, "dynamic_timekeeprecord_column_ddl_replaced_by_normalized_rows");
    assert.deepEqual(row.semantics.dynamicSql.resolvedWriteTargets, []);
    assert.equal(row.semantics.stateSideEffects.entries[0].conservationRule, "trigger_family_business_write_count_zero_and_attendance_fact_column_delta_zero");
  }
});

test("fixture covers firing empty permission and schema conservation without source rows", () => {
  assert.deepEqual(fixture.cases.map(row => row.testId), [
    "positive-insert-trigger-active-body",
    "positive-delete-trigger-active-body",
    "negative-empty-transition-set",
    "permission-no-direct-trigger-execution",
    "conservation-normalized-fact-schema",
  ]);
  assert.equal(fixture.cases[0].expectedFactColumnDelta, 0);
  assert.equal(fixture.cases[1].expectedFactColumnDelta, 0);
  assert.equal(fixture.cases[2].expectedTriggerFirings, 0);
  assert.equal(fixture.cases[3].expectedDisposition, "not_exposed_as_modern_api");
  assert.equal(fixture.cases[4].expectedHistoricalFactMutation, 0);
  assert.equal(fixture.containsSourceRows, false);
  assert.equal(fixture.containsPersonalData, false);
});

test("source ledger or evidence drift cannot retain verified credit", () => {
  const driftedLedger = structuredClone(contract);
  driftedLedger.evidenceBindings.routineLedger.sha256 = "f".repeat(64);
  assert.throws(
    () => verifyLegacyAttendanceItemSchemaHookParity({ contract: driftedLedger, fixture, repositoryRoot: root }),
    error => error instanceof LegacyAttendanceItemSchemaHookParityError && error.code === "ATTENDANCE_ITEM_HOOK_EVIDENCE_DRIFT",
  );

  const promotedScope = structuredClone(contract);
  promotedScope.nonClaims.legacyItemConfigurationCrud = "VERIFIED";
  assert.throws(
    () => verifyLegacyAttendanceItemSchemaHookParity({ contract: promotedScope, fixture, repositoryRoot: root }),
    error => error instanceof LegacyAttendanceItemSchemaHookParityError && error.code === "ATTENDANCE_ITEM_HOOK_CONTRACT_INVALID",
  );
});

console.log("Yuzhou legacy attendance item schema-hook parity contract passed.");
