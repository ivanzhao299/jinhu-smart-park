import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Sidebar, Breadcrumb, and Dashboard authorization use shared user-tree helpers", () => {
  const sidebar = readFileSync("components/layout/AppSidebar.tsx", "utf8");
  const breadcrumb = readFileSync("components/layout/AppBreadcrumb.tsx", "utf8");
  const dashboard = readFileSync("components/layout/DashboardLayout.tsx", "utf8");

  assert.match(sidebar, /getUserDashboardMenus\(user\)/);
  assert.match(breadcrumb, /getUserDashboardMenus\(user\)/);
  assert.match(dashboard, /getUserDashboardAuthorizationMenus\(user\)/);
  for (const source of [sidebar, breadcrumb, dashboard]) {
    assert.doesNotMatch(source, /user\?\.(?:menus|menu_tree) \?\? user\?\.(?:menus|menu_tree)/);
  }
});
