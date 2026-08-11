import assert from "node:assert/strict";
import test from "node:test";
import { SafetyInspectPlansService } from "./safety-inspect-plans.service";

test("inspection handlers accept tenant roles and current-park roles only", async () => {
  let capturedWhere: Array<Record<string, unknown>> = [];
  const rolesRepository = {
    count: async ({ where }: { where: Array<Record<string, unknown>> }) => {
      capturedWhere = where;
      return 2;
    }
  };
  const service = new SafetyInspectPlansService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    rolesRepository as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never
  );
  const assertRoles = (service as unknown as {
    assertRoles(scope: { tenantId: string; parkId: string }, roleCodes: string[]): Promise<void>;
  }).assertRoles.bind(service);

  await assertRoles({ tenantId: "tenant-a", parkId: "park-b" }, ["TENANT_ADMIN", "PARK_OPERATOR"]);

  assert.equal(capturedWhere.length, 2);
  assert.deepEqual(
    capturedWhere.map(({ tenantId, parkId, roleScope, isDeleted, status }) => ({
      tenantId,
      parkId,
      roleScope,
      isDeleted,
      status
    })),
    [
      {
        tenantId: "tenant-a",
        parkId: undefined,
        roleScope: "tenant",
        isDeleted: false,
        status: "enabled"
      },
      {
        tenantId: "tenant-a",
        parkId: "park-b",
        roleScope: "park",
        isDeleted: false,
        status: "enabled"
      }
    ]
  );
});
