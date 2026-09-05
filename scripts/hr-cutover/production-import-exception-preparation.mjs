/** Quarantine preparation and external-signature finalization. No IO or signing. */
import { createHash, createPublicKey, verify } from "node:crypto";
import { TextDecoder } from "node:util";
import { freezeProductionImportCandidates } from "./production-import-candidate-freeze.mjs";
import { normalizeProductionImportTargetFields } from "./production-import-payload-generator.mjs";
import { computeProductionImportPayloadHash } from "./production-import-sealed-plan-lib.mjs";
import { encryptProductionImportEnvelope, decryptProductionImportEnvelope } from "./production-import-crypto-provider.mjs";
import { DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL as model, stableProductionImportCanonicalJson as canonical } from "./production-import-target-model.mjs";

const SHA = /^[0-9a-f]{64}$/u, OPERATION = /^yzprod-import-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{12}$/u;
const hash = value => createHash("sha256").update(value).digest("hex");
const plain = value => value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
const same = (left, right) => canonical(left) === canonical(right);
const choiceKeys = ["phase", "targetTable", "sourceIdentitySha256", "sourceRowSha256", "reasonCode", "targetFields", "dependencyRefs"];
export class ProductionImportExceptionPreparationError extends Error {
  constructor(code) { super(code); this.name = "ProductionImportExceptionPreparationError"; this.code = code; }
}
const fail = code => { throw new ProductionImportExceptionPreparationError(`EXCEPTION_PREPARATION_${code}`); };
function exact(value, keys) {
  if (!plain(value) || Object.keys(value).sort().join("|") !== [...keys].sort().join("|")) fail("SHAPE_INVALID");
}
function document(input) {
  exact(input, ["path", "bytes", "sha256"]);
  if (typeof input.path !== "string" || !input.path || !(typeof input.bytes === "string" || input.bytes instanceof Uint8Array)
    || (input.bytes instanceof Uint8Array && input.bytes.buffer instanceof SharedArrayBuffer)) fail("DESCRIPTOR_INVALID");
  const bytes = typeof input.bytes === "string" ? Buffer.from(input.bytes, "utf8") : input.bytes;
  if (!SHA.test(input.sha256 ?? "") || hash(bytes) !== input.sha256) fail("HASH_MISMATCH");
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { fail("JSON_INVALID"); }
}
function base64(value, expectedLength) {
  if (typeof value !== "string" || !value.length) fail("ENCODING_INVALID");
  const bytes = Buffer.from(value, "base64");
  if (bytes.toString("base64") !== value || (expectedLength && bytes.length !== expectedLength)) fail("ENCODING_INVALID");
  return bytes;
}
function inputBindings(input) {
  if (input.reviewedDecisionsArtifact !== null) fail("UNSIGNED_INPUT_REQUIRED");
  return { triple: structuredClone(input.expectedTriple),
    phaseArtifactSha256: Object.fromEntries(model.phaseOrder.map(phase => [phase, input.phaseArtifacts[phase].sha256])),
    candidateArtifactSha256: Object.fromEntries(model.phaseOrder.map(phase => [phase, input.candidateArtifacts[phase].sha256])),
    targetInventoryArtifactSha256: input.targetInventoryArtifact.sha256, targetScopeArtifactSha256: input.targetScopeArtifact.sha256 };
}
function choicesDocument(artifact, bindings) {
  const choices = document(artifact);
  exact(choices, ["formatVersion", "artifactKind", "bindings", "records"]);
  if (choices.formatVersion !== 1 || choices.artifactKind !== "yuzhou_hr_production_import_quarantine_choices" || !same(choices.bindings, bindings) || !Array.isArray(choices.records)) fail("CHOICE_BINDING_INVALID");
  const indexed = new Map();
  for (const row of choices.records) {
    exact(row, choiceKeys);
    if (!SHA.test(row.sourceIdentitySha256 ?? "") || indexed.has(row.sourceIdentitySha256)) fail("CHOICE_COVERAGE_INVALID");
    indexed.set(row.sourceIdentitySha256, row);
  }
  return indexed;
}
function choiceDecision(choice, candidate, candidates) {
  if (!choice || !candidate || candidate.candidateDisposition !== "quarantine" || choice.phase !== candidate.phase || choice.targetTable !== candidate.targetTable
    || choice.sourceIdentitySha256 !== candidate.sourceIdentitySha256 || choice.sourceRowSha256 !== candidate.sourceRowSha256 || choice.reasonCode !== candidate.reasonCode) fail("CHOICE_BINDING_INVALID");
  const rule = model.targetTables[candidate.targetTable];
  const fields = normalizeProductionImportTargetFields(candidate.targetTable, choice.targetFields, rule, { partial: true });
  if (!Array.isArray(choice.dependencyRefs)) fail("CHOICE_DEPENDENCY_INVALID");
  const roles = new Set();
  for (const ref of choice.dependencyRefs) {
    exact(ref, ["role", "phase", "sourceIdentitySha256", "expectedTargetTable"]);
    const fk = rule.foreignKeys.find(fk => fk.dependencyRole === ref.role), parent = candidates?.get(ref.sourceIdentitySha256);
    if (!fk || roles.has(ref.role) || !SHA.test(ref.sourceIdentitySha256 ?? "") || fk.targetTable !== ref.expectedTargetTable
      || model.targetTables[ref.expectedTargetTable]?.phase !== ref.phase || model.phaseOrder.indexOf(ref.phase) > model.phaseOrder.indexOf(choice.phase)
      || (candidates && (!parent || parent.targetTable !== ref.expectedTargetTable || parent.phase !== ref.phase))) fail("CHOICE_DEPENDENCY_INVALID");
    roles.add(ref.role);
  }
  return { phase: choice.phase, targetTable: choice.targetTable, sourceIdentitySha256: choice.sourceIdentitySha256, disposition: "quarantine",
    targetFields: fields, dependencyRefs: structuredClone(choice.dependencyRefs) };
}
function context(operationId, targetScope, keyReferenceSha256, candidate, decision) {
  return { kind: "quarantine", operationId, phaseName: candidate.phase, targetScope, keyReferenceSha256,
    record: { sourceSystem: candidate.sourceSystem, sourceTable: candidate.sourceTable, sourceIdentitySha256: candidate.sourceIdentitySha256,
      sourceRowSha256: candidate.sourceRowSha256, payloadSha256: computeProductionImportPayloadHash(decision.targetFields),
      plannedTargetTable: candidate.targetTable, disposition: "quarantine", ...(decision.quarantine ? { quarantine: decision.quarantine } : {}) } };
}
function envelopeFromReview(value) {
  exact(value, ["operationId", "algorithm", "keyReferenceSha256", "nonceBase64", "authenticationTagBase64", "ciphertextBase64"]);
  const ciphertext = base64(value.ciphertextBase64);
  if (!ciphertext.length || ciphertext.length > 8 * 1024 ** 2) fail("ENVELOPE_INVALID");
  return { algorithm: value.algorithm, keyReferenceSha256: value.keyReferenceSha256,
    nonce: base64(value.nonceBase64, 12), authenticationTag: base64(value.authenticationTagBase64, 16), ciphertext };
}
function executionEntry(candidate, envelope) {
  return { kind: "quarantine", phaseName: candidate.phase, sourceIdentitySha256: candidate.sourceIdentitySha256,
    envelope: { algorithm: envelope.algorithm, keyReferenceSha256: envelope.keyReferenceSha256,
      nonceHex: envelope.nonce.toString("hex"), authenticationTagHex: envelope.authenticationTag.toString("hex"), ciphertextHex: envelope.ciphertext.toString("hex") } };
}
function binding(bindings, targetScope, candidate, decision, cryptoEnvelope) {
  return { triple: bindings.triple, targetScope, targetInventoryArtifactSha256: bindings.targetInventoryArtifactSha256,
    candidateArtifactSha256: bindings.candidateArtifactSha256[candidate.phase], sourceRowSha256: candidate.sourceRowSha256, decision, cryptoEnvelope };
}
function parameters(operationId, keyReferenceSha256) {
  if (!OPERATION.test(operationId ?? "") || !SHA.test(keyReferenceSha256 ?? "")) fail("CONTEXT_INVALID");
}
async function sanitized(action) {
  try { return await action(); }
  catch (error) {
    if (error instanceof ProductionImportExceptionPreparationError) throw error;
    // Existing validators may attach source-specific details; never forward them.
    fail("VALIDATION_FAILED");
  }
}

export async function prepareProductionImportExceptions(input, { resolveKey } = {}) {
  return sanitized(async () => {
    exact(input, ["freezeInput", "choicesArtifact", "operationId", "keyReferenceSha256"]);
    input = { ...input, choicesArtifact: { ...input.choicesArtifact } };
    parameters(input.operationId, input.keyReferenceSha256);
    const bindings = inputBindings(input.freezeInput), choices = choicesDocument(input.choicesArtifact, bindings);
    // One complete candidate validation per mode. No external authority is asserted.
    const validated = freezeProductionImportCandidates(input.freezeInput);
    const candidates = new Map(validated.evidence.records.map(row => [row.candidate.sourceIdentitySha256, row.candidate]));
    const exceptions = [...candidates.values()].filter(row => row.candidateDisposition !== "insert");
    if (!exceptions.length || exceptions.some(row => row.candidateDisposition !== "quarantine") || choices.size !== exceptions.length) fail("CHOICE_COVERAGE_INVALID");
    // Validate every choice before invoking the external key resolver.
    const decisions = exceptions.map(candidate => choiceDecision(choices.get(candidate.sourceIdentitySha256), candidate, candidates));
    const records = [], entries = [];
    for (const [index, candidate] of exceptions.entries()) {
      const decision = decisions[index];
      const encrypted = await encryptProductionImportEnvelope({ ...context(input.operationId, validated.evidence.targetScope, input.keyReferenceSha256, candidate, decision), value: decision.targetFields }, { resolveKey });
      decision.quarantine = { ...encrypted.binding, reasonCode: candidate.reasonCode };
      const cryptoEnvelope = { operationId: input.operationId, algorithm: encrypted.envelope.algorithm, keyReferenceSha256: input.keyReferenceSha256,
        nonceBase64: encrypted.envelope.nonce.toString("base64"), authenticationTagBase64: encrypted.envelope.authenticationTag.toString("base64"), ciphertextBase64: encrypted.envelope.ciphertext.toString("base64") };
      records.push({ candidate, binding: binding(bindings, validated.evidence.targetScope, candidate, decision, cryptoEnvelope) });
      entries.push(executionEntry(candidate, encrypted.envelope));
    }
    const envelopes = { formatVersion: 1, artifactKind: "yuzhou_hr_production_import_crypto_envelopes", operationId: input.operationId, entries };
    const prepared = { formatVersion: 1, artifactKind: "yuzhou_hr_production_import_unsigned_exception_requests", bindings, targetScope: validated.evidence.targetScope,
      operationId: input.operationId, keyReferenceSha256: input.keyReferenceSha256, choicesArtifactSha256: input.choicesArtifact.sha256,
      envelopeArtifactSha256: hash(canonical(envelopes) + "\n"), records, approvalClaimed: false, productionImport: "HOLD" };
    return { prepared, envelopes, summary: { status: "AWAITING_EXTERNAL_SIGNATURES", recordCount: records.length, approvalClaimed: false, signerAuthorityEstablished: false, productionImport: "HOLD" } };
  });
}

function reviewersDocument(artifact) {
  const reviewers = document(artifact);
  exact(reviewers, ["formatVersion", "artifactKind", "publicKeys"]);
  if (reviewers.formatVersion !== 1 || reviewers.artifactKind !== "yuzhou_hr_production_import_external_reviewer_keys" || !Array.isArray(reviewers.publicKeys) || !reviewers.publicKeys.length) fail("REVIEWER_KEYS_INVALID");
  const keys = new Map();
  for (const row of reviewers.publicKeys) {
    exact(row, ["publicKeySha256", "publicKeyPem"]);
    if (typeof row.publicKeyPem !== "string" || !row.publicKeyPem.startsWith("-----BEGIN PUBLIC KEY-----")) fail("REVIEWER_KEYS_INVALID");
    const key = createPublicKey(row.publicKeyPem), digest = hash(key.export({ type: "spki", format: "der" }));
    if (key.asymmetricKeyType !== "ed25519" || row.publicKeySha256 !== digest || keys.has(digest)) fail("REVIEWER_KEYS_INVALID");
    keys.set(digest, key);
  }
  return keys;
}
export async function finalizeProductionImportExceptions(input, { resolveKey } = {}) {
  return sanitized(async () => {
    exact(input, ["freezeInput", "choicesArtifact", "operationId", "keyReferenceSha256", "preparedArtifact", "envelopesArtifact", "attestationsArtifact", "reviewersArtifact"]);
    input = { ...input, preparedArtifact: { ...input.preparedArtifact }, envelopesArtifact: { ...input.envelopesArtifact }, reviewersArtifact: { ...input.reviewersArtifact } };
    parameters(input.operationId, input.keyReferenceSha256);
    const bindings = inputBindings(input.freezeInput), choices = choicesDocument(input.choicesArtifact, bindings), prepared = document(input.preparedArtifact);
    exact(prepared, ["formatVersion", "artifactKind", "bindings", "targetScope", "operationId", "keyReferenceSha256", "choicesArtifactSha256", "envelopeArtifactSha256", "records", "approvalClaimed", "productionImport"]);
    if (prepared.formatVersion !== 1 || prepared.artifactKind !== "yuzhou_hr_production_import_unsigned_exception_requests" || prepared.approvalClaimed !== false || prepared.productionImport !== "HOLD"
      || !same(prepared.bindings, bindings) || prepared.operationId !== input.operationId || prepared.keyReferenceSha256 !== input.keyReferenceSha256
      || prepared.choicesArtifactSha256 !== input.choicesArtifact.sha256 || !Array.isArray(prepared.records) || !prepared.records.length || prepared.records.length !== choices.size) fail("PREPARED_BINDING_INVALID");
    const envelopes = document(input.envelopesArtifact);
    if (prepared.envelopeArtifactSha256 !== input.envelopesArtifact.sha256) fail("ENVELOPE_BINDING_INVALID");
    exact(envelopes, ["formatVersion", "artifactKind", "operationId", "entries"]);
    if (envelopes.formatVersion !== 1 || envelopes.artifactKind !== "yuzhou_hr_production_import_crypto_envelopes" || envelopes.operationId !== input.operationId || !Array.isArray(envelopes.entries)) fail("ENVELOPE_BINDING_INVALID");
    const attestations = document(input.attestationsArtifact);
    exact(attestations, ["formatVersion", "artifactKind", "preparedArtifactSha256", "records"]);
    if (attestations.formatVersion !== 1 || attestations.artifactKind !== "yuzhou_hr_production_import_external_exception_attestations" || attestations.preparedArtifactSha256 !== input.preparedArtifact.sha256
      || !Array.isArray(attestations.records) || attestations.records.length !== prepared.records.length) fail("ATTESTATION_COVERAGE_INVALID");
    const keys = reviewersDocument(input.reviewersArtifact), signatures = new Map();
    for (const item of attestations.records) {
      exact(item, ["sourceIdentitySha256", "attestationBase64"]);
      if (signatures.has(item.sourceIdentitySha256)) fail("ATTESTATION_COVERAGE_INVALID");
      signatures.set(item.sourceIdentitySha256, item.attestationBase64);
    }
    const records = [], expectedEntries = [], originals = new Map();
    for (const item of prepared.records) {
      exact(item, ["candidate", "binding"]);
      const candidate = item.candidate, choice = choices.get(candidate.sourceIdentitySha256);
      if (!choice || originals.has(candidate.sourceIdentitySha256)) fail("CHOICE_COVERAGE_INVALID");
      originals.set(candidate.sourceIdentitySha256, candidate);
      const decision = choiceDecision(choice, candidate);
      const supplied = item.binding;
      exact(supplied, ["triple", "targetScope", "targetInventoryArtifactSha256", "candidateArtifactSha256", "sourceRowSha256", "decision", "cryptoEnvelope"]);
      decision.quarantine = supplied.decision.quarantine;
      exact(decision.quarantine, ["algorithm", "keyReferenceSha256", "payloadCiphertextSha256", "reasonCode"]);
      if (decision.quarantine.reasonCode !== candidate.reasonCode || !same(supplied, binding(bindings, prepared.targetScope, candidate, decision, supplied.cryptoEnvelope))
        || supplied.cryptoEnvelope.operationId !== input.operationId || supplied.cryptoEnvelope.keyReferenceSha256 !== input.keyReferenceSha256) fail("PREPARED_BINDING_INVALID");
      const envelope = envelopeFromReview(supplied.cryptoEnvelope);
      expectedEntries.push(executionEntry(candidate, envelope));
      const attestationBase64 = signatures.get(candidate.sourceIdentitySha256), attestationBytes = base64(attestationBase64);
      let attestation;
      try { attestation = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(attestationBytes)); } catch { fail("ATTESTATION_INVALID"); }
      exact(attestation, ["binding", "signatureBase64", "publicKeyPem"]);
      if (typeof attestation.publicKeyPem !== "string" || !attestation.publicKeyPem.startsWith("-----BEGIN PUBLIC KEY-----")) fail("SIGNATURE_INVALID");
      if (!same(attestation.binding, supplied)) fail("ATTESTATION_BINDING_INVALID");
      const publicKey = createPublicKey(attestation.publicKeyPem), signerHash = hash(publicKey.export({ type: "spki", format: "der" }));
      if (publicKey.asymmetricKeyType !== "ed25519" || !keys.has(signerHash) || !verify(null, Buffer.from(canonical(supplied)), keys.get(signerHash), base64(attestation.signatureBase64, 64))) fail("SIGNATURE_INVALID");
      const decrypted = await decryptProductionImportEnvelope({ ...context(input.operationId, prepared.targetScope, input.keyReferenceSha256, candidate, decision), envelope }, { resolveKey });
      if (!same(decrypted.payload, decision.targetFields)) fail("PAYLOAD_INVALID");
      records.push({ phase: candidate.phase, targetTable: candidate.targetTable, sourceIdentitySha256: candidate.sourceIdentitySha256, sourceRowSha256: candidate.sourceRowSha256,
        candidateArtifactSha256: bindings.candidateArtifactSha256[candidate.phase], decision: { ...decision, decisionAttestationSha256: hash(attestationBytes) }, attestationBase64, cryptoEnvelope: supplied.cryptoEnvelope });
    }
    if (!same(envelopes.entries, expectedEntries)) fail("ENVELOPE_BINDING_INVALID");
    const reviewed = { formatVersion: 1, artifactKind: "yuzhou_hr_production_import_reviewed_candidate_resolutions", triple: bindings.triple, targetScope: prepared.targetScope,
      targetInventoryArtifactSha256: bindings.targetInventoryArtifactSha256, candidateArtifactSha256: bindings.candidateArtifactSha256, records };
    const bytes = canonical(reviewed) + "\n";
    const frozen = freezeProductionImportCandidates({ ...input.freezeInput, reviewedDecisionsArtifact: { path: "finalized-exception-resolutions.json", bytes, sha256: hash(bytes) } });
    if (frozen.summary.status !== "READY") fail("FREEZE_NOT_READY");
    for (const item of frozen.evidence.records) if (originals.has(item.candidate.sourceIdentitySha256) && !same(item.candidate, originals.get(item.candidate.sourceIdentitySha256))) fail("ORIGINAL_EVIDENCE_INVALID");
    return { reviewed, summary: { status: "VERIFIED_AGAINST_PINNED_REVIEWER_KEYS", recordCount: records.length, approvalClaimed: false,
      signatureVerifiedAgainstProvidedKeys: true, signerAuthorityEstablished: false, productionImport: "HOLD", preparedArtifactSha256: input.preparedArtifact.sha256,
      envelopeArtifactSha256: input.envelopesArtifact.sha256, reviewerKeysArtifactSha256: input.reviewersArtifact.sha256 } };
  });
}
