import assert from "node:assert/strict";
import test from "node:test";
import { ForbiddenException } from "@nestjs/common";
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
