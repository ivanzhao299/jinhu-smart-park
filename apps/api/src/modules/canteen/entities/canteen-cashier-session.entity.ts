import { Column, Entity, Index } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";

@Entity("biz_canteen_cashier_sessions")
@Index("uq_canteen_cashier_sessions_scope_no", ["tenantId", "sessionNo"], {
  unique: true,
  where: "is_deleted = false"
})
@Index("idx_canteen_cashier_sessions_scope_outlet_status", [
  "tenantId", "parkId", "outletId", "status"
])
@Index("idx_canteen_cashier_sessions_scope_cashier", ["tenantId", "parkId", "cashierUserId"])
export class CanteenCashierSessionEntity extends AuditableEntity {
  @Column({ name: "session_no", type: "varchar", length: 40 })
  sessionNo!: string;

  @Column({ name: "outlet_id", type: "uuid" })
  outletId!: string;

  @Column({ name: "cashier_user_id", type: "uuid" })
  cashierUserId!: string;

  @Column({ name: "open_time", type: "timestamptz" })
  openTime!: Date;

  @Column({ name: "close_time", type: "timestamptz", nullable: true })
  closeTime!: Date | null;

  @Column({ name: "opening_float", type: "numeric", precision: 12, scale: 2, default: 0 })
  openingFloat!: string;

  @Column({ name: "qr_pay_total", type: "numeric", precision: 12, scale: 2, default: 0 })
  qrPayTotal!: string;

  @Column({ name: "subsidy_total", type: "numeric", precision: 12, scale: 2, default: 0 })
  subsidyTotal!: string;

  @Column({ name: "order_count", type: "integer", default: 0 })
  orderCount!: number;

  @Column({ name: "refund_total", type: "numeric", precision: 12, scale: 2, default: 0 })
  refundTotal!: string;

  @Column({ type: "varchar", length: 8, default: "open" })
  status!: string;

  @Column({ name: "close_snapshot", type: "jsonb", nullable: true })
  closeSnapshot!: Record<string, unknown> | null;
}
