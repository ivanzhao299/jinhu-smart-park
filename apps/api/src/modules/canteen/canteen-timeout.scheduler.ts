import { Injectable, Logger } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { InjectRepository } from "@nestjs/typeorm";
import { LessThan, Repository } from "typeorm";
import { CanteenPaymentEntity } from "./entities/canteen-payment.entity";
import { CanteenPaymentAppService } from "./canteen-payment-app.service";

/**
 * 超时关单：把超过 TTL 仍 pending 的支付置 closed、订单置 cancelled。
 * TTL 默认 120s（env CANTEEN_PAYMENT_TTL_MS），扫描周期 30s。
 * 落账复用与 webhook 完全相同的 applyClosed（幂等）。
 */
@Injectable()
export class CanteenTimeoutScheduler {
  private readonly logger = new Logger(CanteenTimeoutScheduler.name);
  readonly ttlMs: number;

  constructor(
    @InjectRepository(CanteenPaymentEntity)
    private readonly paymentRepo: Repository<CanteenPaymentEntity>,
    private readonly paymentApp: CanteenPaymentAppService
  ) {
    this.ttlMs = Number(process.env.CANTEEN_PAYMENT_TTL_MS ?? 120_000);
  }

  @Interval(30_000)
  async tick(): Promise<void> {
    try {
      await this.closeExpiredPendingPayments();
    } catch (err) {
      this.logger.warn(`timeout sweep failed: ${(err as Error).message}`);
    }
  }

  /** 扫描并关单；返回本次关单数。可被测试直接调用。 */
  async closeExpiredPendingPayments(now: Date = new Date()): Promise<number> {
    const deadline = new Date(now.getTime() - this.ttlMs);
    const expired = await this.paymentRepo.find({
      where: { status: "pending", createTime: LessThan(deadline), isDeleted: false },
      take: 100
    });
    let closed = 0;
    for (const payment of expired) {
      try {
        const outcome = await this.paymentApp.runInTransaction((manager) =>
          this.paymentApp.applyClosed(manager, {
            paymentNo: payment.paymentNo,
            reason: "timeout un-paid"
          })
        );
        if (outcome.applied) closed += 1;
      } catch (err) {
        this.logger.warn(`failed to close ${payment.paymentNo}: ${(err as Error).message}`);
      }
    }
    return closed;
  }
}
