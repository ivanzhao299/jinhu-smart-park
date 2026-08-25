import assert from "node:assert/strict";
import test from "node:test";
import {
  assertHomestayLedgerEntryAllowedForBookingStatus,
  assertHomestayManualLedgerMutation,
  calculateCancellableRoomCharge,
  summarizeHomestayLedger
} from "./homestay-finance.policy";

test("manual ledger status matrix fails closed for draft and terminal bookings", () => {
  for (const status of ["confirmed", "checked_in"] as const) {
    for (const entryType of ["charge", "payment", "refund", "waiver"] as const) {
      assert.doesNotThrow(() =>
        assertHomestayLedgerEntryAllowedForBookingStatus(status, entryType));
    }
  }
  assert.doesNotThrow(() =>
    assertHomestayLedgerEntryAllowedForBookingStatus("checked_out", "payment"));
  assert.throws(() =>
    assertHomestayLedgerEntryAllowedForBookingStatus("checked_out", "charge"));
  for (const status of ["cancelled", "no_show"] as const) {
    assert.throws(() =>
      assertHomestayLedgerEntryAllowedForBookingStatus(status, "charge"));
    assert.throws(() =>
      assertHomestayLedgerEntryAllowedForBookingStatus(status, "payment"));
    assert.doesNotThrow(() =>
      assertHomestayLedgerEntryAllowedForBookingStatus(status, "refund"));
    assert.doesNotThrow(() =>
      assertHomestayLedgerEntryAllowedForBookingStatus(status, "waiver"));
  }
  for (const entryType of ["charge", "payment", "refund", "waiver"] as const) {
    assert.throws(() =>
      assertHomestayLedgerEntryAllowedForBookingStatus("draft", entryType));
  }
});

test("confirmed room cancellation reverses room charges without reversing unrelated fees", () => {
  assert.equal(calculateCancellableRoomCharge([
    { entryType: "charge", chargeType: "room", amount: 1000, status: "confirmed" },
    { entryType: "charge", chargeType: "service_fee", amount: 50, status: "confirmed" },
    { entryType: "waiver", chargeType: "reschedule_decrease", amount: 100, status: "confirmed" }
  ]), "900.00");
});

test("room cancellation reversal ignores waivers allocated to unrelated charges", () => {
  assert.equal(calculateCancellableRoomCharge([
    { entryType: "charge", chargeType: "room", amount: 100, status: "confirmed" },
    { entryType: "waiver", chargeType: "manual_adjustment", amount: 20, status: "confirmed" }
  ]), "100.00");
  assert.equal(calculateCancellableRoomCharge([
    { entryType: "charge", chargeType: "room", amount: 100, status: "confirmed" },
    { entryType: "waiver", chargeType: "reschedule_decrease", amount: 20, status: "confirmed" }
  ]), "80.00");
});

test("manual payment, refund, and waiver cannot exceed their current financial bounds", () => {
  const summary = summarizeHomestayLedger([
    { entryType: "charge", chargeType: "room", amount: 1000, status: "confirmed" },
    { entryType: "payment", chargeType: "room", amount: 400, status: "confirmed" },
    { entryType: "refund", chargeType: "room", amount: 50, status: "confirmed" }
  ]);
  assert.doesNotThrow(() => assertHomestayManualLedgerMutation("payment", 650, summary));
  assert.doesNotThrow(() => assertHomestayManualLedgerMutation("refund", 350, summary));
  assert.throws(() => assertHomestayManualLedgerMutation("payment", 650.01, summary));
  assert.throws(() => assertHomestayManualLedgerMutation("refund", 350.01, summary));
  assert.throws(() => assertHomestayManualLedgerMutation("waiver", 650.01, summary));
});

test("ledger summary combines automatic and manual charges and ignores non-confirmed noise", () => {
  assert.deepEqual(summarizeHomestayLedger([
    { entryType: "charge", chargeType: "room", amount: "100.00", status: "confirmed" },
    { entryType: "charge", chargeType: "service_fee", amount: "25.00", status: "confirmed" },
    { entryType: "payment", chargeType: "room", amount: "80.00", status: "confirmed" },
    { entryType: "refund", chargeType: "room", amount: "5.00", status: "confirmed" },
    { entryType: "waiver", chargeType: "manual_adjustment", amount: "10.00", status: "confirmed" },
    { entryType: "charge", chargeType: "service_fee", amount: "999.00", status: "registered" },
    { entryType: "payment", chargeType: "room", amount: "999.00", status: "void" }
  ]), {
    charges: "125.00",
    payments: "80.00",
    refunds: "5.00",
    waivers: "10.00",
    balance: "40.00"
  });
});

test("ledger limits preserve cents beyond JavaScript safe integer precision", () => {
  const summary = summarizeHomestayLedger([
    { entryType: "charge", chargeType: "room", amount: "9999999999999999.99", status: "confirmed" },
    { entryType: "payment", chargeType: "room", amount: "9999999999999999.98", status: "confirmed" }
  ]);
  assert.equal(summary.balance, "0.01");
  assert.doesNotThrow(() => assertHomestayManualLedgerMutation("payment", "0.01", summary));
  assert.throws(() => assertHomestayManualLedgerMutation("payment", "0.02", summary));
  assert.doesNotThrow(() => assertHomestayManualLedgerMutation("refund", "9999999999999999.98", summary));
});
