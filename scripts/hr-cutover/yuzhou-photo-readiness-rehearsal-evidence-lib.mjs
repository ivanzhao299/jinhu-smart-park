import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import process from "node:process";

export class YuzhouPhotoRehearsalEvidenceError extends Error {
  constructor(code, detail) { super(`${code}: ${detail}`); this.name = "YuzhouPhotoRehearsalEvidenceError"; this.code = code; }
}
const fail = (code, detail) => { throw new YuzhouPhotoRehearsalEvidenceError(code, detail); };
const SHA = /^[0-9a-f]{64}$/u, CODE_SHA = /^[0-9a-f]{40}$/u, PLAIN_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}\.json$/u;
const plain = value => value !== null && typeof value === "object" && !Array.isArray(value);
const exact = (value, keys, code) => {
  if (!plain(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) fail(code, "exact object shape required");
};
const canonicalize = value => Array.isArray(value) ? value.map(canonicalize) : plain(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])])) : value;
const hash = value => createHash("sha256").update(value).digest("hex");
const canonicalHash = value => hash(JSON.stringify(canonicalize(value)));
const requireSha = (value, code) => { if (!SHA.test(value ?? "")) fail(code, "sha256 required"); };
const verifyTriple = (value, code) => {
  exact(value, ["codeSha", "sourceSnapshotHash", "mappingContractHash"], code);
  if (!CODE_SHA.test(value.codeSha ?? "") || !SHA.test(value.sourceSnapshotHash ?? "") || !SHA.test(value.mappingContractHash ?? "")) fail(code, "invalid C-S-M");
};
const sameTriple = (left, right) => left.codeSha === right.codeSha && left.sourceSnapshotHash === right.sourceSnapshotHash && left.mappingContractHash === right.mappingContractHash;

function privateFile(path, code, seen) {
  let link, target;
  try { link = lstatSync(path); target = statSync(path); }
  catch { fail(code, "artifact unavailable"); }
  if (link.isSymbolicLink() || !target.isFile() || target.nlink !== 1 || (target.mode & 0o777) !== 0o600 || (typeof process.getuid === "function" && target.uid !== process.getuid())) fail(code, "artifact must be current-uid 0600 regular nlink=1 and not a symlink/hardlink");
  const real = realpathSync(path), inode = `${target.dev}:${target.ino}`;
  if (seen.has(real) || seen.has(inode)) fail("YUZHOU_PHOTO_REHEARSAL_ARTIFACT_REUSED", basename(path));
  seen.add(real); seen.add(inode);
  return readFileSync(real);
}
function externalJson(root, binding, label, seen) {
  exact(binding, ["artifact", "rawSha256"], "YUZHOU_PHOTO_REHEARSAL_ARTIFACT_BINDING_INVALID");
  if (!PLAIN_FILE.test(binding.artifact ?? "") || basename(binding.artifact) !== binding.artifact) fail("YUZHOU_PHOTO_REHEARSAL_ARTIFACT_NAME_INVALID", label);
  requireSha(binding.rawSha256, "YUZHOU_PHOTO_REHEARSAL_ARTIFACT_HASH_INVALID");
  const bytes = privateFile(resolve(root, binding.artifact), "YUZHOU_PHOTO_REHEARSAL_ARTIFACT_UNSAFE", seen);
  if (hash(bytes) !== binding.rawSha256) fail("YUZHOU_PHOTO_REHEARSAL_ARTIFACT_HASH_MISMATCH", label);
  try { return JSON.parse(bytes.toString("utf8")); }
  catch { fail("YUZHOU_PHOTO_REHEARSAL_ARTIFACT_JSON_INVALID", label); }
}
function verifyTechnical(value, rehearsal, triple) {
  exact(value, ["formatVersion", "kind", "schemaVersion", "rehearsal", "triple", "runIdSha256", "t0BatchIdSha256", "tenantIdentitySha256", "parkIdentitySha256", "resourceHashes", "ownerLedger", "canonicalProjectionSha256", "rbac", "idempotency", "residuals", "status"], "YUZHOU_PHOTO_REHEARSAL_TECHNICAL_SHAPE_INVALID");
  if (value.formatVersion !== 1 || value.kind !== "yuzhou_photo_run_technical_evidence" || value.schemaVersion !== "v1" || value.rehearsal !== rehearsal || value.status !== "PASS") fail("YUZHOU_PHOTO_REHEARSAL_TECHNICAL_IDENTITY_INVALID", rehearsal);
  verifyTriple(value.triple, "YUZHOU_PHOTO_REHEARSAL_RUN_TRIPLE_INVALID");
  if (!sameTriple(value.triple, triple)) fail("YUZHOU_PHOTO_REHEARSAL_RUN_BINDING_INVALID", rehearsal);
  for (const key of ["runIdSha256", "t0BatchIdSha256", "tenantIdentitySha256", "parkIdentitySha256", "canonicalProjectionSha256"]) requireSha(value[key], "YUZHOU_PHOTO_REHEARSAL_RUN_HASH_INVALID");
  exact(value.resourceHashes, ["database", "fileRoot", "temporaryRoot", "accountNamespace"], "YUZHOU_PHOTO_REHEARSAL_RESOURCE_SHAPE_INVALID");
  for (const item of Object.values(value.resourceHashes)) requireSha(item, "YUZHOU_PHOTO_REHEARSAL_RESOURCE_HASH_INVALID");
  exact(value.ownerLedger, ["sourceRows", "resolvedRows", "quarantinedRows", "mappingStatusCounts", "lookupAlgorithmVersion", "canonicalSha256"], "YUZHOU_PHOTO_REHEARSAL_OWNER_SHAPE_INVALID");
  exact(value.ownerLedger.mappingStatusCounts, ["loaded", "verified"], "YUZHOU_PHOTO_REHEARSAL_OWNER_STATUS_INVALID");
  const owner = value.ownerLedger;
  if (owner.sourceRows !== 2155 || owner.resolvedRows + owner.quarantinedRows !== owner.sourceRows || owner.mappingStatusCounts.loaded + owner.mappingStatusCounts.verified !== owner.resolvedRows || owner.lookupAlgorithmVersion !== "t0-person-identity-v1") fail("YUZHOU_PHOTO_REHEARSAL_OWNER_LEDGER_INVALID", rehearsal);
  requireSha(owner.canonicalSha256, "YUZHOU_PHOTO_REHEARSAL_OWNER_HASH_INVALID");
  exact(value.rbac, ["scopes", "positivePassed", "negativePassed", "auditFailureZeroDisclosure", "observationSha256"], "YUZHOU_PHOTO_REHEARSAL_RBAC_SHAPE_INVALID");
  requireSha(value.rbac.observationSha256, "YUZHOU_PHOTO_REHEARSAL_RBAC_HASH_INVALID");
  if (JSON.stringify(value.rbac.scopes) !== JSON.stringify(["park", "team", "self", "none"]) || value.rbac.positivePassed !== true || value.rbac.negativePassed !== true || value.rbac.auditFailureZeroDisclosure !== true) fail("YUZHOU_PHOTO_REHEARSAL_RBAC_INVALID", rehearsal);
  exact(value.idempotency, ["replayNoNewFile", "replayNoNewLink", "hashConflictRejected", "observationSha256"], "YUZHOU_PHOTO_REHEARSAL_IDEMPOTENCY_SHAPE_INVALID");
  requireSha(value.idempotency.observationSha256, "YUZHOU_PHOTO_REHEARSAL_IDEMPOTENCY_HASH_INVALID");
  if (value.idempotency.replayNoNewFile !== true || value.idempotency.replayNoNewLink !== true || value.idempotency.hashConflictRejected !== true) fail("YUZHOU_PHOTO_REHEARSAL_IDEMPOTENCY_INVALID", rehearsal);
  exact(value.residuals, ["activeDatabaseRows", "binaryObjects", "temporaryArtifacts", "observationSha256"], "YUZHOU_PHOTO_REHEARSAL_RESIDUAL_SHAPE_INVALID");
  requireSha(value.residuals.observationSha256, "YUZHOU_PHOTO_REHEARSAL_RESIDUAL_HASH_INVALID");
  if (value.residuals.activeDatabaseRows !== 0 || value.residuals.binaryObjects !== 0 || value.residuals.temporaryArtifacts !== 0) fail("YUZHOU_PHOTO_REHEARSAL_RESIDUAL_NONZERO", rehearsal);
  return value;
}

const indexPayload = evidence => ({ formatVersion: evidence.formatVersion, kind: evidence.kind, schemaVersion: evidence.schemaVersion, triple: evidence.triple, runs: evidence.runs, combinedTechnicalSha256: evidence.combinedTechnicalSha256, detachedReview: evidence.detachedReview, productionImport: evidence.productionImport });
export const photoRehearsalEvidenceHash = evidence => canonicalHash(indexPayload(evidence));

export function verifyYuzhouPhotoRehearsalEvidenceFromPath(evidencePath) {
  const seen = new Set(), indexBytes = privateFile(resolve(evidencePath), "YUZHOU_PHOTO_REHEARSAL_INDEX_UNSAFE", seen);
  let evidence;
  try { evidence = JSON.parse(indexBytes.toString("utf8")); }
  catch { fail("YUZHOU_PHOTO_REHEARSAL_INDEX_JSON_INVALID", "index"); }
  return verifyYuzhouPhotoRehearsalEvidence(evidence, { evidenceRoot: dirname(realpathSync(resolve(evidencePath))), seen });
}

export function verifyYuzhouPhotoRehearsalEvidence(evidence, options = {}) {
  if (!options.evidenceRoot || !(options.seen instanceof Set)) fail("YUZHOU_PHOTO_REHEARSAL_EXTERNAL_INDEX_REQUIRED", "PASS requires a controlled external index path");
  exact(evidence, ["formatVersion", "kind", "schemaVersion", "triple", "runs", "combinedTechnicalSha256", "detachedReview", "productionImport", "evidenceSha256"], "YUZHOU_PHOTO_REHEARSAL_SHAPE_INVALID");
  if (evidence.formatVersion !== 1 || evidence.kind !== "yuzhou_photo_readiness_rehearsal_evidence_index" || evidence.schemaVersion !== "v1") fail("YUZHOU_PHOTO_REHEARSAL_IDENTITY_INVALID", "identity");
  verifyTriple(evidence.triple, "YUZHOU_PHOTO_REHEARSAL_TRIPLE_INVALID");
  if (!Array.isArray(evidence.runs) || evidence.runs.length !== 2 || evidence.runs[0]?.rehearsal !== "A" || evidence.runs[1]?.rehearsal !== "B") fail("YUZHOU_PHOTO_REHEARSAL_RUN_SET_INVALID", "A then B required");
  const technical = evidence.runs.map(run => {
    exact(run, ["rehearsal", "technicalArtifact"], "YUZHOU_PHOTO_REHEARSAL_RUN_INDEX_INVALID");
    return verifyTechnical(externalJson(options.evidenceRoot, run.technicalArtifact, `${run.rehearsal}:technical`, options.seen), run.rehearsal, evidence.triple);
  });
  const resources = technical.flatMap(run => Object.values(run.resourceHashes));
  if (new Set(resources).size !== resources.length || technical[0].runIdSha256 === technical[1].runIdSha256 || technical[0].t0BatchIdSha256 === technical[1].t0BatchIdSha256) fail("YUZHOU_PHOTO_REHEARSAL_RESOURCE_REUSED", "A/B resources, run and T0 batch must be independent");
  if (technical[0].tenantIdentitySha256 !== technical[1].tenantIdentitySha256 || technical[0].parkIdentitySha256 !== technical[1].parkIdentitySha256) fail("YUZHOU_PHOTO_REHEARSAL_SCOPE_DRIFT", "A/B business scope");
  if (technical[0].ownerLedger.canonicalSha256 !== technical[1].ownerLedger.canonicalSha256 || technical[0].canonicalProjectionSha256 !== technical[1].canonicalProjectionSha256) fail("YUZHOU_PHOTO_REHEARSAL_CANONICAL_DRIFT", "A/B owner/projection");
  const combinedTechnicalSha256 = canonicalHash(evidence.runs.map((run, index) => ({ rehearsal: run.rehearsal, rawSha256: run.technicalArtifact.rawSha256, canonicalProjectionSha256: technical[index].canonicalProjectionSha256 })));
  requireSha(evidence.combinedTechnicalSha256, "YUZHOU_PHOTO_REHEARSAL_COMBINED_HASH_INVALID");
  if (evidence.combinedTechnicalSha256 !== combinedTechnicalSha256) fail("YUZHOU_PHOTO_REHEARSAL_COMBINED_HASH_MISMATCH", "technical pair");
  exact(evidence.detachedReview, ["artifact", "rawSha256"], "YUZHOU_PHOTO_REHEARSAL_REVIEW_INDEX_INVALID");
  const review = externalJson(options.evidenceRoot, evidence.detachedReview, "detached-review", options.seen);
  exact(review, ["formatVersion", "kind", "schemaVersion", "status", "reviewerSubjectSha256", "reviewedTechnicalEvidenceSha256", "attestationContextSha256"], "YUZHOU_PHOTO_REHEARSAL_REVIEW_SHAPE_INVALID");
  for (const key of ["reviewerSubjectSha256", "reviewedTechnicalEvidenceSha256", "attestationContextSha256"]) requireSha(review[key], "YUZHOU_PHOTO_REHEARSAL_REVIEW_HASH_INVALID");
  if (review.formatVersion !== 1 || review.kind !== "yuzhou_photo_detached_review_attestation" || review.schemaVersion !== "v1" || review.status !== "APPROVED" || review.reviewedTechnicalEvidenceSha256 !== combinedTechnicalSha256 || review.attestationContextSha256 !== canonicalHash({ triple: evidence.triple, combinedTechnicalSha256, reviewerSubjectSha256: review.reviewerSubjectSha256 })) fail("YUZHOU_PHOTO_REHEARSAL_REVIEW_BINDING_INVALID", "external attestation");
  if (evidence.productionImport !== "HOLD") fail("YUZHOU_PHOTO_REHEARSAL_PRODUCTION_NOT_HELD", "production import");
  requireSha(evidence.evidenceSha256, "YUZHOU_PHOTO_REHEARSAL_EVIDENCE_HASH_INVALID");
  const evidenceHash = photoRehearsalEvidenceHash(evidence);
  if (evidence.evidenceSha256 !== evidenceHash) fail("YUZHOU_PHOTO_REHEARSAL_EVIDENCE_HASH_MISMATCH", evidenceHash);
  return { status: "PASS", combinedTechnicalSha256, evidenceSha256: evidenceHash, reviewerSubjectSha256: review.reviewerSubjectSha256, productionImport: "HOLD" };
}
