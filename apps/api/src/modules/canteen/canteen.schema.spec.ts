import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { getMetadataArgsStorage } from "typeorm";
import {
  CANTEEN_PERMISSION_CODES,
  CANTEEN_PERMISSION_BUNDLES,
  CANTEEN_PERMISSIONS
} from "@jinhu/shared";
import { CanteenOutletEntity } from "./entities/canteen-outlet.entity";
import { CanteenCategoryEntity } from "./entities/canteen-category.entity";
import { CanteenDishEntity } from "./entities/canteen-dish.entity";
import { CanteenQrCodeEntity } from "./entities/canteen-qr-code.entity";
import { CanteenCashierSessionEntity } from "./entities/canteen-cashier-session.entity";
import { CanteenOrderEntity } from "./entities/canteen-order.entity";
import { CanteenOrderItemEntity } from "./entities/canteen-order-item.entity";
import { CanteenPaymentEntity } from "./entities/canteen-payment.entity";
import { CanteenWalletEntity } from "./entities/canteen-wallet.entity";
import { CanteenSubsidyGrantEntity } from "./entities/canteen-subsidy-grant.entity";
import { CanteenWalletTxnEntity } from "./entities/canteen-wallet-txn.entity";
import { CanteenMealRecordEntity } from "./entities/canteen-meal-record.entity";
import { CanteenRefundEntity } from "./entities/canteen-refund.entity";
import { CanteenSettlementEntity } from "./entities/canteen-settlement.entity";
import { CanteenSettlementItemEntity } from "./entities/canteen-settlement-item.entity";
import { CanteenStatusLogEntity } from "./entities/canteen-status-log.entity";
import { CanteenSettingEntity } from "./entities/canteen-setting.entity";

test("canteen entities map to the 17 biz_canteen_* tables", () => {
  const tables = getMetadataArgsStorage().tables;
  const expected: Array<[object, string]> = [
    [CanteenOutletEntity, "biz_canteen_outlets"],
    [CanteenCategoryEntity, "biz_canteen_categories"],
    [CanteenDishEntity, "biz_canteen_dishes"],
    [CanteenQrCodeEntity, "biz_canteen_qr_codes"],
    [CanteenCashierSessionEntity, "biz_canteen_cashier_sessions"],
    [CanteenOrderEntity, "biz_canteen_orders"],
    [CanteenOrderItemEntity, "biz_canteen_order_items"],
    [CanteenPaymentEntity, "biz_canteen_payments"],
    [CanteenWalletEntity, "biz_canteen_wallets"],
    [CanteenSubsidyGrantEntity, "biz_canteen_subsidy_grants"],
    [CanteenWalletTxnEntity, "biz_canteen_wallet_txns"],
    [CanteenMealRecordEntity, "biz_canteen_meal_records"],
    [CanteenRefundEntity, "biz_canteen_refunds"],
    [CanteenSettlementEntity, "biz_canteen_settlements"],
    [CanteenSettlementItemEntity, "biz_canteen_settlement_items"],
    [CanteenStatusLogEntity, "biz_canteen_status_logs"],
    [CanteenSettingEntity, "biz_canteen_settings"]
  ];
  for (const [target, name] of expected) {
    assert.equal(
      tables.find((item) => item.target === target)?.name,
      name,
      `entity ${(target as { name: string }).name} must map to ${name}`
    );
  }
});

test("canteen permission surface contains exactly the frozen 41 canteen:* points", () => {
  assert.equal(CANTEEN_PERMISSION_CODES.length, 41);
  for (const code of CANTEEN_PERMISSION_CODES) {
    assert.ok(code.startsWith("canteen:"), `${code} must use canteen:* prefix`);
  }
  // spot-check key permissions
  assert.equal(CANTEEN_PERMISSIONS.OUTLET_VIEW, "canteen:outlet:view");
  assert.equal(CANTEEN_PERMISSIONS.SETTLEMENT_SETTLE, "canteen:settlement:settle");
  assert.equal(CANTEEN_PERMISSIONS.DASHBOARD_VIEW, "canteen:dashboard:view");
});

test("canteen ships the five default permission bundles", () => {
  const codes = Object.values(CANTEEN_PERMISSION_BUNDLES).map((b) => b.code);
  assert.deepEqual(codes.sort(), [
    "canteen-bundle:canteen-admin",
    "canteen-bundle:canteen-cashier",
    "canteen-bundle:canteen-contractor",
    "canteen-bundle:canteen-employee",
    "canteen-bundle:canteen-finance"
  ]);
});

test("canteen migration creates settings with frozen defaults and balance guards", () => {
  const migration = readFileSync(
    resolve(__dirname, "../../../../../database/migrations/000326_canteen_module.sql"),
    "utf8"
  );
  assert.match(migration, /CREATE TABLE IF NOT EXISTS biz_canteen_settings/);
  assert.match(migration, /monthly_lunch_subsidy numeric\(12,2\) NOT NULL DEFAULT 300\.00/);
  assert.match(migration, /grant_day integer NOT NULL DEFAULT 1/);
  assert.match(migration, /expiry_mode varchar\(16\) NOT NULL DEFAULT 'last_day'/);
  assert.match(migration, /expiry_time varchar\(8\) NOT NULL DEFAULT '23:59'/);
  assert.match(migration, /settlement_day integer NOT NULL DEFAULT 1/);
  assert.match(migration, /management_fee_enabled boolean NOT NULL DEFAULT false/);
  assert.match(migration, /uq_canteen_settings_scope[\s\S]*tenant_id, park_id/);
  // balance / amount guards
  assert.match(migration, /period_balance >= 0/);
  assert.match(migration, /balance_after >= 0/);
  assert.match(migration, /subsidy_amount \+ qr_pay_amount = pay_amount/);
});
