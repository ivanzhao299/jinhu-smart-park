import assert from "node:assert/strict";
import test from "node:test";
import { DataScopeService } from "./data-scope.service";

test("org_and_children expands descendants inside the scoped query", async () => {
  const queryCalls: Array<{ sql: string; parameters: unknown[] }> = [];
  const roleLinkWhere: unknown[] = [];
  const ruleLinkWhere: unknown[] = [];
  const rulesRepository = {
    query: async (sql: string, parameters: unknown[]) => {
      queryCalls.push({ sql, parameters });
      return [{ id: "00000000-0000-0000-0000-000000000001" }, { id: "00000000-0000-0000-0000-000000000002" }];
    }
  };
  const roleDataScopeRepository = {
    find: async (options: { where: unknown }) => {
      ruleLinkWhere.push(options.where);
      return [
        {
          rule: {
            tenantId: "tenant-1",
            parkId: "park-1",
            dimension: "org",
            scopeType: "org_and_children",
            scopeConfig: { orgIds: ["00000000-0000-0000-0000-000000000001"] },
            status: "enabled",
            isDeleted: false
          }
        }
      ];
    }
  };
  const userRoleRepository = {
    find: async (options: { where: unknown }) => {
      roleLinkWhere.push(options.where);
      return [
        {
          roleId: "role-1",
          role: {
            tenantId: "tenant-1",
            parkId: "park-1",
            roleScope: "tenant",
            isDeleted: false,
            isEnabled: true
          }
        }
      ];
    }
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
  assert.deepEqual(roleLinkWhere[0], { tenantId: "tenant-1", parkId: "park-1", userId: "user-1", isDeleted: false });
  assert.equal((ruleLinkWhere[0] as { parkId?: string }).parkId, "park-1");
});

test("org_and_children with no roots denies access without running recursive SQL", async () => {
  let queryCount = 0;
  const service = new DataScopeService(
    { query: async () => { queryCount += 1; return []; } } as never,
    {
      find: async () => [
        {
          rule: {
            tenantId: "tenant-1",
            parkId: "park-1",
            dimension: "org",
            scopeType: "org_and_children",
            scopeConfig: {},
            status: "enabled",
            isDeleted: false
          }
        }
      ]
    } as never,
    {} as never,
    {
      find: async () => [
        {
          roleId: "role-1",
          role: {
            tenantId: "tenant-1",
            parkId: "park-1",
            roleScope: "tenant",
            isDeleted: false,
            isEnabled: true
          }
        }
      ]
    } as never
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
    {
      find: async () => [
        {
          rule: {
            tenantId: "tenant-1",
            parkId: "park-1",
            dimension: "org",
            scopeType: "org_and_children",
            scopeConfig: { orgIds: [rootId] },
            status: "enabled",
            isDeleted: false
          }
        }
      ]
    } as never,
    {} as never,
    {
      find: async () => [
        {
          roleId: "role-1",
          role: {
            tenantId: "tenant-1",
            parkId: "park-1",
            roleScope: "tenant",
            isDeleted: false,
            isEnabled: true
          }
        }
      ]
    } as never
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

test("shared tenant role data-scope assignments update only the caller park", async () => {
  let roleWhere: unknown;
  let ruleWhere: unknown;
  let linkUpdateWhere: unknown;
  const service = new DataScopeService(
    {
      find: async (options: { where: unknown }) => {
        ruleWhere = options.where;
        return [{ id: "rule-b" }];
      }
    } as never,
    {
      update: async (where: unknown) => {
        linkUpdateWhere = where;
      },
      create: (value: unknown) => value,
      save: async (value: unknown) => value
    } as never,
    {
      findOne: async (options: { where: unknown }) => {
        roleWhere = options.where;
        return { id: "role-1", roleScope: "tenant" };
      }
    } as never,
    {} as never
  );

  await service.assignRoleRules(
    { tenantId: "tenant-a", parkId: "park-b" },
    "actor-1",
    "role-1",
    { ruleIds: ["rule-b"] }
  );

  assert.deepEqual(roleWhere, [
    { id: "role-1", tenantId: "tenant-a", roleScope: "tenant", isDeleted: false },
    { id: "role-1", tenantId: "tenant-a", parkId: "park-b", roleScope: "park", isDeleted: false }
  ]);
  assert.equal((ruleWhere as { parkId?: string }).parkId, "park-b");
  assert.deepEqual(linkUpdateWhere, {
    tenantId: "tenant-a",
    parkId: "park-b",
    roleId: "role-1",
    isDeleted: false
  });
});
