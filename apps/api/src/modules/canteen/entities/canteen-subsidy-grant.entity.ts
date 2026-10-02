import { Column, Entity, Index } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";

@Entity("biz_canteen_subsidy_grants")
@Index("uq_canteen_subsidy_grants_scope_employee_period", [
  "tenantId", "employeeUserId", "period"
], { unique: true, where: "is_deleted = false" })
@Index("idx_canteen_subsidy_grants_scope_period_status", ["tenantId", "parkId", "period", "status"])
export class CanteenSubsidyGrantEntity extends AuditableEntity {
  @Column({ name: "grant_no", type: "varchar", length: 40 })
  grantNo!: string;

  @Column({ type: "varchar", length: 7 })
  period!: string;

  @Column({ name: "employee_user_id", type: "uuid" })
  employeeUserId!: string;

  @Column({ name: "employee_no", type: "varchar", length: 32 })
  employeeNo!: string;

  @Column({ name: "plan_amount", type: "numeric", precision: 12, scale: 2 })
  planAmount!: string;

  @Column({ name: "granted_amount", type: "numeric", precision: 12, scale: 2, default: 0 })
  grantedAmount!: string;

  @Column({ type: "varchar", length: 20, default: "scheduled" })
  status!: string;

  @Column({ name: "grant_time", type: "timestamptz", nullable: true })
  grantTime!: Date | null;

  @Column({ name: "expire_time", type: "timestamptz", nullable: true })
  expireTime!: Date | null;

  @Column({ name: "rule_snapshot", type: "jsonb", nullable: true })
  ruleSnapshot!: Record<string, unknown> | null;
}
