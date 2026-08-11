import assert from "node:assert/strict";
import test from "node:test";
import { UserOrgEntity } from "../orgs/entities/user-org.entity";
import { OrgEntity } from "../orgs/entities/org.entity";
import { PostEntity } from "../orgs/entities/post.entity";
import { ParkEntity } from "../parks/entities/park.entity";
import { UsersService } from "./users.service";
import { UserEntity } from "./entities/user.entity";
import { UserParkEntity } from "./entities/user-park.entity";

const scope = { tenantId: "tenant-1", parkId: "park-1" };
const actor = {
  sub: "actor-1",
  username: "operator",
  tenantId: scope.tenantId,
  parkId: scope.parkId,
  roles: [],
  permissions: []
};

test("organization assignment replacement only deletes the target user's current scope", async () => {
  const target = {
    id: "user-1",
    tenantId: "tenant-2",
    parkId: "park-2",
    isDeleted: false
  } as UserEntity;
  let updateWhere: unknown;
  const lockKeys: string[] = [];
  const transactionRepository = {
    update: async (where: unknown) => { updateWhere = where; },
    create: (value: unknown) => value,
    save: async (value: unknown) => value
  };
  interface MockManager {
    query(sql: string, parameters: unknown[]): Promise<void>;
    getRepository(entity: unknown): unknown;
    transaction(callback: (value: MockManager) => Promise<unknown>): Promise<unknown>;
  }
  const manager: MockManager = {
    query: async (sql, parameters) => {
      assert.match(sql, /pg_advisory_xact_lock/);
      lockKeys.push(String(parameters[0]));
    },
    getRepository: (entity: unknown) => {
      if (entity === UserEntity) return { findOne: async () => target };
      if (entity === UserOrgEntity) return transactionRepository;
      throw new Error("Unexpected repository");
    },
    transaction: async (callback) => callback(manager)
  };
  const service = new UsersService(
    { findOne: async () => target } as never,
    {} as never,
    {} as never,
    {
      manager,
      find: async () => []
    } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { get: (_key: string, fallback?: string) => fallback } as never
  );

  await service.replaceOrgAssignments(scope, actor, target.id, { assignments: [] });

  assert.deepEqual(updateWhere, {
    userId: target.id,
    tenantId: target.tenantId,
    parkId: target.parkId,
    isDeleted: false
  });
  assert.deepEqual(lockKeys, ["user-org-scope:user-1", "org-hierarchy:tenant-2:park-2"]);
});

test("user scope updates serialize with assignment writes and retire the previous scope", async () => {
  const target = {
    id: "user-1",
    username: "user",
    displayName: "User",
    tenantId: "tenant-1",
    parkId: "park-1",
    isDeleted: false,
    status: "enabled",
    isEnabled: true
  } as UserEntity;
  const lockKeys: string[] = [];
  let retiredWhere: unknown;
  const userRepository = {
    findOne: async () => target,
    exists: async () => false,
    save: async (value: UserEntity) => value
  };
  interface ScopeUpdateManager {
    query(sql: string, parameters: unknown[]): Promise<void>;
    getRepository(entity: unknown): unknown;
    transaction(callback: (value: ScopeUpdateManager) => Promise<unknown>): Promise<unknown>;
  }
  const manager: ScopeUpdateManager = {
    query: async (_sql: string, parameters: unknown[]) => { lockKeys.push(String(parameters[0])); },
    getRepository: (entity: unknown) => {
      if (entity === UserEntity) return userRepository;
      if (entity === UserOrgEntity) return { update: async (where: unknown) => { retiredWhere = where; } };
      if (entity === ParkEntity) return { find: async () => [{ tenantId: "tenant-2", parkId: "park-2" }] };
      if (entity === UserParkEntity) return { update: async () => undefined, create: (value: unknown) => value, save: async () => undefined };
      throw new Error("Unexpected repository");
    },
    transaction: async (callback) => callback(manager)
  };
  const service = new UsersService(
    { manager } as never,
    {} as never,
    {} as never,
    {} as never,
    { find: async () => [] } as never,
    { exists: async () => true, find: async () => [{ tenantId: "tenant-2", parkId: "park-2" }] } as never,
    { find: async () => [] } as never,
    {} as never,
    {} as never,
    {} as never,
    { get: (_key: string, fallback?: string) => fallback } as never
  );
  const superActor = { ...actor, isSuper: true, permissions: ["*"] };

  await service.update(scope, superActor, target.id, { tenantId: "tenant-2", parkId: "park-2" });

  assert.deepEqual(lockKeys, ["user-org-scope:user-1", "org-hierarchy:tenant-1:park-1"]);
  assert.deepEqual(retiredWhere, {
    userId: target.id,
    tenantId: "tenant-1",
    parkId: "park-1",
    isDeleted: false
  });
});

test("create organization candidates resolve the requested super-admin target scope", async () => {
  const orgFindWhere: unknown[] = [];
  const postFindWhere: unknown[] = [];
  const orgFindOptions: Array<{ where: unknown; select?: unknown }> = [];
  const postFindOptions: Array<{ where: unknown; select?: unknown }> = [];
  const manager = {
    getRepository: (entity: unknown) => {
      if (entity === OrgEntity) return { find: async (options: { where: unknown; select?: unknown }) => { orgFindWhere.push(options.where); orgFindOptions.push(options); return []; } };
      if (entity === PostEntity) return { find: async (options: { where: unknown; select?: unknown }) => { postFindWhere.push(options.where); postFindOptions.push(options); return []; } };
      throw new Error("Unexpected repository");
    }
  };
  const service = new UsersService(
    {} as never,
    {} as never,
    {} as never,
    { manager } as never,
    {} as never,
    { exists: async () => true } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { get: (_key: string, fallback?: string) => fallback } as never
  );
  const superActor = { ...actor, isSuper: true, permissions: ["*"] };

  await service.getCreateOrgCandidates(scope, superActor, "tenant-2", "park-2");

  const expected = { tenantId: "tenant-2", parkId: "park-2", isDeleted: false, status: "enabled" };
  assert.deepEqual(orgFindWhere, [expected]);
  assert.deepEqual(postFindWhere, [expected]);
  assert.deepEqual(orgFindOptions[0]?.select, {
    id: true, parentId: true, orgCode: true, orgName: true, orgType: true,
    leaderUserId: true, sortOrder: true, status: true
  });
  assert.deepEqual(postFindOptions[0]?.select, {
    id: true, postCode: true, postName: true, sortOrder: true, status: true
  });
});
