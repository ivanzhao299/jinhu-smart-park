import assert from "node:assert/strict";
import test from "node:test";
import { UserOrgEntity } from "../orgs/entities/user-org.entity";
import { OrgEntity } from "../orgs/entities/org.entity";
import { PostEntity } from "../orgs/entities/post.entity";
import { UsersService } from "./users.service";
import type { UserEntity } from "./entities/user.entity";

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
      assert.deepEqual(parameters, ["org-hierarchy:tenant-2:park-2"]);
    },
    getRepository: (entity: unknown) => {
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
});

test("create organization candidates resolve the requested super-admin target scope", async () => {
  const orgFindWhere: unknown[] = [];
  const postFindWhere: unknown[] = [];
  const manager = {
    getRepository: (entity: unknown) => {
      if (entity === OrgEntity) return { find: async (options: { where: unknown }) => { orgFindWhere.push(options.where); return []; } };
      if (entity === PostEntity) return { find: async (options: { where: unknown }) => { postFindWhere.push(options.where); return []; } };
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
});
