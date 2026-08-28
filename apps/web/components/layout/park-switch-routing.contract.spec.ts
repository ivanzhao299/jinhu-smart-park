import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

for (const component of ["UserMenu.tsx", "MobileTerminalHeader.tsx"]) {
  test(`${component} predicts navigation from the authoritative switched user`, () => {
    const source = readFileSync(`components/layout/${component}`, "utf8");

    assert.match(source, /resolvePostParkSwitchPath\(nextUser, pathname, user\)/);
    assert.match(source, /nextPath === pathname\) router\.refresh\(\)/);
    assert.match(source, /else router\.replace\(nextPath as Route\)/);
    assert.match(source, /formatParkRoleSummary\(park\.role_summary, "未配置园区角色"\)/);
    assert.match(source, /未配置园区角色/);
  });
}

test("DashboardLayout defers source-route denial while predicted park-switch navigation settles", () => {
  const source = readFileSync("components/layout/DashboardLayout.tsx", "utf8");

  assert.match(source, /setParkSwitchSourcePath\(pathname\)/);
  assert.match(source, /resolveEffectiveDashboardRouteDenial\(/);
  assert.match(source, /dashboardRouteDenialHref\(effectiveRouteDenial\)/);
});

test("the access-only state preserves both global switcher variants and logout guidance", () => {
  const layout = readFileSync("components/layout/DashboardLayout.tsx", "utf8");
  const emptyState = readFileSync("components/auth/ParkRoleEmptyState.tsx", "utf8");
  const css = readFileSync("app/globals.css", "utf8");

  assert.match(layout, /<AppHeader/);
  assert.match(layout, /<MobileTerminalHeader \/>/);
  assert.match(emptyState, /已获得园区访问权，但尚未配置园区角色/);
  assert.match(emptyState, /顶部园区选择器/);
  assert.match(emptyState, /退出登录/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.park-role-empty-actions \.ds-button[\s\S]*width: 100%/);
  assert.match(css, /\.park-role-empty-page[\s\S]*width: 100%/);
});
