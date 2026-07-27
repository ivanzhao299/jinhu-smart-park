import assert from "node:assert/strict";
import test from "node:test";
import { isValidPartyIdentityNumber } from "./party-identity.policy";

test("party identity numbers follow their declared document type", () => {
  assert.equal(isValidPartyIdentityNumber("id_card", "11010519491231002X"), true);
  assert.equal(isValidPartyIdentityNumber("id_card", "123"), false);
  assert.equal(isValidPartyIdentityNumber("passport", "E12345678"), true);
  assert.equal(isValidPartyIdentityNumber("passport", "A-1"), false);
  assert.equal(isValidPartyIdentityNumber(undefined, "E12345678"), false);
  assert.equal(isValidPartyIdentityNumber(undefined, undefined), true);
});
