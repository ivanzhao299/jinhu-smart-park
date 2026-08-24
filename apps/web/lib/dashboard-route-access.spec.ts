import assert from "node:assert/strict";
import test from "node:test";
import {
  dashboardRouteDenialHref,
  resolveDashboardRouteDenial
} from "./dashboard-route-access";

const user = {
  permissions: ["asset:read"],
  enabled_modules: [{ module_code: "asset", enabled: true }]
};

test("allows routes outside the menu authorization contract", () => {
  assert.equal(resolveDashboardRouteDenial(user, []), null);
});

test("allows a route when any matching menu is accessible", () => {
  assert.equal(resolveDashboardRouteDenial(user, [
    { permission: "missing:read", module: "asset" },
    { permission: "asset:read", module: "asset" }
  ]), null);
});

test("classifies permission and module route denials", () => {
  assert.equal(resolveDashboardRouteDenial(user, [
    { permission: "missing:read", module: "asset" }
  ]), "permission");
  assert.equal(resolveDashboardRouteDenial(user, [
    { permission: "asset:read", module: "safety" }
  ]), "module");
});

test("maps route denials to the shared 403 page", () => {
  assert.equal(dashboardRouteDenialHref("permission"), "/403");
  assert.equal(dashboardRouteDenialHref("module"), "/403?reason=module");
});
