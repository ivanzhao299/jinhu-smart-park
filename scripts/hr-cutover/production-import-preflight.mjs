#!/usr/bin/env node
/* global process, structuredClone, URL */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const DEFAULT_CONTRACT_PATH = resolve(ROOT, "scripts/hr-cutover/contracts/production-import-preflight-v1.json");
const DEFAULT_ALLOWLIST_PATH = resolve(ROOT, "scripts/hr-cutover/contracts/production-import-target-allowlist-v1.json");
const DEFAULT_CONTRACT = JSON.parse(readFileSync(DEFAULT_CONTRACT_PATH, "utf8"));
const DEFAULT_ALLOWLIST = JSON.parse(readFileSync(DEFAULT_ALLOWLIST_PATH, "utf8"));
const SHA256 = /^[0-9a-f]{64}$/u;
const CODE_SHA = /^[0-9a-f]{40}$/u;
const OPERATION_ID = /^yzprod-import-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{12}$/u;
const SAFE_ALIAS = /^[a-z0-9][a-z0-9-]{5,63}$/u;
const FORBIDDEN_KEY = /password|passwd|token|secret|connectionstring|credential|privatekey|bankaccount|idcard|insureaccount|employeename|fullname|mobile|phone|salaryamount|grosspay|netpay/iu;
const FORBIDDEN_VALUE = /postgres(?:ql)?:\/\/|sqlserver:\/\/|Bearer\s+|BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY|AKIA[0-9A-Z]{16}/iu;
const FORBIDDEN_PII_VALUE = /(?<!\d)(?:1[3-9]\d{9}|\d{17}[0-9Xx]|\d{16,19})(?!\d)/u;

export class ProductionImportPreflightError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "ProductionImportPreflightError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new ProductionImportPreflightError(code, detail); };
const sha256 = value => createHash("sha256").update(value).digest("hex");
const canonicalJson = value => {
  if (value === null) return "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
};
const same = (left, right) => canonicalJson(left) === canonicalJson(right);

function object(value, code, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code, `${label} must be an object`);
}

function exactKeys(value, required, optional, code, label) {
  object(value, code, label);
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) if (!allowed.has(key)) fail(code, `${label}.${key} is not allowed`);
  for (const key of required) if (!Object.hasOwn(value, key)) fail(code, `${label}.${key} is required`);
}

function assertSha(value, code, label) {
  if (!SHA256.test(value ?? "")) fail(code, `${label} must be a lowercase SHA-256`);
}

function validateTriple(triple, code, label) {
  exactKeys(triple, ["codeSha", "sourceSnapshotHash", "mappingContractHash"], [], code, label);
  if (!CODE_SHA.test(triple.codeSha ?? "")) fail(code, `${label}.codeSha invalid`);
  assertSha(triple.sourceSnapshotHash, code, `${label}.sourceSnapshotHash`);
  assertSha(triple.mappingContractHash, code, `${label}.mappingContractHash`);
}

function scanArtifact(value, at = "$") {
  if (Array.isArray(value)) return value.forEach((item, index) => scanArtifact(item, `${at}[${index}]`));
  if (value && typeof value === "object") return Object.entries(value).forEach(([key, child]) => {
    if (FORBIDDEN_KEY.test(key) && key !== "secretDelivery") fail("PRODUCTION_IMPORT_ARTIFACT_INVALID", `${at}.${key} is forbidden`);
    scanArtifact(child, `${at}.${key}`);
  });
  if (typeof value === "string" && (FORBIDDEN_VALUE.test(value) || FORBIDDEN_PII_VALUE.test(value))) fail("PRODUCTION_IMPORT_ARTIFACT_INVALID", `${at} contains forbidden material`);
}

function timestamp(value, code, label) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value)) fail(code, `${label} must be a UTC timestamp`);
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) fail(code, `${label} is invalid`);
  return parsed;
}

export function computeProductionImportPlanningContractHash(contract = DEFAULT_CONTRACT) {
  if (contract?.planningContractHashAlgorithm !== "sha256_path_nul_bytes_nul_sorted" || !Array.isArray(contract.planningContractComponents) || contract.planningContractComponents.length === 0) fail("PRODUCTION_IMPORT_PLAN_INVALID", "planning contract components missing");
  const hash = createHash("sha256");
  const seen = new Set();
  for (const relativePath of [...contract.planningContractComponents].sort()) {
    if (typeof relativePath !== "string" || isAbsolute(relativePath) || relativePath.split(/[\\/]/u).includes("..") || seen.has(relativePath)) fail("PRODUCTION_IMPORT_PLAN_INVALID", "planning contract component invalid");
    seen.add(relativePath);
    const absolute = resolve(ROOT, relativePath);
    if (!absolute.startsWith(`${ROOT}${sep}`) || !statSync(absolute).isFile()) fail("PRODUCTION_IMPORT_PLAN_INVALID", "planning contract component unavailable");
    hash.update(relativePath).update("\0").update(readFileSync(absolute)).update("\0");
  }
  return hash.digest("hex");
}

function validatePlanShape(plan, contract) {
  const keys = ["formatVersion", "planKind", "operationId", "mode", "sourceSurface", "triple", "planningContractSha256", "target", "window", "artifacts", "authorityBoundary", "productionImport"];
  exactKeys(plan, keys, [], "PRODUCTION_IMPORT_PLAN_INVALID", "plan");
  if (plan.formatVersion !== 1 || plan.planKind !== "yuzhou_hr_production_import_preflight_plan" || plan.productionImport !== "HOLD") fail("PRODUCTION_IMPORT_PLAN_INVALID", "identity/boundary invalid");
  if (!OPERATION_ID.test(plan.operationId ?? "")) fail("PRODUCTION_IMPORT_OPERATION_ID_INVALID", "operationId invalid");
  if (plan.mode !== "DRY_RUN") fail("PRODUCTION_IMPORT_MODE_NOT_DRY_RUN", "only DRY_RUN is accepted");
  if (plan.sourceSurface !== contract.allowedSourceSurface) fail("PRODUCTION_IMPORT_SOURCE_SURFACE_INVALID", "source surface must be the retired client database");
  validateTriple(plan.triple, "PRODUCTION_IMPORT_PLAN_INVALID", "plan.triple");
  assertSha(plan.planningContractSha256, "PRODUCTION_IMPORT_PLAN_INVALID", "planningContractSha256");
  if (plan.planningContractSha256 !== computeProductionImportPlanningContractHash(contract)) fail("PRODUCTION_IMPORT_PLANNING_CONTRACT_MISMATCH", "planning contract bytes differ");
  exactKeys(plan.target, ["environment", "alias", "identitySha256"], [], "PRODUCTION_IMPORT_PLAN_INVALID", "plan.target");
  if (plan.target.environment !== "production" || !SAFE_ALIAS.test(plan.target.alias ?? "")) fail("PRODUCTION_IMPORT_TARGET_MISMATCH", "production target identity invalid");
  assertSha(plan.target.identitySha256, "PRODUCTION_IMPORT_TARGET_MISMATCH", "target identity");
  exactKeys(plan.window, ["startsAt", "endsAt"], [], "PRODUCTION_IMPORT_PLAN_INVALID", "plan.window");
  const startsAt = timestamp(plan.window.startsAt, "PRODUCTION_IMPORT_PLAN_INVALID", "window.startsAt");
  const endsAt = timestamp(plan.window.endsAt, "PRODUCTION_IMPORT_PLAN_INVALID", "window.endsAt");
  if (startsAt >= endsAt) fail("PRODUCTION_IMPORT_PLAN_INVALID", "window must be increasing");
  exactKeys(plan.authorityBoundary, ["acceptedIntent", "restoreAuthorizationAccepted", "secretDelivery", "executionAvailable"], [], "PRODUCTION_IMPORT_PLAN_INVALID", "authorityBoundary");
  if (plan.authorityBoundary.acceptedIntent !== "production_import" || plan.authorityBoundary.restoreAuthorizationAccepted !== false) fail("PRODUCTION_IMPORT_IMPORT_RESTORE_AUTHORITY_NOT_SEPARATE", "restore authority is never accepted by import preflight");
  if (plan.authorityBoundary.secretDelivery !== "OUT_OF_BAND_REQUIRED" || plan.authorityBoundary.executionAvailable !== false) fail("PRODUCTION_IMPORT_PLAN_INVALID", "execution must remain unavailable");
  if (!Array.isArray(plan.artifacts)) fail("PRODUCTION_IMPORT_ARTIFACT_INVALID", "artifacts must be an array");
  const roles = new Set();
  const paths = new Set();
  for (const artifact of plan.artifacts) {
    exactKeys(artifact, ["role", "relativePath", "sha256"], [], "PRODUCTION_IMPORT_ARTIFACT_INVALID", "artifact");
    if (typeof artifact.role !== "string" || roles.has(artifact.role)) fail("PRODUCTION_IMPORT_ARTIFACT_INVALID", "artifact role duplicate/invalid");
    roles.add(artifact.role);
    if (typeof artifact.relativePath !== "string" || !artifact.relativePath || isAbsolute(artifact.relativePath) || artifact.relativePath.split(/[\\/]/u).includes("..") || paths.has(artifact.relativePath)) fail("PRODUCTION_IMPORT_ARTIFACT_INVALID", "artifact path duplicate/invalid");
    paths.add(artifact.relativePath);
    assertSha(artifact.sha256, "PRODUCTION_IMPORT_ARTIFACT_INVALID", artifact.role);
  }
  for (const role of contract.requiredArtifactRoles) {
    if (roles.has(role)) continue;
    if (role === "one_time_import_authorization") fail("PRODUCTION_IMPORT_AUTH_MISSING", role);
    if (role.startsWith("before_image_")) fail("PRODUCTION_IMPORT_BEFORE_IMAGE_MISSING", role);
    if (role.startsWith("legacy_record_map_")) fail("PRODUCTION_IMPORT_RECORD_MAP_MISSING", role);
    fail("PRODUCTION_IMPORT_ARTIFACT_INVALID", `missing ${role}`);
  }
  if (roles.size !== contract.requiredArtifactRoles.length) fail("PRODUCTION_IMPORT_ARTIFACT_INVALID", "artifact role set must be exact");
  return { startsAt, endsAt };
}

function assertNoSymlinkComponents(root, relativePath) {
  let cursor = root;
  for (const segment of relativePath.split(/[\\/]/u)) {
    cursor = resolve(cursor, segment);
    if (!existsSync(cursor) || lstatSync(cursor).isSymbolicLink()) fail("PRODUCTION_IMPORT_ARTIFACT_UNSAFE", "artifact component is missing or symbolic");
  }
}

function loadArtifacts(plan, evidenceRoot) {
  if (typeof evidenceRoot !== "string" || !isAbsolute(evidenceRoot) || !existsSync(evidenceRoot) || lstatSync(evidenceRoot).isSymbolicLink()) fail("PRODUCTION_IMPORT_ARTIFACT_UNSAFE", "evidence root invalid");
  const root = realpathSync(resolve(evidenceRoot));
  const rootStat = statSync(root);
  if (!rootStat.isDirectory() || (rootStat.mode & 0o777) !== 0o700 || (typeof process.getuid === "function" && rootStat.uid !== process.getuid())) fail("PRODUCTION_IMPORT_ARTIFACT_UNSAFE", "evidence root must be owned 0700");
  const loaded = new Map();
  for (const declaration of plan.artifacts) {
    assertNoSymlinkComponents(root, declaration.relativePath);
    const candidate = resolve(root, declaration.relativePath);
    if (!candidate.startsWith(`${root}${sep}`)) fail("PRODUCTION_IMPORT_ARTIFACT_UNSAFE", "artifact escaped evidence root");
    const actual = realpathSync(candidate);
    if (!actual.startsWith(`${root}${sep}`)) fail("PRODUCTION_IMPORT_ARTIFACT_UNSAFE", "artifact realpath escaped evidence root");
    const stat = statSync(actual);
    if (!stat.isFile() || (stat.mode & 0o777) !== 0o600 || (typeof process.getuid === "function" && stat.uid !== process.getuid())) fail("PRODUCTION_IMPORT_ARTIFACT_UNSAFE", "artifact must be owned 0600 regular file");
    const bytes = readFileSync(actual);
    if (sha256(bytes) !== declaration.sha256) fail("PRODUCTION_IMPORT_ARTIFACT_HASH_MISMATCH", declaration.role);
    let json;
    try { json = JSON.parse(bytes.toString("utf8")); } catch { fail("PRODUCTION_IMPORT_ARTIFACT_INVALID", declaration.role); }
    scanArtifact(json, declaration.role);
    loaded.set(declaration.role, { declaration, json });
  }
  return loaded;
}

function validatePairEvidence(pair, plan) {
  exactKeys(pair, ["formatVersion", "status", "contractSha256", "triple", "rehearsals", "sourceFacts", "humanUat", "productionImport"], [], "PRODUCTION_IMPORT_AB_EVIDENCE_INVALID", "final rehearsal pair");
  if (pair.formatVersion !== 1 || pair.status !== "PASS" || pair.humanUat !== "HOLD" || pair.productionImport !== "HOLD" || !same(pair.triple, plan.triple)) fail("PRODUCTION_IMPORT_AB_EVIDENCE_INVALID", "pair identity/status invalid");
  validateTriple(pair.triple, "PRODUCTION_IMPORT_AB_EVIDENCE_INVALID", "pair.triple");
  assertSha(pair.contractSha256, "PRODUCTION_IMPORT_AB_EVIDENCE_INVALID", "pair contract");
  if (!Array.isArray(pair.rehearsals) || pair.rehearsals.length !== 2 || pair.rehearsals.map(row => row.rehearsal).join("") !== "AB") fail("PRODUCTION_IMPORT_AB_EVIDENCE_INVALID", "A/B exact pair missing");
  for (const row of pair.rehearsals) {
    exactKeys(row, ["rehearsal", "manifestSha256", "cleanupAuditSha256", "residualCount"], [], "PRODUCTION_IMPORT_AB_EVIDENCE_INVALID", "rehearsal");
    assertSha(row.manifestSha256, "PRODUCTION_IMPORT_AB_EVIDENCE_INVALID", "manifest");
    assertSha(row.cleanupAuditSha256, "PRODUCTION_IMPORT_AB_EVIDENCE_INVALID", "cleanup");
    if (row.residualCount !== 0) fail("PRODUCTION_IMPORT_AB_EVIDENCE_INVALID", "A/B residual must be zero");
  }
}

function validateConflictDecision(decision, phase, contract) {
  exactKeys(decision, ["sourceIdentitySha256", "strategy", "existingTargetIdentitySha256", "beforeImageSha256", "legacyRecordMapSha256"], ["decisionAttestationSha256"], "PRODUCTION_IMPORT_MANIFEST_INVALID", `${phase}.conflictDecision`);
  for (const field of ["sourceIdentitySha256", "existingTargetIdentitySha256", "beforeImageSha256", "legacyRecordMapSha256"]) assertSha(decision[field], "PRODUCTION_IMPORT_MANIFEST_INVALID", `${phase}.${field}`);
  if (decision.strategy === "overwrite") fail("PRODUCTION_IMPORT_OVERWRITE_FORBIDDEN", phase);
  if (!contract.allowedConflictStrategies.includes(decision.strategy)) fail("PRODUCTION_IMPORT_CONFLICT_STRATEGY_INVALID", phase);
  if (!decision.decisionAttestationSha256) fail("PRODUCTION_IMPORT_CONFLICT_UNSIGNED", phase);
  assertSha(decision.decisionAttestationSha256, "PRODUCTION_IMPORT_CONFLICT_UNSIGNED", phase);
}

function validatePhaseArtifact(value, phase, targetIdentitySha256, kind) {
  const code = kind === "before_image" ? "PRODUCTION_IMPORT_BEFORE_IMAGE_MISSING" : "PRODUCTION_IMPORT_RECORD_MAP_MISSING";
  const required = kind === "before_image"
    ? ["formatVersion", "artifactKind", "phase", "targetIdentitySha256", "canonicalSha256", "tableLedgerSha256", "rowCount", "createdAt", "productionImport"]
    : ["formatVersion", "artifactKind", "phase", "targetIdentitySha256", "activeMapSha256", "sourceIdentityLedgerSha256", "rowCount", "exactSourceIdentity", "createdAt", "productionImport"];
  exactKeys(value, required, [], code, `${phase}.${kind}`);
  const expectedKind = kind === "before_image" ? "yuzhou_hr_production_before_image" : "yuzhou_hr_production_legacy_record_map_snapshot";
  if (value.formatVersion !== 1 || value.artifactKind !== expectedKind || value.phase !== phase || value.targetIdentitySha256 !== targetIdentitySha256 || value.productionImport !== "HOLD") fail(code, `${phase}.${kind} identity invalid`);
  const digestFields = kind === "before_image" ? ["canonicalSha256", "tableLedgerSha256"] : ["activeMapSha256", "sourceIdentityLedgerSha256"];
  for (const field of digestFields) assertSha(value[field], code, `${phase}.${field}`);
  if (!Number.isSafeInteger(value.rowCount) || value.rowCount < 0) fail(code, `${phase}.rowCount invalid`);
  if (kind === "legacy_record_map" && value.exactSourceIdentity !== true) fail(code, `${phase}.exactSourceIdentity required`);
  timestamp(value.createdAt, code, `${phase}.createdAt`);
}

function validateConflictLedger(ledger, plan, contract) {
  exactKeys(ledger, ["formatVersion", "artifactKind", "operationId", "targetIdentitySha256", "entries", "productionImport"], [], "PRODUCTION_IMPORT_CONFLICT_UNSIGNED", "conflict decision ledger");
  if (ledger.formatVersion !== 1 || ledger.artifactKind !== "yuzhou_hr_production_conflict_decision_ledger" || ledger.operationId !== plan.operationId || ledger.targetIdentitySha256 !== plan.target.identitySha256 || ledger.productionImport !== "HOLD" || !Array.isArray(ledger.entries)) fail("PRODUCTION_IMPORT_CONFLICT_UNSIGNED", "conflict ledger identity invalid");
  const entries = new Map();
  for (const entry of ledger.entries) {
    exactKeys(entry, ["phase", "sourceIdentitySha256", "strategy", "existingTargetIdentitySha256", "beforeImageSha256", "legacyRecordMapSha256", "decisionAttestationSha256", "signerRole", "attestedAt"], [], "PRODUCTION_IMPORT_CONFLICT_UNSIGNED", "conflict ledger entry");
    if (!contract.firstWavePhaseOrder.includes(entry.phase) || !contract.allowedConflictStrategies.includes(entry.strategy) || !contract.requiredApprovalRoles.includes(entry.signerRole)) fail("PRODUCTION_IMPORT_CONFLICT_UNSIGNED", "conflict ledger scope/strategy/signer invalid");
    for (const field of ["sourceIdentitySha256", "existingTargetIdentitySha256", "beforeImageSha256", "legacyRecordMapSha256", "decisionAttestationSha256"]) assertSha(entry[field], "PRODUCTION_IMPORT_CONFLICT_UNSIGNED", field);
    timestamp(entry.attestedAt, "PRODUCTION_IMPORT_CONFLICT_UNSIGNED", "attestedAt");
    const identity = `${entry.phase}:${entry.sourceIdentitySha256}`;
    if (entries.has(identity)) fail("PRODUCTION_IMPORT_CONFLICT_UNSIGNED", "duplicate conflict attestation");
    entries.set(identity, entry);
  }
  return entries;
}

function validateImportManifest(manifest, plan, artifacts, contract) {
  const required = ["formatVersion", "manifestKind", "operationId", "sourceSurface", "triple", "targetIdentitySha256", "conflictDecisionLedgerSha256", "phaseOrder", "phases", "optionalT5A", "identityResolution", "rollback", "invariants", "productionImport"];
  exactKeys(manifest, required, [], "PRODUCTION_IMPORT_MANIFEST_INVALID", "import manifest");
  if (manifest.formatVersion !== 1 || manifest.manifestKind !== "yuzhou_hr_production_import_manifest" || manifest.operationId !== plan.operationId || manifest.productionImport !== "HOLD") fail("PRODUCTION_IMPORT_MANIFEST_INVALID", "manifest identity invalid");
  validateTriple(manifest.triple, "PRODUCTION_IMPORT_MANIFEST_INVALID", "manifest.triple");
  if (manifest.sourceSurface !== contract.allowedSourceSurface || manifest.sourceSurface !== plan.sourceSurface) fail("PRODUCTION_IMPORT_SOURCE_SURFACE_INVALID", "manifest surface invalid");
  if (manifest.triple?.codeSha !== plan.triple.codeSha) fail("PRODUCTION_IMPORT_CODE_SHA_MISMATCH", "manifest code SHA differs");
  if (manifest.triple?.sourceSnapshotHash !== plan.triple.sourceSnapshotHash) fail("PRODUCTION_IMPORT_SOURCE_SNAPSHOT_MISMATCH", "manifest source snapshot differs");
  if (manifest.triple?.mappingContractHash !== plan.triple.mappingContractHash) fail("PRODUCTION_IMPORT_MAPPING_CONTRACT_MISMATCH", "manifest mapping contract differs");
  if (manifest.targetIdentitySha256 !== plan.target.identitySha256) fail("PRODUCTION_IMPORT_TARGET_MISMATCH", "manifest target differs");
  assertSha(manifest.conflictDecisionLedgerSha256, "PRODUCTION_IMPORT_CONFLICT_UNSIGNED", "conflictDecisionLedgerSha256");
  if (artifacts.get("conflict_decision_ledger")?.declaration.sha256 !== manifest.conflictDecisionLedgerSha256) fail("PRODUCTION_IMPORT_CONFLICT_UNSIGNED", "conflict decision ledger hash differs");
  const conflictEntries = validateConflictLedger(artifacts.get("conflict_decision_ledger").json, plan, contract);
  if (!same(manifest.phaseOrder, contract.firstWavePhaseOrder) || !Array.isArray(manifest.phases) || manifest.phases.length !== contract.firstWavePhaseOrder.length) fail("PRODUCTION_IMPORT_PHASE_SEQUENCE_INVALID", "first wave must be T0 through T3");
  for (let index = 0; index < manifest.phases.length; index += 1) {
    const phase = manifest.phases[index];
    exactKeys(phase, ["phase", "sourceBatchManifestSha256", "beforeImageSha256", "legacyRecordMapSha256", "existingRecordStrategy", "existingConflictCount", "conflictDecisions"], [], "PRODUCTION_IMPORT_MANIFEST_INVALID", `phases[${index}]`);
    if (phase.phase !== contract.firstWavePhaseOrder[index]) fail("PRODUCTION_IMPORT_PHASE_SEQUENCE_INVALID", String(phase.phase));
    for (const field of ["sourceBatchManifestSha256", "beforeImageSha256", "legacyRecordMapSha256"]) assertSha(phase[field], "PRODUCTION_IMPORT_MANIFEST_INVALID", `${phase.phase}.${field}`);
    if (phase.existingRecordStrategy === "overwrite") fail("PRODUCTION_IMPORT_OVERWRITE_FORBIDDEN", phase.phase);
    if (!contract.allowedConflictStrategies.includes(phase.existingRecordStrategy)) fail("PRODUCTION_IMPORT_CONFLICT_STRATEGY_INVALID", phase.phase);
    if (!Number.isSafeInteger(phase.existingConflictCount) || phase.existingConflictCount < 0 || !Array.isArray(phase.conflictDecisions) || phase.conflictDecisions.length !== phase.existingConflictCount) fail("PRODUCTION_IMPORT_CONFLICT_UNSIGNED", phase.phase);
    const identities = new Set();
    for (const decision of phase.conflictDecisions) {
      validateConflictDecision(decision, phase.phase, contract);
      if (identities.has(decision.sourceIdentitySha256)) fail("PRODUCTION_IMPORT_CONFLICT_UNSIGNED", `${phase.phase}:duplicate decision`);
      identities.add(decision.sourceIdentitySha256);
      const ledgerEntry = conflictEntries.get(`${phase.phase}:${decision.sourceIdentitySha256}`);
      if (!ledgerEntry || !same({
        strategy: ledgerEntry.strategy,
        existingTargetIdentitySha256: ledgerEntry.existingTargetIdentitySha256,
        beforeImageSha256: ledgerEntry.beforeImageSha256,
        legacyRecordMapSha256: ledgerEntry.legacyRecordMapSha256,
        decisionAttestationSha256: ledgerEntry.decisionAttestationSha256,
      }, {
        strategy: decision.strategy,
        existingTargetIdentitySha256: decision.existingTargetIdentitySha256,
        beforeImageSha256: decision.beforeImageSha256,
        legacyRecordMapSha256: decision.legacyRecordMapSha256,
        decisionAttestationSha256: decision.decisionAttestationSha256,
      })) fail("PRODUCTION_IMPORT_CONFLICT_UNSIGNED", `${phase.phase}:detached conflict decision missing`);
    }
    const beforeRole = `before_image_${phase.phase}`;
    const mapRole = `legacy_record_map_${phase.phase}`;
    if (artifacts.get(beforeRole)?.declaration.sha256 !== phase.beforeImageSha256) fail("PRODUCTION_IMPORT_BEFORE_IMAGE_MISSING", phase.phase);
    if (artifacts.get(mapRole)?.declaration.sha256 !== phase.legacyRecordMapSha256) fail("PRODUCTION_IMPORT_RECORD_MAP_MISSING", phase.phase);
    validatePhaseArtifact(artifacts.get(beforeRole).json, phase.phase, plan.target.identitySha256, "before_image");
    validatePhaseArtifact(artifacts.get(mapRole).json, phase.phase, plan.target.identitySha256, "legacy_record_map");
  }
  if (conflictEntries.size !== manifest.phases.reduce((sum, phase) => sum + phase.existingConflictCount, 0)) fail("PRODUCTION_IMPORT_CONFLICT_UNSIGNED", "conflict ledger contains unbound decisions");
  exactKeys(manifest.optionalT5A, ["phase", "status", "decoupled", "separateAuthorizationRequired", "manifestSha256"], [], "PRODUCTION_IMPORT_MANIFEST_INVALID", "optionalT5A");
  if (manifest.optionalT5A.phase !== "T5A" || manifest.optionalT5A.status !== "HOLD" || manifest.optionalT5A.decoupled !== true || manifest.optionalT5A.separateAuthorizationRequired !== true || manifest.optionalT5A.manifestSha256 !== null) fail("PRODUCTION_IMPORT_T5A_NOT_DECOUPLED", "T5A must remain separately authorized HOLD");
  exactKeys(manifest.identityResolution, ["sourceIdentity", "targetResolution", "nameMatching", "overwrite", "autoCreateLogin"], [], "PRODUCTION_IMPORT_MANIFEST_INVALID", "identityResolution");
  if (manifest.identityResolution.nameMatching !== false) fail("PRODUCTION_IMPORT_NAME_MATCH_FORBIDDEN", "name matching is forbidden");
  if (manifest.identityResolution.overwrite !== false) fail("PRODUCTION_IMPORT_OVERWRITE_FORBIDDEN", "overwrite is forbidden");
  if (manifest.identityResolution.autoCreateLogin !== false) fail("PRODUCTION_IMPORT_LOGIN_CREATION_FORBIDDEN", "historical import cannot create login identities");
  if (!same(manifest.identityResolution, contract.identityResolution)) fail("PRODUCTION_IMPORT_MANIFEST_INVALID", "identity resolution contract differs");
  exactKeys(manifest.rollback, ["sequence", "strategy"], [], "PRODUCTION_IMPORT_MANIFEST_INVALID", "rollback");
  if (!same(manifest.rollback.sequence, contract.rollbackOrder) || manifest.rollback.strategy !== "before_image_and_active_record_map_only") fail("PRODUCTION_IMPORT_ROLLBACK_PLAN_INVALID", "rollback sequence/strategy invalid");
  exactKeys(manifest.invariants, ["beforeImageRestorable", "legacyRecordMapExact", "beforeAfterCanonicalHash", "writesOutsideDeclaredPhases", "residualCount"], [], "PRODUCTION_IMPORT_MANIFEST_INVALID", "invariants");
  if (manifest.invariants.beforeImageRestorable !== true || manifest.invariants.legacyRecordMapExact !== true || manifest.invariants.beforeAfterCanonicalHash !== "EXACT" || manifest.invariants.writesOutsideDeclaredPhases !== 0 || manifest.invariants.residualCount !== 0) fail("PRODUCTION_IMPORT_RESIDUAL_INVARIANT_INVALID", "rollback/hash/residual invariants invalid");
}

function validateAuthorization(authorization, plan, artifacts, contract, nowMs) {
  const required = ["formatVersion", "artifactKind", "intent", "operationId", "status", "issuedAt", "expiresAt", "binding", "approvalSet", "authorizationNonceSha256", "restoreAuthorityArtifactAccepted", "secretDelivery", "productionImport"];
  exactKeys(authorization, required, [], "PRODUCTION_IMPORT_AUTH_MISSING", "authorization");
  if (authorization.formatVersion !== 1 || authorization.artifactKind !== "yuzhou_hr_production_import_one_time_authorization" || authorization.status !== "APPROVED" || authorization.operationId !== plan.operationId || authorization.productionImport !== "HOLD") fail("PRODUCTION_IMPORT_AUTH_MISSING", "authorization identity invalid");
  if (authorization.intent !== "production_import") fail("PRODUCTION_IMPORT_AUTH_WRONG_INTENT", "restore or other authority cannot authorize import");
  if (authorization.restoreAuthorityArtifactAccepted !== false || authorization.secretDelivery !== "OUT_OF_BAND_REQUIRED") fail("PRODUCTION_IMPORT_IMPORT_RESTORE_AUTHORITY_NOT_SEPARATE", "restore/import authority boundary invalid");
  assertSha(authorization.authorizationNonceSha256, "PRODUCTION_IMPORT_AUTH_MISSING", "authorization nonce digest");
  const issuedAt = timestamp(authorization.issuedAt, "PRODUCTION_IMPORT_AUTH_MISSING", "authorization.issuedAt");
  const expiresAt = timestamp(authorization.expiresAt, "PRODUCTION_IMPORT_AUTH_MISSING", "authorization.expiresAt");
  if (issuedAt >= expiresAt || nowMs < issuedAt || nowMs > expiresAt) fail("PRODUCTION_IMPORT_AUTH_STALE", "authorization is outside its validity interval");
  exactKeys(authorization.binding, ["triple", "targetIdentitySha256", "finalRehearsalPairSha256", "importManifestSha256", "windowStartsAt", "windowEndsAt"], [], "PRODUCTION_IMPORT_AUTH_BINDING_MISMATCH", "authorization.binding");
  validateTriple(authorization.binding.triple, "PRODUCTION_IMPORT_AUTH_BINDING_MISMATCH", "authorization.binding.triple");
  const expected = {
    triple: plan.triple,
    targetIdentitySha256: plan.target.identitySha256,
    finalRehearsalPairSha256: artifacts.get("final_rehearsal_pair").declaration.sha256,
    importManifestSha256: artifacts.get("import_manifest").declaration.sha256,
    windowStartsAt: plan.window.startsAt,
    windowEndsAt: plan.window.endsAt,
  };
  if (!same(authorization.binding, expected)) fail("PRODUCTION_IMPORT_AUTH_BINDING_MISMATCH", "authorization binding differs");
  if (!Array.isArray(authorization.approvalSet) || authorization.approvalSet.length !== contract.requiredApprovalRoles.length) fail("PRODUCTION_IMPORT_AUTH_MISSING", "approval set incomplete");
  const roles = [];
  for (const approval of authorization.approvalSet) {
    exactKeys(approval, ["role", "subjectRefSha256", "signedDecisionSha256"], [], "PRODUCTION_IMPORT_AUTH_MISSING", "approval");
    assertSha(approval.subjectRefSha256, "PRODUCTION_IMPORT_AUTH_MISSING", approval.role);
    assertSha(approval.signedDecisionSha256, "PRODUCTION_IMPORT_AUTH_MISSING", approval.role);
    roles.push(approval.role);
  }
  if (!same(roles.sort(), [...contract.requiredApprovalRoles].sort()) || new Set(roles).size !== roles.length) fail("PRODUCTION_IMPORT_AUTH_MISSING", "approval roles differ");
}

function validateUsageLedger(ledger, plan, authorizationSha256) {
  exactKeys(ledger, ["formatVersion", "artifactKind", "entries"], [], "PRODUCTION_IMPORT_ARTIFACT_INVALID", "authorization usage ledger");
  if (ledger.formatVersion !== 1 || ledger.artifactKind !== "yuzhou_hr_production_authorization_usage_ledger" || !Array.isArray(ledger.entries)) fail("PRODUCTION_IMPORT_ARTIFACT_INVALID", "usage ledger invalid");
  for (const entry of ledger.entries) {
    exactKeys(entry, ["operationId", "authorizationArtifactSha256", "intent", "status", "consumedAt"], [], "PRODUCTION_IMPORT_ARTIFACT_INVALID", "usage entry");
    assertSha(entry.authorizationArtifactSha256, "PRODUCTION_IMPORT_ARTIFACT_INVALID", "used authorization");
    timestamp(entry.consumedAt, "PRODUCTION_IMPORT_ARTIFACT_INVALID", "consumedAt");
    if (entry.operationId === plan.operationId) fail("PRODUCTION_IMPORT_OPERATION_REUSED", "operation id already recorded");
    if (entry.authorizationArtifactSha256 === authorizationSha256) fail("PRODUCTION_IMPORT_AUTH_REUSED", "authorization already recorded");
  }
}

function validateTargetAllowlist(allowlist, plan) {
  exactKeys(allowlist, ["formatVersion", "contractKind", "status", "allowedTargets", "reasonCodes"], [], "PRODUCTION_IMPORT_TARGET_NOT_ALLOWLISTED", "target allowlist");
  if (allowlist.formatVersion !== 1 || allowlist.contractKind !== "yuzhou_hr_production_import_target_allowlist" || allowlist.status !== "PASS" || !Array.isArray(allowlist.allowedTargets)) fail("PRODUCTION_IMPORT_TARGET_NOT_ALLOWLISTED", "allowlist is not activated");
  const matching = allowlist.allowedTargets.filter(row => row?.alias === plan.target.alias && row?.identitySha256 === plan.target.identitySha256 && row?.environment === "production");
  if (matching.length !== 1 || allowlist.allowedTargets.length !== new Set(allowlist.allowedTargets.map(row => `${row?.alias}:${row?.identitySha256}`)).size) fail("PRODUCTION_IMPORT_TARGET_NOT_ALLOWLISTED", "target identity not uniquely allowlisted");
}

function evaluateOrThrow(plan, options) {
  const contract = options.contract ?? DEFAULT_CONTRACT;
  if (contract?.executionBoundary !== "preflight_only_no_write_path" || contract.productionImport !== "HOLD") fail("PRODUCTION_IMPORT_PLAN_INVALID", "preflight contract boundary invalid");
  const { startsAt, endsAt } = validatePlanShape(plan, contract);
  if (options.currentCodeSha !== plan.triple.codeSha || options.mergedCodeSha !== plan.triple.codeSha) fail("PRODUCTION_IMPORT_CURRENT_CODE_SHA_MISMATCH", "HEAD/origin main differs from pinned merged SHA");
  const nowMs = options.now instanceof Date ? options.now.getTime() : Date.parse(options.now ?? new Date().toISOString());
  if (!Number.isFinite(nowMs)) fail("PRODUCTION_IMPORT_PLAN_INVALID", "now invalid");
  if (nowMs < startsAt) fail("PRODUCTION_IMPORT_WINDOW_NOT_OPEN", "window not open");
  if (nowMs > endsAt) fail("PRODUCTION_IMPORT_WINDOW_EXPIRED", "window expired");
  const artifacts = loadArtifacts(plan, options.evidenceRoot);
  validateTargetAllowlist(options.allowlist ?? DEFAULT_ALLOWLIST, plan);
  validatePairEvidence(artifacts.get("final_rehearsal_pair").json, plan);
  validateImportManifest(artifacts.get("import_manifest").json, plan, artifacts, contract);
  validateAuthorization(artifacts.get("one_time_import_authorization").json, plan, artifacts, contract, nowMs);
  validateUsageLedger(artifacts.get("authorization_usage_ledger").json, plan, artifacts.get("one_time_import_authorization").declaration.sha256);
  return { operationId: plan.operationId, phaseOrder: [...contract.firstWavePhaseOrder] };
}

export function evaluateProductionImportPreflight(plan, options = {}) {
  let gate;
  let failure = null;
  try { gate = evaluateOrThrow(structuredClone(plan), options); }
  catch (error) { failure = error instanceof ProductionImportPreflightError ? error.code : "PRODUCTION_IMPORT_PLAN_INVALID"; }
  const reasons = failure ? [failure, "PRODUCTION_IMPORT_EXECUTION_UNAVAILABLE"] : ["PRODUCTION_IMPORT_EXECUTION_UNAVAILABLE"];
  const catalog = options.contract?.reasonCatalog ?? DEFAULT_CONTRACT.reasonCatalog;
  const unique = [...new Set(reasons)].sort((left, right) => catalog.indexOf(left) - catalog.indexOf(right));
  return {
    formatVersion: 1,
    status: "HOLD",
    engineeringPreflight: failure ? "HOLD" : "PASS",
    reasonCodes: unique,
    operationId: plan?.operationId ?? null,
    firstWave: gate?.phaseOrder ?? [...DEFAULT_CONTRACT.firstWavePhaseOrder],
    optionalT5A: "HOLD",
    productionImport: "HOLD",
    executionReachable: false,
  };
}

function parse(argv) {
  const args = { command: argv[0] };
  if (argv[0] === "--execute") return { command: "execute" };
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--execute") return { command: "execute" };
    if (argument === "--evidence-root") args.evidenceRoot = argv[++index];
    else if (argument === "--plan") args.planRelative = argv[++index];
    else fail("PRODUCTION_IMPORT_PLAN_INVALID", "unknown argument");
  }
  return args;
}

function cliHold(code, operationId = null) {
  process.stdout.write(`${JSON.stringify({ formatVersion: 1, status: "HOLD", engineeringPreflight: "HOLD", reasonCodes: [...new Set([code, "PRODUCTION_IMPORT_EXECUTION_UNAVAILABLE"])], operationId, firstWave: [...DEFAULT_CONTRACT.firstWavePhaseOrder], optionalT5A: "HOLD", productionImport: "HOLD", executionReachable: false })}\n`);
  process.exitCode = 2;
}

function readPlanFromRoot(evidenceRoot, relativePath) {
  if (typeof evidenceRoot !== "string" || typeof relativePath !== "string" || isAbsolute(relativePath) || relativePath.split(/[\\/]/u).includes("..")) fail("PRODUCTION_IMPORT_PLAN_INVALID", "controlled plan path required");
  const root = realpathSync(resolve(evidenceRoot));
  if ((statSync(root).mode & 0o777) !== 0o700) fail("PRODUCTION_IMPORT_ARTIFACT_UNSAFE", "evidence root mode");
  assertNoSymlinkComponents(root, relativePath);
  const planPath = realpathSync(resolve(root, relativePath));
  if (relative(root, planPath).startsWith("..") || (statSync(planPath).mode & 0o777) !== 0o600 || !statSync(planPath).isFile()) fail("PRODUCTION_IMPORT_ARTIFACT_UNSAFE", "plan must be a controlled 0600 file");
  return JSON.parse(readFileSync(planPath, "utf8"));
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  try {
    const args = parse(process.argv.slice(2));
    if (args.command === "execute") cliHold("PRODUCTION_IMPORT_EXECUTION_UNAVAILABLE");
    else if (args.command !== "preflight" || !args.evidenceRoot || !args.planRelative) cliHold("PRODUCTION_IMPORT_PLAN_INVALID");
    else {
      const plan = readPlanFromRoot(args.evidenceRoot, args.planRelative);
      const currentCodeSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
      const mergedCodeSha = execFileSync("git", ["rev-parse", "origin/main"], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
      const result = evaluateProductionImportPreflight(plan, { evidenceRoot: args.evidenceRoot, currentCodeSha, mergedCodeSha });
      process.stdout.write(`${JSON.stringify(result)}\n`);
      process.exitCode = result.engineeringPreflight === "PASS" ? 2 : 1;
    }
  } catch (error) {
    cliHold(error instanceof ProductionImportPreflightError ? error.code : "PRODUCTION_IMPORT_PLAN_INVALID");
  }
}
