import assert from "node:assert/strict";
import test from "node:test";
import { AuthService } from "./auth.service";

test("login authorization only includes role and permission links from the user's park", () => {
  const resolveAuthorization = (AuthService.prototype as unknown as {
    resolveUserAuthorization(user: unknown): { activeRoleLinks: unknown[]; permissions: string[]; isSuper: boolean };
  }).resolveUserAuthorization;
  const currentRole = {
    tenantId: "tenant-a",
    isEnabled: true,
    isDeleted: false,
    status: "enabled",
    isSuper: false,
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
          tenantId: "tenant-a",
          isEnabled: true,
          isDeleted: false,
          status: "enabled",
          isSuper: true,
          permissionLinks: []
        }
      },
      {
        tenantId: "tenant-a",
        parkId: "park-a",
        isDeleted: false,
        role: {
          tenantId: "tenant-b",
          isEnabled: true,
          isDeleted: false,
          status: "enabled",
          isSuper: true,
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
