import { Column, Entity, Index } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";

@Entity("biz_canteen_settings")
@Index("uq_canteen_settings_scope", ["tenantId", "parkId"], {
  unique: true,
  where: "is_deleted = false"
})
export class CanteenSettingEntity extends AuditableEntity {
  @Column({ name: "monthly_lunch_subsidy", type: "numeric", precision: 12, scale: 2, default: 300.00 })
  monthlyLunchSubsidy!: string;

  @Column({ name: "grant_day", type: "integer", default: 1 })
  grantDay!: number;

  @Column({ name: "expiry_mode", type: "varchar", length: 16, default: "last_day" })
  expiryMode!: string;

  @Column({ name: "expiry_day", type: "integer", nullable: true })
  expiryDay!: number | null;

  @Column({ name: "expiry_time", type: "varchar", length: 8, default: "23:59" })
  expiryTime!: string;

  @Column({ name: "eligible_rule", type: "jsonb", default: () => "'{\"employee_type\":\"regular\",\"status\":\"active\"}'::jsonb" })
  eligibleRule!: Record<string, unknown>;

  @Column({ name: "funds_company_account", type: "boolean", default: true })
  fundsCompanyAccount!: boolean;

  @Column({ name: "settlement_day", type: "integer", default: 1 })
  settlementDay!: number;

  @Column({ name: "management_fee_enabled", type: "boolean", default: false })
  managementFeeEnabled!: boolean;

  @Column({ name: "management_fee_rule", type: "jsonb", nullable: true })
  managementFeeRule!: Record<string, unknown> | null;
}
