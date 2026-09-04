import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { BadRequestException } from "@nestjs/common";
import { OrgsService } from "./orgs.service";
import { OrgEntity } from "./entities/org.entity";
import { UserOrgEntity } from "./entities/user-org.entity";
import { UserEntity } from "../users/entities/user.entity";
import type { CreateOrgDto } from "./dto/create-org.dto";
import type { UpdateOrgDto } from "./dto/update-org.dto";

const scope = { tenantId: "tenant-1", parkId: "park-1" };
const actor = {
  sub: "actor",
  username: "operator",
  tenantId: scope.tenantId,
  parkId: scope.parkId,
  roles: [],
  permissions: ["*"]
};
const hierarchyMigration = readFileSync(
  resolve(__dirname, "../../../../../database/migrations/000204_org_hierarchy_integrity.sql"),
  "utf8"
);

function makeOrg(id: string, parentId: string | null, sortOrder: number, orgName = id): OrgEntity {
  return {
    id, parentId, sortOrder, orgName, orgCode: id, orgType: "department", leaderUserId: null,
    legacySourceId: null, legacyHierarchyLevel: null, legacyManagerReference: null, plannedHeadcount: null,
    contactPhone: null, contactAddress: null, contactEmail: null, legacyCompanyManagerReference: null,
    status: "enabled", tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false,
    createTime: new Date(), updateTime: new Date(), createBy: null, updateBy: null, version: 1, remark: null, userLinks: []
  } as OrgEntity;
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
    leaderRows?: Array<{ id: string; displayName: string; username: string }>;
    securedLeaderRows?: Array<{ id: string; displayName?: string; username?: string }>;
    fieldPolicyCalls?: unknown[][];
    userOrgCountWhere?: unknown[];
    visibleOrgIds?: string[];
    orgSaveInputs?: Array<Record<string, unknown>>;
  } = {}
) {
  const byId = new Map(orgs.map((org) => [org.id, org]));
  const orgRepository: Record<string, unknown> = {
    find: async (findOptions: { select?: { id?: boolean } }) => {
      options.orgFindOptions?.push(findOptions);
      if (findOptions.select?.id && options.visibleOrgIds) {
        return orgs.filter((org) => options.visibleOrgIds?.includes(org.id));
      }
      return [...orgs].sort((a, b) => a.sortOrder - b.sortOrder || a.orgName.localeCompare(b.orgName));
    },
    findOne: async ({ where }: { where: { id: string } }) => byId.get(where.id) ?? null,
    findAndCount: async () => [[], 0], exists: async () => false, count: async () => options.childCount ?? 0,
    create: (value: unknown) => value,
    save: async (value: Record<string, unknown>) => {
      options.orgSaveInputs?.push({ ...value });
      return value;
    }
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
      return options.leaderRows ?? [];
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
    { buildFindWhere: async (_scope: unknown, _actor: unknown, _dimension: unknown, where: unknown) => options.treeWhere ?? where } as never,
    {
      applyFieldPoliciesToList: async (...args: unknown[]) => {
        options.fieldPolicyCalls?.push(args);
        return options.securedLeaderRows ?? args[4];
      }
    } as never
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
  await assert.rejects(() => service.update(scope, actor, "root", { parentId: "child" }), BadRequestException);
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
  await assert.rejects(() => service.update(scope, actor, "root", { parentId: "root" }), BadRequestException);
  await assert.rejects(() => service.update(scope, actor, "root", { parentId: "missing" }), BadRequestException);
  await assert.rejects(() => service.update(scope, actor, "root", { parentId: "disabled" }), BadRequestException);
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
    user: { tenantId: scope.tenantId, isDeleted: false }
  });
});

test("hierarchy updates acquire the scoped transaction advisory lock", async () => {
  const lockCalls: Array<{ sql: string; parameters: unknown[] }> = [];
  const root = makeOrg("root", null, 10);
  const service = createService([root], { lockCalls });
  await service.update(scope, actor, "root", { orgName: "Renamed" });
  assert.match(lockCalls[0]?.sql ?? "", /pg_advisory_xact_lock/);
  assert.deepEqual(lockCalls[0]?.parameters, ["org-hierarchy:tenant-1:park-1"]);
});

test("leader candidates are not silently capped", async () => {
  const findOptions: unknown[] = [];
  const service = createService([], { leaderFindOptions: findOptions });
  await service.listLeaders(scope, actor);
  assert.equal(Object.hasOwn(findOptions[0] as object, "take"), false);
});

test("leader candidates apply user field policies", async () => {
  const fieldPolicyCalls: unknown[][] = [];
  const service = createService([], {
    leaderRows: [{ id: "user-1", displayName: "Sensitive Name", username: "sensitive-user" }],
    securedLeaderRows: [{ id: "user-1" }],
    fieldPolicyCalls
  });

  const leaders = await service.listLeaders(scope, actor);

  assert.deepEqual(fieldPolicyCalls[0]?.slice(0, 4), [scope, actor, "system", "user"]);
  assert.deepEqual(leaders, [{ id: "user-1", displayName: "负责人", username: "" }]);
});

test("hierarchy migration locks writes and rejects inactive parents before adding constraints", () => {
  assert.match(hierarchyMigration, /LOCK TABLE sys_org IN SHARE ROW EXCLUSIVE MODE;[\s\S]*DO \$preflight\$/);
  assert.match(hierarchyMigration, /child\.is_deleted = false[\s\S]*parent\.is_deleted = true[\s\S]*parent\.status <> 'enabled'/);
  assert.match(hierarchyMigration, /UPDATE rel_user_org link[\s\S]*link\.tenant_id <> target_user\.tenant_id/);
});

test("create and reparent reject parent organizations outside the actor data scope", async () => {
  const allowed = makeOrg("allowed", null, 10);
  const hidden = makeOrg("hidden", null, 20);
  const child = makeOrg("child", "allowed", 30);
  const service = createService([allowed, hidden, child], { visibleOrgIds: ["allowed", "child"] });
  const scopedActor = { ...actor, permissions: [], isSuper: false };

  await assert.rejects(
    () => service.create(scope, scopedActor, { orgCode: "new", orgName: "New", orgType: "department", parentId: "hidden" }),
    /无权使用该上级组织/
  );
  await assert.rejects(
    () => service.update(scope, scopedActor, "child", { parentId: "hidden" }),
    /无权使用该上级组织/
  );
});

test("organization writes normalize contacts and omit the protected legacy reference from persistence and responses", async () => {
  const createSaveInputs: Array<Record<string, unknown>> = [];
  const service = createService([], { orgSaveInputs: createSaveInputs });
  const created = await service.create(scope, actor, {
    orgCode: "root",
    orgName: "Root",
    orgType: "company",
    contactPhone: " 010-12345678 ",
    contactAddress: " 园区大道 1 号 ",
    contactEmail: " office@example.com ",
    legacyCompanyManagerReference: "must-not-write",
  } as CreateOrgDto & { legacyCompanyManagerReference: string });
  assert.equal(created.contactPhone, "010-12345678");
  assert.equal(created.contactAddress, "园区大道 1 号");
  assert.equal(created.contactEmail, "office@example.com");
  assert.equal(Object.prototype.hasOwnProperty.call(created, "legacyCompanyManagerReference"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(createSaveInputs[0] ?? {}, "legacyCompanyManagerReference"), false);
  assert.doesNotMatch(JSON.stringify(created), /legacyCompanyManagerReference/);

  const existing = {
    ...makeOrg("root", null, 0),
    contactPhone: "old-phone",
    contactAddress: "old-address",
    contactEmail: "old@example.com",
    legacyCompanyManagerReference: "protected-existing",
  };
  const updateSaveInputs: Array<Record<string, unknown>> = [];
  const updateService = createService([existing], { orgSaveInputs: updateSaveInputs });
  const updated = await updateService.update(scope, actor, "root", {
    contactPhone: "   ",
    contactAddress: null,
    contactEmail: " new@example.com ",
    legacyCompanyManagerReference: "must-not-overwrite",
  } as UpdateOrgDto & { legacyCompanyManagerReference: string });
  assert.equal(updated.contactPhone, null);
  assert.equal(updated.contactAddress, null);
  assert.equal(updated.contactEmail, "new@example.com");
  assert.equal(Object.prototype.hasOwnProperty.call(updated, "legacyCompanyManagerReference"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(updateSaveInputs[0] ?? {}, "legacyCompanyManagerReference"), false);
  assert.doesNotMatch(JSON.stringify(updated), /legacyCompanyManagerReference/);
});
