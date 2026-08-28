import assert from "node:assert/strict";
import test from "node:test";
import { NotFoundException } from "@nestjs/common";
import { AuthService } from "./auth.service";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";

const currentUser: JwtPrincipal = {
  sub: "00000000-0000-0000-0000-000000000001",
  username: "admin",
  tenantId: "10000001",
  parkId: "20000001",
  roles: ["TENANT_ADMIN"],
  permissions: ["system:user:me"],
  dataScope: "all",
  isSuper: false
};

function createServiceFixture(
  options: {
    targetLookupFails?: boolean;
    claimAffected?: number;
    activeTokenFound?: boolean;
    revokedTokenFound?: boolean;
    targetIsTenantSuper?: boolean;
  } = {}
) {
  const updateCalls: unknown[] = [];
  const findOneCalls: unknown[] = [];
  const operationAuditCalls: unknown[] = [];
  const usersService = {
    resolveJwtPrincipal: async () => {
      if (options.targetLookupFails ?? true) {
        throw new NotFoundException("User not found");
      }
      return {
        ...currentUser,
        parkId: "20000002",
        roles: options.targetIsTenantSuper ? ["SUPER_ADMIN"] : currentUser.roles,
        permissions: options.targetIsTenantSuper ? ["*"] : currentUser.permissions,
        isSuper: options.targetIsTenantSuper ?? false,
        isTenantSuper: options.targetIsTenantSuper ?? false
      };
    },
    findByIdForIdentity: async () => ({
      avatarUrl: null,
      gender: null,
      authVersion: 1
    }),
    recordSuccessfulLogin: async () => undefined
  };
  const refreshTokenRepository = {
    findOne: async (query: { where?: { revoked?: boolean } }) => {
      findOneCalls.push(query);
      if (query.where?.revoked === true) {
        return options.revokedTokenFound
          ? {
              id: "refresh-token-id",
              tenantId: currentUser.tenantId,
              parkId: currentUser.parkId,
              userId: currentUser.sub,
              revoked: true,
              isDeleted: false
            }
          : null;
      }
      if (options.activeTokenFound === false) return null;
      return {
        id: "refresh-token-id",
        tenantId: currentUser.tenantId,
        parkId: currentUser.parkId,
        userId: currentUser.sub,
        revoked: false,
        isDeleted: false
      };
    },
    update: async (...args: unknown[]) => {
      updateCalls.push(args);
      return { affected: options.claimAffected ?? 1 };
    },
    create: (input: unknown) => input,
    save: async (input: unknown) => input
  };

  const service = new AuthService(
    usersService as never,
    { signAsync: async () => "access-token" } as never,
    { get: (_key: string, fallback?: string) => fallback } as never,
    {
      recordLogin: async () => undefined,
      recordOperation: async (input: unknown) => {
        operationAuditCalls.push(input);
      }
    } as never,
    { assertTenantActive: async () => undefined } as never,
    {} as never,
    refreshTokenRepository as never,
    {} as never,
    {} as never,
    {} as never
  );

  return { service, findOneCalls, updateCalls, operationAuditCalls };
}

test("switch context records protected tenant-super activation in the target scope", async () => {
  const { service, operationAuditCalls } = createServiceFixture({
    targetLookupFails: false,
    targetIsTenantSuper: true
  });

  await service.switchContext(
    currentUser,
    "20000002",
    "current-refresh-token",
    { ipAddress: "127.0.0.1", userAgent: "node-test", requestId: "request-id" }
  );

  assert.equal(operationAuditCalls.length, 1);
  assert.deepEqual(operationAuditCalls[0], {
    tenantId: currentUser.tenantId,
    parkId: "20000002",
    userId: currentUser.sub,
    username: currentUser.username,
    realName: null,
    roleCodes: ["SUPER_ADMIN"],
    module: "auth",
    resource: "tenant-super-context",
    action: "tenant_super_context_activated",
    bizType: "tenant_super_context",
    bizId: currentUser.sub,
    beforeJson: { tenantId: currentUser.tenantId, parkId: currentUser.parkId },
    afterJson: { tenantId: currentUser.tenantId, parkId: "20000002", identity: "SUPER_ADMIN" },
    clientIp: "127.0.0.1",
    clientUa: "node-test",
    method: "POST",
    path: "/auth/switch-context",
    success: true,
    requestId: "request-id"
  });
});

test("switch context does not record tenant-super activation for a park-local principal", async () => {
  const { service, operationAuditCalls } = createServiceFixture({ targetLookupFails: false });

  await service.switchContext(
    currentUser,
    "20000002",
    "current-refresh-token",
    { ipAddress: "127.0.0.1", userAgent: "node-test" }
  );

  assert.deepEqual(operationAuditCalls, []);
});

test("switch context leaves target lookup failures ambiguous without a refresh-token row lock", async () => {
  const { service, updateCalls } = createServiceFixture({ targetLookupFails: true });

  await assert.rejects(
    service.switchContext(
      currentUser,
      "20000002",
      "current-refresh-token",
      { ipAddress: "127.0.0.1", userAgent: "node-test" }
    ),
    { name: "UnauthorizedException" }
  );

  assert.deepEqual(updateCalls, []);
});

test("switch context leaves refresh-token claim conflicts ambiguous", async () => {
  const { service, updateCalls } = createServiceFixture({ targetLookupFails: false, claimAffected: 0 });

  await assert.rejects(
    service.switchContext(
      currentUser,
      "20000002",
      "current-refresh-token",
      { ipAddress: "127.0.0.1", userAgent: "node-test" }
    ),
    { name: "UnauthorizedException" }
  );

  assert.equal(updateCalls.length, 1);
});

test("switch context leaves already-revoked matching tokens ambiguous", async () => {
  const { service, findOneCalls, updateCalls } = createServiceFixture({
    activeTokenFound: false,
    revokedTokenFound: true,
    targetLookupFails: false
  });

  await assert.rejects(
    service.switchContext(
      currentUser,
      "20000002",
      "current-refresh-token",
      { ipAddress: "127.0.0.1", userAgent: "node-test" }
    ),
    { name: "UnauthorizedException" }
  );

  assert.deepEqual(findOneCalls.map((call) => (call as { where?: { revoked?: boolean } }).where?.revoked), [false, true]);
  assert.deepEqual(updateCalls, []);
});
