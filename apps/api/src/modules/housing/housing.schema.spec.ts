import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { getMetadataArgsStorage } from "typeorm";
import {
  HousingChargePlanEntity,
  HousingHandoverEntity,
  HousingLeaseEntity,
  HousingLeaseOccupantEntity,
  HousingLedgerEntryEntity,
  HousingPurchaseEntity,
  HousingPurchaseItemEntity,
  HousingReceivableEntity
} from "./entities/housing.entities";

test("housing entities map to independent long-rent aggregates", () => {
  const tables = getMetadataArgsStorage().tables;
  const expected = [
    [HousingLeaseEntity, "biz_housing_lease"],
    [HousingLeaseOccupantEntity, "rel_housing_lease_occupant"],
    [HousingChargePlanEntity, "biz_housing_charge_plan"],
    [HousingReceivableEntity, "biz_housing_receivable"],
    [HousingLedgerEntryEntity, "biz_housing_ledger_entry"],
    [HousingHandoverEntity, "biz_housing_handover"],
    [HousingPurchaseEntity, "biz_housing_purchase"],
    [HousingPurchaseItemEntity, "biz_housing_purchase_item"]
  ] as const;
  for (const [target, name] of expected) {
    assert.equal(tables.find((item) => item.target === target)?.name, name);
  }
});

test("housing financial migration enforces one charge plan and non-overlapping periods", () => {
  const migration = readFileSync(
    resolve(__dirname, "../../../../../database/migrations/000180_housing_finance_integrity.sql"),
    "utf8"
  );
  assert.match(migration, /uq_housing_charge_plan_scope_type/);
  assert.match(migration, /EXCLUDE USING gist/);
  assert.match(migration, /daterange\(period_start, period_end, '\[\)'\)/);
  assert.match(migration, /status <> 'void'/);
});

test("housing billing locks its lease and rejects overlapping plan periods", () => {
  const service = readFileSync(resolve(__dirname, "housing.service.ts"), "utf8");
  assert.match(service, /const lease = await this\.lockLease\(manager, scope, leaseId\)/);
  assert.match(service, /receivable\.period_start < :periodEnd/);
  assert.match(service, /receivable\.period_end > :periodStart/);
  assert.doesNotMatch(service, /overlapping\.periodStart === dto\.period_start/);
});

test("housing final-state, attachment, meter, privacy, and purchase guards stay explicit", () => {
  const service = readFileSync(resolve(__dirname, "housing.service.ts"), "utf8");
  assert.match(service, /this\.assertStatus\(lease, \["active", "expiring", "checkout_pending"\]\)/);
  assert.match(service, /Final housing leases cannot accept new occupants/);
  assert.match(service, /Final housing leases cannot change charge plans/);
  assert.match(service, /Deposit deductions can only be created by the move-out handover workflow/);
  assert.match(service, /Transferred purchase items must be reversed before voiding the purchase/);
  assert.match(service, /meter\.status !== "ONLINE"/);
  assert.match(service, /canReadTenantData \? this\.dataSource\.getRepository\(PartyEntity\)/);

  const activationStart = service.indexOf("async activateLease");
  const activationEnd = service.indexOf("async voidLease", activationStart);
  const activation = service.slice(activationStart, activationEnd);
  assert.match(activation, /this\.assertFiles\(manager, scope, \[lease\.signatureFileId\]/);
  assert.match(activation, /bizType: "housing_lease_signature"/);
});

test("housing billing and repair files preserve exact domain boundaries", () => {
  const service = readFileSync(resolve(__dirname, "housing.service.ts"), "utf8");
  assert.doesNotMatch(service, /Number\(plan\.amount/);
  assert.match(service, /multiplyHousingMoneyByRatio\(/);
  assert.match(service, /resolveFileUploadPolicy\("housing_repair"\)/);
  assert.match(service, /bizType: "housing_repair"/);
  assert.match(service, /canRecoverRepairEvidence/);
  assert.match(service, /pending_repair_files: pendingRepairFiles/);
  assert.match(service, /NOT EXISTS \([\s\S]*file\.id = ANY\(repair\.image_file_ids\)/);
  assert.match(service, /One or more repair attachments are already bound to a work order/);
  assert.match(service, /pending_handover_files:/);
  assert.match(service, /const canReadHandovers = canReadLease \|\| canManageHandovers/);
  assert.match(service, /const canReadRepairs = canReadLease \|\| canManageRepairs/);
  assert.match(service, /canReadHandovers\s*\n\s*\? this\.dataSource\.getRepository\(HousingHandoverEntity\)/);
  assert.match(service, /canReadRepairs \? this\.dataSource\.getRepository\(WorkOrderEntity\)/);
  assert.match(service, /housing_handover_move_in/);
  assert.match(service, /housing_handover_move_out/);
  assert.match(service, /handover\.photo_file_ids \? file\.id::text/);
  assert.match(service, /One or more handover attachments are already bound to another handover/);
  assert.match(service, /photo_files: handover\.photoFileIds/);
});

test("housing lease creation requires every selector permission at the API boundary", () => {
  const controller = readFileSync(resolve(__dirname, "housing.controller.ts"), "utf8");
  const createLease = controller.slice(
    controller.indexOf('@Post("leases")'),
    controller.indexOf('@Post("leases/:id/submit")')
  );

  assert.match(createLease, /SYSTEM_PERMISSIONS\.HOUSING_LEASE_CREATE/);
  assert.match(createLease, /SYSTEM_PERMISSIONS\.HOUSING_TENANT_MANAGE/);
  assert.match(createLease, /SYSTEM_PERMISSIONS\.UNIT_READ/);
});

test("housing purchase creation requires its scoped unit selector permission", () => {
  const controller = readFileSync(resolve(__dirname, "housing.controller.ts"), "utf8");
  const createPurchase = controller.slice(
    controller.indexOf('@Post("purchases")'),
    controller.indexOf('@Post("purchases/:id/actions")')
  );

  assert.match(createPurchase, /SYSTEM_PERMISSIONS\.HOUSING_PURCHASE_MANAGE/);
  assert.match(createPurchase, /SYSTEM_PERMISSIONS\.UNIT_READ/);
});

test("housing lease pages own stable unit and tenant display labels", () => {
  const service = readFileSync(resolve(__dirname, "housing.service.ts"), "utf8");
  const listLeases = service.slice(service.indexOf("async listLeases"), service.indexOf("async getLease"));

  assert.match(listLeases, /unit\.unit_code AS "unitCode"/);
  assert.match(listLeases, /unit\.unit_name AS "unitName"/);
  assert.match(listLeases, /party\.display_name AS "tenantDisplayName"/);
  assert.match(listLeases, /lease\.id = ANY\(\$3::uuid\[\]\)/);
  assert.match(listLeases, /unitCode: displayByLease\.get\(lease\.id\)\?\.unitCode/);
  assert.match(listLeases, /tenantDisplayName: displayByLease\.get\(lease\.id\)\?\.tenantDisplayName/);
});

test("housing workflow permissions can reach their scoped lease and purchase records", () => {
  const controller = readFileSync(resolve(__dirname, "housing.controller.ts"), "utf8");
  const leaseReads = controller.slice(
    controller.indexOf('@Get("leases")'),
    controller.indexOf('@Post("leases")')
  );
  const purchaseReads = controller.slice(
    controller.indexOf('@Get("purchases")'),
    controller.indexOf('@Post("purchases")')
  );

  for (const permission of [
    "HOUSING_LEASE_READ",
    "HOUSING_TENANT_MANAGE",
    "HOUSING_HANDOVER_MANAGE",
    "HOUSING_REPAIR_MANAGE",
    "HOUSING_BILLING_GENERATE",
    "HOUSING_FINANCE_REGISTER",
    "HOUSING_PURCHASE_TRANSFER"
  ]) {
    assert.match(leaseReads, new RegExp(`SYSTEM_PERMISSIONS\\.${permission}`));
  }
  for (const permission of [
    "HOUSING_PURCHASE_READ",
    "HOUSING_PURCHASE_MANAGE",
    "HOUSING_PURCHASE_TRANSFER"
  ]) {
    assert.match(purchaseReads, new RegExp(`SYSTEM_PERMISSIONS\\.${permission}`));
  }
});

test("housing detail and purchase list own persisted relationship and lifecycle projections", () => {
  const service = readFileSync(resolve(__dirname, "housing.service.ts"), "utf8");
  const getLease = service.slice(service.indexOf("async getLease"), service.indexOf("async createLease"));
  const listPurchases = service.slice(
    service.indexOf("async listPurchases"),
    service.indexOf("async getPurchase")
  );

  assert.match(getLease, /occupantNameByParty/);
  assert.match(getLease, /partyDisplayName: occupantNameByParty\.get\(occupant\.partyId\) \?\? null/);
  assert.match(listPurchases, /COUNT\(\*\)::int AS "transferredItemCount"/);
  assert.match(listPurchases, /item\.transferred_receivable_id IS NOT NULL/);
  assert.match(listPurchases, /transferredItemCount: transferredCountByPurchase\.get\(item\.id\) \?\? 0/);
  assert.match(listPurchases, /const canReadPurchaseEvidence/);
  assert.match(listPurchases, /bizType: "housing_purchase"/);
  assert.match(listPurchases, /receiptFiles: receiptFilesByPurchase\.get\(item\.id\) \?\? \[\]/);
});

test("housing finance writers receive the minimum lease finance projection", () => {
  const service = readFileSync(resolve(__dirname, "housing.service.ts"), "utf8");
  const getLease = service.slice(service.indexOf("async getLease"), service.indexOf("async createLease"));

  assert.match(getLease, /const canAccessFinance = canReadFinance \|\| canRegisterFinance \|\| canWaiveFinance/);
  assert.match(getLease, /canAccessFinance \? this\.dataSource\.getRepository\(HousingReceivableEntity\)/);
  assert.match(getLease, /canAccessFinance \? this\.dataSource\.getRepository\(HousingLedgerEntryEntity\)/);
  assert.match(getLease, /finance_summary: canAccessFinance \? this\.financeSummary\(receivables, ledger\) : null/);
});
