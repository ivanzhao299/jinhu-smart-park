import { Column, Entity, Index } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";

@Entity("biz_canteen_orders")
@Index("uq_canteen_orders_scope_no", ["tenantId", "orderNo"], {
  unique: true,
  where: "is_deleted = false"
})
@Index("idx_canteen_orders_scope_outlet_date", ["tenantId", "parkId", "outletId", "businessDate"])
@Index("idx_canteen_orders_scope_status", ["tenantId", "parkId", "status"])
@Index("idx_canteen_orders_contractor_date", ["tenantId", "contractorId", "businessDate"])
export class CanteenOrderEntity extends AuditableEntity {
  @Column({ name: "order_no", type: "varchar", length: 40 })
  orderNo!: string;

  @Column({ name: "outlet_id", type: "uuid" })
  outletId!: string;

  @Column({ name: "contractor_id", type: "varchar", length: 64 })
  contractorId!: string;

  @Column({ name: "business_date", type: "date" })
  businessDate!: string;

  @Column({ name: "meal_period", type: "varchar", length: 16 })
  mealPeriod!: string;

  @Column({ name: "cashier_user_id", type: "uuid" })
  cashierUserId!: string;

  @Column({ name: "cashier_session_id", type: "uuid", nullable: true })
  cashierSessionId!: string | null;

  @Column({ type: "varchar", length: 16 })
  channel!: string;

  @Column({ name: "total_amount", type: "numeric", precision: 12, scale: 2 })
  totalAmount!: string;

  @Column({ name: "discount_amount", type: "numeric", precision: 12, scale: 2, default: 0 })
  discountAmount!: string;

  @Column({ name: "pay_amount", type: "numeric", precision: 12, scale: 2 })
  payAmount!: string;

  @Column({ name: "qr_pay_amount", type: "numeric", precision: 12, scale: 2, default: 0 })
  qrPayAmount!: string;

  @Column({ name: "subsidy_amount", type: "numeric", precision: 12, scale: 2, default: 0 })
  subsidyAmount!: string;

  @Column({ type: "varchar", length: 20, default: "pending" })
  status!: string;

  @Column({ name: "paid_time", type: "timestamptz", nullable: true })
  paidTime!: Date | null;

  @Column({ name: "void_time", type: "timestamptz", nullable: true })
  voidTime!: Date | null;

  @Column({ name: "void_reason", type: "varchar", length: 256, nullable: true })
  voidReason!: string | null;

  @Column({ name: "refund_status", type: "varchar", length: 20, nullable: true })
  refundStatus!: string | null;
}
