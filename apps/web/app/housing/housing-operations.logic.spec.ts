import assert from "node:assert/strict";
import test from "node:test";
import {
  canActivateHousingLease,
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
