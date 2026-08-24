import assert from "node:assert/strict";
import test from "node:test";
import { ConflictException, ForbiddenException } from "@nestjs/common";
import {
  HR_PERMISSIONS,
  PROPERTY_BUSINESS_PERMISSIONS,
  SYSTEM_PERMISSIONS,
  type TenantParkScope
} from "@jinhu/shared";
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

test("candidate evidence is scoped and never readable with manager-only permissions",async()=>{
 const calls:unknown[][]=[];
 const service=new FileBusinessAccessService({query:async(_sql:string,params:unknown[])=>{calls.push(params);return [{exists:1}];}} as never,{} as never,unrestrictedDataScopes);
 await assert.rejects(service.assertReferenceAccess(scope,actor([HR_PERMISSIONS.HR_REQUISITION_TEAM_READ]),"hr_candidate_resume","candidate-1","read"),ForbiddenException);
 assert.equal(calls.length,0);
 await assert.doesNotReject(service.assertReferenceAccess(scope,actor([HR_PERMISSIONS.HR_RECRUITMENT_DOCUMENT_READ]),"hr_candidate_resume","candidate-1","download"));
 assert.deepEqual(calls,[['candidate-1','tenant-1','park-1']]);
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

test("handover readers and managers can read every supported handover evidence type", async () => {
  const service = new FileBusinessAccessService(
    { query: async () => [{ unit_id: "unit-1" }] } as never,
    { assertAccess: async () => ({ id: "unit-1" }) } as never,
    unrestrictedDataScopes
  );

  for (const permission of [
    SYSTEM_PERMISSIONS.HOUSING_HANDOVER_READ,
    SYSTEM_PERMISSIONS.HOUSING_HANDOVER_MANAGE
  ]) {
    for (const bizType of [
      "housing_handover",
      "housing_handover_move_in",
      "housing_handover_move_out"
    ]) {
      await assert.doesNotReject(
        service.assertReferenceAccess(scope, actor([permission]), bizType, "lease-1", "read")
      );
    }
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
  for (const permission of [
    SYSTEM_PERMISSIONS.HOUSING_REPAIR_READ,
    SYSTEM_PERMISSIONS.HOUSING_REPAIR_MANAGE
  ]) {
    await service.assertReferenceAccess(
      scope,
      actor([permission]),
      "housing_repair",
      "lease-1",
      "read"
    );
  }
  assert.deepEqual(checkedUnits, ["unit-1", "unit-1"]);
});

test("housing repair deletion requires manage permission and a lease in the current tenant and park", async () => {
  let queries = 0;
  const denied = new FileBusinessAccessService(
    {
      query: async (_sql: string, parameters: unknown[]) => {
        queries += 1;
        assert.deepEqual(parameters, ["lease-1", scope.tenantId, scope.parkId]);
        return [];
      }
    } as never,
    { assertAccess: async () => ({ id: "unit-1" }) } as never,
    unrestrictedDataScopes
  );

  await assert.rejects(
    denied.assertReferenceAccess(
      scope,
      actor([SYSTEM_PERMISSIONS.HOUSING_REPAIR_READ]),
      "housing_repair",
      "lease-1",
      "delete"
    ),
    ForbiddenException
  );
  assert.equal(queries, 0, "permission denial must happen before reference lookup");

  await assert.rejects(
    denied.assertReferenceAccess(
      scope,
      actor([SYSTEM_PERMISSIONS.HOUSING_REPAIR_MANAGE]),
      "housing_repair",
      "lease-1",
      "delete"
    ),
    /outside the current tenant or park/u
  );
  assert.equal(queries, 1);
});

test("pending housing repair evidence uses the scoped three-parameter work-order query", async () => {
  const calls: Array<{ sql: string; parameters: unknown[] }> = [];
  const service = new FileBusinessAccessService({} as never, {} as never, unrestrictedDataScopes);

  await assert.doesNotReject(
    service.assertDeletionAllowed(
      scope,
      {
        id: "11111111-1111-4111-8111-111111111111",
        bizType: "housing_repair",
        bizId: "22222222-2222-4222-8222-222222222222"
      } as never,
      {
        query: async (sql: string, parameters: unknown[]) => {
          calls.push({ sql, parameters });
          return [];
        }
      } as never
    )
  );

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0]!.parameters, [
    "11111111-1111-4111-8111-111111111111",
    scope.tenantId,
    scope.parkId
  ]);
  assert.match(calls[0]!.sql, /FROM biz_work_order/u);
  assert.match(calls[0]!.sql, /tenant_id=\$2 AND park_id=\$3/u);
  assert.match(calls[0]!.sql, /\$1::uuid=ANY\(image_file_ids\)/u);
  assert.match(calls[0]!.sql, /is_deleted=false/u);
  assert.doesNotMatch(calls[0]!.sql, /\$4/u);
});

test("active work-order references block housing repair evidence deletion", async () => {
  const service = new FileBusinessAccessService({} as never, {} as never, unrestrictedDataScopes);

  await assert.rejects(
    service.assertDeletionAllowed(
      scope,
      {
        id: "11111111-1111-4111-8111-111111111111",
        bizType: "housing_repair",
        bizId: "22222222-2222-4222-8222-222222222222"
      } as never,
      {
        query: async (_sql: string, parameters: unknown[]) => {
          assert.equal(parameters.length, 3);
          return [{ "?column?": 1 }];
        }
      } as never
    ),
    ConflictException
  );
});

test("other protected evidence deletion keeps its biz-id parameter contract", async () => {
  const calls: Array<{ sql: string; parameters: unknown[] }> = [];
  const service = new FileBusinessAccessService({} as never, {} as never, unrestrictedDataScopes);

  await service.assertDeletionAllowed(
    scope,
    {
      id: "11111111-1111-4111-8111-111111111111",
      bizType: "housing_purchase",
      bizId: "22222222-2222-4222-8222-222222222222"
    } as never,
    {
      query: async (sql: string, parameters: unknown[]) => {
        calls.push({ sql, parameters });
        return [];
      }
    } as never
  );

  assert.deepEqual(calls[0]!.parameters, [
    "11111111-1111-4111-8111-111111111111",
    scope.tenantId,
    scope.parkId,
    "22222222-2222-4222-8222-222222222222"
  ]);
  assert.match(calls[0]!.sql, /id=\$4::uuid/u);
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

test("identity evidence is a protected business file type and generic list reads fail closed", async () => {
  const service = new FileBusinessAccessService({} as never, {} as never, unrestrictedDataScopes);
  assert.equal(service.isProtectedBizType("party_identity_evidence"), true);
  await assert.rejects(
    service.assertReferenceAccess(
      scope,
      actor([
        PROPERTY_BUSINESS_PERMISSIONS.IDENTITY_SUBMISSIONS_PAGE,
        PROPERTY_BUSINESS_PERMISSIONS.PARTY_READ,
        PROPERTY_BUSINESS_PERMISSIONS.PARTY_IDENTITY_VERIFY,
        SYSTEM_PERMISSIONS.FILE_READ
      ]),
      "party_identity_evidence",
      "11111111-1111-4111-8111-111111111111",
      "read"
    ),
    ForbiddenException
  );
});

test("identity evidence read requires exact page, party-read, verifier, and file permissions before querying", async () => {
  let queries = 0;
  const service = new FileBusinessAccessService(
    { query: async () => {
      queries += 1;
      return [{ "?column?": 1 }];
    } } as never,
    {} as never,
    unrestrictedDataScopes
  );
  const submissionId = "11111111-1111-4111-8111-111111111111";
  const fileId = "22222222-2222-4222-8222-222222222222";
  const required = [
    PROPERTY_BUSINESS_PERMISSIONS.IDENTITY_SUBMISSIONS_PAGE,
    PROPERTY_BUSINESS_PERMISSIONS.PARTY_READ,
    PROPERTY_BUSINESS_PERMISSIONS.PARTY_IDENTITY_VERIFY,
    SYSTEM_PERMISSIONS.FILE_READ
  ];
  for (const missing of required) {
    await assert.rejects(
      service.assertReferenceAccess(
        scope,
        actor(required.filter((permission) => permission !== missing)),
        "party_identity_evidence",
        submissionId,
        "read",
        undefined,
        fileId
      ),
      ForbiddenException
    );
  }
  assert.equal(queries, 0);
});

test("identity evidence metadata does not require file-download permission", async () => {
  let queries = 0;
  const service = new FileBusinessAccessService(
    { query: async () => {
      queries += 1;
      return [{ "?column?": 1 }];
    } } as never,
    {} as never,
    unrestrictedDataScopes
  );
  await assert.doesNotReject(
    service.assertReferenceAccess(
      scope,
      actor([
        PROPERTY_BUSINESS_PERMISSIONS.IDENTITY_SUBMISSIONS_PAGE,
        PROPERTY_BUSINESS_PERMISSIONS.PARTY_READ,
        PROPERTY_BUSINESS_PERMISSIONS.PARTY_IDENTITY_VERIFY,
        SYSTEM_PERMISSIONS.FILE_READ
      ]),
      "party_identity_evidence",
      "11111111-1111-4111-8111-111111111111",
      "read",
      undefined,
      "22222222-2222-4222-8222-222222222222"
    )
  );
  assert.equal(queries, 1);
});

test("identity evidence draft owner may download current draft and uploader-owned pending files without verifier permission", async () => {
  let sql = "";
  let parameters: unknown[] = [];
  const service = new FileBusinessAccessService(
    {
      query: async (statement: string, values: unknown[]) => {
        sql = statement;
        parameters = values;
        return [{ "?column?": 1 }];
      }
    } as never,
    {} as never,
    unrestrictedDataScopes
  );
  const submissionId = "11111111-1111-4111-8111-111111111111";
  const fileId = "22222222-2222-4222-8222-222222222222";
  await service.assertReferenceAccess(
    scope,
    actor([
      PROPERTY_BUSINESS_PERMISSIONS.IDENTITY_SUBMISSIONS_PAGE,
      PROPERTY_BUSINESS_PERMISSIONS.PARTY_IDENTITY_UPDATE,
      SYSTEM_PERMISSIONS.FILE_READ,
      SYSTEM_PERMISSIONS.FILE_DOWNLOAD
    ]),
    "party_identity_evidence",
    submissionId,
    "download",
    undefined,
    fileId
  );
  assert.deepEqual(parameters, [
    scope.tenantId,
    scope.parkId,
    submissionId,
    "user-1",
    fileId,
    false,
    [
      PROPERTY_BUSINESS_PERMISSIONS.IDENTITY_SUBMISSIONS_PAGE,
      PROPERTY_BUSINESS_PERMISSIONS.PARTY_IDENTITY_UPDATE,
      SYSTEM_PERMISSIONS.FILE_READ,
      SYSTEM_PERMISSIONS.FILE_DOWNLOAD
    ]
  ]);
  assert.match(sql, /submission\.status='draft'/);
  assert.match(sql, /submission\.drafted_by=\$4::uuid/);
  assert.match(sql, /rel_party_identity_draft_file/);
  assert.match(sql, /public\.sys_file pending_file/);
  assert.match(sql, /pending_file\.biz_id=submission\.id/);
  assert.match(sql, /pending_file\.create_by=\$4::uuid/);
  assert.doesNotMatch(sql, /party_identity_verification_queue/);
});

test("identity evidence denies metadata and blob before lookup when party-read or file-download is missing", async () => {
  let queries = 0;
  const service = new FileBusinessAccessService(
    { query: async () => {
      queries += 1;
      return [{ "?column?": 1 }];
    } } as never,
    {} as never,
    unrestrictedDataScopes
  );
  const base = [
    PROPERTY_BUSINESS_PERMISSIONS.IDENTITY_SUBMISSIONS_PAGE,
    PROPERTY_BUSINESS_PERMISSIONS.PARTY_IDENTITY_VERIFY,
    SYSTEM_PERMISSIONS.FILE_READ
  ];
  await assert.rejects(
    service.assertReferenceAccess(
      scope,
      actor([...base, SYSTEM_PERMISSIONS.FILE_DOWNLOAD]),
      "party_identity_evidence",
      "11111111-1111-4111-8111-111111111111",
      "read",
      undefined,
      "22222222-2222-4222-8222-222222222222"
    ),
    ForbiddenException
  );
  await assert.rejects(
    service.assertReferenceAccess(
      scope,
      actor([...base, PROPERTY_BUSINESS_PERMISSIONS.PARTY_READ]),
      "party_identity_evidence",
      "11111111-1111-4111-8111-111111111111",
      "download",
      undefined,
      "22222222-2222-4222-8222-222222222222"
    ),
    ForbiddenException
  );
  assert.equal(queries, 0);
});

test("identity evidence download revalidates current assignment, maker exclusion, policy scope, module and reference", async () => {
  let sql = "";
  let parameters: unknown[] = [];
  const service = new FileBusinessAccessService(
    {
      query: async (statement: string, values: unknown[]) => {
        sql = statement;
        parameters = values;
        return [{ "?column?": 1 }];
      }
    } as never,
    {} as never,
    unrestrictedDataScopes
  );
  const submissionId = "11111111-1111-4111-8111-111111111111";
  const fileId = "22222222-2222-4222-8222-222222222222";
  await service.assertReferenceAccess(
    scope,
    actor([
      PROPERTY_BUSINESS_PERMISSIONS.IDENTITY_SUBMISSIONS_PAGE,
      PROPERTY_BUSINESS_PERMISSIONS.PARTY_READ,
      PROPERTY_BUSINESS_PERMISSIONS.PARTY_IDENTITY_VERIFY,
      SYSTEM_PERMISSIONS.FILE_READ,
      SYSTEM_PERMISSIONS.FILE_DOWNLOAD
    ]),
    "party_identity_evidence",
    submissionId,
    "download",
    undefined,
    fileId
  );
  assert.deepEqual(parameters, [
    scope.tenantId,
    scope.parkId,
    submissionId,
    "user-1",
    fileId,
    false,
    [
      PROPERTY_BUSINESS_PERMISSIONS.IDENTITY_SUBMISSIONS_PAGE,
      PROPERTY_BUSINESS_PERMISSIONS.PARTY_READ,
      PROPERTY_BUSINESS_PERMISSIONS.PARTY_IDENTITY_VERIFY,
      SYSTEM_PERMISSIONS.FILE_READ,
      SYSTEM_PERMISSIONS.FILE_DOWNLOAD
    ]
  ]);
  for (const predicate of [
    "submission.assigned_verifier_id=$4::uuid",
    "submission.drafted_by IS DISTINCT FROM $4::uuid",
    "submission.recorded_by IS DISTINCT FROM $4::uuid",
    "submission.submitted_by IS DISTINCT FROM $4::uuid",
    "relationScope",
    "tenant-park-current",
    "dataScope",
    "party-submission",
    "asset_assignment.enabled=true",
    "asset_assignment.status='enabled'",
    "asset_assignment.is_deleted=false",
    "asset_assignment.expire_time",
    "unnest($7::varchar[])",
    "permission.code=required_permission.code",
    "draft_file.file_id=$5::uuid",
    "snapshot_file.file_id=$5::uuid"
  ]) {
    assert.ok(sql.includes(predicate), `missing identity evidence predicate: ${predicate}`);
  }
});

test("identity evidence wrong, unassigned, maker, cross-scope, and inactive-module cases return the same forbidden result", async () => {
  const service = new FileBusinessAccessService(
    { query: async () => [] } as never,
    {} as never,
    unrestrictedDataScopes
  );
  const permissions = [
    PROPERTY_BUSINESS_PERMISSIONS.IDENTITY_SUBMISSIONS_PAGE,
    PROPERTY_BUSINESS_PERMISSIONS.PARTY_READ,
    PROPERTY_BUSINESS_PERMISSIONS.PARTY_IDENTITY_VERIFY,
    SYSTEM_PERMISSIONS.FILE_READ,
    SYSTEM_PERMISSIONS.FILE_DOWNLOAD
  ];
  for (const actorId of [
    "wrong-verifier",
    "unassigned-verifier",
    "maker-verifier",
    "cross-scope-verifier",
    "module-missing",
    "module-disabled",
    "module-expired"
  ]) {
    await assert.rejects(
      service.assertReferenceAccess(
        scope,
        actor(permissions, actorId),
        "party_identity_evidence",
        "11111111-1111-4111-8111-111111111111",
        "download",
        undefined,
        "22222222-2222-4222-8222-222222222222"
      ),
      (error: unknown) => (
        error instanceof ForbiddenException
        && error.message === "Identity evidence access is forbidden"
      )
    );
  }
});

test("snapshot and draft identity evidence references permanently block generic deletion", async () => {
  for (const referenceKind of ["snapshot", "draft"]) {
    let sql = "";
    const service = new FileBusinessAccessService(
      {
        manager: {
          query: async (statement: string) => {
            sql = statement;
            return [{ "?column?": 1 }];
          }
        }
      } as never,
      {} as never,
      unrestrictedDataScopes
    );
    await assert.rejects(
      service.assertDeletionAllowed(scope, {
        id: "22222222-2222-4222-8222-222222222222",
        bizType: "party_identity_evidence",
        bizId: "11111111-1111-4111-8111-111111111111"
      } as never),
      ConflictException,
      referenceKind
    );
    assert.match(sql, /rel_party_identity_snapshot_file/);
    assert.match(sql, /rel_party_identity_draft_file/);
  }
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
