import assert from "node:assert/strict";
import test from "node:test";
import { UnauthorizedException } from "@nestjs/common";
import type { EntityManager } from "typeorm";
import type { AuthRefreshTokenEntity } from "./entities/auth-refresh-token.entity";
import { SmartParkRefreshScopeWriter } from "./smart-park-refresh-scope-writer";

const scopeId = "00000000-0000-4000-8000-000000000010";
const userId = "00000000-0000-4000-8000-000000000001";
const tokenId = "00000000-0000-4000-8000-000000000020";

function token(overrides: Partial<AuthRefreshTokenEntity> = {}): AuthRefreshTokenEntity {
  return {
    tenantId: "tenant-a",
    parkId: "park-b",
    userId,
    tokenHash: "a".repeat(64),
    deviceId: null,
    userAgent: "unit-test",
    ipAddress: "127.0.0.1",
    expiresAt: new Date(Date.now() + 60_000),
    createBy: userId,
    updateBy: userId,
    ...overrides
  } as AuthRefreshTokenEntity;
}

function managerFixture(options: {
  canonicalRows?: unknown;
  updateRows?: unknown;
  saveResult?: AuthRefreshTokenEntity;
  queryErrorAt?: "canonical" | "update";
  saveError?: boolean;
  transactionActive?: boolean;
} = {}) {
  const queryCalls: Array<{ sql: string; params: unknown[] }> = [];
  const saveCalls: AuthRefreshTokenEntity[] = [];
  const manager = {
    queryRunner: { isTransactionActive: options.transactionActive ?? true },
    query: async (sql: string, params: unknown[]) => {
      queryCalls.push({ sql, params });
      if (sql.includes("SELECT scope.id")) {
        if (options.queryErrorAt === "canonical") throw new Error("raw canonical diagnostic");
        return options.canonicalRows ?? [{ scopeId, parkRowMatches: true }];
      }
      if (options.queryErrorAt === "update") throw new Error("raw update diagnostic");
      return options.updateRows ?? [{ id: tokenId }];
    },
    getRepository: () => ({
      save: async (value: AuthRefreshTokenEntity) => {
        saveCalls.push(value);
        if (options.saveError) throw new Error("raw save diagnostic");
        return options.saveResult ?? ({ ...value, id: tokenId } as AuthRefreshTokenEntity);
      }
    })
  } as unknown as EntityManager;
  return { manager, queryCalls, saveCalls };
}

const rejectsUnavailable = (promise: Promise<unknown>) =>
  assert.rejects(promise, { name: UnauthorizedException.name, message: "Refresh token scope unavailable" });

test("writer locks one canonical active scope, saves through the transaction manager, and binds exactly that new session", async () => {
  const fixture = managerFixture();
  await new SmartParkRefreshScopeWriter().persist(fixture.manager, token({ revoked: false, isDeleted: false }));

  assert.equal(fixture.queryCalls.length, 2);
  assert.equal(fixture.saveCalls.length, 1);
  const canonical = fixture.queryCalls[0]!;
  assert.deepEqual(canonical.params, ["tenant-a", "park-b", userId]);
  assert.match(canonical.sql, /tenant\.id = scope\.tenant_row_id/u);
  assert.match(canonical.sql, /tenant\.status = 1/u);
  assert.match(canonical.sql, /scope\.status = 'enabled'/u);
  assert.match(canonical.sql, /account\.is_enabled = true/u);
  assert.match(canonical.sql, /park\.is_deleted = false/u);
  assert.doesNotMatch(canonical.sql, /park\.status = 1\s+AND/u);
  assert.match(canonical.sql, /park\.id = binding\.park_row_id AND park\.status = 1/u);
  assert.match(canonical.sql, /FETCH FIRST 2 ROWS ONLY/u);
  assert.match(canonical.sql, /FOR SHARE OF binding, scope, tenant, park, account/u);
  assert.doesNotMatch(canonical.sql, /account\.(park_id|default_scope_id)/u);

  const update = fixture.queryCalls[1]!;
  assert.deepEqual(update.params, [scopeId, tokenId, "tenant-a", "park-b", userId, "a".repeat(64)]);
  assert.match(update.sql, /scope_id IS NULL/u);
  assert.match(update.sql, /revoked = false/u);
  assert.match(update.sql, /is_deleted = false/u);
  assert.match(update.sql, /RETURNING id/u);
});

test("writer rejects malformed identities, non-string hashes, preassigned ids, and inactive transactions before database access", async (t) => {
  const cases: Array<[string, Partial<AuthRefreshTokenEntity>, boolean?]> = [
    ["trimmed tenant", { tenantId: " tenant-a" }],
    ["invalid user", { userId: "not-a-uuid" }],
    ["non-string hash", { tokenHash: ["a".repeat(64)] as unknown as string }],
    ["uppercase hash", { tokenHash: "A".repeat(64) }],
    ["preassigned id", { id: tokenId }],
    ["revoked true", { revoked: true }],
    ["revoked string false", { revoked: "false" as unknown as boolean }],
    ["revoked null", { revoked: null as unknown as boolean }],
    ["deleted true", { isDeleted: true }],
    ["deleted string false", { isDeleted: "false" as unknown as boolean }],
    ["deleted null", { isDeleted: null as unknown as boolean }],
    ["inactive transaction", {}, false]
  ];
  for (const [name, override, transactionActive] of cases) {
    await t.test(name, async () => {
      const fixture = managerFixture({ transactionActive });
      await rejectsUnavailable(new SmartParkRefreshScopeWriter().persist(fixture.manager, token(override)));
      assert.equal(fixture.queryCalls.length, 0);
      assert.equal(fixture.saveCalls.length, 0);
    });
  }
});

test("writer accepts revoked and deleted only when omitted or explicitly false", async (t) => {
  for (const [name, flags] of [
    ["omitted", {}],
    ["false", { revoked: false, isDeleted: false }]
  ] as const) {
    await t.test(name, async () => {
      const fixture = managerFixture();
      await new SmartParkRefreshScopeWriter().persist(fixture.manager, token(flags));
      assert.equal(fixture.saveCalls.length, 1);
    });
  }
});

test("missing, duplicated, drifted, or disabled canonical park scope fails before token creation", async (t) => {
  const cases: Array<[string, unknown]> = [
    ["missing", []],
    ["duplicate", [{ scopeId, parkRowMatches: true }, { scopeId, parkRowMatches: false }]],
    ["binding drift", [{ scopeId, parkRowMatches: false }]],
    ["malformed scope", [{ scopeId: [scopeId], parkRowMatches: true }]]
  ];
  for (const [name, canonicalRows] of cases) {
    await t.test(name, async () => {
      const fixture = managerFixture({ canonicalRows });
      await rejectsUnavailable(new SmartParkRefreshScopeWriter().persist(fixture.manager, token()));
      assert.equal(fixture.saveCalls.length, 0);
      assert.equal(fixture.queryCalls.length, 1);
    });
  }
});

test("database query and save diagnostics are hidden behind one stable authorization failure", async (t) => {
  for (const options of [
    { queryErrorAt: "canonical" as const },
    { saveError: true },
    { queryErrorAt: "update" as const }
  ]) {
    await t.test(JSON.stringify(options), async () => {
      const fixture = managerFixture(options);
      await rejectsUnavailable(new SmartParkRefreshScopeWriter().persist(fixture.manager, token()));
    });
  }
});

test("scope update requires exactly one row with the generated token identity", async (t) => {
  for (const [name, updateRows] of [
    ["zero", []],
    ["multiple", [{ id: tokenId }, { id: tokenId }]],
    ["wrong id", [{ id: "00000000-0000-4000-8000-000000000099" }]],
    ["driver count mismatch", [[{ id: tokenId }], 2]]
  ] as const) {
    await t.test(name, async () => {
      const fixture = managerFixture({ updateRows });
      await rejectsUnavailable(new SmartParkRefreshScopeWriter().persist(fixture.manager, token()));
      assert.equal(fixture.saveCalls.length, 1);
    });
  }
});
