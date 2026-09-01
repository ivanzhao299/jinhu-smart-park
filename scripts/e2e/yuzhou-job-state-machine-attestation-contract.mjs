#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { canonicalHash } from "../hr-cutover/materialize-reviewed-job-state.mjs";
import { canonicalDecisionHash, canonicalEvidenceIndexHash } from "../hr-cutover/yuzhou-job-state-decision-artifact-lib.mjs";
import { compileYuzhouJobStateMachineAttestation, computeYuzhouJobStateAttestationIntegrity, computeYuzhouJobStateCheckpointArtifactHash, computeYuzhouJobStateCheckpointRoot, verifyYuzhouJobStateMachineAttestation } from "../hr-cutover/yuzhou-job-state-machine-attestation.mjs";

const root = resolve(import.meta.dirname, "../.."), legacyFixture = JSON.parse(readFileSync(resolve(root, "scripts/hr-cutover/fixtures/yuzhou-job-state-decision-artifact/valid-draft-v1.json"), "utf8"));
const schemaPath = resolve(root, "scripts/hr-cutover/contracts/yuzhou-job-state-machine-attestation.schema.json"), h = value => value.repeat(64), clone = value => structuredClone(value);
const failure = (callback, code) => assert.throws(callback, error => error?.code === code);

function buildCheckpoint() {
  const trustedRoot = h("9"), triple = { codeSha: "1".repeat(40), sourceSnapshotHash: h("2"), mappingContractHash: h("3") }, counts = [401, 402, 403, 404, 405, 406, 528];
  const decisions = legacyFixture.decisions.map((row, index) => ({ ...row, observedRecordCount: counts[index], semanticClassification: row.decision === "map" ? "derived_deterministic" : "quarantined_ambiguous", reasonCode: row.decision === "map" ? "DETERMINISTIC_MAPPING" : row.reasonCode })).sort((a, b) => a.sourceIdentitySha256.localeCompare(b.sourceIdentitySha256));
  const evidenceIndex = { checkpointSha256: trustedRoot, manifestSha256: h("4"), extractBindingSha256: h("5"), journalSha256: h("6"), employeeJobStatesSha256: h("7"), jobStateCodeMetadataSha256: h("8"), jobStateCodesSha256: h("a") };
  const decision = { formatVersion: 2, artifactKind: "yuzhou_employee_job_state_machine_decision", artifactVersion: "v2", artifactStatus: "MACHINE_CANDIDATE", triple, expectedCheckpointRootSha256: trustedRoot, checkpointRootSha256: trustedRoot, evidenceIndex, evidenceIndexSha256: canonicalEvidenceIndexHash(evidenceIndex), scopeBinding: legacyFixture.scopeBinding, sourceContract: { ...legacyFixture.sourceContract, sourceRecordCount: 2949 }, decisions,
    semanticLedger: { sourceDistinctStateCount: 7, sourceRecordCount: 2949, mappedStateCount: 4, quarantinedStateCount: 3, mappedRecordCount: decisions.filter(row => row.decision === "map").reduce((sum, row) => sum + row.observedRecordCount, 0), quarantinedRecordCount: decisions.filter(row => row.decision === "quarantine").reduce((sum, row) => sum + row.observedRecordCount, 0), conservationVerified: true }, canonicalDecisionSha256: "", machineAssertion: { mode: "trusted_root_deterministic_machine_semantics", policyVersion: "yuzhou-job-state-machine-policy-v2", status: "PASS", reasonCodes: [], humanSignature: false, humanIdentityAsserted: false }, productionImport: "HOLD" };
  decision.canonicalDecisionSha256 = canonicalDecisionHash(decision);
  const privatePayload = { formatVersion: 2, kind: "yuzhou-job-state-private-materialization", canonicalDecisionSha256: decision.canonicalDecisionSha256, dictionaryVersionId: "00000000-0000-4000-8000-000000000099", expectedDatabaseItemsSha256: h("b"), csm: triple,
    t0Binding: { manifestSha256: evidenceIndex.manifestSha256, employeeJobStatesSha256: evidenceIndex.employeeJobStatesSha256, jobStateCodeMetadataSha256: evidenceIndex.jobStateCodeMetadataSha256, jobStateCodesSha256: evidenceIndex.jobStateCodesSha256 }, scope: { tenantId: "10000001", parkId: "20000001", ...decision.scopeBinding }, dictionaryEvidenceSha256: decision.sourceContract.sourceSnapshotSha256,
    machineActor: { id: "00000000-0000-4000-8000-000000000101", kind: "machine_policy_engine", verifiedAt: "2026-08-29T00:00:00Z" }, items: decisions.map((row, index) => ({ id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, sourceCode: `STATE-${index + 1}`, sourceName: `State ${index + 1}`, sourceValue: null, sourceIdentitySha256: row.sourceIdentitySha256, sourceRowSha256: row.sourceRowSha256 })), productionImport: "HOLD" };
  privatePayload.payloadSha256 = canonicalHash(privatePayload);
  const t0Evidence = { ...privatePayload.t0Binding, dictionaryEvidenceSha256: privatePayload.dictionaryEvidenceSha256, sourceDistinctStateCount: 7, sourceRecordCount: 2949 };
  const checkpoint = { formatVersion: 2, kind: "yuzhou-job-state-preload-package", trustedCheckpointRootSha256: trustedRoot, triple, decisionArtifact: decision, privatePayload, t0Evidence, bindings: { decisionArtifactSha256: computeYuzhouJobStateCheckpointArtifactHash("decision_artifact", decision), privatePayloadArtifactSha256: computeYuzhouJobStateCheckpointArtifactHash("private_payload", privatePayload), t0EvidenceArtifactSha256: computeYuzhouJobStateCheckpointArtifactHash("t0_evidence", t0Evidence) }, packageRootSha256: "" };
  checkpoint.packageRootSha256 = computeYuzhouJobStateCheckpointRoot(checkpoint); return checkpoint;
}

function reseal(checkpoint) {
  checkpoint.decisionArtifact.canonicalDecisionSha256 = canonicalDecisionHash(checkpoint.decisionArtifact); checkpoint.privatePayload.canonicalDecisionSha256 = checkpoint.decisionArtifact.canonicalDecisionSha256;
  const { payloadSha256: _payloadSha256, ...body } = checkpoint.privatePayload; checkpoint.privatePayload.payloadSha256 = canonicalHash(body);
  checkpoint.bindings = { decisionArtifactSha256: computeYuzhouJobStateCheckpointArtifactHash("decision_artifact", checkpoint.decisionArtifact), privatePayloadArtifactSha256: computeYuzhouJobStateCheckpointArtifactHash("private_payload", checkpoint.privatePayload), t0EvidenceArtifactSha256: computeYuzhouJobStateCheckpointArtifactHash("t0_evidence", checkpoint.t0Evidence) }; checkpoint.packageRootSha256 = computeYuzhouJobStateCheckpointRoot(checkpoint);
}

test("trusted checkpoint yields the native v2 non-human job-state attestation", () => {
  const checkpoint = buildCheckpoint(), result = compileYuzhouJobStateMachineAttestation(checkpoint, { expectedCheckpointRootSha256: checkpoint.trustedCheckpointRootSha256 });
  assert.equal(result.formatVersion, 2); assert.equal(result.attestationVersion, "v2"); assert.equal(result.status, "PASS"); assert.equal(result.humanIdentityAsserted, false); assert.equal(result.productionImport, "HOLD"); assert.equal(result.jobStatePackageRootSha256, checkpoint.packageRootSha256); assert.equal(computeYuzhouJobStateAttestationIntegrity(result), result.integrityDigest); assert.equal(verifyYuzhouJobStateMachineAttestation(result, { expectedCheckpointRootSha256: checkpoint.trustedCheckpointRootSha256 }).status, "PASS");
});

test("integrity, external root and all three package members are reverified", () => {
  const checkpoint = buildCheckpoint(), result = compileYuzhouJobStateMachineAttestation(checkpoint, { expectedCheckpointRootSha256: checkpoint.trustedCheckpointRootSha256 }), tampered = clone(result); tampered.semanticLedger.mappedRecordCount -= 1; tampered.semanticLedger.quarantinedRecordCount += 1;
  failure(() => verifyYuzhouJobStateMachineAttestation(tampered, { expectedCheckpointRootSha256: checkpoint.trustedCheckpointRootSha256 }), "YUZHOU_JOB_STATE_MACHINE_INTEGRITY_MISMATCH"); failure(() => verifyYuzhouJobStateMachineAttestation(result, { expectedCheckpointRootSha256: h("f") }), "YUZHOU_JOB_STATE_MACHINE_TRUST_ROOT_MISMATCH");
  const payloadDrift = buildCheckpoint(); payloadDrift.privatePayload.items[0].sourceName = "Changed"; payloadDrift.bindings.privatePayloadArtifactSha256 = computeYuzhouJobStateCheckpointArtifactHash("private_payload", payloadDrift.privatePayload); payloadDrift.packageRootSha256 = computeYuzhouJobStateCheckpointRoot(payloadDrift); failure(() => compileYuzhouJobStateMachineAttestation(payloadDrift, { expectedCheckpointRootSha256: payloadDrift.trustedCheckpointRootSha256 }), "YUZHOU_JOB_STATE_MACHINE_PRIVATE_PAYLOAD_HASH_MISMATCH");
});

test("attestation accepts a source-proven all-mapped state ledger", () => {
  const checkpoint = buildCheckpoint();
  for (const [index, decision] of checkpoint.decisionArtifact.decisions.entries()) {
    decision.decision = "map";
    decision.targetEmploymentStatus = ["active", "departed", "suspended"][index % 3];
    decision.semanticClassification = "derived_deterministic";
    decision.reasonCode = "DETERMINISTIC_MAPPING";
  }
  checkpoint.decisionArtifact.semanticLedger = {
    sourceDistinctStateCount: 7, sourceRecordCount: 2949,
    mappedStateCount: 7, quarantinedStateCount: 0,
    mappedRecordCount: 2949, quarantinedRecordCount: 0, conservationVerified: true
  };
  reseal(checkpoint);
  const result = compileYuzhouJobStateMachineAttestation(checkpoint, { expectedCheckpointRootSha256: checkpoint.trustedCheckpointRootSha256 });
  assert.equal(result.semanticLedger.mappedStateCount, 7);
  assert.equal(result.semanticLedger.quarantinedRecordCount, 0);
});

test("self-computed roots, production attestations and legacy v1 human packages cannot substitute", () => {
  const checkpoint = buildCheckpoint(), trustedRoot = checkpoint.trustedCheckpointRootSha256; failure(() => compileYuzhouJobStateMachineAttestation(checkpoint), "YUZHOU_JOB_STATE_MACHINE_TRUST_ROOT_REQUIRED");
  const forged = clone(checkpoint); forged.trustedCheckpointRootSha256 = h("e"); forged.decisionArtifact.expectedCheckpointRootSha256 = h("e"); forged.decisionArtifact.checkpointRootSha256 = h("e"); forged.decisionArtifact.evidenceIndex.checkpointSha256 = h("e"); forged.decisionArtifact.evidenceIndexSha256 = canonicalEvidenceIndexHash(forged.decisionArtifact.evidenceIndex); reseal(forged); failure(() => compileYuzhouJobStateMachineAttestation(forged, { expectedCheckpointRootSha256: trustedRoot }), "YUZHOU_JOB_STATE_MACHINE_TRUST_ROOT_MISMATCH");
  failure(() => verifyYuzhouJobStateMachineAttestation({ formatVersion: 2, artifactKind: "machine_attestation", attestationVersion: "yuzhou-hr-production-import-machine-attestation-v2", status: "PASS" }, { expectedCheckpointRootSha256: trustedRoot }), "YUZHOU_JOB_STATE_MACHINE_ATTESTATION_INVALID");
  const legacy = buildCheckpoint(); legacy.decisionArtifact = clone(legacyFixture); legacy.decisionArtifact.sourceContract.sourceRecordCount = 2949; failure(() => compileYuzhouJobStateMachineAttestation(legacy, { expectedCheckpointRootSha256: trustedRoot }), "YUZHOU_JOB_STATE_MACHINE_ARTIFACT_BINDING_MISMATCH");
});

test("schema freezes native v2 PASS/HOLD and forbids machine impersonation", () => {
  const schema = JSON.parse(readFileSync(schemaPath, "utf8")); assert.equal(schema.properties.formatVersion.const, 2); assert.equal(schema.properties.attestationVersion.const, "v2"); assert.equal(schema.properties.status.const, "PASS"); assert.equal(schema.properties.humanSignature.const, false); assert.equal(schema.properties.humanIdentityAsserted.const, false); assert.equal(schema.properties.productionImport.const, "HOLD"); assert(schema.required.includes("trustedCheckpointRootSha256")); assert(schema.required.includes("jobStatePackageRootSha256"));
});

console.log("Yuzhou job-state v2 machine attestation contract passed.");
