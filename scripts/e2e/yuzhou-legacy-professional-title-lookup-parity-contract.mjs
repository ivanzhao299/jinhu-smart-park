#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  emulateLegacyProfessionalTitleLookup,
  LegacyProfessionalTitleLookupParityError,
  verifyLegacyProfessionalTitleLookupParity,
} from "../hr-cutover/legacy-professional-title-lookup-parity.mjs";
import { evaluateLegacyRoutineParityContract } from "../hr-cutover/legacy-routine-parity-contract.mjs";

const root = resolve(import.meta.dirname, "../..");
const json = path => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const contract = json("scripts/hr-cutover/contracts/legacy-professional-title-lookup-parity-v1.json");
const fixture = json("scripts/hr-cutover/contracts/legacy-professional-title-lookup-fixture-v1.json");

test("getNameByassignment closes one source-bound professional-title lookup routine", () => {
  const receipt = verifyLegacyProfessionalTitleLookupParity({ contract, fixture, repositoryRoot: root });
  assert.deepEqual(
    {
      status: receipt.status,
      family: receipt.canonicalFamily,
      routines: receipt.verifiedRoutines,
      variants: receipt.historicalVariants,
      sourceWrites: receipt.sourceBusinessWrites,
      modernWrites: receipt.modernLookupBusinessWrites,
    },
    {
      status: "COMPLETE",
      family: "getNameByassignment",
      routines: 1,
      variants: 0,
      sourceWrites: 0,
      modernWrites: 0,
    },
  );
  assert.equal(receipt.containsSourceRows, false);
  assert.equal(receipt.containsPersonalData, false);
  assert.equal(receipt.productionImport, "HOLD");
});

test("generic semantic gate sees complete parameter output read write null rounding transaction and evidence coverage", () => {
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
  assert.equal(row.semantics.transaction.status, "verified");
  assert.equal(row.semantics.dynamicSql.status, "none");
  assert.equal(row.semantics.dormantPaths.emptyInputCase.status, "covered");
  assert.equal(row.semantics.dormantPaths.untriggeredBranchCase.status, "covered");
  assert.equal(row.semantics.dormantPaths.triggerFiringCase.status, "not_applicable");
  for (const kind of ["positive", "negative", "permission", "conservation"]) assert.ok(row.testEvidence[kind].length > 0);
});

test("known null and unknown branches preserve presentation while unknown nonnull data fails closed", () => {
  const [positive, nullCase, unknown] = fixture.cases;
  assert.equal(emulateLegacyProfessionalTitleLookup(positive.input, positive.dictionary), "Reviewed title");
  assert.equal(emulateLegacyProfessionalTitleLookup(nullCase.input, nullCase.dictionary), "");
  assert.equal(emulateLegacyProfessionalTitleLookup(unknown.input, unknown.dictionary), "");
  assert.deepEqual(contract.routines[0].controlledModernizations, [
    "unknown_nonnull_assignment_code_fails_closed_before_import_instead_of_silently_returning_empty",
    "null_database_value_is_projected_as_null_and_rendered_as_empty_presentation",
    "surrounding_padding_is_normalized_as_non_business_presentation_whitespace",
  ]);
});

test("assignment stays a professional-title dictionary and is never promoted to a position", () => {
  assert.equal(contract.nonClaims.assignmentDefinesPosition, "NOT_CLAIMED");
  assert.equal(contract.routines[0].semantics.outputFieldMappings.entries[0].modernField, "hr_employee_profile.technical_title");
  assert.equal(contract.routines[0].semantics.readMappings.entries[0].modernLocator, "hr_employee_profile.legacy_professional_title_code_and_technical_title");
  assert.deepEqual(contract.routines[0].historicalVariants, []);
});

test("evidence drift and scope promotion fail closed", () => {
  const drifted = structuredClone(contract);
  drifted.evidenceBindings.professionalTitleMaterializer.sha256 = "f".repeat(64);
  assert.throws(
    () => verifyLegacyProfessionalTitleLookupParity({ contract: drifted, fixture, repositoryRoot: root }),
    error => error instanceof LegacyProfessionalTitleLookupParityError && error.code === "PROFESSIONAL_TITLE_LOOKUP_EVIDENCE_DRIFT",
  );

  const promoted = structuredClone(contract);
  promoted.nonClaims.assignmentDefinesPosition = "VERIFIED";
  assert.throws(
    () => verifyLegacyProfessionalTitleLookupParity({ contract: promoted, fixture, repositoryRoot: root }),
    error => error instanceof LegacyProfessionalTitleLookupParityError && error.code === "PROFESSIONAL_TITLE_LOOKUP_CONTRACT_INVALID",
  );
});

test("fixture is synthetic and cannot disclose employee or credential data", () => {
  assert.equal(fixture.fixtureOnly, true);
  assert.equal(fixture.containsSourceRows, false);
  assert.equal(fixture.containsPersonalData, false);
  const serialized = JSON.stringify(fixture);
  assert.doesNotMatch(serialized, /"(?:employeeName|employeeCode|personId|idcard|password|credential|token|salary|payroll)"\s*:/iu);
});

console.log("Yuzhou legacy professional-title lookup parity contract passed.");
