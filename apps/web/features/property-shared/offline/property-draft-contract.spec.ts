import assert from "node:assert/strict";
import test from "node:test";
import {
  PROPERTY_DRAFT_TTL_MS,
  assertSafePropertyDraft,
  createPropertyDraftEnvelope,
  isPropertyDraftUsable,
  propertyDraftKey,
  propertyOfflineScopeKey
} from "./property-draft-contract";

const context = { tenantId: "t1", parkId: "p1", userId: "u1", route: "/housing/leases", entityId: "draft-1" };

test("draft key binds tenant park user route and entity", () => {
  assert.equal(propertyDraftKey(context), "t1|p1|u1|%2Fhousing%2Fleases|draft-1");
  assert.notEqual(propertyDraftKey({ ...context, userId: "u2" }), propertyDraftKey(context));
});

test("offline scope changes with account tenant park and permissions", () => {
  const base = { tenantId: "tenant-a", parkId: "park-a", userId: "user-a", module: "homestay", permissionFingerprint: "read" };
  assert.notEqual(propertyOfflineScopeKey(base), propertyOfflineScopeKey({ ...base, parkId: "park-b" }));
  assert.notEqual(propertyOfflineScopeKey(base), propertyOfflineScopeKey({ ...base, module: "housing" }));
  assert.notEqual(propertyOfflineScopeKey(base), propertyOfflineScopeKey({ ...base, permissionFingerprint: "write" }));
});

test("non-sensitive draft expires after exactly 24 hours", () => {
  const envelope = createPropertyDraftEnvelope(context, { reason: "现场待确认", amount: 12 }, { now: 1000, entityVersion: 4 });
  assert.equal(envelope.expiresAt, 1000 + PROPERTY_DRAFT_TTL_MS);
  assert.equal(isPropertyDraftUsable(envelope, context, envelope.expiresAt - 1), true);
  assert.equal(isPropertyDraftUsable(envelope, context, envelope.expiresAt), false);
  assert.equal(isPropertyDraftUsable(envelope, { ...context, parkId: "p2" }, 1001), false);
});

test("sensitive identity payment credential file and blob values fail closed", () => {
  for (const value of [
    { identityNumber: "secret" }, { paymentReference: "secret" },
    { credential: "secret" }, { evidenceFile: "id" }, { photoBlob: new Blob(["x"]) }
  ]) assert.throws(() => assertSafePropertyDraft(value), /sensitive|unsupported/u);
});
