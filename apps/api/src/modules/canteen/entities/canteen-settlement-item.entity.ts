import { Column, Entity, Index } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";

@Entity("biz_canteen_settlement_items")
@Index("idx_canteen_settlement_items_scope_settlement", ["tenantId", "parkId", "settlementId"])
@Index("idx_canteen_settlement_items_scope_date", ["tenantId", "parkId", "bizDate"])
export class CanteenSettlementItemEntity extends AuditableEntity {
  @Column({ name: "settlement_id", type: "uuid" })
  settlementId!: string;

  @Column({ name: "biz_date", type: "date" })
  bizDate!: string;

  @Column({ name: "meal_period", type: "varchar", length: 16, nullable: true })
  mealPeriod!: string | null;

  @Column({ name: "order_count", type: "integer", default: 0 })
  orderCount!: number;

  @Column({ name: "qr_pay_amount", type: "numeric", precision: 12, scale: 2, default: 0 })
  qrPayAmount!: string;

  @Column({ name: "subsidy_amount", type: "numeric", precision: 12, scale: 2, default: 0 })
  subsidyAmount!: string;

  @Column({ name: "refund_amount", type: "numeric", precision: 12, scale: 2, default: 0 })
  refundAmount!: string;

  @Column({ type: "varchar", length: 16, default: "order" })
  source!: string;

  @Column({ name: "diff_amount", type: "numeric", precision: 12, scale: 2, default: 0 })
  diffAmount!: string;

  @Column({ name: "diff_reason", type: "varchar", length: 256, nullable: true })
  diffReason!: string | null;
}
