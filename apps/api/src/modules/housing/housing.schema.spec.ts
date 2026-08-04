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
  assert.match(service, /const lease = await this\.mustTxSupport\(\)\.lockLease\(manager, scope, leaseId\)/);
  assert.match(service, /receivable\.period_start < :periodEnd/);
  assert.match(service, /receivable\.period_end > :periodStart/);
  assert.doesNotMatch(service, /overlapping\.periodStart === dto\.period_start/);
});

test("housing final-state, attachment, meter, privacy, and purchase guards stay explicit", () => {
  const service = readFileSync(resolve(__dirname, "housing.service.ts"), "utf8");
  const leaseCommands = readFileSync(resolve(__dirname, "housing-lease-command.service.ts"), "utf8");
  assert.match(service, /this\.mustTxSupport\(\)\.assertStatus\(lease, \["active", "expiring", "checkout_pending"\]\)/);
  assert.match(leaseCommands, /Final housing leases cannot accept new occupants/);
  assert.match(service, /Final housing leases cannot change charge plans/);
  assert.match(service, /Deposit deductions can only be created by the move-out handover workflow/);
  assert.match(service, /Transferred purchase items must be reversed before voiding the purchase/);
  assert.match(service, /meter\.status !== "ONLINE"/);

  assert.match(leaseCommands, /this\.support\.assertFiles\(manager, scope, \[lease\.signatureFileId\]/);
  assert.match(leaseCommands, /bizType: "housing_lease_signature"/);
});

test("housing billing and repair files preserve exact domain boundaries", () => {
  const service = readFileSync(resolve(__dirname, "housing.service.ts"), "utf8");
  assert.doesNotMatch(service, /Number\(plan\.amount/);
  assert.match(service, /multiplyHousingMoneyByRatio\(/);
  assert.match(service, /resolveFileUploadPolicy\("housing_repair"\)/);
  assert.match(service, /bizType: "housing_repair"/);
  assert.match(service, /One or more repair attachments are already bound to a work order/);
  assert.match(service, /One or more handover attachments are already bound to another handover/);
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

test("housing workbench GET routes use literal exact permissions and both required modules", () => {
  const controller = readFileSync(resolve(__dirname, "housing.controller.ts"), "utf8");
  const routes = [
    ["tasks", "HOUSING_TASK_READ"],
    ["handovers", "HOUSING_HANDOVER_READ"],
    ["handovers/:id", "HOUSING_HANDOVER_READ"],
    ["billing", "HOUSING_BILLING_READ"],
    ["finance", "HOUSING_FINANCE_READ"],
    ["repairs", "HOUSING_REPAIR_READ"],
    ["repairs/:id", "HOUSING_REPAIR_READ"]
  ] as const;

  for (const [path, permission] of routes) {
    const start = controller.indexOf(`@Get("${path}")`);
    assert.notEqual(start, -1, `missing GET /housing/${path}`);
    const end = controller.indexOf("\n\n  @", start + 8);
    const method = controller.slice(start, end === -1 ? undefined : end);
    assert.match(method, /@RequireModule\("housing_rental", "asset"\)/);
    assert.match(method, new RegExp(`@RequirePermissions\\(SYSTEM_PERMISSIONS\\.${permission}\\)`));
    assert.doesNotMatch(method, /@RequireAnyPermissions/);
  }
});

test("housing tenant GET is exact read while create remains manage", () => {
  const controller = readFileSync(resolve(__dirname, "housing.controller.ts"), "utf8");
  const tenantGet = controller.slice(
    controller.indexOf('@Get("tenants")'),
    controller.indexOf('@Get("handovers")')
  );
  const tenantPost = controller.slice(
    controller.indexOf('@Post("tenants")'),
    controller.indexOf('@Get("leases")')
  );
  assert.match(tenantGet, /HOUSING_TENANT_READ/);
  assert.doesNotMatch(tenantGet, /HOUSING_TENANT_MANAGE/);
  assert.match(tenantPost, /HOUSING_TENANT_MANAGE/);
});

test("move-out financial handover uses the frozen ninth high-risk predicate", () => {
  const controller = readFileSync(resolve(__dirname, "housing.controller.ts"), "utf8");
  const handoverPost = controller.slice(
    controller.indexOf('@Post("leases/:id/handovers")'),
    controller.indexOf('@Post("leases/:id/repairs")')
  );
  assert.match(handoverPost, /housing\.handovers\.complete-move-out-financial/);
  assert.match(handoverPost, /allEquals: \{ handover_type: "move_out" \}/);
  assert.match(
    handoverPost,
    /anyNonZero: \["damage_amount", "unsettled_amount", "deposit_deduction_amount"\]/
  );
});
