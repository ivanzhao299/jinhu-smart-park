import assert from "node:assert/strict";
import test from "node:test";
import {
  IDENTITY_STATUS_OPTIONS,
  identityMutationValidationMessage,
  safePropertyDeepLink
} from "./property-control-plane.logic";

test("identity filters follow the shared submission status contract", () => {
  assert.deepEqual(IDENTITY_STATUS_OPTIONS, [
    "draft", "pending_verification", "verified", "rejected", "withdrawn", "superseded"
  ]);
});

test("identity rejection requires a reason while verification can omit it", () => {
  assert.equal(identityMutationValidationMessage("party.identity.verify", "rejected", ""), "拒绝核验时请填写原因。");
  assert.equal(identityMutationValidationMessage("party.identity.verify", "verified", ""), null);
  assert.equal(identityMutationValidationMessage("party.identity.verify", "rejected", "证据不匹配"), null);
});

test("notification deep links allow only same-origin relative paths", () => {
  assert.equal(safePropertyDeepLink("/housing/leases/1"), "/housing/leases/1");
  assert.equal(safePropertyDeepLink("https://example.com"), null);
  assert.equal(safePropertyDeepLink("//example.com"), null);
  assert.equal(safePropertyDeepLink("javascript:alert(1)"), null);
});
