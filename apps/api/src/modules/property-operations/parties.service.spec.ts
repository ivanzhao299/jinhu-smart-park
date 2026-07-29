import assert from "node:assert/strict";
import test from "node:test";
import type { TenantParkScope } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { PartiesService } from "./parties.service";

const scope: TenantParkScope = { tenantId: "tenant-1", parkId: "park-1" };
const actor: JwtPrincipal = {
  sub: "user-1",
  username: "user-1",
  tenantId: scope.tenantId,
  parkId: scope.parkId,
  roles: [],
  permissions: []
};

test("concurrent duplicate party-role creation returns the committed relation", async () => {
  const concurrent = { id: "role-1", roleType: "tenant", sourceType: null, sourceId: null };
  const created: Array<Record<string, unknown>> = [];
  let findCount = 0;
  const rolesRepository = {
    findOne: async () => {
      findCount += 1;
      return findCount === 1 ? null : concurrent;
    },
    create: (value: Record<string, unknown>) => {
      created.push(value);
      return value;
    },
    save: async () => {
      throw Object.assign(new Error("duplicate"), { code: "23505" });
    }
  };
  const service = new PartiesService({} as never, rolesRepository as never, {} as never);
  Object.defineProperty(service, "mustFind", { value: async () => ({ id: "party-1" }) });

  const result = await service.addRole(scope, actor, {
    party_id: "party-1",
    role_type: " tenant ",
    source_type: undefined,
    source_id: undefined,
    remark: undefined
  });

  assert.equal(result, concurrent);
  assert.equal(findCount, 2);
  assert.equal(created[0]?.roleType, "tenant");
  assert.equal(created[0]?.sourceType, null);
  assert.equal(created[0]?.sourceId, null);
});

test("party-role creation does not hide unrelated persistence failures", async () => {
  const failure = Object.assign(new Error("database unavailable"), { code: "57P01" });
  const rolesRepository = {
    findOne: async () => null,
    create: (value: Record<string, unknown>) => value,
    save: async () => {
      throw failure;
    }
  };
  const service = new PartiesService({} as never, rolesRepository as never, {} as never);
  Object.defineProperty(service, "mustFind", { value: async () => ({ id: "party-1" }) });

  await assert.rejects(
    service.addRole(scope, actor, {
      party_id: "party-1",
      role_type: "tenant",
      source_type: undefined,
      source_id: undefined,
      remark: undefined
    }),
    failure
  );
});
