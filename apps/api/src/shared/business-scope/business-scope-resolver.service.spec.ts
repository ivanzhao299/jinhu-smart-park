import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import type { DataSource } from "typeorm";
import type { BusinessScopeParkAdapter } from "./business-scope-park-adapter";
import { BusinessScopeResolverService } from "./business-scope-resolver.service";

const TENANT = "tenant-alpha";
const USER = "00000000-0000-0000-0000-000000000001";
const SCOPE = "00000000-0000-0000-0000-000000000002";

function dataSourceReturning(rows: unknown) {
  const calls: Array<{ sql: string; parameters: unknown[] }> = [];
  const dataSource = {
    query: async (sql: string, parameters: unknown[]) => {
      calls.push({ sql, parameters });
      if (rows instanceof Error) throw rows;
      return rows;
    }
  } as unknown as DataSource;
  return { dataSource, calls };
}

test("resolves one authorized enterprise row with a read-only bound query", async () => {
  const fixture = dataSourceReturning([{ tenantId: TENANT, scopeId: SCOPE, scopeKind: "enterprise" }]);
  const service = new BusinessScopeResolverService(fixture.dataSource);

  assert.deepEqual(
    await service.resolveForUser({
      tenantId: TENANT,
      userId: USER,
      scopeId: SCOPE,
      requiredModuleCode: "hr"
    }),
    { tenantId: TENANT, scopeId: SCOPE, kind: "enterprise", parkId: null }
  );
  assert.equal(fixture.calls.length, 1);
  const call = fixture.calls[0];
  assert.ok(call);
  assert.deepEqual(call.parameters, [TENANT, USER, SCOPE, "hr"]);
  assert.doesNotMatch(call.sql, /\b(?:insert|update|delete|merge|truncate|alter|drop|create)\b/iu);
  assert.match(call.sql, /tenant\.status = 1/u);
  assert.match(call.sql, /app_user\.is_enabled = true/u);
  assert.match(call.sql, /app_user\.status = 'enabled'/u);
  assert.match(call.sql, /membership\.status = 'enabled'/u);
  assert.match(call.sql, /scope_module\.status = 'enabled'/u);
  assert.match(call.sql, /FETCH FIRST 2 ROWS ONLY/u);
});

test("does not query malformed or client-normalized identities", async () => {
  const fixture = dataSourceReturning([]);
  const service = new BusinessScopeResolverService(fixture.dataSource);

  assert.equal(
    await service.resolveForUser({ tenantId: ` ${TENANT}`, userId: USER, scopeId: SCOPE, requiredModuleCode: "hr" }),
    null
  );
  assert.equal(
    await service.resolveForUser({ tenantId: TENANT, userId: "not-a-uuid", scopeId: SCOPE, requiredModuleCode: "HR" }),
    null
  );
  assert.equal(fixture.calls.length, 0);
});

test("fails closed for zero, ambiguous, malformed, mismatched, or failed query results", async () => {
  const fixtures: unknown[] = [
    [],
    [
      { tenantId: TENANT, scopeId: SCOPE, scopeKind: "enterprise" },
      { tenantId: TENANT, scopeId: SCOPE, scopeKind: "enterprise" }
    ],
    [{ tenantId: TENANT, scopeId: SCOPE, scopeKind: "unknown" }],
    [{ tenantId: "tenant-other", scopeId: SCOPE, scopeKind: "enterprise" }],
    [{ tenantId: TENANT, scopeId: "00000000-0000-0000-0000-000000000003", scopeKind: "enterprise" }],
    new Error("synthetic database failure")
  ];

  for (const rows of fixtures) {
    const service = new BusinessScopeResolverService(dataSourceReturning(rows).dataSource);
    assert.equal(
      await service.resolveForUser({ tenantId: TENANT, userId: USER, scopeId: SCOPE, requiredModuleCode: "hr" }),
      null
    );
  }
});

test("park resolution requires an adapter and allowlists its result", async () => {
  const rows = [{ tenantId: TENANT, scopeId: SCOPE, scopeKind: "park" }];
  const withoutAdapter = new BusinessScopeResolverService(dataSourceReturning(rows).dataSource);
  assert.equal(
    await withoutAdapter.resolveForUser({ tenantId: TENANT, userId: USER, scopeId: SCOPE, requiredModuleCode: "hr" }),
    null
  );

  const adapter: BusinessScopeParkAdapter = {
    resolveParkScope: async () => ({
      tenantId: TENANT,
      scopeId: SCOPE,
      kind: "park",
      parkId: "park-real-binding",
      internalValue: "must-not-leak"
    } as never)
  };
  const service = new BusinessScopeResolverService(dataSourceReturning(rows).dataSource, adapter);
  assert.deepEqual(
    await service.resolveForUser({ tenantId: TENANT, userId: USER, scopeId: SCOPE, requiredModuleCode: "hr" }),
    { tenantId: TENANT, scopeId: SCOPE, kind: "park", parkId: "park-real-binding" }
  );
});

test("park adapter mismatch or exception fails closed", async () => {
  const rows = [{ tenantId: TENANT, scopeId: SCOPE, scopeKind: "park" }];
  const adapters: BusinessScopeParkAdapter[] = [
    { resolveParkScope: async () => ({ tenantId: "tenant-other", scopeId: SCOPE, kind: "park", parkId: "p" }) },
    { resolveParkScope: async () => ({ tenantId: TENANT, scopeId: SCOPE, kind: "park", parkId: "" }) },
    { resolveParkScope: async () => { throw new Error("synthetic adapter failure"); } }
  ];
  for (const adapter of adapters) {
    const service = new BusinessScopeResolverService(dataSourceReturning(rows).dataSource, adapter);
    assert.equal(
      await service.resolveForUser({ tenantId: TENANT, userId: USER, scopeId: SCOPE, requiredModuleCode: "hr" }),
      null
    );
  }
});
