import assert from "node:assert/strict";
import test from "node:test";
import { ConfigService } from "@nestjs/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PartySensitiveDataService } from "./party-sensitive-data.service";

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
  assert.equal(rotatedService.identityProfile("new-value").encryptionKeyId, "party-data-v2");
  assert.throws(() => rotatedService.decrypt(oldCiphertext, "party-data-unknown"), /not configured/u);
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
  const source = readFileSync(resolve(__dirname, "party-sensitive-data.service.ts"), "utf8");
  assert.doesNotMatch(source, /IOT_DEVICE_SECRET_ENCRYPTION_KEY|JWT_SECRET|jinhu-smart-park-dev-secret/u);
  assert.match(source, /parsePartyDataKeyring/u);
});
