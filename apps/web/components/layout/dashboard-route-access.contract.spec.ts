import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("apps/web/components/layout/DashboardLayout.tsx", "utf8");

test("DashboardLayout redirects route denials through the shared 403 contract", () => {
  assert.match(source, /router\.replace\(dashboardRouteDenialHref\(routeDenial\)\)/);
});

test("DashboardLayout does not render protected children while redirecting", () => {
  assert.match(source, /if \(!ready \|\| !user \|\| routeDenial\) \{/);
  assert.match(source, /return <DashboardShellSkeleton/);
});
