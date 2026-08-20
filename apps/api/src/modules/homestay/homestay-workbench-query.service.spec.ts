import assert from "node:assert/strict";
import test from "node:test";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { HomestayWorkbenchQueryService } from "./homestay-workbench-query.service";

const scope: TenantParkScope = { tenantId: "tenant-1", parkId: "park-1" };
const actor: JwtPrincipal = {
  sub: "00000000-0000-4000-8000-000000000001",
  username: "operator",
  tenantId: scope.tenantId,
  parkId: scope.parkId,
  roles: [],
  permissions: [],
  dataScope: "tenant"
};

test("guest candidates use two bounded queries and return only the frozen minimal projection", async () => {
  const statements: string[] = [];
  const dataSource = {
    query: async (sql: string) => {
      statements.push(sql);
      return sql.includes("count(*)")
        ? [{ total: 1 }]
        : [{ id: "party-1", displayName: "张三", mobile: "13800000000" }];
    }
  };
  const service = new HomestayWorkbenchQueryService(
    {} as never,
    { allowedUnitIds: async () => null } as never,
    dataSource as never,
    {} as never
  );

  const result = await service.listGuestCandidates(scope, actor, {
    booking_id: "11111111-1111-4111-8111-111111111111",
    keyword: "张三",
    page: 2,
    page_size: 20
  });

  assert.equal(statements.length, 2);
  assert.match(statements[0] ?? "", /booking\.id = \$3/);
  assert.match(statements[0] ?? "", /booking\.unit_id = ANY\(\$4::uuid\[\]\)/);
  assert.match(statements[0] ?? "", /party\.display_name ILIKE \$5/);
  assert.match(statements[0] ?? "", /LIMIT \$6 OFFSET \$7/);
  assert.deepEqual(result, {
    items: [{ id: "party-1", displayName: "张三" }],
    total: 1,
    page: 2,
    page_size: 20
  });
  assert.equal("mobile" in result.items[0]!, false);
  assert.deepEqual(Object.keys(result.items[0]!).sort(), ["displayName", "id"]);
});

test("candidate statement counts stay constant for page sizes 1, 20, and 100", async () => {
  const counts: Array<{
    guest: number;
    workOrderMany: number;
    workOrderCount: number;
  }> = [];
  for (const pageSize of [1, 20, 100]) {
    let guestStatements = 0;
    let workOrderManyCalls = 0;
    let workOrderCountCalls = 0;
    const countBuilder = {
      getCount: async () => {
        workOrderCountCalls += 1;
        return 23;
      }
    };
    const builder = {
      where: () => builder,
      andWhere: () => builder,
      orderBy: () => builder,
      skip: () => builder,
      take: () => builder,
      clone: () => countBuilder,
      getMany: async () => {
        workOrderManyCalls += 1;
        return [];
      }
    };
    const service = new HomestayWorkbenchQueryService(
      { createQueryBuilder: () => builder } as never,
      { allowedUnitIds: async () => null } as never,
      {
        query: async (sql: string) => {
          guestStatements += 1;
          return sql.includes("count(*)::int AS total") ? [{ total: 19 }] : [];
        }
      } as never,
      {} as never
    );
    const [guests, workOrders] = await Promise.all([
      service.listGuestCandidates(scope, actor, {
        booking_id: "11111111-1111-4111-8111-111111111111",
        keyword: "住客",
        page: 7,
        page_size: pageSize
      }),
      service.listWorkOrderCandidates(
        scope,
        { ...actor, isSuper: true },
        { page: 7, page_size: pageSize }
      )
    ]);
    assert.equal(guests.total, 19);
    assert.equal(workOrders.total, 23);
    counts.push({
      guest: guestStatements,
      workOrderMany: workOrderManyCalls,
      workOrderCount: workOrderCountCalls
    });
  }
  assert.deepEqual(counts, [
    { guest: 2, workOrderMany: 1, workOrderCount: 1 },
    { guest: 2, workOrderMany: 1, workOrderCount: 1 },
    { guest: 2, workOrderMany: 1, workOrderCount: 1 }
  ]);
});

test("linked work-order reference requires workorder read and applies handler scope once", async () => {
  let builderCreations = 0;
  const conditions: unknown[] = [];
  const builder = {
    where: () => builder,
    andWhere: (condition: unknown) => {
      conditions.push(condition);
      return builder;
    },
    getOne: async () => ({
      id: "work-order-1",
      woCode: "WO-1",
      title: "检修空调",
      status: "20"
    })
  };
  let scopeCalls = 0;
  const service = new HomestayWorkbenchQueryService(
    {
      createQueryBuilder: () => {
        builderCreations += 1;
        return builder;
      }
    } as never,
    { allowedUnitIds: async () => null } as never,
    {} as never,
    {
      buildScopeFilter: async () => {
        scopeCalls += 1;
        return { unrestricted: true, allowed_ids: [], scope_types: [] };
      }
    } as never
  );

  assert.equal(
    await service.getAuthorizedWorkOrderReference(scope, actor, "work-order-1"),
    undefined
  );
  assert.equal(builderCreations, 0);

  const result = await service.getAuthorizedWorkOrderReference(
    scope,
    { ...actor, permissions: [SYSTEM_PERMISSIONS.WORKORDER_READ] },
    "work-order-1"
  );

  assert.deepEqual(result, { code: "WO-1", title: "检修空调", status: "20" });
  assert.equal(builderCreations, 1);
  assert.equal(scopeCalls, 5);
  assert.ok(conditions.some((condition) => typeof condition === "object"));
});

test("tasks use fixed item/count statements and preserve total on an empty page", async () => {
  const statements: string[] = [];
  const dataSource = {
    query: async (sql: string) => {
      statements.push(sql);
      if (sql.includes("SELECT count(*)::int AS total FROM task")) {
        return [{ total: 7 }];
      }
      if (sql.includes("OFFSET") && statements.length > 0) return [];
      return [{
        id: "booking-1",
        sourceType: "homestay_arrival",
        sourceId: "booking-1",
        title: "到店 · HS-1",
        status: "pending",
        assigneeId: null,
        dueAt: new Date("2026-07-31T00:00:00.000Z")
      }];
    }
  };
  const service = new HomestayWorkbenchQueryService(
    {} as never,
    { allowedUnitIds: async () => null } as never,
    dataSource as never,
    {
      buildScopeFilter: async () => ({
        unrestricted: true,
        allowed_ids: [],
        scope_types: ["park"]
      })
    } as never
  );

  const result = await service.listTasks(scope, actor, {
    business_date: "2026-07-31",
    page: 2,
    page_size: 3
  });

  assert.equal(statements.length, 2);
  assert.match(statements[0] ?? "", /WITH task AS/);
  assert.match(statements[0] ?? "", /biz_homestay_booking/);
  assert.match(statements[0] ?? "", /biz_homestay_turnover_task/);
  assert.doesNotMatch(statements[0] ?? "", /count\(\*\) OVER\(\)/);
  assert.deepEqual(result, {
    items: [],
    total: 7,
    page: 2,
    page_size: 3
  });
});

test("tasks apply one assignee predicate to list and count for self/custom scope", async () => {
  const statements: Array<{ sql: string; parameters: unknown[] }> = [];
  const dataSource = {
    query: async (sql: string, parameters: unknown[]) => {
      statements.push({ sql, parameters });
      return sql.includes("count(*)::int AS total") ? [{ total: 0 }] : [];
    }
  };
  const service = new HomestayWorkbenchQueryService(
    {} as never,
    { allowedUnitIds: async () => null } as never,
    dataSource as never,
    {
      buildScopeFilter: async () => ({
        unrestricted: false,
        allowed_ids: [actor.sub],
        scope_types: ["self"]
      })
    } as never
  );

  await service.listTasks(scope, { ...actor, dataScope: "self" }, {
    business_date: "2026-07-31",
    page: 1,
    page_size: 20
  });

  assert.equal(statements.length, 2);
  for (const statement of statements) {
    assert.match(statement.sql, /task\."sourceType" <> 'homestay_turnover'/);
    assert.match(statement.sql, /task\."assigneeId" IS NULL/);
    assert.match(statement.sql, /task\."assigneeId" = ANY\(\$4::uuid\[\]\)/);
    assert.deepEqual(statement.parameters.slice(0, 4), [
      scope.tenantId,
      scope.parkId,
      "2026-07-31",
      [actor.sub]
    ]);
  }
});

test("task supervisors keep the full park queue without resolving handler scope", async () => {
  const statements: string[] = [];
  let scopeCalls = 0;
  const service = new HomestayWorkbenchQueryService(
    {} as never,
    { allowedUnitIds: async () => null } as never,
    {
      query: async (sql: string) => {
        statements.push(sql);
        return sql.includes("count(*)::int AS total") ? [{ total: 0 }] : [];
      }
    } as never,
    {
      buildScopeFilter: async () => {
        scopeCalls += 1;
        return { unrestricted: false, allowed_ids: [], scope_types: ["self"] };
      }
    } as never
  );

  await service.listTasks(scope, {
    ...actor,
    permissions: [SYSTEM_PERMISSIONS.PROPERTY_TASK_SUPERVISE]
  }, {
    business_date: "2026-07-31",
    page: 1,
    page_size: 20
  });

  assert.equal(scopeCalls, 0);
  assert.equal(statements.length, 2);
  for (const sql of statements) {
    assert.doesNotMatch(sql, /task\."assigneeId" = ANY/);
  }
});

test("finance uses fixed item/count statements and keeps all money as decimal strings", async () => {
  let queryCount = 0;
  const dataSource = {
    query: async (sql: string) => {
      queryCount += 1;
      if (sql.includes("SELECT count(*)::int AS total FROM finance")) {
        return [{ total: 12 }];
      }
      return [{
        bookingId: "booking-1",
        bookingCode: "HS-1",
        totalAmount: "100",
        paidAmount: "80",
        refundedAmount: "5",
        waivedAmount: "10",
        balanceAmount: "15"
      }];
    }
  };
  const service = new HomestayWorkbenchQueryService(
    {} as never,
    { allowedUnitIds: async () => null } as never,
    dataSource as never,
    {} as never
  );

  const result = await service.listFinance(scope, actor, { page: 1, page_size: 20 });

  assert.equal(queryCount, 2);
  assert.deepEqual(result.items[0], {
    bookingId: "booking-1",
    bookingCode: "HS-1",
    totalAmount: "100.00",
    paidAmount: "80.00",
    refundedAmount: "5.00",
    waivedAmount: "10.00",
    balanceAmount: "15.00"
  });
  assert.deepEqual(Object.keys(result.items[0]!).sort(), [
    "balanceAmount",
    "bookingCode",
    "bookingId",
    "paidAmount",
    "refundedAmount",
    "totalAmount",
    "waivedAmount"
  ]);
  assert.equal(result.total, 12);
});

test("tasks and finance keep real statement counts equal for page sizes 1, 20, and 100", async () => {
  const statementCounts: Array<{ pageSize: number; tasks: number; finance: number }> = [];
  for (const pageSize of [1, 20, 100]) {
    let taskStatements = 0;
    let financeStatements = 0;
    const service = new HomestayWorkbenchQueryService(
      {} as never,
      { allowedUnitIds: async () => null } as never,
      {
        query: async (sql: string) => {
          if (sql.includes("WITH task AS")) taskStatements += 1;
          if (sql.includes("WITH finance AS")) financeStatements += 1;
          return sql.includes("count(*)::int AS total")
            ? [{ total: 37 }]
            : [];
        }
      } as never,
      {
        buildScopeFilter: async () => ({
          unrestricted: true,
          allowed_ids: [],
          scope_types: ["park"]
        })
      } as never
    );
    const [tasks, finance] = await Promise.all([
      service.listTasks(scope, actor, { page: 99, page_size: pageSize }),
      service.listFinance(scope, actor, { page: 99, page_size: pageSize })
    ]);
    assert.equal(tasks.total, 37);
    assert.equal(finance.total, 37);
    statementCounts.push({ pageSize, tasks: taskStatements, finance: financeStatements });
  }
  assert.deepEqual(statementCounts, [
    { pageSize: 1, tasks: 2, finance: 2 },
    { pageSize: 20, tasks: 2, finance: 2 },
    { pageSize: 100, tasks: 2, finance: 2 }
  ]);
});

test("task responses use the strict frozen item projection", async () => {
  const service = new HomestayWorkbenchQueryService(
    {} as never,
    { allowedUnitIds: async () => null } as never,
    {
      query: async (sql: string) => sql.includes("count(*)::int AS total")
        ? [{ total: 1 }]
        : [{
            id: "booking-1",
            sourceType: "homestay_arrival",
            sourceId: "booking-1",
            title: "到店 · HS-1",
            status: "pending",
            assigneeId: null,
            dueAt: null,
            secret: "must not leak"
          }]
    } as never,
    {
      buildScopeFilter: async () => ({
        unrestricted: true,
        allowed_ids: [],
        scope_types: ["park"]
      })
    } as never
  );
  const result = await service.listTasks(scope, actor, { page: 1, page_size: 20 });
  assert.deepEqual(Object.keys(result.items[0]!).sort(), [
    "assigneeId",
    "dueAt",
    "id",
    "sourceId",
    "sourceType",
    "status",
    "title"
  ]);
});

test("work-order candidates preserve work-order scope for normal users and bypass only for super or wildcard", async () => {
  const run = async (principal: JwtPrincipal) => {
    const conditions: string[] = [];
    let scopeCalls = 0;
    const countBuilder = { getCount: async () => 1 };
    const builder = {
      where: (condition: string) => {
        conditions.push(condition);
        return builder;
      },
      andWhere: (condition: unknown) => {
        conditions.push(typeof condition === "string" ? condition : "brackets");
        return builder;
      },
      orderBy: () => builder,
      skip: () => builder,
      take: () => builder,
      clone: () => countBuilder,
      getMany: async () => [{
        id: "wo-1",
        woCode: "WO-1",
        title: "空调故障",
        status: "20",
        description: "must not leak"
      }]
    };
    const service = new HomestayWorkbenchQueryService(
      { createQueryBuilder: () => builder } as never,
      { allowedUnitIds: async () => null } as never,
      {} as never,
      {
        buildScopeFilter: async (_actor: JwtPrincipal, dimension: string) => {
          scopeCalls += 1;
          return {
            dimension,
            unrestricted: true,
            allowed_ids: [],
            scope_types: ["tenant"]
          };
        }
      } as never
    );
    const result = await service.listWorkOrderCandidates(scope, principal, {
      page: 1,
      page_size: 20
    });
    return { result, conditions, scopeCalls };
  };

  const normal = await run(actor);
  assert.equal(normal.scopeCalls, 5);
  assert.ok(normal.conditions.includes("brackets"));
  assert.deepEqual(normal.result.items, [{
    id: "wo-1",
    woCode: "WO-1",
    title: "空调故障",
    status: "20"
  }]);
  assert.deepEqual(Object.keys(normal.result.items[0]!).sort(), [
    "id",
    "status",
    "title",
    "woCode"
  ]);

  const superResult = await run({ ...actor, isSuper: true });
  assert.equal(superResult.scopeCalls, 0);
  const wildcardResult = await run({ ...actor, permissions: ["*"] });
  assert.equal(wildcardResult.scopeCalls, 0);
});

test("empty unit scope fails closed before candidate or aggregate queries", async () => {
  let queryCount = 0;
  const service = new HomestayWorkbenchQueryService(
    { createQueryBuilder: () => {
      queryCount += 1;
      return {};
    } } as never,
    { allowedUnitIds: async () => [] } as never,
    { query: async () => {
      queryCount += 1;
      return [];
    } } as never,
    {} as never
  );

  const [tasks, finance, workOrders] = await Promise.all([
    service.listTasks(scope, actor, { page: 1, page_size: 20 }),
    service.listFinance(scope, actor, { page: 1, page_size: 20 }),
    service.listWorkOrderCandidates(scope, actor, { page: 1, page_size: 20 })
  ]);

  assert.equal(queryCount, 0);
  assert.equal(tasks.total, 0);
  assert.equal(finance.total, 0);
  assert.equal(workOrders.total, 0);
});
