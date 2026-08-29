import assert from "node:assert/strict";
import test from "node:test";
import { ConflictException } from "@nestjs/common";
import {
  HOUSING_LEASE_UNIT_ELIGIBILITY_REASONS,
  type TenantParkScope
} from "@jinhu/shared";
import {
  assertHousingLeaseUnitEligible,
  HOUSING_LEASE_UNIT_INELIGIBLE,
  projectHousingLeaseUnitEligibility
} from "./housing-lease-unit-eligibility";

const scope: TenantParkScope = { tenantId: "tenant-1", parkId: "park-1" };

function managerWith(results: unknown[][]) {
  const statements: Array<{ sql: string; parameters: unknown[] }> = [];
  return {
    statements,
    manager: {
      query: async (sql: string, parameters: unknown[]) => {
        statements.push({ sql, parameters });
        return results.shift() ?? [];
      }
    } as never
  };
}

test("housing and office units pass enabled long-rent eligibility", async () => {
  for (const usageType of [70, 10]) {
    const { manager, statements } = managerWith([
      [],
      [{ unitStatus: 1, usageType, operatingMode: "long_rent", operatingStatus: "enabled" }],
      [{ conflict: false }]
    ]);

    await assertHousingLeaseUnitEligible(manager, scope, "unit-1", {
      startAt: "2026-09-01T00:00:00.000Z",
      endAt: "2027-09-01T00:00:00.000Z"
    });

    assert.equal(statements.length, 3);
    assert.equal(statements[0]!.sql, "SELECT lock_property_unit_scope($1, $2, $3)");
    assert.deepEqual(statements[0]!.parameters, [scope.tenantId, scope.parkId, "unit-1"]);
    assert.match(statements[1]!.sql, /LEFT JOIN biz_property_operation_config operation/u);
    assert.match(statements[1]!.sql, /FOR SHARE OF unit/u);
    assert.match(statements[2]!.sql, /FROM biz_property_occupancy occupancy/u);
    assert.match(statements[2]!.sql, /hold_expires_at IS NULL OR occupancy\.hold_expires_at>now\(\)/u);
    assert.match(statements[2]!.sql, /FROM rel_leasing_contract_unit relation/u);
    assert.match(statements[2]!.sql, /FROM biz_homestay_turnover_task task/u);
    assert.match(statements[2]!.sql, /task\.status<>'completed'/u);
    assert.match(statements[2]!.sql, /AT TIME ZONE 'Asia\/Shanghai'/u);
  }
});

test("missing or ineligible operation configuration returns stable reason codes", async () => {
  for (const [row, expected] of [
    [{ unitStatus: 0, usageType: 70, operatingMode: "long_rent", operatingStatus: "enabled" },
      [HOUSING_LEASE_UNIT_ELIGIBILITY_REASONS.UNIT_INACTIVE]],
    [{ unitStatus: 1, usageType: 20, operatingMode: "long_rent", operatingStatus: "enabled" },
      [HOUSING_LEASE_UNIT_ELIGIBILITY_REASONS.UNIT_USAGE_NOT_ALLOWED_FOR_MODE]],
    [{ unitStatus: 1, usageType: 70, operatingMode: null, operatingStatus: null },
      [HOUSING_LEASE_UNIT_ELIGIBILITY_REASONS.OPERATION_CONFIG_MISSING]],
    [{ unitStatus: 1, usageType: 70, operatingMode: "short_stay", operatingStatus: "enabled" },
      [HOUSING_LEASE_UNIT_ELIGIBILITY_REASONS.OPERATION_MODE_NOT_LONG_RENT]],
    [{ unitStatus: 1, usageType: 70, operatingMode: "long_rent", operatingStatus: "suspended" },
      [HOUSING_LEASE_UNIT_ELIGIBILITY_REASONS.OPERATION_STATUS_NOT_ENABLED]]
  ] as const) {
    const { manager, statements } = managerWith([[], [row]]);
    await assert.rejects(
      assertHousingLeaseUnitEligible(manager, scope, "unit-1"),
      (error: unknown) => {
        assert.ok(error instanceof ConflictException);
        assert.deepEqual(error.getResponse(), {
          message: "长租租约房源当前不符合长租资格",
          errorCode: HOUSING_LEASE_UNIT_INELIGIBLE,
          reasonCodes: expected
        });
        return true;
      }
    );
    assert.equal(statements.length, 2);
  }
});

test("occupied lease period is rejected after structural eligibility", async () => {
  const { manager } = managerWith([
    [],
    [{ unitStatus: 1, usageType: 70, operatingMode: "long_rent", operatingStatus: "enabled" }],
    [{ conflict: true }]
  ]);

  await assert.rejects(
    assertHousingLeaseUnitEligible(manager, scope, "unit-1", {
      startAt: "2026-09-01T00:00:00.000Z",
      endAt: "2027-09-01T00:00:00.000Z"
    }),
    (error: unknown) => {
      assert.ok(error instanceof ConflictException);
      assert.deepEqual(error.getResponse(), {
        message: "长租租约房源当前不符合长租资格",
        errorCode: HOUSING_LEASE_UNIT_INELIGIBLE,
        reasonCodes: [HOUSING_LEASE_UNIT_ELIGIBILITY_REASONS.LEASE_PERIOD_OCCUPIED]
      });
      return true;
    }
  );
});

test("historical draft eligibility is projected in one scoped batch without counting its own occupancy", async () => {
  const { manager, statements } = managerWith([[
    {
      id: "lease-1",
      unitStatus: 1,
      usageType: 70,
      operatingMode: "long_rent",
      operatingStatus: "enabled",
      conflict: false
    },
    {
      id: "lease-2",
      unitStatus: 1,
      usageType: 70,
      operatingMode: "short_stay",
      operatingStatus: "enabled",
      conflict: true
    }
  ]]);

  const result = await projectHousingLeaseUnitEligibility(manager, scope, [
    { id: "lease-1" }, { id: "lease-2" }
  ]);

  assert.deepEqual(result.get("lease-1"), { eligible: true, reasonCodes: [] });
  assert.deepEqual(result.get("lease-2"), {
    eligible: false,
    reasonCodes: [HOUSING_LEASE_UNIT_ELIGIBILITY_REASONS.OPERATION_MODE_NOT_LONG_RENT]
  });
  assert.equal(statements.length, 1);
  assert.match(statements[0]!.sql, /lease\.id=ANY\(\$3::uuid\[\]\)/u);
  assert.match(statements[0]!.sql, /occupancy\.source_id=lease\.id::text/u);
  assert.match(statements[0]!.sql, /hold_expires_at IS NULL OR occupancy\.hold_expires_at>now\(\)/u);
  assert.match(statements[0]!.sql, /FROM biz_homestay_turnover_task task/u);
  assert.match(statements[0]!.sql, /task\.status<>'completed'/u);
  assert.deepEqual(statements[0]!.parameters, [scope.tenantId, scope.parkId, ["lease-1", "lease-2"]]);
});
