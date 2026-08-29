#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { canonicalDecisionHash, canonicalEvidenceIndexHash, verifyYuzhouJobStateDecisionArtifact } from "../hr-cutover/yuzhou-job-state-decision-artifact-lib.mjs";

const root = resolve(import.meta.dirname, "../..");
const load = path => JSON.parse(readFileSync(path, "utf8"));
const clone = value => structuredClone(value);
const h = char => char.repeat(64);
const legacy = () => load(resolve(root, "scripts/hr-cutover/fixtures/yuzhou-job-state-decision-artifact/valid-draft-v1.json"));
const machine = () => {
  const source = legacy();
  const evidenceIndex = { checkpointSha256: h("1"), manifestSha256: h("2"), extractBindingSha256: h("3"), journalSha256: h("4"), employeeJobStatesSha256: h("5"), jobStateCodeMetadataSha256: h("6"), jobStateCodesSha256: h("7") };
  const decisions = source.decisions.map((row, index) => ({ ...row, reasonCode: index < 4 ? "DETERMINISTIC_MAPPING" : row.reasonCode, semanticClassification: index < 4 ? "derived_deterministic" : "quarantined_ambiguous" }));
  const mapped = decisions.filter(row => row.decision === "map"), quarantined = decisions.filter(row => row.decision === "quarantine");
  const artifact = {
    formatVersion: 2, artifactKind: "yuzhou_employee_job_state_machine_decision", artifactVersion: "v2", artifactStatus: "MACHINE_CANDIDATE",
    triple: { codeSha: "a".repeat(40), sourceSnapshotHash: h("b"), mappingContractHash: h("c") },
    expectedCheckpointRootSha256: h("1"), checkpointRootSha256: h("1"), evidenceIndex, evidenceIndexSha256: canonicalEvidenceIndexHash(evidenceIndex),
    scopeBinding: source.scopeBinding, sourceContract: source.sourceContract, decisions,
    semanticLedger: { sourceDistinctStateCount: 7, sourceRecordCount: 100, mappedStateCount: 4, quarantinedStateCount: 3, mappedRecordCount: mapped.reduce((sum, row) => sum + row.observedRecordCount, 0), quarantinedRecordCount: quarantined.reduce((sum, row) => sum + row.observedRecordCount, 0), conservationVerified: true },
    canonicalDecisionSha256: "",
    machineAssertion: { mode: "trusted_root_deterministic_machine_semantics", policyVersion: "yuzhou-job-state-machine-policy-v2", status: "PASS", reasonCodes: [], humanSignature: false, humanIdentityAsserted: false },
    productionImport: "HOLD"
  };
  artifact.canonicalDecisionSha256 = canonicalDecisionHash(artifact);
  return artifact;
};
const rejects = (artifact, code) => assert.throws(() => verifyYuzhouJobStateDecisionArtifact(artifact), error => error?.code === code);

test("v2 is a trusted-root machine candidate without reviewer, approver or human signature", () => {
  const artifact = machine(), result = verifyYuzhouJobStateDecisionArtifact(artifact);
  assert.equal(result.status, "MACHINE_CANDIDATE");
  assert.equal(result.machineAssertion, "PASS");
  assert.equal(result.materializationEligibility, "MACHINE_CANDIDATE");
  assert.equal(result.productionImport, "HOLD");
  assert.equal(result.mappedRecordCount + result.quarantinedRecordCount, 100);
  assert.doesNotMatch(JSON.stringify(artifact), /reviewer|approver|approvalSubject|reviewedAt/u);
  assert.equal(artifact.machineAssertion.humanSignature, false);
  assert.equal(artifact.machineAssertion.humanIdentityAsserted, false);
});

test("trusted root, evidence index, machine policy and canonical bytes fail closed", () => {
  const cases = [
    [value => { value.expectedCheckpointRootSha256 = h("9"); }, "YUZHOU_JOB_STATE_TRUSTED_ROOT_MISMATCH"],
    [value => { value.evidenceIndex.manifestSha256 = h("9"); }, "YUZHOU_JOB_STATE_EVIDENCE_INDEX_MISMATCH"],
    [value => { value.machineAssertion.humanSignature = true; }, "YUZHOU_JOB_STATE_CANONICAL_HASH_MISMATCH"],
    [value => { value.decisions[0].targetEmploymentStatus = "probation"; }, "YUZHOU_JOB_STATE_CANONICAL_HASH_MISMATCH"],
    [value => { value.productionImport = "GO"; }, "YUZHOU_JOB_STATE_PRODUCTION_IMPORT_NOT_HELD"]
  ];
  for (const [mutate, code] of cases) { const value = machine(); mutate(value); rejects(value, code); }
});

test("machine semantics enforce deterministic mappings, explicit quarantine and conservation", () => {
  for (const [mutate, code, rehash] of [
    [value => { value.decisions[0].reasonCode = "APPROVED_MAPPING"; }, "YUZHOU_JOB_STATE_MAP_TARGET_INVALID"],
    [value => { value.decisions[0].semanticClassification = "quarantined_ambiguous"; }, "YUZHOU_JOB_STATE_MAP_TARGET_INVALID"],
    [value => { value.decisions[4].semanticClassification = "derived_deterministic"; }, "YUZHOU_JOB_STATE_QUARANTINE_INVALID"],
    [value => { value.semanticLedger.mappedRecordCount += 1; }, "YUZHOU_JOB_STATE_SEMANTIC_LEDGER_MISMATCH", true]
  ]) { const value = machine(); mutate(value); if (rehash) value.canonicalDecisionSha256 = canonicalDecisionHash(value); rejects(value, code); }
});

test("legacy v1 remains verifiable only as read-only audit compatibility", () => {
  const result = verifyYuzhouJobStateDecisionArtifact(legacy());
  assert.equal(result.legacyReadOnlyAudit, true);
  assert.equal(result.materializationEligibility, "HOLD_LEGACY_V1_AUDIT_ONLY");
  assert.equal(result.productionImport, "HOLD");
});

test("schemas freeze v2 machine issue and mark human-era artifacts legacy only", () => {
  const schema = load(resolve(root, "scripts/hr-cutover/contracts/yuzhou-job-state-decision-artifact.schema.json"));
  const legacySchema = load(resolve(root, "scripts/hr-cutover/contracts/yuzhou-job-state-decision-artifact-legacy-v1.schema.json"));
  const detached = load(resolve(root, "scripts/hr-cutover/contracts/yuzhou-job-state-detached-approval.schema.json"));
  assert.equal(schema.properties.formatVersion.const, 2);
  assert.equal(schema.properties.artifactStatus.const, "MACHINE_CANDIDATE");
  assert.equal(schema.properties.machineAssertion.properties.humanSignature.const, false);
  assert.equal(schema.properties.productionImport.const, "HOLD");
  assert.match(legacySchema.$comment, /READ-ONLY AUDIT COMPATIBILITY ONLY/u);
  assert.match(detached.$comment, /LEGACY V1 READ-ONLY AUDIT ARTIFACT/u);
});
