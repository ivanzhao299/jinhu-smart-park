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
  housingSelectionAfterLoad,
  minimumHousingLeaseEndDate
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

test("housing lease end date begins on the business day after its start", () => {
  assert.equal(minimumHousingLeaseEndDate("2026-07-29"), "2026-07-30");
  assert.equal(minimumHousingLeaseEndDate("2026-12-31"), "2027-01-01");
  assert.equal(minimumHousingLeaseEndDate(""), "");
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
    /canAccessPurchaseReceipts = canAccessPurchaseCreation && canReadFiles/
  );
});

test("housing file-backed forms project domain and generic file permissions together", () => {
  const client = readFileSync(resolve(__dirname, "HousingOperationsClient.tsx"), "utf8");

  assert.match(client, /canUploadHandoverPhotos = canManageHandovers && canUploadFiles/);
  assert.match(client, /canUploadRepairPhotos = canManageRepairs && canUploadFiles/);
  assert.match(client, /canUploadLeaseSignature = canSignLeases && canUploadFiles/);
  assert.match(client, /canUploadPurchaseReceipts = canAccessPurchaseCreation && canUploadFiles/);
  assert.match(client, /\{canManageHandovers \? <form onSubmit=\{completeHandover\}>/);
  assert.match(client, /bizType=\{`housing_handover_\$\{handoverForm\.handoverType\}`\}/);
  assert.match(client, /\{canManageRepairs \? <form onSubmit=\{createRepair\}>/);
  assert.match(client, /\{canAccessPurchaseCreation \? <form className="ds-panel" onSubmit=\{createPurchase\}>/);
});

test("housing lease detail restores evidence and gates every mutation surface", () => {
  const client = readFileSync(resolve(__dirname, "HousingOperationsClient.tsx"), "utf8");

  assert.match(client, /biz_type=housing_lease_signature&biz_id=\$\{id\}/);
  assert.doesNotMatch(client, /\/files\?biz_type=housing_handover&biz_id=\$\{id\}/);
  assert.match(client, /pending_handover_files/);
  assert.match(client, /photo_files/);
  assert.doesNotMatch(client, /\/files\?biz_type=housing_repair&biz_id=\$\{id\}/);
  assert.match(client, /pending_repair_files/);
  assert.match(client, /housingLeaseContextShouldClear\(/);
  assert.match(client, /\{canManageTenants \? <form className="ds-panel" onSubmit=\{createTenant\}>/);
  assert.match(client, /\{canAccessLeaseCreation \? <form className="ds-panel" onSubmit=\{createLease\}>/);
  assert.match(client, /canCreateLeases && !\["terminated", "void"\]\.includes\(detail\.lease\.status\)/);
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
  assert.match(client, /disabled=\{repairSubmitting \|\| repairUploading\}/);
  assert.match(client, /mutationDisabled=\{repairSubmitting \|\| repairUploading\}/);
  assert.match(client, /repairUploadLock\.current/);
  assert.match(client, /onUploadingChange=\{handleRepairUploadingChange\}/);
  assert.match(client, /disabled=\{repairSubmitting \|\| repairUploading\}/);
});

test("housing sibling forms enforce selector, upload, refresh, and idempotency contracts", () => {
  const client = readFileSync(resolve(__dirname, "HousingOperationsClient.tsx"), "utf8");

  assert.match(client, /canAccessLeaseCreation = canCreateLeases && canManageTenants && canReadUnits/);
  assert.match(client, /min=\{minimumHousingLeaseEndDate\(leaseForm\.startDate\)\}/);
  assert.match(client, /tenantSubmissionLock\.current/);
  assert.match(client, /idempotencyKey: tenantSubmissionKey\.current!/);
  assert.match(client, /setRefreshError\(errors\.length \?/);
  assert.match(client, /setRefreshError\(error instanceof Error/);
  assert.match(client, /purchaseUnitsResult/);
  assert.match(client, /meta=\{purchaseUnitPage\}/);
  assert.match(client, /handoverUploadLock\.current/);
  assert.match(client, /onUploadingChange=\{handleHandoverUploadingChange\}/);
  assert.match(client, /disabled=\{handoverSubmitting \|\| handoverUploading\}/);
  assert.match(client, /purchaseUploadLock\.current/);
  assert.match(client, /onUploadingChange=\{handlePurchaseUploadingChange\}/);
  assert.match(client, /disabled=\{purchaseSubmitting \|\| purchaseUploading\}/);
  assert.match(client, /detail\.handovers\.map/);
  assert.match(client, /detail\.handovers\.length \? <div className="ds-scene-grid">/);
  assert.match(client, /<PendingAttachmentList files=\{handover\.photo_files\}/);
  assert.match(client, /Object\.entries\(item\)/);
  assert.match(client, /disabled=\{handoverSubmitting \|\| handoverUploading\} value=\{handoverForm\.handoverType\}/);
});

test("housing workflow reachability and persisted labels do not depend on unrelated read pages", () => {
  const client = readFileSync(resolve(__dirname, "HousingOperationsClient.tsx"), "utf8");

  assert.match(client, /const canAccessLeaseWorkflows =/);
  assert.match(client, /loadOptional\(canAccessLeaseWorkflows,[\s\S]*?\/housing\/leases/);
  assert.match(client, /const canAccessPurchases = canReadPurchases \|\| canManagePurchases \|\| canTransferPurchases/);
  assert.match(client, /loadOptional\(canAccessPurchases,[\s\S]*?\/housing\/purchases/);
  assert.match(client, /partyDisplayName: string \| null/);
  assert.match(client, /occupant\.partyDisplayName \?\? occupant\.partyId/);
  assert.doesNotMatch(client, /tenantName\.get\(occupant\.partyId\)/);
});

test("housing granular roles recover authorized evidence and workflow context", () => {
  const client = readFileSync(resolve(__dirname, "HousingOperationsClient.tsx"), "utf8");

  assert.match(client, /canRecoverLeaseSignature = \(canReadLeases \|\| canSignLeases\) && canReadFiles/);
  assert.match(client, /canReadHandoverEvidence = \(canReadLeases \|\| canManageHandovers\) && canReadFiles/);
  assert.match(client, /const canAccessPurchaseCreation = canManagePurchases && canReadUnits/);
  assert.match(client, /loadOptional\(canAccessPurchaseCreation,[\s\S]*?\/park-units/);
  assert.match(client, /\{canAccessPurchaseCreation \? <form className="ds-panel" onSubmit=\{createPurchase\}>/);
});

test("housing purchase detail errors and bound receipts follow their authoritative loads", () => {
  const client = readFileSync(resolve(__dirname, "HousingOperationsClient.tsx"), "utf8");

  assert.match(client, /const \[purchaseDetailError, setPurchaseDetailError\] = useState\(""\)/);
  assert.match(client, /setPurchaseDetailError\(""\)[\s\S]*?setTransferItems\(\[\]\)/);
  assert.match(client, /setPurchaseDetailError\(error instanceof Error \? error\.message : "加载采购明细失败"\)/);
  assert.match(client, /purchaseDetailError \? <div className=\{styles\.message\}>/);
  assert.match(client, /receiptFiles: FileRecord\[\]/);
  assert.match(client, /canReadPurchaseEvidence = \(canReadPurchases \|\| canManagePurchases\) && canReadFiles/);
  assert.match(client, /<PendingAttachmentList files=\{purchase\.receiptFiles\} mutationDisabled \/>/);
});

test("housing detail, signature, and purchase drafts follow authoritative lifecycle state", () => {
  const client = readFileSync(resolve(__dirname, "HousingOperationsClient.tsx"), "utf8");

  assert.match(client, /setDetailError\(""\)/);
  assert.match(client, /setDetailError\(error instanceof Error \? error\.message : "加载租约详情失败"\)/);
  assert.match(client, /detail\.lease\.status === "pending_signature" && !detail\.lease\.signatureFileId/);
  assert.match(client, /<PendingAttachmentList files=\{\[signatureFile\]\} mutationDisabled \/>/);
  assert.match(client, /detail\.lease\.signatureFileId \? "签署件已登记"/);
  assert.match(client, /setTransferForm\(\(current\) => \(\{ \.\.\.current, purchaseId: "", itemIds: \[\] \}\)\)/);
  assert.match(client, /setTransferItems\(\[\]\)/);
  assert.match(client, /purchase\.transferredItemCount > 0/);
  assert.match(client, /purchase\.paymentStatus === "paid" && purchase\.transferredItemCount === 0/);
  assert.match(client, /purchase\.approvalStatus !== "void" && purchase\.transferredItemCount === 0/);
});

test("housing retryable transitions and lease inputs preserve cross-layer contracts", () => {
  const client = readFileSync(resolve(__dirname, "HousingOperationsClient.tsx"), "utf8");

  assert.match(client, /retryableActionAttempts/);
  assert.match(client, /currentAttempt\?\.signature === signature/);
  assert.match(client, /if \(succeeded\) retryableActionAttempts\.current\.delete\(scope\)/);
  assert.match(client, /runRetryableAction\(\s*`housing-purchase-\$\{purchase\.id\}-\$\{action\}`/);
  assert.doesNotMatch(client, /idempotencyKey: createIdempotencyKey/);
  assert.match(client, /支付周期<select required/);
  assert.match(client, /自定义月数<input type="number" required/);
  assert.match(client, /月租金<input type="number" required/);
  assert.match(client, /押金<input type="number" required/);
  assert.match(client, /每期应收日<input type="number" required/);
  assert.match(client, /首期应收日<input type="date" required/);
});
