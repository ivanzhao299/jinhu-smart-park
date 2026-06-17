import assert from "node:assert/strict";
import test from "node:test";
import { UnauthorizedException } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { AuthService } from "./auth.service";
import type { LoginDto } from "./dto/login.dto";
import type { UserEntity } from "../users/entities/user.entity";

interface AuthServiceLockoutFixture {
  service: AuthService;
  usersService: {
    candidates: UserEntity[];
    recordPasswordFailureCalls: string[];
    clearPasswordFailuresCalls: string[];
    clearExpiredPasswordLockCalls: string[];
    lockoutTriggeredUserIds: Set<string>;
  };
  auditMessages: string[];
  auditRecords: Array<{ userId: string | null; tenantId: string; parkId: string; message: string | null }>;
}

async function makeUser(overrides: Partial<UserEntity> = {}): Promise<UserEntity> {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    tenantId: "10000001",
    parkId: "20000001",
    username: "admin",
    displayName: "Admin",
    passwordHash: await bcrypt.hash("Correct#2026", 4),
    mobile: null,
    email: null,
    avatarUrl: null,
    gender: null,
    lastLoginIp: null,
    lastLoginTime: null,
    isEnabled: true,
    status: "enabled",
    isDeleted: false,
    roleLinks: [],
    passwordFailedCount: 0,
    passwordFailedWindowStartedAt: null,
    passwordLockedUntil: null,
    lastPasswordFailedAt: null,
    ...overrides
  } as UserEntity;
}

function createFixture(candidates: UserEntity[], config: Record<string, string> = {}): AuthServiceLockoutFixture {
  const usersService = {
    candidates,
    recordPasswordFailureCalls: [] as string[],
    clearPasswordFailuresCalls: [] as string[],
    clearExpiredPasswordLockCalls: [] as string[],
    lockoutTriggeredUserIds: new Set<string>(),
    findLoginCandidatesByUsername: async () => candidates,
    findByUsernameInScope: async () => candidates[0] ?? null,
    recordPasswordFailure: async (user: UserEntity) => {
      usersService.recordPasswordFailureCalls.push(user.id);
      return { user, lockoutTriggered: usersService.lockoutTriggeredUserIds.has(user.id) };
    },
    clearPasswordFailures: async (userId: string) => {
      usersService.clearPasswordFailuresCalls.push(userId);
    },
    clearExpiredPasswordLockIfNeeded: async (user: UserEntity) => {
      usersService.clearExpiredPasswordLockCalls.push(user.id);
      return user.passwordLockedUntil && user.passwordLockedUntil.getTime() <= Date.now()
        ? ({ ...user, passwordFailedCount: 0, passwordFailedWindowStartedAt: null, passwordLockedUntil: null, lastPasswordFailedAt: null } as UserEntity)
        : user;
    },
    isPasswordLocked: (user: UserEntity, now: Date) => Boolean(user.passwordLockedUntil && user.passwordLockedUntil.getTime() > now.getTime()),
    recordSuccessfulLogin: async () => undefined
  };
  const auditMessages: string[] = [];
  const auditRecords: Array<{ userId: string | null; tenantId: string; parkId: string; message: string | null }> = [];
  const service = new AuthService(
    usersService as never,
    { signAsync: async () => "access-token" } as never,
    {
      get: (key: string, fallback?: string) => config[key] ?? fallback
    } as never,
    {
      recordLogin: async (input: { userId: string | null; tenantId: string; parkId: string; message: string | null }) => {
        auditMessages.push(input.message ?? "");
        auditRecords.push({
          userId: input.userId,
          tenantId: input.tenantId,
          parkId: input.parkId,
          message: input.message
        });
      }
    } as never,
    { assertTenantActive: async () => undefined } as never,
    { exists: async () => true, update: async () => undefined, save: async () => undefined, create: (value: unknown) => value } as never,
    { save: async () => undefined, create: (value: unknown) => value } as never,
    {} as never,
    {} as never,
    {} as never
  );

  return { service, usersService, auditMessages, auditRecords };
}

function loginDto(password: string, partial: Partial<LoginDto> = {}): LoginDto {
  return {
    username: "admin",
    password,
    tenantId: "10000001",
    parkId: "20000001",
    ...partial
  };
}

test("auth service records password failures for every unscoped candidate when password is wrong", async () => {
  const first = await makeUser({ id: "00000000-0000-0000-0000-000000000001", parkId: "20000001" });
  const second = await makeUser({ id: "00000000-0000-0000-0000-000000000002", parkId: "20000002" });
  const { service, usersService, auditMessages } = createFixture([first, second]);

  await assert.rejects(
    () => service.login(loginDto("Wrong#2026", { tenantId: undefined, parkId: undefined }), { ipAddress: "127.0.0.1", userAgent: null }),
    UnauthorizedException
  );

  assert.deepEqual(usersService.recordPasswordFailureCalls, [first.id, second.id]);
  assert.equal(auditMessages.at(-1), "Invalid username or password");
});

test("auth service audits the candidate that actually triggers password lockout", async () => {
  const first = await makeUser({ id: "00000000-0000-0000-0000-000000000001", parkId: "20000001" });
  const second = await makeUser({ id: "00000000-0000-0000-0000-000000000002", parkId: "20000002" });
  const { service, usersService, auditRecords } = createFixture([first, second]);
  usersService.lockoutTriggeredUserIds.add(second.id);

  await assert.rejects(
    () => service.login(loginDto("Wrong#2026", { tenantId: undefined, parkId: undefined }), { ipAddress: "127.0.0.1", userAgent: null }),
    UnauthorizedException
  );

  assert.deepEqual(usersService.recordPasswordFailureCalls, [first.id, second.id]);
  assert.deepEqual(
    auditRecords.filter((record) => record.message === "Password lockout triggered"),
    [
      {
        userId: second.id,
        tenantId: second.tenantId,
        parkId: second.parkId,
        message: "Password lockout triggered"
      }
    ]
  );
});

test("auth service does not create password failure state for unknown usernames", async () => {
  const { service, usersService, auditMessages } = createFixture([]);

  await assert.rejects(
    () => service.login(loginDto("Wrong#2026"), { ipAddress: "127.0.0.1", userAgent: null }),
    UnauthorizedException
  );

  assert.deepEqual(usersService.recordPasswordFailureCalls, []);
  assert.equal(auditMessages.at(-1), "Invalid username or password");
});

test("auth service rejects a correct password while the user is locked", async () => {
  const lockedUser = await makeUser({ passwordLockedUntil: new Date(Date.now() + 60_000) });
  const { service, usersService, auditMessages } = createFixture([lockedUser]);

  await assert.rejects(
    () => service.login(loginDto("Correct#2026"), { ipAddress: "127.0.0.1", userAgent: null }),
    UnauthorizedException
  );

  assert.deepEqual(usersService.clearPasswordFailuresCalls, []);
  assert.equal(auditMessages.at(-1), "Password lockout active");
});

test("auth service clears password failures after a successful login", async () => {
  const user = await makeUser({ passwordFailedCount: 2, passwordFailedWindowStartedAt: new Date(), lastPasswordFailedAt: new Date() });
  const { service, usersService, auditMessages } = createFixture([user]);

  const result = await service.login(loginDto("Correct#2026"), { ipAddress: "127.0.0.1", userAgent: null });

  assert.equal(result.accessToken, "access-token");
  assert.deepEqual(usersService.clearPasswordFailuresCalls, [user.id]);
  assert.equal(auditMessages.at(-1), "success");
});

test("auth service skips password failure state when lockout is disabled", async () => {
  const user = await makeUser();
  const { service, usersService } = createFixture([user], { AUTH_PASSWORD_LOCKOUT_ENABLED: "false" });

  await assert.rejects(
    () => service.login(loginDto("Wrong#2026"), { ipAddress: "127.0.0.1", userAgent: null }),
    UnauthorizedException
  );

  assert.deepEqual(usersService.recordPasswordFailureCalls, []);
});

test("auth service does not clear password failures for disabled users", async () => {
  const user = await makeUser({ isEnabled: false, status: "disabled", passwordFailedCount: 2, passwordFailedWindowStartedAt: new Date() });
  const { service, usersService, auditMessages } = createFixture([user]);

  await assert.rejects(
    () => service.login(loginDto("Correct#2026"), { ipAddress: "127.0.0.1", userAgent: null }),
    UnauthorizedException
  );

  assert.deepEqual(usersService.clearPasswordFailuresCalls, []);
  assert.equal(auditMessages.at(-1), "User is disabled");
});
