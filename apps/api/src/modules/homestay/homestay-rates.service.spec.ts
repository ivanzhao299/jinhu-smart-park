import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { type TenantParkScope } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { HomestayRatesService } from "./homestay-rates.service";
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

test("homestay façade delegates the complete rates closure without storage access", async () => {
  const calls: unknown[][] = [];
  const ratesService = {
    getRateCalendar: async (...args: unknown[]) => {
      calls.push(["calendar", ...args]);
      return { unit_id: "unit-1", days: [] };
    },
    upsertRate: async (...args: unknown[]) => {
      calls.push(["rate", ...args]);
      return { id: "rate-1" };
    },
    upsertRateOverride: async (...args: unknown[]) => {
      calls.push(["override", ...args]);
      return { id: "override-1" };
    }
  };
  const facade = new HomestayService(
    ratesService as never, {} as never, {} as never, {} as never, {} as never,
    {} as never, {} as never, {} as never,
    { query: async () => { throw new Error("façade storage query must not run"); } } as never
  );
  const rateDto = {
    base_daily_rate: "688.00",
    free_cancel_before_hours: 24,
    late_cancel_fee_type: "fixed" as const,
    late_cancel_fee_value: "0",
    checkout_requires_inspection: false
  };
  const overrideDto = {
    business_date: "2026-08-04",
    daily_rate: "788.00",
    reason: "周末"
  };

  await facade.getRateCalendar(scope, actor, "unit-1", "2026-08-04", "2026-08-06");
  await facade.upsertRate(scope, actor, "unit-1", rateDto);
  await facade.upsertRateOverride(scope, actor, "unit-1", overrideDto);

  assert.deepEqual(calls, [
    ["calendar", scope, actor, "unit-1", "2026-08-04", "2026-08-06"],
    ["rate", scope, actor, "unit-1", rateDto],
    ["override", scope, actor, "unit-1", overrideDto]
  ]);
});

test("rate calendar preserves scoped reads, persisted policy fields, and date projections", async () => {
  const conditions: Array<[string, unknown]> = [];
  const override = {
    businessDate: "2026-08-05",
    dailyRate: "788.00"
  };
  const builder = {
    where: (sql: string, parameters: unknown) => {
      conditions.push([sql, parameters]);
      return builder;
    },
    andWhere: (sql: string, parameters?: unknown) => {
      conditions.push([sql, parameters]);
      return builder;
    },
    getMany: async () => [override]
  };
  const service = new HomestayRatesService(
    {
      findOne: async (options: unknown) => {
        conditions.push(["config", options]);
        return {
          currency: "CNY",
          baseDailyRate: "688.00",
          checkoutRequiresInspection: true,
          freeCancelBeforeHours: 48,
          lateCancelFeeType: "percentage",
          lateCancelFeeValue: "25.00"
        };
      }
    } as never,
    { createQueryBuilder: () => builder } as never,
    { allowedUnitIds: async () => ["unit-1"] } as never,
    {} as never
  );

  const result = await service.getRateCalendar(
    scope,
    actor,
    "unit-1",
    "2026-08-04",
    "2026-08-06"
  );

  assert.equal(result.configured, true);
  if (!result.configured) assert.fail("expected configured rate calendar");
  assert.equal(result.unit_id, "unit-1");
  assert.equal(result.currency, "CNY");
  assert.equal(result.base_daily_rate, "688.00");
  assert.equal(result.checkout_requires_inspection, true);
  assert.deepEqual(
    { ...result.cancellation_policy, captured_at: "<time>" },
    {
      free_cancel_before_hours: 48,
      late_cancel_fee_type: "percentage",
      late_cancel_fee_value: "25.00",
      captured_at: "<time>"
    }
  );
  assert.match(result.cancellation_policy.captured_at, /^\d{4}-\d{2}-\d{2}T/u);
  assert.deepEqual(result.days, [
    {
      business_date: "2026-08-04",
      base_rate: "688.00",
      override_rate: null,
      final_rate: "688.00",
      price_source: "base"
    },
    {
      business_date: "2026-08-05",
      base_rate: "688.00",
      override_rate: "788.00",
      final_rate: "788.00",
      price_source: "date_override"
    }
  ]);
  assert.ok(conditions.some(([sql, value]) =>
    sql === "rate.tenant_id = :tenantId"
    && (value as { tenantId?: string }).tenantId === scope.tenantId));
  assert.ok(conditions.some(([sql, value]) =>
    sql === "rate.park_id = :parkId"
    && (value as { parkId?: string }).parkId === scope.parkId));
});

test("rate calendar returns an explicit unconfigured state for an authorized unit", async () => {
  let overrideReads = 0;
  const service = new HomestayRatesService(
    { findOne: async () => null } as never,
    { createQueryBuilder: () => { overrideReads += 1; return {}; } } as never,
    { allowedUnitIds: async () => ["unit-1"] } as never,
    {} as never
  );

  const result = await service.getRateCalendar(
    scope,
    actor,
    "unit-1",
    "2026-08-04",
    "2026-08-06"
  );

  assert.deepEqual(result, { configured: false, unit_id: "unit-1" });
  assert.equal(overrideReads, 0);
});

test("rate calendar validates dates and unit scope before repository reads", async () => {
  let repositoryReads = 0;
  const service = new HomestayRatesService(
    { findOne: async () => { repositoryReads += 1; return null; } } as never,
    { createQueryBuilder: () => { repositoryReads += 1; return {}; } } as never,
    { allowedUnitIds: async () => ["unit-allowed"] } as never,
    {} as never
  );

  await assert.rejects(
    service.getRateCalendar(scope, actor, "unit-outside", "2026-08-04", "2026-08-05"),
    (error: unknown) => error instanceof NotFoundException && error.message === "Unit not found"
  );
  await assert.rejects(
    service.getRateCalendar(scope, actor, "unit-allowed", "2026-08-04", "2026-08-04"),
    (error: unknown) => error instanceof BadRequestException
      && error.message === "arrival_date must be before departure_date"
  );
  await assert.rejects(
    service.getRateCalendar(scope, actor, "unit-allowed", "", "2026-08-05"),
    (error: unknown) => error instanceof BadRequestException
      && error.message === "date_from and date_to are required"
  );
  assert.equal(repositoryReads, 0);
});

test("percentage rate validation keeps access first and prevents writes above 100 percent", async () => {
  const events: string[] = [];
  const service = new HomestayRatesService(
    {} as never,
    {} as never,
    { assertAccess: async () => { events.push("access"); } } as never,
    { query: async () => { events.push("write"); } } as never
  );

  await assert.rejects(
    service.upsertRate(scope, actor, "unit-1", {
      base_daily_rate: "688.00",
      free_cancel_before_hours: 24,
      late_cancel_fee_type: "percentage",
      late_cancel_fee_value: "100.01",
      checkout_requires_inspection: false
    }),
    (error: unknown) => error instanceof BadRequestException
      && error.message === "Percentage cancellation fee cannot exceed 100"
  );
  assert.deepEqual(events, ["access"]);
});
