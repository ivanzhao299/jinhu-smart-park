import assert from "node:assert/strict";
import test from "node:test";
import { SYSTEM_PERMISSIONS, type UserContext } from "@jinhu/shared";
import { resolvePostLoginPath, resolvePostParkSwitchPath } from "./post-login-route";

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

test("desktop super users ignore a seeded business menu and land on the dashboard", () => {
  const user = createUser({
    is_super: true,
    permissions: ["*"],
    enabled_modules: [{ module_code: "safety", module_name: "安全管理", module_group: "operations", enabled: true }],
    menu_tree: [
      {
        label: "安全管理",
        module: "safety",
        children: [{ label: "安全看板", href: "/safety/dashboard", permission: "safety_statistics:read" }]
      }
    ]
  });

  const route = resolvePostLoginPath(user, {
    viewportWidth: 1440,
    pointerCoarse: false,
    touchPoints: 10,
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
  });

  assert.equal(route, "/dashboard");
});

test("desktop wildcard users also land on the dashboard", () => {
  const user = createUser({
    permissions: ["*"],
    enabled_modules: [{ module_code: "safety", module_name: "安全管理", module_group: "operations", enabled: true }],
    menu_tree: [{ label: "安全看板", href: "/safety/dashboard", permission: "safety_statistics:read", module: "safety" }]
  });

  const route = resolvePostLoginPath(user, {
    viewportWidth: 1440,
    pointerCoarse: false,
    touchPoints: 0,
    userAgent: "Macintosh"
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

const desktopSignals = { viewportWidth: 1440, pointerCoarse: false, touchPoints: 0, userAgent: "Macintosh" };
const mobileSignals = { viewportWidth: 390, pointerCoarse: true, touchPoints: 5, userAgent: "iPhone" };

test("park switches keep an accessible menu route and its detail routes", () => {
  const user = createUser({
    permissions: ["workorder:read"],
    enabled_modules: [{ module_code: "workorder", module_name: "工单管理", module_group: "operations", enabled: true }],
    menu_tree: [{ label: "工单管理", href: "/workorders", permission: "workorder:read", module: "workorder" }]
  });

  assert.equal(resolvePostParkSwitchPath(user, "/workorders", null, desktopSignals), "/workorders");
  assert.equal(resolvePostParkSwitchPath(user, "/workorders/order-1", null, desktopSignals), "/workorders/order-1");
});

test("park switches redirect an inaccessible menu detail to the next user's landing route", () => {
  const user = createUser({
    permissions: ["user:read"],
    enabled_modules: [{ module_code: "system", module_name: "系统管理", module_group: "system", enabled: true }],
    menu_tree: [{ label: "用户管理", href: "/system/users", permission: "user:read", module: "system" }]
  });

  assert.equal(resolvePostParkSwitchPath(user, "/engineering/projects/project-1", null, desktopSignals), "/system/users");
});

test("park switches keep the module-free dashboard and unknown utility routes", () => {
  const user = createUser();

  assert.equal(resolvePostParkSwitchPath(user, "/dashboard", null, desktopSignals), "/dashboard");
  assert.equal(resolvePostParkSwitchPath(user, "/profile/preferences", null, desktopSignals), "/profile/preferences");
});

test("park switches keep reachable mobile terminals", () => {
  const engineeringUser = createUser({
    permissions: ["ENGINEERING_DASHBOARD_VIEW"],
    enabled_modules: [{ module_code: "engineering", module_name: "工程管理", module_group: "engineering", enabled: true }]
  });
  const operationsUser = createUser({
    permissions: [SYSTEM_PERMISSIONS.SAFETY_INSPECT_TASK_MY],
    enabled_modules: [{ module_code: "safety", module_name: "安全管理", module_group: "operations", enabled: true }]
  });

  assert.equal(resolvePostParkSwitchPath(engineeringUser, "/engineering/terminal", null, mobileSignals), "/engineering/terminal");
  assert.equal(resolvePostParkSwitchPath(operationsUser, "/operations/terminal", null, mobileSignals), "/operations/terminal");
});

test("park switches redirect an unreachable mobile terminal with existing mobile landing semantics", () => {
  const user = createUser({
    permissions: ["user:read"],
    enabled_modules: [{ module_code: "system", module_name: "系统管理", module_group: "system", enabled: true }],
    menu_tree: [{ label: "用户管理", href: "/system/users", permission: "user:read", module: "system" }]
  });

  assert.equal(resolvePostParkSwitchPath(user, "/engineering/terminal", null, mobileSignals), "/system/users");
});

test("park switches preserve the desktop wildcard dashboard fallback", () => {
  const user = createUser({ permissions: ["*"], is_super: true });

  assert.equal(resolvePostParkSwitchPath(user, "/operations/terminal", null, desktopSignals), "/dashboard");
});

test("park switches prefer a denied specific menu over an accessible parent prefix", () => {
  const user = createUser({
    permissions: ["ENGINEERING_DASHBOARD_VIEW"],
    enabled_modules: [{ module_code: "engineering", module_name: "工程管理", module_group: "engineering", enabled: true }],
    menu_tree: [{ label: "工程运行时", href: "/engineering", permission: "ENGINEERING_DASHBOARD_VIEW", module: "engineering" }]
  });

  assert.equal(
    resolvePostParkSwitchPath(user, "/engineering/plans/plan-1", null, desktopSignals),
    "/engineering"
  );
});

test("park switches enforce compound menu permissions", () => {
  const user = createUser({
    permissions: ["asset:property-operations:page"],
    enabled_modules: [{ module_code: "asset", module_name: "资产管理", module_group: "asset", enabled: true }],
    menu_tree: []
  });

  assert.equal(resolvePostParkSwitchPath(user, "/assets/property-operations", null, desktopSignals), "/dashboard");
});

test("park switches redirect a backend menu removed from the target park", () => {
  const previousUser = createUser({
    permissions: ["custom:read"],
    enabled_modules: [{ module_code: "custom", module_name: "自定义", module_group: "custom", enabled: true }],
    menu_tree: [{ label: "自定义入口", href: "/custom/park-report", permission: "custom:read", module: "custom" }]
  });
  const nextUser = createUser({
    permissions: ["user:read"],
    enabled_modules: [{ module_code: "system", module_name: "系统管理", module_group: "system", enabled: true }],
    menu_tree: [{ label: "用户管理", href: "/system/users", permission: "user:read", module: "system" }]
  });

  assert.equal(resolvePostParkSwitchPath(nextUser, "/custom/park-report", previousUser, desktopSignals), "/system/users");
});

test("park switches require the engineering terminal dashboard permission", () => {
  const user = createUser({
    permissions: ["ENGINEERING_PROJECT_VIEW"],
    enabled_modules: [{ module_code: "engineering", module_name: "工程管理", module_group: "engineering", enabled: true }],
    menu_tree: [{ label: "工程项目", href: "/engineering/projects", permission: "ENGINEERING_PROJECT_VIEW", module: "engineering" }]
  });

  assert.equal(resolvePostParkSwitchPath(user, "/engineering/terminal", null, mobileSignals), "/engineering/projects");
});
