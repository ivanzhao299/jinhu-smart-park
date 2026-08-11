import assert from "node:assert/strict";
import test from "node:test";
import { FieldPolicyService } from "./field-policy.service";

test("shared tenant role field-policy assignments update only the caller park", async () => {
  let roleWhere: unknown;
  let policyWhere: unknown;
  let linkUpdateWhere: unknown;
  const service = new FieldPolicyService(
    {
      find: async (options: { where: unknown }) => {
        policyWhere = options.where;
        return [{ id: "policy-b" }];
      }
    } as never,
    {
      update: async (where: unknown) => {
        linkUpdateWhere = where;
      },
      create: (value: unknown) => value,
      save: async (value: unknown) => value
    } as never,
    {
      findOne: async (options: { where: unknown }) => {
        roleWhere = options.where;
        return { id: "role-1", roleScope: "tenant" };
      }
    } as never,
    {} as never
  );

  await service.assignRolePolicies(
    { tenantId: "tenant-a", parkId: "park-b" },
    "actor-1",
    "role-1",
    { fieldPolicyIds: ["policy-b"] }
  );

  assert.deepEqual(roleWhere, [
    { id: "role-1", tenantId: "tenant-a", roleScope: "tenant", isDeleted: false },
    { id: "role-1", tenantId: "tenant-a", parkId: "park-b", roleScope: "park", isDeleted: false }
  ]);
  assert.equal((policyWhere as { parkId?: string }).parkId, "park-b");
  assert.deepEqual(linkUpdateWhere, {
    tenantId: "tenant-a",
    parkId: "park-b",
    roleId: "role-1",
    isDeleted: false
  });
});

test("field-policy runtime resolves user and role-policy links in the current park", async () => {
  const userRoleWhere: unknown[] = [];
  const rolePolicyWhere: unknown[] = [];
  const service = new FieldPolicyService(
    {} as never,
    {
      find: async (options: { where: unknown }) => {
        rolePolicyWhere.push(options.where);
        return [];
      }
    } as never,
    {} as never,
    {
      find: async (options: { where: unknown }) => {
        userRoleWhere.push(options.where);
        return [
          {
            roleId: "role-1",
            role: {
              tenantId: "tenant-a",
              parkId: "park-a",
              roleScope: "tenant",
              isDeleted: false,
              isEnabled: true
            }
          }
        ];
      }
    } as never
  );

  await service.getUserFieldPolicies(
    { tenantId: "tenant-a", parkId: "park-b" },
    {
      sub: "user-1",
      username: "user",
      tenantId: "tenant-a",
      parkId: "park-b",
      roles: [],
      permissions: []
    }
  );

  assert.deepEqual(userRoleWhere[0], {
    tenantId: "tenant-a",
    parkId: "park-b",
    userId: "user-1",
    isDeleted: false
  });
  assert.equal((rolePolicyWhere[0] as { parkId?: string }).parkId, "park-b");
});
