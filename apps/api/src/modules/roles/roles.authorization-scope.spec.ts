import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validate } from "class-validator";
import test from "node:test";
import { ListRolesQueryDto } from "./dto/list-roles-query.dto";
import { RolesService } from "./roles.service";

test("role detail attaches only permission links from the caller's park", async () => {
  const role = {
    id: "role-1",
    tenantId: "tenant-a",
    parkId: "park-a",
    roleScope: "tenant",
    status: "enabled",
    isEnabled: true,
    isTemplate: false,
    isSystem: false,
    isBuiltin: false,
    isDeleted: false
  };
  const permissionLink = { id: "link-b", roleId: role.id, tenantId: "tenant-a", parkId: "park-b" };
  let roleWhere: unknown;
  let linkOptions: unknown;
  const service = new RolesService(
    { findOne: async (options: { where: unknown }) => { roleWhere = options.where; return role; } } as never,
    {} as never,
    { find: async (options: unknown) => { linkOptions = options; return [permissionLink]; } } as never,
    {} as never,
    {} as never
  );

  const result = await service.detail({ tenantId: "tenant-a", parkId: "park-b" }, role.id);

  assert.deepEqual(roleWhere, [
    { id: role.id, tenantId: "tenant-a", roleScope: "tenant", isDeleted: false },
    { id: role.id, tenantId: "tenant-a", parkId: "park-b", isDeleted: false }
  ]);
  const scopedLinks = linkOptions as {
    where: { tenantId: string; parkId: string; roleId: { _value: string[] }; isDeleted: boolean };
    relations: { permission: boolean };
  };
  assert.equal(scopedLinks.where.tenantId, "tenant-a");
  assert.equal(scopedLinks.where.parkId, "park-b");
  assert.deepEqual(scopedLinks.where.roleId._value, [role.id]);
  assert.equal(scopedLinks.where.isDeleted, false);
  assert.deepEqual(scopedLinks.relations, { permission: true });
  assert.deepEqual(result.permissionLinks, [permissionLink]);
  assert.equal(result.isAssignable, true);
  assert.deepEqual(result.unassignableReasons, []);
  assert.equal(result.assignabilityLabel, "可分配");
});

test("role list exposes assignability through an explicit DTO and filters before pagination", async () => {
  const queryDto = Object.assign(new ListRolesQueryDto(), { assignability: "assignable" });
  assert.equal((await validate(queryDto)).length, 0);
  const invalidQueryDto = Object.assign(new ListRolesQueryDto(), { assignability: "legacy" });
  assert.notEqual((await validate(invalidQueryDto)).length, 0);

  const role = {
    id: "role-1",
    tenantId: "tenant-a",
    parkId: "park-a",
    roleScope: "park",
    status: "enabled",
    isEnabled: true,
    isTemplate: false,
    isSystem: false,
    isBuiltin: false,
    isDeleted: false
  };
  const clauses: string[] = [];
  let skipped: number | undefined;
  let taken: number | undefined;
  const builder = {
    where: (clause: string) => { clauses.push(clause); return builder; },
    andWhere: (clause: string) => { clauses.push(clause); return builder; },
    orderBy: () => builder,
    addOrderBy: () => builder,
    skip: (value: number) => { skipped = value; return builder; },
    take: (value: number) => { taken = value; return builder; },
    getManyAndCount: async () => [[role], 1]
  };
  const service = new RolesService(
    { createQueryBuilder: () => builder } as never,
    {} as never,
    { find: async () => [] } as never,
    {} as never,
    {} as never
  );

  const result = await service.list(
    { tenantId: "tenant-a", parkId: "park-a" },
    Object.assign(new ListRolesQueryDto(), { page: 2, page_size: 10, assignability: "assignable" })
  );

  assert.equal(skipped, 10);
  assert.equal(taken, 10);
  assert.equal(result.total, 1);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0]?.isAssignable, true);
  assert(clauses.some((clause) => clause.includes("role.role_scope IN ('tenant','park')")));
});

test("direct role permission assignment loads tenant-wide active permissions while links stay park-scoped", async () => {
  const scope = { tenantId: "tenant-a", parkId: "park-a" };
  const role = { id: "role-1", tenantId: scope.tenantId, parkId: scope.parkId, roleScope: "park", isTemplate: false, isSystem: false, isBuiltin: false, editable: true, isEditable: true };
  let permissionWhere: { id?: unknown; tenantId?: string; parkId?: string; status?: string; isEnabled?: boolean; isDeleted?: boolean } | undefined;
  let linkUpdateWhere: { roleId?: string; tenantId?: string; parkId?: string; isDeleted?: boolean } | undefined;
  let savedLink: { tenantId?: string; parkId?: string; roleId?: string; permissionId?: string } | undefined;
  const roleBuilder = {
    setLock: () => roleBuilder,
    where: () => roleBuilder,
    andWhere: () => roleBuilder,
    getOne: async () => role
  };
  const permissionRepository = {
    find: async (options: { where: typeof permissionWhere }) => {
      permissionWhere = options.where;
      return [{ id: "permission-1" }];
    }
  };
  const linksRepository = {
    update: async (where: typeof linkUpdateWhere) => { linkUpdateWhere = where; },
    create: (value: typeof savedLink) => value,
    save: async (values: typeof savedLink[]) => { savedLink = values[0]; }
  };
  const roleRepository = {
    createQueryBuilder: () => roleBuilder,
    save: async () => role
  };
  const manager = {
    getRepository: (entity: { name: string }) => {
      if (entity.name === "RoleEntity") return roleRepository;
      if (entity.name === "PermissionEntity") return permissionRepository;
      return linksRepository;
    }
  };
  const service = new RolesService(
    {} as never,
    {} as never,
    { manager: { transaction: async (callback: (value: typeof manager) => unknown) => callback(manager) } } as never,
    {} as never,
    {} as never
  );

  await service.assignPermissions(scope, "actor-1", role.id, { permissionIds: ["permission-1"] });

  assert.equal(permissionWhere?.tenantId, scope.tenantId);
  assert.equal(permissionWhere?.parkId, undefined);
  assert.equal(permissionWhere?.status, "enabled");
  assert.equal(permissionWhere?.isEnabled, true);
  assert.equal(permissionWhere?.isDeleted, false);
  assert.equal(linkUpdateWhere?.parkId, scope.parkId);
  assert.equal(savedLink?.parkId, scope.parkId);
});

test("role copy is transactional and carries permission, field-policy and current-park scope links", () => {
  const source = readFileSync(resolve(__dirname, "roles.service.ts"), "utf8");
  const controllerSource = readFileSync(resolve(__dirname, "roles.controller.ts"), "utf8");

  assert.match(source, /attachPermissionLinks\(scope, items\)/);
  assert.match(source, /attachPermissionLinks\(scope, \[role\]\)/);
  assert.match(source, /rolesRepository\.manager\.transaction/);
  assert.match(source, /getRepository\(RoleDataScopeEntity\)/);
  assert.match(source, /getRepository\(RoleFieldPolicyEntity\)/);
  assert.match(source, /findPropertyRoleTemplateDefinition/);
  assert.match(source, /resolvePropertyRoleTemplatePermissionCodes/);
  assert.match(source, /resolveManagedTemplatePermissionIds\(manager, scope, managedTemplateDefinition\)/);
  assert.match(source, /resolveManagedTemplateDataScopeRuleIds\(manager, scope, managedTemplateDefinition\)/);
  assert.match(source, /resolveManagedTemplateDataScope\(managedTemplateDefinition\)/);
  assert.match(source, /return \{ dataScope: "40", dataScopeConfig: \{\} \}/);
  assert.match(source, /Standard property role template definition drifted/);
  assert.match(source, /Standard property role template permissions are missing/);
  assert.match(source, /where: \{ tenantId: scope\.tenantId, parkId: scope\.parkId, roleId: source\.id, isDeleted: false \}/);
  assert.match(source, /fieldPolicyId: link\.fieldPolicyId/);
  assert.match(source, /overridesDataScope = !isManagedPropertyTemplate[\s\S]*dto\.dataScope !== undefined \|\| dto\.dataScopeConfig !== undefined/);
  assert.match(source, /overridesDataScope[\s\S]*Promise\.resolve\(\[\]\)[\s\S]*dataScopeRepository\.find/);
  assert.match(source, /appliedBundleCodes: isManagedPropertyTemplate \? \[\]/);
  assert.match(source, /appliedBundleSignature: isManagedPropertyTemplate \? null/);
  assert.match(controllerSource, /Post\(":id\/copy"\)[\s\S]*RequirePermissions\([\s\S]*ROLE_COPY[\s\S]*ROLE_ASSIGN_PERMISSIONS[\s\S]*ROLE_ASSIGN_DATA_SCOPE[\s\S]*ROLE_ASSIGN_FIELD_POLICY/);
});

test("all direct binding mutations reject protected roles and permission updates share the role lock", () => {
  const rolesSource = readFileSync(resolve(__dirname, "roles.service.ts"), "utf8");
  const dataScopeSource = readFileSync(resolve(__dirname, "../data-scopes/data-scope.service.ts"), "utf8");
  const fieldPolicySource = readFileSync(resolve(__dirname, "../field-policies/field-policy.service.ts"), "utf8");

  assert.match(rolesSource, /assignPermissions[\s\S]*manager\.transaction[\s\S]*lockEditableRole/);
  assert.match(rolesSource, /assignPermissions[\s\S]*activeTenantPermissionWhere\(scope\)/);
  assert.match(rolesSource, /role\.appliedBundleCodes = \[\]/);
  assert.match(rolesSource, /role\.appliedBundleSignature = null/);
  assert.match(rolesSource, /assignFieldPermissions[\s\S]*GoneException[\s\S]*deprecated[\s\S]*field-policies role bindings/);
  assert.match(dataScopeSource, /assignRoleRules[\s\S]*Protected role bindings cannot be changed/);
  assert.match(fieldPolicySource, /assignRolePolicies[\s\S]*Protected role bindings cannot be changed/);
  assert.match(fieldPolicySource, /assignRolePolicies[\s\S]*manager\.transaction[\s\S]*setLock\("pessimistic_write"\)[\s\S]*Protected role bindings cannot be changed/);
});

test("deprecated role field-permissions write endpoint returns a deprecated error without writing legacy bindings", async () => {
  let transactionCount = 0;
  const service = new RolesService(
    {} as never,
    {} as never,
    {} as never,
    { manager: { transaction: async () => { transactionCount += 1; } } } as never,
    {} as never
  );

  await assert.rejects(
    service.assignFieldPermissions(
      { tenantId: "tenant-a", parkId: "park-a" },
      "actor-1",
      "role-1",
      { fields: [] }
    ),
    /deprecated/
  );
  assert.equal(transactionCount, 0);
});

test("built-in role scope cannot be changed", async () => {
  const role = {
    id: "role-1",
    tenantId: "tenant-a",
    parkId: "park-a",
    roleScope: "tenant",
    isBuiltin: true,
    isSystem: true,
    isEditable: true,
    editable: true
  };
  const service = new RolesService(
    { findOne: async () => role } as never,
    {} as never,
    { find: async () => [] } as never,
    {} as never,
    {} as never
  );

  await assert.rejects(
    service.update(
      { tenantId: "tenant-a", parkId: "park-b" },
      "actor-1",
      role.id,
      { roleScope: "park" }
    ),
    /Built-in role scope cannot be changed/
  );
});

test("an assigned ordinary role cannot be converted into a protected template", async () => {
  const role = { id: "role-1", tenantId: "tenant-a", parkId: "park-a", roleScope: "park", isTemplate: false, isEditable: true, editable: true };
  const queryBuilder = {
    setLock: () => queryBuilder,
    where: () => queryBuilder,
    andWhere: () => queryBuilder,
    getOne: async () => role
  };
  const manager = {
    getRepository: (entity: { name: string }) => entity.name === "RoleEntity"
      ? { createQueryBuilder: () => queryBuilder, save: async () => role }
      : { count: async () => 1 }
  };
  const rolesRepository = {
    findOne: async () => role,
    manager: { transaction: async (callback: (value: typeof manager) => unknown) => callback(manager) }
  };
  const service = new RolesService(
    rolesRepository as never,
    {} as never,
    { find: async () => [] } as never,
    {} as never,
    {} as never
  );
  await assert.rejects(
    service.update({ tenantId: "tenant-a", parkId: "park-a" }, "actor", role.id, { isTemplate: true }),
    /Role with bound users cannot be converted to a template/
  );
  const source = readFileSync(resolve(__dirname, "roles.service.ts"), "utf8");
  assert.match(source, /convertsToTemplate[\s\S]*manager\.transaction[\s\S]*setLock\("pessimistic_write"\)[\s\S]*getRepository\(UserRoleEntity\)\.count/);
  assert.match(source, /Object\.assign\(lockedRole,[\s\S]*name: dto\.name \?\? lockedRole\.name[\s\S]*status: dto\.status \?\? lockedRole\.status/);
  assert.match(source, /lockedParentId = dto\.parentId === undefined \? lockedRole\.parentId : dto\.parentId/);
  assert.match(source, /setLock\("pessimistic_read"\)[\s\S]*lockedParentPath[\s\S]*rolePath: lockedParentPath/);
  assert.match(source, /role\.role_scope IN \('park','platform'\)/);
});

test("custom tenant role scope cannot be changed directly", async () => {
  const role = {
    id: "role-1",
    tenantId: "tenant-a",
    parkId: "park-a",
    roleScope: "tenant",
    isBuiltin: false,
    isSystem: false,
    isEditable: true,
    editable: true
  };
  let saved = false;
  const service = new RolesService(
    { findOne: async () => role, save: async () => { saved = true; return role; } } as never,
    {} as never,
    { find: async () => [] } as never,
    {} as never,
    {} as never
  );

  await assert.rejects(
    service.update(
      { tenantId: "tenant-a", parkId: "park-b" },
      "actor-1",
      role.id,
      { roleScope: "park" }
    ),
    /Role scope cannot be changed directly/
  );
  assert.equal(saved, false);
});

test("custom park role scope cannot be expanded to tenant directly", async () => {
  const role = {
    id: "role-2",
    tenantId: "tenant-a",
    parkId: "park-a",
    roleScope: "park",
    isBuiltin: false,
    isSystem: false,
    isEditable: true,
    editable: true
  };
  let saved = false;
  const service = new RolesService(
    { findOne: async () => role, save: async () => { saved = true; return role; } } as never,
    {} as never,
    { find: async () => [] } as never,
    {} as never,
    {} as never
  );

  await assert.rejects(
    service.update(
      { tenantId: "tenant-a", parkId: "park-a" },
      "actor-1",
      role.id,
      { roleScope: "tenant" }
    ),
    /Role scope cannot be changed directly/
  );
  assert.equal(saved, false);
});

test("role dataScopeConfig rejects org ids outside the current park", async () => {
  const role = {
    id: "role-3",
    tenantId: "tenant-a",
    parkId: "park-a",
    roleScope: "park",
    dataScope: "tenant",
    dataScopeConfig: {},
    isBuiltin: false,
    isSystem: false,
    isEditable: true,
    editable: true,
    code: "ROLE_3",
    name: "角色 3",
    parentId: null,
    rolePath: "ROLE_3",
    roleLevel: 1,
    level: 1,
    sortNo: 0,
    roleType: "custom",
    isTemplate: false,
    status: "enabled",
    isEnabled: true
  };
  const roleBuilder = {
    setLock: () => roleBuilder,
    where: () => roleBuilder,
    andWhere: () => roleBuilder,
    getOne: async () => ({ ...role })
  };
  const roleRepository = {
    createQueryBuilder: () => roleBuilder,
    query: async () => [],
    save: async (value: unknown) => value
  };
  const manager = {
    getRepository: () => roleRepository
  };
  const service = new RolesService(
    {
      findOne: async () => role,
      manager: { transaction: async (callback: (value: typeof manager) => unknown) => callback(manager) }
    } as never,
    {} as never,
    { find: async () => [] } as never,
    {} as never,
    {} as never
  );

  await assert.rejects(
    service.update(
      { tenantId: "tenant-a", parkId: "park-a" },
      "actor-1",
      role.id,
      {
        dataScope: "org_and_children",
        dataScopeConfig: { orgIds: ["00000000-0000-4000-8000-000000000099"] }
      }
    ),
    /Role dataScopeConfig org ids must reference enabled orgs in current park/
  );
});

test("role dataScopeConfig canonicalizes UUID org ids and validates inside the locked update", async () => {
  const orgId = "00000000-0000-4000-8000-000000000001";
  const upperOrgId = orgId.toUpperCase();
  const role = {
    id: "role-4",
    tenantId: "tenant-a",
    parkId: "park-a",
    roleScope: "park",
    dataScope: "org_and_children",
    dataScopeConfig: { orgIds: [upperOrgId] },
    isBuiltin: false,
    isSystem: false,
    isEditable: true,
    editable: true,
    code: "ROLE_4",
    name: "角色 4",
    parentId: null,
    rolePath: "ROLE_4",
    roleLevel: 1,
    level: 1,
    sortNo: 0,
    roleType: "custom",
    isTemplate: false,
    status: "enabled",
    isEnabled: true
  };
  const queries: Array<{ parameters: unknown[] }> = [];
  const saved: unknown[] = [];
  const roleBuilder = {
    setLock: () => roleBuilder,
    where: () => roleBuilder,
    andWhere: () => roleBuilder,
    getOne: async () => ({ ...role })
  };
  const roleRepository = {
    createQueryBuilder: () => roleBuilder,
    query: async (_sql: string, parameters: unknown[]) => {
      queries.push({ parameters });
      return [{ id: orgId }];
    },
    save: async (value: unknown) => { saved.push(value); return value; }
  };
  const manager = {
    getRepository: () => roleRepository
  };
  const service = new RolesService(
    {
      findOne: async () => role,
      manager: { transaction: async (callback: (value: typeof manager) => unknown) => callback(manager) }
    } as never,
    {} as never,
    { find: async () => [] } as never,
    {} as never,
    {} as never
  );

  await service.update(
    { tenantId: "tenant-a", parkId: "park-a" },
    "actor-1",
    role.id,
    { dataScope: "org_and_children" }
  );

  assert.deepEqual(queries[0]?.parameters, ["tenant-a", "park-a", [orgId]]);
  assert.equal((saved[0] as { dataScope?: string }).dataScope, "org_and_children");
});

test("tenant role dataScopeConfig validates org ids against the locked role owner park", async () => {
  const orgId = "00000000-0000-4000-8000-000000000001";
  const role = {
    id: "role-5",
    tenantId: "tenant-a",
    parkId: "park-a",
    roleScope: "tenant",
    dataScope: "org_and_children",
    dataScopeConfig: { orgIds: [orgId] },
    isBuiltin: false,
    isSystem: false,
    isEditable: true,
    editable: true,
    code: "ROLE_5",
    name: "角色 5",
    parentId: null,
    rolePath: "ROLE_5",
    roleLevel: 1,
    level: 1,
    sortNo: 0,
    roleType: "custom",
    isTemplate: false,
    status: "enabled",
    isEnabled: true
  };
  const queries: Array<{ parameters: unknown[] }> = [];
  const roleBuilder = {
    setLock: () => roleBuilder,
    where: () => roleBuilder,
    andWhere: () => roleBuilder,
    getOne: async () => ({ ...role })
  };
  const roleRepository = {
    createQueryBuilder: () => roleBuilder,
    query: async (_sql: string, parameters: unknown[]) => {
      queries.push({ parameters });
      return [{ id: orgId }];
    },
    save: async (value: unknown) => value
  };
  const manager = {
    getRepository: () => roleRepository
  };
  const service = new RolesService(
    {
      findOne: async () => role,
      manager: { transaction: async (callback: (value: typeof manager) => unknown) => callback(manager) }
    } as never,
    {} as never,
    { find: async () => [] } as never,
    {} as never,
    {} as never
  );

  await service.update(
    { tenantId: "tenant-a", parkId: "park-b" },
    "actor-1",
    role.id,
    { dataScopeConfig: { orgIds: [orgId] } }
  );

  assert.deepEqual(queries[0]?.parameters, ["tenant-a", "park-a", [orgId]]);
});

test("role dataScopeConfig validates explicit tenant and park ids", () => {
  const source = readFileSync(resolve(__dirname, "roles.service.ts"), "utf8");
  assert.match(source, /validateRoleDataScopeConfig\(scope, dataScope, dataScopeConfig, this\.rolesRepository\)/);
  assert.match(source, /const lockedDataScope = dto\.dataScope \?\? lockedRole\.dataScope/);
  assert.match(source, /parkId: lockedRole\.parkId \?\? scope\.parkId/);
  assert.match(source, /validateRoleDataScopeConfig\([\s\S]*lockedDataScope,[\s\S]*lockedDataScopeConfig,[\s\S]*manager\.getRepository\(RoleEntity\)/);
  assert.match(source, /Role dataScopeConfig tenant ids must stay in current tenant/);
  assert.match(source, /SELECT park_id AS id FROM biz_park/);
  assert.match(source, /Custom role dataScopeConfig must use tenantIds, parkIds, or orgIds/);
});

test("role scope is locked in the edit form", () => {
  const source = readFileSync(resolve(__dirname, "../../../../web/app/system/roles/page.tsx"), "utf8");
  assert.match(source, /disabled=\{formMode === "edit"\}/);
});
