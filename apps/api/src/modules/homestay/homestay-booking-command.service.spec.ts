import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { TenantParkScope } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { HomestayService } from "./homestay.service";
import { HomestayTransactionSupportService } from "./homestay-transaction-support.service";

const scope: TenantParkScope = { tenantId: "tenant-1", parkId: "park-1" };
const actor = { sub: "actor-1", username: "operator", tenantId: "tenant-1", parkId: "park-1",
  roles: [], permissions: [] } as JwtPrincipal;

test("homestay façade delegates the complete booking command closure without storage access", async () => {
  const calls: Array<{ name: string; args: unknown[] }> = [];
  const commands = {
    createBooking: async (...args: unknown[]) => { calls.push({ name: "create", args }); return "created"; },
    confirmBooking: async (...args: unknown[]) => { calls.push({ name: "confirm", args }); return "confirmed"; },
    markNoShow: async (...args: unknown[]) => { calls.push({ name: "no-show", args }); return "no-show"; },
    cancelBooking: async (...args: unknown[]) => { calls.push({ name: "cancel", args }); return "pending"; },
    rescheduleBooking: async (...args: unknown[]) => { calls.push({ name: "reschedule", args }); return "moved"; }
  };
  const cancellationExecutor = {
    execute: async (...args: unknown[]) => { calls.push({ name: "execute-cancel", args }); }
  };
  const service = new HomestayService(
    {} as never, {} as never, {} as never, {} as never, {} as never, {} as never,
    {} as never, {} as never,
    { transaction: async () => { throw new Error("facade storage access"); } } as never,
    undefined, undefined, undefined, undefined, undefined,
    new HomestayTransactionSupportService(), commands as never, cancellationExecutor as never
  );
  const createDto = { unit_id: "unit-1" } as never;
  const rescheduleDto = { arrival_date: "2026-08-05", departure_date: "2026-08-06" } as never;
  const approvalInput = { requestId: "request-1" } as never;

  assert.equal(await service.createBooking(scope, actor, createDto, "create-key"), "created");
  assert.equal(await service.confirmBooking(scope, actor, "booking-1"), "confirmed");
  assert.equal(await service.markNoShow(scope, actor, "booking-1", "late"), "no-show");
  assert.equal(await service.cancelBooking(scope, actor, "booking-1", "request", "cancel-key"), "pending");
  assert.equal(await service.rescheduleBooking(scope, actor, "booking-1", rescheduleDto), "moved");
  await service.executeApprovedCancellation(approvalInput);

  assert.deepEqual(calls.map((call) => call.name), [
    "create", "confirm", "no-show", "cancel", "reschedule", "execute-cancel"
  ]);
  assert.deepEqual(calls[0]!.args, [scope, actor, createDto, "create-key"]);
  assert.deepEqual(calls[3]!.args, [scope, actor, "booking-1", "request", "cancel-key"]);
  assert.deepEqual(calls[5]!.args, [approvalInput]);
});

test("confirmed reschedule decreases fail before any occupancy or booking mutation", () => {
  const source = readFileSync(__filename.replace(/\.spec\.ts$/, ".ts"), "utf8");
  const reschedule = source.slice(
    source.indexOf("  async rescheduleBooking("),
    source.indexOf("  private async calculatePricing(")
  );
  const guard = reschedule.indexOf("assertHomestayRescheduleFinanciallySafe(");
  assert.ok(guard > 0);
  assert.ok(guard < reschedule.indexOf("replacePeriodInTransaction("));
  assert.ok(guard < reschedule.indexOf("HomestayBookingNightEntity).update("));
  assert.ok(guard < reschedule.indexOf("HomestayBookingEntity).save("));
  assert.doesNotMatch(reschedule, /reschedule_decrease/);
});
