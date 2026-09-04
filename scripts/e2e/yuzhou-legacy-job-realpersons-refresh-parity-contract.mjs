#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  LegacyJobRealpersonsRefreshParityError,
  refreshLegacyJobRealpersons,
  verifyLegacyJobRealpersonsRefreshParity,
} from "../hr-cutover/legacy-job-realpersons-refresh-parity.mjs";
import { evaluateLegacyRoutineParityContract } from "../hr-cutover/legacy-routine-parity-contract.mjs";

const root = resolve(import.meta.dirname, "../..");
const json = path => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const contract = json("scripts/hr-cutover/contracts/legacy-job-realpersons-refresh-parity-v1.json");
const fixture = json("scripts/hr-cutover/contracts/legacy-job-realpersons-refresh-parity-fixture-v1.json");

test("u_getjobpersons is source-bound but grants zero credit without refresh equivalence", () => {
  const receipt = verifyLegacyJobRealpersonsRefreshParity({ contract, fixture, repositoryRoot: root });
  assert.deepEqual(
    {
      status: receipt.status,
      reviewed: receipt.sourceRoutinesReviewed,
      verified: receipt.verifiedRoutines,
      credit: receipt.compatibilityCredit,
      writes: receipt.sourceBusinessWrites,
      scope: receipt.sourceRowsAffectedScope,
      dynamicSql: receipt.dynamicSqlExecutions,
      cases: receipt.fixtureCases,
    },
    { status: "GAP_CONFIRMED", reviewed: 1, verified: 0, credit: 0, writes: 1, scope: "all_job_rows", dynamicSql: 0, cases: 9 },
  );
  assert.equal(receipt.containsSourceRows, false);
  assert.equal(receipt.containsPersonalData, false);
  assert.equal(receipt.productionImport, "HOLD");
});

test("refresh counts only joined person states whose legacy defcount is one", () => {
  const refreshed = refreshLegacyJobRealpersons(fixture);
  assert.deepEqual(refreshed.map(row => ({ jobCode: row.jobCode, realPersons: row.realPersons })), fixture.expectedAfter);
  assert.equal(refreshed.find(row => row.jobCode === "FIX-JOB-A")?.realPersons, 2);
  assert.equal(refreshed.find(row => row.jobCode === "FIX-JOB-B")?.realPersons, 0);
  assert.equal(refreshed.find(row => row.jobCode === "FIX-JOB-C")?.realPersons, 0);
  assert.equal(refreshed.find(row => row.jobCode === null)?.realPersons, 0);
});

test("empty person or state references zero every job and empty jobs update nothing", () => {
  const withoutPersons = refreshLegacyJobRealpersons({ jobs: fixture.jobs, persons: [], jobStates: fixture.jobStates });
  const withoutStates = refreshLegacyJobRealpersons({ jobs: fixture.jobs, persons: fixture.persons, jobStates: [] });
  assert.ok(withoutPersons.every(row => row.realPersons === 0));
  assert.ok(withoutStates.every(row => row.realPersons === 0));
  assert.deepEqual(refreshLegacyJobRealpersons({ jobs: [], persons: fixture.persons, jobStates: fixture.jobStates }), []);
});

test("contract freezes all dimensions while unresolved write and authorization remain pending", () => {
  const routine = contract.routines[0];
  assert.equal(routine.parityStatus, "pending");
  assert.equal(routine.review.status, "pending");
  assert.equal(routine.authorizationSemantics.status, "pending");
  assert.equal(routine.authorizationSemantics.modernPermission, "hr:decision_center");
  for (const name of ["outputFieldMappings", "readMappings", "writeMappings", "nullSemantics", "stateSideEffects"]) {
    assert.equal(routine.semantics[name].status, "pending", name);
    assert.ok(routine.semantics[name].entries.length > 0, name);
  }
  assert.equal(routine.semantics.parameterMappings.applicability, "not_applicable");
  assert.equal(routine.semantics.roundingSemantics.applicability, "not_applicable");
  assert.equal(routine.semantics.transaction.status, "pending");
  assert.equal(routine.semantics.dynamicSql.status, "none");
  for (const kind of ["positive", "negative", "permission", "conservation"]) {
    assert.ok(routine.testEvidence[kind].length > 0, kind);
  }
});

test("generic parity gate keeps the one routine pending at zero percent", () => {
  const report = evaluateLegacyRoutineParityContract({ contract, routineLedger: fixture.sourceRoutineLedger });
  assert.equal(report.status, "IN_PROGRESS");
  assert.equal(report.summary.sourceRoutines, 1);
  assert.equal(report.summary.verifiedRoutines, 0);
  assert.equal(report.summary.pendingRoutines, 1);
  assert.equal(report.summary.verifiedSemanticParityPercent, 0);
  assert.deepEqual(report.reasonCodes, ["ROUTINE_SEMANTIC_EVIDENCE_PENDING"]);
  assert.equal(report.productionImport, "HOLD");
});

test("gap promotion and evidence drift fail closed", () => {
  const promoted = structuredClone(contract);
  promoted.routines[0].parityStatus = "verified";
  promoted.routines[0].review.status = "approved";
  promoted.routines[0].review.evidenceSha256 = "a".repeat(64);
  assert.throws(
    () => verifyLegacyJobRealpersonsRefreshParity({ contract: promoted, fixture, repositoryRoot: root }),
    error => error instanceof LegacyJobRealpersonsRefreshParityError && error.code === "JOB_REFRESH_CONTRACT_INVALID",
  );

  const drifted = structuredClone(contract);
  drifted.evidenceBindings.modernService.sha256 = "f".repeat(64);
  assert.throws(
    () => verifyLegacyJobRealpersonsRefreshParity({ contract: drifted, fixture, repositoryRoot: root }),
    error => error instanceof LegacyJobRealpersonsRefreshParityError && error.code === "JOB_REFRESH_EVIDENCE_DRIFT",
  );
});

console.log("Yuzhou legacy job realpersons refresh parity gap contract passed.");
