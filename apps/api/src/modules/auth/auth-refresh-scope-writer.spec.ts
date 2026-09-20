import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { MODULE_METADATA } from "@nestjs/common/constants";
import { UnauthorizedException } from "@nestjs/common";
import type { EntityManager } from "typeorm";
import { AUTH_REFRESH_SCOPE_WRITER, type AuthRefreshScopeWriter } from "./auth-refresh-scope-writer";
import { AuthModule } from "./auth.module";
import { AuthService, type LoginRequestMeta } from "./auth.service";
import type { AuthRefreshTokenEntity } from "./entities/auth-refresh-token.entity";
import { SmartParkRefreshScopeWriter } from "./smart-park-refresh-scope-writer";

const principal = {
  sub: "00000000-0000-4000-8000-000000000001",
  tenantId: "tenant-a",
  parkId: "park-b"
};
const meta: LoginRequestMeta = { ipAddress: "127.0.0.1", userAgent: "unit-test" };

function createServiceFixture(options: {
  writer?: AuthRefreshScopeWriter;
  transaction?: (work: (manager: EntityManager) => Promise<void>) => Promise<void>;
} = {}) {
  const saved: AuthRefreshTokenEntity[] = [];
  const manager = { marker: "transaction-manager" } as unknown as EntityManager;
  const transactionCalls: Array<(manager: EntityManager) => Promise<void>> = [];
  const repository = {
    create: (value: Partial<AuthRefreshTokenEntity>) => value as AuthRefreshTokenEntity,
    save: async (value: AuthRefreshTokenEntity) => {
      saved.push(value);
      return value;
    },
    manager: {
      transaction: async (work: (manager: EntityManager) => Promise<void>) => {
        transactionCalls.push(work);
        if (options.transaction) return options.transaction(work);
        return work(manager);
      }
    }
  };
  const service = new AuthService(
    {} as never,
    {} as never,
    { get: (_key: string, fallback?: string) => fallback } as never,
    {} as never,
    {} as never,
    {} as never,
    repository as never,
    {} as never,
    {} as never,
    {} as never,
    options.writer
  );
  const invoke = () =>
    (service as unknown as {
      createScopedRefreshToken(user: typeof principal, requestMeta: LoginRequestMeta): Promise<string>;
    }).createScopedRefreshToken(principal, meta);
  return { invoke, manager, repository, saved, transactionCalls };
}

test("AuthModule keeps refresh scope transition absent by default and enables it only through the dynamic module", () => {
  const defaultProviders = (Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AuthModule) ?? []) as unknown[];
  assert.equal(defaultProviders.includes(AUTH_REFRESH_SCOPE_WRITER), false);
  assert.equal(defaultProviders.includes(SmartParkRefreshScopeWriter), false);

  const dynamic = AuthModule.withParkScopeTransition();
  assert.equal(dynamic.module, AuthModule);
  assert.deepEqual(dynamic.providers, [
    SmartParkRefreshScopeWriter,
    { provide: AUTH_REFRESH_SCOPE_WRITER, useExisting: SmartParkRefreshScopeWriter }
  ]);
});

test("default refresh token creation retains legacy save and does not access transaction scope schema", async () => {
  const fixture = createServiceFixture();
  const rawToken = await fixture.invoke();
  assert.match(rawToken, /^[0-9a-f]{96}$/u);
  assert.equal(fixture.saved.length, 1);
  assert.equal(fixture.transactionCalls.length, 0);
});

test("opt-in refresh token creation supplies the exact transaction manager and never uses legacy save", async () => {
  const received: Array<{ manager: EntityManager; token: AuthRefreshTokenEntity }> = [];
  const writer: AuthRefreshScopeWriter = {
    persist: async (manager, token) => {
      received.push({ manager, token });
    }
  };
  const fixture = createServiceFixture({ writer });
  const rawToken = await fixture.invoke();
  assert.match(rawToken, /^[0-9a-f]{96}$/u);
  assert.equal(fixture.transactionCalls.length, 1);
  assert.equal(received.length, 1);
  assert.equal(received[0]?.manager, fixture.manager);
  assert.equal(received[0]?.token.tenantId, principal.tenantId);
  assert.equal(received[0]?.token.parkId, principal.parkId);
  assert.equal(fixture.saved.length, 0);
});

test("opt-in begin, callback, and commit failures become the same 401 without legacy fallback", async (t) => {
  const expected = { name: UnauthorizedException.name, message: "Refresh token scope unavailable" };

  await t.test("begin failure", async () => {
    const fixture = createServiceFixture({
      writer: { persist: async () => undefined },
      transaction: async () => {
        throw new Error("begin diagnostic");
      }
    });
    await assert.rejects(fixture.invoke, expected);
    assert.equal(fixture.saved.length, 0);
  });

  await t.test("callback failure", async () => {
    const fixture = createServiceFixture({
      writer: {
        persist: async () => {
          throw new Error("callback diagnostic");
        }
      }
    });
    await assert.rejects(fixture.invoke, expected);
    assert.equal(fixture.saved.length, 0);
  });

  await t.test("commit failure", async () => {
    const transactionManager = { marker: "commit-manager" } as unknown as EntityManager;
    const fixture = createServiceFixture({
      writer: { persist: async () => undefined },
      transaction: async (work) => {
        await work(transactionManager);
        throw new Error("commit diagnostic");
      }
    });
    await assert.rejects(fixture.invoke, expected);
    assert.equal(fixture.saved.length, 0);
  });
});
