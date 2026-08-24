import assert from "node:assert/strict";
import test from "node:test";
import type { UserMenuTreeNode } from "@jinhu/shared";
import { resolveCatchAllRoute } from "./catch-all-route";

test("keeps the tenants compatibility route outside the placeholder contract", () => {
  assert.deepEqual(resolveCatchAllRoute("/system/tenants"), { kind: "tenants" });
});

test("keeps registered legacy menu entries as placeholders", () => {
  const resolution = resolveCatchAllRoute("/system/audit");
  assert.equal(resolution.kind, "placeholder");
  if (resolution.kind === "placeholder") assert.equal(resolution.menu.label, "审计中心");
});

test("keeps backend registered menu entries as placeholders", () => {
  const userMenus: UserMenuTreeNode[] = [{
    label: "系统管理",
    module: "system",
    children: [{
      label: "扩展管理入口",
      href: "/system/extension-console",
      permission: "system:extension:read",
      module: "system"
    }]
  }];
  const resolution = resolveCatchAllRoute("/system/extension-console", userMenus);

  assert.equal(resolution.kind, "placeholder");
  if (resolution.kind === "placeholder") {
    assert.equal(resolution.menu.label, "扩展管理入口");
    assert.ok(resolution.menus.some((menu) =>
      menu.children?.some((child) => child.href === "/system/extension-console")
    ));
  }
});

test("classifies completely unknown paths as not found", () => {
  assert.deepEqual(resolveCatchAllRoute("/totally-unknown-route"), { kind: "not-found" });
});
