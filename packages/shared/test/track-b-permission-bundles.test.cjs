const assert = require("node:assert/strict");
const test = require("node:test");
const {
  TRACK_B_PERMISSION_BUNDLES,
  validatePropertyPermissionBundles,
  validateTrackBPermissionBundles
} = require("../dist/index.js");

test("Track B bundles match the independently frozen 16-bundle matrix", () => {
  assert.equal(Object.keys(TRACK_B_PERMISSION_BUNDLES).length, 16);
  assert.equal(
    Object.values(TRACK_B_PERMISSION_BUNDLES).reduce(
      (total, bundle) => total + bundle.permissions.length,
      0
    ),
    128
  );
  assert.deepEqual(validateTrackBPermissionBundles(), []);
  assert.deepEqual(validatePropertyPermissionBundles(), []);
  assert.deepEqual(TRACK_B_PERMISSION_BUNDLES.ASSET_MANAGER.permissions, [
    "asset:property-operations:page", "asset:property-occupancies:page",
    "asset:property-mode-transitions:page", "property:notifications:page",
    "property_operation:read", "property_operation:update",
    "property_operation:transition_mode", "property_occupancy:read",
    "property_occupancy:create", "property_occupancy:activate",
    "property_occupancy:release", "property_occupancy:force_release",
    "property_approval:create", "property_approval:read",
    "property_approval:withdraw", "property_task:read",
    "property_notification:read", "property_notification:mark_read"
  ]);
  assert.deepEqual(
    TRACK_B_PERMISSION_BUNDLES.APPROVAL_INCIDENT_OPERATOR.permissions,
    [
      "property:approval-incidents:page",
      "property_approval:read_incident",
      "property_approval:read",
      "property_approval:retry",
      "audit:read"
    ]
  );
  assert.deepEqual(
    TRACK_B_PERMISSION_BUNDLES.EVENT_DELIVERY_OPERATOR.permissions,
    [
      "property:event-delivery-incidents:page",
      "property_event:read_incident",
      "property_event:replay",
      "audit:read"
    ]
  );
});

test("Track B bundle validator rejects missing, unknown and grant-drifted bundles", () => {
  const cloned = Object.fromEntries(
    Object.entries(TRACK_B_PERMISSION_BUNDLES).map(([key, bundle]) => [
      key,
      { ...bundle, permissions: [...bundle.permissions] }
    ])
  );
  cloned.APPROVAL_INCIDENT_OPERATOR.permissions =
    cloned.APPROVAL_INCIDENT_OPERATOR.permissions.filter(
      (permission) => permission !== "property_approval:read_incident"
    );
  delete cloned.IDENTITY_VERIFIER;
  cloned.UNKNOWN = {
    code: "property-bundle:unknown",
    description: "invalid",
    permissions: ["property_task:read"]
  };
  const issues = validateTrackBPermissionBundles(cloned);
  assert.ok(issues.some((issue) => issue.includes("grants drifted")));
  assert.ok(issues.some((issue) => issue.includes("Missing Track B bundle")));
  assert.ok(issues.some((issue) => issue.includes("Unknown Track B bundle")));
});
