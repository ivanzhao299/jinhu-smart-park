import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  applyHousingReceivableMutation,
  assertHousingDepositMutation,
  assertHousingPurchaseTransferLeaseStatus,
  calculateHousingDepositBalance,
  calculateHousingPurchaseAmounts
} from "./housing-finance.policy";

test("payment and waiver settle one receivable without exceeding its amount", () => {
  const partial = applyHousingReceivableMutation(120, 0, 0, "payment", 100);
  assert.deepEqual(partial, { paidAmount: 100, waivedAmount: 0, status: "partial" });
  const settled = applyHousingReceivableMutation(120, partial.paidAmount, partial.waivedAmount, "waiver", 20);
  assert.deepEqual(settled, { paidAmount: 100, waivedAmount: 20, status: "paid" });
  assert.throws(() => applyHousingReceivableMutation(120, 100, 20, "payment", 1));
});

test("refund reverses only an existing paid amount", () => {
  assert.deepEqual(
    applyHousingReceivableMutation(100, 100, 0, "refund", 40),
    { paidAmount: 60, waivedAmount: 0, status: "partial" }
  );
  assert.throws(() => applyHousingReceivableMutation(100, 20, 0, "refund", 21));
});

test("deposit receipt, deduction, and refund stay within the agreed balance", () => {
  const current = calculateHousingDepositBalance([
    { entryType: "deposit_receipt", amount: 3000 },
    { entryType: "deposit_deduction", amount: 500 }
  ]);
  assert.equal(current, 2500);
  assert.equal(assertHousingDepositMutation(3000, current, "deposit_refund", 2500), 0);
  assert.throws(() => assertHousingDepositMutation(3000, current, "deposit_refund", 2501));
  assert.throws(() => assertHousingDepositMutation(3000, current, "deposit_receipt", 501));
});

test("purchase header total is derived from persisted rounded line amounts", () => {
  assert.deepEqual(
    calculateHousingPurchaseAmounts([{ quantity: 0.004, unitPrice: 36.25 }]),
    { lineAmounts: ["0.15"], totalAmount: "0.15" }
  );
  assert.deepEqual(
    calculateHousingPurchaseAmounts([
      { quantity: 0.333, unitPrice: 0.01 },
      { quantity: 0.333, unitPrice: 0.01 },
      { quantity: 0.333, unitPrice: 0.01 }
    ]),
    { lineAmounts: ["0.00", "0.00", "0.00"], totalAmount: "0.00" }
  );
  assert.deepEqual(
    calculateHousingPurchaseAmounts([
      { quantity: 1, unitPrice: 0.015 },
      { quantity: 1, unitPrice: 0.015 }
    ]),
    { lineAmounts: ["0.02", "0.02"], totalAmount: "0.04" }
  );
  assert.deepEqual(
    calculateHousingPurchaseAmounts([
      { quantity: 900000000000, unitPrice: 9999 }
    ]),
    { lineAmounts: ["8999100000000000.00"], totalAmount: "8999100000000000.00" }
  );
});

test("purchase recharge is limited to collectible lease lifecycles", () => {
  assert.doesNotThrow(() => assertHousingPurchaseTransferLeaseStatus("active"));
  assert.doesNotThrow(() => assertHousingPurchaseTransferLeaseStatus("expiring"));
  assert.doesNotThrow(() => assertHousingPurchaseTransferLeaseStatus("checkout_pending"));
  assert.throws(() => assertHousingPurchaseTransferLeaseStatus("draft"));
  assert.throws(() => assertHousingPurchaseTransferLeaseStatus("terminated"));
  assert.throws(() => assertHousingPurchaseTransferLeaseStatus("void"));
});

test("receivable reuse includes the source identity used by the database uniqueness key", () => {
  const servicePath = resolve(__dirname, "housing.service.ts");
  const service = readFileSync(servicePath, "utf8");

  assert.match(service, /sourceId: input\.sourceId \?\? IsNull\(\)/);
});
