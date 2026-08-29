#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { canonicalHash as canonicalPrivatePayloadHash } from "../hr-cutover/materialize-reviewed-job-state.mjs";
import { canonicalDecisionHash } from "../hr-cutover/yuzhou-job-state-decision-artifact-lib.mjs";
import {
  compileYuzhouJobStateMachineAttestation,
  computeYuzhouJobStateAttestationIntegrity,
  computeYuzhouJobStateCheckpointArtifactHash,
  computeYuzhouJobStateCheckpointRoot,
  verifyYuzhouJobStateMachineAttestation
} from "../hr-cutover/yuzhou-job-state-machine-attestation.mjs";

const root = resolve(import.meta.dirname, "../..");
const fixturePath = resolve(root, "scripts/hr-cutover/fixtures/yuzhou-job-state-decision-artifact/valid-draft-v1.json");
const schemaPath = resolve(root, "scripts/hr-cutover/contracts/yuzhou-job-state-machine-attestation.schema.json");
const digest = value => createHash("sha256").update(value).digest("hex");
const h = value => value.repeat(64);
const clone = value => structuredClone(value);
const failure = (callback, code) => assert.throws(callback, error => error?.code === code);

function buildCheckpoint() {
  const decision = JSON.parse(readFileSync(fixturePath, "utf8"));
  const counts = [401, 402, 403, 404, 405, 406, 528];
  decision.sourceContract.sourceRecordCount = 2949;
  decision.decisions = decision.decisions.map((row, index) => ({ ...row, observedRecordCount: counts[index] }));
  decision.canonicalDecisionSha256 = canonicalDecisionHash(decision);
  const triple = { codeSha: "1".repeat(40), sourceSnapshotHash: h("2"), mappingContractHash: h("3") };
  const privatePayload = {
    formatVersion: 1,
    kind: "yuzhou-job-state-private-materialization",
    canonicalDecisionSha256: decision.canonicalDecisionSha256,
    dictionaryVersionId: "00000000-0000-4000-8000-000000000099",
    expectedDatabaseItemsSha256: h("4"),
    csm: triple,
    t0Binding: { manifestSha256: h("5"), employeeJobStatesSha256: h("6"), jobStateCodeMetadataSha256: h("7"), jobStateCodesSha256: h("8") },
    scope: { tenantId: "10000001", parkId: "20000001", tenantIdentitySha256: decision.scopeBinding.tenantIdentitySha256, parkIdentitySha256: decision.scopeBinding.parkIdentitySha256 },
    dictionaryEvidenceSha256: decision.sourceContract.sourceSnapshotSha256,
    decisionSubject: "00000000-0000-4000-8000-000000000101",
    approvalSubject: "00000000-0000-4000-8000-000000000202",
    items: decision.decisions.map((row, index) => ({
      id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      sourceCode: `STATE-${index + 1}`,
      sourceName: `State ${index + 1}`,
      sourceValue: null,
      sourceIdentitySha256: row.sourceIdentitySha256,
      sourceRowSha256: row.sourceRowSha256
    }))
  };
  privatePayload.payloadSha256 = canonicalPrivatePayloadHash(privatePayload);
  const t0Evidence = { ...privatePayload.t0Binding, dictionaryEvidenceSha256: privatePayload.dictionaryEvidenceSha256, sourceDistinctStateCount: 7, sourceRecordCount: 2949 };
  const checkpoint = {
    formatVersion: 1,
    kind: "yuzhou-job-state-preload-checkpoint",
    triple,
    decisionArtifact: decision,
    privatePayload,
    t0Evidence,
    bindings: {
      decisionArtifactSha256: computeYuzhouJobStateCheckpointArtifactHash("decision_artifact", decision),
      privatePayloadArtifactSha256: computeYuzhouJobStateCheckpointArtifactHash("private_payload", privatePayload),
      t0EvidenceArtifactSha256: computeYuzhouJobStateCheckpointArtifactHash("t0_evidence", t0Evidence)
    },
    checkpointRootSha256: ""
  };
  checkpoint.checkpointRootSha256 = computeYuzhouJobStateCheckpointRoot(checkpoint);
  return checkpoint;
}

function reseal(checkpoint) {
  checkpoint.decisionArtifact.canonicalDecisionSha256 = canonicalDecisionHash(checkpoint.decisionArtifact);
  checkpoint.privatePayload.canonicalDecisionSha256 = checkpoint.decisionArtifact.canonicalDecisionSha256;
  const { payloadSha256: _payloadSha256, ...payloadBody } = checkpoint.privatePayload;
  checkpoint.privatePayload.payloadSha256 = canonicalPrivatePayloadHash(payloadBody);
  checkpoint.bindings = {
    decisionArtifactSha256: computeYuzhouJobStateCheckpointArtifactHash("decision_artifact", checkpoint.decisionArtifact),
    privatePayloadArtifactSha256: computeYuzhouJobStateCheckpointArtifactHash("private_payload", checkpoint.privatePayload),
    t0EvidenceArtifactSha256: computeYuzhouJobStateCheckpointArtifactHash("t0_evidence", checkpoint.t0Evidence)
  };
  checkpoint.checkpointRootSha256 = computeYuzhouJobStateCheckpointRoot(checkpoint);
}

test("trusted checkpoint yields a non-human preload machine attestation", () => {
  const checkpoint = buildCheckpoint();
  const result = compileYuzhouJobStateMachineAttestation(checkpoint, { expectedCheckpointRootSha256: checkpoint.checkpointRootSha256 });
  assert.equal(result.status, "PASS");
  assert.deepEqual(result.reasonCodes, []);
  assert.equal(result.humanSignature, false);
  assert.equal(result.humanIdentityAsserted, false);
  assert.equal(result.productionImport, "HOLD");
  assert.equal(result.semanticLedger.sourceRecordCount, 2949);
  assert.equal(result.semanticLedger.mappedRecordCount + result.semanticLedger.quarantinedRecordCount, 2949);
  assert.match(result.integrityDigest, /^[0-9a-f]{64}$/u);
  assert.equal(computeYuzhouJobStateAttestationIntegrity(result), result.integrityDigest);
  assert.equal(verifyYuzhouJobStateMachineAttestation(result, { expectedCheckpointRootSha256: checkpoint.checkpointRootSha256 }).status, "PASS");
});

test("attestation integrity and trusted-root binding are reverified before consumption", () => {
  const checkpoint = buildCheckpoint();
  const result = compileYuzhouJobStateMachineAttestation(checkpoint, { expectedCheckpointRootSha256: checkpoint.checkpointRootSha256 });
  const tampered = clone(result);
  tampered.semanticLedger.mappedRecordCount -= 1;
  tampered.semanticLedger.quarantinedRecordCount += 1;
  failure(() => verifyYuzhouJobStateMachineAttestation(tampered, { expectedCheckpointRootSha256: checkpoint.checkpointRootSha256 }), "YUZHOU_JOB_STATE_MACHINE_INTEGRITY_MISMATCH");
  failure(() => verifyYuzhouJobStateMachineAttestation(result, { expectedCheckpointRootSha256: h("f") }), "YUZHOU_JOB_STATE_MACHINE_TRUST_ROOT_MISMATCH");
});

test("external trust root is mandatory and cannot be replaced by a self-recomputed root", () => {
  const checkpoint = buildCheckpoint();
  const trustedRoot = checkpoint.checkpointRootSha256;
  failure(() => compileYuzhouJobStateMachineAttestation(checkpoint), "YUZHOU_JOB_STATE_MACHINE_TRUST_ROOT_REQUIRED");
  const forged = clone(checkpoint);
  forged.decisionArtifact.decisions[0].observedRecordCount += 1;
  forged.decisionArtifact.decisions[1].observedRecordCount -= 1;
  reseal(forged);
  assert.notEqual(forged.checkpointRootSha256, trustedRoot);
  failure(() => compileYuzhouJobStateMachineAttestation(forged, { expectedCheckpointRootSha256: trustedRoot }), "YUZHOU_JOB_STATE_MACHINE_TRUST_ROOT_MISMATCH");
});

test("decision, private payload, T0 bindings and artifact envelopes are independently recomputed", () => {
  const decisionDrift = buildCheckpoint();
  decisionDrift.decisionArtifact.decisions[0].observedRecordCount += 1;
  failure(() => compileYuzhouJobStateMachineAttestation(decisionDrift, { expectedCheckpointRootSha256: decisionDrift.checkpointRootSha256 }), "YUZHOU_JOB_STATE_MACHINE_ARTIFACT_BINDING_MISMATCH");

  const payloadDrift = buildCheckpoint();
  payloadDrift.privatePayload.items[0].sourceName = "Changed state";
  payloadDrift.bindings.privatePayloadArtifactSha256 = computeYuzhouJobStateCheckpointArtifactHash("private_payload", payloadDrift.privatePayload);
  payloadDrift.checkpointRootSha256 = computeYuzhouJobStateCheckpointRoot(payloadDrift);
  failure(() => compileYuzhouJobStateMachineAttestation(payloadDrift, { expectedCheckpointRootSha256: payloadDrift.checkpointRootSha256 }), "YUZHOU_JOB_STATE_MACHINE_PRIVATE_PAYLOAD_HASH_MISMATCH");

  const t0Drift = buildCheckpoint();
  t0Drift.t0Evidence.manifestSha256 = h("9");
  t0Drift.bindings.t0EvidenceArtifactSha256 = computeYuzhouJobStateCheckpointArtifactHash("t0_evidence", t0Drift.t0Evidence);
  t0Drift.checkpointRootSha256 = computeYuzhouJobStateCheckpointRoot(t0Drift);
  failure(() => compileYuzhouJobStateMachineAttestation(t0Drift, { expectedCheckpointRootSha256: t0Drift.checkpointRootSha256 }), "YUZHOU_JOB_STATE_MACHINE_T0_BINDING_DRIFT");
});

test("semantic drift and any human assertion fail closed even under a newly trusted root", () => {
  const semanticDrift = buildCheckpoint();
  semanticDrift.decisionArtifact.decisions[0].targetEmploymentStatus = "probation";
  reseal(semanticDrift);
  failure(() => compileYuzhouJobStateMachineAttestation(semanticDrift, { expectedCheckpointRootSha256: semanticDrift.checkpointRootSha256 }), "YUZHOU_JOB_STATE_MACHINE_TARGET_COVERAGE_INVALID");

  const humanClaim = buildCheckpoint();
  humanClaim.decisionArtifact.artifactStatus = "REVIEWED";
  humanClaim.decisionArtifact.review = { status: "REVIEWED", reviewerSubjectSha256: digest("person"), reviewedDecisionSha256: humanClaim.decisionArtifact.canonicalDecisionSha256, reviewedAt: "2026-08-29T00:00:00Z" };
  reseal(humanClaim);
  failure(() => compileYuzhouJobStateMachineAttestation(humanClaim, { expectedCheckpointRootSha256: humanClaim.checkpointRootSha256 }), "YUZHOU_JOB_STATE_MACHINE_HUMAN_ASSERTION_FORBIDDEN");
});

test("schema freezes PASS/HOLD and forbids machine impersonation", () => {
  const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.status.const, "PASS");
  assert.equal(schema.properties.humanSignature.const, false);
  assert.equal(schema.properties.humanIdentityAsserted.const, false);
  assert.equal(schema.properties.productionImport.const, "HOLD");
  assert.equal(schema.properties.semanticLedger.properties.sourceRecordCount.const, 2949);
  assert(schema.required.includes("integrityDigest"));
});

console.log("Yuzhou job-state preload machine attestation contract passed.");
