import assert from "node:assert/strict";
import test from "node:test";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import {
  HousingLedgerEntryEntity,
  HousingReceivableEntity
} from "./entities/housing.entities";
import { HousingFinanceCommandService } from "./housing-finance-command.service";

const scope: TenantParkScope = { tenantId: "tenant-1", parkId: "park-1" };
const actor: JwtPrincipal = {
  sub: "user-1",
  username: "operator",
  tenantId: scope.tenantId,
  parkId: scope.parkId,
  roles: [],
  permissions: [SYSTEM_PERMISSIONS.HOUSING_FINANCE_REGISTER]
};
const lease = {
  id: "lease-1",
  unitId: "unit-1",
  version: 3,
  status: "active",
  depositAmount: "1000.00"
};

test("direct payment locks and settles one receivable before writing its audit ledger", async () => {
  const events: string[] = [];
  let receivableLock: unknown;
  let savedReceivable: Record<string, unknown> | undefined;
  let savedLedger: Record<string, unknown> | undefined;
  const receivable = {
    id: "receivable-1",
    version: 2,
    chargeType: "rent",
    sourceType: "fixed",
    status: "unpaid",
    amount: "100.00",
    paidAmount: "0.00",
    waivedAmount: "0.00",
    currency: "CNY"
  };
  const manager = {
    getRepository(entity: unknown) {
      if (entity === HousingReceivableEntity) {
        return {
          findOne: async (options: { lock?: unknown }) => {
            events.push("receivable-lock");
            receivableLock = options.lock;
            return receivable;
          },
          save: async (value: Record<string, unknown>) => {
            events.push("receivable-save");
            savedReceivable = { ...value };
            return value;
          }
        };
      }
      if (entity === HousingLedgerEntryEntity) {
        return {
          create: (value: Record<string, unknown>) => value,
          save: async (value: Record<string, unknown>) => {
            events.push("ledger-save");
            savedLedger = value;
            return value;
          }
        };
      }
      throw new Error("unexpected repository");
    }
  };
  const service = new HousingFinanceCommandService(
    {
      transaction: async (run: (value: typeof manager) => unknown) => {
        events.push("transaction");
        return run(manager);
      }
    } as never,
    { assertAccess: async () => events.push("access") } as never,
    {
      lockLease: async () => {
        events.push("lease-lock");
        return lease;
      },
      assertStatus: () => events.push("status-check")
    } as never
  );

  await service.registerLedger(scope, actor, lease.id, {
    entry_type: "payment",
    receivable_id: receivable.id,
    charge_type: "rent",
    amount: "40.00",
    payment_method: "bank",
    transaction_reference: "TX-1",
    reason: "rent payment"
  });

  assert.deepEqual(receivableLock, { mode: "pessimistic_write" });
  assert.deepEqual(events, [
    "transaction",
    "lease-lock",
    "access",
    "status-check",
    "receivable-lock",
    "receivable-save",
    "ledger-save"
  ]);
  assert.equal(savedReceivable?.paidAmount, "40.00");
  assert.equal(savedReceivable?.status, "partial");
  assert.deepEqual(savedLedger, {
    tenantId: scope.tenantId,
    parkId: scope.parkId,
    leaseId: lease.id,
    receivableId: receivable.id,
    entryType: "payment",
    chargeType: "rent",
    amount: "40.00",
    paymentMethod: "bank",
    transactionReference: "TX-1",
    sourceType: "manual",
    sourceId: null,
    status: "confirmed",
    reason: "rent payment",
    occurredAt: savedLedger?.occurredAt,
    createBy: actor.sub,
    updateBy: actor.sub
  });
  assert.ok(savedLedger?.occurredAt instanceof Date);
});

test("high-risk refund freezes the locked financial snapshot without direct ledger mutation", async () => {
  const requests: Array<Record<string, unknown>> = [];
  const receivable = {
    id: "receivable-1",
    version: 4,
    chargeType: "rent",
    sourceType: "fixed",
    status: "paid",
    amount: "100.00",
    paidAmount: "100.00",
    waivedAmount: "0.00",
    currency: "CNY"
  };
  const manager = {
    getRepository(entity: unknown) {
      if (entity !== HousingReceivableEntity) throw new Error("unexpected repository");
      return {
        findOne: async () => receivable,
        save: async () => { throw new Error("direct receivable mutation is forbidden"); }
      };
    },
    query: async (sql: string) => {
      if (sql.includes("count(*)")) return [{ count: 0 }];
      if (sql.includes('create_by::text AS "actorId"')) return [{ actorId: "cashier-1" }];
      throw new Error(`unexpected query: ${sql}`);
    }
  };
  const service = new HousingFinanceCommandService(
    { transaction: async (run: (value: typeof manager) => unknown) => run(manager) } as never,
    { assertAccess: async () => undefined } as never,
    { lockLease: async () => lease, assertStatus: () => undefined } as never,
    {
      createPendingRequest: async (_context: unknown, input: Record<string, unknown>) => {
        requests.push(input);
        return input;
      }
    } as never
  );
  const approver = {
    ...actor,
    permissions: [
      SYSTEM_PERMISSIONS.HOUSING_FINANCE_REGISTER,
      SYSTEM_PERMISSIONS.HOUSING_FINANCE_WAIVE,
      SYSTEM_PERMISSIONS.PROPERTY_APPROVAL_CREATE
    ]
  };

  await service.registerLedger(scope, approver, lease.id, {
    entry_type: "refund",
    receivable_id: receivable.id,
    charge_type: "rent",
    amount: "10.00",
    reason: "customer refund"
  }, "refund-key");

  assert.equal(requests.length, 1);
  assert.equal(
    requests[0]?.businessIntentKey,
    "housing-finance:lease-1:3:refund:receivable-1:4"
  );
  assert.deepEqual(requests[0]?.canonicalPayload, {
    leaseId: lease.id,
    leaseExpectedVersion: lease.version,
    reason: "customer refund",
    actorName: actor.username,
    lines: [{
      entryType: "refund",
      receivableId: receivable.id,
      receivableExpectedVersion: receivable.version,
      receivableAmount: "100.00",
      receivablePaidAmount: "100.00",
      receivableWaivedAmount: "0.00",
      chargeType: "rent",
      amount: "10.00",
      currency: "CNY",
      paymentRecorderId: "cashier-1"
    }]
  });
});

test("approved waiver uses locked CAS state and persists the frozen execution audit identity", async () => {
  const leaseId = "40000000-0000-4000-8000-000000000001";
  const receivableId = "50000000-0000-4000-8000-000000000001";
  const statements: Array<{ sql: string; parameters: unknown[] }> = [];
  const manager = {
    query: async (sql: string, parameters: unknown[] = []) => {
      statements.push({ sql, parameters });
      if (sql.includes("FROM biz_housing_lease")) {
        return [{ version: 3, currency: "CNY", depositAmount: "1000.00" }];
      }
      if (sql.includes("FROM biz_housing_receivable")) {
        return [{
          version: 4,
          amount: "100.00",
          paidAmount: "0.00",
          waivedAmount: "0.00",
          chargeType: "rent",
          currency: "CNY",
          status: "unpaid"
        }];
      }
      if (sql.includes("count(*)")) return [{ count: 0 }];
      if (sql.includes("FROM biz_property_execution_effect_manifest")) {
        return [{
          effectKind: "housing.ledger.waiver",
          effectLineKey: `ledger:${receivableId}:waiver`,
          effectHash: "a".repeat(64),
          lineAmount: "10.00",
          currency: "CNY"
        }];
      }
      if (sql.includes("UPDATE biz_housing_receivable")) return [{ version: 5 }];
      if (sql.includes("INSERT INTO biz_housing_ledger_entry")) return [{ id: "ledger-1" }];
      throw new Error(`unexpected query: ${sql}`);
    }
  };
  const service = new HousingFinanceCommandService(
    {} as never,
    {} as never,
    {} as never
  );

  await service.executeApprovedFinance({
    manager: manager as never,
    requestId: "60000000-0000-4000-8000-000000000001",
    executionIdempotencyKey: "execution-key",
    sourceExpectedVersion: 3,
    canonicalPayload: {
      leaseId,
      reason: "approved waiver",
      lines: [{
        entryType: "waiver",
        receivableId,
        receivableExpectedVersion: 4,
        receivableAmount: "100.00",
        receivablePaidAmount: "0.00",
        receivableWaivedAmount: "0.00",
        chargeType: "rent",
        amount: "10.00",
        currency: "CNY"
      }]
    },
    request: {
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      sourceId: leaseId,
      requesterId: actor.sub
    }
  });

  assert.match(statements[0]!.sql, /FOR UPDATE/);
  assert.match(statements[1]!.sql, /FOR UPDATE/);
  const update = statements.find((entry) => entry.sql.includes("UPDATE biz_housing_receivable"));
  assert.deepEqual(update?.parameters.slice(2), [
    receivableId,
    4,
    "0.00",
    "10.00",
    "partial",
    actor.sub
  ]);
  const insert = statements.find((entry) => entry.sql.includes("INSERT INTO biz_housing_ledger_entry"));
  assert.deepEqual(insert?.parameters.slice(-4), [
    "execution-key",
    "housing.ledger.waiver",
    `ledger:${receivableId}:waiver`,
    "a".repeat(64)
  ]);
});
