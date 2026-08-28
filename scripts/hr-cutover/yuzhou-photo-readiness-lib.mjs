import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export class YuzhouPhotoReadinessError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "YuzhouPhotoReadinessError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new YuzhouPhotoReadinessError(code, detail); };
const SHA256 = /^[0-9a-f]{64}$/u;
const FORBIDDEN_VALUE = /(?:\/Users\/|[A-Za-z]:[\\/]|file:\/\/|https?:\/\/|(?:postgres(?:ql)?|sqlserver):\/\/|BEGIN [A-Z ]*PRIVATE KEY|\b(?:10|127|169\.254|172\.(?:1[6-9]|2\d|3[01])|192\.168)\.\d{1,3}\.\d{1,3}\b)/iu;
const FORBIDDEN_KEY = /^(?:binary|blob|base64|rawContent|sourceValue|fileName|originalName|legacyPath|storagePath|downloadUrl|credential|password|token|secret)$/iu;
const plainObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
const exactKeys = (value, expected, code) => {
  if (!plainObject(value)) fail(code, "object required");
  const actual = Object.keys(value).sort(), wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) fail(code, `${actual.join(",")} != ${wanted.join(",")}`);
};
const sha = value => createHash("sha256").update(value).digest("hex");
const requireSha = (value, code, detail) => {
  if (typeof value !== "string" || !SHA256.test(value)) fail(code, detail);
};
const requireExactArray = (actual, expected, code) => {
  if (!Array.isArray(actual) || JSON.stringify(actual) !== JSON.stringify(expected)) fail(code, JSON.stringify(actual));
};
const scanForbidden = (value, path = "root") => {
  if (typeof value === "string") {
    if (FORBIDDEN_VALUE.test(value)) fail("YUZHOU_PHOTO_READINESS_SENSITIVE_VALUE", path);
    return;
  }
  if (Array.isArray(value)) return value.forEach((item, index) => scanForbidden(item, `${path}[${index}]`));
  if (!plainObject(value)) return;
  for (const [key, item] of Object.entries(value)) {
    if (FORBIDDEN_KEY.test(key)) fail("YUZHOU_PHOTO_READINESS_FORBIDDEN_FIELD", `${path}.${key}`);
    scanForbidden(item, `${path}.${key}`);
  }
};
const canonicalize = value => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (plainObject(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]));
  return value;
};

const INVENTORY_AUTHORITY = ".trellis/tasks/08-25-hr-t5-employee-lifecycle-operations/research/phase5-source-evidence.json";
const INVENTORY_AUTHORITY_SHA256 = "99669113cabd3319c8131de23b3a319847b3803c92bc867ac4e12068e566309c";
const T5_BUSINESS_MANIFEST_SHA256 = "5939691dfdddd5912992328dba58505f92bcfb7bb7de07ada571959a52d37005";
const PHOTO_REHEARSAL_SCHEMA_SHA256 = "0ceb6f8f2abc855c2bc862210d04078f4465ead7beb66b898207f814ceeede49";
const PHOTO_REHEARSAL_VERIFIER_ARTIFACTS = [
  { artifact: "scripts/hr-cutover/yuzhou-photo-readiness-rehearsal-evidence-lib.mjs", rawSha256: "08bb875f967cef677268b95cc04c80ba3cd57a1fa9a6943773ea6340defd17d4" },
  { artifact: "scripts/hr-cutover/verify-yuzhou-photo-readiness-rehearsal-evidence.mjs", rawSha256: "3441319e51d7e4c6f579d0ec43fa2099d3a61e601ba861c1df65e7aec4b455d2" }
];

export const canonicalPhotoReadinessPayload = contract => ({
  formatVersion: contract.formatVersion,
  contractKind: contract.contractKind,
  contractVersion: contract.contractVersion,
  sourceBinding: contract.sourceBinding,
  inventory: contract.inventory,
  ownerResolution: contract.ownerResolution,
  normalizationPlan: contract.normalizationPlan,
  targetPlan: contract.targetPlan,
  accessControl: contract.accessControl,
  idempotency: contract.idempotency,
  auditAndRollback: contract.auditAndRollback,
  rehearsalGates: contract.rehearsalGates,
  rehearsalEvidenceContract: contract.rehearsalEvidenceContract,
  verdict: contract.verdict
});

export const photoReadinessHash = contract => sha(JSON.stringify(canonicalize(canonicalPhotoReadinessPayload(contract))));

export function verifyYuzhouPhotoReadiness(contract, { repositoryRoot = resolve(import.meta.dirname, "../..") } = {}) {
  scanForbidden(contract);
  exactKeys(contract, [
    "formatVersion", "contractKind", "contractVersion", "sourceBinding", "inventory",
    "ownerResolution", "normalizationPlan", "targetPlan", "accessControl", "idempotency",
    "auditAndRollback", "rehearsalGates", "rehearsalEvidenceContract", "verdict", "contractSha256"
  ], "YUZHOU_PHOTO_READINESS_SHAPE_INVALID");
  if (contract.formatVersion !== 1 || contract.contractKind !== "yuzhou_t5_photo_attachment_readiness" || contract.contractVersion !== "v1") {
    fail("YUZHOU_PHOTO_READINESS_IDENTITY_INVALID", "format or identity");
  }

  exactKeys(contract.sourceBinding, ["sourceSystem", "sourceSnapshotSha256", "t5Domain", "binaryAccess", "productionAccess", "inventoryAuthority"], "YUZHOU_PHOTO_SOURCE_BINDING_INVALID");
  if (contract.sourceBinding.sourceSystem !== "yuzhou-v10" || contract.sourceBinding.t5Domain !== "T5") fail("YUZHOU_PHOTO_SOURCE_IDENTITY_INVALID", "source or domain");
  requireSha(contract.sourceBinding.sourceSnapshotSha256, "YUZHOU_PHOTO_SOURCE_HASH_INVALID", "source snapshot");
  if (contract.sourceBinding.binaryAccess !== "FORBIDDEN_IN_READINESS" || contract.sourceBinding.productionAccess !== "FORBIDDEN") fail("YUZHOU_PHOTO_SOURCE_ACCESS_NOT_HELD", "readiness is metadata-only and lab-only");
  exactKeys(contract.sourceBinding.inventoryAuthority, ["artifact", "rawSha256", "businessManifestSha256"], "YUZHOU_PHOTO_AUTHORITY_SHAPE_INVALID");
  const authorityBinding = contract.sourceBinding.inventoryAuthority;
  if (authorityBinding.artifact !== INVENTORY_AUTHORITY || authorityBinding.rawSha256 !== INVENTORY_AUTHORITY_SHA256 || authorityBinding.businessManifestSha256 !== T5_BUSINESS_MANIFEST_SHA256) fail("YUZHOU_PHOTO_AUTHORITY_BINDING_INVALID", "inventory authority identity");
  let authorityBytes;
  try { authorityBytes = readFileSync(resolve(repositoryRoot, INVENTORY_AUTHORITY)); }
  catch { fail("YUZHOU_PHOTO_AUTHORITY_UNAVAILABLE", "inventory authority cannot be read"); }
  if (sha(authorityBytes) !== authorityBinding.rawSha256) fail("YUZHOU_PHOTO_AUTHORITY_HASH_MISMATCH", "inventory authority bytes");
  let authority;
  try { authority = JSON.parse(authorityBytes.toString("utf8")); }
  catch { fail("YUZHOU_PHOTO_AUTHORITY_INVALID", "inventory authority is not valid JSON"); }
  const authorityFiles = authority?.profile?.files;
  if (authority?.source?.readOnly !== true || authority?.source?.loginIsSa !== false || authority?.source?.backupSha256 !== contract.sourceBinding.sourceSnapshotSha256 || authority?.keyedFullDomainDeterminism?.businessSha256 !== authorityBinding.businessManifestSha256 || authority?.productionImport !== "HOLD") fail("YUZHOU_PHOTO_AUTHORITY_STATE_INVALID", "source authority safety or business binding");

  exactKeys(contract.inventory, ["photos", "documents"], "YUZHOU_PHOTO_INVENTORY_SHAPE_INVALID");
  exactKeys(contract.inventory.photos, ["sourceRows", "contentBearingRows", "distinctContentHashes", "duplicateContentRows", "emptyRows", "sourceBytes", "detectedBmpRows", "legacyDeclaredSizeMismatchRows", "payloadEstimate"], "YUZHOU_PHOTO_LEDGER_SHAPE_INVALID");
  const photos = contract.inventory.photos;
  if (photos.sourceRows !== 2949 || photos.contentBearingRows !== 2155 || photos.distinctContentHashes !== 2150 || photos.duplicateContentRows !== 5 || photos.emptyRows !== 794 || photos.sourceBytes !== 273936570 || photos.detectedBmpRows !== 2155 || photos.legacyDeclaredSizeMismatchRows !== 2155) fail("YUZHOU_PHOTO_FROZEN_FACT_DRIFT", "photo inventory");
  if (photos.sourceRows !== photos.contentBearingRows + photos.emptyRows || photos.contentBearingRows !== photos.distinctContentHashes + photos.duplicateContentRows) fail("YUZHOU_PHOTO_LEDGER_MISMATCH", "photo conservation");
  exactKeys(photos.payloadEstimate, ["value", "unit", "exact"], "YUZHOU_PHOTO_ESTIMATE_SHAPE_INVALID");
  if (photos.payloadEstimate.value !== 274 || photos.payloadEstimate.unit !== "MB" || photos.payloadEstimate.exact !== false) fail("YUZHOU_PHOTO_ESTIMATE_DRIFT", "expected approximate 274 MB");
  exactKeys(contract.inventory.documents, ["sourceRows", "contentProvenRows", "ownershipProvenRows", "quarantinedRows", "reasonCode"], "YUZHOU_DOCUMENT_LEDGER_SHAPE_INVALID");
  const documents = contract.inventory.documents;
  if (documents.sourceRows !== 1003 || documents.contentProvenRows !== 0 || documents.ownershipProvenRows !== 0 || documents.quarantinedRows !== 1003 || documents.reasonCode !== "DOCUMENT_CONTENT_AND_OWNER_UNPROVEN") fail("YUZHOU_DOCUMENT_FROZEN_FACT_DRIFT", "all document rows remain quarantined");
  if (documents.sourceRows !== documents.quarantinedRows) fail("YUZHOU_DOCUMENT_LEDGER_MISMATCH", "document conservation");
  if (authorityFiles?.photoRows !== photos.sourceRows || authorityFiles?.readablePhotos !== photos.contentBearingRows || authorityFiles?.photoBytes !== photos.sourceBytes || authorityFiles?.distinctPhotoHashes !== photos.distinctContentHashes || authorityFiles?.docsRows !== documents.sourceRows || authorityFiles?.docsWithContent !== 0 || authorityFiles?.docsWithPath !== 0 || authorityFiles?.docsWithNameOnly !== documents.sourceRows || authorityFiles?.detectedBmpPhotos !== photos.detectedBmpRows || authorityFiles?.legacyPhotoSizeMismatch !== photos.legacyDeclaredSizeMismatchRows) fail("YUZHOU_PHOTO_AUTHORITY_FACT_MISMATCH", "contract aggregates do not match inventory authority");

  exactKeys(contract.ownerResolution, ["method", "sourceMap", "sourceSystem", "sourceTable", "targetTable", "targetJoin", "targetScopeTable", "targetScopeColumns", "acceptedMappingStatuses", "requiresTargetId", "requiresActive", "guessingForbidden", "lookupKeyAlgorithm", "rehearsalBinding", "contentBearingRows", "resolvedRows", "pendingRows", "unmatchedRows", "status"], "YUZHOU_PHOTO_OWNER_SHAPE_INVALID");
  const owner = contract.ownerResolution;
  if (owner.method !== "exact_t0_legacy_record_map" || owner.sourceMap !== "legacy_record_map" || owner.sourceSystem !== "yuzhou-v10" || owner.sourceTable !== "dbo.person" || owner.targetTable !== "hr_employee" || owner.targetJoin !== "legacy_record_map.target_id=hr_employee.id" || owner.targetScopeTable !== "hr_employee" || owner.requiresTargetId !== true || owner.requiresActive !== true || owner.guessingForbidden !== true) fail("YUZHOU_PHOTO_OWNER_METHOD_INVALID", "owner mapping must use the active T0 map joined to the scoped employee target");
  requireExactArray(owner.targetScopeColumns, ["tenant_id", "park_id"], "YUZHOU_PHOTO_OWNER_SCOPE_INVALID");
  requireExactArray(owner.acceptedMappingStatuses, ["loaded", "verified"], "YUZHOU_PHOTO_OWNER_STATUS_SET_INVALID");
  exactKeys(owner.lookupKeyAlgorithm, ["version", "photoPersonField", "normalization", "sourcePkCanonical", "sourceIdentitySha256"], "YUZHOU_PHOTO_OWNER_LOOKUP_SHAPE_INVALID");
  if (owner.lookupKeyAlgorithm.version !== "t0-person-identity-v1" || owner.lookupKeyAlgorithm.photoPersonField !== "person" || owner.lookupKeyAlgorithm.normalization !== "String(value).trim()" || owner.lookupKeyAlgorithm.sourcePkCanonical !== "person=<normalizedPerson>" || owner.lookupKeyAlgorithm.sourceIdentitySha256 !== "sha256('dbo.person\\0'+normalizedPerson)") fail("YUZHOU_PHOTO_OWNER_LOOKUP_ALGORITHM_INVALID", "lookup must match T0 employee identity");
  exactKeys(owner.rehearsalBinding, ["status", "requiredEqualityFields", "observed"], "YUZHOU_PHOTO_OWNER_REHEARSAL_BINDING_INVALID");
  requireExactArray(owner.rehearsalBinding.requiredEqualityFields, ["rehearsal", "parentRunId", "t0BatchId", "tenantId", "parkId", "codeSha", "sourceSnapshotHash", "mappingContractHash"], "YUZHOU_PHOTO_OWNER_REHEARSAL_FIELDS_INVALID");
  if (owner.rehearsalBinding.status !== "NOT_EXECUTED" || owner.rehearsalBinding.observed !== null) fail("YUZHOU_PHOTO_OWNER_BINDING_OVERCLAIMED", "same-rehearsal T0 C-S-M binding is pending");
  if (owner.contentBearingRows !== photos.contentBearingRows || owner.resolvedRows + owner.pendingRows + owner.unmatchedRows !== owner.contentBearingRows) fail("YUZHOU_PHOTO_OWNER_LEDGER_MISMATCH", "owner conservation");
  if (owner.resolvedRows !== 0 || owner.pendingRows !== 2155 || owner.unmatchedRows !== 0 || owner.status !== "NOT_EXECUTED") fail("YUZHOU_PHOTO_OWNER_STATUS_OVERCLAIMED", "readiness cannot claim owner resolution");

  exactKeys(contract.normalizationPlan, ["executionStatus", "acceptedSourceMagic", "acceptedTargetMime", "bmpPipeline", "hashSeparation", "quarantineReasons", "writesBinary"], "YUZHOU_PHOTO_NORMALIZATION_SHAPE_INVALID");
  const normalization = contract.normalizationPlan;
  if (normalization.executionStatus !== "NOT_EXECUTED" || normalization.writesBinary !== false || normalization.hashSeparation !== "sourceContentSha256_and_normalizedContentSha256") fail("YUZHOU_PHOTO_NORMALIZATION_OVERCLAIMED", "no binary transformation is authorized");
  requireExactArray(normalization.acceptedSourceMagic, ["JPEG", "PNG", "GIF", "BMP"], "YUZHOU_PHOTO_SOURCE_MAGIC_INVALID");
  requireExactArray(normalization.acceptedTargetMime, ["image/jpeg", "image/png"], "YUZHOU_PHOTO_TARGET_MIME_INVALID");
  requireExactArray(normalization.bmpPipeline, ["magic_check", "safe_decode", "dimension_limit", "malware_scan", "encode_jpeg_or_png", "rehash"], "YUZHOU_PHOTO_BMP_PIPELINE_INVALID");
  requireExactArray(normalization.quarantineReasons, ["EMPTY_BINARY", "UNKNOWN_MAGIC", "DECODE_FAILED", "DIMENSION_LIMIT_EXCEEDED", "SECURITY_SCAN_FAILED", "OWNER_MAP_MISSING"], "YUZHOU_PHOTO_QUARANTINE_REASONS_INVALID");

  exactKeys(contract.targetPlan, ["fileTable", "photoBizType", "documentBizType", "documentLinkTable", "downloadUrlGenerated", "metadataCreated", "binaryCreated"], "YUZHOU_PHOTO_TARGET_SHAPE_INVALID");
  if (contract.targetPlan.fileTable !== "sys_file" || contract.targetPlan.photoBizType !== "hr_employee_photo" || contract.targetPlan.documentBizType !== "hr_employee_document" || contract.targetPlan.documentLinkTable !== "hr_employee_document") fail("YUZHOU_PHOTO_TARGET_CONTRACT_INVALID", "target identity");
  if (contract.targetPlan.downloadUrlGenerated !== false || contract.targetPlan.metadataCreated !== 0 || contract.targetPlan.binaryCreated !== 0) fail("YUZHOU_PHOTO_TARGET_SIDE_EFFECT", "readiness must be zero-write");

  exactKeys(contract.accessControl, ["permissionAtoms", "scopeMatrix", "auditBeforeDisclosure", "failureProjection"], "YUZHOU_PHOTO_RBAC_SHAPE_INVALID");
  requireExactArray(contract.accessControl.permissionAtoms, ["hr:employee_document:read", "hr:employee_document:team_read", "hr:employee_document:self_read", "hr:employee_document:manage"], "YUZHOU_PHOTO_RBAC_ATOMS_INVALID");
  requireExactArray(contract.accessControl.scopeMatrix, ["park", "team", "self", "none"], "YUZHOU_PHOTO_RBAC_SCOPE_INVALID");
  if (contract.accessControl.auditBeforeDisclosure !== true || contract.accessControl.failureProjection !== "zero_metadata_zero_headers_zero_bytes") fail("YUZHOU_PHOTO_RBAC_FAIL_CLOSED_INVALID", "sensitive read boundary");

  exactKeys(contract.idempotency, ["keyParts", "duplicatePolicy", "replayResult", "status"], "YUZHOU_PHOTO_IDEMPOTENCY_SHAPE_INVALID");
  requireExactArray(contract.idempotency.keyParts, ["sourceSnapshotSha256", "sourceIdentitySha256", "sourceContentSha256", "normalizationPolicySha256", "targetEmployeeId"], "YUZHOU_PHOTO_IDEMPOTENCY_KEY_INVALID");
  if (contract.idempotency.duplicatePolicy !== "same_key_same_hash_replay_else_conflict" || contract.idempotency.replayResult !== "no_new_file_no_new_link" || contract.idempotency.status !== "NOT_EXECUTED") fail("YUZHOU_PHOTO_IDEMPOTENCY_INVALID", "replay contract");

  exactKeys(contract.auditAndRollback, ["operationJournal", "auditFields", "rollbackOrder", "residualTables", "mapRollbackScope", "mapRollbackMutation", "requiredResidualZero", "observedResiduals", "status"], "YUZHOU_PHOTO_ROLLBACK_SHAPE_INVALID");
  if (contract.auditAndRollback.operationJournal !== "append_only_hash_addressed" || contract.auditAndRollback.status !== "NOT_EXECUTED") fail("YUZHOU_PHOTO_ROLLBACK_OVERCLAIMED", "audit and rollback");
  requireExactArray(contract.auditAndRollback.auditFields, ["runId", "sourceIdentitySha256", "sourceContentSha256", "normalizedContentSha256", "targetFileId", "targetEmployeeId", "actorSubjectSha256", "result", "reasonCode"], "YUZHOU_PHOTO_AUDIT_FIELDS_INVALID");
  requireExactArray(contract.auditAndRollback.rollbackOrder, ["delete_hr_employee_document", "locate_binary_from_existing_sys_file_metadata", "delete_isolated_binary", "verify_binary_object_absent", "delete_sys_file", "mark_slice_legacy_record_map_rolled_back_inactive", "retain_append_only_journal"], "YUZHOU_PHOTO_ROLLBACK_ORDER_INVALID");
  requireExactArray(contract.auditAndRollback.residualTables, ["hr_employee_document", "sys_file", "legacy_record_map"], "YUZHOU_PHOTO_RESIDUAL_SCOPE_INVALID");
  if (contract.auditAndRollback.mapRollbackScope !== "same_photo_import_batch_target_rows_only") fail("YUZHOU_PHOTO_MAP_ROLLBACK_SCOPE_INVALID", "T0 owner maps must never be removed");
  exactKeys(contract.auditAndRollback.mapRollbackMutation, ["mappingStatus", "isActive"], "YUZHOU_PHOTO_MAP_ROLLBACK_MUTATION_INVALID");
  if (contract.auditAndRollback.mapRollbackMutation.mappingStatus !== "rolled_back" || contract.auditAndRollback.mapRollbackMutation.isActive !== false) fail("YUZHOU_PHOTO_MAP_ROLLBACK_MUTATION_INVALID", "slice maps must become rolled_back and inactive");
  exactKeys(contract.auditAndRollback.requiredResidualZero, ["activeDatabaseRows", "binaryObjects", "temporaryArtifacts"], "YUZHOU_PHOTO_RESIDUAL_ZERO_SHAPE_INVALID");
  if (Object.values(contract.auditAndRollback.requiredResidualZero).some(value => value !== 0) || contract.auditAndRollback.observedResiduals !== null) fail("YUZHOU_PHOTO_RESIDUAL_ZERO_OVERCLAIMED", "zero is required but not yet observed");

  exactKeys(contract.rehearsalGates, ["rehearsalA", "rehearsalB", "canonicalEquality", "rbacMatrix", "auditFailure", "rollbackResidualZero", "humanReview"], "YUZHOU_PHOTO_AB_SHAPE_INVALID");
  if (Object.values(contract.rehearsalGates).some(value => value !== "NOT_EXECUTED")) fail("YUZHOU_PHOTO_AB_OVERCLAIMED", "every A/B gate is pending");

  exactKeys(contract.rehearsalEvidenceContract, ["artifact", "schemaVersion", "schemaSha256", "verifierVersion", "verifierArtifacts", "status", "evidenceSha256"], "YUZHOU_PHOTO_REHEARSAL_CONTRACT_SHAPE_INVALID");
  const rehearsal = contract.rehearsalEvidenceContract;
  if (rehearsal.artifact !== "scripts/hr-cutover/contracts/yuzhou-photo-readiness-rehearsal-evidence.schema.json" || rehearsal.schemaVersion !== "v1" || rehearsal.schemaSha256 !== PHOTO_REHEARSAL_SCHEMA_SHA256 || rehearsal.verifierVersion !== "v1" || rehearsal.status !== "NOT_EXECUTED" || rehearsal.evidenceSha256 !== null) fail("YUZHOU_PHOTO_REHEARSAL_CONTRACT_INVALID", "future rehearsal evidence remains pending");
  if (!Array.isArray(rehearsal.verifierArtifacts) || rehearsal.verifierArtifacts.length !== PHOTO_REHEARSAL_VERIFIER_ARTIFACTS.length) fail("YUZHOU_PHOTO_REHEARSAL_VERIFIER_BINDING_INVALID", "verifier artifact set");
  rehearsal.verifierArtifacts.forEach((binding, index) => {
    exactKeys(binding, ["artifact", "rawSha256"], "YUZHOU_PHOTO_REHEARSAL_VERIFIER_BINDING_INVALID");
    const expected = PHOTO_REHEARSAL_VERIFIER_ARTIFACTS[index];
    if (binding.artifact !== expected.artifact || binding.rawSha256 !== expected.rawSha256) fail("YUZHOU_PHOTO_REHEARSAL_VERIFIER_BINDING_INVALID", `verifier artifact ${index}`);
    requireSha(binding.rawSha256, "YUZHOU_PHOTO_REHEARSAL_VERIFIER_HASH_INVALID", `verifier artifact ${index}`);
    let verifierBytes;
    try { verifierBytes = readFileSync(resolve(repositoryRoot, binding.artifact)); }
    catch { fail("YUZHOU_PHOTO_REHEARSAL_VERIFIER_UNAVAILABLE", `verifier artifact ${index}`); }
    if (sha(verifierBytes) !== binding.rawSha256) fail("YUZHOU_PHOTO_REHEARSAL_VERIFIER_HASH_MISMATCH", `verifier artifact ${index}`);
  });
  requireSha(rehearsal.schemaSha256, "YUZHOU_PHOTO_REHEARSAL_SCHEMA_HASH_INVALID", "schema");
  let rehearsalSchema;
  try { rehearsalSchema = readFileSync(resolve(repositoryRoot, rehearsal.artifact)); }
  catch { fail("YUZHOU_PHOTO_REHEARSAL_SCHEMA_UNAVAILABLE", "schema cannot be read"); }
  if (sha(rehearsalSchema) !== rehearsal.schemaSha256) fail("YUZHOU_PHOTO_REHEARSAL_SCHEMA_HASH_MISMATCH", "schema bytes");

  exactKeys(contract.verdict, ["engineeringReadiness", "reasonCodes", "photoImport", "documentImport", "productionImport"], "YUZHOU_PHOTO_VERDICT_SHAPE_INVALID");
  if (contract.verdict.engineeringReadiness !== "NO_GO" || contract.verdict.photoImport !== "HOLD" || contract.verdict.documentImport !== "HOLD" || contract.verdict.productionImport !== "HOLD") fail("YUZHOU_PHOTO_VERDICT_NOT_HELD", "imports must remain HOLD");
  requireExactArray(contract.verdict.reasonCodes, ["PHOTO_OWNER_MAP_PENDING", "PHOTO_BINARY_VALIDATION_NOT_EXECUTED", "PHOTO_AB_REHEARSAL_NOT_EXECUTED", "PHOTO_HUMAN_REVIEW_UNSIGNED", "DOCUMENT_CONTENT_AND_OWNER_UNPROVEN"], "YUZHOU_PHOTO_REASON_CODES_INVALID");

  requireSha(contract.contractSha256, "YUZHOU_PHOTO_CONTRACT_HASH_INVALID", "contract");
  const expectedHash = photoReadinessHash(contract);
  if (contract.contractSha256 !== expectedHash) fail("YUZHOU_PHOTO_CONTRACT_HASH_MISMATCH", expectedHash);
  return {
    status: "NO_GO",
    contractSha256: expectedHash,
    photos: { sourceRows: 2949, contentBearingRows: 2155, distinctContentHashes: 2150, emptyRows: 794 },
    documents: { sourceRows: 1003, quarantinedRows: 1003 },
    binaryAccess: "FORBIDDEN_IN_READINESS",
    photoImport: "HOLD",
    documentImport: "HOLD",
    productionImport: "HOLD"
  };
}

export function deriveT0EmployeeLookupKey(photoPerson) {
  const normalizedPerson = String(photoPerson ?? "").trim();
  if (!normalizedPerson) fail("YUZHOU_PHOTO_OWNER_LOOKUP_KEY_INVALID", "photo row.person is blank");
  return {
    normalizedPerson,
    sourcePkCanonical: `person=${normalizedPerson}`,
    sourceIdentitySha256: sha(`dbo.person\u0000${normalizedPerson}`)
  };
}
