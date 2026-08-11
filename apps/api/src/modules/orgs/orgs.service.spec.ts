import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException } from "@nestjs/common";
import { OrgsService } from "./orgs.service";

const scope = { tenantId: "tenant-1", parkId: "park-1" };

function makeOrg(id: string, parentId: string | null, sortOrder: number, orgName = id) {
  return {
    id, parentId, sortOrder, orgName, orgCode: id, orgType: "department", leaderUserId: null,
    status: "enabled", tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false,
    createTime: new Date(), updateTime: new Date(), createBy: null, updateBy: null, version: 1, remark: null, userLinks: []
  };
}

function createService(orgs: ReturnType<typeof makeOrg>[], options: { childCount?: number; userCount?: number } = {}) {
  const byId = new Map(orgs.map((org) => [org.id, org]));
  const orgRepository = {
    find: async () => [...orgs].sort((a, b) => a.sortOrder - b.sortOrder || a.orgName.localeCompare(b.orgName)),
    findOne: async ({ where }: { where: { id: string } }) => byId.get(where.id) ?? null,
    findAndCount: async () => [[], 0], exists: async () => false, count: async () => options.childCount ?? 0,
    create: (value: unknown) => value, save: async (value: unknown) => value
  };
  return new OrgsService(
    orgRepository as never,
    { find: async () => [] } as never,
    { count: async () => options.userCount ?? 0 } as never,
    { find: async () => [], exists: async () => true } as never,
    { buildFindWhere: async (_scope: unknown, _actor: unknown, _dimension: unknown, where: unknown) => where } as never
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
