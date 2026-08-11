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
  let auditScope: unknown;
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

  await service.replaceOrgAssignments(
    scope,
    { ...actor, isSuper: true, permissions: ["*"] },
    target.id,
    { assignments: [] },
    (resolvedScope) => { auditScope = resolvedScope; }
  );

  assert.deepEqual(updateWhere, {
    userId: target.id,
    tenantId: target.tenantId,
    parkId: target.parkId,
    isDeleted: false
  });
  assert.deepEqual(lockKeys, ["user-org-scope:user-1", "org-hierarchy:tenant-2:park-2"]);
  assert.deepEqual(auditScope, { tenantId: target.tenantId, parkId: target.parkId });
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
      if (entity === UserOrgEntity) return {
        find: async () => [
          { tenantId: "tenant-1", parkId: "park-1" },
          { tenantId: "tenant-1", parkId: "park-secondary" }
        ],
        update: async (where: unknown) => { retiredWhere = where; }
      };
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

  assert.deepEqual(lockKeys, [
    "user-org-scope:user-1",
    "org-hierarchy:tenant-1:park-1",
    "org-hierarchy:tenant-1:park-secondary"
  ]);
  assert.deepEqual(retiredWhere, {
    userId: target.id,
    tenantId: "tenant-1",
    isDeleted: false
  });
});

test("organization assignment reads apply the actor's organization data scope", async () => {
  const target = { id: "user-1", tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false } as UserEntity;
  let linkFindWhere: unknown;
  const manager = {
    getRepository: (entity: unknown) => {
      if (entity === OrgEntity) return { find: async () => [{ id: "org-visible" }] };
      throw new Error("Unexpected repository");
    }
  };
  const service = new UsersService(
    { findOne: async () => target } as never,
    {} as never,
    {} as never,
    {
      manager,
      find: async (options: { where: unknown }) => { linkFindWhere = options.where; return []; }
    } as never,
    {} as never,
    {} as never,
    {} as never,
    { buildFindWhere: async (_scope: unknown, _actor: unknown, _dimension: unknown, where: unknown) => where } as never,
    {} as never,
    {} as never,
    { get: (_key: string, fallback?: string) => fallback } as never
  );

  await service.listOrgAssignments(scope, actor, target.id);

  assert.deepEqual(((linkFindWhere as { orgId: { _value: string[] } }).orgId)._value, ["org-visible"]);
});

test("organization assignment replacement preserves relationships outside the actor's organization scope", async () => {
  const target = { id: "user-1", tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false } as UserEntity;
  let updateWhere: unknown;
  const relationshipRepository = {
    find: async () => [{ orgId: "org-hidden", isPrimary: true }],
    update: async (where: unknown) => { updateWhere = where; },
    create: (value: unknown) => value,
    save: async (value: unknown) => value
  };
  interface PreserveManager {
    query(): Promise<void>;
    getRepository(entity: unknown): unknown;
    transaction(callback: (value: PreserveManager) => Promise<unknown>): Promise<unknown>;
  }
  const manager: PreserveManager = {
    query: async () => undefined,
    getRepository: (entity: unknown) => {
      if (entity === UserEntity) return { findOne: async () => target };
      if (entity === UserOrgEntity) return relationshipRepository;
      if (entity === OrgEntity) return {
        count: async () => 1,
        find: async () => [{ id: "org-visible" }]
      };
      throw new Error("Unexpected repository");
    },
    transaction: async (callback) => callback(manager)
  };
  const service = new UsersService(
    { findOne: async () => target } as never,
    {} as never,
    {} as never,
    { manager, find: async () => [] } as never,
    {} as never,
    {} as never,
    {} as never,
    { buildFindWhere: async (_scope: unknown, _actor: unknown, _dimension: unknown, where: unknown) => where } as never,
    {} as never,
    {} as never,
    { get: (_key: string, fallback?: string) => fallback } as never
  );

  await service.replaceOrgAssignments(scope, actor, target.id, {
    assignments: [{ orgId: "org-visible", postId: null, isPrimary: false }]
  });

  assert.deepEqual(((updateWhere as { orgId: { _value: string[] } }).orgId)._value, ["org-visible"]);
});

test("create organization candidates resolve the requested super-admin target scope", async () => {
  const orgFindWhere: unknown[] = [];
  const postFindWhere: unknown[] = [];
  const orgFindOptions: Array<{ where: unknown; select?: unknown }> = [];
  const postFindOptions: Array<{ where: unknown; select?: unknown }> = [];
  const dataScopeCalls: unknown[][] = [];
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
    {
      buildFindWhere: async (...args: unknown[]) => {
        dataScopeCalls.push(args);
        return args[3];
      }
    } as never,
    {} as never,
    {} as never,
    { get: (_key: string, fallback?: string) => fallback } as never
  );
  const superActor = { ...actor, isSuper: true, permissions: ["*"] };

  await service.getCreateOrgCandidates(scope, superActor, "tenant-2", "park-2");

  const expected = { tenantId: "tenant-2", parkId: "park-2", isDeleted: false, status: "enabled" };
  assert.deepEqual(orgFindWhere, [expected]);
  assert.deepEqual(postFindWhere, [expected]);
  assert.equal(dataScopeCalls.length, 1);
  assert.equal(dataScopeCalls[0]?.[1], superActor);
  assert.equal(dataScopeCalls[0]?.[2], "org");
  assert.deepEqual(orgFindOptions[0]?.select, {
    id: true, parentId: true, orgCode: true, orgName: true, orgType: true,
    leaderUserId: true, sortOrder: true, status: true
  });
  assert.deepEqual(postFindOptions[0]?.select, {
    id: true, postCode: true, postName: true, sortOrder: true, status: true
  });
});

test("organization assignment writes enforce the actor's organization data scope", async () => {
  const target = { id: "user-1", tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false } as UserEntity;
  let countCalled = false;
  interface AssignmentScopeManager {
    query(): Promise<void>;
    getRepository(entity: unknown): unknown;
    transaction(callback: (value: AssignmentScopeManager) => Promise<unknown>): Promise<unknown>;
  }
  const manager: AssignmentScopeManager = {
    query: async () => undefined,
    getRepository: (entity: unknown) => {
      if (entity === UserEntity) return { findOne: async () => target };
      if (entity === OrgEntity) return {
        find: async () => [{ id: "org-visible" }],
        count: async () => { countCalled = true; return 1; }
      };
      if (entity === UserOrgEntity) return {};
      throw new Error("Unexpected repository");
    },
    transaction: async (callback) => callback(manager)
  };
  const service = new UsersService(
    {} as never,
    {} as never,
    {} as never,
    { manager } as never,
    {} as never,
    {} as never,
    {} as never,
    { buildFindWhere: async () => ({ id: "org-visible" }) } as never,
    {} as never,
    {} as never,
    { get: (_key: string, fallback?: string) => fallback } as never
  );

  await assert.rejects(
    service.replaceOrgAssignments(scope, actor, target.id, {
      assignments: [{ orgId: "org-hidden", postId: null, isPrimary: true }]
    }),
    /包含不存在、停用、跨园区或无权使用的组织/
  );
  assert.equal(countCalled, false, "hidden submitted ids must be rejected before the plain entity count");
});

test("user profile and organization assignment updates share one transaction", async () => {
  const target = {
    id: "user-1", username: "user", displayName: "Old name",
    tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false,
    status: "enabled", isEnabled: true
  } as UserEntity;
  const events: string[] = [];
  interface AtomicUpdateManager {
    query(sql: string, parameters: unknown[]): Promise<void>;
    getRepository(entity: unknown): unknown;
    transaction(callback: (value: AtomicUpdateManager) => Promise<unknown>): Promise<unknown>;
  }
  const manager: AtomicUpdateManager = {
    query: async (_sql, parameters) => { events.push(`lock:${String(parameters[0])}`); },
    getRepository: (entity: unknown) => {
      if (entity === UserEntity) return {
        findOne: async () => target,
        save: async (value: UserEntity) => { events.push(`save-user:${value.displayName}`); return value; }
      };
      if (entity === OrgEntity) return {
        find: async () => [{ id: "org-visible" }],
        count: async () => 1
      };
      if (entity === UserOrgEntity) return {
        find: async () => [],
        update: async () => { events.push("retire-assignments"); },
        create: (value: unknown) => value,
        save: async () => { events.push("save-assignments"); }
      };
      throw new Error("Unexpected repository");
    },
    transaction: async (callback) => {
      events.push("transaction-start");
      const result = await callback(manager);
      events.push("transaction-commit");
      return result;
    }
  };
  const service = new UsersService(
    { manager } as never, {} as never, {} as never, {} as never,
    { find: async () => [] } as never,
    { find: async () => [] } as never,
    { find: async () => [] } as never,
    { buildFindWhere: async (_scope: unknown, _actor: unknown, _dimension: unknown, where: unknown) => where } as never,
    {} as never, {} as never,
    { get: (_key: string, fallback?: string) => fallback } as never
  );

  await service.update(scope, actor, target.id, {
    displayName: "New name",
    assignments: [{ orgId: "org-visible", postId: null, isPrimary: true }]
  });

  assert.deepEqual(events, [
    "transaction-start",
    "lock:user-org-scope:user-1",
    "lock:org-hierarchy:tenant-1:park-1",
    "save-user:New name",
    "retire-assignments",
    "save-assignments",
    "transaction-commit"
  ]);
});

test("user deletion serializes with assignment writes and retires active assignments", async () => {
  const target = { id: "user-1", tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false } as UserEntity;
  const lockKeys: string[] = [];
  let assignmentUpdateWhere: unknown;
  const userRepository = {
    findOne: async () => target,
    save: async (value: UserEntity) => value
  };
  interface DeleteManager {
    query(sql: string, parameters: unknown[]): Promise<void>;
    getRepository(entity: unknown): unknown;
    transaction(callback: (value: DeleteManager) => Promise<unknown>): Promise<unknown>;
  }
  const manager: DeleteManager = {
    query: async (_sql, parameters) => { lockKeys.push(String(parameters[0])); },
    getRepository: (entity: unknown) => {
      if (entity === UserEntity) return userRepository;
      if (entity === UserOrgEntity) return {
        update: async (where: unknown) => { assignmentUpdateWhere = where; }
      };
      throw new Error("Unexpected repository");
    },
    transaction: async (callback) => callback(manager)
  };
  const service = new UsersService(
    { manager } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { get: (_key: string, fallback?: string) => fallback } as never
  );

  await service.softDelete(scope, actor.sub, target.id);

  assert.deepEqual(lockKeys, ["user-org-scope:user-1"]);
  assert.equal(target.isDeleted, true);
  assert.deepEqual(assignmentUpdateWhere, {
    userId: target.id,
    tenantId: scope.tenantId,
    isDeleted: false
  });
});
