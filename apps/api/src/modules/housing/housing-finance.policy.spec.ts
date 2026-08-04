import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  addHousingMoneyAmounts,
  applyHousingReceivableMutation,
  assertHousingDepositMutation,
  assertHousingPurchaseTransferLeaseStatus,
  calculateHousingDepositBalance,
  calculateHousingMeterCharge,
  calculateHousingPurchaseAmounts,
  multiplyHousingMoneyByRatio
} from "./housing-finance.policy";

test("payment and waiver settle one receivable without exceeding its amount", () => {
  const partial = applyHousingReceivableMutation("120.00", "0.00", "0.00", "payment", "100.00");
  assert.deepEqual(partial, { paidAmount: "100.00", waivedAmount: "0.00", status: "partial" });
  const settled = applyHousingReceivableMutation(120, partial.paidAmount, partial.waivedAmount, "waiver", 20);
  assert.deepEqual(settled, { paidAmount: "100.00", waivedAmount: "20.00", status: "paid" });
  assert.throws(() => applyHousingReceivableMutation(120, 100, 20, "payment", 1));
});

test("refund reverses only an existing paid amount", () => {
  assert.deepEqual(
    applyHousingReceivableMutation(100, 100, 0, "refund", 40),
    { paidAmount: "60.00", waivedAmount: "0.00", status: "partial" }
  );
  assert.throws(() => applyHousingReceivableMutation(100, 20, 0, "refund", 21));
});

test("deposit receipt, deduction, and refund stay within the agreed balance", () => {
  const current = calculateHousingDepositBalance([
    { entryType: "deposit_receipt", amount: 3000 },
    { entryType: "deposit_deduction", amount: 500 }
  ]);
  assert.equal(current, "2500.00");
  assert.equal(assertHousingDepositMutation(3000, current, "deposit_refund", 2500), "0.00");
  assert.throws(() => assertHousingDepositMutation(3000, current, "deposit_refund", 2501));
  assert.throws(() => assertHousingDepositMutation(3000, current, "deposit_receipt", 501));
});

test("settlements preserve cents beyond JavaScript safe integer precision", () => {
  const partial = applyHousingReceivableMutation(
    "99999999999999.99",
    "0.00",
    "0.00",
    "payment",
    "99999999999999.98"
  );
  assert.deepEqual(partial, {
    paidAmount: "99999999999999.98",
    waivedAmount: "0.00",
    status: "partial"
  });
  assert.deepEqual(
    applyHousingReceivableMutation(
      "99999999999999.99",
      partial.paidAmount,
      partial.waivedAmount,
      "payment",
      "0.01"
    ),
    {
      paidAmount: "99999999999999.99",
      waivedAmount: "0.00",
      status: "paid"
    }
  );
});

test("purchase header total is derived from persisted rounded line amounts", () => {
  assert.deepEqual(
    calculateHousingPurchaseAmounts([{ quantity: "0.004", unitPrice: "36.25" }]),
    { lineAmounts: ["0.15"], totalAmount: "0.15" }
  );
  assert.deepEqual(
    calculateHousingPurchaseAmounts([
      { quantity: "0.333", unitPrice: "0.01" },
      { quantity: "0.333", unitPrice: "0.01" },
      { quantity: "0.333", unitPrice: "0.01" }
    ]),
    { lineAmounts: ["0.00", "0.00", "0.00"], totalAmount: "0.00" }
  );
  assert.deepEqual(
    calculateHousingPurchaseAmounts([
      { quantity: "1", unitPrice: "0.015" },
      { quantity: "1", unitPrice: "0.015" }
    ]),
    { lineAmounts: ["0.02", "0.02"], totalAmount: "0.04" }
  );
  assert.deepEqual(
    calculateHousingPurchaseAmounts([
      { quantity: "900000000000", unitPrice: "9999" }
    ]),
    { lineAmounts: ["8999100000000000.00"], totalAmount: "8999100000000000.00" }
  );
});

test("fixed rent proration preserves cents beyond JavaScript safe integer range", () => {
  assert.equal(
    multiplyHousingMoneyByRatio("99999999999999.99", 1n, 1n),
    "99999999999999.99"
  );
  assert.equal(
    multiplyHousingMoneyByRatio("99999999999999.99", 1n, 2n),
    "50000000000000.00"
  );
});

test("purchase transfers add persisted numeric strings without JavaScript precision loss", () => {
  assert.equal(
    addHousingMoneyAmounts(["1234567890123456.78", "0.11"]),
    "1234567890123456.89"
  );
  assert.throws(() => addHousingMoneyAmounts(["9999999999999999.99", "0.01"]));
});

test("purchase recharge is limited to collectible lease lifecycles", () => {
  assert.doesNotThrow(() => assertHousingPurchaseTransferLeaseStatus("active"));
  assert.doesNotThrow(() => assertHousingPurchaseTransferLeaseStatus("expiring"));
  assert.doesNotThrow(() => assertHousingPurchaseTransferLeaseStatus("checkout_pending"));
  assert.throws(() => assertHousingPurchaseTransferLeaseStatus("draft"));
  assert.throws(() => assertHousingPurchaseTransferLeaseStatus("terminated"));
  assert.throws(() => assertHousingPurchaseTransferLeaseStatus("void"));
});

test("energy meter charges apply the configured multiplier to usage and amount", () => {
  assert.deepEqual(
    calculateHousingMeterCharge(120, 135, 2.5, 0.8),
    { usageAmount: "37.500000", amount: "30.00" }
  );
  assert.throws(() => calculateHousingMeterCharge(135, 120, 2.5, 0.8));
  assert.throws(() => calculateHousingMeterCharge(120, 135, 0, 0.8));
  assert.deepEqual(
    calculateHousingMeterCharge(
      "999999999999.000001",
      "999999999999.000002",
      "1.000000",
      "999999999999.000000"
    ),
    { usageAmount: "0.000001", amount: "1000000.00" }
  );
  assert.deepEqual(
    calculateHousingMeterCharge(
      "999999999999.000001",
      "999999999999.000002",
      "0.500000",
      "999999999999.000000"
    ),
    { usageAmount: "0.000001", amount: "500000.00" }
  );
});

test("receivable reuse includes the source identity used by the database uniqueness key", () => {
  const servicePath = resolve(__dirname, "housing-receivable-writer.service.ts");
  const service = readFileSync(servicePath, "utf8");

  assert.match(service, /sourceId: input\.sourceId \?\? IsNull\(\)/);
});

test("housing service revalidates meter state and makes completed handover retries side-effect free", () => {
  const servicePath = resolve(__dirname, "housing.service.ts");
  const service = readFileSync(servicePath, "utf8");
  const billing = readFileSync(
    resolve(__dirname, "housing-billing-command.service.ts"),
    "utf8"
  );
  const handover = readFileSync(
    resolve(__dirname, "housing-handover-command.service.ts"),
    "utf8"
  );

  assert.match(billing, /!meter\.isEnabled \|\| meter\.status !== "ONLINE"/);
  assert.match(handover, /if \(handover\?\.status === "completed"\) \{/);
  assert.ok(
    handover.indexOf('if (handover?.status === "completed") {')
      < handover.indexOf("Deposit deduction cannot exceed agreed deposit")
  );
  assert.match(handover, /Move-in handover cannot include damage, unsettled, or deposit deduction amounts/);
  assert.match(service, /Transferred purchase items must be reversed before refunding the purchase/);
});

test("housing repair binds evidence under the same file-row lock transaction", () => {
  const repair = readFileSync(resolve(__dirname, "housing-repair-command.service.ts"), "utf8");
  assert.match(repair, /this\.dataSource\.transaction\(async \(manager\)/);
  assert.match(repair, /this\.support\.assertFiles\(manager/);
  assert.doesNotMatch(repair, /lock:\s*false/);
  assert.match(repair, /this\.workOrdersService\.create\([\s\S]*manager\)/);
});
