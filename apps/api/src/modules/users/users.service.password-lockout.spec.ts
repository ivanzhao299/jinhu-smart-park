import assert from "node:assert/strict";
import test from "node:test";
import * as bcrypt from "bcrypt";
import { normalizePasswordLockoutConfig } from "../auth/auth-password-lockout.policy";
import { UsersService } from "./users.service";
import type { UserEntity } from "./entities/user.entity";

function makeUser(overrides: Partial<UserEntity> = {}): UserEntity {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    tenantId: "10000001",
    parkId: "20000001",
    username: "admin",
    displayName: "Admin",
    passwordHash: "old-hash",
    mobile: null,
    email: null,
    avatarUrl: null,
    gender: null,
    lastLoginIp: null,
    lastLoginTime: null,
    isEnabled: true,
    status: "enabled",
    isDeleted: false,
    passwordFailedCount: 0,
    passwordFailedWindowStartedAt: null,
    passwordLockedUntil: null,
    lastPasswordFailedAt: null,
    roleLinks: [],
    ...overrides
  } as UserEntity;
}

function createUsersService(usersRepository: unknown, config: Record<string, string> = {}): UsersService {
  return new UsersService(
    usersRepository as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {
      get: (key: string, fallback?: string) => config[key] ?? fallback
    } as never
  );
}

test("users service records password failures from the locked latest row state", async () => {
  const now = new Date("2026-06-17T08:00:00.000Z");
  const staleUser = makeUser({ passwordFailedCount: 0 });
  const latestUser = makeUser({
    passwordFailedCount: 4,
    passwordFailedWindowStartedAt: new Date(now.getTime() - 30_000)
  });
  let capturedLockMode: string | undefined;
  const savedUsers: UserEntity[] = [];
  const repository = {
    manager: {
      transaction: async (callback: (manager: unknown) => Promise<unknown>) =>
        callback({
          getRepository: () => ({
            findOne: async (options: { lock?: { mode?: string } }) => {
              capturedLockMode = options.lock?.mode;
              return latestUser;
            },
            save: async (user: UserEntity) => {
              savedUsers.push(user);
              return user;
            }
          })
        })
    }
  };
  const service = createUsersService(repository);
  const config = normalizePasswordLockoutConfig({
    enabled: true,
    failureLimit: 5,
    windowMs: 15 * 60 * 1000,
    durationMs: 15 * 60 * 1000
  });

  const result = await service.recordPasswordFailure(staleUser, config, now);

  assert.equal(capturedLockMode, "pessimistic_write");
  const savedUser = savedUsers[0]!;
  assert.equal(savedUser.passwordFailedCount, 5);
  assert.equal(result.lockoutTriggered, true);
  assert.equal(result.user.id, latestUser.id);
  assert.ok(result.user.passwordLockedUntil);
});

test("users service reset password clears password lockout state", async () => {
  const lockedUser = makeUser({
    passwordFailedCount: 5,
    passwordFailedWindowStartedAt: new Date("2026-06-17T07:55:00.000Z"),
    passwordLockedUntil: new Date("2026-06-17T08:15:00.000Z"),
    lastPasswordFailedAt: new Date("2026-06-17T08:00:00.000Z")
  });
  const savedUsers: UserEntity[] = [];
  const repository = {
    findOne: async () => lockedUser,
    save: async (user: UserEntity) => {
      savedUsers.push(user);
      return user;
    }
  };
  const service = createUsersService(repository, { BCRYPT_SALT_ROUNDS: "4" });

  await service.resetPassword({ tenantId: lockedUser.tenantId, parkId: lockedUser.parkId }, "actor-1", lockedUser.id, {
    password: "NewPassword#2026"
  });

  const savedUser = savedUsers[0]!;
  assert.equal(savedUser.passwordFailedCount, 0);
  assert.equal(savedUser.passwordFailedWindowStartedAt, null);
  assert.equal(savedUser.passwordLockedUntil, null);
  assert.equal(savedUser.lastPasswordFailedAt, null);
  assert.equal(await bcrypt.compare("NewPassword#2026", savedUser.passwordHash), true);
});
