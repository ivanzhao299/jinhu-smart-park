#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  emulateLegacyFamilyQuery,
  LegacyFamilyQueryParityError,
  materializeSyntheticFamilyRow,
  verifyLegacyFamilyQueryParity,
} from "../hr-cutover/legacy-family-query-parity.mjs";
import { evaluateLegacyRoutineParityContract } from "../hr-cutover/legacy-routine-parity-contract.mjs";

const root = resolve(import.meta.dirname, "../..");
const json = path => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const contract = json("scripts/hr-cutover/contracts/legacy-family-query-parity-v1.json");
const fixture = json("scripts/hr-cutover/contracts/legacy-family-query-parity-fixture-v1.json");

test("u_family closes one source-bound seven-field family query routine", () => {
  const receipt = verifyLegacyFamilyQueryParity({ contract, fixture, repositoryRoot: root });
  assert.deepEqual(
    {
      status: receipt.status,
      family: receipt.canonicalFamily,
      routines: receipt.verifiedRoutines,
      variants: receipt.historicalVariants,
      sourceFields: receipt.sourceOutputFields,
      apiFields: receipt.mappedApiOutputFields,
      sourceWrites: receipt.sourceBusinessWrites,
      modernWrites: receipt.modernQueryBusinessWrites,
    },
    {
      status: "COMPLETE",
      family: "u_family",
      routines: 1,
      variants: 0,
      sourceFields: 7,
      apiFields: 7,
      sourceWrites: 0,
      modernWrites: 0,
    },
  );
  assert.equal(receipt.containsSourceRows, false);
  assert.equal(receipt.containsPersonalData, false);
  assert.equal(receipt.productionImport, "HOLD");
});

test("generic semantic gate sees complete parameter output read write transaction null rounding side-effect and dormant coverage", () => {
  const report = evaluateLegacyRoutineParityContract({ contract, routineLedger: fixture.sourceRoutineLedger });
  assert.equal(report.status, "COMPLETE");
  assert.equal(report.summary.sourceRoutines, 1);
  assert.equal(report.summary.verifiedRoutines, 1);
  assert.equal(report.summary.pendingRoutines, 0);
  assert.equal(report.summary.verifiedSemanticParityPercent, 100);
  assert.deepEqual(report.reasonCodes, []);
  const row = contract.routines[0];
  for (const dimension of ["parameterMappings", "outputFieldMappings", "readMappings", "writeMappings", "nullSemantics", "roundingSemantics", "stateSideEffects"]) {
    assert.equal(row.semantics[dimension].status, "verified", dimension);
  }
  assert.equal(row.semantics.outputFieldMappings.entries.length, 7);
  assert.equal(row.semantics.transaction.status, "verified");
  assert.equal(row.semantics.dynamicSql.status, "none");
  assert.equal(row.semantics.dormantPaths.emptyInputCase.status, "covered");
  assert.equal(row.semantics.dormantPaths.untriggeredBranchCase.status, "covered");
  assert.equal(row.semantics.dormantPaths.triggerFiringCase.status, "not_applicable");
  for (const kind of ["positive", "negative", "permission", "conservation"]) assert.ok(row.testEvidence[kind].length > 0);
});

test("legacy selection and normalized seven-field projection agree for a valid synthetic row", () => {
  const positive = fixture.cases[0];
  const legacyRows = emulateLegacyFamilyQuery(positive.input, positive.rows);
  const materialized = positive.rows
    .filter(row => row.person === positive.input)
    .map(materializeSyntheticFamilyRow)
    .filter(row => row.disposition === "loaded")
    .map(row => row.projection);
  assert.deepEqual(legacyRows, positive.expectedLegacyRows);
  assert.deepEqual(materialized, positive.expectedModernFullRows);
  assert.equal(legacyRows.length, materialized.length);
});

test("null no-match and invalid required relation paths are explicit and conserved", () => {
  const noMatch = fixture.cases[1];
  for (const input of noMatch.inputs) assert.deepEqual(emulateLegacyFamilyQuery(input, noMatch.rows), []);
  const invalid = fixture.cases[2];
  assert.equal(emulateLegacyFamilyQuery(invalid.input, [invalid.row]).length, invalid.expectedLegacyRowCount);
  const materialized = materializeSyntheticFamilyRow(invalid.row);
  assert.equal(materialized.disposition, "quarantined");
  assert.deepEqual(materialized.reasonCodes, invalid.expectedReasonCodes);
  const conservation = fixture.cases[4];
  assert.equal(conservation.sourceRows, conservation.loadedRows + conservation.quarantinedRows + conservation.approvedIgnoredRows);
});

test("permission modernization and current page boundary remain explicit", () => {
  const permission = fixture.cases[3];
  assert.deepEqual(permission.endpointPermissions, [
    "hr:employee_record:read",
    "hr:employee_record:team_read",
    "hr:employee_record:self_read",
  ]);
  assert.equal(permission.fullFieldPermission, "hr:employee_family:read");
  assert.equal(permission.expectedAudit, true);
  assert.equal(contract.nonClaims.allSevenFieldsRenderedOnCurrentSummaryCard, "NOT_CLAIMED");
  assert.equal(contract.nonClaims.otherFamilyReportRoutines, "NOT_CLAIMED");
});

test("evidence drift and scope promotion fail closed", () => {
  const drifted = structuredClone(contract);
  drifted.evidenceBindings.familyMaterializer.sha256 = "f".repeat(64);
  assert.throws(
    () => verifyLegacyFamilyQueryParity({ contract: drifted, fixture, repositoryRoot: root }),
    error => error instanceof LegacyFamilyQueryParityError && error.code === "FAMILY_QUERY_EVIDENCE_DRIFT",
  );
  const promoted = structuredClone(contract);
  promoted.nonClaims.allSevenFieldsRenderedOnCurrentSummaryCard = "VERIFIED";
  assert.throws(
    () => verifyLegacyFamilyQueryParity({ contract: promoted, fixture, repositoryRoot: root }),
    error => error instanceof LegacyFamilyQueryParityError && error.code === "FAMILY_QUERY_CONTRACT_INVALID",
  );
});

test("fixture is synthetic and cannot carry source, credential, payroll, or attachment payloads", () => {
  assert.equal(fixture.fixtureOnly, true);
  assert.equal(fixture.containsSourceRows, false);
  assert.equal(fixture.containsPersonalData, false);
  const serialized = JSON.stringify(fixture);
  assert.doesNotMatch(serialized, /"(?:idcard|password|credential|token|salary|payroll|photo|attachment|binary|base64)"\s*:/iu);
});

console.log("Yuzhou legacy family query parity contract passed.");
