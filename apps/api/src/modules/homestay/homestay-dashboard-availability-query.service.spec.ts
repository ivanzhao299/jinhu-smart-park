import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { HomestayDashboardAvailabilityQueryService } from "./homestay-dashboard-availability-query.service";
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

function turnoverRepository(count = 0) {
  return {
    createQueryBuilder: () => {
      const builder = {
        where: () => builder,
        andWhere: () => builder,
        getCount: async () => count
      };
      return builder;
    }
  };
}

test("homestay façade delegates dashboard and availability without querying storage", async () => {
  const calls: unknown[][] = [];
  const queryService = {
    dashboard: async (...args: unknown[]) => {
      calls.push(["dashboard", ...args]);
      return { business_date: "2026-08-04" };
    },
    availability: async (...args: unknown[]) => {
      calls.push(["availability", ...args]);
      return [];
    }
  };
  const facade = new HomestayService(
    {} as never, queryService as never, {} as never, {} as never, {} as never,
    {} as never, {} as never, {} as never,
    { query: async () => { throw new Error("façade storage query must not run"); } } as never,
    undefined, undefined, undefined, undefined
  );
  const query = {
    date_from: "2026-08-04",
    date_to: "2026-08-05",
    page: 1,
    page_size: 20
  };

  await facade.dashboard(scope, actor, "2026-08-04");
  await facade.availability(scope, actor, query);

  assert.deepEqual(calls, [
    ["dashboard", scope, actor, "2026-08-04"],
    ["availability", scope, actor, query]
  ]);
});

test("dashboard counts only in-house bookings and preserves mixed occupancy rate behavior", async () => {
  const allowedUnitIds = ["00000000-0000-4000-8000-000000000101"];
  const statements: Array<{ sql: string; parameters: unknown[] }> = [];
  const dataSource = {
    query: async (sql: string, parameters: unknown[]) => {
      statements.push({ sql, parameters });
      if (sql.includes("AS arrivals")) return [{ arrivals: 2, departures: 1, occupied: 3 }];
      if (sql.includes("rentable_units")) return [{ rentable_units: 4 }];
      if (sql.includes("average_daily_rate")) return [{ average_daily_rate: "333.34" }];
      if (sql.includes(" AS revenue")) return [{ revenue: "120.50" }];
      throw new Error("unexpected dashboard query");
    }
  };
  const service = new HomestayDashboardAvailabilityQueryService(
    turnoverRepository(2) as never,
    { allowedUnitIds: async () => allowedUnitIds } as never,
    dataSource as never,
    { get: () => undefined } as never
  );
  const principal = {
    ...actor,
    permissions: [
      SYSTEM_PERMISSIONS.HOMESTAY_RATE_READ,
      SYSTEM_PERMISSIONS.HOMESTAY_FINANCE_READ
    ]
  };

  const result = await service.dashboard(scope, principal, "2026-08-04");

  assert.deepEqual(result, {
    business_date: "2026-08-04",
    arrivals: 2,
    departures: 1,
    occupied: 3,
    rentable_units: 4,
    occupancy_rate: "75.00",
    average_daily_rate: "333.34",
    pending_turnovers: 2,
    revenue: "120.50"
  });
  assert.equal(statements.length, 4);
  assert.ok(statements.every(({ parameters }) => parameters.includes(allowedUnitIds)));
  const summarySql = statements.find(({ sql }) => sql.includes("AS arrivals"))?.sql ?? "";
  assert.match(summarySql, /booking\.arrival_date <= \$3::date/);
  assert.match(summarySql, /booking\.departure_date > \$3::date/);
  assert.match(summarySql, /booking\.actual_check_in_time IS NOT NULL/);
  assert.match(summarySql,
    /booking\.actual_check_in_time AT TIME ZONE 'Asia\/Shanghai'\)::date <= \$3::date/);
  assert.match(summarySql, /booking\.status = 'checked_in'/);
  assert.doesNotMatch(summarySql, /booking\.status IN \('confirmed', 'checked_in'\)/);
  assert.match(summarySql, /booking\.actual_check_out_time AT TIME ZONE 'Asia\/Shanghai'/);
  assert.match(summarySql, /booking\.unit_id = ANY\(\$4::uuid\[\]\)/);
});

test("empty unit scope short-circuits dashboard storage and preserves authorized shape", async () => {
  let storageCalls = 0;
  const service = new HomestayDashboardAvailabilityQueryService(
    { createQueryBuilder: () => { storageCalls += 1; } } as never,
    { allowedUnitIds: async () => [] } as never,
    { query: async () => { storageCalls += 1; } } as never,
    { get: () => undefined } as never
  );

  const result = await service.dashboard(scope, {
    ...actor,
    permissions: [SYSTEM_PERMISSIONS.HOMESTAY_RATE_READ]
  }, "2026-08-04");

  assert.equal(storageCalls, 0);
  assert.deepEqual(result, {
    business_date: "2026-08-04",
    arrivals: 0,
    departures: 0,
    occupied: 0,
    rentable_units: 0,
    occupancy_rate: "0.00",
    average_daily_rate: "0.00",
    pending_turnovers: 0
  });
});

test("V2 availability preserves cross-domain truth, range boundaries, scope, and projection", async () => {
  const allowedUnitIds = ["00000000-0000-4000-8000-000000000101"];
  const statements: Array<{ sql: string; parameters: unknown[] }> = [];
  const service = new HomestayDashboardAvailabilityQueryService(
    {} as never,
    { allowedUnitIds: async () => allowedUnitIds } as never,
    {
      query: async (sql: string, parameters: unknown[]) => {
        statements.push({ sql, parameters });
        return sql.includes("count(*)::int AS total")
          ? [{ total: 1 }]
          : [{
              unit_id: allowedUnitIds[0],
              unit_code: "A-101",
              unit_name: "101",
              operation_mode: "short_stay",
              room_state: "turnover",
              private_field: "must-not-leak"
            }];
      }
    } as never,
    { get: () => "true" } as never
  );

  const result = await service.availability(scope, actor, {
    date_from: "2026-08-04",
    date_to: "2026-08-05",
    page: 1,
    page_size: 20
  });

  assert.deepEqual(result, {
    items: [{
      unit_id: allowedUnitIds[0],
      unit_code: "A-101",
      unit_name: "101",
      operation_mode: "short_stay",
      room_state: "turnover"
    }],
    total: 1,
    page: 1,
    page_size: 20
  });
  assert.equal(statements.length, 2);
  const sql = statements[0]?.sql ?? "";
  assert.match(sql, /WHEN unit\.status <> 1 THEN 'out_of_service'/);
  assert.match(sql, /bool_or\(occupancy\.source_type = 'homestay_turnover'\)/);
  assert.match(sql, /LEFT JOIN biz_homestay_booking homestay_booking/);
  assert.match(sql, /homestay_booking\.status = 'checked_in'/);
  assert.match(sql, /homestay_booking\.actual_check_in_time IS NOT NULL/);
  assert.match(sql, /homestay_booking\.status = 'confirmed'/);
  assert.match(sql, /homestay_booking\.actual_check_in_time IS NULL/);
  assert.match(sql, /THEN 'reserved'/);
  assert.match(sql,
    /occupancy\.source_type = 'homestay_booking'\s+AND occupancy\.status = 'active'\s+\) THEN 'occupied'/);
  assert.match(sql, /homestay_booking\.id = CASE/);
  assert.match(sql, /occupancy\.source_id::uuid/);
  assert.doesNotMatch(sql, /homestay_booking\.id::text/);
  assert.match(sql, /occupancy\.source_type <> 'homestay_booking'/);
  assert.match(sql, /FROM rel_leasing_contract_unit lease_unit/);
  assert.match(sql, /AT TIME ZONE 'Asia\/Shanghai'/);
  assert.match(sql, /unit\.id = ANY\(\$5::uuid\[\]\)/);
  assert.deepEqual(statements[0]?.parameters.slice(0, 5), [
    scope.tenantId,
    scope.parkId,
    "2026-08-03T16:00:00.000Z",
    "2026-08-04T16:00:00.000Z",
    allowedUnitIds
  ]);
});

test("availability rejects non-increasing and overlong ranges before scope or storage access", async () => {
  let accessCalls = 0;
  const service = new HomestayDashboardAvailabilityQueryService(
    {} as never,
    { allowedUnitIds: async () => { accessCalls += 1; return null; } } as never,
    { query: async () => { accessCalls += 1; return []; } } as never,
    { get: () => "true" } as never
  );
  const baseQuery = { page: 1, page_size: 20 };

  await assert.rejects(
    service.availability(scope, actor, {
      ...baseQuery,
      date_from: "2026-08-04",
      date_to: "2026-08-04"
    }),
    BadRequestException
  );
  await assert.rejects(
    service.availability(scope, actor, {
      ...baseQuery,
      date_from: "2026-01-01",
      date_to: "2027-01-03"
    }),
    (error: unknown) => error instanceof BadRequestException
      && error.message === "A booking cannot exceed 366 nights"
  );
  assert.equal(accessCalls, 0);
});
