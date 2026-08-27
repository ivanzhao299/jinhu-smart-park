#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { compileT4Readiness } from "../hr-cutover/compile-t4-readiness.mjs";

const root = resolve(import.meta.dirname, "../..");
const source = JSON.parse(readFileSync(resolve(root, ".trellis/tasks/08-24-yuzhou-hr-t4-payroll-history/research/source-evidence-manifest.json"), "utf8"));
const missing = JSON.parse(readFileSync(resolve(root, "scripts/hr-cutover/fixtures/t4-business-inputs-missing.json"), "utf8"));
const noGo = compileT4Readiness(source, missing);
assert.equal(noGo.decision, "NO_GO");
assert.equal(noGo.productionImport, "HOLD");
assert.deepEqual(noGo.reasonCodes, ["T4_BUSINESS_ATTESTATION_MISSING", "T4_FORMULA_SCOPE_UNSIGNED", "T4_TOLERANCE_UNSIGNED"]);
assert.equal(noGo.executableFormulaCount, 0);

const sha = "a".repeat(64);
const signedInputs = {
  formatVersion: 1,
  formulaApproval: { status: "approved_for_simulation", formulaVersionIds: ["fixture-formula"], artifactSha256: sha },
  tolerancePolicies: [{ bookIdentitySha256: sha, itemIdentitySha256: sha, toleranceDecimal: "0.0000", artifactSha256: sha }],
  attestations: ["hr", "payroll", "finance"].map((role, index) => ({ role, signerSubjectId: String(index + 1).repeat(64), subjectManifestSha256: source.pendingExtractionEvidence.businessContentSha256, decision: "accepted", artifactSha256: sha })),
};
const ready = compileT4Readiness(source, signedInputs);
assert.equal(ready.decision, "READY_FOR_SIGNED_SIMULATION");
assert.equal(ready.productionImport, "HOLD");
assert.deepEqual(ready.reasonCodes, []);

const sameSigner = compileT4Readiness(source, {
  formatVersion: 1,
  formulaApproval: { status: "approved_for_simulation", formulaVersionIds: ["fixture-formula"], artifactSha256: sha },
  tolerancePolicies: [{ toleranceDecimal: "0.0100", artifactSha256: sha }],
  attestations: ["hr", "payroll", "finance"].map((role) => ({ role, signerSubjectId: "1".repeat(64), subjectManifestSha256: source.pendingExtractionEvidence.businessContentSha256, decision: "accepted", artifactSha256: sha })),
});
assert.ok(sameSigner.reasonCodes.includes("T4_BUSINESS_ATTESTATION_MISSING"));

const drift = structuredClone(source);
drift.payrollProfile.salaryActualRowCount = 46091;
assert.ok(compileT4Readiness(drift, missing).reasonCodes.includes("T4_SOURCE_PROFILE_DRIFT"));

const candidateDrift = structuredClone(source);
candidateDrift.productionCandidate.candidateRows = 8343;
assert.ok(compileT4Readiness(candidateDrift, missing).reasonCodes.includes("T4_CANDIDATE_PROFILE_DRIFT"));

const authorityDrift = structuredClone(source);
authorityDrift.pendingExtractionEvidence.sourceProof.readOnly = false;
assert.ok(compileT4Readiness(authorityDrift, missing).reasonCodes.includes("T4_SOURCE_AUTHORITY_INVALID"));

const wrongSubject = structuredClone(signedInputs);
wrongSubject.attestations = wrongSubject.attestations.map((item) => ({ ...item, subjectManifestSha256: sha }));
assert.ok(compileT4Readiness(source, wrongSubject).reasonCodes.includes("T4_BUSINESS_ATTESTATION_MISSING"));

console.log("Yuzhou T4 readiness and detached attestation contract passed.");
