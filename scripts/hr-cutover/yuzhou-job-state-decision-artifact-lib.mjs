import { createHash } from "node:crypto";

export class YuzhouJobStateDecisionArtifactError extends Error {
  constructor(code, detail) { super(`${code}: ${detail}`); this.name = "YuzhouJobStateDecisionArtifactError"; this.code = code; }
}

const fail = (code, detail) => { throw new YuzhouJobStateDecisionArtifactError(code, detail); };
const SHA256 = /^[0-9a-f]{64}$/u;
const CODE_SHA = /^[0-9a-f]{40}$/u;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/u;
const TARGET_STATUSES = new Set(["active", "probation", "suspended", "departed"]);
const QUARANTINE_REASONS = new Set(["AMBIGUOUS_SEMANTICS", "UNKNOWN_SOURCE_VALUE", "CONFLICTING_SOURCE_EVIDENCE", "UNSUPPORTED_SEMANTICS"]);
const MAP_CLASSES = new Set(["source_exact", "target_exact", "derived_deterministic"]);
const QUARANTINE_CLASSES = new Set(["quarantined_ambiguous", "unsupported"]);
const SENSITIVE_CONTENT = /(?:\/Users\/|[A-Za-z]:[\\/]|file:\/\/|(?:password|passwd|token|secret|credential)\s*[:=]|BEGIN [A-Z ]*PRIVATE KEY|\b(?:10|127|169\.254|172\.(?:1[6-9]|2\d|3[01])|192\.168)\.\d{1,3}\.\d{1,3}\b)/iu;
const plain = value => value !== null && typeof value === "object" && !Array.isArray(value);
const canonicalize = value => Array.isArray(value) ? value.map(canonicalize) : plain(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])])) : value;
const hash = value => createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(canonicalize(value))).digest("hex");
const exact = (value, keys, code) => {
  if (!plain(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) fail(code, "shape");
};
const requireSha = (value, code, detail) => { if (typeof value !== "string" || !SHA256.test(value)) fail(code, detail); };

export const canonicalEvidenceIndexHash = evidenceIndex => hash(evidenceIndex);

export const canonicalDecisionPayload = artifact => artifact.formatVersion === 2 ? ({
  formatVersion: artifact.formatVersion,
  artifactKind: artifact.artifactKind,
  artifactVersion: artifact.artifactVersion,
  artifactStatus: artifact.artifactStatus,
  triple: artifact.triple,
  expectedCheckpointRootSha256: artifact.expectedCheckpointRootSha256,
  checkpointRootSha256: artifact.checkpointRootSha256,
  evidenceIndex: artifact.evidenceIndex,
  evidenceIndexSha256: artifact.evidenceIndexSha256,
  scopeBinding: artifact.scopeBinding,
  sourceContract: artifact.sourceContract,
  decisions: [...artifact.decisions].sort((a, b) => a.sourceIdentitySha256.localeCompare(b.sourceIdentitySha256)),
  semanticLedger: artifact.semanticLedger,
  machineAssertion: artifact.machineAssertion,
  productionImport: artifact.productionImport
}) : ({
  formatVersion: artifact.formatVersion,
  artifactKind: artifact.artifactKind,
  artifactVersion: artifact.artifactVersion,
  scopeBinding: artifact.scopeBinding,
  sourceContract: artifact.sourceContract,
  decisions: [...artifact.decisions].sort((a, b) => a.sourceIdentitySha256.localeCompare(b.sourceIdentitySha256))
});

export const canonicalDecisionHash = artifact => hash(canonicalDecisionPayload(artifact));

function verifyCommon(artifact, machine) {
  if (artifact.productionImport !== "HOLD") fail("YUZHOU_JOB_STATE_PRODUCTION_IMPORT_NOT_HELD", String(artifact.productionImport));
  exact(artifact.scopeBinding, ["tenantIdentitySha256", "parkIdentitySha256"], "YUZHOU_JOB_STATE_SCOPE_SHAPE_INVALID");
  requireSha(artifact.scopeBinding.tenantIdentitySha256, "YUZHOU_JOB_STATE_SCOPE_HASH_INVALID", "tenant");
  requireSha(artifact.scopeBinding.parkIdentitySha256, "YUZHOU_JOB_STATE_SCOPE_HASH_INVALID", "park");
  if (artifact.scopeBinding.tenantIdentitySha256 === artifact.scopeBinding.parkIdentitySha256) fail("YUZHOU_JOB_STATE_SCOPE_HASH_COLLISION", "scope");
  exact(artifact.sourceContract, ["sourceSystem", "dictionaryCode", "sourceSnapshotSha256", "sourceDistinctStateCount", "sourceRecordCount"], "YUZHOU_JOB_STATE_SOURCE_SHAPE_INVALID");
  if (artifact.sourceContract.sourceSystem !== "yuzhou-v10" || artifact.sourceContract.dictionaryCode !== "employee_job_state") fail("YUZHOU_JOB_STATE_SOURCE_IDENTITY_INVALID", "source");
  requireSha(artifact.sourceContract.sourceSnapshotSha256, "YUZHOU_JOB_STATE_SOURCE_HASH_INVALID", "snapshot");
  if (artifact.sourceContract.sourceDistinctStateCount !== 7 || !Number.isSafeInteger(artifact.sourceContract.sourceRecordCount) || artifact.sourceContract.sourceRecordCount < 7) fail("YUZHOU_JOB_STATE_SOURCE_COUNT_INVALID", "counts");
  if (!Array.isArray(artifact.decisions) || artifact.decisions.length !== 7) fail("YUZHOU_JOB_STATE_DECISION_COUNT_INVALID", "seven required");
  const identities = new Set(), rows = new Set(); let mapped = 0, quarantined = 0, mappedRecords = 0, quarantinedRecords = 0;
  for (const [index, decision] of artifact.decisions.entries()) {
    exact(decision, machine ? ["sourceIdentitySha256", "sourceRowSha256", "observedRecordCount", "decision", "targetEmploymentStatus", "semanticClassification", "reasonCode"] : ["sourceIdentitySha256", "sourceRowSha256", "observedRecordCount", "decision", "targetEmploymentStatus", "reasonCode"], "YUZHOU_JOB_STATE_DECISION_SHAPE_INVALID");
    requireSha(decision.sourceIdentitySha256, "YUZHOU_JOB_STATE_DECISION_HASH_INVALID", `${index}:identity`);
    requireSha(decision.sourceRowSha256, "YUZHOU_JOB_STATE_DECISION_HASH_INVALID", `${index}:row`);
    if (identities.has(decision.sourceIdentitySha256) || rows.has(decision.sourceRowSha256)) fail("YUZHOU_JOB_STATE_DECISION_DUPLICATE", String(index));
    identities.add(decision.sourceIdentitySha256); rows.add(decision.sourceRowSha256);
    if (!Number.isSafeInteger(decision.observedRecordCount) || decision.observedRecordCount < 1) fail("YUZHOU_JOB_STATE_DECISION_SOURCE_COUNT_INVALID", String(index));
    if (decision.decision === "map") {
      const reason = machine ? "DETERMINISTIC_MAPPING" : "APPROVED_MAPPING";
      if (!TARGET_STATUSES.has(decision.targetEmploymentStatus) || decision.reasonCode !== reason || (machine && !MAP_CLASSES.has(decision.semanticClassification))) fail("YUZHOU_JOB_STATE_MAP_TARGET_INVALID", String(index));
      mapped += 1; mappedRecords += decision.observedRecordCount;
    } else if (decision.decision === "quarantine") {
      if (decision.targetEmploymentStatus !== null || !QUARANTINE_REASONS.has(decision.reasonCode) || (machine && !QUARANTINE_CLASSES.has(decision.semanticClassification))) fail("YUZHOU_JOB_STATE_QUARANTINE_INVALID", String(index));
      quarantined += 1; quarantinedRecords += decision.observedRecordCount;
    } else fail("YUZHOU_JOB_STATE_DECISION_INVALID", String(index));
  }
  const total = mappedRecords + quarantinedRecords;
  if (total !== artifact.sourceContract.sourceRecordCount) fail("YUZHOU_JOB_STATE_SOURCE_LEDGER_MISMATCH", `${total}`);
  if (JSON.stringify(artifact.decisions.map(row => row.sourceIdentitySha256)) !== JSON.stringify([...identities].sort())) fail("YUZHOU_JOB_STATE_DECISION_ORDER_INVALID", "order");
  requireSha(artifact.canonicalDecisionSha256, "YUZHOU_JOB_STATE_CANONICAL_HASH_INVALID", "decision");
  const canonical = canonicalDecisionHash(artifact);
  if (artifact.canonicalDecisionSha256 !== canonical) fail("YUZHOU_JOB_STATE_CANONICAL_HASH_MISMATCH", canonical);
  return { canonical, mapped, quarantined, mappedRecords, quarantinedRecords, total };
}

function verifyLegacyV1(artifact) {
  exact(artifact, ["formatVersion", "artifactKind", "artifactVersion", "artifactStatus", "scopeBinding", "sourceContract", "decisions", "canonicalDecisionSha256", "review", "detachedHrApproval", "productionImport"], "YUZHOU_JOB_STATE_ARTIFACT_SHAPE_INVALID");
  if (artifact.artifactKind !== "yuzhou_employee_job_state_reviewed_decision" || artifact.artifactVersion !== "v1" || !new Set(["DRAFT", "REVIEWED"]).has(artifact.artifactStatus)) fail("YUZHOU_JOB_STATE_ARTIFACT_IDENTITY_INVALID", "legacy identity");
  const stats = verifyCommon(artifact, false);
  exact(artifact.review, ["status", "reviewerSubjectSha256", "reviewedDecisionSha256", "reviewedAt"], "YUZHOU_JOB_STATE_REVIEW_SHAPE_INVALID");
  if (artifact.artifactStatus === "DRAFT") {
    if (artifact.review.status !== "DRAFT" || artifact.review.reviewerSubjectSha256 !== null || artifact.review.reviewedDecisionSha256 !== null || artifact.review.reviewedAt !== null) fail("YUZHOU_JOB_STATE_DRAFT_REVIEW_INVALID", "legacy draft");
  } else {
    requireSha(artifact.review.reviewerSubjectSha256, "YUZHOU_JOB_STATE_REVIEWER_HASH_INVALID", "legacy reviewer");
    if (artifact.review.status !== "REVIEWED" || artifact.review.reviewedDecisionSha256 !== stats.canonical || typeof artifact.review.reviewedAt !== "string" || !UTC.test(artifact.review.reviewedAt) || Number.isNaN(Date.parse(artifact.review.reviewedAt))) fail("YUZHOU_JOB_STATE_REVIEW_BINDING_INVALID", "legacy review");
  }
  exact(artifact.detachedHrApproval, ["required", "status", "attestationSha256"], "YUZHOU_JOB_STATE_HR_APPROVAL_SHAPE_INVALID");
  if (artifact.detachedHrApproval.required !== true || artifact.detachedHrApproval.status !== "HOLD" || artifact.detachedHrApproval.attestationSha256 !== null) fail("YUZHOU_JOB_STATE_HR_APPROVAL_MUST_BE_DETACHED", "legacy detached approval");
  return { status: artifact.artifactStatus, canonicalDecisionSha256: stats.canonical, distinctStates: 7, observedRecordCount: stats.total, mapped: stats.mapped, quarantined: stats.quarantined, review: artifact.review.status, detachedHrApproval: "HOLD", legacyReadOnlyAudit: true, materializationEligibility: "HOLD_LEGACY_V1_AUDIT_ONLY", productionImport: "HOLD" };
}

function verifyMachineV2(artifact) {
  exact(artifact, ["formatVersion", "artifactKind", "artifactVersion", "artifactStatus", "triple", "expectedCheckpointRootSha256", "checkpointRootSha256", "evidenceIndex", "evidenceIndexSha256", "scopeBinding", "sourceContract", "decisions", "semanticLedger", "canonicalDecisionSha256", "machineAssertion", "productionImport"], "YUZHOU_JOB_STATE_ARTIFACT_SHAPE_INVALID");
  if (artifact.artifactKind !== "yuzhou_employee_job_state_machine_decision" || artifact.artifactVersion !== "v2" || artifact.artifactStatus !== "MACHINE_CANDIDATE") fail("YUZHOU_JOB_STATE_ARTIFACT_IDENTITY_INVALID", "machine identity");
  exact(artifact.triple, ["codeSha", "sourceSnapshotHash", "mappingContractHash"], "YUZHOU_JOB_STATE_TRIPLE_INVALID");
  if (!CODE_SHA.test(artifact.triple.codeSha ?? "")) fail("YUZHOU_JOB_STATE_TRIPLE_INVALID", "code");
  requireSha(artifact.triple.sourceSnapshotHash, "YUZHOU_JOB_STATE_TRIPLE_INVALID", "source"); requireSha(artifact.triple.mappingContractHash, "YUZHOU_JOB_STATE_TRIPLE_INVALID", "mapping");
  requireSha(artifact.expectedCheckpointRootSha256, "YUZHOU_JOB_STATE_TRUSTED_ROOT_INVALID", "expected"); requireSha(artifact.checkpointRootSha256, "YUZHOU_JOB_STATE_TRUSTED_ROOT_INVALID", "actual");
  if (artifact.expectedCheckpointRootSha256 !== artifact.checkpointRootSha256) fail("YUZHOU_JOB_STATE_TRUSTED_ROOT_MISMATCH", "checkpoint");
  exact(artifact.evidenceIndex, ["checkpointSha256", "manifestSha256", "extractBindingSha256", "journalSha256", "employeeJobStatesSha256", "jobStateCodeMetadataSha256", "jobStateCodesSha256"], "YUZHOU_JOB_STATE_EVIDENCE_INDEX_INVALID");
  for (const value of Object.values(artifact.evidenceIndex)) requireSha(value, "YUZHOU_JOB_STATE_EVIDENCE_INDEX_INVALID", "hash");
  if (artifact.evidenceIndex.checkpointSha256 !== artifact.checkpointRootSha256 || artifact.evidenceIndexSha256 !== canonicalEvidenceIndexHash(artifact.evidenceIndex)) fail("YUZHOU_JOB_STATE_EVIDENCE_INDEX_MISMATCH", "index");
  const stats = verifyCommon(artifact, true);
  exact(artifact.semanticLedger, ["sourceDistinctStateCount", "sourceRecordCount", "mappedStateCount", "quarantinedStateCount", "mappedRecordCount", "quarantinedRecordCount", "conservationVerified"], "YUZHOU_JOB_STATE_SEMANTIC_LEDGER_INVALID");
  if (artifact.semanticLedger.sourceDistinctStateCount !== 7 || artifact.semanticLedger.sourceRecordCount !== stats.total || artifact.semanticLedger.mappedStateCount !== stats.mapped || artifact.semanticLedger.quarantinedStateCount !== stats.quarantined || artifact.semanticLedger.mappedRecordCount !== stats.mappedRecords || artifact.semanticLedger.quarantinedRecordCount !== stats.quarantinedRecords || artifact.semanticLedger.conservationVerified !== true) fail("YUZHOU_JOB_STATE_SEMANTIC_LEDGER_MISMATCH", "ledger");
  exact(artifact.machineAssertion, ["mode", "policyVersion", "status", "reasonCodes", "humanSignature", "humanIdentityAsserted"], "YUZHOU_JOB_STATE_MACHINE_ASSERTION_INVALID");
  if (artifact.machineAssertion.mode !== "trusted_root_deterministic_machine_semantics" || artifact.machineAssertion.policyVersion !== "yuzhou-job-state-machine-policy-v2" || artifact.machineAssertion.status !== "PASS" || !Array.isArray(artifact.machineAssertion.reasonCodes) || artifact.machineAssertion.reasonCodes.length !== 0 || artifact.machineAssertion.humanSignature !== false || artifact.machineAssertion.humanIdentityAsserted !== false) fail("YUZHOU_JOB_STATE_MACHINE_ASSERTION_INVALID", "assertion");
  return { status: "MACHINE_CANDIDATE", canonicalDecisionSha256: stats.canonical, evidenceIndexSha256: artifact.evidenceIndexSha256, distinctStates: 7, observedRecordCount: stats.total, mapped: stats.mapped, quarantined: stats.quarantined, mappedRecordCount: stats.mappedRecords, quarantinedRecordCount: stats.quarantinedRecords, machineAssertion: "PASS", legacyReadOnlyAudit: false, materializationEligibility: "MACHINE_CANDIDATE", productionImport: "HOLD" };
}

export function verifyYuzhouJobStateDecisionArtifact(artifact) {
  if (!plain(artifact)) fail("YUZHOU_JOB_STATE_ARTIFACT_SHAPE_INVALID", "object");
  if (SENSITIVE_CONTENT.test(JSON.stringify(artifact))) fail("YUZHOU_JOB_STATE_ARTIFACT_SENSITIVE_CONTENT", "sensitive content");
  if (artifact.formatVersion === 1) return verifyLegacyV1(artifact);
  if (artifact.formatVersion === 2) return verifyMachineV2(artifact);
  fail("YUZHOU_JOB_STATE_ARTIFACT_IDENTITY_INVALID", "unsupported version");
}
