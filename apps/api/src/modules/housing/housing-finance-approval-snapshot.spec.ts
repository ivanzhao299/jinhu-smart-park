import assert from "node:assert/strict";
import test from "node:test";
import { ConflictException } from "@nestjs/common";
import { HousingFinanceCommandService } from "./housing-finance-command.service";
import { ApprovalExecutionError } from "../property-approvals/property-approval.service";

const leaseId = "40000000-0000-4000-8000-000000000001";
const receivableId = "50000000-0000-4000-8000-000000000001";
function fixture(entryType: string) {
  const lease = { version: 3, currency: "CNY", depositAmount: "100.00" };
  const receivable = {
    version: 4, amount: "100.00", paidAmount: "20.00", waivedAmount: "0.00",
    chargeType: entryType === "deposit-refund" ? "deposit" : "rent", currency: "CNY", status: "partial"
  };
  const options = { missingLease: false, missingReceivable: false, errorAt: "", error: null as unknown, casAt: "" };
  const statements: string[] = [];
  const manager = {
    getRepository: () => ({ find: async () => [{ entryType: "deposit_receipt", amount: "20.00", status: "confirmed" }] }),
    query: async (sql: string) => {
      statements.push(sql);
      if (options.errorAt && sql.includes(options.errorAt)) throw options.error;
      if (options.casAt && sql.includes(options.casAt)) return [[], 0];
      if (sql.includes("FROM biz_housing_lease")) return options.missingLease ? [] : [lease];
      if (sql.includes("FROM biz_housing_receivable")) return options.missingReceivable ? [] : [receivable];
      if (sql.includes("count(*)")) return [{ count: 0 }];
      if (sql.includes("FROM biz_property_execution_effect_manifest")) return [{
        effectKind: `housing.ledger.${entryType}`, effectLineKey: "line", effectHash: "a".repeat(64),
        lineAmount: "1.00", currency: "CNY"
      }];
      if (sql.includes("UPDATE biz_housing_receivable")) return [[{ version: 5 }], 1];
      if (sql.includes("INSERT INTO biz_housing_ledger_entry")) return [{ id: "ledger" }];
      if (sql.includes("UPDATE biz_housing_lease")) return [[{ version: 4 }], 1];
      throw new Error(`Unexpected SQL: ${sql}`);
    }
  };
  const input = {
    manager: manager as never, requestId: "request", executionIdempotencyKey: "execution", sourceExpectedVersion: 3,
    canonicalPayload: { leaseId, lines: [{
      entryType, receivableId, receivableExpectedVersion: 4, receivableAmount: "100.00",
      receivablePaidAmount: "20.00", receivableWaivedAmount: "0.00", chargeType: receivable.chargeType,
      amount: "1.00", currency: "CNY"
    }] },
    request: { tenantId: "tenant", parkId: "park", sourceId: leaseId, requesterId: "requester" }
  };
  const service = new HousingFinanceCommandService({} as never, {} as never, {} as never);
  return { lease, receivable, options, statements, input, execute: () => service.executeApprovedFinance(input) };
}
const drifts: Array<[string, (context: ReturnType<typeof fixture>) => void]> = [
  ["missing lease", c => { c.options.missingLease = true; }],
  ["lease version", c => { c.lease.version++; }],
  ["missing receivable", c => { c.options.missingReceivable = true; }],
  ["receivable version", c => { c.receivable.version++; }],
  ["amount", c => { c.receivable.amount = "101.00"; }],
  ["paid amount", c => { c.receivable.paidAmount = "21.00"; }],
  ["waived amount", c => { c.receivable.waivedAmount = "1.00"; }],
  ["currency", c => { c.receivable.currency = "USD"; }],
  ["void", c => { c.receivable.status = "void"; }]
];
for (const action of ["refund", "waiver", "deposit-refund"]) {
  for (const [name, drift] of drifts) {
    test(`${action}: ${name} is business source drift before any domain writes`, async () => {
      const c = fixture(action); drift(c);
      await assert.rejects(c.execute(), (error: unknown) => {
        assert.ok(error instanceof ApprovalExecutionError);
        assert.equal(error.category, "business");
        assert.equal(error.stableCode, "approval-source-changed");
        return true;
      });
      assert.equal(c.statements.length, 2);
      assert(c.statements.every(sql => sql.trimStart().startsWith("SELECT")));
    });
  }
  test(`${action}: matching snapshot retains one ledger and lease advancement`, async () => {
    const c = fixture(action); await c.execute();
    assert.equal(c.statements.filter(sql => sql.includes("INSERT INTO biz_housing_ledger_entry")).length, 1);
    assert.equal(c.statements.filter(sql => sql.includes("UPDATE biz_housing_lease")).length, 1);
    assert.equal(c.statements.filter(sql => sql.includes("UPDATE biz_housing_receivable")).length, action === "deposit-refund" ? 0 : 1);
  });
}
for (const location of ["FROM biz_housing_lease", "FROM biz_housing_receivable", "UPDATE biz_housing_receivable", "UPDATE biz_housing_lease"]) {
  for (const error of [
    ...["40001", "40P01"].flatMap(code => [Object.assign(new Error(code), { code }), Object.assign(new Error(code), { driverError: { code } })]),
    new ConflictException("Approval source changed")
  ]) {
    test(`${location}: ${JSON.stringify(error)} propagates original object`, async () => {
      const c = fixture("refund"); c.options.errorAt = location; c.options.error = error;
      await assert.rejects(c.execute(), actual => actual === error);
    });
  }
}
for (const location of ["UPDATE biz_housing_receivable", "UPDATE biz_housing_lease"]) {
  test(`${location}: zero-row CAS remains ordinary conflict`, async () => {
    const c = fixture("refund"); c.options.casAt = location;
    await assert.rejects(c.execute(), ConflictException);
  });
}
for (const field of ["lines", "uuid", "sourceId"]) {
  test(`invalid ${field} stays outside source snapshot classification`, async () => {
    const c = fixture("refund");
    if (field === "lines") c.input.canonicalPayload.lines = [];
    if (field === "uuid") c.input.canonicalPayload.leaseId = "invalid";
    if (field === "sourceId") c.input.request.sourceId = receivableId;
    await assert.rejects(c.execute(), ConflictException);
    assert.equal(c.statements.length, 0);
  });
}
