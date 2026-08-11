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

test("role copy and list contracts keep role links park-scoped", () => {
  const source = readFileSync(resolve(__dirname, "roles.service.ts"), "utf8");

  assert.match(source, /attachPermissionLinks\(scope, items\)/);
  assert.match(source, /attachPermissionLinks\(scope, \[role\]\)/);
  assert.match(source, /where: \{ tenantId: scope\.tenantId, parkId: scope\.parkId, roleId: sourceRoleId, isDeleted: false \}/);
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
