import assert from "node:assert/strict";
import test from "node:test";
import { ConfigService } from "@nestjs/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PartySensitiveDataService } from "./party-sensitive-data.service";

function tamperFinalPayloadByte(ciphertext: string): string {
  assert.match(ciphertext, /:[0-9a-f]+$/u);
  const lastByte = Number.parseInt(ciphertext.slice(-2), 16);
  // Replacing with 00 is a no-op for 1/256 random ciphertexts. Flip a bit instead.
  return `${ciphertext.slice(0, -2)}${(lastByte ^ 1).toString(16).padStart(2, "0")}`;
}

test("ciphertext tampering changes every possible final byte, including zero", () => {
  for (let byte = 0; byte <= 255; byte++) {
    const original = `enc:v1:synthetic-iv:synthetic-tag:1234${byte.toString(16).padStart(2, "0")}`;
    const tampered = tamperFinalPayloadByte(original);
    assert.notEqual(tampered, original);
    assert.equal(tampered.slice(0, -2), original.slice(0, -2));
    assert.equal(tampered.length, original.length);
    assert.equal(tamperFinalPayloadByte(tampered), original);
  }
});

test("party sensitive data encrypts reversibly without persisting plaintext", () => {
  const service = new PartySensitiveDataService(new ConfigService({
    PARTY_DATA_ENCRYPTION_KEY: "test-only-party-key-12345678901234567890"
  }));
  const plaintext = "synthetic-identity-value";
  const encrypted = service.encrypt(plaintext);

  assert.match(encrypted, /^enc:v1:/);
  assert.equal(encrypted.includes(plaintext), false);
  assert.equal(service.decrypt(encrypted), plaintext);
});

test("party identity hash is stable and mask hides the middle", () => {
  const service = new PartySensitiveDataService(new ConfigService({
    PARTY_DATA_ENCRYPTION_KEY: "test-only-party-key-12345678901234567890"
  }));
  assert.equal(service.hash("ID-123"), service.hash("ID-123"));
  assert.notEqual(service.hash("ID-123"), service.hash("ID-124"));
  assert.equal(service.mask("1234567890"), "12******90");
});

test("party sensitive data refuses every non-party fallback", () => {
  const previousPartyKey = process.env.PARTY_DATA_ENCRYPTION_KEY;
  delete process.env.PARTY_DATA_ENCRYPTION_KEY;
  try {
    assert.throws(() => new PartySensitiveDataService(new ConfigService({
      IOT_DEVICE_SECRET_ENCRYPTION_KEY: "iot-only-secret-12345678901234567890",
      JWT_SECRET: "jwt-only-secret-12345678901234567890"
    })), /Active Party data encryption key party-data-v1 is not configured/u);
  } finally {
    if (previousPartyKey === undefined) delete process.env.PARTY_DATA_ENCRYPTION_KEY;
    else process.env.PARTY_DATA_ENCRYPTION_KEY = previousPartyKey;
  }
});

test("party sensitive data writes the active key and dual-reads a historical key", () => {
  const oldKey = "old-party-key-123456789012345678901234";
  const oldService = new PartySensitiveDataService(new ConfigService({
    PARTY_DATA_ENCRYPTION_KEY: oldKey
  }));
  const oldCiphertext = oldService.encrypt("historical-value");
  const rotatedService = new PartySensitiveDataService(new ConfigService({
    PARTY_DATA_ENCRYPTION_KEY: oldKey,
    PARTY_DATA_ENCRYPTION_ACTIVE_KEY_ID: "party-data-v2",
    PARTY_DATA_ENCRYPTION_KEYRING: JSON.stringify({
      "party-data-v2": "new-party-key-123456789012345678901234"
    })
  }));

  assert.equal(rotatedService.decrypt(oldCiphertext, "party-data-v1"), "historical-value");
  assert.equal(rotatedService.decrypt(oldCiphertext), "historical-value");
  assert.equal(rotatedService.identityProfile("new-value").encryptionKeyId, "party-data-v2");
  assert.throws(() => rotatedService.decrypt(oldCiphertext, "party-data-unknown"), /not configured/u);
});

test("party sensitive data rejects malformed envelopes and supports empty plaintext", () => {
  const service = new PartySensitiveDataService(new ConfigService({
    PARTY_DATA_ENCRYPTION_KEY: "test-only-party-key-12345678901234567890"
  }));
  const ciphertext = service.encrypt("synthetic-value");
  const tampered = tamperFinalPayloadByte(ciphertext);
  assert.notEqual(tampered, ciphertext);
  assert.equal(service.decrypt(`${ciphertext}:extra`), null);
  assert.equal(service.decrypt("enc:v1:00:0011:aa"), null);
  assert.equal(service.decrypt("enc:v1:zzzzzzzzzzzzzzzzzzzzzzzz:00112233445566778899aabbccddeeff:aa"), null);
  assert.equal(service.decrypt("enc:v1:00112233445566778899aabb:00112233445566778899aabbccddeeff:a"), null);
  assert.equal(service.decrypt(tampered), null);
  assert.equal(service.decrypt(service.encrypt("")), "");
  assert.throws(
    () => service.decrypt(`${ciphertext}:extra`, "party-data-v1"),
    /ciphertext envelope is invalid/u
  );
  assert.throws(
    () => service.decrypt(tampered, "party-data-v1"),
    /ciphertext authentication failed/u
  );
});

test("identity fingerprint remains stable while the encryption key rotates", () => {
  const fingerprintKey = "stable-fingerprint-key-123456789012345678";
  const v1 = new PartySensitiveDataService(new ConfigService({
    PARTY_DATA_ENCRYPTION_KEY: "old-party-key-123456789012345678901234",
    PARTY_DATA_IDENTITY_HASH_KEY: fingerprintKey
  }));
  const v2 = new PartySensitiveDataService(new ConfigService({
    PARTY_DATA_ENCRYPTION_ACTIVE_KEY_ID: "party-data-v2",
    PARTY_DATA_ENCRYPTION_KEYRING: JSON.stringify({
      "party-data-v2": "new-party-key-123456789012345678901234"
    }),
    PARTY_DATA_IDENTITY_HASH_KEY: fingerprintKey
  }));
  assert.equal(v1.hash("same-identity"), v2.hash("same-identity"));
});

test("party key configuration rejects malformed and unknown active versions", () => {
  assert.throws(() => new PartySensitiveDataService(new ConfigService({
    PARTY_DATA_ENCRYPTION_KEY: "old-party-key-123456789012345678901234",
    PARTY_DATA_ENCRYPTION_KEYRING: "[]"
  })), /must be a JSON object/u);
  assert.throws(() => new PartySensitiveDataService(new ConfigService({
    PARTY_DATA_ENCRYPTION_KEY: "old-party-key-123456789012345678901234",
    PARTY_DATA_ENCRYPTION_ACTIVE_KEY_ID: "party-data-v2"
  })), /party-data-v2 is not configured/u);
  assert.throws(() => new PartySensitiveDataService(new ConfigService({
    PARTY_DATA_ENCRYPTION_KEY: "old-party-key-123456789012345678901234",
    PARTY_DATA_ENCRYPTION_KEYRING: "{\"party-data-v2\":\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\",\"party-data-v2\":\"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\"}"
  })), /party-data-v2 is configured more than once/u);
});

test("party sensitive runtime source contains no cross-domain or fixed-secret fallback", () => {
  const source = readFileSync(resolve(__dirname, "../../shared/security/party-sensitive-data.service.ts"), "utf8");
  const compatibilitySurface = readFileSync(resolve(__dirname, "party-sensitive-data.service.ts"), "utf8");
  assert.doesNotMatch(source, /IOT_DEVICE_SECRET_ENCRYPTION_KEY|JWT_SECRET|jinhu-smart-park-dev-secret/u);
  assert.match(source, /parsePartyDataKeyring/u);
  assert.match(compatibilitySurface, /shared\/security\/party-sensitive-data\.service/u);
  assert.doesNotMatch(compatibilitySurface, /class PartySensitiveDataService/u);
});
