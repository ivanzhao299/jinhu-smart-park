import assert from "node:assert/strict";
import test from "node:test";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { HomestayService } from "./homestay.service";
import { HomestayBookingCommandService } from "./homestay-booking-command.service";
import { HomestayTransactionSupportService } from "./homestay-transaction-support.service";

const scope: TenantParkScope = {
  tenantId: "10000000-0000-4000-8000-000000000001",
  parkId: "20000000-0000-4000-8000-000000000001"
};
const actor = {
  sub: "30000000-0000-4000-8000-000000000001",
  username: "operator",
  tenantId: scope.tenantId,
  parkId: scope.parkId,
  roles: [],
  permissions: []
};

test("DEC-01 freezes cancellation fee, occupancy CAS, and credential CAS in one approval request", async () => {
  const booking = {
    id: "40000000-0000-4000-8000-000000000001",
    unitId: "50000000-0000-4000-8000-000000000001",
    occupancyId: "60000000-0000-4000-8000-000000000001",
    status: "confirmed",
    version: 7,
    currency: "CNY",
    arrivalDate: "2026-01-01",
    roomAmount: "100.00",
    cancellationPolicySnapshot: {
      free_cancel_before_hours: 24,
      late_cancel_fee_type: "fixed",
      late_cancel_fee_value: "15.00"
    }
  };
  const ledgerId = "80000000-0000-4000-8000-000000000001";
  const events: string[] = [];
  const manager = {
    getRepository: () => ({ findOne: async () => booking }),
    query: async (sql: string) => {
      if (sql.includes("transaction_timestamp")) {
        events.push("timestamp");
        return [{ cancellationEvaluationAt: "2026-08-03 12:00:00+00" }];
      }
      if (sql.includes("biz_property_occupancy")) {
        events.push("occupancy");
        return [{ id: booking.occupancyId, version: 4, status: "active" }];
      }
      if (sql.includes("biz_homestay_stay_credential")) return [
        { id: "70000000-0000-4000-8000-000000000001", version: 2, status: "issued" }
      ];
      if (sql.includes("NOT EXISTS")
        && sql.includes("biz_homestay_legacy_finance_source_map")) return [];
      if (sql.includes("FROM biz_homestay_ledger_entry")) {
        events.push("ledger");
        return [{ id: ledgerId, version: 3, entryType: "charge", chargeType: "room",
          amount: "100.00", currency: "CNY", status: "confirmed",
          sourceLedgerEntryId: null, recordedBy: actor.sub }];
      }
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  let request: Record<string, unknown> | undefined;
  const dataSource = { transaction: async (run: (value: typeof manager) => unknown) => run(manager) };
  const access = { assertAccess: async () => undefined };
  const support = new HomestayTransactionSupportService();
  const approval = { createPendingRequest: async (_context: unknown, input: Record<string, unknown>) => {
    request = input; return input;
  } };
  const commands = new HomestayBookingCommandService(
    access as never, {} as never, dataSource as never, support, approval as never
  );
  const service = new HomestayService(
    {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never,
    access as never, dataSource as never, undefined, undefined, approval as never,
    undefined, undefined, support, commands
  );

  await service.cancelBooking(scope, actor, booking.id, " guest request ", "cancel-key");

  assert.equal(request?.amount, "115.00");
  assert.equal(request?.currency, "CNY");
  const payload = request?.canonicalPayload as Record<string, unknown>;
  assert.equal(payload.cancellationFeeAmount, "15.00");
  assert.equal(payload.roomWaiverAmount, "100.00");
  assert.equal(payload.cancellationEvaluationAt, "2026-08-03 12:00:00+00");
  assert.deepEqual(payload.occupancy, { id: booking.occupancyId, expectedVersion: 4,
    beforeStatus: "active", afterStatus: "cancelled" });
  assert.deepEqual(payload.credentials, [
    { id: "70000000-0000-4000-8000-000000000001", expectedVersion: 2,
      beforeStatus: "issued", afterStatus: "void" }
  ]);
  assert.deepEqual(payload.ledgerContributors, [
    { id: ledgerId, expectedVersion: 3, status: "confirmed", entryType: "charge",
      chargeType: "room", amount: "100.00", currency: "CNY", sourceLedgerEntryId: null }
  ]);
  assert.deepEqual(events, ["timestamp", "occupancy", "ledger"]);
});

test("DEC-02 blocks homestay approval when a legacy refund or waiver is not linked", async () => {
  const booking = {
    id: "40000000-0000-4000-8000-000000000002",
    unitId: "50000000-0000-4000-8000-000000000002",
    occupancyId: null,
    status: "draft",
    version: 1,
    currency: "CNY",
    arrivalDate: "2026-01-01",
    roomAmount: "0.00",
    cancellationPolicySnapshot: {}
  };
  let requestCalls = 0;
  const manager = {
    getRepository: () => ({ findOne: async () => booking }),
    query: async (sql: string) => {
      if (sql.includes("transaction_timestamp")) {
        return [{ cancellationEvaluationAt: "2026-08-03 12:00:00+00" }];
      }
      if (sql.includes("biz_homestay_stay_credential")) return [];
      if (sql.includes("NOT EXISTS")
        && sql.includes("biz_homestay_legacy_finance_source_map")) {
        return [{ id: "90000000-0000-4000-8000-000000000002" }];
      }
      if (sql.includes("FROM biz_homestay_ledger_entry")) return [];
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  const dataSource = { transaction: async (run: (value: typeof manager) => unknown) => run(manager) };
  const access = { assertAccess: async () => undefined };
  const support = new HomestayTransactionSupportService();
  const approval = { createPendingRequest: async () => { requestCalls += 1; } };
  const commands = new HomestayBookingCommandService(
    access as never, {} as never, dataSource as never, support, approval as never
  );
  const service = new HomestayService(
    {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never,
    access as never, dataSource as never, undefined, undefined, approval as never,
    undefined, undefined, support, commands
  );

  await assert.rejects(
    service.cancelBooking(scope, actor, booking.id, "reason"),
    /Legacy refund or waiver source must be reconciled before approval/
  );
  assert.equal(requestCalls, 0);
});

test("DEC-02 freezes the locked direct and legacy-mapped allocation union", async () => {
  const booking = {
    id: "40000000-0000-4000-8000-000000000003",
    unitId: "50000000-0000-4000-8000-000000000003",
    occupancyId: null,
    status: "confirmed",
    version: 5,
    currency: "CNY"
  };
  const sourceId = "60000000-0000-4000-8000-000000000003";
  const directId = "70000000-0000-4000-8000-000000000003";
  const mappedId = "80000000-0000-4000-8000-000000000003";
  const events: string[] = [];
  let mappingExpectedVersion = 2;
  const ledger = [
    { id: sourceId, version: 2, entryType: "payment", chargeType: "room",
      amount: "100.00", currency: "CNY", status: "confirmed", sourceLedgerEntryId: null,
      recordedBy: actor.sub },
    { id: directId, version: 3, entryType: "refund", chargeType: "room",
      amount: "20.00", currency: "CNY", status: "confirmed", sourceLedgerEntryId: sourceId,
      recordedBy: actor.sub },
    { id: mappedId, version: 4, entryType: "refund", chargeType: "room",
      amount: "30.00", currency: "CNY", status: "confirmed", sourceLedgerEntryId: null,
      recordedBy: actor.sub }
  ];
  const manager = {
    getRepository: () => ({ findOne: async () => booking }),
    query: async (sql: string, parameters?: unknown[]) => {
      if (sql.includes("pg_advisory_xact_lock")) {
        events.push(String(parameters?.[0]));
        return [{ pg_advisory_xact_lock: null }];
      }
      if (sql.includes("NOT EXISTS")
        && sql.includes("biz_homestay_legacy_finance_source_map")) {
        events.push("unresolved");
        return [];
      }
      if (sql.includes("FROM biz_homestay_legacy_finance_source_map")) {
        events.push("mapped");
        return [{ resultId: mappedId, sourceExpectedVersion: mappingExpectedVersion,
          currency: "CNY" }];
      }
      if (sql.includes("FROM biz_homestay_ledger_entry")) {
        if (sql.includes("AND id=$4")) {
          events.push("source");
          return [ledger[0]];
        }
        events.push("ledger");
        return ledger;
      }
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  let request: Record<string, unknown> | undefined;
  const service = new HomestayService(
    {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never,
    { assertAccess: async () => undefined } as never,
    { transaction: async (run: (value: typeof manager) => unknown) => run(manager) } as never,
    undefined, undefined,
    { createPendingRequest: async (_context: unknown, input: Record<string, unknown>) => {
      request = input;
      return input;
    } } as never
  );
  const financeActor = { ...actor, permissions: [
    SYSTEM_PERMISSIONS.HOMESTAY_FINANCE_WAIVE,
    SYSTEM_PERMISSIONS.HOMESTAY_FINANCE_REGISTER,
    SYSTEM_PERMISSIONS.PROPERTY_APPROVAL_CREATE
  ] };

  await service.registerLedgerEntry(scope, financeActor, booking.id, {
    entry_type: "refund", charge_type: "room", amount: "40.00", reason: "refund",
    source_ledger_entry_id: sourceId
  }, "finance-key");

  const line = (request?.canonicalPayload as { lines: Array<Record<string, unknown>> }).lines[0]!;
  assert.equal(line.allocatedAmount, "50.00");
  assert.equal(line.remainingAvailableBalance, "50.00");
  assert.deepEqual(line.allocationContributors, [
    { id: directId, expectedVersion: 3, status: "confirmed", entryType: "refund",
      amount: "20.00", currency: "CNY", allocationKind: "direct" },
    { id: mappedId, expectedVersion: 4, status: "confirmed", entryType: "refund",
      amount: "30.00", currency: "CNY", allocationKind: "legacy-mapped" }
  ]);
  assert.deepEqual(events, [
    `homestay-finance-source|${scope.tenantId}|${scope.parkId}|${booking.id}|${sourceId}`,
    "source", "ledger", "unresolved", "mapped"
  ]);

  mappingExpectedVersion = 3;
  await assert.rejects(service.registerLedgerEntry(scope, financeActor, booking.id, {
    entry_type: "refund", charge_type: "room", amount: "10.00", reason: "stale mapping",
    source_ledger_entry_id: sourceId
  }, "stale-mapping-key"), /Finance allocation source changed/);
});
