#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  buildLegacyEmployeeProfileEducationSourceChainGapReceipt,
  LegacyEmployeeProfileEducationSourceChainGapError,
} from "../hr-cutover/legacy-employee-profile-education-source-chain-gap.mjs";

const root = resolve(import.meta.dirname, "../..");
const contractPath = resolve(root, "scripts/hr-cutover/contracts/legacy-employee-profile-education-source-chain-gap-v1.json");
const contract = () => JSON.parse(readFileSync(contractPath, "utf8"));
const build = value => buildLegacyEmployeeProfileEducationSourceChainGapReceipt({ contract: value, repositoryRoot: root });
const rejects = (code, action) => assert.throws(action, error => error instanceof LegacyEmployeeProfileEducationSourceChainGapError && error.code === code);

test("education source structure is bound through modern UI and API while semantic materialization stays zero-credit", () => {
  const receipt = build(contract());
  assert.equal(receipt.sourceDictionaryJoinVerified, true);
  assert.deepEqual(receipt.sourceRoutines.map(row => row.sourceName), ["u_personinfo2003", "web_personinfo_SelectCommand"]);
  assert.deepEqual(receipt.legacyPage, { familyId: "employee_profile", runtimeStatus: "partial", fieldBindingVerified: false });
  assert.equal(receipt.observedTransform, "trimmed_secedu_then_trimmed_edu_fallback");
  assert.equal(receipt.dictionaryProjectionVerified, false);
  assert.equal(receipt.precedenceVerified, false);
  assert.equal(receipt.privateStageShapeAllowlisted, true);
  assert.equal(receipt.writerFieldAllowlisted, true);
  assert.equal(receipt.exactRollbackBound, true);
  assert.equal(receipt.modernSurfaceCount, 6);
  assert.equal(receipt.pipelineEvidenceCount, 6);
  assert.deepEqual(receipt.compatibilityCredit, { numerator: 0, denominator: 1 });
  assert.equal(receipt.status, "STRUCTURAL_CHAIN_BOUND_MATERIALIZATION_SEMANTICS_UNPROVEN");
  assert.equal(receipt.productionImport, "HOLD");
  assert.match(receipt.receiptSha256, /^[a-f0-9]{64}$/u);
});

test("receipt is aggregate-only and excludes source values personal data binaries and credentials", () => {
  const receipt = build(contract());
  assert.equal(receipt.containsSourceValues, false);
  assert.equal(receipt.containsPersonalData, false);
  assert.doesNotMatch(JSON.stringify(receipt), /employeeCode|sourceRowSha256|idcard|password|credential|token|photo|docs/iu);
  const source = readFileSync(resolve(root, "scripts/hr-cutover/legacy-employee-profile-education-source-chain-gap.mjs"), "utf8");
  assert.doesNotMatch(source, /\b(?:sqlcmd|mssql|sp_executesql)\b|\b(?:insert|update|delete|merge)\s+(?:into|dbo\.|hr_)/iu);
});

test("routine page pipeline and modern-surface byte drift fail closed", () => {
  for (const mutate of [
    value => { value.sourceRoutineEvidence.sha256 = "0".repeat(64); },
    value => { value.legacyPageEvidence.sha256 = "0".repeat(64); },
    value => { value.pipelineEvidence.find(row => row.stage === "transform").sha256 = "0".repeat(64); },
    value => { value.pipelineEvidence.find(row => row.stage === "exact_rollback").sha256 = "0".repeat(64); },
    value => { value.modernSurfaceEvidence.find(row => row.surface === "api_projection").sha256 = "0".repeat(64); },
    value => { value.modernSurfaceEvidence.find(row => row.surface === "web_ui").sha256 = "0".repeat(64); },
  ]) {
    const drifted = contract();
    mutate(drifted);
    rejects("EMPLOYEE_EDUCATION_EVIDENCE_DRIFT", () => build(drifted));
  }
});

test("contract-only promotion cannot guess dictionary labels fallback precedence or page-field binding", () => {
  for (const [code, mutate] of [
    ["EMPLOYEE_EDUCATION_GAP_CONTRACT_INVALID", value => { value.dictionaryProjectionStatus = "verified"; }],
    ["EMPLOYEE_EDUCATION_GAP_CONTRACT_INVALID", value => { value.precedenceStatus = "verified"; }],
    ["EMPLOYEE_EDUCATION_PAGE_CONTRACT_INVALID", value => { value.legacyPageEvidence.fieldBindingStatus = "verified"; }],
    ["EMPLOYEE_EDUCATION_GAP_CONTRACT_INVALID", value => { value.compatibilityCredit = 1; }],
    ["EMPLOYEE_EDUCATION_GAP_CONTRACT_INVALID", value => { value.blockingGaps.pop(); }],
    ["EMPLOYEE_EDUCATION_GAP_CONTRACT_INVALID", value => { value.forbiddenAssumptions.pop(); }],
  ]) {
    const promoted = contract();
    mutate(promoted);
    rejects(code, () => build(promoted));
  }
});

test("both person-profile query routines and the complete target surface are mandatory", () => {
  const missingRoutine = contract();
  missingRoutine.sourceRoutineEvidence.requiredRoutines.pop();
  rejects("EMPLOYEE_EDUCATION_SOURCE_CONTRACT_INVALID", () => build(missingRoutine));

  const missingSurface = contract();
  missingSurface.modernSurfaceEvidence.pop();
  rejects("EMPLOYEE_EDUCATION_SURFACE_COVERAGE_INVALID", () => build(missingSurface));

  const swappedStage = contract();
  [swappedStage.pipelineEvidence[0], swappedStage.pipelineEvidence[1]] = [swappedStage.pipelineEvidence[1], swappedStage.pipelineEvidence[0]];
  rejects("EMPLOYEE_EDUCATION_PIPELINE_COVERAGE_INVALID", () => build(swappedStage));
});
