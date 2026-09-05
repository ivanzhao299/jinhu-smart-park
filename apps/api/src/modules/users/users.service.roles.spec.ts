import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { RoleEntity } from "../roles/entities/role.entity";
import { UserRoleEntity } from "../roles/entities/user-role.entity";
import { UsersService } from "./users.service";
import { UserEntity } from "./entities/user.entity";
import { UserParkEntity } from "./entities/user-park.entity";
import { ParkEntity } from "../parks/entities/park.entity";
import { UserRoleCandidatesQueryDto } from "./dto/user-role-candidates-query.dto";
import { AssignParkRolesDto } from "./dto/assign-roles.dto";
import { IdentityDirectoryService } from "./identity-directory.service";

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
  userParkRepository?: unknown;
  parksRepository?: unknown;
} = {}) {
  const usersRepository = overrides.usersRepository ?? { findOne: async () => target };
  return new UsersService(
    usersRepository as never,
    (overrides.rolesRepository ?? { find: async () => [] }) as never,
    (overrides.userRoleRepository ?? { find: async () => [] }) as never,
    {} as never, (overrides.userParkRepository ?? {}) as never, (overrides.parksRepository ?? {}) as never, {} as never, {} as never, {} as never, {} as never,
    { get: (_key: string, fallback?: string) => fallback } as never,
    new IdentityDirectoryService(usersRepository as never)
  );
}

test("explicit target-park role DTO requires a bounded park id", async () => {
  const valid = plainToInstance(AssignParkRolesDto, {
    parkId: "park-target",
    roleIds: ["d25fa967-5090-4fd0-bb76-30a89e595f8c"]
  });
  assert.equal((await validate(valid)).length, 0);
  const missing = plainToInstance(AssignParkRolesDto, { roleIds: [] });
  assert.notEqual((await validate(missing)).length, 0);
  const blank = plainToInstance(AssignParkRolesDto, { parkId: "   ", roleIds: [] });
  assert.notEqual((await validate(blank)).length, 0);
});

test("global super role reads preserve cross-tenant target management", async () => {
  const assignedRole = role({});
  const service = createService({
    usersRepository: { findOne: async () => ({ ...target, roleLinks: [] }) },
    parksRepository: { findOne: async () => ({ tenantId: target.tenantId, parkId: target.parkId, status: 1 }) },
    userParkRepository: { findOne: async () => ({ userId: target.id, tenantId: target.tenantId, parkId: target.parkId }) },
    rolesRepository: createRoleCandidateRepository([assignedRole]),
    userRoleRepository: { find: async () => [{ role: assignedRole }] }
  });

  const result = await service.getUserRoleContext(
    scope,
    actor,
    target.id,
    Object.assign(new UserRoleCandidatesQueryDto(), { parkId: target.parkId })
  );
  assert.deepEqual(result.roles.map((item) => item.id), [assignedRole.id]);
});

test("target park reads retain an effective tenant-scoped protected role stored at the home park", async () => {
  const protectedRole = role({
    code: "SUPER_ADMIN",
    roleScope: "tenant",
    parkId: "home-park",
    isSystem: true,
    isBuiltin: true,
    isSuper: true
  });
  const service = createService({
    usersRepository: { findOne: async () => ({ ...target, roleLinks: [{ role: protectedRole }] }) },
    parksRepository: { findOne: async () => ({ tenantId: target.tenantId, parkId: target.parkId, status: 1 }) },
    userParkRepository: { findOne: async () => null },
    rolesRepository: createRoleCandidateRepository([]),
    userRoleRepository: { find: async () => [{ role: protectedRole }] }
  });

  const result = await service.getUserRoleContext(
    scope,
    actor,
    target.id,
    Object.assign(new UserRoleCandidatesQueryDto(), { parkId: target.parkId })
  );
  assert.deepEqual(result.roles.map((item) => item.code), ["SUPER_ADMIN"]);
});

test("protected tenant super cannot cross its tenant boundary", async () => {
  const service = createService({
    usersRepository: {
      findOne: async ({ where }: { where: { tenantId?: string } }) => where.tenantId === target.tenantId ? target : null
    }
  });
  const tenantSuperActor = { ...actor, isTenantSuper: true };

  await assert.rejects(
    service.getUserRoleContext(
      scope,
      tenantSuperActor,
      target.id,
      Object.assign(new UserRoleCandidatesQueryDto(), { parkId: target.parkId })
    ),
    NotFoundException
  );
});

test("target-park role reads reject ordinary cross-park actors before disclosing target state", async () => {
  const sameTenantTarget = { ...target, tenantId: scope.tenantId, roleLinks: [] } as UserEntity;
  const service = createService({ usersRepository: { findOne: async () => sameTenantTarget } });
  const ordinaryActor = { ...actor, permissions: ["system:user:assign-roles"], isSuper: false, isTenantSuper: false };

  await assert.rejects(
    service.getUserRoleContext(scope, ordinaryActor, sameTenantTarget.id, Object.assign(new UserRoleCandidatesQueryDto(), { parkId: "park-other" })),
    ForbiddenException
  );
});

test("target-park role reads require an effective target access relation", async () => {
  const sameTenantTarget = { ...target, tenantId: scope.tenantId, roleLinks: [] } as UserEntity;
  const service = createService({
    usersRepository: { findOne: async () => sameTenantTarget },
    parksRepository: { findOne: async () => ({ tenantId: scope.tenantId, parkId: scope.parkId, status: 1 }) },
    userParkRepository: { findOne: async () => null }
  });
  const ordinaryActor = { ...actor, permissions: ["system:user:assign-roles"], isSuper: false, isTenantSuper: false };

  await assert.rejects(
    service.getUserRoleContext(scope, ordinaryActor, sameTenantTarget.id, Object.assign(new UserRoleCandidatesQueryDto(), { parkId: scope.parkId })),
    NotFoundException
  );
});

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

test("explicit target-park replacement writes only the requested accessible park and reports its audit scope", async () => {
  const targetUser = { ...target, tenantId: scope.tenantId, parkId: "park-home", roleLinks: [] } as UserEntity;
  const targetParkId = "park-secondary";
  const selectedRole = role({
    id: "d25fa967-5090-4fd0-bb76-30a89e595f8c",
    tenantId: scope.tenantId,
    parkId: targetParkId
  });
  const linkWrites: unknown[] = [];
  const userRepository = { findOne: async () => targetUser };
  const parkRepository = { findOne: async () => ({ tenantId: scope.tenantId, parkId: targetParkId, status: 1 }) };
  const userParkRepository = { findOne: async () => ({ userId: targetUser.id, tenantId: scope.tenantId, parkId: targetParkId }) };
  const roleRepository = {
    createQueryBuilder: () => {
      const builder = {
        setLock: () => builder,
        where: () => builder,
        andWhere: () => builder,
        getMany: async () => [selectedRole]
      };
      return builder;
    }
  };
  const userRoleRepository = {
    find: async (options: unknown) => { linkWrites.push({ find: options }); return []; },
    update: async () => undefined,
    create: (value: unknown) => value,
    save: async (values: unknown) => { linkWrites.push({ save: values }); }
  };
  interface TargetManager {
    query(): Promise<void>;
    getRepository(entity: unknown): unknown;
    transaction(callback: (transactionManager: TargetManager) => Promise<unknown>): Promise<unknown>;
  }
  const manager: TargetManager = {
    query: async () => undefined,
    getRepository: (entity: unknown) => entity === UserEntity
      ? userRepository
      : entity === ParkEntity
        ? parkRepository
        : entity === UserParkEntity
          ? userParkRepository
          : entity === RoleEntity
            ? roleRepository
            : userRoleRepository,
    transaction: async (callback) => callback(manager)
  };
  const service = createService({ userRoleRepository: { manager } });
  const ordinaryActor = { ...actor, tenantId: scope.tenantId, parkId: targetParkId, permissions: ["system:user:assign-roles"], isSuper: false, isTenantSuper: false };
  let auditScope: unknown;

  await service.assignParkRoles(scope, ordinaryActor, targetUser.id, {
    parkId: targetParkId,
    roleIds: [selectedRole.id]
  }, (value) => { auditScope = value; });

  assert.deepEqual(auditScope, { tenantId: scope.tenantId, parkId: targetParkId });
  assert.deepEqual((linkWrites[0] as { find: { where: { parkId: string } } }).find.where.parkId, targetParkId);
  assert.deepEqual((linkWrites[1] as { save: Array<{ parkId: string }> }).save[0]?.parkId, targetParkId);
});
