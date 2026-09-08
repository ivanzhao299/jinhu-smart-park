import assert from "node:assert/strict";
import test from "node:test";
import { buildNavigationCommands, filterNavigationCommands } from "./command-palette";

test("navigation commands only contain the supplied authorized menu tree", () => {
  const commands = buildNavigationCommands([
    { label: "资产", module: "asset", children: [{ label: "房源", href: "/assets/units", permission: "unit:read" }] },
    { label: "空模块", children: [] },
    { label: "重复", children: [{ label: "重复房源", href: "/assets/units" }] }
  ], { permissions: ["unit:read"], enabled_modules: [{ module_code: "asset", enabled: true }] } as never);
  assert.deepEqual(commands.map(({ href, label }) => ({ href, label })), [{ href: "/assets/units", label: "房源" }]);
  assert.equal(commands.some((command) => command.href.includes("leasing")), false);
});

test("navigation search normalizes case and limits results", () => {
  const commands = buildNavigationCommands([{ label: "System", children: [{ label: "Users", href: "/system/users" }] }], { is_super: true } as never);
  assert.equal(filterNavigationCommands(commands, " USERS ")[0]?.href, "/system/users");
  assert.deepEqual(filterNavigationCommands(commands, "payments"), []);
});

test("navigation commands fail closed for denied permissions and disabled modules", () => {
  const menus = [{ label: "租赁", module: "leasing", children: [{ label: "应收", href: "/leasing/receivables", permission: "leasing_receivable:read" }] }];
  assert.deepEqual(buildNavigationCommands(menus, { permissions: [], enabled_modules: [{ module_code: "leasing", enabled: true }] } as never), []);
  assert.deepEqual(buildNavigationCommands(menus, { permissions: ["leasing_receivable:read"], enabled_modules: [{ module_code: "leasing", enabled: false }] } as never), []);
});

test("navigation commands recursively flatten leaves and inherit ancestor access", () => {
  const menus = [{ label: "工程", module: "engineering", permission: "engineering:read", children: [{ label: "项目组", children: [{ label: "项目", href: "/engineering/projects", permission: "project:read" }] }] }];
  const allowed = { permissions: ["engineering:read", "project:read"], enabled_modules: [{ module_code: "engineering", enabled: true }] } as never;
  assert.deepEqual(buildNavigationCommands(menus, allowed).map((command) => command.href), ["/engineering/projects"]);
  assert.deepEqual(buildNavigationCommands(menus, { permissions: ["project:read"], enabled_modules: [{ module_code: "engineering", enabled: true }] } as never), []);
});
