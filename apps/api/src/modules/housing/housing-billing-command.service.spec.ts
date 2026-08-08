import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException, ConflictException } from "@nestjs/common";
import type { TenantParkScope } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import {
  HousingChargePlanEntity,
  HousingReceivableEntity
} from "./entities/housing.entities";
import { HousingBillingCommandService } from "./housing-billing-command.service";

const scope: TenantParkScope = { tenantId: "tenant-1", parkId: "park-1" };
const actor = {
  sub: "user-1",
  username: "user-1",
  tenantId: scope.tenantId,
  parkId: scope.parkId,
  roles: [],
  permissions: []
} satisfies JwtPrincipal;
const lease = {
  id: "lease-1",
  unitId: "unit-1",
  status: "active",
  startDate: "2026-01-01",
  endDate: "2026-12-31",
  firstDueDate: "2026-01-05",
  billingDay: 10,
  currency: "CNY"
};
const plan = {
  id: "plan-1",
  chargeType: "rent",
  billingSource: "fixed",
  meterId: null,
  amount: "1000.00",
  unitPrice: null,
  cycleMonths: 1
};
const dto = {
  period_start: "2026-01-01",
  period_end: "2026-02-01",
  charge_plan_id: plan.id,
  reason: "January rent"
};

function billingHarness(overlapping: unknown = null) {
  const events: string[] = [];
  const writerInputs: unknown[] = [];
  let lockMode: string | undefined;
  const builder = {
    setLock(mode: string) {
      lockMode = mode;
      return this;
    },
    where() { return this; },
    andWhere() { return this; },
    async getOne() {
      events.push("overlap-check");
      return overlapping;
    }
  };
  const manager = {
    getRepository(entity: unknown) {
      if (entity === HousingChargePlanEntity) {
        return { findOne: async () => plan };
      }
      if (entity === HousingReceivableEntity) {
        return {
          createQueryBuilder: () => builder,
          findOne: async () => null
        };
      }
      throw new Error("unexpected repository");
    }
  };
  const support = {
    assertDatePeriod() { events.push("date-check"); },
    async lockLease() {
      events.push("lease-lock");
      return lease;
    },
    assertStatus() { events.push("status-check"); },
    isUniqueViolation() { return false; }
  };
  const writer = {
    async create(...args: unknown[]) {
      events.push("receivable-write");
      writerInputs.push(args.at(-1));
      return { id: "receivable-1" };
    }
  };
  let transactions = 0;
  const dataSource = {
    async transaction(callback: (value: typeof manager) => unknown) {
      transactions += 1;
      return callback(manager);
    }
  };
  const service = new HousingBillingCommandService(
    dataSource as never,
    { assertAccess: async () => events.push("access-check") } as never,
    support as never,
    writer as never
  );
  return {
    service,
    events,
    writerInputs,
    transactions: () => transactions,
    lockMode: () => lockMode
  };
}

test("billing generation serializes by lease and returns one atomic receivable result", async () => {
  const harness = billingHarness();

  const result = await harness.service.generateBills(scope, actor, lease.id, dto as never);

  assert.deepEqual(result, [{ id: "receivable-1" }]);
  assert.equal(harness.transactions(), 1);
  assert.equal(harness.lockMode(), "pessimistic_write");
  assert.deepEqual(harness.events, [
    "date-check",
    "lease-lock",
    "access-check",
    "status-check",
    "overlap-check",
    "receivable-write"
  ]);
  assert.deepEqual(harness.writerInputs, [{
    chargePlanId: "plan-1",
    sourceType: "fixed",
    sourceId: null,
    chargeType: "rent",
    periodStart: "2026-01-01",
    periodEnd: "2026-02-01",
    dueDate: "2026-01-05",
    amount: "1000.00",
    openingReading: undefined,
    closingReading: undefined,
    usageAmount: undefined,
    unitPrice: undefined,
    remark: "January rent"
  }]);
});

test("billing overlap conflict stops before any receivable write", async () => {
  const harness = billingHarness({ id: "existing-receivable" });

  await assert.rejects(
    harness.service.generateBills(scope, actor, lease.id, dto as never),
    (error: unknown) => error instanceof ConflictException
      && error.message.includes("overlaps an existing receivable")
  );
  assert.equal(harness.events.includes("receivable-write"), false);
});

test("charge-plan shape validation stops before opening a transaction", async () => {
  let transactions = 0;
  const service = new HousingBillingCommandService(
    { transaction: async () => { transactions += 1; } } as never,
    {} as never,
    { isUniqueViolation: () => false } as never,
    {} as never
  );

  await assert.rejects(
    service.saveChargePlan(scope, actor, lease.id, {
      charge_type: "rent",
      billing_source: "fixed",
      cycle_months: 1,
      enabled: true
    }),
    BadRequestException
  );
  assert.equal(transactions, 0);
});

test("charge-plan uniqueness races remain an explicit conflict", async () => {
  const service = new HousingBillingCommandService(
    { transaction: async () => { throw { code: "23505" }; } } as never,
    {} as never,
    { isUniqueViolation: (error: { code?: string }) => error.code === "23505" } as never,
    {} as never
  );

  await assert.rejects(
    service.saveChargePlan(scope, actor, lease.id, {
      charge_type: "rent",
      billing_source: "fixed",
      cycle_months: 1,
      amount: "1000.00",
      enabled: true
    }),
    (error: unknown) => error instanceof ConflictException
      && error.message.includes("already exists")
  );
});
