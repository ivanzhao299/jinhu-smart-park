import assert from "node:assert/strict";
import test from "node:test";
import type { TenantParkScope } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { HomestayService } from "./homestay.service";

const scope: TenantParkScope = { tenantId: "tenant-1", parkId: "park-1" };
const actor: JwtPrincipal = {
  sub: "00000000-0000-4000-8000-000000000001",
  username: "operator",
  tenantId: scope.tenantId,
  parkId: scope.parkId,
  roles: [],
  permissions: []
};

test("initial homestay rate configuration uses one atomic database upsert", async () => {
  const events: string[] = [];
  const expected = { id: "rate-1", unitId: "unit-1", baseDailyRate: "688.00" };
  let statement = "";
  let parameters: unknown[] = [];
  const service = new HomestayService(
    {
      findOne: async () => {
        events.push("read");
        return expected;
      }
    } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { assertAccess: async () => undefined } as never,
    {
      query: async (sql: string, values: unknown[]) => {
        events.push("upsert");
        statement = sql;
        parameters = values;
      }
    } as never
  );

  const result = await service.upsertRate(scope, actor, "unit-1", {
    base_daily_rate: "688.00",
    free_cancel_before_hours: 48,
    late_cancel_fee_type: "percentage",
    late_cancel_fee_value: "25.00",
    checkout_requires_inspection: true
  });

  assert.deepEqual(events, ["upsert", "read"]);
  assert.match(statement, /ON CONFLICT \(tenant_id, park_id, unit_id\) WHERE is_deleted = false/);
  assert.match(statement, /version = biz_homestay_rate_config\.version \+ 1/);
  assert.deepEqual(parameters.slice(0, 8), [
    scope.tenantId,
    scope.parkId,
    "unit-1",
    "688.00",
    48,
    "percentage",
    "25.00",
    true
  ]);
  assert.equal(result, expected);
});
