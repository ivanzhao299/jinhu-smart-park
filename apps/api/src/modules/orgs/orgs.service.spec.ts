import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException } from "@nestjs/common";
import { OrgsService } from "./orgs.service";
import { OrgEntity } from "./entities/org.entity";
import { UserOrgEntity } from "./entities/user-org.entity";
import { UserEntity } from "../users/entities/user.entity";

const scope = { tenantId: "tenant-1", parkId: "park-1" };

function makeOrg(id: string, parentId: string | null, sortOrder: number, orgName = id) {
  return {
    id, parentId, sortOrder, orgName, orgCode: id, orgType: "department", leaderUserId: null,
    status: "enabled", tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false,
    createTime: new Date(), updateTime: new Date(), createBy: null, updateBy: null, version: 1, remark: null, userLinks: []
  };
}

function createService(
  orgs: ReturnType<typeof makeOrg>[],
  options: {
    childCount?: number;
    userCount?: number;
    lockCalls?: Array<{ sql: string; parameters: unknown[] }>;
    treeWhere?: unknown;
    orgFindOptions?: unknown[];
    leaderFindOptions?: unknown[];
    userOrgCountWhere?: unknown[];
  } = {}
) {
  const byId = new Map(orgs.map((org) => [org.id, org]));
  const orgRepository: Record<string, unknown> = {
    find: async (findOptions: unknown) => {
      options.orgFindOptions?.push(findOptions);
      return [...orgs].sort((a, b) => a.sortOrder - b.sortOrder || a.orgName.localeCompare(b.orgName));
    },
    findOne: async ({ where }: { where: { id: string } }) => byId.get(where.id) ?? null,
    findAndCount: async () => [[], 0], exists: async () => false, count: async () => options.childCount ?? 0,
    create: (value: unknown) => value, save: async (value: unknown) => value
  };
  const userOrgRepository = {
    count: async (countOptions: { where: unknown }) => {
      options.userOrgCountWhere?.push(countOptions.where);
      return options.userCount ?? 0;
    }
  };
  const userRepository = {
    find: async (findOptions: unknown) => {
      options.leaderFindOptions?.push(findOptions);
      return [];
    },
    exists: async () => true
  };
  interface MockManager {
    query(sql: string, parameters: unknown[]): Promise<void>;
    getRepository(entity: unknown): unknown;
    transaction(callback: (transactionManager: MockManager) => unknown): Promise<unknown>;
  }
  const manager: MockManager = {
    query: async (sql: string, parameters: unknown[]) => { options.lockCalls?.push({ sql, parameters }); },
    getRepository: (entity: unknown) => {
      if (entity === OrgEntity) return orgRepository;
      if (entity === UserOrgEntity) return userOrgRepository;
      if (entity === UserEntity) return userRepository;
      throw new Error("Unexpected repository");
    },
    transaction: async (callback) => callback(manager)
  };
  orgRepository.manager = manager;
  return new OrgsService(
    orgRepository as never,
    { find: async () => [] } as never,
    userOrgRepository as never,
    userRepository as never,
    { buildFindWhere: async (_scope: unknown, _actor: unknown, _dimension: unknown, where: unknown) => options.treeWhere ?? where } as never
  );
}

test("tree builds and sorts a three-level hierarchy", async () => {
  const service = createService([
    makeOrg("grandchild", "child", 30), makeOrg("root", null, 10), makeOrg("child", "root", 20)
  ]);
  const tree = await service.tree(scope);
  assert.equal(tree[0]?.id, "root");
  assert.equal(tree[0]?.children[0]?.id, "child");
  assert.equal(tree[0]?.children[0]?.children[0]?.id, "grandchild");
});

test("update rejects a parent that creates a cycle", async () => {
  const root = makeOrg("root", null, 10);
  const child = makeOrg("child", "root", 20);
  const service = createService([root, child]);
  await assert.rejects(() => service.update(scope, "actor", "root", { parentId: "child" }), BadRequestException);
});

test("delete rejects an organization with active children", async () => {
  const root = makeOrg("root", null, 10);
  const service = createService([root], { childCount: 1 });
  await assert.rejects(() => service.softDelete(scope, "actor", "root"), BadRequestException);
});

test("update rejects self, missing and disabled parents", async () => {
  const root = makeOrg("root", null, 10);
  const disabled = { ...makeOrg("disabled", null, 20), status: "disabled" };
  const service = createService([root, disabled]);
  await assert.rejects(() => service.update(scope, "actor", "root", { parentId: "root" }), BadRequestException);
  await assert.rejects(() => service.update(scope, "actor", "root", { parentId: "missing" }), BadRequestException);
  await assert.rejects(() => service.update(scope, "actor", "root", { parentId: "disabled" }), BadRequestException);
});

test("delete rejects an organization with active user assignments", async () => {
  const root = makeOrg("root", null, 10);
  const service = createService([root], { userCount: 1 });
  await assert.rejects(() => service.softDelete(scope, "actor", "root"), BadRequestException);
});

test("tree applies the organization data-scope predicate", async () => {
  const allowed = makeOrg("allowed", null, 10);
  const treeWhere = { id: "allowed" };
  const orgFindOptions: unknown[] = [];
  const service = createService([allowed], { treeWhere, orgFindOptions });
  const tree = await service.tree(scope, { sub: "user-1", username: "user", tenantId: scope.tenantId, parkId: scope.parkId, roles: [], permissions: [] });
  assert.deepEqual(tree.map((item) => item.id), ["allowed"]);
  assert.equal((orgFindOptions[0] as { where: unknown }).where, treeWhere);
});

test("delete counts only assignments belonging to active users", async () => {
  const userOrgCountWhere: unknown[] = [];
  const root = makeOrg("root", null, 10);
  const service = createService([root], { userOrgCountWhere });
  await service.softDelete(scope, "actor", "root");
  assert.deepEqual(userOrgCountWhere[0], {
    tenantId: scope.tenantId,
    parkId: scope.parkId,
    orgId: "root",
    isDeleted: false,
    user: { isDeleted: false }
  });
});

test("hierarchy updates acquire the scoped transaction advisory lock", async () => {
  const lockCalls: Array<{ sql: string; parameters: unknown[] }> = [];
  const root = makeOrg("root", null, 10);
  const service = createService([root], { lockCalls });
  await service.update(scope, "actor", "root", { orgName: "Renamed" });
  assert.match(lockCalls[0]?.sql ?? "", /pg_advisory_xact_lock/);
  assert.deepEqual(lockCalls[0]?.parameters, ["org-hierarchy:tenant-1:park-1"]);
});

test("leader candidates are not silently capped", async () => {
  const findOptions: unknown[] = [];
  const service = createService([], { leaderFindOptions: findOptions });
  await service.listLeaders(scope);
  assert.equal(Object.hasOwn(findOptions[0] as object, "take"), false);
});
