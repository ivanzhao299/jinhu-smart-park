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
import { CanteenArchiveService } from "./canteen-archive.service";
import { CanteenCheckoutService } from "./canteen-checkout.service";
import { CanteenPaymentAppService } from "./canteen-payment-app.service";
import { CanteenSessionService } from "./canteen-session.service";
import { CanteenOrderQueryService } from "./canteen-order-query.service";
import { CanteenWebhookService } from "./canteen-webhook.service";
import { CanteenPaymentRegistry } from "./payment/canteen-payment-registry";
import { RandomizedNumberService } from "./canteen-test-utils";
import { CanteenTimeoutScheduler } from "./canteen-timeout.scheduler";
import { CanteenPaymentNotConfiguredError } from "./payment/canteen-payment-provider.port";
import { WechatNativeCanteenProvider } from "./payment/wechat-native.provider";
import { AlipayFaceCanteenProvider } from "./payment/alipay-face.provider";

const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://jinhu:change_me@127.0.0.1:55432/jinhu_smart_park";

test("M1: archive CRUD, qr checkout happy path + idempotent callback, timeout close, session close aggregation, not-configured", {
  skip: !process.env.DATABASE_URL && !process.env.CANTEEN_PG_TEST
}, async () => {
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
      CanteenSettingEntity
    ],
    synchronize: false
  });
  await ds.initialize();

  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const tenantId = `m1-${suffix}`;
  const parkId = `m1park-${suffix}`;
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

  // --- wire services manually against the real DataSource ---
  const outletRepo = ds.getRepository(CanteenOutletEntity);
  const categoryRepo = ds.getRepository(CanteenCategoryEntity);
  const dishRepo = ds.getRepository(CanteenDishEntity);
  const orderRepo = ds.getRepository(CanteenOrderEntity);
  const orderItemRepo = ds.getRepository(CanteenOrderItemEntity);
  const paymentRepo = ds.getRepository(CanteenPaymentEntity);
  const sessionRepo = ds.getRepository(CanteenCashierSessionEntity);
  const statusLogRepo = ds.getRepository(CanteenStatusLogEntity);

  const archive = new CanteenArchiveService(outletRepo, categoryRepo, dishRepo, statusLogRepo);
  const numbers = new RandomizedNumberService(ds, suffix);
  const registry = new CanteenPaymentRegistry({
    ...process.env,
    CANTEEN_PAYMENT_DRIVER: "mock",
    CANTEEN_MOCK_SIGN_SECRET: "test-secret"
  } as NodeJS.ProcessEnv);
  const paymentApp = new CanteenPaymentAppService(paymentRepo, orderRepo, statusLogRepo, ds);
  const checkout = new CanteenCheckoutService(
    ds, numbers, registry, dishRepo, outletRepo, orderRepo, paymentRepo, sessionRepo
  );
  const sessions = new CanteenSessionService(ds, numbers, sessionRepo, orderRepo, statusLogRepo);
  const orderQuery = new CanteenOrderQueryService(orderRepo, orderItemRepo, paymentRepo);
  const webhook = new CanteenWebhookService(registry, paymentApp);
  const scheduler = new CanteenTimeoutScheduler(paymentRepo, paymentApp);

  try {
    // ===== 1) 档案 CRUD：outlet → category → dish → 上架 =====
    const outlet = await archive.createOutlet(scope as never, actor as never, {
      name: "M1测试档口",
      outlet_type: "dine_in",
      contractor_id: `party-${suffix}`,
      location: "一楼",
      business_hours: "07-20"
    });
    assert.ok(outlet.outletNo.startsWith("O"));

    const category = await archive.createCategory(scope as never, actor as never, outlet.id, {
      name: "热菜",
      sort_order: 1
    });
    assert.equal(category.status, "on");

    const dish = await archive.createDish(scope as never, actor as never, {
      outlet_id: outlet.id,
      category_id: category.id,
      name: "红烧肉",
      price: 15.0
    });
    assert.equal(dish.status, "off_shelf");

    const shelved = await archive.changeDishShelf(scope as never, actor as never, dish.id, { status: "on_shelf" });
    assert.equal(shelved.status, "on_shelf");
    assert.ok(shelved.shelfTime);

    // ===== 2) 开班 → 扫码下单出码 pending =====
    const session = await sessions.open(scope as never, actor as never, {
      outlet_id: outlet.id,
      opening_float: 100
    });
    assert.equal(session.status, "open");

    const chk = await checkout.checkoutQr(
      scope as never, actor as never,
      { outlet_id: outlet.id, items: [{ dish_id: dish.id, qty: 2 }], channel: "qr_pay" },
      "idem-qr-1"
    );
    assert.ok(chk.order_no.startsWith("CO"));
    assert.ok(chk.payment_no.startsWith("CP"));
    assert.equal(chk.status, "pending");
    assert.ok(chk.code_url.includes("mock-pay"), "code_url should be a mock qr string");
    assert.equal(chk.pay_amount, "30.00");

    // ===== 3) mock 回调成功 → payment=paid / order=completed =====
    const signer = registry.mockSigner();
    const okSign = signer.sign(chk.payment_no, "TRADE_SUCCESS");
    const r1 = await webhook.handle("mock", { "x-canteen-mock-sign": okSign }, {
      out_trade_no: chk.payment_no,
      trade_status: "TRADE_SUCCESS",
      trade_no: "TXN-1",
      total_amount: "30.00"
    });
    assert.equal(r1.code, "OK");
    assert.equal(r1.paymentStatus, "paid");
    assert.equal(r1.orderStatus, "completed");

    // 状态落库核对
    let st = await orderQuery.paymentStatus(scope as never, chk.payment_no);
    assert.equal(st.status, "paid");
    assert.equal(st.order_status, "completed");
    assert.ok(st.paid_time);

    // ===== 4) 重复回调幂等：只生效一次 =====
    const r2 = await webhook.handle("mock", { "x-canteen-mock-sign": okSign }, {
      out_trade_no: chk.payment_no,
      trade_status: "TRADE_SUCCESS",
      trade_no: "TXN-1",
      total_amount: "30.00"
    });
    assert.equal(r2.code, "DUPLICATE");
    const paymentCount = await paymentRepo.count({ where: { paymentNo: chk.payment_no } });
    assert.equal(paymentCount, 1, "duplicate callback must not create a second payment");
    const logsForOrder = await statusLogRepo.count({
      where: { entityType: "order", entityId: (await orderRepo.findOneByOrFail({ orderNo: chk.order_no })).id }
    });
    assert.ok(logsForOrder >= 1);

    // ===== 4b) 日结只读预览：open 班次实时汇总，不改库 =====
    const preview = await sessions.previewCurrent(scope as never, actor as never);
    assert.equal(preview.status, "open");
    assert.equal(preview.qr_pay_total, "30.00");
    assert.equal(preview.subsidy_total, "0.00");
    assert.equal(preview.order_count, 1, "cancelled order must not count; only completed");
    // 存储列仍为 0、班次仍 open（预览不写库）。
    const afterPreview = await sessionRepo.findOneByOrFail({ id: session.id });
    assert.equal(afterPreview.status, "open");
    assert.equal(afterPreview.qrPayTotal, "0.00");
    assert.equal(afterPreview.orderCount, 0);

    // ===== 5) 第二单：超时未支付 → payment=closed / order=cancelled =====
    const chk2 = await checkout.checkoutQr(
      scope as never, actor as never,
      { outlet_id: outlet.id, items: [{ dish_id: dish.id, qty: 1 }], channel: "qr_pay" },
      "idem-qr-2"
    );
    // 把该支付单的创建时间按 JS 时钟拨到 TTL 之前（避免 DB/容器时钟漂移）
    const past = new Date(Date.now() - 5 * 60_000);
    await ds.query(
      `UPDATE biz_canteen_payments SET create_time = $1 WHERE payment_no=$2`,
      [past, chk2.payment_no]
    );
    const closedCount = await scheduler.closeExpiredPendingPayments();
    assert.ok(closedCount >= 1);
    const st2 = await orderQuery.paymentStatus(scope as never, chk2.payment_no);
    assert.equal(st2.status, "closed");
    assert.equal(st2.order_status, "cancelled");

    // ===== 6) 结班日结：聚合金额/单数正确 =====
    const closedSession = await sessions.close(scope as never, actor as never, session.id, "收摊");
    assert.equal(closedSession.status, "closed");
    assert.equal(closedSession.orderCount, 1, "only the completed order counts; cancelled excluded");
    assert.equal(closedSession.qrPayTotal, "30.00");
    assert.equal(closedSession.subsidyTotal, "0.00");
    assert.ok(closedSession.closeSnapshot);

    // ===== 7) 真实适配器未配置 → NotConfigured（不影响 Mock） =====
    const wechat = new WechatNativeCanteenProvider({} as NodeJS.ProcessEnv);
    await assert.rejects(wechat.createCode({
      orderNo: "X", paymentNo: "Y", outletId: "z", amount: "1.00", subject: "s",
      ttlSeconds: 120, idempotencyKey: "k"
    }), (err: Error) => err instanceof CanteenPaymentNotConfiguredError && err.provider === "wechat");

    const alipay = new AlipayFaceCanteenProvider({} as NodeJS.ProcessEnv);
    await assert.rejects(alipay.verifyCallback("alipay", {}, {}), CanteenPaymentNotConfiguredError);
  } finally {
    // 清理本测试租户数据（自清理，不动其他租户）
    for (const table of [
      "biz_canteen_status_logs",
      "biz_canteen_order_items",
      "biz_canteen_payments",
      "biz_canteen_orders",
      "biz_canteen_cashier_sessions",
      "biz_canteen_dishes",
      "biz_canteen_categories",
      "biz_canteen_outlets"
    ]) {
      await ds.query(`DELETE FROM ${table} WHERE tenant_id=$1`, [tenantId]).catch(() => undefined);
    }
    await ds.destroy();
  }
});
