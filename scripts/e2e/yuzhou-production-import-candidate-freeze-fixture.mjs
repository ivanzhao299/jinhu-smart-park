import { createHash, generateKeyPairSync, randomBytes, sign, verify } from "node:crypto";
import assert from "node:assert/strict";
import { DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL as model, stableProductionImportCanonicalJson as canonical,
  computeProductionImportBusinessIdentityHash as businessHash, computeProductionImportTargetCanonicalHash as targetHash,
  deriveProductionImportTargetId as deriveId } from "../hr-cutover/production-import-target-model.mjs";
import { normalizeProductionImportTargetFields } from "../hr-cutover/production-import-payload-generator.mjs";
import { computeProductionImportTargetScopeHash, computeProductionImportPayloadHash } from "../hr-cutover/production-import-sealed-plan-lib.mjs";
import { encryptProductionImportEnvelope, decryptProductionImportEnvelope } from "../hr-cutover/production-import-crypto-provider.mjs";

export const hash = value => createHash("sha256").update(value).digest("hex");
export const descriptor = (value, path = "/synthetic/artifact.json") => { const bytes = canonical(value) + "\n"; return { path, bytes, sha256: hash(bytes) }; };
const sourceKeys = ["phase", "targetTable", "sourceSystem", "sourceTable", "sourcePkCanonical", "sourceIdentitySha256", "sourceRowSha256"];
export const decode = artifact => JSON.parse(Buffer.from(artifact.bytes).toString("utf8"));
export function fixture() {
  const triple = { codeSha: "a".repeat(40), sourceSnapshotHash: hash("synthetic source"), mappingContractHash: hash("synthetic mapping") };
  const scope = { tenantId: "synthetic-tenant", parkId: "synthetic-park" }; scope.scopeSha256 = computeProductionImportTargetScopeHash(scope);
  const records = [], byTable = new Map();
  for (const [table, rule] of Object.entries(model.targetTables)) {
    const fields = Object.fromEntries(rule.requiredFields.map(field => [field, rule.integerFields.includes(field) ? 1 : rule.booleanFields.includes(field) ? true
      : rule.decimalStringFields.includes(field) ? "1.00" : rule.dateFields.includes(field) ? "2026-01-01"
        : rule.timestampFields.includes(field) ? "2026-01-01T00:00:00Z" : rule.jsonObjectFields.includes(field) ? {} : `SYN-${table}-${field}`]));
    const normalized = normalizeProductionImportTargetFields(table, fields, rule);
    const sourceTable = rule.allowedSourceTables[0], codeField = { sys_org: "org_code", hr_position: "position_code", hr_employee: "employee_code" }[table];
    const identity = hash(`${sourceTable}\0${codeField ? fields[codeField] : table}`);
    const refs = rule.foreignKeys.filter(fk => fk.required).map(fk => ({ role: fk.dependencyRole, phase: model.targetTables[fk.targetTable].phase,
      sourceIdentitySha256: byTable.get(fk.targetTable).sourceIdentitySha256, expectedTargetTable: fk.targetTable,
      ...(rule.phase === "T1" ? { candidateDisposition: "insert" } : {}) }));
    const derived = Object.fromEntries(rule.foreignKeys.map(fk => [fk.column, fk.required ? byTable.get(fk.targetTable).expectedTargetId : null]));
    const row = { phase: rule.phase, targetTable: table, sourceSystem: "yuzhou-v10", sourceTable, sourcePkCanonical: `sha256:${identity}`,
      sourceIdentitySha256: identity, sourceRowSha256: hash(`synthetic row ${table}`), candidateDisposition: "insert", reasonCode: null,
      targetFields: normalized, dependencyRefs: refs, businessIdentitySha256: businessHash(table, scope, normalized, derived),
      expectedTargetId: deriveId({ targetScope: scope, targetTable: table, sourceIdentitySha256: identity }), expectedTargetVersion: null,
      expectedTargetCanonicalSha256: rule.phase === "T1" ? targetHash(table, scope, normalized, derived) : null };
    records.push(row); byTable.set(table, row);
  }
  const inventory = { formatVersion: 1, kind: "yuzhou_hr_production_target_inventory_readonly", status: "PASS", productionImport: "HOLD", executionReachable: false,
    targetIdentitySha256: hash("synthetic target"), targetScopeSha256: scope.scopeSha256, sourceManifestSha256: hash("synthetic immutable source manifest"),
    triple, targetTableCounts: Object.fromEntries(Object.keys(model.targetTables).map(table => [table, 0])), records: [] };
  const f = { triple, scope, records, inventory, reviews: null };
  return f;
}
export function inputFor(f) {
  const inventory = descriptor(f.inventory), phaseArtifacts = {}, candidateArtifacts = {};
  for (const phase of model.phaseOrder) {
    const records = f.records.filter(row => row.phase === phase);
    const tableCounts = Object.fromEntries(Object.keys(model.targetTables).filter(table => model.targetTables[table].phase === phase).map(table => [table, records.filter(row => row.targetTable === table).length]));
    const phaseValue = { formatVersion: 1, artifactKind: "yuzhou_hr_production_import_real_phase_staging", triple: f.triple, phase,
      ...(["T2", "T3"].includes(phase) ? { targetTableCounts: tableCounts } : {}), records: records.map(row => Object.fromEntries(sourceKeys.map(key => [key, row[key]]))) };
    phaseArtifacts[phase] = descriptor(phaseValue, `/synthetic/${phase}-phase.json`);
    const counts = Object.fromEntries(["insert", "skip_exact", "review_target_collision", "quarantine"].map(kind => [kind, records.filter(row => row.candidateDisposition === kind).length]));
    const candidate = { formatVersion: 1, artifactKind: `yuzhou_hr_production_import_real_${phase.toLowerCase()}_decision_candidates`, triple: f.triple,
      phaseArtifactSha256: phaseArtifacts[phase].sha256, targetIdentitySha256: f.inventory.targetIdentitySha256, targetScope: f.scope,
      countByDisposition: counts, records, productionImport: "HOLD", status: counts.quarantine + counts.review_target_collision ? "REVIEW_HOLD" : ["T0", "T1"].includes(phase) ? "READY_FOR_FREEZE" : "READY_FOR_REVIEW" };
    if (phase === "T0") Object.assign(candidate, { targetInventoryArtifactSha256: inventory.sha256, jobStateDecisionArtifactSha256: hash("synthetic job state") });
    else if (phase === "T1") Object.assign(candidate, { targetSnapshotArtifactSha256: inventory.sha256, t0DecisionCandidatesArtifactSha256: candidateArtifacts.T0.sha256,
      eventTypeDecisionArtifactSha256: hash("synthetic event type"), eventStateDecisionArtifactSha256: hash("synthetic event state") });
    else Object.assign(candidate, { targetInventoryArtifactSha256: inventory.sha256, t0CandidatesArtifactSha256: candidateArtifacts.T0.sha256,
      sourceManifestSha256: f.inventory.sourceManifestSha256, targetTableCounts: tableCounts, ...(phase === "T2" ? { resolutionArtifactSha256: hash("synthetic resolution") } : {}) });
    candidateArtifacts[phase] = descriptor(candidate, `/synthetic/${phase}-candidates.json`);
  }
  return { expectedTriple: f.triple, phaseArtifacts, candidateArtifacts, targetInventoryArtifact: inventory, targetScopeArtifact: descriptor(f.scope),
    reviewedDecisionsArtifact: f.reviews ? descriptor({ formatVersion: 1, artifactKind: "yuzhou_hr_production_import_reviewed_candidate_resolutions", triple: f.triple,
      targetScope: f.scope, targetInventoryArtifactSha256: inventory.sha256, candidateArtifactSha256: Object.fromEntries(model.phaseOrder.map(phase => [phase, candidateArtifacts[phase].sha256])), records: f.reviews }) : null };
}
export function existing(f, table, disposition) {
  const row = f.records.find(row => row.targetTable === table), rule = model.targetTables[table];
  const derived = Object.fromEntries(rule.foreignKeys.map(fk => [fk.column, row.dependencyRefs.some(ref => ref.role === fk.dependencyRole)
    ? f.records.find(parent => parent.sourceIdentitySha256 === row.dependencyRefs.find(ref => ref.role === fk.dependencyRole).sourceIdentitySha256).expectedTargetId : null]));
  const before = structuredClone(row.targetFields);
  if (disposition === "review_target_collision") before[rule.requiredFields.find(field => !rule.uniqueKey.includes(field) && typeof before[field] === "string")] = "Synthetic previous name";
  const canonicalSha256 = targetHash(table, f.scope, before, derived);
  f.inventory.records.push({ targetTable: table, businessIdentitySha256: row.businessIdentitySha256, targetId: row.expectedTargetId, targetCanonicalSha256: canonicalSha256, targetVersion: 3 });
  f.inventory.targetTableCounts[table]++;
  row.candidateDisposition = disposition; row.reasonCode = disposition === "skip_exact" ? null : "TARGET_CANONICAL_MISMATCH";
  row.expectedTargetCanonicalSha256 = canonicalSha256; row.expectedTargetVersion = 3;
  for (const child of f.records.filter(row => row.phase === "T1")) for (const ref of child.dependencyRefs) if (ref.sourceIdentitySha256 === row.sourceIdentitySha256) ref.candidateDisposition = disposition;
  return { row, before: { payload: before, derivedFields: derived, version: 3, canonicalSha256 } };
}
export function quarantine(f, table, dangling = false) {
  const row = f.records.find(row => row.targetTable === table);
  Object.assign(row, { candidateDisposition: "quarantine", reasonCode: "T3_PARENT_MISSING", targetFields: null,
    businessIdentitySha256: null, expectedTargetId: null, expectedTargetVersion: null, expectedTargetCanonicalSha256: null });
  if (dangling) row.dependencyRefs[0].sourceIdentitySha256 = hash("missing synthetic parent");
  return row;
}
export async function reviewFor(f, row, disposition, before, executableRefs) {
  const input = inputFor(f), decision = { phase: row.phase, targetTable: row.targetTable, sourceIdentitySha256: row.sourceIdentitySha256,
    disposition, targetFields: disposition === "quarantine" ? {} : row.targetFields,
    dependencyRefs: executableRefs ?? (disposition === "quarantine" ? [] : row.dependencyRefs.map(({ candidateDisposition: _annotation, ...ref }) => ref)) };
  let cryptoEnvelope = null;
  if (disposition !== "quarantine") decision.expectedTargetVersionBefore = row.expectedTargetVersion;
  if (disposition !== "skip_approved") {
    const key = randomBytes(32), resolver = { resolveKey: async () => key };
    const context = { kind: disposition === "merge" ? "before_image" : "quarantine", operationId: "yzprod-import-20260906T000000Z-aaaaaaaaaaaa",
      phaseName: row.phase, targetScope: f.scope, keyReferenceSha256: hash("synthetic external reference"), value: before ?? decision.targetFields,
      record: { sourceSystem: row.sourceSystem, sourceTable: row.sourceTable, sourceIdentitySha256: row.sourceIdentitySha256, sourceRowSha256: row.sourceRowSha256,
        payloadSha256: computeProductionImportPayloadHash(decision.targetFields), disposition, plannedTargetTable: row.targetTable,
        ...(disposition === "merge" ? { targetTable: row.targetTable, targetId: row.expectedTargetId, expectedTargetVersionBefore: row.expectedTargetVersion,
          expectedTargetBeforeSha256: row.expectedTargetCanonicalSha256 } : {}) } };
    const { envelope, binding } = await encryptProductionImportEnvelope(context, resolver);
    decision[disposition === "merge" ? "beforeImage" : "quarantine"] = disposition === "merge" ? binding : { ...binding, reasonCode: row.reasonCode };
    context.record[disposition === "merge" ? "beforeImage" : "quarantine"] = decision[disposition === "merge" ? "beforeImage" : "quarantine"];
    const decrypted = await decryptProductionImportEnvelope({ ...context, envelope }, resolver);
    assert.deepEqual(disposition === "merge" ? decrypted.targetBefore : decrypted.payload, context.value);
    cryptoEnvelope = { operationId: context.operationId, algorithm: envelope.algorithm, keyReferenceSha256: envelope.keyReferenceSha256,
      nonceBase64: envelope.nonce.toString("base64"), authenticationTagBase64: envelope.authenticationTag.toString("base64"), ciphertextBase64: envelope.ciphertext.toString("base64") };
    key.fill(0);
  }
  // Test-only independent signer. The adapter neither creates nor verifies signatures.
  const binding = { triple: f.triple, targetScope: f.scope, targetInventoryArtifactSha256: input.targetInventoryArtifact.sha256,
    candidateArtifactSha256: input.candidateArtifacts[row.phase].sha256, sourceRowSha256: row.sourceRowSha256, decision, cryptoEnvelope };
  const { publicKey, privateKey } = generateKeyPairSync("ed25519"), signed = Buffer.from(canonical(binding)), signature = sign(null, signed, privateKey);
  assert.equal(verify(null, signed, publicKey, signature), true);
  const attestation = Buffer.from(canonical({ binding, signatureBase64: signature.toString("base64"), publicKeyPem: publicKey.export({ type: "spki", format: "pem" }) }));
  decision.decisionAttestationSha256 = hash(attestation);
  return { phase: row.phase, targetTable: row.targetTable, sourceIdentitySha256: row.sourceIdentitySha256, sourceRowSha256: row.sourceRowSha256,
    candidateArtifactSha256: input.candidateArtifacts[row.phase].sha256, decision, attestationBase64: attestation.toString("base64"), cryptoEnvelope };
}
