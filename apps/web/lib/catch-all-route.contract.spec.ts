import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("app/(dashboard)/[...segments]/page.tsx", "utf8");

test("dashboard catch-all uses the authenticated merged-menu resolution", () => {
  assert.match(source, /useAuthUser\(\)/);
  assert.match(source, /resolveCatchAllRoute\(pathname, resolveUserMenuTree\(user\)\)/);
});

test("dashboard catch-all fails closed through the Next not-found boundary", () => {
  assert.match(source, /if \(resolution\.kind === "not-found"\) notFound\(\)/);
});

test("enterprise route supplies authenticated shell and a visible page permission fallback", () => {
  const layout = readFileSync("app/enterprise/layout.tsx", "utf8");
  const client = readFileSync("app/enterprise/EnterpriseClient.tsx", "utf8");
  assert.match(layout, /<DashboardLayout>\{children\}<\/DashboardLayout>/);
  assert.match(client, /<PermissionGuard module="system" fallback=/);
  assert.match(client, /const canEnter = canList \|\| canCreate \|\| canCreateRole/);
  assert.match(client, /if \(!canEnter\) return/);
  assert.match(client, /没有企业成员管理权限/);
});

test("mobile sidebar toggle participates in header layout rather than remaining a faded fixed overlay", () => {
  const css = readFileSync("app/globals.css", "utf8");
  assert.match(css, /\.app-header \.header-sidebar-toggle-actions\s*\{[^}]*display: inline-flex;[^}]*position: static;[^}]*opacity: 1;/);
});
