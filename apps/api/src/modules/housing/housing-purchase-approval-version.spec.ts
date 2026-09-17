import assert from "node:assert/strict";
import test from "node:test";
import { ConflictException } from "@nestjs/common";
import { ApprovalExecutionError } from "../property-approvals/property-approval.service";
import { HousingPurchaseApprovalExecutorService } from "./housing-purchase-approval-executor.service";

function fixture() {
  const purchaseId = "40000000-0000-4000-8000-000000000001";
  const leaseId = "50000000-0000-4000-8000-000000000001";
  const targetReceivableId = "60000000-0000-4000-8000-000000000001";
  const purchaseItemId = "70000000-0000-4000-8000-000000000001";
  const purchase = { id: purchaseId, version: 3, currency: "CNY", approvalStatus: "approved", paymentStatus: "unpaid" };
  const lease = { version: 5, currency: "CNY", status: "active" };
  const options = { missing: false, manifest: true, cas: true, errorAt: "", error: null as unknown };
  const statements: string[] = [];
  const manager = { query: async (sql: string) => {
    statements.push(sql);
    if (options.errorAt && sql.includes(options.errorAt)) throw options.error;
    if (sql.includes("FROM biz_housing_purchase\n")) return [purchase];
    if (sql.includes("FROM biz_housing_lease")) return options.missing ? [] : [lease];
    if (sql.includes("FROM biz_housing_purchase_item")) return [{ id: purchaseItemId, version: 1, amount: "10.00", transferredReceivableId: null }];
    if (sql.includes("FROM biz_housing_receivable")) return [];
    if (sql.includes("FROM biz_property_execution_effect_manifest")) return options.manifest ? [
      { effectKind: "housing.purchase.transfer", effectLineKey: `item:${purchaseItemId}`, effectHash: "a".repeat(64) },
      { effectKind: "housing.receivable.purchase.transfer", lineAmount: "10.00", currency: "CNY" }
    ] : [];
    if (sql.includes("UPDATE biz_housing_purchase SET")) return options.cas ? [[{ version: 4 }], 1] : [[], 0];
    if (sql.includes("UPDATE biz_housing_purchase_item")) return [[{ version: 2 }], 1];
    if (sql.includes("INSERT INTO biz_housing_purchase_transfer_effect_audit")) return [{ id: "audit" }];
    if (sql.includes("INSERT INTO biz_housing_receivable")) return [{ version: 1 }];
    throw new Error(`Unexpected SQL: ${sql}`);
  } };
  const support = { lockBusinessKey: async () => {}, receivableBusinessKey: () => "fixture-key" };
  const input = {
    manager: manager as never, requestId: "request", executionIdempotencyKey: "execution", sourceExpectedVersion: 3,
    request: { tenantId: "tenant", parkId: "park", sourceId: purchaseId, requesterId: "actor" },
    canonicalPayload: { purchaseId, leaseId, targetReceivableId, leaseExpectedVersion: 5, currency: "CNY",
      targetReceivableMode: "new", targetReceivableExpectedVersion: null, targetReceivableOriginalAmount: "0.00", aggregateDeltaAmount: "10.00",
      items: [{ purchaseItemId, expectedVersion: 1, amount: "10.00", currency: "CNY", transferredReceivableId: null }] }
  };
  const service = new HousingPurchaseApprovalExecutorService(support as never);
  return { lease, purchase, options, statements, input, execute: () => service.executeApprovedPurchaseTransfer(input) };
}

for (const status of ["active", "expiring", "checkout_pending"]) {
  test(`matching ${status} transfers once`, async () => {
    const c = fixture(); c.lease.status = status; await c.execute();
    for (const fragment of ["UPDATE biz_housing_purchase SET", "UPDATE biz_housing_purchase_item", "INSERT INTO biz_housing_purchase_transfer_effect_audit", "INSERT INTO biz_housing_receivable"]) {
      assert.equal(c.statements.filter(s => s.includes(fragment)).length, 1);
    }
  });
}
for (const status of ["active", "terminated"]) {
  test(`existing changed lease version with ${status} is business before item locks or writes`, async () => {
    const c = fixture(); c.lease.version++; c.lease.status = status;
    await assert.rejects(c.execute(), (error: unknown) => {
      assert(error instanceof ApprovalExecutionError);
      assert.equal(error.category, "business"); assert.equal(error.stableCode, "approval-source-changed"); return true;
    });
    assert.equal(c.statements.length, 2); assert(c.statements.every(s => s.startsWith("SELECT")));
  });
}
const boundaries: Array<[string, (c: ReturnType<typeof fixture>) => void, number]> = [
  ["missing lease", c => { c.options.missing = true; }, 2],
  ["same-version currency", c => { c.lease.currency = "USD"; }, 2],
  ["same-version status", c => { c.lease.status = "terminated"; }, 2],
  ["purchase version", c => { c.purchase.version++; }, 1],
  ["input source", c => { c.input.request.sourceId = c.input.canonicalPayload.leaseId; }, 0],
  ["manifest", c => { c.options.manifest = false; }, 5],
  ["purchase CAS", c => { c.options.cas = false; }, 6]
];
for (const [name, change, count] of boundaries) {
  test(`${name} retains ordinary conflict`, async () => {
    const c = fixture(); change(c); await assert.rejects(c.execute(), ConflictException);
    assert.equal(c.statements.length, count);
    assert(!c.statements.some(s => s.includes("UPDATE biz_housing_purchase_item") || s.includes("INSERT INTO")));
  });
}
for (const location of ["FROM biz_housing_purchase\n", "FROM biz_housing_lease"]) {
  for (const code of ["40001", "40P01"]) for (const wrapped of [false, true]) {
    test(`${location.trim()} ${code} driverError=${wrapped} preserves original error`, async () => {
      const c = fixture(); const error = Object.assign(new Error(code), wrapped ? { driverError: { code } } : { code });
      c.options.errorAt = location; c.options.error = error;
      await assert.rejects(c.execute(), actual => actual === error);
      assert(c.statements.every(s => s.startsWith("SELECT")));
    });
  }
}
