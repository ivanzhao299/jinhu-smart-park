import assert from "node:assert/strict";
import test from "node:test";
import {
  PROPERTY_BUSINESS_PERMISSIONS,
  PROPERTY_BUSINESS_SURFACES,
  PROPERTY_TRACK_B_SURFACES,
  type UserMenuTreeNode
} from "@jinhu/shared";
import {
  FIRST_RELEASE_MENU_PATH_SET,
  findMenuByPath,
  findMenusByPath,
  getDashboardAuthorizationMenus,
  getDashboardMenus
} from "./menu";

test("explicit API empty trees remain authoritative while missing fields use legacy compatibility", () => {
  assert.deepEqual(getDashboardMenus([]), []);
  assert.ok(getDashboardAuthorizationMenus([]).length > 0);
  assert.ok(getDashboardMenus(undefined).length > 0);
  assert.ok(getDashboardAuthorizationMenus(null).length > 0);
});

test("API trees pruned to empty cannot restore display menus but retain route metadata", () => {
  const legacyOnlyTree = [{
    label: "住房出租",
    module: "housing_rental",
    children: [{
      label: "旧运营入口",
      href: "/housing",
      permission: "*",
      module: "housing_rental"
    }]
  }] satisfies UserMenuTreeNode[];

  assert.deepEqual(getDashboardMenus(legacyOnlyTree), []);
  assert.ok(getDashboardAuthorizationMenus(legacyOnlyTree).length > 0);
});

test("dependency-filtered API empty trees do not recreate property surfaces", () => {
  const displayMenus = getDashboardMenus([]);
  const authorizationMenus = getDashboardAuthorizationMenus([]);

  for (const surface of PROPERTY_BUSINESS_SURFACES) {
    assert.equal(findMenuByPath(surface.route, displayMenus), undefined);
    assert.equal(findMenuByPath(surface.route, authorizationMenus)?.permission, surface.pageCode);
  }
});

test("property menus expose the shared 8/9 canonical surfaces with exact page permissions", () => {
  const menus = getDashboardMenus();
  for (const moduleCode of ["homestay", "housing_rental"] as const) {
    const expected = PROPERTY_BUSINESS_SURFACES
      .filter((surface) => surface.moduleCode === moduleCode)
      .map(({ route, pageCode }) => ({
        href: route,
        permission: pageCode,
        module: moduleCode
      }));
    const actual = menus.find((menu) => menu.module === moduleCode)?.children
      ?.map(({ href, permission, module }) => ({ href, permission, module }));
    assert.deepEqual(actual, expected);
  }

  assert.equal(
    menus.flatMap((menu) => menu.children ?? [])
      .some((item) => item.href === "/homestay" || item.href === "/housing"),
    false
  );
  for (const surface of PROPERTY_BUSINESS_SURFACES) {
    assert.equal(findMenuByPath(surface.route, menus)?.permission, surface.pageCode);
    assert.equal(FIRST_RELEASE_MENU_PATH_SET.has(surface.route), true);
  }
  assert.equal(FIRST_RELEASE_MENU_PATH_SET.has("/homestay"), false);
  assert.equal(FIRST_RELEASE_MENU_PATH_SET.has("/housing"), false);
});

test("HR is a discoverable first-level sidebar module with every production page permission", () => {
  const hr = getDashboardMenus().find((menu) => menu.module === "hr");
  assert.equal(hr?.label, "人力资源管理");
  assert.deepEqual(
    hr?.children?.map(({ href, permission, module }) => ({ href, permission, module })),
    [
      ["/hr", "hr:dashboard"], ["/hr/organization", "hr:organization"], ["/hr/employees", "hr:employees"],
      ["/hr/recruitment", "hr:recruitment"], ["/hr/lifecycle", "hr:lifecycle"], ["/hr/contracts", "hr:contracts"],
      ["/hr/attendance", "hr:attendance"], ["/hr/insurance", "hr:insurance"], ["/hr/compensation", "hr:compensation"],
      ["/hr/payroll", "hr:payroll"], ["/hr/goals", "hr:goals"], ["/hr/work-reports", "hr:work_reports"],
      ["/hr/performance", "hr:performance"], ["/hr/feedback-360", "hr:feedback_360"], ["/hr/talent", "hr:talent"],
      ["/hr/training", "hr:training"], ["/hr/rewards", "hr:rewards"], ["/hr/approvals", "hr:approvals"]
    ].map(([href, permission]) => ({ href, permission, module: "hr" }))
  );
  for (const child of hr?.children ?? []) {
    assert.equal(FIRST_RELEASE_MENU_PATH_SET.has(child.href ?? ""), true);
    assert.equal(findMenuByPath(child.href ?? "", getDashboardMenus())?.permission, child.permission);
  }
});

test("backend HR metadata merges into the canonical HR sidebar without duplicate entries", () => {
  const backendMenus = [{
    label: "人力资源管理",
    module: "hr",
    children: [
      { label: "人才发展", href: "/hr/talent", permission: "hr:talent", module: "hr" },
      { label: "未来人事扩展", href: "/hr/future", permission: "hr:future", module: "hr" }
    ]
  }] satisfies UserMenuTreeNode[];
  const hr = getDashboardMenus(backendMenus).find((menu) => menu.module === "hr");
  assert.equal(hr?.children?.filter((child) => child.href === "/hr/talent").length, 1);
  assert.equal(hr?.children?.filter((child) => child.href === "/hr/future").length, 1);
});

test("backend projection cannot restore legacy operations entries or duplicate canonical surfaces", () => {
  const backendGroups = (["homestay", "housing_rental"] as const).map((moduleCode) => ({
    label: moduleCode === "homestay" ? "民宿管理" : "住房出租",
    module: moduleCode,
    children: [
      {
        label: "旧运营入口",
        href: moduleCode === "homestay" ? "/homestay" : "/housing",
        permission: moduleCode === "homestay"
          ? "homestay:operations"
          : "housing_rental:operations",
        module: moduleCode
      },
      ...PROPERTY_BUSINESS_SURFACES
        .filter((surface) => surface.moduleCode === moduleCode)
        .map((surface) => ({
          label: surface.featureId,
          href: surface.route,
          permission: surface.pageCode,
          module: surface.moduleCode
        }))
    ]
  })) satisfies UserMenuTreeNode[];
  const menus = getDashboardMenus(backendGroups);
  const children = menus.flatMap((menu) => menu.children ?? []);

  assert.equal(children.some((item) => item.href === "/homestay"), false);
  assert.equal(children.some((item) => item.href === "/housing"), false);
  for (const surface of PROPERTY_BUSINESS_SURFACES) {
    assert.equal(children.filter((item) => item.href === surface.route).length, 1);
  }
});

test("property menu nodes require only their module and granular page permission", () => {
  const propertyChildren = getDashboardMenus()
    .filter((menu) => menu.module === "homestay" || menu.module === "housing_rental")
    .flatMap((menu) => menu.children ?? []);

  assert.equal(propertyChildren.length, 17);
  for (const child of propertyChildren) {
    const surface = PROPERTY_BUSINESS_SURFACES.find((item) => item.route === child.href);
    assert.ok(surface);
    assert.deepEqual(
      { module: child.module, permission: child.permission },
      { module: surface.moduleCode, permission: surface.pageCode }
    );
    assert.doesNotMatch(child.permission ?? "", /:operations$/u);
  }
});

test("park management is reachable through both active asset and inactive system recovery menus", () => {
  const parkMenu = findMenuByPath("/assets/parks", getDashboardMenus());
  assert.deepEqual(
    { module: parkMenu?.module, permission: parkMenu?.permission },
    { module: "asset", permission: "park:read" }
  );
  const assetChildren = getDashboardMenus().find((menu) => menu.module === "asset")?.children ?? [];
  const systemChildren = getDashboardMenus().find((menu) => menu.module === "system")?.children ?? [];
  assert.equal(assetChildren.some((child) => child.href === "/assets/parks"), true);
  assert.equal(systemChildren.some((child) => child.href === "/assets/parks"), true);
  assert.deepEqual(findMenusByPath("/assets/parks", getDashboardMenus()).map((item) => item.module), ["asset", "system"]);
});

test("backend asset metadata cannot overwrite the system park recovery menu module", () => {
  const backendMenus = [{
    label: "资产管理",
    module: "asset",
    children: [{
      label: "园区管理",
      href: "/assets/parks",
      permission: "park:read",
      module: "asset"
    }]
  }] satisfies UserMenuTreeNode[];

  assert.deepEqual(
    findMenusByPath("/assets/parks", getDashboardMenus(backendMenus)).map((item) => item.module),
    ["asset", "system"]
  );
});

test("asset menu exposes the shared property control planes", () => {
  const readPermissions: Record<string, string> = {
    "asset.property-operations": PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_OPERATION_READ,
    "asset.property-occupancies": PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_OCCUPANCY_READ,
    "asset.property-mode-transitions": PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_APPROVAL_READ,
    "asset.identity-submissions": PROPERTY_BUSINESS_PERMISSIONS.PARTY_READ
  };
  const expected = PROPERTY_TRACK_B_SURFACES
    .filter((surface) => [
      "asset.property-operations",
      "asset.property-occupancies",
      "asset.property-mode-transitions",
      "asset.identity-submissions"
    ].includes(surface.surfaceId));
  const menus = getDashboardMenus();

  for (const surface of expected) {
    const item = findMenuByPath(surface.route, menus);
    assert.deepEqual(
      { module: item?.module, permission: item?.permission, permissions: item?.permissions },
      {
        module: surface.requiredModule,
        permission: surface.pagePermission,
        permissions: [surface.pagePermission, readPermissions[surface.surfaceId]]
      }
    );
    assert.equal(FIRST_RELEASE_MENU_PATH_SET.has(surface.route), true);
  }
  const identityMenu = findMenuByPath("/assets/identity-submissions", menus);
  assert.deepEqual(
    {
      label: identityMenu?.label,
      href: identityMenu?.href,
      module: identityMenu?.module,
      permission: identityMenu?.permission,
      permissions: identityMenu?.permissions
    },
    {
      label: "身份核验工作台",
      href: "/assets/identity-submissions",
      module: "asset",
      permission: PROPERTY_BUSINESS_PERMISSIONS.IDENTITY_SUBMISSIONS_PAGE,
      permissions: [
        PROPERTY_BUSINESS_PERMISSIONS.IDENTITY_SUBMISSIONS_PAGE,
        PROPERTY_BUSINESS_PERMISSIONS.PARTY_READ
      ]
    }
  );
  assert.equal(FIRST_RELEASE_MENU_PATH_SET.has("/assets/identity-submissions"), true);
  assert.equal(expected.length, 4);
});
