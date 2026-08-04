import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import type { TenantParkScope } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { HomestayBookingActionLogEntity, HomestayBookingEntity } from "./entities/homestay.entities";
import { HomestayTransactionSupportService } from "./homestay-transaction-support.service";

const scope: TenantParkScope = { tenantId: "tenant-1", parkId: "park-1" };
const actor: JwtPrincipal = {
  sub: "00000000-0000-4000-8000-000000000001",
  username: "operator",
  realName: " 操作员 ",
  tenantId: scope.tenantId,
  parkId: scope.parkId,
  roles: [],
  permissions: []
};

test("business-date support preserves Shanghai boundaries, strict ranges, and 366-night cap", () => {
  const support = new HomestayTransactionSupportService();

  assert.equal(
    support.businessDateStart("2026-08-04").toISOString(),
    "2026-08-03T16:00:00.000Z"
  );
  assert.deepEqual(
    support.businessDates("2026-08-04", "2026-08-06"),
    ["2026-08-04", "2026-08-05"]
  );
  assert.throws(
    () => support.businessDates("2026-08-04", "2026-08-04"),
    BadRequestException
  );
  assert.throws(
    () => support.businessDates("2026-01-01", "2027-01-03"),
    (error: unknown) => error instanceof BadRequestException
      && error.message === "A booking cannot exceed 366 nights"
  );
});

test("booking row lock binds tenant and park and requires pessimistic write", async () => {
  let options: unknown;
  const support = new HomestayTransactionSupportService();
  const booking = { id: "booking-1" };
  const manager = {
    getRepository: (entity: unknown) => {
      assert.equal(entity, HomestayBookingEntity);
      return {
        findOne: async (value: unknown) => {
          options = value;
          return booking;
        }
      };
    }
  };

  assert.equal(await support.lockBooking(manager as never, scope, booking.id), booking);
  assert.deepEqual(options, {
    where: {
      id: booking.id,
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      isDeleted: false
    },
    lock: { mode: "pessimistic_write" }
  });

  const missingManager = {
    getRepository: () => ({ findOne: async () => null })
  };
  await assert.rejects(
    support.lockBooking(missingManager as never, scope, booking.id),
    NotFoundException
  );
});

test("finance source advisory lock uses the complete scoped canonical key", async () => {
  const calls: Array<{ sql: string; parameters: unknown[] }> = [];
  const support = new HomestayTransactionSupportService();
  const manager = {
    query: async (sql: string, parameters: unknown[]) => {
      calls.push({ sql, parameters });
      return [];
    }
  };

  await support.lockHomestayFinanceSourceKey(
    manager as never,
    scope,
    "booking-1",
    "ledger-1"
  );

  assert.match(calls[0]?.sql ?? "", /pg_advisory_xact_lock\(hashtextextended\(\$1,0\)\)/);
  assert.deepEqual(calls[0]?.parameters, [
    "homestay-finance-source|tenant-1|park-1|booking-1|ledger-1"
  ]);
});

test("action logging trims reasons and preserves actor and snapshot ownership", async () => {
  let persisted: Record<string, unknown> | undefined;
  const repository = {
    create: (value: Record<string, unknown>) => value,
    save: async (value: Record<string, unknown>) => { persisted = value; return value; }
  };
  const manager = {
    getRepository: (entity: unknown) => {
      assert.equal(entity, HomestayBookingActionLogEntity);
      return repository;
    }
  };
  const support = new HomestayTransactionSupportService();

  await support.log(
    manager as never,
    scope,
    actor,
    { id: "booking-1" } as never,
    "confirm",
    "draft",
    "confirmed",
    "  reason  ",
    { source: "test" }
  );

  assert.equal(persisted?.reason, "reason");
  assert.equal(persisted?.operatorId, actor.sub);
  assert.equal(persisted?.operatorName, "操作员");
  assert.deepEqual(persisted?.snapshot, { source: "test" });
});

test("unresolved legacy finance fails closed under its row lock", async () => {
  const support = new HomestayTransactionSupportService();
  const manager = { query: async () => [{ id: "legacy-result-1" }] };

  await assert.rejects(
    support.assertNoUnresolvedLegacyHomestayFinance(
      manager as never,
      scope,
      "booking-1"
    ),
    (error: unknown) => error instanceof ConflictException
      && error.message === "Legacy refund or waiver source must be reconciled before approval"
  );
});
