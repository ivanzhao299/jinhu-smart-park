import assert from "node:assert/strict";
import test from "node:test";
import { isProtectedTenantSuperBinding, isProtectedTenantSuperRole } from "./protected-super-role";

const protectedRole = {
  tenantId: "tenant-a",
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

test("requires the protected binding and role to share the user's tenant", () => {
  const binding = { tenantId: "tenant-a", isDeleted: false, role: protectedRole };

  assert.equal(isProtectedTenantSuperBinding(binding, "tenant-a"), true);
  assert.equal(isProtectedTenantSuperBinding({ ...binding, tenantId: "tenant-b" }, "tenant-a"), false);
  assert.equal(isProtectedTenantSuperBinding({ ...binding, role: { ...protectedRole, tenantId: "tenant-b" } }, "tenant-a"), false);
  assert.equal(isProtectedTenantSuperBinding({ ...binding, isDeleted: true }, "tenant-a"), false);
});
