import assert from "node:assert/strict";
import test from "node:test";
import { AuthService } from "./auth.service";

test("login authorization only includes role and permission links from the user's park", () => {
  const resolveAuthorization = (AuthService.prototype as unknown as {
    resolveUserAuthorization(user: unknown): { activeRoleLinks: unknown[]; permissions: string[]; isSuper: boolean };
  }).resolveUserAuthorization;
  const currentRole = {
    code: "TENANT_OPERATOR",
    tenantId: "tenant-a",
    parkId: "park-a",
    roleScope: "tenant",
    isEnabled: true,
    isDeleted: false,
    status: "enabled",
    isSuper: false,
    isSystem: false,
    isBuiltin: false,
    permissionLinks: [
      {
        tenantId: "tenant-a",
        parkId: "park-a",
        isDeleted: false,
        permission: {
          tenantId: "tenant-a",
          code: "system:user:list",
          isEnabled: true,
          isDeleted: false,
          status: "enabled"
        }
      },
      {
        tenantId: "tenant-a",
        parkId: "park-b",
        isDeleted: false,
        permission: { tenantId: "tenant-a", code: "*", isEnabled: true, isDeleted: false, status: "enabled" }
      }
    ]
  };
  const user = {
    tenantId: "tenant-a",
    parkId: "park-a",
    roleLinks: [
      { tenantId: "tenant-a", parkId: "park-a", isDeleted: false, role: currentRole },
      {
        tenantId: "tenant-a",
        parkId: "park-b",
        isDeleted: false,
        role: {
          code: "CUSTOM_SUPER",
          tenantId: "tenant-a",
          parkId: "park-a",
          roleScope: "tenant",
          isEnabled: true,
          isDeleted: false,
          status: "enabled",
          isSuper: true,
          isSystem: false,
          isBuiltin: false,
          permissionLinks: []
        }
      },
      {
        tenantId: "tenant-a",
        parkId: "park-a",
        isDeleted: false,
        role: {
          code: "FOREIGN_SUPER",
          tenantId: "tenant-b",
          parkId: "park-a",
          roleScope: "tenant",
          isEnabled: true,
          isDeleted: false,
          status: "enabled",
          isSuper: true,
          isSystem: false,
          isBuiltin: false,
          permissionLinks: []
        }
      },
      {
        tenantId: "tenant-a",
        parkId: "park-a",
        isDeleted: false,
        role: {
          code: "PARK_SUPER",
          tenantId: "tenant-a",
          parkId: "park-b",
          roleScope: "park",
          isEnabled: true,
          isDeleted: false,
          status: "enabled",
          isSuper: true,
          isSystem: false,
          isBuiltin: false,
          permissionLinks: []
        }
      }
    ]
  };

  const result = resolveAuthorization.call(
    { expandPermissionAliases: (permissions: string[]) => permissions },
    user
  );

  assert.equal(result.activeRoleLinks.length, 1);
  assert.deepEqual(result.permissions, ["system:user:list"]);
  assert.equal(result.isSuper, false);
});

test("login authorization carries only the complete protected SUPER_ADMIN binding across parks", () => {
  const resolveAuthorization = (AuthService.prototype as unknown as {
    resolveUserAuthorization(user: unknown): { activeRoleLinks: Array<{ role: { code: string } }>; permissions: string[]; isSuper: boolean };
  }).resolveUserAuthorization;
  const protectedSuperRole = {
    code: "SUPER_ADMIN",
    tenantId: "tenant-a",
    parkId: "park-a",
    roleScope: "platform",
    isEnabled: true,
    isDeleted: false,
    status: "enabled",
    isSuper: true,
    isSystem: true,
    isBuiltin: true,
    permissionLinks: []
  };
  const user = {
    tenantId: "tenant-a",
    parkId: "park-b",
    roleLinks: [
      { tenantId: "tenant-a", parkId: "park-a", isDeleted: false, role: protectedSuperRole },
      {
        tenantId: "tenant-a",
        parkId: "park-a",
        isDeleted: false,
        role: { ...protectedSuperRole, code: "CUSTOM_SUPER", isSystem: false, isBuiltin: false }
      }
    ]
  };

  const result = resolveAuthorization.call(
    { expandPermissionAliases: (permissions: string[]) => permissions },
    user
  );

  assert.deepEqual(result.activeRoleLinks.map((link) => link.role.code), ["SUPER_ADMIN"]);
  assert.deepEqual(result.permissions, []);
  assert.equal(result.isSuper, true);
});
