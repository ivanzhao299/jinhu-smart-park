import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  buildLegacySecassignmentModernTargetGapReceipt,
  LegacySecassignmentModernTargetGapError,
} from "../hr-cutover/legacy-secassignment-modern-target-gap.mjs";

const root = resolve(import.meta.dirname, "../..");
const contractPath = resolve(root, "scripts/hr-cutover/contracts/legacy-secassignment-modern-target-gap-v1.json");
const contract = () => JSON.parse(readFileSync(contractPath, "utf8"));
const build = value => buildLegacySecassignmentModernTargetGapReceipt({ contract: value, repositoryRoot: root });
const rejects = (code, action) => assert.throws(action, error => error instanceof LegacySecassignmentModernTargetGapError && error.code === code);

test("binds the source probe to current employee position and history targets without guessing semantics", () => {
  const receipt = build(contract());
  assert.equal(receipt.sourceProbeBound, true);
  assert.equal(receipt.sourceSemanticCompatibilityVerified, false);
  assert.equal(receipt.candidateTargetCount, 3);
  assert.deepEqual(receipt.candidateDecisions.map(row => row.targetId), [
    "employee_position_reference",
    "position_master",
    "employment_event_history",
  ]);
  assert.ok(receipt.candidateDecisions.every(row => row.decision === "REJECT_UNPROVEN_MAPPING"));
  assert.equal(receipt.explicitModernRelationTablePresent, false);
  assert.ok(receipt.targetInventory.migrationFileCount > 0);
  assert.match(receipt.targetInventory.migrationInventorySha256, /^[a-f0-9]{64}$/u);
  assert.equal(receipt.decision, "KEEP_PENDING");
  assert.equal(receipt.uniqueGapCode, "SECASSIGNMENT_MODERN_RELATION_CONTRACT_UNAPPROVED");
  assert.deepEqual(receipt.requiredReviewedDecision, [
    "source_semantic_classification",
    "modern_target_relation_and_cardinality",
    "effective_time_and_history_policy",
  ]);
  assert.equal(receipt.materialization, "BLOCKED");
  assert.deepEqual(receipt.compatibilityCredit, { numerator: 0, denominator: 1 });
  assert.equal(receipt.productionImport, "HOLD");
  assert.match(receipt.receiptSha256, /^[a-f0-9]{64}$/u);
});

test("receipt contains stable target identifiers and aggregates but no source values or personal data", () => {
  const receipt = build(contract());
  const serialized = JSON.stringify(receipt);
  assert.equal(receipt.containsSourceValues, false);
  assert.equal(receipt.containsPersonalData, false);
  assert.doesNotMatch(serialized, /"(?:employeeCode|employeeName|personName|personCode|sourceValue|sourceRow|idcard|mobile|email|password|credential|token)"\s*:/iu);
  const implementation = readFileSync(resolve(root, "scripts/hr-cutover/legacy-secassignment-modern-target-gap.mjs"), "utf8");
  assert.doesNotMatch(implementation, /\b(?:sqlcmd|mssql|sp_executesql)\b|\b(?:insert|update|delete|merge)\s+(?:into|dbo\.|hr_)/iu);
});

test("every source and target evidence binding fails closed on byte drift", () => {
  for (const key of Object.keys(contract().evidenceBindings)) {
    const drifted = contract();
    drifted.evidenceBindings[key].sha256 = "0".repeat(64);
    rejects("SECASSIGNMENT_TARGET_EVIDENCE_DRIFT", () => build(drifted));
  }
  const missing = contract();
  delete missing.evidenceBindings.productionTargetModel;
  rejects("SECASSIGNMENT_TARGET_BINDING_INVALID", () => build(missing));
});

test("contract-only target promotion materialization or compatibility credit is rejected", () => {
  for (const mutate of [
    value => { value.sourceRelation.semanticStatus = "verified"; },
    value => { value.candidateTargets[0].decision = "MATERIALIZE"; },
    value => { value.materialization = "READY"; },
    value => { value.compatibilityCredit = 1; },
    value => { value.productionImport = "READY"; },
  ]) {
    const promoted = contract();
    mutate(promoted);
    rejects("SECASSIGNMENT_TARGET_GAP_CONTRACT_INVALID", () => build(promoted));
  }
});

test("the unresolved work is represented by exactly one gap code with an explicit reviewed decision", () => {
  const value = contract();
  assert.equal(Array.isArray(value.uniqueGap), false);
  assert.equal(value.uniqueGap.code, "SECASSIGNMENT_MODERN_RELATION_CONTRACT_UNAPPROVED");
  assert.equal(value.uniqueGap.requiredReviewedDecision.length, 3);
  assert.equal("gapCodes" in value, false);

  const extraGap = contract();
  extraGap.gapCodes = ["ANOTHER_GAP"];
  rejects("SECASSIGNMENT_TARGET_GAP_CONTRACT_INVALID", () => build(extraGap));
});
