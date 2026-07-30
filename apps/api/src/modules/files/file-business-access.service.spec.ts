import assert from "node:assert/strict";
import test from "node:test";
import { ConflictException, ForbiddenException } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { FileBusinessAccessService } from "./file-business-access.service";

const scope: TenantParkScope = { tenantId: "tenant-1", parkId: "park-1" };

function actor(permissions: string[], sub = "user-1"): JwtPrincipal {
  return {
    sub,
    username: sub,
    tenantId: scope.tenantId,
    parkId: scope.parkId,
    roles: [],
    permissions
  };
}

test("protected housing files require their business permission", async () => {
  const service = new FileBusinessAccessService(
    { query: async () => [{ unit_id: "unit-1" }] } as never,
    { assertAccess: async () => ({ id: "unit-1" }) } as never
  );

  await assert.rejects(
    service.assertReferenceAccess(
      scope,
      actor([]),
      "housing_lease_signature",
      "lease-1",
      "read"
    ),
    ForbiddenException
  );
  assert.equal(service.isProtectedBizType("housing_handover_move_in"), true);
  assert.equal(service.isProtectedBizType("housing_handover_move_out"), true);
});

test("protected file references are resolved inside tenant and park before unit scope", async () => {
  const queries: unknown[][] = [];
  const checkedUnits: string[] = [];
  const service = new FileBusinessAccessService(
    {
      query: async (_sql: string, parameters: unknown[]) => {
        queries.push(parameters);
        return [{ unit_id: "unit-1" }];
      }
    } as never,
    {
      assertAccess: async (_scope: TenantParkScope, _actor: JwtPrincipal, unitId: string) => {
        checkedUnits.push(unitId);
        return { id: unitId };
      }
    } as never
  );

  await service.assertReferenceAccess(
    scope,
    actor([SYSTEM_PERMISSIONS.HOUSING_LEASE_READ]),
    "housing_handover",
    "lease-1",
    "read"
  );
  assert.deepEqual(queries, [["lease-1", "tenant-1", "park-1"]]);
  assert.deepEqual(checkedUnits, ["unit-1"]);
});

test("lease readers and signers can recover lease signature evidence", async () => {
  const service = new FileBusinessAccessService(
    { query: async () => [{ unit_id: "unit-1" }] } as never,
    { assertAccess: async () => ({ id: "unit-1" }) } as never
  );

  for (const permission of [
    SYSTEM_PERMISSIONS.HOUSING_LEASE_READ,
    SYSTEM_PERMISSIONS.HOUSING_LEASE_SIGN
  ]) {
    await assert.doesNotReject(
      service.assertReferenceAccess(
        scope,
        actor([permission]),
        "housing_lease_signature",
        "lease-1",
        "read"
      )
    );
  }
});

test("handover managers can read every supported handover evidence type", async () => {
  const service = new FileBusinessAccessService(
    { query: async () => [{ unit_id: "unit-1" }] } as never,
    { assertAccess: async () => ({ id: "unit-1" }) } as never
  );

  for (const bizType of [
    "housing_handover",
    "housing_handover_move_in",
    "housing_handover_move_out"
  ]) {
    await assert.doesNotReject(
      service.assertReferenceAccess(
        scope,
        actor([SYSTEM_PERMISSIONS.HOUSING_HANDOVER_MANAGE]),
        bizType,
        "lease-1",
        "read"
      )
    );
  }
});

test("unassociated purchase receipts remain private to their uploader", () => {
  const service = new FileBusinessAccessService({} as never, {} as never);
  assert.throws(
    () => service.assertPendingFileOwner(
      actor([SYSTEM_PERMISSIONS.HOUSING_PURCHASE_READ], "other-user"),
      { bizType: "housing_purchase", bizId: null, createBy: "owner-user" } as never
    ),
    ForbiddenException
  );
});

test("purchase managers can recover their own pending receipts", async () => {
  const service = new FileBusinessAccessService({} as never, {} as never);
  await assert.doesNotReject(
    service.assertReferenceAccess(
      scope,
      actor([SYSTEM_PERMISSIONS.HOUSING_PURCHASE_MANAGE], "owner-user"),
      "housing_purchase",
      undefined,
      "read",
      "owner-user"
    )
  );
});

test("housing repair evidence requires repair or lease permission and unit scope", async () => {
  const checkedUnits: string[] = [];
  const service = new FileBusinessAccessService(
    { query: async () => [{ unit_id: "unit-1" }] } as never,
    {
      assertAccess: async (_scope: TenantParkScope, _actor: JwtPrincipal, unitId: string) => {
        checkedUnits.push(unitId);
        return { id: unitId };
      }
    } as never
  );

  await assert.rejects(
    service.assertReferenceAccess(scope, actor([SYSTEM_PERMISSIONS.FILE_READ]), "housing_repair", "lease-1", "read"),
    ForbiddenException
  );
  await service.assertReferenceAccess(
    scope,
    actor([SYSTEM_PERMISSIONS.HOUSING_REPAIR_MANAGE]),
    "housing_repair",
    "lease-1",
    "read"
  );
  assert.deepEqual(checkedUnits, ["unit-1"]);
});

test("project-wide purchase files require unrestricted property scope", async () => {
  const restricted = new FileBusinessAccessService(
    { query: async () => [{ unit_id: null }] } as never,
    { allowedUnitIds: async () => ["unit-1"] } as never
  );
  await assert.rejects(
    restricted.assertReferenceAccess(
      scope,
      actor([SYSTEM_PERMISSIONS.HOUSING_PURCHASE_READ]),
      "housing_purchase",
      "purchase-1",
      "read"
    ),
    ForbiddenException
  );

  const unrestricted = new FileBusinessAccessService(
    { query: async () => [{ unit_id: null }] } as never,
    { allowedUnitIds: async () => null } as never
  );
  await assert.doesNotReject(
    unrestricted.assertReferenceAccess(
      scope,
      actor([SYSTEM_PERMISSIONS.HOUSING_PURCHASE_READ]),
      "housing_purchase",
      "purchase-1",
      "read"
    )
  );
});

test("referenced business evidence cannot be deleted through the generic file endpoint", async () => {
  const referenced = new FileBusinessAccessService(
    { manager: { query: async () => [{ "?column?": 1 }] } } as never,
    {} as never
  );
  await assert.rejects(
    referenced.assertDeletionAllowed(scope, {
      id: "11111111-1111-4111-8111-111111111111",
      bizType: "housing_purchase",
      bizId: "22222222-2222-4222-8222-222222222222"
    } as never),
    ConflictException
  );

  const pending = new FileBusinessAccessService(
    { manager: { query: async () => [] } } as never,
    {} as never
  );
  await assert.doesNotReject(
    pending.assertDeletionAllowed(scope, {
      id: "11111111-1111-4111-8111-111111111111",
      bizType: "housing_handover",
      bizId: "22222222-2222-4222-8222-222222222222"
    } as never)
  );
});
