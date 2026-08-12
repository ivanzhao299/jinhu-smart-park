import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { RolesService } from "./roles.service";

test("role detail attaches only permission links from the caller's park", async () => {
  const role = { id: "role-1", tenantId: "tenant-a", parkId: "park-a", roleScope: "tenant" };
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
});

test("role copy is transactional and carries permission, field and current-park scope links", () => {
  const source = readFileSync(resolve(__dirname, "roles.service.ts"), "utf8");

  assert.match(source, /attachPermissionLinks\(scope, items\)/);
  assert.match(source, /attachPermissionLinks\(scope, \[role\]\)/);
  assert.match(source, /rolesRepository\.manager\.transaction/);
  assert.match(source, /getRepository\(RoleDataScopeEntity\)/);
  assert.match(source, /where: \{ tenantId: scope\.tenantId, parkId: scope\.parkId, roleId: source\.id, isDeleted: false \}/);
  assert.match(source, /overridesDataScope = !isManagedPropertyTemplate[\s\S]*dto\.dataScope !== undefined \|\| dto\.dataScopeConfig !== undefined/);
  assert.match(source, /overridesDataScope[\s\S]*Promise\.resolve\(\[\]\)[\s\S]*dataScopeRepository\.find/);
  assert.match(source, /appliedBundleCodes: isManagedPropertyTemplate \? \[\]/);
  assert.match(source, /appliedBundleSignature: isManagedPropertyTemplate \? null/);
});

test("all direct binding mutations reject protected roles and permission updates share the role lock", () => {
  const rolesSource = readFileSync(resolve(__dirname, "roles.service.ts"), "utf8");
  const dataScopeSource = readFileSync(resolve(__dirname, "../data-scopes/data-scope.service.ts"), "utf8");
  const fieldPolicySource = readFileSync(resolve(__dirname, "../field-policies/field-policy.service.ts"), "utf8");

  assert.match(rolesSource, /assignPermissions[\s\S]*manager\.transaction[\s\S]*lockEditableRole/);
  assert.match(rolesSource, /role\.appliedBundleCodes = \[\]/);
  assert.match(rolesSource, /role\.appliedBundleSignature = null/);
  assert.match(rolesSource, /assignFieldPermissions[\s\S]*assertBindingsEditable/);
  assert.match(dataScopeSource, /assignRoleRules[\s\S]*Protected role bindings cannot be changed/);
  assert.match(fieldPolicySource, /assignRolePolicies[\s\S]*Protected role bindings cannot be changed/);
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

test("role scope is locked in the edit form", () => {
  const source = readFileSync(resolve(__dirname, "../../../../web/app/system/roles/page.tsx"), "utf8");
  assert.match(source, /disabled=\{formMode === "edit"\}/);
});
