import { Column, Entity, Index } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";

@Entity("biz_canteen_refunds")
@Index("uq_canteen_refunds_scope_no", ["tenantId", "refundNo"], {
  unique: true,
  where: "is_deleted = false"
})
@Index("idx_canteen_refunds_scope_order", ["tenantId", "parkId", "orderId"])
export class CanteenRefundEntity extends AuditableEntity {
  @Column({ name: "refund_no", type: "varchar", length: 40 })
  refundNo!: string;

  @Column({ name: "order_id", type: "uuid" })
  orderId!: string;

  @Column({ name: "payment_id", type: "uuid", nullable: true })
  paymentId!: string | null;

  @Column({ name: "wallet_txn_id", type: "uuid", nullable: true })
  walletTxnId!: string | null;

  @Column({ type: "varchar", length: 24 })
  type!: string;

  @Column({ type: "numeric", precision: 12, scale: 2 })
  amount!: string;

  @Column({ name: "refund_channel", type: "varchar", length: 16 })
  refundChannel!: string;

  @Column({ type: "varchar", length: 16, default: "pending" })
  status!: string;

  @Column({ type: "varchar", length: 256 })
  reason!: string;

  @Column({ name: "operator_user_id", type: "uuid" })
  operatorUserId!: string;

  @Column({ name: "audit_user_id", type: "uuid", nullable: true })
  auditUserId!: string | null;

  @Column({ name: "finish_time", type: "timestamptz", nullable: true })
  finishTime!: Date | null;
}
