import assert from "node:assert/strict";
import test from "node:test";
import { ConfigService } from "@nestjs/config";
import { PartySensitiveDataService } from "./party-sensitive-data.service";

test("party sensitive data encrypts reversibly without persisting plaintext", () => {
  const service = new PartySensitiveDataService(new ConfigService({ PARTY_DATA_ENCRYPTION_KEY: "test-only-key" }));
  const plaintext = "320831199001011234";
  const encrypted = service.encrypt(plaintext);

  assert.match(encrypted, /^enc:v1:/);
  assert.equal(encrypted.includes(plaintext), false);
  assert.equal(service.decrypt(encrypted), plaintext);
});

test("party identity hash is stable and mask hides the middle", () => {
  const service = new PartySensitiveDataService(new ConfigService({ PARTY_DATA_ENCRYPTION_KEY: "test-only-key" }));
  assert.equal(service.hash("ID-123"), service.hash("ID-123"));
  assert.notEqual(service.hash("ID-123"), service.hash("ID-124"));
  assert.equal(service.mask("1234567890"), "12******90");
});
