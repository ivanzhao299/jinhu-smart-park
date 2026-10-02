import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import type { EntityManager, Repository } from "typeorm";
import { CanteenOrderEntity } from "./entities/canteen-order.entity";
import { CanteenPaymentEntity } from "./entities/canteen-payment.entity";
import { CanteenStatusLogEntity } from "./entities/canteen-status-log.entity";

export interface ApplyPaymentSuccessInput {
  paymentNo: string;
  providerTransactionId: string;
  amount: string;
  buyerPayerId?: string | null;
  payload?: Record<string, unknown> | null;
  operatorName?: string | null;
}

export interface ApplyPaymentClosedInput {
  paymentNo: string;
  reason?: string | null;
  operatorName?: string | null;
}

export type ApplyPaymentOutcome =
  | { applied: true; kind: "success" | "closed"; paymentStatus: string; orderStatus: string }
  | { applied: false; kind: "duplicate"; paymentStatus: string; orderStatus: string };

/**
 * 支付结果落账应用服务（验签之后的唯一入口）。
 *
 * 真实 webhook、Mock 内部 settle/close、超时关单定时任务 全部走这里，
 * 保证：幂等（重复通知只生效一次）、payment↔order 状态联动、写 status_log。
 * 调用方负责事务边界；本服务内所有读写均使用传入的 manager。
 */
@Injectable()
export class CanteenPaymentAppService {
  constructor(
    @InjectRepository(CanteenPaymentEntity)
    private readonly paymentRepo: Repository<CanteenPaymentEntity>,
    @InjectRepository(CanteenOrderEntity)
    private readonly orderRepo: Repository<CanteenOrderEntity>,
    @InjectRepository(CanteenStatusLogEntity)
    private readonly statusLogRepo: Repository<CanteenStatusLogEntity>,
    private readonly dataSource: DataSource
  ) {}

  /* --------------------------- 成功落账 --------------------------- */

  async applySuccess(manager: EntityManager, input: ApplyPaymentSuccessInput): Promise<ApplyPaymentOutcome> {
    const payment = await this.loadPaymentForUpdate(manager, input.paymentNo);

    // 幂等：已 paid 直接确认，不重复入账、不重复推进订单。
    if (payment.status === "paid") {
      const order = await manager.findOne(CanteenOrderEntity, { where: { id: payment.orderId } });
      return { applied: false, kind: "duplicate", paymentStatus: "paid", orderStatus: order?.status ?? "unknown" };
    }
    if (payment.status === "closed" || payment.status === "refunded" || payment.status === "failed") {
      throw new BadRequestException(`payment is ${payment.status}, cannot mark success`);
    }

    // 金额对账：回调金额必须与应付一致。
    if (Number(input.amount) !== Number(payment.amount)) {
      throw new BadRequestException(
        `amount mismatch: callback=${input.amount} expected=${payment.amount}`
      );
    }

    const now = new Date();
    const beforePayment = payment.status;
    payment.status = "paid";
    payment.providerTransactionId = input.providerTransactionId;
    payment.buyerPayerId = input.buyerPayerId ?? payment.buyerPayerId;
    payment.paidTime = now;
    payment.callbackTime = now;
    payment.callbackPayload = input.payload ?? null;
    await manager.save(payment);

    const order = await manager.findOne(CanteenOrderEntity, {
      where: { id: payment.orderId },
      lock: { mode: "pessimistic_write" }
    });
    if (!order) throw new NotFoundException("order not found for payment");
    const beforeOrder = order.status;
    // 状态机：pending → completed（真实收款成功即完成）；重复回调不重复改。
    if (order.status === "pending") {
      order.status = "completed";
      order.paidTime = now;
      order.qrPayAmount = order.payAmount;
      order.subsidyAmount = "0.00";
      await manager.save(order);
    }

    await this.writeLog(manager, payment, "payment", beforePayment, "paid", "payment_success", input.operatorName);
    await this.writeLog(manager, order, "order", beforeOrder, order.status, "order_paid", input.operatorName);

    return { applied: true, kind: "success", paymentStatus: "paid", orderStatus: order.status };
  }

  /* --------------------------- 关单落账 --------------------------- */

  async applyClosed(manager: EntityManager, input: ApplyPaymentClosedInput): Promise<ApplyPaymentOutcome> {
    const payment = await this.loadPaymentForUpdate(manager, input.paymentNo);

    if (payment.status === "closed") {
      const order = await manager.findOne(CanteenOrderEntity, { where: { id: payment.orderId } });
      return { applied: false, kind: "duplicate", paymentStatus: "closed", orderStatus: order?.status ?? "unknown" };
    }
    if (payment.status === "paid") {
      // 已支付不能再关单。
      return { applied: false, kind: "duplicate", paymentStatus: "paid", orderStatus: "unknown" };
    }

    const now = new Date();
    const beforePayment = payment.status;
    payment.status = "closed";
    payment.callbackTime = now;
    await manager.save(payment);

    const order = await manager.findOne(CanteenOrderEntity, {
      where: { id: payment.orderId },
      lock: { mode: "pessimistic_write" }
    });
    const beforeOrder = order?.status ?? null;
    if (order && order.status === "pending") {
      order.status = "cancelled";
      order.voidTime = now;
      order.voidReason = input.reason ?? "payment closed / timeout";
      await manager.save(order);
    }

    await this.writeLog(manager, payment, "payment", beforePayment, "closed", "payment_closed", input.operatorName, input.reason);
    if (order && beforeOrder === "pending") {
      await this.writeLog(manager, order, "order", beforeOrder, "cancelled", "order_cancelled", input.operatorName, input.reason);
    }

    return { applied: true, kind: "closed", paymentStatus: "closed", orderStatus: order?.status ?? "unknown" };
  }

  /* --------------------------- helpers --------------------------- */

  private async loadPaymentForUpdate(manager: EntityManager, paymentNo: string): Promise<CanteenPaymentEntity> {
    const payment = await manager.findOne(CanteenPaymentEntity, {
      where: { paymentNo, isDeleted: false },
      lock: { mode: "pessimistic_write" }
    });
    if (!payment) throw new NotFoundException(`payment ${paymentNo} not found`);
    return payment;
  }

  private async writeLog(
    manager: EntityManager,
    entity: { id: string; tenantId: string; parkId: string; createBy?: string | null },
    entityType: string,
    before: string | null,
    after: string,
    action: string,
    operatorName?: string | null,
    reason?: string | null
  ): Promise<void> {
    const log = manager.create(CanteenStatusLogEntity, {
      tenantId: entity.tenantId,
      parkId: entity.parkId,
      entityType,
      entityId: entity.id,
      beforeStatus: before,
      afterStatus: after,
      action,
      reason: reason ?? null,
      operatorUserId: entity.createBy ?? null,
      operatorName: operatorName ?? null,
      opTime: new Date()
    });
    await manager.save(log);
  }

  /** 供外部在独立事务里调用成功落账。 */
  async runInTransaction<T>(fn: (manager: EntityManager) => Promise<T>): Promise<T> {
    return this.dataSource.transaction(fn);
  }
}
