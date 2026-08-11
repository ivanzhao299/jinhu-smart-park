import assert from "node:assert/strict";
import test from "node:test";
import { DataScopeService } from "./data-scope.service";

test("org_and_children expands descendants inside the scoped query", async () => {
  const queryCalls: Array<{ sql: string; parameters: unknown[] }> = [];
  const rulesRepository = {
    query: async (sql: string, parameters: unknown[]) => {
      queryCalls.push({ sql, parameters });
      return [{ id: "00000000-0000-0000-0000-000000000001" }, { id: "00000000-0000-0000-0000-000000000002" }];
    }
  };
  const roleDataScopeRepository = {
    find: async () => [{ rule: { dimension: "org", scopeType: "org_and_children", scopeConfig: { orgIds: ["00000000-0000-0000-0000-000000000001"] }, status: "enabled", isDeleted: false } }]
  };
  const userRoleRepository = {
    find: async () => [{ roleId: "role-1", role: { isDeleted: false, isEnabled: true } }]
  };
  const service = new DataScopeService(rulesRepository as never, roleDataScopeRepository as never, {} as never, userRoleRepository as never);
  let applied: { sql?: string; values?: Record<string, string[]> } = {};
  const builder = {
    andWhere(sql: string, values?: Record<string, string[]>) { applied = { sql, values }; return this; }
  };
  await service.applyToQueryBuilder(
    builder as never,
    { tenantId: "tenant-1", parkId: "park-1" },
    { sub: "user-1", username: "user", realName: "User", tenantId: "tenant-1", parkId: "park-1", roles: [], permissions: [] },
    "org", "org"
  );
  assert.match(queryCalls[0]?.sql ?? "", /WITH RECURSIVE org_tree/);
  assert.deepEqual(queryCalls[0]?.parameters, ["tenant-1", "park-1", ["00000000-0000-0000-0000-000000000001"]]);
  assert.match(applied.sql ?? "", /org\.org_id IN/);
  assert.deepEqual(applied.values?.dataScopeIds_org, ["00000000-0000-0000-0000-000000000001", "00000000-0000-0000-0000-000000000002"]);
});

test("org_and_children with no roots denies access without running recursive SQL", async () => {
  let queryCount = 0;
  const service = new DataScopeService(
    { query: async () => { queryCount += 1; return []; } } as never,
    { find: async () => [{ rule: { dimension: "org", scopeType: "org_and_children", scopeConfig: {}, status: "enabled", isDeleted: false } }] } as never,
    {} as never,
    { find: async () => [{ roleId: "role-1", role: { isDeleted: false, isEnabled: true } }] } as never
  );
  let sql = "";
  const builder = { andWhere(value: string) { sql = value; return this; } };
  await service.applyToQueryBuilder(
    builder as never,
    { tenantId: "tenant-1", parkId: "park-1" },
    { sub: "user-1", username: "user", tenantId: "tenant-1", parkId: "park-1", roles: [], permissions: [] },
    "org", "org"
  );
  assert.equal(queryCount, 0);
  assert.equal(sql, "1 = 0");
});

test("org_and_children does not re-add a disabled or deleted root excluded by recursion", async () => {
  const rootId = "00000000-0000-0000-0000-000000000001";
  const service = new DataScopeService(
    { query: async () => [] } as never,
    { find: async () => [{ rule: { dimension: "org", scopeType: "org_and_children", scopeConfig: { orgIds: [rootId] }, status: "enabled", isDeleted: false } }] } as never,
    {} as never,
    { find: async () => [{ roleId: "role-1", role: { isDeleted: false, isEnabled: true } }] } as never
  );
  let sql = "";
  const builder = { andWhere(value: string) { sql = value; return this; } };
  await service.applyToQueryBuilder(
    builder as never,
    { tenantId: "tenant-1", parkId: "park-1" },
    { sub: "user-1", username: "user", tenantId: "tenant-1", parkId: "park-1", roles: [], permissions: [] },
    "org", "org"
  );
  assert.equal(sql, "1 = 0");
});
