/** Private preparation integrity adapter. No source access, signing or execution. */
import { createHash } from "node:crypto";
import { TextDecoder } from "node:util";
import { bridgeProductionImportRealArtifacts } from "./production-import-real-artifact-bridge.mjs";
import { computeFrozenArtifactHash, normalizeProductionImportTargetFields } from "./production-import-payload-generator.mjs";
import { computeProductionImportTargetScopeHash } from "./production-import-sealed-plan-lib.mjs";
import { validateProductionT0DecisionInventory } from "./materialize-production-t0-decision-candidates.mjs";
import { validateProductionT0CandidateDependencies } from "./production-t2-decision-candidates.mjs";
import {
  DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL as model, stableProductionImportCanonicalJson as canonical,
  computeProductionImportBusinessIdentityHash as businessHash, computeProductionImportTargetCanonicalHash as targetHash,
  deriveProductionImportTargetId as deriveId,
} from "./production-import-target-model.mjs";

const phases = model.phaseOrder;
const dispositions = ["insert", "skip_exact", "review_target_collision", "quarantine"];
const provenance = ["phase", "targetTable", "sourceSystem", "sourceTable", "sourcePkCanonical", "sourceIdentitySha256", "sourceRowSha256"];
const diagnostics = ["candidateDisposition", "reasonCode", "targetFields", "dependencyRefs", "businessIdentitySha256", "expectedTargetId", "expectedTargetVersion", "expectedTargetCanonicalSha256"];
const refKeys = ["role", "phase", "sourceIdentitySha256", "expectedTargetTable"];
const common = ["formatVersion", "artifactKind", "triple", "phaseArtifactSha256", "targetIdentitySha256", "targetScope", "status", "countByDisposition", "records", "productionImport"];
const extras = {
  T0: ["targetInventoryArtifactSha256", "jobStateDecisionArtifactSha256"],
  T1: ["t0DecisionCandidatesArtifactSha256", "targetSnapshotArtifactSha256", "eventTypeDecisionArtifactSha256", "eventStateDecisionArtifactSha256"],
  T2: ["targetInventoryArtifactSha256", "t0CandidatesArtifactSha256", "resolutionArtifactSha256", "sourceManifestSha256", "targetTableCounts"],
  T3: ["targetInventoryArtifactSha256", "t0CandidatesArtifactSha256", "sourceManifestSha256", "targetTableCounts"],
};
const SHA = /^[0-9a-f]{64}$/u;
const hash = value => createHash("sha256").update(value).digest("hex");
const same = (a, b) => canonical(a) === canonical(b);
const pick = (value, keys) => Object.fromEntries(keys.map(key => [key, value[key]]));
const plain = value => value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
export class ProductionImportCandidateFreezeError extends Error {
  constructor(code) { super(code); this.name = "ProductionImportCandidateFreezeError"; this.code = code; }
}
const fail = suffix => { throw new ProductionImportCandidateFreezeError(`CANDIDATE_FREEZE_${suffix}`); };
function exact(value, keys) {
  if (!plain(value) || Object.keys(value).sort().join("|") !== [...keys].sort().join("|")) fail("SHAPE_INVALID");
}
function document(input) {
  exact(input, ["path", "bytes", "sha256"]);
  if (typeof input.path !== "string" || !input.path || input.path.includes("\0")
    || !(typeof input.bytes === "string" || input.bytes instanceof Uint8Array)) fail("DESCRIPTOR_INVALID");
  const bytes = Buffer.from(input.bytes);
  if (!bytes.length || !SHA.test(input.sha256 ?? "") || hash(bytes) !== input.sha256) fail("BYTE_HASH_MISMATCH");
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { fail("JSON_INVALID"); }
}
function validateTriple(value) {
  exact(value, ["codeSha", "sourceSnapshotHash", "mappingContractHash"]);
  if (!/^[0-9a-f]{40}$/u.test(value.codeSha ?? "") || !SHA.test(value.sourceSnapshotHash ?? "") || !SHA.test(value.mappingContractHash ?? "")) fail("TRIPLE_INVALID");
}
function coverage(value, records, phase) {
  const tables = Object.keys(model.targetTables).filter(table => model.targetTables[table].phase === phase);
  exact(value, tables);
  const counts = Object.fromEntries(tables.map(table => [table, 0]));
  for (const row of records) {
    if (!Object.hasOwn(counts, row.targetTable)) fail("TABLE_INVALID");
    counts[row.targetTable]++;
  }
  if (!same(value, counts)) fail("COVERAGE_INVALID");
}
function base64(value, length) {
  if (typeof value !== "string" || !value.length) fail("EVIDENCE_INVALID");
  const bytes = Buffer.from(value, "base64");
  if (!bytes.length || bytes.toString("base64") !== value || (length && bytes.length !== length)) fail("EVIDENCE_INVALID");
  return bytes;
}
function cryptoEvidence(review) {
  const decision = review.decision;
  if (decision.disposition === "skip_approved") {
    if (review.cryptoEnvelope !== null) fail("EVIDENCE_INVALID");
    return;
  }
  const envelope = review.cryptoEnvelope;
  exact(envelope, ["operationId", "algorithm", "keyReferenceSha256", "nonceBase64", "authenticationTagBase64", "ciphertextBase64"]);
  const metadata = decision.disposition === "merge" ? decision.beforeImage : decision.quarantine;
  if (!/^yzprod-import-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{12}$/u.test(envelope.operationId ?? "")
    || envelope.algorithm !== "aes-256-gcm-external-kek-v1" || envelope.algorithm !== metadata?.algorithm
    || !SHA.test(envelope.keyReferenceSha256 ?? "") || envelope.keyReferenceSha256 !== metadata.keyReferenceSha256) fail("EVIDENCE_INVALID");
  base64(envelope.nonceBase64, 12); base64(envelope.authenticationTagBase64, 16);
  const ciphertext = base64(envelope.ciphertextBase64);
  if (ciphertext.length > 8 * 1024 ** 2 || hash(ciphertext) !== (decision.disposition === "merge" ? metadata.ciphertextSha256 : metadata.payloadCiphertextSha256)) fail("EVIDENCE_INVALID");
}

function prepare(input) {
  exact(input, ["expectedTriple", "phaseArtifacts", "candidateArtifacts", "targetInventoryArtifact", "targetScopeArtifact", "reviewedDecisionsArtifact"]);
  const triple = structuredClone(input.expectedTriple);
  validateTriple(triple); exact(input.phaseArtifacts, phases); exact(input.candidateArtifacts, phases);
  const inventory = document(input.targetInventoryArtifact), scope = document(input.targetScopeArtifact);
  exact(scope, ["tenantId", "parkId", "scopeSha256"]);
  if (typeof scope.tenantId !== "string" || typeof scope.parkId !== "string" || scope.scopeSha256 !== computeProductionImportTargetScopeHash(scope)) fail("SCOPE_INVALID");
  if (inventory.kind !== "yuzhou_hr_production_target_inventory_readonly") fail("INVENTORY_INCOMPLETE");
  validateProductionT0DecisionInventory(inventory, triple);
  if (inventory.targetScopeSha256 !== scope.scopeSha256) fail("SCOPE_INVALID");
  const candidates = {}, rows = new Map(), staged = [], candidateHashes = {};
  const counts = Object.fromEntries(dispositions.map(kind => [kind, 0])), tableCounts = {};
  for (const phase of phases) {
    const candidate = document(input.candidateArtifacts[phase]), source = document(input.phaseArtifacts[phase]);
    candidates[phase] = candidate; candidateHashes[phase] = input.candidateArtifacts[phase].sha256;
    exact(candidate, [...common, ...extras[phase]]);
    if (candidate.formatVersion !== 1 || candidate.artifactKind !== `yuzhou_hr_production_import_real_${phase.toLowerCase()}_decision_candidates`
      || candidate.productionImport !== "HOLD" || !same(candidate.triple, triple) || !same(candidate.targetScope, scope)
      || candidate.targetIdentitySha256 !== inventory.targetIdentitySha256 || candidate.phaseArtifactSha256 !== input.phaseArtifacts[phase].sha256
      || candidate[phase === "T1" ? "targetSnapshotArtifactSha256" : "targetInventoryArtifactSha256"] !== input.targetInventoryArtifact.sha256
      || !Array.isArray(candidate.records)) fail("CANDIDATE_BINDING_INVALID");
    for (const key of extras[phase].filter(key => key.endsWith("Sha256"))) if (!SHA.test(candidate[key] ?? "")) fail("CANDIDATE_BINDING_INVALID");
    if (phase !== "T0" && candidate[phase === "T1" ? "t0DecisionCandidatesArtifactSha256" : "t0CandidatesArtifactSha256"] !== input.candidateArtifacts.T0.sha256) fail("T0_BINDING_INVALID");
    if (["T2", "T3"].includes(phase) && candidate.sourceManifestSha256 !== inventory.sourceManifestSha256) fail("SOURCE_BINDING_INVALID");
    exact(source, ["formatVersion", "artifactKind", "triple", "phase", "records", ...(Object.hasOwn(source, "targetTableCounts") ? ["targetTableCounts"] : [])]);
    if (source.formatVersion !== 1 || source.artifactKind !== "yuzhou_hr_production_import_real_phase_staging" || source.phase !== phase
      || !same(source.triple, triple) || !Array.isArray(source.records)) fail("PHASE_INVALID");
    const sourceRows = new Map();
    for (const row of source.records) {
      exact(row, provenance);
      const rule = model.targetTables[row.targetTable];
      if (row.phase !== phase || rule?.phase !== phase || row.sourceSystem !== model.sourceSystem || !rule.allowedSourceTables.includes(row.sourceTable)
        || !SHA.test(row.sourceIdentitySha256 ?? "") || !SHA.test(row.sourceRowSha256 ?? "") || row.sourcePkCanonical !== `sha256:${row.sourceIdentitySha256}`
        || sourceRows.has(row.sourceIdentitySha256) || rows.has(row.sourceIdentitySha256)) fail("PROVENANCE_INVALID");
      sourceRows.set(row.sourceIdentitySha256, row);
    }
    const observed = Object.fromEntries(dispositions.map(kind => [kind, 0]));
    for (const row of candidate.records) {
      exact(row, [...provenance, ...diagnostics]);
      if (!dispositions.includes(row.candidateDisposition) || !sourceRows.has(row.sourceIdentitySha256)
        || !same(pick(row, provenance), sourceRows.get(row.sourceIdentitySha256)) || !Array.isArray(row.dependencyRefs)
        || (row.reasonCode !== null && !/^[A-Z][A-Z0-9_]{2,63}$/u.test(row.reasonCode))) fail("CANDIDATE_ROW_INVALID");
      if (["insert", "skip_exact"].includes(row.candidateDisposition) ? row.reasonCode !== null : row.reasonCode === null) fail("REASON_INVALID");
      for (const key of ["businessIdentitySha256", "expectedTargetCanonicalSha256"]) if (row[key] !== null && !SHA.test(row[key] ?? "")) fail("TARGET_HINT_INVALID");
      if (row.expectedTargetVersion !== null && (!Number.isSafeInteger(row.expectedTargetVersion) || row.expectedTargetVersion < 0)) fail("TARGET_HINT_INVALID");
      if (row.expectedTargetId !== null && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(row.expectedTargetId ?? "")) fail("TARGET_HINT_INVALID");
      if (row.targetFields !== null) normalizeProductionImportTargetFields(row.targetTable, row.targetFields, model.targetTables[row.targetTable], { partial: row.candidateDisposition === "quarantine" });
      sourceRows.delete(row.sourceIdentitySha256); rows.set(row.sourceIdentitySha256, row); observed[row.candidateDisposition]++;
    }
    if (sourceRows.size || !same(candidate.countByDisposition, observed)) fail("COVERAGE_INVALID");
    const ready = phase === "T0" || phase === "T1" ? "READY_FOR_FREEZE" : "READY_FOR_REVIEW";
    if (candidate.status !== (observed.quarantine + observed.review_target_collision ? "REVIEW_HOLD" : ready)) fail("STATUS_INVALID");
    const computed = Object.fromEntries(Object.keys(model.targetTables).filter(table => model.targetTables[table].phase === phase).map(table => [table, source.records.filter(row => row.targetTable === table).length]));
    // Legacy T0/T1 have no count field. Coverage is required by record presence there.
    if (Object.hasOwn(source, "targetTableCounts")) coverage(source.targetTableCounts, source.records, phase);
    else if (Object.values(computed).some(count => count === 0)) fail("COVERAGE_REQUIRED");
    if (["T2", "T3"].includes(phase)) coverage(candidate.targetTableCounts, candidate.records, phase);
    Object.assign(tableCounts, computed);
    for (const kind of dispositions) counts[kind] += observed[kind];
    for (const row of source.records) staged.push(row);
  }
  validateProductionT0CandidateDependencies(candidates.T0, triple, scope, inventory, input.targetInventoryArtifact.sha256);
  const refs = new Map();
  for (const row of rows.values()) {
    const roles = new Set(), rule = model.targetTables[row.targetTable];
    refs.set(row.sourceIdentitySha256, row.dependencyRefs.map(ref => {
      exact(ref, [...refKeys, ...(row.phase === "T1" ? ["candidateDisposition"] : [])]);
      const parent = rows.get(ref.sourceIdentitySha256), fk = rule.foreignKeys.find(fk => fk.dependencyRole === ref.role);
      if (!fk || roles.has(ref.role) || !SHA.test(ref.sourceIdentitySha256 ?? "") || ref.expectedTargetTable !== fk.targetTable
        || ref.phase !== model.targetTables[fk.targetTable].phase || phases.indexOf(ref.phase) > phases.indexOf(row.phase)
        || (parent && (parent.phase !== ref.phase || parent.targetTable !== ref.expectedTargetTable))
        || (row.phase === "T1" && (!parent || ref.candidateDisposition !== parent.candidateDisposition))) fail("DEPENDENCY_INVALID");
      roles.add(ref.role); return pick(ref, refKeys);
    }));
  }
  const targets = new Map(inventory.records.map(row => [`${row.targetTable}:${row.businessIdentitySha256}`, row]));
  const targetIds = new Set(inventory.records.map(row => `${row.targetTable}:${row.targetId}`));
  const visiting = new Set(), verified = new Set(), business = new Set(), ids = new Set();
  function verify(row) {
    if (verified.has(row.sourceIdentitySha256) || row.candidateDisposition === "quarantine") return;
    if (visiting.has(row.sourceIdentitySha256)) fail("DEPENDENCY_CYCLE");
    visiting.add(row.sourceIdentitySha256);
    const rule = model.targetTables[row.targetTable], derived = Object.fromEntries(rule.foreignKeys.map(fk => [fk.column, null]));
    for (const ref of refs.get(row.sourceIdentitySha256)) {
      const parent = rows.get(ref.sourceIdentitySha256);
      if (!parent || !["insert", "skip_exact"].includes(parent.candidateDisposition)) fail("DEPENDENCY_BLOCKED");
      verify(parent); derived[rule.foreignKeys.find(fk => fk.dependencyRole === ref.role).column] = parent.expectedTargetId;
    }
    if (rule.foreignKeys.some(fk => fk.required && !derived[fk.column])) fail("DEPENDENCY_REQUIRED");
    const fields = normalizeProductionImportTargetFields(row.targetTable, row.targetFields, rule);
    const identity = businessHash(row.targetTable, scope, fields, derived), key = `${row.targetTable}:${identity}`, existing = targets.get(key);
    const after = targetHash(row.targetTable, scope, fields, derived), id = existing?.targetId ?? deriveId({ targetScope: scope, targetTable: row.targetTable, sourceIdentitySha256: row.sourceIdentitySha256 });
    if (row.businessIdentitySha256 !== identity || row.expectedTargetId !== id || row.expectedTargetVersion !== (existing?.targetVersion ?? null)
      || row.expectedTargetCanonicalSha256 !== (existing?.targetCanonicalSha256 ?? (row.phase === "T1" ? after : null))) fail("TARGET_HINT_INVALID");
    if (row.candidateDisposition === "insert" && (existing || targetIds.has(`${row.targetTable}:${id}`))) fail("TARGET_COLLISION");
    if (row.candidateDisposition === "skip_exact" && (!existing || after !== existing.targetCanonicalSha256)) fail("TARGET_HINT_INVALID");
    if (row.candidateDisposition !== "review_target_collision") {
      if (business.has(key) || ids.has(`${row.targetTable}:${id}`)) fail("SOURCE_COLLISION");
      business.add(key); ids.add(`${row.targetTable}:${id}`);
    }
    visiting.delete(row.sourceIdentitySha256); verified.add(row.sourceIdentitySha256);
  }
  for (const row of rows.values()) verify(row);
  let reviewed = null;
  const reviews = new Map();
  if (input.reviewedDecisionsArtifact !== null) {
    reviewed = document(input.reviewedDecisionsArtifact);
    exact(reviewed, ["formatVersion", "artifactKind", "triple", "targetScope", "targetInventoryArtifactSha256", "candidateArtifactSha256", "records"]);
    if (reviewed.formatVersion !== 1 || reviewed.artifactKind !== "yuzhou_hr_production_import_reviewed_candidate_resolutions" || !same(reviewed.triple, triple)
      || !same(reviewed.targetScope, scope) || reviewed.targetInventoryArtifactSha256 !== input.targetInventoryArtifact.sha256
      || !same(reviewed.candidateArtifactSha256, candidateHashes) || !Array.isArray(reviewed.records)) fail("REVIEW_BINDING_INVALID");
    for (const review of reviewed.records) {
      exact(review, ["phase", "targetTable", "sourceIdentitySha256", "sourceRowSha256", "candidateArtifactSha256", "decision", "attestationBase64", "cryptoEnvelope"]);
      const row = rows.get(review.sourceIdentitySha256), decision = review.decision;
      if (!row || row.candidateDisposition === "insert" || reviews.has(review.sourceIdentitySha256)
        || review.phase !== row.phase || review.targetTable !== row.targetTable || review.sourceRowSha256 !== row.sourceRowSha256
        || review.candidateArtifactSha256 !== candidateHashes[row.phase]) fail("REVIEW_COVERAGE_INVALID");
      if (!plain(decision) || decision.phase !== row.phase || decision.targetTable !== row.targetTable || decision.sourceIdentitySha256 !== row.sourceIdentitySha256) fail("REVIEW_INVALID");
      const allowed = { skip_exact: ["skip_approved", "quarantine"], review_target_collision: ["merge", "quarantine"], quarantine: ["quarantine"] }[row.candidateDisposition];
      if (!allowed.includes(decision.disposition) || !model.targetTables[row.targetTable].allowedDispositions.includes(decision.disposition)) fail("REVIEW_DISPOSITION_INVALID");
      const options = decision.disposition === "merge" ? ["beforeImage", "expectedTargetVersionBefore"] : decision.disposition === "skip_approved" ? ["expectedTargetVersionBefore"] : ["quarantine"];
      exact(decision, ["phase", "targetTable", "sourceIdentitySha256", "disposition", "targetFields", "dependencyRefs", "decisionAttestationSha256", ...options]);
      const attestationBytes = base64(review.attestationBase64);
      if (hash(attestationBytes) !== decision.decisionAttestationSha256) fail("ATTESTATION_HASH_MISMATCH");
      let attestation;
      try { attestation = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(attestationBytes)); }
      catch { fail("ATTESTATION_INVALID"); }
      // This is a declared signed-content binding check, not signature or signer
      // trust verification. Existing external approval/activation gates still own both.
      exact(attestation, ["binding", "signatureBase64", "publicKeyPem"]);
      base64(attestation.signatureBase64);
      if (typeof attestation.publicKeyPem !== "string" || !attestation.publicKeyPem.startsWith("-----BEGIN PUBLIC KEY-----\n")) fail("ATTESTATION_INVALID");
      const { decisionAttestationSha256: _attestationHash, ...unsignedDecision } = decision;
      if (!same(attestation.binding, { triple, targetScope: scope, targetInventoryArtifactSha256: input.targetInventoryArtifact.sha256,
        candidateArtifactSha256: candidateHashes[row.phase], sourceRowSha256: row.sourceRowSha256, decision: unsignedDecision, cryptoEnvelope: review.cryptoEnvelope })) fail("ATTESTATION_BINDING_INVALID");
      if (decision.disposition !== "quarantine" && (!same(decision.targetFields, row.targetFields) || !same(decision.dependencyRefs, refs.get(row.sourceIdentitySha256)))) fail("REVIEW_PROJECTION_INVALID");
      if (decision.disposition === "quarantine" && row.reasonCode !== null && decision.quarantine?.reasonCode !== row.reasonCode) fail("REVIEW_REASON_INVALID");
      if (!Array.isArray(decision.dependencyRefs)) fail("REVIEW_PROJECTION_INVALID");
      const roles = new Set();
      for (const ref of decision.dependencyRefs) {
        exact(ref, refKeys);
        const fk = model.targetTables[row.targetTable].foreignKeys.find(fk => fk.dependencyRole === ref.role), parent = rows.get(ref.sourceIdentitySha256);
        if (!fk || roles.has(ref.role) || !parent || parent.targetTable !== ref.expectedTargetTable || parent.phase !== ref.phase || fk.targetTable !== ref.expectedTargetTable
          || phases.indexOf(ref.phase) > phases.indexOf(row.phase)) fail("REVIEW_PROJECTION_INVALID");
        roles.add(ref.role);
      }
      if (decision.disposition !== "quarantine" && decision.expectedTargetVersionBefore !== row.expectedTargetVersion) fail("REVIEW_VERSION_INVALID");
      if (decision.disposition === "merge") {
        exact(decision.beforeImage, ["algorithm", "plaintextSha256", "ciphertextSha256", "keyReferenceSha256"]);
        if (decision.beforeImage.plaintextSha256 !== row.expectedTargetCanonicalSha256) fail("REVIEW_BEFORE_IMAGE_INVALID");
      }
      if (decision.disposition === "quarantine") {
        exact(decision.quarantine, ["reasonCode", "algorithm", "payloadCiphertextSha256", "keyReferenceSha256"]);
        if (!/^[A-Z][A-Z0-9_]{2,63}$/u.test(decision.quarantine.reasonCode ?? "")) fail("REVIEW_REASON_INVALID");
      }
      normalizeProductionImportTargetFields(row.targetTable, decision.targetFields, model.targetTables[row.targetTable], { partial: decision.disposition === "quarantine" });
      cryptoEvidence(review); reviews.set(row.sourceIdentitySha256, review);
    }
  }
  const missingReviewCount = [...rows.values()].filter(row => row.candidateDisposition !== "insert" && !reviews.has(row.sourceIdentitySha256)).length;
  const evidence = { formatVersion: 1, artifactKind: "yuzhou_hr_production_import_candidate_preparation_evidence", triple, targetScope: scope,
    sourceManifestSha256: inventory.sourceManifestSha256, targetIdentitySha256: inventory.targetIdentitySha256,
    candidateArtifactSha256: candidateHashes, phaseArtifactSha256: Object.fromEntries(phases.map(phase => [phase, input.phaseArtifacts[phase].sha256])),
    targetInventoryArtifactSha256: input.targetInventoryArtifact.sha256, targetScopeArtifactSha256: input.targetScopeArtifact.sha256,
    reviewedDecisionsArtifactSha256: input.reviewedDecisionsArtifact?.sha256 ?? null, signatureAuthenticityVerified: false,
    productionImport: "HOLD", records: [...rows.values()].map(row => ({ candidate: row, review: reviews.get(row.sourceIdentitySha256) ?? null })) };
  const summary = { status: "REVIEW_HOLD", productionImport: "HOLD", approvalClaimed: false, recordCount: rows.size, countByDisposition: counts, targetTableCounts: tableCounts, missingReviewCount };
  if (missingReviewCount) return { summary, evidence, wrappers: null, bridge: null };
  const records = [...rows.values()].map(row => row.candidateDisposition === "insert"
    ? { ...pick(row, ["phase", "targetTable", "sourceIdentitySha256", "targetFields"]), disposition: "insert", dependencyRefs: refs.get(row.sourceIdentitySha256) }
    : reviews.get(row.sourceIdentitySha256).decision);
  const staging = { formatVersion: 1, artifactKind: "yuzhou_hr_production_import_frozen_staging_index", sourceSnapshotHash: triple.sourceSnapshotHash, records: staged };
  const frozenInventory = { formatVersion: 1, artifactKind: "yuzhou_hr_production_import_frozen_target_inventory", targetScope: scope, records: inventory.records };
  const sealedScope = { formatVersion: 1, artifactKind: "yuzhou_hr_production_import_sealed_scope", targetScope: scope };
  const decisions = { formatVersion: 1, artifactKind: "yuzhou_hr_production_import_frozen_decisions", stagingArtifactSha256: computeFrozenArtifactHash(staging),
    targetInventoryArtifactSha256: computeFrozenArtifactHash(frozenInventory), sealedScopeArtifactSha256: computeFrozenArtifactHash(sealedScope),
    phaseManifests: evidence.phaseArtifactSha256, records };
  const wrapper = (role, payload) => ({ formatVersion: 1, artifactKind: `yuzhou_hr_production_import_real_${role}`, triple, payload });
  const wrappers = { decisions: wrapper("decisions", decisions), inventory: wrapper("target_inventory", frozenInventory), scope: wrapper("sealed_scope", sealedScope) };
  const descriptor = (role, value) => { const bytes = canonical(value) + "\n"; return { path: `prepared-${role}.json`, bytes, sha256: hash(bytes) }; };
  const bridge = bridgeProductionImportRealArtifacts({ expectedTriple: triple, phaseArtifacts: phases.map(phase => input.phaseArtifacts[phase]),
    decisionsArtifact: descriptor("decisions", wrappers.decisions), targetInventoryArtifact: descriptor("inventory", wrappers.inventory), sealedScopeArtifact: descriptor("scope", wrappers.scope) });
  summary.status = bridge.status;
  summary.reasonCodes = bridge.reasonCodes;
  return { summary, evidence, wrappers: bridge.status === "READY" ? wrappers : null, bridge };
}

export function freezeProductionImportCandidates(input) {
  try { return prepare(input); }
  catch (error) {
    if (error instanceof ProductionImportCandidateFreezeError) throw error;
    // Existing validators include source details; expose only a sanitized code.
    fail("VALIDATION_FAILED");
  }
}
