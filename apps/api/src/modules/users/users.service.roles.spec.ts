import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { RoleEntity } from "../roles/entities/role.entity";
import { UserRoleEntity } from "../roles/entities/user-role.entity";
import { UsersService } from "./users.service";
import { UserEntity } from "./entities/user.entity";
import { UserRoleCandidatesQueryDto } from "./dto/user-role-candidates-query.dto";

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

function createRoleCandidateRepository(
  roles: RoleEntity[],
  options: {
    total?: number;
    clauses?: unknown[];
    parameters?: unknown[];
    skips?: number[];
    takes?: number[];
  } = {}
) {
  const builder = {
    where: (clause: unknown, parameters?: unknown) => {
      options.clauses?.push(clause);
      options.parameters?.push(parameters);
      return builder;
    },
    andWhere: (clause: unknown, parameters?: unknown) => {
      options.clauses?.push(clause);
      options.parameters?.push(parameters);
      return builder;
    },
    orderBy: () => builder,
    addOrderBy: () => builder,
    skip: (value: number) => {
      options.skips?.push(value);
      return builder;
    },
    take: (value: number) => {
      options.takes?.push(value);
      return builder;
    },
    getManyAndCount: async () => [roles, options.total ?? roles.length] as [RoleEntity[], number]
  };
  return { createQueryBuilder: () => builder };
}

function createService(overrides: {
  usersRepository?: unknown;
  rolesRepository?: unknown;
  userRoleRepository?: unknown;
  parksRepository?: unknown;
} = {}) {
  return new UsersService(
    (overrides.usersRepository ?? { findOne: async () => target }) as never,
    (overrides.rolesRepository ?? { find: async () => [] }) as never,
    (overrides.userRoleRepository ?? { find: async () => [] }) as never,
    {} as never, {} as never, (overrides.parksRepository ?? {}) as never, {} as never, {} as never, {} as never, {} as never,
    { get: (_key: string, fallback?: string) => fallback } as never
  );
}

test("user role context uses the target user's tenant and park", async () => {
  const assignedRole = role({});
  let assignedWhere: unknown;
  const candidateClauses: unknown[] = [];
  const candidateTakes: number[] = [];
  const service = createService({
    rolesRepository: createRoleCandidateRepository([assignedRole], { clauses: candidateClauses, takes: candidateTakes }),
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
  assert(candidateClauses.some((clause) => String(clause).includes("role.tenant_id=:tenantId")));
  assert(candidateClauses.some((clause) => String(clause).includes("role.role_scope='tenant'")));
  assert(candidateClauses.some((clause) => String(clause).includes("role.role_scope='park' AND role.park_id=:parkId")));
  assert.deepEqual(result.roles.map((item) => item.id), [assignedRole.id]);
  assert.deepEqual(result.candidates.map((item) => item.id), [assignedRole.id]);
  assert.deepEqual(result.candidatePage.items.map((item) => item.id), [assignedRole.id]);
  assert.equal(result.candidatePage.hasMore, false);
  assert.equal(result.roles[0]?.isAssignable, true);
  assert.deepEqual(result.roles[0]?.unassignableReasons, []);
  assert.equal(result.roles[0]?.assignabilityLabel, "可分配");
  assert.deepEqual(candidateTakes, [200]);
});

test("create role candidates keep legacy array output while paged mode returns searchable metadata", async () => {
  const invalidQuery = plainToInstance(UserRoleCandidatesQueryDto, { paged: "maybe" });
  assert.notEqual((await validate(invalidQuery)).length, 0);
  const validQuery = plainToInstance(UserRoleCandidatesQueryDto, { paged: "true", page: "2", page_size: "50" });
  assert.equal((await validate(validQuery)).length, 0);
  assert.equal(validQuery.paged, true);

  const firstPageRole = role({ id: "role-page-1", code: "ROLE_PAGE_1" });
  const clauses: unknown[] = [];
  const skips: number[] = [];
  const takes: number[] = [];
  const service = createService({
    rolesRepository: createRoleCandidateRepository([firstPageRole], {
      total: 201,
      clauses,
      skips,
      takes
    }),
    parksRepository: { exists: async () => true }
  });

  const legacy = await service.getCreateRoleCandidates(
    scope,
    actor,
    Object.assign(new UserRoleCandidatesQueryDto(), { tenantId: target.tenantId, parkId: target.parkId })
  );
  assert(Array.isArray(legacy));
  assert.equal(legacy[0]?.id, firstPageRole.id);

  const paged = await service.getCreateRoleCandidates(
    scope,
    actor,
    Object.assign(new UserRoleCandidatesQueryDto(), {
      tenantId: target.tenantId,
      parkId: target.parkId,
      page: 2,
      page_size: 50,
      paged: true,
      keyword: "PAGE"
    })
  );
  assert(!Array.isArray(paged));
  assert.equal(paged.total, 201);
  assert.equal(paged.page, 2);
  assert.equal(paged.page_size, 50);
  assert.equal(paged.hasMore, true);
  assert.deepEqual(skips, [0, 50]);
  assert.deepEqual(takes, [200, 50]);
  assert(clauses.some((clause) => typeof clause === "object"));
});

test("assigned user roles carry unassignable reasons for retained protected or disabled roles", async () => {
  const assignedTemplate = role({ id: "role-template", isTemplate: true });
  const assignedDisabled = role({ id: "role-disabled", status: "disabled", isEnabled: false });
  const service = createService({
    rolesRepository: createRoleCandidateRepository([]),
    userRoleRepository: {
      find: async () => [{ role: assignedTemplate }, { role: assignedDisabled }]
    }
  });

  const result = await service.getUserRoleContext(scope, actor, target.id);

  assert.deepEqual(result.roles.map((item) => item.id), ["role-template", "role-disabled"]);
  assert.deepEqual(result.roles[0]?.unassignableReasons, ["template"]);
  assert.equal(result.roles[0]?.isProtected, true);
  assert.equal(result.roles[0]?.assignabilityLabel, "模板角色");
  assert.deepEqual(result.roles[1]?.unassignableReasons, ["disabled"]);
  assert.equal(result.roles[1]?.isProtected, false);
  assert.equal(result.roles[1]?.assignabilityLabel, "已停用");
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
    createQueryBuilder: () => {
      const builder = {
        setLock: () => builder,
        where: (value: unknown) => { roleWhere = [value]; return builder; },
        andWhere: (value: unknown) => { (roleWhere as unknown[]).push(value); return builder; },
        getMany: async () => { events.push("roles.lock"); return [selectedRole]; }
      };
      return builder;
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

  assert.deepEqual(events, ["transaction.begin", "user.lock", "roles.lock", "links.find", "links.update", "links.save", "transaction.commit"]);
  assert.deepEqual(auditScope, { tenantId: target.tenantId, parkId: target.parkId });
  assert.deepEqual((linkWhere as { id: { value: string[] }; isDeleted: boolean }).id.value, [managedLink.id, protectedDisabledLink.id]);
  assert.equal((linkWhere as { isDeleted: boolean }).isDeleted, false);
  assert.match((roleWhere as string[]).join(" "), /role\.status='enabled' AND role\.is_enabled=true/);
  assert.match((roleWhere as string[]).join(" "), /role\.is_template=false AND role\.is_system=false AND role\.is_builtin=false/);
});
