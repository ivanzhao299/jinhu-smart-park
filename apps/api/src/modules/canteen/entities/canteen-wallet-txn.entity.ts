import { Column, Entity, Index } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";

@Entity("biz_canteen_wallet_txns")
@Index("uq_canteen_wallet_txns_scope_no", ["tenantId", "txnNo"], {
  unique: true,
  where: "is_deleted = false"
})
@Index("idx_canteen_wallet_txns_scope_employee_period_type", [
  "tenantId", "parkId", "employeeUserId", "period", "type"
])
@Index("idx_canteen_wallet_txns_scope_order", ["tenantId", "parkId", "orderId"])
export class CanteenWalletTxnEntity extends AuditableEntity {
  @Column({ name: "txn_no", type: "varchar", length: 40 })
  txnNo!: string;

  @Column({ name: "wallet_id", type: "uuid" })
  walletId!: string;

  @Column({ name: "grant_id", type: "uuid", nullable: true })
  grantId!: string | null;

  @Column({ type: "varchar", length: 7 })
  period!: string;

  @Column({ name: "employee_user_id", type: "uuid" })
  employeeUserId!: string;

  @Column({ type: "varchar", length: 16 })
  type!: string;

  @Column({ type: "numeric", precision: 12, scale: 2 })
  amount!: string;

  @Column({ name: "balance_after", type: "numeric", precision: 12, scale: 2 })
  balanceAfter!: string;

  @Column({ name: "order_id", type: "uuid", nullable: true })
  orderId!: string | null;

  @Column({ name: "meal_record_id", type: "uuid", nullable: true })
  mealRecordId!: string | null;

  @Column({ name: "operator_user_id", type: "uuid", nullable: true })
  operatorUserId!: string | null;

  @Column({ name: "txn_time", type: "timestamptz" })
  txnTime!: Date;
}
