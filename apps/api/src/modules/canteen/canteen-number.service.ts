import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";
import type { EntityManager } from "typeorm";

/**
 * 业务单号生成（M1 简化版）。
 *
 * 格式：{前缀}{yyyyMMdd}{4位序号}，与 api.md 示例一致：
 *   order_no   → CO202610020001
 *   payment_no → CP202610020001
 *   session_no → CS202610020001
 *
 * 序号 = 当日同租户已发单数 + 1，在调用方事务内计算；
 * 唯一约束 (tenant_id, xxx_no) 兜底，冲突由上层重试。
 * （M3 起可切换 code-rules 实体类型，本期不依赖 code-rules 种子。）
 */
@Injectable()
export class CanteenNumberService {
  constructor(private readonly dataSource: DataSource) {}

  private today(): string {
    // 业务日期取本地日期串（yyyyMMdd）。
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}${m}${d}`;
  }

  private async nextFor(
    manager: EntityManager,
    table: string,
    column: string,
    tenantId: string,
    prefix: string
  ): Promise<string> {
    const day = this.today();
    const like = `${prefix}${day}%`;
    const rows = (await manager.query(
      `SELECT count(*)::int AS c FROM ${table}
        WHERE tenant_id = $1 AND is_deleted = false AND ${column} LIKE $2`,
      [tenantId, like]
    )) as Array<{ c: number }>;
    const seq = (rows[0]?.c ?? 0) + 1;
    return `${prefix}${day}${String(seq).padStart(4, "0")}`;
  }

  orderNo(manager: EntityManager, tenantId: string): Promise<string> {
    return this.nextFor(manager, "biz_canteen_orders", "order_no", tenantId, "CO");
  }

  paymentNo(manager: EntityManager, tenantId: string): Promise<string> {
    return this.nextFor(manager, "biz_canteen_payments", "payment_no", tenantId, "CP");
  }

  sessionNo(manager: EntityManager, tenantId: string): Promise<string> {
    return this.nextFor(manager, "biz_canteen_cashier_sessions", "session_no", tenantId, "CS");
  }

  grantNo(manager: EntityManager, tenantId: string): Promise<string> {
    return this.nextFor(manager, "biz_canteen_subsidy_grants", "grant_no", tenantId, "SG");
  }

  walletTxnNo(manager: EntityManager, tenantId: string): Promise<string> {
    return this.nextFor(manager, "biz_canteen_wallet_txns", "txn_no", tenantId, "ST");
  }

  mealRecordNo(manager: EntityManager, tenantId: string): Promise<string> {
    return this.nextFor(manager, "biz_canteen_meal_records", "record_no", tenantId, "MR");
  }

  settlementNo(manager: EntityManager, tenantId: string): Promise<string> {
    return this.nextFor(manager, "biz_canteen_settlements", "settlement_no", tenantId, "SM");
  }

  refundNo(manager: EntityManager, tenantId: string): Promise<string> {
    return this.nextFor(manager, "biz_canteen_refunds", "refund_no", tenantId, "RF");
  }
}
