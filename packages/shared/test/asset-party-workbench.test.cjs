const assert = require("node:assert/strict");
const test = require("node:test");
const {
  ASSET_PARTY_WORKBENCH_SURFACE,
  PROPERTY_BUSINESS_PERMISSIONS,
  PROPERTY_BUSINESS_SURFACES,
  PROPERTY_PERMISSION_BUNDLES,
  TRACK_B_PERMISSION_BUNDLES,
  SYSTEM_PERMISSIONS,
  SYSTEM_PERMISSION_SEEDS
} = require("../dist/index.js");

test("asset Party workbench owns one canonical page permission and surface", () => {
  assert.equal(SYSTEM_PERMISSIONS.ASSET_PARTY_PAGE, "asset:party");
  assert.deepEqual(ASSET_PARTY_WORKBENCH_SURFACE, {
    featureId: "asset.parties",
    moduleCode: "asset",
    menuCode: "asset",
    pageCode: "asset:party",
    route: "/assets/parties",
    detailRoutes: ["/assets/parties/[partyId]"]
  });
  assert.deepEqual(
    SYSTEM_PERMISSION_SEEDS.filter(
      (seed) => seed.code === SYSTEM_PERMISSIONS.ASSET_PARTY_PAGE
    ),
    [{
      code: "asset:party",
      name: "业务相对方页面",
      resource: "asset.party",
      action: "page"
    }]
  );
});

test("asset Party page stays canonical while Track B bundles may grant access to it", () => {
  const propertyPermissionValues = Object.values(PROPERTY_BUSINESS_PERMISSIONS);
  assert.equal(propertyPermissionValues.length, 102);
  assert.equal(
    propertyPermissionValues.includes(SYSTEM_PERMISSIONS.ASSET_PARTY_PAGE),
    false
  );
  assert.equal(PROPERTY_BUSINESS_SURFACES.length, 17);
  assert.equal(
    PROPERTY_BUSINESS_SURFACES.some(
      (surface) => surface.route === ASSET_PARTY_WORKBENCH_SURFACE.route
    ),
    false
  );
  assert.equal(Object.keys(PROPERTY_PERMISSION_BUNDLES).length, 30);
  assert.equal(
    TRACK_B_PERMISSION_BUNDLES.PARTY_PROFILE_CLERK.permissions.includes(
      SYSTEM_PERMISSIONS.ASSET_PARTY_PAGE
    ),
    true
  );
  assert.equal(
    TRACK_B_PERMISSION_BUNDLES.IDENTITY_OPERATOR.permissions.includes(
      SYSTEM_PERMISSIONS.ASSET_PARTY_PAGE
    ),
    true
  );
  assert.equal(
    TRACK_B_PERMISSION_BUNDLES.IDENTITY_OPERATOR.permissions.includes(
      SYSTEM_PERMISSIONS.FILE_DOWNLOAD
    ),
    true
  );
});
