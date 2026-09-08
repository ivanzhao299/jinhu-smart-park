import assert from "node:assert/strict";
import test from "node:test";
import { buildRouteHref, isTerminalRoute, resolveDynamicBreadcrumbLabel, resolveDynamicWebRoute } from "./routes";

test("typed route registry resolves details and builds encoded hrefs", () => {
  const resolved = resolveDynamicWebRoute("/housing/leases/lease%2F001");
  assert.equal(resolved?.route.menuHref, "/housing/leases");
  assert.equal(resolved?.params.id, "lease/001");
  assert.equal(buildRouteHref("/housing/leases/:id", { id: "lease/001" }), "/housing/leases/lease%2F001");
  assert.equal(resolveDynamicWebRoute("/housing/leases/a/extra"), undefined);
  assert.throws(() => buildRouteHref("/housing/leases/:id", {}), /Missing route parameter/);
});

test("dynamic breadcrumb labels use bounded safe fallbacks", () => {
  const resolved = resolveDynamicWebRoute("/engineering/projects/project-1")!;
  assert.equal(resolveDynamicBreadcrumbLabel(resolved.route), "项目详情");
  assert.equal(resolveDynamicBreadcrumbLabel(resolved.route, "  北区   改造项目  "), "北区 改造项目");
  assert.equal(resolveDynamicBreadcrumbLabel(resolved.route, " "), "项目详情");
});

test("terminal classification is centralized and segment-safe", () => {
  assert.equal(isTerminalRoute("/operations/terminal"), true);
  assert.equal(isTerminalRoute("/operations/terminal/task-1"), true);
  assert.equal(isTerminalRoute("/operations/terminal-preview"), false);
  assert.equal(isTerminalRoute("/dashboard"), false);
});
