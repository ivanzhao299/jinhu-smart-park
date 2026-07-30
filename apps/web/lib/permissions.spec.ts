import assert from "node:assert/strict";
import test from "node:test";
import { hasAccess, hasModule, hasPermission } from "./permissions";

test("super users bypass permissions but not tenant module availability", () => {
  const superUser = {
    is_super: true,
    permissions: ["*"],
    enabled_modules: [{ module_code: "homestay", enabled: true }]
  };

  assert.equal(hasPermission(superUser, "homestay:operations"), true);
  assert.equal(hasModule(superUser, "homestay"), true);
  assert.equal(hasModule(superUser, "housing_rental"), false);
  assert.equal(hasAccess(superUser, "housing_rental:operations", "housing_rental"), false);
});

test("disabled module entries deny access for every role type", () => {
  const user = {
    permissions: ["housing_rental:operations"],
    enabled_modules: [{ module_code: "housing_rental", enabled: false }]
  };

  assert.equal(hasModule(user, "housing_rental"), false);
  assert.equal(hasAccess(user, "housing_rental:operations", "housing_rental"), false);
});
