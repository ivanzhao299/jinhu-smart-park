import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createDecipheriv, createHash, createHmac } from "node:crypto";
import test from "node:test";
import { parsePartyDataKeyring } from "../../apps/api/src/shared/security/party-data-keyring.ts";
import { createT5ProtectedValueMaterializer } from "../hr-cutover/t5-nonfile-field-projection.mjs";
import { encryptT5OriginalSourceRows, reencryptT5MaterializedRows } from "../hr-cutover/t5-production-protected-values.mjs";

const sourceKeyBytes = "a".repeat(64);
const protect = createT5ProtectedValueMaterializer(sourceKeyBytes);
const productionKeyring = parsePartyDataKeyring(key => ({
  PARTY_DATA_ENCRYPTION_KEY: "synthetic-legacy-party-key-32-characters",
  PARTY_DATA_ENCRYPTION_ACTIVE_KEY_ID: "current-test",
  PARTY_DATA_ENCRYPTION_KEYRING: JSON.stringify({ "current-test": " synthetic-current-key-with-kept-spaces " }),
  PARTY_DATA_IDENTITY_HASH_KEY: " synthetic-independent-identity-key-32 "
})[key]);
const value = "320000000000000001";
const row = () => ({ sourceRowSha256: "b".repeat(64), source: { idcard: value },
  materialized: { kind: "profile", idNumber: protect(value, "person:test:idcard"), nested: [protect(null, "empty")] } });
const decrypt = encrypted => {
  const [, , iv, tag, payload] = encrypted.split(":");
  const key = createHash("sha256").update(productionKeyring.keys.get(productionKeyring.activeKeyId)).digest();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(tag, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(payload, "hex")), decipher.final()]).toString("utf8");
};

test("typed fields use the actual API keyring parser and independent identity key", () => {
  const source = [row()];
  const original = JSON.stringify(source);
  const result = reencryptT5MaterializedRows(source, { sourceKeyBytes, productionKeyring });
  const translated = result.records[0].materialized.idNumber;
  assert.equal(decrypt(translated.encrypted), value);
  assert.notEqual(translated.encrypted, source[0].materialized.idNumber.encrypted);
  assert.equal(translated.masked, source[0].materialized.idNumber.masked);
  const hashKey = createHash("sha256").update(productionKeyring.hashKey).digest();
  assert.equal(translated.fingerprint, `hmac256:${createHmac("sha256", hashKey).update(value).digest("hex")}`);
  assert.equal(JSON.stringify(source), original);
  assert.deepEqual(result.records[0].source, source[0].source);
  assert.equal(result.records[0].sourceRowSha256, source[0].sourceRowSha256);
  assert.equal(result.receipt.translatedProtectedValues, 1);
  assert.equal(result.receipt.emptyProtectedValues, 1);
  assert.equal(result.receipt.productionBusinessWrites, 0);
  assert.equal(result.receipt.productionKeyCompatibilityClaimed, false);
});

test("wrong source key, corrupted tag, mask drift and partial envelopes fail before returning rows", () => {
  assert.throws(() => reencryptT5MaterializedRows([row()], { sourceKeyBytes: "c".repeat(64), productionKeyring }), /T5_CRYPTO_SOURCE_AUTHENTICATION_FAILED/);
  for (const [mutate, code] of [
    [v => { v.encrypted = v.encrypted.replace(/:([a-f0-9]{32}):/u, `:${"0".repeat(32)}:`); }, "SOURCE_AUTHENTICATION_FAILED"],
    [v => { v.masked = "wrong"; }, "SOURCE_MASK_DRIFT"],
    [v => { delete v.fingerprint; }, "PROTECTED_SHAPE_INVALID"],
    [v => { v.encrypted = null; }, "NULL_DRIFT"],
  ]) {
    const source = row(); mutate(source.materialized.idNumber);
    assert.throws(() => reencryptT5MaterializedRows([source], { sourceKeyBytes, productionKeyring }), new RegExp(`T5_CRYPTO_${code}`));
  }
});

test("unmaterialized history remains unchanged and an absent active runtime key is rejected", () => {
  const source = { source: { history: "synthetic archived history" }, sourceRowSha256: "d".repeat(64) };
  assert.deepEqual(reencryptT5MaterializedRows([source], { sourceKeyBytes, productionKeyring }).records, [source]);
  assert.throws(() => reencryptT5MaterializedRows([row()], { sourceKeyBytes, productionKeyring: { ...productionKeyring, activeKeyId: "missing" } }), /T5_CRYPTO_KEYRING_INVALID/);
});

test("complete source archives use authenticated API-compatible ciphertext and keep exact source hashes", () => {
  const source = [{ sourceTable: "dbo.family", sourceIdentitySha256: "a".repeat(64), sourceRowSha256: "b".repeat(64),
    source: { original: "quotes \" and slash \\ and 中文\n", nullValue: null } }];
  const first = encryptT5OriginalSourceRows(source, productionKeyring);
  const second = encryptT5OriginalSourceRows(source, productionKeyring);
  assert.deepEqual(JSON.parse(decrypt(first[0].encryptedSource)), source[0].source);
  assert.notEqual(first[0].encryptedSource, second[0].encryptedSource);
  assert.equal(first[0].sourceRowSha256, source[0].sourceRowSha256);
  assert.equal(Object.hasOwn(first[0], "source"), false);
  const damaged = first[0].encryptedSource.replace(/:([a-f0-9]{32}):/u, `:${"0".repeat(32)}:`);
  assert.throws(() => decrypt(damaged));
  assert.throws(() => encryptT5OriginalSourceRows([...source, ...source], productionKeyring), /DUPLICATE_SOURCE_IDENTITY/u);
  assert.throws(() => encryptT5OriginalSourceRows(source, { ...productionKeyring, activeKeyId: "absent" }), /KEYRING_INVALID/u);
});
