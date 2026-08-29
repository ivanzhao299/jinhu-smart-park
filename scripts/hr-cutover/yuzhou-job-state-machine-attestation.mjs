import { createHash } from "node:crypto";
import { canonicalHash as canonicalPrivatePayloadHash } from "./materialize-reviewed-job-state.mjs";
import {
  canonicalDecisionHash,
  verifyYuzhouJobStateDecisionArtifact
} from "./yuzhou-job-state-decision-artifact-lib.mjs";

const SHA256 = /^[0-9a-f]{64}$/u;
const CODE_SHA = /^[0-9a-f]{40}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const TARGET_STATUSES = ["active", "departed", "probation", "suspended"];
const QUARANTINE_REASONS = new Set([
  "AMBIGUOUS_SEMANTICS",
  "CONFLICTING_SOURCE_EVIDENCE",
  "UNKNOWN_SOURCE_VALUE"
]);
const SENSITIVE = /(?:\/Users\/|[A-Za-z]:[\\/]|file:\/\/|(?:password|passwd|token|secret|credential)\s*[:=]|BEGIN [A-Z ]*PRIVATE KEY|\b(?:10|127|169\.254|172\.(?:1[6-9]|2\d|3[01])|192\.168)\.\d{1,3}\.\d{1,3}\b)/iu;

export class YuzhouJobStateMachineAttestationError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "YuzhouJobStateMachineAttestationError";
    this.code = code;
  }
}

const fail = (code, detail) => {
  throw new YuzhouJobStateMachineAttestationError(code, detail);
};
const plainObject = value => value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const exactKeys = (value, keys, code) => {
  if (!plainObject(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) fail(code, "unexpected object shape");
};
const requireSha = (value, code, detail) => {
  if (typeof value !== "string" || !SHA256.test(value)) fail(code, detail);
};
const sha = value => createHash("sha256").update(value).digest("hex");
const canonicalize = value => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (plainObject(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]));
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  fail("YUZHOU_JOB_STATE_MACHINE_JSON_INVALID", "plain JSON and safe integers are required");
};
export const canonicalYuzhouJobStateMachineJson = value => JSON.stringify(canonicalize(value));
export const computeYuzhouJobStateCheckpointArtifactHash = (kind, payload) => sha(`yuzhou-job-state-preload-artifact-v1\0${kind}\0${canonicalYuzhouJobStateMachineJson(payload)}`);
export const computeYuzhouJobStateCheckpointRoot = checkpoint => sha(`yuzhou-job-state-preload-checkpoint-v1\0${canonicalYuzhouJobStateMachineJson({
  triple: checkpoint.triple,
  bindings: checkpoint.bindings
})}`);
export const computeYuzhouJobStateAttestationIntegrity = attestation => {
  const { integrityDigest: _integrityDigest, ...body } = attestation;
  return sha(`yuzhou-job-state-machine-attestation-v1\0${canonicalYuzhouJobStateMachineJson(body)}`);
};

function verifyTriple(triple) {
  exactKeys(triple, ["codeSha", "sourceSnapshotHash", "mappingContractHash"], "YUZHOU_JOB_STATE_MACHINE_TRIPLE_INVALID");
  if (!CODE_SHA.test(triple.codeSha ?? "") || !SHA256.test(triple.sourceSnapshotHash ?? "") || !SHA256.test(triple.mappingContractHash ?? "")) fail("YUZHOU_JOB_STATE_MACHINE_TRIPLE_INVALID", "C/S/M must be fixed hashes");
}

function verifyDecision(decision) {
  const result = verifyYuzhouJobStateDecisionArtifact(decision);
  if (result.status !== "DRAFT" || decision.review.status !== "DRAFT" || decision.review.reviewerSubjectSha256 !== null || decision.detachedHrApproval.status !== "HOLD" || decision.detachedHrApproval.attestationSha256 !== null) {
    fail("YUZHOU_JOB_STATE_MACHINE_HUMAN_ASSERTION_FORBIDDEN", "machine semantics cannot consume or assert a human review or approval");
  }
  if (result.observedRecordCount !== 2949 || result.mapped !== 4 || result.quarantined !== 3) fail("YUZHOU_JOB_STATE_MACHINE_DECISION_LEDGER_INVALID", "expected 2949 records split across four mappings and three quarantines");
  const mapped = decision.decisions.filter(row => row.decision === "map").map(row => row.targetEmploymentStatus).sort();
  if (JSON.stringify(mapped) !== JSON.stringify(TARGET_STATUSES)) fail("YUZHOU_JOB_STATE_MACHINE_TARGET_COVERAGE_INVALID", "each deterministic employment status must occur exactly once");
  const reasons = decision.decisions.filter(row => row.decision === "quarantine").map(row => row.reasonCode);
  if (reasons.length !== QUARANTINE_REASONS.size || new Set(reasons).size !== reasons.length || reasons.some(reason => !QUARANTINE_REASONS.has(reason))) fail("YUZHOU_JOB_STATE_MACHINE_QUARANTINE_COVERAGE_INVALID", "all three stable ambiguity reasons are required");
  const recomputed = canonicalDecisionHash(decision);
  if (recomputed !== decision.canonicalDecisionSha256) fail("YUZHOU_JOB_STATE_MACHINE_DECISION_HASH_MISMATCH", "canonical decision drift");
  return { result, recomputed };
}

function verifyPrivatePayload(payload, decision, triple) {
  exactKeys(payload, ["formatVersion", "kind", "canonicalDecisionSha256", "payloadSha256", "dictionaryVersionId", "expectedDatabaseItemsSha256", "csm", "t0Binding", "scope", "dictionaryEvidenceSha256", "decisionSubject", "approvalSubject", "items"], "YUZHOU_JOB_STATE_MACHINE_PRIVATE_PAYLOAD_INVALID");
  if (payload.formatVersion !== 1 || payload.kind !== "yuzhou-job-state-private-materialization" || payload.canonicalDecisionSha256 !== decision.canonicalDecisionSha256) fail("YUZHOU_JOB_STATE_MACHINE_PRIVATE_PAYLOAD_INVALID", "payload identity or decision binding");
  const { payloadSha256: _payloadSha256, ...body } = payload;
  const recomputed = canonicalPrivatePayloadHash(body);
  if (recomputed !== payload.payloadSha256) fail("YUZHOU_JOB_STATE_MACHINE_PRIVATE_PAYLOAD_HASH_MISMATCH", "private payload drift");
  verifyTriple(payload.csm);
  if (canonicalYuzhouJobStateMachineJson(payload.csm) !== canonicalYuzhouJobStateMachineJson(triple)) fail("YUZHOU_JOB_STATE_MACHINE_PRIVATE_PAYLOAD_BINDING_INVALID", "C/S/M differs from checkpoint");
  exactKeys(payload.t0Binding, ["manifestSha256", "employeeJobStatesSha256", "jobStateCodeMetadataSha256", "jobStateCodesSha256"], "YUZHOU_JOB_STATE_MACHINE_T0_BINDING_INVALID");
  Object.entries(payload.t0Binding).forEach(([key, value]) => requireSha(value, "YUZHOU_JOB_STATE_MACHINE_T0_BINDING_INVALID", key));
  requireSha(payload.dictionaryEvidenceSha256, "YUZHOU_JOB_STATE_MACHINE_DICTIONARY_EVIDENCE_INVALID", "dictionary evidence");
  requireSha(payload.expectedDatabaseItemsSha256, "YUZHOU_JOB_STATE_MACHINE_DATABASE_ITEMS_HASH_INVALID", "expected database items");
  if (payload.dictionaryEvidenceSha256 !== decision.sourceContract.sourceSnapshotSha256) fail("YUZHOU_JOB_STATE_MACHINE_DICTIONARY_EVIDENCE_INVALID", "dictionary evidence differs from decision source");
  if (!UUID.test(payload.dictionaryVersionId ?? "") || !UUID.test(payload.decisionSubject ?? "") || !UUID.test(payload.approvalSubject ?? "") || payload.decisionSubject === payload.approvalSubject) fail("YUZHOU_JOB_STATE_MACHINE_SUBJECT_BINDING_INVALID", "distinct machine subjects must use UUID identities");
  exactKeys(payload.scope, ["tenantId", "parkId", "tenantIdentitySha256", "parkIdentitySha256"], "YUZHOU_JOB_STATE_MACHINE_SCOPE_INVALID");
  if (payload.scope.tenantId !== "10000001" || payload.scope.parkId !== "20000001" || payload.scope.tenantIdentitySha256 !== decision.scopeBinding.tenantIdentitySha256 || payload.scope.parkIdentitySha256 !== decision.scopeBinding.parkIdentitySha256) fail("YUZHOU_JOB_STATE_MACHINE_SCOPE_INVALID", "scope binding drift");
  if (!Array.isArray(payload.items) || payload.items.length !== 7) fail("YUZHOU_JOB_STATE_MACHINE_ITEM_COVERAGE_INVALID", "seven source states required");
  const decisions = new Map(decision.decisions.map(row => [row.sourceIdentitySha256, row]));
  const ids = new Set(), identities = new Set();
  for (const item of payload.items) {
    exactKeys(item, ["id", "sourceCode", "sourceName", "sourceValue", "sourceIdentitySha256", "sourceRowSha256"], "YUZHOU_JOB_STATE_MACHINE_ITEM_INVALID");
    if (!UUID.test(item.id ?? "") || ids.has(item.id) || identities.has(item.sourceIdentitySha256) || typeof item.sourceCode !== "string" || !item.sourceCode.trim() || typeof item.sourceName !== "string" || !item.sourceName.trim() || item.sourceValue !== null) fail("YUZHOU_JOB_STATE_MACHINE_ITEM_INVALID", "invalid or duplicate source item");
    const governed = decisions.get(item.sourceIdentitySha256);
    if (!governed || governed.sourceRowSha256 !== item.sourceRowSha256) fail("YUZHOU_JOB_STATE_MACHINE_ITEM_DECISION_DRIFT", "source item is not bound to its decision");
    ids.add(item.id); identities.add(item.sourceIdentitySha256);
  }
  return { recomputed, t0BindingSha256: canonicalPrivatePayloadHash(payload.t0Binding) };
}

function verifyT0Evidence(t0Evidence, payload, decision) {
  exactKeys(t0Evidence, ["manifestSha256", "employeeJobStatesSha256", "jobStateCodeMetadataSha256", "jobStateCodesSha256", "dictionaryEvidenceSha256", "sourceDistinctStateCount", "sourceRecordCount"], "YUZHOU_JOB_STATE_MACHINE_T0_EVIDENCE_INVALID");
  for (const key of ["manifestSha256", "employeeJobStatesSha256", "jobStateCodeMetadataSha256", "jobStateCodesSha256", "dictionaryEvidenceSha256"]) requireSha(t0Evidence[key], "YUZHOU_JOB_STATE_MACHINE_T0_EVIDENCE_INVALID", key);
  if (t0Evidence.sourceDistinctStateCount !== 7 || t0Evidence.sourceRecordCount !== 2949 || t0Evidence.dictionaryEvidenceSha256 !== decision.sourceContract.sourceSnapshotSha256) fail("YUZHOU_JOB_STATE_MACHINE_T0_EVIDENCE_INVALID", "source ledger or dictionary evidence drift");
  for (const key of ["manifestSha256", "employeeJobStatesSha256", "jobStateCodeMetadataSha256", "jobStateCodesSha256"]) if (t0Evidence[key] !== payload.t0Binding[key]) fail("YUZHOU_JOB_STATE_MACHINE_T0_BINDING_DRIFT", key);
}

export function compileYuzhouJobStateMachineAttestation(checkpoint, { expectedCheckpointRootSha256 } = {}) {
  requireSha(expectedCheckpointRootSha256, "YUZHOU_JOB_STATE_MACHINE_TRUST_ROOT_REQUIRED", "external expectedCheckpointRootSha256 is required");
  exactKeys(checkpoint, ["formatVersion", "kind", "triple", "decisionArtifact", "privatePayload", "t0Evidence", "bindings", "checkpointRootSha256"], "YUZHOU_JOB_STATE_MACHINE_CHECKPOINT_INVALID");
  if (checkpoint.formatVersion !== 1 || checkpoint.kind !== "yuzhou-job-state-preload-checkpoint") fail("YUZHOU_JOB_STATE_MACHINE_CHECKPOINT_INVALID", "checkpoint identity");
  if (SENSITIVE.test(JSON.stringify(checkpoint))) fail("YUZHOU_JOB_STATE_MACHINE_SENSITIVE_CONTENT", "paths, private network identifiers and credentials are forbidden");
  verifyTriple(checkpoint.triple);
  exactKeys(checkpoint.bindings, ["decisionArtifactSha256", "privatePayloadArtifactSha256", "t0EvidenceArtifactSha256"], "YUZHOU_JOB_STATE_MACHINE_BINDINGS_INVALID");
  const expectedBindings = {
    decisionArtifactSha256: computeYuzhouJobStateCheckpointArtifactHash("decision_artifact", checkpoint.decisionArtifact),
    privatePayloadArtifactSha256: computeYuzhouJobStateCheckpointArtifactHash("private_payload", checkpoint.privatePayload),
    t0EvidenceArtifactSha256: computeYuzhouJobStateCheckpointArtifactHash("t0_evidence", checkpoint.t0Evidence)
  };
  if (canonicalYuzhouJobStateMachineJson(checkpoint.bindings) !== canonicalYuzhouJobStateMachineJson(expectedBindings)) fail("YUZHOU_JOB_STATE_MACHINE_ARTIFACT_BINDING_MISMATCH", "checkpoint artifacts differ from their bindings");
  const checkpointRootSha256 = computeYuzhouJobStateCheckpointRoot(checkpoint);
  if (checkpoint.checkpointRootSha256 !== checkpointRootSha256) fail("YUZHOU_JOB_STATE_MACHINE_CHECKPOINT_ROOT_MISMATCH", "declared checkpoint root drift");
  if (expectedCheckpointRootSha256 !== checkpointRootSha256) fail("YUZHOU_JOB_STATE_MACHINE_TRUST_ROOT_MISMATCH", "checkpoint root is not externally trusted");
  const decision = verifyDecision(checkpoint.decisionArtifact);
  const payload = verifyPrivatePayload(checkpoint.privatePayload, checkpoint.decisionArtifact, checkpoint.triple);
  verifyT0Evidence(checkpoint.t0Evidence, checkpoint.privatePayload, checkpoint.decisionArtifact);
  const attestation = {
    formatVersion: 1,
    artifactKind: "yuzhou_job_state_machine_attestation",
    attestationVersion: "v1",
    status: "PASS",
    reasonCodes: [],
    triple: checkpoint.triple,
    expectedCheckpointRootSha256,
    checkpointRootSha256,
    decisionArtifactSha256: checkpoint.bindings.decisionArtifactSha256,
    canonicalDecisionSha256: decision.recomputed,
    privatePayloadArtifactSha256: checkpoint.bindings.privatePayloadArtifactSha256,
    privatePayloadSha256: payload.recomputed,
    t0EvidenceArtifactSha256: checkpoint.bindings.t0EvidenceArtifactSha256,
    t0BindingSha256: payload.t0BindingSha256,
    semanticLedger: {
      sourceDistinctStateCount: 7,
      sourceRecordCount: 2949,
      mappedStateCount: 4,
      quarantinedStateCount: 3,
      mappedRecordCount: decision.result.observedRecordCount - checkpoint.decisionArtifact.decisions.filter(row => row.decision === "quarantine").reduce((sum, row) => sum + row.observedRecordCount, 0),
      quarantinedRecordCount: checkpoint.decisionArtifact.decisions.filter(row => row.decision === "quarantine").reduce((sum, row) => sum + row.observedRecordCount, 0)
    },
    assertionMode: "trusted_checkpoint_deterministic_machine_semantics",
    humanSignature: false,
    humanIdentityAsserted: false,
    productionImport: "HOLD"
  };
  return {
    ...attestation,
    integrityDigest: computeYuzhouJobStateAttestationIntegrity(attestation)
  };
}

export function verifyYuzhouJobStateMachineAttestation(attestation, { expectedCheckpointRootSha256 } = {}) {
  requireSha(expectedCheckpointRootSha256, "YUZHOU_JOB_STATE_MACHINE_TRUST_ROOT_REQUIRED", "external expectedCheckpointRootSha256 is required");
  exactKeys(attestation, [
    "formatVersion", "artifactKind", "attestationVersion", "status", "reasonCodes", "triple",
    "expectedCheckpointRootSha256", "checkpointRootSha256", "decisionArtifactSha256", "canonicalDecisionSha256",
    "privatePayloadArtifactSha256", "privatePayloadSha256", "t0EvidenceArtifactSha256", "t0BindingSha256",
    "semanticLedger", "assertionMode", "humanSignature", "humanIdentityAsserted", "productionImport", "integrityDigest"
  ], "YUZHOU_JOB_STATE_MACHINE_ATTESTATION_INVALID");
  verifyTriple(attestation.triple);
  if (attestation.formatVersion !== 1 || attestation.artifactKind !== "yuzhou_job_state_machine_attestation" || attestation.attestationVersion !== "v1" || attestation.status !== "PASS" || !Array.isArray(attestation.reasonCodes) || attestation.reasonCodes.length !== 0 || attestation.assertionMode !== "trusted_checkpoint_deterministic_machine_semantics" || attestation.humanSignature !== false || attestation.humanIdentityAsserted !== false || attestation.productionImport !== "HOLD") fail("YUZHOU_JOB_STATE_MACHINE_ATTESTATION_INVALID", "fixed assertion fields differ");
  for (const key of ["expectedCheckpointRootSha256", "checkpointRootSha256", "decisionArtifactSha256", "canonicalDecisionSha256", "privatePayloadArtifactSha256", "privatePayloadSha256", "t0EvidenceArtifactSha256", "t0BindingSha256", "integrityDigest"]) requireSha(attestation[key], "YUZHOU_JOB_STATE_MACHINE_ATTESTATION_INVALID", key);
  if (attestation.expectedCheckpointRootSha256 !== expectedCheckpointRootSha256 || attestation.checkpointRootSha256 !== expectedCheckpointRootSha256) fail("YUZHOU_JOB_STATE_MACHINE_TRUST_ROOT_MISMATCH", "attestation does not bind the externally trusted checkpoint");
  exactKeys(attestation.semanticLedger, ["sourceDistinctStateCount", "sourceRecordCount", "mappedStateCount", "quarantinedStateCount", "mappedRecordCount", "quarantinedRecordCount"], "YUZHOU_JOB_STATE_MACHINE_ATTESTATION_INVALID");
  const ledger = attestation.semanticLedger;
  if (ledger.sourceDistinctStateCount !== 7 || ledger.sourceRecordCount !== 2949 || ledger.mappedStateCount !== 4 || ledger.quarantinedStateCount !== 3 || !Number.isSafeInteger(ledger.mappedRecordCount) || !Number.isSafeInteger(ledger.quarantinedRecordCount) || ledger.mappedRecordCount < 4 || ledger.quarantinedRecordCount < 3 || ledger.mappedRecordCount + ledger.quarantinedRecordCount !== ledger.sourceRecordCount) fail("YUZHOU_JOB_STATE_MACHINE_ATTESTATION_LEDGER_INVALID", "semantic ledger does not conserve source records");
  if (computeYuzhouJobStateAttestationIntegrity(attestation) !== attestation.integrityDigest) fail("YUZHOU_JOB_STATE_MACHINE_INTEGRITY_MISMATCH", "attestation integrity drift");
  return { status: "PASS", productionImport: "HOLD", checkpointRootSha256: expectedCheckpointRootSha256, integrityDigest: attestation.integrityDigest };
}
