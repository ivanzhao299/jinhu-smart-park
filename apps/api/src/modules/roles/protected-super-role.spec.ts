import assert from "node:assert/strict";
import test from "node:test";
import { isProtectedTenantSuperRole } from "./protected-super-role";

const protectedRole = {
  code: "SUPER_ADMIN",
  roleScope: "platform",
  isSuper: true,
  isSystem: true,
  isBuiltin: true,
  isEnabled: true,
  status: "enabled",
  isDeleted: false
};

test("recognizes only the complete protected tenant super identity", () => {
  assert.equal(isProtectedTenantSuperRole(protectedRole), true);

  for (const override of [
    { code: "CUSTOM_SUPER" },
    { roleScope: "tenant" },
    { isSuper: false },
    { isSystem: false },
    { isBuiltin: false },
    { isEnabled: false },
    { status: "disabled" },
    { isDeleted: true }
  ]) {
    assert.equal(isProtectedTenantSuperRole({ ...protectedRole, ...override }), false);
  }
});
