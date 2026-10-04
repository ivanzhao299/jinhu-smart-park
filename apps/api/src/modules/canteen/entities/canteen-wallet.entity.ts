import { Column, Entity, Index } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";

@Entity("biz_canteen_wallets")
@Index("uq_canteen_wallets_scope_employee", ["tenantId", "employeeUserId"], {
  unique: true,
  where: "is_deleted = false"
})
@Index("idx_canteen_wallets_scope_period", ["tenantId", "parkId", "period"])
export class CanteenWalletEntity extends AuditableEntity {
  @Column({ name: "employee_user_id", type: "uuid" })
  employeeUserId!: string;

  @Column({ name: "employee_no", type: "varchar", length: 32 })
  employeeNo!: string;

  @Column({ type: "varchar", length: 7 })
  period!: string;

  @Column({ name: "period_grant", type: "numeric", precision: 12, scale: 2, default: 0 })
  periodGrant!: string;

  @Column({ name: "period_consumed", type: "numeric", precision: 12, scale: 2, default: 0 })
  periodConsumed!: string;

  @Column({ name: "period_expired", type: "numeric", precision: 12, scale: 2, default: 0 })
  periodExpired!: string;

  @Column({ name: "period_balance", type: "numeric", precision: 12, scale: 2, default: 0 })
  periodBalance!: string;

  @Column({ type: "varchar", length: 16, default: "active" })
  status!: string;
}
