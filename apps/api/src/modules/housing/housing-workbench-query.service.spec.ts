import assert from "node:assert/strict";
import test from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { HousingWorkbenchQueryService } from "./housing-workbench-query.service";

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

function serviceWith(
  query: (sql: string, parameters?: unknown[]) => Promise<unknown[]>,
  unitIds: string[] | null = null,
  handlerFilter = { unrestricted: true, allowed_ids: [], scope_types: [] }
) {
  return new HousingWorkbenchQueryService(
    { query } as never,
    {
      allowedUnitIds: async () => unitIds,
      assertAccess: async () => ({ id: "unit-1" })
    } as never,
    { buildScopeFilter: async () => handlerFilter } as never
  );
}

test("housing tasks keep strict projections, true totals, and two statements for 1/20/100", async () => {
  for (const pageSize of [1, 20, 100]) {
    const statements: string[] = [];
    const service = serviceWith(async (sql) => {
      statements.push(sql);
      return sql.includes("count(*)::int AS total")
        ? [{ total: 37 }]
        : [{
            id: "lease-1",
            sourceType: "housing_lease",
            sourceId: "lease-1",
            title: "租约 · HL-1",
            status: "pending",
            assigneeId: null,
            dueAt: new Date("2026-08-01T00:00:00.000Z"),
            secret: "must not leak"
          }];
    });

    const result = await service.listTasks(scope, actor, {
      page: 99,
      page_size: pageSize
    });

    assert.equal(statements.length, 2);
    assert.equal(result.total, 37);
    assert.deepEqual(Object.keys(result.items[0]!).sort(), [
      "assigneeId", "dueAt", "id", "sourceId", "sourceType", "status", "title"
    ]);
    assert.equal(result.items[0]?.dueAt, "2026-08-01T00:00:00.000Z");
    assert.match(statements[0] ?? "", /biz_housing_lease/);
    assert.match(statements[0] ?? "", /biz_housing_handover/);
    assert.match(statements[0] ?? "", /biz_work_order/);
    assert.match(statements[0] ?? "", /biz_housing_receivable/);
    assert.match(statements[0] ?? "", /biz_housing_purchase/);
  }
});

test("empty housing unit scope returns an empty page without aggregate statements", async () => {
  let statements = 0;
  const service = serviceWith(async () => {
    statements += 1;
    return [];
  }, []);

  const results = await Promise.all([
    service.listTasks(scope, actor, { page: 4, page_size: 20 }),
    service.listHandovers(scope, actor, { page: 4, page_size: 20 }),
    service.listBilling(scope, actor, { page: 4, page_size: 20 }),
    service.listFinance(scope, actor, { page: 4, page_size: 20 }),
    service.listRepairs(scope, actor, { page: 4, page_size: 20 })
  ]);

  assert.equal(statements, 0);
  for (const result of results) {
    assert.deepEqual(result, { items: [], total: 0, page: 4, page_size: 20 });
  }
});

test("every paginated housing workbench read keeps two aggregate statements at 1/20/100", async () => {
  for (const pageSize of [1, 20, 100]) {
    const counts = {
      tasks: 0,
      handovers: 0,
      billing: 0,
      finance: 0,
      repairs: 0
    };
    const run = async (
      key: keyof typeof counts,
      invoke: (service: HousingWorkbenchQueryService) => Promise<{ total: number }>
    ) => {
      const service = serviceWith(async (sql) => {
        counts[key] += 1;
        return sql.includes("count(*)::int AS total") ? [{ total: 23 }] : [];
      });
      const result = await invoke(service);
      assert.equal(result.total, 23);
    };
    await run("tasks", (service) =>
      service.listTasks(scope, { ...actor, isSuper: true }, { page: 8, page_size: pageSize }));
    await run("handovers", (service) =>
      service.listHandovers(scope, { ...actor, isSuper: true }, { page: 8, page_size: pageSize }));
    await run("billing", (service) =>
      service.listBilling(scope, { ...actor, isSuper: true }, { page: 8, page_size: pageSize }));
    await run("finance", (service) =>
      service.listFinance(scope, { ...actor, isSuper: true }, { page: 8, page_size: pageSize }));
    await run("repairs", (service) =>
      service.listRepairs(scope, { ...actor, isSuper: true }, { page: 8, page_size: pageSize }));
    assert.deepEqual(counts, {
      tasks: 2,
      handovers: 2,
      billing: 2,
      finance: 2,
      repairs: 2
    });
  }
});

test("housing workbench sort values map only to frozen SQL columns with stable id ties", async () => {
  const pageStatements: string[] = [];
  const service = serviceWith(async (sql) => {
    if (!sql.includes("count(*)::int AS total")) pageStatements.push(sql);
    return sql.includes("count(*)::int AS total") ? [{ total: 0 }] : [];
  });
  const privileged = { ...actor, isSuper: true };
  await service.listTasks(scope, privileged, {
    sort: "title", order: "desc", page: 1, page_size: 20
  });
  await service.listHandovers(scope, privileged, {
    sort: "leaseCode", order: "asc", page: 1, page_size: 20
  });
  await service.listBilling(scope, privileged, {
    sort: "status", order: "asc", page: 1, page_size: 20
  });
  await service.listFinance(scope, privileged, {
    sort: "leaseCode", order: "desc", page: 1, page_size: 20
  });
  await service.listRepairs(scope, privileged, {
    sort: "code", order: "asc", page: 1, page_size: 20
  });

  assert.match(pageStatements[0] ?? "", /ORDER BY title DESC NULLS LAST, id ASC/u);
  assert.match(pageStatements[1] ?? "", /ORDER BY lease\.lease_code ASC NULLS LAST, handover\.id ASC/u);
  assert.match(pageStatements[2] ?? "", /ORDER BY lease\.status ASC NULLS LAST, lease\.id ASC/u);
  assert.match(pageStatements[3] ?? "", /ORDER BY lease\.lease_code DESC NULLS LAST, lease\.id ASC/u);
  assert.match(pageStatements[4] ?? "", /ORDER BY work_order\.wo_code ASC NULLS LAST, work_order\.id ASC/u);
});

test("all housing list reads bind restricted unit scope into both page and count predicates", async () => {
  const statements: string[] = [];
  const service = serviceWith(async (sql) => {
    statements.push(sql);
    return sql.includes("count(*)::int AS total") ? [{ total: 0 }] : [];
  }, ["00000000-0000-4000-8000-000000000040"]);
  const scopedActor = { ...actor, isSuper: true };

  await service.listTasks(scope, scopedActor, { page: 1, page_size: 20 });
  await service.listHandovers(scope, scopedActor, { page: 1, page_size: 20 });
  await service.listBilling(scope, scopedActor, { page: 1, page_size: 20 });
  await service.listFinance(scope, scopedActor, { page: 1, page_size: 20 });
  await service.listRepairs(scope, scopedActor, { page: 1, page_size: 20 });

  assert.equal(statements.length, 10);
  for (const sql of statements) {
    assert.match(sql, /ANY\(\$3::uuid\[\]\)/);
  }
});

test("handover read omits finance, credential, and file fields without intersecting permissions", async () => {
  const service = serviceWith(async (sql) => sql.includes("count(*)::int AS total")
    ? [{ total: 1 }]
    : [{
        id: "handover-1",
        leaseId: "lease-1",
        leaseCode: "HL-1",
        unitId: "unit-1",
        unitCode: "U-1",
        unitName: "101",
        handoverType: "move_out",
        status: "completed",
        handoverAt: null,
        meterReadings: [],
        itemSnapshot: [],
        credentials: [{ card: "secret" }],
        photoFileIds: ["00000000-0000-4000-8000-000000000010"],
        remark: null,
        damageAmount: "12",
        unsettledAmount: "3",
        depositDeductionAmount: "5"
      }]);

  const result = await service.listHandovers(
    scope,
    { ...actor, permissions: [SYSTEM_PERMISSIONS.HOUSING_HANDOVER_READ] },
    { page: 1, page_size: 20 }
  );

  const item = result.items[0]!;
  assert.deepEqual(Object.keys(item).sort(), [
    "handoverAt", "handoverType", "id", "itemSnapshot", "leaseCode", "leaseId",
    "meterReadings", "remark", "status", "unitCode", "unitId", "unitName"
  ]);
  assert.equal("damageAmount" in item, false);
  assert.equal("credentials" in item, false);
  assert.equal("photoFileIds" in item, false);
  assert.equal("photo_files" in item, false);
});

test("handover manage receives masked rather than raw credential values", async () => {
  const service = serviceWith(async (sql) => sql.includes("count(*)::int AS total")
    ? [{ total: 1 }]
    : [{
        id: "handover-1",
        leaseId: "lease-1",
        leaseCode: "HL-1",
        unitId: "unit-1",
        unitCode: "U-1",
        unitName: "101",
        handoverType: "move_in",
        status: "completed",
        handoverAt: null,
        meterReadings: [],
        itemSnapshot: [],
        credentials: [{ cardNumber: "CARD-123456", pin: "1234" }],
        photoFileIds: [],
        remark: null,
        damageAmount: "0",
        unsettledAmount: "0",
        depositDeductionAmount: "0"
      }]);

  const result = await service.listHandovers(scope, {
    ...actor,
    permissions: [
      SYSTEM_PERMISSIONS.HOUSING_HANDOVER_READ,
      SYSTEM_PERMISSIONS.HOUSING_HANDOVER_MANAGE
    ]
  }, { page: 1, page_size: 20 });

  assert.deepEqual(result.items[0]?.credentials, [{
    cardNumber: "CA***56",
    pin: "****"
  }]);
  assert.doesNotMatch(JSON.stringify(result), /CARD-123456|"1234"/);
});

test("handover detail returns only minimal file refs and finance strings at permission intersection", async () => {
  let statements = 0;
  const service = serviceWith(async (sql) => {
    statements += 1;
    if (sql.includes("FROM sys_file")) {
      return [{
        id: "00000000-0000-4000-8000-000000000010",
        originalName: "evidence.jpg",
        mimeType: "image/jpeg",
        fileSize: "123",
        fileUrl: "/secret/blob"
      }];
    }
    return [{
      id: "00000000-0000-4000-8000-000000000020",
      leaseId: "00000000-0000-4000-8000-000000000030",
      leaseCode: "HL-1",
      unitId: "00000000-0000-4000-8000-000000000040",
      unitCode: "U-1",
      unitName: "101",
      handoverType: "move_out",
      status: "completed",
      handoverAt: null,
      meterReadings: [],
      itemSnapshot: [],
      credentials: [],
      photoFileIds: ["00000000-0000-4000-8000-000000000010"],
      remark: null,
      damageAmount: "12",
      unsettledAmount: "3",
      depositDeductionAmount: "5"
    }];
  });

  const result = await service.getHandover(scope, {
    ...actor,
    permissions: [
      SYSTEM_PERMISSIONS.HOUSING_HANDOVER_READ,
      SYSTEM_PERMISSIONS.HOUSING_FINANCE_READ,
      SYSTEM_PERMISSIONS.FILE_READ
    ]
  }, "00000000-0000-4000-8000-000000000020");

  assert.equal(statements, 2);
  assert.equal(result.damageAmount, "12.00");
  assert.deepEqual(result.photo_files, [{
    id: "00000000-0000-4000-8000-000000000010",
    originalName: "evidence.jpg",
    mimeType: "image/jpeg",
    fileSize: "123"
  }]);
  assert.equal("fileUrl" in result.photo_files![0]!, false);
  assert.deepEqual(Object.keys(result).sort(), [
    "damageAmount", "depositDeductionAmount", "handoverAt", "handoverType", "id",
    "itemSnapshot", "leaseCode", "leaseId", "meterReadings", "photo_files", "remark",
    "status", "unitCode", "unitId", "unitName", "unsettledAmount"
  ]);
});

test("housing details resolve tenant/park first and enforce unit scope before projection", async () => {
  let accessCalls = 0;
  const dataSource = {
    query: async (sql: string, parameters: unknown[]) => {
      if (parameters[2] === "00000000-0000-4000-8000-000000000099") return [];
      if (sql.includes("biz_housing_handover")) {
        return [{
          id: parameters[2],
          leaseId: "lease-1",
          leaseCode: "HL-1",
          unitId: "unit-1",
          unitCode: "U-1",
          unitName: "101",
          handoverType: "move_in",
          status: "completed",
          handoverAt: null,
          meterReadings: [],
          itemSnapshot: [],
          credentials: [],
          photoFileIds: [],
          remark: null,
          damageAmount: "0",
          unsettledAmount: "0",
          depositDeductionAmount: "0"
        }];
      }
      return [{
        id: parameters[2],
        leaseId: "lease-1",
        leaseCode: "HL-1",
        unitId: "unit-1",
        unitCode: "U-1",
        unitName: "101",
        woCode: "WO-1",
        title: "Repair",
        priority: "medium",
        urgency: "normal",
        status: "20",
        assigneeName: null,
        assigneeId: actor.sub,
        reporterId: null,
        createBy: actor.sub,
        overdueFlag: false,
        createTime: "2026-07-31T00:00:00.000Z",
        description: "desc",
        imageFileIds: []
      }];
    }
  };
  const service = new HousingWorkbenchQueryService(
    dataSource as never,
    {
      assertAccess: async () => {
        accessCalls += 1;
        return { id: "unit-1" };
      }
    } as never,
    { buildScopeFilter: async () => ({ unrestricted: true, allowed_ids: [], scope_types: [] }) } as never
  );

  await service.getHandover(scope, actor, "00000000-0000-4000-8000-000000000020");
  const repair = await service.getRepair(
    scope,
    actor,
    "00000000-0000-4000-8000-000000000021"
  );
  assert.equal(accessCalls, 2);
  assert.deepEqual(Object.keys(repair).sort(), [
    "assigneeName", "createTime", "description", "id", "leaseCode", "leaseId",
    "overdueFlag", "priority", "status", "title", "unitCode", "unitId",
    "unitName", "urgency", "woCode"
  ]);
  await assert.rejects(
    service.getHandover(scope, actor, "00000000-0000-4000-8000-000000000099"),
    (error: unknown) =>
      typeof error === "object" && error !== null && "getStatus" in error
      && (error as { getStatus(): number }).getStatus() === 404
  );
  assert.equal(accessCalls, 2);
});

test("both housing detail routes preserve existing out-of-scope HTTP 403 semantics", async () => {
  const row = {
    id: "record-1",
    leaseId: "lease-1",
    leaseCode: "HL-1",
    unitId: "unit-1",
    unitCode: "U-1",
    unitName: "101",
    handoverType: "move_in",
    status: "completed",
    handoverAt: null,
    meterReadings: [],
    itemSnapshot: [],
    credentials: [],
    photoFileIds: [],
    remark: null,
    damageAmount: "0",
    unsettledAmount: "0",
    depositDeductionAmount: "0",
    woCode: "WO-1",
    title: "Repair",
    priority: "medium",
    urgency: "normal",
    assigneeName: null,
    assigneeId: actor.sub,
    reporterId: null,
    createBy: actor.sub,
    overdueFlag: false,
    createTime: "2026-07-31T00:00:00.000Z",
    description: "desc",
    imageFileIds: []
  };
  const service = new HousingWorkbenchQueryService(
    { query: async () => [row] } as never,
    {
      assertAccess: async () => {
        throw new ForbiddenException("Unit is outside current data scope");
      }
    } as never,
    { buildScopeFilter: async () => ({ unrestricted: true, allowed_ids: [], scope_types: [] }) } as never
  );

  for (const invoke of [
    () => service.getHandover(scope, actor, "00000000-0000-4000-8000-000000000020"),
    () => service.getRepair(scope, actor, "00000000-0000-4000-8000-000000000021")
  ]) {
    await assert.rejects(
      invoke(),
      (error: unknown) =>
        typeof error === "object" && error !== null && "getStatus" in error
        && (error as { getStatus(): number }).getStatus() === 403
    );
  }
});

test("billing omits financial blocks without finance-read and finance stays in housing subledger", async () => {
  const statements: string[] = [];
  const query = async (sql: string) => {
    statements.push(sql);
    if (sql.includes("count(*)::int AS total")) return [{ total: 1 }];
    return [{
      id: "lease-1",
      leaseCode: "HL-1",
      unitId: "unit-1",
      tenantPartyId: "party-1",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      status: "active",
      paymentCycleMonths: 1,
      signatureFileId: "secret-file",
      unitCode: "U-1",
      unitName: "101",
      tenantDisplayName: "Tenant",
      chargePlans: [{
        id: "plan-1", leaseId: "lease-1", chargeType: "rent",
        billingSource: "fixed", cycleMonths: 1, amount: "1000",
        unitPrice: null, meterId: null, enabled: true
      }],
      receivables: [{
        id: "r-1", leaseId: "lease-1", chargeType: "rent",
        sourceType: "charge_plan",
        periodStart: "2026-01-01", periodEnd: "2026-02-01",
        dueDate: "2026-01-05", amount: "1000", paidAmount: "200",
        waivedAmount: "0", status: "partial"
      }, {
        id: "r-deposit", leaseId: "lease-1", chargeType: "deposit",
        sourceType: "lease_deposit",
        periodStart: "2026-01-01", periodEnd: "2026-01-01",
        dueDate: "2026-01-01", amount: "2000", paidAmount: "0",
        waivedAmount: "0", status: "unpaid"
      }],
      receivable: "1000",
      paid: "200",
      waived: "0",
      depositBalance: "500"
    }];
  };
  const service = serviceWith(query);
  const billing = await service.listBilling(scope, actor, { page: 1, page_size: 20 });
  const finance = await service.listFinance(scope, actor, { page: 1, page_size: 20 });

  assert.equal("amount" in billing.items[0]!.charge_plans[0]!, false);
  assert.equal("amount" in billing.items[0]!.receivables[0]!, false);
  assert.equal("signatureFileId" in billing.items[0]!.lease, false);
  assert.deepEqual(Object.keys(billing.items[0]!).sort(), [
    "charge_plans", "lease", "receivables"
  ]);
  assert.deepEqual(Object.keys(billing.items[0]!.lease).sort(), [
    "endDate", "id", "leaseCode", "paymentCycleMonths", "startDate", "status",
    "tenantDisplayName", "tenantPartyId", "unitCode", "unitId", "unitName"
  ]);
  assert.deepEqual(finance.items[0]!.summary, {
    receivable: "1000.00",
    paid: "200.00",
    waived: "0.00",
    outstanding: "800.00",
    deposit_balance: "500.00"
  });
  assert.deepEqual(finance.items[0]!.receivables, [
    {
      id: "r-1",
      receivableType: "ordinary",
      entryKind: "payment",
      chargeType: "rent",
      dueDate: "2026-01-05",
      amount: "1000.00",
      paidAmount: "200.00",
      waivedAmount: "0.00",
      balance: "800.00",
      status: "partial",
      lastPaymentRecorderId: null
    },
    {
      id: "r-deposit",
      receivableType: "deposit",
      entryKind: "deposit_receipt",
      chargeType: "deposit",
      dueDate: "2026-01-01",
      amount: "2000.00",
      paidAmount: "0.00",
      waivedAmount: "0.00",
      balance: "2000.00",
      status: "unpaid",
      lastPaymentRecorderId: null
    }
  ]);
  assert.deepEqual(Object.keys(finance.items[0]!).sort(), [
    "lease", "receivables", "summary"
  ]);
  assert.deepEqual(Object.keys(finance.items[0]!.summary).sort(), [
    "deposit_balance", "outstanding", "paid", "receivable", "waived"
  ]);
  assert.ok(statements.some((sql) =>
    sql.includes("jsonb_agg(jsonb_build_object(")
    && sql.includes("'chargeType', r.charge_type")
    && sql.includes("'lastPaymentRecorderId'")
  ));
  assert.equal(statements.some((sql) => /leasing/i.test(sql)), false);
});

test("repair list keeps the canonical minimal work-order projection and handler predicate", async () => {
  const statements: string[] = [];
  const service = serviceWith(async (sql) => {
    statements.push(sql);
    return sql.includes("count(*)::int AS total")
      ? [{ total: 1 }]
      : [{
          id: "repair-1",
          leaseId: "lease-1",
          leaseCode: "HL-1",
          unitId: "unit-1",
          unitCode: "U-1",
          unitName: "101",
          woCode: "WO-1",
          title: "漏水",
          priority: "high",
          urgency: "urgent",
          status: "20",
          assigneeName: "张师傅",
          assigneeId: actor.sub,
          reporterId: null,
          createBy: actor.sub,
          overdueFlag: false,
          createTime: new Date("2026-07-31T00:00:00.000Z"),
          imageFileIds: ["secret-file"],
          reporterMobile: "13800000000"
        }];
  });

  const result = await service.listRepairs(scope, actor, { page: 1, page_size: 20 });

  assert.deepEqual(Object.keys(result.items[0]!).sort(), [
    "assigneeName", "createTime", "id", "leaseCode", "leaseId",
    "overdueFlag", "priority", "status", "title", "unitCode", "unitId",
    "unitName", "urgency", "woCode"
  ]);
  assert.equal("imageFileIds" in result.items[0]!, false);
  assert.match(statements[0] ?? "", /work_order\.assignee_id=\$/);
});
