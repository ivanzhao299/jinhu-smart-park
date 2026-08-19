import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("HR top-level route keeps the authenticated dashboard and visible permission fallback", () => {
  const layout = readFileSync(new URL("./layout.tsx", import.meta.url), "utf8");
  const workbench = readFileSync(new URL("./HrWorkbench.tsx", import.meta.url), "utf8");

  assert.match(layout, /import \{ DashboardLayout \}/);
  assert.match(layout, /<DashboardLayout>\{children\}<\/DashboardLayout>/);
  assert.match(workbench, /module="hr"/);
  assert.match(workbench, /permission="hr:dashboard"/);
  assert.match(workbench, /无权访问人力资源管理/);
});
