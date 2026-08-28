import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("components/layout/DashboardLayout.tsx", "utf8");

test("DashboardLayout redirects route denials through the shared 403 contract", () => {
  assert.match(source, /router\.replace\(dashboardRouteDenialHref\(effectiveRouteDenial\)\)/);
});

test("DashboardLayout does not render protected children while redirecting", () => {
  assert.match(source, /effectiveRouteDenial && !accessOnlyCurrentPark/);
  assert.match(source, /return <DashboardShellSkeleton/);
});

test("DashboardLayout keeps the authenticated shell for the access-only recovery state", () => {
  assert.match(source, /isCurrentParkAccessOnly\(user\)/);
  assert.match(source, /<ParkRoleEmptyState/);
  assert.match(source, /recoverySource=\{parkRoleRecoverySource\}/);
  assert.match(source, /switchParkContext\(parkRoleRecoverySource\.parkId\)/);
  assert.match(source, /router\.replace\(resolvePostLoginPath\(nextUser\) as Route\)/);
});
