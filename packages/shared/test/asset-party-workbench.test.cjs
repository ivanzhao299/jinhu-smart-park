const assert = require("node:assert/strict");
const test = require("node:test");
const {
  ASSET_PARTY_WORKBENCH_SURFACE,
  PROPERTY_BUSINESS_PERMISSIONS,
  PROPERTY_BUSINESS_SURFACES,
  PROPERTY_PERMISSION_BUNDLES,
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

test("asset Party page remains outside property-business permissions and bundles", () => {
  const propertyPermissionValues = Object.values(PROPERTY_BUSINESS_PERMISSIONS);
  assert.equal(propertyPermissionValues.length, 72);
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
  assert.equal(Object.keys(PROPERTY_PERMISSION_BUNDLES).length, 14);
  assert.equal(
    Object.values(PROPERTY_PERMISSION_BUNDLES).some((bundle) =>
      bundle.permissions.includes(SYSTEM_PERMISSIONS.ASSET_PARTY_PAGE)
    ),
    false
  );
});
