import assert from "node:assert/strict";
import test from "node:test";
import type { TenantParkScope } from "@jinhu/shared";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import {
  HomestayBookingActionLogEntity,
  HomestayBookingEntity,
  HomestayBookingGuestEntity,
  HomestayBookingNightEntity,
  HomestayLedgerEntryEntity,
  HomestayStayCredentialEntity
} from "./entities/homestay.entities";
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

test("dated homestay rate overrides use one atomic database upsert", async () => {
  const events: string[] = [];
  const expected = { id: "override-1", unitId: "unit-1", businessDate: "2026-08-01", dailyRate: "788.00" };
  let statement = "";
  let parameters: unknown[] = [];
  const service = new HomestayService(
    { findOne: async () => ({ id: "rate-1" }) } as never,
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
    { assertAccess: async () => undefined } as never,
    {
      query: async (sql: string, values: unknown[]) => {
        events.push("upsert");
        statement = sql;
        parameters = values;
      }
    } as never
  );

  const result = await service.upsertRateOverride(scope, actor, "unit-1", {
    business_date: "2026-08-01",
    daily_rate: "788.00",
    reason: "周末价"
  });

  assert.deepEqual(events, ["upsert", "read"]);
  assert.match(
    statement,
    /ON CONFLICT \(tenant_id, park_id, unit_id, business_date\) WHERE is_deleted = false/
  );
  assert.match(statement, /version = biz_homestay_rate_override\.version \+ 1/);
  assert.deepEqual(parameters, [
    scope.tenantId,
    scope.parkId,
    "unit-1",
    "2026-08-01",
    "788.00",
    "周末价",
    actor.sub
  ]);
  assert.equal(result, expected);
});

test("booking detail masks every credential reference without changing null", async () => {
  const secretReference = "credential-secret-9876";
  const issuedAt = new Date("2026-07-30T00:00:00.000Z");
  const credentials = [
    { id: "credential-1", credentialReference: secretReference, issuedAt, returnedAt: null },
    { id: "credential-2", credentialReference: "x", issuedAt, returnedAt: null },
    { id: "credential-3", credentialReference: null, issuedAt, returnedAt: null }
  ];
  const booking = {
    id: "booking-1",
    unitId: "unit-1",
    bookingCode: "HS-1",
    arrivalDate: "2026-07-31",
    departureDate: "2026-08-01",
    status: "confirmed",
    guestCount: 1,
    sourceType: "direct",
    roomAmount: "600.00",
    adjustmentAmount: "0.00",
    totalAmount: "600.00"
  };
  const night = {
    id: "night-1",
    businessDate: "2026-07-31",
    baseRate: "600.00",
    overrideRate: null,
    finalRate: "600.00",
    priceSource: "base"
  };
  const emptyRepository = { find: async () => [] };
  const dataSource = {
    getRepository: (entity: unknown) => {
      if (entity === HomestayBookingNightEntity) return { find: async () => [night] };
      if (entity === HomestayBookingGuestEntity) return emptyRepository;
      if (entity === HomestayStayCredentialEntity) return { find: async () => credentials };
      if (entity === HomestayLedgerEntryEntity) {
        return { find: async () => {
          throw new Error("finance query must not run");
        } };
      }
      if (entity === HomestayBookingActionLogEntity) return emptyRepository;
      throw new Error("Unexpected repository");
    }
  };
  const service = new HomestayService(
    {} as never,
    {} as never,
    { findOne: async () => booking } as never,
    { findOne: async () => null } as never,
    {} as never,
    {} as never,
    {} as never,
    { allowedUnitIds: async () => null } as never,
    dataSource as never
  );

  const result = await service.getBooking(scope, actor, booking.id);
  const serialized = JSON.stringify(result);

  assert.deepEqual(
    result.credentials.map((credential) => credential.credentialReference),
    ["***", "***", null]
  );
  assert.equal(serialized.includes(secretReference), false);
  assert.equal(serialized.includes("\"credentialReference\":\"x\""), false);
  assert.equal("ledger" in result, false);
  assert.equal("ledger_summary" in result, false);
  assert.equal("roomAmount" in result.booking, false);
  assert.equal("totalAmount" in result.booking, false);
  assert.equal("baseRate" in result.nights[0]!, false);
  assert.equal("finalRate" in result.nights[0]!, false);
  assert.equal(result.finance_visible, false);
  assert.deepEqual(Object.keys(result).sort(), [
    "actions",
    "booking",
    "credentials",
    "finance_visible",
    "guests",
    "nights",
    "turnover"
  ]);
  assert.deepEqual(Object.keys(result.booking).sort(), [
    "arrivalDate",
    "bookingCode",
    "departureDate",
    "guestCount",
    "id",
    "sourceType",
    "status",
    "unitId"
  ]);
  assert.deepEqual(Object.keys(result.nights[0]!).sort(), ["businessDate", "id"]);
  assert.deepEqual(
    credentials.map((credential) => credential.credentialReference),
    [secretReference, "x", null]
  );
});

test("credential issue persists the reference but masks it in the response", async () => {
  const secretReference = "x";
  let persistedReference: string | null | undefined;
  const credentialRepository = {
    create: (value: Record<string, unknown>) => value,
    save: async (value: Record<string, unknown>) => {
      persistedReference = value.credentialReference as string | null;
      return { id: "credential-1", ...value };
    }
  };
  const manager = {
    getRepository: (entity: unknown) => {
      if (entity === HomestayBookingEntity) {
        return { findOne: async () => ({ id: "booking-1", unitId: "unit-1", status: "confirmed" }) };
      }
      if (entity === HomestayStayCredentialEntity) return credentialRepository;
      throw new Error("Unexpected repository");
    }
  };
  const service = new HomestayService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { assertAccess: async () => undefined } as never,
    { transaction: async (handler: (transactionManager: typeof manager) => unknown) => handler(manager) } as never
  );

  const result = await service.issueCredential(scope, actor, "booking-1", {
    credential_type: "key",
    credential_label: "前台钥匙",
    credential_reference: secretReference
  });

  assert.equal(persistedReference, secretReference);
  assert.equal(result.credentialReference, "***");
  assert.equal(JSON.stringify(result).includes("\"credentialReference\":\"x\""), false);
});

test("credential return masks the stored reference in new and replayed responses", async () => {
  const secretReference = "credential-return-secret";
  const credential = {
    id: "credential-1",
    bookingId: "booking-1",
    credentialReference: secretReference,
    status: "issued" as const,
    issuedAt: new Date("2026-07-30T00:00:00.000Z"),
    returnedAt: null,
    updateBy: null
  };
  const credentialRepository = {
    findOne: async () => credential,
    save: async (value: typeof credential) => value
  };
  const manager = {
    getRepository: (entity: unknown) => {
      if (entity === HomestayBookingEntity) {
        return { findOne: async () => ({ id: "booking-1", unitId: "unit-1", status: "checked_in" }) };
      }
      if (entity === HomestayStayCredentialEntity) return credentialRepository;
      throw new Error("Unexpected repository");
    }
  };
  const service = new HomestayService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { assertAccess: async () => undefined } as never,
    { transaction: async (handler: (transactionManager: typeof manager) => unknown) => handler(manager) } as never
  );

  const first = await service.returnCredential(scope, actor, "booking-1", credential.id);
  const replay = await service.returnCredential(scope, actor, "booking-1", credential.id);

  assert.equal(first.credentialReference, "***");
  assert.equal(replay.credentialReference, "***");
  assert.equal(JSON.stringify([first, replay]).includes(secretReference), false);
  assert.equal(credential.credentialReference, secretReference);
});

test("dashboard omits rate and finance fields and skips their queries without exact read permissions", async () => {
  const statements: string[] = [];
  const turnoversRepository = {
    createQueryBuilder: () => {
      const builder = {
        where: () => builder,
        andWhere: () => builder,
        getCount: async () => 0
      };
      return builder;
    }
  };
  const service = new HomestayService(
    {} as never,
    {} as never,
    {} as never,
    turnoversRepository as never,
    {} as never,
    {} as never,
    {} as never,
    { allowedUnitIds: async () => null } as never,
    {
      query: async (sql: string) => {
        statements.push(sql);
        if (sql.includes("rentable_units")) return [{ rentable_units: 2 }];
        return [{ arrivals: 1, departures: 0, occupied: 1 }];
      }
    } as never
  );

  const result = await service.dashboard(scope, actor, "2026-07-31");

  assert.equal(statements.length, 2);
  assert.equal(statements.some((sql) => sql.includes("average_daily_rate")), false);
  assert.equal(statements.some((sql) => sql.includes(" AS revenue")), false);
  assert.equal("average_daily_rate" in result, false);
  assert.equal("revenue" in result, false);
});

test("availability preserves unset/false legacy arrays and enables wrapper only for true", async () => {
  const item = {
    unit_id: "unit-1",
    unit_code: "A-101",
    unit_name: "101",
    operation_mode: "short_stay",
    room_state: "available" as const
  };
  for (const [flag, expectedQueries] of [[undefined, 1], ["false", 1], ["true", 2]] as const) {
    let queryCount = 0;
    const service = new HomestayService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { allowedUnitIds: async () => null } as never,
      {
        query: async (sql: string) => {
          queryCount += 1;
          return sql.includes("count(*)::int AS total")
            ? [{ total: 6 }]
            : [item];
        }
      } as never,
      { get: () => flag } as never
    );

    const result = await service.availability(scope, actor, {
      date_from: "2026-07-31",
      date_to: "2026-08-01",
      page: 2,
      page_size: 5
    });

    assert.equal(queryCount, expectedQueries);
    assert.deepEqual(
      result,
      flag === "true"
        ? { items: [item], total: 6, page: 2, page_size: 5 }
        : [item]
    );
  }
});

test("V2 availability keeps true total on empty pages with constant statement counts", async () => {
  const counts: number[] = [];
  for (const pageSize of [1, 20, 100]) {
    let statementCount = 0;
    const service = new HomestayService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { allowedUnitIds: async () => null } as never,
      {
        query: async (sql: string) => {
          statementCount += 1;
          return sql.includes("count(*)::int AS total") ? [{ total: 41 }] : [];
        }
      } as never,
      { get: () => "true" } as never
    );
    const result = await service.availability(scope, actor, {
      date_from: "2026-07-31",
      date_to: "2026-08-01",
      page: 99,
      page_size: pageSize
    });
    assert.equal(Array.isArray(result), false);
    if (!Array.isArray(result)) {
      assert.equal(result.total, 41);
      assert.deepEqual(result.items, []);
    }
    counts.push(statementCount);
  }
  assert.deepEqual(counts, [2, 2, 2]);
});

test("booking lists omit every finance field without homestay:finance:read", async () => {
  const booking = {
    id: "booking-1",
    unitId: "unit-1",
    bookingCode: "HS-1",
    arrivalDate: "2026-07-31",
    departureDate: "2026-08-01",
    status: "confirmed",
    guestCount: 1,
    sourceType: "direct",
    roomAmount: "600.00",
    adjustmentAmount: "0.00",
    totalAmount: "600.00"
  };
  const bookingBuilder = {
    where: () => bookingBuilder,
    andWhere: () => bookingBuilder,
    addSelect: () => bookingBuilder,
    orderBy: () => bookingBuilder,
    addOrderBy: () => bookingBuilder,
    skip: () => bookingBuilder,
    take: () => bookingBuilder,
    getManyAndCount: async () => [[booking], 1]
  };
  const service = new HomestayService(
    {} as never,
    {} as never,
    { createQueryBuilder: () => bookingBuilder } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { allowedUnitIds: async () => null } as never,
    {
      query: async () => [{ id: "unit-1", unitCode: "A-101", unitName: "101" }]
    } as never
  );

  const result = await service.listBookings(scope, actor, {
    page: 1,
    page_size: 20
  });

  assert.equal("roomAmount" in result.items[0]!, false);
  assert.equal("adjustmentAmount" in result.items[0]!, false);
  assert.equal("totalAmount" in result.items[0]!, false);
  assert.equal(JSON.stringify(result).includes("600.00"), false);
  assert.deepEqual(Object.keys(result.items[0]!).sort(), [
    "arrivalDate",
    "bookingCode",
    "departureDate",
    "guestCount",
    "id",
    "sourceType",
    "status",
    "unitCode",
    "unitId",
    "unitName"
  ]);
});

test("stay queues call getMany/getCount once and batch exactly two enrichments", async () => {
  const conditions: string[] = [];
  const booking = {
    id: "booking-1",
    unitId: "unit-1",
    bookingCode: "HS-1",
    arrivalDate: "2026-07-31",
    departureDate: "2026-08-01",
    status: "confirmed",
    guestCount: 1,
    sourceType: "direct",
    roomAmount: "600.00",
    adjustmentAmount: "0.00",
    totalAmount: "600.00",
    actualCheckInTime: null,
    actualCheckOutTime: null
  };
  const bookings = [
    booking,
    { ...booking, id: "booking-2", unitId: "unit-2", bookingCode: "HS-2" },
    { ...booking, id: "booking-3", unitId: "unit-3", bookingCode: "HS-3" }
  ];
  let manyCalls = 0;
  let countCalls = 0;
  const countBuilder = {
    getCount: async () => {
      countCalls += 1;
      return bookings.length;
    }
  };
  const bookingBuilder = {
    where: (condition: string) => {
      conditions.push(condition);
      return bookingBuilder;
    },
    andWhere: (condition: string) => {
      conditions.push(condition);
      return bookingBuilder;
    },
    orderBy: () => bookingBuilder,
    addOrderBy: () => bookingBuilder,
    skip: () => bookingBuilder,
    take: () => bookingBuilder,
    clone: () => countBuilder,
    getMany: async () => {
      manyCalls += 1;
      return bookings;
    }
  };
  let projectionQueries = 0;
  const service = new HomestayService(
    {} as never,
    {} as never,
    { createQueryBuilder: () => bookingBuilder } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { allowedUnitIds: async () => null } as never,
    {
      query: async (sql: string) => {
        projectionQueries += 1;
        return sql.includes("stay_credential")
          ? [{ bookingId: "booking-1", credentialCount: 2 }]
          : [{ id: "unit-1", unitCode: "A-101", unitName: "101" }];
      }
    } as never
  );

  const results = [];
  for (const pageSize of [1, 20, 100]) {
    results.push(await service.listStays(scope, actor, {
      queue: "arrivals",
      business_date: "2026-07-31",
      page: 1,
      page_size: pageSize
    }));
  }
  const result = results[1]!;

  assert.ok(conditions.includes("booking.arrival_date = :businessDate"));
  assert.equal(projectionQueries, 6);
  assert.equal(manyCalls, 3);
  assert.equal(countCalls, 3);
  assert.ok(results.every(({ items }) => items.length === bookings.length));
  assert.equal(result.total, bookings.length);
  assert.equal(result.items[0]?.credentialCount, 2);
  assert.equal(result.items[0]?.unitCode, "A-101");
  assert.equal("totalAmount" in result.items[0]!, false);
  assert.deepEqual(Object.keys(result.items[0]!).sort(), [
    "arrivalDate",
    "bookingCode",
    "checkedInAt",
    "checkedOutAt",
    "credentialCount",
    "departureDate",
    "guestCount",
    "id",
    "sourceType",
    "status",
    "unitCode",
    "unitId",
    "unitName"
  ]);
});

test("stay detail returns the same 404 for empty scope before looking up the booking", async () => {
  let bookingReads = 0;
  const service = new HomestayService(
    {} as never,
    {} as never,
    { findOne: async () => {
      bookingReads += 1;
      return { id: "booking-outside-scope" };
    } } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { allowedUnitIds: async () => [] } as never,
    {} as never
  );

  await assert.rejects(
    service.getStay(scope, actor, "11111111-1111-4111-8111-111111111111"),
    NotFoundException
  );
  assert.equal(bookingReads, 0);
});

test("tenant/park scope denial remains 403 while cross-unit GET detail remains 404", async () => {
  const forbiddenService = new HomestayService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {
      allowedUnitIds: async () => {
        throw new ForbiddenException("Tenant/park scope denied");
      }
    } as never,
    {} as never
  );
  for (const operation of [
    () => forbiddenService.getBooking(scope, actor, "11111111-1111-4111-8111-111111111111"),
    () => forbiddenService.getStay(scope, actor, "11111111-1111-4111-8111-111111111111"),
    () => forbiddenService.getTurnover(scope, actor, "11111111-1111-4111-8111-111111111111")
  ]) {
    await assert.rejects(
      operation(),
      (error: unknown) => error instanceof ForbiddenException && error.getStatus() === 403
    );
  }

  const conditions: string[] = [];
  const emptyBuilder = {
    where: (condition: string) => {
      conditions.push(condition);
      return emptyBuilder;
    },
    andWhere: (condition: string) => {
      conditions.push(condition);
      return emptyBuilder;
    },
    getOne: async () => null
  };
  const crossUnitService = new HomestayService(
    {} as never,
    {} as never,
    { createQueryBuilder: () => emptyBuilder } as never,
    { createQueryBuilder: () => emptyBuilder } as never,
    {} as never,
    {} as never,
    {} as never,
    { allowedUnitIds: async () => ["unit-allowed"] } as never,
    {} as never
  );
  for (const operation of [
    () => crossUnitService.getBooking(scope, actor, "11111111-1111-4111-8111-111111111111"),
    () => crossUnitService.getStay(scope, actor, "11111111-1111-4111-8111-111111111111"),
    () => crossUnitService.getTurnover(scope, actor, "11111111-1111-4111-8111-111111111111"),
    () => crossUnitService.getRateCalendar(
      scope,
      actor,
      "unit-outside",
      "2026-07-31",
      "2026-08-01"
    )
  ]) {
    await assert.rejects(
      operation(),
      (error: unknown) => error instanceof NotFoundException && error.getStatus() === 404
    );
  }
  assert.ok(conditions.some((condition) => condition.includes("tenant_id")));
  assert.ok(conditions.some((condition) => condition.includes("park_id")));
  assert.ok(conditions.some((condition) => condition.includes("unit_id IN")));
});

test("turnover list hides protected file IDs without file:read while preserving item casing", async () => {
  const task = {
    id: "turnover-1",
    bookingId: "booking-1",
    unitId: "unit-1",
    status: "pending",
    assigneeId: null,
    assigneeName: null,
    photoFileIds: ["file-secret"],
    consumables: [],
    exceptionDescription: null,
    linkedWorkOrderId: null,
    createTime: new Date("2026-07-31T00:00:00.000Z")
  };
  const turnoversRepository = {
    createQueryBuilder: () => {
      const builder = {
        where: () => builder,
        andWhere: () => builder,
        orderBy: () => builder,
        skip: () => builder,
        take: () => builder,
        getManyAndCount: async () => [[task], 1]
      };
      return builder;
    }
  };
  const service = new HomestayService(
    {} as never,
    {} as never,
    {} as never,
    turnoversRepository as never,
    {} as never,
    {} as never,
    {} as never,
    { allowedUnitIds: async () => null } as never,
    {
      query: async () => [{ id: "unit-1", unitCode: "A-101", unitName: "101" }]
    } as never
  );

  const result = await service.listTurnovers(scope, actor, {
    status: "open",
    page: 1,
    page_size: 20
  });

  assert.equal("photoFileIds" in result.items[0]!, false);
  assert.equal(JSON.stringify(result).includes("file-secret"), false);
  assert.equal(result.items[0]?.unitCode, "A-101");
  assert.equal(result.items[0]?.createTime, "2026-07-31T00:00:00.000Z");
  assert.deepEqual(Object.keys(result.items[0]!).sort(), [
    "assigneeId",
    "assigneeName",
    "bookingId",
    "consumables",
    "createTime",
    "exceptionDescription",
    "id",
    "linkedWorkOrderId",
    "status",
    "unitCode",
    "unitId",
    "unitName"
  ]);
});

test("turnover detail adds only attachment metadata with domain read plus file:read", async () => {
  const task = {
    id: "turnover-1",
    bookingId: "booking-1",
    unitId: "unit-1",
    status: "pending",
    assigneeId: null,
    assigneeName: null,
    photoFileIds: ["file-1"],
    consumables: [],
    exceptionDescription: null,
    linkedWorkOrderId: null,
    createTime: new Date("2026-07-31T00:00:00.000Z")
  };
  const turnoverBuilder = {
    where: () => turnoverBuilder,
    andWhere: () => turnoverBuilder,
    getOne: async () => task
  };
  let fileQueryCount = 0;
  const file = {
    id: "file-1",
    originalName: "现场.jpg",
    mimeType: "image/jpeg",
    fileSize: "1234",
    storagePath: "/must-not-project"
  };
  const fileBuilder = {
    select: () => fileBuilder,
    where: () => fileBuilder,
    andWhere: () => fileBuilder,
    orderBy: () => fileBuilder,
    getMany: async () => {
      fileQueryCount += 1;
      return [file];
    }
  };
  const service = new HomestayService(
    {} as never,
    {} as never,
    {} as never,
    { createQueryBuilder: () => turnoverBuilder } as never,
    { createQueryBuilder: () => fileBuilder } as never,
    {} as never,
    {} as never,
    { allowedUnitIds: async () => null } as never,
    {
      query: async () => [{ unitCode: "A-101", unitName: "101" }]
    } as never
  );

  const result = await service.getTurnover(
    scope,
    { ...actor, permissions: ["file:read"] },
    task.id
  );

  assert.equal(fileQueryCount, 1);
  assert.deepEqual(result.evidence, [{
    id: "file-1",
    originalName: "现场.jpg",
    mimeType: "image/jpeg",
    fileSize: "1234"
  }]);
  assert.equal(JSON.stringify(result).includes("storagePath"), false);
  assert.deepEqual(result.photoFileIds, ["file-1"]);
  assert.deepEqual(Object.keys(result).sort(), [
    "assigneeId",
    "assigneeName",
    "bookingId",
    "consumables",
    "createTime",
    "evidence",
    "exceptionDescription",
    "id",
    "linkedWorkOrderId",
    "photoFileIds",
    "status",
    "unitCode",
    "unitId",
    "unitName"
  ]);
  assert.deepEqual(Object.keys(result.evidence![0]!).sort(), [
    "fileSize",
    "id",
    "mimeType",
    "originalName"
  ]);
});
