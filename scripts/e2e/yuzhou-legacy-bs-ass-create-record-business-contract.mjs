#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  LegacyBsAssCreateRecordContractError,
  verifyLegacyBsAssCreateRecordBusinessContract,
} from "../hr-cutover/legacy-bs-ass-create-record-business-contract.mjs";

const root = resolve(import.meta.dirname, "../..");
const contractPath = resolve(root, "scripts/hr-cutover/contracts/legacy-bs-ass-create-record-business-contract-v1.json");
const contract = () => JSON.parse(readFileSync(contractPath, "utf8"));
const verify = candidate => verifyLegacyBsAssCreateRecordBusinessContract({ contract: candidate, repositoryRoot: root });
const rejects = (code, action) => assert.throws(
  action,
  error => error instanceof LegacyBsAssCreateRecordContractError && error.code === code,
);

test("bs_AssCreateRecord freezes its only controlled canonical family member at zero credit", () => {
  const receipt = verify(contract());
  assert.deepEqual(receipt, {
    ok: true,
    status: "pending",
    canonicalFamily: "bs_AssCreateRecord",
    familyMembersReviewed: 1,
    historicalVariantsReviewed: 0,
    parametersFrozen: 3,
    readTablesFrozen: 5,
    writeTargetsFrozen: 3,
    calculationsFrozen: 4,
    branchesFrozen: 14,
    cursorLoopsFrozen: 2,
    compatibleFindings: 4,
    dormantFindings: 3,
    driftFindings: 9,
    compatibilityCredit: 0,
    containsSourceRows: false,
    containsPersonalData: false,
    productionMutationAllowed: false,
    productionImport: "HOLD",
  });
});

test("all inputs, read fields, exact insert fields and existence keys remain explicit", () => {
  const candidate = contract();
  assert.deepEqual(candidate.parameters.map(row => [row.sourceName, row.sourceType]), [
    ["asssessionid", "int"],
    ["person", "varchar(20)"],
    ["lb", "int"],
  ]);
  assert.deepEqual(candidate.reads.map(row => row.sourceTable), [
    "person", "assessmentmaster", "assitem", "assessmentdetail", "asssour",
  ]);
  assert.deepEqual(candidate.writes.map(row => [
    row.sourceTable,
    row.insertedFields.map(field => field.field),
    row.logicalExistenceKey,
  ]), [
    ["assessmentmaster", ["asssessionid", "person"], ["person", "asssessionid"]],
    ["assessmentdetail", ["asssessionid", "person", "assitemid"], ["person", "asssessionid", "assitemid"]],
    ["asssour", ["asssessionid", "person", "assitemid", "lb"], ["person", "asssessionid", "assitemid", "lb"]],
  ]);
});

test("null, empty, duplicate and both cursor paths remain frozen even without source rows", () => {
  const candidate = contract();
  assert.equal(candidate.branches.length, 14);
  assert.deepEqual(candidate.loops.map(row => [row.id, row.ordering, row.emptyPath]), [
    ["L01_DETAIL_ITEMS", "none_guaranteed", "zero_iterations"],
    ["L02_SCORE_SOURCE_ITEMS", "none_guaranteed", "zero_iterations"],
  ]);
  assert.ok(candidate.emptyAndNullPaths.includes("empty_assitem_set_can_leave_only_the_master_insert"));
  assert.ok(candidate.emptyAndNullPaths.includes("existing_rows_are_independently_skipped_per_target_and_item"));
  assert.equal(candidate.transactionAndErrors.explicitTransaction, false);
  assert.equal(candidate.repeatExecution.databaseEnforcedLogicalUniqueness, false);
  assert.match(candidate.repeatExecution.raceRisk, /duplicates/u);
  assert.deepEqual(candidate.defaultsAndOmittedFields.assessmentdetail.explicitDefaultsUsed, ["itemvalue_defaults_to_numeric_zero"]);
  assert.equal(candidate.defaultsAndOmittedFields.assessmentmaster.omittedNullableFields.length, 18);
  assert.deepEqual(candidate.calculations.map(row => row.id), [
    "C01_EFFECTIVE_LB", "C02_ASSESSMENT_RESOLUTION", "C03_ITEM_SET", "C04_SCORE_CALCULATION",
  ]);
});

test("schema compatibility, dormant paths and drift are not collapsed into parity", () => {
  const candidate = contract();
  assert.ok(candidate.schemaAssessment.compatible.length > 0);
  assert.ok(candidate.schemaAssessment.dormant.includes("empty_source_tables_or_nullable_columns_do_not_remove_any_frozen_branch"));
  assert.ok(candidate.schemaAssessment.drift.includes("source_not_null_ids_are_omitted_without_controlled_ddl_defaults"));
  assert.equal(candidate.sourceSemanticConflict.classification, "drift");
  assert.equal(candidate.modernSurface.exactCreateRecordEndpoint, "missing");
  assert.equal(candidate.modernSurface.exactCreateRecordAction, "missing");
  assert.equal(candidate.compatibilityCredit.numerator, 0);
});

test("missing a write target or a branch fails closed", () => {
  const missingWrite = contract();
  missingWrite.writes = missingWrite.writes.filter(row => row.sourceTable !== "asssour");
  rejects("ASS_CREATE_RECORD_WRITE_TARGET_MISSING", () => verify(missingWrite));

  const missingBranch = contract();
  missingBranch.branches = missingBranch.branches.filter(row => row.id !== "B08_ITEM_SET_EMPTY");
  rejects("ASS_CREATE_RECORD_BRANCH_MISSING", () => verify(missingBranch));
});

test("verified claims, hash drift and production mutation fail closed", () => {
  const promoted = contract();
  promoted.status = "verified";
  promoted.compatibilityCredit.numerator = 1;
  rejects("ASS_CREATE_RECORD_FALSE_PARITY_PROMOTION", () => verify(promoted));

  const nestedPromotion = contract();
  nestedPromotion.parameters[0].classification = "verified";
  rejects("ASS_CREATE_RECORD_FALSE_PARITY_PROMOTION", () => verify(nestedPromotion));

  const drifted = contract();
  drifted.repositoryEvidence.routineLedger.sha256 = "f".repeat(64);
  rejects("ASS_CREATE_RECORD_EVIDENCE_DRIFT", () => verify(drifted));

  const productionWrite = contract();
  productionWrite.productionMutationAllowed = true;
  productionWrite.productionImport = "READY";
  productionWrite.nonClaims.productionWriteAuthorized = true;
  rejects("ASS_CREATE_RECORD_PRODUCTION_WRITE_FORBIDDEN", () => verify(productionWrite));
});

test("contract and executor contain no row payload, credentials, salary details or private source paths", () => {
  const serialized = JSON.stringify(contract());
  const executor = readFileSync(resolve(root, "scripts/hr-cutover/legacy-bs-ass-create-record-business-contract.mjs"), "utf8");
  assert.doesNotMatch(serialized, /\/Users\/|\/private\/|Downloads|credentialValue|salaryAmount|employeeName/iu);
  assert.doesNotMatch(serialized, /\b(?:sqlcmd|mssql|docker\s+exec|sp_executesql)\b/iu);
  assert.doesNotMatch(executor, /\b(?:sqlcmd|mssql|docker\s+exec|sp_executesql)\b/iu);
});
