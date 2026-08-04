import assert from "node:assert/strict";
import test from "node:test";
import { ConflictException } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { HousingService } from "./housing.service";
import { HousingReceivableWriterService } from "./housing-receivable-writer.service";
import { HousingTransactionSupportService } from "./housing-transaction-support.service";
import { HousingFinanceCommandService } from "./housing-finance-command.service";

function supportTail() {
  const support = new HousingTransactionSupportService();
  return [undefined, undefined, support, new HousingReceivableWriterService(support)] as const;
}

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

function serviceForPurchase(purchase: Record<string, unknown>, onRequest: (input: Record<string, unknown>) => unknown) {
  const itemBuilder = {
    where: () => itemBuilder,
    andWhere: () => itemBuilder,
    getExists: async () => false
  };
  let repositoryCall = 0;
  const manager = {
    getRepository: () => {
      repositoryCall += 1;
      return repositoryCall === 1
        ? { findOne: async () => purchase }
        : { createQueryBuilder: () => itemBuilder };
    }
  };
  return new HousingService(
    {} as never, {} as never, {} as never, {} as never,
    { assertAccess: async () => undefined, allowedUnitIds: async () => null } as never, {} as never,
    { transaction: async (run: (value: typeof manager) => unknown) => run(manager) } as never,
    {} as never,
    { createPendingRequest: async (_context: unknown, input: Record<string, unknown>) => onRequest(input) } as never
  );
}

test("DEC-06 A rejects void for a paid purchase before creating an approval", async () => {
  let requestCalls = 0;
  const service = serviceForPurchase({
    id: "40000000-0000-4000-8000-000000000001",
    unitId: null,
    approvalStatus: "approved",
    paymentStatus: "paid",
    version: 3
  }, () => { requestCalls += 1; });

  await assert.rejects(
    service.purchaseAction(scope, actor, "40000000-0000-4000-8000-000000000001", {
      action: "void", reason: "invalid void"
    }),
    /Paid or refunded purchase cannot be voided/
  );
  assert.equal(requestCalls, 0);
});

test("DEC-06 A rejects a repeated void for a terminal purchase before creating an approval", async () => {
  let requestCalls = 0;
  const service = serviceForPurchase({
    id: "40000000-0000-4000-8000-000000000006",
    unitId: null,
    approvalStatus: "void",
    paymentStatus: "unpaid",
    version: 4
  }, () => { requestCalls += 1; });

  await assert.rejects(
    service.purchaseAction(scope, actor, "40000000-0000-4000-8000-000000000006", {
      action: "void", reason: "duplicate terminal action"
    }),
    /Terminal purchase cannot be voided again/
  );
  assert.equal(requestCalls, 0);
});

test("DEC-06 A freezes refund as approved/refunded without changing approval status", async () => {
  let request: Record<string, unknown> | undefined;
  const service = serviceForPurchase({
    id: "40000000-0000-4000-8000-000000000002",
    unitId: null,
    approvalStatus: "approved",
    paymentStatus: "paid",
    version: 8
  }, (input) => { request = input; return input; });

  await service.purchaseAction(scope, actor, "40000000-0000-4000-8000-000000000002", {
    action: "refund", reason: "supplier refund"
  }, "refund-key");

  const payload = request?.canonicalPayload as Record<string, unknown>;
  assert.equal(payload.transition, "refund");
  assert.equal(payload.beforeApprovalStatus, "approved");
  assert.equal(payload.afterApprovalStatus, "approved");
  assert.equal(payload.beforePaymentStatus, "paid");
  assert.equal(payload.afterPaymentStatus, "refunded");
});

test("DEC-02 rejects housing finance execution while unresolved legacy history exists", async () => {
  const queries: string[] = [];
  const manager = {
    query: async (sql: string) => {
      queries.push(sql);
      if (sql.includes("FROM biz_housing_lease")) return [{ version: 2, currency: "CNY", depositAmount: "0.00" }];
      if (sql.includes("FROM biz_housing_receivable")) return [{
        version: 5, amount: "100.00", paidAmount: "100.00", waivedAmount: "0.00",
        chargeType: "rent", currency: "CNY", status: "paid"
      }];
      if (sql.includes("FROM biz_housing_ledger_entry result")) return [{ count: 1 }];
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  const service = new HousingFinanceCommandService(
    {} as never,
    {} as never,
    new HousingTransactionSupportService()
  );

  await assert.rejects(service.executeApprovedFinance({
    manager: manager as never,
    requestId: "50000000-0000-4000-8000-000000000001",
    executionIdempotencyKey: "execution-key",
    sourceExpectedVersion: 2,
    canonicalPayload: {
      leaseId: "40000000-0000-4000-8000-000000000003",
      lines: [{
        entryType: "refund",
        receivableId: "60000000-0000-4000-8000-000000000001",
        receivableExpectedVersion: 5,
        receivableAmount: "100.00",
        receivablePaidAmount: "100.00",
        receivableWaivedAmount: "0.00",
        amount: "10.00",
        currency: "CNY"
      }]
    },
    request: {
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      sourceId: "40000000-0000-4000-8000-000000000003",
      requesterId: actor.sub
    }
  }), (error: unknown) => {
    assert.ok(error instanceof ConflictException);
    assert.match(error.message, /Legacy refund or waiver source/);
    return true;
  });
  assert.equal(queries.length, 3);
  assert.equal(queries.some((sql) => sql.includes("UPDATE ") || sql.includes("INSERT INTO")), false);
});

test("DEC-04 precreates and freezes the draft handover identity, version, amounts, and receivable target", async () => {
  const lease = {
    id: "40000000-0000-4000-8000-000000000010",
    unitId: "50000000-0000-4000-8000-000000000010",
    status: "active",
    version: 6,
    currency: "CNY",
    depositAmount: "1000.00"
  };
  let repositoryCall = 0;
  const handoverRepository = {
    findOne: async () => null,
    create: (value: Record<string, unknown>) => ({
      ...value, id: "60000000-0000-4000-8000-000000000010", version: 1
    }),
    save: async (value: Record<string, unknown>) => value
  };
  const advisoryKeys: string[] = [];
  const manager = {
    getRepository: () => {
      repositoryCall += 1;
      if (repositoryCall === 1) return { findOne: async () => lease };
      if (repositoryCall === 2) return handoverRepository;
      return { find: async () => [{ entryType: "deposit_receipt", amount: "1000.00", status: "confirmed" }] };
    },
    query: async (sql: string, parameters: unknown[] = []) => {
      if (sql.includes("pg_advisory_xact_lock")) {
        advisoryKeys.push(String(parameters[0]));
        return [];
      }
      if (sql.includes("FROM biz_housing_handover")) return [];
      if (sql.includes("transaction_timestamp")) return [{ businessDate: "2026-08-03" }];
      if (sql.includes("FROM biz_housing_receivable")) return [];
      if (sql.includes("FROM biz_housing_ledger_entry") && sql.includes("ORDER BY id FOR UPDATE")) {
        return [{
          id: "90000000-0000-4000-8000-000000000010", version: 2,
          entryType: "deposit_receipt", amount: "1000.00", currency: "CNY",
          status: "confirmed", receivableId: null, sourceType: "manual", sourceId: null
        }];
      }
      if (sql.includes("FROM biz_housing_ledger_entry result")) return [{ count: 0 }];
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  let request: Record<string, unknown> | undefined;
  const service = new HousingService(
    {} as never, {} as never, {} as never, {} as never,
    { assertAccess: async () => undefined } as never, {} as never,
    { transaction: async (run: (value: typeof manager) => unknown) => run(manager) } as never,
    {} as never,
    { createPendingRequest: async (_context: unknown, input: Record<string, unknown>) => { request = input; return input; } } as never,
    ...supportTail()
  );
  const permittedActor = { ...actor, permissions: [
    SYSTEM_PERMISSIONS.HOUSING_HANDOVER_MANAGE,
    SYSTEM_PERMISSIONS.PROPERTY_APPROVAL_CREATE
  ] };

  await service.completeHandover(scope, permittedActor, lease.id, {
    handover_type: "move_out",
    damage_amount: "80.00",
    unsettled_amount: "20.00",
    deposit_deduction_amount: "30.00",
    item_snapshot: [], meter_readings: [], credentials: [], photo_file_ids: [],
    remark: "move out"
  }, "handover-key");

  assert.equal(request?.sourceType, "housing-handover");
  assert.equal(request?.sourceId, "60000000-0000-4000-8000-000000000010");
  assert.equal(request?.sourceExpectedVersion, 1);
  assert.equal(request?.amount, "130.00");
  assert.equal(request?.currency, "CNY");
  const payload = request?.canonicalPayload as Record<string, unknown>;
  assert.equal(payload.handoverId, request?.sourceId);
  assert.equal(payload.leaseExpectedVersion, 6);
  assert.equal(payload.checkoutReceivableAmount, "100.00");
  assert.match(String(payload.checkoutReceivableId), /^[0-9a-f-]{36}$/u);
  assert.equal(payload.checkoutBusinessDate, "2026-08-03");
  assert.equal(payload.checkoutReceivablePeriodStart, "2026-08-03");
  assert.equal(payload.checkoutReceivablePeriodEnd, "2026-08-04");
  assert.equal(payload.checkoutReceivableDueDate, "2026-08-03");
  assert.equal(payload.checkoutReceivableMode, "new");
  assert.equal(payload.checkoutReceivableExpectedVersion, null);
  assert.equal(payload.depositBalance, "1000.00");
  assert.match(String(payload.depositContributorsHash), /^[a-f0-9]{64}$/u);
  assert.match(String(payload.itemSnapshotHash), /^[a-f0-9]{64}$/u);
  assert.deepEqual(payload.deductions, [{
    itemId: request?.sourceId, amount: "30.00", currency: "CNY"
  }]);
  assert.deepEqual(advisoryKeys, [
    `housing-handover|${scope.tenantId}|${scope.parkId}|${lease.id}|move_out`,
    `housing-receivable|${scope.tenantId}|${scope.parkId}|${lease.id}|housing_handover|${request?.sourceId}|checkout_charges|2026-08-03|2026-08-04`
  ]);
});

test("DEC-05 freezes one aggregate target receivable and per-item expected-version CAS", async () => {
  const purchase = {
    id: "40000000-0000-4000-8000-000000000020",
    unitId: "50000000-0000-4000-8000-000000000020",
    approvalStatus: "approved",
    paymentStatus: "unpaid",
    version: 9,
    currency: "CNY",
    purchaseDate: "2026-08-01"
  };
  const lease = {
    id: "60000000-0000-4000-8000-000000000020",
    unitId: purchase.unitId,
    status: "active",
    version: 4,
    currency: "CNY"
  };
  const items = [
    { id: "80000000-0000-4000-8000-000000000022", version: 3, amount: "20.00", transferredReceivableId: null },
    { id: "80000000-0000-4000-8000-000000000021", version: 7, amount: "10.00", transferredReceivableId: null }
  ];
  const receivable = {
    id: "70000000-0000-4000-8000-000000000020",
    version: 5,
    amount: "40.00",
    paidAmount: "5.00",
    waivedAmount: "0.00",
    status: "partial",
    leaseId: lease.id,
    periodStart: "2026-08-01",
    periodEnd: "2026-08-02",
    dueDate: "2026-08-31",
    isDeleted: false,
    currency: "CNY"
  };
  const itemBuilder = {
    setLock: () => itemBuilder,
    where: () => itemBuilder,
    andWhere: () => itemBuilder,
    orderBy: () => itemBuilder,
    getMany: async () => items
  };
  const purchaseAdvisoryKeys: string[] = [];
  let repositoryCall = 0;
  const manager = {
    getRepository: () => {
      repositoryCall += 1;
      if (repositoryCall === 1) return { findOne: async () => purchase };
      if (repositoryCall === 2) return { findOne: async () => lease };
      return { createQueryBuilder: () => itemBuilder };
    },
    query: async (sql: string, parameters: unknown[] = []) => {
      if (sql.includes("pg_advisory_xact_lock")) {
        purchaseAdvisoryKeys.push(String(parameters[0]));
        return [];
      }
      if (sql.includes("FROM biz_housing_receivable")) return [receivable];
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  let request: Record<string, unknown> | undefined;
  const service = new HousingService(
    {} as never, {} as never, {} as never, {} as never,
    { assertAccess: async () => undefined } as never, {} as never,
    { transaction: async (run: (value: typeof manager) => unknown) => run(manager) } as never,
    {} as never,
    { createPendingRequest: async (_context: unknown, input: Record<string, unknown>) => { request = input; return input; } } as never,
    ...supportTail()
  );

  await service.transferPurchase(scope, actor, purchase.id, {
    lease_id: lease.id,
    item_ids: items.map((item) => item.id),
    due_date: "2026-08-31",
    reason: "tenant recharge"
  }, "transfer-key");

  assert.equal(request?.sourceExpectedVersion, 9);
  assert.equal(request?.amount, "30.00");
  assert.equal(request?.currency, "CNY");
  const payload = request?.canonicalPayload as Record<string, unknown>;
  assert.equal(payload.targetReceivableId, receivable.id);
  assert.equal(payload.targetReceivableMode, "existing");
  assert.equal(payload.targetReceivableExpectedVersion, 5);
  assert.equal(payload.targetReceivableOriginalAmount, "40.00");
  assert.equal(payload.targetReceivableOriginalPaidAmount, "5.00");
  assert.equal(payload.targetReceivableOriginalStatus, "partial");
  assert.equal(payload.aggregateDeltaAmount, "30.00");
  assert.deepEqual(payload.items, [
    { purchaseItemId: items[1]!.id, expectedVersion: 7, amount: "10.00",
      currency: "CNY", transferredReceivableId: null },
    { purchaseItemId: items[0]!.id, expectedVersion: 3, amount: "20.00",
      currency: "CNY", transferredReceivableId: null }
  ]);
  assert.deepEqual(purchaseAdvisoryKeys, [
    `housing-receivable|${scope.tenantId}|${scope.parkId}|${lease.id}|purchase_transfer|${purchase.id}|purchase_recharge|2026-08-01|2026-08-02`
  ]);

  repositoryCall = 0;
  const newManager = {
    getRepository: manager.getRepository,
    query: async (sql: string) => {
      if (sql.includes("pg_advisory_xact_lock")) return [];
      if (sql.includes("FROM biz_housing_receivable")) return [];
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  let newRequest: Record<string, unknown> | undefined;
  const newTargetService = new HousingService(
    {} as never, {} as never, {} as never, {} as never,
    { assertAccess: async () => undefined } as never, {} as never,
    { transaction: async (run: (value: typeof newManager) => unknown) => run(newManager) } as never,
    {} as never,
    { createPendingRequest: async (_context: unknown, input: Record<string, unknown>) => {
      newRequest = input;
      return input;
    } } as never,
    ...supportTail()
  );
  await newTargetService.transferPurchase(scope, actor, purchase.id, {
    lease_id: lease.id, item_ids: items.map((item) => item.id), due_date: "2026-08-31",
    reason: "new tenant recharge"
  }, "transfer-new-key");
  const newPayload = newRequest?.canonicalPayload as Record<string, unknown>;
  assert.equal(newPayload.targetReceivableMode, "new");
  assert.equal(newPayload.targetReceivableExpectedVersion, null);
  assert.equal(newPayload.targetReceivableOriginalAmount, "0.00");
  assert.equal(newPayload.targetReceivablePeriodStart, "2026-08-01");
  assert.equal(newPayload.targetReceivablePeriodEnd, "2026-08-02");
  assert.equal(newPayload.targetReceivableDueDate, "2026-08-31");
});

test("checkout submission and execution share the pointer-first ordered lock snapshot", async () => {
  const leaseId = "40000000-0000-4000-8000-000000000030";
  const occupancyId = "50000000-0000-4000-8000-000000000030";
  const handoverId = "60000000-0000-4000-8000-000000000030";
  const queryOrder: string[] = [];
  const checkoutRows = async (sql: string) => {
    if (sql.includes("FROM biz_housing_lease") && !sql.includes("FOR UPDATE")) {
      queryOrder.push("pointer");
      return [{ occupancyId }];
    }
    if (sql.includes("FROM biz_property_occupancy") && sql.includes("FOR UPDATE")) {
      queryOrder.push("occupancy");
      return [{ id: occupancyId, version: 2, status: "active" }];
    }
    if (sql.includes("FROM biz_housing_lease") && sql.includes("FOR UPDATE")) {
      queryOrder.push("lease");
      return [{ id: leaseId, unitId: "70000000-0000-4000-8000-000000000030",
        status: "checkout_pending", version: 7, occupancyId }];
    }
    if (sql.includes("FROM biz_housing_handover")) {
      queryOrder.push("handover");
      return [{ id: handoverId, version: 4 }];
    }
    if (sql.includes("FROM biz_housing_receivable")) {
      queryOrder.push("receivable");
      return [{ id: "80000000-0000-4000-8000-000000000030", version: 3,
        amount: "10.00", paidAmount: "10.00", waivedAmount: "0.00", status: "paid",
        currency: "CNY", sourceType: "housing_handover", sourceId: handoverId,
        chargeType: "checkout_charges" }];
    }
    if (sql.includes("FROM biz_housing_ledger_entry")) {
      queryOrder.push("ledger");
      return [
        { id: "90000000-0000-4000-8000-000000000030", version: 1,
          entryType: "deposit_receipt", amount: "5.00", currency: "CNY",
          receivableId: null, sourceType: "manual", sourceId: null },
        { id: "90000000-0000-4000-8000-000000000031", version: 1,
          entryType: "deposit_refund", amount: "5.00", currency: "CNY",
          receivableId: null, sourceType: "approval", sourceId: null }
      ];
    }
    throw new Error(`Unexpected query: ${sql}`);
  };
  let request: Record<string, unknown> | undefined;
  const submitManager = { query: checkoutRows };
  const service = new HousingService(
    {} as never, {} as never, {} as never, {} as never,
    { assertAccess: async () => undefined } as never, {} as never,
    { transaction: async (run: (value: typeof submitManager) => unknown) => run(submitManager) } as never,
    {} as never,
    { createPendingRequest: async (_context: unknown, input: Record<string, unknown>) => {
      request = input;
      return input;
    } } as never,
    ...supportTail()
  );

  await service.checkoutLease(scope, actor, leaseId, "checkout", "checkout-key");
  assert.deepEqual(queryOrder, ["pointer", "occupancy", "lease", "handover", "receivable", "ledger"]);
  const payload = request?.canonicalPayload as Record<string, unknown>;
  assert.equal(payload.outstandingAmount, "0.00");
  assert.equal(payload.depositBalance, "0.00");
  assert.match(String(payload.receivableContributorsHash), /^[a-f0-9]{64}$/u);
  assert.match(String(payload.ledgerContributorsHash), /^[a-f0-9]{64}$/u);

  queryOrder.length = 0;
  const executionManager = {
    query: async (sql: string) => {
      if (sql.includes("FROM biz_property_execution_effect_manifest")) return [{
        effectKind: "housing.lease.checkout", effectLineKey: `lease:${leaseId}`,
        effectHash: "a".repeat(64)
      }];
      if (sql.includes("FROM biz_property_approval_decision")) return [{ actorId: actor.sub }];
      if (sql.includes("UPDATE biz_property_occupancy")) return [{ version: 3 }];
      if (sql.includes("UPDATE biz_housing_lease")) return [{ version: 8, checkoutAt: new Date() }];
      if (sql.includes("INSERT INTO biz_housing_lease_effect_audit")) return [{
        id: "90000000-0000-4000-8000-000000000039"
      }];
      return checkoutRows(sql);
    }
  };
  await service.executeApprovedLeaseAction({
    manager: executionManager as never,
    requestId: "30000000-0000-4000-8000-000000000030",
    executionIdempotencyKey: "checkout-execution",
    canonicalPayload: payload,
    sourceExpectedVersion: 7,
    request: { tenantId: scope.tenantId, parkId: scope.parkId, sourceId: leaseId,
      requesterId: actor.sub }
  }, "housing.leases.checkout.request");
  assert.deepEqual(queryOrder, ["pointer", "occupancy", "lease", "handover", "receivable", "ledger"]);
});

test("purchase lifecycle records the approving decision actor as the payment executor", async () => {
  const decisionActor = "30000000-0000-4000-8000-000000000099";
  const purchaseId = "40000000-0000-4000-8000-000000000099";
  const requestId = "50000000-0000-4000-8000-000000000099";
  const mutations: Array<{ sql: string; parameters: unknown[] }> = [];
  const manager = {
    query: async (sql: string, parameters: unknown[] = []) => {
      if (sql.includes("FROM biz_housing_purchase WHERE")) {
        return [{ approvalStatus: "approved", paymentStatus: "unpaid", version: 4 }];
      }
      if (sql.includes("FROM biz_property_execution_effect_manifest")) {
        return [{ effectKind: "housing.purchase.lifecycle", effectLineKey: `purchase:${purchaseId}`,
          effectHash: "a".repeat(64) }];
      }
      if (sql.includes("FROM biz_property_approval_decision")) return [{ actorId: decisionActor }];
      if (sql.includes("UPDATE biz_housing_purchase")) {
        mutations.push({ sql, parameters });
        return [{ version: 5 }];
      }
      if (sql.includes("INSERT INTO biz_housing_purchase_effect_audit")) {
        mutations.push({ sql, parameters });
        return [{ id: "60000000-0000-4000-8000-000000000099" }];
      }
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  const service = new HousingService(
    {} as never, {} as never, {} as never, {} as never, {} as never, {} as never,
    {} as never, {} as never
  );

  await service.executeApprovedPurchaseLifecycle({
    manager: manager as never,
    requestId,
    executionIdempotencyKey: "purchase-pay-execution",
    sourceExpectedVersion: 4,
    canonicalPayload: {
      purchaseId, transition: "pay", beforeApprovalStatus: "approved",
      afterApprovalStatus: "approved", beforePaymentStatus: "unpaid",
      afterPaymentStatus: "paid", reason: "payment approved"
    },
    request: { tenantId: scope.tenantId, parkId: scope.parkId,
      sourceId: purchaseId, requesterId: actor.sub }
  });

  assert.equal(mutations.length, 2);
  assert.equal(mutations[0]!.parameters[7], decisionActor);
  assert.equal(mutations[1]!.parameters[6], decisionActor);
});

test("DEC-05 new target remains absent until execution and is inserted after item CAS", async () => {
  const purchaseId = "40000000-0000-4000-8000-000000000080";
  const leaseId = "50000000-0000-4000-8000-000000000080";
  const itemId = "60000000-0000-4000-8000-000000000080";
  const receivableId = "70000000-0000-4000-8000-000000000080";
  const operations: string[] = [];
  const advisoryKeys: string[] = [];
  const manager = {
    query: async (sql: string, parameters: unknown[] = []) => {
      if (sql.includes("FROM biz_housing_purchase\n") && sql.includes("FOR UPDATE")) {
        return [{ id: purchaseId, version: 9, currency: "CNY",
          approvalStatus: "approved", paymentStatus: "paid" }];
      }
      if (sql.includes("FROM biz_housing_lease")) {
        return [{ version: 4, currency: "CNY", status: "active" }];
      }
      if (sql.includes("FROM biz_housing_purchase_item") && sql.includes("FOR UPDATE")) {
        return [{ id: itemId, version: 2, amount: "30.00", transferredReceivableId: null }];
      }
      if (sql.includes("pg_advisory_xact_lock")) {
        advisoryKeys.push(String(parameters[0]));
        return [];
      }
      if (sql.includes("FROM biz_housing_receivable") && sql.includes("FOR UPDATE")) return [];
      if (sql.includes("FROM biz_property_execution_effect_manifest")) return [
        { effectKind: "housing.purchase.transfer", effectLineKey: `item:${itemId}`,
          effectHash: "a".repeat(64), lineAmount: null, currency: null },
        { effectKind: "housing.receivable.purchase.transfer",
          effectLineKey: `receivable:purchase-transfer:${receivableId}`,
          effectHash: "b".repeat(64), lineAmount: "30.00", currency: "CNY" }
      ];
      if (sql.includes("UPDATE biz_housing_purchase SET")) {
        operations.push("purchase-cas");
        return [{ version: 10 }];
      }
      if (sql.includes("UPDATE biz_housing_purchase_item SET")) {
        operations.push("item-cas");
        return [{ version: 3 }];
      }
      if (sql.includes("INSERT INTO biz_housing_purchase_transfer_effect_audit")) {
        operations.push("item-audit");
        return [{ id: "80000000-0000-4000-8000-000000000080" }];
      }
      if (sql.includes("INSERT INTO biz_housing_receivable")) {
        operations.push("receivable-insert");
        return [{ version: 1 }];
      }
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  const service = new HousingService(
    {} as never, {} as never, {} as never, {} as never, {} as never, {} as never,
    {} as never, {} as never, undefined, ...supportTail()
  );

  await service.executeApprovedPurchaseTransfer({
    manager: manager as never,
    requestId: "90000000-0000-4000-8000-000000000080",
    executionIdempotencyKey: "purchase-transfer-new",
    sourceExpectedVersion: 9,
    canonicalPayload: {
      purchaseId, leaseId, leaseExpectedVersion: 4, targetReceivableId: receivableId,
      targetReceivableMode: "new", targetReceivableExpectedVersion: null,
      targetReceivableOriginalAmount: "0.00", targetReceivableOriginalPaidAmount: "0.00",
      targetReceivableOriginalWaivedAmount: "0.00", targetReceivableOriginalStatus: "absent",
      targetReceivablePeriodStart: "2026-08-01", targetReceivablePeriodEnd: "2026-08-02",
      targetReceivableDueDate: "2026-08-31", targetReceivableSourceType: "purchase_transfer",
      targetReceivableSourceId: purchaseId, targetReceivableChargeType: "purchase_recharge",
      aggregateDeltaAmount: "30.00", currency: "CNY", reason: "approved transfer",
      items: [{ purchaseItemId: itemId, expectedVersion: 2, amount: "30.00",
        currency: "CNY", transferredReceivableId: null }]
    },
    request: { tenantId: scope.tenantId, parkId: scope.parkId,
      sourceId: purchaseId, requesterId: actor.sub }
  });

  assert.deepEqual(operations, ["purchase-cas", "item-cas", "item-audit", "receivable-insert"]);
  assert.deepEqual(advisoryKeys, [
    `housing-receivable|${scope.tenantId}|${scope.parkId}|${leaseId}|purchase_transfer|${purchaseId}|purchase_recharge|2026-08-01|2026-08-02`
  ]);
});
