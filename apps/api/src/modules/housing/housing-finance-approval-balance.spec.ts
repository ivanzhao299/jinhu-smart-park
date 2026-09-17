import assert from "node:assert/strict";
import test from "node:test";
import { ConflictException } from "@nestjs/common";
import { HousingFinanceCommandService } from "./housing-finance-command.service";
import { applyHousingReceivableMutation, HousingReceivableBalanceError } from "./housing-finance.policy";
import { ApprovalExecutionError } from "../property-approvals/property-approval.service";

const scope = { tenantId: "tenant-1", parkId: "park-1" };
const actor = { sub: "user-1" };

function approvalFixture(entryType: "refund" | "waiver", amount: string, options: { version?: number; databaseError?: Error } = {}) {
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
          version: options.version ?? 4,
          amount: "100.00",
          paidAmount: "20.00",
          waivedAmount: "0.00",
          chargeType: "rent",
          currency: "CNY",
          status: "partial"
        }];
      }
      if (sql.includes("count(*)")) return [{ count: 0 }];
      if (sql.includes("FROM biz_property_execution_effect_manifest")) {
        return [{
          effectKind: `housing.ledger.${entryType}`,
          effectLineKey: `ledger:${receivableId}:${entryType}`,
          effectHash: "a".repeat(64),
          lineAmount: amount,
          currency: "CNY"
        }];
      }
      if (sql.includes("UPDATE biz_housing_receivable")) {
        if (options.databaseError) throw options.databaseError;
        return [[{ version: 5 }], 1];
      }
      if (sql.includes("INSERT INTO biz_housing_ledger_entry")) return [{ id: "ledger-1" }];
      if (sql.includes("UPDATE biz_housing_lease")) return [{ version: 4 }];
      throw new Error(`unexpected query: ${sql}`);
    }
  };
  const service = new HousingFinanceCommandService(
    {} as never,
    {} as never,
    {} as never
  );

  const execute = () => service.executeApprovedFinance({
    manager: manager as never,
    requestId: "60000000-0000-4000-8000-000000000001",
    executionIdempotencyKey: "execution-key",
    sourceExpectedVersion: 3,
    canonicalPayload: {
      leaseId,
      reason: "approved waiver",
      lines: [{
        entryType,
        receivableId,
        receivableExpectedVersion: 4,
        receivableAmount: "100.00",
        receivablePaidAmount: "20.00",
        receivableWaivedAmount: "0.00",
        chargeType: "rent",
        amount,
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

  return { execute, statements };
}

for (const [entryType, amount] of [["refund", "20.01"], ["waiver", "80.01"]] as const) {
  test(`approved ${entryType} balance rejection is stable business without financial writes`, async () => {
    const context = approvalFixture(entryType, amount);
    await assert.rejects(context.execute(), (error: unknown) => {
      assert.ok(error instanceof ApprovalExecutionError);
      assert.equal(error.category, "business");
      assert.equal(error.stableCode, "housing-receivable-balance-exceeded");
      return true;
    });
    assert.equal(context.statements.some(({ sql }) => /UPDATE|INSERT/.test(sql.replaceAll("FOR UPDATE", ""))), false);
  });

  test(`direct ${entryType} balance rejection retains the HTTP 409 response`, () => {
    assert.throws(() => applyHousingReceivableMutation("100.00", "20.00", "0.00", entryType, amount),
      (error: unknown) => {
        assert.ok(error instanceof HousingReceivableBalanceError);
        assert.ok(error instanceof ConflictException);
        assert.deepEqual(error.getResponse(), {
          message: "Financial entry exceeds receivable balance", error: "Conflict", statusCode: 409
        });
        return true;
      });
  });
}

for (const entryType of ["refund", "waiver"] as const) {
  test(`approved ${entryType} within balance still writes one ledger and advances versions`, async () => {
    const context = approvalFixture(entryType, "10.00");
    await context.execute();
    const update = context.statements.find(({ sql }) => sql.includes("UPDATE biz_housing_receivable"));
    assert.deepEqual(update?.parameters.slice(4, 7), entryType === "refund"
      ? ["10.00", "0.00", "partial"] : ["20.00", "10.00", "partial"]);
    assert.equal(context.statements.filter(({ sql }) => sql.includes("INSERT INTO biz_housing_ledger_entry")).length, 1);
    assert.equal(context.statements.filter(({ sql }) => sql.includes("UPDATE biz_housing_lease")).length, 1);
  });
}

test("frozen receivable version rejection remains source changed before balance validation", async () => {
  const context = approvalFixture("refund", "20.01", { version: 5 });
  await assert.rejects(context.execute(), (error: unknown) => {
    assert.ok(error instanceof ApprovalExecutionError);
    assert.equal(error.category, "business");
    assert.equal(error.stableCode, "approval-source-changed");
    assert.equal(error.redactedMessage, "Approval source changed");
    return true;
  });
  assert.equal(context.statements.length, 2);
});

for (const code of ["40001", "40P01"]) {
  test(`database ${code} after balance validation is propagated unchanged`, async () => {
    const databaseError = Object.assign(new Error("database concurrency conflict"), { driverError: { code } });
    const context = approvalFixture("refund", "10.00", { databaseError });
    await assert.rejects(context.execute(), (error: unknown) => error === databaseError);
    assert.equal(context.statements.some(({ sql }) => sql.includes("INSERT INTO")), false);
  });
}
