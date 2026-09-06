/* global Buffer, structuredClone */
import { createHash, createPublicKey, sign, verify } from "node:crypto";

export const SINGLE_ACCOUNTABLE_OWNER_POLICY = "single_accountable_owner_v1";
const canonical = value => value === null ? "null" : Array.isArray(value)
  ? `[${value.map(canonical).join(",")}]` : typeof value === "object"
    ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`
    : JSON.stringify(value);
export const approvalPolicyHash = value => createHash("sha256").update(`${canonical(value)}\n`).digest("hex");
const fail = () => { const error = new Error("PRODUCTION_IMPORT_SINGLE_OWNER_POLICY_INVALID"); error.code = error.message; throw error; };
const exact = (value, keys) => {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) fail();
};
const hash = value => { if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) fail(); };
const same = (left, right) => canonical(left) === canonical(right);
export const productionImportOperatorPublicKeyHash = key => createHash("sha256")
  .update(createPublicKey(key).export({ type: "spki", format: "der" })).digest("hex");

// Confirmation provenance is supplied by the accountable owner/operator. This
// verifies its exact delegation and integrity, never the owner's personal identity.
export function validateSingleOwnerConfirmation(confirmation, expectedContext) {
  exact(confirmation, ["formatVersion", "artifactKind", "provenance", "decision", "ownerSubjectRefSha256", "confirmationEvidenceSha256", "operatorSubjectRefSha256", "operatorPublicKeySha256", "context"]);
  if (confirmation.formatVersion !== 1 || confirmation.artifactKind !== "yuzhou_hr_single_owner_confirmation"
    || confirmation.provenance !== "explicit_user_confirmation" || confirmation.decision !== "AUTHORIZE_DELEGATED_OPERATION") fail();
  for (const key of ["ownerSubjectRefSha256", "confirmationEvidenceSha256", "operatorSubjectRefSha256", "operatorPublicKeySha256"]) hash(confirmation[key]);
  const context = confirmation.context;
  exact(context, ["operationId", "binding", "issuedAt", "expiresAt", "nonceSha256", "preparationArtifacts", "payloadBundleSha256"]);
  if (!/^yzprod-import-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{12}$/u.test(context.operationId ?? "")) fail();
  hash(context.nonceSha256);
  exact(context.preparationArtifacts, ["preparedSha256", "reviewedSha256", "bridgeEvidenceSha256"]);
  Object.values(context.preparationArtifacts).forEach(hash);
  exact(context.payloadBundleSha256, ["T0", "T1", "T2", "T3"]);
  Object.values(context.payloadBundleSha256).forEach(hash);
  const binding = context.binding;
  if (!binding || typeof binding !== "object" || Array.isArray(binding)) fail();
  exact(binding.triple, ["codeSha", "sourceSnapshotHash", "mappingContractHash"]);
  if (!/^[a-f0-9]{40}$/u.test(binding.triple.codeSha ?? "")) fail();
  hash(binding.triple.sourceSnapshotHash); hash(binding.triple.mappingContractHash);
  for (const key of ["targetIdentitySha256", "targetScopeSha256", "finalRehearsalPairSha256"]) hash(binding[key]);
  hash(binding.manifestSha256 ?? binding.importManifestSha256);
  const times = [context.issuedAt, context.expiresAt, binding.windowStartsAt, binding.windowEndsAt].map(value => typeof value === "string" ? Date.parse(value) : NaN);
  if (!times.every(Number.isFinite) || times[0] >= times[1] || times[0] < times[2] || times[1] > times[3]) fail();
  if (expectedContext && !same(context, expectedContext)) fail();
  return confirmation;
}

export function validateProductionImportSingleOwnerPolicy({ approvalPolicy, approvalSet, context }) {
  exact(approvalPolicy, ["kind", "confirmation", "operatorAttestation"]);
  if (approvalPolicy.kind !== SINGLE_ACCOUNTABLE_OWNER_POLICY) fail();
  const confirmation = validateSingleOwnerConfirmation(approvalPolicy.confirmation, context);
  if (!Array.isArray(approvalSet) || approvalSet.length !== 1) fail();
  exact(approvalSet[0], ["role", "subjectRefSha256", "ownerDecisionSha256"]);
  if (!same(approvalSet[0], { role: "accountable_owner", subjectRefSha256: confirmation.ownerSubjectRefSha256, ownerDecisionSha256: approvalPolicyHash(confirmation) })) fail();
  const attestation = approvalPolicy.operatorAttestation;
  exact(attestation, ["publicKeyPem", "signatureBase64"]);
  try {
    const key = createPublicKey(attestation.publicKeyPem);
    const signature = Buffer.from(attestation.signatureBase64, "base64");
    if (key.asymmetricKeyType !== "ed25519" || signature.length !== 64 || signature.toString("base64") !== attestation.signatureBase64
      || productionImportOperatorPublicKeyHash(attestation.publicKeyPem) !== confirmation.operatorPublicKeySha256
      || !verify(null, Buffer.from(canonical(confirmation)), key, signature)) fail();
  } catch { fail(); }
  return true;
}

export function createProductionImportSingleOwnerPolicy({ confirmation, operatorSigningKey }) {
  validateSingleOwnerConfirmation(confirmation);
  const publicKeyPem = createPublicKey(operatorSigningKey).export({ type: "spki", format: "pem" }).toString();
  const approvalPolicy = { kind: SINGLE_ACCOUNTABLE_OWNER_POLICY, confirmation: structuredClone(confirmation), operatorAttestation: {
    publicKeyPem, signatureBase64: sign(null, Buffer.from(canonical(confirmation)), operatorSigningKey).toString("base64"),
  } };
  const approvalSet = [{ role: "accountable_owner", subjectRefSha256: confirmation.ownerSubjectRefSha256, ownerDecisionSha256: approvalPolicyHash(confirmation) }];
  validateProductionImportSingleOwnerPolicy({ approvalPolicy, approvalSet, context: confirmation.context });
  return { approvalPolicy, approvalSet };
}
