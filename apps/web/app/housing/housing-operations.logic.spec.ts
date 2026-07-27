import assert from "node:assert/strict";
import test from "node:test";
import {
  canRechargeHousingLease,
  canActivateHousingLease,
  housingLeaseContextStillCurrent,
  housingLedgerChargeType,
  housingSelectionAfterLoad
} from "./housing-operations.logic";

test("housing ledger entries use deposit or selected receivable charge types", () => {
  const receivables = [
    { id: "rent-id", chargeType: "rent" },
    { id: "water-id", chargeType: "water" }
  ];

  assert.equal(housingLedgerChargeType("deposit_receipt", "", receivables), "deposit");
  assert.equal(housingLedgerChargeType("payment", "water-id", receivables), "water");
  assert.equal(housingLedgerChargeType("payment", "missing-id", receivables), "");
});

test("housing lease activation is exposed only after signature registration", () => {
  assert.equal(canActivateHousingLease({ status: "pending_signature", signatureFileId: null }), false);
  assert.equal(canActivateHousingLease({ status: "pending_signature", signatureFileId: "file-id" }), true);
  assert.equal(canActivateHousingLease({ status: "active", signatureFileId: "file-id" }), false);
});

test("successful candidate loads keep a visible selection or choose the first result", () => {
  assert.equal(housingSelectionAfterLoad("tenant-b", ["tenant-a", "tenant-b"]), "tenant-b");
  assert.equal(housingSelectionAfterLoad("missing", ["tenant-a", "tenant-b"]), "tenant-a");
  assert.equal(housingSelectionAfterLoad("missing", []), "");
});

test("async lease completions apply only to their originating selection", () => {
  assert.equal(housingLeaseContextStillCurrent("lease-a", "lease-a"), true);
  assert.equal(housingLeaseContextStillCurrent("lease-a", "lease-b"), false);
  assert.equal(housingLeaseContextStillCurrent("", ""), false);
});

test("purchase recharge is enabled only for collectible lease states", () => {
  assert.equal(canRechargeHousingLease("active"), true);
  assert.equal(canRechargeHousingLease("expiring"), true);
  assert.equal(canRechargeHousingLease("checkout_pending"), true);
  assert.equal(canRechargeHousingLease("draft"), false);
  assert.equal(canRechargeHousingLease("terminated"), false);
});
