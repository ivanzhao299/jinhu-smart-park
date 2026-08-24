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

test("touchscreen laptops with a fine pointer use the desktop landing route", () => {
  const user = createUser({
    permissions: ["ENGINEERING_PROJECT_VIEW"],
    enabled_modules: [{ module_code: "engineering", module_name: "工程管理", module_group: "engineering", enabled: true }],
    menu_tree: [
      {
        label: "工程管理",
        module: "engineering",
        children: [{ label: "工程项目", href: "/engineering/projects", permission: "ENGINEERING_PROJECT_VIEW" }]
      }
    ]
  });

  const route = resolvePostLoginPath(user, {
    viewportWidth: 1440,
    pointerCoarse: false,
    touchPoints: 10,
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
  });

  assert.equal(route, "/engineering/projects");
});

test("desktop super users with touch support land on the dashboard menu", () => {
  const user = createUser({
    is_super: true,
    permissions: ["*"],
    enabled_modules: [{ module_code: "engineering", module_name: "工程管理", module_group: "engineering", enabled: true }],
    menu_tree: [{ label: "首页", href: "/dashboard" }]
  });

  const route = resolvePostLoginPath(user, {
    viewportWidth: 1440,
    pointerCoarse: false,
    touchPoints: 10,
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
  });

  assert.equal(route, "/dashboard");
});

test("narrow desktop windows keep using the mobile engineering workbench", () => {
  const user = createUser({
    permissions: ["ENGINEERING_DASHBOARD_VIEW"],
    enabled_modules: [{ module_code: "engineering", module_name: "工程管理", module_group: "engineering", enabled: true }]
  });

  const route = resolvePostLoginPath(user, {
    viewportWidth: 900,
    pointerCoarse: false,
    touchPoints: 0,
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
  });

  assert.equal(route, "/engineering/terminal");
});

test("mobile super users land in operations terminal only when its module is enabled", () => {
  const user = createUser({
    is_super: true,
    permissions: ["*"],
    enabled_modules: [{ module_code: "safety", module_name: "安全管理", module_group: "operations", enabled: true }]
  });

  const route = resolvePostLoginPath(user, { viewportWidth: 390, pointerCoarse: true, touchPoints: 5, userAgent: "iPhone" });

  assert.equal(route, "/operations/terminal");
});

test("mobile super users without enabled operational modules fall back to a module-free route", () => {
  const user = createUser({ is_super: true, permissions: ["*"] });

  const route = resolvePostLoginPath(user, { viewportWidth: 390, pointerCoarse: true, touchPoints: 5, userAgent: "iPhone" });

  assert.equal(route, "/dashboard");
});

test("mobile workorder-only administrators do not enter the safety operations terminal", () => {
  const user = createUser({
    permissions: ["workorder:read", "workorder:create"],
    enabled_modules: [{ module_code: "workorder", module_name: "工单管理", module_group: "operations", enabled: true }]
  });

  const route = resolvePostLoginPath(user, { viewportWidth: 800, pointerCoarse: false, touchPoints: 0, userAgent: "HeadlessChrome" });

  assert.equal(route, "/dashboard");
});

test("desktop users fall back to first visible menu item", () => {
  const user = createUser({
    permissions: ["ENGINEERING_PROJECT_VIEW"],
    enabled_modules: [{ module_code: "engineering", module_name: "工程管理", module_group: "engineering", enabled: true }],
    menu_tree: [
      {
        label: "工程管理",
        module: "engineering",
        children: [{ label: "工程项目", href: "/engineering/projects", permission: "ENGINEERING_PROJECT_VIEW" }]
      }
    ]
  });

  const route = resolvePostLoginPath(user, { viewportWidth: 1440, pointerCoarse: false, touchPoints: 0, userAgent: "Macintosh" });

  assert.equal(route, "/engineering/projects");
});

test("mobile users without terminal permissions fall back to their first menu", () => {
  const user = createUser({
    permissions: ["user:read"],
    enabled_modules: [{ module_code: "system", module_name: "系统管理", module_group: "system", enabled: true }],
    menu_tree: [{ label: "系统管理", href: "/system/users", permission: "user:read", module: "system" }]
  });

  const route = resolvePostLoginPath(user, { viewportWidth: 430, pointerCoarse: true, touchPoints: 5, userAgent: "Android" });

  assert.equal(route, "/system/users");
});

test("desktop users skip a first menu whose permission is not granted", () => {
  const user = createUser({
    permissions: ["user:read"],
    enabled_modules: [{ module_code: "system", module_name: "系统管理", module_group: "system", enabled: true }],
    menu_tree: [
      { label: "角色管理", href: "/system/roles", permission: "role:read", module: "system" },
      { label: "用户管理", href: "/system/users", permission: "user:read", module: "system" }
    ]
  });

  const route = resolvePostLoginPath(user, { viewportWidth: 1440, pointerCoarse: false, touchPoints: 0, userAgent: "Macintosh" });

  assert.equal(route, "/system/users");
});

test("post-login menu selection inherits a parent module requirement", () => {
  const user = createUser({
    permissions: ["user:read", "park:read"],
    enabled_modules: [{ module_code: "system", module_name: "系统管理", module_group: "system", enabled: true }],
    menu_tree: [
      {
        label: "资产管理",
        module: "asset",
        children: [{ label: "园区管理", href: "/assets/parks", permission: "park:read" }]
      },
      { label: "用户管理", href: "/system/users", permission: "user:read", module: "system" }
    ]
  });

  const route = resolvePostLoginPath(user, { viewportWidth: 1440, pointerCoarse: false, touchPoints: 0, userAgent: "Macintosh" });

  assert.equal(route, "/system/users");
});

test("users without an accessible menu fall back to the module-free dashboard", () => {
  const user = createUser({
    menu_tree: [{ label: "角色管理", href: "/system/roles", permission: "role:read", module: "system" }]
  });

  const route = resolvePostLoginPath(user, { viewportWidth: 1440, pointerCoarse: false, touchPoints: 0, userAgent: "Macintosh" });

  assert.equal(route, "/dashboard");
});
