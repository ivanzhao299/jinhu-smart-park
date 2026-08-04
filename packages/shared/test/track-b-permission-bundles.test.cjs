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
    125
  );
  assert.deepEqual(validateTrackBPermissionBundles(), []);
  assert.deepEqual(validatePropertyPermissionBundles(), []);
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
