#!/usr/bin/env node
/* global console, structuredClone */
import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLegacyCompatibilityProgress,
  LegacyCompatibilityProgressError,
  readDefaultLegacyCompatibilityProgressInputs,
} from "../hr-cutover/legacy-compatibility-progress-v2.mjs";

const inputs = () => structuredClone(readDefaultLegacyCompatibilityProgressInputs());

test("current report uses complete source denominators without producing an additive score", () => {
  const report = buildLegacyCompatibilityProgress(inputs());
  assert.equal(report.status, "IN_PROGRESS");
  assert.equal(report.productionImport, "HOLD");
  assert.equal(report.scoringPolicy.additiveScoreForbidden, true);
  assert.equal(Object.hasOwn(report, "totalScore"), false);
  assert.deepEqual(report.inventory.clientDatabase.tables, {
    numerator: 162, denominator: 162, percent: 100, evidence: "committed exact table/domain enumeration",
  });
  assert.equal(report.inventory.clientDatabase.fields.numerator, 2364);
  assert.equal(report.inventory.clientDatabase.routines.numerator, 212);
  assert.deepEqual(report.inventory.clientDatabase.authorizationGrantEdges, { numerator: 0, denominator: 915, percent: 0, functionalParityCredit: 0, status: "SOURCE_RECEIPT_MISSING" });
  assert.deepEqual(report.inventory.clientDatabase.permissionCapabilities, { numerator: 0, denominator: 0, percent: 0, denominatorStatus: "SOURCE_RECEIPT_REQUIRED", status: "SOURCE_PERMISSION_RECEIPT_MISSING", reasonCode: "LEGACY_CLIENT_PERMISSION_SOURCE_RECEIPT_MISSING" });
  assert.deepEqual(report.inventory.clientUi.staticMenuEntryInventory, {
    numerator: 68,
    denominator: 68,
    percent: 100,
    functionalParityCredit: 0,
    evidence: "committed static atomic traversal inventory",
  });
  assert.deepEqual(report.inventory.clientUi.runtimeAuthorizedMenuEntries, {
    numerator: 0,
    denominator: 68,
    percent: 0,
    reasonCode: "CLIENT_MENU_RUNTIME_AUTHORITY_PENDING",
  });
  assert.ok(report.gaps.some(gap => gap.code === "CLIENT_MENU_RUNTIME_AUTHORITY_PENDING" && gap.remaining === 68));
  assert.equal(report.inventory.groupWeb.auditedNavigableEntries.numerator, 186);
  assert.equal(report.inventory.groupWeb.atomicAspPages.denominator, 4026);
  assert.equal(report.inventory.groupWeb.atomicAspPages.numerator, 0);
});

test("verified field locators are de-duplicated and archive visibility earns no semantic or parity credit", () => {
  const report = buildLegacyCompatibilityProgress(inputs());
  const slices = Object.fromEntries(report.semanticMapping.clientFieldsVerifiedTargetMapping.slices.map(row => [row.domain, row]));
  assert.deepEqual(slices.reviewed_core, { domain: "reviewed_core", numerator: 38, denominator: 260, percent: 14.62 });
  assert.deepEqual(slices.organization_position, { domain: "organization_position", numerator: 25, denominator: 50, percent: 50 });
  assert.equal(slices.payroll.denominator, 32);
  assert.deepEqual(slices.custom_configuration, { domain: "custom_configuration", numerator: 36, denominator: 36, percent: 100 });
  assert.deepEqual(slices.employee_skill, { domain: "employee_skill", numerator: 4, denominator: 5, percent: 80 });
  assert.equal(report.semanticMapping.clientFieldsVerifiedTargetMapping.overlapCount, 0);
  assert.deepEqual(report.semanticMapping.organizationPositionRelations, { numerator: 7, denominator: 8, percent: 87.5 });
  assert.equal(
    report.semanticMapping.clientFieldsVerifiedTargetMapping.numerator,
    slices.reviewed_core.numerator + slices.organization_position.numerator + slices.payroll.numerator
      + slices.custom_configuration.numerator + slices.employee_skill.numerator,
  );
  assert.deepEqual(report.semanticMapping.clientFieldsVerifiedTargetMapping, {
    numerator: 124,
    denominator: 2364,
    percent: 5.25,
    denominatorScope: "all_client_database_source_fields",
    overlapCount: 0,
    slices: report.semanticMapping.clientFieldsVerifiedTargetMapping.slices,
  });
  assert.deepEqual(report.implementation.clientFieldsWithVerifiedTargetContract, { numerator: 124, denominator: 2364, percent: 5.25 });
  assert.equal(report.implementation.reviewedCoreArchiveDetailFields.numerator, 220);
  assert.equal(report.implementation.reviewedCoreArchiveDetailFields.functionalParityCredit, 0);
  assert.equal(report.parity.clientFieldRowLevelParity.numerator, 0);
  assert.equal(report.parity.clientFieldRowLevelParity.denominator, 2364);
});

test("routine inventory and domain classification do not become functional equivalence", () => {
  const source = inputs();
  const baseline = buildLegacyCompatibilityProgress(source);
  assert.deepEqual(baseline.semanticMapping.clientRoutinesStructurallyClassified, {
    numerator: 212, denominator: 212, percent: 100, functionalEquivalenceCredit: 0,
  });
  const inventoryTotal = Object.values(baseline.byRoutineDomain).reduce((sum, domain) => sum + domain.inventory.denominator, 0);
  const parityTotal = Object.values(baseline.byRoutineDomain).reduce((sum, domain) => sum + domain.parity.numerator, 0);
  assert.equal(inventoryTotal, 212);
  assert.equal(parityTotal, baseline.parity.clientRoutineBehaviorParity.numerator);
  assert.equal(baseline.parity.clientRoutineBehaviorParity.denominator, 212);

  const verified = source.routineFamilies.flatMap(contract => contract.routines).find(row => row.parityStatus === "verified");
  assert.ok(verified, "at least one bounded routine family must be verified");
  verified.review.status = "pending";
  const withoutReview = buildLegacyCompatibilityProgress(source);
  assert.equal(withoutReview.parity.clientRoutineBehaviorParity.numerator, parityTotal - 1);
});

test("a status label alone cannot promote an incomplete routine family", () => {
  const source = inputs();
  const pending = source.routineFamilies.flatMap(contract => contract.routines).find(row => row.parityStatus !== "verified");
  if (!pending) return;
  const baseline = buildLegacyCompatibilityProgress(source).parity.clientRoutineBehaviorParity.numerator;
  pending.parityStatus = "verified";
  pending.review = { status: "approved", evidenceSha256: "a".repeat(64) };
  const report = buildLegacyCompatibilityProgress(source);
  assert.equal(report.parity.clientRoutineBehaviorParity.numerator, baseline, "pending semantic sections and tests must keep zero credit");
});

test("modern UI checks remain separate from legacy interaction and Group Web parity", () => {
  const report = buildLegacyCompatibilityProgress(inputs());
  assert.deepEqual(report.ui.customFieldModernSurface, { numerator: 21, denominator: 21, percent: 100 });
  assert.deepEqual(report.ui.customFieldLegacyInteractionParity, { numerator: 0, denominator: 6, percent: 0 });
  assert.deepEqual(report.ui.groupWebRuntimeParity, { numerator: 0, denominator: 186, percent: 0 });
  assert.deepEqual(report.implementation.groupWebModernRuntimeTasksPrepared, {
    numerator: 1,
    denominator: 186,
    percent: 0.54,
    functionalParityCredit: 0,
    status: "ready_not_executed",
  });
  assert.equal(report.inventory.groupWeb.auditedNavigableEntries.percent, 100);
  assert.equal(report.parity.groupWebNavigableEntries.percent, 0);
});

test("production evidence is hash-bound, unique, and cannot be inferred from rehearsal", () => {
  const source = inputs();
  source.productionEvidence = [
    { gate: "source_restore_receipt", status: "verified", evidenceSha256: "a".repeat(64) },
    { gate: "source_restore_receipt", status: "verified", evidenceSha256: "b".repeat(64) },
    { gate: "target_identity", status: "verified", evidenceSha256: "not-a-hash" },
    { gate: "unknown", status: "verified", evidenceSha256: "c".repeat(64) },
  ];
  const report = buildLegacyCompatibilityProgress(source);
  assert.deepEqual(report.productionEvidence.verified, { numerator: 1, denominator: 8, percent: 12.5 });
  assert.equal(report.productionEvidence.historicalRehearsalDoesNotCountAsProduction, true);
  assert.equal(report.status, "IN_PROGRESS");
});

test("source denominator drift and duplicate family binding fail closed", () => {
  const missingTable = inputs();
  missingTable.tableMap.groups[0].sourceTables.pop();
  assert.throws(
    () => buildLegacyCompatibilityProgress(missingTable),
    error => error instanceof LegacyCompatibilityProgressError && error.code === "PROGRESS_INPUT_INVALID",
  );

  const duplicateFamily = inputs();
  duplicateFamily.routineFamilies.push(structuredClone(duplicateFamily.routineFamilies[0]));
  assert.throws(
    () => buildLegacyCompatibilityProgress(duplicateFamily),
    error => error instanceof LegacyCompatibilityProgressError && error.code === "PROGRESS_INPUT_DUPLICATE",
  );
});

test("knowhow grade cannot self-promote or shrink the complete client denominator", () => {
  const promoted = inputs();
  const grade = promoted.knowhowFieldMap.fields.find(row => row.stableId === "KNOWHOW_GRADE");
  grade.disposition = "verified";
  grade.compatibilityCredit = 1;
  promoted.knowhowFieldMap.compatibilityCredit.numerator = 5;
  assert.throws(
    () => buildLegacyCompatibilityProgress(promoted),
    error => error instanceof LegacyCompatibilityProgressError && error.code === "PROGRESS_INPUT_INVALID",
  );
  const report = buildLegacyCompatibilityProgress(inputs());
  assert.equal(report.semanticMapping.clientFieldsVerifiedTargetMapping.denominator, 2364);
  assert.equal(report.parity.clientFieldRowLevelParity.denominator, 2364);
});

console.log("Yuzhou legacy compatibility progress v2 contract passed: staged denominators remain conservative and non-additive.");
