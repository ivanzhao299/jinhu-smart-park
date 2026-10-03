import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, EntityManager, Repository } from "typeorm";
import type { TenantParkScope } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { CanteenOrderEntity } from "./entities/canteen-order.entity";
import { CanteenPaymentEntity } from "./entities/canteen-payment.entity";
import { CanteenRefundEntity } from "./entities/canteen-refund.entity";
import { CanteenWalletEntity } from "./entities/canteen-wallet.entity";
import { CanteenWalletTxnEntity } from "./entities/canteen-wallet-txn.entity";
import { CanteenStatusLogEntity } from "./entities/canteen-status-log.entity";
import { CanteenNumberService } from "./canteen-number.service";
import { CanteenPaymentRegistry } from "./payment/canteen-payment-registry";
import { centsToYuan, yuanToCents } from "./canteen-money.util";
import { periodOf } from "./canteen-subsidy.util";

/**
 * M4 退款/撤单。
 * - 原路退回：qr 收款走支付适配器 refund（Mock 可跑；wechat/alipay 未配置抛 NotConfigured）；
 *   餐补消费写反向 refund 流水回补钱包。
 * - 回补不越期：仅当钱包账期仍是当前账期且状态 active 时回补；已过期账期不复活额度。
 * - 余额非负由 ck_canteen_wallets_amount + 行锁保证；审批幂等（pending→succeeded 仅一次）。
 */
@Injectable()
export class CanteenRefundService {
  constructor(
    @InjectRepository(CanteenRefundEntity) private readonly refundRepo: Repository<CanteenRefundEntity>,
    @InjectRepository(CanteenOrderEntity) private readonly orderRepo: Repository<CanteenOrderEntity>,
    @InjectRepository(CanteenPaymentEntity) private readonly paymentRepo: Repository<CanteenPaymentEntity>,
    private readonly ds: DataSource,
    private readonly numbers: CanteenNumberService,
    private readonly registry: CanteenPaymentRegistry
  ) {}

  private async writeLog(manager: EntityManager, e: CanteenRefundEntity, before: string | null, after: string, action: string, actor: JwtPrincipal, reason?: string | null) {
    await manager.save(
      manager.create(CanteenStatusLogEntity, {
        tenantId: e.tenantId,
        parkId: e.parkId,
        entityType: "refund",
        entityId: e.id,
        beforeStatus: before,
        afterStatus: after,
        action,
        reason: reason ?? null,
        operatorUserId: actor.sub,
        operatorName: actor.username ?? null,
        opTime: new Date()
      })
    );
  }

  /** 发起退款（paid 后，转审核）。 */
  async create(scope: TenantParkScope, actor: JwtPrincipal, orderId: string, reason: string, amount?: number) {
    return this.ds.transaction(async (manager) => {
      const order = await manager.findOne(CanteenOrderEntity, {
        where: { id: orderId, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false },
        lock: { mode: "pessimistic_write" }
      });
      if (!order) throw new NotFoundException("order not found");
      if (!["paid", "completed"].includes(order.status)) throw new BadRequestException("order not refundable");
      if (order.refundStatus === "full") throw new BadRequestException("order already fully refunded");

      const refundCents = amount ? yuanToCents(amount) : yuanToCents(order.payAmount);
      if (refundCents <= 0) throw new BadRequestException("refund amount must be positive");

      // 渠道：纯餐补订单 → subsidy；其余（qr/混合）→ original_qr。
      const channel = order.qrPayAmount === "0.00" && order.subsidyAmount !== "0.00" ? "subsidy" : "original_qr";
      const no = await this.numbers.refundNo(manager, scope.tenantId);
      const r = manager.create(CanteenRefundEntity, {
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        refundNo: no,
        orderId: order.id,
        paymentId: order.channel === "subsidy" ? null : (await this.paymentRepo.findOne({ where: { orderId: order.id, isDeleted: false } }))?.id ?? null,
        walletTxnId: null,
        type: "refund_after_pay",
        amount: centsToYuan(refundCents),
        refundChannel: channel,
        status: "pending",
        reason,
        operatorUserId: actor.sub,
        createBy: actor.sub,
        updateBy: actor.sub
      });
      const saved = await manager.save(r);
      await this.writeLog(manager, saved, null, "pending", "create", actor, reason);
      return saved;
    });
  }

  async list(scope: TenantParkScope, q: { page: number; page_size: number }) {
    const [list, total] = await this.refundRepo.findAndCount({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false },
      order: { createTime: "DESC" },
      skip: (q.page - 1) * q.page_size,
      take: q.page_size
    });
    return { list, total, page: q.page, pageSize: q.page_size };
  }

  async detail(scope: TenantParkScope, id: string) {
    const r = await this.refundRepo.findOne({ where: { id, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false } });
    if (!r) throw new NotFoundException("refund not found");
    return r;
  }

  /** 审核通过 → 执行退款（原路）。幂等：仅 pending 可转 succeeded。 */
  approve(scope: TenantParkScope, actor: JwtPrincipal, id: string) {
    return this.ds.transaction(async (manager) => {
      const r = await manager.findOne(CanteenRefundEntity, {
        where: { id, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false },
        lock: { mode: "pessimistic_write" }
      });
      if (!r) throw new NotFoundException("refund not found");
      if (r.status !== "pending") throw new BadRequestException(`refund not pending (${r.status})`);
      r.status = "approved";
      r.auditUserId = actor.sub;
      r.updateBy = actor.sub;
      await manager.save(r);

      const order = await manager.findOne(CanteenOrderEntity, { where: { id: r.orderId, isDeleted: false } });

      if (r.refundChannel === "original_qr") {
        // 调支付适配器原路退（Mock 直接成功；wechat/alipay 未配置抛 NotConfigured）。
        const payment = r.paymentId
          ? await manager.findOne(CanteenPaymentEntity, { where: { id: r.paymentId, isDeleted: false } })
          : null;
        const provider = this.registry.get(payment?.provider ?? this.registry.driver);
        await provider.refund({
          paymentNo: payment?.paymentNo ?? "",
          providerTransactionId: payment?.providerTransactionId ?? "",
          refundNo: r.refundNo,
          amount: r.amount,
          reason: r.reason
        });
        if (payment) {
          payment.status = "refunded";
          await manager.save(payment);
        }
      } else {
        // 餐补回补：仅当前账期 active 钱包回补，不复活已过期额度。
        await this.creditWallet(manager, scope, r, actor);
      }

      if (order) {
        order.refundStatus = "full";
        order.updateBy = actor.sub;
        await manager.save(order);
      }
      r.status = "succeeded";
      r.finishTime = new Date();
      await manager.save(r);
      await this.writeLog(manager, r, "approved", "succeeded", "approve", actor);
      return r;
    });
  }

  /** 餐补回补：反向写 refund 流水，钱包 period_balance += amount，period_consumed -= amount。 */
  private async creditWallet(manager: EntityManager, scope: TenantParkScope, r: CanteenRefundEntity, actor: JwtPrincipal) {
    const period = periodOf();
    const consume = await manager.findOne(CanteenWalletTxnEntity, {
      where: { orderId: r.orderId, type: "consume", tenantId: scope.tenantId, isDeleted: false }
    });
    if (!consume) return;
    const wallet = await manager.findOne(CanteenWalletEntity, {
      where: { id: consume.walletId, tenantId: scope.tenantId, isDeleted: false },
      lock: { mode: "pessimistic_write" }
    });
    if (!wallet) return;
    // 不越期：账期不匹配或钱包冻结，不复活额度。
    if (wallet.period !== period || wallet.status !== "active") return;

    const refundCents = yuanToCents(r.amount);
    const newConsumed = yuanToCents(wallet.periodConsumed) - refundCents;
    const newBalance = yuanToCents(wallet.periodBalance) + refundCents;
    wallet.periodConsumed = centsToYuan(newConsumed < 0 ? 0 : newConsumed);
    wallet.periodBalance = centsToYuan(newBalance);
    wallet.updateBy = actor.sub;
    await manager.save(wallet);

    const txnNo = await this.numbers.walletTxnNo(manager, scope.tenantId);
    const txn = await manager.save(
      manager.create(CanteenWalletTxnEntity, {
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        txnNo,
        walletId: wallet.id,
        grantId: consume.grantId,
        period,
        employeeUserId: consume.employeeUserId,
        type: "refund",
        amount: centsToYuan(refundCents),
        balanceAfter: centsToYuan(newBalance),
        orderId: r.orderId,
        mealRecordId: consume.mealRecordId,
        operatorUserId: actor.sub,
        txnTime: new Date()
      })
    );
    r.walletTxnId = txn.id;
  }

  reject(scope: TenantParkScope, actor: JwtPrincipal, id: string) {
    return this.ds.transaction(async (manager) => {
      const r = await manager.findOne(CanteenRefundEntity, {
        where: { id, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false },
        lock: { mode: "pessimistic_write" }
      });
      if (!r) throw new NotFoundException("refund not found");
      if (r.status !== "pending") throw new BadRequestException(`refund not pending (${r.status})`);
      r.status = "failed";
      r.auditUserId = actor.sub;
      r.finishTime = new Date();
      await manager.save(r);
      await this.writeLog(manager, r, "pending", "failed", "reject", actor);
      return r;
    });
  }
}
