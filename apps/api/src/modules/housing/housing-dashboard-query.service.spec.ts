import assert from "node:assert/strict";
import test from "node:test";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { HousingDashboardQueryService } from "./housing-dashboard-query.service";
import { HousingService } from "./housing.service";

const scope: TenantParkScope = { tenantId: "tenant-1", parkId: "park-1" };
const actor: JwtPrincipal = {
  sub: "user-1",
  username: "operator",
  tenantId: scope.tenantId,
  parkId: scope.parkId,
  roles: [],
  permissions: []
};

function queryService(
  query: (sql: string, parameters?: unknown[]) => Promise<unknown[]>,
  unitIds: string[] | null = null
) {
  return new HousingDashboardQueryService(
    { query } as never,
    { allowedUnitIds: async () => unitIds } as never
  );
}

test("housing dashboard preserves public counts and omits unauthorized financial projections", async () => {
  const statements: string[] = [];
  const service = queryService(async (sql) => {
    statements.push(sql);
    return [
      { status: "draft", count: 2 },
      { status: "active", count: 3 },
      { status: "expiring", count: 4 },
      { status: "checkout_pending", count: 1 }
    ];
  });

  const result = await service.dashboard(scope, actor);

  assert.deepEqual(result, {
    draft_leases: 2,
    pending_approval: 0,
    pending_signature: 0,
    active_leases: 7,
    checkout_pending: 1
  });
  assert.equal(statements.length, 1);
  assert.match(statements[0] ?? "", /FROM biz_housing_lease/u);
  assert.doesNotMatch(statements[0] ?? "", /receivable|purchase/u);
});

test("housing dashboard exposes only exact permitted aggregates and clamps negative outstanding", async () => {
  const statements: string[] = [];
  const service = queryService(async (sql) => {
    statements.push(sql);
    if (sql.includes("biz_housing_receivable")) {
      return [{ receivable: "100.125", paid: "80.10", waived: "30.10" }];
    }
    if (sql.includes("biz_housing_purchase")) return [{ cost: "45.678" }];
    return [{ status: "pending_approval", count: 5 }];
  });
  const privileged = {
    ...actor,
    permissions: [
      SYSTEM_PERMISSIONS.HOUSING_FINANCE_READ,
      SYSTEM_PERMISSIONS.HOUSING_PURCHASE_READ
    ]
  };

  const result = await service.dashboard(scope, privileged);

  assert.equal(statements.length, 3);
  assert.deepEqual(result, {
    draft_leases: 0,
    pending_approval: 5,
    pending_signature: 0,
    active_leases: 0,
    checkout_pending: 0,
    receivable_amount: "100.13",
    collected_amount: "80.10",
    outstanding_amount: "0.00",
    approved_purchase_cost: "45.68"
  });
});

test("housing dashboard keeps finance and purchase permissions independent", async () => {
  const run = async (permissions: string[]) => {
    const statements: string[] = [];
    const service = queryService(async (sql) => {
      statements.push(sql);
      if (sql.includes("biz_housing_receivable")) {
        return [{ receivable: "20", paid: "5", waived: "0" }];
      }
      if (sql.includes("biz_housing_purchase")) return [{ cost: "9" }];
      return [];
    });
    return {
      result: await service.dashboard(scope, { ...actor, permissions }),
      statements
    };
  };

  const financeOnly = await run([SYSTEM_PERMISSIONS.HOUSING_FINANCE_READ]);
  assert.equal(financeOnly.statements.length, 2);
  assert.equal(financeOnly.result.receivable_amount, "20.00");
  assert.equal(financeOnly.result.outstanding_amount, "15.00");
  assert.equal("approved_purchase_cost" in financeOnly.result, false);
  assert.equal(financeOnly.statements.some((sql) => sql.includes("biz_housing_purchase")), false);

  const purchaseOnly = await run([SYSTEM_PERMISSIONS.HOUSING_PURCHASE_READ]);
  assert.equal(purchaseOnly.statements.length, 2);
  assert.equal(purchaseOnly.result.approved_purchase_cost, "9.00");
  assert.equal("receivable_amount" in purchaseOnly.result, false);
  assert.equal(purchaseOnly.statements.some((sql) => sql.includes("biz_housing_receivable")), false);
});

test("housing dashboard applies one restricted unit scope to every permitted aggregate", async () => {
  const unitId = "00000000-0000-4000-8000-000000000040";
  const calls: Array<{ sql: string; parameters?: unknown[] }> = [];
  const service = queryService(async (sql, parameters) => {
    calls.push({ sql, parameters });
    if (sql.includes("biz_housing_receivable")) {
      return [{ receivable: "0", paid: "0", waived: "0" }];
    }
    if (sql.includes("biz_housing_purchase")) return [{ cost: "0" }];
    return [];
  }, [unitId]);

  await service.dashboard(scope, { ...actor, isSuper: true });

  assert.equal(calls.length, 3);
  for (const call of calls) {
    assert.match(call.sql, /ANY\(\$3::uuid\[\]\)/u);
    assert.deepEqual(call.parameters, [scope.tenantId, scope.parkId, [unitId]]);
  }
});

test("housing dashboard keeps an empty unit scope fail-closed for every permitted aggregate", async () => {
  const statements: string[] = [];
  const service = queryService(async (sql) => {
    statements.push(sql);
    return [];
  }, []);

  const result = await service.dashboard(scope, { ...actor, isSuper: true });

  assert.equal(statements.length, 3);
  for (const sql of statements) assert.match(sql, /AND false/u);
  assert.deepEqual(result, {
    draft_leases: 0,
    pending_approval: 0,
    pending_signature: 0,
    active_leases: 0,
    checkout_pending: 0,
    receivable_amount: "0.00",
    collected_amount: "0.00",
    outstanding_amount: "0.00",
    approved_purchase_cost: "0.00"
  });
});

test("HousingService dashboard is a façade-only delegation", async () => {
  const expected = {
    draft_leases: 1,
    pending_approval: 2,
    pending_signature: 3,
    active_leases: 4,
    checkout_pending: 5
  };
  const calls: unknown[][] = [];
  const service = new HousingService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    undefined,
    { dashboard: async (...args: unknown[]) => { calls.push(args); return expected; } } as never
  );

  assert.equal(await service.dashboard(scope, actor), expected);
  assert.deepEqual(calls, [[scope, actor]]);
});
