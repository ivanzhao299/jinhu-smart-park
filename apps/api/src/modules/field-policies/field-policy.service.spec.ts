import assert from "node:assert/strict";
import test from "node:test";
import { FieldPolicyService } from "./field-policy.service";

test("shared tenant role field-policy assignments update only the caller park", async () => {
  let roleWhere: unknown;
  let policyWhere: unknown;
  let linkUpdateWhere: unknown;
  let transactionCount = 0;
  const linksRepository = {
    update: async (where: unknown) => {
      linkUpdateWhere = where;
    },
    create: (value: unknown) => value,
    save: async (value: unknown) => value
  };
  const roleQuery = {
    setLock: () => roleQuery,
    where: (_sql: string, values: unknown) => { roleWhere = values; return roleQuery; },
    andWhere: () => roleQuery,
    getOne: async () => ({ id: "role-1", roleScope: "tenant", isTemplate: false, isSystem: false, isBuiltin: false, editable: true, isEditable: true })
  };
  const service = new FieldPolicyService(
    {
      find: async (options: { where: unknown }) => {
        policyWhere = options.where;
        return [{ id: "policy-b" }];
      }
    } as never,
    {
      manager: {
        transaction: async (callback: (manager: { getRepository: (entity: { name: string }) => unknown }) => Promise<void>) => {
          transactionCount += 1;
          await callback({
            getRepository: (entity) => entity.name === "RoleEntity"
              ? { createQueryBuilder: () => roleQuery }
              : linksRepository
          });
        }
      }
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

  assert.deepEqual(roleWhere, { roleId: "role-1" });
  assert.equal((policyWhere as { tenantId?: string }).tenantId, "tenant-a");
  assert.equal((policyWhere as { parkId?: string }).parkId, undefined);
  assert.deepEqual(linkUpdateWhere, {
    tenantId: "tenant-a",
    parkId: "park-b",
    roleId: "role-1",
    isDeleted: false
  });
  assert.equal(transactionCount, 1);
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

test("nested property projections enforce hidden and masked policies without mutating input", async () => {
  const policies = [
    { tenantId: "tenant-a", module: "homestay", entity: "booking", fieldKey: "booking.room_amount", fieldName: "房费", policyType: "masked", maskRule: "amount", status: "enabled", isDeleted: false },
    { tenantId: "tenant-a", module: "homestay", entity: "turnover", fieldKey: "turnover.room_amount", fieldName: "周转房费", policyType: "masked", maskRule: "amount", status: "enabled", isDeleted: false },
    { tenantId: "tenant-a", module: "homestay", entity: "ledger", fieldKey: "ledger.amount", fieldName: "流水金额", policyType: "hidden", maskRule: null, status: "enabled", isDeleted: false },
    { tenantId: "tenant-a", module: "homestay", entity: "ledger", fieldKey: "ledger_summary", fieldName: "汇总", policyType: "hidden", maskRule: null, status: "enabled", isDeleted: false }
  ];
  const service = new FieldPolicyService(
    {} as never,
    { find: async () => policies.map((fieldPolicy) => ({ fieldPolicy })) } as never,
    {} as never,
    { find: async () => [{ roleId: "role-1", role: { tenantId: "tenant-a", parkId: "park-a", roleScope: "park", isDeleted: false, isEnabled: true } }] } as never
  );
  const input = { booking: { roomAmount: "120.00", status: "confirmed" }, ledger: [{ id: "one", amount: "20.00" }, { id: "two", amount: "30.00" }], ledger_summary: { balance: "50.00" } };
  const projected = await service.applyFieldPoliciesToProjection(
    { tenantId: "tenant-a", parkId: "park-a" },
    { sub: "user-1", username: "operator", tenantId: "tenant-a", parkId: "park-a", roles: [], permissions: [] },
    "homestay",
    input
  );

  assert.equal(projected.booking.roomAmount, "***");
  assert.equal("amount" in projected.ledger[0]!, false);
  assert.equal("amount" in projected.ledger[1]!, false);
  assert.equal("ledger_summary" in projected, false);
  assert.equal(input.booking.roomAmount, "120.00");
  assert.equal(input.ledger[0]!.amount, "20.00");
  const listProjected = await service.applyFieldPoliciesToProjection(
    { tenantId: "tenant-a", parkId: "park-a" },
    { sub: "user-1", username: "operator", tenantId: "tenant-a", parkId: "park-a", roles: [], permissions: [] },
    "homestay",
    { items: [{ roomAmount: "90.00" }] },
    "booking"
  );
  assert.equal(listProjected.items[0]!.roomAmount, "***");
  const turnoverProjected = await service.applyFieldPoliciesToProjection(
    { tenantId: "tenant-a", parkId: "park-a" },
    { sub: "user-1", username: "operator", tenantId: "tenant-a", parkId: "park-a", roles: [], permissions: [] },
    "homestay",
    { items: [{ roomAmount: "80.00", nested: { items: [{ roomAmount: "60.00" }] } }] },
    "turnover"
  );
  assert.equal(turnoverProjected.items[0]!.roomAmount, "***");
  assert.equal(turnoverProjected.items[0]!.nested.items[0]!.roomAmount, "60.00");
});

test("projection fallback is limited to the policy entity and masks composite values structurally", async () => {
  const policies = [
    { tenantId: "tenant-a", module: "housing_rental", entity: "ledger", fieldKey: "ledger.amount", fieldName: "流水金额", policyType: "hidden", maskRule: null, status: "enabled", isDeleted: false },
    { tenantId: "tenant-a", module: "housing_rental", entity: "handover", fieldKey: "handover.credentials", fieldName: "凭证", policyType: "masked", maskRule: "custom", status: "enabled", isDeleted: false }
  ];
  const service = new FieldPolicyService(
    {} as never,
    { find: async () => policies.map((fieldPolicy) => ({ fieldPolicy })) } as never,
    {} as never,
    { find: async () => [{ roleId: "role-1", role: { tenantId: "tenant-a", parkId: "park-a", roleScope: "park", isDeleted: false, isEnabled: true } }] } as never
  );
  const purchase = await service.applyFieldPoliciesToProjection(
    { tenantId: "tenant-a", parkId: "park-a" },
    { sub: "user-1", username: "operator", tenantId: "tenant-a", parkId: "park-a", roles: [], permissions: [] },
    "housing_rental",
    { items: [{ amount: "88.00" }], nested: { amount: "66.00" } },
    "purchase"
  );
  assert.equal(purchase.items[0]!.amount, "88.00");
  assert.equal(purchase.nested.amount, "66.00");
  const ledgerSources = await service.applyFieldPoliciesToProjection(
    { tenantId: "tenant-a", parkId: "park-a" },
    { sub: "user-1", username: "operator", tenantId: "tenant-a", parkId: "park-a", roles: [], permissions: [] },
    "housing_rental",
    [{ id: "source-1", amount: "88.00", availableAmount: "12.00", unrelated: { amount: "66.00" } }],
    "ledger"
  );
  assert.equal("amount" in ledgerSources[0]!, false);
  assert.equal("availableAmount" in ledgerSources[0]!, false);
  assert.equal(ledgerSources[0]!.unrelated.amount, "66.00");
  const handover = await service.applyFieldPoliciesToProjection(
    { tenantId: "tenant-a", parkId: "park-a" },
    { sub: "user-1", username: "operator", tenantId: "tenant-a", parkId: "park-a", roles: [], permissions: [] },
    "housing_rental",
    { handover: { credentials: [{ code: "ABCD1234", label: "门禁卡" }] } },
    "handover"
  );
  assert.deepEqual(handover.handover.credentials, [{ code: "AB***34", label: "****" }]);
});

test("field policies cannot weaken an already masked credential projection", async () => {
  const policy = { tenantId: "tenant-a", module: "housing_rental", entity: "handover", fieldKey: "handover.credentials", fieldName: "凭证", policyType: "visible", maskRule: null, status: "enabled", isDeleted: false };
  const service = new FieldPolicyService(
    {} as never,
    { find: async () => [{ fieldPolicy: policy }] } as never,
    {} as never,
    { find: async () => [{ roleId: "role-1", role: { tenantId: "tenant-a", parkId: "park-a", roleScope: "park", isDeleted: false, isEnabled: true } }] } as never
  );
  const input = { handover: { credentials: ["AB***YZ"] } };
  const projected = await service.applyFieldPoliciesToProjection(
    { tenantId: "tenant-a", parkId: "park-a" },
    { sub: "user-1", username: "operator", tenantId: "tenant-a", parkId: "park-a", roles: [], permissions: [] },
    "housing_rental",
    input
  );
  assert.deepEqual(projected, input);
});
