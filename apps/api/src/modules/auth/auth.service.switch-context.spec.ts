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
  } = {}
) {
  const updateCalls: unknown[] = [];
  const findOneCalls: unknown[] = [];
  const usersService = {
    resolveJwtPrincipal: async () => {
      if (options.targetLookupFails ?? true) {
        throw new NotFoundException("User not found");
      }
      return { ...currentUser, parkId: "20000002" };
    }
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
    }
  };

  const service = new AuthService(
    usersService as never,
    { signAsync: async () => "access-token" } as never,
    { get: (_key: string, fallback?: string) => fallback } as never,
    { recordLogin: async () => undefined } as never,
    { assertTenantActive: async () => undefined } as never,
    {} as never,
    refreshTokenRepository as never,
    {} as never,
    {} as never,
    {} as never
  );

  return { service, findOneCalls, updateCalls };
}

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
