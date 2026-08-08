import assert from "node:assert/strict";
import test from "node:test";
import { NotFoundException } from "@nestjs/common";
import type { TenantParkScope } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { HomestayBookingQueryService } from "./homestay-booking-query.service";
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

test("homestay façade delegates booking list and detail reads without storage access", async () => {
  const calls: unknown[][] = [];
  const bookingQuery = {
    listBookings: async (...args: unknown[]) => {
      calls.push(["list", ...args]);
      return { items: [], total: 0, page: 1, page_size: 20 };
    },
    getBooking: async (...args: unknown[]) => {
      calls.push(["booking", ...args]);
      return { booking: { id: "booking-1" } };
    },
    getStay: async (...args: unknown[]) => {
      calls.push(["stay", ...args]);
      return { booking: { id: "booking-1" } };
    }
  };
  const facade = new HomestayService(
    {} as never, {} as never, {} as never, {} as never, {} as never,
    {} as never, {} as never, {} as never,
    { query: async () => { throw new Error("façade storage query must not run"); } } as never,
    undefined, undefined, undefined, undefined,
    bookingQuery as never
  );
  const listQuery = { page: 1, page_size: 20, keyword: "HS-1" };

  await facade.listBookings(scope, actor, listQuery);
  await facade.getBooking(scope, actor, "booking-1");
  await facade.getStay(scope, actor, "booking-1");

  assert.deepEqual(calls, [
    ["list", scope, actor, listQuery],
    ["booking", scope, actor, "booking-1"],
    ["stay", scope, actor, "booking-1"]
  ]);
});

test("empty unit scope returns an empty booking page before repository or SQL access", async () => {
  let storageCalls = 0;
  const service = new HomestayBookingQueryService(
    { createQueryBuilder: () => { storageCalls += 1; return {}; } } as never,
    {} as never,
    { allowedUnitIds: async () => [] } as never,
    { query: async () => { storageCalls += 1; return []; } } as never
  );

  const result = await service.listBookings(scope, actor, { page: 3, page_size: 10 });

  assert.deepEqual(result, { items: [], total: 0, page: 3, page_size: 10 });
  assert.equal(storageCalls, 0);
});

test("stay detail rejects non-stay booking status before loading relation projections", async () => {
  let relationReads = 0;
  const service = new HomestayBookingQueryService(
    {
      findOne: async () => ({ id: "booking-1", unitId: "unit-1", status: "draft" })
    } as never,
    {} as never,
    { allowedUnitIds: async () => null } as never,
    { getRepository: () => { relationReads += 1; return {}; } } as never
  );

  await assert.rejects(
    service.getStay(scope, actor, "booking-1"),
    (error: unknown) => error instanceof NotFoundException
      && error.message === "Homestay stay not found"
  );
  assert.equal(relationReads, 0);
});
