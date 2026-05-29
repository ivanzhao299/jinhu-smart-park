import { Column, Entity, Index } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";

@Entity("energy_billing_item")
@Index("idx_energy_billing_item_scope_deleted", ["tenantId", "parkId", "isDeleted"])
@Index("idx_energy_billing_item_cycle", ["tenantId", "parkId", "cycleId", "isDeleted"])
@Index("idx_energy_billing_item_tenant", ["tenantId", "parkId", "relatedParkTenantId", "isDeleted"])
@Index("uk_energy_billing_item_meter_cycle", ["tenantId", "parkId", "cycleId", "meterId", "relatedParkTenantId", "billingMethod"], {
  unique: true,
  where: "is_deleted = false"
})
export class EnergyBillingItemEntity extends AuditableEntity {
  @Column({ name: "cycle_id", type: "uuid" })
  cycleId!: string;

  @Column({ name: "related_park_tenant_id", type: "uuid" })
  relatedParkTenantId!: string;

  @Column({ name: "room_id", type: "uuid", nullable: true })
  roomId!: string | null;

  @Column({ name: "meter_id", type: "uuid", nullable: true })
  meterId!: string | null;

  @Column({ name: "meter_type", type: "varchar", length: 32 })
  meterType!: string;

  @Column({ name: "billing_method", type: "varchar", length: 32 })
  billingMethod!: string;

  @Column({ name: "previous_reading", type: "numeric", precision: 18, scale: 4, default: 0 })
  previousReading!: string;

  @Column({ name: "current_reading", type: "numeric", precision: 18, scale: 4, default: 0 })
  currentReading!: string;

  @Column({ name: "consumption_value", type: "numeric", precision: 18, scale: 4, default: 0 })
  consumptionValue!: string;

  @Column({ name: "unit_price", type: "numeric", precision: 14, scale: 4, default: 1 })
  unitPrice!: string;

  @Column({ name: "amount", type: "numeric", precision: 14, scale: 2, default: 0 })
  amount!: string;

  @Column({ name: "adjustment_amount", type: "numeric", precision: 14, scale: 2, default: 0 })
  adjustmentAmount!: string;

  @Column({ name: "final_amount", type: "numeric", precision: 14, scale: 2, default: 0 })
  finalAmount!: string;

  @Column({ name: "confirmation_status", type: "varchar", length: 32, default: "PENDING" })
  confirmationStatus!: string;

  @Column({ name: "dispute_reason", type: "varchar", length: 500, nullable: true })
  disputeReason!: string | null;

  @Column({ name: "adjustment_reason", type: "varchar", length: 500, nullable: true })
  adjustmentReason!: string | null;

  @Column({ name: "receivable_id", type: "uuid", nullable: true })
  receivableId!: string | null;

  @Column({ name: "posted_at", type: "timestamptz", nullable: true })
  postedAt!: Date | null;

  @Column({ name: "rule_snapshot", type: "jsonb", default: {} })
  ruleSnapshot!: Record<string, unknown>;
}
