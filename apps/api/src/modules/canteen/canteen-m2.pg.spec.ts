import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { DataSource } from "typeorm";

import { CanteenOutletEntity } from "./entities/canteen-outlet.entity";
import { CanteenCategoryEntity } from "./entities/canteen-category.entity";
import { CanteenDishEntity } from "./entities/canteen-dish.entity";
import { CanteenCashierSessionEntity } from "./entities/canteen-cashier-session.entity";
import { CanteenOrderEntity } from "./entities/canteen-order.entity";
import { CanteenOrderItemEntity } from "./entities/canteen-order-item.entity";
import { CanteenPaymentEntity } from "./entities/canteen-payment.entity";
import { CanteenStatusLogEntity } from "./entities/canteen-status-log.entity";
import { CanteenSettingEntity } from "./entities/canteen-setting.entity";
import { CanteenWalletEntity } from "./entities/canteen-wallet.entity";
import { CanteenSubsidyGrantEntity } from "./entities/canteen-subsidy-grant.entity";
import { CanteenWalletTxnEntity } from "./entities/canteen-wallet-txn.entity";
import { CanteenMealRecordEntity } from "./entities/canteen-meal-record.entity";
import { CanteenArchiveService } from "./canteen-archive.service";
import { CanteenPaymentAppService } from "./canteen-payment-app.service";
import { CanteenWebhookService } from "./canteen-webhook.service";
import { CanteenPaymentRegistry } from "./payment/canteen-payment-registry";
import { RandomizedNumberService } from "./canteen-test-utils";
import { CanteenSettingsService } from "./canteen-settings.service";
import { CanteenSubsidyService } from "./canteen-subsidy.service";
import { CanteenSubsidyGrantService } from "./canteen-subsidy-grant.service";
import { CanteenTimeoutScheduler } from "./canteen-timeout.scheduler";
import { InsufficientSubsidyException } from "./canteen-subsidy.exception";
import { periodOf } from "./canteen-subsidy.util";

// 全量演示库（含 HR/用户）：127.0.0.1:55433。
const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://jinhu:change_me@127.0.0.1:55433/jinhu_smart_park";

const PERIOD = periodOf();

test(
  "M2: grant issue/idempotent, pure subsidy checkout, insufficient->422, mixed success split, mixed timeout no-deduct, concurrency no overdraw, month-end expire idempotent",
  { skip: !process.env.DATABASE_URL && !process.env.CANTEEN_PG_TEST },
  async () => {
    const ds = new DataSource({
      type: "postgres",
      url: DATABASE_URL,
      entities: [
        CanteenOutletEntity,
        CanteenCategoryEntity,
        CanteenDishEntity,
        CanteenCashierSessionEntity,
        CanteenOrderEntity,
        CanteenOrderItemEntity,
        CanteenPaymentEntity,
        CanteenStatusLogEntity,
        CanteenSettingEntity,
        CanteenWalletEntity,
        CanteenSubsidyGrantEntity,
        CanteenWalletTxnEntity,
        CanteenMealRecordEntity
      ],
      synchronize: false
    });
    await ds.initialize();

    const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
    const tenantId = `m2-${suffix}`;
    const parkId = `m2park-${suffix}`;
    const cashierId = randomUUID();
    const scope = { tenantId, parkId };
    const actor = {
      sub: cashierId,
      username: "cashier",
      realName: "收银员",
      tenantId,
      parkId,
      roles: [],
      permissions: [],
      isSuper: true
    } as const;

    // ---- 造 4 个合格员工（sys_user, enabled）----
    const empIds = {
      alice: randomUUID(),
      bob: randomUUID(),
      carol: randomUUID(),
      dave: randomUUID()
    };
    const empNames: Record<string, string> = {
      alice: "测试Alice",
      bob: "测试Bob",
      carol: "测试Carol",
      dave: "测试Dave"
    };
    for (const [name, uid] of Object.entries(empIds)) {
      await ds.query(
        `INSERT INTO sys_user (id, tenant_id, park_id, username, display_name, password_hash, status, is_enabled)
         VALUES ($1,$2,$3,$4,$5,'x','enabled',true)`,
        [uid, tenantId, parkId, `${name}_${suffix}`, empNames[name] ?? name]
      );
    }

    // ---- repos ----
    const outletRepo = ds.getRepository(CanteenOutletEntity);
    const categoryRepo = ds.getRepository(CanteenCategoryEntity);
    const dishRepo = ds.getRepository(CanteenDishEntity);
    const orderRepo = ds.getRepository(CanteenOrderEntity);
    const paymentRepo = ds.getRepository(CanteenPaymentEntity);
    const sessionRepo = ds.getRepository(CanteenCashierSessionEntity);
    const statusLogRepo = ds.getRepository(CanteenStatusLogEntity);
    const settingsRepo = ds.getRepository(CanteenSettingEntity);
    const walletRepo = ds.getRepository(CanteenWalletEntity);
    const grantRepo = ds.getRepository(CanteenSubsidyGrantEntity);
    const txnRepo = ds.getRepository(CanteenWalletTxnEntity);
    const mealRepo = ds.getRepository(CanteenMealRecordEntity);

    const archive = new CanteenArchiveService(outletRepo, categoryRepo, dishRepo);
    const numbers = new RandomizedNumberService(ds, suffix);
    const registry = new CanteenPaymentRegistry({
      ...process.env,
      CANTEEN_PAYMENT_DRIVER: "mock",
      CANTEEN_MOCK_SIGN_SECRET: "test-secret"
    } as NodeJS.ProcessEnv);
    const settings = new CanteenSettingsService(settingsRepo);
    const grantSvc = new CanteenSubsidyGrantService(ds, settings, numbers);
    const subsidy = new CanteenSubsidyService(
      ds, numbers, registry, dishRepo, outletRepo, orderRepo, paymentRepo, sessionRepo,
      walletRepo, grantRepo, txnRepo, mealRepo
    );
    const paymentApp = new CanteenPaymentAppService(paymentRepo, orderRepo, statusLogRepo, ds, subsidy);
    const webhook = new CanteenWebhookService(registry, paymentApp);
    const scheduler = new CanteenTimeoutScheduler(paymentRepo, paymentApp);

    try {
      // ===== 0) 档案：outlet → category → dish(15) + dish(300) + dish(350) =====
      const outlet = await archive.createOutlet(scope as never, actor as never, {
        name: "M2测试档口",
        outlet_type: "dine_in",
        contractor_id: `party-${suffix}`,
        location: "一楼"
      });
      const category = await archive.createCategory(scope as never, actor as never, outlet.id, { name: "热菜" });
      const mkDish = async (name: string, price: number) => {
        const d = await archive.createDish(scope as never, actor as never, {
          outlet_id: outlet.id, category_id: category.id, name, price
        });
        return archive.changeDishShelf(scope as never, actor as never, d.id, { status: "on_shelf" });
      };
      const dish15 = await mkDish("套餐15", 15);
      const dish200 = await mkDish("套餐200", 200);
      const dish300 = await mkDish("套餐300", 300);
      const dish350 = await mkDish("套餐350", 350);

      // ===== 1) 月度发放：4 个员工各 300 =====
      const r1 = await grantSvc.issuePeriod(scope as never, PERIOD, actor as never);
      assert.equal(r1.eligible, 4, "4 eligible employees");
      assert.equal(r1.granted, 4);
      assert.equal(r1.amount, "300.00");

      const aliceWallet = await walletRepo.findOneByOrFail({ employeeUserId: empIds.alice });
      assert.equal(aliceWallet.periodBalance, "300.00");
      assert.equal(aliceWallet.period, PERIOD);
      const aliceGrant = await grantRepo.findOneByOrFail({ employeeUserId: empIds.alice, period: PERIOD });
      assert.equal(aliceGrant.status, "granted");
      const grantTxn = await txnRepo.findOneByOrFail({ walletId: aliceWallet.id, type: "grant" });
      assert.equal(grantTxn.amount, "300.00");
      assert.equal(grantTxn.balanceAfter, "300.00");

      // ===== 1b) 重复发放幂等 =====
      const r1b = await grantSvc.issuePeriod(scope as never, PERIOD, actor as never);
      assert.equal(r1b.granted, 0);
      assert.equal(r1b.skippedAlreadyGranted, 4);
      assert.equal(await grantRepo.count({ where: { period: PERIOD, tenantId } }), 4, "no duplicate grants");

      // ===== 2) lookup-employee：脱敏 + 余额 =====
      const lookup = await subsidy.lookupEmployee(scope as never, empIds.alice);
      assert.equal(lookup.employee_user_id, empIds.alice);
      assert.match(lookup.name_masked, /^测\*+$/, "name masked");
      assert.equal(lookup.period_balance, "300.00");

      // ===== 3) 纯虚拟结账：15 元足额 → 扣减、订单 paid、无 payment =====
      const pure = await subsidy.checkout(
        scope as never, actor as never,
        { outlet_id: outlet.id, employee_code: empIds.alice, items: [{ dish_id: dish15.id, qty: 1 }], channel: "subsidy" },
        "idem-pure-1"
      );
      assert.equal(pure.status, "paid");
      assert.equal(pure.subsidy_amount, "15.00");
      assert.equal(pure.qr_pay_amount, "0.00");
      assert.equal(pure.balance_after, "285.00");

      const pureOrder = await orderRepo.findOneByOrFail({ orderNo: pure.order_no });
      assert.equal(pureOrder.status, "paid");
      assert.equal(pureOrder.channel, "subsidy");
      assert.equal(pureOrder.subsidyAmount, "15.00");
      assert.equal(await paymentRepo.count({ where: { orderId: pureOrder.id } }), 0, "no real payment");
      const pureMeal = await mealRepo.findOneByOrFail({ orderId: pureOrder.id });
      assert.equal(pureMeal.subsidyUsed, "15.00");
      const consumeTxn = await txnRepo.findOneByOrFail({ orderId: pureOrder.id, type: "consume" });
      assert.equal(consumeTxn.amount, "-15.00");

      const aliceAfter = await walletRepo.findOneByOrFail({ employeeUserId: empIds.alice });
      assert.equal(aliceAfter.periodBalance, "285.00");
      assert.equal(aliceAfter.periodConsumed, "15.00");

      // ===== 4) 余额不足 → 422 INSUFFICIENT_SUBSIDY suggest=mixed =====
      await assert.rejects(
        subsidy.checkout(
          scope as never, actor as never,
          { outlet_id: outlet.id, employee_code: empIds.alice, items: [{ dish_id: dish350.id, qty: 1 }], channel: "subsidy" },
          "idem-pure-2"
        ),
        (err: unknown) => {
          const e = err as InstanceType<typeof InsufficientSubsidyException> & { getResponse(): () => unknown };
          assert.ok(err instanceof InsufficientSubsidyException);
          const body = (e.getResponse as () => { code?: string; suggest?: string })();
          assert.equal(body.code, "INSUFFICIENT_SUBSIDY");
          assert.equal(body.suggest, "mixed");
          return true;
        }
      );

      // ===== 5) 混合支付：alice 余额 285，买 300 → 补贴 285 + QR 15 =====
      const mixed = await subsidy.checkout(
        scope as never, actor as never,
        { outlet_id: outlet.id, employee_code: empIds.alice, items: [{ dish_id: dish300.id, qty: 1 }], channel: "mixed" },
        "idem-mixed-1"
      );
      assert.equal(mixed.status, "pending");
      assert.equal(mixed.channel, "mixed");
      assert.equal(mixed.subsidy_amount, "285.00");
      assert.equal(mixed.qr_pay_amount, "15.00");
      assert.ok(mixed.code_url?.includes("mock-pay"));
      // 混合下单时未扣补贴：alice 余额仍 285。
      const alicePreCb = await walletRepo.findOneByOrFail({ employeeUserId: empIds.alice });
      assert.equal(alicePreCb.periodBalance, "285.00", "subsidy not deducted until QR success");

      // mock 支付成功（金额 = 差额 15.00）
      const signer = registry.mockSigner();
      const sign = signer.sign(mixed.payment_no!, "TRADE_SUCCESS");
      const cb = await webhook.handle("mock", { "x-canteen-mock-sign": sign }, {
        out_trade_no: mixed.payment_no,
        trade_status: "TRADE_SUCCESS",
        trade_no: "TXN-MIXED-1",
        total_amount: "15.00"
      });
      assert.equal(cb.code, "OK");
      const mixedOrder = await orderRepo.findOneByOrFail({ orderNo: mixed.order_no });
      assert.equal(mixedOrder.status, "completed");
      assert.equal(mixedOrder.subsidyAmount, "285.00", "subsidy split preserved");
      assert.equal(mixedOrder.qrPayAmount, "15.00", "qr split preserved");

      const aliceDone = await walletRepo.findOneByOrFail({ employeeUserId: empIds.alice });
      assert.equal(aliceDone.periodBalance, "0.00", "subsidy fully consumed after callback");
      const mixedConsume = await txnRepo.findOne({ where: { orderId: mixedOrder.id, type: "consume" } });
      assert.ok(mixedConsume, "consume txn written on callback");
      assert.equal(mixedConsume!.amount, "-285.00");

      // ===== 6) 混合超时关单：bob 买 350（余额 300）→ 补贴预留 300 + QR 50；关单不扣补贴 =====
      const mixed2 = await subsidy.checkout(
        scope as never, actor as never,
        { outlet_id: outlet.id, employee_code: empIds.bob, items: [{ dish_id: dish350.id, qty: 1 }], channel: "mixed" },
        "idem-mixed-2"
      );
      assert.equal(mixed2.subsidy_amount, "300.00");
      assert.equal(mixed2.qr_pay_amount, "50.00");
      const bobBefore = await walletRepo.findOneByOrFail({ employeeUserId: empIds.bob });
      assert.equal(bobBefore.periodBalance, "300.00");

      // 拨到 TTL 之前 → 超时关单
      const past = new Date(Date.now() - 5 * 60_000);
      await ds.query(`UPDATE biz_canteen_payments SET create_time=$1 WHERE payment_no=$2`, [past, mixed2.payment_no]);
      const closed = await scheduler.closeExpiredPendingPayments();
      assert.ok(closed >= 1);
      const mixed2Order = await orderRepo.findOneByOrFail({ orderNo: mixed2.order_no });
      assert.equal(mixed2Order.status, "cancelled");
      const bobAfter = await walletRepo.findOneByOrFail({ employeeUserId: empIds.bob });
      assert.equal(bobAfter.periodBalance, "300.00", "timeout close must NOT deduct subsidy");
      const bobConsumeCount = await txnRepo.count({ where: { employeeUserId: empIds.bob, type: "consume" } });
      assert.equal(bobConsumeCount, 0, "no consume txn for timed-out mixed order");
      const meal2 = await mealRepo.findOneByOrFail({ orderId: mixed2Order.id });
      assert.equal(meal2.status, "voided", "reserved meal record voided on close");

      // ===== 7) 并发：carol 余额 300，两笔各 200 并发核销 → 一笔成功(余100)、一笔 422，不超扣 =====
      const carolWallet = await walletRepo.findOneByOrFail({ employeeUserId: empIds.carol });
      assert.equal(carolWallet.periodBalance, "300.00");
      const results = await Promise.allSettled(
        [0, 1].map((i) =>
          subsidy.checkout(
            scope as never, actor as never,
            { outlet_id: outlet.id, employee_code: empIds.carol, items: [{ dish_id: dish200.id, qty: 1 }], channel: "subsidy" },
            `idem-conc-${i}`
          )
        )
      );
      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");
      assert.equal(fulfilled.length, 1, "exactly one concurrent checkout succeeds");
      assert.equal(rejected.length, 1, "the other is rejected (insufficient)");
      assert.ok(fulfilled[0]!.status === "fulfilled" && (fulfilled[0] as PromiseFulfilledResult<{ balance_after: string }>).value.balance_after === "100.00");
      const carolFinal = await walletRepo.findOneByOrFail({ employeeUserId: empIds.carol });
      const carolBal = Number(carolFinal.periodBalance);
      assert.ok(carolBal >= 0, "balance never negative");
      assert.ok(carolBal <= 300, "no overspend");
      assert.equal(carolBal, 100, "one 200 consumed, balance 100");

      // ===== 8) 月末清零：dave 用 50 → 余 250；清零后 0、grant=expired、txn=expire =====
      const daveBuy = await subsidy.checkout(
        scope as never, actor as never,
        { outlet_id: outlet.id, employee_code: empIds.dave, items: [{ dish_id: dish15.id, qty: 1 }, { dish_id: dish15.id, qty: 1 }, { dish_id: dish15.id, qty: 1 }], channel: "subsidy" },
        "idem-dave-1"
      );
      assert.equal(daveBuy.subsidy_amount, "45.00");
      const daveBeforeExpire = await walletRepo.findOneByOrFail({ employeeUserId: empIds.dave });
      assert.equal(daveBeforeExpire.periodBalance, "255.00");

      const exp = await grantSvc.runExpire(scope as never, PERIOD, actor as never);
      assert.ok(exp.walletsExpired >= 1);
      const daveAfterExpire = await walletRepo.findOneByOrFail({ employeeUserId: empIds.dave });
      assert.equal(daveAfterExpire.periodBalance, "0.00");
      assert.equal(Number(daveAfterExpire.periodExpired), 255, "255 expired");
      const daveGrant = await grantRepo.findOneByOrFail({ employeeUserId: empIds.dave, period: PERIOD });
      assert.equal(daveGrant.status, "expired");
      assert.ok(daveGrant.expireTime);
      const expireTxn = await txnRepo.findOneOrFail({ where: { employeeUserId: empIds.dave, type: "expire" }, order: { txnTime: "DESC" } });
      assert.equal(expireTxn.amount, "-255.00");
      assert.equal(expireTxn.balanceAfter, "0.00");

      // 再次清零幂等
      const exp2 = await grantSvc.runExpire(scope as never, PERIOD, actor as never);
      assert.equal(exp2.walletsExpired, 0, "re-run expire is idempotent");

      console.log("M2 OK", { r1, mixed: { sub: mixed.subsidy_amount, qr: mixed.qr_pay_amount }, concurrencyBalance: carolBal });
    } finally {
      for (const table of [
        "biz_canteen_status_logs",
        "biz_canteen_order_items",
        "biz_canteen_meal_records",
        "biz_canteen_wallet_txns",
        "biz_canteen_payments",
        "biz_canteen_orders",
        "biz_canteen_subsidy_grants",
        "biz_canteen_wallets",
        "biz_canteen_cashier_sessions",
        "biz_canteen_dishes",
        "biz_canteen_categories",
        "biz_canteen_outlets"
      ]) {
        await ds.query(`DELETE FROM ${table} WHERE tenant_id=$1`, [tenantId]).catch(() => undefined);
      }
      await ds.query(`DELETE FROM sys_user WHERE tenant_id=$1`, [tenantId]).catch(() => undefined);
      await ds.destroy();
    }
  }
);
