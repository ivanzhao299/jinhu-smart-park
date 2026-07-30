import assert from "node:assert/strict";
import test from "node:test";
import {
  PROPERTY_BUSINESS_SURFACES,
  type UserMenuTreeNode
} from "@jinhu/shared";
import {
  FIRST_RELEASE_MENU_PATH_SET,
  findMenuByPath,
  getDashboardMenus
} from "./menu";

test("property business canonical menus expose only the real operations pages", () => {
  const menus = getDashboardMenus();
  const homestay = menus.find((menu) => menu.module === "homestay");
  const housing = menus.find((menu) => menu.module === "housing_rental");

  assert.deepEqual(
    homestay?.children?.map(({ label, href, permission, module }) => ({ label, href, permission, module })),
    [{ label: "民宿运营", href: "/homestay", permission: "homestay:operations", module: "homestay" }]
  );
  assert.deepEqual(
    housing?.children?.map(({ label, href, permission, module }) => ({ label, href, permission, module })),
    [{ label: "住房运营", href: "/housing", permission: "housing_rental:operations", module: "housing_rental" }]
  );
  assert.equal(findMenuByPath("/homestay", menus)?.module, "homestay");
  assert.equal(findMenuByPath("/housing", menus)?.module, "housing_rental");
  assert.equal(FIRST_RELEASE_MENU_PATH_SET.has("/homestay"), true);
  assert.equal(FIRST_RELEASE_MENU_PATH_SET.has("/housing"), true);
});

test("backend menu projection merges without duplicating property business entries", () => {
  const menus = getDashboardMenus([
    {
      label: "民宿管理",
      icon: "hotel",
      children: [
        {
          label: "民宿运营",
          href: "/homestay",
          permission: "homestay:operations",
          module: "homestay"
        }
      ]
    },
    {
      label: "住房出租",
      icon: "house",
      children: [
        {
          label: "住房运营",
          href: "/housing",
          permission: "housing_rental:operations",
          module: "housing_rental"
        }
      ]
    }
  ]);

  assert.equal(menus.filter((menu) => menu.module === "homestay").length, 1);
  assert.equal(menus.filter((menu) => menu.module === "housing_rental").length, 1);
  assert.equal(
    menus.flatMap((menu) => menu.children ?? []).filter((menu) => menu.href === "/homestay").length,
    1
  );
  assert.equal(
    menus.flatMap((menu) => menu.children ?? []).filter((menu) => menu.href === "/housing").length,
    1
  );
});

test("backend canonical property menus stay hidden until their route handoffs", () => {
  const propertyGroups = (["homestay", "housing_rental"] as const).map((moduleCode) => ({
    label: moduleCode === "homestay" ? "民宿管理" : "住房出租",
    module: moduleCode,
    children: PROPERTY_BUSINESS_SURFACES
      .filter((surface) => surface.moduleCode === moduleCode)
      .map((surface) => ({
        label: surface.featureId,
        href: surface.route,
        permission: surface.pageCode,
        module: surface.moduleCode
      }))
  }));
  const menus = getDashboardMenus([
    ...propertyGroups,
    {
      label: "IoT 平台",
      module: "iot",
      children: [
        {
          label: "厂商运行台",
          href: "/iot/vendor-console",
          permission: "iot_vendor_console:read",
          module: "iot"
        }
      ]
    }
  ] satisfies UserMenuTreeNode[]);
  const canonicalPropertyHrefs = new Set<string>(
    PROPERTY_BUSINESS_SURFACES.map((surface) => surface.route)
  );
  const mergedChildren = menus.flatMap((menu) => menu.children ?? []);

  assert.equal(
    mergedChildren.filter((menu) => menu.href && canonicalPropertyHrefs.has(menu.href)).length,
    0
  );
  assert.equal(
    mergedChildren.some((menu) => menu.href === "/iot/vendor-console"),
    true
  );
  assert.equal(
    mergedChildren.filter((menu) => menu.href === "/homestay").length,
    1
  );
  assert.equal(
    mergedChildren.filter((menu) => menu.href === "/housing").length,
    1
  );
});
