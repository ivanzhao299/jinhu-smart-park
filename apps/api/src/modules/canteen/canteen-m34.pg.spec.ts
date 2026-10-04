import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { DataSource } from "typeorm";

import { CanteenOutletEntity } from "./entities/canteen-outlet.entity";
import { CanteenCategoryEntity } from "./entities/canteen-category.entity";
import { CanteenDishEntity } from "./entities/canteen-dish.entity";
import { CanteenOrderEntity } from "./entities/canteen-order.entity";
import { CanteenOrderItemEntity } from "./entities/canteen-order-item.entity";
import { CanteenPaymentEntity } from "./entities/canteen-payment.entity";
import { CanteenRefundEntity } from "./entities/canteen-refund.entity";
import { CanteenSettlementEntity } from "./entities/canteen-settlement.entity";
import { CanteenSettlementItemEntity } from "./entities/canteen-settlement-item.entity";
import { CanteenStatusLogEntity } from "./entities/canteen-status-log.entity";
import { CanteenWalletEntity } from "./entities/canteen-wallet.entity";
import { CanteenWalletTxnEntity } from "./entities/canteen-wallet-txn.entity";
import { CanteenSettingEntity } from "./entities/canteen-setting.entity";
import { CanteenArchiveService } from "./canteen-archive.service";
import { RandomizedNumberService } from "./canteen-test-utils";
import { CanteenSettlementService } from "./canteen-settlement.service";
import { CanteenReportService } from "./canteen-report.service";
import { CanteenRefundService } from "./canteen-refund.service";
import { CanteenLogService } from "./canteen-log.service";
import { CanteenSessionService } from "./canteen-session.service";
import { CanteenCashierSessionEntity } from "./entities/canteen-cashier-session.entity";
import { CanteenPaymentRegistry } from "./payment/canteen-payment-registry";
import { periodOf } from "./canteen-subsidy.util";

const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://jinhu:change_me@127.0.0.1:55435/jinhu_smart_park";

const PERIOD = periodOf();
const TODAY = new Date().toISOString().slice(0, 10);

test(
  "M3/M4: settlement idempotent generate+state machine+company_payable+report; refund original_qr + subsidy credit-back no over-period; audit logs",
  { skip: !process.env.DATABASE_URL && !process.env.CANTEEN_PG_TEST },
  async () => {
    const ds = new DataSource({
      type: "postgres",
      url: DATABASE_URL,
      entities: [
        CanteenOutletEntity, CanteenCategoryEntity, CanteenDishEntity, CanteenOrderEntity,
        CanteenOrderItemEntity, CanteenPaymentEntity, CanteenRefundEntity, CanteenSettlementEntity,
        CanteenSettlementItemEntity, CanteenStatusLogEntity, CanteenWalletEntity, CanteenWalletTxnEntity,
        CanteenSettingEntity, CanteenCashierSessionEntity
      ],
      synchronize: false
    });
    await ds.initialize();

    const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
    const tenantId = `m34-${suffix}`;
    const parkId = `m34park-${suffix}`;
    const actorId = randomUUID();
    const scope = { tenantId, parkId };
    const actor = { sub: actorId, username: "admin", realName: "管理员", tenantId, parkId, roles: [], permissions: [], isSuper: true } as never;

    const outletRepo = ds.getRepository(CanteenOutletEntity);
    const categoryRepo = ds.getRepository(CanteenCategoryEntity);
    const dishRepo = ds.getRepository(CanteenDishEntity);
    const orderRepo = ds.getRepository(CanteenOrderEntity);
    const paymentRepo = ds.getRepository(CanteenPaymentEntity);
    const refundRepo = ds.getRepository(CanteenRefundEntity);
    const settlementRepo = ds.getRepository(CanteenSettlementEntity);
    const itemRepo = ds.getRepository(CanteenSettlementItemEntity);
    const statusLogRepo = ds.getRepository(CanteenStatusLogEntity);
    const walletRepo = ds.getRepository(CanteenWalletEntity);
    const txnRepo = ds.getRepository(CanteenWalletTxnEntity);

    const archive = new CanteenArchiveService(outletRepo, categoryRepo, dishRepo, statusLogRepo);
    const numbers = new RandomizedNumberService(ds, suffix);
    const registry = new CanteenPaymentRegistry({ ...process.env, CANTEEN_PAYMENT_DRIVER: "mock" } as NodeJS.ProcessEnv);
    const settlementSvc = new CanteenSettlementService(
      settlementRepo, itemRepo, orderRepo, refundRepo, outletRepo, ds, numbers
    );
    const reportSvc = new CanteenReportService(orderRepo, ds.getRepository(CanteenOrderItemEntity), ds.getRepository(CanteenWalletEntity) as never);
    const refundSvc = new CanteenRefundService(refundRepo, orderRepo, paymentRepo, ds, numbers, registry);
    const logSvc = new CanteenLogService(statusLogRepo);
    const sessionRepo = ds.getRepository(CanteenCashierSessionEntity);
    const sessionSvc = new CanteenSessionService(ds, numbers, sessionRepo, orderRepo, statusLogRepo);

    try {
      const outlet = await archive.createOutlet(scope as never, actor, {
        name: "M34档口", outlet_type: "dine_in", contractor_id: `party-${suffix}`, location: "B1"
      });
      const category = await archive.createCategory(scope as never, actor, outlet.id, { name: "热菜" });
      const dish = await archive.createDish(scope as never, actor, {
        outlet_id: outlet.id, category_id: category.id, name: "报表套餐", price: 20
      });

      // 直接造 2 笔已完成订单：一笔 qr 收 20，一笔补贴 15。
      await ds.query(
        `INSERT INTO biz_canteen_orders
          (tenant_id,park_id,order_no,outlet_id,contractor_id,business_date,meal_period,cashier_user_id,
           channel,total_amount,pay_amount,qr_pay_amount,subsidy_amount,status,paid_time,is_deleted)
         VALUES ($1,$2,$3,$4,$5,$6,'lunch',$7,'qr_pay','20.00','20.00','20.00','0.00','completed',now(),false),
                ($1,$2,$8,$4,$5,$6,'lunch',$7,'subsidy','15.00','15.00','0.00','15.00','completed',now(),false)`,
        [tenantId, parkId, `CO${suffix}Q1`, outlet.id, outlet.contractorId, TODAY, actorId, `CO${suffix}S1`]
      );
      // 订单明细（供 dish-ranking 聚合）。
      const qrOrderId = (await orderRepo.findOneByOrFail({ orderNo: `CO${suffix}Q1` })).id;
      const subOrderId = (await orderRepo.findOneByOrFail({ orderNo: `CO${suffix}S1` })).id;
      await ds.query(
        `INSERT INTO biz_canteen_order_items
          (tenant_id,park_id,order_id,dish_id,dish_name_snapshot,price_snapshot,qty,amount,is_deleted)
         VALUES ($1,$2,$3,$4,'报表套餐','20.00',1,'20.00',false),
                ($1,$2,$5,$4,'报表套餐','15.00',1,'15.00',false)`,
        [tenantId, parkId, qrOrderId, dish.id, subOrderId]
      );
      // 造 1 笔发放 300（供 subsidy-usage 断言）。
      await ds.query(
        `INSERT INTO biz_canteen_subsidy_grants
          (tenant_id,park_id,grant_no,employee_user_id,employee_no,period,plan_amount,granted_amount,status,is_deleted)
         VALUES ($1,$2,$3,$4,$3,$5,300,300,'granted',false)`,
        [tenantId, parkId, `SG${suffix}1`, randomUUID(), PERIOD]
      );

      // ===== M3: 结算生成幂等 + 聚合 =====
      const s1 = await settlementSvc.generate(scope as never, actor, outlet.id, PERIOD);
      assert.equal(s1.status, "draft");
      assert.equal(s1.qrPayTotal, "20.00");
      assert.equal(s1.subsidyTotal, "15.00");
      assert.equal(s1.companyPayable, "15.00", "company_payable = subsidy_total");

      const s1b = await settlementSvc.generate(scope as never, actor, outlet.id, PERIOD);
      assert.equal(s1b.id, s1.id, "重复生成幂等，返回同一单");

      const items = await settlementSvc.items(scope as never, s1.id);
      assert.ok(items.length >= 1, "按日聚合明细");

      // ===== M3: 状态机 + 审计 =====
      await settlementSvc.submit(scope as never, actor, s1.id);
      await settlementSvc.reconcile(scope as never, actor, s1.id);
      await settlementSvc.dispute(scope as never, actor, s1.id, 1, "金额待核");
      let afterDispute = await settlementRepo.findOneByOrFail({ id: s1.id });
      assert.equal(afterDispute.status, "disputed");
      await settlementSvc.approve(scope as never, actor, s1.id);
      await settlementSvc.settle(scope as never, actor, s1.id);
      const settled = await settlementRepo.findOneByOrFail({ id: s1.id });
      assert.equal(settled.status, "settled");
      const logs = await statusLogRepo.find({ where: { entityType: "settlement", entityId: s1.id } });
      assert.ok(logs.length >= 5, "每次流转落 status_log");

      // ===== M3: 报表聚合（日期有界） =====
      const sales = await reportSvc.sales(scope as never, { start_date: TODAY, end_date: TODAY, outlet_id: outlet.id });
      assert.equal(String(sales.order_count), "2");
      assert.equal(String(sales.qr_pay_total), "20.00");

      // dish-ranking：首行金额>0（修复 i.subtotal→i.amount）
      const ranking = await reportSvc.dishRanking(scope as never, { start_date: TODAY, end_date: TODAY, outlet_id: outlet.id });
      assert.ok(Array.isArray(ranking) && ranking.length >= 1, "dish-ranking 有数据");
      assert.ok(Number((ranking[0] as Record<string, unknown>).sales_amount) > 0, "首行销售额>0");

      // subsidy-usage：发放合计 = 人数 × 300（修复 grants.amount→granted_amount）
      const usage = await reportSvc.subsidyUsage(scope as never, PERIOD);
      assert.equal(Number(usage.granted_total), 300, "发放合计=1人×300");
      assert.equal(usage.grant_count, 1);
      assert.ok("remaining_total" in usage, "输出剩余");

      // daily / dashboard 不破坏
      const daily = await reportSvc.daily(scope as never, { start_date: TODAY, end_date: TODAY, outlet_id: outlet.id });
      assert.ok(Array.isArray(daily));
      const dash = await reportSvc.dashboard(scope as never, { start_date: TODAY, end_date: TODAY, outlet_id: outlet.id });
      assert.equal(String(dash.order_count), "2");

      // ===== M4: qr 原路退 =====
      const qrOrder = await orderRepo.findOneByOrFail({ orderNo: `CO${suffix}Q1` });
      await ds.query(
        `INSERT INTO biz_canteen_payments
          (tenant_id,park_id,payment_no,order_id,outlet_id,provider,amount,provider_transaction_id,status,idempotency_key,is_deleted)
         VALUES ($1,$2,$3,$4,$5,'mock','20.00','MOCKTXN','paid',$6,false) RETURNING id`,
        [tenantId, parkId, `CP${suffix}Q`, qrOrder.id, outlet.id, `idem-${suffix}`]
      );
      const rf1 = await refundSvc.create(scope as never, actor, qrOrder.id, "客户退款", undefined);
      assert.equal(rf1.refundChannel, "original_qr");
      await refundSvc.approve(scope as never, actor, rf1.id);
      const rf1done = await refundRepo.findOneByOrFail({ id: rf1.id });
      assert.equal(rf1done.status, "succeeded");
      const qrOrderAfter = await orderRepo.findOneByOrFail({ id: qrOrder.id });
      assert.equal(qrOrderAfter.refundStatus, "full");

      // ===== M4: 餐补回补（不越期） =====
      const subOrder = await orderRepo.findOneByOrFail({ orderNo: `CO${suffix}S1` });
      const empId = randomUUID();
      const wallet = walletRepo.create({
        tenantId, parkId, employeeUserId: empId, employeeNo: `E${suffix}`, period: PERIOD,
        periodGrant: "300.00", periodConsumed: "15.00", periodExpired: "0.00", periodBalance: "285.00", status: "active"
      });
      const savedWallet = await walletRepo.save(wallet);
      await txnRepo.save(txnRepo.create({
        tenantId, parkId, txnNo: `ST${suffix}C`, walletId: savedWallet.id, period: PERIOD,
        employeeUserId: empId, type: "consume", amount: "-15.00", balanceAfter: "285.00", orderId: subOrder.id
      }));
      const rf2 = await refundSvc.create(scope as never, actor, subOrder.id, "餐补撤销", undefined);
      assert.equal(rf2.refundChannel, "subsidy");
      await refundSvc.approve(scope as never, actor, rf2.id);
      const walletAfter = await walletRepo.findOneByOrFail({ id: savedWallet.id });
      assert.equal(walletAfter.periodBalance, "300.00", "回补后余额恢复");
      assert.equal(walletAfter.periodConsumed, "0.00");
      const refundTxn = await txnRepo.findOneByOrFail({ orderId: subOrder.id, type: "refund" });
      assert.equal(refundTxn.amount, "15.00");

      // 审计：refund 落 status_log
      const rlogs = await statusLogRepo.find({ where: { entityType: "refund", entityId: rf2.id } });
      assert.ok(rlogs.length >= 2, "退款动作落审计");

      // ===== M4: 全局日志查询 GET /status-logs =====
      const allLogs = await logSvc.list(scope as never, { page: 1, page_size: 50 });
      assert.ok(allLogs.total > 0, "审计日志 total>0");
      const setLogs = await logSvc.list(scope as never, { entity_type: "settlement", page: 1, page_size: 50 });
      const actions = setLogs.list.map((l) => l.action).sort();
      for (const want of ["generate", "submit", "reconcile", "dispute", "approve", "settle"]) {
        assert.ok(actions.includes(want), `settlement 日志含 ${want}`);
      }

      // ===== M4: 开班/结班、菜品上下架落 session/dish 审计 =====
      const opened = await sessionSvc.open(scope as never, actor, { outlet_id: outlet.id, opening_float: 0 } as never);
      await sessionSvc.close(scope as never, actor, opened.id);
      // 菜品上架→下架（dish 已建）
      await archive.changeDishShelf(scope as never, actor, dish.id, { status: "on_shelf" });
      await archive.changeDishShelf(scope as never, actor, dish.id, { status: "off_shelf" });

      const sessionLogs = await logSvc.list(scope as never, { entity_type: "session", page: 1, page_size: 20 });
      assert.ok(sessionLogs.total > 0, "session 审计日志>0");
      const dishLogs = await logSvc.list(scope as never, { entity_type: "dish", page: 1, page_size: 20 });
      assert.ok(dishLogs.total > 0, "dish 审计日志>0");
    } finally {
      await ds.destroy();
    }
  }
);
