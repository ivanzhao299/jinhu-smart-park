import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import * as bcrypt from "bcrypt";
import { SYSTEM_PERMISSIONS } from "@jinhu/shared";
import { PERMISSIONS_KEY } from "../../shared/decorators/permissions.decorator";
import { AUDIT_LOG_KEY } from "../audit/decorators/audit-log.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { AuthRefreshTokenEntity } from "./entities/auth-refresh-token.entity";
import { UserEntity } from "../users/entities/user.entity";

const actor = {
  sub: "00000000-0000-0000-0000-000000000001",
  username: "employee",
  tenantId: "tenant-1",
  parkId: "park-1",
  roles: [],
  permissions: [SYSTEM_PERMISSIONS.USER_ME],
  authVersion: 1
} as JwtPrincipal;

async function fixture(currentPassword = "old-password") {
  const user = {
    id: actor.sub,
    tenantId: actor.tenantId,
    parkId: actor.parkId,
    passwordHash: await bcrypt.hash(currentPassword, 4),
    authVersion: 1,
    isEnabled: true,
    status: "enabled",
    isDeleted: false,
    passwordFailedCount: 2,
    passwordFailedWindowStartedAt: new Date(),
    passwordLockedUntil: new Date(),
    lastPasswordFailedAt: new Date(),
    updateBy: null
  };
  const saved: unknown[] = [];
  const revoked: unknown[] = [];
  const requestedEntities: unknown[] = [];
  const manager = {
    getRepository: (entity: unknown) => {
      requestedEntities.push(entity);
      return entity === UserEntity
        ? { findOne: async () => user, save: async (value: unknown) => { saved.push(value); return value; } }
        : { update: async (...args: unknown[]) => { revoked.push(args); return { affected: 2 }; } };
    }
  };
  const refreshTokenRepository = { manager: { transaction: async (callback: (value: typeof manager) => Promise<void>) => callback(manager) } };
  const service = new AuthService(
    {} as never,
    {} as never,
    { get: (key: string, fallback?: string) => key === "BCRYPT_SALT_ROUNDS" ? "4" : fallback } as never,
    {} as never,
    {} as never,
    {} as never,
    refreshTokenRepository as never,
    {} as never,
    {} as never,
    {} as never
  );
  return { service, user, saved, revoked, requestedEntities };
}

test("self password change verifies the current secret and atomically revokes every refresh session", async () => {
  const { service, user, saved, revoked, requestedEntities } = await fixture();
  assert.deepEqual(
    await service.changeOwnPassword(actor, { currentPassword: "old-password", newPassword: "new-password-123" }),
    { userId: actor.sub, reauthenticate: true }
  );
  assert.equal(saved.length, 1);
  assert.equal(await bcrypt.compare("new-password-123", user.passwordHash), true);
  assert.equal(user.authVersion, 2);
  assert.equal(user.passwordFailedCount, 0);
  assert.equal(user.passwordLockedUntil, null);
  assert.equal(revoked.length, 1);
  assert.equal((revoked[0] as unknown[])[0] instanceof Object, true);
  assert.deepEqual(requestedEntities, [UserEntity, AuthRefreshTokenEntity]);
});

test("wrong or reused current passwords fail before password and session mutation", async () => {
  const wrong = await fixture();
  await assert.rejects(
    wrong.service.changeOwnPassword(actor, { currentPassword: "wrong-password", newPassword: "new-password-123" }),
    /Current password is incorrect/u
  );
  assert.equal(wrong.saved.length, 0);
  assert.equal(wrong.revoked.length, 0);
  const reused = await fixture();
  await assert.rejects(
    reused.service.changeOwnPassword(actor, { currentPassword: "old-password", newPassword: "old-password" }),
    /must be different/u
  );
  assert.equal(reused.saved.length, 0);
  assert.equal(reused.revoked.length, 0);
});

test("password-change route uses authenticated self permission and capture-body-free audit", () => {
  assert.deepEqual(Reflect.getMetadata(PERMISSIONS_KEY, AuthController.prototype.changePassword), [SYSTEM_PERMISSIONS.USER_ME]);
  assert.equal(Reflect.getMetadata(AUDIT_LOG_KEY, AuthController.prototype.changePassword).captureBody, false);
  assert.ok(Reflect.getMetadata("__interceptors__", AuthController.prototype.changePassword)?.length);
});
