import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import test from "node:test";
import { encryptProductionImportEnvelope, decryptProductionImportEnvelope } from "../hr-cutover/production-import-crypto-provider.mjs";
import { computeProductionImportTargetCanonicalHash } from "../hr-cutover/production-import-target-model.mjs";
import { computeProductionImportPayloadHash } from "../hr-cutover/production-import-sealed-plan-lib.mjs";

const hash = value => createHash("sha256").update(value).digest("hex");
const key = randomBytes(32);
const resolver = { resolveKey: async () => key };
const payload = { org_code: "SYNTHETIC", org_name: "Synthetic department", org_type: "department", sort_order: 1, status: "enabled", remark: null };
function fixture(kind = "before_image") {
  const targetScope = { tenantId: "synthetic-tenant", parkId: "synthetic-park", scopeSha256: hash("synthetic-scope") };
  const canonicalSha256 = computeProductionImportTargetCanonicalHash("sys_org", targetScope, payload, { parent_id: null });
  return {
    kind, operationId: "yzprod-import-20260905T000000Z-aaaaaaaaaaaa", phaseName: "T0", targetScope,
    keyReferenceSha256: hash("synthetic-external-reference-not-key-material"),
    record: {
      disposition: kind === "before_image" ? "merge" : "quarantine",
      sourceSystem: "yuzhou-v10", sourceTable: "dbo.departmentcode",
      sourceIdentitySha256: hash("synthetic-source"), sourceRowSha256: hash("synthetic-row"),
      payloadSha256: computeProductionImportPayloadHash(payload),
      plannedTargetTable: "sys_org", targetTable: "sys_org",
      targetId: "00000000-0000-5000-8000-000000000001",
      expectedTargetVersionBefore: 2, expectedTargetBeforeSha256: canonicalSha256,
    },
    value: kind === "before_image"
      ? { payload: structuredClone(payload), derivedFields: { parent_id: null }, version: 2, canonicalSha256 }
      : structuredClone(payload),
  };
}
async function sealed(kind) {
  const input = fixture(kind);
  const { envelope, binding } = await encryptProductionImportEnvelope(input, resolver);
  input.record[kind === "quarantine" ? "quarantine" : "beforeImage"] = binding;
  return { ...input, envelope };
}
const rejectsCode = (promise, code) => assert.rejects(promise, error => error.code === code && error.message === code);

test("real GCM before-image roundtrip conforms to rollback return contract", async () => {
  const originalKey = Buffer.from(key);
  const input = await sealed("before_image");
  const result = await decryptProductionImportEnvelope(input, resolver);
  assert.deepEqual(result, { plaintextSha256: input.value.canonicalSha256, targetBefore: input.value });
  assert.deepEqual(key, originalKey, "provider must not clear caller-owned external key");
  assert.notEqual(input.envelope.ciphertext.toString("utf8"), JSON.stringify(result));
});

test("quarantine roundtrip preserves NULL values and binds actual payload hash", async () => {
  const input = await sealed("quarantine");
  const result = await decryptProductionImportEnvelope(input, resolver);
  assert.deepEqual(result, { payloadSha256: input.record.payloadSha256, payload: input.value });
  assert.equal(result.payload.remark, null);
});

test("fresh seals never use a fixed or caller-provided nonce", async () => {
  const input = fixture();
  const first = await encryptProductionImportEnvelope(input, resolver);
  const second = await encryptProductionImportEnvelope(input, resolver);
  assert.equal(first.envelope.nonce.length, 12);
  assert.equal(first.envelope.authenticationTag.length, 16);
  assert.notDeepEqual(first.envelope.nonce, second.envelope.nonce);
  assert.notEqual(first.binding.ciphertextSha256, second.binding.ciphertextSha256);
});

test("wrong key and modified authentication tag cannot release plaintext", async () => {
  const input = await sealed();
  await rejectsCode(decryptProductionImportEnvelope(input, { resolveKey: async () => randomBytes(32) }), "PRODUCTION_IMPORT_CRYPTO_AUTHENTICATION_FAILED");
  input.envelope.authenticationTag[0] ^= 1;
  await rejectsCode(decryptProductionImportEnvelope(input, resolver), "PRODUCTION_IMPORT_CRYPTO_AUTHENTICATION_FAILED");
});

test("ciphertext hash check is not a substitute for authentication", async () => {
  const input = await sealed();
  input.envelope.ciphertext[0] ^= 1;
  await rejectsCode(decryptProductionImportEnvelope(input, resolver), "PRODUCTION_IMPORT_CRYPTO_ENVELOPE_MISMATCH");
  input.record.beforeImage.ciphertextSha256 = hash(input.envelope.ciphertext);
  await rejectsCode(decryptProductionImportEnvelope(input, resolver), "PRODUCTION_IMPORT_CRYPTO_AUTHENTICATION_FAILED");
});

test("GCM AAD rejects cross-operation, scope, identity, version and key-reference replay", async () => {
  for (const change of [
    value => { value.operationId = "yzprod-import-20260905T000001Z-aaaaaaaaaaaa"; },
    value => { value.targetScope.tenantId = "another-tenant"; },
    value => { value.targetScope.scopeSha256 = hash("another-scope"); },
    value => { value.record.sourceIdentitySha256 = hash("another-source"); },
    value => { value.record.sourceRowSha256 = hash("another-row"); },
    value => { value.record.payloadSha256 = hash("another-payload"); },
    value => { value.record.targetId = "00000000-0000-5000-8000-000000000002"; },
    value => { value.record.expectedTargetVersionBefore = 3; },
    value => {
      value.keyReferenceSha256 = hash("another-key-reference");
      value.envelope.keyReferenceSha256 = value.keyReferenceSha256;
      value.record.beforeImage.keyReferenceSha256 = value.keyReferenceSha256;
    },
  ]) {
    const input = await sealed();
    change(input);
    await rejectsCode(decryptProductionImportEnvelope(input, resolver), "PRODUCTION_IMPORT_CRYPTO_AUTHENTICATION_FAILED");
  }
});

test("seal recomputes before-image canonical hash and rejects wrong version or fields", async () => {
  for (const change of [
    value => { value.value.payload.org_name = "Changed synthetic department"; },
    value => { value.value.version = 9; },
    value => { value.value.canonicalSha256 = hash("false-plaintext"); },
  ]) {
    const input = fixture();
    change(input);
    await rejectsCode(encryptProductionImportEnvelope(input, resolver), "PRODUCTION_IMPORT_CRYPTO_PLAINTEXT_MISMATCH");
  }
  const extra = fixture();
  extra.value.payload.unexpected = "not whitelisted";
  await rejectsCode(encryptProductionImportEnvelope(extra, resolver), "PRODUCTION_IMPORT_CRYPTO_INPUT_INVALID");
});

test("seal cannot encrypt an unrelated quarantine payload", async () => {
  const input = fixture("quarantine");
  input.value.remark = "Changed synthetic payload";
  await rejectsCode(encryptProductionImportEnvelope(input, resolver), "PRODUCTION_IMPORT_CRYPTO_PLAINTEXT_MISMATCH");
});

test("missing key, invalid key size and external errors expose stable codes only", async () => {
  const input = fixture();
  await rejectsCode(encryptProductionImportEnvelope(input), "PRODUCTION_IMPORT_CRYPTO_KEY_UNAVAILABLE");
  await rejectsCode(encryptProductionImportEnvelope(input, { resolveKey: async () => Buffer.alloc(16) }), "PRODUCTION_IMPORT_CRYPTO_KEY_UNAVAILABLE");
  await rejectsCode(encryptProductionImportEnvelope(input, { resolveKey: async () => { throw new Error("synthetic-private-resolver-detail"); } }), "PRODUCTION_IMPORT_CRYPTO_KEY_UNAVAILABLE");
});

test("truncated envelopes, unsupported domains and algorithms are rejected", async () => {
  const input = await sealed();
  input.envelope.nonce = Buffer.alloc(8);
  await rejectsCode(decryptProductionImportEnvelope(input, resolver), "PRODUCTION_IMPORT_CRYPTO_INPUT_INVALID");
  const domain = fixture();
  domain.phaseName = "T4";
  await rejectsCode(encryptProductionImportEnvelope(domain, resolver), "PRODUCTION_IMPORT_CRYPTO_INPUT_INVALID");
  const algorithm = await sealed();
  algorithm.envelope.algorithm = "aes-256-cbc";
  await rejectsCode(decryptProductionImportEnvelope(algorithm, resolver), "PRODUCTION_IMPORT_CRYPTO_INPUT_INVALID");
});

test("async key resolver cannot mutate the authenticated context or ciphertext", async () => {
  const input = await sealed();
  const expected = structuredClone(input.value);
  const result = await decryptProductionImportEnvelope(input, {
    resolveKey: async () => {
      input.targetScope.tenantId = "mutated-during-key-lookup";
      input.record.expectedTargetVersionBefore = 999;
      input.envelope.ciphertext.fill(0);
      return key;
    },
  });
  assert.deepEqual(result.targetBefore, expected);
});
