import assert from "node:assert/strict";
import test from "node:test";
import { UserOrgEntity } from "../orgs/entities/user-org.entity";
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
    getRepository(entity: unknown): unknown;
    transaction(callback: (value: MockManager) => Promise<unknown>): Promise<unknown>;
  }
  const manager: MockManager = {
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
