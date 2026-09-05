import assert from "node:assert/strict";
import test from "node:test";
import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  PartySensitiveDataService as LegacyPartySensitiveDataService
} from "../../modules/property-operations/party-sensitive-data.service";
import {
  parsePartyDataKeyring as parseLegacyPartyDataKeyring
} from "../../modules/property-operations/party-data-keyring";
import { parsePartyDataKeyring } from "./party-data-keyring";
import { PartySensitiveDataService } from "./party-sensitive-data.service";

const LEGACY_KEY = "synthetic-legacy-party-key-12345678901234567890";
const ACTIVE_KEY = "synthetic-active-party-key-12345678901234567890";
const HASH_KEY = "synthetic-stable-hash-key-123456789012345678901";
const config = () => new ConfigService({
  PARTY_DATA_ENCRYPTION_KEY: LEGACY_KEY,
  PARTY_DATA_ENCRYPTION_ACTIVE_KEY_ID: "party-data-v2",
  PARTY_DATA_ENCRYPTION_KEYRING: JSON.stringify({ "party-data-v2": ACTIVE_KEY }),
  PARTY_DATA_IDENTITY_HASH_KEY: HASH_KEY
});

@Module({
  providers: [
    PartySensitiveDataService,
    { provide: ConfigService, useFactory: config }
  ]
})
class SharedSensitiveDataFixtureModule {}

test("legacy and shared imports expose the exact same class and keyring tokens", () => {
  assert.strictEqual(LegacyPartySensitiveDataService, PartySensitiveDataService);
  assert.strictEqual(parseLegacyPartyDataKeyring, parsePartyDataKeyring);
});

test("legacy and shared imports preserve enc:v1 roundtrips and stable HMAC", () => {
  const legacy = new LegacyPartySensitiveDataService(config());
  const shared = new PartySensitiveDataService(config());
  const value = "synthetic-sensitive-value";

  const legacyCiphertext = legacy.encrypt(value);
  const sharedCiphertext = shared.encrypt(value);
  assert.match(legacyCiphertext, /^enc:v1:/u);
  assert.match(sharedCiphertext, /^enc:v1:/u);
  assert.equal(shared.decrypt(legacyCiphertext, "party-data-v2"), value);
  assert.equal(legacy.decrypt(sharedCiphertext, "party-data-v2"), value);
  assert.equal(shared.hash(value), legacy.hash(value));
});

test("historical key compatibility remains active-first while explicit keys never fall back", () => {
  const old = new PartySensitiveDataService(new ConfigService({
    PARTY_DATA_ENCRYPTION_KEY: LEGACY_KEY
  }));
  const historicalCiphertext = old.encrypt("synthetic-historical-value");
  const rotated = new PartySensitiveDataService(config());

  assert.equal(rotated.decrypt(historicalCiphertext), "synthetic-historical-value");
  assert.equal(
    rotated.decrypt(historicalCiphertext, "party-data-v1"),
    "synthetic-historical-value"
  );
  assert.throws(
    () => rotated.decrypt(historicalCiphertext, "party-data-v2"),
    /ciphertext authentication failed/u
  );
});

test("a minimal Nest provider graph resolves shared and legacy tokens without Property Operations", async () => {
  const context = await NestFactory.createApplicationContext(
    SharedSensitiveDataFixtureModule,
    { logger: false }
  );
  try {
    const shared = context.get(PartySensitiveDataService);
    const legacy = context.get(LegacyPartySensitiveDataService);
    assert.strictEqual(legacy, shared);
    assert.equal(shared.activeKeyId(), "party-data-v2");
  } finally {
    await context.close();
  }

  const implementation = readFileSync(
    resolve(__dirname, "party-sensitive-data.service.ts"),
    "utf8"
  );
  assert.doesNotMatch(implementation, /modules\/property|property-operations/u);
});
