/**
 * Canteen 策略占位（M0 脚手架）。
 * M1+ 在此实现：撤单/退款可审判定、并发超扣防护、data-scope 注入等纯策略逻辑。
 */
export class CanteenPolicy {
  canVoidBeforePaid(orderStatus: string): boolean {
    return orderStatus === "pending";
  }
}
