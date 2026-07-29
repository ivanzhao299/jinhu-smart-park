import assert from "node:assert/strict";
import test from "node:test";
import {
  didPartyIdentityChange,
  isValidPartyIdentityNumber,
  normalizePartyIdentityNumber
} from "./party-identity.policy";

test("party identity numbers follow their declared document type", () => {
  assert.equal(isValidPartyIdentityNumber("id_card", "11010519491231002X"), true);
  assert.equal(isValidPartyIdentityNumber("id_card", "123"), false);
  assert.equal(isValidPartyIdentityNumber("passport", "E12345678"), true);
  assert.equal(isValidPartyIdentityNumber("passport", "A-1"), false);
  assert.equal(isValidPartyIdentityNumber(undefined, "E12345678"), false);
  assert.equal(isValidPartyIdentityNumber(undefined, undefined), true);
});

test("party verification becomes stale when protected identity fields change", () => {
  assert.equal(didPartyIdentityChange("id_card", "hash-a", "id_card", "hash-a"), false);
  assert.equal(didPartyIdentityChange("id_card", "hash-a", "passport", "hash-a"), true);
  assert.equal(didPartyIdentityChange("id_card", "hash-a", "id_card", "hash-b"), true);
  assert.equal(didPartyIdentityChange("id_card", "hash-a", null, null), true);
});

test("party identity normalization canonicalizes the ID-card check digit", () => {
  assert.equal(normalizePartyIdentityNumber("id_card", " 11010519491231002x "), "11010519491231002X");
  assert.equal(normalizePartyIdentityNumber("passport", " e12345678 "), "e12345678");
  assert.equal(normalizePartyIdentityNumber("id_card", "   "), null);
});
