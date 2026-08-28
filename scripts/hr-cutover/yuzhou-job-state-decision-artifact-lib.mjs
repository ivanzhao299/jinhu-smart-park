import { createHash } from "node:crypto";

export class YuzhouJobStateDecisionArtifactError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "YuzhouJobStateDecisionArtifactError";
    this.code = code;
  }
}

const fail = (code, detail) => {
  throw new YuzhouJobStateDecisionArtifactError(code, detail);
};

const SHA256 = /^[0-9a-f]{64}$/u;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/u;
const TARGET_STATUSES = new Set(["active", "probation", "suspended", "departed"]);
const QUARANTINE_REASONS = new Set([
  "AMBIGUOUS_SEMANTICS",
  "UNKNOWN_SOURCE_VALUE",
  "CONFLICTING_SOURCE_EVIDENCE"
]);
const SENSITIVE_CONTENT = /(?:\/Users\/|[A-Za-z]:[\\/]|file:\/\/|(?:password|passwd|token|secret|credential)\s*[:=]|BEGIN [A-Z ]*PRIVATE KEY|\b(?:10|127|169\.254|172\.(?:1[6-9]|2\d|3[01])|192\.168)\.\d{1,3}\.\d{1,3}\b)/iu;

const plainObject = value => value !== null && typeof value === "object" && !Array.isArray(value);

const exactKeys = (value, expected, code) => {
  if (!plainObject(value)) fail(code, "object required");
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) fail(code, `${actual.join(",")} != ${wanted.join(",")}`);
};

const requireSha = (value, code, detail) => {
  if (typeof value !== "string" || !SHA256.test(value)) fail(code, detail);
};

const canonicalize = value => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (plainObject(value)) {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]));
  }
  return value;
};

export const canonicalDecisionPayload = artifact => ({
  formatVersion: artifact.formatVersion,
  artifactKind: artifact.artifactKind,
  artifactVersion: artifact.artifactVersion,
  scopeBinding: artifact.scopeBinding,
  sourceContract: artifact.sourceContract,
  decisions: [...artifact.decisions].sort((left, right) => left.sourceIdentitySha256.localeCompare(right.sourceIdentitySha256))
});

export const canonicalDecisionHash = artifact => createHash("sha256")
  .update(JSON.stringify(canonicalize(canonicalDecisionPayload(artifact))))
  .digest("hex");

export function verifyYuzhouJobStateDecisionArtifact(artifact) {
  exactKeys(artifact, [
    "formatVersion", "artifactKind", "artifactVersion", "artifactStatus", "scopeBinding",
    "sourceContract", "decisions", "canonicalDecisionSha256", "review",
    "detachedHrApproval", "productionImport"
  ], "YUZHOU_JOB_STATE_ARTIFACT_SHAPE_INVALID");

  if (SENSITIVE_CONTENT.test(JSON.stringify(artifact))) {
    fail("YUZHOU_JOB_STATE_ARTIFACT_SENSITIVE_CONTENT", "paths, private network identifiers and credentials are forbidden");
  }
  if (artifact.formatVersion !== 1 || artifact.artifactKind !== "yuzhou_employee_job_state_reviewed_decision" || artifact.artifactVersion !== "v1") {
    fail("YUZHOU_JOB_STATE_ARTIFACT_IDENTITY_INVALID", "format or identity");
  }
  if (!new Set(["DRAFT", "REVIEWED"]).has(artifact.artifactStatus)) {
    fail("YUZHOU_JOB_STATE_ARTIFACT_STATUS_INVALID", String(artifact.artifactStatus));
  }
  if (artifact.productionImport !== "HOLD") {
    fail("YUZHOU_JOB_STATE_PRODUCTION_IMPORT_NOT_HELD", String(artifact.productionImport));
  }

  exactKeys(artifact.scopeBinding, ["tenantIdentitySha256", "parkIdentitySha256"], "YUZHOU_JOB_STATE_SCOPE_SHAPE_INVALID");
  requireSha(artifact.scopeBinding.tenantIdentitySha256, "YUZHOU_JOB_STATE_SCOPE_HASH_INVALID", "tenant");
  requireSha(artifact.scopeBinding.parkIdentitySha256, "YUZHOU_JOB_STATE_SCOPE_HASH_INVALID", "park");
  if (artifact.scopeBinding.tenantIdentitySha256 === artifact.scopeBinding.parkIdentitySha256) {
    fail("YUZHOU_JOB_STATE_SCOPE_HASH_COLLISION", "tenant and park bindings must be independently derived");
  }

  exactKeys(artifact.sourceContract, [
    "sourceSystem", "dictionaryCode", "sourceSnapshotSha256", "sourceDistinctStateCount", "sourceRecordCount"
  ], "YUZHOU_JOB_STATE_SOURCE_SHAPE_INVALID");
  if (artifact.sourceContract.sourceSystem !== "yuzhou-v10" || artifact.sourceContract.dictionaryCode !== "employee_job_state") {
    fail("YUZHOU_JOB_STATE_SOURCE_IDENTITY_INVALID", "source system or dictionary");
  }
  requireSha(artifact.sourceContract.sourceSnapshotSha256, "YUZHOU_JOB_STATE_SOURCE_HASH_INVALID", "snapshot");
  if (artifact.sourceContract.sourceDistinctStateCount !== 7 || !Number.isSafeInteger(artifact.sourceContract.sourceRecordCount) || artifact.sourceContract.sourceRecordCount < 7) {
    fail("YUZHOU_JOB_STATE_SOURCE_COUNT_INVALID", "exactly seven distinct states and a positive aggregate record count are required");
  }

  if (!Array.isArray(artifact.decisions) || artifact.decisions.length !== 7) {
    fail("YUZHOU_JOB_STATE_DECISION_COUNT_INVALID", "exactly seven decisions required");
  }
  const identities = new Set();
  const rowHashes = new Set();
  let mapped = 0;
  let quarantined = 0;
  let observedRecordCount = 0;
  for (const [index, decision] of artifact.decisions.entries()) {
    exactKeys(decision, [
      "sourceIdentitySha256", "sourceRowSha256", "observedRecordCount", "decision",
      "targetEmploymentStatus", "reasonCode"
    ], "YUZHOU_JOB_STATE_DECISION_SHAPE_INVALID");
    requireSha(decision.sourceIdentitySha256, "YUZHOU_JOB_STATE_DECISION_HASH_INVALID", `${index}:identity`);
    requireSha(decision.sourceRowSha256, "YUZHOU_JOB_STATE_DECISION_HASH_INVALID", `${index}:row`);
    if (identities.has(decision.sourceIdentitySha256) || rowHashes.has(decision.sourceRowSha256)) {
      fail("YUZHOU_JOB_STATE_DECISION_DUPLICATE", String(index));
    }
    identities.add(decision.sourceIdentitySha256);
    rowHashes.add(decision.sourceRowSha256);
    if (!Number.isSafeInteger(decision.observedRecordCount) || decision.observedRecordCount < 1) {
      fail("YUZHOU_JOB_STATE_DECISION_SOURCE_COUNT_INVALID", String(index));
    }
    observedRecordCount += decision.observedRecordCount;
    if (decision.decision === "map") {
      if (!TARGET_STATUSES.has(decision.targetEmploymentStatus) || decision.reasonCode !== "APPROVED_MAPPING") {
        fail("YUZHOU_JOB_STATE_MAP_TARGET_INVALID", String(index));
      }
      mapped += 1;
    } else if (decision.decision === "quarantine") {
      if (decision.targetEmploymentStatus !== null || !QUARANTINE_REASONS.has(decision.reasonCode)) {
        fail("YUZHOU_JOB_STATE_QUARANTINE_INVALID", String(index));
      }
      quarantined += 1;
    } else {
      fail("YUZHOU_JOB_STATE_DECISION_INVALID", String(index));
    }
  }
  if (observedRecordCount !== artifact.sourceContract.sourceRecordCount) {
    fail("YUZHOU_JOB_STATE_SOURCE_LEDGER_MISMATCH", `${observedRecordCount} != ${artifact.sourceContract.sourceRecordCount}`);
  }
  const ordered = [...identities].sort();
  if (JSON.stringify(artifact.decisions.map(item => item.sourceIdentitySha256)) !== JSON.stringify(ordered)) {
    fail("YUZHOU_JOB_STATE_DECISION_ORDER_INVALID", "source identities must use canonical ascending order");
  }

  requireSha(artifact.canonicalDecisionSha256, "YUZHOU_JOB_STATE_CANONICAL_HASH_INVALID", "canonical decision hash");
  const expectedDecisionHash = canonicalDecisionHash(artifact);
  if (artifact.canonicalDecisionSha256 !== expectedDecisionHash) {
    fail("YUZHOU_JOB_STATE_CANONICAL_HASH_MISMATCH", expectedDecisionHash);
  }

  exactKeys(artifact.review, ["status", "reviewerSubjectSha256", "reviewedDecisionSha256", "reviewedAt"], "YUZHOU_JOB_STATE_REVIEW_SHAPE_INVALID");
  if (artifact.artifactStatus === "DRAFT") {
    if (artifact.review.status !== "DRAFT" || artifact.review.reviewerSubjectSha256 !== null || artifact.review.reviewedDecisionSha256 !== null || artifact.review.reviewedAt !== null) {
      fail("YUZHOU_JOB_STATE_DRAFT_REVIEW_INVALID", "draft cannot claim a reviewer");
    }
  } else {
    requireSha(artifact.review.reviewerSubjectSha256, "YUZHOU_JOB_STATE_REVIEWER_HASH_INVALID", "reviewer");
    if (artifact.review.status !== "REVIEWED" || artifact.review.reviewedDecisionSha256 !== expectedDecisionHash || typeof artifact.review.reviewedAt !== "string" || !DATE_TIME.test(artifact.review.reviewedAt) || Number.isNaN(Date.parse(artifact.review.reviewedAt))) {
      fail("YUZHOU_JOB_STATE_REVIEW_BINDING_INVALID", "review must bind the canonical decision hash and UTC timestamp");
    }
  }

  exactKeys(artifact.detachedHrApproval, ["required", "status", "attestationSha256"], "YUZHOU_JOB_STATE_HR_APPROVAL_SHAPE_INVALID");
  if (artifact.detachedHrApproval.required !== true || artifact.detachedHrApproval.status !== "HOLD" || artifact.detachedHrApproval.attestationSha256 !== null) {
    fail("YUZHOU_JOB_STATE_HR_APPROVAL_MUST_BE_DETACHED", "the decision artifact cannot approve itself");
  }

  return {
    status: artifact.artifactStatus,
    canonicalDecisionSha256: expectedDecisionHash,
    distinctStates: 7,
    observedRecordCount,
    mapped,
    quarantined,
    review: artifact.review.status,
    detachedHrApproval: "HOLD",
    materializationEligibility: "HOLD_DETACHED_HR_APPROVAL_REQUIRED",
    productionImport: "HOLD"
  };
}
