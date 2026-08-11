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
  assert.equal((policyWhere as { tenantId?: string }).tenantId, "tenant-a");
  assert.equal((policyWhere as { parkId?: string }).parkId, undefined);
  assert.deepEqual(linkUpdateWhere, {
    tenantId: "tenant-a",
    parkId: "park-b",
    roleId: "role-1",
    isDeleted: false
  });
});

test("field-policy definitions are tenant-wide while bindings stay park-scoped", async () => {
  let detailWhere: unknown;
  let boundCountWhere: unknown;
  const policy = { id: "policy-a", tenantId: "tenant-a", parkId: "park-a", isDeleted: false };
  const service = new FieldPolicyService(
    {
      findOne: async (options: { where: unknown }) => { detailWhere = options.where; return policy; },
      save: async (value: unknown) => value
    } as never,
    {
      count: async (options: { where: unknown }) => { boundCountWhere = options.where; return 0; }
    } as never,
    {} as never,
    {} as never
  );

  await service.softDelete({ tenantId: "tenant-a", parkId: "park-b" }, "actor-1", policy.id);

  assert.deepEqual(detailWhere, { id: policy.id, tenantId: "tenant-a", isDeleted: false });
  assert.deepEqual(boundCountWhere, { tenantId: "tenant-a", fieldPolicyId: policy.id, isDeleted: false });
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

test("invalid field-policy assignment preserves existing park bindings", async () => {
  let linkUpdateCount = 0;
  const service = new FieldPolicyService(
    { find: async () => [] } as never,
    { update: async () => { linkUpdateCount += 1; } } as never,
    { findOne: async () => ({ id: "role-1", roleScope: "tenant" }) } as never,
    {} as never
  );

  await assert.rejects(
    service.assignRolePolicies(
      { tenantId: "tenant-a", parkId: "park-b" },
      "actor-1",
      "role-1",
      { fieldPolicyIds: ["missing-policy"] }
    ),
    /Field policy not found in current tenant/
  );
  assert.equal(linkUpdateCount, 0);
});
