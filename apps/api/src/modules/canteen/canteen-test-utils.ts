import type { DataSource, EntityManager } from "typeorm";
import { CanteenNumberService } from "./canteen-number.service";

/**
 * 测试专用：在生产单号后追加本次运行唯一后缀，使其【全局唯一】。
 *
 * 背景：生产编号按租户当日计数（CO/CP/CS{yyyyMMdd}0001...），而支付落账
 * loadPaymentForUpdate 按 payment_no 全局查找。在共享演示库上，不同租户/多次运行
 * 会生成相同的 CP{今天}0001，全局 findOne 可能命中别的租户已支付单 → DUPLICATE。
 * 追加随机后缀后，每个单号全局唯一，测试断言只命中本次运行自己的行。
 * 不改生产编号规则；后缀仅落在 varchar(40) 内，不影响唯一索引与 LIKE 计数。
 */
export class RandomizedNumberService extends CanteenNumberService {
  constructor(ds: DataSource, private readonly tag: string) {
    super(ds);
  }

  private stamp(base: string): string {
    return `${base}-${this.tag}`;
  }

  override orderNo(m: EntityManager, t: string): Promise<string> {
    return super.orderNo(m, t).then((n) => this.stamp(n));
  }
  override paymentNo(m: EntityManager, t: string): Promise<string> {
    return super.paymentNo(m, t).then((n) => this.stamp(n));
  }
  override sessionNo(m: EntityManager, t: string): Promise<string> {
    return super.sessionNo(m, t).then((n) => this.stamp(n));
  }
  override grantNo(m: EntityManager, t: string): Promise<string> {
    return super.grantNo(m, t).then((n) => this.stamp(n));
  }
  override walletTxnNo(m: EntityManager, t: string): Promise<string> {
    return super.walletTxnNo(m, t).then((n) => this.stamp(n));
  }
  override mealRecordNo(m: EntityManager, t: string): Promise<string> {
    return super.mealRecordNo(m, t).then((n) => this.stamp(n));
  }
  override settlementNo(m: EntityManager, t: string): Promise<string> {
    return super.settlementNo(m, t).then((n) => this.stamp(n));
  }
  override refundNo(m: EntityManager, t: string): Promise<string> {
    return super.refundNo(m, t).then((n) => this.stamp(n));
  }
}
