import assert from "node:assert/strict";
import test from "node:test";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import type { TenantParkScope } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { HomestayService } from "./homestay.service";
import { HomestayWorkbenchQueryService } from "./homestay-workbench-query.service";
import { HomestayBookingQueryService } from "./homestay-booking-query.service";
import { HomestayTurnoverService } from "./homestay-turnover.service";

const scope: TenantParkScope = { tenantId: "tenant-scope", parkId: "park-scope" };
const actor: JwtPrincipal = {
  sub: "00000000-0000-4000-8000-000000000001",
  username: "operator",
  tenantId: scope.tenantId,
  parkId: scope.parkId,
  roles: [],
  permissions: [],
  dataScope: "tenant"
};
const detailId = "11111111-1111-4111-8111-111111111111";
const GET_SCOPE_MATRIX = {
  "/homestay/tasks": ["tenant-park-bound", "empty-unit-page"],
  "/homestay/guest-candidates": ["tenant-park-bound", "booking-unit-bound", "empty-unit-page"],
  "/homestay/work-order-candidates": ["tenant-park-bound", "empty-unit-page"],
  "/homestay/stays": ["tenant-park-bound", "empty-unit-page"],
  "/homestay/stays/:stayId": ["cross-scope-404", "unit-denied-403"],
  "/homestay/finance": ["tenant-park-bound", "empty-unit-page"],
  "/homestay/turnovers/:id": ["cross-scope-404", "unit-denied-403"]
} as const;

function workbenchService(
  workOrdersRepository: unknown,
  unitAccessService: unknown,
  dataSource: unknown
): HomestayWorkbenchQueryService {
  return new HomestayWorkbenchQueryService(
    workOrdersRepository as never,
    unitAccessService as never,
    dataSource as never,
    {
      buildScopeFilter: async () => ({
        unrestricted: true,
        allowed_ids: [],
        scope_types: ["park"]
      })
    } as never
  );
}

function homestayService(options: {
  bookingsRepository?: unknown;
  turnoversRepository?: unknown;
  unitAccessService: unknown;
  dataSource?: unknown;
}): HomestayService {
  const bookingsRepository = options.bookingsRepository ?? {};
  const turnoversRepository = options.turnoversRepository ?? {};
  const dataSource = options.dataSource ?? {};
  const bookingQuery = new HomestayBookingQueryService(
    bookingsRepository as never,
    turnoversRepository as never,
    options.unitAccessService as never,
    dataSource as never
  );
  return new HomestayService(
    {} as never,
    {} as never,
    bookingsRepository as never,
    turnoversRepository as never,
    {} as never,
    {} as never,
    {} as never,
    options.unitAccessService as never,
    dataSource as never,
    undefined, undefined, undefined, undefined,
    bookingQuery
  );
}

test("seven literal GET routes map to explicit scope scenarios", () => {
  assert.deepEqual(Object.keys(GET_SCOPE_MATRIX), [
    "/homestay/tasks",
    "/homestay/guest-candidates",
    "/homestay/work-order-candidates",
    "/homestay/stays",
    "/homestay/stays/:stayId",
    "/homestay/finance",
    "/homestay/turnovers/:id"
  ]);
  assert.deepEqual(GET_SCOPE_MATRIX["/homestay/guest-candidates"], [
    "tenant-park-bound",
    "booking-unit-bound",
    "empty-unit-page"
  ]);
  assert.deepEqual(GET_SCOPE_MATRIX["/homestay/stays/:stayId"], [
    "cross-scope-404",
    "unit-denied-403"
  ]);
});

test("unit-scoped list routes return empty pages without repository or raw queries", async () => {
  const cases = [
    {
      route: "/homestay/tasks",
      run: async (counter: { value: number }) => workbenchService(
        {},
        { allowedUnitIds: async () => [] },
        { query: async () => { counter.value += 1; return []; } }
      ).listTasks(scope, actor, { page: 1, page_size: 20 })
    },
    {
      route: "/homestay/guest-candidates",
      run: async (counter: { value: number }) => workbenchService(
        {},
        { allowedUnitIds: async () => [] },
        { query: async () => { counter.value += 1; return []; } }
      ).listGuestCandidates(scope, actor, {
        booking_id: detailId,
        keyword: "住客",
        page: 1,
        page_size: 20
      })
    },
    {
      route: "/homestay/work-order-candidates",
      run: async (counter: { value: number }) => workbenchService(
        { createQueryBuilder: () => { counter.value += 1; return {}; } },
        { allowedUnitIds: async () => [] },
        {}
      ).listWorkOrderCandidates(scope, actor, { page: 1, page_size: 20 })
    },
    {
      route: "/homestay/stays",
      run: async (counter: { value: number }) => homestayService({
        bookingsRepository: {
          createQueryBuilder: () => { counter.value += 1; return {}; }
        },
        unitAccessService: { allowedUnitIds: async () => [] },
        dataSource: { query: async () => { counter.value += 1; return []; } }
      }).listStays(scope, actor, { queue: "all", page: 1, page_size: 20 })
    },
    {
      route: "/homestay/finance",
      run: async (counter: { value: number }) => workbenchService(
        {},
        { allowedUnitIds: async () => [] },
        { query: async () => { counter.value += 1; return []; } }
      ).listFinance(scope, actor, { page: 1, page_size: 20 })
    }
  ] as const;

  for (const scenario of cases) {
    const counter = { value: 0 };
    const result = await scenario.run(counter);
    assert.deepEqual(
      result,
      { items: [], total: 0, page: 1, page_size: 20 },
      scenario.route
    );
    assert.equal(counter.value, 0, `${scenario.route} must not query an empty unit scope`);
  }
});

test("five list routes bind the current tenant and park at their query boundary", async () => {
  const evidence = new Map<string, unknown>();
  const rawDataSource = (route: string) => ({
    query: async (sql: string, parameters: unknown[]) => {
      evidence.set(route, { sql, parameters });
      return sql.includes("count(*)::int AS total") ? [{ total: 0 }] : [];
    }
  });
  await workbenchService(
    {},
    { allowedUnitIds: async () => null },
    rawDataSource("/homestay/tasks")
  ).listTasks(scope, actor, { page: 1, page_size: 20 });
  const guestResult = await workbenchService(
    {},
    { allowedUnitIds: async () => [detailId] },
    {
      query: async (sql: string, parameters: unknown[]) => {
        evidence.set("/homestay/guest-candidates", { sql, parameters });
        assert.deepEqual(parameters.slice(0, 2), [scope.tenantId, scope.parkId]);
        return sql.includes("count(*)::int AS total")
          ? [{ total: 1 }]
          : [{ id: "party-scoped", displayName: "园区住客" }];
      }
    }
  ).listGuestCandidates(scope, actor, {
    booking_id: detailId,
    keyword: "住客",
    page: 1,
    page_size: 20
  });
  assert.deepEqual(guestResult, {
    items: [{ id: "party-scoped", displayName: "园区住客" }],
    total: 1,
    page: 1,
    page_size: 20
  });
  await workbenchService(
    {},
    { allowedUnitIds: async () => null },
    rawDataSource("/homestay/finance")
  ).listFinance(scope, actor, { page: 1, page_size: 20 });

  const workOrderBindings: Array<{ condition: string; parameters?: unknown }> = [];
  const workOrderCount = { getCount: async () => 0 };
  const workOrderBuilder = {
    where: (condition: string, parameters?: unknown) => {
      workOrderBindings.push({ condition, parameters });
      return workOrderBuilder;
    },
    andWhere: (condition: unknown, parameters?: unknown) => {
      if (typeof condition === "string") {
        workOrderBindings.push({ condition, parameters });
      }
      return workOrderBuilder;
    },
    clone: () => workOrderCount,
    orderBy: () => workOrderBuilder,
    skip: () => workOrderBuilder,
    take: () => workOrderBuilder,
    getMany: async () => []
  };
  await workbenchService(
    { createQueryBuilder: () => workOrderBuilder },
    { allowedUnitIds: async () => null },
    {}
  ).listWorkOrderCandidates(scope, { ...actor, isSuper: true }, {
    page: 1,
    page_size: 20
  });
  evidence.set("/homestay/work-order-candidates", workOrderBindings);

  const stayBindings: Array<{ condition: string; parameters?: unknown }> = [];
  const stayCount = { getCount: async () => 0 };
  const stayBuilder = {
    where: (condition: string, parameters?: unknown) => {
      stayBindings.push({ condition, parameters });
      return stayBuilder;
    },
    andWhere: (condition: string, parameters?: unknown) => {
      stayBindings.push({ condition, parameters });
      return stayBuilder;
    },
    clone: () => stayCount,
    orderBy: () => stayBuilder,
    addOrderBy: () => stayBuilder,
    skip: () => stayBuilder,
    take: () => stayBuilder,
    getMany: async () => []
  };
  await homestayService({
    bookingsRepository: { createQueryBuilder: () => stayBuilder },
    unitAccessService: { allowedUnitIds: async () => null }
  }).listStays(scope, actor, { queue: "all", page: 1, page_size: 20 });
  evidence.set("/homestay/stays", stayBindings);

  for (const route of ["/homestay/tasks", "/homestay/guest-candidates", "/homestay/finance"]) {
    const raw = evidence.get(route) as { sql: string; parameters: unknown[] };
    assert.match(raw.sql, /tenant_id = \$1/);
    assert.match(raw.sql, /park_id = \$2/);
    assert.deepEqual(raw.parameters.slice(0, 2), [scope.tenantId, scope.parkId], route);
  }
  const guestRaw = evidence.get("/homestay/guest-candidates") as {
    sql: string;
    parameters: unknown[];
  };
  assert.match(guestRaw.sql, /booking\.id = \$3/);
  assert.match(guestRaw.sql, /booking\.unit_id = ANY\(\$4::uuid\[\]\)/);
  assert.deepEqual(guestRaw.parameters.slice(0, 4), [
    scope.tenantId,
    scope.parkId,
    detailId,
    [detailId]
  ]);
  for (const route of ["/homestay/work-order-candidates", "/homestay/stays"]) {
    const bindings = evidence.get(route) as Array<{ condition: string; parameters?: unknown }>;
    assert.ok(bindings.some(({ parameters }) =>
      JSON.stringify(parameters).includes(scope.tenantId)), `${route} tenant binding`);
    assert.ok(bindings.some(({ parameters }) =>
      JSON.stringify(parameters).includes(scope.parkId)), `${route} park binding`);
  }
});

test("detail routes return cross-tenant/park 404 and propagate unit-scope 403", async () => {
  const cases = [
    {
      route: "/homestay/stays/:stayId",
      crossScope: () => {
        let binding: unknown;
        const operation = homestayService({
          bookingsRepository: {
            findOne: async (options: unknown) => {
              binding = options;
              return null;
            }
          },
          unitAccessService: { allowedUnitIds: async () => null }
        }).getStay(scope, actor, detailId);
        return { operation, evidence: () => binding };
      },
      unitDenied: () => homestayService({
        bookingsRepository: {
          findOne: async () => {
            throw new Error("booking query must not run");
          }
        },
        unitAccessService: {
          allowedUnitIds: async () => {
            throw new ForbiddenException("Unit scope denied");
          }
        }
      }).getStay(scope, actor, detailId)
    },
    {
      route: "/homestay/turnovers/:id",
      crossScope: () => {
        const bindings: Array<{ condition: string; parameters?: unknown }> = [];
        const builder = {
          where: (condition: string, parameters?: unknown) => {
            bindings.push({ condition, parameters });
            return builder;
          },
          andWhere: (condition: string, parameters?: unknown) => {
            bindings.push({ condition, parameters });
            return builder;
          },
          getOne: async () => null
        };
        const operation = new HomestayTurnoverService(
          { createQueryBuilder: () => builder } as never,
          {} as never,
          {} as never,
          {} as never,
          { allowedUnitIds: async () => null } as never,
          {} as never
        ).getTurnover(scope, actor, detailId);
        return { operation, evidence: () => bindings };
      },
      unitDenied: () => new HomestayTurnoverService(
        {
          createQueryBuilder: () => {
            throw new Error("turnover query must not run");
          }
        } as never,
        {} as never,
        {} as never,
        {} as never,
        {
          allowedUnitIds: async () => {
            throw new ForbiddenException("Unit scope denied");
          }
        } as never,
        {} as never
      ).getTurnover(scope, actor, detailId)
    }
  ] as const;

  for (const scenario of cases) {
    const crossScope = scenario.crossScope();
    await assert.rejects(
      crossScope.operation,
      (error: unknown) => error instanceof NotFoundException && error.getStatus() === 404,
      `${scenario.route} cross tenant/park`
    );
    const serializedEvidence = JSON.stringify(crossScope.evidence());
    assert.ok(serializedEvidence.includes(scope.tenantId), `${scenario.route} tenant binding`);
    assert.ok(serializedEvidence.includes(scope.parkId), `${scenario.route} park binding`);
    await assert.rejects(
      scenario.unitDenied(),
      (error: unknown) => error instanceof ForbiddenException && error.getStatus() === 403,
      `${scenario.route} unit forbidden`
    );
  }
});
