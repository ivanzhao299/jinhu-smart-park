import assert from "node:assert/strict";
import test from "node:test";
import { IdentityDirectoryService } from "./identity-directory.service";

const scope = { tenantId: "tenant-1", parkId: "park-1" };

test("identity directory keeps scoped and deterministic login lookup contracts", async () => {
  const findOneCalls: unknown[] = [];
  const findCalls: unknown[] = [];
  const repository = {
    findOne: async (options: unknown) => {
      findOneCalls.push(options);
      return null;
    },
    find: async (options: unknown) => {
      findCalls.push(options);
      return [];
    }
  };
  const service = new IdentityDirectoryService(repository as never);

  await service.findByUsernameInScope("operator", scope);
  await service.findByIdInScope("user-1", scope);
  await service.findByIdForIdentity("user-1", scope.tenantId);
  await service.findLoginCandidatesByUsername("operator");
  await service.listLoginUsersByMobile(scope.tenantId, "13800000000", scope.parkId);

  assert.deepEqual(findOneCalls[0], {
    where: {
      username: "operator",
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      isDeleted: false
    },
    relations: {
      roleLinks: {
        role: {
          permissionLinks: {
            permission: true
          }
        }
      }
    }
  });
  assert.deepEqual(findOneCalls[1], {
    where: {
      id: "user-1",
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      isDeleted: false
    },
    relations: {
      roleLinks: {
        role: {
          permissionLinks: {
            permission: true
          }
        }
      }
    }
  });
  assert.deepEqual(findOneCalls[2], {
    where: {
      id: "user-1",
      tenantId: scope.tenantId,
      isDeleted: false,
      isEnabled: true
    }
  });
  assert.deepEqual(findCalls[0], {
    where: { username: "operator", isDeleted: false },
    relations: {
      roleLinks: {
        role: {
          permissionLinks: {
            permission: true
          }
        }
      }
    },
    order: { tenantId: "ASC", parkId: "ASC", createTime: "ASC" }
  });
  assert.deepEqual(findCalls[1], {
    where: {
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      mobile: "13800000000",
      isDeleted: false,
      isEnabled: true
    },
    relations: {
      roleLinks: {
        role: {
          permissionLinks: {
            permission: true
          }
        }
      }
    },
    order: { parkId: "ASC", createTime: "ASC" }
  });
});

test("identity directory records login metadata without weakening the tenant boundary", async () => {
  const updateCalls: unknown[][] = [];
  const repository = {
    update: async (...args: unknown[]) => {
      updateCalls.push(args);
      return { affected: 1 };
    }
  };
  const service = new IdentityDirectoryService(repository as never);

  await service.recordSuccessfulLogin(scope, "user-1", "127.0.0.1");

  assert.equal(updateCalls.length, 1);
  assert.deepEqual(updateCalls[0]?.[0], {
    id: "user-1",
    tenantId: scope.tenantId,
    isDeleted: false
  });
  const values = updateCalls[0]?.[1] as { lastLoginIp?: string; lastLoginTime?: unknown };
  assert.equal(values.lastLoginIp, "127.0.0.1");
  assert.ok(values.lastLoginTime instanceof Date);
});
