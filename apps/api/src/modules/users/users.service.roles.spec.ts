import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException } from "@nestjs/common";
import { RoleEntity } from "../roles/entities/role.entity";
import { UserRoleEntity } from "../roles/entities/user-role.entity";
import { UsersService } from "./users.service";
import { UserEntity } from "./entities/user.entity";

const scope = { tenantId: "tenant-current", parkId: "park-current" };
const actor = {
  sub: "actor-1",
  username: "admin",
  tenantId: scope.tenantId,
  parkId: scope.parkId,
  roles: [],
  permissions: ["*"],
  isSuper: true
};
const target = { id: "user-1", tenantId: "tenant-target", parkId: "park-target", isDeleted: false } as UserEntity;

function role(values: Partial<RoleEntity>): RoleEntity {
  return {
    id: "role-1",
    code: "PROPERTY_MANAGER",
    name: "物业经理",
    tenantId: target.tenantId,
    parkId: target.parkId,
    roleScope: "park",
    status: "enabled",
    isEnabled: true,
    isTemplate: false,
    isSystem: false,
    isBuiltin: false,
    isDeleted: false,
    ...values
  } as RoleEntity;
}

function createService(overrides: {
  usersRepository?: unknown;
  rolesRepository?: unknown;
  userRoleRepository?: unknown;
} = {}) {
  return new UsersService(
    (overrides.usersRepository ?? { findOne: async () => target }) as never,
    (overrides.rolesRepository ?? { find: async () => [] }) as never,
    (overrides.userRoleRepository ?? { find: async () => [] }) as never,
    {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never,
    { get: (_key: string, fallback?: string) => fallback } as never
  );
}

test("user role context uses the target user's tenant and park", async () => {
  const assignedRole = role({});
  let assignedWhere: unknown;
  let candidateWhere: unknown;
  let candidateTake: unknown;
  const service = createService({
    rolesRepository: {
      find: async (options: { where: unknown; take: number }) => {
        candidateWhere = options.where;
        candidateTake = options.take;
        return [assignedRole];
      }
    },
    userRoleRepository: {
      find: async (options: { where: unknown }) => {
        assignedWhere = options.where;
        return [{ role: assignedRole }];
      }
    }
  });

  const result = await service.getUserRoleContext(scope, actor, target.id);

  assert.deepEqual(assignedWhere, {
    userId: target.id,
    tenantId: target.tenantId,
    parkId: target.parkId,
    isDeleted: false
  });
  assert.deepEqual(candidateWhere, [
    { tenantId: target.tenantId, roleScope: "tenant", status: "enabled", isEnabled: true, isTemplate: false, isSystem: false, isBuiltin: false, isDeleted: false },
    { tenantId: target.tenantId, parkId: target.parkId, roleScope: "park", status: "enabled", isEnabled: true, isTemplate: false, isSystem: false, isBuiltin: false, isDeleted: false }
  ]);
  assert.deepEqual(result.roles.map((item) => item.id), [assignedRole.id]);
  assert.deepEqual(result.candidates.map((item) => item.id), [assignedRole.id]);
  assert.equal(candidateTake, 200);
});

test("role replacement rejects duplicate IDs before changing persisted links", async () => {
  let transactionCalled = false;
  const service = createService({
    userRoleRepository: {
      manager: { transaction: async () => { transactionCalled = true; } }
    }
  });

  await assert.rejects(
    service.assignRoles(scope, actor, target.id, { roleIds: ["d25fa967-5090-4fd0-bb76-30a89e595f8c", "d25fa967-5090-4fd0-bb76-30a89e595f8c"] }),
    BadRequestException
  );
  assert.equal(transactionCalled, false);
});

test("role replacement reads and writes through one transaction manager", async () => {
  const selectedRole = role({ id: "d25fa967-5090-4fd0-bb76-30a89e595f8c" });
  const events: string[] = [];
  let roleWhere: unknown;
  let linkWhere: unknown;
  const managedLink = { id: "link-managed", role: selectedRole } as UserRoleEntity;
  const protectedPlatformLink = {
    id: "link-platform",
    role: role({ id: "role-platform", roleScope: "platform", parkId: undefined })
  } as UserRoleEntity;
  const protectedBuiltinLink = {
    id: "link-builtin",
    role: role({ id: "role-builtin", isSystem: true, isBuiltin: true })
  } as UserRoleEntity;
  const protectedDisabledLink = {
    id: "link-disabled",
    role: role({ id: "role-disabled", status: "disabled", isEnabled: false })
  } as UserRoleEntity;
  const roleRepository = {
    find: async (options: { where: unknown }) => {
      events.push("roles.find");
      roleWhere = options.where;
      return [selectedRole];
    }
  };
  const linkRepository = {
    find: async () => { events.push("links.find"); return [managedLink, protectedPlatformLink, protectedBuiltinLink, protectedDisabledLink]; },
    update: async (where: unknown) => { events.push("links.update"); linkWhere = where; },
    create: (value: unknown) => value,
    save: async () => { events.push("links.save"); }
  };
  const userRepository = { findOne: async () => target };
  interface MockManager {
    getRepository(entity: unknown): typeof roleRepository | typeof linkRepository | typeof userRepository | null;
    query(): Promise<void>;
    transaction(callback: (transactionManager: MockManager) => Promise<unknown>): Promise<unknown>;
  }
  const manager: MockManager = {
    getRepository: (entity: unknown) => entity === UserEntity
      ? userRepository
      : entity === RoleEntity
        ? roleRepository
        : entity === UserRoleEntity
          ? linkRepository
          : null,
    query: async () => { events.push("user.lock"); },
    transaction: async (callback) => {
      events.push("transaction.begin");
      const result = await callback(manager);
      events.push("transaction.commit");
      return result;
    }
  };
  const service = createService({ userRoleRepository: { manager } });
  let auditScope: unknown;

  await service.assignRoles(scope, actor, target.id, { roleIds: [selectedRole.id] }, (value) => { auditScope = value; });

  assert.deepEqual(events, ["transaction.begin", "user.lock", "roles.find", "links.find", "links.update", "links.save", "transaction.commit"]);
  assert.deepEqual(auditScope, { tenantId: target.tenantId, parkId: target.parkId });
  assert.deepEqual((linkWhere as { id: { value: string[] }; isDeleted: boolean }).id.value, [managedLink.id]);
  assert.equal((linkWhere as { isDeleted: boolean }).isDeleted, false);
  const scopedRoleWhere = roleWhere as Array<{
    id: { value: string[] };
    tenantId: string;
    parkId?: string;
    roleScope: string;
    status: string;
    isEnabled: boolean;
    isTemplate: boolean;
    isSystem: boolean;
    isBuiltin: boolean;
    isDeleted: boolean;
  }>;
  assert.deepEqual(scopedRoleWhere.map(({ id: _id, ...where }) => where), [
    { tenantId: target.tenantId, roleScope: "tenant", status: "enabled", isEnabled: true, isTemplate: false, isSystem: false, isBuiltin: false, isDeleted: false },
    { tenantId: target.tenantId, parkId: target.parkId, roleScope: "park", status: "enabled", isEnabled: true, isTemplate: false, isSystem: false, isBuiltin: false, isDeleted: false }
  ]);
  assert.deepEqual(scopedRoleWhere[0]?.id.value, [selectedRole.id]);
});
