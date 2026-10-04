import { Column, Entity, Index } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";

@Entity("biz_canteen_payments")
@Index("uq_canteen_payments_scope_no", ["tenantId", "paymentNo"], {
  unique: true,
  where: "is_deleted = false"
})
@Index("uq_canteen_payments_provider_txn", ["provider", "providerTransactionId"], {
  unique: true,
  where: "is_deleted = false AND status = 'paid' AND provider_transaction_id IS NOT NULL"
})
@Index("idx_canteen_payments_scope_order", ["tenantId", "parkId", "orderId"])
@Index("idx_canteen_payments_scope_status", ["tenantId", "parkId", "status"])
@Index("idx_canteen_payments_outlet_paid_time", ["tenantId", "outletId", "paidTime"])
export class CanteenPaymentEntity extends AuditableEntity {
  @Column({ name: "payment_no", type: "varchar", length: 40 })
  paymentNo!: string;

  @Column({ name: "order_id", type: "uuid" })
  orderId!: string;

  @Column({ name: "outlet_id", type: "uuid" })
  outletId!: string;

  @Column({ type: "varchar", length: 16 })
  provider!: string;

  @Column({ name: "trade_type", type: "varchar", length: 16, default: "native" })
  tradeType!: string;

  @Column({ name: "code_url", type: "text", nullable: true })
  codeUrl!: string | null;

  @Column({ name: "qr_code_id", type: "varchar", length: 64, nullable: true })
  qrCodeId!: string | null;

  @Column({ type: "numeric", precision: 12, scale: 2 })
  amount!: string;

  @Column({ type: "varchar", length: 3, default: "CNY" })
  currency!: string;

  @Column({ type: "varchar", length: 16, default: "pending" })
  status!: string;

  @Column({ name: "provider_transaction_id", type: "varchar", length: 64, nullable: true })
  providerTransactionId!: string | null;

  @Column({ name: "buyer_payer_id", type: "varchar", length: 128, nullable: true })
  buyerPayerId!: string | null;

  @Column({ name: "paid_time", type: "timestamptz", nullable: true })
  paidTime!: Date | null;

  @Column({ name: "callback_time", type: "timestamptz", nullable: true })
  callbackTime!: Date | null;

  @Column({ name: "callback_payload", type: "jsonb", nullable: true })
  callbackPayload!: Record<string, unknown> | null;

  @Column({ name: "idempotency_key", type: "varchar", length: 64 })
  idempotencyKey!: string;
}
