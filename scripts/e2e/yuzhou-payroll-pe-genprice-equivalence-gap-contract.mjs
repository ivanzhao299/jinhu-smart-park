#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  buildPayrollPeGenpriceEquivalenceGapReceipt,
  PayrollPeGenpriceEquivalenceGapError,
} from "../hr-cutover/payroll-pe-genprice-equivalence-gap.mjs";

const root = resolve(import.meta.dirname, "../..");
const contractPath = resolve(root, "scripts/hr-cutover/contracts/legacy-pe-genprice-modern-equivalence-gap-v1.json");
const contract = () => JSON.parse(readFileSync(contractPath, "utf8"));
const build = value => buildPayrollPeGenpriceEquivalenceGapReceipt({ contract: value, repositoryRoot: root });
const rejects = (code, action) => assert.throws(action, error => error instanceof PayrollPeGenpriceEquivalenceGapError && error.code === code);

test("pe_genprice is selected as the strongest unimplemented payroll routine but remains zero-credit", () => {
  const receipt = build(contract());
  assert.equal(receipt.routineId, "RULE-81CAC314D2F3C517");
  assert.equal(receipt.routineFamily, "pe_genprice");
  assert.equal(receipt.selectionReason, "only_non_dynamic_unimplemented_payroll_routine_with_explicit_reads_write_joins_and_closed_calls");
  assert.deepEqual(receipt.parameters, [["productid", "int"], ["date", "datetime"]]);
  assert.equal(receipt.readTableCount, 3);
  assert.equal(receipt.writeTableCount, 1);
  assert.equal(receipt.joinPredicateCount, 2);
  assert.equal(receipt.calledRoutineCount, 0);
  assert.equal(receipt.sourceArtifact.sourceBodyAvailable, false);
  assert.equal(receipt.modernTarget.functionalStatus, "target_schema_required");
  assert.equal(receipt.adapterCreated, false);
  assert.equal(receipt.boundedSyntheticParityRun, false);
  assert.equal(receipt.behaviorVerified, false);
  assert.deepEqual(receipt.compatibilityCredit, { numerator: 0, denominator: 1 });
  assert.equal(receipt.status, "BEST_STRUCTURAL_CANDIDATE_BEHAVIOR_AND_TARGET_UNAVAILABLE");
  assert.equal(receipt.productionImport, "HOLD");
  assert.match(receipt.receiptSha256, /^[a-f0-9]{64}$/u);
});

test("gap receipt contains structural evidence only and never payroll values PII or executable SQL", () => {
  const receipt = build(contract());
  assert.equal(receipt.containsPayrollValues, false);
  assert.equal(receipt.containsPersonalData, false);
  assert.equal(receipt.legacyRoutineExecuted, false);
  assert.equal(receipt.legacyDynamicSqlExecuted, false);
  assert.doesNotMatch(JSON.stringify(receipt), /employeeCode|personName|salaryValue|amount|idcard|password|credential|token/iu);
  const source = readFileSync(resolve(root, "scripts/hr-cutover/payroll-pe-genprice-equivalence-gap.mjs"), "utf8");
  assert.doesNotMatch(source, /\b(?:sqlcmd|mssql|sp_executesql)\b|\b(?:insert|update|delete|merge)\s+(?:into|dbo\.|hr_)/iu);
});

test("routine ledger manifest page and modern-target evidence drift fail closed", () => {
  for (const mutate of [
    value => { value.routineLedger.sha256 = "0".repeat(64); },
    value => { value.sourceManifest.sha256 = "0".repeat(64); },
    value => { value.businessPageEvidence.sha256 = "0".repeat(64); },
    value => { value.modernTargetEvidence.tableDomainMap.sha256 = "0".repeat(64); },
    value => { value.modernTargetEvidence.routineCapabilityMap.sha256 = "0".repeat(64); },
  ]) {
    const drifted = contract();
    mutate(drifted);
    rejects("PE_GENPRICE_EVIDENCE_DRIFT", () => build(drifted));
  }
});

test("contract-only adapter parity or routine credit promotion is rejected", () => {
  for (const mutate of [
    value => { value.behaviorEvidenceStatus = "verified"; },
    value => { value.adapterDisposition = "implemented"; },
    value => { value.boundedSyntheticParityDisposition = "passed"; },
    value => { value.compatibilityCredit = 1; },
    value => { value.blockingGaps.pop(); },
    value => { value.forbiddenAssumptions.pop(); },
  ]) {
    const promoted = contract();
    mutate(promoted);
    rejects("PE_GENPRICE_GAP_CONTRACT_INVALID", () => build(promoted));
  }
});

test("candidate selection cannot include prior u_input families or drop structural requirements", () => {
  const priorFamily = contract();
  priorFamily.selectionPolicy.excludedFamilies.pop();
  rejects("PE_GENPRICE_SELECTION_POLICY_INVALID", () => build(priorFamily));

  const noJoinRequirement = contract();
  noJoinRequirement.selectionPolicy.requiredExplicitJoinPredicates = false;
  rejects("PE_GENPRICE_SELECTION_POLICY_INVALID", () => build(noJoinRequirement));

  const inventedColumns = contract();
  inventedColumns.routineLedger.expectedRoutine.writeTables = ["hr_payroll_legacy_snapshot_item"];
  rejects("PE_GENPRICE_ROUTINE_CONTRACT_INVALID", () => build(inventedColumns));
});
