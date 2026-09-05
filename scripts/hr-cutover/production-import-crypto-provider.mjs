/* global Buffer */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import {
  DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL,
  computeProductionImportTargetCanonicalHash,
  stableProductionImportCanonicalJson,
} from "./production-import-target-model.mjs";
import { computeProductionImportPayloadHash } from "./production-import-sealed-plan-lib.mjs";

const ALGORITHM = "aes-256-gcm-external-kek-v1";
const SHA = /^[0-9a-f]{64}$/u;
const SCOPE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const MAX_PLAINTEXT_BYTES = 8 * 1024 * 1024;
const hash = value => createHash("sha256").update(value).digest("hex");
const json = stableProductionImportCanonicalJson;
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);

export class ProductionImportCryptoError extends Error {
  constructor(code) { super(code); this.name = "ProductionImportCryptoError"; this.code = code; }
}
const fail = code => { throw new ProductionImportCryptoError(code); };
const invalid = () => fail("PRODUCTION_IMPORT_CRYPTO_INPUT_INVALID");

function context(input) {
  // An async key resolver must not change validated record/scope/envelope.
  // Keep Buffer copies: structuredClone otherwise turns them into Uint8Array.
  const originalEnvelope = input?.envelope;
  if (originalEnvelope?.ciphertext?.length > MAX_PLAINTEXT_BYTES) invalid();
  input = structuredClone(input);
  if (originalEnvelope) {
    for (const field of ["nonce", "authenticationTag", "ciphertext"]) {
      if (Buffer.isBuffer(originalEnvelope[field])) input.envelope[field] = Buffer.from(originalEnvelope[field]);
    }
  }
  const { kind, operationId, phaseName, targetScope, record, keyReferenceSha256 } = input ?? {};
  if (!["before_image", "quarantine"].includes(kind)
    || !/^yzprod-import-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{12}$/u.test(operationId ?? "")
    || !["T0", "T1", "T2", "T3"].includes(phaseName)
    || !object(targetScope) || !SCOPE.test(targetScope.tenantId ?? "")
    || !SCOPE.test(targetScope.parkId ?? "") || !SHA.test(targetScope.scopeSha256 ?? "")
    || !object(record) || !SHA.test(keyReferenceSha256 ?? "")) invalid();
  const rule = DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL.targetTables[record.plannedTargetTable];
  if (!rule || rule.phase !== phaseName
    || !rule.allowedSourceTables.includes(record.sourceTable)
    || record.sourceSystem !== "yuzhou-v10"
    || ![record.sourceIdentitySha256, record.sourceRowSha256, record.payloadSha256].every(value => SHA.test(value ?? ""))) invalid();
  if (kind === "before_image") {
    if (record.disposition !== "merge" || !rule.allowedDispositions.includes("merge")
      || record.targetTable !== record.plannedTargetTable || !UUID.test(record.targetId ?? "")
      || !SHA.test(record.expectedTargetBeforeSha256 ?? "")
      || !Number.isSafeInteger(record.expectedTargetVersionBefore) || record.expectedTargetVersionBefore < 0) invalid();
  } else if (record.disposition !== "quarantine" || !rule.allowedDispositions.includes("quarantine")) invalid();
  // Ciphertext is generated BEFORE the plan is sealed. Binding the plan hash here
  // would create a cycle; bind immutable row/operation/scope identity instead.
  const aad = Buffer.from(json({
    formatVersion: 1, algorithm: ALGORITHM, kind, operationId, phaseName,
    targetScope: { tenantId: targetScope.tenantId, parkId: targetScope.parkId, scopeSha256: targetScope.scopeSha256 },
    sourceSystem: record.sourceSystem, sourceTable: record.sourceTable,
    sourceIdentitySha256: record.sourceIdentitySha256, sourceRowSha256: record.sourceRowSha256,
    payloadSha256: record.payloadSha256, targetTable: record.plannedTargetTable,
    targetId: kind === "before_image" ? record.targetId : null,
    targetVersionBefore: kind === "before_image" ? record.expectedTargetVersionBefore : null,
    targetBeforeSha256: kind === "before_image" ? record.expectedTargetBeforeSha256 : null,
    keyReferenceSha256,
  }));
  return { ...input, rule, aad };
}

function validateValue(ctx, value) {
  if (!object(value)) invalid();
  if (ctx.kind === "quarantine") {
    const payloadSha256 = computeProductionImportPayloadHash(value);
    if (payloadSha256 !== ctx.record.payloadSha256) fail("PRODUCTION_IMPORT_CRYPTO_PLAINTEXT_MISMATCH");
    return { payloadSha256, payload: value };
  }
  if (Object.keys(value).sort().join(",") !== "canonicalSha256,derivedFields,payload,version"
    || !object(value.payload) || !object(value.derivedFields)
    || Object.keys(value.payload).sort().join(",") !== [...ctx.rule.fieldWhitelist].sort().join(",")
    || Object.keys(value.derivedFields).sort().join(",") !== [...ctx.rule.derivedFields].sort().join(",")) invalid();
  const plaintextSha256 = computeProductionImportTargetCanonicalHash(
    ctx.record.plannedTargetTable, ctx.targetScope, value.payload, value.derivedFields,
  );
  if (value.version !== ctx.record.expectedTargetVersionBefore
    || value.canonicalSha256 !== plaintextSha256
    || plaintextSha256 !== ctx.record.expectedTargetBeforeSha256) fail("PRODUCTION_IMPORT_CRYPTO_PLAINTEXT_MISMATCH");
  return { plaintextSha256, targetBefore: value };
}

async function keyFrom(resolveKey, reference) {
  if (typeof resolveKey !== "function") fail("PRODUCTION_IMPORT_CRYPTO_KEY_UNAVAILABLE");
  try {
    const key = await resolveKey({ keyReferenceSha256: reference });
    if (!Buffer.isBuffer(key) || key.length !== 32) fail("PRODUCTION_IMPORT_CRYPTO_KEY_UNAVAILABLE");
    // Clear only our copy; the caller owns its external key and its lifecycle.
    return Buffer.from(key);
  } catch { fail("PRODUCTION_IMPORT_CRYPTO_KEY_UNAVAILABLE"); }
}

function validateEnvelope(ctx) {
  const envelope = ctx.envelope;
  const metadata = ctx.kind === "before_image" ? ctx.record.beforeImage : ctx.record.quarantine;
  if (!object(envelope) || !object(metadata)
    || envelope.algorithm !== ALGORITHM || metadata.algorithm !== ALGORITHM
    || envelope.keyReferenceSha256 !== ctx.keyReferenceSha256
    || metadata.keyReferenceSha256 !== ctx.keyReferenceSha256
    || !Buffer.isBuffer(envelope.nonce) || envelope.nonce.length !== 12
    || !Buffer.isBuffer(envelope.authenticationTag) || envelope.authenticationTag.length !== 16
    || !Buffer.isBuffer(envelope.ciphertext) || envelope.ciphertext.length === 0
    || envelope.ciphertext.length > MAX_PLAINTEXT_BYTES) invalid();
  const expectedHash = ctx.kind === "before_image" ? metadata.ciphertextSha256 : metadata.payloadCiphertextSha256;
  if (hash(envelope.ciphertext) !== expectedHash
    || (ctx.kind === "before_image" && metadata.plaintextSha256 !== ctx.record.expectedTargetBeforeSha256)) {
    fail("PRODUCTION_IMPORT_CRYPTO_ENVELOPE_MISMATCH");
  }
}

async function sanitized(action) {
  try { return await action(); }
  catch (error) {
    if (error instanceof ProductionImportCryptoError) throw error;
    // Neither OpenSSL, model validation nor a resolver may leak raw values.
    fail("PRODUCTION_IMPORT_CRYPTO_OPERATION_FAILED");
  }
}

/** Pure preparation primitive. No files, environment, database or authority changes. */
export async function encryptProductionImportEnvelope(input, { resolveKey } = {}) {
  return sanitized(async () => {
    const ctx = context(input);
    const content = validateValue(ctx, ctx.value);
    const plaintext = Buffer.from(json(content));
    let key;
    try {
      if (plaintext.length > MAX_PLAINTEXT_BYTES) invalid();
      key = await keyFrom(resolveKey, ctx.keyReferenceSha256);
      const nonce = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, nonce, { authTagLength: 16 });
      cipher.setAAD(ctx.aad);
      const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
      const envelope = { algorithm: ALGORITHM, keyReferenceSha256: ctx.keyReferenceSha256,
        nonce, authenticationTag: cipher.getAuthTag(), ciphertext };
      const binding = { algorithm: ALGORITHM, keyReferenceSha256: ctx.keyReferenceSha256,
        ...(ctx.kind === "before_image"
          ? { plaintextSha256: content.plaintextSha256, ciphertextSha256: hash(ciphertext) }
          : { payloadCiphertextSha256: hash(ciphertext) }) };
      return { envelope, binding };
    } finally { key?.fill(0); plaintext.fill(0); }
  });
}

/** Authentication and canonical checks complete before any plaintext is returned. */
export async function decryptProductionImportEnvelope(input, { resolveKey } = {}) {
  return sanitized(async () => {
    const ctx = context(input);
    validateEnvelope(ctx);
    const key = await keyFrom(resolveKey, ctx.keyReferenceSha256);
    let partial;
    let plaintext;
    try {
      const decipher = createDecipheriv("aes-256-gcm", key, ctx.envelope.nonce, { authTagLength: 16 });
      decipher.setAAD(ctx.aad);
      decipher.setAuthTag(ctx.envelope.authenticationTag);
      partial = decipher.update(ctx.envelope.ciphertext);
      let final;
      try { final = decipher.final(); }
      catch { fail("PRODUCTION_IMPORT_CRYPTO_AUTHENTICATION_FAILED"); }
      plaintext = Buffer.concat([partial, final]);
      final.fill(0);
      const parsed = JSON.parse(plaintext.toString("utf8"));
      const result = validateValue(ctx, ctx.kind === "before_image" ? parsed.targetBefore : parsed.payload);
      if (json(result) !== json(parsed)) fail("PRODUCTION_IMPORT_CRYPTO_PLAINTEXT_MISMATCH");
      return result;
    } finally { key.fill(0); partial?.fill(0); plaintext?.fill(0); }
  });
}
