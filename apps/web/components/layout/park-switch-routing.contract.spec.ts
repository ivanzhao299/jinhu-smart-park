import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

for (const component of ["UserMenu.tsx", "MobileTerminalHeader.tsx"]) {
  test(`${component} predicts navigation from the authoritative switched user`, () => {
    const source = readFileSync(`components/layout/${component}`, "utf8");

    assert.match(source, /resolvePostParkSwitchPath\(nextUser, pathname, user\)/);
    assert.match(source, /nextPath === pathname\) router\.refresh\(\)/);
    assert.match(source, /else router\.replace\(nextPath as Route\)/);
    assert.match(source, /park\.role_summary\?\.has_business_role/);
    assert.match(source, /未配置园区角色/);
  });
}

test("DashboardLayout defers source-route denial while predicted park-switch navigation settles", () => {
  const source = readFileSync("components/layout/DashboardLayout.tsx", "utf8");

  assert.match(source, /setParkSwitchSourcePath\(pathname\)/);
  assert.match(source, /resolveEffectiveDashboardRouteDenial\(/);
  assert.match(source, /dashboardRouteDenialHref\(effectiveRouteDenial\)/);
});
