import assert from "node:assert/strict";
import test from "node:test";
import {
  PROPERTY_DRAFT_TTL_MS,
  assertPropertyDraftMatchesSchema,
  createPropertyDraftEnvelope,
  isPropertyDraftUsable,
  propertyDraftKey,
  propertyDataScopeFingerprint,
  propertyModuleAssignmentFingerprint,
  propertyOfflinePermissionFingerprint,
  propertyOfflineScopeKey
} from "./property-draft-contract";

const context = { tenantId: "t1", parkId: "p1", userId: "u1", route: "/housing/leases", entityId: "draft-1" };
const bookingSchema = {
  unitId: "string", unitLabel: "string", arrivalDate: "string", departureDate: "string", guestCount: "string"
} as const;

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

test("module fingerprint is order-stable and changes with assignment enable or expiry", () => {
  const asset = { module_code: "asset", enabled: true, expire_time: null };
  const housing = { module_code: "housing_rental", enabled: true, expire_time: "2026-12-31T00:00:00.000Z" };
  assert.equal(
    propertyModuleAssignmentFingerprint([asset, housing]),
    propertyModuleAssignmentFingerprint([housing, asset])
  );
  const base = propertyOfflinePermissionFingerprint({
    dataScope: "park", enabledModules: [asset, housing], permissions: ["file:upload", "housing:repair"]
  });
  assert.notEqual(base, propertyOfflinePermissionFingerprint({
    dataScope: "park", enabledModules: [asset, { ...housing, enabled: false }], permissions: ["housing:repair", "file:upload"]
  }));
  assert.notEqual(base, propertyOfflinePermissionFingerprint({
    dataScope: "park", enabledModules: [asset, { ...housing, expire_time: null }], permissions: ["housing:repair", "file:upload"]
  }));
});

test("granular data scope fingerprint is order-stable, change-sensitive, and opaque", () => {
  const scopes = [
    { dimension: "unit", scope_type: "custom", rule_code: "secret-rule", scope_config: { unitIds: ["unit-secret"] } },
    { dimension: "building", scope_type: "all", scope_config: { nested: { b: 2, a: 1 } } }
  ];
  const base = propertyDataScopeFingerprint("custom", scopes);
  assert.equal(base, propertyDataScopeFingerprint("custom", [scopes[1]!, scopes[0]!]));
  assert.notEqual(base, propertyDataScopeFingerprint("custom", [
    { ...scopes[0]!, scope_config: { unitIds: ["different-unit"] } }, scopes[1]!
  ]));
  assert.equal(base.includes("secret-rule"), false);
  assert.equal(base.includes("unit-secret"), false);
});

test("non-sensitive draft expires after exactly 24 hours", () => {
  const envelope = createPropertyDraftEnvelope(
    context,
    { unitId: "u1", unitLabel: "A101", arrivalDate: "2026-08-04", departureDate: "2026-08-05", guestCount: "1" },
    bookingSchema,
    { now: 1000, entityVersion: 4 }
  );
  assert.equal(envelope.expiresAt, 1000 + PROPERTY_DRAFT_TTL_MS);
  assert.equal(isPropertyDraftUsable(envelope, context, envelope.expiresAt - 1), true);
  assert.equal(isPropertyDraftUsable(envelope, context, envelope.expiresAt), false);
  assert.equal(isPropertyDraftUsable(envelope, { ...context, parkId: "p2" }, 1001), false);
});

test("consumer schema permits only exact booking leaf paths and types", () => {
  assert.doesNotThrow(() => assertPropertyDraftMatchesSchema({
    unitId: "u1", unitLabel: "A101", arrivalDate: "2026-08-04", departureDate: "2026-08-05", guestCount: "1"
  }, bookingSchema));
  for (const value of [
    { unitId: "u1", unitLabel: "A101", identityNumber: "secret", arrivalDate: "a", departureDate: "b", guestCount: "1" },
    { unitId: "u1", unitLabel: "A101", arrivalDate: "a", departureDate: "b", guestCount: "1", paymentReference: "secret" },
    { unitId: "u1", unitLabel: "A101", arrivalDate: "a", departureDate: "b", guestCount: 1 }
  ]) assert.throws(() => assertPropertyDraftMatchesSchema(value, bookingSchema), /allowlisted|invalid/u);
});
