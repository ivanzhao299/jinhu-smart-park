/* global Buffer, structuredClone, SharedArrayBuffer */
/** Delegated integrity producer. No owner identity claim, IO, key creation or activation. */
import { createHash, createPublicKey, sign, verify } from "node:crypto";
import { TextDecoder } from "node:util";
import { finalizeProductionImportExceptions } from "./production-import-exception-preparation.mjs";
import { stableProductionImportCanonicalJson as canonical } from "./production-import-target-model.mjs";
import { approvalPolicyHash, createProductionImportSingleOwnerPolicy, validateSingleOwnerConfirmation,
  productionImportOperatorPublicKeyHash } from "./production-import-approval-policy.mjs";

const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const same = (a, b) => canonical(a) === canonical(b);
const fail = () => { const error = new Error("PRODUCTION_IMPORT_DELEGATION_INVALID"); error.code = error.message; throw error; };
const exact = (value, keys) => { if (!value || typeof value !== "object" || Array.isArray(value)
  || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) fail(); };
function document(artifact) {
  exact(artifact, ["path", "bytes", "sha256"]);
  if (!(typeof artifact.bytes === "string" || artifact.bytes instanceof Uint8Array)
    || (artifact.bytes instanceof Uint8Array && artifact.bytes.buffer instanceof SharedArrayBuffer)) fail();
  const bytes = typeof artifact.bytes === "string" ? Buffer.from(artifact.bytes) : artifact.bytes;
  if (digest(bytes) !== artifact.sha256) fail();
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { fail(); }
}
const descriptor = value => ({ path: "delegated-integrity.json", bytes: canonical(value) + "\n", sha256: approvalPolicyHash(value) });
function attest(value, key) {
  const publicKeyPem = createPublicKey(key).export({ type: "spki", format: "pem" }).toString();
  if (createPublicKey(publicKeyPem).asymmetricKeyType !== "ed25519") fail();
  return { publicKeyPem, signatureBase64: sign(null, Buffer.from(canonical(value)), key).toString("base64") };
}
function verifyAttestation(value, attestation, expectedKeyHash) {
  exact(attestation, ["publicKeyPem", "signatureBase64"]);
  try {
    const key = createPublicKey(attestation.publicKeyPem), signature = Buffer.from(attestation.signatureBase64, "base64");
    if (key.asymmetricKeyType !== "ed25519" || productionImportOperatorPublicKeyHash(attestation.publicKeyPem) !== expectedKeyHash
      || signature.length !== 64 || signature.toString("base64") !== attestation.signatureBase64
      || !verify(null, Buffer.from(canonical(value)), key, signature)) fail();
  } catch { fail(); }
}

export async function finalizeDelegatedProductionImportExceptions(input, { resolveKey, operatorSigningKey } = {}) {
  try {
    exact(input, ["freezeInput", "choicesArtifact", "operationId", "keyReferenceSha256", "preparedArtifact", "envelopesArtifact"]);
    const prepared = document(input.preparedArtifact);
    if (!Array.isArray(prepared.records) || !prepared.records.length) fail();
    const publicKeyPem = createPublicKey(operatorSigningKey).export({ type: "spki", format: "pem" }).toString();
    const operatorPublicKeySha256 = productionImportOperatorPublicKeyHash(publicKeyPem);
    const attestations = { formatVersion: 1, artifactKind: "yuzhou_hr_production_import_external_exception_attestations", preparedArtifactSha256: input.preparedArtifact.sha256,
      records: prepared.records.map(({ candidate, binding }) => ({ sourceIdentitySha256: candidate.sourceIdentitySha256,
        attestationBase64: Buffer.from(canonical({ binding, ...attest(binding, operatorSigningKey) })).toString("base64") })) };
    const reviewers = { formatVersion: 1, artifactKind: "yuzhou_hr_production_import_external_reviewer_keys", publicKeys: [{ publicKeySha256: operatorPublicKeySha256, publicKeyPem }] };
    // Exactly one full freeze, plus existing signature, normalized payload and GCM
    // validation. The signed receipt retains its small bridge output bindings.
    const result = await finalizeProductionImportExceptions({ ...input, attestationsArtifact: descriptor(attestations), reviewersArtifact: descriptor(reviewers) }, { resolveKey, includeBridgeEvidence: true });
    const binding = { operationId: input.operationId, triple: prepared.bindings.triple, targetScope: prepared.targetScope,
      preparedSha256: input.preparedArtifact.sha256, reviewedSha256: approvalPolicyHash(result.reviewed),
      ...result.bridgeEvidence, operatorPublicKeySha256 };
    const bridgeEvidence = { formatVersion: 1, artifactKind: "yuzhou_hr_delegated_exception_integrity_receipt", binding,
      operatorAttestation: attest(binding, operatorSigningKey), ownerAuthorizationClaimed: false, productionImport: "HOLD" };
    return { reviewed: result.reviewed, bridgeEvidence, summary: { status: "DELEGATED_INTEGRITY_VERIFIED", recordCount: result.summary.recordCount,
      ownerAuthorizationClaimed: false, signerAuthorityEstablished: false, productionImport: "HOLD" } };
  } catch { fail(); }
}

export function authorizeDelegatedProductionImport({ confirmationArtifact, confirmationSourceArtifact, preparedArtifact, reviewedArtifact, bridgeEvidenceArtifact }, { operatorSigningKey, now = new Date() } = {}) {
  try {
    const confirmation = document(confirmationArtifact), prepared = document(preparedArtifact), reviewed = document(reviewedArtifact), receipt = document(bridgeEvidenceArtifact);
    validateSingleOwnerConfirmation(confirmation);
    exact(confirmationSourceArtifact, ["path", "bytes", "sha256"]);
    if (!(typeof confirmationSourceArtifact.bytes === "string" || confirmationSourceArtifact.bytes instanceof Uint8Array)
      || (confirmationSourceArtifact.bytes instanceof Uint8Array && confirmationSourceArtifact.bytes.buffer instanceof SharedArrayBuffer)
      || !confirmationSourceArtifact.bytes.length || digest(confirmationSourceArtifact.bytes) !== confirmationSourceArtifact.sha256
      || confirmationSourceArtifact.sha256 !== confirmation.confirmationEvidenceSha256) fail();
    const context = confirmation.context, artifacts = context.preparationArtifacts;
    if (!same(artifacts, { preparedSha256: preparedArtifact.sha256, reviewedSha256: reviewedArtifact.sha256, bridgeEvidenceSha256: bridgeEvidenceArtifact.sha256 })) fail();
    const current = new Date(now).getTime();
    if (!Number.isFinite(current) || current < Date.parse(context.issuedAt) || current >= Date.parse(context.expiresAt)) fail();
    exact(receipt, ["formatVersion", "artifactKind", "binding", "operatorAttestation", "ownerAuthorizationClaimed", "productionImport"]);
    if (receipt.formatVersion !== 1 || receipt.artifactKind !== "yuzhou_hr_delegated_exception_integrity_receipt" || receipt.ownerAuthorizationClaimed !== false || receipt.productionImport !== "HOLD") fail();
    const bound = receipt.binding;
    exact(bound, ["operationId", "triple", "targetScope", "preparedSha256", "reviewedSha256", "targetIdentitySha256", "generationEvidence", "outputArtifactSha256", "operatorPublicKeySha256"]);
    verifyAttestation(bound, receipt.operatorAttestation, confirmation.operatorPublicKeySha256);
    if (bound.operatorPublicKeySha256 !== confirmation.operatorPublicKeySha256 || bound.operationId !== context.operationId
      || !same(bound.triple, context.binding.triple) || bound.targetIdentitySha256 !== context.binding.targetIdentitySha256
      || bound.targetScope.scopeSha256 !== context.binding.targetScopeSha256 || bound.preparedSha256 !== preparedArtifact.sha256 || bound.reviewedSha256 !== reviewedArtifact.sha256
      || !same(bound.generationEvidence.payloadBundleSha256, context.payloadBundleSha256)
      || prepared.operationId !== context.operationId || !same(prepared.bindings.triple, bound.triple) || !same(prepared.targetScope, bound.targetScope)
      || !same(reviewed.triple, bound.triple) || !same(reviewed.targetScope, bound.targetScope) || !Array.isArray(prepared.records) || !Array.isArray(reviewed.records)
      || !prepared.records.length || prepared.records.length !== reviewed.records.length) fail();
    const originals = new Map(prepared.records.map(row => [row.candidate.sourceIdentitySha256, row]));
    if (originals.size !== prepared.records.length) fail();
    for (const row of reviewed.records) {
      const original = originals.get(row.sourceIdentitySha256);
      if (!original) fail(); originals.delete(row.sourceIdentitySha256);
      const bytes = Buffer.from(row.attestationBase64, "base64"), signed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
      exact(signed, ["binding", "publicKeyPem", "signatureBase64"]);
      if (!same(signed.binding, original.binding) || digest(bytes) !== row.decision.decisionAttestationSha256) fail();
      verifyAttestation(signed.binding, { publicKeyPem: signed.publicKeyPem, signatureBase64: signed.signatureBase64 }, confirmation.operatorPublicKeySha256);
    }
    return createProductionImportSingleOwnerPolicy({ confirmation, operatorSigningKey });
  } catch { fail(); }
}
