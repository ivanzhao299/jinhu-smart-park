import assert from "node:assert/strict";
import test from "node:test";
import type { UserContext } from "@jinhu/shared";
import { resolvePostLoginPath } from "./post-login-route";

function createUser(overrides: Partial<UserContext> = {}): UserContext {
  return {
    id: "user-1",
    username: "tester",
    real_name: "Tester",
    mobile: null,
    email: null,
    tenant_id: "tenant-1",
    park_id: "park-1",
    park_name: "金湖科创产业园",
    accessible_parks: [],
    current_park: null,
    org_id: null,
    org_name: null,
    roles: [],
    permissions: [],
    data_scope: "park",
    data_scopes: [],
    field_permissions: [],
    field_policies: [],
    enabled_modules: [],
    menu_tree: [],
    menus: [],
    is_super: false,
    ...overrides
  };
}

test("mobile engineering users land in engineering terminal", () => {
  const user = createUser({
    permissions: ["ENGINEERING_DASHBOARD_VIEW"],
    enabled_modules: [{ module_code: "engineering", module_name: "工程管理", module_group: "engineering", enabled: true }]
  });

  const route = resolvePostLoginPath(user, { viewportWidth: 390, pointerCoarse: true, touchPoints: 5, userAgent: "iPhone" });

  assert.equal(route, "/engineering/terminal");
});

test("mobile super users land in operations terminal", () => {
  const user = createUser({ is_super: true, permissions: ["*"] });

  const route = resolvePostLoginPath(user, { viewportWidth: 390, pointerCoarse: true, touchPoints: 5, userAgent: "iPhone" });

  assert.equal(route, "/operations/terminal");
});

test("desktop users fall back to first visible menu item", () => {
  const user = createUser({
    menu_tree: [
      {
        label: "工程管理",
        children: [{ label: "工程项目", href: "/engineering/projects" }]
      }
    ]
  });

  const route = resolvePostLoginPath(user, { viewportWidth: 1440, pointerCoarse: false, touchPoints: 0, userAgent: "Macintosh" });

  assert.equal(route, "/engineering/projects");
});

test("mobile users without terminal permissions fall back to their first menu", () => {
  const user = createUser({
    menu_tree: [{ label: "系统管理", href: "/system/users" }]
  });

  const route = resolvePostLoginPath(user, { viewportWidth: 430, pointerCoarse: true, touchPoints: 5, userAgent: "Android" });

  assert.equal(route, "/system/users");
});
