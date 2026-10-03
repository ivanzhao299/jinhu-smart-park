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
        CanteenSettingEntity
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

    const archive = new CanteenArchiveService(outletRepo, categoryRepo, dishRepo);
    const numbers = new RandomizedNumberService(ds, suffix);
    const registry = new CanteenPaymentRegistry({ ...process.env, CANTEEN_PAYMENT_DRIVER: "mock" } as NodeJS.ProcessEnv);
    const settlementSvc = new CanteenSettlementService(
      settlementRepo, itemRepo, orderRepo, refundRepo, outletRepo, ds, numbers
    );
    const reportSvc = new CanteenReportService(orderRepo, ds.getRepository(CanteenOrderItemEntity), ds.getRepository(CanteenWalletEntity) as never);
    const refundSvc = new CanteenRefundService(refundRepo, orderRepo, paymentRepo, ds, numbers, registry);

    try {
      const outlet = await archive.createOutlet(scope as never, actor, {
        name: "M34档口", outlet_type: "dine_in", contractor_id: `party-${suffix}`, location: "B1"
      });
      const category = await archive.createCategory(scope as never, actor, outlet.id, { name: "热菜" });

      // 直接造 2 笔已完成订单：一笔 qr 收 20，一笔补贴 15。
      await ds.query(
        `INSERT INTO biz_canteen_orders
          (tenant_id,park_id,order_no,outlet_id,contractor_id,business_date,meal_period,cashier_user_id,
           channel,total_amount,pay_amount,qr_pay_amount,subsidy_amount,status,paid_time,is_deleted)
         VALUES ($1,$2,$3,$4,$5,$6,'lunch',$7,'qr_pay','20.00','20.00','20.00','0.00','completed',now(),false),
                ($1,$2,$8,$4,$5,$6,'lunch',$7,'subsidy','15.00','15.00','0.00','15.00','completed',now(),false)`,
        [tenantId, parkId, `CO${suffix}Q1`, outlet.id, outlet.contractorId, TODAY, actorId, `CO${suffix}S1`]
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

      // ===== M4: qr 原路退 =====
      const qrOrder = await orderRepo.findOneByOrFail({ orderNo: `CO${suffix}Q1` });
      const pay = await ds.query(
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
    } finally {
      await ds.destroy();
    }
  }
);
