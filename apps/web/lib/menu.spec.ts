import assert from "node:assert/strict";
import test from "node:test";
import {
  PROPERTY_BUSINESS_SURFACES,
  PROPERTY_TRACK_B_SURFACES,
  type UserMenuTreeNode
} from "@jinhu/shared";
import {
  FIRST_RELEASE_MENU_PATH_SET,
  findMenuByPath,
  getDashboardMenus
} from "./menu";

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

test("asset menu exposes the three shared property control planes", () => {
  const expected = PROPERTY_TRACK_B_SURFACES
    .filter((surface) => [
      "asset.property-operations",
      "asset.property-occupancies",
      "asset.property-mode-transitions"
    ].includes(surface.surfaceId));
  const menus = getDashboardMenus();

  for (const surface of expected) {
    const item = findMenuByPath(surface.route, menus);
    assert.deepEqual(
      { module: item?.module, permission: item?.permission },
      { module: surface.requiredModule, permission: surface.pagePermission }
    );
    assert.equal(FIRST_RELEASE_MENU_PATH_SET.has(surface.route), true);
  }
  assert.equal(expected.length, 3);
});
