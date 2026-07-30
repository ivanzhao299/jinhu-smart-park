import assert from "node:assert/strict";
import test from "node:test";
import { ConflictException, ForbiddenException } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { FileBusinessAccessService } from "./file-business-access.service";

const scope: TenantParkScope = { tenantId: "tenant-1", parkId: "park-1" };
const unrestrictedDataScopes = {
  buildScopeFilter: async (_actor: JwtPrincipal, dimension: string) => ({
    dimension,
    unrestricted: true,
    allowed_ids: []
  })
} as never;

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
    { assertAccess: async () => ({ id: "unit-1" }) } as never,
    unrestrictedDataScopes
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
    } as never,
    unrestrictedDataScopes
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
    { assertAccess: async () => ({ id: "unit-1" }) } as never,
    unrestrictedDataScopes
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
    { assertAccess: async () => ({ id: "unit-1" }) } as never,
    unrestrictedDataScopes
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
  const service = new FileBusinessAccessService({} as never, {} as never, unrestrictedDataScopes);
  assert.throws(
    () => service.assertPendingFileOwner(
      actor([SYSTEM_PERMISSIONS.HOUSING_PURCHASE_READ], "other-user"),
      { bizType: "housing_purchase", bizId: null, createBy: "owner-user" } as never
    ),
    ForbiddenException
  );
});

test("purchase managers can recover their own pending receipts", async () => {
  const service = new FileBusinessAccessService({} as never, {} as never, unrestrictedDataScopes);
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
    } as never,
    unrestrictedDataScopes
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
    { allowedUnitIds: async () => ["unit-1"] } as never,
    unrestrictedDataScopes
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
    { allowedUnitIds: async () => null } as never,
    unrestrictedDataScopes
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
    {} as never,
    unrestrictedDataScopes
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
    {} as never,
    unrestrictedDataScopes
  );
  await assert.doesNotReject(
    pending.assertDeletionAllowed(scope, {
      id: "11111111-1111-4111-8111-111111111111",
      bizType: "housing_handover",
      bizId: "22222222-2222-4222-8222-222222222222"
    } as never)
  );
});

test("deleting a floorplan clears only its scoped owning floor reference", async () => {
  const calls: Array<{ sql: string; parameters: unknown[] }> = [];
  const service = new FileBusinessAccessService({} as never, {} as never, unrestrictedDataScopes);
  await service.detachReferencesOnDelete(
    scope,
    {
      id: "11111111-1111-4111-8111-111111111111",
      bizType: "floorplan",
      bizId: "22222222-2222-4222-8222-222222222222"
    } as never,
    actor([SYSTEM_PERMISSIONS.FLOOR_UPLOAD_LAYOUT]),
    {
      query: async (sql: string, parameters: unknown[]) => {
        calls.push({ sql, parameters });
        if (sql.includes("SELECT id")) {
          return [{
            id: "22222222-2222-4222-8222-222222222222",
            park_id: scope.parkId,
            building_id: "building-1"
          }];
        }
        return [];
      }
    } as never
  );

  assert.equal(calls.length, 2);
  assert.match(calls[1]!.sql, /layout_file_id = \$5::uuid/);
  assert.match(calls[1]!.sql, /tenant_id = \$2/);
  assert.match(calls[1]!.sql, /park_id = \$3/);
  assert.deepEqual(calls[1]!.parameters, [
    "user-1",
    "tenant-1",
    "park-1",
    "22222222-2222-4222-8222-222222222222",
    "11111111-1111-4111-8111-111111111111"
  ]);
});

test("deleting an unrelated file does not update floor references", async () => {
  let queryCount = 0;
  const service = new FileBusinessAccessService({} as never, {} as never, unrestrictedDataScopes);
  await service.detachReferencesOnDelete(
    scope,
    { id: "file-1", bizType: "general", bizId: "floor-1" } as never,
    actor([]),
    { query: async () => { queryCount += 1; } } as never
  );
  assert.equal(queryCount, 0);
});

test("floorplan deletion requires floor layout permission and floor data scope", async () => {
  const floorRow = {
    id: "22222222-2222-4222-8222-222222222222",
    park_id: scope.parkId,
    building_id: "building-1"
  };
  const manager = {
    query: async (sql: string) => sql.includes("SELECT id")
      ? [floorRow]
      : []
  } as never;
  const restricted = new FileBusinessAccessService(
    { manager } as never,
    {} as never,
    {
      buildScopeFilter: async (_actor: JwtPrincipal, dimension: string) => ({
        dimension,
        unrestricted: dimension !== "building",
        allowed_ids: dimension === "building" ? ["building-2"] : []
      })
    } as never
  );
  const file = {
    id: "11111111-1111-4111-8111-111111111111",
    bizType: "floorplan",
    bizId: floorRow.id
  } as never;

  await assert.rejects(
    restricted.detachReferencesOnDelete(
      scope,
      file,
      actor([SYSTEM_PERMISSIONS.FILE_DELETE]),
      manager
    ),
    ForbiddenException
  );
  await assert.rejects(
    restricted.detachReferencesOnDelete(
      scope,
      file,
      actor([SYSTEM_PERMISSIONS.FLOOR_UPLOAD_LAYOUT]),
      manager
    ),
    /outside current data scope/
  );
});
