import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  canRechargeHousingLease,
  canActivateHousingLease,
  housingLeaseContextShouldClear,
  housingLeaseContextStillCurrent,
  housingLeaseTenantLabel,
  housingLeaseUnitLabel,
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

test("lease page changes clear stale detail context and use response-owned labels", () => {
  assert.equal(housingLeaseContextShouldClear("lease-a", ["lease-a", "lease-b"]), false);
  assert.equal(housingLeaseContextShouldClear("lease-a", ["lease-b"]), true);
  assert.equal(housingLeaseContextShouldClear("", ["lease-b"]), false);
  assert.equal(
    housingLeaseUnitLabel({ unitId: "unit-1", unitCode: "A-101", unitName: "人才公寓 101" }),
    "A-101 · 人才公寓 101"
  );
  assert.equal(housingLeaseUnitLabel({ unitId: "unit-1", unitCode: null, unitName: null }), "unit-1");
  assert.equal(
    housingLeaseTenantLabel({ tenantPartyId: "party-1", tenantDisplayName: "张三" }),
    "张三"
  );
});

test("purchase recharge is enabled only for collectible lease states", () => {
  assert.equal(canRechargeHousingLease("active"), true);
  assert.equal(canRechargeHousingLease("expiring"), true);
  assert.equal(canRechargeHousingLease("checkout_pending"), true);
  assert.equal(canRechargeHousingLease("draft"), false);
  assert.equal(canRechargeHousingLease("terminated"), false);
});

test("housing refresh restores pending purchase receipts into the production form", () => {
  const client = readFileSync(resolve(__dirname, "HousingOperationsClient.tsx"), "utf8");
  assert.match(client, /\/files\?biz_type=housing_purchase&page=1&page_size=100/);
  assert.match(client, /setPurchaseReceipts\(pendingReceiptResult\.data\.items\)/);
  assert.match(
    client,
    /canAccessPurchaseReceipts\s*=\s*canManagePurchases\s*&&\s*hasPermission\(user,\s*SYSTEM_PERMISSIONS\.FILE_READ\)/
  );
});

test("housing file-backed forms project domain and generic file permissions together", () => {
  const client = readFileSync(resolve(__dirname, "HousingOperationsClient.tsx"), "utf8");

  assert.match(client, /canUploadHandoverPhotos = canManageHandovers && canUploadFiles/);
  assert.match(client, /canUploadRepairPhotos = canManageRepairs && canUploadFiles/);
  assert.match(client, /canUploadLeaseSignature = canSignLeases && canUploadFiles/);
  assert.match(client, /canUploadPurchaseReceipts = canManagePurchases && canUploadFiles/);
  assert.match(client, /\{canManageHandovers \? <form onSubmit=\{completeHandover\}>/);
  assert.match(client, /\{canUploadHandoverPhotos \? <FileUploader bizType="housing_handover"/);
  assert.match(client, /\{canManageRepairs \? <form onSubmit=\{createRepair\}>/);
  assert.match(client, /\{canManagePurchases \? <form className="ds-panel" onSubmit=\{createPurchase\}>/);
});

test("housing lease detail restores evidence and gates every mutation surface", () => {
  const client = readFileSync(resolve(__dirname, "HousingOperationsClient.tsx"), "utf8");

  assert.match(client, /biz_type=housing_lease_signature&biz_id=\$\{id\}/);
  assert.match(client, /biz_type=housing_handover&biz_id=\$\{id\}/);
  assert.match(client, /biz_type=housing_repair&biz_id=\$\{id\}/);
  assert.match(client, /housingLeaseContextShouldClear\(/);
  assert.match(client, /\{canManageTenants \? <form className="ds-panel" onSubmit=\{createTenant\}>/);
  assert.match(client, /\{canCreateLeases \? <form className="ds-panel" onSubmit=\{createLease\}>/);
  assert.match(client, /\{canCreateLeases \? <form onSubmit=\{saveChargePlan\}>/);
  assert.match(client, /\{canGenerateBills \? <form onSubmit=\{generateBills\}>/);
  assert.match(client, /detail\.finance_summary && canManageFinance/);
  assert.match(client, /\{canTransferPurchases \? <form className="ds-panel" onSubmit=\{transferPurchase\}>/);
  assert.match(client, /leaseSubmissionLock\.current/);
  assert.match(client, /idempotencyKey: leaseSubmissionKey\.current!/);
  assert.match(client, /housingLeaseUnitLabel\(lease\)/);
  assert.match(client, /housingLeaseTenantLabel\(lease\)/);
  assert.doesNotMatch(client, /consent_status:\s*"granted"/);
  assert.match(client, /repairSubmissionLock\.current/);
  assert.match(client, /idempotencyKey: repairSubmissionKey\.current!/);
  assert.match(client, /repairSubmissionSignature\.current !== submissionSignature/);
  assert.match(client, /disabled=\{repairSubmitting\}/);
  assert.match(client, /mutationDisabled=\{repairSubmitting\}/);
  assert.match(client, /consumedRepairFileIds/);
  assert.match(client, /!consumedRepairFileIds\.has\(file\.id\)/);
});
