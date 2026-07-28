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
  assert.match(service, /Deposit deductions can only be created by the move-out handover workflow/);
  assert.match(service, /Transferred purchase items must be reversed before voiding the purchase/);
  assert.match(service, /meter\.status !== "ONLINE"/);
  assert.match(service, /canReadLease \? this\.dataSource\.getRepository\(PartyEntity\)/);

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
});
