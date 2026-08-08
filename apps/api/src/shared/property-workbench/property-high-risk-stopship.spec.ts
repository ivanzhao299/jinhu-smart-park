import assert from "node:assert/strict";
import test from "node:test";
import { ConflictException, ForbiddenException } from "@nestjs/common";
import { TRACK_A_HIGH_RISK_ACTION_IDS } from "@jinhu/shared";
import {
  assertPropertyHighRiskActionApprovalRequired,
  assertPropertyHighRiskActionPermissions,
  PROPERTY_APPROVAL_REQUIRED_MESSAGE,
  PROPERTY_HIGH_RISK_PERMISSION_REQUIRED_MESSAGE
} from "./property-high-risk-stopship";

test("service stop-ship blocks the exact nine-action allowlist", () => {
  for (const actionId of TRACK_A_HIGH_RISK_ACTION_IDS) {
    assert.throws(
      () => assertPropertyHighRiskActionApprovalRequired(actionId),
      (error: unknown) => {
        assert.ok(error instanceof ConflictException);
        assert.equal(error.getStatus(), 409);
        assert.equal(error.message, PROPERTY_APPROVAL_REQUIRED_MESSAGE);
        return true;
      }
    );
  }
});

test("service stop-ship defaults unknown and malformed action IDs to conflict", () => {
  for (const actionId of [
    undefined,
    null,
    "",
    "homestay.bookings.cancel.request",
    "unknown.property.action",
    {},
    []
  ]) {
    assert.throws(
      () => assertPropertyHighRiskActionApprovalRequired(actionId),
      ConflictException
    );
  }
});

test("high-risk permission intersection supports only exact grants, super, or wildcard", () => {
  const required = ["domain:waive", "property_approval:create"];
  for (const actor of [
    { permissions: required },
    { isSuper: true, permissions: [] },
    { permissions: ["*"] }
  ]) {
    assert.doesNotThrow(
      () => assertPropertyHighRiskActionPermissions(actor, required)
    );
  }
  for (const actor of [
    { permissions: [] },
    { permissions: ["domain:waive"] },
    { permissions: ["property_approval:create"] },
    { permissions: ["domain:register", "property_approval:create"] }
  ]) {
    assert.throws(
      () => assertPropertyHighRiskActionPermissions(actor, required),
      (error: unknown) => {
        assert.ok(error instanceof ForbiddenException);
        assert.equal(error.getStatus(), 403);
        assert.equal(
          error.message,
          PROPERTY_HIGH_RISK_PERMISSION_REQUIRED_MESSAGE
        );
        return true;
      }
    );
  }
});
