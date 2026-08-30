#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, linkSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import test from "node:test";
import { deriveT0EmployeeLookupKey, photoReadinessHash, verifyYuzhouPhotoReadiness } from "../hr-cutover/yuzhou-photo-readiness-lib.mjs";
import { photoRehearsalEvidenceHash, verifyYuzhouPhotoRehearsalEvidence, verifyYuzhouPhotoRehearsalEvidenceFromPath } from "../hr-cutover/yuzhou-photo-readiness-rehearsal-evidence-lib.mjs";
import { YUZHOU_PHOTO_NORMALIZATION_PREFLIGHT_POLICY, photoNormalizationPreflightPolicyHash } from "../hr-cutover/yuzhou-photo-normalization-preflight.mjs";

const root = resolve(import.meta.dirname, "../..");
const contractPath = resolve(root, "scripts/hr-cutover/contracts/yuzhou-photo-readiness-v1.json");
const verifierPath = resolve(root, "scripts/hr-cutover/verify-yuzhou-photo-readiness.mjs");
const load = () => JSON.parse(readFileSync(contractPath, "utf8"));
const clone = value => JSON.parse(JSON.stringify(value));
const reverseKeys = value => {
  if (Array.isArray(value)) return value.map(reverseKeys);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).reverse().map(key => [key, reverseKeys(value[key])]));
  return value;
};
const rejects = (source, mutate, code) => {
  const value = clone(source); mutate(value);
  assert.throws(() => verifyYuzhouPhotoReadiness(value), error => error?.code === code, `expected ${code}`);
};
const digest = value => createHash("sha256").update(value).digest("hex");
const canonicalize = value => Array.isArray(value) ? value.map(canonicalize) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])])) : value;
const canonicalHash = value => digest(JSON.stringify(canonicalize(value)));
const privateJson = (path, value) => { const bytes = `${JSON.stringify(value)}\n`; writeFileSync(path, bytes, { mode: 0o600 }); chmodSync(path, 0o600); return digest(bytes); };
const rehearsalFixture = ({ mutateA, mutateB, mutateReview, mutateIndex } = {}) => {
  const sandbox = mkdtempSync(join(tmpdir(), "yuzhou-photo-readiness-evidence-")); chmodSync(sandbox, 0o700);
  const triple = { codeSha: "a".repeat(40), sourceSnapshotHash: "b".repeat(64), mappingContractHash: "c".repeat(64) };
  const ownerHash = digest("owner-ledger"), projectionHash = digest("canonical-projection"), tenant = digest("tenant"), park = digest("park");
  const technical = (rehearsal, offset) => ({
    formatVersion: 1, kind: "yuzhou_photo_run_technical_evidence", schemaVersion: "v1", rehearsal,
    triple: rehearsal === "B" ? reverseKeys(triple) : clone(triple), runIdSha256: digest(`run-${rehearsal}`), t0BatchIdSha256: digest(`batch-${rehearsal}`), tenantIdentitySha256: tenant, parkIdentitySha256: park,
    resourceHashes: { database: digest(`database-${offset}`), fileRoot: digest(`file-${offset}`), temporaryRoot: digest(`temp-${offset}`), accountNamespace: digest(`account-${offset}`) },
    ownerLedger: { sourceRows: 2155, resolvedRows: 2150, quarantinedRows: 5, mappingStatusCounts: { loaded: 2100, verified: 50 }, lookupAlgorithmVersion: "t0-person-identity-v1", canonicalSha256: ownerHash }, canonicalProjectionSha256: projectionHash,
    rbac: { scopes: ["park", "team", "self", "none"], positivePassed: true, negativePassed: true, auditFailureZeroDisclosure: true, observationSha256: digest(`rbac-${rehearsal}`) },
    idempotency: { replayNoNewFile: true, replayNoNewLink: true, hashConflictRejected: true, observationSha256: digest(`idempotency-${rehearsal}`) },
    residuals: { activeDatabaseRows: 0, binaryObjects: 0, temporaryArtifacts: 0, observationSha256: digest(`residual-${rehearsal}`) }, status: "PASS"
  });
  const a = technical("A", 1), b = technical("B", 2); mutateA?.(a); mutateB?.(b);
  const aPath = join(sandbox, "technical-a.json"), bPath = join(sandbox, "technical-b.json"), aRaw = privateJson(aPath, a), bRaw = privateJson(bPath, b);
  const runs = [{ rehearsal: "A", technicalArtifact: { artifact: "technical-a.json", rawSha256: aRaw } }, { rehearsal: "B", technicalArtifact: { artifact: "technical-b.json", rawSha256: bRaw } }];
  const combinedTechnicalSha256 = canonicalHash(runs.map((run, index) => ({ rehearsal: run.rehearsal, rawSha256: run.technicalArtifact.rawSha256, canonicalProjectionSha256: [a, b][index].canonicalProjectionSha256 })));
  const reviewerSubjectSha256 = digest("reviewer");
  const review = { formatVersion: 1, kind: "yuzhou_photo_detached_review_attestation", schemaVersion: "v1", status: "APPROVED", reviewerSubjectSha256, reviewedTechnicalEvidenceSha256: combinedTechnicalSha256, attestationContextSha256: canonicalHash({ triple, combinedTechnicalSha256, reviewerSubjectSha256 }) };
  mutateReview?.(review); const reviewPath = join(sandbox, "detached-review.json"), reviewRaw = privateJson(reviewPath, review);
  const evidence = { formatVersion: 1, kind: "yuzhou_photo_readiness_rehearsal_evidence_index", schemaVersion: "v1", triple, runs, combinedTechnicalSha256, detachedReview: { artifact: "detached-review.json", rawSha256: reviewRaw }, productionImport: "HOLD", evidenceSha256: null };
  mutateIndex?.(evidence); evidence.evidenceSha256 = photoRehearsalEvidenceHash(evidence);
  const indexPath = join(sandbox, "rehearsal-index.json"); privateJson(indexPath, evidence);
  return { sandbox, indexPath, aPath, bPath, reviewPath, evidence, a, b, review };
};
const withFixture = (options, callback) => {
  const fixture = rehearsalFixture(options);
  try { return callback(fixture); }
  finally { rmSync(fixture.sandbox, { recursive: true, force: true }); }
};

test("frozen photo and document facts remain metadata-only and HOLD", () => {
  const contract = load(), result = verifyYuzhouPhotoReadiness(contract);
  assert.equal(photoReadinessHash(contract), contract.contractSha256);
  assert.deepEqual(result.photos, { sourceRows: 2949, contentBearingRows: 2155, distinctContentHashes: 2150, emptyRows: 794 });
  assert.deepEqual(result.documents, { sourceRows: 1003, quarantinedRows: 1003 });
  assert.equal(result.binaryAccess, "FORBIDDEN_IN_READINESS");
  assert.equal(result.productionImport, "HOLD");
});

test("owner resolution requires exact active T0 maps and forbids guessing", () => {
  const source = load();
  rejects(source, value => { value.ownerResolution.method = "employee_name"; }, "YUZHOU_PHOTO_OWNER_METHOD_INVALID");
  rejects(source, value => { value.ownerResolution.guessingForbidden = false; }, "YUZHOU_PHOTO_OWNER_METHOD_INVALID");
  rejects(source, value => { value.ownerResolution.sourceTable = "dbo.person.photo"; }, "YUZHOU_PHOTO_OWNER_METHOD_INVALID");
  rejects(source, value => { value.ownerResolution.requiresActive = false; }, "YUZHOU_PHOTO_OWNER_METHOD_INVALID");
  rejects(source, value => { value.ownerResolution.targetScopeColumns.pop(); }, "YUZHOU_PHOTO_OWNER_SCOPE_INVALID");
  rejects(source, value => { value.ownerResolution.acceptedMappingStatuses = ["active"]; }, "YUZHOU_PHOTO_OWNER_STATUS_SET_INVALID");
  rejects(source, value => { value.ownerResolution.acceptedMappingStatuses.unshift("mapped"); }, "YUZHOU_PHOTO_OWNER_STATUS_SET_INVALID");
  rejects(source, value => { value.ownerResolution.targetJoin = "legacy_record_map.id=hr_employee.id"; }, "YUZHOU_PHOTO_OWNER_METHOD_INVALID");
  rejects(source, value => { value.ownerResolution.resolvedRows = 1; value.ownerResolution.pendingRows = 2154; }, "YUZHOU_PHOTO_OWNER_STATUS_OVERCLAIMED");
  rejects(source, value => { value.ownerResolution.pendingRows = 2154; }, "YUZHOU_PHOTO_OWNER_LEDGER_MISMATCH");
  rejects(source, value => { value.ownerResolution.rehearsalBinding.status = "BOUND"; }, "YUZHOU_PHOTO_OWNER_BINDING_OVERCLAIMED");
  rejects(source, value => { value.ownerResolution.rehearsalBinding.requiredEqualityFields.pop(); }, "YUZHOU_PHOTO_OWNER_REHEARSAL_FIELDS_INVALID");
});

test("photo row.person uses the exact existing T0 employee identity algorithm", () => {
  assert.deepEqual(deriveT0EmployeeLookupKey("  E001  "), { normalizedPerson: "E001", sourcePkCanonical: "person=E001", sourceIdentitySha256: "6c915e93000ed3d150f7e7bd90bca882623ceb3e8903a27f71fea40f824f2dcd" });
  assert.throws(() => deriveT0EmployeeLookupKey("  "), error => error?.code === "YUZHOU_PHOTO_OWNER_LOOKUP_KEY_INVALID");
  const transform = readFileSync(resolve(root, "scripts/transform-yuzhou-t0.mjs"), "utf8"), loader = readFileSync(resolve(root, "scripts/load-yuzhou-t0.sh"), "utf8"), t5 = readFileSync(resolve(root, "scripts/transform-yuzhou-t5-legacy-history.mjs"), "utf8");
  assert.match(transform, /sourceKey = String\(source\[domain\.key\] \?\? ""\)\.trim\(\)/u);
  assert.match(transform, /sourceIdentitySha256: sha256\(`\$\{domain\.table\}\\u0000\$\{sourceKey\}`\)/u);
  assert.match(loader, /'dbo\.person','person='\|\|\(s\.payload->>'sourceKey'\),s\.payload->>'sourceIdentitySha256'[\s\S]*'hr_employee'/u);
  assert.match(t5, /employeeCode:String\(row\.person\?\?""\)\.trim\(\)/u);
});

test("inventory aggregates are bound to the existing independently hashed T5 authority", () => {
  const source = load();
  assert.equal(source.sourceBinding.inventoryAuthority.rawSha256, "99669113cabd3319c8131de23b3a319847b3803c92bc867ac4e12068e566309c");
  assert.equal(source.sourceBinding.inventoryAuthority.businessManifestSha256, "5939691dfdddd5912992328dba58505f92bcfb7bb7de07ada571959a52d37005");
  rejects(source, value => { value.sourceBinding.inventoryAuthority.rawSha256 = "0".repeat(64); }, "YUZHOU_PHOTO_AUTHORITY_BINDING_INVALID");
  rejects(source, value => { value.sourceBinding.inventoryAuthority.businessManifestSha256 = "1".repeat(64); }, "YUZHOU_PHOTO_AUTHORITY_BINDING_INVALID");
});

test("inventory drift and document promotion fail closed", () => {
  const source = load();
  rejects(source, value => { value.inventory.photos.contentBearingRows = 2154; }, "YUZHOU_PHOTO_FROZEN_FACT_DRIFT");
  rejects(source, value => { value.inventory.photos.distinctContentHashes = 2149; }, "YUZHOU_PHOTO_FROZEN_FACT_DRIFT");
  rejects(source, value => { value.inventory.photos.sourceBytes += 1; }, "YUZHOU_PHOTO_FROZEN_FACT_DRIFT");
  rejects(source, value => { value.inventory.photos.payloadEstimate.exact = true; }, "YUZHOU_PHOTO_ESTIMATE_DRIFT");
  rejects(source, value => { value.inventory.documents.contentProvenRows = 1; }, "YUZHOU_DOCUMENT_FROZEN_FACT_DRIFT");
  rejects(source, value => { value.inventory.documents.quarantinedRows = 1002; }, "YUZHOU_DOCUMENT_FROZEN_FACT_DRIFT");
});

test("binary, conversion, target write, RBAC and idempotency overclaims fail closed", () => {
  const source = load();
  rejects(source, value => { value.sourceBinding.binaryAccess = "READ"; }, "YUZHOU_PHOTO_SOURCE_ACCESS_NOT_HELD");
  rejects(source, value => { value.normalizationPlan.executionStatus = "PASS"; }, "YUZHOU_PHOTO_NORMALIZATION_OVERCLAIMED");
  rejects(source, value => { value.normalizationPlan.bmpPipeline.splice(2, 1); }, "YUZHOU_PHOTO_BMP_PIPELINE_INVALID");
  assert.equal(source.normalizationPlan.preflightPolicy.version, YUZHOU_PHOTO_NORMALIZATION_PREFLIGHT_POLICY.version);
  assert.equal(source.normalizationPlan.preflightPolicy.policySha256, photoNormalizationPreflightPolicyHash());
  rejects(source, value => { value.normalizationPlan.preflightPolicy.maxPixels += 1; }, "YUZHOU_PHOTO_PREFLIGHT_POLICY_INVALID");
  rejects(source, value => { value.normalizationPlan.preflightPolicy.artifactSha256 = "0".repeat(64); }, "YUZHOU_PHOTO_PREFLIGHT_ARTIFACT_HASH_MISMATCH");
  rejects(source, value => { value.normalizationPlan.acceptedTargetMime.push("image/bmp"); }, "YUZHOU_PHOTO_TARGET_MIME_INVALID");
  rejects(source, value => { value.targetPlan.metadataCreated = 1; }, "YUZHOU_PHOTO_TARGET_SIDE_EFFECT");
  rejects(source, value => { value.targetPlan.downloadUrlGenerated = true; }, "YUZHOU_PHOTO_TARGET_SIDE_EFFECT");
  rejects(source, value => { value.accessControl.permissionAtoms.pop(); }, "YUZHOU_PHOTO_RBAC_ATOMS_INVALID");
  rejects(source, value => { value.accessControl.failureProjection = "error_only"; }, "YUZHOU_PHOTO_RBAC_FAIL_CLOSED_INVALID");
  rejects(source, value => { value.idempotency.keyParts.pop(); }, "YUZHOU_PHOTO_IDEMPOTENCY_KEY_INVALID");
});

test("A/B, rollback, human review and production cannot be self-promoted", () => {
  const source = load();
  rejects(source, value => { value.rehearsalGates.rehearsalA = "PASS"; }, "YUZHOU_PHOTO_AB_OVERCLAIMED");
  rejects(source, value => { value.auditAndRollback.status = "PASS"; }, "YUZHOU_PHOTO_ROLLBACK_OVERCLAIMED");
  rejects(source, value => { value.auditAndRollback.rollbackOrder[0] = "hr_employee_document_link"; }, "YUZHOU_PHOTO_ROLLBACK_ORDER_INVALID");
  rejects(source, value => { value.auditAndRollback.residualTables[1] = "sys_file_metadata"; }, "YUZHOU_PHOTO_RESIDUAL_SCOPE_INVALID");
  rejects(source, value => { value.auditAndRollback.mapRollbackScope = "all_legacy_record_map"; }, "YUZHOU_PHOTO_MAP_ROLLBACK_SCOPE_INVALID");
  rejects(source, value => { value.auditAndRollback.mapRollbackMutation.isActive = true; }, "YUZHOU_PHOTO_MAP_ROLLBACK_MUTATION_INVALID");
  rejects(source, value => { value.auditAndRollback.requiredResidualZero.binaryObjects = 1; }, "YUZHOU_PHOTO_RESIDUAL_ZERO_OVERCLAIMED");
  rejects(source, value => { value.auditAndRollback.observedResiduals = { activeDatabaseRows: 0, binaryObjects: 0, temporaryArtifacts: 0 }; }, "YUZHOU_PHOTO_RESIDUAL_ZERO_OVERCLAIMED");
  rejects(source, value => { value.verdict.engineeringReadiness = "GO"; }, "YUZHOU_PHOTO_VERDICT_NOT_HELD");
  rejects(source, value => { value.verdict.productionImport = "GO"; }, "YUZHOU_PHOTO_VERDICT_NOT_HELD");
  rejects(source, value => { value.verdict.reasonCodes.pop(); }, "YUZHOU_PHOTO_REASON_CODES_INVALID");
});

test("future rehearsal evidence requires controlled external A/B and review artifacts", () => {
  withFixture({}, fixture => {
    const result = verifyYuzhouPhotoRehearsalEvidenceFromPath(fixture.indexPath);
    assert.equal(result.status, "PASS");
    assert.equal(result.productionImport, "HOLD");
    assert.equal(photoRehearsalEvidenceHash(reverseKeys(fixture.evidence)), fixture.evidence.evidenceSha256);
    assert.throws(() => verifyYuzhouPhotoRehearsalEvidence(fixture.evidence), error => error?.code === "YUZHOU_PHOTO_REHEARSAL_EXTERNAL_INDEX_REQUIRED");
    const cli = JSON.parse(execFileSync(process.execPath, [resolve(root, "scripts/hr-cutover/verify-yuzhou-photo-readiness-rehearsal-evidence.mjs"), "--evidence", fixture.indexPath], { cwd: root, encoding: "utf8" }));
    assert.equal(cli.status, "PASS");
    assert.equal(cli.productionImport, "HOLD");
  });
});

test("each external run independently proves scope, RBAC, idempotency and zero residuals", () => {
  const cases = [
    [{ mutateB: value => { value.triple.codeSha = "d".repeat(40); } }, "YUZHOU_PHOTO_REHEARSAL_RUN_BINDING_INVALID"],
    [{ mutateB: value => { value.resourceHashes.database = digest("database-1"); } }, "YUZHOU_PHOTO_REHEARSAL_RESOURCE_REUSED"],
    [{ mutateA: value => { value.ownerLedger.mappingStatusCounts.loaded += 1; } }, "YUZHOU_PHOTO_REHEARSAL_OWNER_LEDGER_INVALID"],
    [{ mutateB: value => { value.canonicalProjectionSha256 = digest("drift"); } }, "YUZHOU_PHOTO_REHEARSAL_CANONICAL_DRIFT"],
    [{ mutateA: value => { value.rbac.negativePassed = false; } }, "YUZHOU_PHOTO_REHEARSAL_RBAC_INVALID"],
    [{ mutateB: value => { value.idempotency.hashConflictRejected = false; } }, "YUZHOU_PHOTO_REHEARSAL_IDEMPOTENCY_INVALID"],
    [{ mutateA: value => { value.residuals.binaryObjects = 1; } }, "YUZHOU_PHOTO_REHEARSAL_RESIDUAL_NONZERO"],
    [{ mutateReview: value => { value.reviewedTechnicalEvidenceSha256 = digest("wrong"); } }, "YUZHOU_PHOTO_REHEARSAL_REVIEW_BINDING_INVALID"],
    [{ mutateReview: value => { value.reviewerSubjectSha256 = digest("self-signed-reviewer"); } }, "YUZHOU_PHOTO_REHEARSAL_REVIEW_BINDING_INVALID"],
    [{ mutateIndex: value => { value.productionImport = "GO"; } }, "YUZHOU_PHOTO_REHEARSAL_PRODUCTION_NOT_HELD"],
    [{ mutateIndex: value => { value.rbac = { positivePassed: true, negativePassed: true, observationSha256: digest("fabricated") }; } }, "YUZHOU_PHOTO_REHEARSAL_SHAPE_INVALID"],
    [{ mutateIndex: value => { value.runs.pop(); } }, "YUZHOU_PHOTO_REHEARSAL_RUN_SET_INVALID"]
  ];
  for (const [options, code] of cases) withFixture(options, fixture => {
    assert.throws(() => verifyYuzhouPhotoRehearsalEvidenceFromPath(fixture.indexPath), error => error?.code === code, `expected ${code}`);
  });
});

test("rehearsal verifier rejects permission, link and byte tampering", () => {
  const cases = [
    [fixture => chmodSync(fixture.indexPath, 0o644), "YUZHOU_PHOTO_REHEARSAL_INDEX_UNSAFE"],
    [fixture => chmodSync(fixture.aPath, 0o644), "YUZHOU_PHOTO_REHEARSAL_ARTIFACT_UNSAFE"],
    [fixture => chmodSync(fixture.reviewPath, 0o644), "YUZHOU_PHOTO_REHEARSAL_ARTIFACT_UNSAFE"],
    [fixture => writeFileSync(fixture.bPath, `${JSON.stringify({ fabricated: true })}\n`), "YUZHOU_PHOTO_REHEARSAL_ARTIFACT_HASH_MISMATCH"],
    [fixture => { rmSync(fixture.bPath); symlinkSync(fixture.aPath, fixture.bPath); }, "YUZHOU_PHOTO_REHEARSAL_ARTIFACT_UNSAFE"],
    [fixture => { rmSync(fixture.bPath); linkSync(fixture.aPath, fixture.bPath); }, "YUZHOU_PHOTO_REHEARSAL_ARTIFACT_UNSAFE"]
  ];
  for (const [mutate, code] of cases) withFixture({}, fixture => {
    mutate(fixture);
    assert.throws(() => verifyYuzhouPhotoRehearsalEvidenceFromPath(fixture.indexPath), error => error?.code === code, `expected ${code}`);
  });
});

test("readiness pins the independent future rehearsal schema but cannot claim evidence", () => {
  const contract = load(), schema = JSON.parse(readFileSync(resolve(root, contract.rehearsalEvidenceContract.artifact), "utf8"));
  assert.equal(contract.rehearsalEvidenceContract.schemaVersion, "v1");
  assert.equal(contract.rehearsalEvidenceContract.status, "NOT_EXECUTED");
  assert.equal(contract.rehearsalEvidenceContract.evidenceSha256, null);
  assert.deepEqual(schema.required, ["formatVersion", "kind", "schemaVersion", "triple", "runs", "combinedTechnicalSha256", "detachedReview", "productionImport", "evidenceSha256"]);
  assert.deepEqual(contract.rehearsalEvidenceContract.verifierArtifacts.map(item => item.artifact), ["scripts/hr-cutover/yuzhou-photo-readiness-rehearsal-evidence-lib.mjs", "scripts/hr-cutover/verify-yuzhou-photo-readiness-rehearsal-evidence.mjs"]);
  for (const item of contract.rehearsalEvidenceContract.verifierArtifacts) assert.equal(digest(readFileSync(resolve(root, item.artifact))), item.rawSha256);
  rejects(contract, value => { value.rehearsalEvidenceContract.status = "PASS"; }, "YUZHOU_PHOTO_REHEARSAL_CONTRACT_INVALID");
  rejects(contract, value => { value.rehearsalEvidenceContract.schemaSha256 = "0".repeat(64); }, "YUZHOU_PHOTO_REHEARSAL_CONTRACT_INVALID");
  rejects(contract, value => { value.rehearsalEvidenceContract.verifierArtifacts[0].rawSha256 = "0".repeat(64); }, "YUZHOU_PHOTO_REHEARSAL_VERIFIER_BINDING_INVALID");
  rejects(contract, value => { value.rehearsalEvidenceContract.verifierArtifacts.pop(); }, "YUZHOU_PHOTO_REHEARSAL_VERIFIER_BINDING_INVALID");
});

test("canonical contract hash is invariant to nested object key order", () => {
  const source = load(), reordered = reverseKeys(source);
  assert.equal(photoReadinessHash(reordered), source.contractSha256);
  assert.equal(verifyYuzhouPhotoReadiness(reordered).contractSha256, source.contractSha256);
});

test("owner and target contracts match the real migration and runtime schema", () => {
  const migrationControl = readFileSync(resolve(root, "database/migrations/000235_hr_legacy_migration_control.sql"), "utf8");
  const employeeFoundation = readFileSync(resolve(root, "database/migrations/000230_hr_employee_foundation.sql"), "utf8");
  const filesSchema = readFileSync(resolve(root, "database/migrations/000004_files_center.sql"), "utf8");
  const t0Loader = readFileSync(resolve(root, "scripts/load-yuzhou-t0.sh"), "utf8");
  const fileAccess = readFileSync(resolve(root, "apps/api/src/modules/files/file-business-access.service.ts"), "utf8");
  const permissions = readFileSync(resolve(root, "packages/shared/src/hr.ts"), "utf8");
  const owner = load().ownerResolution;
  assert.equal(owner.targetScopeTable, "hr_employee");
  assert.equal(owner.targetJoin, "legacy_record_map.target_id=hr_employee.id");
  assert.deepEqual(owner.targetScopeColumns, ["tenant_id", "park_id"]);
  assert.deepEqual(owner.acceptedMappingStatuses, ["loaded", "verified"]);
  assert.match(migrationControl, /CREATE TABLE IF NOT EXISTS legacy_record_map[\s\S]*is_active boolean NOT NULL DEFAULT true/u);
  assert.match(migrationControl, /ck_legacy_record_map_status CHECK \(mapping_status IN \('mapped','loaded','verified','quarantined','rolled_back'\)\)/u);
  assert.match(t0Loader, /'yuzhou-v10','dbo\.person'[\s\S]*'hr_employee',[^\n]+,'loaded'/u);
  assert.match(employeeFoundation, /CREATE TABLE IF NOT EXISTS hr_employee \(/u);
  assert.match(employeeFoundation, /CREATE TABLE IF NOT EXISTS hr_employee \([\s\S]*tenant_id varchar\(64\) NOT NULL,park_id varchar\(64\) NOT NULL/u);
  assert.match(employeeFoundation, /CREATE TABLE IF NOT EXISTS hr_employee_document \([\s\S]*file_id uuid NOT NULL REFERENCES sys_file\(id\)/u);
  assert.match(filesSchema, /CREATE TABLE IF NOT EXISTS sys_file \([\s\S]*biz_type varchar\(64\) NOT NULL/u);
  assert.match(fileAccess, /bizType === "hr_employee_document" \|\| bizType === "hr_employee_photo"/u);
  for (const atom of ["hr:employee_document:read", "hr:employee_document:team_read", "hr:employee_document:self_read", "hr:employee_document:manage"]) assert.equal(permissions.includes(atom), true, `missing ${atom}`);
  assert.equal(load().auditAndRollback.rollbackOrder.includes("hr_employee_document_link"), false);
  assert.equal(load().auditAndRollback.rollbackOrder.includes("sys_file_metadata"), false);
});

test("paths, URLs, source values, binary fields and hash tamper are rejected", () => {
  const source = load();
  rejects(source, value => { value.legacyPath = "private/source"; }, "YUZHOU_PHOTO_READINESS_FORBIDDEN_FIELD");
  rejects(source, value => { value.sourceValue = "person"; }, "YUZHOU_PHOTO_READINESS_FORBIDDEN_FIELD");
  rejects(source, value => { value.binary = "AA=="; }, "YUZHOU_PHOTO_READINESS_FORBIDDEN_FIELD");
  rejects(source, value => { value.note = "https://example.invalid/file"; }, "YUZHOU_PHOTO_READINESS_SENSITIVE_VALUE");
  rejects(source, value => { value.contractSha256 = "0".repeat(64); }, "YUZHOU_PHOTO_CONTRACT_HASH_MISMATCH");
});

test("CLI reports only aggregate readiness and never a path or URL", () => {
  const output = execFileSync(process.execPath, [verifierPath], { cwd: root, encoding: "utf8" });
  const result = JSON.parse(output);
  assert.equal(result.status, "NO_GO");
  assert.equal(result.productionImport, "HOLD");
  assert.doesNotMatch(output, /(?:\/Users\/|file:\/\/|https?:\/\/|downloadUrl|sourceValue)/u);
});
